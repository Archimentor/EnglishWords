import {
  GRAMMAR_LEVELS,
  type GrammarExercisePhase,
  type GrammarLevel,
  type GrammarMasteryRule,
  type GrammarNode,
  type GrammarProductionConstraints,
  type GrammarProductionTask,
} from '../content/types'

export const GRAMMAR_ERROR_CATEGORIES = [
  'article',
  'preposition',
  'tense',
] as const

export type GrammarErrorCategory = (typeof GRAMMAR_ERROR_CATEGORIES)[number]
export type GrammarProductionReviewStatus = 'pending' | 'approved' | 'rejected'

export interface GrammarExerciseResult {
  /**
   * The catalog exercise this result belongs to. Results written before
   * attempt-level history was introduced omit this field and use their record
   * key as the exercise id.
   */
  exerciseId?: string
  phase: GrammarExercisePhase
  correct: boolean
  errorCode: string
}

export interface GrammarReviewRequirement {
  nodeId: string
  errorCode: string
  completed: boolean
}

export interface GrammarProductionRecord {
  draft: string
  parts: GrammarProductionPart[]
  requirementEvidence: GrammarProductionRequirementEvidence[]
  rubricEvidence: GrammarProductionEvidenceReference[]
  cycleStartAttempt: number
  revisionRound: number
  revisionNote: string | null
  reviewStatus: GrammarProductionReviewStatus
  reviewChecks: boolean[] | null
}

export interface GrammarMastery {
  attempts: number
  correct: number
  diagnosticAttempts: number
  practiceAttempts: number
  rediagnosticAttempts: number
  productionAttempts: number
  productionPassed: boolean
  retryCount: number
  errorCounts: Record<string, number>
  errorStreaks: Record<string, number>
  exerciseResults: Record<string, GrammarExerciseResult>
  reviewRequirement: GrammarReviewRequirement | null
  production: GrammarProductionRecord | null
  mustReview: boolean
  completed: boolean
}

export interface GrammarExerciseAttempt extends GrammarExerciseResult {
  exerciseId: string
  /** Stable id for one submit action. Replaying the same action is idempotent. */
  attemptId?: string
  reviewNodeId: string
}

export interface GrammarProductionSubmission {
  draft: string
  parts: GrammarProductionPart[]
  requirementEvidence: GrammarProductionRequirementEvidence[]
  rubricEvidence: GrammarProductionEvidenceReference[]
  revisionNote: string | null
}

export interface GrammarProductionPart {
  partId: string
  text: string
}

export interface GrammarProductionEvidenceReference {
  partId: string
  sentenceIndex: number
}

export interface GrammarProductionRequirementEvidence {
  requirementId: string
  selections: GrammarProductionEvidenceReference[]
}

export interface GrammarLevelProgress {
  level: GrammarLevel
  completed: number
  total: number
  ratio: number
}

export interface GrammarErrorCluster {
  code: string
  count: number
}

export interface GrammarErrorCategoryStat {
  attempts: number
  correct: number
  accuracy: number
}

export type GrammarErrorCategoryProgress = Record<
  GrammarErrorCategory,
  GrammarErrorCategoryStat
>

export function emptyGrammarMastery(): GrammarMastery {
  return {
    attempts: 0,
    correct: 0,
    diagnosticAttempts: 0,
    practiceAttempts: 0,
    rediagnosticAttempts: 0,
    productionAttempts: 0,
    productionPassed: false,
    retryCount: 0,
    errorCounts: {},
    errorStreaks: {},
    exerciseResults: {},
    reviewRequirement: null,
    production: null,
    mustReview: false,
    completed: false,
  }
}

export function grammarAccuracy(mastery: GrammarMastery | undefined): number {
  if (!mastery || mastery.attempts === 0) return 0
  return mastery.correct / mastery.attempts
}

function grammarExerciseId(
  entryId: string,
  result: GrammarExerciseResult,
): string {
  return result.exerciseId ?? entryId
}

