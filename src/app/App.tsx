import { useEffect, useMemo, useRef, useState } from 'react'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { loadCatalog as loadRuntimeCatalog } from '../domain/content/loadCatalog'
import type { Level, RuntimeCatalog } from '../domain/content/types'
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

function StateWarning({
  warning,
  onDismiss,
}: {
  warning: string | null
  onDismiss: () => void
}) {
  if (!warning) return null

  return (
    <aside
      className="state-banner state-banner--warning"
      data-state="warning"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <p>{warning}</p>
      <button type="button" onClick={onDismiss}>알림 닫기</button>
    </aside>
  )
}

function AppContent({ catalogLoader, speech }: AppContentProps) {
  const { state, dispatch, warning, dismissWarning } = useAppState()
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
  const [browserSpeech] = useState<SpeechPort | null>(createBrowserSpeechPort)
  const resolvedSpeech = speech === undefined ? browserSpeech : speech
  const requestId = useRef(0)

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
    dispatch(action)
  }

  const warningBanner = (
    <StateWarning warning={warning} onDismiss={dismissWarning} />
  )
  const visibleCatalogState =
    catalogState.generation === generation
      ? catalogState
      : { status: 'loading' as const, generation }

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
    dispatch({ type: 'SELECT_PRIMARY', primary: '학습' })
  }

  function openMistakeQuiz(ids: readonly string[]): void {
    const candidateIds = normalizedCandidateIds(catalog, level, ids)
    setQuizOverride({ generation, level, ids: candidateIds })
    setStudyOverride(null)
    dispatch({ type: 'SELECT_PRIMARY', primary: '퀴즈' })
  }

  let panel
  if (navigation.section === '대시보드') {
    panel = (
      <Dashboard
        level={level}
        catalog={catalog}
        mastery={state.mastery}
        mistakes={state.mistakes}
        targets={{
          words: WORD_TARGETS[level],
          phrasalVerbs: PHRASAL_VERB_TARGET,
        }}
        onStudyMistakes={openMistakeStudy}
        onQuizMistakes={openMistakeQuiz}
      />
    )
  } else if (navigation.section === '소설') {
    panel = (
      <StoryView
        story={catalog.stories[level]}
        levelWords={catalog.wordlists[level]}
        targetWordCount={WORD_TARGETS[level]}
      />
    )
  } else if (navigation.section === '단어장') {
    panel = <Wordbook level={level} catalog={catalog} />
  } else if (navigation.section === '문법') {
    panel = (
      <GrammarView
        nodes={catalog.grammarNodes}
        grammarSection={navigation.grammarSection}
        selectedNodeId={navigation.grammarNodeId}
        onSelectLevel={(grammarSection) =>
          dispatchNavigation({ type: 'SELECT_GRAMMAR_LEVEL', grammarSection })}
        onSelectNode={(node) =>
          dispatchNavigation({
            type: 'SELECT_GRAMMAR_NODE',
            grammarSection: node.level,
            nodeId: node.id,
          })}
      />
    )
  } else if (navigation.section === '학습') {
    panel = activeStudyIds ? (
      <StudyView
        items={catalog.itemsByLevel[level]}
        state={state}
        dispatch={dispatch}
        speech={resolvedSpeech}
        mode="mistakes"
        candidateIds={activeStudyIds}
        onExitReview={() => setStudyOverride(null)}
      />
    ) : (
      <StudyView
        items={catalog.itemsByLevel[level]}
        state={state}
        dispatch={dispatch}
        speech={resolvedSpeech}
      />
    )
  } else {
    panel = (
      <QuizView
        items={catalog.itemsByLevel[level]}
        quizType={navigation.quizType}
        dispatch={dispatch}
        speech={resolvedSpeech}
        {...(activeQuizIds ? { candidateIds: activeQuizIds } : {})}
        onStudyMistakes={openMistakeStudy}
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
}

export function App({
  loadCatalog = defaultCatalogLoader,
  storage,
  speech,
}: AppProps = {}) {
  const content = <AppContent catalogLoader={loadCatalog} speech={speech} />

  return storage ? (
    <AppStateProvider storage={storage}>{content}</AppStateProvider>
  ) : (
    <AppStateProvider>{content}</AppStateProvider>
  )
}
