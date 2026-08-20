import { StrictMode } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { generateQuiz } from '../../domain/quiz/generate'
import { summarizeQuiz } from '../../domain/quiz/results'
import { QUIZ_TYPES, type QuizType } from '../../domain/quiz/types'
import { auditStudyItemWeight } from '../../domain/scheduler/queue'
import { appReducer, type AppAction } from '../../state/appReducer'
import { createInitialState } from '../../state/appState'
import type { SpeechPort } from '../study/speech'
import { makeQuizItems } from './quizTestFixtures'
import { QuizView } from './QuizView'

const TYPE_LABELS: Record<QuizType, string> = {
  'en-ko': '4지선다 영어→한글',
  'ko-en': '4지선다 한글→영어',
  'sentence-meaning': '문장 밑줄 단어 의미 선택',
  'sentence-blank': '문장 빈칸 단어 선택',
  dictation: '받아쓰기(듣기 입력)',
  'sentence-transform': '짧은 문장 변환',
}

const zeroRandom = () => 0

type QuizAttemptAction = Extract<AppAction, { type: 'RECORD_QUIZ_ATTEMPT' }>
type RecordQuizAction = Extract<AppAction, { type: 'RECORD_QUIZ' }>

function clockSequence(values: readonly number[]): () => number {
  let index = 0
  return () => values[index++] ?? values.at(-1) ?? 0
}

function quizAttemptActions(dispatch: ReturnType<typeof vi.fn>): QuizAttemptAction[] {
  return dispatch.mock.calls
    .map(([action]) => action as AppAction)
    .filter((action): action is QuizAttemptAction => action.type === 'RECORD_QUIZ_ATTEMPT')
}

function recordQuizActions(dispatch: ReturnType<typeof vi.fn>): RecordQuizAction[] {
  return dispatch.mock.calls
    .map(([action]) => action as AppAction)
    .filter((action): action is RecordQuizAction => action.type === 'RECORD_QUIZ')
}

async function answerFirstChoice(user: ReturnType<typeof userEvent.setup>) {
  const choices = within(screen.getByRole('group', { name: '답을 선택하세요' }))
    .getAllByRole('button')
  await user.click(choices[0]!)
}

test.each(QUIZ_TYPES)('%s 유형은 대표 풀에서 10문항 세션을 렌더링한다', (type) => {
  render(
    <QuizView
      items={makeQuizItems()}
      quizType={type}
      dispatch={vi.fn()}
      speech={{ speak: vi.fn(), cancel: vi.fn() }}
      random={zeroRandom}
    />,
  )

  expect(screen.getByText('현재 1 / 전체 10')).toBeInTheDocument()
  if (['dictation', 'sentence-transform'].includes(type)) {
    expect(screen.getByRole('textbox', { name: '답안' })).toBeInTheDocument()
  } else {
    expect(
      within(screen.getByRole('group', { name: '답을 선택하세요' })).getAllByRole(
        'button',
      ),
    ).toHaveLength(4)
  }
})

