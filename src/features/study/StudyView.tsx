import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DIFFICULTIES,
  type Difficulty,
  type Level,
  type StudyItem,
} from '../../domain/content/types'
import {
  MAX_STUDY_QUEUE_SIZE,
  createEmptySessionQuizTypePerformance,
  normalizeTrackingDecimal,
  type QueueItemExposureRecord,
  type QueueHistoryRecord,
  type QueueSpacingAudit,
  type SessionHistoryRecord,
  type SessionAdjustments,
} from '../../domain/progress/tracking'
import {
  DEFAULT_STUDY_SPACING_POLICY,
  auditStudyItemWeight,
  auditStudyQueueWeights,
  buildStudyQueueWithAudit,
  type ExposureWeightComponents,
  type StudySpacingPolicy,
} from '../../domain/scheduler/queue'
import type { AppState } from '../../state/appState'
import { appReducer, type AppAction } from '../../state/appReducer'
import { ProgressBar } from '../../components/ProgressBar'
import { DifficultyPicker } from './DifficultyPicker'
import { Flashcard } from './Flashcard'
import type { SpeechPort } from './speech'

const MAX_SESSION_SIZE = MAX_STUDY_QUEUE_SIZE
const SPEECH_ERROR = '발음 재생을 지원하지 않는 브라우저입니다.'

interface BaseStudyViewProps {
  items: readonly StudyItem[]
  state: AppState
  dispatch: (action: AppAction) => void
  speech: SpeechPort | null
  random?: () => number
  grammarReviewItemIds?: ReadonlySet<string>
  spacingPolicy?: StudySpacingPolicy
  now?: () => number
}

type StudyViewProps = BaseStudyViewProps & (
  | {
      mode?: 'standard'
      candidateIds?: never
      onExitReview?: never
    }
  | {
      mode: 'mistakes'
      candidateIds: readonly string[]
      onExitReview: () => void
    }
)

interface LocalSession {
  queueIds: string[]
  currentIndex: number
  difficulty: Difficulty
  needsInitialSave: boolean
  tracking: LocalSessionTracking
}

interface LocalSessionTracking {
  queueId: string
  sessionId: string
  generatedAt: number
  startedAt: number
  lastUpdatedAt: number
  recoveryIndex: number
  recovered: boolean
  attempts: number
  correct: number
  adjustments: SessionAdjustments
  audit: QueueAuditSnapshot
}

interface QueueAuditSnapshot {
  candidateItemIds: string[]
  itemExposureWeights: QueueItemExposureRecord[]
  spacing: QueueSpacingAudit
}

interface GeneratedQueue extends QueueAuditSnapshot {
  queueIds: string[]
}

interface RestoredSession {
  queueIds: string[]
  currentIndex: number
  corrected: boolean
}

