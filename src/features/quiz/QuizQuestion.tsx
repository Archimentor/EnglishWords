import { useEffect, useRef } from 'react'
import type { GradedAnswer, QuizQuestion as QuizQuestionModel } from '../../domain/quiz/types'

interface QuizQuestionProps {
  question: QuizQuestionModel
  draft: string
  graded: GradedAnswer | null
  onDraftChange: (value: string) => void
  onChoose: (answer: string) => void
  onSubmit: () => void
  onSpeak?: () => void
  speechError?: string | null
}

function Prompt({ question }: { question: QuizQuestionModel }) {
  if (question.type === 'sentence-meaning' && question.sentence) {
    return (
      <>
        {question.sentence.before}
        <u>{question.sentence.target}</u>
        {question.sentence.after}
      </>
    )
  }

  return <>{question.prompt}</>
}

export function QuizQuestion({
  question,
  draft,
  graded,
  onDraftChange,
  onChoose,
  onSubmit,
  onSpeak,
  speechError,
}: QuizQuestionProps) {
  const promptRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    promptRef.current?.focus()
  }, [question.id])

  const feedback = graded
    ? graded.isCorrect
      ? `정답입니다. 정답: ${question.correctAnswer}. ${question.explanation}`
      : `오답입니다. 정답: ${question.correctAnswer}. ${question.explanation}`
    : null

  return (
    <section aria-labelledby="quiz-question-title">
      <h2 id="quiz-question-title">퀴즈 문제</h2>
      <h3 ref={promptRef} tabIndex={-1} data-testid="quiz-prompt">
        <Prompt question={question} />
      </h3>

      {question.inputMode === 'choice' ? (
        <fieldset>
          <legend>답을 선택하세요</legend>
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={graded !== null}
              onClick={() => onChoose(option)}
            >
              {option}
            </button>
          ))}
        </fieldset>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          {question.type === 'dictation' ? (
            <button type="button" onClick={onSpeak}>
              발음 듣기
            </button>
          ) : null}
          <label htmlFor={`quiz-answer-${question.id}`}>답안</label>
          <input
            id={`quiz-answer-${question.id}`}
            type="text"
            value={draft}
            disabled={graded !== null}
            onChange={(event) => onDraftChange(event.target.value)}
          />
          <button
            type="submit"
            disabled={graded !== null || draft.trim().length === 0}
          >
            정답 확인
          </button>
        </form>
      )}

      {speechError ? <p role="status">{speechError}</p> : null}
      {feedback ? <p role="status">{feedback}</p> : null}
    </section>
  )
}
