import { useEffect, useId, useRef } from 'react'
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
        <u aria-label={`대상 단어: ${question.sentence.target}`}>
          {question.sentence.target}
        </u>
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
  const feedbackId = useId()

  useEffect(() => {
    promptRef.current?.focus()
  }, [question.id])

  const feedback = graded
    ? graded.isCorrect
      ? `정답입니다. 정답: ${question.correctAnswer}. ${question.explanation}`
      : `오답입니다. 정답: ${question.correctAnswer}. ${question.explanation}`
    : null

  return (
    <section
      className="quiz-question panel"
      data-input-mode={question.inputMode}
      aria-labelledby="quiz-question-title"
    >
      <h2 id="quiz-question-title">퀴즈 문제</h2>
      <h3 className="quiz-prompt" ref={promptRef} tabIndex={-1} data-testid="quiz-prompt">
        <Prompt question={question} />
      </h3>

      {question.inputMode === 'choice' ? (
        <fieldset className="answer-grid" aria-describedby={feedback ? feedbackId : undefined}>
          <legend>답을 선택하세요</legend>
          {question.options.map((option) => (
            <button
              key={option}
              className="quiz-option"
              type="button"
              disabled={graded !== null}
              data-state={
                !graded
                  ? 'idle'
                  : option === question.correctAnswer
                    ? 'correct'
                    : option === graded.answer
                      ? 'incorrect'
                      : 'locked'
              }
              onClick={() => onChoose(option)}
            >
              {option}
            </button>
          ))}
        </fieldset>
      ) : (
        <form
          className="quiz-answer-form"
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
            className="answer-input"
            type="text"
            value={draft}
            disabled={graded !== null}
            aria-invalid={graded && !graded.isCorrect ? true : undefined}
            aria-describedby={feedback ? feedbackId : undefined}
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

      {speechError ? (
        <p className="inline-status" data-tone="error" role="status">{speechError}</p>
      ) : null}
      {feedback ? (
        <p
          id={feedbackId}
          className="quiz-feedback"
          data-state={graded?.isCorrect ? 'correct' : 'incorrect'}
          role="status"
        >
          {feedback}
        </p>
      ) : null}
    </section>
  )
}
