import { useEffect, useRef, useState } from 'react'
import {
  DIFFICULTIES,
  LEVELS,
  type Difficulty,
  type Level,
  type StudyItem,
} from '../../domain/content/types'
import {
  createEmptySessionQuizTypePerformance,
  normalizeTrackingDecimal,
  type SessionAdjustments,
  type SessionHistoryRecord,
  type SessionPerformance,
} from '../../domain/progress/tracking'
import {
  auditQuizDifficultyCalibration,
  generateQuiz,
  QuizGenerationError,
  type QuizSamplingProfile,
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
import {
  auditStudyItemWeight,
  type StudyItemWeightAudit,
} from '../../domain/scheduler/queue'
import {
  DIFFICULTY_MATRIX,
  type DifficultyMatrix,
} from '../../domain/scheduler/difficulty'
import type { AppAction } from '../../state/appReducer'
import type { AppState } from '../../state/appState'
import type { SpeechPort } from '../study/speech'
import { QUIZ_TYPE_LABELS } from './quizLabels'
import { QuizQuestion } from './QuizQuestion'
import { QuizResults } from './QuizResults'

const SPEECH_ERROR = '발음 재생을 지원하지 않는 브라우저입니다.'

type QuizState = Pick<
  AppState,
  | 'navigation'
  | 'mistakes'
  | 'difficultyStats'
  | 'quizHistory'
  | 'mastery'
  | 'tracking'
>

interface QuizViewProps {
  items: readonly StudyItem[]
  quizType: QuizType
  dispatch: (action: AppAction) => void
  state?: QuizState
  speech: SpeechPort | null
  candidateIds?: readonly string[]
  grammarReviewItemIds?: readonly string[]
  count?: number
  random?: () => number
  now?: () => number
  onStudyMistakes?: (ids: readonly string[]) => void
  onExitReview?: () => void
}

interface GenerationState {
  questions: QuizQuestionModel[]
  error: QuizGenerationError | null
  sampling: QuizSamplingProfile | null
}

function createGeneration(
  items: readonly StudyItem[],
  type: QuizType,
  count: number | undefined,
  candidateIds: readonly string[] | undefined,
  grammarReviewItemIds: readonly string[] | undefined,
  random: () => number,
  generatedAt: number,
  state?: QuizState,
  respectCandidateReviewSpacing = false,
): GenerationState {
  const sourceIds = candidateIds ? new Set(candidateIds) : undefined
  const uniqueItemIds = new Set(items.map(({ id }) => id))
  const sourceCount = sourceIds
    ? [...sourceIds].filter((id) => uniqueItemIds.has(id)).length
    : uniqueItemIds.size
  const requestedCount = sourceCount === 0
    ? 1
    : Math.min(count ?? 10, sourceCount)
  const samplingMistakes = state && sourceIds && !respectCandidateReviewSpacing
    ? [...sourceIds].reduce<QuizState['mistakes']>((mistakes, itemId) => {
        const mistake = mistakes[itemId]
        if (!mistake || (mistake.reviewSpacingRemaining ?? 0) <= 0) return mistakes
        return {
          ...mistakes,
          [itemId]: { ...mistake, reviewSpacingRemaining: 0 },
        }
      }, state.mistakes)
    : state?.mistakes
  const sampling: QuizSamplingProfile | null = state
    ? {
        selectedDifficulty: state.navigation.studyDifficulty,
        mistakes: samplingMistakes ?? state.mistakes,
        difficultyStats: state.difficultyStats[state.navigation.level],
        quizHistory: state.quizHistory,
        itemSchedule: state.tracking.itemSchedule,
        mastery: state.mastery,
        grammarReviewItemIds: new Set(grammarReviewItemIds ?? []),
        quizTypeStats: state.tracking.quizTypeStats[state.navigation.level],
        now: generatedAt,
      }
    : null

  try {
    const makeQuestions = (generationCount: number) => {
      const baseOptions = {
        count: generationCount,
        random,
        ...(sampling ? { sampling } : {}),
      }
      return sourceIds
        ? generateQuiz(items, type, { ...baseOptions, sourceIds })
        : generateQuiz(items, type, baseOptions)
    }

    let questions: QuizQuestionModel[]
    try {
      questions = makeQuestions(requestedCount)
    } catch (error) {
      const eligibleCount = error instanceof QuizGenerationError
        ? error.availableQuestionCount
        : undefined
      const canReduceCandidateQuiz = Boolean(
        sourceIds
        && eligibleCount !== undefined
        && eligibleCount > 0
        && eligibleCount < requestedCount
        && error instanceof QuizGenerationError
        && error.availableOptionCount === undefined,
      )
      if (!canReduceCandidateQuiz || eligibleCount === undefined) throw error
      questions = makeQuestions(eligibleCount)
    }
    return { questions, error: null, sampling }
  } catch (error) {
    if (error instanceof QuizGenerationError) {
      return { questions: [], error, sampling }
    }
    throw error
  }
}

interface QuestionTrackingAudit {
  weight: number
  adjustment: number
  mistakeBoost: number
  priority: number
}

interface QuizSessionTelemetry {
  id: string
  sequence: number
  level: Level
  startedAt: number
  questionStartedAt: number
  performance: SessionPerformance
  adjustments: SessionAdjustments
}

interface QuizResultMetrics {
  durationMs: number
  averageAnswerTimeMs: number
  adjustment: number
}

function readClock(clock: () => number): number {
  const value = clock()
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)))
}

