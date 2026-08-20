import {
  LEVELS,
  type Difficulty,
  type GrammarLevel,
  type GrammarMasteryRule,
  type GrammarProductionTask,
  type Level,
} from '../domain/content/types'
import {
  emptyGrammarMastery,
  recordGrammarExercise,
  recordGrammarPrerequisiteReview,
  recordGrammarProduction,
  recordGrammarProductionReview,
  restartGrammarProductionCycle,
  type GrammarExerciseAttempt,
  type GrammarProductionSubmission,
} from '../domain/grammar/mastery'
import { emptyMastery, recordAttempt } from '../domain/progress/mastery'
import {
  recordGrammarAttemptTracking,
  isItemAttemptTrackingMetadataValid,
  isQuizAttemptTrackingMetadataValid,
  recordItemAttemptTracking,
  recordQueueTracking,
  recordQuizAttemptTracking,
  recordSessionTracking,
  type GrammarAttemptTrackingMetadata,
  type ItemAttemptTrackingMetadata,
  type QueueHistoryRecord,
  type QuizAttemptTrackingMetadata,
  type SessionHistoryRecord,
  type TrackingState,
} from '../domain/progress/tracking'
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
      tracking?: {
        queue?: QueueHistoryRecord
        session?: SessionHistoryRecord
      }
    }
  | {
      type: 'TRACK_STUDY_QUEUE'
      queue: QueueHistoryRecord
      session?: SessionHistoryRecord
    }
  | {
      type: 'ADVANCE_STUDY_SLOT'
      level: Level
      itemId: string
      selectedDifficulty: Difficulty
      itemDifficulty: Difficulty
      priorityItemIds: readonly string[]
    }
  | {
      type: 'RECORD_STUDY'
      itemId: string
      correct: boolean
      tracking?: ItemAttemptTrackingMetadata
    }
  | {
      type: 'RECORD_QUIZ_ATTEMPT'
      level: Level
      attempt: QuizAttemptForState
      tracking?: QuizAttemptTrackingMetadata
    }
  | {
      type: 'RECORD_QUIZ'
      summary: QuizSessionSummary
      tracking?: { session: SessionHistoryRecord }
    }
  | {
      type: 'RECORD_GRAMMAR_EXERCISE'
      nodeId: string
      attempt: GrammarExerciseAttempt
      masteryRule: GrammarMasteryRule
      tracking?: GrammarAttemptTrackingMetadata
    }
  | {
      type: 'RECORD_GRAMMAR_PREREQUISITE_REVIEW'
      nodeId: string
      reviewedNodeId: string
      masteryRule: GrammarMasteryRule
      tracking?: { session: SessionHistoryRecord }
    }
  | {
      type: 'SUBMIT_GRAMMAR_PRODUCTION'
      nodeId: string
      submission: GrammarProductionSubmission
      productionTask: GrammarProductionTask
      masteryRule: GrammarMasteryRule
      tracking?: { session: SessionHistoryRecord }
    }
  | {
      type: 'REVIEW_GRAMMAR_PRODUCTION'
      nodeId: string
      reviewChecks: boolean[]
      masteryRule: GrammarMasteryRule
      tracking?: { session: SessionHistoryRecord }
    }
  | {
      type: 'RESTART_GRAMMAR_PRODUCTION'
      nodeId: string
      productionTask: GrammarProductionTask
      masteryRule: GrammarMasteryRule
      tracking?: { session: SessionHistoryRecord }
    }

interface LearningRecords {
  mastery: Record<string, WordMastery>
  mistakes: Record<string, MistakeRecord>
}

