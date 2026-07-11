import { useEffect, useRef, useState } from 'react'
import type { Difficulty, StudyItem } from '../../domain/content/types'
import {
  generateQuiz,
  QuizGenerationError,
} from '../../domain/quiz/generate'
import { gradeAnswer } from '../../domain/quiz/grade'
import { summarizeQuiz } from '../../domain/quiz/results'
import {
  QUIZ_TYPES,
  type GradedAnswer,
  type QuizQuestion as QuizQuestionModel,
  type QuizSessionSummary,
  type QuizType,
} from '../../domain/quiz/types'
import type { AppAction, QuizAttemptForState } from '../../state/appReducer'
import type { SpeechPort } from '../study/speech'
import { QUIZ_TYPE_LABELS } from './quizLabels'
import { QuizQuestion } from './QuizQuestion'
import { QuizResults } from './QuizResults'

const SPEECH_ERROR = '발음 재생을 지원하지 않는 브라우저입니다.'

interface QuizViewProps {
  items: readonly StudyItem[]
  quizType: QuizType
  dispatch: (action: AppAction) => void
  speech: SpeechPort | null
  candidateIds?: readonly string[]
  count?: number
  random?: () => number
  onStudyMistakes?: (ids: readonly string[]) => void
}

interface GenerationState {
  questions: QuizQuestionModel[]
  error: QuizGenerationError | null
}

function createGeneration(
  items: readonly StudyItem[],
  type: QuizType,
  count: number | undefined,
  candidateIds: readonly string[] | undefined,
  random: () => number,
): GenerationState {
  const sourceIds = candidateIds ? new Set(candidateIds) : undefined
  const uniqueItemIds = new Set(items.map(({ id }) => id))
  const sourceCount = sourceIds
    ? [...sourceIds].filter((id) => uniqueItemIds.has(id)).length
    : uniqueItemIds.size
  const requestedCount = sourceCount === 0
    ? 1
    : Math.min(count ?? 10, sourceCount)

  try {
    const baseOptions = { count: requestedCount, random }
    const questions = sourceIds
      ? generateQuiz(items, type, { ...baseOptions, sourceIds })
      : generateQuiz(items, type, baseOptions)
    return { questions, error: null }
  } catch (error) {
    if (error instanceof QuizGenerationError) {
      return { questions: [], error }
    }
    throw error
  }
}

interface QuizSessionProps extends QuizViewProps {
  initialType: QuizType
}

