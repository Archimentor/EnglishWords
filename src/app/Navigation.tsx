import { LEVELS } from '../domain/content/types'
import type { AppState } from '../state/appState'
import type { AppAction, PrimarySelection } from '../state/appReducer'
import { useActiveNavigationScroll } from './useActiveNavigationScroll'

interface NavigationProps {
  navigation: AppState['navigation']
  dispatch: (action: AppAction) => void
}

const FUNCTION_ITEMS = ['문법', '학습', '퀴즈'] as const
const LEVEL_SECTIONS = new Set(['대시보드', '소설', '단어장'])

export function Navigation({ navigation, dispatch }: NavigationProps) {
  const items: readonly PrimarySelection[] = [...LEVELS, ...FUNCTION_ITEMS]
  const activeButtonRef = useActiveNavigationScroll(
    `${navigation.level}:${navigation.section}`,
  )

  return (
    <nav className="nav-row nav-row--primary" aria-label="주 메뉴">
      {items.map((item) => {
        const active = LEVELS.includes(item as (typeof LEVELS)[number])
          ? LEVEL_SECTIONS.has(navigation.section) && navigation.level === item
          : navigation.section === item

        return (
          <button
            key={item}
            className="nav-chip"
            ref={active ? activeButtonRef : undefined}
            type="button"
            aria-current={active ? 'page' : undefined}
            data-state={active ? 'active' : 'inactive'}
            onClick={() => dispatch({ type: 'SELECT_PRIMARY', primary: item })}
          >
            {item}
          </button>
        )
      })}
    </nav>
  )
}
