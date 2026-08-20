import {
  DIFFICULTIES,
  GRAMMAR_LEVELS,
  LEVELS,
  type Difficulty,
  type GrammarLevel,
  type Level,
} from '../domain/content/types'
import type {
  DifficultyStatsByLevel,
  LevelStudyAnalytics,
  LevelDifficultyStats,
  MistakeRecord,
  StudyAnalytics,
  WordMastery,
} from '../domain/progress/types'
import {
  createEmptyTrackingState,
  type TrackingState,
} from '../domain/progress/tracking'
import type { GrammarMastery } from '../domain/grammar/mastery'
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
  schemaVersion: 7
  navigation: NavigationState
  mastery: Record<string, WordMastery>
  grammarMastery: Record<string, GrammarMastery>
  mistakes: Record<string, MistakeRecord>
  studySessions: Partial<Record<Level, StudySessionSnapshot>>
  difficultyStats: DifficultyStatsByLevel
  studyAnalytics: StudyAnalytics
  quizHistory: QuizSessionSummary[]
  tracking: TrackingState
}

export function createEmptyLevelDifficultyStats(): LevelDifficultyStats {
  return Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [difficulty, { attempts: 0, correct: 0 }]),
  ) as LevelDifficultyStats
}

export function createEmptyDifficultyStatsByLevel(): DifficultyStatsByLevel {
  return Object.fromEntries(
    LEVELS.map((level) => [level, createEmptyLevelDifficultyStats()]),
  ) as DifficultyStatsByLevel
}

function emptyDifficultyCounters(): Record<Difficulty, number> {
  return Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [difficulty, 0]),
  ) as Record<Difficulty, number>
}

export function createEmptyLevelStudyAnalytics(): LevelStudyAnalytics {
  return {
    selectedDifficulty: emptyDifficultyCounters(),
    exposedDifficulty: emptyDifficultyCounters(),
    wrongReexposures: {},
  }
}

export function createEmptyStudyAnalytics(): StudyAnalytics {
  return Object.fromEntries(
    LEVELS.map((level) => [level, createEmptyLevelStudyAnalytics()]),
  ) as StudyAnalytics
}

export function createInitialState(): AppState {
  return {
    schemaVersion: 7,
    navigation: {
      level: LEVELS[0],
      section: SECTIONS[0],
      grammarSection: GRAMMAR_SECTIONS[0],
      grammarNodeId: null,
      studyDifficulty: 'normal',
      quizType: 'en-ko',
    },
    mastery: {},
    grammarMastery: {},
    mistakes: {},
    studySessions: {},
    difficultyStats: createEmptyDifficultyStatsByLevel(),
    studyAnalytics: createEmptyStudyAnalytics(),
    quizHistory: [],
    tracking: createEmptyTrackingState(),
  }
}
