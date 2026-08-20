import type { Difficulty, StudyItem } from '../content/types'
import {
  MAX_STUDY_QUEUE_PRIORITY_COUNT,
  MAX_STUDY_QUEUE_SIZE,
  SPACING_EXCEPTION_POLICIES,
  type ExposureWeightComponents,
  type ItemScheduleRecord,
  type QueueSpacingAudit,
  type SpacingExceptionPolicy,
} from '../progress/tracking'
import type {
  DifficultyStats,
  MistakeRecord,
  WordMastery,
} from '../progress/types'
import type { QuizSessionSummary } from '../quiz/types'
import {
  difficultyAccuracyBoost,
  mistakeBoost,
} from '../progress/mastery'
import {
  DIFFICULTY_MATRIX,
  type DifficultyMatrix,
} from './difficulty'

const DEFAULT_QUEUE_LIMIT = MAX_STUDY_QUEUE_SIZE
const PRIORITY_WINDOW = MAX_STUDY_QUEUE_PRIORITY_COUNT
const RECENT_QUIZ_LIMIT = 7
const RECENT_WRONG_SESSION_BOOST = 0.03
const MAX_RECENT_WRONG_BOOST = 0.45
const GRAMMAR_REVIEW_BOOST = 0.12
const DAY_MS = 24 * 60 * 60 * 1_000
const MAX_SAFE_SCHEDULE_SPAN_MS = 365 * DAY_MS
const SCHEDULE_EASE_REFERENCE = 2.5
const SCHEDULE_EASE_FACTOR = 0.06
const SCHEDULE_RECENT_PENALTY = 0.08
const SCHEDULE_OVERDUE_BASE_BOOST = 0.12
const SCHEDULE_OVERDUE_DAILY_BOOST = 0.02
const SCHEDULE_OVERDUE_MAX_BOOST = 0.3
const SCHEDULE_FUTURE_PENALTY = 0.06
const SCHEDULE_STORED_WEIGHT_FACTOR = 0.04
const MASTERY_TARGET_ACCURACY = 0.8
const MASTERY_ACCURACY_FACTOR = 0.25
const MASTERY_NEW_ITEM_BOOST = 0.06
const MASTERY_CORRECT_STREAK_DECAY = 0.025
const MAX_MASTERY_CORRECT_STREAK = 5
const MIN_EXPOSURE_WEIGHT = 0.001
const MAX_EXPOSURE_WEIGHT = 4

export type { ExposureWeightComponents } from '../progress/tracking'

export interface StudySpacingPolicy {
  minimumDistinctItems: 1
  exceptionPolicy: SpacingExceptionPolicy
}

export const DEFAULT_STUDY_SPACING_POLICY: StudySpacingPolicy = {
  minimumDistinctItems: 1,
  exceptionPolicy: 'strict',
}

export interface BuildStudyQueueOptions {
  selectedDifficulty: Difficulty
  mistakes?: Readonly<Record<string, MistakeRecord>>
  difficultyStats?: Partial<Record<Difficulty, DifficultyStats>>
  quizHistory?: readonly QuizSessionSummary[]
  itemSchedule?: Readonly<Record<string, ItemScheduleRecord>>
  mastery?: Readonly<Record<string, WordMastery>>
  grammarReviewItemIds?: ReadonlySet<string>
  now?: number
  limit?: number
  random?: () => number
  matrix?: DifficultyMatrix
  spacingPolicy?: StudySpacingPolicy
}

export interface StudyItemWeightAudit {
  itemId: string
  components: ExposureWeightComponents
  total: number
  overdue: boolean
}

export interface StudyQueueBuildResult {
  items: StudyItem[]
  candidateItemIds: string[]
  orderedItemIds: string[]
  itemWeightAudits: StudyItemWeightAudit[]
  spacing: QueueSpacingAudit
}

interface WeightedItem {
  item: StudyItem
  key: number
  order: number
  isPriority: boolean
  isPendingReview: boolean
  reviewSpacingRemaining: number
  recentWrongScore: number
}

type Comparator<T> = (left: T, right: T) => number

