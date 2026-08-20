import type { StudyItem } from '../content/types'
import type { DifficultyStats, MistakeRecord } from '../progress/types'
import { QUIZ_TYPES, type QuizSessionSummary } from '../quiz/types'
import {
  DIFFICULTY_MATRIX,
  difficultyWeight,
  reviewWeight,
} from './difficulty'
import {
  auditStudyItemWeight,
  auditStudyQueueWeights,
  buildStudyQueue,
  buildStudyQueueWithAudit,
} from './queue'

const DAY_MS = 24 * 60 * 60 * 1_000

function makeStudyItems(count: number): StudyItem[] {
  const difficulties = ['veryEasy', 'easy', 'normal', 'hard', 'veryHard'] as const

  return Array.from({ length: count }, (_, index) => {
    const id = `w_${String(index).padStart(4, '0')}`
    const meanings = [`뜻 ${index}`]
    const examples = [`Example ${index}.`, `Another ${index}.`]
    return {
      id,
      kind: 'word',
      term: id,
      lemma: id,
      level: '기초',
      difficulty: difficulties[index % difficulties.length] ?? 'normal',
      partsOfSpeech: ['noun'],
      forms: [id],
      meanings,
      ipa: null,
      examples,
      entries: [{
        partOfSpeech: 'noun',
        forms: [id],
        meanings,
        ipa: '',
        examples,
      }],
    }
  })
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

function wrongQuizSummary(sourceItemId: string): QuizSessionSummary {
  return {
    score: 0,
    total: 1,
    accuracy: 0,
    typeStats: Object.fromEntries(
      QUIZ_TYPES.map((type) => [
        type,
        type === 'en-ko'
          ? { correct: 0, wrong: 1, total: 1, accuracy: 0 }
          : { correct: 0, wrong: 0, total: 0, accuracy: 0 },
      ]),
    ) as QuizSessionSummary['typeStats'],
    heatmap: [{
      questionId: `question-${sourceItemId}`,
      sourceItemId,
      type: 'en-ko',
      isCorrect: false,
    }],
    wrongItemIds: [sourceItemId],
  }
}

describe('difficultyWeight', () => {
  it('uses the documented 5 by 5 matrix', () => {
    expect(DIFFICULTY_MATRIX).toEqual({
      veryEasy: { veryEasy: 0.45, easy: 0.3, normal: 0.2, hard: 0.04, veryHard: 0.01 },
      easy: { veryEasy: 0.25, easy: 0.35, normal: 0.25, hard: 0.1, veryHard: 0.05 },
      normal: { veryEasy: 0.1, easy: 0.25, normal: 0.4, hard: 0.15, veryHard: 0.1 },
      hard: { veryEasy: 0.05, easy: 0.15, normal: 0.3, hard: 0.3, veryHard: 0.2 },
      veryHard: { veryEasy: 0.02, easy: 0.08, normal: 0.2, hard: 0.35, veryHard: 0.35 },
    })
    expect(difficultyWeight('normal', 'normal')).toBe(0.4)
    expect(difficultyWeight('veryEasy', 'veryHard')).toBe(0.01)
    expect(difficultyWeight('veryHard', 'hard')).toBe(0.35)
  })

  it('adds group and mistake boosts and accepts an injected matrix', () => {
    const matrix = {
      ...DIFFICULTY_MATRIX,
      normal: { ...DIFFICULTY_MATRIX.normal, hard: 0.5 },
    }

    expect(
      reviewWeight(
        'normal',
        'hard',
        { attempts: 5, correct: 2 },
        { wrongCount: 2, wrongStreak: 2, priorityRemaining: 3 },
        matrix,
      ),
    ).toBeCloseTo(0.9)
  })
})

describe('buildStudyQueue', () => {
  it('exposes every exposure component and the exact total used by sampling', () => {
    const item = makeStudyItems(3)[2]!
    const now = 10 * DAY_MS
    const audit = auditStudyItemWeight(item, {
      selectedDifficulty: 'normal',
      now,
      difficultyStats: {
        normal: { attempts: 10, correct: 3 },
      },
      mistakes: {
        [item.id]: {
          wrongCount: 1,
          wrongStreak: 1,
          priorityRemaining: 0,
          penaltyWeight: 0.15,
          nextBoost: 0.3,
          cooldownAt: now + DAY_MS,
        },
      },
      quizHistory: [wrongQuizSummary(item.id)],
      itemSchedule: {
        [item.id]: {
          kind: 'word',
          level: '기초',
          ease: 2,
          lastSeenAt: now - 2 * DAY_MS,
          nextDueAt: now - 2 * DAY_MS,
          weight: 1,
          lastLevel: '기초',
        },
      },
      mastery: {
        [item.id]: {
          attempts: 4,
          correct: 1,
          wrong: 3,
          correctStreak: 0,
          wrongStreak: 1,
        },
      },
      grammarReviewItemIds: new Set([item.id]),
    })

    expect(audit).toMatchObject({ itemId: item.id, overdue: true })
    expect(audit.components).toEqual({
      difficultyBase: 0.4,
      lowAccuracyBoost: 0.1,
      mistakeBoost: 0.15,
      recentWrongBoost: 0.03,
      scheduleBoost: expect.closeTo(0.23),
      masteryBoost: expect.closeTo(0.1375),
      grammarBoost: 0.12,
    })
    expect(audit.total).toBeCloseTo(1.1675)
    expect(audit.total).toBeCloseTo(
      Object.values(audit.components).reduce((sum, component) => sum + component, 0),
    )
  })

  it('uses ease, last-seen time, due time, and stored schedule weight independently', () => {
    const item = makeStudyItems(3)[2]!
    const now = 20 * DAY_MS
    const baseSchedule = {
      kind: 'word' as const,
      level: '기초' as const,
      ease: 2.5,
      lastSeenAt: now - 2 * DAY_MS,
      nextDueAt: now + 7 * DAY_MS,
      weight: 0,
      lastLevel: '기초' as const,
    }
    const weightFor = (schedule: typeof baseSchedule) => auditStudyItemWeight(item, {
      selectedDifficulty: 'normal',
      now,
      itemSchedule: { [item.id]: schedule },
    }).components.scheduleBoost
    const base = weightFor(baseSchedule)

    expect(weightFor({ ...baseSchedule, ease: 1.3 })).toBeGreaterThan(base)
    expect(weightFor({ ...baseSchedule, lastSeenAt: now })).toBeLessThan(base)
    expect(weightFor({ ...baseSchedule, nextDueAt: now - DAY_MS })).toBeGreaterThan(base)
    expect(weightFor({ ...baseSchedule, weight: 2 })).toBeGreaterThan(base)
  })

  it('selects overdue, low-mastery, and grammar-review candidates with higher weights', () => {
    const source = makeStudyItems(3)[2]!
    const items = [source, { ...source, id: 'w_adaptive' }]
    const now = 30 * DAY_MS
    const queue = buildStudyQueue(items, {
      selectedDifficulty: 'normal',
      now,
      limit: 1,
      random: () => 0.5,
      itemSchedule: {
        [source.id]: {
          kind: 'word',
          level: '기초',
          ease: 3,
          lastSeenAt: now,
          nextDueAt: now + 7 * DAY_MS,
          weight: 0,
          lastLevel: '기초',
        },
        w_adaptive: {
          kind: 'word',
          level: '기초',
          ease: 1.5,
          lastSeenAt: now - 7 * DAY_MS,
          nextDueAt: now - 3 * DAY_MS,
          weight: 1,
          lastLevel: '기초',
        },
      },
      mastery: {
        [source.id]: {
          attempts: 10,
          correct: 10,
          wrong: 0,
          correctStreak: 5,
          wrongStreak: 0,
        },
        w_adaptive: {
          attempts: 4,
          correct: 1,
          wrong: 3,
          correctStreak: 0,
          wrongStreak: 1,
        },
      },
      grammarReviewItemIds: new Set(['w_adaptive']),
    })

    expect(queue.map(({ id }) => id)).toEqual(['w_adaptive'])
  })

  it('applies consecutive-correct decay while preserving a low-mastery boost', () => {
    const item = makeStudyItems(3)[2]!
    const low = auditStudyItemWeight(item, {
      selectedDifficulty: 'normal',
      mastery: {
        [item.id]: {
          attempts: 5,
          correct: 2,
          wrong: 3,
          correctStreak: 0,
          wrongStreak: 1,
        },
      },
    })
    const mastered = auditStudyItemWeight(item, {
      selectedDifficulty: 'normal',
      mastery: {
        [item.id]: {
          attempts: 10,
          correct: 10,
          wrong: 0,
          correctStreak: 99,
          wrongStreak: 0,
        },
      },
    })

    expect(low.components.masteryBoost).toBeGreaterThan(0)
    expect(mastered.components.masteryBoost).toBe(-0.125)
    expect(low.total).toBeGreaterThan(mastered.total)
  })

  it('keeps audits finite for invalid numbers and does not consume randomness', () => {
    const item = makeStudyItems(3)[2]!
    const random = vi.fn(() => 0.5)
    const audits = auditStudyQueueWeights([item, { ...item }], {
      selectedDifficulty: 'normal',
      now: 1_000,
      random,
      itemSchedule: {
        [item.id]: {
          kind: 'word',
          level: '기초',
          ease: Number.NaN,
          lastSeenAt: Number.POSITIVE_INFINITY,
          nextDueAt: Number.NEGATIVE_INFINITY,
          weight: Number.POSITIVE_INFINITY,
          lastLevel: '기초',
        },
      },
      mastery: {
        [item.id]: {
          attempts: Number.POSITIVE_INFINITY,
          correct: Number.NaN,
          wrong: Number.NaN,
          correctStreak: Number.POSITIVE_INFINITY,
          wrongStreak: Number.NaN,
        },
      },
    })

    expect(audits).toHaveLength(1)
    expect(Number.isFinite(audits[0]!.total)).toBe(true)
    expect(Object.values(audits[0]!.components).every(Number.isFinite)).toBe(true)
    expect(random).not.toHaveBeenCalled()
  })

  it('returns every unique candidate once when the pool is below the limit', () => {
    const items = [...makeStudyItems(8), makeStudyItems(8)[0]!]
    const queue = buildStudyQueue(items, {
      selectedDifficulty: 'normal',
      random: seededRandom(2),
    })

    expect(queue).toHaveLength(8)
    expect(new Set(queue.map(({ id }) => id)).size).toBe(8)
  })

  it('places an active streak mistake once within the first three slots', () => {
    const mistakes: Record<string, MistakeRecord> = {
      w_0010: { wrongCount: 2, wrongStreak: 2, priorityRemaining: 3 },
    }
    const queue = buildStudyQueue(makeStudyItems(20), {
      selectedDifficulty: 'normal',
      mistakes,
      limit: 20,
      random: seededRandom(7),
    })

    expect(queue.slice(0, 3).map(({ id }) => id)).toContain('w_0010')
    expect(queue.filter(({ id }) => id === 'w_0010')).toHaveLength(1)
    expect(new Set(queue.map(({ id }) => id)).size).toBe(queue.length)
  })

  it('includes a forced priority item even when its weighted key is below the limit', () => {
    let call = 0
    const queue = buildStudyQueue(makeStudyItems(20), {
      selectedDifficulty: 'normal',
      mistakes: {
        w_0019: { wrongCount: 2, wrongStreak: 2, priorityRemaining: 1 },
      },
      limit: 5,
      random: () => (call++ === 19 ? 0 : 0.9),
    })

    expect(queue).toHaveLength(5)
    expect(queue[0]?.id).toBe('w_0019')
    expect(new Set(queue.map(({ id }) => id)).size).toBe(5)
  })

  it('does not force expired priority records into the priority window', () => {
    let call = 0
    const random = () => (call++ === 9 ? 0 : 0.5)
    const queue = buildStudyQueue(makeStudyItems(10), {
      selectedDifficulty: 'normal',
      mistakes: {
        w_0009: { wrongCount: 2, wrongStreak: 2, priorityRemaining: 0 },
      },
      limit: 10,
      random,
    })

    expect(queue.slice(0, 3).map(({ id }) => id)).not.toContain('w_0009')
  })

  it('preserves weighted order among at most three forced priority items', () => {
    const queue = buildStudyQueue(makeStudyItems(8), {
      selectedDifficulty: 'normal',
      mistakes: {
        w_0000: { wrongCount: 2, wrongStreak: 2, priorityRemaining: 1 },
        w_0001: { wrongCount: 2, wrongStreak: 2, priorityRemaining: 1 },
        w_0002: { wrongCount: 2, wrongStreak: 2, priorityRemaining: 1 },
        w_0003: { wrongCount: 2, wrongStreak: 2, priorityRemaining: 1 },
      },
      random: () => 0.5,
    })

    expect(queue.slice(0, 3).map(({ id }) => id)).toEqual([
      'w_0002',
      'w_0001',
      'w_0003',
    ])
    expect(queue.filter(({ id }) => id === 'w_0000')).toHaveLength(1)
  })

  it('uses the latest seven quiz histories to re-expose a recent wrong answer after one spacing slot', () => {
    const items = makeStudyItems(10).map((item) => ({
      ...item,
      difficulty: 'normal' as const,
    }))
    let call = 0
    const queue = buildStudyQueue(items, {
      selectedDifficulty: 'normal',
      quizHistory: [
        wrongQuizSummary('w_0008'),
        wrongQuizSummary('w_0009'),
      ],
      mistakes: {
        w_0008: {
          wrongCount: 1,
          wrongStreak: 1,
          priorityRemaining: 0,
          reviewPending: true,
          reviewSpacingRemaining: 0,
        },
        w_0009: {
          wrongCount: 1,
          wrongStreak: 1,
          priorityRemaining: 0,
          reviewPending: true,
          reviewSpacingRemaining: 1,
        },
      },
      limit: 5,
      random: () => (call++ >= 8 ? 0 : 0.9),
    })

    expect(queue[0]?.id).toBe('w_0008')
    expect(queue[1]?.id).toBe('w_0009')
    expect(queue.map(({ id }) => id)).toContain('w_0008')
  })

  it('drops recent-history weighting as soon as a correct answer resolves the mistake', () => {
    const items = makeStudyItems(10).map((item) => ({
      ...item,
      difficulty: 'normal' as const,
    }))
    const queue = buildStudyQueue(items, {
      selectedDifficulty: 'normal',
      mistakes: {},
      quizHistory: [wrongQuizSummary('w_0009')],
      limit: 1,
      random: () => 0.5,
    })

    expect(queue[0]?.id).toBe('w_0000')
  })

  it('includes every feasible pending review instead of repeatedly selecting only a top subset', () => {
    const items = makeStudyItems(12).map((item) => ({
      ...item,
      difficulty: 'normal' as const,
    }))
    const mistakes = Object.fromEntries(
      items.slice(0, 10).map((item, index) => [
        item.id,
        {
          wrongCount: 1,
          wrongStreak: 1,
          priorityRemaining: 0,
          reviewPending: true as const,
          reviewSpacingRemaining: index === 9 ? 1 : 0,
        },
      ]),
    )

    const queue = buildStudyQueue(items, {
      selectedDifficulty: 'normal',
      mistakes,
      limit: 11,
      random: () => 0.5,
    })

    expect(queue).toHaveLength(11)
    expect(queue[0]?.id).not.toBe('w_0009')
    expect(queue.map(({ id }) => id)).toEqual(
      expect.arrayContaining(items.slice(0, 10).map(({ id }) => id)),
    )
  })

  it('does not bypass spacing when a pending item is also in the priority window', () => {
    let call = 0
    const queue = buildStudyQueue(makeStudyItems(20), {
      selectedDifficulty: 'normal',
      mistakes: {
        w_0019: {
          wrongCount: 2,
          wrongStreak: 2,
          priorityRemaining: 3,
          reviewPending: true,
          reviewSpacingRemaining: 1,
        },
      },
      limit: 5,
      random: () => (call++ === 19 ? 0 : 0.9),
    })

    expect(queue[0]?.id).not.toBe('w_0019')
    expect(queue[1]?.id).toBe('w_0019')
  })

  it('returns no card when the only candidate still needs a distinct spacing slot', () => {
    const item = makeStudyItems(1)[0]!
    const queue = buildStudyQueue([item], {
      selectedDifficulty: 'normal',
      mistakes: {
        [item.id]: {
          wrongCount: 1,
          wrongStreak: 1,
          priorityRemaining: 0,
          reviewPending: true,
          reviewSpacingRemaining: 1,
        },
      },
      random: () => 0.5,
    })

    expect(queue).toEqual([])
  })

  it('captures every candidate, final order, per-item weights, and strict spacing audit', () => {
    const items = makeStudyItems(3)
    const result = buildStudyQueueWithAudit(items, {
      selectedDifficulty: 'normal',
      limit: 2,
      random: () => 0.5,
    })

    expect(result.candidateItemIds).toEqual(items.map(({ id }) => id))
    expect(result.orderedItemIds).toEqual(result.items.map(({ id }) => id))
    expect(result.orderedItemIds).toHaveLength(2)
    expect(result.itemWeightAudits.map(({ itemId }) => itemId)).toEqual(
      result.candidateItemIds,
    )
    expect(result.itemWeightAudits.every(({ total }) => total > 0)).toBe(true)
    expect(result.spacing).toEqual({
      minimumDistinctItems: 1,
      exceptionPolicy: 'strict',
      exceptionApplied: false,
      blockedItemIds: [],
    })
  })

  it('surfaces a spacing-blocked card only under the audited exam-density policy', () => {
    const item = makeStudyItems(1)[0]!
    const result = buildStudyQueueWithAudit([item], {
      selectedDifficulty: 'normal',
      mistakes: {
        [item.id]: {
          wrongCount: 1,
          wrongStreak: 1,
          priorityRemaining: 0,
          reviewPending: true,
          reviewSpacingRemaining: 1,
        },
      },
      spacingPolicy: {
        minimumDistinctItems: 1,
        exceptionPolicy: 'exam-density',
      },
      random: () => 0.5,
    })

    expect(result.orderedItemIds).toEqual([item.id])
    expect(result.spacing).toEqual({
      minimumDistinctItems: 1,
      exceptionPolicy: 'exam-density',
      exceptionApplied: true,
      blockedItemIds: [item.id],
    })
  })

  it('ignores quiz patterns older than the latest seven sessions', () => {
    const items = makeStudyItems(10).map((item) => ({
      ...item,
      difficulty: 'normal' as const,
    }))
    let call = 0
    const queue = buildStudyQueue(items, {
      selectedDifficulty: 'normal',
      quizHistory: [
        wrongQuizSummary('w_0009'),
        ...Array.from({ length: 7 }, (_, index) => wrongQuizSummary(`w_000${index}`)),
      ],
      limit: 5,
      random: () => (call++ === 9 ? 0 : 0.9),
    })

    expect(queue.map(({ id }) => id)).not.toContain('w_0009')
  })

  it('adds low-accuracy group boost to an item weighting', () => {
    const difficultyStats: Partial<Record<StudyItem['difficulty'], DifficultyStats>> = {
      hard: { attempts: 5, correct: 2 },
      normal: { attempts: 5, correct: 3 },
    }
    const items = makeStudyItems(5)
    const hard = items.find(({ difficulty }) => difficulty === 'hard')!
    const normal = items.find(({ difficulty }) => difficulty === 'normal')!

    expect(
      difficultyWeight('normal', hard.difficulty, difficultyStats[hard.difficulty]),
    ).toBe(0.25)
    expect(
      difficultyWeight('normal', normal.difficulty, difficultyStats[normal.difficulty]),
    ).toBe(0.4)
  })

  it('returns exactly 500 unique items from 600 candidates', () => {
    const queue = buildStudyQueue(makeStudyItems(600), {
      selectedDifficulty: 'normal',
      random: seededRandom(11),
    })

    expect(queue).toHaveLength(500)
    expect(new Set(queue.map(({ id }) => id)).size).toBe(500)
  })

  it('matches full weighted ordering without sorting more than the output bound', () => {
    const limit = 37
    const items = makeStudyItems(5_000).map((item) => ({
      ...item,
      difficulty: 'normal' as const,
    }))
    const expectedRandom = seededRandom(41)
    const randomValues = items.map(() => expectedRandom())
    const expectedIds = items
      .map((item, order) => ({ item, order, value: randomValues[order]! }))
      .sort((left, right) => right.value - left.value || left.order - right.order)
      .slice(0, limit)
      .map(({ item }) => item.id)
    let randomIndex = 0
    const sortSpy = vi.spyOn(Array.prototype, 'sort')
    const { queue, sortedSizes } = (() => {
      try {
        const selected = buildStudyQueue(items, {
          selectedDifficulty: 'normal',
          limit,
          random: () => randomValues[randomIndex++]!,
        })
        const sizes = sortSpy.mock.contexts
          .filter((context): context is unknown[] => Array.isArray(context))
          .map(({ length }) => length)
        return { queue: selected, sortedSizes: sizes }
      } finally {
        sortSpy.mockRestore()
      }
    })()

    expect(queue.map(({ id }) => id)).toEqual(expectedIds)
    expect(Math.max(0, ...sortedSizes)).toBeLessThanOrEqual(limit)
  })

  it('is deterministic when supplied the same random sequence', () => {
    const first = buildStudyQueue(makeStudyItems(30), {
      selectedDifficulty: 'hard',
      limit: 12,
      random: seededRandom(17),
    })
    const second = buildStudyQueue(makeStudyItems(30), {
      selectedDifficulty: 'hard',
      limit: 12,
      random: seededRandom(17),
    })

    expect(second.map(({ id }) => id)).toEqual(first.map(({ id }) => id))
  })

  it('keeps the first candidate for duplicate IDs and does not mutate input', () => {
    const items = makeStudyItems(6)
    const snapshot = items.slice()
    const duplicate = { ...items[0]!, term: 'replacement' }

    const queue = buildStudyQueue([...items, duplicate], {
      selectedDifficulty: 'normal',
      random: seededRandom(3),
    })

    expect(queue.find(({ id }) => id === duplicate.id)?.term).toBe(items[0]!.term)
    expect(items).toEqual(snapshot)
  })
})
