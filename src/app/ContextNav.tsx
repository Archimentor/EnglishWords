import { LEVELS } from '../domain/content/types'
import { GRAMMAR_SECTIONS, type AppState } from '../state/appState'
import type { AppAction, LevelContextSection } from '../state/appReducer'

interface ContextNavProps {
  navigation: AppState['navigation']
  dispatch: (action: AppAction) => void
}

const LEVEL_CONTEXTS: readonly LevelContextSection[] = ['대시보드', '소설', '단어장']

export function ContextNav({ navigation, dispatch }: ContextNavProps) {
  if (navigation.section === '문법') {
    return (
      <nav aria-label="문법 메뉴">
        {GRAMMAR_SECTIONS.map((grammarSection) => (
          <button
            key={grammarSection}
            type="button"
            aria-current={
              navigation.grammarSection === grammarSection ? 'page' : undefined
            }
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
      <nav aria-label={label}>
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            aria-current={navigation.level === level ? 'page' : undefined}
            onClick={() => dispatch({ type: 'SELECT_LEVEL', level })}
          >
            {level}
          </button>
        ))}
      </nav>
    )
  }

  return (
    <nav aria-label="레벨 메뉴">
      {LEVEL_CONTEXTS.map((section) => (
        <button
          key={section}
          type="button"
          aria-current={navigation.section === section ? 'page' : undefined}
          onClick={() => dispatch({ type: 'SELECT_CONTEXT', section })}
        >
          {section}
        </button>
      ))}
    </nav>
  )
}
