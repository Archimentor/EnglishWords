import { createHash, randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises'
import { basename, dirname, join, parse, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OFFLINE_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const OFFLINE_DIST_DIRECTORY = resolve(OFFLINE_REPOSITORY_ROOT, 'dist')
export const OFFLINE_ROOT_INDEX_PATH = resolve(OFFLINE_REPOSITORY_ROOT, 'index.html')
export const OFFLINE_DIST_INDEX_PATH = resolve(OFFLINE_DIST_DIRECTORY, 'index.html')
export const OFFLINE_INDEX_TRANSACTION_SCHEMA_VERSION = '1.0.0' as const

const OFFLINE_SOURCE_INPUTS = [
  'src',
  'public/data',
  'scripts/build-lock.ts',
  'scripts/offline-build.ts',
  'THIRD_PARTY_NOTICES.md',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.config.ts',
] as const

export const OFFLINE_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  "font-src 'none'",
  "media-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
].join('; ')

export const OFFLINE_URL_ATTRIBUTE_NAMES = new Set([
  'action',
  'about',
  'archive',
  'background',
  'cite',
  'classid',
  'code',
  'codebase',
  'data',
  'formaction',
  'href',
  'icon',
  'imagesrcset',
  'itemid',
  'itemtype',
  'longdesc',
  'manifest',
  'ping',
  'poster',
  'profile',
  'resource',
  'src',
  'srcset',
  'usemap',
  'vocab',
  'xlink:href',
  'xmlns',
  'xmlns:xlink',
])

const OFFLINE_CSS_VALUE_ATTRIBUTE_NAMES = new Set([
  'clip-path',
  'cursor',
  'fill',
  'filter',
  'marker',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'stroke',
])

export interface OfflineHtmlInput {
  catalog: string
  css: string
  javascript: string
  notices: string
  sourceHash: string
}

export interface OfflineResourceReference {
  location: string
  value: string
}

export interface OfflineIndexPromotionOptions {
  rootIndexPath?: string
  distIndexPath?: string
  beforePromote?: (targetPath: string, targetIndex: number) => void | Promise<void>
  beforeCleanup?: (paths: Readonly<OfflineIndexTransactionPaths>) => void | Promise<void>
}

export interface OfflineBundleOutputDescriptor {
  fileName: string
  type: 'asset' | 'chunk'
  isEntry?: boolean
}

export type OfflineIndexTransactionPhase =
  | 'preparing'
  | 'prepared'
  | 'promoting-root'
  | 'root-promoted'
  | 'promoting-dist'
  | 'committed'

export interface OfflineIndexOriginalSnapshot {
  exists: boolean
  sha256: string | null
}

export interface OfflineIndexTransactionPaths {
  repositoryRoot: string
  rootIndexPath: string
  distIndexPath: string
  journalPath: string
  journalNextPath: string
  rootNextPath: string
  rootPreviousPath: string
  distNextPath: string
  distPreviousPath: string
}

export interface OfflineIndexTransactionJournal {
  schemaVersion: typeof OFFLINE_INDEX_TRANSACTION_SCHEMA_VERSION
  transactionId: string
  phase: OfflineIndexTransactionPhase
  rootIndexPath: string
  distIndexPath: string
  rootNextPath: string
  rootPreviousPath: string
  distNextPath: string
  distPreviousPath: string
  newSha256: string
  rootOriginal: OfflineIndexOriginalSnapshot
  distOriginal: OfflineIndexOriginalSnapshot
}

export class OfflineIndexesCommittedWithResidueError extends AggregateError {
  readonly code = 'OFFLINE_INDEXES_COMMITTED_WITH_RESIDUE'
  readonly committed = true
  readonly journalPath: string
  readonly residuePaths: readonly string[]

  constructor(
    failures: readonly unknown[],
    paths: OfflineIndexTransactionPaths,
    residuePaths: readonly string[],
  ) {
    super(
      failures,
      'Offline indexes were committed, but transaction residue could not be cleaned. '
        + 'The new root/dist pair remains valid; the next locked build will retry recovery.',
      { cause: failures[0] },
    )
    this.name = 'OfflineIndexesCommittedWithResidueError'
    this.journalPath = paths.journalPath
    this.residuePaths = residuePaths
  }
}

export const DEVELOPMENT_INDEX_HTML = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>영단어 5000 마스터</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`

async function sourceFiles(path: string): Promise<string[]> {
  const pathStat = await stat(path)
  if (pathStat.isFile()) return [path]

  const entries = await readdir(path, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => sourceFiles(resolve(path, entry.name))),
  )
  return nested.flat()
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (error) {
    if (!isMissingFile(error)) throw error
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function createOfflineHtml(input: OfflineHtmlInput): string {
  const css = input.css.replace(/<\/style/giu, '<\\/style')
  const javascript = input.javascript.replace(/<\/script/giu, '<\\/script')
  const catalog = input.catalog.replace(/<\/script/giu, '<\\/script')

  return `<!doctype html>\n<html lang="ko">\n  <head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <meta http-equiv="Content-Security-Policy" content="${OFFLINE_CONTENT_SECURITY_POLICY}">\n    <meta name="english-words-source-sha256" content="${input.sourceHash}">\n    <title>영단어 5000 마스터</title>\n    <style>${css}</style>\n  </head>\n  <body>\n    <div id="root"></div>\n    <footer class="third-party-notices">\n      <details id="third-party-notices">\n        <summary>출처 및 라이선스</summary>\n        <pre>${escapeHtml(input.notices)}</pre>\n      </details>\n    </footer>\n    <script>${catalog}${javascript}</script>\n  </body>\n</html>\n`
}

export function assertExactOfflineBundleOutputs(
  outputs: readonly OfflineBundleOutputDescriptor[],
): void {
  const entryChunks = outputs.filter(
    (output) =>
      output.type === 'chunk'
      && output.isEntry === true
      && output.fileName.endsWith('.js'),
  )
  const cssAssets = outputs.filter(
    (output) => output.type === 'asset' && output.fileName.endsWith('.css'),
  )
  const expectedOutputs = new Set([...entryChunks, ...cssAssets])
  const unexpectedOutputs = outputs.filter((output) => !expectedOutputs.has(output))

  if (
    entryChunks.length !== 1
    || cssAssets.length !== 1
    || outputs.length !== 2
    || unexpectedOutputs.length > 0
  ) {
    const outputSummary = outputs.length > 0
      ? outputs.map((output) => `${output.type}:${output.fileName}`).join(', ')
      : '(none)'
    throw new Error(
      'Expected exactly one JavaScript entry and one CSS asset with no other bundle outputs; '
        + `received ${outputSummary}.`,
    )
  }
}

function decodeCssEscapes(value: string): string {
  return value.replace(
    /\\(?:([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|\r\n|[\n\r\f]|(.))/giu,
    (_match, hexadecimal: string | undefined, escaped: string | undefined) => {
      if (hexadecimal) {
        const codePoint = Number.parseInt(hexadecimal, 16)
        return codePoint === 0 || codePoint > 0x10ffff
          ? '\uFFFD'
          : String.fromCodePoint(codePoint)
      }
      return escaped ?? ''
    },
  )
}

function matchingParenthesis(css: string, openingIndex: number): number {
  let depth = 1
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = openingIndex + 1; index < css.length; index += 1) {
    const character = css[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function topLevelCssSegments(value: string): string[] {
  const segments: string[] = []
  let start = 0
  let depth = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth = Math.max(0, depth - 1)
    } else if (character === ',' && depth === 0) {
      segments.push(value.slice(start, index))
      start = index + 1
    }
  }
  segments.push(value.slice(start))
  return segments
}

function leadingQuotedCssString(value: string): string | null {
  const trimmed = value.trimStart()
  const quote = trimmed[0]
  if (quote !== '"' && quote !== "'") return null

  let result = ''
  for (let index = 1; index < trimmed.length; index += 1) {
    const character = trimmed[index]
    if (character === quote) return decodeCssEscapes(result)
    if (character === '\\' && index + 1 < trimmed.length) {
      result += character + trimmed[index + 1]
      index += 1
    } else {
      result += character
    }
  }
  return null
}

function findImageSetResourceReferences(css: string): string[] {
  const references: string[] = []
  const pattern = /(?:-webkit-)?image-set\s*\(/giu
  for (const match of css.matchAll(pattern)) {
    const openingIndex = (match.index ?? 0) + match[0].lastIndexOf('(')
    const closingIndex = matchingParenthesis(css, openingIndex)
    if (closingIndex === -1) continue
    const body = css.slice(openingIndex + 1, closingIndex)
    for (const candidate of topLevelCssSegments(body)) {
      const reference = leadingQuotedCssString(candidate)
      if (reference) references.push(reference)
    }
  }
  return references
}

export function findCssResourceReferences(css: string): string[] {
  const references: string[] = []
  const urlPattern = /url\s*\(\s*(?:(['"])(.*?)\1|([^)]*))\s*\)/giu
  for (const match of css.matchAll(urlPattern)) {
    const value = (match[2] ?? match[3] ?? '').trim()
    if (value) references.push(decodeCssEscapes(value))
  }

  const importPattern = /@import\s+(?!url\s*\()(['"])(.*?)\1/giu
  for (const match of css.matchAll(importPattern)) {
    const value = (match[2] ?? '').trim()
    if (value) references.push(decodeCssEscapes(value))
  }
  references.push(...findImageSetResourceReferences(css))
  return references
}

export function findSrcsetResourceReferences(srcset: string): string[] {
  const references: string[] = []
  let cursor = 0

  while (cursor < srcset.length) {
    while (cursor < srcset.length && /[\s,]/u.test(srcset[cursor] ?? '')) cursor += 1
    if (cursor >= srcset.length) break

    const start = cursor
    while (cursor < srcset.length && !/\s/u.test(srcset[cursor] ?? '')) cursor += 1
    let reference = srcset.slice(start, cursor)
    let endedAtComma = false
    while (reference.endsWith(',')) {
      reference = reference.slice(0, -1)
      endedAtComma = true
    }
    if (reference) references.push(reference)

    if (!endedAtComma) {
      while (cursor < srcset.length && srcset[cursor] !== ',') cursor += 1
      if (srcset[cursor] === ',') cursor += 1
    }
  }

  return references
}

export function isAllowedOfflineResourceReference(value: string): boolean {
  const normalized = value.trim()
  return normalized.startsWith('#') || /^(?:blob|data):/iu.test(normalized)
}

export function findOfflineResourceReferences(
  document: Document,
): OfflineResourceReference[] {
  const references: OfflineResourceReference[] = []

  for (const element of document.querySelectorAll('*')) {
    const elementName = element.tagName.toLowerCase()
    for (const attribute of element.attributes) {
      const attributeName = attribute.name.toLowerCase()
      if (
        OFFLINE_URL_ATTRIBUTE_NAMES.has(attributeName)
        || attributeName.endsWith(':href')
      ) {
        const value = attribute.value.trim()
        if (value) {
          const values = attributeName === 'srcset' || attributeName === 'imagesrcset'
            ? findSrcsetResourceReferences(value)
            : attributeName === 'archive' || attributeName === 'ping'
              ? value.split(/\s+/u)
              : [value]
          for (const resourceValue of values) {
            references.push({
              location: `<${elementName}>[${attribute.name}]`,
              value: resourceValue,
            })
          }
        }
      }

      if (OFFLINE_CSS_VALUE_ATTRIBUTE_NAMES.has(attributeName)) {
        for (const value of findCssResourceReferences(attribute.value)) {
          references.push({
            location: `<${elementName}>[${attribute.name}]`,
            value,
          })
        }
      }
    }

    const inlineStyle = element.getAttribute('style')
    if (inlineStyle) {
      for (const value of findCssResourceReferences(inlineStyle)) {
        references.push({ location: `<${elementName}>[style]`, value })
      }
    }
  }

  for (const style of document.querySelectorAll('style')) {
    for (const value of findCssResourceReferences(style.textContent ?? '')) {
      references.push({ location: '<style>', value })
    }
  }

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[http-equiv][content]')) {
    if (meta.httpEquiv.toLowerCase() !== 'refresh') continue
    const match = /(?:^|;)\s*url\s*=\s*(.+)$/iu.exec(meta.content)
    const value = match?.[1]?.trim().replace(/^(['"])(.*)\1$/u, '$2')
    if (value) references.push({ location: '<meta>[content]', value })
  }

  return references
}

function comparablePath(path: string): string {
  return process.platform === 'win32' ? path.toLocaleLowerCase('en-US') : path
}

function pathsMatch(left: string, right: string): boolean {
  return comparablePath(resolve(left)) === comparablePath(resolve(right))
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function offlineIndexTransactionPaths(
  options: Pick<OfflineIndexPromotionOptions, 'rootIndexPath' | 'distIndexPath'> = {},
): OfflineIndexTransactionPaths {
  const rootIndexPath = resolve(options.rootIndexPath ?? OFFLINE_ROOT_INDEX_PATH)
  const repositoryRoot = dirname(rootIndexPath)
  const expectedDistIndexPath = join(repositoryRoot, 'dist', 'index.html')
  const distIndexPath = resolve(options.distIndexPath ?? expectedDistIndexPath)

  if (basename(rootIndexPath) !== 'index.html') {
    throw new Error('The offline root target must be an index.html file.')
  }
  if (pathsMatch(repositoryRoot, parse(repositoryRoot).root)) {
    throw new Error('Refusing to use a filesystem root for an offline index transaction.')
  }
  if (!pathsMatch(distIndexPath, expectedDistIndexPath)) {
    throw new Error(
      `The offline dist target must be exactly ${expectedDistIndexPath}; received ${distIndexPath}.`,
    )
  }

  return {
    repositoryRoot,
    rootIndexPath,
    distIndexPath,
    journalPath: join(repositoryRoot, '.offline-index-transaction.json'),
    journalNextPath: join(repositoryRoot, '.offline-index-transaction.json.next'),
    rootNextPath: join(repositoryRoot, '.index.html.offline-next'),
    rootPreviousPath: join(repositoryRoot, '.index.html.offline-previous'),
    distNextPath: join(repositoryRoot, 'dist', '.index.html.offline-next'),
    distPreviousPath: join(repositoryRoot, 'dist', '.index.html.offline-previous'),
  }
}

interface IndexFileSnapshot extends OfflineIndexOriginalSnapshot {
  bytes: Buffer | null
}

interface CleanupFailure {
  path: string
  error: unknown
}

type TargetState = 'old' | 'new' | 'both' | 'unknown'

const TRANSACTION_PHASES = new Set<OfflineIndexTransactionPhase>([
  'preparing',
  'prepared',
  'promoting-root',
  'root-promoted',
  'promoting-dist',
  'committed',
])
const SHA256_PATTERN = /^[0-9a-f]{64}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

async function ensureRealDirectory(path: string, create: boolean): Promise<void> {
  if (create) await mkdir(path, { recursive: true })
  let pathStat
  try {
    pathStat = await lstat(path)
  } catch (error) {
    if (isMissingFile(error)) {
      throw new Error(`Offline index transaction directory does not exist: ${path}`, {
        cause: error,
      })
    }
    throw error
  }
  if (!pathStat.isDirectory() || pathStat.isSymbolicLink()) {
    throw new Error(
      `Offline index transaction directory must be a real directory: ${path}`,
    )
  }
}

async function ensureTransactionDirectories(paths: OfflineIndexTransactionPaths): Promise<void> {
  await ensureRealDirectory(paths.repositoryRoot, false)
  await ensureRealDirectory(dirname(paths.distIndexPath), true)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (isMissingFile(error)) return false
    throw error
  }
}

async function readIndexSnapshot(path: string): Promise<IndexFileSnapshot> {
  let pathStat
  try {
    pathStat = await lstat(path)
  } catch (error) {
    if (isMissingFile(error)) return { exists: false, sha256: null, bytes: null }
    throw error
  }
  if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
    throw new Error(`Offline index transaction target must be a regular file: ${path}`)
  }
  const bytes = await readFile(path)
  return { exists: true, sha256: sha256(bytes), bytes }
}

async function writeSyncedExclusive(path: string, bytes: Uint8Array): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | undefined
  let created = false
  try {
    handle = await open(path, 'wx')
    created = true
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = undefined
  } catch (error) {
    const failures: unknown[] = [error]
    if (handle) {
      try {
        await handle.close()
      } catch (closeError) {
        failures.push(closeError)
      }
    }
    if (created) {
      try {
        await unlinkIfPresent(path)
      } catch (cleanupError) {
        failures.push(cleanupError)
      }
    }
    if (failures.length > 1) {
      throw new AggregateError(
        failures,
        `Failed to durably write offline transaction file ${path}.`,
        { cause: error },
      )
    }
    throw error
  }
}

function journalBytes(journal: OfflineIndexTransactionJournal): Buffer {
  return Buffer.from(`${JSON.stringify(journal, null, 2)}\n`, 'utf8')
}

async function writeJournal(
  paths: OfflineIndexTransactionPaths,
  journal: OfflineIndexTransactionJournal,
): Promise<void> {
  await writeSyncedExclusive(paths.journalNextPath, journalBytes(journal))
  try {
    await rename(paths.journalNextPath, paths.journalPath)
  } catch (error) {
    try {
      await unlinkIfPresent(paths.journalNextPath)
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Failed to publish or clean the offline index transaction journal.',
        { cause: cleanupError },
      )
    }
    throw error
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index])
}

function validateOriginalSnapshot(
  value: unknown,
  label: string,
): OfflineIndexOriginalSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, ['exists', 'sha256'])) {
    throw new Error(`Offline index transaction ${label} snapshot has an invalid shape.`)
  }
  if (typeof value.exists !== 'boolean') {
    throw new Error(`Offline index transaction ${label} snapshot has an invalid exists flag.`)
  }
  if (value.exists) {
    if (typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256)) {
      throw new Error(`Offline index transaction ${label} snapshot has an invalid digest.`)
    }
  } else if (value.sha256 !== null) {
    throw new Error(`Offline index transaction ${label} snapshot must have a null digest.`)
  }
  return { exists: value.exists, sha256: value.sha256 as string | null }
}

function validateJournal(
  value: unknown,
  paths: OfflineIndexTransactionPaths,
): OfflineIndexTransactionJournal {
  const expectedKeys = [
    'schemaVersion',
    'transactionId',
    'phase',
    'rootIndexPath',
    'distIndexPath',
    'rootNextPath',
    'rootPreviousPath',
    'distNextPath',
    'distPreviousPath',
    'newSha256',
    'rootOriginal',
    'distOriginal',
  ] as const
  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    throw new Error('Offline index transaction journal has an invalid shape.')
  }
  if (value.schemaVersion !== OFFLINE_INDEX_TRANSACTION_SCHEMA_VERSION) {
    throw new Error('Offline index transaction journal has an unsupported schema version.')
  }
  if (typeof value.transactionId !== 'string' || !UUID_PATTERN.test(value.transactionId)) {
    throw new Error('Offline index transaction journal has an invalid transaction id.')
  }
  if (typeof value.phase !== 'string'
    || !TRANSACTION_PHASES.has(value.phase as OfflineIndexTransactionPhase)) {
    throw new Error('Offline index transaction journal has an invalid phase.')
  }
  if (typeof value.newSha256 !== 'string' || !SHA256_PATTERN.test(value.newSha256)) {
    throw new Error('Offline index transaction journal has an invalid new-index digest.')
  }

  const recordedPaths = [
    ['rootIndexPath', paths.rootIndexPath],
    ['distIndexPath', paths.distIndexPath],
    ['rootNextPath', paths.rootNextPath],
    ['rootPreviousPath', paths.rootPreviousPath],
    ['distNextPath', paths.distNextPath],
    ['distPreviousPath', paths.distPreviousPath],
  ] as const
  for (const [key, expectedPath] of recordedPaths) {
    if (typeof value[key] !== 'string' || !pathsMatch(value[key], expectedPath)) {
      throw new Error(`Offline index transaction journal contains an unexpected ${key}.`)
    }
  }

  return {
    schemaVersion: OFFLINE_INDEX_TRANSACTION_SCHEMA_VERSION,
    transactionId: value.transactionId,
    phase: value.phase as OfflineIndexTransactionPhase,
    rootIndexPath: paths.rootIndexPath,
    distIndexPath: paths.distIndexPath,
    rootNextPath: paths.rootNextPath,
    rootPreviousPath: paths.rootPreviousPath,
    distNextPath: paths.distNextPath,
    distPreviousPath: paths.distPreviousPath,
    newSha256: value.newSha256,
    rootOriginal: validateOriginalSnapshot(value.rootOriginal, 'root'),
    distOriginal: validateOriginalSnapshot(value.distOriginal, 'dist'),
  }
}

async function readJournal(
  path: string,
  paths: OfflineIndexTransactionPaths,
): Promise<OfflineIndexTransactionJournal> {
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`Offline index transaction journal is not valid JSON: ${path}`, {
      cause: error,
    })
  }
  return validateJournal(value, paths)
}

function residuePaths(paths: OfflineIndexTransactionPaths, includeJournal: boolean): string[] {
  const residue = [
    paths.journalNextPath,
    paths.rootNextPath,
    paths.rootPreviousPath,
    paths.distNextPath,
    paths.distPreviousPath,
  ]
  if (includeJournal) residue.push(paths.journalPath)
  return residue
}

async function existingResiduePaths(
  paths: OfflineIndexTransactionPaths,
  includeJournal: boolean,
): Promise<string[]> {
  const candidates = residuePaths(paths, includeJournal)
  const existence = await Promise.all(candidates.map(fileExists))
  return candidates.filter((_, index) => existence[index])
}

async function removeReservedFile(path: string): Promise<void> {
  let pathStat
  try {
    pathStat = await lstat(path)
  } catch (error) {
    if (isMissingFile(error)) return
    throw error
  }
  if (!pathStat.isFile() && !pathStat.isSymbolicLink()) {
    throw new Error(`Refusing to remove non-file offline transaction residue: ${path}`)
  }
  await unlink(path)
}

async function cleanTransactionResidue(
  paths: OfflineIndexTransactionPaths,
): Promise<CleanupFailure[]> {
  const failures: CleanupFailure[] = []
  for (const path of residuePaths(paths, false)) {
    try {
      await removeReservedFile(path)
    } catch (error) {
      failures.push({ path, error })
    }
  }
  if (failures.length === 0) {
    try {
      await removeReservedFile(paths.journalPath)
    } catch (error) {
      failures.push({ path: paths.journalPath, error })
    }
  }
  return failures
}

async function currentTargetState(
  path: string,
  original: OfflineIndexOriginalSnapshot,
  newSha256: string,
): Promise<TargetState> {
  const current = await readIndexSnapshot(path)
  const isOld = original.exists
    ? current.exists && current.sha256 === original.sha256
    : !current.exists
  const isNew = current.exists && current.sha256 === newSha256
  if (isOld && isNew) return 'both'
  if (isOld) return 'old'
  if (isNew) return 'new'
  return 'unknown'
}

async function restoreOriginal(
  targetPath: string,
  previousPath: string,
  original: OfflineIndexOriginalSnapshot,
): Promise<void> {
  if (!original.exists) {
    await unlinkIfPresent(targetPath)
    return
  }
  const previous = await readIndexSnapshot(previousPath)
  if (!previous.exists || previous.sha256 !== original.sha256) {
    throw new Error(
      `Cannot recover ${targetPath}: its fixed previous file is missing or has the wrong digest.`,
    )
  }
  await rename(previousPath, targetPath)
}

async function committedResidueError(
  failures: readonly unknown[],
  paths: OfflineIndexTransactionPaths,
  fallbackResidue: readonly string[] = residuePaths(paths, true),
): Promise<OfflineIndexesCommittedWithResidueError> {
  let residue: string[]
  try {
    residue = await existingResiduePaths(paths, true)
  } catch {
    residue = [...fallbackResidue]
  }
  return new OfflineIndexesCommittedWithResidueError(failures, paths, residue)
}

export async function recoverOfflineIndexTransaction(
  options: Pick<OfflineIndexPromotionOptions, 'rootIndexPath' | 'distIndexPath'> = {},
): Promise<void> {
  const paths = offlineIndexTransactionPaths(options)
  await ensureTransactionDirectories(paths)

  let hasJournal = await fileExists(paths.journalPath)
  if (!hasJournal && await fileExists(paths.journalNextPath)) {
    try {
      await readJournal(paths.journalNextPath, paths)
      await rename(paths.journalNextPath, paths.journalPath)
      hasJournal = true
    } catch (error) {
      throw new Error(
        'Offline index transaction residue exists without a valid journal; preserving it for inspection.',
        { cause: error },
      )
    }
  }

  if (!hasJournal) {
    const residue = await existingResiduePaths(paths, false)
    if (residue.length > 0) {
      throw new Error(
        `Offline index transaction residue exists without a valid journal: ${residue.join(', ')}`,
      )
    }
    return
  }

  let journal: OfflineIndexTransactionJournal
  try {
    journal = await readJournal(paths.journalPath, paths)
  } catch (error) {
    throw new Error(
      'Offline index transaction journal is invalid; preserving all transaction files for inspection.',
      { cause: error },
    )
  }

  const rootState = await currentTargetState(
    paths.rootIndexPath,
    journal.rootOriginal,
    journal.newSha256,
  )
  const distState = await currentTargetState(
    paths.distIndexPath,
    journal.distOriginal,
    journal.newSha256,
  )
  const committed = [rootState, distState]
    .every((state) => state === 'new' || state === 'both')

  if (!committed) {
    if (rootState === 'unknown' || distState === 'unknown') {
      throw new Error(
        'Offline index transaction targets do not match the journal; preserving all files for inspection.',
      )
    }
    if (rootState === 'new') {
      await restoreOriginal(
        paths.rootIndexPath,
        paths.rootPreviousPath,
        journal.rootOriginal,
      )
    }
    if (distState === 'new') {
      await restoreOriginal(
        paths.distIndexPath,
        paths.distPreviousPath,
        journal.distOriginal,
      )
    }

    const restoredRootState = await currentTargetState(
      paths.rootIndexPath,
      journal.rootOriginal,
      journal.newSha256,
    )
    const restoredDistState = await currentTargetState(
      paths.distIndexPath,
      journal.distOriginal,
      journal.newSha256,
    )
    if (![restoredRootState, restoredDistState]
      .every((state) => state === 'old' || state === 'both')) {
      throw new Error(
        'Offline index transaction rollback did not restore the journaled original pair.',
      )
    }
  }

  const cleanupFailures = await cleanTransactionResidue(paths)
  if (cleanupFailures.length > 0) {
    if (committed) {
      throw await committedResidueError(
        cleanupFailures.map(({ error }) => error),
        paths,
        cleanupFailures.map(({ path }) => path),
      )
    }
    throw new AggregateError(
      cleanupFailures.map(({ error }) => error),
      'Offline index transaction rolled back, but fixed transaction residue remains.',
      { cause: cleanupFailures[0]?.error },
    )
  }
}

async function updateJournalPhase(
  paths: OfflineIndexTransactionPaths,
  journal: OfflineIndexTransactionJournal,
  phase: OfflineIndexTransactionPhase,
): Promise<OfflineIndexTransactionJournal> {
  const updated = { ...journal, phase }
  await writeJournal(paths, updated)
  return updated
}

export async function promoteOfflineIndexes(
  html: string,
  options: OfflineIndexPromotionOptions = {},
): Promise<void> {
  const paths = offlineIndexTransactionPaths(options)
  const recoveryOptions = {
    rootIndexPath: paths.rootIndexPath,
    distIndexPath: paths.distIndexPath,
  }
  await recoverOfflineIndexTransaction(recoveryOptions)
  await ensureTransactionDirectories(paths)

  const bytes = Buffer.from(html, 'utf8')
  const rootOriginal = await readIndexSnapshot(paths.rootIndexPath)
  const distOriginal = await readIndexSnapshot(paths.distIndexPath)
  let journal: OfflineIndexTransactionJournal = {
    schemaVersion: OFFLINE_INDEX_TRANSACTION_SCHEMA_VERSION,
    transactionId: randomUUID(),
    phase: 'preparing',
    rootIndexPath: paths.rootIndexPath,
    distIndexPath: paths.distIndexPath,
    rootNextPath: paths.rootNextPath,
    rootPreviousPath: paths.rootPreviousPath,
    distNextPath: paths.distNextPath,
    distPreviousPath: paths.distPreviousPath,
    newSha256: sha256(bytes),
    rootOriginal: { exists: rootOriginal.exists, sha256: rootOriginal.sha256 },
    distOriginal: { exists: distOriginal.exists, sha256: distOriginal.sha256 },
  }
  let pairCommitted = false

  try {
    await writeJournal(paths, journal)
    await writeSyncedExclusive(paths.rootNextPath, bytes)
    await writeSyncedExclusive(paths.distNextPath, bytes)
    if (rootOriginal.bytes) {
      await writeSyncedExclusive(paths.rootPreviousPath, rootOriginal.bytes)
    }
    if (distOriginal.bytes) {
      await writeSyncedExclusive(paths.distPreviousPath, distOriginal.bytes)
    }
    journal = await updateJournalPhase(paths, journal, 'prepared')

    await options.beforePromote?.(paths.rootIndexPath, 0)
    journal = await updateJournalPhase(paths, journal, 'promoting-root')
    await rename(paths.rootNextPath, paths.rootIndexPath)
    journal = await updateJournalPhase(paths, journal, 'root-promoted')

    await options.beforePromote?.(paths.distIndexPath, 1)
    journal = await updateJournalPhase(paths, journal, 'promoting-dist')
    await rename(paths.distNextPath, paths.distIndexPath)
    pairCommitted = true
    journal = await updateJournalPhase(paths, journal, 'committed')
  } catch (error) {
    if (pairCommitted) throw await committedResidueError([error], paths)
    try {
      await recoverOfflineIndexTransaction(recoveryOptions)
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        'Offline index promotion failed and durable recovery could not complete.',
        { cause: recoveryError },
      )
    }
    throw error
  }

  try {
    await options.beforeCleanup?.(paths)
  } catch (error) {
    throw await committedResidueError([error], paths)
  }

  const cleanupFailures = await cleanTransactionResidue(paths)
  if (cleanupFailures.length > 0) {
    throw await committedResidueError(
      cleanupFailures.map(({ error }) => error),
      paths,
      cleanupFailures.map(({ path }) => path),
    )
  }
}

export async function pruneOfflineDistribution(
  directory = OFFLINE_DIST_DIRECTORY,
): Promise<void> {
  const resolvedDirectory = resolve(directory)
  const resolvedExpectedDirectory = OFFLINE_DIST_DIRECTORY
  const comparableDirectory = process.platform === 'win32'
    ? resolvedDirectory.toLocaleLowerCase('en-US')
    : resolvedDirectory
  const comparableExpected = process.platform === 'win32'
    ? resolvedExpectedDirectory.toLocaleLowerCase('en-US')
    : resolvedExpectedDirectory
  if (comparableDirectory !== comparableExpected) {
    throw new Error(
      `Refusing to prune unexpected offline distribution ${resolvedDirectory}; `
        + `expected exactly ${resolvedExpectedDirectory}.`,
    )
  }
  if (dirname(resolvedDirectory) === resolvedDirectory) {
    throw new Error('Refusing to prune a filesystem root as an offline distribution.')
  }

  await mkdir(resolvedDirectory, { recursive: true })
  const directoryStat = await lstat(resolvedDirectory)
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error(
      'The offline distribution path must be a real directory, not a file or symbolic link.',
    )
  }
  const entries = await readdir(resolvedDirectory, { withFileTypes: true })
  const retainedIndex = entries.find((entry) => entry.name === 'index.html')
  if (retainedIndex && !retainedIndex.isFile()) {
    throw new Error('The retained offline dist/index.html path must be a regular file.')
  }

  await Promise.all(entries
    .filter((entry) => entry.name !== 'index.html')
    .map((entry) => rm(resolve(resolvedDirectory, entry.name), {
      force: false,
      recursive: true,
    })))
}

export async function calculateOfflineSourceHash(
  rootDirectory = OFFLINE_REPOSITORY_ROOT,
): Promise<string> {
  const legacyLockPath = resolve(rootDirectory, 'public/data/.content-build.lock')
  const files = (
    await Promise.all(
      OFFLINE_SOURCE_INPUTS.map((path) => sourceFiles(resolve(rootDirectory, path))),
    )
  )
    .flat()
    .filter((file) => resolve(file) !== legacyLockPath)
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
  const hash = createHash('sha256')

  for (const file of files) {
    hash.update(relative(rootDirectory, file).replaceAll('\\', '/'))
    hash.update('\0')
    hash.update(normalizeOfflineSourceText(await readFile(file, 'utf8')), 'utf8')
    hash.update('\0')
  }

  return hash.digest('hex')
}

export function normalizeOfflineSourceText(value: string): string {
  return value.replace(/\r\n?/gu, '\n')
}
