import type { Difficulty, Level } from '../content/types'

export interface WordMastery {
  attempts: number
  correct: number
  wrong: number
  correctStreak: number
  wrongStreak: number
}

export interface MistakeRecord {
  wrongCount: number
  wrongStreak: number
  priorityRemaining: number
  reviewPending?: true
  reviewSpacingRemaining?: number
  penaltyWeight?: number
  nextBoost?: number
  cooldownAt?: number
  linkedLevel?: Level
  priorityInsertedAt?: number | null
}

export interface DifficultyStats {
  attempts: number
  correct: number
}

export type LevelDifficultyStats = Record<Difficulty, DifficultyStats>

export type DifficultyStatsByLevel = Record<Level, LevelDifficultyStats>

export interface LevelStudyAnalytics {
  selectedDifficulty: Record<Difficulty, number>
  exposedDifficulty: Record<Difficulty, number>
  wrongReexposures: Record<string, number>
}

export type StudyAnalytics = Record<Level, LevelStudyAnalytics>

export interface AttemptResult {
  correct: boolean
}
