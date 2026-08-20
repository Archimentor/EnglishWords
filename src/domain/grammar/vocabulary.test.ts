import { describe, expect, it } from 'vitest'

import type { GrammarNode } from '../content/types'
import { makeWord } from '../../test/fixtures'
import { emptyGrammarMastery } from './mastery'
import { grammarProductionConstraintsForLevel } from './productionConstraints'
import {
  grammarReviewItemIds,
  grammarVocabularyText,
  relatedGrammarWords,
} from './vocabulary'

const node = {
  id: 'A1-G01',
  level: 'A1',
  title: '문장뼈대',
  prerequisite: null,
  difficultyTag: 'core',
  canDo: ['문장을 만들 수 있다.'],
  summary: '기본 문장',
  rules: [],
  patterns: [],
  examples: [{ english: "Mina's cats play outside.", korean: '미나의 고양이들', difficulty: 'guided' }],
  exercises: [{
    id: 'A1-G01-diagnostic',
    phase: 'diagnostic',
    type: 'choice',
    prompt: 'Choose: The cat plays.',
    choices: ['The cat plays.', 'The cat play.'],
    answer: 'The cat plays.',
    explanation: 'plays를 쓴다.',
    errorCode: 'SV-01',
  }],
  productionTask: {
    prompt: '쓰기',
    requirements: ['요건'],
    rubric: ['기준'],
    constraints: grammarProductionConstraintsForLevel('A1'),
  },
  errorCodes: ['SV-01'],
  errorNotes: [{
    code: 'SV-01',
    title: '수일치',
    wrongExample: 'The cat play.',
    correction: 'The cat plays.',
    reviewRule: '복습한다.',
  }],
  masteryRule: { quizAccuracy: 0.8, productionPass: true, errorTolerance: 0.2 },
} satisfies GrammarNode

describe('grammar vocabulary links', () => {
  it('finds catalog lemmas through inflected forms and keeps text order', () => {
    const cat = makeWord({
      id: 'word-cat', word: 'cat', lemma: 'cat',
      entryOverrides: { forms: ['cat', 'cats'] },
    })
    const play = makeWord({
      id: 'word-play', word: 'play', lemma: 'play',
      entryOverrides: { forms: { base: 'play', s3: 'plays', past: 'played' } },
    })

    expect(relatedGrammarWords(node, [play, cat]).map(({ lemma }) => lemma))
      .toEqual(['cat', 'play'])
  })

  it('does not use substrings or proper names as fabricated catalog links', () => {
    const at = makeWord({
      id: 'word-at', word: 'at', lemma: 'at', entryOverrides: { forms: ['at'] },
    })
    expect(relatedGrammarWords(node, [at])).toEqual([])
    expect(grammarVocabularyText(node)).toContain("Mina's cats play outside.")
  })

  it('honors a bounded result limit and rejects invalid limits', () => {
    const cat = makeWord({
      id: 'word-cat', word: 'cat', lemma: 'cat',
      entryOverrides: { forms: ['cat', 'cats'] },
    })
    expect(relatedGrammarWords(node, [cat], 0)).toEqual([])
    expect(() => relatedGrammarWords(node, [cat], -1)).toThrow(RangeError)
  })

  it('maps weak and focus-review grammar nodes to deterministic catalog item ids', () => {
    const cat = makeWord({
      id: 'word-cat', word: 'cat', lemma: 'cat',
      entryOverrides: { forms: ['cat', 'cats'] },
    })
    const play = makeWord({
      id: 'word-play', word: 'play', lemma: 'play',
      entryOverrides: { forms: ['play', 'plays'] },
    })
    const prerequisite = { ...node, id: 'A1-G00', prerequisite: null }
    const focusNode = { ...node, id: 'A1-G01', prerequisite: 'A1-G00' }
    const weak = {
      ...emptyGrammarMastery(),
      attempts: 2,
      correct: 1,
      retryCount: 1,
    }
    const focus = {
      ...emptyGrammarMastery(),
      attempts: 2,
      mustReview: true,
      reviewRequirement: {
        nodeId: prerequisite.id,
        errorCode: 'SV-01',
        completed: false,
      },
    }

    expect([...grammarReviewItemIds(
      [focusNode, prerequisite],
      [play, cat],
      { [focusNode.id]: focus, [prerequisite.id]: weak },
    )].sort()).toEqual(['word-cat', 'word-play'])
  })

  it('ignores completed, unattempted, and stale grammar mastery', () => {
    const play = makeWord({
      id: 'word-play', word: 'play', lemma: 'play',
      entryOverrides: { forms: ['play', 'plays'] },
    })
    expect(grammarReviewItemIds([node], [play], {
      stale: { ...emptyGrammarMastery(), mustReview: true },
      [node.id]: emptyGrammarMastery(),
    }).size).toBe(0)

    expect(grammarReviewItemIds([node], [play], {
      [node.id]: {
        ...emptyGrammarMastery(), attempts: 1, correct: 0, completed: true,
      },
    }).size).toBe(0)
  })
})
