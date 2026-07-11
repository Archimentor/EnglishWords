import {
  difficultyAccuracyBoost,
  emptyMastery,
  isMastered,
  mistakeBoost,
  recordAttempt,
} from './mastery'

describe('word mastery', () => {
  it('marks three correct attempts as mastered', () => {
    const mastery = [
      { correct: true },
      { correct: true },
      { correct: true },
    ].reduce(recordAttempt, emptyMastery())

    expect(mastery).toMatchObject({
      attempts: 3,
      correct: 3,
      wrong: 0,
      correctStreak: 3,
      wrongStreak: 0,
    })
    expect(isMastered(mastery)).toBe(true)
  })

  it('requires at least three attempts, 80 percent accuracy, and no active wrong streak', () => {
    expect(isMastered({ ...emptyMastery(), attempts: 2, correct: 2 })).toBe(false)
    expect(
      isMastered({
        ...emptyMastery(),
        attempts: 5,
        correct: 3,
        wrong: 2,
      }),
    ).toBe(false)
    expect(
      isMastered({
        ...emptyMastery(),
        attempts: 5,
        correct: 4,
        wrong: 1,
        wrongStreak: 1,
      }),
    ).toBe(false)
    expect(
      isMastered({
        ...emptyMastery(),
        attempts: 5,
        correct: 4,
        wrong: 1,
        correctStreak: 1,
      }),
    ).toBe(true)
  })

  it('updates success and failure streaks without mutating the previous value', () => {
    const initial = emptyMastery()
    const wrong = recordAttempt(initial, { correct: false })
    const recovered = recordAttempt(wrong, { correct: true })

    expect(initial).toEqual(emptyMastery())
    expect(wrong).toMatchObject({
      attempts: 1,
      correct: 0,
      wrong: 1,
      correctStreak: 0,
      wrongStreak: 1,
    })
    expect(recovered).toMatchObject({
      attempts: 2,
      correct: 1,
      wrong: 1,
      correctStreak: 1,
      wrongStreak: 0,
    })
  })
})

describe('review boosts', () => {
  it('applies the documented single and streak mistake boosts', () => {
    expect(mistakeBoost()).toBe(0)
    expect(mistakeBoost({ wrongCount: 1, wrongStreak: 1, priorityRemaining: 0 })).toBe(0.15)
    expect(mistakeBoost({ wrongCount: 2, wrongStreak: 2, priorityRemaining: 3 })).toBe(0.3)
  })

  it('boosts only difficulty groups below 60 percent accuracy', () => {
    expect(difficultyAccuracyBoost()).toBe(0)
    expect(difficultyAccuracyBoost({ attempts: 0, correct: 0 })).toBe(0)
    expect(difficultyAccuracyBoost({ attempts: 5, correct: 2 })).toBe(0.1)
    expect(difficultyAccuracyBoost({ attempts: 5, correct: 3 })).toBe(0)
  })
})