/**
 * Returns the most recent stored attempt for a catalog exercise. Object key
 * insertion order is the persisted attempt order; replacing an idempotency key
 * is forbidden by recordGrammarExercise.
 */
export function latestGrammarExerciseResult(
  mastery: Pick<GrammarMastery, 'exerciseResults'>,
  exerciseId: string,
): GrammarExerciseResult | undefined {
  let latest: GrammarExerciseResult | undefined
  for (const [entryId, result] of Object.entries(mastery.exerciseResults)) {
    if (grammarExerciseId(entryId, result) === exerciseId) latest = result
  }
  return latest
}

export function latestGrammarExerciseResults(
  mastery: Pick<GrammarMastery, 'exerciseResults'>,
): GrammarExerciseResult[] {
  const latest = new Map<string, GrammarExerciseResult>()
  for (const [entryId, result] of Object.entries(mastery.exerciseResults)) {
    latest.set(grammarExerciseId(entryId, result), result)
  }
  return [...latest.values()]
}

export function latestGrammarExerciseAccuracy(
  mastery: Pick<GrammarMastery, 'exerciseResults'> | undefined,
): number {
  if (!mastery) return 0
  const results = latestGrammarExerciseResults(mastery)
  return results.length === 0
    ? 0
    : results.filter(({ correct }) => correct).length / results.length
}

function currentGrammarErrorRate(mastery: GrammarMastery): number {
  const results = latestGrammarExerciseResults(mastery)
  return results.length === 0
    ? 0
    : results.filter(({ correct }) => !correct).length / results.length
}

export function grammarErrorRate(mastery: GrammarMastery | undefined): number {
  if (!mastery || mastery.attempts === 0) return 0
  return (mastery.attempts - mastery.correct) / mastery.attempts
}

export function hasCompletedGrammarLoop(mastery: GrammarMastery): boolean {
  return (
    mastery.diagnosticAttempts > 0 &&
    mastery.practiceAttempts > 0 &&
    mastery.productionAttempts > 0 &&
    mastery.rediagnosticAttempts > 0
  )
}

export function meetsGrammarMasteryRule(
  mastery: GrammarMastery,
  rule: GrammarMasteryRule,
): boolean {
  return (
    hasCompletedGrammarLoop(mastery) &&
    latestGrammarExerciseAccuracy(mastery) >= rule.quizAccuracy &&
    currentGrammarErrorRate(mastery) <= rule.errorTolerance &&
    (!rule.productionPass || mastery.productionPassed) &&
    !mastery.mustReview
  )
}

function withCompletion(
  mastery: GrammarMastery,
  rule: GrammarMasteryRule,
): GrammarMastery {
  return { ...mastery, completed: meetsGrammarMasteryRule(mastery, rule) }
}

function exerciseCounters(
  exerciseResults: Readonly<Record<string, GrammarExerciseResult>>,
): Pick<
  GrammarMastery,
  'attempts' | 'correct' | 'diagnosticAttempts' | 'practiceAttempts' | 'rediagnosticAttempts'
> {
  const results = Object.values(exerciseResults)
  return {
    attempts: results.length,
    correct: results.filter(({ correct }) => correct).length,
    diagnosticAttempts: results.filter(({ phase }) => phase === 'diagnostic').length,
    practiceAttempts: results.filter(({ phase }) => phase === 'practice').length,
    rediagnosticAttempts: results.filter(({ phase }) => phase === 'rediagnostic').length,
  }
}

function resetErrorStreaks(current: GrammarMastery): Record<string, number> {
  return Object.fromEntries(
    Object.keys(current.errorStreaks).map((code) => [code, 0]),
  ) as Record<string, number>
}

