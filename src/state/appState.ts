import {
  DIFFICULTIES,
  GRAMMAR_LEVELS,
  LEVELS,
  type Difficulty,
  type GrammarLevel,
  type Level,
} from '../domain/content/types'
import type {
  DifficultyStats,
  MistakeRecord,
  WordMastery,
} from '../domain/progress/types'
import type { QuizSessionSummary, QuizType } from '../domain/quiz/types'

export const SECTIONS = ['대시보드', '소설', '단어장', '문법', '학습', '퀴즈'] as const
export type Section = (typeof SECTIONS)[number]

export const GRAMMAR_SECTIONS = ['대시보드', ...GRAMMAR_LEVELS] as const
export type GrammarSection = '대시보드' | GrammarLevel

export interface NavigationState {
  level: Level
  section: Section
  grammarSection: GrammarSection
  grammarNodeId: string | null
  studyDifficulty: Difficulty
  quizType: QuizType
}

export interface StudySessionSnapshot {
  queueIds: string[]
  currentIndex: number
}

export interface AppState {
  schemaVersion: 1
  navigation: NavigationState
  mastery: Record<string, WordMastery>
  mistakes: Record<string, MistakeRecord>
  studySessions: Partial<Record<Level, StudySessionSnapshot>>
  difficultyStats: Record<Difficulty, DifficultyStats>
  quizHistory: QuizSessionSummary[]
}

function emptyDifficultyStats(): Record<Difficulty, DifficultyStats> {
  return Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [difficulty, { attempts: 0, correct: 0 }]),
  ) as Record<Difficulty, DifficultyStats>
}

export function createInitialState(): AppState {
  return {
    schemaVersion: 1,
    navigation: {
      level: LEVELS[0],
      section: SECTIONS[0],
      grammarSection: GRAMMAR_SECTIONS[0],
      grammarNodeId: null,
      studyDifficulty: 'normal',
      quizType: 'en-ko',
    },
    mastery: {},
    mistakes: {},
    studySessions: {},
    difficultyStats: emptyDifficultyStats(),
    quizHistory: [],
  }
}
