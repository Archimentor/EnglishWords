import { DIFFICULTIES, LEVELS } from '../domain/content/types'
import type {
  LevelDifficultyStats,
  LevelStudyAnalytics,
} from '../domain/progress/types'
import {
  MAX_QUEUE_HISTORY,
  MAX_QUIZ_RESPONSE_HISTORY,
  MAX_SESSION_HISTORY,
  MAX_STUDY_QUEUE_PRIORITY_COUNT,
  MAX_STUDY_QUEUE_SIZE,
  createEmptyDifficultyMix,
  createEmptySessionQuizTypePerformance,
  createEmptyTrackingState,
  recordQueueTracking,
  type QueueHistoryRecord,
} from '../domain/progress/tracking'
import {
  emptyGrammarMastery,
  recordGrammarExercise,
  recordGrammarPrerequisiteReview,
  recordGrammarProduction,
} from '../domain/grammar/mastery'
import { QUIZ_TYPES } from '../domain/quiz/types'
import type { QuizSessionSummary } from '../domain/quiz/types'
import {
  makeGrammarNode,
  makeGrammarProductionRecord,
  makeGrammarProductionSubmission,
} from '../test/fixtures'
import { createInitialState } from './appState'
import type { AppState } from './appState'
import {
  BACKUP_STORAGE_KEY,
  loadAppState as loadPersistedAppState,
  saveAppState,
  saveRawBackup,
  STORAGE_KEY,
} from './persistence'

const LOAD_AT = Date.UTC(2026, 7, 20, 12, 0, 0)

function loadAppState(storage: Pick<Storage, 'getItem'>) {
  return loadPersistedAppState(storage, { now: () => LOAD_AT })
}

function withLoadEvent(
  state: AppState,
  outcome: 'empty' | 'loaded' | 'migrated' | 'recovered',
  source: 'empty' | 'current' | 'versioned' | 'legacy' | 'malformed' | 'storage-error',
  sourceSchemaVersion: number | null,
  sourceTrackingVersion: number | null,
): AppState {
  const previous = state.tracking.stateLoadHistory.at(-1)
  return {
    ...state,
    tracking: {
      ...state.tracking,
      stateLoadHistory: [
        ...state.tracking.stateLoadHistory,
        {
          sequence: (previous?.sequence ?? 0) + 1,
          occurredAt: Math.max(previous?.occurredAt ?? 0, LOAD_AT),
          outcome,
          source,
          sourceSchemaVersion,
          sourceTrackingVersion,
        },
      ],
    },
  }
}

function recoveredState(
  sourceSchemaVersion: number | null = null,
  sourceTrackingVersion: number | null = null,
  source: 'malformed' | 'storage-error' = 'malformed',
): AppState {
  return withLoadEvent(
    createInitialState(),
    'recovered',
    source,
    sourceSchemaVersion,
    sourceTrackingVersion,
  )
}

interface MemoryStorage extends Pick<Storage, 'getItem' | 'setItem'> {
  values: Map<string, string>
}

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const values = new Map(Object.entries(initial))

  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  }
}

function quizSummary(): QuizSessionSummary {
  const typeStats = Object.fromEntries(
    QUIZ_TYPES.map((type) => [
      type,
      type === 'en-ko'
        ? { correct: 0, wrong: 1, total: 1, accuracy: 0 }
        : { correct: 0, wrong: 0, total: 0, accuracy: 0 },
    ]),
  ) as QuizSessionSummary['typeStats']

  return {
    score: 0,
    total: 1,
    accuracy: 0,
    typeStats,
    heatmap: [
      {
        questionId: 'q-1',
        sourceItemId: 'word-play',
        type: 'en-ko',
        isCorrect: false,
      },
    ],
    wrongItemIds: ['word-play'],
  }
}

function populatedState(): AppState {
  const initial = createInitialState()

  return {
    ...initial,
    navigation: {
      level: '초등학교',
      section: '학습',
      grammarSection: 'A2',
      grammarNodeId: 'A2-G01',
      studyDifficulty: 'hard',
      quizType: 'dictation',
    },
    mastery: {
      'word-play': {
        attempts: 3,
        correct: 3,
        wrong: 0,
        correctStreak: 3,
        wrongStreak: 0,
      },
    },
    grammarMastery: {
      'A1-G01': {
        attempts: 3,
        correct: 3,
        diagnosticAttempts: 1,
        practiceAttempts: 1,
        rediagnosticAttempts: 1,
        productionAttempts: 1,
        productionPassed: true,
        retryCount: 0,
        errorCounts: {},
        errorStreaks: {},
        exerciseResults: {
          'A1-G01-diagnostic': {
            phase: 'diagnostic',
            correct: true,
            errorCode: 'WO-01',
          },
          'A1-G01-practice': {
            phase: 'practice',
            correct: true,
            errorCode: 'WO-01',
          },
          'A1-G01-rediagnostic': {
            phase: 'rediagnostic',
            correct: true,
            errorCode: 'SV-01',
          },
        },
        reviewRequirement: null,
        production: makeGrammarProductionRecord(makeGrammarNode()),
        mustReview: false,
        completed: true,
      },
    },
    mistakes: {
      'word-book': { wrongCount: 2, wrongStreak: 2, priorityRemaining: 3 },
    },
    studySessions: {
      초등학교: { queueIds: ['word-play', 'word-book'], currentIndex: 1 },
    },
    difficultyStats: {
      ...initial.difficultyStats,
      초등학교: {
        ...initial.difficultyStats.초등학교,
        hard: { attempts: 5, correct: 3 },
      },
    },
    quizHistory: [quizSummary()],
  }
}

function fullyTrackedState(): AppState {
  const state = populatedState()
  const at = Date.UTC(2026, 7, 20, 0, 0, 0)
  state.mistakes['word-book'] = {
    ...state.mistakes['word-book']!,
    penaltyWeight: 0.3,
    nextBoost: 0.3,
    cooldownAt: at,
    linkedLevel: '초등학교',
    priorityInsertedAt: at,
  }
  state.tracking.dailyActivity['2026-08-20'] = {
    sessions: 1,
    attempts: 1,
    correct: 0,
    durationMs: 2_000,
  }
  state.tracking.itemSchedule['word-play'] = {
    kind: 'word',
    level: '초등학교',
    ease: 2.3,
    lastSeenAt: at + 1_000,
    nextDueAt: at + 1_000,
    weight: 0.83,
    lastLevel: '초등학교',
  }
  state.tracking.quizResponses.push({
    sessionId: 'quiz-1',
    questionId: 'q-1',
    sourceItemId: 'word-play',
    questionType: 'en-ko',
    quizType: 'en-ko',
    level: '초등학교',
    isCorrect: false,
    answerTimeMs: 800,
    difficultyUsed: 'hard',
    answeredAt: at + 1_000,
    isReexposure: true,
    adjustment: 0.15,
  })
  state.tracking.quizTypeStats.초등학교['en-ko'] = {
    attempts: 1,
    correct: 0,
    totalAnswerTimeMs: 800,
    averageAnswerTimeMs: 800,
    reexposureAttempts: 1,
    reexposureCorrect: 0,
    wrongRunTransitions: 0,
    adjustmentTotal: 0.15,
  }
  const byQuizType = createEmptySessionQuizTypePerformance()
  byQuizType['en-ko'] = { attempts: 1, correct: 0, totalAnswerTimeMs: 800 }
  state.tracking.sessionHistory.push({
    id: 'quiz-1',
    kind: 'quiz',
    level: '초등학교',
    startedAt: at,
    endedAt: at + 2_000,
    durationMs: 2_000,
    status: 'completed',
    performance: { attempts: 1, correct: 0, byQuizType },
    adjustments: { mistakeBoost: 0.15, difficultyBoost: 0.1, priority: 0.3 },
  })
  const difficultyMix = createEmptyDifficultyMix()
  difficultyMix.hard = 2
  state.tracking.queueHistory.push({
    id: 'queue-1',
    sessionId: 'study-1',
    scope: 'standard',
    level: '초등학교',
    generatedAt: at,
    startedAt: at,
    updatedAt: at + 1_000,
    interruptedAt: null,
    status: 'active',
    selectedDifficulty: 'hard',
    difficultyMix,
    queueSize: 2,
    currentIndex: 1,
    recoveryIndex: 0,
    recovered: false,
    mistakeCount: 1,
    priorityCount: 1,
    overdueCount: 1,
    exposureComponents: {
      difficultyBase: 0.3,
      lowAccuracyBoost: 0.1,
      mistakeBoost: 0.3,
      recentWrongBoost: 0.03,
      scheduleBoost: 0.02,
      masteryBoost: 0.04,
      grammarBoost: 0.01,
      total: 0.8,
    },
    auditCompleteness: 'complete',
    candidateItemIds: ['word-play', 'word-book'],
    orderedItemIds: ['word-play', 'word-book'],
    itemExposureWeights: [
      {
        itemId: 'word-play',
        components: {
          difficultyBase: 0.3,
          lowAccuracyBoost: 0.1,
          mistakeBoost: 0.3,
          recentWrongBoost: 0.03,
          scheduleBoost: 0.02,
          masteryBoost: 0.04,
          grammarBoost: 0.01,
          total: 0.8,
        },
        overdue: true,
      },
      {
        itemId: 'word-book',
        components: {
          difficultyBase: 0.3,
          lowAccuracyBoost: 0.1,
          mistakeBoost: 0.3,
          recentWrongBoost: 0.03,
          scheduleBoost: 0.02,
          masteryBoost: 0.04,
          grammarBoost: 0.01,
          total: 0.8,
        },
        overdue: false,
      },
    ],
    spacing: {
      minimumDistinctItems: 1,
      exceptionPolicy: 'strict',
      exceptionApplied: false,
      blockedItemIds: [],
    },
    priorityEntries: [{ itemId: 'word-book', priority: 0.8, insertedAt: at }],
  })
  return state
}

