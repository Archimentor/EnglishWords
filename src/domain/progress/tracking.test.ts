import {
  MAX_DETAILED_QUEUE_HISTORY_PER_SCOPE_LEVEL,
  MAX_QUEUE_HISTORY,
  MAX_QUIZ_RESPONSE_HISTORY,
  MAX_SESSION_HISTORY,
  createEmptyDifficultyMix,
  createEmptySessionQuizTypePerformance,
  createEmptyTrackingState,
  recordItemAttemptTracking,
  recordQueueTracking,
  recordQuizAttemptTracking,
  recordSessionTracking,
  recordStateLoadTracking,
  type QueueHistoryRecord,
  type SessionHistoryRecord,
} from './tracking'

const DAY_MS = 24 * 60 * 60 * 1_000
const START = Date.UTC(2026, 7, 20, 0, 0, 0)

function session(
  id: string,
  startedAt = START,
  endedAt = START + 1_000,
): SessionHistoryRecord {
  return {
    id,
    kind: 'study',
    level: '기초',
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
    status: 'completed',
    performance: {
      attempts: 1,
      correct: 1,
      byQuizType: createEmptySessionQuizTypePerformance(),
    },
    adjustments: { mistakeBoost: 0, difficultyBoost: 0, priority: 0 },
  }
}

function queue(id: string, currentIndex = 0): QueueHistoryRecord {
  const difficultyMix = createEmptyDifficultyMix()
  difficultyMix.normal = 2
  return {
    id,
    sessionId: `session-${id}`,
    scope: 'standard',
    level: '기초',
    generatedAt: START,
    startedAt: START,
    updatedAt: START + currentIndex,
    interruptedAt: null,
    status: 'active',
    selectedDifficulty: 'normal',
    difficultyMix,
    queueSize: 2,
    currentIndex,
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
      scheduleBoost: 0,
      masteryBoost: 0,
      grammarBoost: 0,
      total: 0.83,
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
    priorityEntries: [{ itemId: 'word-play', priority: 0.83, insertedAt: START }],
  }
}

function detailedQueue(
  id: string,
  status: 'completed' | 'interrupted',
  offset: number,
  level: QueueHistoryRecord['level'] = '기초',
  scope: QueueHistoryRecord['scope'] = 'standard',
): QueueHistoryRecord {
  const base = queue(id, status === 'completed' ? 2 : 1)
  const updatedAt = START + offset
  const components = {
    difficultyBase: 0.4,
    lowAccuracyBoost: 0.1,
    mistakeBoost: 0.3,
    recentWrongBoost: 0.03,
    scheduleBoost: 0,
    masteryBoost: 0,
    grammarBoost: 0,
    total: 0.83,
  }
  return {
    ...base,
    level,
    scope,
    generatedAt: START,
    startedAt: START,
    updatedAt,
    interruptedAt: status === 'interrupted' ? updatedAt : null,
    status,
    auditCompleteness: 'complete',
    candidateItemIds: ['word-play', 'word-book'],
    orderedItemIds: ['word-play', 'word-book'],
    itemExposureWeights: [
      { itemId: 'word-play', components, overdue: false },
      { itemId: 'word-book', components, overdue: false },
    ],
    priorityEntries: [{ itemId: 'word-play', priority: 0.83, insertedAt: START }],
  }
}

