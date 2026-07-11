import { describe, expect, test } from 'vitest'
import {
  CONTENT_CACHE_DIR,
  CONTENT_SOURCES,
  isImmutableSourceUrl,
  parseSha256,
} from './sources'

describe('content sources', () => {
  test('pins a https URL, license, attribution, and sha256 for every source', () => {
    expect(CONTENT_SOURCES).toHaveLength(5)

    for (const source of CONTENT_SOURCES) {
      expect(source.url).toMatch(/^https:\/\//)
      expect(source.license).not.toHaveLength(0)
      expect(source.attribution).not.toHaveLength(0)
      expect(parseSha256(source.sha256)).toHaveLength(64)
    }
  })

  test('pins an MIT-licensed IPA dictionary for pronunciation coverage', () => {
    expect(CONTENT_SOURCES).toContainEqual(expect.objectContaining({
      id: 'ipa-dict',
      url: 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/43c3570eb3553bdd19fccd2bd0091534889af023/data/en_US.txt',
      sha256: '2af6f154a5c363275f052d1f85acedef38ed185ca9745aa4314be77f6b70de67',
      license: 'MIT',
      attribution: 'open-dict-data/ipa-dict (MIT; third-party credit)',
      cacheFile: 'ipa-dict-en_US.txt',
    }))
  })

  test('uses an ignored local directory for downloaded source snapshots', () => {
    expect(CONTENT_CACHE_DIR).toBe('.content-cache')
    expect(CONTENT_SOURCES.map((source) => source.cacheFile)).toEqual([
      'cefrj-vocabulary-profile-1.5.csv',
      'kowiktionary-20260701-pages-articles.xml.bz2',
      'word-freq-top5000.csv',
      'opus-tatoeba-v2023-04-12-en.txt.gz',
      'ipa-dict-en_US.txt',
    ])
  })

  test('rejects a malformed SHA-256 digest', () => {
    expect(() => parseSha256('not-a-sha256')).toThrow('Invalid SHA-256')
  })

  test('uses immutable, content-addressed or versioned source URLs', () => {
    for (const source of CONTENT_SOURCES) {
      expect(isImmutableSourceUrl(source.url)).toBe(true)
    }
  })

  test('accepts only the supported immutable source URL formats', () => {
    expect(isImmutableSourceUrl(
      'https://raw.githubusercontent.com/example/repository/0123456789abcdef0123456789abcdef01234567/data.csv',
    )).toBe(true)
    expect(isImmutableSourceUrl(
      'https://dumps.wikimedia.org/kowiktionary/20260701/kowiktionary-20260701-pages-articles.xml.bz2',
    )).toBe(true)
    expect(isImmutableSourceUrl(
      'https://object.pouta.csc.fi/OPUS-Tatoeba/v2023-04-12/mono/en.txt.gz',
    )).toBe(true)
    expect(isImmutableSourceUrl(
      'https://raw.githubusercontent.com/example/repository/main/data.csv',
    )).toBe(false)
    expect(isImmutableSourceUrl(
      'https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2',
    )).toBe(false)
    expect(isImmutableSourceUrl(
      'https://dumps.wikimedia.org/kowiktionary/20260701/kowiktionary-20260601-pages-articles.xml.bz2',
    )).toBe(false)
  })
})
