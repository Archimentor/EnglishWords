import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react'
import type { AppAction } from './appReducer'
import { appReducer } from './appReducer'
import {
  loadAppState,
  saveAppState,
  saveRawBackup,
  STORAGE_KEY,
} from './persistence'
import { StateContext, type AppStateContextValue } from './useAppState'

export type AppStateStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface AppStateProviderProps {
  storage?: AppStateStorage
  children: ReactNode
}

const MEMORY_STORAGE_WARNING =
  '브라우저 저장소를 사용할 수 없어 현재 탭에서만 학습 상태를 유지합니다. 새로고침하면 초기화될 수 있습니다.'

interface StorageResolution {
  storage: AppStateStorage
  warning: string | null
}

function createMemoryStorage(): AppStateStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

function createBrowserStorage(): StorageResolution {
  try {
    const browserStorage = window.localStorage
    browserStorage.getItem('__wordmaster_storage_access_probe__')
    return {
      storage: {
        getItem: (key) => browserStorage.getItem(key),
        setItem: (key, value) => browserStorage.setItem(key, value),
      },
      warning: null,
    }
  } catch {
    return {
      storage: createMemoryStorage(),
      warning: MEMORY_STORAGE_WARNING,
    }
  }
}

export function AppStateProvider({ storage, children }: AppStateProviderProps) {
  const [storageResolution] = useState<StorageResolution>(
    () => storage
      ? { storage, warning: null }
      : createBrowserStorage(),
  )
  const resolvedStorage = storageResolution.storage
  const [initialLoad] = useState(() => {
    const loaded = loadAppState(resolvedStorage)
    const backupResult = loaded.rawBackup === null
      ? { ok: true as const }
      : saveRawBackup(resolvedStorage, loaded.rawBackup)

    return { loaded, backupResult }
  })
  const { loaded } = initialLoad
  const storageRef = useRef(resolvedStorage)
  const canPersistRef = useRef(initialLoad.backupResult.ok)
  const didHandleInitialPersistence = useRef(false)
  const [state, setState] = useState(loaded.state)
  const stateRef = useRef(state)
  const [warning, setWarning] = useState(() =>
    [
      storageResolution.warning,
      loaded.warning,
      initialLoad.backupResult.ok ? null : initialLoad.backupResult.message,
    ].filter(Boolean).join(' ') || null,
  )

  useEffect(() => {
    if (didHandleInitialPersistence.current) return
    didHandleInitialPersistence.current = true
    if (!canPersistRef.current) return
    if (loaded.status !== 'migrated' && loaded.status !== 'recovered') return

    const switchToMemoryStorage = (message: string | null = null): void => {
      const memoryStorage = createMemoryStorage()
      saveAppState(memoryStorage, stateRef.current)
      storageRef.current = memoryStorage
      setWarning((current) => [
        current,
        message,
        MEMORY_STORAGE_WARNING,
      ].filter(Boolean).join(' '))
    }

    if (loaded.rawBackup === null) {
      switchToMemoryStorage()
      return
    }

    try {
      if (storageRef.current.getItem(STORAGE_KEY) !== loaded.rawBackup) return
    } catch {
      switchToMemoryStorage()
      return
    }

    const result = saveAppState(storageRef.current, stateRef.current)
    if (result.ok) return
    switchToMemoryStorage(result.message)
  }, [loaded.rawBackup, loaded.status])

  const dispatch = useCallback<Dispatch<AppAction>>((action) => {
    const nextState = appReducer(stateRef.current, action)
    if (nextState === stateRef.current) return

    stateRef.current = nextState
    setState(nextState)
    if (!canPersistRef.current) {
      if (!initialLoad.backupResult.ok) {
        setWarning(initialLoad.backupResult.message)
      }
      return
    }
    const result = saveAppState(storageRef.current, nextState)
    if (!result.ok) {
      const memoryStorage = createMemoryStorage()
      saveAppState(memoryStorage, nextState)
      storageRef.current = memoryStorage
      setWarning(`${result.message} ${MEMORY_STORAGE_WARNING}`)
    }
  }, [initialLoad.backupResult])

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
