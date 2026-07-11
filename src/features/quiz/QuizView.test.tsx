import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { generateQuiz } from '../../domain/quiz/generate'
import { QUIZ_TYPES, type QuizType } from '../../domain/quiz/types'
import type { AppAction } from '../../state/appReducer'
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

test.each(QUIZ_TYPES)('%s 유형은 대표 풀에서 10문항 세션을 렌더링한다', (type) => {
  render(
    <QuizView
      items={makeQuizItems()}
      quizType={type}
      dispatch={vi.fn()}
      speech={{ speak: vi.fn() }}
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

  expect(screen.getByRole('status')).toHaveTextContent(/오답.*정답/)
  expect(screen.getByTestId('quiz-prompt')).toHaveTextContent(prompt ?? '')
  for (const option of first.options) {
    expect(screen.getByRole('button', { name: option })).toBeDisabled()
  }

  await user.click(next)
  expect(screen.getByTestId('quiz-prompt')).not.toHaveTextContent(prompt ?? '')
  expect(screen.getByTestId('quiz-prompt')).toHaveFocus()
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
      speech={{ speak: vi.fn() }}
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

  const recordCalls = dispatch.mock.calls.filter(
    ([action]) => (action as AppAction).type === 'RECORD_QUIZ',
  )
  expect(recordCalls).toHaveLength(1)
  expect(recordCalls[0]?.[0]).toMatchObject({
    type: 'RECORD_QUIZ',
    summary: { score: 2, total: 2, wrongItemIds: [] },
    attempts: questions.map((question) => ({
      sourceItemId: question.sourceItemId,
      difficulty: items.find(({ id }) => id === question.sourceItemId)?.difficulty,
      isCorrect: true,
    })),
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