function compareByKey(left: WeightedItem, right: WeightedItem): number {
  return right.key - left.key || left.order - right.order
}

function comparePendingReview(left: WeightedItem, right: WeightedItem): number {
  return (
    right.recentWrongScore - left.recentWrongScore
    || compareByKey(left, right)
  )
}

function selectTop<T>(
  values: readonly T[],
  limit: number,
  compare: Comparator<T>,
): T[] {
  const count = Math.min(limit, values.length)
  if (count <= 0) return []
  if (count === values.length) return [...values].sort(compare)

  // Keep the worst selected value at the heap root. This bounds sorting to
  // the requested output size instead of sorting the complete candidate pool.
  const heap: T[] = []

  function swap(left: number, right: number): void {
    const value = heap[left]!
    heap[left] = heap[right]!
    heap[right] = value
  }

  function siftUp(start: number): void {
    let index = start
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (compare(heap[parent]!, heap[index]!) >= 0) return
      swap(parent, index)
      index = parent
    }
  }

  function siftDown(start: number): void {
    let index = start
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      let worst = index
      if (left < heap.length && compare(heap[left]!, heap[worst]!) > 0) {
        worst = left
      }
      if (right < heap.length && compare(heap[right]!, heap[worst]!) > 0) {
        worst = right
      }
      if (worst === index) return
      swap(index, worst)
      index = worst
    }
  }

  for (const value of values) {
    if (heap.length < count) {
      heap.push(value)
      siftUp(heap.length - 1)
    } else if (compare(value, heap[0]!) < 0) {
      heap[0] = value
      siftDown(0)
    }
  }

  return heap.sort(compare)
}

function bestMatching<T>(
  values: readonly T[],
  matches: (value: T) => boolean,
  compare: Comparator<T>,
): T | undefined {
  let best: T | undefined
  for (const value of values) {
    if (matches(value) && (best === undefined || compare(value, best) < 0)) {
      best = value
    }
  }
  return best
}

function recentWrongScores(
  quizHistory: readonly QuizSessionSummary[],
): ReadonlyMap<string, number> {
  const recent = quizHistory.slice(-RECENT_QUIZ_LIMIT)
  const scores = new Map<string, number>()
  if (recent.length === 0) return scores

  recent.forEach((summary, index) => {
    const recency = (index + 1) / recent.length
    for (const itemId of new Set(summary.wrongItemIds)) {
      scores.set(itemId, (scores.get(itemId) ?? 0) + recency)
    }
  })

  return scores
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined
}

function resolvedNow(now: number | undefined): number {
  const value = finiteOrUndefined(now)
  return value === undefined ? Date.now() : Math.max(0, value)
}

function scheduleComponent(
  schedule: ItemScheduleRecord | undefined,
  now: number,
): { boost: number; overdue: boolean } {
  if (!schedule) return { boost: 0, overdue: false }

  const ease = clamp(
    finiteOrUndefined(schedule.ease) ?? SCHEDULE_EASE_REFERENCE,
    1.3,
    3,
  )
  const storedWeight = clamp(finiteOrUndefined(schedule.weight) ?? 0, 0, 2)
  const rawLastSeenAt = finiteOrUndefined(schedule.lastSeenAt)
  const lastSeenAt = rawLastSeenAt === undefined
    ? undefined
    : clamp(rawLastSeenAt, Math.max(0, now - MAX_SAFE_SCHEDULE_SPAN_MS), now)
  const rawNextDueAt = finiteOrUndefined(schedule.nextDueAt)
  const nextDueAt = rawNextDueAt === undefined
    ? undefined
    : clamp(
        rawNextDueAt,
        Math.max(0, now - MAX_SAFE_SCHEDULE_SPAN_MS),
        now + MAX_SAFE_SCHEDULE_SPAN_MS,
      )

  const easeBoost = (SCHEDULE_EASE_REFERENCE - ease) * SCHEDULE_EASE_FACTOR
  const storedWeightBoost = storedWeight * SCHEDULE_STORED_WEIGHT_FACTOR
  const ageMs = lastSeenAt === undefined ? DAY_MS : now - lastSeenAt
  const recencyBoost = ageMs >= DAY_MS
    ? 0
    : -SCHEDULE_RECENT_PENALTY * (1 - ageMs / DAY_MS)
  let dueBoost = 0
  let overdue = false

  if (nextDueAt !== undefined && nextDueAt <= now) {
    overdue = true
    const overdueDays = (now - nextDueAt) / DAY_MS
    dueBoost = Math.min(
      SCHEDULE_OVERDUE_MAX_BOOST,
      SCHEDULE_OVERDUE_BASE_BOOST + overdueDays * SCHEDULE_OVERDUE_DAILY_BOOST,
    )
  } else if (nextDueAt !== undefined) {
    const daysUntilDue = Math.min(7, (nextDueAt - now) / DAY_MS)
    dueBoost = -SCHEDULE_FUTURE_PENALTY * (daysUntilDue / 7)
  }

  return {
    boost: clamp(easeBoost + storedWeightBoost + recencyBoost + dueBoost, -0.2, 0.5),
    overdue,
  }
}

