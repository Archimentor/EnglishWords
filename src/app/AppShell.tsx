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
  warning: string | null
  dismissWarning: () => void
  children: ReactNode
}

export function AppShell({
  state,
  dispatch,
  wordIds,
  warning,
  dismissWarning,
  children,
}: AppShellProps) {
  return (
    <>
      <header>
        <p>학습 워크스페이스</p>
        <h1>영단어 5000 마스터</h1>
        <Navigation navigation={state.navigation} dispatch={dispatch} />
        <ContextNav navigation={state.navigation} dispatch={dispatch} />
        <KpiStrip
          navigation={state.navigation}
          wordIds={wordIds}
          mastery={state.mastery}
        />
      </header>
      <main>
        {warning ? (
          <div role="status">
            <p>{warning}</p>
            <button type="button" onClick={dismissWarning}>
              알림 닫기
            </button>
          </div>
        ) : null}
        {children}
      </main>
    </>
  )
}
