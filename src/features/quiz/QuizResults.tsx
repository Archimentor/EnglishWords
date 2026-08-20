import { useEffect, useRef } from 'react'
import type { StudyItem } from '../../domain/content/types'
import { QUIZ_TYPES, type QuizSessionSummary } from '../../domain/quiz/types'
import { QUIZ_TYPE_LABELS } from './quizLabels'

interface QuizResultsProps {
  summary: QuizSessionSummary
  itemsById: ReadonlyMap<string, StudyItem>
  onRestart: () => void
  onStudyMistakes?: (ids: readonly string[]) => void
  durationMs?: number
  averageAnswerTimeMs?: number
  adjustment?: number
}

function percent(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`
}

function duration(value: number): string {
  const milliseconds = Number.isFinite(value) ? Math.max(0, value) : 0
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`
  return `${Number((milliseconds / 1_000).toFixed(1))}초`
}

function signedAdjustment(value: number): string {
  const adjustment = Number.isFinite(value) ? value : 0
  return `${adjustment > 0 ? '+' : ''}${adjustment.toFixed(2)}`
}

export function QuizResults({
  summary,
  itemsById,
  onRestart,
  onStudyMistakes,
  durationMs,
  averageAnswerTimeMs,
  adjustment,
}: QuizResultsProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section className="quiz-results" aria-labelledby="quiz-results-title">
      <h2 ref={headingRef} id="quiz-results-title" tabIndex={-1}>퀴즈 결과</h2>
      <div className="result-summary">
        <p>
          점수 <strong>{`${summary.score} / ${summary.total}`}</strong>
        </p>
        <p>{`정답률 ${percent(summary.accuracy)}`}</p>
      </div>

      {durationMs !== undefined
      || averageAnswerTimeMs !== undefined
      || adjustment !== undefined ? (
        <div className="result-summary" aria-label="퀴즈 세션 계측">
          {durationMs !== undefined ? (
            <p>소요시간 <strong>{duration(durationMs)}</strong></p>
          ) : null}
          {averageAnswerTimeMs !== undefined ? (
            <p>평균 반응 <strong>{duration(averageAnswerTimeMs)}</strong></p>
          ) : null}
          {adjustment !== undefined ? (
            <p>적용 보정 <strong>{signedAdjustment(adjustment)}</strong></p>
          ) : null}
        </div>
      ) : null}

      <div className="results-grid">
        <section className="panel" aria-labelledby="heatmap-title">
          <h3 id="heatmap-title">문항별 결과</h3>
          <ol className="heatmap">
            {summary.heatmap.map((entry) => (
              <li
                key={entry.questionId}
                className="heatmap-item"
                data-state={entry.isCorrect ? 'correct' : 'incorrect'}
              >
                <span>{QUIZ_TYPE_LABELS[entry.type]}</span>{' '}
                <span>{entry.isCorrect ? '정답' : '오답'}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel" aria-labelledby="type-stats-title">
          <h3 id="type-stats-title">유형별 결과</h3>
          <ul className="type-stats">
            {QUIZ_TYPES.map((type) => {
              const stats = summary.typeStats[type]
              return (
                <li key={type}>
                  {`${QUIZ_TYPE_LABELS[type]}: 정답 ${stats.correct} · 오답 ${stats.wrong} · 정답률 ${percent(stats.accuracy)}`}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="panel" aria-labelledby="wrong-items-title">
          <h3 id="wrong-items-title">틀린 단어</h3>
          {summary.wrongItemIds.length === 0 ? (
            <p>틀린 단어가 없습니다.</p>
          ) : (
            <ul className="wrong-list">
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
        </section>
      </div>

      <div className="action-row">
        <button type="button" onClick={onRestart}>다시 풀기</button>
        {summary.wrongItemIds.length > 0 && onStudyMistakes ? (
          <button
            type="button"
            onClick={() => onStudyMistakes(summary.wrongItemIds)}
          >
            틀린 단어 다시 학습
          </button>
        ) : null}
      </div>
    </section>
  )
}
