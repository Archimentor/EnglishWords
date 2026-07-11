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
}

export interface DifficultyStats {
  attempts: number
  correct: number
}

export interface AttemptResult {
  correct: boolean
}
