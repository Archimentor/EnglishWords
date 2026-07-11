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
  verifySourceBuffer,
} from './fetchSources'

function sourceFor(cacheFile: string, body: Buffer): ContentSource {
  return {
    ...CONTENT_SOURCES[0],
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
  test('rejects a cached file whose digest differs from the pinned source', async () => {
    await expect(verifySourceBuffer(CONTENT_SOURCES[0], Buffer.from('tampered')))
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
})
