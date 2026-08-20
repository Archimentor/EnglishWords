import {
  createEmptyDifficultyMix,
  createEmptySessionQuizTypePerformance,
  type QueueHistoryRecord,
  type SessionHistoryRecord,
} from '../domain/progress/tracking'
import { appReducer } from './appReducer'
import { createInitialState } from './appState'

const START = Date.UTC(2026, 7, 20, 0, 0, 0)

function studySession(): SessionHistoryRecord {
  return {
    id: 'study-session-1',
    kind: 'study',
    level: '기초',
    startedAt: START,
    endedAt: START + 2_000,
    durationMs: 2_000,
    status: 'completed',
    performance: {
      attempts: 2,
      correct: 1,
      byQuizType: createEmptySessionQuizTypePerformance(),
    },
    adjustments: { mistakeBoost: 0.3, difficultyBoost: 0, priority: 0.83 },
  }
}

function studyQueue(): QueueHistoryRecord {
  const difficultyMix = createEmptyDifficultyMix()
  difficultyMix.normal = 2
  return {
    id: 'study-queue-1',
    sessionId: 'study-session-1',
    scope: 'standard',
    level: '기초',
    generatedAt: START,
    startedAt: START + 10,
    updatedAt: START + 2_000,
    interruptedAt: null,
    status: 'completed',
    selectedDifficulty: 'normal',
    difficultyMix,
    queueSize: 2,
    currentIndex: 2,
    recoveryIndex: 0,
    recovered: false,
    mistakeCount: 1,
    priorityCount: 1,
    overdueCount: 0,
    exposureComponents: {
      difficultyBase: 0.4,
      lowAccuracyBoost: 0.1,
      mistakeBoost: 0.3,
      recentWrongBoost: 0.03,
      scheduleBoost: -0.2,
      masteryBoost: -0.15,
      grammarBoost: 0,
      total: 0.48,
    },
    auditCompleteness: 'legacy',
    candidateItemIds: [],
    orderedItemIds: [],
    itemExposureWeights: [],
    spacing: {
      minimumDistinctItems: 1,
      exceptionPolicy: 'strict',
      exceptionApplied: false,
      blockedItemIds: [],
    },
    priorityEntries: [{ itemId: 'word-play', priority: 0.48, insertedAt: START + 10 }],
  }
}