test('여섯 유형의 전체 한국어 이름을 표시하고 선택 유형을 바꾼다', async () => {
  const user = userEvent.setup()
  const dispatch = vi.fn()
  render(
    <QuizView
      items={makeQuizItems()}
      quizType="en-ko"
      dispatch={dispatch}
      speech={null}
      count={1}
      random={zeroRandom}
    />,
  )

  for (const type of QUIZ_TYPES) {
    expect(screen.getByRole('button', { name: TYPE_LABELS[type] })).toBeInTheDocument()
  }
  expect(screen.getByRole('button', { name: TYPE_LABELS['en-ko'] })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(
    within(screen.getByRole('group', { name: '퀴즈 유형' })).getAllByRole(
      'button',
      { pressed: true },
    ),
  ).toHaveLength(1)

  await user.click(screen.getByRole('button', { name: TYPE_LABELS.dictation }))
  expect(dispatch).toHaveBeenCalledWith({
    type: 'SET_QUIZ_TYPE',
    quizType: 'dictation',
  })
  expect(screen.getByRole('textbox', { name: '답안' })).toBeInTheDocument()
  expect(
    within(screen.getByRole('group', { name: '퀴즈 유형' })).getAllByRole(
      'button',
      { pressed: true },
    ),
  ).toHaveLength(1)
})

test('객관식은 즉시 피드백 후에도 다음문제 전까지 같은 문항을 유지한다', async () => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const questions = generateQuiz(items, 'en-ko', { count: 2, random: zeroRandom })
  render(
    <QuizView
      items={items}
      quizType="en-ko"
      dispatch={vi.fn()}
      speech={null}
      count={2}
      random={zeroRandom}
    />,
  )
  const first = questions[0]!
  if (first.inputMode !== 'choice') throw new Error('Expected choice question')
  const wrong = first.options.find((option) => option !== first.correctAnswer)!
  const prompt = screen.getByTestId('quiz-prompt').textContent
  const next = screen.getByRole('button', { name: '다음문제' })

  expect(screen.getByTestId('quiz-prompt')).toHaveFocus()
  expect(next).toBeDisabled()
  await user.click(screen.getByRole('button', { name: wrong }))

  expect(screen.getByRole('status')).toHaveTextContent(/오답.*제출한 답.*정답/)
  expect(screen.getByRole('status')).toHaveTextContent(`제출한 답: "${wrong}"`)
  expect(screen.getByTestId('quiz-prompt')).toHaveTextContent(prompt ?? '')
  for (const option of first.options) {
    expect(screen.getByRole('button', { name: option })).toBeDisabled()
  }

  await user.click(next)
  expect(screen.getByTestId('quiz-prompt')).not.toHaveTextContent(prompt ?? '')
  expect(screen.getByTestId('quiz-prompt')).toHaveFocus()
})

test.each([
  ['en-ko', '제시된 영어 표현의 뜻과 일치하지 않습니다'],
  ['ko-en', '제시된 한국어 뜻에 해당하는 영어 표현이 아닙니다'],
  ['sentence-meaning', '문장 속 밑줄 표현의 문맥상 뜻과 일치하지 않습니다'],
  ['sentence-blank', '문장의 빈칸에 필요한 형태와 일치하지 않습니다'],
] as const)('%s 객관식 오답은 선택지가 요구와 다른 이유를 설명한다', async (type, reason) => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const [question] = generateQuiz(items, type, { count: 1, random: zeroRandom })
  if (question?.inputMode !== 'choice') throw new Error('Expected choice question')
  const wrong = question.options.find((option) => option !== question.correctAnswer)!

  render(
    <QuizView
      items={items}
      quizType={type}
      dispatch={vi.fn()}
      speech={null}
      count={1}
      random={zeroRandom}
    />,
  )

  await user.click(screen.getByRole('button', { name: wrong }))

  expect(screen.getByRole('status')).toHaveTextContent(reason)
  expect(screen.getByRole('status')).toHaveTextContent(`정답: ${question.correctAnswer}`)
  expect(screen.getByRole('status')).toHaveTextContent(question.explanation)
})

test('다음문제를 동기적으로 두 번 눌러도 문항 하나만 진행한다', async () => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const [first] = generateQuiz(items, 'en-ko', { count: 3, random: zeroRandom })
  if (first?.inputMode !== 'choice') throw new Error('Expected choice question')
  render(
    <QuizView
      items={items}
      quizType="en-ko"
      dispatch={vi.fn()}
      speech={null}
      count={3}
      random={zeroRandom}
    />,
  )

  await user.click(screen.getByRole('button', { name: first.correctAnswer }))
  const nextButton = screen.getByRole('button', { name: '다음문제' })
  act(() => {
    nextButton.click()
    nextButton.click()
  })

  expect(screen.getByText('현재 2 / 전체 3')).toBeInTheDocument()
})

