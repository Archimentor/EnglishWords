import { LEVELS, type Difficulty, type GrammarLevel, type Level } from '../domain/content/types'
import { emptyMastery, recordAttempt } from '../domain/progress/mastery'
import type { MistakeRecord, WordMastery } from '../domain/progress/types'
import type { QuizSessionSummary, QuizType } from '../domain/quiz/types'
import type {
  AppState,
  GrammarSection,
  Section,
  StudySessionSnapshot,
} from './appState'

export type PrimarySelection = Level | '문법' | '학습' | '퀴즈'
export type LevelContextSection = Extract<Section, '대시보드' | '소설' | '단어장'>

export interface QuizAttemptForState {
  sourceItemId: string
  difficulty: Difficulty
  isCorrect: boolean
}

export type AppAction =
  | { type: 'SELECT_PRIMARY'; primary: PrimarySelection }
  | { type: 'SELECT_LEVEL'; level: Level }
  | { type: 'SELECT_CONTEXT'; section: LevelContextSection }
  | { type: 'SELECT_GRAMMAR_LEVEL'; grammarSection: GrammarSection }
  | {
      type: 'SELECT_GRAMMAR_NODE'
      grammarSection: GrammarLevel
      nodeId: string
    }
  | { type: 'SET_DIFFICULTY'; difficulty: Difficulty }
  | { type: 'SET_QUIZ_TYPE'; quizType: QuizType }
  | {
      type: 'SAVE_STUDY_SESSION'
      level: Level
      snapshot: StudySessionSnapshot
    }
  | { type: 'RECORD_STUDY'; itemId: string; correct: boolean }
  | {
      type: 'RECORD_QUIZ'
      summary: QuizSessionSummary
      attempts: readonly QuizAttemptForState[]
    }

interface LearningRecords {
  mastery: Record<string, WordMastery>
  mistakes: Record<string, MistakeRecord>
}

function updateLearningRecords(
  mastery: Record<string, WordMastery>,
  mistakes: Record<string, MistakeRecord>,
  itemId: string,
  correct: boolean,
): LearningRecords {
  const nextMastery = {
    ...mastery,
    [itemId]: recordAttempt(mastery[itemId] ?? emptyMastery(), { correct }),
  }
  const nextMistakes = { ...mistakes }

  if (correct) {
    delete nextMistakes[itemId]
  } else {
    const previous = mistakes[itemId]
    const wrongStreak = (previous?.wrongStreak ?? 0) + 1
    nextMistakes[itemId] = {
      wrongCount: (previous?.wrongCount ?? 0) + 1,
      wrongStreak,
      priorityRemaining:
        wrongStreak >= 2 ? 3 : (previous?.priorityRemaining ?? 0),
    }
  }

  return { mastery: nextMastery, mistakes: nextMistakes }
}

function withNavigation(
  state: AppState,
  navigation: AppState['navigation'],
): AppState {
  if (
    navigation.level === state.navigation.level &&
    navigation.section === state.navigation.section &&
    navigation.grammarSection === state.navigation.grammarSection &&
    navigation.grammarNodeId === state.navigation.grammarNodeId &&
    navigation.studyDifficulty === state.navigation.studyDifficulty &&
    navigation.quizType === state.navigation.quizType
  ) {
    return state
  }

  return { ...state, navigation }
}

function isLevelPrimary(primary: PrimarySelection): primary is Level {
  return (LEVELS as readonly string[]).includes(primary)
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SELECT_PRIMARY': {
      if (isLevelPrimary(action.primary)) {
        return withNavigation(state, {
          ...state.navigation,
          level: action.primary,
          section: '대시보드',
        })
      }
      if (action.primary === '문법') {
        return withNavigation(state, {
          ...state.navigation,
          section: '문법',
          grammarSection: '대시보드',
          grammarNodeId: null,
        })
      }
      return withNavigation(state, {
        ...state.navigation,
        section: action.primary,
      })
    }
    case 'SELECT_LEVEL':
      return withNavigation(state, { ...state.navigation, level: action.level })
    case 'SELECT_CONTEXT':
      return withNavigation(state, {
        ...state.navigation,
        section: action.section,
      })
    case 'SELECT_GRAMMAR_LEVEL':
      return withNavigation(state, {
        ...state.navigation,
        section: '문법',
        grammarSection: action.grammarSection,
        grammarNodeId: null,
      })
    case 'SELECT_GRAMMAR_NODE':
      return withNavigation(state, {
        ...state.navigation,
        section: '문법',
        grammarSection: action.grammarSection,
        grammarNodeId: action.nodeId,
      })
    case 'SET_DIFFICULTY':
      return withNavigation(state, {
        ...state.navigation,
        studyDifficulty: action.difficulty,
      })
    case 'SET_QUIZ_TYPE':
      return withNavigation(state, {
        ...state.navigation,
        quizType: action.quizType,
      })
    case 'SAVE_STUDY_SESSION':
      return {
        ...state,
        studySessions: {
          ...state.studySessions,
          [action.level]: {
            queueIds: [...action.snapshot.queueIds],
            currentIndex: action.snapshot.currentIndex,
          },
        },
      }
    case 'RECORD_STUDY': {
      const records = updateLearningRecords(
        state.mastery,
        state.mistakes,
        action.itemId,
        action.correct,
      )
      return { ...state, ...records }
    }
    case 'RECORD_QUIZ': {
      let mastery = state.mastery
      let mistakes = state.mistakes
      let difficultyStats = state.difficultyStats

      for (const attempt of action.attempts) {
        const records = updateLearningRecords(
          mastery,
          mistakes,
          attempt.sourceItemId,
          attempt.isCorrect,
        )
        mastery = records.mastery
        mistakes = records.mistakes
        const previousStats = difficultyStats[attempt.difficulty]
        difficultyStats = {
          ...difficultyStats,
          [attempt.difficulty]: {
            attempts: previousStats.attempts + 1,
            correct: previousStats.correct + (attempt.isCorrect ? 1 : 0),
          },
        }
      }

      return {
        ...state,
        mastery,
        mistakes,
        difficultyStats,
        quizHistory: [...state.quizHistory, action.summary].slice(-7),
      }
    }
  }
}
