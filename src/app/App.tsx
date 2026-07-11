import type { Level } from '../domain/content/types'
import {
  AppStateProvider,
  type AppStateStorage,
} from '../state/AppStateContext'
import { useAppState } from '../state/useAppState'
import { AppShell } from './AppShell'

const DEVELOPMENT_WORD_IDS: Readonly<Record<Level, readonly string[]>> = {
  기초: [
    'word-baby',
    'word-ball',
    'word-bird',
    'word-cat',
    'word-dog',
    'word-eat',
    'word-happy',
    'word-play',
  ],
  유치원: [
    'word-book',
    'word-chair',
    'word-draw',
    'word-friend',
    'word-green',
    'word-jump',
    'word-school',
    'word-teacher',
  ],
  초등학교: [
    'word-answer',
    'word-because',
    'word-careful',
    'word-decide',
    'word-different',
    'word-explore',
    'word-improve',
    'word-question',
  ],
  중학교: [
    'word-achieve',
    'word-although',
    'word-compare',
    'word-evidence',
    'word-influence',
    'word-maintain',
    'word-require',
    'word-respond',
  ],
}

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

interface AppContentProps {
  wordIdsByLevel: Readonly<Record<Level, readonly string[]>>
}

function AppContent({ wordIdsByLevel }: AppContentProps) {
  const { state, dispatch, warning, dismissWarning } = useAppState()

  return (
    <AppShell
      state={state}
      dispatch={dispatch}
      wordIds={wordIdsByLevel[state.navigation.level]}
      warning={warning}
      dismissWarning={dismissWarning}
    >
      <CurrentPanel />
    </AppShell>
  )
}

export interface AppProps {
  storage?: AppStateStorage
  wordIdsByLevel?: Readonly<Record<Level, readonly string[]>>
}

export function App({ storage, wordIdsByLevel = DEVELOPMENT_WORD_IDS }: AppProps = {}) {
  if (storage) {
    return (
      <AppStateProvider storage={storage}>
        <AppContent wordIdsByLevel={wordIdsByLevel} />
      </AppStateProvider>
    )
  }

  return (
    <AppStateProvider>
      <AppContent wordIdsByLevel={wordIdsByLevel} />
    </AppStateProvider>
  )
}
