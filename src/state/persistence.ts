import {
  DIFFICULTIES,
  GRAMMAR_EXERCISE_PHASES,
  GRAMMAR_LEVELS,
  LEVELS,
} from '../domain/content/types'
import type {
  DifficultyStatsByLevel,
  DifficultyStats,
  LevelDifficultyStats,
  LevelStudyAnalytics,
  StudyAnalytics,
} from '../domain/progress/types'
import {
  MAX_QUEUE_HISTORY,
  MAX_QUIZ_RESPONSE_HISTORY,
  MAX_SESSION_HISTORY,
  MAX_STUDY_QUEUE_PRIORITY_COUNT,
  MAX_STUDY_QUEUE_SIZE,
  MAX_STATE_LOAD_HISTORY,
  SPACING_EXCEPTION_POLICIES,
  STATE_LOAD_OUTCOMES,
  STATE_LOAD_SOURCES,
  TRACKING_QUEUE_AUDIT_COMPLETENESS,
  TRACKING_QUEUE_SCOPES,
  TRACKING_QUEUE_STATUSES,
  TRACKING_SCHEMA_VERSION,
  TRACKING_SESSION_KINDS,
  TRACKING_SESSION_STATUSES,
  createEmptyTrackingState,
  compactTrackingQueueHistory,
  isTrackingLevel,
  recordStateLoadTracking,
  type DailyActivityRecord,
  type ItemScheduleRecord,
  type QueueHistoryRecord,
  type QuizResponseRecord,
  type QuizTypeTrackingByLevel,
  type QuizTypeTrackingStats,
  type SessionHistoryRecord,
  type TrackingState,
  normalizeTrackingDecimal,
} from '../domain/progress/tracking'
import {
  grammarProductionReviewCount,
  isGrammarProductionSubmissionStructurallyValid,
  latestGrammarExerciseResults,
  type GrammarProductionEvidenceReference,
  type GrammarProductionRecord,
  type GrammarProductionRequirementEvidence,
  type GrammarExerciseResult,
  type GrammarMastery,
} from '../domain/grammar/mastery'
import { grammarProductionConstraintsForLevel } from '../domain/grammar/productionConstraints'
import { QUIZ_TYPES, type QuizTypeStats } from '../domain/quiz/types'
import {
  createEmptyDifficultyStatsByLevel,
  createEmptyStudyAnalytics,
  createInitialState,
  GRAMMAR_SECTIONS,
  SECTIONS,
  type AppState,
  type NavigationState,
  type StudySessionSnapshot,
} from './appState'

export const STORAGE_KEY = 'wordMasterMainMenuState'
export const BACKUP_STORAGE_KEY = `${STORAGE_KEY}:recoveryBackup`

export type LoadStatus = 'empty' | 'loaded' | 'migrated' | 'recovered'

export interface LoadResult {
  state: AppState
  status: LoadStatus
  warning: string | null
  rawBackup: string | null
}

export type SaveResult = { ok: true } | { ok: false; message: string }

const RECOVERY_WARNING = '저장된 학습 상태가 손상되어 기본 상태로 복구했습니다.'
const MIGRATION_WARNING = '이전 버전의 메뉴 상태를 현재 학습 상태로 이전했습니다.'
const SAVE_ERROR_MESSAGE = '학습 상태를 저장하지 못했습니다.'
const BACKUP_ERROR_MESSAGE =
  '복구 원본을 별도 저장하지 못해 기존 저장값을 보호하는 동안 새 학습 상태는 저장하지 않습니다.'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEnumValue<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return typeof value === 'string' && values.includes(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isFiniteSafeNumber(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER
}

function isQuizAdjustment(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -2 && value <= 2
}

function isSignedBoost(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -2 && value <= 2
}

function isTimestamp(value: unknown): value is number {
  return isNonNegativeInteger(value)
}

function isRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasOnlyKeys(record: UnknownRecord, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key))
}

function hasExactKeys(record: UnknownRecord, expected: readonly string[]): boolean {
  const keys = Object.keys(record)
  return keys.length === expected.length && expected.every((key) => keys.includes(key))
}

function isNavigationState(value: unknown): value is NavigationState {
  if (!isRecord(value)) return false

  return (
    hasExactKeys(value, [
      'level',
      'section',
      'grammarSection',
      'grammarNodeId',
      'studyDifficulty',
      'quizType',
    ]) &&
    isEnumValue(LEVELS, value.level) &&
    isEnumValue(SECTIONS, value.section) &&
    isEnumValue(GRAMMAR_SECTIONS, value.grammarSection) &&
    (value.grammarNodeId === null || isNonEmptyString(value.grammarNodeId)) &&
    isEnumValue(DIFFICULTIES, value.studyDifficulty) &&
    isEnumValue(QUIZ_TYPES, value.quizType)
  )
}

function isWordMastery(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (
    !hasExactKeys(value, [
      'attempts',
      'correct',
      'wrong',
      'correctStreak',
      'wrongStreak',
    ]) ||
    !isNonNegativeInteger(value.attempts) ||
    !isNonNegativeInteger(value.correct) ||
    !isNonNegativeInteger(value.wrong) ||
    !isNonNegativeInteger(value.correctStreak) ||
    !isNonNegativeInteger(value.wrongStreak)
  ) {
    return false
  }

  return (
    value.correct + value.wrong === value.attempts &&
    value.correctStreak <= value.correct &&
    value.wrongStreak <= value.wrong &&
    (value.correctStreak === 0 || value.wrongStreak === 0)
  )
}

function isMistakeRecord(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (
    !hasOnlyKeys(value, [
      'wrongCount',
      'wrongStreak',
      'priorityRemaining',
      'reviewPending',
      'reviewSpacingRemaining',
      'penaltyWeight',
      'nextBoost',
      'cooldownAt',
      'linkedLevel',
      'priorityInsertedAt',
    ]) ||
    !isNonNegativeInteger(value.wrongCount) ||
    !isNonNegativeInteger(value.wrongStreak) ||
    !isNonNegativeInteger(value.priorityRemaining)
  ) {
    return false
  }

  const trackingKeys = [
    'penaltyWeight',
    'nextBoost',
    'cooldownAt',
    'linkedLevel',
    'priorityInsertedAt',
  ] as const
  const trackingKeyCount = trackingKeys.filter((key) => key in value).length
  if (trackingKeyCount !== 0 && trackingKeyCount !== trackingKeys.length) return false
  if (trackingKeyCount === trackingKeys.length) {
    const expectedPenalty = value.wrongStreak >= 2 ? 0.3 : 0.15
    if (
      value.penaltyWeight !== expectedPenalty ||
      value.nextBoost !== 0.3 ||
      !isTimestamp(value.cooldownAt) ||
      !isEnumValue(LEVELS, value.linkedLevel) ||
      !(
        value.priorityInsertedAt === null ||
        isTimestamp(value.priorityInsertedAt)
      ) ||
      (value.wrongStreak >= 2) !== (value.priorityInsertedAt !== null) ||
      (
        typeof value.priorityInsertedAt === 'number' &&
        value.priorityInsertedAt > value.cooldownAt
      )
    ) {
      return false
    }
  }

  const hasReviewPending = 'reviewPending' in value
  const hasReviewSpacing = 'reviewSpacingRemaining' in value
  if (
    hasReviewPending !== hasReviewSpacing ||
    (
      hasReviewPending &&
      (
        value.reviewPending !== true ||
        !isNonNegativeInteger(value.reviewSpacingRemaining) ||
        value.reviewSpacingRemaining > 1
      )
    )
  ) {
    return false
  }

  return value.wrongStreak <= value.wrongCount && value.priorityRemaining <= 3
}

function isLegacyMistakeRecord(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      'wrongCount',
      'wrongStreak',
      'priorityRemaining',
      'reviewPending',
      'reviewSpacingRemaining',
    ]) &&
    isMistakeRecord(value)
}

function isRecordOf(value: unknown, validator: (item: unknown) => boolean): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).every(isNonEmptyString) &&
    Object.values(value).every(validator)
  )
}

function isCounterRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.keys(value).every(isNonEmptyString) &&
    Object.values(value).every(isNonNegativeInteger)
  )
}

function isPositiveCounterRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.keys(value).every(isNonEmptyString) &&
    Object.values(value).every(isPositiveInteger)
  )
}

function haveSameKeys(left: UnknownRecord, right: UnknownRecord): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key))
  )
}

function isGrammarExerciseResult(value: unknown): value is GrammarExerciseResult {
  return (
    isRecord(value) &&
    (
      hasExactKeys(value, ['phase', 'correct', 'errorCode']) ||
      (
        hasExactKeys(value, ['exerciseId', 'phase', 'correct', 'errorCode']) &&
        isNonEmptyString(value.exerciseId)
      )
    ) &&
    isEnumValue(GRAMMAR_EXERCISE_PHASES, value.phase) &&
    typeof value.correct === 'boolean' &&
    isNonEmptyString(value.errorCode)
  )
}

function isGrammarExerciseResults(
  value: unknown,
): value is Record<string, GrammarExerciseResult> {
  return (
    isRecord(value) &&
    Object.keys(value).every(isNonEmptyString) &&
    Object.values(value).every(isGrammarExerciseResult)
  )
}

function isGrammarReviewRequirement(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['nodeId', 'errorCode', 'completed']) &&
    typeof value.nodeId === 'string' &&
    /^(A1|A2|B1|B2|C1)-G\d{2}$/.test(value.nodeId) &&
    isNonEmptyString(value.errorCode) &&
    typeof value.completed === 'boolean'
  )
}