test('채점한 시도는 다음문제나 결과 화면을 기다리지 않고 즉시 저장한다', async () => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const [question] = generateQuiz(items, 'en-ko', { count: 2, random: zeroRandom })
  if (question?.inputMode !== 'choice') throw new Error('Expected choice question')
  const wrong = question.options.find((option) => option !== question.correctAnswer)!
  const dispatch = vi.fn()

  render(
    <QuizView
      items={items}
      quizType="en-ko"
      dispatch={dispatch}
      speech={null}
      count={2}
      random={zeroRandom}
    />,
  )

  await user.click(screen.getByRole('button', { name: wrong }))

  expect(dispatch).toHaveBeenCalledWith({
    type: 'RECORD_QUIZ_ATTEMPT',
    level: items.find(({ id }) => id === question.sourceItemId)?.level,
    attempt: {
      sourceItemId: question.sourceItemId,
      difficulty: items.find(({ id }) => id === question.sourceItemId)?.difficulty,
      isCorrect: false,
    },
  })
  expect(
    dispatch.mock.calls.some(([action]) => (action as AppAction).type === 'RECORD_QUIZ'),
  ).toBe(false)
})

test('같은 선택 이벤트가 커밋 전에 중복 호출돼도 한 번만 집계한다', () => {
  const items = makeQuizItems()
  const [question] = generateQuiz(items, 'en-ko', { count: 1, random: zeroRandom })
  if (question?.inputMode !== 'choice') throw new Error('Expected choice question')
  const dispatch = vi.fn()

  render(
    <StrictMode>
      <QuizView
        items={items}
        quizType="en-ko"
        state={createInitialState()}
        dispatch={dispatch}
        speech={null}
        count={1}
        random={zeroRandom}
        now={() => 1_000}
      />
    </StrictMode>,
  )
  const answer = screen.getByRole('button', { name: question.options[0]! })

  act(() => {
    answer.click()
    answer.click()
  })

  expect(
    dispatch.mock.calls.filter(
      ([action]) => (action as AppAction).type === 'RECORD_QUIZ_ATTEMPT',
    ),
  ).toHaveLength(1)
  expect(
    dispatch.mock.calls.find(
      ([action]) => (action as AppAction).type === 'RECORD_QUIZ_ATTEMPT',
    )?.[0],
  ).toMatchObject({
    tracking: {
      answerTimeMs: 0,
      session: { performance: { attempts: 1 } },
    },
  })
})

test('입력형은 정규화해 채점하고 제출 후 입력을 잠근다', async () => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const [question] = generateQuiz(items, 'dictation', { count: 1, random: zeroRandom })
  render(
    <QuizView
      items={items}
      quizType="dictation"
      dispatch={vi.fn()}
      speech={{ speak: vi.fn(), cancel: vi.fn() }}
      count={1}
      random={zeroRandom}
    />,
  )
  const input = screen.getByRole('textbox', { name: '답안' })

  await user.type(input, `  ${question?.correctAnswer.toUpperCase()}!!!  {enter}`)

  expect(screen.getByRole('status')).toHaveTextContent(/정답입니다/)
  expect(input).toBeDisabled()
  expect(screen.getByRole('button', { name: '정답 확인' })).toBeDisabled()
})

test('마지막 받아쓰기에서 결과로 이동할 때 재생 중인 음성을 취소한다', async () => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const [question] = generateQuiz(items, 'dictation', { count: 1, random: zeroRandom })
  const speech: SpeechPort = {
    speak: vi.fn(() => new Promise<void>(() => undefined)),
    cancel: vi.fn(),
  }
  render(
    <QuizView
      items={items}
      quizType="dictation"
      dispatch={vi.fn()}
      speech={speech}
      count={1}
      random={zeroRandom}
    />,
  )

  await user.click(screen.getByRole('button', { name: '발음 듣기' }))
  await user.type(
    screen.getByRole('textbox', { name: '답안' }),
    `${question!.correctAnswer}{enter}`,
  )
  await user.click(screen.getByRole('button', { name: '결과 보기' }))

  expect(speech.cancel).toHaveBeenCalledOnce()
  expect(screen.getByRole('heading', { name: '퀴즈 결과' })).toBeInTheDocument()
})

