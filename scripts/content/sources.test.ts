import { describe, expect, test } from 'vitest'
import { CONTENT_CACHE_DIR, CONTENT_SOURCES, parseSha256 } from './sources'

describe('content sources', () => {
  test('pins a https URL, license, attribution, and sha256 for every source', () => {
    expect(CONTENT_SOURCES).toHaveLength(4)

    for (const source of CONTENT_SOURCES) {
      expect(source.url).toMatch(/^https:\/\//)
      expect(source.license).not.toHaveLength(0)
      expect(source.attribution).not.toHaveLength(0)
      expect(parseSha256(source.sha256)).toHaveLength(64)
    }
  })

  test('uses an ignored local directory for downloaded source snapshots', () => {
    expect(CONTENT_CACHE_DIR).toBe('.content-cache')
    expect(CONTENT_SOURCES.map((source) => source.cacheFile)).toEqual([
      'cefrj-vocabulary-profile-1.5.csv',
      'ko-extract.jsonl.gz',
      'word-freq-top5000.csv',
      'eng_sentences.tsv.bz2',
    ])
  })

  test('rejects a malformed SHA-256 digest', () => {
    expect(() => parseSha256('not-a-sha256')).toThrow('Invalid SHA-256')
  })
})
