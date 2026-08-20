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
  let clock = 1_700_000_000_000
  const now = () => {
    clock += 1_000
    return clock
  }
  const [question] = generateQuiz(items, 'en-ko', {
    count: 1,
    sourceIds: new Set([sourceId]),
    random: zeroRandom,
  })
  if (question?.inputMode !== 'choice') throw new Error('Expected choice question')
  const wrong = question.options.find((option) => option !== question.correctAnswer)!
  let state = createInitialState()

  async function completeWrongSession(expectedWrongCount: number) {
    const view = render(
      <QuizView
        items={items}
        quizType="en-ko"
        state={state}
        dispatch={(action: AppAction) => {
          state = appReducer(state, action)
        }}
        speech={null}
        candidateIds={[sourceId]}
        random={zeroRandom}
        now={now}
      />,
    )
    await user.click(screen.getByRole('button', { name: wrong }))
    expect(state.mistakes[sourceId]?.wrongCount).toBe(expectedWrongCount)
    await user.click(screen.getByRole('button', { name: '결과 보기' }))
    view.unmount()
  }

  await completeWrongSession(1)
  expect(state.mistakes[sourceId]).toEqual(expect.objectContaining({
    wrongCount: 1,
    wrongStreak: 1,
    priorityRemaining: 0,
    reviewPending: true,
    reviewSpacingRemaining: 1,
    penaltyWeight: 0.15,
    nextBoost: 0.3,
    linkedLevel: '기초',
    priorityInsertedAt: null,
  }))
  expect(state.mistakes[sourceId]?.cooldownAt).toEqual(expect.any(Number))
  expect(mistakeBoost(state.mistakes[sourceId])).toBe(0.15)

  await completeWrongSession(2)
  expect(state.mistakes[sourceId]).toEqual(expect.objectContaining({
    wrongCount: 2,
    wrongStreak: 2,
    priorityRemaining: 3,
    reviewPending: true,
    reviewSpacingRemaining: 1,
    penaltyWeight: 0.3,
    nextBoost: 0.3,
    linkedLevel: '기초',
  }))
  expect(state.mistakes[sourceId]?.priorityInsertedAt).toEqual(expect.any(Number))
  expect(mistakeBoost(state.mistakes[sourceId])).toBe(0.3)

  expect(state.tracking.quizResponses).toHaveLength(2)
  expect(state.tracking.quizTypeStats.기초['en-ko'].attempts).toBe(2)
  expect(state.tracking.itemSchedule[sourceId]?.kind).toBe('word')
  expect(state.tracking.sessionHistory.filter(({ kind }) => kind === 'quiz')).toHaveLength(2)

  const queue = buildStudyQueue(items, {
    selectedDifficulty: 'normal',
    mistakes: state.mistakes,
    difficultyStats: state.difficultyStats.기초,
    limit: items.length,
    random: zeroRandom,
  })
  expect(queue.slice(0, 3).map(({ id }) => id)).toContain(sourceId)
  expect(queue.filter(({ id }) => id === sourceId)).toHaveLength(1)
})