function calibratedMatrix(
  selectedDifficulty: Difficulty,
  effectiveDifficultyPosition: number,
): DifficultyMatrix {
  const lowerIndex = Math.floor(effectiveDifficultyPosition)
  const upperIndex = Math.ceil(effectiveDifficultyPosition)
  const fraction = effectiveDifficultyPosition - lowerIndex
  const lowerDifficulty = DIFFICULTIES[lowerIndex] ?? selectedDifficulty
  const upperDifficulty = DIFFICULTIES[upperIndex] ?? lowerDifficulty
  const lowerRow = DIFFICULTY_MATRIX[lowerDifficulty]
  const upperRow = DIFFICULTY_MATRIX[upperDifficulty]
  const calibratedRow = Object.fromEntries(DIFFICULTIES.map((difficulty) => [
    difficulty,
    lowerRow[difficulty] + (upperRow[difficulty] - lowerRow[difficulty]) * fraction,
  ])) as DifficultyMatrix[Difficulty]

  return {
    ...DIFFICULTY_MATRIX,
    [selectedDifficulty]: calibratedRow,
  }
}

function auditQuestionTracking(
  item: StudyItem,
  type: QuizType,
  sampling: QuizSamplingProfile | null,
): QuestionTrackingAudit {
  if (!sampling) {
    return { weight: 1, adjustment: 0, mistakeBoost: 0, priority: 0 }
  }

  const calibration = auditQuizDifficultyCalibration(
    sampling.selectedDifficulty,
    sampling.quizTypeStats?.[type],
  )
  const auditOptions = {
    selectedDifficulty: sampling.selectedDifficulty,
    matrix: calibratedMatrix(
      sampling.selectedDifficulty,
      calibration.effectiveDifficultyPosition,
    ),
    ...(sampling.mistakes ? { mistakes: sampling.mistakes } : {}),
    ...(sampling.difficultyStats ? { difficultyStats: sampling.difficultyStats } : {}),
    ...(sampling.quizHistory ? { quizHistory: sampling.quizHistory } : {}),
    ...(sampling.itemSchedule ? { itemSchedule: sampling.itemSchedule } : {}),
    ...(sampling.mastery ? { mastery: sampling.mastery } : {}),
    ...(sampling.grammarReviewItemIds
      ? { grammarReviewItemIds: sampling.grammarReviewItemIds }
      : {}),
    ...(sampling.now === undefined ? {} : { now: sampling.now }),
  }
  const weightAudit: StudyItemWeightAudit = auditStudyItemWeight(item, auditOptions)

  return {
    weight: weightAudit.total,
    adjustment: calibration.totalShift,
    mistakeBoost: weightAudit.components.mistakeBoost,
    priority: normalizeTrackingDecimal(
      weightAudit.components.recentWrongBoost + weightAudit.components.grammarBoost,
    ),
  }
}

