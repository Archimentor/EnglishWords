import {
  DIFFICULTIES,
  GRAMMAR_LEVELS,
  LEVELS,
  type ContentKind,
  type Difficulty,
  type GrammarLevel,
  type Level,
} from '../content/types'
import { QUIZ_TYPES, type QuizType } from '../quiz/types'

export const MAX_QUIZ_RESPONSE_HISTORY = 2_000
export const MAX_SESSION_HISTORY = 100
export const MAX_QUEUE_HISTORY = 100
export const MAX_STATE_LOAD_HISTORY = 50
export const MAX_STUDY_QUEUE_SIZE = 500
export const MAX_STUDY_QUEUE_PRIORITY_COUNT = 3
export const TRACKING_SCHEMA_VERSION = 2 as const
export const MAX_DETAILED_QUEUE_HISTORY_PER_SCOPE_LEVEL = 2

export const TRACKING_SESSION_KINDS = ['study', 'quiz', 'grammar'] as const
export const TRACKING_SESSION_STATUSES = ['completed', 'interrupted'] as const
export const TRACKING_QUEUE_STATUSES = ['active', 'interrupted', 'completed'] as const
export const TRACKING_QUEUE_SCOPES = ['standard', 'mistakes'] as const
export const TRACKING_QUEUE_AUDIT_COMPLETENESS = [
  'legacy',
  'summary',
  'complete',
] as const
export const STATE_LOAD_OUTCOMES = ['empty', 'loaded', 'migrated', 'recovered'] as const
export const STATE_LOAD_SOURCES = [
  'empty',
  'current',
  'versioned',
  'legacy',
  'malformed',
  'storage-error',
] as const

export type TrackingSessionKind = (typeof TRACKING_SESSION_KINDS)[number]
export type TrackingSessionStatus = (typeof TRACKING_SESSION_STATUSES)[number]
export type TrackingQueueStatus = (typeof TRACKING_QUEUE_STATUSES)[number]
export type TrackingQueueScope = (typeof TRACKING_QUEUE_SCOPES)[number]
export type TrackingQueueAuditCompleteness =
  (typeof TRACKING_QUEUE_AUDIT_COMPLETENESS)[number]
export type StateLoadOutcome = (typeof STATE_LOAD_OUTCOMES)[number]
export type StateLoadSource = (typeof STATE_LOAD_SOURCES)[number]

export interface StateLoadHistoryRecord {
  sequence: number
  occurredAt: number
  outcome: StateLoadOutcome
  source: StateLoadSource
  sourceSchemaVersion: number | null
  sourceTrackingVersion: number | null
}

export interface DailyActivityRecord {
  sessions: number
  attempts: number
  correct: number
  durationMs: number
}

export interface ItemScheduleRecord {
  kind: ContentKind
  level: Level
  ease: number
  lastSeenAt: number
  nextDueAt: number
  weight: number
  lastLevel: Level
}

export interface QuizResponseRecord {
  sessionId: string
  questionId: string
  sourceItemId: string
  questionType: QuizType
  quizType: QuizType
  level: Level
  isCorrect: boolean
  answerTimeMs: number
  difficultyUsed: Difficulty
  answeredAt: number
  isReexposure: boolean
  adjustment: number
}

export interface QuizTypeTrackingStats {
  attempts: number
  correct: number
  totalAnswerTimeMs: number
  averageAnswerTimeMs: number
  reexposureAttempts: number
  reexposureCorrect: number
  wrongRunTransitions: number
  adjustmentTotal: number
}

export type QuizTypeTrackingByLevel = Record<
  Level,
  Record<QuizType, QuizTypeTrackingStats>
>

export interface SessionQuizTypePerformance {
  attempts: number
  correct: number
  totalAnswerTimeMs: number
}

export interface SessionPerformance {
  attempts: number
  correct: number
  byQuizType: Record<QuizType, SessionQuizTypePerformance>
}

export interface SessionAdjustments {
  mistakeBoost: number
  difficultyBoost: number
  priority: number
}

export interface SessionHistoryRecord {
  id: string
  kind: TrackingSessionKind
  level: Level | GrammarLevel
  startedAt: number
  endedAt: number
  durationMs: number
  status: TrackingSessionStatus
  performance: SessionPerformance
  adjustments: SessionAdjustments
}

