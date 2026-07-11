import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { generateQuiz } from '../../domain/quiz/generate'
import { mistakeBoost } from '../../domain/progress/mastery'
import { buildStudyQueue } from '../../domain/scheduler/queue'
import { createInitialState } from '../../state/appState'
import { appReducer, type AppAction } from '../../state/appReducer'
import { makeQuizItems } from './quizTestFixtures'
import { QuizView } from './QuizView'

const zeroRandom = () => 0

test('같은 퀴즈 오답이 누적되면 다음 학습 큐 첫 3슬롯으로 전파된다', async () => {
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
  let state = createInitialState()

  async function completeWrongSession() {
    const view = render(
      <QuizView
        items={items}
        quizType="en-ko"
        dispatch={(action: AppAction) => {
          state = appReducer(state, action)
        }}
        speech={null}
        candidateIds={[sourceId]}
        random={zeroRandom}
      />,
    )
    await user.click(screen.getByRole('button', { name: wrong }))
    await user.click(screen.getByRole('button', { name: '결과 보기' }))
    view.unmount()
  }

  await completeWrongSession()
  expect(state.mistakes[sourceId]).toEqual({
    wrongCount: 1,
    wrongStreak: 1,
    priorityRemaining: 0,
  })
  expect(mistakeBoost(state.mistakes[sourceId])).toBe(0.15)

  await completeWrongSession()
  expect(state.mistakes[sourceId]).toEqual({
    wrongCount: 2,
    wrongStreak: 2,
    priorityRemaining: 3,
  })
  expect(mistakeBoost(state.mistakes[sourceId])).toBe(0.3)

  const queue = buildStudyQueue(items, {
    selectedDifficulty: 'normal',
    mistakes: state.mistakes,
    difficultyStats: state.difficultyStats,
    limit: items.length,
    random: zeroRandom,
  })
  expect(queue.slice(0, 3).map(({ id }) => id)).toContain(sourceId)
  expect(queue.filter(({ id }) => id === sourceId)).toHaveLength(1)
})
