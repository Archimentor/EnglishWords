import type { Difficulty } from '../content/types'
import {
  difficultyAccuracyBoost,
  mistakeBoost,
} from '../progress/mastery'
import type { DifficultyStats, MistakeRecord } from '../progress/types'

export type DifficultyMatrix = {
  readonly [Selected in Difficulty]: {
    readonly [Item in Difficulty]: number
  }
}

export const DIFFICULTY_MATRIX: DifficultyMatrix = {
  veryEasy: {
    veryEasy: 0.45,
    easy: 0.3,
    normal: 0.2,
    hard: 0.04,
    veryHard: 0.01,
  },
  easy: {
    veryEasy: 0.25,
    easy: 0.35,
    normal: 0.25,
    hard: 0.1,
    veryHard: 0.05,
  },
  normal: {
    veryEasy: 0.1,
    easy: 0.25,
    normal: 0.4,
    hard: 0.15,
    veryHard: 0.1,
  },
  hard: {
    veryEasy: 0.05,
    easy: 0.15,
    normal: 0.3,
    hard: 0.3,
    veryHard: 0.2,
  },
  veryHard: {
    veryEasy: 0.02,
    easy: 0.08,
    normal: 0.2,
    hard: 0.35,
    veryHard: 0.35,
  },
}

export function difficultyWeight(
  selectedDifficulty: Difficulty,
  itemDifficulty: Difficulty,
  stats?: DifficultyStats,
  matrix: DifficultyMatrix = DIFFICULTY_MATRIX,
): number {
  return (
    matrix[selectedDifficulty][itemDifficulty] + difficultyAccuracyBoost(stats)
  )
}

export function reviewWeight(
  selectedDifficulty: Difficulty,
  itemDifficulty: Difficulty,
  stats?: DifficultyStats,
  mistake?: MistakeRecord,
  matrix: DifficultyMatrix = DIFFICULTY_MATRIX,
): number {
  return (
    difficultyWeight(selectedDifficulty, itemDifficulty, stats, matrix) +
    mistakeBoost(mistake)
  )
}
