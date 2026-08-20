import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { ContentSource } from './source-types'
import { CONTENT_SOURCES } from './sources'
import {
  fetchContentSources,
  inspectContentSourceCaches,
  requireVerifiedContentSourceCaches,
  SOURCE_FETCH_TIMEOUT_MS,
  verifySourceBuffer,
} from './fetchSources'

const TEST_SOURCE = CONTENT_SOURCES[0]!

function sourceFor(cacheFile: string, body: Buffer): ContentSource {
  return {
    ...TEST_SOURCE,
    cacheFile,
    sha256: createHash('sha256').update(body).digest('hex'),
  }
}

async function withTemporaryCache(testBody: (cacheDir: string) => Promise<void>): Promise<void> {
  const cacheDir = await mkdtemp(join(tmpdir(), 'english-words-content-'))

  try {
    await testBody(cacheDir)
  } finally {
    await rm(cacheDir, { force: true, recursive: true })
  }
}

describe('source snapshot verification', () => {
  test('uses a finite default source download deadline', () => {
    expect(SOURCE_FETCH_TIMEOUT_MS).toBe(5 * 60_000)
  })

  test('rejects a cached file whose digest differs from the pinned source', async () => {
    await expect(verifySourceBuffer(TEST_SOURCE, Buffer.from('tampered')))
      .rejects.toThrow('SHA-256 mismatch')
  })

  test('writes a verified response to its cache file', async () => {
    const body = Buffer.from('verified snapshot')
    const source = sourceFor('verified.csv', body)

    await withTemporaryCache(async (cacheDir) => {
      await fetchContentSources(async () => new Response(body), [source], cacheDir)

      await expect(readFile(join(cacheDir, source.cacheFile))).resolves.toEqual(body)
    })
  })

  test('preserves an existing cache file when a downloaded response fails verification', async () => {
    const expected = Buffer.from('expected snapshot')
    const source = sourceFor('stable.csv', expected)

    await withTemporaryCache(async (cacheDir) => {
      const cacheFile = join(cacheDir, source.cacheFile)
      await writeFile(cacheFile, 'previous verified snapshot')

      await expect(fetchContentSources(
        async () => new Response(Buffer.from('tampered snapshot')),
        [source],
        cacheDir,
      )).rejects.toThrow('SHA-256 mismatch')

      await expect(readFile(cacheFile, 'utf8')).resolves.toBe('previous verified snapshot')
      await expect(readdir(cacheDir)).resolves.toEqual([source.cacheFile])
    })
  })

  test('rejects an unsafe cache filename before downloading a source', async () => {
    const source = sourceFor('../outside.csv', Buffer.from('verified snapshot'))
    let fetchCalls = 0

    await withTemporaryCache(async (cacheDir) => {
      await expect(fetchContentSources(async () => {
        fetchCalls += 1
        return new Response(Buffer.from('verified snapshot'))
      }, [source], cacheDir)).rejects.toThrow('Unsafe cache file')
    })

    expect(fetchCalls).toBe(0)
  })

  test('aborts a stalled download and leaves no partial cache file', async () => {
    const source = sourceFor('timeout.csv', Buffer.from('verified snapshot'))
    vi.useFakeTimers()

    try {
      await withTemporaryCache(async (cacheDir) => {
        let signal: AbortSignal | null | undefined
        let markFetchStarted!: () => void
        const fetchStarted = new Promise<void>((resolve) => {
          markFetchStarted = resolve
        })
        const pending = fetchContentSources(
          async (_url, init) => {
            signal = init?.signal
            markFetchStarted()
            return new Promise<Response>(() => undefined)
          },
          [source],
          cacheDir,
          25,
        )
        const rejection = expect(pending).rejects.toThrow(
          `Download timed out for ${source.id} after 25ms`,
        )

        await fetchStarted
        await vi.advanceTimersByTimeAsync(25)
        await rejection

        expect(signal?.aborted).toBe(true)
        await expect(readdir(cacheDir)).resolves.toEqual([])
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test('times out a stalled response body and leaves no partial cache file', async () => {
    const source = sourceFor('body-timeout.csv', Buffer.from('verified snapshot'))
    vi.useFakeTimers()

    try {
      await withTemporaryCache(async (cacheDir) => {
        let signal: AbortSignal | null | undefined
        let markBodyStarted!: () => void
        const bodyStarted = new Promise<void>((resolve) => {
          markBodyStarted = resolve
        })
        const response = {
          ok: true,
          status: 200,
          arrayBuffer: () => {
            markBodyStarted()
            return new Promise<ArrayBuffer>(() => undefined)
          },
        } as Response
        const pending = fetchContentSources(
          async (_url, init) => {
            signal = init?.signal
            return response
          },
          [source],
          cacheDir,
          25,
        )
        const rejection = expect(pending).rejects.toThrow(
          `Download timed out for ${source.id} after 25ms`,
        )

        await bodyStarted
        await vi.advanceTimersByTimeAsync(25)
        await rejection

        expect(signal?.aborted).toBe(true)
        await expect(readdir(cacheDir)).resolves.toEqual([])
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test('reports whether each cached snapshot is present and hash verified', async () => {
    const body = Buffer.from('verified snapshot')
    const source = sourceFor('report.csv', body)

    await withTemporaryCache(async (cacheDir) => {
      await expect(inspectContentSourceCaches([source], cacheDir)).resolves.toEqual([
        expect.objectContaining({ cachePresent: false, source, verified: false }),
      ])

      await writeFile(join(cacheDir, source.cacheFile), body)
      await expect(inspectContentSourceCaches([source], cacheDir)).resolves.toEqual([
        expect.objectContaining({ cachePresent: true, source, verified: true }),
      ])

      await writeFile(join(cacheDir, source.cacheFile), 'tampered snapshot')
      await expect(inspectContentSourceCaches([source], cacheDir)).resolves.toEqual([
        expect.objectContaining({
          cachePresent: true,
          source,
          verificationError: expect.stringContaining('SHA-256 mismatch'),
          verified: false,
        }),
      ])
    })
  })

  test('requires every requested cache to match its pinned digest before a build', async () => {
    const body = Buffer.from('verified snapshot')
    const source = sourceFor('preflight.csv', body)

    await withTemporaryCache(async (cacheDir) => {
      const cacheFile = join(cacheDir, source.cacheFile)
      await writeFile(cacheFile, body)
      await expect(requireVerifiedContentSourceCaches(
        [source.id],
        cacheDir,
        [source],
      )).resolves.toBeUndefined()

      await writeFile(cacheFile, 'tampered snapshot')
      await expect(requireVerifiedContentSourceCaches(
        [source.id],
        cacheDir,
        [source],
      )).rejects.toThrow('Content source cache preflight failed')
    })
  })
})
