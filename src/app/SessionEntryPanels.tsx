import { QUIZ_TYPES, type QuizType } from '../domain/quiz/types'
import { QUIZ_TYPE_LABELS } from '../features/quiz/quizLabels'

interface LevelSelectionPromptProps {
  section: '학습' | '퀴즈'
}

export function LevelSelectionPrompt({ section }: LevelSelectionPromptProps) {
  const id = section === '학습' ? 'study-level-selection-title' : 'quiz-level-selection-title'

  return (
    <section
      className={`view view--${section === '학습' ? 'study' : 'quiz'} state-panel`}
      data-state="select-level"
      aria-labelledby={id}
    >
      <header className="feature-header">
        <p className="feature-kicker">학습 범위부터 정하기</p>
        <h2 id={id}>{section} 레벨 선택</h2>
      </header>
      <p className="empty-state">
        위의 {section} 레벨 메뉴에서 시작할 레벨을 선택하세요.
      </p>
    </section>
  )
}

interface QuizTypeSelectionProps {
  onSelect: (type: QuizType) => void
}

export function QuizTypeSelection({ onSelect }: QuizTypeSelectionProps) {
  return (
    <section
      className="view view--quiz"
      data-state="select-type"
      aria-labelledby="quiz-type-selection-title"
    >
      <header className="feature-header">
        <p className="feature-kicker">여섯 방식으로 확인하는 회상</p>
        <h2 id="quiz-type-selection-title">퀴즈 유형 선택</h2>
      </header>
      <fieldset className="control-group quiz-types">
        <legend>퀴즈 유형</legend>
        <div className="quiz-type-list">
          {QUIZ_TYPES.map((type) => (
            <button
              key={type}
              className="quiz-type-button"
              type="button"
              data-state="inactive"
              onClick={() => onSelect(type)}
            >
              {QUIZ_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  )
}
