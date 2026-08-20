import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'
import {
  calculateOfflineSourceHash,
  DEVELOPMENT_INDEX_HTML,
  findOfflineResourceReferences,
  isAllowedOfflineResourceReference,
  OFFLINE_CONTENT_SECURITY_POLICY,
} from './offline-build'
import {
  acquireBuildLocks,
  DEFAULT_BUILD_LOCK_PATH,
  LEGACY_CONTENT_BUILD_LOCK_PATH,
  releaseBuildLocks,
} from './build-lock'

const rootIndexPath = resolve('index.html')
const distDirectory = resolve('dist')
const distIndexPath = resolve(distDirectory, 'index.html')
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true })

async function readValidUtf8(path: string): Promise<string> {
  return fatalUtf8Decoder.decode(await readFile(path))
}

function verifyDocumentResourceReferences(
  document: Document,
  description: string,
): void {
  const references = findOfflineResourceReferences(document)
  const forbiddenReferences = references.filter(
    (reference) => !isAllowedOfflineResourceReference(reference.value),
  )
  assert.deepEqual(
    forbiddenReferences,
    [],
    `${description} must not contain external or file-backed resource references`,
  )
}

async function waitFor(
  predicate: () => boolean,
  timeoutMilliseconds = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out while waiting for the offline app to render.')
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 20))
  }
}

async function verifyRootLauncher(): Promise<void> {
  const rootIndexBytes = await readFile(rootIndexPath)
  const distIndexBytes = await readFile(distIndexPath)
  assert.deepEqual(
    rootIndexBytes,
    distIndexBytes,
    'root index and dist index must be byte-identical',
  )

  const httpDom = new JSDOM(DEVELOPMENT_INDEX_HTML, {
    url: 'http://localhost/index.html',
  })
  try {
    const developmentEntry = httpDom.window.document.querySelector<HTMLScriptElement>(
      'script[type="module"]',
    )
    assert.ok(developmentEntry, 'development index must include the Vite module entry')
    assert.equal(developmentEntry.src, 'http://localhost/src/main.tsx')
  } finally {
    httpDom.window.close()
  }
}

async function verifySelfContainedBuild(): Promise<void> {
  const distFiles = await readdir(distDirectory, { recursive: true })
  assert.deepEqual(distFiles, ['index.html'], 'dist must contain only index.html')

  const distIndex = await readValidUtf8(distIndexPath)
  const parsed = new JSDOM(distIndex)
  verifyDocumentResourceReferences(parsed.window.document, 'dist index')
  assert.equal(
    parsed.window.document.querySelector<HTMLMetaElement>(
      'meta[http-equiv="Content-Security-Policy"]',
    )?.content,
    OFFLINE_CONTENT_SECURITY_POLICY,
    'offline index must embed the expected restrictive CSP',
  )
  assert.ok(parsed.window.document.querySelector('style')?.textContent?.trim())
  assert.match(distIndex, /__ENGLISH_WORDS_EMBEDDED_CATALOG__/u)
  assert.match(distIndex, /__ENGLISH_WORDS_EMBEDDED_CATALOG_BUILD_VALIDATED__=true/u)
  const sourceHashAtVerificationStart = await calculateOfflineSourceHash()
  assert.equal(
    parsed.window.document.querySelector<HTMLMetaElement>(
      'meta[name="english-words-source-sha256"]',
    )?.content,
    sourceHashAtVerificationStart,
    'offline index must be rebuilt from the current source inputs',
  )
  const notices = parsed.window.document.querySelector('#third-party-notices')
  assert.ok(notices, 'dist must embed third-party notices')
  assert.match(notices.textContent ?? '', /Korean Wiktionary contributors/u)
  assert.match(notices.textContent ?? '', /creativecommons\.org\/licenses\/by-sa\/4\.0/u)
  assert.match(notices.textContent ?? '', /Copyright \(c\) 2016 dohliam/u)
  assert.match(notices.textContent ?? '', /Copyright \(c\) Meta Platforms/u)
  assert.match(notices.textContent ?? '', /Permission is hereby granted/u)
  parsed.window.close()

  const runtimeErrors: Error[] = []
  let fetchCallCount = 0
  let xhrCallCount = 0
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (error) => runtimeErrors.push(error))

  const rootIndex = await readValidUtf8(rootIndexPath)
  const dom = new JSDOM(rootIndex, {
    url: pathToFileURL(rootIndexPath).href,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.fetch = () => {
        fetchCallCount += 1
        return Promise.reject(new Error('The offline app attempted to call fetch().'))
      }
      window.XMLHttpRequest.prototype.send = function (): never {
        xhrCallCount += 1
        throw new Error('The offline app attempted to send an XMLHttpRequest.')
      }
    },
  })

  try {
    assert.throws(() => dom.window.localStorage, /opaque origins/u)
    const appRoot = dom.window.document.querySelector('#root')
    assert.ok(appRoot, 'offline index must include the application root')
    await waitFor(() => {
      const text = appRoot.textContent ?? ''
      return text.includes('기초 학습 대시보드')
        || text.includes('학습 콘텐츠를 불러오지 못했습니다')
    })
    const renderedText = appRoot.textContent ?? ''
    assert.match(renderedText, /기초 학습 대시보드/u)
    assert.match(renderedText, /영단어 5000 마스터/u)
    assert.match(
      dom.window.document.querySelector('[role="status"]')?.textContent ?? '',
      /현재 탭에서만 학습 상태를 유지/u,
    )
    const studyButton = [...dom.window.document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '학습')
    assert.ok(studyButton, 'offline app must expose the study navigation')
    studyButton.click()
    await waitFor(() => appRoot.textContent?.includes('학습 레벨 선택') === true)
    const studyLevelMenu = dom.window.document.querySelector(
      'nav[aria-label="학습 레벨 메뉴"]',
    )
    assert.ok(studyLevelMenu, 'offline app must expose the study level menu')
    const basicLevelButton = [...studyLevelMenu.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '기초')
    assert.ok(basicLevelButton, 'offline app must expose the basic study level')
    basicLevelButton.click()
    await waitFor(() =>
      appRoot.textContent?.includes('기초 플래시카드 학습') === true,
    )
    verifyDocumentResourceReferences(dom.window.document, 'rendered offline document')
    assert.equal(fetchCallCount, 0, 'file:// runtime must not call fetch()')
    assert.equal(xhrCallCount, 0, 'file:// runtime must not send XMLHttpRequest')
    assert.deepEqual(runtimeErrors, [])
    assert.equal(
      await calculateOfflineSourceHash(),
      sourceHashAtVerificationStart,
      'offline source inputs must remain unchanged throughout verification',
    )
  } finally {
    dom.window.close()
  }
}

const verificationLocks = await acquireBuildLocks([
  DEFAULT_BUILD_LOCK_PATH,
  LEGACY_CONTENT_BUILD_LOCK_PATH,
])
let verificationFailure: unknown
let releaseFailure: unknown
try {
  await verifyRootLauncher()
  await verifySelfContainedBuild()
} catch (error) {
  verificationFailure = error
} finally {
  try {
    await releaseBuildLocks(verificationLocks)
  } catch (error) {
    releaseFailure = error
  }
}

if (verificationFailure && releaseFailure) {
  throw new AggregateError(
    [verificationFailure, releaseFailure],
    'Offline verification failed and its locks could not be released.',
    { cause: verificationFailure },
  )
}
if (verificationFailure) throw verificationFailure
if (releaseFailure) throw releaseFailure

console.log('Offline index verification passed: root and dist indexes are current, self-contained, and render correctly.')