test('마지막 결과에서 세션을 한 번 저장하고 점수·히트맵·유형 통계를 표시한다', async () => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const questions = generateQuiz(items, 'en-ko', { count: 2, random: zeroRandom })
  const dispatch = vi.fn()
  render(
    <QuizView
      items={items}
      quizType="en-ko"
      dispatch={dispatch}
      speech={null}
      count={2}
      random={zeroRandom}
    />,
  )

  await user.click(screen.getByRole('button', { name: questions[0]!.correctAnswer }))
  await user.click(screen.getByRole('button', { name: '다음문제' }))
  await user.click(screen.getByRole('button', { name: questions[1]!.correctAnswer }))
  await user.click(screen.getByRole('button', { name: '결과 보기' }))

  const resultsHeading = screen.getByRole('heading', { name: '퀴즈 결과' })
  expect(resultsHeading).toBeInTheDocument()
  expect(resultsHeading).toHaveFocus()
  expect(screen.getByText('2 / 2')).toBeInTheDocument()
  expect(screen.getByText('정답률 100%')).toBeInTheDocument()
  expect(screen.getAllByText('정답')).toHaveLength(2)
  expect(
    screen.getByText('4지선다 영어→한글: 정답 2 · 오답 0 · 정답률 100%'),
  ).toBeInTheDocument()

  const attemptCalls = dispatch.mock.calls.filter(
    ([action]) => (action as AppAction).type === 'RECORD_QUIZ_ATTEMPT',
  )
  expect(attemptCalls).toHaveLength(2)
  attemptCalls.forEach(([action], index) => {
    const question = questions[index]!
    expect(action).toMatchObject({
      type: 'RECORD_QUIZ_ATTEMPT',
      level: items.find(({ id }) => id === question.sourceItemId)?.level,
      attempt: {
        sourceItemId: question.sourceItemId,
        difficulty: items.find(({ id }) => id === question.sourceItemId)?.difficulty,
        isCorrect: true,
      },
    })
  })

  const recordCalls = dispatch.mock.calls.filter(
    ([action]) => (action as AppAction).type === 'RECORD_QUIZ',
  )
  expect(recordCalls).toHaveLength(1)
  expect(recordCalls[0]?.[0]).toMatchObject({
    type: 'RECORD_QUIZ',
    summary: { score: 2, total: 2, wrongItemIds: [] },
  })
})

test('명시 clock으로 문항 반응과 중단 스냅샷을 누적하고 완료 세션으로 대체한다', async () => {
  const user = userEvent.setup()
  const state = createInitialState()
  const dispatch = vi.fn()
  render(
    <QuizView
      items={makeQuizItems()}
      quizType="en-ko"
      state={state}
      dispatch={dispatch}
      speech={null}
      count={2}
      random={zeroRandom}
      now={clockSequence([1_000, 1_800, 2_000, 3_200, 4_000])}
    />,
  )

  await answerFirstChoice(user)
  const first = quizAttemptActions(dispatch)[0]!
  expect(first.tracking).toMatchObject({
    occurredAt: 1_800,
    answerTimeMs: 800,
    quizType: 'en-ko',
    questionType: 'en-ko',
    sessionId: 'quiz:기초:en-ko:1000:0',
    session: {
      id: 'quiz:기초:en-ko:1000:0',
      startedAt: 1_000,
      endedAt: 1_800,
      durationMs: 800,
      status: 'interrupted',
      performance: {
        attempts: 1,
        correct: first.attempt.isCorrect ? 1 : 0,
        byQuizType: {
          'en-ko': {
            attempts: 1,
            correct: first.attempt.isCorrect ? 1 : 0,
            totalAnswerTimeMs: 800,
          },
        },
      },
    },
  })

  await user.click(screen.getByRole('button', { name: '다음문제' }))
  await answerFirstChoice(user)
  const second = quizAttemptActions(dispatch)[1]!
  const expectedCorrect = Number(first.attempt.isCorrect) + Number(second.attempt.isCorrect)
  expect(second.tracking).toMatchObject({
    occurredAt: 3_200,
    answerTimeMs: 1_200,
    sessionId: first.tracking?.sessionId,
    session: {
      endedAt: 3_200,
      status: 'interrupted',
      performance: {
        attempts: 2,
        correct: expectedCorrect,
        byQuizType: {
          'en-ko': {
            attempts: 2,
            correct: expectedCorrect,
            totalAnswerTimeMs: 2_000,
          },
        },
      },
    },
  })

  await user.click(screen.getByRole('button', { name: '결과 보기' }))
  const completed = recordQuizActions(dispatch)[0]!
  expect(completed.tracking?.session).toMatchObject({
    id: first.tracking?.sessionId,
    startedAt: 1_000,
    endedAt: 4_000,
    durationMs: 3_000,
    status: 'completed',
    performance: { attempts: 2, correct: expectedCorrect },
  })
  const metrics = screen.getByLabelText('퀴즈 세션 계측')
  expect(metrics).toHaveTextContent('소요시간 3초')
  expect(metrics).toHaveTextContent('평균 반응 1초')
  expect(metrics).toHaveTextContent('적용 보정 0.00')
})