function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState
}

function versionSixCompatibleState(state: AppState): Record<string, unknown> {
  const legacy = cloneState(state) as unknown as Record<string, unknown>
  const grammarMastery = legacy.grammarMastery as Record<
    string,
    Record<string, unknown>
  >
  for (const mastery of Object.values(grammarMastery)) {
    const production = mastery.production as Record<string, unknown> | null
    if (production === null) continue
    const draft = production.draft as string
    const rubricEvidence = draft
      .split(/[.!?]+/u)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .slice(0, 3)
    const reviewStatus = production.reviewStatus as 'pending' | 'approved' | 'rejected'
    mastery.production = {
      draft,
      rubricEvidence,
      reviewStatus,
      reviewChecks: reviewStatus === 'pending'
        ? null
        : rubricEvidence.map((_, index) => reviewStatus === 'approved' || index > 0),
    }
  }
  return legacy
}

function productionResetGrammarMastery(state: AppState): AppState['grammarMastery'] {
  const grammarMastery = structuredClone(state.grammarMastery)
  for (const mastery of Object.values(grammarMastery)) {
    const exerciseResults = Object.fromEntries(
      Object.entries(mastery.exerciseResults).filter(([, result]) =>
        result.phase !== 'rediagnostic'),
    )
    const results = Object.values(exerciseResults)
    mastery.attempts = results.length
    mastery.correct = results.filter(({ correct }) => correct).length
    mastery.diagnosticAttempts = results.filter(
      ({ phase }) => phase === 'diagnostic',
    ).length
    mastery.practiceAttempts = results.filter(({ phase }) => phase === 'practice').length
    mastery.rediagnosticAttempts = 0
    mastery.productionPassed = false
    mastery.errorStreaks = Object.fromEntries(
      Object.keys(mastery.errorCounts).map((code) => [code, 0]),
    )
    mastery.exerciseResults = exerciseResults
    mastery.reviewRequirement = null
    mastery.production = null
    mastery.mustReview = false
    mastery.completed = false
  }
  return grammarMastery
}

function largeAuditedQueue(
  index: number,
  status: 'completed' | 'interrupted',
  candidateItemIds: string[],
  orderedItemIds: string[],
  itemExposureWeights: QueueHistoryRecord['itemExposureWeights'],
): QueueHistoryRecord {
  const at = LOAD_AT + index
  const difficultyMix = createEmptyDifficultyMix()
  difficultyMix.normal = orderedItemIds.length
  return {
    id: `large-queue-${index}`,
    sessionId: `large-session-${index}`,
    scope: 'standard',
    level: '중학교',
    generatedAt: at,
    startedAt: at,
    updatedAt: at,
    interruptedAt: status === 'interrupted' ? at : null,
    status,
    selectedDifficulty: 'normal',
    difficultyMix,
    queueSize: orderedItemIds.length,
    currentIndex: status === 'completed' ? orderedItemIds.length : 123,
    recoveryIndex: 0,
    recovered: false,
    mistakeCount: 0,
    priorityCount: 0,
    overdueCount: 0,
    exposureComponents: {
      difficultyBase: 0.4,
      lowAccuracyBoost: 0,
      mistakeBoost: 0,
      recentWrongBoost: 0,
      scheduleBoost: 0,
      masteryBoost: 0,
      grammarBoost: 0,
      total: 0.4,
    },
    auditCompleteness: 'complete',
    candidateItemIds,
    orderedItemIds,
    itemExposureWeights,
    spacing: {
      minimumDistinctItems: 1,
      exceptionPolicy: 'strict',
      exceptionApplied: false,
      blockedItemIds: [],
    },
    priorityEntries: [],
  }
}

function stateWithAuditedQueueSize(size: number): AppState {
  const state = fullyTrackedState()
  const queue = state.tracking.queueHistory[0]!
  const itemIds = Array.from({ length: size }, (_, index) => `queue-item-${index}`)
  const difficultyMix = createEmptyDifficultyMix()
  difficultyMix.hard = size
  queue.difficultyMix = difficultyMix
  queue.queueSize = size
  queue.currentIndex = size
  queue.recoveryIndex = size
  queue.mistakeCount = 0
  queue.priorityCount = 0
  queue.overdueCount = 0
  queue.candidateItemIds = [...itemIds]
  queue.orderedItemIds = [...itemIds]
  queue.itemExposureWeights = itemIds.map((itemId) => ({
    itemId,
    components: { ...queue.exposureComponents },
    overdue: false,
  }))
  queue.spacing.blockedItemIds = []
  queue.priorityEntries = []
  return state
}

function legacyDifficultyStats(state: AppState): LevelDifficultyStats {
  return Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [
      difficulty,
      { ...state.difficultyStats.초등학교[difficulty] },
    ]),
  ) as LevelDifficultyStats
}

function versionTwoState(): Record<string, unknown> {
  const current = populatedState()
  const legacy = { ...current } as unknown as Record<string, unknown>
  legacy.schemaVersion = 2
  delete legacy.studyAnalytics
  delete legacy.tracking
  legacy.difficultyStats = legacyDifficultyStats(current)
  legacy.grammarMastery = {
      'A1-G01': {
        attempts: 3,
        correct: 3,
        diagnosticAttempts: 1,
        practiceAttempts: 1,
        rediagnosticAttempts: 1,
        productionAttempts: 1,
        productionPassed: true,
        retryCount: 0,
        errorCounts: {},
        errorStreaks: {},
        mustReview: false,
        completed: true,
      },
  }
  return legacy
}

function versionFourState(): Record<string, unknown> {
  const current = populatedState()
  const analytics = {
    selectedDifficulty: {
      ...current.studyAnalytics.초등학교.selectedDifficulty,
      hard: 3,
    },
    exposedDifficulty: {
      ...current.studyAnalytics.초등학교.exposedDifficulty,
      veryHard: 2,
    },
    wrongReexposures: { 'word-book': 2 },
  } satisfies LevelStudyAnalytics

  const legacy = {
    ...versionSixCompatibleState(current),
    schemaVersion: 4,
    difficultyStats: legacyDifficultyStats(current),
    studyAnalytics: analytics,
  } as unknown as Record<string, unknown>
  delete legacy.tracking
  return legacy
}