function uniqueItemsForLevel(
  items: readonly StudyItem[],
  level: Level,
): StudyItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (item.level !== level || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function restoreSnapshot(
  queueIds: readonly string[],
  currentIndex: number,
  validIds: ReadonlySet<string>,
): RestoredSession {
  const seen = new Set<string>()
  const filtered = queueIds
    .filter((id) => {
      if (!validIds.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
    .slice(0, MAX_SESSION_SIZE)

  let restoredIndex = filtered.length
  if (currentIndex < queueIds.length) {
    const currentId = queueIds[currentIndex]
    const currentPosition = currentId ? filtered.indexOf(currentId) : -1
    if (currentPosition >= 0) {
      restoredIndex = currentPosition
    } else {
      for (let index = currentIndex + 1; index < queueIds.length; index += 1) {
        const candidatePosition = filtered.indexOf(queueIds[index] ?? '')
        if (candidatePosition >= 0) {
          restoredIndex = candidatePosition
          break
        }
      }
    }
  }

  return {
    queueIds: filtered,
    currentIndex: restoredIndex,
    corrected: !sameIds(filtered, queueIds) || restoredIndex !== currentIndex,
  }
}

function generateQueue(
  items: readonly StudyItem[],
  state: AppState,
  level: Level,
  difficulty: Difficulty,
  grammarReviewItemIds: ReadonlySet<string> | undefined,
  spacingPolicy: StudySpacingPolicy,
  now: number,
  random: () => number,
  limit = MAX_SESSION_SIZE,
): GeneratedQueue {
  const result = buildStudyQueueWithAudit(items, {
    selectedDifficulty: difficulty,
    mistakes: state.mistakes,
    difficultyStats: state.difficultyStats[level],
    quizHistory: state.quizHistory,
    itemSchedule: state.tracking.itemSchedule,
    mastery: state.mastery,
    ...(grammarReviewItemIds ? { grammarReviewItemIds } : {}),
    spacingPolicy,
    now,
    limit,
    random,
  })
  return {
    queueIds: result.orderedItemIds,
    candidateItemIds: result.candidateItemIds,
    itemExposureWeights: result.itemWeightAudits.map((audit) => ({
      itemId: audit.itemId,
      components: { ...audit.components, total: audit.total },
      overdue: audit.overdue,
    })),
    spacing: result.spacing,
  }
}

function captureQueueAudit(
  items: readonly StudyItem[],
  state: AppState,
  level: Level,
  difficulty: Difficulty,
  grammarReviewItemIds: ReadonlySet<string> | undefined,
  spacingPolicy: StudySpacingPolicy,
  now: number,
): QueueAuditSnapshot {
  const audits = auditStudyQueueWeights(items, {
    selectedDifficulty: difficulty,
    mistakes: state.mistakes,
    difficultyStats: state.difficultyStats[level],
    quizHistory: state.quizHistory,
    itemSchedule: state.tracking.itemSchedule,
    mastery: state.mastery,
    ...(grammarReviewItemIds ? { grammarReviewItemIds } : {}),
    spacingPolicy,
    now,
  })
  return {
    candidateItemIds: audits.map(({ itemId }) => itemId),
    itemExposureWeights: audits.map((audit) => ({
      itemId: audit.itemId,
      components: { ...audit.components, total: audit.total },
      overdue: audit.overdue,
    })),
    spacing: {
      ...spacingPolicy,
      exceptionApplied: false,
      blockedItemIds: items
        .filter(({ id }) => (
          state.mistakes[id]?.reviewPending === true &&
          (state.mistakes[id]?.reviewSpacingRemaining ?? 0) > 0
        ))
        .map(({ id }) => id),
    },
  }
}

function queueAuditSnapshot(queue: QueueHistoryRecord): QueueAuditSnapshot {
  return {
    candidateItemIds: [...queue.candidateItemIds],
    itemExposureWeights: queue.itemExposureWeights.map((audit) => ({
      ...audit,
      components: { ...audit.components },
    })),
    spacing: {
      ...queue.spacing,
      blockedItemIds: [...queue.spacing.blockedItemIds],
    },
  }
}

function needsAdaptivePlacement(state: AppState, itemId: string): boolean {
  const mistake = state.mistakes[itemId]
  return mistake?.reviewPending === true
    || (
      (mistake?.wrongStreak ?? 0) >= 2
      && (mistake?.priorityRemaining ?? 0) > 0
    )
}

function adaptRestoredTail(
  items: readonly StudyItem[],
  state: AppState,
  level: Level,
  restored: RestoredSession,
  grammarReviewItemIds: ReadonlySet<string> | undefined,
  spacingPolicy: StudySpacingPolicy,
  now: number,
  random: () => number,
): RestoredSession {
  if (restored.currentIndex >= restored.queueIds.length) return restored

  const locked = restored.queueIds.slice(0, restored.currentIndex + 1)
  const lockedIds = new Set(locked)
  const candidates = items.filter(({ id }) => !lockedIds.has(id))
  const adaptive = generateQueue(
    candidates,
    state,
    level,
    state.navigation.studyDifficulty,
    grammarReviewItemIds,
    spacingPolicy,
    now,
    random,
    Math.max(0, MAX_SESSION_SIZE - locked.length),
  )
  let lastForcedIndex = -1
  for (let index = adaptive.queueIds.length - 1; index >= 0; index -= 1) {
    const itemId = adaptive.queueIds[index]
    if (itemId && needsAdaptivePlacement(state, itemId)) {
      lastForcedIndex = index
      break
    }
  }
  if (lastForcedIndex < 0) return restored

  // Keep the scheduler's complete forced prefix. It may include a distinct
  // spacer immediately before a delayed review item.
  const adaptivePrefix = adaptive.queueIds.slice(0, lastForcedIndex + 1)
  const adaptivePrefixIds = new Set(adaptivePrefix)
  const existingTail = restored.queueIds
    .slice(restored.currentIndex + 1)
    .filter((id) => !adaptivePrefixIds.has(id))
  const usedIds = new Set([...lockedIds, ...adaptivePrefixIds, ...existingTail])
  const fill = adaptive.queueIds.filter((id) => !usedIds.has(id))
  const targetLength = Math.min(
    MAX_SESSION_SIZE,
    Math.max(restored.queueIds.length, locked.length + adaptivePrefix.length),
  )
  const queueIds = [
    ...locked,
    ...adaptivePrefix,
    ...existingTail,
    ...fill,
  ].slice(0, targetLength)

  return {
    queueIds,
    currentIndex: restored.currentIndex,
    corrected: restored.corrected || !sameIds(queueIds, restored.queueIds),
  }
}

function safeTimestamp(clock: () => number, minimum = 0): number {
  const value = clock()
  if (!Number.isFinite(value) || value < 0) return minimum
  return Math.max(minimum, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)))
}

function uniqueTrackingId(
  prefix: string,
  level: Level,
  timestamp: number,
  usedIds: ReadonlySet<string>,
): string {
  const base = `${prefix}-${level}-${timestamp}`
  let id = base
  let suffix = 1
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  return id
}

function reusableQueueFor(
  state: AppState,
  level: Level,
  scope: QueueHistoryRecord['scope'],
  queueIds: readonly string[],
  queueSize: number,
  currentIndex: number,
): QueueHistoryRecord | undefined {
  return state.tracking.queueHistory
    .filter((queue) => (
      queue.level === level
      && queue.scope === scope
      && queue.status !== 'completed'
      && queue.queueSize === queueSize
      && queue.currentIndex === currentIndex
      && queue.recoveryIndex <= currentIndex
      && queue.generatedAt <= queue.startedAt
      && queue.startedAt <= queue.updatedAt
      && (
        queue.auditCompleteness === 'legacy'
        || (
          queue.auditCompleteness === 'complete'
          && sameIds(queue.orderedItemIds, queueIds)
        )
      )
    ))
    .at(-1)
}

function createLocalTracking(
  state: AppState,
  level: Level,
  clock: () => number,
  mode: 'standard' | 'mistakes',
  restored: Pick<RestoredSession, 'queueIds' | 'currentIndex' | 'corrected'> | undefined,
  audit: QueueAuditSnapshot,
  reservedIds: readonly string[] = [],
): LocalSessionTracking {
  const queueCandidate = restored && !restored.corrected
    ? reusableQueueFor(
        state,
        level,
        mode,
        restored.queueIds,
        restored.queueIds.length,
        restored.currentIndex,
      )
    : undefined
  const sessionCandidate = queueCandidate
    ? state.tracking.sessionHistory.find(({ id }) => id === queueCandidate.sessionId)
    : undefined
  const sessionMatchesQueue = !sessionCandidate || (
    sessionCandidate.kind === 'study'
    && sessionCandidate.level === level
    && sessionCandidate.startedAt === queueCandidate?.startedAt
    && sessionCandidate.endedAt <= (queueCandidate?.updatedAt ?? -1)
  )
  const reusable = sessionMatchesQueue ? queueCandidate : undefined
  const existingSession = reusable ? sessionCandidate : undefined
  const resolvedAudit = reusable?.auditCompleteness === 'complete'
    ? queueAuditSnapshot(reusable)
    : audit
  const initialNow = safeTimestamp(clock)
  const usedQueueIds = new Set([
    ...state.tracking.queueHistory.map(({ id }) => id),
    ...reservedIds,
  ])
  const usedSessionIds = new Set([
    ...state.tracking.sessionHistory.map(({ id }) => id),
    ...reservedIds,
  ])
  const prefix = mode === 'standard' ? 'study' : 'study-review'
  const generatedAt = reusable?.generatedAt ?? initialNow
  const startedAt = reusable?.startedAt ?? initialNow
  const lastUpdatedAt = Math.max(
    startedAt,
    reusable?.updatedAt ?? 0,
    existingSession?.endedAt ?? 0,
  )

  return {
    queueId: reusable?.id ?? uniqueTrackingId(
      `${prefix}-queue`,
      level,
      generatedAt,
      usedQueueIds,
    ),
    sessionId: reusable?.sessionId ?? uniqueTrackingId(
      `${prefix}-session`,
      level,
      startedAt,
      usedSessionIds,
    ),
    generatedAt,
    startedAt,
    lastUpdatedAt,
    recoveryIndex: restored?.currentIndex ?? 0,
    recovered: restored !== undefined,
    attempts: existingSession?.performance.attempts ?? 0,
    correct: existingSession?.performance.correct ?? 0,
    adjustments: existingSession?.adjustments ?? {
      mistakeBoost: 0,
      difficultyBoost: 0,
      priority: 0,
    },
    audit: resolvedAudit,
  }
}

function scheduledPriorityIds(
  session: Pick<LocalSession, 'queueIds' | 'currentIndex'>,
  state: AppState,
): string[] {
  return session.queueIds.filter((itemId, index) => {
    const mistake = state.mistakes[itemId]
    const remaining = mistake?.priorityRemaining ?? 0
    return (
      index >= session.currentIndex &&
      index - session.currentIndex < remaining &&
      (mistake?.wrongStreak ?? 0) >= 2
    )
  })
}

function createLocalSession(
  items: readonly StudyItem[],
  state: AppState,
  level: Level,
  grammarReviewItemIds: ReadonlySet<string> | undefined,
  spacingPolicy: StudySpacingPolicy,
  random: () => number,
  clock: () => number,
  mode: 'standard' | 'mistakes',
): LocalSession {
  const createdAt = safeTimestamp(clock)
  const persistSession = mode === 'standard'
  if (items.length === 0) {
    const audit = captureQueueAudit(
      items,
      state,
      level,
      state.navigation.studyDifficulty,
      grammarReviewItemIds,
      spacingPolicy,
      createdAt,
    )
    return {
      queueIds: [],
      currentIndex: 0,
      difficulty: state.navigation.studyDifficulty,
      needsInitialSave: false,
      tracking: createLocalTracking(
        state,
        level,
        () => createdAt,
        mode,
        undefined,
        audit,
      ),
    }
  }

  const reviewQueue = mode === 'mistakes'
    ? state.tracking.queueHistory
        .filter((queue) => (
          queue.level === level &&
          queue.scope === 'mistakes' &&
          queue.status !== 'completed' &&
          queue.auditCompleteness === 'complete'
        ))
        .at(-1)
    : undefined
  const snapshot = persistSession
    ? state.studySessions[level]
    : reviewQueue
      ? {
          queueIds: reviewQueue.orderedItemIds,
          currentIndex: reviewQueue.currentIndex,
        }
      : undefined
  if (snapshot) {
    const restored = restoreSnapshot(
      snapshot.queueIds,
      snapshot.currentIndex,
      new Set(items.map(({ id }) => id)),
    )
    if (restored.queueIds.length > 0 || snapshot.queueIds.length === 0) {
      const adapted = restored.queueIds.length === 0
        ? restored
        : adaptRestoredTail(
            items,
            state,
            level,
            restored,
            grammarReviewItemIds,
            spacingPolicy,
            createdAt,
            random,
          )
      const audit = captureQueueAudit(
        items,
        state,
        level,
        state.navigation.studyDifficulty,
        grammarReviewItemIds,
        spacingPolicy,
        createdAt,
      )
      return {
        ...adapted,
        difficulty: state.navigation.studyDifficulty,
        needsInitialSave: true,
        tracking: createLocalTracking(
          state,
          level,
          () => createdAt,
          mode,
          adapted,
          audit,
        ),
      }
    }
  }

  const generated = generateQueue(
    items,
    state,
    level,
    state.navigation.studyDifficulty,
    grammarReviewItemIds,
    spacingPolicy,
    createdAt,
    random,
  )
  return {
    queueIds: generated.queueIds,
    currentIndex: 0,
    difficulty: state.navigation.studyDifficulty,
    needsInitialSave: true,
    tracking: createLocalTracking(
      state,
      level,
      () => createdAt,
      mode,
      undefined,
      generated,
    ),
  }
}

const EXPOSURE_COMPONENT_KEYS = [
  'difficultyBase',
  'lowAccuracyBoost',
  'mistakeBoost',
  'recentWrongBoost',
  'scheduleBoost',
  'masteryBoost',
  'grammarBoost',
] as const satisfies readonly (keyof ExposureWeightComponents)[]

function averagedExposureComponents(
  audits: readonly QueueItemExposureRecord[],
): QueueHistoryRecord['exposureComponents'] {
  const average = (key: keyof ExposureWeightComponents): number => {
    const total = audits.reduce((sum, audit) => sum + audit.components[key], 0)
    return normalizeTrackingDecimal(audits.length === 0 ? 0 : total / audits.length)
  }
  const components: ExposureWeightComponents = {
    difficultyBase: average('difficultyBase'),
    lowAccuracyBoost: average('lowAccuracyBoost'),
    mistakeBoost: average('mistakeBoost'),
    recentWrongBoost: average('recentWrongBoost'),
    scheduleBoost: average('scheduleBoost'),
    masteryBoost: average('masteryBoost'),
    grammarBoost: average('grammarBoost'),
  }
  const componentTotal = EXPOSURE_COMPONENT_KEYS.reduce(
    (total, key) => total + components[key],
    0,
  )

  return {
    ...components,
    total: normalizeTrackingDecimal(Math.min(4, Math.max(0.001, componentTotal))),
  }
}

function queueDifficultyMix(items: readonly StudyItem[]): Record<Difficulty, number> {
  const mix = Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [difficulty, 0]),
  ) as Record<Difficulty, number>
  for (const item of items) mix[item.difficulty] += 1
  return mix
}