test('출제에 사용한 schedule·mastery·오답·문법 보정의 실제 감사 가중치를 저장한다', async () => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const source = items[0]!
  const state = createInitialState()
  state.mistakes[source.id] = {
    wrongCount: 1,
    wrongStreak: 1,
    priorityRemaining: 0,
    reviewPending: true,
    reviewSpacingRemaining: 0,
    penaltyWeight: 0.15,
    nextBoost: 0.3,
    cooldownAt: 900,
  }
  state.mastery[source.id] = {
    attempts: 4,
    correct: 1,
    wrong: 3,
    correctStreak: 0,
    wrongStreak: 1,
  }
  state.tracking.itemSchedule[source.id] = {
    kind: source.kind,
    level: source.level,
    ease: 1.5,
    lastSeenAt: 0,
    nextDueAt: 500,
    weight: 0.8,
    lastLevel: source.level,
  }
  state.quizHistory = [summarizeQuiz([{
    questionId: 'past-question',
    sourceItemId: source.id,
    type: 'en-ko',
    answer: 'wrong',
    correctAnswer: 'right',
    isCorrect: false,
  }])]
  const expectedAudit = auditStudyItemWeight(source, {
    selectedDifficulty: state.navigation.studyDifficulty,
    mistakes: state.mistakes,
    difficultyStats: state.difficultyStats.기초,
    quizHistory: state.quizHistory,
    itemSchedule: state.tracking.itemSchedule,
    mastery: state.mastery,
    grammarReviewItemIds: new Set([source.id]),
    now: 1_000,
  })
  const dispatch = vi.fn()
  render(
    <QuizView
      items={items}
      quizType="en-ko"
      state={state}
      dispatch={dispatch}
      speech={null}
      candidateIds={[source.id]}
      grammarReviewItemIds={[source.id]}
      count={1}
      random={zeroRandom}
      now={clockSequence([1_000, 1_100])}
    />,
  )

  await answerFirstChoice(user)
  const tracking = quizAttemptActions(dispatch)[0]!.tracking!
  expect(tracking.weight).toBeCloseTo(expectedAudit.total)
  expect(tracking.isReexposure).toBe(true)
  expect(tracking.adjustment).toBe(0)
  expect(tracking.session?.adjustments).toEqual({
    mistakeBoost: expectedAudit.components.mistakeBoost,
    difficultyBoost: 0,
    priority: Number((
      expectedAudit.components.recentWrongBoost
      + expectedAudit.components.grammarBoost
    ).toFixed(6)),
  })
})

test('유형별 난이도 보정 방향을 응답·세션·결과에 동일하게 기록한다', async () => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const state = createInitialState()
  state.tracking.quizTypeStats.기초['en-ko'] = {
    attempts: 10,
    correct: 1,
    totalAnswerTimeMs: 10_000,
    averageAnswerTimeMs: 1_000,
    reexposureAttempts: 0,
    reexposureCorrect: 0,
    wrongRunTransitions: 0,
    adjustmentTotal: 0,
  }
  let reducedState = state
  const dispatch = vi.fn((action: AppAction) => {
    reducedState = appReducer(reducedState, action)
  })
  render(
    <QuizView
      items={items}
      quizType="en-ko"
      state={state}
      dispatch={dispatch}
      speech={null}
      candidateIds={[items[0]!.id]}
      count={1}
      random={zeroRandom}
      now={clockSequence([1_000, 1_100, 1_200])}
    />,
  )

  await answerFirstChoice(user)
  const attempt = quizAttemptActions(dispatch)[0]!
  expect(attempt.tracking).toMatchObject({
    adjustment: -1,
    session: { adjustments: { difficultyBoost: -1 } },
  })
  expect(reducedState.tracking.quizResponses[0]?.adjustment).toBe(-1)
  expect(reducedState.tracking.sessionHistory).toHaveLength(1)
  expect(reducedState.tracking.sessionHistory[0]).toMatchObject({
    id: attempt.tracking?.sessionId,
    status: 'interrupted',
    performance: { attempts: 1 },
  })
  await user.click(screen.getByRole('button', { name: '결과 보기' }))
  expect(reducedState.tracking.sessionHistory).toHaveLength(1)
  expect(reducedState.tracking.sessionHistory[0]).toMatchObject({
    id: attempt.tracking?.sessionId,
    status: 'completed',
    performance: { attempts: 1 },
  })
  expect(screen.getByLabelText('퀴즈 세션 계측'))
    .toHaveTextContent('적용 보정 -1.00')
})