export function recordGrammarExercise(
  current: GrammarMastery,
  attempt: GrammarExerciseAttempt,
  rule: GrammarMasteryRule,
): GrammarMastery {
  if (
    (attempt.phase === 'practice' && current.diagnosticAttempts === 0) ||
    (attempt.phase === 'rediagnostic' &&
      (current.practiceAttempts === 0 || !current.productionPassed))
  ) {
    return current
  }

  if (
    attempt.phase === 'rediagnostic' &&
    current.mustReview &&
    current.reviewRequirement?.completed !== true
  ) {
    return current
  }

  const attemptId = attempt.attemptId ?? attempt.exerciseId
  if (current.exerciseResults[attemptId]) return current

  const previous = latestGrammarExerciseResult(current, attempt.exerciseId)
  if (
    previous &&
    (previous.phase !== attempt.phase ||
      previous.errorCode !== attempt.errorCode ||
      previous.correct)
  ) return current

  const exerciseResults = {
    ...current.exerciseResults,
    [attemptId]: {
      ...(attemptId === attempt.exerciseId ? {} : { exerciseId: attempt.exerciseId }),
      phase: attempt.phase,
      correct: attempt.correct,
      errorCode: attempt.errorCode,
    },
  }
  const errorCounts = { ...current.errorCounts }
  const errorStreaks = resetErrorStreaks(current)

  if (!attempt.correct && attempt.errorCode) {
    errorCounts[attempt.errorCode] = (errorCounts[attempt.errorCode] ?? 0) + 1
    errorStreaks[attempt.errorCode] =
      (current.errorStreaks[attempt.errorCode] ?? 0) + 1
  }

  const repeatedErrorCode = !attempt.correct && attempt.errorCode &&
      (errorStreaks[attempt.errorCode] ?? 0) >= 2
    ? attempt.errorCode
    : null
  const clearsReview =
    attempt.correct &&
    attempt.phase === 'rediagnostic' &&
    current.mustReview &&
    current.reviewRequirement?.completed === true
  const keepsReview = current.mustReview && !clearsReview
  const mustReview = repeatedErrorCode !== null || keepsReview
  const reviewRequirement = clearsReview
    ? null
    : repeatedErrorCode
      ? {
          nodeId: attempt.reviewNodeId,
          errorCode: repeatedErrorCode,
          completed: false,
        }
      : current.reviewRequirement

  const next: GrammarMastery = {
    ...current,
    ...exerciseCounters(exerciseResults),
    retryCount: current.retryCount + (!attempt.correct ? 1 : 0),
    errorCounts,
    errorStreaks,
    exerciseResults,
    reviewRequirement,
    mustReview,
    completed: false,
  }

  return withCompletion(next, rule)
}

export function recordGrammarPrerequisiteReview(
  current: GrammarMastery,
  reviewedNodeId: string,
  rule: GrammarMasteryRule,
): GrammarMastery {
  if (
    !current.mustReview ||
    !current.reviewRequirement ||
    current.reviewRequirement.nodeId !== reviewedNodeId ||
    current.reviewRequirement.completed
  ) {
    return current
  }

  return withCompletion({
    ...current,
    reviewRequirement: { ...current.reviewRequirement, completed: true },
    completed: false,
  }, rule)
}

export function grammarProductionSentences(value: string): string[] {
  return value
    .split(/[.!?]+/u)
    .map((sentence) => sentence.trim().replace(/\s+/gu, ' '))
    .filter(Boolean)
}

