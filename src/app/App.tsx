import { useEffect, useMemo, useRef, useState } from 'react'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { loadCatalog as loadRuntimeCatalog } from '../domain/content/loadCatalog'
import {
  LEVELS,
  type GrammarNode,
  type Level,
  type RuntimeCatalog,
} from '../domain/content/types'
import {
  emptyGrammarMastery,
  recordGrammarExercise,
  recordGrammarPrerequisiteReview,
  recordGrammarProduction,
  recordGrammarProductionReview,
  restartGrammarProductionCycle,
} from '../domain/grammar/mastery'
import { grammarReviewItemIds as selectGrammarReviewItemIds } from '../domain/grammar/vocabulary'
import {
  createEmptySessionQuizTypePerformance,
  type SessionHistoryRecord,
} from '../domain/progress/tracking'
import type { QuizType } from '../domain/quiz/types'
import { Dashboard } from '../features/dashboard/Dashboard'
import { GrammarView } from '../features/grammar/GrammarView'
import { QuizView } from '../features/quiz/QuizView'
import { StoryView } from '../features/story/StoryView'
import { createBrowserSpeechPort, type SpeechPort } from '../features/study/speech'
import { StudyView } from '../features/study/StudyView'
import { Wordbook } from '../features/wordbook/Wordbook'
import {
  AppStateProvider,
  type AppStateStorage,
} from '../state/AppStateContext'
import type { AppAction } from '../state/appReducer'
import { useAppState } from '../state/useAppState'
import { AppShell } from './AppShell'
import { LevelSelectionPrompt, QuizTypeSelection } from './SessionEntryPanels'

const WORD_TARGETS: Readonly<Record<Level, number>> = {
  기초: 500,
  유치원: 500,
  초등학교: 1_500,
  중학교: 2_500,
}
const PHRASAL_VERB_TARGET = 250

export type CatalogLoader = () => Promise<RuntimeCatalog>

const defaultCatalogLoader: CatalogLoader = () => loadRuntimeCatalog()

interface LoadGeneration {
  loader: CatalogLoader
  attempt: number
}

type CatalogState =
  | { status: 'loading'; generation: LoadGeneration }
  | { status: 'error'; error: unknown; generation: LoadGeneration }
  | { status: 'ready'; catalog: RuntimeCatalog; generation: LoadGeneration }

interface CandidateOverride {
  generation: LoadGeneration
  level: Level
  ids: readonly string[]
}

interface AppContentProps {
  catalogLoader: CatalogLoader
  speech: SpeechPort | null | undefined
  now: () => number
}

interface GrammarSessionRuntime {
  id: string
  nodeId: string
  startedAt: number
  attempts: number
  correct: number
}

function normalizedCandidateIds(
  catalog: RuntimeCatalog,
  level: Level,
  ids: readonly string[],
): string[] {
  const available = new Set(catalog.itemsByLevel[level].map(({ id }) => id))
  return [...new Set(ids)].filter((id) => available.has(id))
}

function isNavigationAction(action: AppAction): boolean {
  return action.type === 'SELECT_PRIMARY'
    || action.type === 'SELECT_LEVEL'
    || action.type === 'SELECT_CONTEXT'
    || action.type === 'SELECT_GRAMMAR_LEVEL'
    || action.type === 'SELECT_GRAMMAR_NODE'
}

type SessionEntryStage = 'active' | 'select-level' | 'select-quiz-type'

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function encodeBase64(bytes: Uint8Array): string {
  let encoded = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1] ?? 0
    const third = bytes[index + 2] ?? 0
    const combined = (first << 16) | (second << 8) | third
    encoded += BASE64_ALPHABET[(combined >>> 18) & 63]
    encoded += BASE64_ALPHABET[(combined >>> 12) & 63]
    encoded += index + 1 < bytes.length
      ? BASE64_ALPHABET[(combined >>> 6) & 63]
      : '='
    encoded += index + 2 < bytes.length ? BASE64_ALPHABET[combined & 63] : '='
  }
  return encoded
}

