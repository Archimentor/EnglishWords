import { describe, expect, test } from 'vitest'

import { normalizeWord, selectWords } from './normalize'

const candidate = (lemma: string, levelBucket: '기초' | '유치원' | '초등학교' | '중학교') => ({
  lemma,
  levelBucket,
  rank: 1,
  partOfSpeech: 'noun',
  meanings: ['뜻'],
  ipa: '/test/',
  forms: [lemma, `${lemma}s`],
  examples: [`A ${lemma} appears here.`, `That ${lemma} appears there.`],
})

describe('catalog normalization', () => {
  test('selects exact per-level quotas without duplicate lemmas', () => {
    const catalog = selectWords([
      candidate('one', '기초'),
      candidate('two', '기초'),
      candidate('three', '유치원'),
      candidate('four', '유치원'),
      candidate('five', '초등학교'),
      candidate('six', '초등학교'),
      candidate('seven', '초등학교'),
      candidate('eight', '중학교'),
      candidate('nine', '중학교'),
      candidate('ten', '중학교'),
    ], { 기초: 2, 유치원: 2, 초등학교: 3, 중학교: 3 })

    expect(Object.fromEntries(Object.entries(catalog).map(([level, words]) => [level, words.length])))
      .toEqual({ 기초: 2, 유치원: 2, 초등학교: 3, 중학교: 3 })
    expect(new Set(Object.values(catalog).flat().map((word) => word.lemma)).size).toBe(10)
  })

  test('rejects an entry missing Korean gloss, IPA, forms, or two examples', () => {
    expect(() => normalizeWord({
      ...candidate('plain', '기초'),
      meanings: [],
      ipa: '',
      forms: [],
      examples: ['Only one example.'],
    })).toThrow('plain is incomplete')
  })
})
