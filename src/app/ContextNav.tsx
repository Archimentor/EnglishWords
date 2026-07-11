import { LEVELS } from '../domain/content/types'
import { GRAMMAR_SECTIONS, type AppState } from '../state/appState'
import type { AppAction, LevelContextSection } from '../state/appReducer'
import { useActiveNavigationScroll } from './useActiveNavigationScroll'

interface ContextNavProps {
  navigation: AppState['navigation']
  dispatch: (action: AppAction) => void
}

const LEVEL_CONTEXTS: readonly LevelContextSection[] = ['대시보드', '소설', '단어장']

export function ContextNav({ navigation, dispatch }: ContextNavProps) {
  const activeButtonRef = useActiveNavigationScroll(
    `${navigation.section}:${navigation.level}:${navigation.grammarSection}`,
  )

  if (navigation.section === '문법') {
    return (
      <nav className="nav-row nav-row--context" data-kind="grammar" aria-label="문법 메뉴">
        {GRAMMAR_SECTIONS.map((grammarSection) => (
          <button
            key={grammarSection}
            className="nav-chip nav-chip--secondary"
            ref={navigation.grammarSection === grammarSection ? activeButtonRef : undefined}
            type="button"
            aria-current={
              navigation.grammarSection === grammarSection ? 'page' : undefined
            }
            data-state={navigation.grammarSection === grammarSection ? 'active' : 'inactive'}
            onClick={() =>
              dispatch({ type: 'SELECT_GRAMMAR_LEVEL', grammarSection })
            }
          >
            {grammarSection}
          </button>
        ))}
      </nav>
    )
  }

  if (navigation.section === '학습' || navigation.section === '퀴즈') {
    const label = navigation.section === '학습' ? '학습 레벨 메뉴' : '퀴즈 레벨 메뉴'
    return (
      <nav
        className="nav-row nav-row--context"
        data-kind={navigation.section === '학습' ? 'study' : 'quiz'}
        aria-label={label}
      >
        {LEVELS.map((level) => (
          <button
            key={level}
            className="nav-chip nav-chip--secondary"
            ref={navigation.level === level ? activeButtonRef : undefined}
            type="button"
            aria-current={navigation.level === level ? 'page' : undefined}
            data-state={navigation.level === level ? 'active' : 'inactive'}
            onClick={() => dispatch({ type: 'SELECT_LEVEL', level })}
          >
            {level}
          </button>
        ))}
      </nav>
    )
  }

  return (
    <nav className="nav-row nav-row--context" data-kind="level" aria-label="레벨 메뉴">
      {LEVEL_CONTEXTS.map((section) => (
        <button
          key={section}
          className="nav-chip nav-chip--secondary"
          ref={navigation.section === section ? activeButtonRef : undefined}
          type="button"
          aria-current={navigation.section === section ? 'page' : undefined}
          data-state={navigation.section === section ? 'active' : 'inactive'}
          onClick={() => dispatch({ type: 'SELECT_CONTEXT', section })}
        >
          {section}
        </button>
      ))}
    </nav>
  )
}
