import { describe, expect, test } from 'vitest'

import { extractKoreanEntries, requireVerifiedCatalogCapacity, selectPhrasalVerbs } from './buildCatalog'

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
})