function masteryComponent(mastery: WordMastery | undefined): number {
  if (!mastery) return 0
  if (
    !Number.isFinite(mastery.attempts)
    || !Number.isFinite(mastery.correct)
    || !Number.isFinite(mastery.correctStreak)
  ) return 0

  const attempts = Math.floor(clamp(mastery.attempts, 0, Number.MAX_SAFE_INTEGER))
  const correct = clamp(mastery.correct, 0, attempts)
  const accuracy = attempts === 0 ? 0 : correct / attempts
  const lowMasteryBoost = attempts === 0
    ? MASTERY_NEW_ITEM_BOOST
    : Math.max(0, MASTERY_TARGET_ACCURACY - accuracy) * MASTERY_ACCURACY_FACTOR
  const streak = Math.floor(clamp(
    mastery.correctStreak,
    0,
    MAX_MASTERY_CORRECT_STREAK,
  ))
  const streakDecay = streak * MASTERY_CORRECT_STREAK_DECAY

  return clamp(lowMasteryBoost - streakDecay, -0.15, 0.25)
}

interface WeightAuditContext {
  now: number
  wrongScores: ReadonlyMap<string, number>
}

function calculateStudyItemWeight(
  item: StudyItem,
  options: BuildStudyQueueOptions,
  context: WeightAuditContext,
): StudyItemWeightAudit {
  const configuredMatrixValue = options.matrix?.[options.selectedDifficulty]?.[item.difficulty]
  const matrixValue = finiteOrUndefined(configuredMatrixValue)
    ?? DIFFICULTY_MATRIX[options.selectedDifficulty][item.difficulty]
  const difficultyBase = clamp(matrixValue, 0, 1)
  const lowAccuracyBoost = clamp(
    difficultyAccuracyBoost(options.difficultyStats?.[item.difficulty]),
    0,
    0.1,
  )
  const mistake = options.mistakes?.[item.id]
  const configuredPenalty = clamp(mistake?.penaltyWeight ?? 0, 0, 0.3)
  const errorBoost = Math.max(
    clamp(mistakeBoost(mistake), 0, 0.3),
    configuredPenalty,
  )
  const recentWrongScore = mistake ? (context.wrongScores.get(item.id) ?? 0) : 0
  const cooldownAt = finiteOrUndefined(mistake?.cooldownAt)
  const nextBoost = recentWrongScore > 0 && (cooldownAt === undefined || cooldownAt <= context.now)
    ? clamp(mistake?.nextBoost ?? 0, 0, 0.3)
    : 0
  const recentWrongBoost = clamp(
    recentWrongScore * RECENT_WRONG_SESSION_BOOST + nextBoost,
    0,
    MAX_RECENT_WRONG_BOOST,
  )
  const schedule = scheduleComponent(options.itemSchedule?.[item.id], context.now)
  const masteryBoost = masteryComponent(options.mastery?.[item.id])
  const grammarBoost = options.grammarReviewItemIds?.has(item.id)
    ? GRAMMAR_REVIEW_BOOST
    : 0
  const components: ExposureWeightComponents = {
    difficultyBase,
    lowAccuracyBoost,
    mistakeBoost: errorBoost,
    recentWrongBoost,
    scheduleBoost: schedule.boost,
    masteryBoost,
    grammarBoost,
  }
  const total = clamp(
    Object.values(components).reduce((sum, component) => sum + component, 0),
    MIN_EXPOSURE_WEIGHT,
    MAX_EXPOSURE_WEIGHT,
  )

  return { itemId: item.id, components, total, overdue: schedule.overdue }
}