function QuizSession({
  items,
  initialType,
  dispatch,
  speech,
  candidateIds,
  count,
  random = Math.random,
  onStudyMistakes,
}: QuizSessionProps) {
  const [activeType, setActiveType] = useState(initialType)
  const [generation, setGeneration] = useState(() =>
    createGeneration(items, initialType, count, candidateIds, random),
  )
  const randomRef = useRef(random)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<GradedAnswer[]>([])
  const [draft, setDraft] = useState('')
  const [graded, setGraded] = useState<GradedAnswer | null>(null)
  const [summary, setSummary] = useState<QuizSessionSummary | null>(null)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const recorded = useRef(false)
  const speechRequest = useRef(0)
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const difficultyById = useRef(
    new Map<string, Difficulty>(items.map((item) => [item.id, item.difficulty])),
  )
  const currentQuestion = generation.questions[index]

  useEffect(
    () => () => {
      speechRequest.current += 1
    },
    [],
  )

  function reset(type: QuizType): void {
    speechRequest.current += 1
    setGeneration(
      createGeneration(items, type, count, candidateIds, randomRef.current),
    )
    setIndex(0)
    setAnswers([])
    setDraft('')
    setGraded(null)
    setSummary(null)
    setSpeechError(null)
    recorded.current = false
  }

  function selectType(type: QuizType): void {
    if (type === activeType) return
    dispatch({ type: 'SET_QUIZ_TYPE', quizType: type })
    setActiveType(type)
    reset(type)
  }

  function choose(answer: string): void {
    if (!currentQuestion || graded) return
    setGraded(gradeAnswer(currentQuestion, answer))
  }

  function submit(): void {
    if (!currentQuestion || graded || draft.trim().length === 0) return
    setGraded(gradeAnswer(currentQuestion, draft))
  }

  function finish(nextAnswers: GradedAnswer[]): void {
    const nextSummary = summarizeQuiz(nextAnswers)
    if (!recorded.current) {
      const attempts: QuizAttemptForState[] = nextAnswers.map((answer) => ({
        sourceItemId: answer.sourceItemId,
        difficulty: difficultyById.current.get(answer.sourceItemId) ?? 'normal',
        isCorrect: answer.isCorrect,
      }))
      dispatch({ type: 'RECORD_QUIZ', summary: nextSummary, attempts })
      recorded.current = true
    }
    setAnswers(nextAnswers)
    setSummary(nextSummary)
  }

  function nextQuestion(): void {
    if (!graded) return
    const nextAnswers = [...answers, graded]
    if (index >= generation.questions.length - 1) {
      finish(nextAnswers)
      return
    }
    speechRequest.current += 1
    setAnswers(nextAnswers)
    setIndex((value) => value + 1)
    setDraft('')
    setGraded(null)
    setSpeechError(null)
  }

  async function speak(): Promise<void> {
    const request = speechRequest.current + 1
    speechRequest.current = request
    setSpeechError(null)
    if (!speech || !currentQuestion || currentQuestion.type !== 'dictation') {
      if (speechRequest.current === request) setSpeechError(SPEECH_ERROR)
      return
    }
    try {
      await speech.speak(currentQuestion.speechText ?? '')
    } catch {
      if (speechRequest.current === request) setSpeechError(SPEECH_ERROR)
    }
  }

  return (
    <section
      className="view view--quiz"
      data-state={generation.error ? 'error' : summary ? 'results' : 'question'}
      data-quiz-type={activeType}
      aria-labelledby="quiz-view-title"
    >
      <header className="feature-header">
        <p className="feature-kicker">여섯 방식으로 확인하는 회상</p>
        <h2 id="quiz-view-title">퀴즈</h2>
      </header>
      <div className="quiz-layout">
        <fieldset className="control-group quiz-types">
          <legend>퀴즈 유형</legend>
          <div className="quiz-type-list">
            {QUIZ_TYPES.map((type) => (
              <button
                key={type}
                className="quiz-type-button"
                type="button"
                aria-pressed={activeType === type}
                data-state={activeType === type ? 'active' : 'inactive'}
                onClick={() => selectType(type)}
              >
                {QUIZ_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="quiz-stage">
          {generation.error ? (
            <p className="state-panel state-panel--error" role="alert">
              {`퀴즈를 만들 수 없습니다. 생성 가능한 문항 ${generation.error.availableQuestionCount ?? 0}개 · 고유 보기 ${generation.error.availableOptionCount ?? 0}개`}
            </p>
          ) : summary ? (
            <QuizResults
              summary={summary}
              itemsById={itemsById}
              onRestart={() => reset(activeType)}
              {...(onStudyMistakes ? { onStudyMistakes } : {})}
            />
          ) : currentQuestion ? (
            <>
              <p className="session-count">{`현재 ${index + 1} / 전체 ${generation.questions.length}`}</p>
              <QuizQuestion
                question={currentQuestion}
                draft={draft}
                graded={graded}
                onDraftChange={setDraft}
                onChoose={choose}
                onSubmit={submit}
                onSpeak={() => void speak()}
                speechError={speechError}
              />
              <button
                className="button button--primary quiz-next"
                type="button"
                disabled={!graded}
                onClick={nextQuestion}
              >
                {index === generation.questions.length - 1 ? '결과 보기' : '다음문제'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function QuizView({
  items,
  quizType,
  dispatch,
  speech,
  candidateIds,
  count,
  random,
  onStudyMistakes,
}: QuizViewProps) {
  const key = `${quizType}:${items.map(({ id, difficulty }) => `${id}-${difficulty}`).join('|')}:${candidateIds?.join('|') ?? 'all'}`
  const baseProps = { items, initialType: quizType, dispatch, speech }
  const optionalProps = {
    ...(candidateIds ? { candidateIds } : {}),
    ...(count === undefined ? {} : { count }),
    ...(random ? { random } : {}),
    ...(onStudyMistakes ? { onStudyMistakes } : {}),
  }

  return <QuizSession key={key} {...baseProps} {...optionalProps} quizType={quizType} />
}
