import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import {
  assertExactOfflineBundleOutputs,
  createOfflineHtml,
  findOfflineResourceReferences,
  isAllowedOfflineResourceReference,
  OFFLINE_CONTENT_SECURITY_POLICY,
  OfflineIndexesCommittedWithResidueError,
  normalizeOfflineSourceText,
  offlineIndexTransactionPaths,
  pruneOfflineDistribution,
  promoteOfflineIndexes,
  recoverOfflineIndexTransaction,
  type OfflineIndexTransactionJournal,
  type OfflineIndexTransactionPaths,
  type OfflineIndexTransactionPhase,
} from './offline-build'

const temporaryDirectories: string[] = []

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'english-words-offline-build-'))
  temporaryDirectories.push(directory)
  return directory
}

function digest(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex')
}

function crashJournal(
  paths: OfflineIndexTransactionPaths,
  phase: OfflineIndexTransactionPhase,
  oldRoot: string,
  oldDist: string,
  next: string,
): OfflineIndexTransactionJournal {
  return {
    schemaVersion: '1.0.0',
    transactionId: '00000000-0000-4000-8000-000000000001',
    phase,
    rootIndexPath: paths.rootIndexPath,
    distIndexPath: paths.distIndexPath,
    rootNextPath: paths.rootNextPath,
    rootPreviousPath: paths.rootPreviousPath,
    distNextPath: paths.distNextPath,
    distPreviousPath: paths.distPreviousPath,
    newSha256: digest(next),
    rootOriginal: { exists: true, sha256: digest(oldRoot) },
    distOriginal: { exists: true, sha256: digest(oldDist) },
  }
}

async function writeJournalFixture(
  path: string,
  journal: OfflineIndexTransactionJournal,
): Promise<void> {
  await writeFile(path, `${JSON.stringify(journal, null, 2)}\n`, 'utf8')
}

