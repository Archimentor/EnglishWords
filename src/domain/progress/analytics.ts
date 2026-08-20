import {
  DIFFICULTIES,
  type Difficulty,
  type Level,
} from '../content/types'
import { QUIZ_TYPES, type QuizType } from '../quiz/types'
import type {
  DifficultyStats,
  LevelStudyAnalytics,
  MistakeRecord,
} from './types'
import {
  activityDateKey,
  type QueueHistoryRecord,
  type TrackingState,
} from './tracking'

const RECENT_ACTIVITY_DAYS = 7

export interface LearnerSummaryMetrics {
  currentStreakDays: number
  recentActivityRate: number
  overallAccuracy: number
  incompleteQueueSize: number
}

export interface DifficultyCalibrationMetric {
  difficulty: Difficulty
  selectedRate: number
  quizAccuracy: number
  selectionAccuracyGap: number
}

export interface QuizTypeOperationalMetric {
  type: QuizType
  attempts: number
  accuracy: number
  averageAnswerTimeMs: number
  reexposureEfficiency: number
  wrongRunRate: number
  averageAdjustment: number
}

export interface QueueHealthMetrics {
  mistakeBankRatio: number
  prioritySaturation: number
  overdueItems: number
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function isActiveDay(
  activity: TrackingState['dailyActivity'][string] | undefined,
): boolean {
  return Boolean(
    activity && (
      activity.sessions > 0 ||
      activity.attempts > 0 ||
      activity.durationMs > 0
    ),
  )
}

function calendarDay(timestamp: number, offset: number): number {
  const date = new Date(timestamp)
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return date.getTime()
}

function latestIncompleteQueue(
  queues: readonly QueueHistoryRecord[],
  level: Level,
): QueueHistoryRecord | undefined {
  return queues
    .filter((queue) => queue.level === level && queue.status !== 'completed')
    .reduce<QueueHistoryRecord | undefined>((latest, queue) => (
      !latest || queue.updatedAt > latest.updatedAt ? queue : latest
    ), undefined)
}

export function learnerSummaryMetrics(
  tracking: TrackingState,
  level: Level,
  now: number,
): LearnerSummaryMetrics {
  let currentStreakDays = 0
  for (let offset = 0; ; offset -= 1) {
    const key = activityDateKey(calendarDay(now, offset))
    if (!isActiveDay(tracking.dailyActivity[key])) break
    currentStreakDays += 1
  }

  let activeRecentDays = 0
  for (let offset = 0; offset > -RECENT_ACTIVITY_DAYS; offset -= 1) {
    const key = activityDateKey(calendarDay(now, offset))
    if (isActiveDay(tracking.dailyActivity[key])) activeRecentDays += 1
  }

  const activityTotals = Object.values(tracking.dailyActivity).reduce(
    (totals, activity) => ({
      attempts: totals.attempts + activity.attempts,
      correct: totals.correct + activity.correct,
    }),
    { attempts: 0, correct: 0 },
  )
  const incomplete = latestIncompleteQueue(tracking.queueHistory, level)

  return {
    currentStreakDays,
    recentActivityRate: activeRecentDays / RECENT_ACTIVITY_DAYS,
    overallAccuracy: activityTotals.attempts === 0
      ? 0
      : clampRatio(activityTotals.correct / activityTotals.attempts),
    incompleteQueueSize: incomplete
      ? Math.max(0, incomplete.queueSize - incomplete.currentIndex)
      : 0,
  }
}

export function levelSessionCount(
  tracking: TrackingState,
  level: Level,
): number {
  return tracking.sessionHistory.filter((session) => session.level === level).length
}

export function difficultyCalibrationMetrics(
  analytics: LevelStudyAnalytics,
  difficultyStats: Readonly<Record<Difficulty, DifficultyStats>>,
): DifficultyCalibrationMetric[] {
  const totalSelections = Object.values(analytics.selectedDifficulty)
    .reduce((total, count) => total + count, 0)

  return DIFFICULTIES.map((difficulty) => {
    const selectedRate = totalSelections === 0
      ? 0
      : clampRatio(analytics.selectedDifficulty[difficulty] / totalSelections)
    const stats = difficultyStats[difficulty]
    const quizAccuracy = stats.attempts === 0
      ? 0
      : clampRatio(stats.correct / stats.attempts)
    return {
      difficulty,
      selectedRate,
      quizAccuracy,
      selectionAccuracyGap: selectedRate - quizAccuracy,
    }
  })
}

export function quizTypeOperationalMetrics(
  tracking: TrackingState,
  level: Level,
): QuizTypeOperationalMetric[] {
  return QUIZ_TYPES.map((type) => {
    const stats = tracking.quizTypeStats[level][type]
    return {
      type,
      attempts: stats.attempts,
      accuracy: stats.attempts === 0 ? 0 : clampRatio(stats.correct / stats.attempts),
      averageAnswerTimeMs: stats.averageAnswerTimeMs,
      reexposureEfficiency: stats.reexposureAttempts === 0
        ? 0
        : clampRatio(stats.reexposureCorrect / stats.reexposureAttempts),
      wrongRunRate: stats.attempts <= 1
        ? 0
        : clampRatio(stats.wrongRunTransitions / (stats.attempts - 1)),
      averageAdjustment: stats.attempts === 0
        ? 0
        : stats.adjustmentTotal / stats.attempts,
    }
  })
}

export function queueHealthMetrics(
  tracking: TrackingState,
  mistakes: Readonly<Record<string, MistakeRecord>>,
  level: Level,
  levelItemIds: ReadonlySet<string>,
  now: number,
): QueueHealthMetrics {
  const denominator = levelItemIds.size
  const mistakeCount = [...levelItemIds].filter((itemId) => (
    (mistakes[itemId]?.wrongCount ?? 0) > 0
  )).length
  const priorityCount = [...levelItemIds].filter((itemId) => (
    (mistakes[itemId]?.priorityRemaining ?? 0) > 0
  )).length
  const overdueItems = Object.entries(tracking.itemSchedule).filter(
    ([itemId, schedule]) => (
      levelItemIds.has(itemId) &&
      schedule.level === level &&
      Number.isFinite(schedule.nextDueAt) &&
      schedule.nextDueAt <= now
    ),
  ).length

  return {
    mistakeBankRatio: denominator === 0 ? 0 : mistakeCount / denominator,
    prioritySaturation: denominator === 0 ? 0 : priorityCount / denominator,
    overdueItems,
  }
}
