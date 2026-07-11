import { createContext, useContext, type Dispatch } from 'react'
import type { AppState } from './appState'
import type { AppAction } from './appReducer'

export interface AppStateContextValue {
  state: AppState
  dispatch: Dispatch<AppAction>
  warning: string | null
  rawBackup: string | null
  dismissWarning: () => void
}

export const StateContext = createContext<AppStateContextValue | null>(null)

export function useAppState(): AppStateContextValue {
  const value = useContext(StateContext)
  if (!value) throw new Error('useAppState must be used inside AppStateProvider.')
  return value
}
