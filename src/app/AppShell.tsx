import type { ReactNode } from 'react'
import type { AppState } from '../state/appState'
import type { AppAction } from '../state/appReducer'
import { ContextNav } from './ContextNav'
import { KpiStrip } from './KpiStrip'
import { Navigation } from './Navigation'

interface AppShellProps {
  state: AppState
  dispatch: (action: AppAction) => void
  wordIds: readonly string[]
  children: ReactNode
}

export function AppShell({
  state,
  dispatch,
  wordIds,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <header className="app-header">
        <div className="app-brand">
          <p className="app-eyebrow">학습 워크스페이스</p>
          <h1 className="app-title">영단어 5000 마스터</h1>
        </div>
        <Navigation navigation={state.navigation} dispatch={dispatch} />
        <ContextNav navigation={state.navigation} dispatch={dispatch} />
        <KpiStrip
          navigation={state.navigation}
          wordIds={wordIds}
          mastery={state.mastery}
        />
      </header>
      <main
        id="main-content"
        className="app-main"
        data-section={state.navigation.section}
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  )
}