function utf16LittleEndianDataUri(value: string): string {
  const bytes = new Uint8Array(2 + value.length * 2)
  bytes[0] = 0xff
  bytes[1] = 0xfe
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    const offset = 2 + index * 2
    bytes[offset] = codeUnit & 0xff
    bytes[offset + 1] = codeUnit >>> 8
  }
  return `data:text/plain;charset=utf-16le;base64,${encodeBase64(bytes)}`
}

function recoveryDownloadHref(rawBackup: string): string {
  try {
    return `data:text/plain;charset=utf-8,${encodeURIComponent(rawBackup)}`
  } catch {
    return utf16LittleEndianDataUri(rawBackup)
  }
}

function StateWarning({
  warning,
  rawBackup,
  onDismiss,
}: {
  warning: string | null
  rawBackup: string | null
  onDismiss: () => void
}) {
  if (!warning) return null
  const downloadHref = rawBackup === null ? null : recoveryDownloadHref(rawBackup)

  return (
    <aside
      className="state-banner state-banner--warning"
      data-state="warning"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <p>{warning}</p>
      {rawBackup !== null ? (
        <details>
          <summary>복구 원본 보기</summary>
          <pre data-testid="state-raw-backup">{rawBackup}</pre>
          {downloadHref === null ? null : (
            <a
              href={downloadHref}
              download="wordmaster-recovery-backup.txt"
            >
              복구 원본 다운로드
            </a>
          )}
        </details>
      ) : null}
      <button type="button" onClick={onDismiss}>알림 닫기</button>
    </aside>
  )
}