const GRAMMAR_PRODUCTION_REVIEW_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const
const GRAMMAR_COMPLETION_ACCURACY = 0.8
const GRAMMAR_COMPLETION_ERROR_TOLERANCE = 0.2

interface VersionSixGrammarProductionRecord {
  draft: string
  rubricEvidence: string[]
  reviewStatus: 'pending' | 'approved' | 'rejected'
  reviewChecks: boolean[] | null
}

type VersionSixGrammarMastery = Omit<GrammarMastery, 'production'> & {
  production: VersionSixGrammarProductionRecord | null
}

function legacyProductionSentences(value: string): string[] {
  return value
    .split(/[.!?]+/u)
    .map((sentence) => sentence.trim().replace(/\s+/gu, ' '))
    .filter(Boolean)
}

function legacyProductionSentenceIsSubstantial(sentence: string): boolean {
  return (sentence.match(/[\p{L}\p{N}]+(?:['’–-][\p{L}\p{N}]+)*/gu)?.length ?? 0) >= 3
}

function isLegacyGrammarProductionRecord(
  value: unknown,
): value is VersionSixGrammarProductionRecord {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'draft',
      'rubricEvidence',
      'reviewStatus',
      'reviewChecks',
    ]) ||
    !isNonEmptyString(value.draft) ||
    value.draft !== value.draft.trim() ||
    !Array.isArray(value.rubricEvidence) ||
    !value.rubricEvidence.every(isNonEmptyString) ||
    !isEnumValue(GRAMMAR_PRODUCTION_REVIEW_STATUSES, value.reviewStatus)
  ) {
    return false
  }

  const evidence = value.rubricEvidence as string[]
  const sentences = legacyProductionSentences(value.draft)
  if (
    sentences.length < 4 ||
    !sentences.every(legacyProductionSentenceIsSubstantial) ||
    evidence.length < 2 ||
    new Set(evidence).size !== evidence.length ||
    !evidence.every((sentence) =>
      sentence.trim() === sentence &&
      legacyProductionSentenceIsSubstantial(sentence) &&
      sentences.includes(sentence))
  ) {
    return false
  }

  if (value.reviewStatus === 'pending') return value.reviewChecks === null
  if (
    !Array.isArray(value.reviewChecks) ||
    value.reviewChecks.length !== evidence.length ||
    !value.reviewChecks.every((check) => typeof check === 'boolean')
  ) {
    return false
  }

  return value.reviewStatus === 'approved'
    ? value.reviewChecks.every(Boolean)
    : value.reviewChecks.some((check) => !check)
}

function isGrammarProductionEvidenceReference(
  value: unknown,
): value is GrammarProductionEvidenceReference {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['partId', 'sentenceIndex']) &&
    isNonEmptyString(value.partId) &&
    isNonNegativeInteger(value.sentenceIndex)
  )
}

function isGrammarProductionRequirementEvidence(
  value: unknown,
): value is GrammarProductionRequirementEvidence {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['requirementId', 'selections']) &&
    isNonEmptyString(value.requirementId) &&
    Array.isArray(value.selections) &&
    value.selections.every(isGrammarProductionEvidenceReference)
  )
}

function grammarLevelFromNodeId(nodeId: string) {
  const level = /^(A1|A2|B1|B2|C1)-G\d{2}$/.exec(nodeId)?.[1]
  return level && isEnumValue(GRAMMAR_LEVELS, level) ? level : null
}

function isGrammarProductionRecord(
  value: unknown,
  nodeId: string,
): value is GrammarProductionRecord {
  const level = grammarLevelFromNodeId(nodeId)
  if (
    !level ||
    !isRecord(value) ||
    !hasExactKeys(value, [
      'draft',
      'parts',
      'requirementEvidence',
      'rubricEvidence',
      'cycleStartAttempt',
      'revisionRound',
      'revisionNote',
      'reviewStatus',
      'reviewChecks',
    ]) ||
    !isNonEmptyString(value.draft) ||
    value.draft !== value.draft.trim() ||
    !Array.isArray(value.parts) ||
    !value.parts.every((part) =>
      isRecord(part) &&
      hasExactKeys(part, ['partId', 'text']) &&
      isNonEmptyString(part.partId) &&
      isNonEmptyString(part.text) &&
      part.text === part.text.trim()) ||
    !Array.isArray(value.requirementEvidence) ||
    !value.requirementEvidence.every(isGrammarProductionRequirementEvidence) ||
    !Array.isArray(value.rubricEvidence) ||
    !value.rubricEvidence.every(isGrammarProductionEvidenceReference) ||
    !isPositiveInteger(value.cycleStartAttempt) ||
    !isNonNegativeInteger(value.revisionRound) ||
    !(value.revisionNote === null || (
      isNonEmptyString(value.revisionNote) &&
      value.revisionNote === value.revisionNote.trim()
    )) ||
    !isEnumValue(GRAMMAR_PRODUCTION_REVIEW_STATUSES, value.reviewStatus)
  ) {
    return false
  }

  const constraints = grammarProductionConstraintsForLevel(level)
  const record = value as unknown as GrammarProductionRecord
  if (
    !isGrammarProductionSubmissionStructurallyValid(
      {
        draft: record.draft,
        parts: record.parts,
        requirementEvidence: record.requirementEvidence,
        rubricEvidence: record.rubricEvidence,
        revisionNote: record.revisionNote,
      },
      constraints,
      constraints.rubricEvidenceCount,
    ) ||
    (constraints.maxRevisionRounds === null
      ? record.revisionNote !== null
      : record.revisionRound > constraints.maxRevisionRounds ||
        (record.revisionRound === 0
          ? record.revisionNote !== null
          : record.revisionNote === null))
  ) {
    return false
  }

  if (record.reviewStatus === 'pending') return record.reviewChecks === null
  if (
    !Array.isArray(record.reviewChecks) ||
    record.reviewChecks.length !== grammarProductionReviewCount(record) ||
    !record.reviewChecks.every((check) => typeof check === 'boolean')
  ) {
    return false
  }
  return record.reviewStatus === 'approved'
    ? record.reviewChecks.every(Boolean)
    : record.reviewChecks.some((check) => !check)
}

type GrammarProductionValidator = (value: unknown) => boolean

function isGrammarMasteryWithProduction(
  value: unknown,
  productionValidator: GrammarProductionValidator,
): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'attempts',
      'correct',
      'diagnosticAttempts',
      'practiceAttempts',
      'rediagnosticAttempts',
      'productionAttempts',
      'productionPassed',
      'retryCount',
      'errorCounts',
      'errorStreaks',
      'exerciseResults',
      'reviewRequirement',
      'production',
      'mustReview',
      'completed',
    ]) ||
    !isNonNegativeInteger(value.attempts) ||
    !isNonNegativeInteger(value.correct) ||
    !isNonNegativeInteger(value.diagnosticAttempts) ||
    !isNonNegativeInteger(value.practiceAttempts) ||
    !isNonNegativeInteger(value.rediagnosticAttempts) ||
    !isNonNegativeInteger(value.productionAttempts) ||
    typeof value.productionPassed !== 'boolean' ||
    !isNonNegativeInteger(value.retryCount) ||
    !isPositiveCounterRecord(value.errorCounts) ||
    !isCounterRecord(value.errorStreaks) ||
    !isGrammarExerciseResults(value.exerciseResults) ||
    !(
      value.reviewRequirement === null ||
      isGrammarReviewRequirement(value.reviewRequirement)
    ) ||
    !(value.production === null || productionValidator(value.production)) ||
    typeof value.mustReview !== 'boolean' ||
    typeof value.completed !== 'boolean'
  ) {
    return false
  }

  const exerciseResults = Object.values(value.exerciseResults)
  const exerciseEntries = Object.entries(value.exerciseResults)
  const expectedDiagnosticAttempts = exerciseResults.filter(
    ({ phase }) => phase === 'diagnostic',
  ).length
  const expectedPracticeAttempts = exerciseResults.filter(
    ({ phase }) => phase === 'practice',
  ).length
  const expectedRediagnosticAttempts = exerciseResults.filter(
    ({ phase }) => phase === 'rediagnostic',
  ).length
  const expectedCorrect = exerciseResults.filter(({ correct }) => correct).length
  const errorCounts = value.errorCounts as Record<string, number>
  const errorStreaks = value.errorStreaks as Record<string, number>
  const historicalCodedErrors = Object.values(errorCounts).reduce(
    (total, count) => total + count,
    0,
  )
  const retryCount = value.retryCount as number
  const errorCountsArePossible = Object.entries(errorCounts).every(
    ([code, count]) => {
      const unresolvedMatchingResults = exerciseResults.filter(
        (result) => result.errorCode === code && !result.correct,
      )
      return count <= retryCount && count >= unresolvedMatchingResults.length
    },
  )
  const streaksArePossible = Object.entries(errorStreaks).every(
    ([code, streak]) =>
      streak <= (errorCounts[code] ?? 0) &&
      streak <= exerciseResults.filter(
        (result) => !result.correct && result.errorCode === code,
      ).length,
  )
  const positiveStreaks = Object.values(errorStreaks).filter((streak) => streak > 0)
  const production = value.production as UnknownRecord | null
  const productionStatus = production?.reviewStatus
  const productionExists = production !== null
  const productionApproved = productionStatus === 'approved'
  const productionRejected = productionStatus === 'rejected'
  const productionRevisionRound = productionExists &&
    isNonNegativeInteger(production.revisionRound)
    ? production.revisionRound
    : 0
  const reviewExists = value.reviewRequirement !== null
  const reviewRequirement = value.reviewRequirement as UnknownRecord | null
  const reviewedErrorCode = reviewRequirement?.errorCode
  const hasRepeatedError = typeof reviewedErrorCode === 'string' &&
    (errorCounts[reviewedErrorCode] ?? 0) >= 2
  const minimumRetries =
    historicalCodedErrors + productionRevisionRound + (productionRejected ? 1 : 0)
  const completedLoop =
    value.diagnosticAttempts > 0 &&
    value.practiceAttempts > 0 &&
    value.rediagnosticAttempts > 0 &&
    value.productionAttempts > 0
  const stageDependenciesAreValid =
    (value.practiceAttempts === 0 || value.diagnosticAttempts > 0) &&
    (value.productionAttempts === 0 || (
      value.diagnosticAttempts > 0 && value.practiceAttempts > 0
    )) &&
    (value.rediagnosticAttempts === 0 || (
      value.diagnosticAttempts > 0 &&
      value.practiceAttempts > 0 &&
      productionApproved
    ))
  const attemptHistories = new Map<string, GrammarExerciseResult[]>()
  for (const [entryId, result] of exerciseEntries) {
    const exerciseId = result.exerciseId ?? entryId
    const history = attemptHistories.get(exerciseId) ?? []
    history.push(result)
    attemptHistories.set(exerciseId, history)
  }
  const attemptHistoriesAreValid = [...attemptHistories.values()].every((history) => {
    const first = history[0]
    if (!first) return false
    const correctIndices = history.flatMap(({ correct }, index) => correct ? [index] : [])
    return history.every(({ phase, errorCode }) =>
      phase === first.phase && errorCode === first.errorCode) &&
      correctIndices.length <= 1 &&
      (correctIndices.length === 0 || correctIndices[0] === history.length - 1)
  })
  const currentResults = latestGrammarExerciseResults(value as unknown as GrammarMastery)
  const accuracy = currentResults.length === 0
    ? 0
    : currentResults.filter(({ correct }) => correct).length / currentResults.length
  const errorRate = currentResults.length === 0
    ? 0
    : currentResults.filter(({ correct }) => !correct).length / currentResults.length

  return (
    exerciseResults.length === value.attempts &&
    value.correct === expectedCorrect &&
    value.diagnosticAttempts === expectedDiagnosticAttempts &&
    value.practiceAttempts === expectedPracticeAttempts &&
    value.rediagnosticAttempts === expectedRediagnosticAttempts &&
    haveSameKeys(errorCounts, errorStreaks) &&
    errorCountsArePossible &&
    streaksArePossible &&
    positiveStreaks.length <= 1 &&
    attemptHistoriesAreValid &&
    value.retryCount >= minimumRetries &&
    (!productionExists || value.productionAttempts > 0) &&
    value.productionPassed === productionApproved &&
    value.mustReview === reviewExists &&
    (!reviewExists || hasRepeatedError) &&
    stageDependenciesAreValid &&
    (!value.completed || (
      completedLoop &&
      productionApproved &&
      !reviewExists &&
      accuracy >= GRAMMAR_COMPLETION_ACCURACY &&
      errorRate <= GRAMMAR_COMPLETION_ERROR_TOLERANCE
    ))
  )
}