export interface ExposureWeightComponents {
  difficultyBase: number
  lowAccuracyBoost: number
  mistakeBoost: number
  recentWrongBoost: number
  scheduleBoost: number
  masteryBoost: number
  grammarBoost: number
}

export interface QueueExposureComponents extends ExposureWeightComponents {
  total: number
}

export interface QueueItemExposureRecord {
  itemId: string
  components: QueueExposureComponents
  overdue: boolean
}

export const SPACING_EXCEPTION_POLICIES = ['strict', 'exam-density'] as const
export type SpacingExceptionPolicy = (typeof SPACING_EXCEPTION_POLICIES)[number]

export interface QueueSpacingAudit {
  minimumDistinctItems: 1
  exceptionPolicy: SpacingExceptionPolicy
  exceptionApplied: boolean
  blockedItemIds: string[]
}

export interface QueueHistoryRecord {
  id: string
  sessionId: string
  scope: TrackingQueueScope
  level: Level
  generatedAt: number
  startedAt: number
  updatedAt: number
  interruptedAt: number | null
  status: TrackingQueueStatus
  selectedDifficulty: Difficulty
  difficultyMix: Record<Difficulty, number>
  queueSize: number
  currentIndex: number
  recoveryIndex: number
  recovered: boolean
  mistakeCount: number
  priorityCount: number
  overdueCount: number
  exposureComponents: QueueExposureComponents
  auditCompleteness: TrackingQueueAuditCompleteness
  candidateItemIds: string[]
  orderedItemIds: string[]
  itemExposureWeights: QueueItemExposureRecord[]
  spacing: QueueSpacingAudit
  priorityEntries: Array<{
    itemId: string
    priority: number
    insertedAt: number
  }>
}

export interface TrackingState {
  trackingVersion: typeof TRACKING_SCHEMA_VERSION
  dailyActivity: Record<string, DailyActivityRecord>
  itemSchedule: Record<string, ItemScheduleRecord>
  quizResponses: QuizResponseRecord[]
  quizTypeStats: QuizTypeTrackingByLevel
  sessionHistory: SessionHistoryRecord[]
  queueHistory: QueueHistoryRecord[]
  stateLoadHistory: StateLoadHistoryRecord[]
}

export interface ItemAttemptTrackingMetadata {
  itemKind: ContentKind
  itemLevel: Level
  occurredAt: number
  weight: number
  session?: SessionHistoryRecord
}

export interface QuizAttemptTrackingMetadata extends ItemAttemptTrackingMetadata {
  sessionId: string
  questionId: string
  questionType: QuizType
  quizType: QuizType
  answerTimeMs: number
  isReexposure: boolean
  adjustment: number
}

export interface GrammarAttemptTrackingMetadata {
  occurredAt: number
  session?: SessionHistoryRecord
}

const DAY_MS = 24 * 60 * 60 * 1_000
const INITIAL_EASE = 2.5
const MIN_EASE = 1.3
const MAX_EASE = 3

function emptyQuizTypeStats(): QuizTypeTrackingStats {
  return {
    attempts: 0,
    correct: 0,
    totalAnswerTimeMs: 0,
    averageAnswerTimeMs: 0,
    reexposureAttempts: 0,
    reexposureCorrect: 0,
    wrongRunTransitions: 0,
    adjustmentTotal: 0,
  }
}

export function createEmptyQuizTypeTrackingByLevel(): QuizTypeTrackingByLevel {
  return Object.fromEntries(LEVELS.map((level) => [
    level,
    Object.fromEntries(QUIZ_TYPES.map((type) => [type, emptyQuizTypeStats()])),
  ])) as QuizTypeTrackingByLevel
}

export function createEmptyTrackingState(): TrackingState {
  return {
    trackingVersion: TRACKING_SCHEMA_VERSION,
    dailyActivity: {},
    itemSchedule: {},
    quizResponses: [],
    quizTypeStats: createEmptyQuizTypeTrackingByLevel(),
    sessionHistory: [],
    queueHistory: [],
    stateLoadHistory: [],
  }
}

export function createEmptySessionQuizTypePerformance(): Record<
  QuizType,
  SessionQuizTypePerformance
> {
  return Object.fromEntries(QUIZ_TYPES.map((type) => [type, {
    attempts: 0,
    correct: 0,
    totalAnswerTimeMs: 0,
  }])) as Record<QuizType, SessionQuizTypePerformance>
}

