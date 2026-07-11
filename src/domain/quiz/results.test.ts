import { summarizeQuiz } from './results'
import type { GradedAnswer } from './types'

const ANSWERS: GradedAnswer[] = [
  {
    questionId: 'q1',
    sourceItemId: 'word-play',
    type: 'en-ko',
    answer: '놀다',
    correctAnswer: '놀다',
    isCorrect: true,
  },
  {
    questionId: 'q2',
    sourceItemId: 'word-book',
    type: 'en-ko',
    answer: '사과',
    correctAnswer: '책',
    isCorrect: false,
  },
  {
    questionId: 'q3',
    sourceItemId: 'word-book',
    type: 'dictation',
    answer: 'bok',
    correctAnswer: 'book',
    isCorrect: false,
  },
]

describe('summarizeQuiz', () => {
  it('summarizes score, accuracy, every type, heatmap, and unique wrong items', () => {
    const result = summarizeQuiz(ANSWERS)

    expect(result).toMatchObject({
      score: 1,
      total: 3,
      accuracy: 1 / 3,
      wrongItemIds: ['word-book'],
    })
    expect(result.typeStats['en-ko']).toEqual({
      correct: 1,
      wrong: 1,
      total: 2,
      accuracy: 0.5,
    })
    expect(result.typeStats.dictation).toEqual({
      correct: 0,
      wrong: 1,
      total: 1,
      accuracy: 0,
    })
    expect(result.typeStats['ko-en']).toEqual({
      correct: 0,
      wrong: 0,
      total: 0,
      accuracy: 0,
    })
    expect(result.heatmap).toEqual(
      ANSWERS.map(({ questionId, sourceItemId, type, isCorrect }) => ({
        questionId,
        sourceItemId,
        type,
        isCorrect,
      })),
    )
  })

  it('returns finite zero values for an empty session', () => {
    const result = summarizeQuiz([])

    expect(result).toMatchObject({ score: 0, total: 0, accuracy: 0, wrongItemIds: [] })
    expect(Number.isNaN(result.accuracy)).toBe(false)
    expect(Object.values(result.typeStats).every(({ accuracy }) => accuracy === 0)).toBe(true)
  })

  it('does not mutate the graded answers', () => {
    const snapshot = structuredClone(ANSWERS)

    summarizeQuiz(ANSWERS)

    expect(ANSWERS).toEqual(snapshot)
  })
})