function isGrammarMastery(value: unknown, nodeId: string): value is GrammarMastery {
  if (!isGrammarMasteryWithProduction(
    value,
    (production) => isGrammarProductionRecord(production, nodeId),
  )) return false
  const mastery = value as GrammarMastery
  return mastery.production === null ||
    mastery.productionAttempts ===
      mastery.production.cycleStartAttempt + mastery.production.revisionRound
}

function isVersionSixGrammarMastery(
  value: unknown,
): value is VersionSixGrammarMastery {
  return isGrammarMasteryWithProduction(value, isLegacyGrammarProductionRecord)
}

function isVersionTwoGrammarMastery(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'attempts',
      'correct',
      'diagnosticAttempts',
      'practiceAttempts',
      'rediagnosticAttempts',
      'productionAttempts',
      'productionPassed',
      'retryCount',
      'errorCounts',
      'errorStreaks',
      'mustReview',
      'completed',
    ]) ||
    !isNonNegativeInteger(value.attempts) ||
    !isNonNegativeInteger(value.correct) ||
    !isNonNegativeInteger(value.diagnosticAttempts) ||
    !isNonNegativeInteger(value.practiceAttempts) ||
    !isNonNegativeInteger(value.rediagnosticAttempts) ||
    !isNonNegativeInteger(value.productionAttempts) ||
    typeof value.productionPassed !== 'boolean' ||
    !isNonNegativeInteger(value.retryCount) ||
    !isCounterRecord(value.errorCounts) ||
    !isCounterRecord(value.errorStreaks) ||
    typeof value.mustReview !== 'boolean' ||
    typeof value.completed !== 'boolean'
  ) {
    return false
  }

  const exerciseAttempts =
    value.diagnosticAttempts + value.practiceAttempts + value.rediagnosticAttempts
  const errorCounts = value.errorCounts as Record<string, number>
  const errorStreaks = value.errorStreaks as Record<string, number>
  const errorCount = Object.values(errorCounts).reduce(
    (total, count) => total + count,
    0,
  )
  const streaksArePossible = Object.entries(errorStreaks).every(
    ([code, streak]) => streak <= (errorCounts[code] ?? 0),
  )
  const completedLoop =
    value.diagnosticAttempts > 0 &&
    value.practiceAttempts > 0 &&
    value.rediagnosticAttempts > 0 &&
    value.productionAttempts > 0

  return (
    exerciseAttempts === value.attempts &&
    value.correct <= value.attempts &&
    errorCount <= value.attempts - value.correct &&
    value.retryCount >= value.attempts - value.correct &&
    streaksArePossible &&
    (!value.productionPassed || value.productionAttempts > 0) &&
    (!value.completed || (completedLoop && value.productionPassed && !value.mustReview))
  )
}

function isGrammarMasteryRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).every((id) => /^(A1|A2|B1|B2|C1)-G\d{2}$/.test(id)) &&
    Object.entries(value).every(([id, mastery]) => isGrammarMastery(mastery, id))
  )
}

function isVersionSixGrammarMasteryRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).every((id) => /^(A1|A2|B1|B2|C1)-G\d{2}$/.test(id)) &&
    Object.values(value).every(isVersionSixGrammarMastery)
  )
}

function isVersionTwoGrammarMasteryRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).every((id) => /^(A1|A2|B1|B2|C1)-G\d{2}$/.test(id)) &&
    Object.values(value).every(isVersionTwoGrammarMastery)
  )
}

function isStudySessionSnapshot(value: unknown): value is StudySessionSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, ['queueIds', 'currentIndex'])) return false
  if (!Array.isArray(value.queueIds) || !value.queueIds.every(isNonEmptyString)) return false
  if (value.queueIds.length > MAX_STUDY_QUEUE_SIZE) return false
  if (new Set(value.queueIds).size !== value.queueIds.length) return false

  return (
    isNonNegativeInteger(value.currentIndex) &&
    value.currentIndex <= MAX_STUDY_QUEUE_SIZE &&
    value.currentIndex <= value.queueIds.length
  )
}

function isStudySessions(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, LEVELS)) return false
  return Object.values(value).every(isStudySessionSnapshot)
}

function isDifficultyStats(value: unknown): value is DifficultyStats {
  if (!isRecord(value)) return false
  if (!hasExactKeys(value, ['attempts', 'correct'])) return false
  return (
    isNonNegativeInteger(value.attempts) &&
    isNonNegativeInteger(value.correct) &&
    value.correct <= value.attempts
  )
}

function isDifficultyStatsRecord(value: unknown): value is LevelDifficultyStats {
  if (!isRecord(value) || !hasExactKeys(value, DIFFICULTIES)) return false
  return DIFFICULTIES.every((difficulty) => isDifficultyStats(value[difficulty]))
}

function isDifficultyStatsByLevel(value: unknown): value is DifficultyStatsByLevel {
  return isRecord(value)
    && hasExactKeys(value, LEVELS)
    && LEVELS.every((level) => isDifficultyStatsRecord(value[level]))
}

function isDifficultyCounterRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, DIFFICULTIES) &&
    DIFFICULTIES.every((difficulty) => isNonNegativeInteger(value[difficulty]))
  )
}

function isLevelStudyAnalytics(value: unknown): value is LevelStudyAnalytics {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'selectedDifficulty',
      'exposedDifficulty',
      'wrongReexposures',
    ]) &&
    isDifficultyCounterRecord(value.selectedDifficulty) &&
    isDifficultyCounterRecord(value.exposedDifficulty) &&
    isPositiveCounterRecord(value.wrongReexposures)
  )
}

function isStudyAnalytics(value: unknown): value is StudyAnalytics {
  return isRecord(value)
    && hasExactKeys(value, LEVELS)
    && LEVELS.every((level) => isLevelStudyAnalytics(value[level]))
}

function isActivityDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function isDailyActivityRecord(value: unknown): value is DailyActivityRecord {
  return isRecord(value) &&
    hasExactKeys(value, ['sessions', 'attempts', 'correct', 'durationMs']) &&
    isNonNegativeInteger(value.sessions) &&
    isNonNegativeInteger(value.attempts) &&
    isNonNegativeInteger(value.correct) &&
    value.correct <= value.attempts &&
    isNonNegativeNumber(value.durationMs)
}