export function createEmptyDifficultyMix(): Record<Difficulty, number> {
  return Object.fromEntries(DIFFICULTIES.map((difficulty) => [difficulty, 0])) as Record<
    Difficulty,
    number
  >
}

function boundedIntegerAdd(value: number, delta: number): number {
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, value + delta))
}

function boundedNumberAdd(value: number, delta: number): number {
  const next = value + delta
  if (!Number.isFinite(next)) return Number.MAX_SAFE_INTEGER
  return normalizeTrackingDecimal(Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, next)))
}

function boundedSignedNumberAdd(value: number, delta: number): number {
  const next = value + delta
  if (!Number.isFinite(next)) {
    return next < 0 ? -Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
  }
  return normalizeTrackingDecimal(
    Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, next)),
  )
}

export function normalizeTrackingDecimal(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 1_000_000) {
    return value
  }
  return Math.round(value * 1_000_000) / 1_000_000
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function isQuizAdjustment(value: number): boolean {
  return Number.isFinite(value) && value >= -2 && value <= 2
}

function isTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

export function isItemAttemptTrackingMetadataValid(
  metadata: ItemAttemptTrackingMetadata,
): boolean {
  return (
    (metadata.itemKind === 'word' || metadata.itemKind === 'phrasalVerb') &&
    (LEVELS as readonly string[]).includes(metadata.itemLevel) &&
    isTimestamp(metadata.occurredAt) &&
    isNonNegativeFinite(metadata.weight)
  )
}

export function isQuizAttemptTrackingMetadataValid(
  metadata: QuizAttemptTrackingMetadata,
): boolean {
  return isItemAttemptTrackingMetadataValid(metadata) &&
    metadata.sessionId.trim().length > 0 &&
    metadata.questionId.trim().length > 0 &&
    metadata.questionType === metadata.quizType &&
    (QUIZ_TYPES as readonly string[]).includes(metadata.quizType) &&
    isNonNegativeFinite(metadata.answerTimeMs) &&
    isQuizAdjustment(metadata.adjustment)
}