function quizSessionPrefix(
  level: Level,
  type: QuizType,
  startedAt: number,
): string {
  return `quiz:${level}:${type}:${startedAt}:`
}

function nextStoredSequence(
  state: QuizState | undefined,
  level: Level,
  type: QuizType,
  startedAt: number,
): number {
  const prefix = quizSessionPrefix(level, type, startedAt)
  return (state?.tracking.sessionHistory ?? []).reduce((next, session) => {
    if (!session.id.startsWith(prefix)) return next
    const sequence = Number(session.id.slice(prefix.length))
    return Number.isSafeInteger(sequence) && sequence >= next ? sequence + 1 : next
  }, 0)
}

function createSessionTelemetry(
  level: Level,
  type: QuizType,
  startedAt: number,
  sequence: number,
): QuizSessionTelemetry {
  return {
    id: `${quizSessionPrefix(level, type, startedAt)}${sequence}`,
    sequence,
    level,
    startedAt,
    questionStartedAt: startedAt,
    performance: {
      attempts: 0,
      correct: 0,
      byQuizType: createEmptySessionQuizTypePerformance(),
    },
    adjustments: { mistakeBoost: 0, difficultyBoost: 0, priority: 0 },
  }
}

function addAnswerTelemetry(
  session: QuizSessionTelemetry,
  answer: GradedAnswer,
  answerTimeMs: number,
  audit: QuestionTrackingAudit,
): QuizSessionTelemetry {
  const previousType = session.performance.byQuizType[answer.type]
  return {
    ...session,
    performance: {
      attempts: session.performance.attempts + 1,
      correct: session.performance.correct + (answer.isCorrect ? 1 : 0),
      byQuizType: {
        ...session.performance.byQuizType,
        [answer.type]: {
          attempts: previousType.attempts + 1,
          correct: previousType.correct + (answer.isCorrect ? 1 : 0),
          totalAnswerTimeMs: previousType.totalAnswerTimeMs + answerTimeMs,
        },
      },
    },
    adjustments: {
      mistakeBoost: normalizeTrackingDecimal(
        session.adjustments.mistakeBoost + audit.mistakeBoost,
      ),
      difficultyBoost: normalizeTrackingDecimal(
        session.adjustments.difficultyBoost + audit.adjustment,
      ),
      priority: normalizeTrackingDecimal(
        session.adjustments.priority + audit.priority,
      ),
    },
  }
}

function sessionSnapshot(
  session: QuizSessionTelemetry,
  endedAt: number,
  status: SessionHistoryRecord['status'],
): SessionHistoryRecord {
  const safeEndedAt = Math.max(session.startedAt, endedAt)
  return {
    id: session.id,
    kind: 'quiz',
    level: session.level,
    startedAt: session.startedAt,
    endedAt: safeEndedAt,
    durationMs: safeEndedAt - session.startedAt,
    status,
    performance: session.performance,
    adjustments: session.adjustments,
  }
}

function quizSessionLevel(
  items: readonly StudyItem[],
  state: QuizState | undefined,
): Level {
  return state?.navigation.level ?? items[0]?.level ?? LEVELS[0]
}

interface QuizSessionProps extends QuizViewProps {
  initialType: QuizType
}