function isDailyActivity(value: unknown): value is TrackingState['dailyActivity'] {
  return isRecord(value) &&
    Object.keys(value).every(isActivityDateKey) &&
    Object.values(value).every(isDailyActivityRecord)
}

function isItemScheduleRecord(value: unknown): value is ItemScheduleRecord {
  return isRecord(value) &&
    hasExactKeys(value, [
      'kind',
      'level',
      'ease',
      'lastSeenAt',
      'nextDueAt',
      'weight',
      'lastLevel',
    ]) &&
    (value.kind === 'word' || value.kind === 'phrasalVerb') &&
    isEnumValue(LEVELS, value.level) &&
    typeof value.ease === 'number' &&
    Number.isFinite(value.ease) &&
    value.ease >= 1.3 &&
    value.ease <= 3 &&
    isTimestamp(value.lastSeenAt) &&
    isTimestamp(value.nextDueAt) &&
    value.nextDueAt >= value.lastSeenAt &&
    isNonNegativeNumber(value.weight) &&
    isEnumValue(LEVELS, value.lastLevel)
}

function isItemSchedule(value: unknown): value is TrackingState['itemSchedule'] {
  return isRecord(value) &&
    Object.keys(value).every(isNonEmptyString) &&
    Object.values(value).every(isItemScheduleRecord)
}

function isQuizResponseRecord(value: unknown): value is QuizResponseRecord {
  return isRecord(value) &&
    hasExactKeys(value, [
      'sessionId',
      'questionId',
      'sourceItemId',
      'questionType',
      'quizType',
      'level',
      'isCorrect',
      'answerTimeMs',
      'difficultyUsed',
      'answeredAt',
      'isReexposure',
      'adjustment',
    ]) &&
    isNonEmptyString(value.sessionId) &&
    isNonEmptyString(value.questionId) &&
    isNonEmptyString(value.sourceItemId) &&
    isEnumValue(QUIZ_TYPES, value.questionType) &&
    isEnumValue(QUIZ_TYPES, value.quizType) &&
    value.questionType === value.quizType &&
    isEnumValue(LEVELS, value.level) &&
    typeof value.isCorrect === 'boolean' &&
    isNonNegativeNumber(value.answerTimeMs) &&
    isEnumValue(DIFFICULTIES, value.difficultyUsed) &&
    isTimestamp(value.answeredAt) &&
    typeof value.isReexposure === 'boolean' &&
    isQuizAdjustment(value.adjustment)
}

function isQuizTypeTrackingStats(value: unknown): value is QuizTypeTrackingStats {
  if (!isRecord(value) || !hasExactKeys(value, [
    'attempts',
    'correct',
    'totalAnswerTimeMs',
    'averageAnswerTimeMs',
    'reexposureAttempts',
    'reexposureCorrect',
    'wrongRunTransitions',
    'adjustmentTotal',
  ])) return false
  if (
    !isNonNegativeInteger(value.attempts) ||
    !isNonNegativeInteger(value.correct) ||
    value.correct > value.attempts ||
    !isNonNegativeNumber(value.totalAnswerTimeMs) ||
    !isNonNegativeNumber(value.averageAnswerTimeMs) ||
    !isNonNegativeInteger(value.reexposureAttempts) ||
    !isNonNegativeInteger(value.reexposureCorrect) ||
    value.reexposureAttempts > value.attempts ||
    value.reexposureCorrect > value.reexposureAttempts ||
    !isNonNegativeInteger(value.wrongRunTransitions) ||
    value.wrongRunTransitions > Math.max(0, value.attempts - 1) ||
    !isFiniteSafeNumber(value.adjustmentTotal)
  ) return false

  const expectedAverage = value.attempts === 0
    ? 0
    : normalizeTrackingDecimal(value.totalAnswerTimeMs / value.attempts)
  return Math.abs(value.averageAnswerTimeMs - expectedAverage) <=
    Number.EPSILON * Math.max(1, expectedAverage)
}

function isQuizTypeTrackingByLevel(value: unknown): value is QuizTypeTrackingByLevel {
  return isRecord(value) &&
    hasExactKeys(value, LEVELS) &&
    LEVELS.every((level) => {
      const byType = value[level]
      return isRecord(byType) &&
        hasExactKeys(byType, QUIZ_TYPES) &&
        QUIZ_TYPES.every((type) => isQuizTypeTrackingStats(byType[type]))
    })
}

function isSessionQuizTypePerformance(value: unknown): boolean {
  return isRecord(value) &&
    hasExactKeys(value, ['attempts', 'correct', 'totalAnswerTimeMs']) &&
    isNonNegativeInteger(value.attempts) &&
    isNonNegativeInteger(value.correct) &&
    value.correct <= value.attempts &&
    isNonNegativeNumber(value.totalAnswerTimeMs)
}

function isSessionPerformance(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, ['attempts', 'correct', 'byQuizType'])) {
    return false
  }
  const byQuizType = value.byQuizType
  if (
    !isNonNegativeInteger(value.attempts) ||
    !isNonNegativeInteger(value.correct) ||
    value.correct > value.attempts ||
    !isRecord(byQuizType) ||
    !hasExactKeys(byQuizType, QUIZ_TYPES) ||
    !QUIZ_TYPES.every((type) => isSessionQuizTypePerformance(byQuizType[type]))
  ) return false
  return true
}

function isSessionAdjustments(value: unknown): boolean {
  return isRecord(value) &&
    hasExactKeys(value, ['mistakeBoost', 'difficultyBoost', 'priority']) &&
    isFiniteSafeNumber(value.mistakeBoost) &&
    isFiniteSafeNumber(value.difficultyBoost) &&
    isFiniteSafeNumber(value.priority)
}

function isSessionHistoryRecord(value: unknown): value is SessionHistoryRecord {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id',
    'kind',
    'level',
    'startedAt',
    'endedAt',
    'durationMs',
    'status',
    'performance',
    'adjustments',
  ])) return false
  if (
    !isNonEmptyString(value.id) ||
    !isEnumValue(TRACKING_SESSION_KINDS, value.kind) ||
    typeof value.level !== 'string' ||
    !isTrackingLevel(value.level) ||
    !isTimestamp(value.startedAt) ||
    !isTimestamp(value.endedAt) ||
    value.endedAt < value.startedAt ||
    !isNonNegativeNumber(value.durationMs) ||
    value.durationMs !== value.endedAt - value.startedAt ||
    !isEnumValue(TRACKING_SESSION_STATUSES, value.status) ||
    !isSessionPerformance(value.performance) ||
    !isSessionAdjustments(value.adjustments)
  ) return false

  const grammarLevel = (GRAMMAR_LEVELS as readonly string[]).includes(value.level)
  if ((value.kind === 'grammar') !== grammarLevel) return false
  const performance = value.performance as UnknownRecord
  const byQuizType = performance.byQuizType as UnknownRecord
  const typeAttempts = QUIZ_TYPES.reduce(
    (total, type) => total + ((byQuizType[type] as UnknownRecord).attempts as number),
    0,
  )
  const typeCorrect = QUIZ_TYPES.reduce(
    (total, type) => total + ((byQuizType[type] as UnknownRecord).correct as number),
    0,
  )
  return value.kind === 'quiz'
    ? typeAttempts === performance.attempts && typeCorrect === performance.correct
    : typeAttempts === 0 && typeCorrect === 0
}

function isDifficultyMix(value: unknown): value is QueueHistoryRecord['difficultyMix'] {
  return isRecord(value) &&
    hasExactKeys(value, DIFFICULTIES) &&
    DIFFICULTIES.every((difficulty) => isNonNegativeInteger(value[difficulty]))
}

function isExposureComponents(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, [
    'difficultyBase',
    'lowAccuracyBoost',
    'mistakeBoost',
    'recentWrongBoost',
    'scheduleBoost',
    'masteryBoost',
    'grammarBoost',
    'total',
  ])) return false
  if (
    ![
      value.difficultyBase,
      value.lowAccuracyBoost,
      value.mistakeBoost,
      value.recentWrongBoost,
      value.grammarBoost,
    ].every(isNonNegativeNumber) ||
    !isSignedBoost(value.scheduleBoost) ||
    !isSignedBoost(value.masteryBoost) ||
    !isNonNegativeNumber(value.total) ||
    value.total < 0.001 ||
    value.total > 4
  ) return false
  const sum = (value.difficultyBase as number) +
    (value.lowAccuracyBoost as number) +
    (value.mistakeBoost as number) +
    (value.recentWrongBoost as number) +
    (value.scheduleBoost as number) +
    (value.masteryBoost as number) +
    (value.grammarBoost as number)
  const expectedTotal = normalizeTrackingDecimal(Math.min(4, Math.max(0.001, sum)))
  return normalizeTrackingDecimal(value.total as number) === expectedTotal
}

function isPriorityEntry(value: unknown): boolean {
  return isRecord(value) &&
    hasExactKeys(value, ['itemId', 'priority', 'insertedAt']) &&
    isNonEmptyString(value.itemId) &&
    isNonNegativeNumber(value.priority) &&
    isTimestamp(value.insertedAt)
}

