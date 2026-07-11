import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import {
  buildEditorialGlossIndex,
  extractKoreanEntries,
  readEditorialGlossManifest,
  requireVerifiedCatalogCapacity,
  resolveKoreanMeanings,
  selectPhrasalVerbs,
} from './buildCatalog'

describe('source catalog construction', () => {
  test('extracts Korean meanings and IPA from an English Wiktionary page', () => {
    const entries = extractKoreanEntries(`
== 영어 ==
=== 명사 ===
* {{IPA|en|/kæt/}}
# [[고양이]]
`)

    expect(entries).toEqual([{ partOfSpeech: 'noun', meanings: ['고양이'], ipa: '/kæt/' }])
  })

  test('selects phrasals only with a Korean gloss, pronunciation, and two examples', () => {
    const selected = selectPhrasalVerbs([
      {
        phrase: 'look up',
        levelHint: '기초',
        meanings: ['찾아보다'],
        ipa: '/lʊk ʌp/',
        examples: ['Look up the word.', 'I look up the address.'],
      },
      {
        phrase: 'bad record',
        levelHint: '기초',
        meanings: [],
        ipa: '/bad/',
        examples: ['Bad record one.', 'Bad record two.'],
      },
    ], { 기초: 1, 유치원: 0, 초등학교: 0, 중학교: 0 })

    expect(selected.기초.map((item) => item.phrasalVerb)).toEqual(['look up'])
  })

  test('refuses to write a partial catalog when verified source capacity is short', () => {
    expect(() => requireVerifiedCatalogCapacity({
      words: { 기초: 1, 유치원: 0, 초등학교: 0, 중학교: 0 },
      phrasals: { 기초: 0, 유치원: 0, 초등학교: 0, 중학교: 0 },
    }, {
      wordQuotas: { 기초: 2, 유치원: 0, 초등학교: 0, 중학교: 0 },
      phrasalQuotas: { 기초: 0, 유치원: 0, 초등학교: 0, 중학교: 0 },
    })).toThrow('Verified word source capacity is insufficient for 기초: expected 2, found 1')
  })

  test('uses a traceable editorial Korean gloss only after Wiktionary has no gloss', () => {
    const editorial = buildEditorialGlossIndex([{
      term: 'look up',
      meaning: '찾아보다',
      sourceKind: 'editorial',
      reviewer: 'editorial-team',
      reviewDate: '2026-07-11',
      evidenceUrl: 'https://example.org/evidence/look-up',
    }])

    expect(resolveKoreanMeanings('look up', ['올려다보다'], editorial)).toEqual({
      sourceKind: 'wiktionary',
      meanings: ['올려다보다'],
    })
    expect(resolveKoreanMeanings('look up', [], editorial)).toEqual({
      sourceKind: 'editorial',
      meanings: ['찾아보다'],
    })
  })

  test('rejects untraceable or ambiguous editorial gloss records', () => {
    expect(() => buildEditorialGlossIndex([{
      term: 'look up',
      meaning: '찾아보다',
      sourceKind: 'editorial',
      reviewer: '',
      reviewDate: 'not-a-date',
      evidenceUrl: '',
    }])).toThrow('Editorial gloss for "look up" is missing reviewer')

    expect(() => buildEditorialGlossIndex([
      {
        term: 'look up', meaning: '찾아보다', sourceKind: 'editorial', reviewer: 'A',
        reviewDate: '2026-07-11', evidenceUrl: 'https://example.org/one',
      },
      {
        term: 'LOOK UP', meaning: '검색하다', sourceKind: 'editorial', reviewer: 'B',
        reviewDate: '2026-07-11', evidenceUrl: 'https://example.org/two',
      },
    ])).toThrow('Duplicate editorial gloss term: look up')
  })

  test('loads the structured editorial manifest through the same traceability gate', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wordmaster-editorial-'))
    const manifestPath = join(directory, 'glosses.json')
    try {
      await writeFile(manifestPath, JSON.stringify([{
        term: 'turn on',
        meaning: '켜다',
        sourceKind: 'editorial',
        reviewer: 'editorial-team',
        reviewDate: '2026-07-11',
        evidenceUrl: 'https://example.org/evidence/turn-on',
      }]))

      await expect(readEditorialGlossManifest(manifestPath)).resolves.toHaveProperty('size', 1)

      await writeFile(manifestPath, JSON.stringify({ term: 'not an array' }))
      await expect(readEditorialGlossManifest(manifestPath))
        .rejects.toThrow('Editorial gloss manifest must be a JSON array')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