function studySessionRecord(
  tracking: LocalSessionTracking,
  level: Level,
  endedAt: number,
  status: SessionHistoryRecord['status'],
): SessionHistoryRecord {
  return {
    id: tracking.sessionId,
    kind: 'study',
    level,
    startedAt: tracking.startedAt,
    endedAt,
    durationMs: endedAt - tracking.startedAt,
    status,
    performance: {
      attempts: tracking.attempts,
      correct: tracking.correct,
      byQuizType: createEmptySessionQuizTypePerformance(),
    },
    adjustments: { ...tracking.adjustments },
  }
}

function queueHistoryRecord(
  queueItems: readonly StudyItem[],
  state: AppState,
  level: Level,
  scope: QueueHistoryRecord['scope'],
  session: LocalSession,
  currentIndex: number,
  updatedAt: number,
  statusOverride?: QueueHistoryRecord['status'],
): QueueHistoryRecord {
  const audits = session.tracking.audit.itemExposureWeights
  const auditById = new Map(audits.map((audit) => [audit.itemId, audit]))
  const orderedAudits = queueItems
    .map(({ id }) => auditById.get(id))
    .filter((audit): audit is QueueItemExposureRecord => audit !== undefined)
  const mistakes = queueItems.filter(({ id }) => (state.mistakes[id]?.wrongCount ?? 0) > 0)
  const priorities = mistakes.filter(({ id }) => {
    const mistake = state.mistakes[id]
    return (mistake?.wrongStreak ?? 0) >= 2 && (mistake?.priorityRemaining ?? 0) > 0
  })
  const boundedIndex = Math.min(queueItems.length, Math.max(0, currentIndex))
  const status = statusOverride ?? (
    queueItems.length === 0 && session.tracking.audit.spacing.blockedItemIds.length > 0
      ? 'active'
      : boundedIndex >= queueItems.length
        ? 'completed'
        : 'active'
  )

  return {
    id: session.tracking.queueId,
    sessionId: session.tracking.sessionId,
    scope,
    level,
    generatedAt: session.tracking.generatedAt,
    startedAt: session.tracking.startedAt,
    updatedAt,
    interruptedAt: status === 'interrupted' ? updatedAt : null,
    status,
    selectedDifficulty: session.difficulty,
    difficultyMix: queueDifficultyMix(queueItems),
    queueSize: queueItems.length,
    currentIndex: boundedIndex,
    recoveryIndex: Math.min(session.tracking.recoveryIndex, boundedIndex),
    recovered: session.tracking.recovered,
    mistakeCount: mistakes.length,
    priorityCount: priorities.length,
    overdueCount: orderedAudits.filter(({ overdue }) => overdue).length,
    exposureComponents: averagedExposureComponents(orderedAudits),
    auditCompleteness: 'complete',
    candidateItemIds: [...session.tracking.audit.candidateItemIds],
    orderedItemIds: queueItems.map(({ id }) => id),
    itemExposureWeights: session.tracking.audit.itemExposureWeights.map((audit) => ({
      ...audit,
      components: { ...audit.components },
    })),
    spacing: {
      ...session.tracking.audit.spacing,
      blockedItemIds: [...session.tracking.audit.spacing.blockedItemIds],
    },
    priorityEntries: priorities.map(({ id }) => {
      const mistake = state.mistakes[id]
      const configuredInsertedAt = mistake?.priorityInsertedAt
      const insertedAt = typeof configuredInsertedAt === 'number'
        && Number.isFinite(configuredInsertedAt)
        ? Math.min(
            updatedAt,
            Math.max(session.tracking.generatedAt, Math.floor(configuredInsertedAt)),
          )
        : session.tracking.generatedAt
      const audit = auditById.get(id)
      return {
        itemId: id,
        priority: normalizeTrackingDecimal(
          (audit?.components.mistakeBoost ?? 0)
          + (audit?.components.recentWrongBoost ?? 0),
        ),
        insertedAt,
      }
    }),
  }
}