test('다시 풀기는 같은 시각에도 고유한 새 세션 ID와 새 타이머를 만든다', async () => {
  const user = userEvent.setup()
  const dispatch = vi.fn()
  render(
    <QuizView
      items={makeQuizItems()}
      quizType="en-ko"
      state={createInitialState()}
      dispatch={dispatch}
      speech={null}
      count={1}
      random={zeroRandom}
      now={() => 1_000}
    />,
  )

  await answerFirstChoice(user)
  await user.click(screen.getByRole('button', { name: '결과 보기' }))
  await user.click(screen.getByRole('button', { name: '다시 풀기' }))
  await answerFirstChoice(user)

  const attempts = quizAttemptActions(dispatch)
  expect(attempts).toHaveLength(2)
  expect(attempts[0]!.tracking?.sessionId).toBe('quiz:기초:en-ko:1000:0')
  expect(attempts[1]!.tracking?.sessionId).toBe('quiz:기초:en-ko:1000:1')
  expect(attempts[1]!.tracking?.answerTimeMs).toBe(0)
})

test('퀴즈 유형 전환은 새 세션과 문항 시작 타이머를 사용한다', async () => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const [dictation] = generateQuiz(items, 'dictation', { count: 1, random: zeroRandom })
  const dispatch = vi.fn()
  render(
    <QuizView
      items={items}
      quizType="en-ko"
      state={createInitialState()}
      dispatch={dispatch}
      speech={null}
      count={1}
      random={zeroRandom}
      now={clockSequence([1_000, 5_000, 5_500])}
    />,
  )

  await user.click(screen.getByRole('button', { name: TYPE_LABELS.dictation }))
  await user.type(
    screen.getByRole('textbox', { name: '답안' }),
    `${dictation!.correctAnswer}{enter}`,
  )

  const attempt = quizAttemptActions(dispatch)[0]!
  expect(attempt.tracking).toMatchObject({
    sessionId: 'quiz:기초:dictation:5000:1',
    quizType: 'dictation',
    answerTimeMs: 500,
    occurredAt: 5_500,
  })
})

test('오답 후보 한 개만 지정해도 전체 풀로 4개 보기를 만들고 다시 학습에 전달한다', async () => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const sourceId = items[0]!.id
  const [question] = generateQuiz(items, 'en-ko', {
    count: 1,
    sourceIds: new Set([sourceId]),
    random: zeroRandom,
  })
  if (question?.inputMode !== 'choice') throw new Error('Expected choice question')
  const wrong = question.options.find((option) => option !== question.correctAnswer)!
  const onStudyMistakes = vi.fn()
  render(
    <QuizView
      items={items}
      quizType="en-ko"
      dispatch={vi.fn()}
      speech={null}
      candidateIds={[sourceId]}
      random={zeroRandom}
      onStudyMistakes={onStudyMistakes}
    />,
  )

  expect(screen.getAllByRole('button', { name: /뜻/ })).toHaveLength(4)
  await user.click(screen.getByRole('button', { name: wrong }))
  await user.click(screen.getByRole('button', { name: '결과 보기' }))
  expect(screen.getByText(items[0]!.term)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '틀린 단어 다시 학습' }))
  expect(onStudyMistakes).toHaveBeenCalledWith([sourceId])
})