function isLegacyQueueHistoryRecord(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id',
    'sessionId',
    'level',
    'generatedAt',
    'startedAt',
    'updatedAt',
    'interruptedAt',
    'status',
    'selectedDifficulty',
    'difficultyMix',
    'queueSize',
    'currentIndex',
    'recoveryIndex',
    'recovered',
    'mistakeCount',
    'priorityCount',
    'overdueCount',
    'exposureComponents',
    'priorityEntries',
  ])) return false
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.sessionId) ||
    !isEnumValue(LEVELS, value.level) ||
    !isTimestamp(value.generatedAt) ||
    !isTimestamp(value.startedAt) ||
    value.generatedAt > value.startedAt ||
    !isTimestamp(value.updatedAt) ||
    value.startedAt > value.updatedAt ||
    !(
      value.interruptedAt === null ||
      isTimestamp(value.interruptedAt)
    ) ||
    !isEnumValue(TRACKING_QUEUE_STATUSES, value.status) ||
    (value.status === 'interrupted') !== (value.interruptedAt !== null) ||
    (
      typeof value.interruptedAt === 'number' &&
      (value.interruptedAt < value.startedAt || value.interruptedAt > value.updatedAt)
    ) ||
    !isEnumValue(DIFFICULTIES, value.selectedDifficulty) ||
    !isDifficultyMix(value.difficultyMix) ||
    !isNonNegativeInteger(value.queueSize) ||
    value.queueSize > MAX_STUDY_QUEUE_SIZE ||
    !isNonNegativeInteger(value.currentIndex) ||
    value.currentIndex > MAX_STUDY_QUEUE_SIZE ||
    value.currentIndex > value.queueSize ||
    !isNonNegativeInteger(value.recoveryIndex) ||
    value.recoveryIndex > MAX_STUDY_QUEUE_SIZE ||
    value.recoveryIndex > value.currentIndex ||
    typeof value.recovered !== 'boolean' ||
    !isNonNegativeInteger(value.mistakeCount) ||
    value.mistakeCount > value.queueSize ||
    !isNonNegativeInteger(value.priorityCount) ||
    value.priorityCount > MAX_STUDY_QUEUE_PRIORITY_COUNT ||
    value.priorityCount > value.mistakeCount ||
    !isNonNegativeInteger(value.overdueCount) ||
    value.overdueCount > value.queueSize ||
    !isExposureComponents(value.exposureComponents) ||
    !Array.isArray(value.priorityEntries) ||
    value.priorityEntries.length > MAX_STUDY_QUEUE_PRIORITY_COUNT ||
    value.priorityEntries.length !== value.priorityCount ||
    !value.priorityEntries.every(isPriorityEntry)
  ) return false

  const mixTotal = DIFFICULTIES.reduce(
    (total, difficulty) => total + (value.difficultyMix as Record<string, number>)[difficulty]!,
    0,
  )
  const priorityIds = (value.priorityEntries as Array<UnknownRecord>)
    .map((entry) => entry.itemId)
  const generatedAt = value.generatedAt as number
  const updatedAt = value.updatedAt as number
  const priorityTimesAreValid = (value.priorityEntries as Array<UnknownRecord>).every(
    (entry) => (entry.insertedAt as number) >= generatedAt &&
      (entry.insertedAt as number) <= updatedAt,
  )
  return mixTotal === value.queueSize &&
    new Set(priorityIds).size === priorityIds.length &&
    priorityTimesAreValid
}

function isUniqueStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
}

function isQueueItemExposure(value: unknown): boolean {
  return isRecord(value) &&
    hasExactKeys(value, ['itemId', 'components', 'overdue']) &&
    isNonEmptyString(value.itemId) &&
    isExposureComponents(value.components) &&
    typeof value.overdue === 'boolean'
}

function isQueueSpacingAudit(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, [
    'minimumDistinctItems',
    'exceptionPolicy',
    'exceptionApplied',
    'blockedItemIds',
  ])) return false
  return value.minimumDistinctItems === 1 &&
    isEnumValue(SPACING_EXCEPTION_POLICIES, value.exceptionPolicy) &&
    typeof value.exceptionApplied === 'boolean' &&
    (!value.exceptionApplied || value.exceptionPolicy === 'exam-density') &&
    isUniqueStringArray(value.blockedItemIds)
}

function isQueueHistoryRecord(value: unknown): value is QueueHistoryRecord {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id',
    'sessionId',
    'scope',
    'level',
    'generatedAt',
    'startedAt',
    'updatedAt',
    'interruptedAt',
    'status',
    'selectedDifficulty',
    'difficultyMix',
    'queueSize',
    'currentIndex',
    'recoveryIndex',
    'recovered',
    'mistakeCount',
    'priorityCount',
    'overdueCount',
    'exposureComponents',
    'auditCompleteness',
    'candidateItemIds',
    'orderedItemIds',
    'itemExposureWeights',
    'spacing',
    'priorityEntries',
  ])) return false
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.sessionId) ||
    !isEnumValue(TRACKING_QUEUE_SCOPES, value.scope) ||
    !isEnumValue(LEVELS, value.level) ||
    !isTimestamp(value.generatedAt) ||
    !isTimestamp(value.startedAt) ||
    value.generatedAt > value.startedAt ||
    !isTimestamp(value.updatedAt) ||
    value.startedAt > value.updatedAt ||
    !(
      value.interruptedAt === null ||
      isTimestamp(value.interruptedAt)
    ) ||
    !isEnumValue(TRACKING_QUEUE_STATUSES, value.status) ||
    (value.status === 'interrupted') !== (value.interruptedAt !== null) ||
    (
      typeof value.interruptedAt === 'number' &&
      (value.interruptedAt < value.startedAt || value.interruptedAt > value.updatedAt)
    ) ||
    !isEnumValue(DIFFICULTIES, value.selectedDifficulty) ||
    !isDifficultyMix(value.difficultyMix) ||
    !isNonNegativeInteger(value.queueSize) ||
    value.queueSize > MAX_STUDY_QUEUE_SIZE ||
    !isNonNegativeInteger(value.currentIndex) ||
    value.currentIndex > MAX_STUDY_QUEUE_SIZE ||
    value.currentIndex > value.queueSize ||
    !isNonNegativeInteger(value.recoveryIndex) ||
    value.recoveryIndex > MAX_STUDY_QUEUE_SIZE ||
    value.recoveryIndex > value.currentIndex ||
    typeof value.recovered !== 'boolean' ||
    !isNonNegativeInteger(value.mistakeCount) ||
    value.mistakeCount > value.queueSize ||
    !isNonNegativeInteger(value.priorityCount) ||
    value.priorityCount > MAX_STUDY_QUEUE_PRIORITY_COUNT ||
    value.priorityCount > value.mistakeCount ||
    !isNonNegativeInteger(value.overdueCount) ||
    value.overdueCount > value.queueSize ||
    !isExposureComponents(value.exposureComponents) ||
    !isEnumValue(TRACKING_QUEUE_AUDIT_COMPLETENESS, value.auditCompleteness) ||
    !isUniqueStringArray(value.candidateItemIds) ||
    !isUniqueStringArray(value.orderedItemIds) ||
    value.orderedItemIds.length > MAX_STUDY_QUEUE_SIZE ||
    !Array.isArray(value.itemExposureWeights) ||
    !value.itemExposureWeights.every(isQueueItemExposure) ||
    !isQueueSpacingAudit(value.spacing) ||
    !Array.isArray(value.priorityEntries) ||
    value.priorityEntries.length > MAX_STUDY_QUEUE_PRIORITY_COUNT ||
    !value.priorityEntries.every(isPriorityEntry)
  ) return false

  const difficultyMix = value.difficultyMix as Record<string, number>
  const mixTotal = DIFFICULTIES.reduce(
    (total, difficulty) => total + difficultyMix[difficulty]!,
    0,
  )
  const priorityEntries = value.priorityEntries as Array<UnknownRecord>
  const priorityIds = priorityEntries.map((entry) => entry.itemId as string)
  const generatedAt = value.generatedAt as number
  const updatedAt = value.updatedAt as number
  if (
    mixTotal !== value.queueSize ||
    new Set(priorityIds).size !== priorityIds.length ||
    !priorityEntries.every((entry) => (
      (entry.insertedAt as number) >= generatedAt &&
      (entry.insertedAt as number) <= updatedAt
    ))
  ) return false

  const candidateItemIds = value.candidateItemIds as string[]
  const orderedItemIds = value.orderedItemIds as string[]
  const itemExposureWeights = value.itemExposureWeights as Array<UnknownRecord>
  const spacing = value.spacing as UnknownRecord
  const blockedItemIds = spacing.blockedItemIds as string[]
  if (value.auditCompleteness === 'legacy') {
    return value.scope === 'standard' &&
      priorityEntries.length === value.priorityCount &&
      candidateItemIds.length === 0 &&
      orderedItemIds.length === 0 &&
      itemExposureWeights.length === 0 &&
      blockedItemIds.length === 0 &&
      spacing.exceptionPolicy === 'strict' &&
      spacing.exceptionApplied === false
  }

  if (value.auditCompleteness === 'summary') {
    return candidateItemIds.length === 0 &&
      orderedItemIds.length === 0 &&
      itemExposureWeights.length === 0 &&
      blockedItemIds.length === 0 &&
      priorityEntries.length === 0
  }

  const candidateSet = new Set(candidateItemIds)
  const orderedSet = new Set(orderedItemIds)
  const exposureIds = itemExposureWeights.map((entry) => entry.itemId as string)
  const overdueById = new Map(itemExposureWeights.map((entry) => [
    entry.itemId as string,
    entry.overdue === true,
  ]))
  return orderedItemIds.length === value.queueSize &&
    priorityEntries.length === value.priorityCount &&
    orderedItemIds.every((id) => candidateSet.has(id)) &&
    exposureIds.length === candidateItemIds.length &&
    exposureIds.every((id, index) => id === candidateItemIds[index]) &&
    blockedItemIds.every((id) => candidateSet.has(id)) &&
    (
      spacing.exceptionApplied === false ||
      (
        blockedItemIds.length > 0 &&
        orderedItemIds.some((id) => blockedItemIds.includes(id))
      )
    ) &&
    priorityIds.every((id) => orderedSet.has(id)) &&
    orderedItemIds.filter((id) => overdueById.get(id) === true).length ===
      value.overdueCount
}

