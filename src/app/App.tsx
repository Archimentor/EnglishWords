import { LEVELS, type Level } from '../domain/content/types'
import {
  AppStateProvider,
  type AppStateStorage,
} from '../state/AppStateContext'
import { useAppState } from '../state/useAppState'
import { AppShell } from './AppShell'

const DEVELOPMENT_WORD_IDS = Object.fromEntries(
  LEVELS.map((level) => [
    level,
    Array.from({ length: 8 }, (_, index) => `${level}-word-${index + 1}`),
  ]),
) as Record<Level, string[]>

function CurrentPanel() {
  const { state } = useAppState()
  const { navigation } = state

  if (navigation.section === '대시보드') {
    return <h2>{`${navigation.level} 학습 대시보드`}</h2>
  }
  if (navigation.section === '소설') {
    return <h2>{`${navigation.level} 레벨 소설`}</h2>
  }
  if (navigation.section === '단어장') {
    return <h2>{`${navigation.level} 단어장`}</h2>
  }
  if (navigation.section === '문법') {
    const detail = navigation.grammarNodeId ?? navigation.grammarSection
    return <h2>{`문법 ${detail}`}</h2>
  }
  if (navigation.section === '학습') {
    return <h2>{`${navigation.level} 플래시카드 학습`}</h2>
  }
  return <h2>{`${navigation.level} 퀴즈`}</h2>
}

function AppContent() {
  const { state, dispatch, warning, dismissWarning } = useAppState()

  return (
    <AppShell
      state={state}
      dispatch={dispatch}
      wordIds={DEVELOPMENT_WORD_IDS[state.navigation.level]}
      warning={warning}
      dismissWarning={dismissWarning}
    >
      <CurrentPanel />
    </AppShell>
  )
}

export interface AppProps {
  storage?: AppStateStorage
}

export function App({ storage }: AppProps = {}) {
  if (storage) {
    return (
      <AppStateProvider storage={storage}>
        <AppContent />
      </AppStateProvider>
    )
  }

  return (
    <AppStateProvider>
      <AppContent />
    </AppStateProvider>
  )
}
