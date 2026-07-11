import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ContentSource } from './source-types'
import { CONTENT_CACHE_DIR, CONTENT_SOURCES, parseSha256 } from './sources'

export type ContentFetcher = (url: string) => Promise<Response>

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

export async function fetchContentSources(
  fetcher: ContentFetcher = fetch,
  sources: readonly ContentSource[] = CONTENT_SOURCES,
  cacheDir = CONTENT_CACHE_DIR,
): Promise<void> {
  const snapshots = sources.map((source) => ({
    source,
    target: resolveCachePath(cacheDir, source.cacheFile),
  }))

  await mkdir(cacheDir, { recursive: true })

  for (const { source, target } of snapshots) {
    const response = await fetcher(source.url)

    if (!response.ok) {
      throw new Error(`Download failed for ${source.id}: HTTP ${response.status}`)
    }

    const body = Buffer.from(await response.arrayBuffer())
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

async function main(): Promise<void> {
  await fetchContentSources()
}

const invokedPath = process.argv[1]

if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  await main()
}
