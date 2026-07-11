import type {
  AttemptResult,
  DifficultyStats,
  MistakeRecord,
  WordMastery,
} from './types'

const SINGLE_WRONG_BOOST = 0.15
const STREAK_WRONG_BOOST = 0.3
const LOW_ACCURACY_THRESHOLD = 0.6
const LOW_ACCURACY_BOOST = 0.1

export function emptyMastery(): WordMastery {
  return {
    attempts: 0,
    correct: 0,
    wrong: 0,
    correctStreak: 0,
    wrongStreak: 0,
  }
}

export function recordAttempt(
  mastery: WordMastery,
  attempt: AttemptResult,
): WordMastery {
  if (attempt.correct) {
    return {
      ...mastery,
      attempts: mastery.attempts + 1,
      correct: mastery.correct + 1,
      correctStreak: mastery.correctStreak + 1,
      wrongStreak: 0,
    }
  }

  return {
    ...mastery,
    attempts: mastery.attempts + 1,
    wrong: mastery.wrong + 1,
    correctStreak: 0,
    wrongStreak: mastery.wrongStreak + 1,
  }
}

export function isMastered(mastery: WordMastery): boolean {
  return (
    mastery.attempts >= 3 &&
    mastery.correct / mastery.attempts >= 0.8 &&
    mastery.wrongStreak === 0
  )
}

export function mistakeBoost(record?: MistakeRecord): number {
  if (!record) return 0
  if (record.wrongStreak >= 2) return STREAK_WRONG_BOOST
  return record.wrongCount >= 1 ? SINGLE_WRONG_BOOST : 0
}

export function difficultyAccuracyBoost(stats?: DifficultyStats): number {
  if (!stats || stats.attempts === 0) return 0
  return stats.correct / stats.attempts < LOW_ACCURACY_THRESHOLD
    ? LOW_ACCURACY_BOOST
    : 0
}