async function expectCleanTransactionDirectory(directory: string): Promise<void> {
  expect((await readdir(directory)).sort()).toEqual(['dist', 'index.html'])
  expect(await readdir(join(directory, 'dist'))).toEqual(['index.html'])
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('createOfflineHtml', () => {
  it('embeds a restrictive CSP and escapes executable or markup boundaries', () => {
    const html = createOfflineHtml({
      catalog: 'globalThis.catalog="</script>";',
      css: '.example::after{content:"</style>"}',
      javascript: 'globalThis.script="</script>";',
      notices: '<license & notice>',
      sourceHash: 'a'.repeat(64),
    })
    const parsed = new JSDOM(html)

    expect(parsed.window.document.querySelector<HTMLMetaElement>(
      'meta[http-equiv="Content-Security-Policy"]',
    )?.content).toBe(OFFLINE_CONTENT_SECURITY_POLICY)
    expect(OFFLINE_CONTENT_SECURITY_POLICY).toContain("default-src 'none'")
    expect(OFFLINE_CONTENT_SECURITY_POLICY).toContain("connect-src 'none'")
    expect(OFFLINE_CONTENT_SECURITY_POLICY).toContain("object-src 'none'")
    expect(parsed.window.document.querySelectorAll('script')).toHaveLength(1)
    expect(parsed.window.document.querySelectorAll('style')).toHaveLength(1)
    expect(parsed.window.document.querySelector('pre')?.textContent).toBe(
      '<license & notice>',
    )
    parsed.window.close()
  })
})

describe('offline source hashing', () => {
  it('normalizes platform line endings before hashing text inputs', () => {
    expect(normalizeOfflineSourceText('first\r\nsecond\rthird\nfourth'))
      .toBe('first\nsecond\nthird\nfourth')
  })
})

describe('assertExactOfflineBundleOutputs', () => {
  it('accepts only one entry chunk and one CSS asset', () => {
    expect(() => assertExactOfflineBundleOutputs([
      { type: 'chunk', fileName: 'app.iife.js', isEntry: true },
      { type: 'asset', fileName: 'app.css' },
    ])).not.toThrow()
  })

  it.each([
    { outputs: [{ type: 'chunk' as const, fileName: 'app.iife.js', isEntry: true }] },
    { outputs: [
      { type: 'chunk' as const, fileName: 'app.bin', isEntry: true },
      { type: 'asset' as const, fileName: 'app.css' },
    ] },
    { outputs: [
      { type: 'chunk' as const, fileName: 'app.iife.js', isEntry: true },
      { type: 'asset' as const, fileName: 'app.css' },
      { type: 'asset' as const, fileName: 'logo.svg' },
    ] },
    { outputs: [
      { type: 'chunk' as const, fileName: 'app.iife.js', isEntry: true },
      { type: 'chunk' as const, fileName: 'lazy.js', isEntry: false },
      { type: 'asset' as const, fileName: 'app.css' },
    ] },
  ])('rejects missing or additional outputs: $outputs', ({ outputs }) => {
    expect(() => assertExactOfflineBundleOutputs(outputs)).toThrow(
      /with no other bundle outputs/u,
    )
  })
})

describe('findOfflineResourceReferences', () => {
  it('finds URL attributes, srcset, CSS url(), imports, SVG hrefs, and refresh URLs', () => {
    const dom = new JSDOM(`<!doctype html><html><head>
      <style>
        @import "theme.css";
        .hero { background: url(icon.svg) }
        .retina { background: image-set("https://example.com/retina.png" 2x, "data:image/png;base64,AA==" 1x) }
        .escaped { background: url("h\\74 tps://example.com/escaped.png") }
      </style>
      <meta http-equiv="refresh" content="0; url=next.html">
    </head><body style="mask-image: url('mask.svg')">
      <img src="photo.png" srcset="small.png 1x, large.png 2x">
      <svg><use xlink:href="sprite.svg#icon" filter="url(filters.svg#blur)"></use></svg>
    </body></html>`, { url: 'https://offline.test/' })

    expect(findOfflineResourceReferences(dom.window.document)).toEqual(
      expect.arrayContaining([
        { location: '<img>[src]', value: 'photo.png' },
        { location: '<img>[srcset]', value: 'small.png' },
        { location: '<img>[srcset]', value: 'large.png' },
        { location: '<use>[xlink:href]', value: 'sprite.svg#icon' },
        { location: '<use>[filter]', value: 'filters.svg#blur' },
        { location: '<body>[style]', value: 'mask.svg' },
        { location: '<style>', value: 'theme.css' },
        { location: '<style>', value: 'icon.svg' },
        { location: '<style>', value: 'https://example.com/retina.png' },
        { location: '<style>', value: 'data:image/png;base64,AA==' },
        { location: '<style>', value: 'https://example.com/escaped.png' },
        { location: '<meta>[content]', value: 'next.html' },
      ]),
    )
    dom.window.close()
  })

  it('allows only embedded or same-document references', () => {
    expect(isAllowedOfflineResourceReference('#main-content')).toBe(true)
    expect(isAllowedOfflineResourceReference('data:image/png;base64,AA==')).toBe(true)
    expect(isAllowedOfflineResourceReference('blob:null/identifier')).toBe(true)
    expect(isAllowedOfflineResourceReference('./asset.css')).toBe(false)
    expect(isAllowedOfflineResourceReference('file:///tmp/asset.js')).toBe(false)
    expect(isAllowedOfflineResourceReference('https://example.com/asset.js')).toBe(false)
    expect(isAllowedOfflineResourceReference('javascript:alert(1)')).toBe(false)
  })
})

describe('promoteOfflineIndexes', () => {
  it('promotes byte-identical root and dist targets and removes fixed transaction residue', async () => {
    const directory = await makeTemporaryDirectory()
    const rootIndexPath = join(directory, 'index.html')
    const distIndexPath = join(directory, 'dist', 'index.html')
    await mkdir(join(directory, 'dist'), { recursive: true })
    await Promise.all([
      writeFile(rootIndexPath, 'old root', 'utf8'),
      writeFile(distIndexPath, 'old dist', 'utf8'),
    ])

    await promoteOfflineIndexes('새 오프라인 문서\n', {
      rootIndexPath,
      distIndexPath,
    })

    const [rootBytes, distBytes] = await Promise.all([
      readFile(rootIndexPath),
      readFile(distIndexPath),
    ])
    expect(rootBytes.equals(distBytes)).toBe(true)
    expect(rootBytes.toString('utf8')).toBe('새 오프라인 문서\n')
    await expectCleanTransactionDirectory(directory)
  })

  it('restores both old files after an interruption between target promotions', async () => {
    const directory = await makeTemporaryDirectory()
    const rootIndexPath = join(directory, 'index.html')
    const distIndexPath = join(directory, 'dist', 'index.html')
    await mkdir(join(directory, 'dist'), { recursive: true })
    await Promise.all([
      writeFile(rootIndexPath, 'old root bytes', 'utf8'),
      writeFile(distIndexPath, 'old dist bytes', 'utf8'),
    ])

    await expect(promoteOfflineIndexes('new bytes', {
      rootIndexPath,
      distIndexPath,
      beforePromote(_targetPath, targetIndex) {
        if (targetIndex === 1) throw new Error('injected interruption')
      },
    })).rejects.toThrow('injected interruption')

    expect(await readFile(rootIndexPath, 'utf8')).toBe('old root bytes')
    expect(await readFile(distIndexPath, 'utf8')).toBe('old dist bytes')
    await expectCleanTransactionDirectory(directory)
  })

  it('keeps a valid new pair and a durable journal when post-commit cleanup is interrupted', async () => {
    const directory = await makeTemporaryDirectory()
    const rootIndexPath = join(directory, 'index.html')
    const distIndexPath = join(directory, 'dist', 'index.html')
    await mkdir(join(directory, 'dist'), { recursive: true })
    await Promise.all([
      writeFile(rootIndexPath, 'old root', 'utf8'),
      writeFile(distIndexPath, 'old dist', 'utf8'),
    ])

    let failure: unknown
    try {
      await promoteOfflineIndexes('committed new pair', {
        rootIndexPath,
        distIndexPath,
        beforeCleanup() {
          throw new Error('injected cleanup interruption')
        },
      })
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(OfflineIndexesCommittedWithResidueError)
    expect(failure).toMatchObject({
      code: 'OFFLINE_INDEXES_COMMITTED_WITH_RESIDUE',
      committed: true,
    })
    expect(await readFile(rootIndexPath, 'utf8')).toBe('committed new pair')
    expect(await readFile(distIndexPath, 'utf8')).toBe('committed new pair')

    await recoverOfflineIndexTransaction({ rootIndexPath, distIndexPath })

    expect(await readFile(rootIndexPath, 'utf8')).toBe('committed new pair')
    expect(await readFile(distIndexPath, 'utf8')).toBe('committed new pair')
    await expectCleanTransactionDirectory(directory)
  })
})

describe('recoverOfflineIndexTransaction', () => {
  async function makeIndexPair(): Promise<{
    directory: string
    paths: OfflineIndexTransactionPaths
  }> {
    const directory = await makeTemporaryDirectory()
    await mkdir(join(directory, 'dist'), { recursive: true })
    await Promise.all([
      writeFile(join(directory, 'index.html'), 'old root', 'utf8'),
      writeFile(join(directory, 'dist', 'index.html'), 'old dist', 'utf8'),
    ])
    return {
      directory,
      paths: offlineIndexTransactionPaths({
        rootIndexPath: join(directory, 'index.html'),
        distIndexPath: join(directory, 'dist', 'index.html'),
      }),
    }
  }

  it('recovers an initial prepare crash from the fixed next-journal file', async () => {
    const { directory, paths } = await makeIndexPair()
    const journal = crashJournal(paths, 'preparing', 'old root', 'old dist', 'new pair')
    await writeJournalFixture(paths.journalNextPath, journal)

    await recoverOfflineIndexTransaction({
      rootIndexPath: paths.rootIndexPath,
      distIndexPath: paths.distIndexPath,
    })

    expect(await readFile(paths.rootIndexPath, 'utf8')).toBe('old root')
    expect(await readFile(paths.distIndexPath, 'utf8')).toBe('old dist')
    await expectCleanTransactionDirectory(directory)
  })

  it('rolls back a crash after only the root target was promoted', async () => {
    const { directory, paths } = await makeIndexPair()
    const journal = crashJournal(paths, 'root-promoted', 'old root', 'old dist', 'new pair')
    await Promise.all([
      writeJournalFixture(paths.journalPath, journal),
      writeFile(paths.rootPreviousPath, 'old root', 'utf8'),
      writeFile(paths.distPreviousPath, 'old dist', 'utf8'),
      writeFile(paths.distNextPath, 'new pair', 'utf8'),
      writeFile(paths.rootIndexPath, 'new pair', 'utf8'),
    ])

    await recoverOfflineIndexTransaction({
      rootIndexPath: paths.rootIndexPath,
      distIndexPath: paths.distIndexPath,
    })

    expect(await readFile(paths.rootIndexPath, 'utf8')).toBe('old root')
    expect(await readFile(paths.distIndexPath, 'utf8')).toBe('old dist')
    await expectCleanTransactionDirectory(directory)
  })

  it('accepts a crash with both new targets as committed and only cleans residue', async () => {
    const { directory, paths } = await makeIndexPair()
    const journal = crashJournal(paths, 'promoting-dist', 'old root', 'old dist', 'new pair')
    await Promise.all([
      writeJournalFixture(paths.journalPath, journal),
      writeFile(paths.rootPreviousPath, 'old root', 'utf8'),
      writeFile(paths.distPreviousPath, 'old dist', 'utf8'),
      writeFile(paths.rootIndexPath, 'new pair', 'utf8'),
      writeFile(paths.distIndexPath, 'new pair', 'utf8'),
    ])

    await recoverOfflineIndexTransaction({
      rootIndexPath: paths.rootIndexPath,
      distIndexPath: paths.distIndexPath,
    })

    expect(await readFile(paths.rootIndexPath, 'utf8')).toBe('new pair')
    expect(await readFile(paths.distIndexPath, 'utf8')).toBe('new pair')
    await expectCleanTransactionDirectory(directory)
  })

  it('fails closed and never recursively deletes residue without a valid journal', async () => {
    const { paths } = await makeIndexPair()
    await mkdir(paths.rootNextPath)
    await writeFile(join(paths.rootNextPath, 'keep.txt'), 'keep me', 'utf8')

    await expect(recoverOfflineIndexTransaction({
      rootIndexPath: paths.rootIndexPath,
      distIndexPath: paths.distIndexPath,
    })).rejects.toThrow(/without a valid journal/u)

    expect(await readFile(join(paths.rootNextPath, 'keep.txt'), 'utf8')).toBe('keep me')
  })

  it('rejects a journal that names any non-fixed path without touching that path', async () => {
    const { paths } = await makeIndexPair()
    const outsideDirectory = await makeTemporaryDirectory()
    const outsidePath = join(outsideDirectory, 'outside-next.html')
    await writeFile(outsidePath, 'must survive', 'utf8')
    const journal = crashJournal(paths, 'preparing', 'old root', 'old dist', 'new pair')
    await writeJournalFixture(paths.journalPath, {
      ...journal,
      rootNextPath: outsidePath,
    })

    await expect(recoverOfflineIndexTransaction({
      rootIndexPath: paths.rootIndexPath,
      distIndexPath: paths.distIndexPath,
    })).rejects.toThrow(/journal is invalid/u)

    expect(await readFile(outsidePath, 'utf8')).toBe('must survive')
  })

  it('strictly rejects a dist target outside the root repository dist directory', async () => {
    const directory = await makeTemporaryDirectory()
    const rootIndexPath = join(directory, 'index.html')
    const unexpectedDistIndexPath = join(directory, 'other', 'index.html')
    await mkdir(join(directory, 'other'))
    await writeFile(unexpectedDistIndexPath, 'must survive', 'utf8')

    await expect(promoteOfflineIndexes('new pair', {
      rootIndexPath,
      distIndexPath: unexpectedDistIndexPath,
    })).rejects.toThrow(/must be exactly/u)
    expect(await readFile(unexpectedDistIndexPath, 'utf8')).toBe('must survive')
  })
})

describe('pruneOfflineDistribution', () => {
  it('refuses every directory except the repository dist without removing entries', async () => {
    const directory = await makeTemporaryDirectory()
    const unexpected = resolve(directory, 'repository')
    await mkdir(unexpected, { recursive: true })
    await writeFile(resolve(unexpected, 'keep.txt'), 'keep me', 'utf8')

    await expect(pruneOfflineDistribution(unexpected))
      .rejects.toThrow(/expected exactly/u)
    expect(await readFile(resolve(unexpected, 'keep.txt'), 'utf8')).toBe('keep me')
  })
})