describe('appReducer tracking integration', () => {
  it('keeps legacy learning updates while ignoring absent or invalid tracking metadata', () => {
    const initial = createInitialState()
    const withoutMetadata = appReducer(initial, {
      type: 'RECORD_STUDY',
      itemId: 'word-play',
      correct: false,
    })
    const invalidMetadata = appReducer(createInitialState(), {
      type: 'RECORD_STUDY',
      itemId: 'word-play',
      correct: false,
      tracking: {
        itemKind: 'word',
        itemLevel: '기초',
        occurredAt: Number.NaN,
        weight: 0.5,
        session: studySession(),
      },
    })

    expect(withoutMetadata.tracking).toBe(initial.tracking)
    expect(withoutMetadata.mistakes['word-play']).toEqual({
      wrongCount: 1,
      wrongStreak: 1,
      priorityRemaining: 0,
    })
    expect(invalidMetadata.mastery['word-play']?.attempts).toBe(1)
    expect(invalidMetadata.tracking).toEqual(createInitialState().tracking)
    expect(invalidMetadata.mistakes['word-play']).toEqual({
      wrongCount: 1,
      wrongStreak: 1,
      priorityRemaining: 0,
    })

    const invalidQuizMetadata = appReducer(createInitialState(), {
      type: 'RECORD_QUIZ_ATTEMPT',
      level: '기초',
      attempt: {
        sourceItemId: 'word-play',
        difficulty: 'normal',
        isCorrect: false,
      },
      tracking: {
        itemKind: 'word',
        itemLevel: '기초',
        occurredAt: START,
        weight: 0.5,
        session: studySession(),
        sessionId: 'quiz-session-invalid',
        questionId: 'question-invalid',
        questionType: 'en-ko',
        quizType: 'en-ko',
        answerTimeMs: 500,
        isReexposure: false,
        adjustment: 2.01,
      },
    })
    expect(invalidQuizMetadata.mastery['word-play']?.attempts).toBe(1)
    expect(invalidQuizMetadata.tracking).toEqual(createInitialState().tracking)
  })

  it('uses only provided timestamps to update study scheduling and mistake audit metadata', () => {
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('the reducer must not read the wall clock')
    })
    try {
      const first = appReducer(createInitialState(), {
        type: 'RECORD_STUDY',
        itemId: 'word-play',
        correct: false,
        tracking: {
          itemKind: 'word',
          itemLevel: '기초',
          occurredAt: START,
          weight: 0.55,
        },
      })
      const second = appReducer(first, {
        type: 'RECORD_STUDY',
        itemId: 'word-play',
        correct: false,
        tracking: {
          itemKind: 'word',
          itemLevel: '기초',
          occurredAt: START + 1_000,
          weight: 0.7,
        },
      })

      expect(first.tracking.itemSchedule['word-play']).toMatchObject({
        level: '기초',
        lastSeenAt: START,
        nextDueAt: START,
        weight: 0.55,
        lastLevel: '기초',
      })
      expect(second.tracking.dailyActivity['2026-08-20']).toMatchObject({
        attempts: 2,
        correct: 0,
      })
      expect(first.mistakes['word-play']).toMatchObject({
        penaltyWeight: 0.15,
        nextBoost: 0.3,
        cooldownAt: START,
        linkedLevel: '기초',
        priorityInsertedAt: null,
      })
      expect(second.mistakes['word-play']).toMatchObject({
        penaltyWeight: 0.3,
        cooldownAt: START + 1_000,
        priorityInsertedAt: START + 1_000,
      })
    } finally {
      dateNow.mockRestore()
    }
  })

  it('records signed quiz response metrics and upserts study queue and session history', () => {
    const afterQuiz = appReducer(createInitialState(), {
      type: 'RECORD_QUIZ_ATTEMPT',
      level: '기초',
      attempt: {
        sourceItemId: 'word-play',
        difficulty: 'hard',
        isCorrect: false,
      },
      tracking: {
        itemKind: 'word',
        itemLevel: '기초',
        occurredAt: START,
        weight: 0.83,
        sessionId: 'quiz-session-1',
        questionId: 'question-1',
        questionType: 'en-ko',
        quizType: 'en-ko',
        answerTimeMs: 900,
        isReexposure: true,
        adjustment: -1,
      },
    })

    expect(afterQuiz.tracking.quizResponses[0]).toMatchObject({
      sourceItemId: 'word-play',
      adjustment: -1,
      answeredAt: START,
    })
    expect(afterQuiz.tracking.quizTypeStats.기초['en-ko']).toMatchObject({
      attempts: 1,
      totalAnswerTimeMs: 900,
      averageAnswerTimeMs: 900,
      reexposureAttempts: 1,
      adjustmentTotal: -1,
    })

    const duplicate = appReducer(afterQuiz, {
      type: 'RECORD_QUIZ_ATTEMPT',
      level: '기초',
      attempt: {
        sourceItemId: 'word-play',
        difficulty: 'hard',
        isCorrect: false,
      },
      tracking: {
        itemKind: 'word',
        itemLevel: '기초',
        occurredAt: START,
        weight: 0.83,
        sessionId: 'quiz-session-1',
        questionId: 'question-1',
        questionType: 'en-ko',
        quizType: 'en-ko',
        answerTimeMs: 900,
        isReexposure: true,
        adjustment: -1,
      },
    })
    expect(duplicate).toBe(afterQuiz)
    expect(duplicate.mastery['word-play']?.attempts).toBe(1)
    expect(duplicate.mistakes['word-play']?.wrongCount).toBe(1)
    expect(duplicate.difficultyStats.기초.hard.attempts).toBe(1)

    const saved = appReducer(afterQuiz, {
      type: 'SAVE_STUDY_SESSION',
      level: '기초',
      snapshot: { queueIds: ['word-play', 'word-book'], currentIndex: 2 },
      tracking: { queue: studyQueue(), session: studySession() },
    })
    expect(saved.tracking.queueHistory).toEqual([studyQueue()])
    expect(saved.tracking.sessionHistory).toEqual([studySession()])
    expect(saved.tracking.dailyActivity['2026-08-20']).toMatchObject({
      sessions: 1,
      attempts: 1,
      durationMs: 2_000,
    })
  })

  it('tracks a mistakes queue without overwriting the standard study snapshot', () => {
    const initial = createInitialState()
    initial.studySessions.기초 = { queueIds: ['standard-word'], currentIndex: 1 }
    const reviewQueue = {
      ...studyQueue(),
      id: 'mistakes-queue-1',
      sessionId: 'mistakes-session-1',
      scope: 'mistakes' as const,
    }

    const tracked = appReducer(initial, {
      type: 'TRACK_STUDY_QUEUE',
      queue: reviewQueue,
      session: { ...studySession(), id: 'mistakes-session-1' },
    })

    expect(tracked.studySessions.기초).toEqual({
      queueIds: ['standard-word'],
      currentIndex: 1,
    })
    expect(tracked.tracking.queueHistory).toEqual([reviewQueue])
    expect(tracked.tracking.sessionHistory[0]?.id).toBe('mistakes-session-1')
  })
})