function QuizSession({
  items,
  initialType,
  dispatch,
  state,
  speech,
  candidateIds,
  grammarReviewItemIds,
  count,
  random = Math.random,
  now = Date.now,
  onStudyMistakes,
  onExitReview,
}: QuizSessionProps) {
  const randomRef = useRef(random)
  const clockRef = useRef(now)
  const [initialRuntime] = useState(() => {
    const startedAt = readClock(now)
    const level = quizSessionLevel(items, state)
    return {
      generation: createGeneration(
        items,
        initialType,
        count,
        candidateIds,
        grammarReviewItemIds,
        random,
        startedAt,
        state,
        Boolean(onExitReview),
      ),
      session: createSessionTelemetry(
        level,
        initialType,
        startedAt,
        nextStoredSequence(state, level, initialType, startedAt),
      ),
    }
  })
  const [activeType, setActiveType] = useState(initialType)
  const [generation, setGeneration] = useState(initialRuntime.generation)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<GradedAnswer[]>([])
  const [draft, setDraft] = useState('')
  const [graded, setGraded] = useState<GradedAnswer | null>(null)
  const [summary, setSummary] = useState<QuizSessionSummary | null>(null)
  const [resultMetrics, setResultMetrics] = useState<QuizResultMetrics | null>(null)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const sessionTelemetry = useRef(initialRuntime.session)
  const recorded = useRef(false)
  const recordedQuestionIds = useRef(new Set<string>())
  const advancingQuestionId = useRef<string | null>(null)
  const speechRequest = useRef(0)
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const difficultyById = useRef(
    new Map<string, Difficulty>(items.map((item) => [item.id, item.difficulty])),
  )
  const currentQuestion = generation.questions[index]
  const reviewSpacingBlocked = Boolean(
    candidateIds
    && onExitReview
    && generation.error?.availableQuestionCount === 0,
  )

  useEffect(
    () => () => {
      speechRequest.current += 1
      speech?.cancel()
    },
    [speech],
  )

  function reset(type: QuizType): void {
    speechRequest.current += 1
    speech?.cancel()
    const startedAt = readClock(clockRef.current)
    const level = quizSessionLevel(items, state)
    const sequence = Math.max(
      sessionTelemetry.current.sequence + 1,
      nextStoredSequence(state, level, type, startedAt),
    )
    const nextGeneration = createGeneration(
      items,
      type,
      count,
      candidateIds,
      grammarReviewItemIds,
      randomRef.current,
      startedAt,
      state,
      Boolean(onExitReview),
    )
    sessionTelemetry.current = createSessionTelemetry(
      level,
      type,
      startedAt,
      sequence,
    )
    setGeneration(nextGeneration)
    setIndex(0)
    setAnswers([])
    setDraft('')
    setGraded(null)
    setSummary(null)
    setResultMetrics(null)
    setSpeechError(null)
    recorded.current = false
    recordedQuestionIds.current.clear()
    advancingQuestionId.current = null
  }

  function selectType(type: QuizType): void {
    if (type === activeType) return
    dispatch({ type: 'SET_QUIZ_TYPE', quizType: type })
    setActiveType(type)
    reset(type)
  }

  function recordAnswer(answer: GradedAnswer): void {
    const sourceItem = itemsById.get(answer.sourceItemId)
    if (!sourceItem) return
    if (recordedQuestionIds.current.has(answer.questionId)) return
    recordedQuestionIds.current.add(answer.questionId)
    const currentSession = sessionTelemetry.current
    const answeredAt = Math.max(
      currentSession.questionStartedAt,
      readClock(clockRef.current),
    )
    const answerTimeMs = answeredAt - currentSession.questionStartedAt
    const audit = auditQuestionTracking(sourceItem, answer.type, generation.sampling)
    const nextSession = addAnswerTelemetry(
      currentSession,
      answer,
      answerTimeMs,
      audit,
    )
    sessionTelemetry.current = nextSession
    dispatch({
      type: 'RECORD_QUIZ_ATTEMPT',
      level: nextSession.level,
      attempt: {
        sourceItemId: answer.sourceItemId,
        difficulty: difficultyById.current.get(answer.sourceItemId) ?? sourceItem.difficulty,
        isCorrect: answer.isCorrect,
      },
      ...(generation.sampling
        ? {
            tracking: {
              itemKind: sourceItem.kind,
              itemLevel: nextSession.level,
              occurredAt: answeredAt,
              weight: audit.weight,
              sessionId: nextSession.id,
              questionId: answer.questionId,
              questionType: answer.type,
              quizType: answer.type,
              answerTimeMs,
              isReexposure:
                generation.sampling.mistakes?.[answer.sourceItemId] !== undefined,
              adjustment: audit.adjustment,
              session: sessionSnapshot(nextSession, answeredAt, 'interrupted'),
            },
          }
        : {}),
    })
    setGraded(answer)
  }

  function choose(answer: string): void {
    if (!currentQuestion || graded) return
    recordAnswer(gradeAnswer(currentQuestion, answer))
  }

  function submit(): void {
    if (!currentQuestion || graded || draft.trim().length === 0) return
    recordAnswer(gradeAnswer(currentQuestion, draft))
  }

  function finish(nextAnswers: GradedAnswer[]): void {
    const nextSummary = summarizeQuiz(nextAnswers)
    if (!recorded.current) {
      recorded.current = true
      const endedAt = Math.max(
        sessionTelemetry.current.startedAt,
        readClock(clockRef.current),
      )
      const completedSession = sessionSnapshot(
        sessionTelemetry.current,
        endedAt,
        'completed',
      )
      const answerTimeTotal = Object.values(
        completedSession.performance.byQuizType,
      ).reduce((total, performance) => total + performance.totalAnswerTimeMs, 0)
      const calibration = auditQuizDifficultyCalibration(
        generation.sampling?.selectedDifficulty
          ?? itemsById.get(nextAnswers[0]?.sourceItemId ?? '')?.difficulty
          ?? 'normal',
        generation.sampling?.quizTypeStats?.[activeType],
      )
      dispatch({
        type: 'RECORD_QUIZ',
        summary: nextSummary,
        ...(generation.sampling
          ? { tracking: { session: completedSession } }
          : {}),
      })
      setResultMetrics({
        durationMs: completedSession.durationMs,
        averageAnswerTimeMs: completedSession.performance.attempts === 0
          ? 0
          : answerTimeTotal / completedSession.performance.attempts,
        adjustment: calibration.totalShift,
      })
    }
    setAnswers(nextAnswers)
    setSummary(nextSummary)
  }

  function nextQuestion(): void {
    if (
      !graded
      || !currentQuestion
      || advancingQuestionId.current === currentQuestion.id
    ) return
    advancingQuestionId.current = currentQuestion.id
    const nextAnswers = [...answers, graded]
    speechRequest.current += 1
    speech?.cancel()
    setSpeechError(null)
    if (index >= generation.questions.length - 1) {
      finish(nextAnswers)
      return
    }
    setAnswers(nextAnswers)
    sessionTelemetry.current = {
      ...sessionTelemetry.current,
      questionStartedAt: readClock(clockRef.current),
    }
    setIndex((value) => value + 1)
    setDraft('')
    setGraded(null)
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
            <div className="state-panel state-panel--error" role="alert">
              <p>
                {reviewSpacingBlocked
                  ? '오답 재출제의 최소 간격을 지키려면 다른 문항을 먼저 풀어야 합니다.'
                  : `퀴즈를 만들 수 없습니다. 생성 가능한 문항 ${generation.error.availableQuestionCount ?? 0}개 · 고유 보기 ${generation.error.availableOptionCount ?? 0}개`}
              </p>
              {reviewSpacingBlocked ? (
                <button className="button button--secondary" type="button" onClick={onExitReview}>
                  전체 퀴즈로 돌아가기
                </button>
              ) : null}
            </div>
          ) : summary ? (
            <QuizResults
              summary={summary}
              itemsById={itemsById}
              onRestart={() => reset(activeType)}
              {...(resultMetrics ?? {})}
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
  state,
  speech,
  candidateIds,
  grammarReviewItemIds,
  count,
  random,
  now,
  onStudyMistakes,
  onExitReview,
}: QuizViewProps) {
  const grammarReviewKey = [...(grammarReviewItemIds ?? [])].sort().join('|')
  const key = `${quizType}:${items.map(({ id, difficulty }) => `${id}-${difficulty}`).join('|')}:${candidateIds?.join('|') ?? 'all'}:${grammarReviewKey}`
  const baseProps = { items, initialType: quizType, dispatch, speech }
  const optionalProps = {
    ...(state ? { state } : {}),
    ...(candidateIds ? { candidateIds } : {}),
    ...(grammarReviewItemIds ? { grammarReviewItemIds } : {}),
    ...(count === undefined ? {} : { count }),
    ...(random ? { random } : {}),
    ...(now ? { now } : {}),
    ...(onStudyMistakes ? { onStudyMistakes } : {}),
    ...(onExitReview ? { onExitReview } : {}),
  }

  return <QuizSession key={key} {...baseProps} {...optionalProps} quizType={quizType} />
}