function AppContent({ catalogLoader, speech, now }: AppContentProps) {
  const { state, dispatch, warning, rawBackup, dismissWarning } = useAppState()
  const [loadAttempt, setLoadAttempt] = useState(0)
  const generation = useMemo<LoadGeneration>(
    () => ({ loader: catalogLoader, attempt: loadAttempt }),
    [catalogLoader, loadAttempt],
  )
  const [catalogState, setCatalogState] = useState<CatalogState>(() => ({
    status: 'loading',
    generation,
  }))
  const [studyOverride, setStudyOverride] = useState<CandidateOverride | null>(null)
  const [quizOverride, setQuizOverride] = useState<CandidateOverride | null>(null)
  const [sessionEntryStage, setSessionEntryStage] = useState<SessionEntryStage>('active')
  const [browserSpeech] = useState<SpeechPort | null>(createBrowserSpeechPort)
  const resolvedSpeech = speech === undefined ? browserSpeech : speech
  const requestId = useRef(0)
  const grammarSessionSequence = useRef(0)
  const grammarSession = useRef<GrammarSessionRuntime | null>(null)

  function startGrammarSession(node: GrammarNode, startedAt: number): GrammarSessionRuntime {
    grammarSessionSequence.current += 1
    const session = {
      id: `grammar-${node.id}-${startedAt}-${grammarSessionSequence.current}`,
      nodeId: node.id,
      startedAt,
      attempts: 0,
      correct: 0,
    }
    grammarSession.current = session
    return session
  }

  function currentGrammarSession(node: GrammarNode, at: number): GrammarSessionRuntime {
    return grammarSession.current?.nodeId === node.id
      ? grammarSession.current
      : startGrammarSession(node, at)
  }

  function grammarSessionRecord(
    node: GrammarNode,
    at: number,
    status: SessionHistoryRecord['status'],
    result?: boolean,
  ): SessionHistoryRecord {
    const session = currentGrammarSession(node, at)
    if (result !== undefined) {
      session.attempts += 1
      session.correct += result ? 1 : 0
    }
    const record: SessionHistoryRecord = {
      id: session.id,
      kind: 'grammar',
      level: node.level,
      startedAt: session.startedAt,
      endedAt: at,
      durationMs: Math.max(0, at - session.startedAt),
      status,
      performance: {
        attempts: session.attempts,
        correct: session.correct,
        byQuizType: createEmptySessionQuizTypePerformance(),
      },
      adjustments: { mistakeBoost: 0, difficultyBoost: 0, priority: 0 },
    }
    if (status === 'completed') grammarSession.current = null
    return record
  }

  useEffect(() => {
    const currentRequest = requestId.current + 1
    requestId.current = currentRequest
    let active = true

    void Promise.resolve()
      .then(generation.loader)
      .then(
        (catalog) => {
          if (active && requestId.current === currentRequest) {
            setCatalogState({
              status: 'ready',
              catalog,
              generation,
            })
          }
        },
        (error: unknown) => {
          if (active && requestId.current === currentRequest) {
            setCatalogState({
              status: 'error',
              error,
              generation,
            })
          }
        },
      )

    return () => {
      active = false
    }
  }, [generation])

  function retryCatalog(): void {
    setStudyOverride(null)
    setQuizOverride(null)
    setLoadAttempt((attempt) => attempt + 1)
  }

  function dispatchNavigation(action: AppAction): void {
    if (isNavigationAction(action)) {
      setStudyOverride(null)
      setQuizOverride(null)
    }

    if (action.type === 'SELECT_PRIMARY') {
      setSessionEntryStage(
        action.primary === '학습' || action.primary === '퀴즈'
          ? 'select-level'
          : 'active',
      )
    } else if (action.type === 'SELECT_LEVEL') {
      setSessionEntryStage((currentStage) =>
        state.navigation.section === '퀴즈' && currentStage !== 'active'
          ? 'select-quiz-type'
          : 'active',
      )
    } else if (isNavigationAction(action)) {
      setSessionEntryStage('active')
    }

    dispatch(action)
  }

  const warningBanner = (
    <StateWarning
      warning={warning}
      rawBackup={rawBackup}
      onDismiss={dismissWarning}
    />
  )
  const visibleCatalogState =
    catalogState.generation === generation
      ? catalogState
      : { status: 'loading' as const, generation }
  const readyCatalog = visibleCatalogState.status === 'ready'
    ? visibleCatalogState.catalog
    : null
  const grammarReviewItemIds = useMemo(
    () => readyCatalog
      ? selectGrammarReviewItemIds(
          readyCatalog.grammarNodes,
          LEVELS.flatMap((wordLevel) => readyCatalog.wordlists[wordLevel]),
          state.grammarMastery,
        )
      : new Set<string>(),
    [readyCatalog, state.grammarMastery],
  )
  const grammarReviewItemIdList = useMemo(
    () => [...grammarReviewItemIds],
    [grammarReviewItemIds],
  )

  if (visibleCatalogState.status === 'loading') {
    return (
      <>
        {warningBanner}
        <main className="app-main app-main--state"><LoadingState /></main>
      </>
    )
  }

  if (visibleCatalogState.status === 'error') {
    return (
      <>
        {warningBanner}
        <main className="app-main app-main--state">
          <ErrorState error={visibleCatalogState.error} onRetry={retryCatalog} />
        </main>
      </>
    )
  }

  const { catalog } = visibleCatalogState
  const { navigation } = state
  const { level } = navigation
  const activeStudyIds = studyOverride?.generation === generation
    && studyOverride.level === level
    ? normalizedCandidateIds(catalog, level, studyOverride.ids)
    : null
  const activeQuizIds = quizOverride?.generation === generation
    && quizOverride.level === level
    ? normalizedCandidateIds(catalog, level, quizOverride.ids)
    : null

  function openMistakeStudy(ids: readonly string[]): void {
    const candidateIds = normalizedCandidateIds(catalog, level, ids)
    setStudyOverride({ generation, level, ids: candidateIds })
    setQuizOverride(null)
    setSessionEntryStage('active')
    dispatch({ type: 'SELECT_PRIMARY', primary: '학습' })
  }

  function openMistakeQuiz(ids: readonly string[]): void {
    const candidateIds = normalizedCandidateIds(catalog, level, ids)
    setQuizOverride({ generation, level, ids: candidateIds })
    setStudyOverride(null)
    setSessionEntryStage('active')
    dispatch({ type: 'SELECT_PRIMARY', primary: '퀴즈' })
  }

  function startQuiz(type: QuizType): void {
    dispatch({ type: 'SET_QUIZ_TYPE', quizType: type })
    setSessionEntryStage('active')
  }

  let panel
  if (navigation.section === '대시보드') {
    panel = (
      <Dashboard
        key={level}
        level={level}
        catalog={catalog}
        mastery={state.mastery}
        mistakes={state.mistakes}
        studyAnalytics={state.studyAnalytics[level]}
        difficultyStats={state.difficultyStats[level]}
        tracking={state.tracking}
        targets={{
          words: WORD_TARGETS[level],
          phrasalVerbs: PHRASAL_VERB_TARGET,
        }}
        onStudyMistakes={openMistakeStudy}
        onQuizMistakes={openMistakeQuiz}
      />
    )
  } else if (navigation.section === '소설') {
    const story = catalog.stories[level]
    const lookupLevels = story.coverage.allowUpperLevelWords
      ? LEVELS
      : LEVELS.slice(0, LEVELS.indexOf(level) + 1)
    panel = (
      <StoryView
        story={story}
        levelWords={catalog.wordlists[level]}
        levelPhrasalVerbs={catalog.phrasalVerbs.byLevel[level]}
        lookupWords={lookupLevels.flatMap(
          (lookupLevel) => catalog.wordlists[lookupLevel],
        )}
        phrasalLookupWords={LEVELS.flatMap(
          (lookupLevel) => catalog.wordlists[lookupLevel],
        )}
        targetWordCount={WORD_TARGETS[level]}
        targetPhrasalVerbCount={PHRASAL_VERB_TARGET}
        speech={resolvedSpeech}
      />
    )
  } else if (navigation.section === '단어장') {
    panel = <Wordbook level={level} catalog={catalog} />
  } else if (navigation.section === '문법') {
    panel = (
      <GrammarView
        nodes={catalog.grammarNodes}
        words={LEVELS.flatMap((wordLevel) => catalog.wordlists[wordLevel])}
        grammarSection={navigation.grammarSection}
        selectedNodeId={navigation.grammarNodeId}
        mastery={state.grammarMastery}
        onSelectLevel={(grammarSection) => {
          grammarSession.current = null
          dispatchNavigation({ type: 'SELECT_GRAMMAR_LEVEL', grammarSection })
        }}
        onSelectNode={(node) => {
          startGrammarSession(node, now())
          dispatchNavigation({
            type: 'SELECT_GRAMMAR_NODE',
            grammarSection: node.level,
            nodeId: node.id,
          })
        }}
        onRecordExercise={(node, exercise, correct) => {
          const occurredAt = now()
          const session = currentGrammarSession(node, occurredAt)
          const attempt = {
            attemptId: `${session.id}:${exercise.id}:attempt-${session.attempts + 1}`,
            exerciseId: exercise.id,
            phase: exercise.phase,
            correct,
            errorCode: exercise.errorCode,
            reviewNodeId: node.prerequisite ?? node.id,
          }
          const current = state.grammarMastery[node.id] ?? emptyGrammarMastery()
          const next = recordGrammarExercise(current, attempt, node.masteryRule)
          if (next === current) return
          dispatch({
            type: 'RECORD_GRAMMAR_EXERCISE',
            nodeId: node.id,
            attempt,
            masteryRule: node.masteryRule,
            tracking: {
              occurredAt,
              session: grammarSessionRecord(
                node,
                occurredAt,
                next.completed ? 'completed' : 'interrupted',
                correct,
              ),
            },
          })
        }}
        onRecordPrerequisiteReview={(node, reviewedNode) => {
          const occurredAt = now()
          const current = state.grammarMastery[node.id] ?? emptyGrammarMastery()
          const next = recordGrammarPrerequisiteReview(
            current,
            reviewedNode.id,
            node.masteryRule,
          )
          if (next === current) return
          dispatch({
            type: 'RECORD_GRAMMAR_PREREQUISITE_REVIEW',
            nodeId: node.id,
            reviewedNodeId: reviewedNode.id,
            masteryRule: node.masteryRule,
            tracking: {
              session: grammarSessionRecord(
                node,
                occurredAt,
                next.completed ? 'completed' : 'interrupted',
              ),
            },
          })
        }}
        onSubmitProduction={(node, submission) => {
          const occurredAt = now()
          const current = state.grammarMastery[node.id] ?? emptyGrammarMastery()
          const next = recordGrammarProduction(
            current,
            submission,
            node.productionTask,
            node.masteryRule,
          )
          if (next === current) return
          dispatch({
            type: 'SUBMIT_GRAMMAR_PRODUCTION',
            nodeId: node.id,
            submission,
            productionTask: node.productionTask,
            masteryRule: node.masteryRule,
            tracking: {
              session: grammarSessionRecord(
                node,
                occurredAt,
                next.completed ? 'completed' : 'interrupted',
              ),
            },
          })
        }}
        onReviewProduction={(node, reviewChecks) => {
          const occurredAt = now()
          const current = state.grammarMastery[node.id] ?? emptyGrammarMastery()
          const next = recordGrammarProductionReview(
            current,
            reviewChecks,
            node.masteryRule,
          )
          if (next === current) return
          dispatch({
            type: 'REVIEW_GRAMMAR_PRODUCTION',
            nodeId: node.id,
            reviewChecks,
            masteryRule: node.masteryRule,
            tracking: {
              session: grammarSessionRecord(
                node,
                occurredAt,
                next.completed ? 'completed' : 'interrupted',
              ),
            },
          })
        }}
        onRestartProduction={(node) => {
          const occurredAt = now()
          const current = state.grammarMastery[node.id] ?? emptyGrammarMastery()
          const next = restartGrammarProductionCycle(
            current,
            node.productionTask,
            node.masteryRule,
          )
          if (next === current) return
          dispatch({
            type: 'RESTART_GRAMMAR_PRODUCTION',
            nodeId: node.id,
            productionTask: node.productionTask,
            masteryRule: node.masteryRule,
            tracking: {
              session: grammarSessionRecord(
                node,
                occurredAt,
                'interrupted',
              ),
            },
          })
        }}
      />
    )
  } else if (navigation.section === '학습') {
    panel = sessionEntryStage === 'select-level' ? (
      <LevelSelectionPrompt section="학습" />
    ) : activeStudyIds ? (
      <StudyView
        items={catalog.itemsByLevel[level]}
        state={state}
        dispatch={dispatch}
        speech={resolvedSpeech}
        mode="mistakes"
        candidateIds={activeStudyIds}
        grammarReviewItemIds={grammarReviewItemIds}
        now={now}
        onExitReview={() => setStudyOverride(null)}
      />
    ) : (
      <StudyView
        items={catalog.itemsByLevel[level]}
        state={state}
        dispatch={dispatch}
        speech={resolvedSpeech}
        grammarReviewItemIds={grammarReviewItemIds}
        now={now}
      />
    )
  } else {
    panel = sessionEntryStage === 'select-level' ? (
      <LevelSelectionPrompt section="퀴즈" />
    ) : sessionEntryStage === 'select-quiz-type' ? (
      <QuizTypeSelection onSelect={startQuiz} />
    ) : (
      <QuizView
        items={catalog.itemsByLevel[level]}
        quizType={navigation.quizType}
        state={state}
        dispatch={dispatch}
        speech={resolvedSpeech}
        grammarReviewItemIds={grammarReviewItemIdList}
        now={now}
        {...(activeQuizIds ? { candidateIds: activeQuizIds } : {})}
        onStudyMistakes={openMistakeStudy}
        {...(activeQuizIds ? { onExitReview: () => setQuizOverride(null) } : {})}
      />
    )
  }

  return (
    <>
      {warningBanner}
      <AppShell
        state={state}
        dispatch={dispatchNavigation}
        wordIds={catalog.wordlists[level].map(({ id }) => id)}
      >
        {panel}
      </AppShell>
    </>
  )
}

export interface AppProps {
  loadCatalog?: CatalogLoader
  storage?: AppStateStorage
  speech?: SpeechPort | null
  now?: () => number
}

export function App({
  loadCatalog = defaultCatalogLoader,
  storage,
  speech,
  now = Date.now,
}: AppProps = {}) {
  const content = <AppContent catalogLoader={loadCatalog} speech={speech} now={now} />

  return storage ? (
    <AppStateProvider storage={storage}>{content}</AppStateProvider>
  ) : (
    <AppStateProvider>{content}</AppStateProvider>
  )
}