function hasUniqueIds(values: readonly { id: string }[]): boolean {
  return new Set(values.map(({ id }) => id)).size === values.length
}

function isTrackingCollectionsValid(
  value: UnknownRecord,
  queueValidator: (queue: unknown) => boolean,
): boolean {
  if (
    !isDailyActivity(value.dailyActivity) ||
    !isItemSchedule(value.itemSchedule) ||
    !Array.isArray(value.quizResponses) ||
    value.quizResponses.length > MAX_QUIZ_RESPONSE_HISTORY ||
    !value.quizResponses.every(isQuizResponseRecord) ||
    !isQuizTypeTrackingByLevel(value.quizTypeStats) ||
    !Array.isArray(value.sessionHistory) ||
    value.sessionHistory.length > MAX_SESSION_HISTORY ||
    !value.sessionHistory.every(isSessionHistoryRecord) ||
    !hasUniqueIds(value.sessionHistory as SessionHistoryRecord[]) ||
    !Array.isArray(value.queueHistory) ||
    value.queueHistory.length > MAX_QUEUE_HISTORY ||
    !value.queueHistory.every(queueValidator) ||
    !hasUniqueIds(value.queueHistory as QueueHistoryRecord[])
  ) return false

  const responseKeys = (value.quizResponses as QuizResponseRecord[])
    .map(({ sessionId, questionId }) => `${sessionId}\u0000${questionId}`)
  if (new Set(responseKeys).size !== responseKeys.length) return false

  const stats = value.quizTypeStats as QuizTypeTrackingByLevel
  return LEVELS.every((level) => QUIZ_TYPES.every((type) => {
    const responses = (value.quizResponses as QuizResponseRecord[])
      .filter((response) => response.level === level && response.quizType === type)
    const current = stats[level][type]
    return current.attempts >= responses.length &&
      current.correct >= responses.filter(({ isCorrect }) => isCorrect).length &&
      current.totalAnswerTimeMs >= responses.reduce(
        (total, { answerTimeMs }) => total + answerTimeMs,
        0,
      ) &&
      current.reexposureAttempts >= responses.filter(({ isReexposure }) => isReexposure).length &&
      current.reexposureCorrect >= responses.filter(
        ({ isReexposure, isCorrect }) => isReexposure && isCorrect,
      ).length
  }))
}

function isLegacyTrackingState(value: unknown): value is UnknownRecord {
  return isRecord(value) &&
    hasExactKeys(value, [
      'dailyActivity',
      'itemSchedule',
      'quizResponses',
      'quizTypeStats',
      'sessionHistory',
      'queueHistory',
    ]) &&
    isTrackingCollectionsValid(value, isLegacyQueueHistoryRecord)
}

function isStateLoadHistoryRecord(value: unknown): boolean {
  if (!isRecord(value) ||
    !hasExactKeys(value, [
      'sequence',
      'occurredAt',
      'outcome',
      'source',
      'sourceSchemaVersion',
      'sourceTrackingVersion',
    ]) ||
    !isPositiveInteger(value.sequence) ||
    !isTimestamp(value.occurredAt) ||
    !isEnumValue(STATE_LOAD_OUTCOMES, value.outcome) ||
    !isEnumValue(STATE_LOAD_SOURCES, value.source) ||
    !(value.sourceSchemaVersion === null || isPositiveInteger(value.sourceSchemaVersion)) ||
    !(value.sourceTrackingVersion === null || isPositiveInteger(value.sourceTrackingVersion))
  ) return false

  if (value.outcome === 'empty') {
    return value.source === 'empty' &&
      value.sourceSchemaVersion === null &&
      value.sourceTrackingVersion === null
  }
  if (value.outcome === 'loaded') {
    return value.source === 'current' &&
      (value.sourceSchemaVersion === 6 || value.sourceSchemaVersion === 7) &&
      value.sourceTrackingVersion === TRACKING_SCHEMA_VERSION
  }
  if (value.outcome === 'migrated') {
    return (value.source === 'versioned' || value.source === 'legacy') &&
      (value.source === 'versioned' || value.sourceSchemaVersion === null)
  }
  return value.source === 'malformed' || value.source === 'storage-error'
}

function isStateLoadHistory(value: unknown): boolean {
  if (
    !Array.isArray(value) ||
    value.length > MAX_STATE_LOAD_HISTORY ||
    !value.every(isStateLoadHistoryRecord)
  ) return false
  return value.every((record, index) => {
    if (index === 0) return true
    const previous = value[index - 1] as UnknownRecord
    const current = record as UnknownRecord
    return (current.sequence as number) > (previous.sequence as number) &&
      (current.occurredAt as number) >= (previous.occurredAt as number)
  })
}

function isTrackingState(value: unknown): value is TrackingState {
  return isRecord(value) &&
    hasExactKeys(value, [
      'trackingVersion',
      'dailyActivity',
      'itemSchedule',
      'quizResponses',
      'quizTypeStats',
      'sessionHistory',
      'queueHistory',
      'stateLoadHistory',
    ]) &&
    value.trackingVersion === TRACKING_SCHEMA_VERSION &&
    isTrackingCollectionsValid(value, isQueueHistoryRecord) &&
    isStateLoadHistory(value.stateLoadHistory)
}

function isQuizTypeStats(value: unknown): value is QuizTypeStats {
  if (!isRecord(value) || !hasExactKeys(value, ['correct', 'wrong', 'total', 'accuracy'])) {
    return false
  }
  if (
    !isNonNegativeInteger(value.correct) ||
    !isNonNegativeInteger(value.wrong) ||
    !isNonNegativeInteger(value.total) ||
    !isRate(value.accuracy) ||
    value.correct + value.wrong !== value.total
  ) {
    return false
  }

  const expectedAccuracy = value.total === 0 ? 0 : value.correct / value.total
  return value.accuracy === expectedAccuracy
}

function isQuizSummary(value: unknown): boolean {
  if (!isRecord(value)) return false
  const typeStats = value.typeStats
  const heatmap = value.heatmap
  const wrongItemIds = value.wrongItemIds

  if (
    !hasExactKeys(value, [
      'score',
      'total',
      'accuracy',
      'typeStats',
      'heatmap',
      'wrongItemIds',
    ]) ||
    !isNonNegativeInteger(value.score) ||
    !isNonNegativeInteger(value.total) ||
    value.score > value.total ||
    !isRate(value.accuracy) ||
    !isRecord(typeStats) ||
    !hasExactKeys(typeStats, QUIZ_TYPES) ||
    !QUIZ_TYPES.every((type) => isQuizTypeStats(typeStats[type])) ||
    !Array.isArray(heatmap) ||
    !Array.isArray(wrongItemIds)
  ) {
    return false
  }

  const heatmapValid = heatmap.every(
    (entry) =>
      isRecord(entry) &&
      hasExactKeys(entry, ['questionId', 'sourceItemId', 'type', 'isCorrect']) &&
      isNonEmptyString(entry.questionId) &&
      isNonEmptyString(entry.sourceItemId) &&
      isEnumValue(QUIZ_TYPES, entry.type) &&
      typeof entry.isCorrect === 'boolean',
  )
  if (!heatmapValid || heatmap.length !== value.total) return false
  if (!wrongItemIds.every(isNonEmptyString)) return false
  if (new Set(wrongItemIds).size !== wrongItemIds.length) return false

  const expectedAccuracy = value.total === 0 ? 0 : value.score / value.total
  if (value.accuracy !== expectedAccuracy) return false

  const correctCount = heatmap.filter(
    (entry) => isRecord(entry) && entry.isCorrect === true,
  ).length
  if (correctCount !== value.score) return false

  const expectedWrongItemIds = [
    ...new Set(
      heatmap
        .filter((entry) => isRecord(entry) && entry.isCorrect === false)
        .map((entry) => (isRecord(entry) ? entry.sourceItemId : null))
        .filter(isNonEmptyString),
    ),
  ]
  if (
    expectedWrongItemIds.length !== wrongItemIds.length ||
    expectedWrongItemIds.some((id, index) => id !== wrongItemIds[index])
  ) {
    return false
  }

  return QUIZ_TYPES.every((type) => {
    const entries = heatmap.filter(
      (entry) => isRecord(entry) && entry.type === type,
    )
    const stats = typeStats[type] as QuizTypeStats
    return (
      entries.length === stats.total &&
      entries.filter((entry) => isRecord(entry) && entry.isCorrect === true).length ===
        stats.correct
    )
  })
}

type VersionSixAppState = Omit<AppState, 'schemaVersion' | 'grammarMastery'> & {
  schemaVersion: 6
  grammarMastery: Record<string, VersionSixGrammarMastery>
}

type VersionFiveAppState = Omit<VersionSixAppState, 'schemaVersion' | 'tracking'> & {
  schemaVersion: 5
}

