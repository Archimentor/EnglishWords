import { useEffect, useRef } from 'react'
import type { StudyItem } from '../../domain/content/types'
import { QUIZ_TYPES, type QuizSessionSummary } from '../../domain/quiz/types'
import { QUIZ_TYPE_LABELS } from './quizLabels'

interface QuizResultsProps {
  summary: QuizSessionSummary
  itemsById: ReadonlyMap<string, StudyItem>
  onRestart: () => void
  onStudyMistakes?: (ids: readonly string[]) => void
}

function percent(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`
}

export function QuizResults({
  summary,
  itemsById,
  onRestart,
  onStudyMistakes,
}: QuizResultsProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section aria-labelledby="quiz-results-title">
      <h2 ref={headingRef} id="quiz-results-title" tabIndex={-1}>퀴즈 결과</h2>
      <p>
        점수 <strong>{`${summary.score} / ${summary.total}`}</strong>
      </p>
      <p>{`정답률 ${percent(summary.accuracy)}`}</p>

      <h3>문항별 결과</h3>
      <ol>
        {summary.heatmap.map((entry) => (
          <li key={entry.questionId}>
            <span>{QUIZ_TYPE_LABELS[entry.type]}</span>{' '}
            <span>{entry.isCorrect ? '정답' : '오답'}</span>
          </li>
        ))}
      </ol>

      <h3>유형별 결과</h3>
      <ul>
        {QUIZ_TYPES.map((type) => {
          const stats = summary.typeStats[type]
          return (
            <li key={type}>
              {`${QUIZ_TYPE_LABELS[type]}: 정답 ${stats.correct} · 오답 ${stats.wrong} · 정답률 ${percent(stats.accuracy)}`}
            </li>
          )
        })}
      </ul>

      <h3>틀린 단어</h3>
      {summary.wrongItemIds.length === 0 ? (
        <p>틀린 단어가 없습니다.</p>
      ) : (
        <ul>
          {summary.wrongItemIds.map((id) => {
            const item = itemsById.get(id)
            return (
              <li key={id}>
                <strong>{item?.term ?? id}</strong>
                {item ? ` — ${item.meanings.join(', ')}` : null}
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" onClick={onRestart}>다시 풀기</button>
      {summary.wrongItemIds.length > 0 && onStudyMistakes ? (
        <button
          type="button"
          onClick={() => onStudyMistakes(summary.wrongItemIds)}
        >
          틀린 단어 다시 학습
        </button>
      ) : null}
    </section>
  )
}