interface LevelStudyViewProps {
  items: readonly StudyItem[]
  level: Level
  state: AppState
  dispatch: (action: AppAction) => void
  speech: SpeechPort | null
  random?: () => number
  grammarReviewItemIds?: ReadonlySet<string>
  spacingPolicy?: StudySpacingPolicy
  now?: () => number
  mode: 'standard' | 'mistakes'
  onExitReview?: () => void
}

function LevelStudyView({
  items,
  level,
  state,
  dispatch,
  speech,
  random = Math.random,
  grammarReviewItemIds,
  spacingPolicy = DEFAULT_STUDY_SPACING_POLICY,
  now = Date.now,
  mode,
  onExitReview,
}: LevelStudyViewProps) {
  const [session, setSession] = useState(() =>
    createLocalSession(
      items,
      state,
      level,
      grammarReviewItemIds,
      spacingPolicy,
      random,
      now,
      mode,
    ),
  )
  const randomRef = useRef(random)
  const clockRef = useRef(now)
  const lastEventAt = useRef(session.tracking.lastUpdatedAt)
  const [flipped, setFlipped] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const speechRequest = useRef(0)
  const initialSaves = useRef(new Set<string>())
  const recordedRecallItemId = useRef<string | null>(null)
  const cardButtonRef = useRef<HTMLButtonElement>(null)
  const completionHeadingRef = useRef<HTMLHeadingElement>(null)
  const pendingStudyFocus = useRef(false)
  const lifecycleGeneration = useRef(0)
  const latestSession = useRef(session)
  const latestState = useRef(state)
  const latestDispatch = useRef(dispatch)
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  )
  const queueItems = useMemo(
    () => session.queueIds
      .map((id) => itemsById.get(id))
      .filter((item): item is StudyItem => item !== undefined),
    [itemsById, session.queueIds],
  )
  const currentItem = queueItems[session.currentIndex]
  const waitingForReviewSpacing =
    session.queueIds.length === 0
    && items.length > 0
    && items.every(({ id }) => {
      const mistake = state.mistakes[id]
      return mistake?.reviewPending === true
        && (mistake.reviewSpacingRemaining ?? 0) > 0
    })
  const nextTimestamp = useCallback((minimum = 0): number => {
    const timestamp = safeTimestamp(
      clockRef.current,
      Math.max(minimum, lastEventAt.current),
    )
    lastEventAt.current = timestamp
    return timestamp
  }, [])
  const saveSession = useCallback((
    queueIds: readonly string[],
    currentIndex: number,
    localSession: LocalSession,
    updatedAt: number,
    queueState: AppState = state,
  ): void => {
    const trackedItems = queueIds
      .map((id) => itemsById.get(id))
      .filter((item): item is StudyItem => item !== undefined)
    const queue = queueHistoryRecord(
      trackedItems,
      queueState,
      level,
      mode,
      localSession,
      currentIndex,
      updatedAt,
    )
    if (mode === 'standard') {
      dispatch({
        type: 'SAVE_STUDY_SESSION',
        level,
        snapshot: { queueIds: [...queueIds], currentIndex },
        tracking: { queue },
      })
    } else {
      dispatch({ type: 'TRACK_STUDY_QUEUE', queue })
    }
  }, [dispatch, itemsById, level, mode, state])

  useEffect(() => {
    if (!pendingStudyFocus.current) return
    pendingStudyFocus.current = false
    if (currentItem) cardButtonRef.current?.focus()
    else completionHeadingRef.current?.focus()
  }, [currentItem, session.currentIndex])

  useEffect(() => {
    latestSession.current = session
    latestState.current = state
    latestDispatch.current = dispatch
  }, [dispatch, session, state])

  useEffect(() => {
    if (!session.needsInitialSave) return
    const signature = `${level}:${session.currentIndex}:${session.queueIds.join('|')}`
    if (initialSaves.current.has(signature)) return
    initialSaves.current.add(signature)
    const updatedAt = nextTimestamp(session.tracking.startedAt)
    saveSession(session.queueIds, session.currentIndex, session, updatedAt)
  }, [level, nextTimestamp, saveSession, session])

  useEffect(() => {
    lifecycleGeneration.current += 1
    const generation = lifecycleGeneration.current
    return () => {
      Promise.resolve().then(() => {
        if (lifecycleGeneration.current !== generation) return
        const activeSession = latestSession.current
        if (
          activeSession.queueIds.length === 0 ||
          activeSession.currentIndex >= activeSession.queueIds.length
        ) return
        const interruptedAt = nextTimestamp(activeSession.tracking.lastUpdatedAt)
        const trackedItems = activeSession.queueIds
          .map((id) => itemsById.get(id))
          .filter((item): item is StudyItem => item !== undefined)
        latestDispatch.current({
          type: 'TRACK_STUDY_QUEUE',
          queue: queueHistoryRecord(
            trackedItems,
            latestState.current,
            level,
            mode,
            activeSession,
            activeSession.currentIndex,
            interruptedAt,
            'interrupted',
          ),
          session: studySessionRecord(
            activeSession.tracking,
            level,
            interruptedAt,
            'interrupted',
          ),
        })
      })
    }
  }, [itemsById, level, mode, nextTimestamp])

  useEffect(
    () => () => {
      speechRequest.current += 1
      speech?.cancel()
    },
    [speech],
  )

  function handleDifficulty(difficulty: Difficulty): void {
    if (difficulty === session.difficulty || !currentItem) return
    const updatedAt = nextTimestamp(session.tracking.startedAt)
    const prefix = session.queueIds.slice(0, session.currentIndex + 1)
    const prefixIds = new Set(prefix)
    const remaining = items.filter(({ id }) => !prefixIds.has(id))
    const tail = generateQueue(
      remaining,
      state,
      level,
      difficulty,
      grammarReviewItemIds,
      spacingPolicy,
      updatedAt,
      randomRef.current,
      Math.max(0, MAX_SESSION_SIZE - prefix.length),
    )
    const queueIds = [...prefix, ...tail.queueIds]
    const audit = captureQueueAudit(
      items,
      state,
      level,
      difficulty,
      grammarReviewItemIds,
      spacingPolicy,
      updatedAt,
    )

    if (mode === 'standard') {
      dispatch({ type: 'SET_DIFFICULTY', difficulty })
    }
    const nextSession: LocalSession = {
      ...session,
      queueIds,
      difficulty,
      needsInitialSave: false,
      tracking: {
        ...session.tracking,
        lastUpdatedAt: updatedAt,
        audit: { ...audit, spacing: tail.spacing },
      },
    }
    latestSession.current = nextSession
    saveSession(queueIds, session.currentIndex, nextSession, updatedAt)
    setSession(nextSession)
  }

  function handleRecall(correct: boolean): void {
    if (
      !currentItem
      || !flipped
      || recordedRecallItemId.current === currentItem.id
    ) return
    recordedRecallItemId.current = currentItem.id
    const nextIndex = session.currentIndex + 1
    const occurredAt = nextTimestamp(session.tracking.startedAt)
    const priorityItemIds = scheduledPriorityIds(session, state)
    const audit = auditStudyItemWeight(currentItem, {
      selectedDifficulty: session.difficulty,
      mistakes: state.mistakes,
      difficultyStats: state.difficultyStats[level],
      quizHistory: state.quizHistory,
      itemSchedule: state.tracking.itemSchedule,
      mastery: state.mastery,
      ...(grammarReviewItemIds ? { grammarReviewItemIds } : {}),
      now: occurredAt,
    })
    const ruleAdjustment = audit.components.lowAccuracyBoost
      + audit.components.scheduleBoost
      + audit.components.masteryBoost
      + audit.components.grammarBoost
    const nextTracking: LocalSessionTracking = {
      ...session.tracking,
      lastUpdatedAt: occurredAt,
      attempts: session.tracking.attempts + 1,
      correct: session.tracking.correct + (correct ? 1 : 0),
      adjustments: {
        mistakeBoost: normalizeTrackingDecimal(
          session.tracking.adjustments.mistakeBoost
            + audit.components.mistakeBoost
            + audit.components.recentWrongBoost,
        ),
        difficultyBoost: normalizeTrackingDecimal(
          session.tracking.adjustments.difficultyBoost + ruleAdjustment,
        ),
        priority: normalizeTrackingDecimal(
          session.tracking.adjustments.priority
            + (priorityItemIds.includes(currentItem.id) ? 1 : 0),
        ),
      },
    }
    const nextSession: LocalSession = {
      ...session,
      currentIndex: nextIndex,
      needsInitialSave: false,
      tracking: nextTracking,
    }
    latestSession.current = nextSession
    pendingStudyFocus.current = true

    const advanceAction: AppAction = {
      type: 'ADVANCE_STUDY_SLOT',
      level,
      itemId: currentItem.id,
      selectedDifficulty: session.difficulty,
      itemDifficulty: currentItem.difficulty,
      priorityItemIds,
    }
    const recordAction: AppAction = {
      type: 'RECORD_STUDY',
      itemId: currentItem.id,
      correct,
      tracking: {
        itemKind: currentItem.kind,
        itemLevel: currentItem.level,
        occurredAt,
        weight: audit.total,
        session: studySessionRecord(
          nextTracking,
          level,
          occurredAt,
          nextIndex >= session.queueIds.length ? 'completed' : 'interrupted',
        ),
      },
    }
    const projectedState = appReducer(appReducer(state, advanceAction), recordAction)

    dispatch(advanceAction)
    dispatch(recordAction)
    saveSession(session.queueIds, nextIndex, nextSession, occurredAt, projectedState)
    speechRequest.current += 1
    speech?.cancel()
    setSpeechError(null)
    setSession(nextSession)
    setFlipped(false)
  }

  async function handleSpeak(): Promise<void> {
    const request = speechRequest.current + 1
    speechRequest.current = request
    setSpeechError(null)
    if (!speech || !currentItem) {
      if (speechRequest.current === request) setSpeechError(SPEECH_ERROR)
      return
    }

    try {
      await speech.speak(currentItem.term)
      if (speechRequest.current === request) setSpeechError(null)
    } catch {
      if (speechRequest.current === request) setSpeechError(SPEECH_ERROR)
    }
  }

  function startNewSession(): void {
    const startedAt = nextTimestamp(session.tracking.lastUpdatedAt)
    const generated = generateQueue(
      items,
      state,
      level,
      session.difficulty,
      grammarReviewItemIds,
      spacingPolicy,
      startedAt,
      randomRef.current,
    )
    const tracking = createLocalTracking(
      state,
      level,
      () => startedAt,
      mode,
      undefined,
      generated,
      [session.tracking.queueId, session.tracking.sessionId],
    )
    const nextSession: LocalSession = {
      queueIds: generated.queueIds,
      currentIndex: 0,
      difficulty: session.difficulty,
      needsInitialSave: false,
      tracking,
    }
    latestSession.current = nextSession
    lastEventAt.current = tracking.lastUpdatedAt
    pendingStudyFocus.current = true
    setSession(nextSession)
    recordedRecallItemId.current = null
    setFlipped(false)
    speechRequest.current += 1
    speech?.cancel()
    setSpeechError(null)
    saveSession(generated.queueIds, 0, nextSession, startedAt)
  }

  if (items.length === 0) {
    return (
      <section className="view view--study state-panel" data-mode={mode} data-state="empty">
        <h2>{`${level} 플래시카드 학습`}</h2>
        <p>이 레벨에 학습할 항목이 없습니다.</p>
        {mode === 'mistakes' && onExitReview ? (
          <button className="button button--secondary" type="button" onClick={onExitReview}>
            전체 학습으로 돌아가기
          </button>
        ) : null}
      </section>
    )
  }

  if (waitingForReviewSpacing) {
    return (
      <section className="view view--study state-panel" data-mode={mode} data-state="waiting">
        <h2 ref={completionHeadingRef} tabIndex={-1}>최소 간격 대기 중</h2>
        <p>
          오답 카드를 다시 보기 전에 서로 다른 카드를 한 번 학습해야 합니다.
          {mode === 'mistakes' ? ' 전체 학습에서 다른 카드를 먼저 학습해 주세요.' : null}
        </p>
        {mode === 'mistakes' && onExitReview ? (
          <button className="button button--secondary" type="button" onClick={onExitReview}>
            전체 학습으로 돌아가기
          </button>
        ) : null}
      </section>
    )
  }

  if (!currentItem) {
    return (
      <section className="view view--study state-panel" data-mode={mode} data-state="complete">
        <h2 ref={completionHeadingRef} tabIndex={-1}>학습 세션 완료</h2>
        <p>{`${session.queueIds.length}개 항목을 모두 확인했습니다.`}</p>
        <div className="action-row">
          <button className="button button--primary" type="button" onClick={startNewSession}>
            새 세션 시작
          </button>
          {mode === 'mistakes' && onExitReview ? (
            <button className="button button--secondary" type="button" onClick={onExitReview}>
              전체 학습으로 돌아가기
            </button>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <section
      className="view view--study"
      data-mode={mode}
      data-state={flipped ? 'answer' : 'question'}
      aria-labelledby="study-title"
    >
      <header className="feature-header feature-header--actions">
        <div>
          <p className="feature-kicker">
            {mode === 'mistakes' ? '오답 집중 복습' : '회상 중심 학습'}
          </p>
          <h2 id="study-title">{`${level} 플래시카드 학습`}</h2>
        </div>
        {mode === 'mistakes' && onExitReview ? (
          <button className="button button--secondary" type="button" onClick={onExitReview}>
            전체 학습으로 돌아가기
          </button>
        ) : null}
      </header>
      <div className="study-layout">
        <div className="study-progress">
          <ProgressBar
            label="학습 진행"
            value={session.currentIndex + 1}
            max={session.queueIds.length}
            valueText={`${session.currentIndex + 1} / ${session.queueIds.length}`}
          />
        </div>
        <div className="study-stage">
          <Flashcard
            item={currentItem}
            flipped={flipped}
            buttonRef={cardButtonRef}
            onToggle={() => setFlipped((value) => !value)}
            onSpeak={() => void handleSpeak()}
          />
          {speechError ? (
            <p className="inline-status" data-tone="error" role="status">{speechError}</p>
          ) : null}
          {flipped ? (
            <fieldset className="recall-actions">
              <legend>회상 평가</legend>
              <button type="button" onClick={() => handleRecall(true)}>기억했어요</button>
              <button type="button" onClick={() => handleRecall(false)}>다시 볼게요</button>
            </fieldset>
          ) : null}
        </div>
        <div className="study-difficulty">
          <DifficultyPicker value={session.difficulty} onChange={handleDifficulty} />
        </div>
      </div>
    </section>
  )
}

export function StudyView(props: StudyViewProps) {
  const {
    items,
    state,
    dispatch,
    speech,
    random,
    grammarReviewItemIds,
    spacingPolicy,
    now,
  } = props
  const mode = props.mode ?? 'standard'
  const level = state.navigation.level
  const candidateSet = props.mode === 'mistakes'
    ? new Set(props.candidateIds)
    : null
  const levelItems = uniqueItemsForLevel(items, level).filter(
    ({ id }) => !candidateSet || candidateSet.has(id),
  )
  const key = `${mode}:${level}:${levelItems.map(({ id }) => id).join('|')}`
  const sharedProps = { state, dispatch, speech, mode }
  const reviewProps = props.mode === 'mistakes'
    ? { onExitReview: props.onExitReview }
    : {}
  const optionalProps = {
    ...(random ? { random } : {}),
    ...(grammarReviewItemIds ? { grammarReviewItemIds } : {}),
    ...(spacingPolicy ? { spacingPolicy } : {}),
    ...(now ? { now } : {}),
  }

  return (
    <LevelStudyView
      key={key}
      {...sharedProps}
      {...reviewProps}
      {...optionalProps}
      items={levelItems}
      level={level}
    />
  )
}