function isVersionFiveAppState(value: unknown): value is VersionFiveAppState {
  if (!isRecord(value)) return false
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'navigation',
      'mastery',
      'grammarMastery',
      'mistakes',
      'studySessions',
      'difficultyStats',
      'studyAnalytics',
      'quizHistory',
    ]) ||
    value.schemaVersion !== 5 ||
    !isNavigationState(value.navigation) ||
    !isRecordOf(value.mastery, isWordMastery) ||
    !isVersionSixGrammarMasteryRecord(value.grammarMastery) ||
    !isRecordOf(value.mistakes, isLegacyMistakeRecord) ||
    !isStudySessions(value.studySessions) ||
    !isDifficultyStatsByLevel(value.difficultyStats) ||
    !isStudyAnalytics(value.studyAnalytics) ||
    !Array.isArray(value.quizHistory) ||
    value.quizHistory.length > 7
  ) {
    return false
  }

  return value.quizHistory.every(isQuizSummary)
}

type LegacyVersionSixAppState = Omit<VersionSixAppState, 'tracking'> & {
  tracking: UnknownRecord
}

function isLegacyVersionSixAppState(
  value: unknown,
): value is LegacyVersionSixAppState {
  if (!isRecord(value)) return false
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'navigation',
      'mastery',
      'grammarMastery',
      'mistakes',
      'studySessions',
      'difficultyStats',
      'studyAnalytics',
      'quizHistory',
      'tracking',
    ]) ||
    value.schemaVersion !== 6 ||
    !isNavigationState(value.navigation) ||
    !isRecordOf(value.mastery, isWordMastery) ||
    !isVersionSixGrammarMasteryRecord(value.grammarMastery) ||
    !isRecordOf(value.mistakes, isMistakeRecord) ||
    !isStudySessions(value.studySessions) ||
    !isDifficultyStatsByLevel(value.difficultyStats) ||
    !isStudyAnalytics(value.studyAnalytics) ||
    !Array.isArray(value.quizHistory) ||
    value.quizHistory.length > 7 ||
    !value.quizHistory.every(isQuizSummary) ||
    !isLegacyTrackingState(value.tracking)
  ) return false

  const mastery = value.mastery as UnknownRecord
  const tracking = value.tracking
  const itemSchedule = tracking.itemSchedule as UnknownRecord
  const quizResponses = tracking.quizResponses as QuizResponseRecord[]
  return Object.keys(itemSchedule).every((itemId) => itemId in mastery) &&
    quizResponses.every(({ sourceItemId }) => sourceItemId in itemSchedule)
}

function upgradeLegacyQueueHistoryRecord(value: unknown): QueueHistoryRecord {
  const legacy = value as Omit<
    QueueHistoryRecord,
    | 'scope'
    | 'auditCompleteness'
    | 'candidateItemIds'
    | 'orderedItemIds'
    | 'itemExposureWeights'
    | 'spacing'
  >
  return {
    ...legacy,
    scope: 'standard',
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
  }
}

function upgradeLegacyVersionSix(value: LegacyVersionSixAppState): VersionSixAppState {
  const tracking = value.tracking
  return {
    ...value,
    tracking: {
      trackingVersion: TRACKING_SCHEMA_VERSION,
      dailyActivity: tracking.dailyActivity as TrackingState['dailyActivity'],
      itemSchedule: tracking.itemSchedule as TrackingState['itemSchedule'],
      quizResponses: tracking.quizResponses as TrackingState['quizResponses'],
      quizTypeStats: tracking.quizTypeStats as TrackingState['quizTypeStats'],
      sessionHistory: tracking.sessionHistory as TrackingState['sessionHistory'],
      queueHistory: (tracking.queueHistory as unknown[])
        .map(upgradeLegacyQueueHistoryRecord),
      stateLoadHistory: [],
    },
  }
}

function isVersionSixAppState(value: unknown): value is VersionSixAppState {
  if (!isRecord(value)) return false
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'navigation',
      'mastery',
      'grammarMastery',
      'mistakes',
      'studySessions',
      'difficultyStats',
      'studyAnalytics',
      'quizHistory',
      'tracking',
    ]) ||
    value.schemaVersion !== 6 ||
    !isNavigationState(value.navigation) ||
    !isRecordOf(value.mastery, isWordMastery) ||
    !isVersionSixGrammarMasteryRecord(value.grammarMastery) ||
    !isRecordOf(value.mistakes, isMistakeRecord) ||
    !isStudySessions(value.studySessions) ||
    !isDifficultyStatsByLevel(value.difficultyStats) ||
    !isStudyAnalytics(value.studyAnalytics) ||
    !Array.isArray(value.quizHistory) ||
    value.quizHistory.length > 7 ||
    !value.quizHistory.every(isQuizSummary) ||
    !isTrackingState(value.tracking)
  ) return false

  const mastery = value.mastery as UnknownRecord
  const tracking = value.tracking as TrackingState
  return Object.keys(tracking.itemSchedule).every((itemId) => itemId in mastery) &&
    tracking.quizResponses.every(({ sourceItemId }) => sourceItemId in tracking.itemSchedule)
}

export function isAppState(value: unknown): value is AppState {
  if (!isRecord(value)) return false
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'navigation',
      'mastery',
      'grammarMastery',
      'mistakes',
      'studySessions',
      'difficultyStats',
      'studyAnalytics',
      'quizHistory',
      'tracking',
    ]) ||
    value.schemaVersion !== 7 ||
    !isNavigationState(value.navigation) ||
    !isRecordOf(value.mastery, isWordMastery) ||
    !isGrammarMasteryRecord(value.grammarMastery) ||
    !isRecordOf(value.mistakes, isMistakeRecord) ||
    !isStudySessions(value.studySessions) ||
    !isDifficultyStatsByLevel(value.difficultyStats) ||
    !isStudyAnalytics(value.studyAnalytics) ||
    !Array.isArray(value.quizHistory) ||
    value.quizHistory.length > 7 ||
    !value.quizHistory.every(isQuizSummary) ||
    !isTrackingState(value.tracking)
  ) {
    return false
  }

  const mastery = value.mastery as UnknownRecord
  const tracking = value.tracking as TrackingState
  return Object.keys(tracking.itemSchedule).every((itemId) => itemId in mastery) &&
    tracking.quizResponses.every(({ sourceItemId }) => sourceItemId in tracking.itemSchedule)
}

function upgradeVersionFive(value: VersionFiveAppState): VersionSixAppState {
  return {
    ...value,
    schemaVersion: 6,
    tracking: createEmptyTrackingState(),
  }
}

function migrateVersionSixGrammarMastery(
  mastery: VersionSixGrammarMastery,
): GrammarMastery {
  const exerciseResults = Object.fromEntries(
    Object.entries(mastery.exerciseResults).filter(([, result]) =>
      result.phase !== 'rediagnostic'),
  )
  const results = Object.values(exerciseResults)
  const errorStreaks = Object.fromEntries(
    Object.keys(mastery.errorCounts).map((code) => [code, 0]),
  )

  return {
    ...mastery,
    attempts: results.length,
    correct: results.filter(({ correct }) => correct).length,
    diagnosticAttempts: results.filter(({ phase }) => phase === 'diagnostic').length,
    practiceAttempts: results.filter(({ phase }) => phase === 'practice').length,
    rediagnosticAttempts: 0,
    productionAttempts: mastery.productionAttempts,
    productionPassed: false,
    retryCount: mastery.retryCount,
    errorCounts: { ...mastery.errorCounts },
    errorStreaks,
    exerciseResults,
    reviewRequirement: null,
    production: null,
    mustReview: false,
    completed: false,
  }
}

function upgradeVersionSix(value: VersionSixAppState): AppState {
  return {
    ...value,
    schemaVersion: 7,
    grammarMastery: Object.fromEntries(
      Object.entries(value.grammarMastery).map(([nodeId, mastery]) => [
        nodeId,
        migrateVersionSixGrammarMastery(mastery),
      ]),
    ),
  }
}

function migrateVersionFour(value: unknown): VersionFiveAppState | null {
  if (!isRecord(value)) return null
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'navigation',
      'mastery',
      'grammarMastery',
      'mistakes',
      'studySessions',
      'difficultyStats',
      'studyAnalytics',
      'quizHistory',
    ]) ||
    value.schemaVersion !== 4 ||
    !isNavigationState(value.navigation) ||
    !isRecordOf(value.mastery, isWordMastery) ||
    !isVersionSixGrammarMasteryRecord(value.grammarMastery) ||
    !isRecordOf(value.mistakes, isLegacyMistakeRecord) ||
    !isStudySessions(value.studySessions) ||
    !isDifficultyStatsRecord(value.difficultyStats) ||
    !isLevelStudyAnalytics(value.studyAnalytics) ||
    !Array.isArray(value.quizHistory) ||
    value.quizHistory.length > 7 ||
    !value.quizHistory.every(isQuizSummary)
  ) {
    return null
  }

  const previousAnalytics = value.studyAnalytics
  const previousDifficultyStats = value.difficultyStats
  const navigation = value.navigation
  const difficultyStats = createEmptyDifficultyStatsByLevel()
  difficultyStats[navigation.level] = Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [
      difficulty,
      { ...previousDifficultyStats[difficulty] },
    ]),
  ) as LevelDifficultyStats
  const studyAnalytics = createEmptyStudyAnalytics()
  studyAnalytics[navigation.level] = {
    selectedDifficulty: { ...previousAnalytics.selectedDifficulty },
    exposedDifficulty: { ...previousAnalytics.exposedDifficulty },
    wrongReexposures: { ...previousAnalytics.wrongReexposures },
  }

  return {
    ...(value as unknown as Omit<
      VersionFiveAppState,
      'schemaVersion' | 'difficultyStats' | 'studyAnalytics'
    >),
    schemaVersion: 5,
    difficultyStats,
    studyAnalytics,
  }
}