describe('tracking state', () => {
  it('creates independent empty level and quiz-type buckets', () => {
    const first = createEmptyTrackingState()
    const second = createEmptyTrackingState()

    first.quizTypeStats.기초['en-ko'].attempts = 1

    expect(second.quizTypeStats.기초['en-ko'].attempts).toBe(0)
    expect(second.quizTypeStats.기초['en-ko']).not.toBe(second.quizTypeStats.유치원['en-ko'])
    expect(second).not.toBe(first)
  })

  it('updates ease, due time, item schedule, last level, and daily totals from provided time', () => {
    const metadata = {
      itemKind: 'word' as const,
      itemLevel: '기초' as const,
      occurredAt: START,
      weight: 0.55,
    }
    const first = recordItemAttemptTracking(
      createEmptyTrackingState(),
      'word-play',
      '기초',
      true,
      metadata,
    )
    expect(first.itemSchedule['word-play']).toEqual({
      kind: 'word',
      level: '기초',
      ease: 2.6,
      lastSeenAt: START,
      nextDueAt: START + DAY_MS,
      weight: 0.55,
      lastLevel: '기초',
    })

    const secondAt = START + DAY_MS
    const second = recordItemAttemptTracking(first, 'word-play', '유치원', true, {
      ...metadata,
      occurredAt: secondAt,
      weight: 0.7,
    })
    expect(second.itemSchedule['word-play']).toMatchObject({
      ease: 2.7,
      lastSeenAt: secondAt,
      nextDueAt: secondAt + Math.round(DAY_MS * 2.7),
      weight: 0.7,
      lastLevel: '유치원',
    })

    const wrongAt = secondAt + 1_000
    const wrong = recordItemAttemptTracking(second, 'word-play', '기초', false, {
      ...metadata,
      occurredAt: wrongAt,
    })
    expect(wrong.itemSchedule['word-play']).toMatchObject({
      ease: 2.5,
      lastSeenAt: wrongAt,
      nextDueAt: wrongAt,
    })
    expect(wrong.dailyActivity['2026-08-20']).toMatchObject({ attempts: 1, correct: 1 })
    expect(wrong.dailyActivity['2026-08-21']).toMatchObject({ attempts: 2, correct: 1 })
  })

  it('ignores invalid runtime item metadata instead of creating an unloadable state', () => {
    const state = createEmptyTrackingState()

    expect(recordItemAttemptTracking(state, 'word-play', '기초', true, {
      itemKind: 'word',
      itemLevel: '기초',
      occurredAt: Number.NaN,
      weight: 0.5,
    })).toBe(state)
    expect(recordItemAttemptTracking(state, 'word-play', '기초', true, {
      itemKind: 'word',
      itemLevel: '기초',
      occurredAt: START,
      weight: -0.1,
    })).toBe(state)
  })

  it('persists quiz responses once and accumulates average time, reexposure, wrong runs, and adjustment', () => {
    const base = createEmptyTrackingState()
    const metadata = {
      itemKind: 'word' as const,
      itemLevel: '기초' as const,
      occurredAt: START,
      weight: 0.55,
      sessionId: 'quiz-1',
      questionId: 'q-1',
      questionType: 'en-ko' as const,
      quizType: 'en-ko' as const,
      answerTimeMs: 800,
      isReexposure: true,
      adjustment: 0.15,
    }
    const first = recordQuizAttemptTracking(
      base,
      'word-play',
      '기초',
      'normal',
      false,
      metadata,
    )
    const duplicate = recordQuizAttemptTracking(
      first,
      'word-play',
      '기초',
      'normal',
      false,
      metadata,
    )
    expect(duplicate).toBe(first)
    expect(duplicate.quizResponses).toHaveLength(1)
    expect(duplicate.quizTypeStats.기초['en-ko'].attempts).toBe(1)

    const second = recordQuizAttemptTracking(
      duplicate,
      'word-book',
      '기초',
      'hard',
      false,
      {
        ...metadata,
        questionId: 'q-2',
        occurredAt: START + 1_000,
        answerTimeMs: 1_200,
        isReexposure: false,
        adjustment: 0.3,
      },
    )
    expect(second.quizTypeStats.기초['en-ko']).toEqual({
      attempts: 2,
      correct: 0,
      totalAnswerTimeMs: 2_000,
      averageAnswerTimeMs: 1_000,
      reexposureAttempts: 1,
      reexposureCorrect: 0,
      wrongRunTransitions: 1,
      adjustmentTotal: 0.45,
    })
  })

  it('preserves signed quiz adjustments and rejects values outside the supported range', () => {
    const metadata = {
      itemKind: 'word' as const,
      itemLevel: '기초' as const,
      occurredAt: START,
      weight: 0.55,
      sessionId: 'quiz-negative',
      questionId: 'q-negative',
      questionType: 'en-ko' as const,
      quizType: 'en-ko' as const,
      answerTimeMs: 800,
      isReexposure: false,
      adjustment: -1,
    }
    const tracked = recordQuizAttemptTracking(
      createEmptyTrackingState(),
      'word-play',
      '기초',
      'normal',
      true,
      metadata,
    )

    expect(tracked.quizResponses[0]?.adjustment).toBe(-1)
    expect(tracked.quizTypeStats.기초['en-ko'].adjustmentTotal).toBe(-1)
    expect(recordQuizAttemptTracking(
      tracked,
      'word-book',
      '기초',
      'normal',
      true,
      { ...metadata, questionId: 'q-invalid', adjustment: -2.01 },
    )).toBe(tracked)
  })

  it('bounds detailed responses while retaining cumulative quiz statistics', () => {
    let state = createEmptyTrackingState()
    for (let index = 0; index <= MAX_QUIZ_RESPONSE_HISTORY; index += 1) {
      state = recordQuizAttemptTracking(
        state,
        `word-${index}`,
        '기초',
        'normal',
        true,
        {
          itemKind: 'word',
          itemLevel: '기초',
          occurredAt: START + index,
          weight: 0.4,
          sessionId: 'quiz-bound',
          questionId: `q-${index}`,
          questionType: 'en-ko',
          quizType: 'en-ko',
          answerTimeMs: 10,
          isReexposure: false,
          adjustment: 0,
        },
      )
    }

    expect(state.quizResponses).toHaveLength(MAX_QUIZ_RESPONSE_HISTORY)
    expect(state.quizResponses[0]?.questionId).toBe('q-1')
    expect(state.quizTypeStats.기초['en-ko'].attempts).toBe(MAX_QUIZ_RESPONSE_HISTORY + 1)
  })

  it('upserts session and queue records without double-counting activity and bounds history', () => {
    let state = createEmptyTrackingState()
    state = recordSessionTracking(state, session('study-1'))
    state = recordSessionTracking(state, session('study-1', START, START + 2_000))

    expect(state.sessionHistory).toHaveLength(1)
    expect(state.dailyActivity['2026-08-20']).toMatchObject({
      sessions: 1,
      durationMs: 2_000,
    })

    for (let index = 0; index <= MAX_SESSION_HISTORY; index += 1) {
      state = recordSessionTracking(state, session(`study-${index + 2}`))
    }
    expect(state.sessionHistory).toHaveLength(MAX_SESSION_HISTORY)

    state = recordQueueTracking(state, queue('queue-1'))
    state = recordQueueTracking(state, queue('queue-1', 1))
    expect(state.queueHistory).toHaveLength(1)
    expect(state.queueHistory[0]?.currentIndex).toBe(1)

    for (let index = 0; index <= MAX_QUEUE_HISTORY; index += 1) {
      state = recordQueueTracking(state, queue(`queue-${index + 2}`))
    }
    expect(state.queueHistory).toHaveLength(MAX_QUEUE_HISTORY)
  })

  it('keeps current and recoverable audits exact while compacting older queue summaries', () => {
    let state = createEmptyTrackingState()
    const recoverable = detailedQueue('recoverable', 'interrupted', 1)
    const previous = detailedQueue('previous', 'completed', 2)
    const current = detailedQueue('current', 'completed', 3)

    state = recordQueueTracking(state, recoverable)
    state = recordQueueTracking(state, previous)
    state = recordQueueTracking(state, current)

    const compacted = state.queueHistory.find(({ id }) => id === previous.id)
    expect(compacted).toMatchObject({
      id: previous.id,
      auditCompleteness: 'summary',
      queueSize: previous.queueSize,
      mistakeCount: previous.mistakeCount,
      priorityCount: previous.priorityCount,
      exposureComponents: previous.exposureComponents,
    })
    expect(compacted?.candidateItemIds).toEqual([])
    expect(compacted?.orderedItemIds).toEqual([])
    expect(compacted?.itemExposureWeights).toEqual([])
    expect(compacted?.priorityEntries).toEqual([])
    expect(compacted?.spacing.blockedItemIds).toEqual([])

    for (const exact of [recoverable, current]) {
      expect(state.queueHistory.find(({ id }) => id === exact.id)).toEqual(exact)
    }
    expect(state.queueHistory.filter(
      ({ level, scope, auditCompleteness }) => (
        level === '기초' && scope === 'standard' && auditCompleteness === 'complete'
      ),
    )).toHaveLength(MAX_DETAILED_QUEUE_HISTORY_PER_SCOPE_LEVEL)
  })

  it('retains an older recovery target even when global summary history reaches its bound', () => {
    let state = createEmptyTrackingState()
    const recovery = detailedQueue(
      'quiet-recovery',
      'interrupted',
      1,
      '중학교',
      'mistakes',
    )
    state = recordQueueTracking(state, recovery)
    for (let index = 0; index < MAX_QUEUE_HISTORY + 10; index += 1) {
      state = recordQueueTracking(
        state,
        detailedQueue(`completed-${index}`, 'completed', index + 2),
      )
    }

    expect(state.queueHistory).toHaveLength(MAX_QUEUE_HISTORY)
    expect(state.queueHistory.find(({ id }) => id === recovery.id)).toEqual(recovery)
    expect(state.queueHistory.filter(
      ({ auditCompleteness }) => auditCompleteness === 'complete',
    )).toHaveLength(2)
    expect(state.queueHistory.filter(
      ({ auditCompleteness }) => auditCompleteness === 'summary',
    )).toHaveLength(MAX_QUEUE_HISTORY - 2)
  })

  it('records bounded, ordered state-load history with monotonic sequences', () => {
    let state = createEmptyTrackingState()
    for (let index = 0; index < 55; index += 1) {
      state = recordStateLoadTracking(state, {
        occurredAt: START + index,
        outcome: index === 0 ? 'empty' : 'loaded',
        source: index === 0 ? 'empty' : 'current',
        sourceSchemaVersion: index === 0 ? null : 6,
        sourceTrackingVersion: index === 0 ? null : 2,
      })
    }

    expect(state.stateLoadHistory).toHaveLength(50)
    expect(state.stateLoadHistory[0]?.sequence).toBe(6)
    expect(state.stateLoadHistory.at(-1)).toMatchObject({
      sequence: 55,
      outcome: 'loaded',
      source: 'current',
    })

    let backward = createEmptyTrackingState()
    backward = recordStateLoadTracking(backward, {
      occurredAt: START,
      outcome: 'empty',
      source: 'empty',
      sourceSchemaVersion: null,
      sourceTrackingVersion: null,
    })
    backward = recordStateLoadTracking(backward, {
      occurredAt: START - 1,
      outcome: 'loaded',
      source: 'current',
      sourceSchemaVersion: 6,
      sourceTrackingVersion: 2,
    })
    expect(backward.stateLoadHistory.map(({ occurredAt }) => occurredAt)).toEqual([
      START,
      START,
    ])
  })
})
