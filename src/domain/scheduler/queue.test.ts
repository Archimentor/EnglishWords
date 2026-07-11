import type { StudyItem } from '../content/types'
import type { DifficultyStats, MistakeRecord } from '../progress/types'
import {
  DIFFICULTY_MATRIX,
  difficultyWeight,
  reviewWeight,
} from './difficulty'
import { buildStudyQueue } from './queue'

function makeStudyItems(count: number): StudyItem[] {
  const difficulties = ['veryEasy', 'easy', 'normal', 'hard', 'veryHard'] as const

  return Array.from({ length: count }, (_, index) => {
    const id = `w_${String(index).padStart(4, '0')}`
    return {
      id,
      kind: 'word',
      term: id,
      lemma: id,
      level: '기초',
      difficulty: difficulties[index % difficulties.length] ?? 'normal',
      partsOfSpeech: ['noun'],
      forms: [id],
      meanings: [`뜻 ${index}`],
      ipa: null,
      examples: [`Example ${index}.`, `Another ${index}.`],
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