describe('createInitialState', () => {
  it('creates a fresh version 7 state with independent analytics buckets for every level', () => {
    const first = createInitialState()
    const second = createInitialState()

    expect(first).toEqual({
      schemaVersion: 7,
      navigation: {
        level: '기초',
        section: '대시보드',
        grammarSection: '대시보드',
        grammarNodeId: null,
        studyDifficulty: 'normal',
        quizType: 'en-ko',
      },
      mastery: {},
      grammarMastery: {},
      mistakes: {},
      studySessions: {},
      difficultyStats: Object.fromEntries(LEVELS.map((level) => [level,
        Object.fromEntries(
          DIFFICULTIES.map((difficulty) => [difficulty, { attempts: 0, correct: 0 }]),
        ),
      ])),
      studyAnalytics: Object.fromEntries(LEVELS.map((level) => [level, {
        selectedDifficulty: Object.fromEntries(
          DIFFICULTIES.map((difficulty) => [difficulty, 0]),
        ),
        exposedDifficulty: Object.fromEntries(
          DIFFICULTIES.map((difficulty) => [difficulty, 0]),
        ),
        wrongReexposures: {},
      }])),
      quizHistory: [],
      tracking: createEmptyTrackingState(),
    })
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(second.navigation).not.toBe(first.navigation)
    expect(second.difficultyStats.기초.normal).not.toBe(first.difficultyStats.기초.normal)
    expect(second.difficultyStats.기초).not.toBe(second.difficultyStats.유치원)
    expect(second.studyAnalytics.기초).not.toBe(first.studyAnalytics.기초)
    expect(second.studyAnalytics.기초).not.toBe(second.studyAnalytics.유치원)
  })
})