/** Returns the exact deterministic components used for one sampling weight. */
export function auditStudyItemWeight(
  item: StudyItem,
  options: BuildStudyQueueOptions,
): StudyItemWeightAudit {
  return calculateStudyItemWeight(item, options, {
    now: resolvedNow(options.now),
    wrongScores: recentWrongScores(options.quizHistory ?? []),
  })
}

/** Audits a candidate set without consuming the injected random source. */
export function auditStudyQueueWeights(
  candidates: readonly StudyItem[],
  options: BuildStudyQueueOptions,
): StudyItemWeightAudit[] {
  const context = {
    now: resolvedNow(options.now),
    wrongScores: recentWrongScores(options.quizHistory ?? []),
  }
  return uniqueById(candidates).map((item) =>
    calculateStudyItemWeight(item, options, context))
}

function uniqueById(items: readonly StudyItem[]): StudyItem[] {
  const seen = new Set<string>()

  return items.filter(({ id }) => {
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function normalizedLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_QUEUE_LIMIT
  if (!Number.isFinite(limit) || limit <= 0) return 0
  return Math.floor(limit)
}

function resolvedSpacingPolicy(
  policy: StudySpacingPolicy | undefined,
): StudySpacingPolicy {
  if (
    policy?.minimumDistinctItems === 1 &&
    (SPACING_EXCEPTION_POLICIES as readonly string[]).includes(policy.exceptionPolicy)
  ) {
    return policy
  }
  return DEFAULT_STUDY_SPACING_POLICY
}

function queueBuildResult(
  candidates: readonly StudyItem[],
  ordered: readonly WeightedItem[],
  itemWeightAudits: readonly StudyItemWeightAudit[],
  spacing: QueueSpacingAudit,
): StudyQueueBuildResult {
  const items = ordered.map(({ item }) => item)
  return {
    items,
    candidateItemIds: candidates.map(({ id }) => id),
    orderedItemIds: items.map(({ id }) => id),
    itemWeightAudits: [...itemWeightAudits],
    spacing,
  }
}

export function buildStudyQueueWithAudit(
  candidates: readonly StudyItem[],
  options: BuildStudyQueueOptions,
): StudyQueueBuildResult {
  const {
    mistakes = {},
    quizHistory = [],
    random = Math.random,
  } = options
  const limit = normalizedLimit(options.limit)
  const uniqueCandidates = uniqueById(candidates)
  const context = {
    now: resolvedNow(options.now),
    wrongScores: recentWrongScores(quizHistory),
  }
  const itemWeightAudits = uniqueCandidates.map((item) =>
    calculateStudyItemWeight(item, options, context))
  const spacingPolicy = resolvedSpacingPolicy(options.spacingPolicy)
  const baseSpacing: QueueSpacingAudit = {
    ...spacingPolicy,
    exceptionApplied: false,
    blockedItemIds: [],
  }
  if (limit === 0) {
    return queueBuildResult(uniqueCandidates, [], itemWeightAudits, baseSpacing)
  }
  const auditById = new Map(itemWeightAudits.map((audit) => [audit.itemId, audit]))

  const weighted: WeightedItem[] = uniqueCandidates.map((item, order) => {
    const mistake = mistakes[item.id]
    const recentWrongScore = mistake ? (context.wrongScores.get(item.id) ?? 0) : 0
    const audit = auditById.get(item.id)!
    const weight = audit.total
    const randomValue = clamp(random(), 0, 1)

    return {
      item,
      key: randomValue ** (1 / weight),
      order,
      isPriority:
        (mistake?.wrongStreak ?? 0) >= 2 &&
        (mistake?.priorityRemaining ?? 0) > 0,
      isPendingReview: mistake?.reviewPending === true,
      reviewSpacingRemaining: mistake?.reviewSpacingRemaining ?? 0,
      recentWrongScore,
    }
  })

  const priorityCount = Math.min(PRIORITY_WINDOW, limit)
  const priorities = weighted.filter(({ isPriority }) => isPriority)
  const orderedPriorities = selectTop(priorities, limit, compareByKey)
  const priority = orderedPriorities.slice(0, priorityCount)
  const priorityOverflow = orderedPriorities.slice(priorityCount)
  const priorityIds = new Set(priorities.map(({ item }) => item.id))
  const pendingCandidates = weighted.filter(({ item, isPendingReview }) => (
      isPendingReview && !priorityIds.has(item.id)
    ))
  const pendingReviews = selectTop(
    pendingCandidates,
    limit,
    comparePendingReview,
  )
  const forced = [...priority, ...pendingReviews, ...priorityOverflow]
  const reservedIds = new Set([
    ...priorityIds,
    ...pendingCandidates.map(({ item }) => item.id),
  ])
  const remainder = selectTop(
    weighted.filter(({ item }) => !reservedIds.has(item.id)),
    limit,
    compareByKey,
  )
  const ordered: WeightedItem[] = []

  // A pending item whose quiz exposure was the session's final question needs
  // one distinct card before it. Another immediately eligible forced item can
  // serve as that spacer without weakening the priority window.
  const hasDelayedReview = priorities.some(
    ({ reviewSpacingRemaining }) => reviewSpacingRemaining > 0,
  ) || pendingCandidates.some(
    ({ reviewSpacingRemaining }) => reviewSpacingRemaining > 0,
  )
  const blockedItemIds = weighted
    .filter(({ isPendingReview, isPriority, reviewSpacingRemaining }) => (
      (isPendingReview || isPriority) && reviewSpacingRemaining > 0
    ))
    .map(({ item }) => item.id)
  let exceptionApplied = false
  if (hasDelayedReview) {
    const priorityWindowIds = new Set(priority.map(({ item }) => item.id))
    const immediate = priority.find(
      ({ reviewSpacingRemaining }) => reviewSpacingRemaining === 0,
    ) ?? bestMatching(
      pendingCandidates,
      ({ reviewSpacingRemaining }) => reviewSpacingRemaining === 0,
      comparePendingReview,
    ) ?? bestMatching(
      priorities,
      ({ item, reviewSpacingRemaining }) => (
        !priorityWindowIds.has(item.id) && reviewSpacingRemaining === 0
      ),
      compareByKey,
    )
    if (immediate) {
      const immediateIndex = forced.findIndex(({ item }) => item.id === immediate.item.id)
      if (immediateIndex >= 0) forced.splice(immediateIndex, 1)
      ordered.push(immediate)
    } else if (remainder.length > 0) {
      ordered.push(remainder.shift()!)
    } else if (spacingPolicy.exceptionPolicy === 'exam-density' && forced.length > 0) {
      // Exam-density mode records the policy exception explicitly instead of
      // silently bypassing the distinct-card spacing requirement.
      ordered.push(forced.shift()!)
      exceptionApplied = true
    } else {
      // Every candidate is still spacing-blocked. Returning no card preserves
      // the distinct-exposure requirement instead of surfacing a review first.
      return queueBuildResult(uniqueCandidates, [], itemWeightAudits, {
        ...baseSpacing,
        blockedItemIds,
      })
    }
  }
  ordered.push(...forced, ...remainder)

  return queueBuildResult(
    uniqueCandidates,
    ordered.slice(0, Math.min(limit, weighted.length)),
    itemWeightAudits,
    {
      ...baseSpacing,
      exceptionApplied,
      blockedItemIds,
    },
  )
}

export function buildStudyQueue(
  candidates: readonly StudyItem[],
  options: BuildStudyQueueOptions,
): StudyItem[] {
  return buildStudyQueueWithAudit(candidates, options).items
}
