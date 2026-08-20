import {
  GRAMMAR_LEVELS,
  type GrammarNode,
} from '../content/types'
import {
  isGrammarNodeUnlocked,
  latestGrammarExerciseResult,
  type GrammarMastery,
} from './mastery'

export type GrammarRecommendationReason =
  | 'focus-review'
  | 'rediagnostic'
  | 'error-recovery'
  | 'continue-learning'
  | 'next-unstarted'

export interface GrammarQueueItem {
  node: GrammarNode
  errorCount: number
  retryCount: number
  rediagnosticAttempts: number
}

export interface GrammarRecommendation extends GrammarQueueItem {
  reason: GrammarRecommendationReason
}

export interface GrammarPrerequisitePassRate {
  passed: number
  total: number
  ratio: number
}

export interface GrammarLearningPlan {
  recommendation: GrammarRecommendation | null
  focusReviewQueue: GrammarQueueItem[]
  rediagnosticQueue: GrammarQueueItem[]
  prerequisitePassRate: GrammarPrerequisitePassRate
  rediagnosticRepeatCount: number
  completedCount: number
  totalCount: number
  allCompleted: boolean
}

function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function canonicalGrammarNodes(nodes: readonly GrammarNode[]): GrammarNode[] {
  const sorted = [...nodes].sort((left, right) =>
    GRAMMAR_LEVELS.indexOf(left.level) - GRAMMAR_LEVELS.indexOf(right.level)
      || compareText(left.id, right.id))
  const seen = new Set<string>()
  return sorted.filter(({ id }) => {
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUsableGrammarMastery(value: unknown): value is GrammarMastery {
  return isRecord(value)
    && typeof value.completed === 'boolean'
    && typeof value.mustReview === 'boolean'
    && typeof value.productionPassed === 'boolean'
    && typeof value.attempts === 'number'
    && typeof value.retryCount === 'number'
    && typeof value.diagnosticAttempts === 'number'
    && typeof value.practiceAttempts === 'number'
    && typeof value.rediagnosticAttempts === 'number'
    && isRecord(value.errorCounts)
    && isRecord(value.exerciseResults)
}

function knownMastery(
  nodes: readonly GrammarNode[],
  masteryByNode: Readonly<Record<string, GrammarMastery>>,
): Record<string, GrammarMastery> {
  return Object.fromEntries(nodes.flatMap(({ id }) => {
    const mastery = (masteryByNode as Readonly<Record<string, unknown>>)[id]
    return isUsableGrammarMastery(mastery) ? [[id, mastery] as const] : []
  }))
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}

function totalErrors(mastery: GrammarMastery | undefined): number {
  if (!mastery) return 0
  return Object.values(mastery.errorCounts).reduce(
    (total, count) => total + nonNegativeInteger(count),
    0,
  )
}

function queueItem(node: GrammarNode, mastery: GrammarMastery | undefined): GrammarQueueItem {
  return {
    node,
    errorCount: totalErrors(mastery),
    retryCount: nonNegativeInteger(mastery?.retryCount),
    rediagnosticAttempts: nonNegativeInteger(mastery?.rediagnosticAttempts),
  }
}

function compareQueueItems(left: GrammarQueueItem, right: GrammarQueueItem): number {
  return right.errorCount - left.errorCount
    || right.retryCount - left.retryCount
    || right.rediagnosticAttempts - left.rediagnosticAttempts
    || compareText(left.node.id, right.node.id)
}

function hasValidPendingReview(
  mastery: GrammarMastery,
  knownNodeIds: ReadonlySet<string>,
): boolean {
  return mastery.mustReview
    && mastery.reviewRequirement !== null
    && mastery.reviewRequirement.completed === false
    && knownNodeIds.has(mastery.reviewRequirement.nodeId)
}

function hasInvalidReviewRequirement(
  mastery: GrammarMastery | undefined,
  knownNodeIds: ReadonlySet<string>,
): boolean {
  return Boolean(
    mastery?.mustReview
      && (
        !mastery.reviewRequirement
        || !knownNodeIds.has(mastery.reviewRequirement.nodeId)
      ),
  )
}

function isReadyForRediagnosis(node: GrammarNode, mastery: GrammarMastery): boolean {
  if (
    mastery.completed
    || mastery.diagnosticAttempts <= 0
    || mastery.practiceAttempts <= 0
    || !mastery.productionPassed
    || (mastery.mustReview && mastery.reviewRequirement?.completed !== true)
  ) return false

  const rediagnosticExercises = node.exercises.filter(
    ({ phase }) => phase === 'rediagnostic',
  )
  return rediagnosticExercises.some(
    ({ id }) => latestGrammarExerciseResult(mastery, id)?.correct !== true,
  )
}

function recommendationReason(
  mastery: GrammarMastery | undefined,
): Exclude<GrammarRecommendationReason, 'focus-review' | 'rediagnostic'> {
  if (totalErrors(mastery) > 0 || nonNegativeInteger(mastery?.retryCount) > 0) {
    return 'error-recovery'
  }
  if (
    nonNegativeInteger(mastery?.attempts) > 0
    || nonNegativeInteger(mastery?.diagnosticAttempts) > 0
    || nonNegativeInteger(mastery?.practiceAttempts) > 0
  ) {
    return 'continue-learning'
  }
  return 'next-unstarted'
}

const RECOMMENDATION_PRIORITY: Record<
  Exclude<GrammarRecommendationReason, 'focus-review' | 'rediagnostic'>,
  number
> = {
  'error-recovery': 0,
  'continue-learning': 1,
  'next-unstarted': 2,
}

export function selectGrammarLearningPlan(
  nodes: readonly GrammarNode[],
  masteryByNode: Readonly<Record<string, GrammarMastery>>,
): GrammarLearningPlan {
  const canonicalNodes = canonicalGrammarNodes(nodes)
  const nodeIds = new Set(canonicalNodes.map(({ id }) => id))
  const currentMastery = knownMastery(canonicalNodes, masteryByNode)
  const completedCount = canonicalNodes.filter(
    ({ id }) => currentMastery[id]?.completed === true,
  ).length
  const allCompleted = canonicalNodes.length > 0 && completedCount === canonicalNodes.length
  const eligibleNodes = canonicalNodes.filter((node) =>
    currentMastery[node.id]?.completed !== true
      && !hasInvalidReviewRequirement(currentMastery[node.id], nodeIds)
      && isGrammarNodeUnlocked(node, canonicalNodes, currentMastery))

  const focusReviewQueue = eligibleNodes
    .filter((node) => {
      const mastery = currentMastery[node.id]
      return mastery ? hasValidPendingReview(mastery, nodeIds) : false
    })
    .map((node) => queueItem(node, currentMastery[node.id]))
    .sort(compareQueueItems)
  const rediagnosticQueue = eligibleNodes
    .filter((node) => {
      const mastery = currentMastery[node.id]
      return mastery ? isReadyForRediagnosis(node, mastery) : false
    })
    .map((node) => queueItem(node, currentMastery[node.id]))
    .sort(compareQueueItems)

  const focusReview = focusReviewQueue[0]
  const rediagnostic = rediagnosticQueue[0]
  const recommendation: GrammarRecommendation | null = focusReview
    ? { ...focusReview, reason: 'focus-review' }
    : rediagnostic
      ? { ...rediagnostic, reason: 'rediagnostic' }
      : eligibleNodes
      .map((node) => ({
        ...queueItem(node, currentMastery[node.id]),
        reason: recommendationReason(currentMastery[node.id]),
      }))
      .sort((left, right) =>
        RECOMMENDATION_PRIORITY[left.reason] - RECOMMENDATION_PRIORITY[right.reason]
          || compareQueueItems(left, right))[0] ?? null

  const prerequisiteNodes = canonicalNodes.filter(
    ({ prerequisite }) => prerequisite !== null && nodeIds.has(prerequisite),
  )
  const prerequisitePassed = prerequisiteNodes.filter(({ prerequisite }) =>
    prerequisite !== null && currentMastery[prerequisite]?.completed === true).length

  return {
    recommendation,
    focusReviewQueue,
    rediagnosticQueue,
    prerequisitePassRate: {
      passed: prerequisitePassed,
      total: prerequisiteNodes.length,
      ratio: prerequisiteNodes.length === 0
        ? 0
        : prerequisitePassed / prerequisiteNodes.length,
    },
    rediagnosticRepeatCount: canonicalNodes.reduce(
      (total, { id }) => total + nonNegativeInteger(currentMastery[id]?.rediagnosticAttempts),
      0,
    ),
    completedCount,
    totalCount: canonicalNodes.length,
    allCompleted,
  }
}