describe('loadAppState and saveAppState', () => {
  it('returns an empty initial state when storage has no value', () => {
    const result = loadAppState(memoryStorage())

    expect(result).toEqual({
      state: withLoadEvent(createInitialState(), 'empty', 'empty', null, null),
      status: 'empty',
      warning: null,
      rawBackup: null,
    })
  })

  it('round-trips a complete valid version 7 state', () => {
    const storage = memoryStorage()
    const state = populatedState()

    expect(saveAppState(storage, state)).toEqual({ ok: true })
    expect(loadAppState(storage)).toEqual({
      state: withLoadEvent(state, 'loaded', 'current', 7, 2),
      status: 'loaded',
      warning: null,
      rawBackup: null,
    })
  })

  it('migrates version 5 through version 6 and safely resets legacy production evidence', () => {
    const current = populatedState()
    const versionFive = versionSixCompatibleState(current)
    versionFive.schemaVersion = 5
    delete versionFive.tracking
    const raw = JSON.stringify(versionFive)

    const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))

    expect(result).toEqual({
      state: {
        ...current,
        schemaVersion: 7,
        grammarMastery: productionResetGrammarMastery(current),
        tracking: withLoadEvent(
          createInitialState(),
          'migrated',
          'versioned',
          5,
          null,
        ).tracking,
      },
      status: 'migrated',
      warning: expect.stringMatching(/이전 버전/),
      rawBackup: raw,
    })
  })

  it('migrates version 6 by invalidating gates while preserving cumulative grammar analytics', () => {
    const current = populatedState()
    const legacy = versionSixCompatibleState(current)
    legacy.schemaVersion = 6
    const grammarMastery = legacy.grammarMastery as Record<
      string,
      Record<string, unknown>
    >
    const mastery = grammarMastery['A1-G01']!
    mastery.correct = 2
    mastery.productionAttempts = 3
    mastery.retryCount = 3
    mastery.errorCounts = { 'TENSE-01': 1 }
    mastery.errorStreaks = { 'TENSE-01': 1 }
    mastery.completed = false
    const exerciseResults = mastery.exerciseResults as Record<
      string,
      Record<string, unknown>
    >
    exerciseResults['A1-G01-rediagnostic']!.correct = false
    exerciseResults['A1-G01-rediagnostic']!.errorCode = 'TENSE-01'
    const raw = JSON.stringify(legacy)

    const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))

    expect(result).toMatchObject({
      status: 'migrated',
      rawBackup: raw,
      state: {
        schemaVersion: 7,
        grammarMastery: {
          'A1-G01': {
            attempts: 2,
            correct: 2,
            diagnosticAttempts: 1,
            practiceAttempts: 1,
            rediagnosticAttempts: 0,
            productionAttempts: 3,
            productionPassed: false,
            retryCount: 3,
            errorCounts: { 'TENSE-01': 1 },
            errorStreaks: { 'TENSE-01': 0 },
            reviewRequirement: null,
            production: null,
            mustReview: false,
            completed: false,
          },
        },
      },
    })
    expect(result.state.grammarMastery['A1-G01']!.exerciseResults)
      .not.toHaveProperty('A1-G01-rediagnostic')

    const next = recordGrammarProduction(
      result.state.grammarMastery['A1-G01']!,
      makeGrammarProductionSubmission(makeGrammarNode()),
      makeGrammarNode().productionTask,
      makeGrammarNode().masteryRule,
    )
    expect(next).toMatchObject({
      productionAttempts: 4,
      retryCount: 3,
      production: { cycleStartAttempt: 4, revisionRound: 0 },
    })
  })

  it('resets version 6 review gates even without legacy production or rediagnosis', () => {
    const legacy = versionSixCompatibleState(populatedState())
    legacy.schemaVersion = 6
    const grammarMastery = legacy.grammarMastery as Record<
      string,
      Record<string, unknown>
    >
    grammarMastery['A1-G01'] = {
      attempts: 2,
      correct: 1,
      diagnosticAttempts: 1,
      practiceAttempts: 1,
      rediagnosticAttempts: 0,
      productionAttempts: 0,
      productionPassed: false,
      retryCount: 2,
      errorCounts: { 'TENSE-01': 2 },
      errorStreaks: { 'TENSE-01': 1 },
      exerciseResults: {
        'A1-G01-diagnostic': {
          phase: 'diagnostic',
          correct: false,
          errorCode: 'TENSE-01',
        },
        'A1-G01-practice': {
          phase: 'practice',
          correct: true,
          errorCode: 'TENSE-01',
        },
      },
      reviewRequirement: {
        nodeId: 'A1-G01',
        errorCode: 'TENSE-01',
        completed: false,
      },
      production: null,
      mustReview: true,
      completed: false,
    }
    const raw = JSON.stringify(legacy)

    const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))

    expect(result).toMatchObject({
      status: 'migrated',
      rawBackup: raw,
      state: {
        grammarMastery: {
          'A1-G01': {
            productionAttempts: 0,
            retryCount: 2,
            errorCounts: { 'TENSE-01': 2 },
            errorStreaks: { 'TENSE-01': 0 },
            reviewRequirement: null,
            production: null,
            mustReview: false,
            completed: false,
          },
        },
      },
    })
  })

  it('round-trips every version 7 tracking family and enriched mistake metadata', () => {
    const state = fullyTrackedState()
    const storage = memoryStorage()

    expect(saveAppState(storage, state)).toEqual({ ok: true })
    expect(loadAppState(storage)).toEqual({
      state: withLoadEvent(state, 'loaded', 'current', 7, 2),
      status: 'loaded',
      warning: null,
      rawBackup: null,
    })
  })

  it('round-trips signed quiz adjustments within the supported range', () => {
    const state = fullyTrackedState()
    state.tracking.quizResponses[0]!.adjustment = -1
    state.tracking.quizTypeStats.초등학교['en-ko'].adjustmentTotal = -1
    const storage = memoryStorage()

    expect(saveAppState(storage, state)).toEqual({ ok: true })
    expect(loadAppState(storage)).toMatchObject({
      status: 'loaded',
      state: {
        tracking: {
          quizResponses: [{ adjustment: -1 }],
          quizTypeStats: { 초등학교: { 'en-ko': { adjustmentTotal: -1 } } },
        },
      },
    })

    const invalid = fullyTrackedState()
    invalid.tracking.quizResponses[0]!.adjustment = -2.01
    expect(saveAppState(memoryStorage(), invalid)).toEqual({
      ok: false,
      message: '학습 상태를 저장하지 못했습니다.',
    })
  })

  it('round-trips signed session adjustments without losing downward direction', () => {
    const state = fullyTrackedState()
    state.tracking.sessionHistory[0]!.adjustments = {
      mistakeBoost: -0.15,
      difficultyBoost: -1,
      priority: -0.25,
    }
    const storage = memoryStorage()

    expect(saveAppState(storage, state)).toEqual({ ok: true })
    expect(loadAppState(storage).state.tracking.sessionHistory[0]?.adjustments).toEqual({
      mistakeBoost: -0.15,
      difficultyBoost: -1,
      priority: -0.25,
    })
  })

  it('bounds repeated 2,750-candidate audits while preserving current and recovery payloads', () => {
    const candidateItemIds = Array.from(
      { length: 2_750 },
      (_, index) => `word-중학교-${index + 1}`,
    )
    const orderedItemIds = candidateItemIds.slice(0, 500)
    const components = {
      difficultyBase: 0.4,
      lowAccuracyBoost: 0,
      mistakeBoost: 0,
      recentWrongBoost: 0,
      scheduleBoost: 0,
      masteryBoost: 0,
      grammarBoost: 0,
      total: 0.4,
    }
    const itemExposureWeights = candidateItemIds.map((itemId) => ({
      itemId,
      components,
      overdue: false,
    }))
    let state = createInitialState()
    for (let index = 0; index < MAX_QUEUE_HISTORY; index += 1) {
      state = {
        ...state,
        tracking: recordQueueTracking(
          state.tracking,
          largeAuditedQueue(
            index,
            index === 50 ? 'interrupted' : 'completed',
            candidateItemIds,
            orderedItemIds,
            itemExposureWeights,
          ),
        ),
      }
    }

    expect(state.tracking.queueHistory).toHaveLength(MAX_QUEUE_HISTORY)
    expect(state.tracking.queueHistory.filter(
      ({ auditCompleteness }) => auditCompleteness === 'complete',
    ).map(({ id }) => id)).toEqual(['large-queue-50', 'large-queue-99'])
    expect(state.tracking.queueHistory.filter(
      ({ auditCompleteness }) => auditCompleteness === 'summary',
    )).toHaveLength(MAX_QUEUE_HISTORY - 2)

    const storage = memoryStorage()
    expect(saveAppState(storage, state)).toEqual({ ok: true })
    const serialized = storage.values.get(STORAGE_KEY)
    expect(serialized).toBeDefined()
    expect(serialized!.length).toBeLessThanOrEqual(2_000_000)

    const loaded = loadAppState(storage)
    expect(loaded.status).toBe('loaded')
    for (const id of ['large-queue-50', 'large-queue-99']) {
      const queue = loaded.state.tracking.queueHistory.find((entry) => entry.id === id)
      expect(queue?.auditCompleteness).toBe('complete')
      expect(queue?.candidateItemIds).toEqual(candidateItemIds)
      expect(queue?.orderedItemIds).toEqual(orderedItemIds)
      expect(queue?.itemExposureWeights).toEqual(itemExposureWeights)
    }
    const summary = loaded.state.tracking.queueHistory.find(
      ({ auditCompleteness }) => auditCompleteness === 'summary',
    )
    expect(summary).toMatchObject({
      queueSize: 500,
      auditCompleteness: 'summary',
      candidateItemIds: [],
      orderedItemIds: [],
      itemExposureWeights: [],
      priorityEntries: [],
      spacing: { blockedItemIds: [] },
    })
  }, 20_000)

  it('accepts the 500-item study and audited queue boundary and rejects 501 items', () => {
    const boundaryIds = Array.from(
      { length: MAX_STUDY_QUEUE_SIZE },
      (_, index) => `session-item-${index}`,
    )
    const boundarySession = fullyTrackedState()
    boundarySession.studySessions.초등학교 = {
      queueIds: boundaryIds,
      currentIndex: MAX_STUDY_QUEUE_SIZE,
    }
    const boundaryQueue = stateWithAuditedQueueSize(MAX_STUDY_QUEUE_SIZE)

    for (const valid of [boundarySession, boundaryQueue]) {
      const storage = memoryStorage()
      expect(saveAppState(storage, valid)).toEqual({ ok: true })
      expect(loadAppState(storage).status).toBe('loaded')
    }

    const oversizedSession = cloneState(boundarySession)
    oversizedSession.studySessions.초등학교!.queueIds.push('session-item-overflow')
    oversizedSession.studySessions.초등학교!.currentIndex = MAX_STUDY_QUEUE_SIZE + 1
    const oversizedQueue = stateWithAuditedQueueSize(MAX_STUDY_QUEUE_SIZE + 1)

    for (const invalid of [oversizedSession, oversizedQueue]) {
      expect(saveAppState(memoryStorage(), invalid)).toEqual({
        ok: false,
        message: '학습 상태를 저장하지 못했습니다.',
      })
      expect(loadAppState(memoryStorage({
        [STORAGE_KEY]: JSON.stringify(invalid),
      })).status).toBe('recovered')
    }
  })

  it('accepts three queue priorities and rejects a fourth entry and count', () => {
    const boundary = stateWithAuditedQueueSize(4)
    const queue = boundary.tracking.queueHistory[0]!
    queue.mistakeCount = 4
    queue.priorityCount = MAX_STUDY_QUEUE_PRIORITY_COUNT
    queue.priorityEntries = queue.orderedItemIds
      .slice(0, MAX_STUDY_QUEUE_PRIORITY_COUNT)
      .map((itemId) => ({
        itemId,
        priority: 0.3,
        insertedAt: queue.generatedAt,
      }))
    expect(saveAppState(memoryStorage(), boundary)).toEqual({ ok: true })

    const oversized = cloneState(boundary)
    const oversizedQueue = oversized.tracking.queueHistory[0]!
    oversizedQueue.priorityCount = MAX_STUDY_QUEUE_PRIORITY_COUNT + 1
    oversizedQueue.priorityEntries.push({
      itemId: oversizedQueue.orderedItemIds[MAX_STUDY_QUEUE_PRIORITY_COUNT]!,
      priority: 0.3,
      insertedAt: oversizedQueue.generatedAt,
    })

    expect(saveAppState(memoryStorage(), oversized)).toEqual({
      ok: false,
      message: '학습 상태를 저장하지 못했습니다.',
    })
    expect(loadAppState(memoryStorage({
      [STORAGE_KEY]: JSON.stringify(oversized),
    })).status).toBe('recovered')
  })

  it('upgrades legacy version 6 queue history and records the migration source', () => {
    const legacy = versionSixCompatibleState(fullyTrackedState())
    legacy.schemaVersion = 6
    const tracking = legacy.tracking as Record<string, unknown>
    delete tracking.trackingVersion
    delete tracking.stateLoadHistory
    const queue = (tracking.queueHistory as Array<Record<string, unknown>>)[0]!
    for (const key of [
      'scope',
      'auditCompleteness',
      'candidateItemIds',
      'orderedItemIds',
      'itemExposureWeights',
      'spacing',
    ]) delete queue[key]
    const raw = JSON.stringify(legacy)

    const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))

    expect(result).toMatchObject({
      status: 'migrated',
      rawBackup: raw,
      state: {
        tracking: {
          trackingVersion: 2,
          queueHistory: [{
            scope: 'standard',
            auditCompleteness: 'legacy',
            candidateItemIds: [],
            orderedItemIds: [],
            itemExposureWeights: [],
          }],
          stateLoadHistory: [{
            sequence: 1,
            occurredAt: LOAD_AT,
            outcome: 'migrated',
            source: 'versioned',
            sourceSchemaVersion: 6,
            sourceTrackingVersion: 1,
          }],
        },
      },
    })
  })

  it('appends load observability monotonically when the wall clock moves backward', () => {
    const state = fullyTrackedState()
    state.tracking.stateLoadHistory = [{
      sequence: 7,
      occurredAt: LOAD_AT + 1_000,
      outcome: 'migrated',
      source: 'versioned',
      sourceSchemaVersion: 5,
      sourceTrackingVersion: null,
    }]
    const storage = memoryStorage()
    expect(saveAppState(storage, state)).toEqual({ ok: true })

    expect(loadAppState(storage).state.tracking.stateLoadHistory).toEqual([
      state.tracking.stateLoadHistory[0],
      {
        sequence: 8,
        occurredAt: LOAD_AT + 1_000,
        outcome: 'loaded',
        source: 'current',
        sourceSchemaVersion: 7,
        sourceTrackingVersion: 2,
      },
    ])
  })

  it('accepts signed exposure reductions and validates clamped exposure totals', () => {
    const lowerClamped = fullyTrackedState()
    lowerClamped.tracking.queueHistory[0]!.exposureComponents = {
      difficultyBase: 0,
      lowAccuracyBoost: 0,
      mistakeBoost: 0,
      recentWrongBoost: 0,
      scheduleBoost: -0.2,
      masteryBoost: -0.15,
      grammarBoost: 0,
      total: 0.001,
    }
    const upperClamped = fullyTrackedState()
    upperClamped.tracking.queueHistory[0]!.exposureComponents = {
      difficultyBase: 5,
      lowAccuracyBoost: 0,
      mistakeBoost: 0,
      recentWrongBoost: 0,
      scheduleBoost: 0,
      masteryBoost: 0,
      grammarBoost: 0,
      total: 4,
    }

    expect(saveAppState(memoryStorage(), lowerClamped)).toEqual({ ok: true })
    expect(saveAppState(memoryStorage(), upperClamped)).toEqual({ ok: true })

    const unclamped = cloneState(lowerClamped)
    unclamped.tracking.queueHistory[0]!.exposureComponents.total = 0.01
    expect(saveAppState(memoryStorage(), unclamped)).toEqual({
      ok: false,
      message: '학습 상태를 저장하지 못했습니다.',
    })
  })

  it('requires generatedAt <= startedAt <= updatedAt for queue history', () => {
    const valid = fullyTrackedState()
    const queue = valid.tracking.queueHistory[0]!
    queue.startedAt = queue.generatedAt + 100
    queue.updatedAt = queue.startedAt + 100
    queue.priorityEntries[0]!.insertedAt = queue.startedAt
    expect(saveAppState(memoryStorage(), valid)).toEqual({ ok: true })

    const generatedAfterStart = cloneState(valid)
    generatedAfterStart.tracking.queueHistory[0]!.generatedAt = queue.startedAt + 1
    expect(saveAppState(memoryStorage(), generatedAfterStart)).toEqual({
      ok: false,
      message: '학습 상태를 저장하지 못했습니다.',
    })

    const updatedBeforeStart = cloneState(valid)
    updatedBeforeStart.tracking.queueHistory[0]!.updatedAt = queue.startedAt - 1
    expect(saveAppState(memoryStorage(), updatedBeforeStart)).toEqual({
      ok: false,
      message: '학습 상태를 저장하지 못했습니다.',
    })
  })

  it('rejects partial or inconsistent enriched mistake tracking metadata', () => {
    const partial = fullyTrackedState()
    delete partial.mistakes['word-book']!.linkedLevel
    const impossiblePriority = fullyTrackedState()
    impossiblePriority.mistakes['word-book']!.priorityInsertedAt = null

    for (const invalid of [partial, impossiblePriority]) {
      expect(saveAppState(memoryStorage(), invalid)).toEqual({
        ok: false,
        message: '학습 상태를 저장하지 못했습니다.',
      })
    }
  })

  it('fails closed for malformed daily activity, schedule, response, and cumulative stats', () => {
    const invalidDay = cloneState(fullyTrackedState())
    invalidDay.tracking.dailyActivity['2026-02-30'] =
      invalidDay.tracking.dailyActivity['2026-08-20']!
    const invalidSchedule = cloneState(fullyTrackedState())
    invalidSchedule.tracking.itemSchedule['word-play']!.nextDueAt = 0
    const orphanSchedule = cloneState(fullyTrackedState())
    orphanSchedule.tracking.itemSchedule.orphan = {
      ...orphanSchedule.tracking.itemSchedule['word-play']!,
    }
    const mismatchedResponse = cloneState(fullyTrackedState())
    mismatchedResponse.tracking.quizResponses[0]!.questionType = 'ko-en'
    const duplicateResponse = cloneState(fullyTrackedState())
    duplicateResponse.tracking.quizResponses.push({
      ...duplicateResponse.tracking.quizResponses[0]!,
    })
    duplicateResponse.tracking.quizTypeStats.초등학교['en-ko'].attempts = 2
    duplicateResponse.tracking.quizTypeStats.초등학교['en-ko'].totalAnswerTimeMs = 1_600
    duplicateResponse.tracking.quizTypeStats.초등학교['en-ko'].averageAnswerTimeMs = 800
    duplicateResponse.tracking.quizTypeStats.초등학교['en-ko'].reexposureAttempts = 2
    const wrongAverage = cloneState(fullyTrackedState())
    wrongAverage.tracking.quizTypeStats.초등학교['en-ko'].averageAnswerTimeMs = 799

    for (const invalid of [
      invalidDay,
      invalidSchedule,
      orphanSchedule,
      mismatchedResponse,
      duplicateResponse,
      wrongAverage,
    ]) {
      const raw = JSON.stringify(invalid)
      const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))
      expect(result).toMatchObject({ status: 'recovered', rawBackup: raw })
    }
  })

  it('fails closed for malformed session and queue lifecycle or audit totals', () => {
    const wrongDuration = cloneState(fullyTrackedState())
    wrongDuration.tracking.sessionHistory[0]!.durationMs = 1
    const wrongGrammarLevel = cloneState(fullyTrackedState())
    wrongGrammarLevel.tracking.sessionHistory[0]!.kind = 'grammar'
    const wrongMix = cloneState(fullyTrackedState())
    wrongMix.tracking.queueHistory[0]!.difficultyMix.hard = 1
    const wrongExposureTotal = cloneState(fullyTrackedState())
    wrongExposureTotal.tracking.queueHistory[0]!.exposureComponents.total = 0.7
    const wrongPriorityTime = cloneState(fullyTrackedState())
    wrongPriorityTime.tracking.queueHistory[0]!.priorityEntries[0]!.insertedAt = 0
    const wrongInterruption = cloneState(fullyTrackedState())
    wrongInterruption.tracking.queueHistory[0]!.status = 'interrupted'
    const missingCandidateWeight = cloneState(fullyTrackedState())
    missingCandidateWeight.tracking.queueHistory[0]!.itemExposureWeights.pop()
    const wrongFinalOrder = cloneState(fullyTrackedState())
    wrongFinalOrder.tracking.queueHistory[0]!.orderedItemIds[0] = 'unknown-item'
    const unauditedException = cloneState(fullyTrackedState())
    unauditedException.tracking.queueHistory[0]!.spacing.exceptionApplied = true
    const mismatchedLoadOutcome = cloneState(fullyTrackedState())
    mismatchedLoadOutcome.tracking.stateLoadHistory = [{
      sequence: 1,
      occurredAt: LOAD_AT,
      outcome: 'loaded',
      source: 'empty',
      sourceSchemaVersion: null,
      sourceTrackingVersion: null,
    }]

    for (const invalid of [
      wrongDuration,
      wrongGrammarLevel,
      wrongMix,
      wrongExposureTotal,
      wrongPriorityTime,
      wrongInterruption,
      missingCandidateWeight,
      wrongFinalOrder,
      unauditedException,
      mismatchedLoadOutcome,
    ]) {
      expect(saveAppState(memoryStorage(), invalid)).toEqual({
        ok: false,
        message: '학습 상태를 저장하지 못했습니다.',
      })
    }
  })

  it('enforces the documented bounded detail histories', () => {
    const responses = fullyTrackedState()
    responses.tracking.quizResponses = Array.from(
      { length: MAX_QUIZ_RESPONSE_HISTORY + 1 },
      (_, index) => ({
        ...responses.tracking.quizResponses[0]!,
        questionId: `q-${index}`,
      }),
    )
    responses.tracking.quizTypeStats.초등학교['en-ko'] = {
      ...responses.tracking.quizTypeStats.초등학교['en-ko'],
      attempts: MAX_QUIZ_RESPONSE_HISTORY + 1,
      totalAnswerTimeMs: (MAX_QUIZ_RESPONSE_HISTORY + 1) * 800,
      averageAnswerTimeMs: 800,
      reexposureAttempts: MAX_QUIZ_RESPONSE_HISTORY + 1,
    }
    const sessions = fullyTrackedState()
    sessions.tracking.sessionHistory = Array.from(
      { length: MAX_SESSION_HISTORY + 1 },
      (_, index) => ({ ...sessions.tracking.sessionHistory[0]!, id: `session-${index}` }),
    )
    const queues = fullyTrackedState()
    queues.tracking.queueHistory = Array.from(
      { length: MAX_QUEUE_HISTORY + 1 },
      (_, index) => ({ ...queues.tracking.queueHistory[0]!, id: `queue-${index}` }),
    )

    for (const invalid of [responses, sessions, queues]) {
      expect(saveAppState(memoryStorage(), invalid)).toEqual({
        ok: false,
        message: '학습 상태를 저장하지 못했습니다.',
      })
    }
  })

  it('round-trips pending review metadata while accepting older mistake records', () => {
    const state = populatedState()
    state.mistakes['word-play'] = {
      wrongCount: 1,
      wrongStreak: 1,
      priorityRemaining: 0,
      reviewPending: true,
      reviewSpacingRemaining: 1,
    }
    const storage = memoryStorage()

    expect(saveAppState(storage, state)).toEqual({ ok: true })
    const loaded = loadAppState(storage)

    expect(loaded.status).toBe('loaded')
    expect(loaded.state.mistakes).toEqual(state.mistakes)
    expect(loaded.state.mistakes['word-book']).toEqual({
      wrongCount: 2,
      wrongStreak: 2,
      priorityRemaining: 3,
    })
  })

  it('round-trips study selection, exposure, and wrong-review analytics', () => {
    const state = populatedState()
    state.studyAnalytics.초등학교.selectedDifficulty.hard = 3
    state.studyAnalytics.초등학교.exposedDifficulty.veryHard = 2
    state.studyAnalytics.초등학교.wrongReexposures['word-book'] = 2
    state.studyAnalytics.유치원.selectedDifficulty.easy = 4
    const storage = memoryStorage()

    expect(saveAppState(storage, state)).toEqual({ ok: true })
    expect(loadAppState(storage)).toMatchObject({
      status: 'loaded',
      state: { studyAnalytics: state.studyAnalytics },
    })
  })

  it('round-trips independent quiz difficulty statistics for every level', () => {
    const state = populatedState()
    state.difficultyStats.기초.easy = { attempts: 2, correct: 2 }
    state.difficultyStats.유치원.easy = { attempts: 4, correct: 1 }
    const storage = memoryStorage()

    expect(saveAppState(storage, state)).toEqual({ ok: true })
    expect(loadAppState(storage)).toMatchObject({
      status: 'loaded',
      state: { difficultyStats: state.difficultyStats },
    })
  })

  it('migrates version 4 global analytics and quiz stats into the saved navigation level without loss', () => {
    const versionFour = versionFourState()
    const previousAnalytics = versionFour.studyAnalytics as LevelStudyAnalytics
    const previousDifficultyStats = versionFour.difficultyStats as LevelDifficultyStats
    const raw = JSON.stringify(versionFour)

    const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))

    expect(result.status).toBe('migrated')
    expect(result.rawBackup).toBe(raw)
    expect(result.state.schemaVersion).toBe(7)
    expect(result.state.tracking).toEqual(withLoadEvent(
      createInitialState(),
      'migrated',
      'versioned',
      4,
      null,
    ).tracking)
    expect(result.state.studyAnalytics.초등학교).toEqual(previousAnalytics)
    expect(result.state.difficultyStats.초등학교).toEqual(previousDifficultyStats)
    for (const level of LEVELS.filter((level) => level !== '초등학교')) {
      expect(result.state.studyAnalytics[level]).toEqual(createInitialState().studyAnalytics[level])
      expect(result.state.difficultyStats[level]).toEqual(
        createInitialState().difficultyStats[level],
      )
    }
  })

  it('round-trips a review-gated pending production state', () => {
    const rule = {
      quizAccuracy: 0.8,
      productionPass: true,
      errorTolerance: 0.2,
    }
    let grammarMastery = emptyGrammarMastery()
    grammarMastery = recordGrammarExercise(
      grammarMastery,
      {
        exerciseId: 'A1-G01-diagnostic',
        reviewNodeId: 'A1-G01',
        phase: 'diagnostic',
        correct: false,
        errorCode: 'WO-01',
      },
      rule,
    )
    grammarMastery = recordGrammarExercise(
      grammarMastery,
      {
        exerciseId: 'A1-G01-practice',
        reviewNodeId: 'A1-G01',
        phase: 'practice',
        correct: false,
        errorCode: 'WO-01',
      },
      rule,
    )
    grammarMastery = recordGrammarPrerequisiteReview(
      grammarMastery,
      'A1-G01',
      rule,
    )
    grammarMastery = recordGrammarProduction(
      grammarMastery,
      makeGrammarProductionSubmission(makeGrammarNode()),
      makeGrammarNode().productionTask,
      rule,
    )
    const state = populatedState()
    state.grammarMastery['A1-G01'] = grammarMastery
    const storage = memoryStorage()

    expect(saveAppState(storage, state)).toEqual({ ok: true })
    expect(loadAppState(storage)).toMatchObject({
      status: 'loaded',
      state: { grammarMastery: { 'A1-G01': grammarMastery } },
    })
  })

  it('migrates version 2 while clearing untrustworthy grammar mastery and global stats', () => {
    const versionTwo = versionTwoState()
    const raw = JSON.stringify(versionTwo)

    const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))

    expect(result.status).toBe('migrated')
    expect(result.warning).toMatch(/이전 버전/)
    expect(result.rawBackup).toBe(raw)
    expect(result.state).toMatchObject({
      schemaVersion: 7,
      navigation: versionTwo.navigation,
      mastery: versionTwo.mastery,
      mistakes: versionTwo.mistakes,
      studySessions: versionTwo.studySessions,
      difficultyStats: createInitialState().difficultyStats,
      quizHistory: versionTwo.quizHistory,
      grammarMastery: {},
      studyAnalytics: createInitialState().studyAnalytics,
      tracking: withLoadEvent(
        createInitialState(),
        'migrated',
        'versioned',
        2,
        null,
      ).tracking,
    })
  })

  it('migrates version 3 by preserving progress and adding empty level analytics', () => {
    const current = populatedState()
    const versionThree = versionSixCompatibleState(current)
    versionThree.schemaVersion = 3
    delete versionThree.studyAnalytics
    delete versionThree.tracking
    versionThree.difficultyStats = legacyDifficultyStats(current)
    const raw = JSON.stringify(versionThree)

    const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))

    expect(result.status).toBe('migrated')
    expect(result.rawBackup).toBe(raw)
    expect(result.state.schemaVersion).toBe(7)
    expect(result.state.mastery).toEqual(current.mastery)
    expect(result.state.grammarMastery).toEqual(productionResetGrammarMastery(current))
    expect(result.state.difficultyStats).toEqual(createInitialState().difficultyStats)
    expect(result.state.studyAnalytics).toEqual(createInitialState().studyAnalytics)
    expect(result.state.tracking).toEqual(withLoadEvent(
      createInitialState(),
      'migrated',
      'versioned',
      3,
      null,
    ).tracking)
  })

  it('migrates a complete version 1 state without losing learning records', () => {
    const current = populatedState()
    const versionOne = { ...current } as unknown as Record<string, unknown>
    versionOne.schemaVersion = 1
    delete versionOne.grammarMastery
    delete versionOne.studyAnalytics
    delete versionOne.tracking
    versionOne.difficultyStats = legacyDifficultyStats(current)
    const raw = JSON.stringify(versionOne)

    const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))

    expect(result.status).toBe('migrated')
    expect(result.rawBackup).toBe(raw)
    expect(result.state.schemaVersion).toBe(7)
    expect(result.state.grammarMastery).toEqual({})
    expect(result.state.mastery).toEqual(current.mastery)
    expect(result.state.quizHistory).toEqual(current.quizHistory)
    expect(result.state.difficultyStats).toEqual(createInitialState().difficultyStats)
    expect(result.state.studyAnalytics).toEqual(createInitialState().studyAnalytics)
    expect(result.state.tracking).toEqual(withLoadEvent(
      createInitialState(),
      'migrated',
      'versioned',
      1,
      null,
    ).tracking)
  })

  it('migrates the documented flat menu state and preserves its raw source', () => {
    const raw = JSON.stringify({
      level: '초등학교',
      section: '학습',
      grammarSection: 'A2',
      studyDifficulty: 'hard',
      quizType: 'dictation',
    })
    const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))

    expect(result.status).toBe('migrated')
    expect(result.warning).toMatch(/이전 버전/)
    expect(result.rawBackup).toBe(raw)
    expect(result.state.navigation).toMatchObject({
      level: '초등학교',
      section: '학습',
      grammarSection: 'A2',
      studyDifficulty: 'hard',
      quizType: 'dictation',
    })
    expect(result.state.studyAnalytics).toEqual(createInitialState().studyAnalytics)
    expect(result.state.difficultyStats).toEqual(createInitialState().difficultyStats)
  })

  it('fills missing legacy menu fields with defaults', () => {
    const raw = JSON.stringify({ level: '유치원' })

    expect(loadAppState(memoryStorage({ [STORAGE_KEY]: raw })).state.navigation).toEqual({
      ...createInitialState().navigation,
      level: '유치원',
    })
  })

  it.each([
    ['bad json', '{bad json', null],
    ['null root', JSON.stringify(null), null],
    ['array root', JSON.stringify([]), null],
    ['primitive root', JSON.stringify('state'), null],
    ['unsupported schema', JSON.stringify({ schemaVersion: 6 }), 6],
    ['invalid legacy enum', JSON.stringify({ level: '고등학교' }), null],
  ])('recovers %s with a warning and raw backup', (_label, raw, schemaVersion) => {
    const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))

    expect(result.state).toEqual(recoveredState(schemaVersion, null))
    expect(result.status).toBe('recovered')
    expect(result.warning).toMatch(/저장된 학습 상태/)
    expect(result.rawBackup).toBe(raw)
  })

  it('rejects invalid nested counters and session indexes', () => {
    const invalidMastery = populatedState()
    invalidMastery.mastery['word-play'] = {
      attempts: 3,
      correct: 2,
      wrong: 0,
      correctStreak: 2,
      wrongStreak: 0,
    }
    const invalidSession = populatedState()
    invalidSession.studySessions.초등학교 = {
      queueIds: ['word-play', 'word-play'],
      currentIndex: 3,
    }

    for (const state of [invalidMastery, invalidSession]) {
      const result = loadAppState(
        memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) }),
      )
      expect(result.status).toBe('recovered')
      expect(result.state).toEqual(recoveredState(7, 2))
    }
  })

  it('rejects impossible simultaneous streaks and priority outside the three-slot window', () => {
    const impossibleStreaks = populatedState()
    impossibleStreaks.mastery['word-play'] = {
      attempts: 4,
      correct: 3,
      wrong: 1,
      correctStreak: 2,
      wrongStreak: 1,
    }
    const invalidPriority = populatedState()
    invalidPriority.mistakes['word-book'] = {
      wrongCount: 4,
      wrongStreak: 4,
      priorityRemaining: 4,
    }

    for (const state of [impossibleStreaks, invalidPriority]) {
      expect(
        loadAppState(memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) })).status,
      ).toBe('recovered')
    }
  })

  it('rejects an invalid current navigation enum and inconsistent wrong-item summary', () => {
    const invalidNavigation = populatedState()
    invalidNavigation.navigation.section = '설정' as AppState['navigation']['section']
    const invalidSummary = populatedState()
    invalidSummary.quizHistory[0]!.wrongItemIds = ['word-other']

    for (const state of [invalidNavigation, invalidSummary]) {
      const result = loadAppState(
        memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) }),
      )
      expect(result.status).toBe('recovered')
      expect(result.state).toEqual(recoveredState(7, 2))
    }
  })

  it('rejects incomplete level difficulty stats and more than seven quiz summaries', () => {
    const incompleteStats = populatedState()
    delete (
      incompleteStats.difficultyStats.기초 as Partial<
        AppState['difficultyStats']['기초']
      >
    ).easy
    const oldHistory = populatedState()
    oldHistory.quizHistory = Array.from({ length: 8 }, quizSummary)

    for (const state of [incompleteStats, oldHistory]) {
      expect(
        loadAppState(memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) })).status,
      ).toBe('recovered')
    }
  })

  it('recovers when reading storage throws without claiming a raw backup', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError')
      }),
    }

    expect(loadAppState(storage)).toEqual({
      state: recoveredState(null, null, 'storage-error'),
      status: 'recovered',
      warning: expect.stringMatching(/저장된 학습 상태/),
      rawBackup: null,
    })
  })

  it('returns a failure result when storage quota is exceeded', () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new DOMException('full', 'QuotaExceededError')
      }),
    }

    expect(saveAppState(storage, createInitialState())).toEqual({
      ok: false,
      message: expect.stringMatching(/저장/),
    })
  })

  it('returns a failure before writing when serialization fails', () => {
    const storage = memoryStorage()
    const circular = createInitialState() as AppState & { self?: unknown }
    circular.self = circular

    expect(saveAppState(storage, circular)).toEqual({
      ok: false,
      message: expect.stringMatching(/저장/),
    })
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('never overwrites a corrupt source while recovering it', () => {
    const raw = '{bad json'
    const storage = memoryStorage({ [STORAGE_KEY]: raw })

    loadAppState(storage)

    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.values.get(STORAGE_KEY)).toBe(raw)
  })

  it('strictly rejects missing, extra, or malformed level difficulty buckets', () => {
    const missingLevel = populatedState()
    delete (missingLevel.difficultyStats as Partial<AppState['difficultyStats']>).유치원
    const extraLevel = populatedState()
    Object.assign(extraLevel.difficultyStats, {
      고등학교: createInitialState().difficultyStats.기초,
    })
    const malformedLevel = populatedState()
    malformedLevel.difficultyStats.중학교.hard = { attempts: 1, correct: 2 }
    const extraNestedField = populatedState()
    Object.assign(extraNestedField.difficultyStats.기초, { unexpected: true })

    for (const state of [missingLevel, extraLevel, malformedLevel, extraNestedField]) {
      const result = loadAppState(
        memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) }),
      )
      expect(result.status).toBe('recovered')
      expect(result.state).toEqual(recoveredState(7, 2))
    }
  })

  it('strictly rejects missing, extra, or malformed level analytics buckets', () => {
    const missingLevel = populatedState()
    delete (missingLevel.studyAnalytics as Partial<AppState['studyAnalytics']>).유치원
    const extraLevel = populatedState()
    Object.assign(extraLevel.studyAnalytics, {
      고등학교: createInitialState().studyAnalytics.기초,
    })
    const malformedLevel = populatedState()
    malformedLevel.studyAnalytics.중학교.selectedDifficulty.hard = -1
    const extraNestedField = populatedState()
    Object.assign(extraNestedField.studyAnalytics.기초, { unexpected: true })

    for (const state of [missingLevel, extraLevel, malformedLevel, extraNestedField]) {
      const result = loadAppState(
        memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) }),
      )
      expect(result.status).toBe('recovered')
      expect(result.state).toEqual(recoveredState(7, 2))
    }
  })

  it('rejects incomplete or out-of-range pending review metadata', () => {
    const missingSpacing = populatedState()
    missingSpacing.mistakes['word-book'] = {
      ...missingSpacing.mistakes['word-book']!,
      reviewPending: true,
    }
    const invalidSpacing = populatedState()
    invalidSpacing.mistakes['word-book'] = {
      ...invalidSpacing.mistakes['word-book']!,
      reviewPending: true,
      reviewSpacingRemaining: 2,
    }

    for (const state of [missingSpacing, invalidSpacing]) {
      expect(
        loadAppState(memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) })).status,
      ).toBe('recovered')
    }
  })

  it('rejects inconsistent grammar mastery counters', () => {
    const invalid = populatedState()
    invalid.grammarMastery['A1-G01']!.attempts = 4

    const result = loadAppState(
      memoryStorage({ [STORAGE_KEY]: JSON.stringify(invalid) }),
    )

    expect(result.status).toBe('recovered')
    expect(result.state).toEqual(recoveredState(7, 2))
  })

  it('rejects forged grammar production approval and review evidence', () => {
    const pendingClaimedAsPassed = populatedState()
    pendingClaimedAsPassed.grammarMastery['A1-G01'] = {
      ...pendingClaimedAsPassed.grammarMastery['A1-G01']!,
      completed: false,
      production: {
        ...pendingClaimedAsPassed.grammarMastery['A1-G01']!.production!,
        reviewStatus: 'pending',
        reviewChecks: null,
      },
    }
    const approvalWithFailedCheck = populatedState()
    approvalWithFailedCheck.grammarMastery['A1-G01'] = {
      ...approvalWithFailedCheck.grammarMastery['A1-G01']!,
      completed: false,
      production: {
        ...approvalWithFailedCheck.grammarMastery['A1-G01']!.production!,
        reviewStatus: 'approved',
        reviewChecks: [true, false],
      },
    }
    const approvalWithOneCriterion = populatedState()
    approvalWithOneCriterion.grammarMastery['A1-G01'] = {
      ...approvalWithOneCriterion.grammarMastery['A1-G01']!,
      production: {
        ...approvalWithOneCriterion.grammarMastery['A1-G01']!.production!,
        rubricEvidence: approvalWithOneCriterion.grammarMastery['A1-G01']!
          .production!.rubricEvidence.slice(0, 1),
        reviewChecks: [true],
      },
    }
    const forgedPartId = populatedState()
    forgedPartId.grammarMastery['A1-G01']!.production!.parts[0]!.partId = 'forged'
    const forgedRequirementId = populatedState()
    forgedRequirementId.grammarMastery['A1-G01']!
      .production!.requirementEvidence[0]!.requirementId = 'forged'
    const duplicatedRequirementEvidence = populatedState()
    const firstSelection = duplicatedRequirementEvidence.grammarMastery['A1-G01']!
      .production!.requirementEvidence[0]!.selections[0]!
    duplicatedRequirementEvidence.grammarMastery['A1-G01']!
      .production!.requirementEvidence[0]!.selections.push({ ...firstSelection })
    const forgedCycleStart = populatedState()
    forgedCycleStart.grammarMastery['A1-G01']!.production!.cycleStartAttempt = 2

    for (const state of [
      pendingClaimedAsPassed,
      approvalWithFailedCheck,
      approvalWithOneCriterion,
      forgedPartId,
      forgedRequirementId,
      duplicatedRequirementEvidence,
      forgedCycleStart,
    ]) {
      expect(
        loadAppState(memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) })).status,
      ).toBe('recovered')
    }
  })

  it('rejects C1 revision histories that omit prior production failures from retries', () => {
    const node = makeGrammarNode({ id: 'C1-G01', level: 'C1' })
    const stateFor = (
      status: 'pending' | 'rejected',
      retryCount: number,
    ): AppState => {
      const state = populatedState()
      state.grammarMastery['C1-G01'] = {
        attempts: 2,
        correct: 2,
        diagnosticAttempts: 1,
        practiceAttempts: 1,
        rediagnosticAttempts: 0,
        productionAttempts: 3,
        productionPassed: false,
        retryCount,
        errorCounts: {},
        errorStreaks: {},
        exerciseResults: {
          'C1-G01-diagnostic': {
            phase: 'diagnostic',
            correct: true,
            errorCode: 'REG-01',
          },
          'C1-G01-practice': {
            phase: 'practice',
            correct: true,
            errorCode: 'REG-01',
          },
        },
        reviewRequirement: null,
        production: makeGrammarProductionRecord(node, {
          status,
          cycleStartAttempt: 1,
          revisionRound: 2,
        }),
        mustReview: false,
        completed: false,
      }
      return state
    }

    for (const state of [stateFor('pending', 1), stateFor('rejected', 2)]) {
      expect(
        loadAppState(memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) })).status,
      ).toBe('recovered')
    }

    for (const state of [stateFor('pending', 2), stateFor('rejected', 3)]) {
      expect(saveAppState(memoryStorage(), state)).toEqual({ ok: true })
    }
  })

  it('rejects partial grammar mastery that skips stage dependencies', () => {
    const approvedProduction = populatedState().grammarMastery['A1-G01']!.production!
    const practiceBeforeDiagnostic = populatedState()
    practiceBeforeDiagnostic.grammarMastery['A1-G01'] = {
      ...emptyGrammarMastery(),
      attempts: 1,
      correct: 1,
      practiceAttempts: 1,
      exerciseResults: {
        'A1-G01-practice': {
          phase: 'practice',
          correct: true,
          errorCode: 'WO-01',
        },
      },
    }

    const productionBeforePractice = populatedState()
    productionBeforePractice.grammarMastery['A1-G01'] = {
      ...emptyGrammarMastery(),
      attempts: 1,
      correct: 1,
      diagnosticAttempts: 1,
      productionAttempts: 1,
      productionPassed: true,
      exerciseResults: {
        'A1-G01-diagnostic': {
          phase: 'diagnostic',
          correct: true,
          errorCode: 'WO-01',
        },
      },
      production: { ...approvedProduction },
    }

    const rediagnosticBeforeProduction = populatedState()
    rediagnosticBeforeProduction.grammarMastery['A1-G01'] = {
      ...emptyGrammarMastery(),
      attempts: 3,
      correct: 3,
      diagnosticAttempts: 1,
      practiceAttempts: 1,
      rediagnosticAttempts: 1,
      exerciseResults: {
        'A1-G01-diagnostic': {
          phase: 'diagnostic',
          correct: true,
          errorCode: 'WO-01',
        },
        'A1-G01-practice': {
          phase: 'practice',
          correct: true,
          errorCode: 'WO-01',
        },
        'A1-G01-rediagnostic': {
          phase: 'rediagnostic',
          correct: true,
          errorCode: 'WO-01',
        },
      },
    }

    const rediagnosticBeforeApproval = structuredClone(rediagnosticBeforeProduction)
    rediagnosticBeforeApproval.grammarMastery['A1-G01'] = {
      ...rediagnosticBeforeApproval.grammarMastery['A1-G01']!,
      productionAttempts: 1,
      production: {
        ...approvedProduction,
        reviewStatus: 'pending',
        reviewChecks: null,
      },
    }

    for (const state of [
      practiceBeforeDiagnostic,
      productionBeforePractice,
      rediagnosticBeforeProduction,
      rediagnosticBeforeApproval,
    ]) {
      expect(saveAppState(memoryStorage(), state)).toEqual({
        ok: false,
        message: expect.stringMatching(/저장/),
      })
    }
  })

  it('rejects a forged completed node below the stored mastery thresholds', () => {
    const invalid = populatedState()
    const mastery = invalid.grammarMastery['A1-G01']!
    mastery.exerciseResults['A1-G01-rediagnostic'] = {
      phase: 'rediagnostic',
      correct: false,
      errorCode: 'SV-01',
    }
    mastery.correct = 2
    mastery.retryCount = 1
    mastery.errorCounts = { 'SV-01': 1 }
    mastery.errorStreaks = { 'SV-01': 1 }

    expect(loadAppState(memoryStorage({
      [STORAGE_KEY]: JSON.stringify(invalid),
    })).status).toBe('recovered')
  })

  it('rejects extra nested grammar keys and impossible error counters', () => {
    const extraExerciseKey = populatedState() as unknown as Record<string, unknown>
    const grammarMastery = extraExerciseKey.grammarMastery as Record<
      string,
      Record<string, unknown>
    >
    const exerciseResults = grammarMastery['A1-G01']!.exerciseResults as Record<
      string,
      Record<string, unknown>
    >
    exerciseResults['A1-G01-diagnostic']!.forged = true

    const impossibleErrors = populatedState()
    impossibleErrors.grammarMastery['A1-G01'] = {
      ...impossibleErrors.grammarMastery['A1-G01']!,
      retryCount: 3,
      errorCounts: { 'WO-01': 4 },
      errorStreaks: { 'WO-01': 0 },
    }

    for (const state of [extraExerciseKey, impossibleErrors]) {
      expect(
        loadAppState(memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) })).status,
      ).toBe('recovered')
    }
  })

  it('stores a byte-identical recovery source under a separate durable key', () => {
    const storage = memoryStorage()
    const raw = ' {"broken": true}\r\n'

    expect(saveRawBackup(storage, raw)).toEqual({ ok: true })
    expect(storage.values.get(BACKUP_STORAGE_KEY)).toBe(raw)
    expect(storage.values.has(STORAGE_KEY)).toBe(false)
  })

  it('reports backup failure without falling through to the primary state key', () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new DOMException('full', 'QuotaExceededError')
      }),
    }

    expect(saveRawBackup(storage, '{bad json')).toEqual({
      ok: false,
      message: expect.stringMatching(/복구 원본/),
    })
    expect(storage.setItem).toHaveBeenCalledOnce()
    expect(storage.setItem).toHaveBeenCalledWith(BACKUP_STORAGE_KEY, '{bad json')
  })
})