function consumeStudySlot(
  mistakes: Record<string, MistakeRecord>,
  itemId: string,
  priorityItemIds: readonly string[],
): Record<string, MistakeRecord> {
  let changed = false
  const scheduledPriorityIds = new Set(priorityItemIds)
  const nextMistakes = Object.fromEntries(
    Object.entries(mistakes).map(([mistakeId, mistake]) => {
      const next = { ...mistake }
      let itemChanged = false

      if (scheduledPriorityIds.has(mistakeId) && next.priorityRemaining > 0) {
        next.priorityRemaining -= 1
        itemChanged = true
        changed = true
      }

      if (next.reviewPending) {
        const spacing = next.reviewSpacingRemaining ?? 0
        if (mistakeId === itemId && spacing === 0) {
          delete next.reviewPending
          delete next.reviewSpacingRemaining
          itemChanged = true
          changed = true
        } else if (spacing > 0) {
          next.reviewSpacingRemaining = spacing - 1
          itemChanged = true
          changed = true
        }
      }

      return [mistakeId, itemChanged ? next : mistake]
    }),
  )

  return changed ? nextMistakes : mistakes
}

function agePendingQuizReviews(
  mistakes: Record<string, MistakeRecord>,
): Record<string, MistakeRecord> {
  let changed = false
  const next = Object.fromEntries(Object.entries(mistakes).map(([itemId, mistake]) => {
    if (!mistake.reviewPending || (mistake.reviewSpacingRemaining ?? 0) === 0) {
      return [itemId, mistake]
    }
    changed = true
    return [itemId, { ...mistake, reviewSpacingRemaining: 0 }]
  }))
  return changed ? next : mistakes
}

function scheduleInterruptedQuizReview(
  mistakes: Record<string, MistakeRecord>,
  itemId: string,
): Record<string, MistakeRecord> {
  const previous = mistakes[itemId]
  if (!previous) return mistakes
  return {
    ...mistakes,
    [itemId]: {
      ...previous,
      reviewPending: true,
      reviewSpacingRemaining: 1,
    },
  }
}

function scheduleQuizReviews(
  mistakes: Record<string, MistakeRecord>,
  summary: QuizSessionSummary,
): Record<string, MistakeRecord> {
  const nextMistakes = Object.fromEntries(
    Object.entries(mistakes).map(([itemId, mistake]) => {
      if (!mistake.reviewPending || (mistake.reviewSpacingRemaining ?? 0) === 0) {
        return [itemId, mistake]
      }
      return [
        itemId,
        {
          ...mistake,
          reviewSpacingRemaining: Math.max(
            0,
            (mistake.reviewSpacingRemaining ?? 0) - summary.total,
          ),
        },
      ]
    }),
  )

  for (const itemId of summary.wrongItemIds) {
    const previous = nextMistakes[itemId]
    let lastQuestionIndex = -1
    for (let index = summary.heatmap.length - 1; index >= 0; index -= 1) {
      const entry = summary.heatmap[index]
      if (entry?.sourceItemId === itemId && !entry.isCorrect) {
        lastQuestionIndex = index
        break
      }
    }
    const questionsAfter = lastQuestionIndex < 0
      ? summary.total
      : summary.heatmap.length - lastQuestionIndex - 1
    nextMistakes[itemId] = {
      ...(previous ?? {
        wrongCount: 1,
        wrongStreak: 1,
        priorityRemaining: 0,
      }),
      reviewPending: true,
      reviewSpacingRemaining: Math.max(0, 1 - questionsAfter),
    }
  }

  return nextMistakes
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
      ...(previous ?? {}),
      wrongCount: (previous?.wrongCount ?? 0) + 1,
      wrongStreak,
      priorityRemaining:
        wrongStreak >= 2 ? 3 : (previous?.priorityRemaining ?? 0),
    }
  }

  return { mastery: nextMastery, mistakes: nextMistakes }
}

function enrichTrackedMistake(
  mistakes: Record<string, MistakeRecord>,
  itemId: string,
  correct: boolean,
  level: Level,
  metadata: ItemAttemptTrackingMetadata | undefined,
): Record<string, MistakeRecord> {
  if (correct || !metadata || !isItemAttemptTrackingMetadataValid(metadata)) return mistakes
  const current = mistakes[itemId]
  if (!current) return mistakes
  const priorityInsertedAt = current.wrongStreak >= 2
    ? current.priorityInsertedAt ?? metadata.occurredAt
    : null
  return {
    ...mistakes,
    [itemId]: {
      ...current,
      penaltyWeight: current.wrongStreak >= 2 ? 0.3 : 0.15,
      nextBoost: 0.3,
      cooldownAt: metadata.occurredAt,
      linkedLevel: level,
      priorityInsertedAt,
    },
  }
}