export function activityDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear().toString().padStart(4, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

function updateDailyActivity(
  tracking: TrackingState,
  at: number,
  delta: Partial<DailyActivityRecord>,
): TrackingState {
  const key = activityDateKey(at)
  const previous = tracking.dailyActivity[key] ?? {
    sessions: 0,
    attempts: 0,
    correct: 0,
    durationMs: 0,
  }
  const next: DailyActivityRecord = {
    sessions: boundedIntegerAdd(previous.sessions, delta.sessions ?? 0),
    attempts: boundedIntegerAdd(previous.attempts, delta.attempts ?? 0),
    correct: boundedIntegerAdd(previous.correct, delta.correct ?? 0),
    durationMs: boundedNumberAdd(previous.durationMs, delta.durationMs ?? 0),
  }
  return {
    ...tracking,
    dailyActivity: { ...tracking.dailyActivity, [key]: next },
  }
}

function nextEase(previous: ItemScheduleRecord | undefined, correct: boolean): number {
  const value = (previous?.ease ?? INITIAL_EASE) + (correct ? 0.1 : -0.2)
  return Math.min(MAX_EASE, Math.max(MIN_EASE, Number(value.toFixed(2))))
}

function nextDueAt(
  previous: ItemScheduleRecord | undefined,
  occurredAt: number,
  ease: number,
  correct: boolean,
): number {
  if (!correct) return occurredAt
  if (!previous) return occurredAt + DAY_MS
  const previousInterval = Math.max(DAY_MS, previous.nextDueAt - previous.lastSeenAt)
  return occurredAt + Math.round(previousInterval * ease)
}

export function recordItemAttemptTracking(
  tracking: TrackingState,
  itemId: string,
  lastLevel: Level,
  correct: boolean,
  metadata: ItemAttemptTrackingMetadata,
): TrackingState {
  if (!itemId.trim() || !isItemAttemptTrackingMetadataValid(metadata)) return tracking
  const previous = tracking.itemSchedule[itemId]
  const ease = nextEase(previous, correct)
  const schedule: ItemScheduleRecord = {
    kind: metadata.itemKind,
    level: metadata.itemLevel,
    ease,
    lastSeenAt: metadata.occurredAt,
    nextDueAt: nextDueAt(previous, metadata.occurredAt, ease, correct),
    weight: metadata.weight,
    lastLevel,
  }
  return updateDailyActivity({
    ...tracking,
    itemSchedule: { ...tracking.itemSchedule, [itemId]: schedule },
  }, metadata.occurredAt, {
    attempts: 1,
    correct: correct ? 1 : 0,
  })
}

function appendQuizResponse(
  tracking: TrackingState,
  response: QuizResponseRecord,
): TrackingState {
  const duplicate = tracking.quizResponses.some(({ sessionId, questionId }) =>
    sessionId === response.sessionId && questionId === response.questionId)
  if (duplicate) return tracking

  const previousResponse = [...tracking.quizResponses]
    .reverse()
    .find(({ sessionId }) => sessionId === response.sessionId)
  const previous = tracking.quizTypeStats[response.level][response.quizType]
  const attempts = boundedIntegerAdd(previous.attempts, 1)
  const totalAnswerTimeMs = boundedNumberAdd(
    previous.totalAnswerTimeMs,
    response.answerTimeMs,
  )
  const stats: QuizTypeTrackingStats = {
    attempts,
    correct: boundedIntegerAdd(previous.correct, response.isCorrect ? 1 : 0),
    totalAnswerTimeMs,
    averageAnswerTimeMs: attempts === 0
      ? 0
      : normalizeTrackingDecimal(totalAnswerTimeMs / attempts),
    reexposureAttempts: boundedIntegerAdd(
      previous.reexposureAttempts,
      response.isReexposure ? 1 : 0,
    ),
    reexposureCorrect: boundedIntegerAdd(
      previous.reexposureCorrect,
      response.isReexposure && response.isCorrect ? 1 : 0,
    ),
    wrongRunTransitions: boundedIntegerAdd(
      previous.wrongRunTransitions,
      previousResponse && !previousResponse.isCorrect && !response.isCorrect ? 1 : 0,
    ),
    adjustmentTotal: boundedSignedNumberAdd(previous.adjustmentTotal, response.adjustment),
  }

  return {
    ...tracking,
    quizResponses: [...tracking.quizResponses, response]
      .slice(-MAX_QUIZ_RESPONSE_HISTORY),
    quizTypeStats: {
      ...tracking.quizTypeStats,
      [response.level]: {
        ...tracking.quizTypeStats[response.level],
        [response.quizType]: stats,
      },
    },
  }
}

export function recordQuizAttemptTracking(
  tracking: TrackingState,
  itemId: string,
  level: Level,
  difficulty: Difficulty,
  correct: boolean,
  metadata: QuizAttemptTrackingMetadata,
): TrackingState {
  if (!isQuizAttemptTrackingMetadataValid(metadata)) {
    return tracking
  }
  if (tracking.quizResponses.some(({ sessionId, questionId }) =>
    sessionId === metadata.sessionId && questionId === metadata.questionId)) {
    return tracking
  }
  const withItem = recordItemAttemptTracking(
    tracking,
    itemId,
    level,
    correct,
    metadata,
  )
  return appendQuizResponse(withItem, {
    sessionId: metadata.sessionId,
    questionId: metadata.questionId,
    sourceItemId: itemId,
    questionType: metadata.questionType,
    quizType: metadata.quizType,
    level,
    isCorrect: correct,
    answerTimeMs: metadata.answerTimeMs,
    difficultyUsed: difficulty,
    answeredAt: metadata.occurredAt,
    isReexposure: metadata.isReexposure,
    adjustment: metadata.adjustment,
  })
}

function removeSessionActivity(
  tracking: TrackingState,
  session: SessionHistoryRecord,
): TrackingState {
  return updateDailyActivity(tracking, session.endedAt, {
    sessions: -1,
    durationMs: -session.durationMs,
  })
}

export function recordSessionTracking(
  tracking: TrackingState,
  session: SessionHistoryRecord,
): TrackingState {
  const previous = tracking.sessionHistory.find(({ id }) => id === session.id)
  let base = previous ? removeSessionActivity(tracking, previous) : tracking
  const history = [
    ...base.sessionHistory.filter(({ id }) => id !== session.id),
    session,
  ].slice(-MAX_SESSION_HISTORY)
  base = { ...base, sessionHistory: history }
  return updateDailyActivity(base, session.endedAt, {
    sessions: 1,
    durationMs: session.durationMs,
  })
}

export function recordQueueTracking(
  tracking: TrackingState,
  queue: QueueHistoryRecord,
): TrackingState {
  return {
    ...tracking,
    queueHistory: compactQueueHistory([
      ...tracking.queueHistory.filter(({ id }) => id !== queue.id),
      queue,
    ]),
  }
}

function queueRetentionKey(queue: QueueHistoryRecord): string {
  return `${queue.level}\u0000${queue.scope}`
}

function protectedDetailedQueueIds(
  queueHistory: readonly QueueHistoryRecord[],
): Set<string> {
  const latest = new Map<string, string>()
  const latestRecoverable = new Map<string, string>()
  for (const queue of queueHistory) {
    const key = queueRetentionKey(queue)
    latest.set(key, queue.id)
    if (queue.status !== 'completed') latestRecoverable.set(key, queue.id)
  }
  return new Set([...latest.values(), ...latestRecoverable.values()])
}

function compactQueueRecord(queue: QueueHistoryRecord): QueueHistoryRecord {
  if (queue.auditCompleteness !== 'complete') return queue
  return {
    ...queue,
    auditCompleteness: 'summary',
    candidateItemIds: [],
    orderedItemIds: [],
    itemExposureWeights: [],
    spacing: {
      ...queue.spacing,
      blockedItemIds: [],
    },
    priorityEntries: [],
  }
}

/**
 * Keeps exact audit payloads for the current and recoverable queue in every
 * level/scope bucket. Older records retain scalar analytics as compact
 * summaries, so repeated full-catalog sessions cannot grow storage linearly.
 */
export function compactQueueHistory(
  queueHistory: readonly QueueHistoryRecord[],
): QueueHistoryRecord[] {
  const protectedIds = protectedDetailedQueueIds(queueHistory)
  const retainedIds = new Set(protectedIds)
  let remaining = Math.max(0, MAX_QUEUE_HISTORY - retainedIds.size)
  for (let index = queueHistory.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const id = queueHistory[index]!.id
    if (retainedIds.has(id)) continue
    retainedIds.add(id)
    remaining -= 1
  }

  return queueHistory
    .filter(({ id }) => retainedIds.has(id))
    .map((queue) => protectedIds.has(queue.id) ? queue : compactQueueRecord(queue))
}

export function compactTrackingQueueHistory(tracking: TrackingState): TrackingState {
  const queueHistory = compactQueueHistory(tracking.queueHistory)
  const unchanged = queueHistory.length === tracking.queueHistory.length &&
    queueHistory.every((queue, index) => queue === tracking.queueHistory[index])
  return unchanged ? tracking : { ...tracking, queueHistory }
}

export function recordStateLoadTracking(
  tracking: TrackingState,
  event: Omit<StateLoadHistoryRecord, 'sequence'>,
): TrackingState {
  let retained = tracking.stateLoadHistory.slice(-(MAX_STATE_LOAD_HISTORY - 1))
  const previousSequence = retained.reduce(
    (maximum, record) => Math.max(maximum, record.sequence),
    0,
  )
  if (previousSequence >= Number.MAX_SAFE_INTEGER) {
    retained = retained.map((record, index) => ({ ...record, sequence: index + 1 }))
  }
  const sequence = (retained.at(-1)?.sequence ?? 0) + 1
  const previousOccurredAt = retained.at(-1)?.occurredAt ?? 0
  const occurredAt = Number.isSafeInteger(event.occurredAt) && event.occurredAt >= 0
    ? Math.max(previousOccurredAt, event.occurredAt)
    : previousOccurredAt
  return {
    ...tracking,
    stateLoadHistory: [
      ...retained,
      { ...event, sequence, occurredAt },
    ],
  }
}

export function recordGrammarAttemptTracking(
  tracking: TrackingState,
  correct: boolean,
  metadata: GrammarAttemptTrackingMetadata,
): TrackingState {
  if (!isTimestamp(metadata.occurredAt)) return tracking
  let next = updateDailyActivity(tracking, metadata.occurredAt, {
    attempts: 1,
    correct: correct ? 1 : 0,
  })
  if (metadata.session) next = recordSessionTracking(next, metadata.session)
  return next
}

export function isTrackingLevel(value: string): value is Level | GrammarLevel {
  return (LEVELS as readonly string[]).includes(value) ||
    (GRAMMAR_LEVELS as readonly string[]).includes(value)
}