function productionSentenceIsSubstantial(sentence: string): boolean {
  return (sentence.match(/[\p{L}\p{N}]+(?:['’–-][\p{L}\p{N}]+)*/gu)?.length ?? 0) >= 3
}

export function grammarProductionDraft(
  parts: readonly GrammarProductionPart[],
): string {
  return parts.map(({ text }) => text.trim()).join('\n\n')
}

function sentenceMaximumIsSatisfied(
  count: number,
  maximum: number | null,
): boolean {
  return maximum === null || count <= maximum
}

function evidenceKey(reference: GrammarProductionEvidenceReference): string {
  return `${reference.partId}\u0000${reference.sentenceIndex}`
}

function evidenceReferenceIsValid(
  reference: GrammarProductionEvidenceReference,
  sentencesByPart: ReadonlyMap<string, readonly string[]>,
): boolean {
  return (
    typeof reference.partId === 'string' &&
    Number.isInteger(reference.sentenceIndex) &&
    reference.sentenceIndex >= 0 &&
    reference.sentenceIndex < (sentencesByPart.get(reference.partId)?.length ?? 0)
  )
}

export function grammarProductionEvidenceSentence(
  parts: readonly GrammarProductionPart[],
  reference: GrammarProductionEvidenceReference,
): string | null {
  const part = parts.find(({ partId }) => partId === reference.partId)
  return part ? grammarProductionSentences(part.text)[reference.sentenceIndex] ?? null : null
}

export function grammarProductionReviewCount(
  production: Pick<
    GrammarProductionRecord,
    'requirementEvidence' | 'rubricEvidence'
  >,
): number {
  return production.rubricEvidence.length + production.requirementEvidence.length
}

export function isGrammarProductionSubmissionStructurallyValid(
  submission: GrammarProductionSubmission,
  constraints: GrammarProductionConstraints,
  rubricCount: number,
): boolean {
  if (
    !Number.isInteger(rubricCount) ||
    rubricCount !== constraints.rubricEvidenceCount ||
    submission.parts.length !== constraints.parts.length ||
    submission.requirementEvidence.length !== constraints.evidenceRequirements.length ||
    submission.rubricEvidence.length !== rubricCount ||
    !(submission.revisionNote === null || (
      submission.revisionNote.trim().length > 0 &&
      submission.revisionNote === submission.revisionNote.trim()
    ))
  ) {
    return false
  }

  const sentencesByPart = new Map<string, readonly string[]>()
  let sentenceCount = 0
  for (let index = 0; index < constraints.parts.length; index += 1) {
    const partConstraint = constraints.parts[index]
    const part = submission.parts[index]
    if (
      !partConstraint ||
      !part ||
      part.partId !== partConstraint.id ||
      part.text.length === 0 ||
      part.text !== part.text.trim()
    ) {
      return false
    }
    const sentences = grammarProductionSentences(part.text)
    if (
      sentences.length < partConstraint.minSentences ||
      !sentenceMaximumIsSatisfied(sentences.length, partConstraint.maxSentences) ||
      !sentences.every(productionSentenceIsSubstantial)
    ) {
      return false
    }
    sentencesByPart.set(part.partId, sentences)
    sentenceCount += sentences.length
  }

  if (
    sentenceCount < constraints.minSentences ||
    !sentenceMaximumIsSatisfied(sentenceCount, constraints.maxSentences) ||
    submission.draft !== grammarProductionDraft(submission.parts)
  ) {
    return false
  }

  for (let index = 0; index < constraints.evidenceRequirements.length; index += 1) {
    const requirement = constraints.evidenceRequirements[index]
    const evidence = submission.requirementEvidence[index]
    if (
      !requirement ||
      !evidence ||
      evidence.requirementId !== requirement.id ||
      evidence.selections.length < requirement.minSelections ||
      !evidence.selections.every((reference) =>
        evidenceReferenceIsValid(reference, sentencesByPart)) ||
      new Set(evidence.selections.map(evidenceKey)).size !== evidence.selections.length ||
      !requirement.requiredPartIds.every((partId) =>
        evidence.selections.some((reference) => reference.partId === partId))
    ) {
      return false
    }
  }

  return (
    submission.rubricEvidence.every((reference) =>
      evidenceReferenceIsValid(reference, sentencesByPart))
  )
}

export function isGrammarProductionSubmissionValid(
  submission: GrammarProductionSubmission,
  task: GrammarProductionTask,
): boolean {
  return isGrammarProductionSubmissionStructurallyValid(
    submission,
    task.constraints,
    task.rubric.length,
  )
}

export function recordGrammarProduction(
  current: GrammarMastery,
  submission: GrammarProductionSubmission,
  task: GrammarProductionTask,
  rule: GrammarMasteryRule,
): GrammarMastery {
  const previousProduction = current.production
  const revisionRound = previousProduction?.reviewStatus === 'rejected'
    ? previousProduction.revisionRound + 1
    : 0
  const cycleStartAttempt = previousProduction?.reviewStatus === 'rejected'
    ? previousProduction.cycleStartAttempt
    : current.productionAttempts + 1
  const maxRevisionRounds = task.constraints.maxRevisionRounds
  if (
    current.diagnosticAttempts === 0 ||
    current.practiceAttempts === 0 ||
    previousProduction?.reviewStatus === 'pending' ||
    previousProduction?.reviewStatus === 'approved' ||
    (maxRevisionRounds !== null && revisionRound > maxRevisionRounds) ||
    (maxRevisionRounds !== null && revisionRound > 0 && submission.revisionNote === null) ||
    (revisionRound === 0 && submission.revisionNote !== null) ||
    !isGrammarProductionSubmissionValid(submission, task)
  ) {
    return current
  }

  if (
    previousProduction?.reviewStatus === 'rejected' &&
    previousProduction.draft === submission.draft &&
    JSON.stringify(previousProduction.requirementEvidence) ===
      JSON.stringify(submission.requirementEvidence) &&
    JSON.stringify(previousProduction.rubricEvidence) ===
      JSON.stringify(submission.rubricEvidence)
  ) {
    return current
  }

  return withCompletion({
    ...current,
    productionAttempts: current.productionAttempts + 1,
    productionPassed: false,
    production: {
      draft: submission.draft,
      parts: submission.parts.map((part) => ({ ...part })),
      requirementEvidence: submission.requirementEvidence.map((evidence) => ({
        requirementId: evidence.requirementId,
        selections: evidence.selections.map((selection) => ({ ...selection })),
      })),
      rubricEvidence: submission.rubricEvidence.map((evidence) => ({ ...evidence })),
      cycleStartAttempt,
      revisionRound,
      revisionNote: submission.revisionNote,
      reviewStatus: 'pending',
      reviewChecks: null,
    },
    completed: false,
  }, rule)
}

export function restartGrammarProductionCycle(
  current: GrammarMastery,
  task: GrammarProductionTask,
  rule: GrammarMasteryRule,
): GrammarMastery {
  const production = current.production
  const maxRevisionRounds = task.constraints.maxRevisionRounds
  if (
    production?.reviewStatus !== 'rejected' ||
    maxRevisionRounds === null ||
    production.revisionRound < maxRevisionRounds
  ) {
    return current
  }
  return withCompletion({
    ...current,
    productionPassed: false,
    production: null,
    completed: false,
  }, rule)
}

export function recordGrammarProductionReview(
  current: GrammarMastery,
  reviewChecks: readonly boolean[],
  rule: GrammarMasteryRule,
): GrammarMastery {
  const normalizedChecks = Array.from(reviewChecks)
  if (
    current.production?.reviewStatus !== 'pending' ||
    normalizedChecks.length !== grammarProductionReviewCount(current.production) ||
    !normalizedChecks.every((check) => typeof check === 'boolean')
  ) {
    return current
  }

  const approved = normalizedChecks.every(Boolean)
  return withCompletion({
    ...current,
    productionPassed: approved,
    retryCount: current.retryCount + (approved ? 0 : 1),
    production: {
      ...current.production,
      reviewStatus: approved ? 'approved' : 'rejected',
      reviewChecks: normalizedChecks,
    },
    completed: false,
  }, rule)
}

export function grammarLevelProgress(
  level: GrammarLevel,
  nodes: readonly GrammarNode[],
  masteryByNode: Readonly<Record<string, GrammarMastery>>,
): GrammarLevelProgress {
  const levelNodes = nodes.filter((node) => node.level === level)
  const completed = levelNodes.filter((node) => masteryByNode[node.id]?.completed).length
  return {
    level,
    completed,
    total: levelNodes.length,
    ratio: levelNodes.length === 0 ? 0 : completed / levelNodes.length,
  }
}

export function grammarErrorClusters(
  masteryByNode: Readonly<Record<string, GrammarMastery>>,
  nodes?: readonly GrammarNode[],
): GrammarErrorCluster[] {
  const counts: Record<string, number> = {}
  const knownNodeIds = nodes ? new Set(nodes.map(({ id }) => id)) : null
  for (const [nodeId, mastery] of Object.entries(masteryByNode)) {
    if (knownNodeIds && !knownNodeIds.has(nodeId)) continue
    for (const [code, count] of Object.entries(mastery.errorCounts)) {
      counts[code] = (counts[code] ?? 0) + count
    }
  }
  return Object.entries(counts)
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))
}

export function grammarErrorCategory(errorCode: string): GrammarErrorCategory | null {
  if (errorCode.startsWith('ART-')) return 'article'
  if (errorCode.startsWith('PREP-')) return 'preposition'
  if (errorCode.startsWith('TENSE-')) return 'tense'
  return null
}

export function grammarErrorCategoryProgress(
  throughLevel: GrammarLevel,
  nodes: readonly GrammarNode[],
  masteryByNode: Readonly<Record<string, GrammarMastery>>,
): GrammarErrorCategoryProgress {
  const throughIndex = GRAMMAR_LEVELS.indexOf(throughLevel)
  const allowedNodeIds = new Set(nodes
    .filter((node) => GRAMMAR_LEVELS.indexOf(node.level) <= throughIndex)
    .map(({ id }) => id))
  const counts = Object.fromEntries(GRAMMAR_ERROR_CATEGORIES.map((category) => [
    category,
    { attempts: 0, correct: 0, accuracy: 0 },
  ])) as GrammarErrorCategoryProgress

  for (const [nodeId, mastery] of Object.entries(masteryByNode)) {
    if (!allowedNodeIds.has(nodeId)) continue
    for (const result of latestGrammarExerciseResults(mastery)) {
      const category = grammarErrorCategory(result.errorCode)
      if (!category) continue
      counts[category].attempts += 1
      counts[category].correct += result.correct ? 1 : 0
    }
  }

  for (const category of GRAMMAR_ERROR_CATEGORIES) {
    const stat = counts[category]
    stat.accuracy = stat.attempts === 0 ? 0 : stat.correct / stat.attempts
  }
  return counts
}

function hasRequiredCategoryAccuracy(
  throughLevel: GrammarLevel,
  nodes: readonly GrammarNode[],
  masteryByNode: Readonly<Record<string, GrammarMastery>>,
): boolean {
  const progress = grammarErrorCategoryProgress(throughLevel, nodes, masteryByNode)
  return GRAMMAR_ERROR_CATEGORIES.every((category) =>
    progress[category].attempts > 0 && progress[category].accuracy >= 0.7)
}

export function isGrammarNodeUnlocked(
  node: GrammarNode,
  nodes: readonly GrammarNode[],
  masteryByNode: Readonly<Record<string, GrammarMastery>>,
): boolean {
  const prerequisite = node.prerequisite
    ? nodes.find(({ id }) => id === node.prerequisite)
    : undefined
  if (node.prerequisite !== null && !prerequisite) return false
  if (prerequisite?.level === node.level && !masteryByNode[prerequisite.id]?.completed) {
    return false
  }

  const levelIndex = GRAMMAR_LEVELS.indexOf(node.level)
  if (levelIndex <= 0) return node.prerequisite === null || prerequisite?.level === node.level

  const previousLevel = GRAMMAR_LEVELS[levelIndex - 1]
  if (!previousLevel) return false
  const previousLevelNodes = nodes.filter(({ level }) => level === previousLevel)
  const hasApprovedProduction = previousLevelNodes.some(({ id }) =>
    masteryByNode[id]?.productionPassed)

  return (
    grammarLevelProgress(previousLevel, nodes, masteryByNode).ratio >= 0.8 &&
    hasRequiredCategoryAccuracy(previousLevel, nodes, masteryByNode) &&
    hasApprovedProduction
  )
}