test('오답 후보 중 선택 유형 적격 항목만으로 문항 수를 줄여 계속한다', () => {
  const items = makeQuizItems()
  const eligible = items[0]!
  const ineligible = {
    ...items[1]!,
    examples: ['No matching surface form appears here.'],
  }
  const mixedItems = [eligible, ineligible, ...items.slice(2)]

  render(
    <QuizView
      items={mixedItems}
      quizType="sentence-blank"
      dispatch={vi.fn()}
      speech={null}
      candidateIds={[eligible.id, ineligible.id]}
      count={2}
      random={zeroRandom}
    />,
  )

  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText('현재 1 / 전체 1')).toBeInTheDocument()
  expect(screen.getByTestId('quiz-prompt')).toHaveTextContent('_____')
})

test('오답 후보 중 선택 유형 적격 항목이 하나도 없으면 기존 오류를 유지한다', () => {
  const items = makeQuizItems()
  const ineligibleItems = items.map((item) => ({
    ...item,
    examples: ['No matching surface form appears here.'],
  }))

  render(
    <QuizView
      items={ineligibleItems}
      quizType="sentence-blank"
      dispatch={vi.fn()}
      speech={null}
      candidateIds={ineligibleItems.slice(0, 2).map(({ id }) => id)}
      count={2}
      random={zeroRandom}
    />,
  )

  expect(screen.getByRole('alert')).toHaveTextContent('생성 가능한 문항 0개')
})

test('단일 오답이 최소 간격 대기 중이면 안내와 전체 퀴즈 복귀를 제공한다', async () => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const sourceId = items[0]!.id
  const state = createInitialState()
  state.mistakes[sourceId] = {
    wrongCount: 1,
    wrongStreak: 1,
    priorityRemaining: 0,
    reviewPending: true,
    reviewSpacingRemaining: 1,
  }
  const onExitReview = vi.fn()

  render(
    <QuizView
      items={items}
      quizType="en-ko"
      state={state}
      dispatch={vi.fn()}
      speech={null}
      candidateIds={[sourceId]}
      random={zeroRandom}
      onExitReview={onExitReview}
    />,
  )

  expect(screen.getByRole('alert')).toHaveTextContent('오답 재출제의 최소 간격')
  await user.click(screen.getByRole('button', { name: '전체 퀴즈로 돌아가기' }))
  expect(onExitReview).toHaveBeenCalledOnce()
})

test('stale 후보와 TTS 실패를 비차단 오류로 표시한다', async () => {
  const user = userEvent.setup()
  const items = makeQuizItems()
  const view = render(
    <QuizView
      items={items}
      quizType="en-ko"
      dispatch={vi.fn()}
      speech={null}
      candidateIds={['missing-id']}
      random={zeroRandom}
    />,
  )

  expect(screen.getByRole('alert')).toHaveTextContent(/생성 가능한 문항 0개/)
  expect(screen.getByRole('button', { name: TYPE_LABELS.dictation })).toBeEnabled()

  const speech: SpeechPort = {
    speak: vi.fn(() => {
      throw new Error('no audio')
    }),
    cancel: vi.fn(),
  }
  view.rerender(
    <QuizView
      items={items}
      quizType="dictation"
      dispatch={vi.fn()}
      speech={speech}
      count={1}
      random={zeroRandom}
    />,
  )
  await user.click(screen.getByRole('button', { name: '발음 듣기' }))
  expect(screen.getByRole('status')).toHaveTextContent(
    '발음 재생을 지원하지 않는 브라우저입니다.',
  )
  expect(screen.getByRole('textbox', { name: '답안' })).toBeEnabled()
})

test('문장 의미 유형은 목표 표면형을 밑줄로 표시한다', () => {
  const items = makeQuizItems()
  const [question] = generateQuiz(items, 'sentence-meaning', {
    count: 1,
    random: zeroRandom,
  })
  render(
    <QuizView
      items={items}
      quizType="sentence-meaning"
      dispatch={vi.fn()}
      speech={null}
      count={1}
      random={zeroRandom}
    />,
  )

  const prompt = within(screen.getByTestId('quiz-prompt'))
  expect(prompt.getByText(/term/).tagName).toBe('U')
  expect(
    prompt.getByLabelText(`대상 단어: ${question?.sentence?.target}`),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { level: 3, name: /대상 단어:/ }),
  ).toBeInTheDocument()
})