function migrateVersionThree(value: unknown): VersionFiveAppState | null {
  if (!isRecord(value)) return null
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'navigation',
      'mastery',
      'grammarMastery',
      'mistakes',
      'studySessions',
      'difficultyStats',
      'quizHistory',
    ]) ||
    value.schemaVersion !== 3 ||
    !isNavigationState(value.navigation) ||
    !isRecordOf(value.mastery, isWordMastery) ||
    !isVersionSixGrammarMasteryRecord(value.grammarMastery) ||
    !isRecordOf(value.mistakes, isLegacyMistakeRecord) ||
    !isStudySessions(value.studySessions) ||
    !isDifficultyStatsRecord(value.difficultyStats) ||
    !Array.isArray(value.quizHistory) ||
    value.quizHistory.length > 7 ||
    !value.quizHistory.every(isQuizSummary)
  ) {
    return null
  }

  return {
    ...(value as unknown as Omit<
      VersionFiveAppState,
      'schemaVersion' | 'difficultyStats' | 'studyAnalytics'
    >),
    schemaVersion: 5,
    difficultyStats: createEmptyDifficultyStatsByLevel(),
    studyAnalytics: createEmptyStudyAnalytics(),
  }
}

function migrateVersionTwo(value: unknown): VersionFiveAppState | null {
  if (!isRecord(value)) return null
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'navigation',
      'mastery',
      'grammarMastery',
      'mistakes',
      'studySessions',
      'difficultyStats',
      'quizHistory',
    ]) ||
    value.schemaVersion !== 2 ||
    !isNavigationState(value.navigation) ||
    !isRecordOf(value.mastery, isWordMastery) ||
    !isVersionTwoGrammarMasteryRecord(value.grammarMastery) ||
    !isRecordOf(value.mistakes, isLegacyMistakeRecord) ||
    !isStudySessions(value.studySessions) ||
    !isDifficultyStatsRecord(value.difficultyStats) ||
    !Array.isArray(value.quizHistory) ||
    value.quizHistory.length > 7 ||
    !value.quizHistory.every(isQuizSummary)
  ) {
    return null
  }

  return {
    ...(value as unknown as Omit<
      VersionFiveAppState,
      'schemaVersion' | 'grammarMastery' | 'difficultyStats' | 'studyAnalytics'
    >),
    schemaVersion: 5,
    grammarMastery: {},
    difficultyStats: createEmptyDifficultyStatsByLevel(),
    studyAnalytics: createEmptyStudyAnalytics(),
  }
}

function migrateVersionOne(value: unknown): VersionFiveAppState | null {
  if (!isRecord(value)) return null
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'navigation',
      'mastery',
      'mistakes',
      'studySessions',
      'difficultyStats',
      'quizHistory',
    ]) ||
    value.schemaVersion !== 1 ||
    !isNavigationState(value.navigation) ||
    !isRecordOf(value.mastery, isWordMastery) ||
    !isRecordOf(value.mistakes, isLegacyMistakeRecord) ||
    !isStudySessions(value.studySessions) ||
    !isDifficultyStatsRecord(value.difficultyStats) ||
    !Array.isArray(value.quizHistory) ||
    value.quizHistory.length > 7 ||
    !value.quizHistory.every(isQuizSummary)
  ) {
    return null
  }

  return {
    ...(value as unknown as Omit<
      VersionFiveAppState,
      'schemaVersion' | 'grammarMastery' | 'difficultyStats' | 'studyAnalytics'
    >),
    schemaVersion: 5,
    grammarMastery: {},
    difficultyStats: createEmptyDifficultyStatsByLevel(),
    studyAnalytics: createEmptyStudyAnalytics(),
  }
}

const LEGACY_KEYS = [
  'level',
  'section',
  'grammarSection',
  'studyDifficulty',
  'quizType',
] as const

function migrateLegacy(value: unknown): AppState | null {
  if (!isRecord(value) || Object.keys(value).length === 0) return null
  if ('schemaVersion' in value || !hasOnlyKeys(value, LEGACY_KEYS)) return null

  const state = createInitialState()
  const navigation = { ...state.navigation }

  if ('level' in value) {
    if (!isEnumValue(LEVELS, value.level)) return null
    navigation.level = value.level
  }
  if ('section' in value) {
    if (!isEnumValue(SECTIONS, value.section)) return null
    navigation.section = value.section
  }
  if ('grammarSection' in value) {
    if (!isEnumValue(GRAMMAR_SECTIONS, value.grammarSection)) return null
    navigation.grammarSection = value.grammarSection
  }
  if ('studyDifficulty' in value) {
    if (!isEnumValue(DIFFICULTIES, value.studyDifficulty)) return null
    navigation.studyDifficulty = value.studyDifficulty
  }
  if ('quizType' in value) {
    if (!isEnumValue(QUIZ_TYPES, value.quizType)) return null
    navigation.quizType = value.quizType
  }

  return { ...state, navigation }
}

export interface LoadAppStateOptions {
  now?: () => number
}

function sourceSchemaVersion(value: unknown): number | null {
  if (!isRecord(value) || !isPositiveInteger(value.schemaVersion)) return null
  return value.schemaVersion
}

function sourceTrackingVersion(value: unknown): number | null {
  if (!isRecord(value) || !isRecord(value.tracking)) return null
  if (isPositiveInteger(value.tracking.trackingVersion)) {
    return value.tracking.trackingVersion
  }
  return value.schemaVersion === 6 || value.schemaVersion === 7 ? 1 : null
}

function loadTimestamp(
  state: AppState,
  clock: () => number,
): number {
  const previous = state.tracking.stateLoadHistory.at(-1)?.occurredAt ?? 0
  try {
    const value = clock()
    if (!Number.isFinite(value) || value < 0) return previous
    return Math.max(
      previous,
      Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)),
    )
  } catch {
    return previous
  }
}

function observedLoad(
  state: AppState,
  outcome: LoadStatus,
  source: TrackingState['stateLoadHistory'][number]['source'],
  sourceSchema: number | null,
  sourceTracking: number | null,
  clock: () => number,
): AppState {
  const compactedTracking = compactTrackingQueueHistory(state.tracking)
  return {
    ...state,
    tracking: recordStateLoadTracking(compactedTracking, {
      occurredAt: loadTimestamp(state, clock),
      outcome,
      source,
      sourceSchemaVersion: sourceSchema,
      sourceTrackingVersion: sourceTracking,
    }),
  }
}

function recovered(
  rawBackup: string | null,
  source: 'malformed' | 'storage-error',
  parsed: unknown,
  clock: () => number,
): LoadResult {
  const state = createInitialState()
  return {
    state: observedLoad(
      state,
      'recovered',
      source,
      sourceSchemaVersion(parsed),
      sourceTrackingVersion(parsed),
      clock,
    ),
    status: 'recovered',
    warning: RECOVERY_WARNING,
    rawBackup,
  }
}

export function loadAppState(
  storage: Pick<Storage, 'getItem'>,
  options: LoadAppStateOptions = {},
): LoadResult {
  const clock = options.now ?? Date.now
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return recovered(null, 'storage-error', null, clock)
  }

  if (raw === null) {
    const state = createInitialState()
    return {
      state: observedLoad(state, 'empty', 'empty', null, null, clock),
      status: 'empty',
      warning: null,
      rawBackup: null,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return recovered(raw, 'malformed', null, clock)
  }

  if (isAppState(parsed)) {
    return {
      state: observedLoad(
        parsed,
        'loaded',
        'current',
        7,
        TRACKING_SCHEMA_VERSION,
        clock,
      ),
      status: 'loaded',
      warning: null,
      rawBackup: null,
    }
  }

  const versionSix = isVersionSixAppState(parsed)
    ? parsed
    : isLegacyVersionSixAppState(parsed)
      ? upgradeLegacyVersionSix(parsed)
      : null

  const previousVersion = isVersionFiveAppState(parsed)
    ? parsed
    : migrateVersionFour(parsed) ??
      migrateVersionThree(parsed) ??
      migrateVersionTwo(parsed) ??
      migrateVersionOne(parsed)
  const legacy = previousVersion ? null : migrateLegacy(parsed)
  const migrated = versionSix
    ? upgradeVersionSix(versionSix)
    : previousVersion
      ? upgradeVersionSix(upgradeVersionFive(previousVersion))
      : legacy
  if (migrated) {
    const source = versionSix || previousVersion ? 'versioned' : 'legacy'
    return {
      state: observedLoad(
        migrated,
        'migrated',
        source,
        sourceSchemaVersion(parsed),
        sourceTrackingVersion(parsed),
        clock,
      ),
      status: 'migrated',
      warning: MIGRATION_WARNING,
      rawBackup: raw,
    }
  }

  return recovered(raw, 'malformed', parsed, clock)
}

export function saveAppState(
  storage: Pick<Storage, 'setItem'>,
  state: AppState,
): SaveResult {
  try {
    if (!isAppState(state)) return { ok: false, message: SAVE_ERROR_MESSAGE }
    const compacted = {
      ...state,
      tracking: compactTrackingQueueHistory(state.tracking),
    }
    const serialized = JSON.stringify(compacted)
    storage.setItem(STORAGE_KEY, serialized)
    return { ok: true }
  } catch {
    return { ok: false, message: SAVE_ERROR_MESSAGE }
  }
}

export function saveRawBackup(
  storage: Pick<Storage, 'setItem'>,
  rawBackup: string,
): SaveResult {
  try {
    storage.setItem(BACKUP_STORAGE_KEY, rawBackup)
    return { ok: true }
  } catch {
    return { ok: false, message: BACKUP_ERROR_MESSAGE }
  }
}
