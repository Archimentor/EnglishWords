import { LEVELS } from '../domain/content/types'
import type { AppState } from '../state/appState'
import type { AppAction, PrimarySelection } from '../state/appReducer'

interface NavigationProps {
  navigation: AppState['navigation']
  dispatch: (action: AppAction) => void
}

const FUNCTION_ITEMS = ['문법', '학습', '퀴즈'] as const
const LEVEL_SECTIONS = new Set(['대시보드', '소설', '단어장'])

export function Navigation({ navigation, dispatch }: NavigationProps) {
  const items: readonly PrimarySelection[] = [...LEVELS, ...FUNCTION_ITEMS]

  return (
    <nav aria-label="주 메뉴">
      {items.map((item) => {
        const active = LEVELS.includes(item as (typeof LEVELS)[number])
          ? LEVEL_SECTIONS.has(navigation.section) && navigation.level === item
          : navigation.section === item

        return (
          <button
            key={item}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => dispatch({ type: 'SELECT_PRIMARY', primary: item })}
          >
            {item}
          </button>
        )
      })}
    </nav>
  )
}
