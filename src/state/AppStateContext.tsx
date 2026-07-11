import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react'
import type { AppAction } from './appReducer'
import { appReducer } from './appReducer'
import { loadAppState, saveAppState } from './persistence'
import { StateContext, type AppStateContextValue } from './useAppState'

export type AppStateStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface AppStateProviderProps {
  storage?: AppStateStorage
  children: ReactNode
}

export function AppStateProvider({ storage, children }: AppStateProviderProps) {
  const resolvedStorage = storage ?? window.localStorage
  const [loaded] = useState(() => loadAppState(resolvedStorage))
  const storageRef = useRef(resolvedStorage)
  const [state, setState] = useState(loaded.state)
  const stateRef = useRef(state)
  const [warning, setWarning] = useState(loaded.warning)

  const dispatch = useCallback<Dispatch<AppAction>>((action) => {
    const nextState = appReducer(stateRef.current, action)
    if (nextState === stateRef.current) return

    stateRef.current = nextState
    setState(nextState)
    const result = saveAppState(storageRef.current, nextState)
    if (!result.ok) setWarning(result.message)
  }, [])

  const dismissWarning = useCallback(() => setWarning(null), [])
  const value = useMemo<AppStateContextValue>(
    () => ({
      state,
      dispatch,
      warning,
      rawBackup: loaded.rawBackup,
      dismissWarning,
    }),
    [dismissWarning, dispatch, loaded.rawBackup, state, warning],
  )

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>
}
