import { describe, expect, test } from 'vitest'
import { createEmptyTrackingState } from './tracking'
import {
  difficultyCalibrationMetrics,
  learnerSummaryMetrics,
  levelSessionCount,
  queueHealthMetrics,
  quizTypeOperationalMetrics,
} from './analytics'
import { createEmptyLevelStudyAnalytics } from '../../state/appState'

const DAY = 24 * 60 * 60 * 1_000

describe('progress analytics', () => {
  test('derives consecutive local learning days, recent rate, accuracy, and latest queue remainder', () => {
    const now = new Date(2026, 7, 19, 8).getTime()
    const tracking = createEmptyTrackingState()
    for (const offset of [0, -1, -2, -4]) {
      const date = new Date(now + offset * DAY)
      const key = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-')
      tracking.dailyActivity[key] = {
        sessions: 1,
        attempts: 5,
        correct: 4,
        durationMs: 1_000,
      }
    }
    tracking.queueHistory = [
      {
        id: 'old', sessionId: 'old', scope: 'standard', level: '기초', generatedAt: now - DAY,
        startedAt: now - DAY, updatedAt: now - DAY, interruptedAt: null,
        status: 'interrupted', selectedDifficulty: 'normal',
        difficultyMix: { veryEasy: 0, easy: 0, normal: 10, hard: 0, veryHard: 0 },
        queueSize: 10, currentIndex: 2, recoveryIndex: 2, recovered: false,
        mistakeCount: 0, priorityCount: 0, overdueCount: 0,
        exposureComponents: {
          difficultyBase: 1, lowAccuracyBoost: 0, mistakeBoost: 0,
          recentWrongBoost: 0, scheduleBoost: 0, masteryBoost: 0,
          grammarBoost: 0, total: 1,
        },
        auditCompleteness: 'legacy', candidateItemIds: [], orderedItemIds: [],
        itemExposureWeights: [], spacing: {
          minimumDistinctItems: 1, exceptionPolicy: 'strict',
          exceptionApplied: false, blockedItemIds: [],
        },
        priorityEntries: [],
      },
      {
        id: 'latest', sessionId: 'latest', scope: 'standard', level: '기초', generatedAt: now,
        startedAt: now, updatedAt: now, interruptedAt: null,
        status: 'active', selectedDifficulty: 'normal',
        difficultyMix: { veryEasy: 0, easy: 0, normal: 12, hard: 0, veryHard: 0 },
        queueSize: 12, currentIndex: 5, recoveryIndex: 0, recovered: true,
        mistakeCount: 0, priorityCount: 0, overdueCount: 0,
        exposureComponents: {
          difficultyBase: 1, lowAccuracyBoost: 0, mistakeBoost: 0,
          recentWrongBoost: 0, scheduleBoost: 0, masteryBoost: 0,
          grammarBoost: 0, total: 1,
        },
        auditCompleteness: 'legacy', candidateItemIds: [], orderedItemIds: [],
        itemExposureWeights: [], spacing: {
          minimumDistinctItems: 1, exceptionPolicy: 'strict',
          exceptionApplied: false, blockedItemIds: [],
        },
        priorityEntries: [],
      },
    ]

    expect(learnerSummaryMetrics(tracking, '기초', now)).toEqual({
      currentStreakDays: 3,
      recentActivityRate: 4 / 7,
      overallAccuracy: 0.8,
      incompleteQueueSize: 7,
    })
  })

  test('isolates level sessions and calculates difficulty selection-correct gaps', () => {
    const tracking = createEmptyTrackingState()
    tracking.sessionHistory = [
      {
        id: 'study', kind: 'study', level: '기초', startedAt: 1, endedAt: 2,
        durationMs: 1, status: 'completed',
        performance: { attempts: 1, correct: 1, byQuizType: {
          'en-ko': { attempts: 0, correct: 0, totalAnswerTimeMs: 0 },
          'ko-en': { attempts: 0, correct: 0, totalAnswerTimeMs: 0 },
          'sentence-meaning': { attempts: 0, correct: 0, totalAnswerTimeMs: 0 },
          'sentence-blank': { attempts: 0, correct: 0, totalAnswerTimeMs: 0 },
          dictation: { attempts: 0, correct: 0, totalAnswerTimeMs: 0 },
          'sentence-transform': { attempts: 0, correct: 0, totalAnswerTimeMs: 0 },
        } },
        adjustments: { mistakeBoost: 0, difficultyBoost: 0, priority: 0 },
      },
      {
        id: 'other', kind: 'quiz', level: '유치원', startedAt: 1, endedAt: 2,
        durationMs: 1, status: 'completed',
        performance: { attempts: 0, correct: 0, byQuizType: {
          'en-ko': { attempts: 0, correct: 0, totalAnswerTimeMs: 0 },
          'ko-en': { attempts: 0, correct: 0, totalAnswerTimeMs: 0 },
          'sentence-meaning': { attempts: 0, correct: 0, totalAnswerTimeMs: 0 },
          'sentence-blank': { attempts: 0, correct: 0, totalAnswerTimeMs: 0 },
          dictation: { attempts: 0, correct: 0, totalAnswerTimeMs: 0 },
          'sentence-transform': { attempts: 0, correct: 0, totalAnswerTimeMs: 0 },
        } },
        adjustments: { mistakeBoost: 0, difficultyBoost: 0, priority: 0 },
      },
    ]
    expect(levelSessionCount(tracking, '기초')).toBe(1)

    const analytics = createEmptyLevelStudyAnalytics()
    analytics.selectedDifficulty.easy = 3
    analytics.selectedDifficulty.hard = 1
    const metrics = difficultyCalibrationMetrics(analytics, {
      veryEasy: { attempts: 0, correct: 0 },
      easy: { attempts: 4, correct: 2 },
      normal: { attempts: 0, correct: 0 },
      hard: { attempts: 4, correct: 1 },
      veryHard: { attempts: 0, correct: 0 },
    })
    expect(metrics.find(({ difficulty }) => difficulty === 'easy')).toMatchObject({
      selectedRate: 0.75,
      quizAccuracy: 0.5,
      selectionAccuracyGap: 0.25,
    })
  })

  test('derives six quiz operational metrics and level queue health', () => {
    const tracking = createEmptyTrackingState()
    tracking.quizTypeStats.기초['en-ko'] = {
      attempts: 4,
      correct: 3,
      totalAnswerTimeMs: 8_000,
      averageAnswerTimeMs: 2_000,
      reexposureAttempts: 2,
      reexposureCorrect: 1,
      wrongRunTransitions: 1,
      adjustmentTotal: 0.4,
    }
    tracking.itemSchedule.a = {
      kind: 'word', level: '기초', ease: 2, lastSeenAt: 1,
      nextDueAt: 10, weight: 1, lastLevel: '기초',
    }
    tracking.itemSchedule.b = {
      kind: 'word', level: '기초', ease: 2, lastSeenAt: 1,
      nextDueAt: 30, weight: 1, lastLevel: '기초',
    }

    const typeMetrics = quizTypeOperationalMetrics(tracking, '기초')
    expect(typeMetrics).toHaveLength(6)
    expect(typeMetrics[0]).toMatchObject({
      type: 'en-ko', attempts: 4, accuracy: 0.75,
      averageAnswerTimeMs: 2_000, reexposureEfficiency: 0.5,
      wrongRunRate: 1 / 3, averageAdjustment: 0.1,
    })

    expect(queueHealthMetrics(
      tracking,
      {
        a: { wrongCount: 1, wrongStreak: 1, priorityRemaining: 0 },
        b: { wrongCount: 2, wrongStreak: 2, priorityRemaining: 3 },
      },
      '기초',
      new Set(['a', 'b', 'c', 'd']),
      20,
    )).toEqual({
      mistakeBankRatio: 0.5,
      prioritySaturation: 0.25,
      overdueItems: 1,
    })
  })
})
