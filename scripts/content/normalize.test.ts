import { describe, expect, test } from 'vitest'

import { normalizeWord, selectWords } from './normalize'
import {
  CURATED_WORD_FAMILY_OVERRIDES,
  EDITORIAL_WORD_FAMILY_OVERRIDES,
  SOURCE_VERIFIED_WORD_FAMILIES,
  buildCuratedWordFamilyIndex,
  wordFamilyFor,
} from '../../src/domain/content/wordFamilies'

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

  test('uses reviewed family overrides with exactly one head per derivational family', () => {
    const expectedFamilies = [
      ['write-family', 'write', ['write', 'writer', 'writing']],
      ['act-family', 'act', ['act', 'action', 'activity', 'actor', 'active']],
      ['create-family', 'create', ['create', 'creation', 'creative', 'creativity', 'creator']],
    ] as const

    expect(EDITORIAL_WORD_FAMILY_OVERRIDES.map(({ familyId, headLemma, members }) => [
      familyId,
      headLemma,
      [...members],
    ])).toEqual(expectedFamilies)

    for (const [familyId, headLemma, members] of expectedFamilies) {
      const words = members.map((lemma) => normalizeWord(candidate(lemma, '기초')))
      expect(new Set(words.map((word) => word.familyId))).toEqual(new Set([familyId]))
      expect(words.filter((word) => word.isFamilyHead).map((word) => word.lemma))
        .toEqual([headLemma])
    }
  })

  test('keeps source-verified families separate from maintainer-curated overrides', () => {
    expect(SOURCE_VERIFIED_WORD_FAMILIES.length).toBe(996)
    expect(CURATED_WORD_FAMILY_OVERRIDES).toHaveLength(999)
    expect(SOURCE_VERIFIED_WORD_FAMILIES.every(({ review }) =>
      review.status === 'source-verified'
      && review.sourceId === 'wordnet-3.0'
      && review.evidence.length > 0)).toBe(true)
    expect(EDITORIAL_WORD_FAMILY_OVERRIDES.every(({ review }) =>
      review.status === 'maintainer-curated')).toBe(true)
  })

  test('selects only curated family heads and backfills skipped derivatives', () => {
    const catalog = selectWords([
      { ...candidate('writer', '기초'), rank: 0 },
      { ...candidate('safe', '기초'), rank: 1 },
      { ...candidate('write', '기초'), rank: 2 },
      { ...candidate('action', '유치원'), rank: 0 },
      { ...candidate('activity', '유치원'), rank: 1 },
      { ...candidate('act', '유치원'), rank: 2 },
    ], { 기초: 2, 유치원: 1, 초등학교: 0, 중학교: 0 })

    expect(catalog.기초.map(({ lemma }) => lemma)).toEqual(['safe', 'write'])
    expect(catalog.유치원.map(({ lemma }) => lemma)).toEqual(['act'])
    expect(Object.values(catalog).flat().every(({ isFamilyHead }) => isFamilyHead)).toBe(true)
  })

  test('does not guess unreviewed families by suffix stripping', () => {
    for (const lemma of ['writerly', 'activate', 'creationism', 'activewear']) {
      expect(wordFamilyFor(lemma)).toEqual({
        familyId: `${lemma}-family`,
        headLemma: lemma,
        isFamilyHead: true,
        source: 'self-family',
      })
    }
  })

  test('fails closed when curated family evidence is internally inconsistent', () => {
    expect(() => buildCuratedWordFamilyIndex([{
      familyId: 'write-family',
      headLemma: 'write',
      members: ['writer', 'writer'],
      review: {
        status: 'maintainer-curated',
        rationale: 'invalid fixture',
      },
    }])).toThrow(/duplicate members|does not contain its head lemma/)

    expect(() => buildCuratedWordFamilyIndex([
      {
        familyId: 'write-family',
        headLemma: 'write',
        members: ['write', 'writer'],
        review: { status: 'maintainer-curated', rationale: 'fixture' },
      },
      {
        familyId: 'act-family',
        headLemma: 'act',
        members: ['act', 'writer'],
        review: { status: 'maintainer-curated', rationale: 'fixture' },
      },
    ])).toThrow('Curated word family member appears more than once: writer')
  })

  test('keeps one lemma globally when the same candidate appears in two levels', () => {
    const catalog = selectWords([
      { ...candidate('shared', '기초'), rank: 0 },
      candidate('basic-backfill', '기초'),
      { ...candidate('shared', '유치원'), rank: 0 },
      candidate('kindergarten-backfill', '유치원'),
    ], { 기초: 1, 유치원: 1, 초등학교: 0, 중학교: 0 })

    expect(Object.values(catalog).flat().map(({ lemma, level }) => ({ lemma, level }))).toEqual([
      { lemma: 'shared', level: '기초' },
      { lemma: 'kindergarten-backfill', level: '유치원' },
    ])
  })
})