function withOptionalSession(
  tracking: TrackingState,
  session: SessionHistoryRecord | undefined,
): TrackingState {
  return session ? recordSessionTracking(tracking, session) : tracking
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
        tracking: withOptionalSession(
          action.tracking?.queue
            ? recordQueueTracking(state.tracking, action.tracking.queue)
            : state.tracking,
          action.tracking?.session,
        ),
      }
    case 'TRACK_STUDY_QUEUE':
      return {
        ...state,
        tracking: withOptionalSession(
          recordQueueTracking(state.tracking, action.queue),
          action.session,
        ),
      }
    case 'ADVANCE_STUDY_SLOT': {
      const isWrongReexposure =
        state.mistakes[action.itemId]?.reviewPending === true
        && (state.mistakes[action.itemId]?.reviewSpacingRemaining ?? 0) === 0
      const mistakes = consumeStudySlot(
        state.mistakes,
        action.itemId,
        action.priorityItemIds,
      )
      const levelAnalytics = state.studyAnalytics[action.level]
      return {
        ...state,
        mistakes,
        studyAnalytics: {
          ...state.studyAnalytics,
          [action.level]: {
            selectedDifficulty: {
              ...levelAnalytics.selectedDifficulty,
              [action.selectedDifficulty]:
                levelAnalytics.selectedDifficulty[action.selectedDifficulty] + 1,
            },
            exposedDifficulty: {
              ...levelAnalytics.exposedDifficulty,
              [action.itemDifficulty]:
                levelAnalytics.exposedDifficulty[action.itemDifficulty] + 1,
            },
            wrongReexposures: isWrongReexposure
              ? {
                  ...levelAnalytics.wrongReexposures,
                  [action.itemId]:
                    (levelAnalytics.wrongReexposures[action.itemId] ?? 0) + 1,
                }
              : levelAnalytics.wrongReexposures,
          },
        },
      }
    }
    case 'RECORD_STUDY': {
      const records = updateLearningRecords(
        state.mastery,
        state.mistakes,
        action.itemId,
        action.correct,
      )
      const mistakes = enrichTrackedMistake(
        records.mistakes,
        action.itemId,
        action.correct,
        action.tracking?.itemLevel ?? state.navigation.level,
        action.tracking,
      )
      const tracking = action.tracking &&
        isItemAttemptTrackingMetadataValid(action.tracking)
        ? withOptionalSession(
            recordItemAttemptTracking(
              state.tracking,
              action.itemId,
              action.tracking.itemLevel,
              action.correct,
              action.tracking,
            ),
            action.tracking.session,
          )
        : state.tracking
      return { ...state, ...records, mistakes, tracking }
    }
    case 'RECORD_QUIZ_ATTEMPT': {
      const { attempt } = action
      if (
        action.tracking &&
        isQuizAttemptTrackingMetadataValid(action.tracking) &&
        state.tracking.quizResponses.some(({ sessionId, questionId }) =>
          sessionId === action.tracking?.sessionId &&
          questionId === action.tracking.questionId)
      ) {
        return state
      }
      const agedMistakes = agePendingQuizReviews(state.mistakes)
      const records = updateLearningRecords(
        state.mastery,
        agedMistakes,
        attempt.sourceItemId,
        attempt.isCorrect,
      )
      const mistakes = attempt.isCorrect
        ? records.mistakes
        : scheduleInterruptedQuizReview(records.mistakes, attempt.sourceItemId)
      const trackedMistakes = enrichTrackedMistake(
        mistakes,
        attempt.sourceItemId,
        attempt.isCorrect,
        action.level,
        action.tracking,
      )
      const levelStats = state.difficultyStats[action.level]
      const previousStats = levelStats[attempt.difficulty]
      return {
        ...state,
        ...records,
        mistakes: trackedMistakes,
        tracking: action.tracking &&
          isQuizAttemptTrackingMetadataValid(action.tracking)
          ? withOptionalSession(
              recordQuizAttemptTracking(
                state.tracking,
                attempt.sourceItemId,
                action.level,
                attempt.difficulty,
                attempt.isCorrect,
                action.tracking,
              ),
              action.tracking.session,
            )
          : state.tracking,
        difficultyStats: {
          ...state.difficultyStats,
          [action.level]: {
            ...levelStats,
            [attempt.difficulty]: {
              attempts: previousStats.attempts + 1,
              correct: previousStats.correct + (attempt.isCorrect ? 1 : 0),
            },
          },
        },
      }
    }
    case 'RECORD_QUIZ':
      return {
        ...state,
        mistakes: scheduleQuizReviews(state.mistakes, action.summary),
        quizHistory: [...state.quizHistory, action.summary].slice(-7),
        tracking: action.tracking
          ? recordSessionTracking(state.tracking, action.tracking.session)
          : state.tracking,
      }
    case 'RECORD_GRAMMAR_EXERCISE': {
      const current = state.grammarMastery[action.nodeId] ?? emptyGrammarMastery()
      const next = recordGrammarExercise(
        current,
        action.attempt,
        action.masteryRule,
      )
      if (next === current) return state
      return {
        ...state,
        grammarMastery: {
          ...state.grammarMastery,
          [action.nodeId]: next,
        },
        tracking: action.tracking
          ? recordGrammarAttemptTracking(
              state.tracking,
              action.attempt.correct,
              action.tracking,
            )
          : state.tracking,
      }
    }
    case 'RECORD_GRAMMAR_PREREQUISITE_REVIEW': {
      const current = state.grammarMastery[action.nodeId] ?? emptyGrammarMastery()
      const next = recordGrammarPrerequisiteReview(
        current,
        action.reviewedNodeId,
        action.masteryRule,
      )
      if (next === current) return state
      return {
        ...state,
        grammarMastery: {
          ...state.grammarMastery,
          [action.nodeId]: next,
        },
        tracking: action.tracking
          ? recordSessionTracking(state.tracking, action.tracking.session)
          : state.tracking,
      }
    }
    case 'SUBMIT_GRAMMAR_PRODUCTION': {
      const current = state.grammarMastery[action.nodeId] ?? emptyGrammarMastery()
      const next = recordGrammarProduction(
        current,
        action.submission,
        action.productionTask,
        action.masteryRule,
      )
      if (next === current) return state
      return {
        ...state,
        grammarMastery: {
          ...state.grammarMastery,
          [action.nodeId]: next,
        },
        tracking: action.tracking
          ? recordSessionTracking(state.tracking, action.tracking.session)
          : state.tracking,
      }
    }
    case 'REVIEW_GRAMMAR_PRODUCTION': {
      const current = state.grammarMastery[action.nodeId] ?? emptyGrammarMastery()
      const next = recordGrammarProductionReview(
        current,
        action.reviewChecks,
        action.masteryRule,
      )
      if (next === current) return state
      return {
        ...state,
        grammarMastery: {
          ...state.grammarMastery,
          [action.nodeId]: next,
        },
        tracking: action.tracking
          ? recordSessionTracking(state.tracking, action.tracking.session)
          : state.tracking,
      }
    }
    case 'RESTART_GRAMMAR_PRODUCTION': {
      const current = state.grammarMastery[action.nodeId] ?? emptyGrammarMastery()
      const next = restartGrammarProductionCycle(
        current,
        action.productionTask,
        action.masteryRule,
      )
      if (next === current) return state
      return {
        ...state,
        grammarMastery: {
          ...state.grammarMastery,
          [action.nodeId]: next,
        },
        tracking: action.tracking
          ? recordSessionTracking(state.tracking, action.tracking.session)
          : state.tracking,
      }
    }
  }
}
