import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ContentSource } from './source-types'
import { CONTENT_CACHE_DIR, CONTENT_SOURCES, parseSha256 } from './sources'

export type ContentFetcher = (url: string, init?: RequestInit) => Promise<Response>

export const SOURCE_FETCH_TIMEOUT_MS = 5 * 60_000

export interface ContentSourceCacheStatus {
  source: ContentSource
  cachePresent: boolean
  verified: boolean
  verificationError?: string
}

export async function verifySourceBuffer(source: ContentSource, body: Buffer): Promise<void> {
  const actual = createHash('sha256').update(body).digest('hex')

  if (actual !== parseSha256(source.sha256)) {
    throw new Error(`SHA-256 mismatch for ${source.id}: expected ${source.sha256}, got ${actual}`)
  }
}

function resolveCachePath(cacheDir: string, cacheFile: string): string {
  if (cacheFile.length === 0 || cacheFile !== basename(cacheFile)) {
    throw new Error(`Unsafe cache file: ${cacheFile}`)
  }

  const cacheRoot = resolve(cacheDir)
  const target = resolve(cacheRoot, cacheFile)

  if (dirname(target) !== cacheRoot) {
    throw new Error(`Unsafe cache file: ${cacheFile}`)
  }

  return target
}

async function writeSnapshotAtomically(target: string, body: Buffer): Promise<void> {
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`)

  try {
    await writeFile(temporary, body)
    await rename(temporary, target)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

async function downloadSource(
  source: ContentSource,
  fetcher: ContentFetcher,
  timeoutMs: number,
): Promise<Buffer> {
  const controller = new AbortController()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const operation = (async () => {
    const response = await fetcher(source.url, { signal: controller.signal })

    if (!response.ok) {
      throw new Error(`Download failed for ${source.id}: HTTP ${response.status}`)
    }

    return Buffer.from(await response.arrayBuffer())
  })()
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Download timed out for ${source.id} after ${timeoutMs}ms`))
      controller.abort()
    }, timeoutMs)
  })

  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle)
    }
  }
}

export async function fetchContentSources(
  fetcher: ContentFetcher = fetch,
  sources: readonly ContentSource[] = CONTENT_SOURCES,
  cacheDir = CONTENT_CACHE_DIR,
  timeoutMs = SOURCE_FETCH_TIMEOUT_MS,
): Promise<void> {
  const snapshots = sources.map((source) => ({
    source,
    target: resolveCachePath(cacheDir, source.cacheFile),
  }))

  await mkdir(cacheDir, { recursive: true })

  for (const { source, target } of snapshots) {
    const body = await downloadSource(source, fetcher, timeoutMs)
    await verifySourceBuffer(source, body)
    await writeSnapshotAtomically(target, body)
  }
}

export async function inspectContentSourceCaches(
  sources: readonly ContentSource[] = CONTENT_SOURCES,
  cacheDir = CONTENT_CACHE_DIR,
): Promise<ContentSourceCacheStatus[]> {
  return Promise.all(sources.map(async (source) => {
    let target: string

    try {
      target = resolveCachePath(cacheDir, source.cacheFile)
    } catch (error) {
      return {
        source,
        cachePresent: false,
        verified: false,
        verificationError: error instanceof Error ? error.message : String(error),
      }
    }

    let body: Buffer

    try {
      body = await readFile(target)
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined

      if (code === 'ENOENT') {
        return { source, cachePresent: false, verified: false }
      }

      return {
        source,
        cachePresent: false,
        verified: false,
        verificationError: error instanceof Error ? error.message : String(error),
      }
    }

    try {
      await verifySourceBuffer(source, body)
      return { source, cachePresent: true, verified: true }
    } catch (error) {
      return {
        source,
        cachePresent: true,
        verified: false,
        verificationError: error instanceof Error ? error.message : String(error),
      }
    }
  }))
}

export async function requireVerifiedContentSourceCaches(
  sourceIds: readonly ContentSource['id'][],
  cacheDir = CONTENT_CACHE_DIR,
  knownSources: readonly ContentSource[] = CONTENT_SOURCES,
): Promise<void> {
  const sourcesById = new Map(knownSources.map((source) => [source.id, source]))
  const sources = [...new Set(sourceIds)].map((sourceId) => {
    const source = sourcesById.get(sourceId)
    if (!source) throw new Error(`Unknown pinned content source: ${sourceId}`)
    return source
  })
  const statuses = await inspectContentSourceCaches(sources, cacheDir)
  const failures = statuses.filter((status) => !status.verified)

  if (failures.length > 0) {
    const details = failures.map((status) => {
      const reason = status.verificationError
        ?? (status.cachePresent ? 'hash verification failed' : 'cache file is missing')
      return `${status.source.id}: ${reason}`
    })
    throw new Error(`Content source cache preflight failed: ${details.join('; ')}`)
  }
}

async function main(): Promise<void> {
  await fetchContentSources()
}

const invokedPath = process.argv[1]

if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  await main()
}
