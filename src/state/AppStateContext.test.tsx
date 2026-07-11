import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { QuizSessionSummary } from '../domain/quiz/types'
import { QUIZ_TYPES } from '../domain/quiz/types'
import { createInitialState } from './appState'
import { AppStateProvider } from './AppStateContext'
import { appReducer } from './appReducer'
import { STORAGE_KEY } from './persistence'
import { useAppState } from './useAppState'

function quizSummary(sourceItemId = 'word-play'): QuizSessionSummary {
  return {
    score: 0,
    total: 1,
    accuracy: 0,
    typeStats: Object.fromEntries(
      QUIZ_TYPES.map((type) => [
        type,
        type === 'en-ko'
          ? { correct: 0, wrong: 1, total: 1, accuracy: 0 }
          : { correct: 0, wrong: 0, total: 0, accuracy: 0 },
      ]),
    ) as QuizSessionSummary['typeStats'],
    heatmap: [
      {
        questionId: `q-${sourceItemId}`,
        sourceItemId,
        type: 'en-ko',
        isCorrect: false,
      },
    ],
    wrongItemIds: [sourceItemId],
  }
}

describe('appReducer navigation', () => {
  it('keeps study context for SELECT_LEVEL but sends a primary level to its dashboard', () => {
    const studying = appReducer(createInitialState(), {
      type: 'SELECT_PRIMARY',
      primary: '학습',
    })
    const changedLevel = appReducer(studying, {
      type: 'SELECT_LEVEL',
      level: '초등학교',
    })
    const dashboard = appReducer(changedLevel, {
      type: 'SELECT_PRIMARY',
      primary: '유치원',
    })

    expect(changedLevel.navigation).toMatchObject({
      level: '초등학교',
      section: '학습',
    })
    expect(dashboard.navigation).toMatchObject({
      level: '유치원',
      section: '대시보드',
    })
  })

  it('resets grammar nodes when changing grammar level and aligns node selection', () => {
    const grammar = appReducer(createInitialState(), {
      type: 'SELECT_GRAMMAR_NODE',
      grammarSection: 'A2',
      nodeId: 'A2-G01',
    })
    const changedLevel = appReducer(grammar, {
      type: 'SELECT_GRAMMAR_LEVEL',
      grammarSection: 'B1',
    })

    expect(grammar.navigation).toMatchObject({
      section: '문법',
      grammarSection: 'A2',
      grammarNodeId: 'A2-G01',
    })
    expect(changedLevel.navigation).toMatchObject({
      section: '문법',
      grammarSection: 'B1',
      grammarNodeId: null,
    })
  })

  it('preserves progress records while navigating and saves level sessions independently', () => {
    const initial = {
      ...createInitialState(),
      mastery: {
        'word-play': {
          attempts: 3,
          correct: 3,
          wrong: 0,
          correctStreak: 3,
          wrongStreak: 0,
        },
      },
    }
    const navigated = appReducer(initial, {
      type: 'SELECT_CONTEXT',
      section: '단어장',
    })
    const firstSession = appReducer(navigated, {
      type: 'SAVE_STUDY_SESSION',
      level: '기초',
      snapshot: { queueIds: ['word-play'], currentIndex: 0 },
    })
    const secondSession = appReducer(firstSession, {
      type: 'SAVE_STUDY_SESSION',
      level: '유치원',
      snapshot: { queueIds: ['word-book'], currentIndex: 1 },
    })

    expect(navigated.mastery).toBe(initial.mastery)
    expect(secondSession.studySessions).toEqual({
      기초: { queueIds: ['word-play'], currentIndex: 0 },
      유치원: { queueIds: ['word-book'], currentIndex: 1 },
    })
  })
})

describe('appReducer learning records', () => {
  it('promotes consecutive mistakes and clears a resolved mistake', () => {
    const firstWrong = appReducer(createInitialState(), {
      type: 'RECORD_STUDY',
      itemId: 'word-play',
      correct: false,
    })
    const secondWrong = appReducer(firstWrong, {
      type: 'RECORD_STUDY',
      itemId: 'word-play',
      correct: false,
    })
    const recovered = appReducer(secondWrong, {
      type: 'RECORD_STUDY',
      itemId: 'word-play',
      correct: true,
    })

    expect(firstWrong.mistakes['word-play']).toEqual({
      wrongCount: 1,
      wrongStreak: 1,
      priorityRemaining: 0,
    })
    expect(secondWrong.mistakes['word-play']).toEqual({
      wrongCount: 2,
      wrongStreak: 2,
      priorityRemaining: 3,
    })
    expect(recovered.mistakes['word-play']).toBeUndefined()
    expect(recovered.mastery['word-play']).toMatchObject({
      attempts: 3,
      correct: 1,
      wrong: 2,
      wrongStreak: 0,
    })
  })

  it('updates quiz difficulty statistics and keeps only the latest seven summaries', () => {
    const result = Array.from({ length: 8 }, (_, index) => index).reduce(
      (state, index) =>
        appReducer(state, {
          type: 'RECORD_QUIZ',
          summary: quizSummary(`word-${index}`),
          attempts: [
            {
              sourceItemId: `word-${index}`,
              difficulty: 'hard',
              isCorrect: index % 2 === 0,
            },
          ],
        }),
      createInitialState(),
    )

    expect(result.difficultyStats.hard).toEqual({ attempts: 8, correct: 4 })
    expect(result.quizHistory).toHaveLength(7)
    expect(result.quizHistory[0]?.wrongItemIds).toEqual(['word-1'])
    expect(result.quizHistory[6]?.wrongItemIds).toEqual(['word-7'])
  })
})

interface MemoryStorage extends Pick<Storage, 'getItem' | 'setItem'> {
  values: Map<string, string>
}

function memoryStorage(): MemoryStorage {
  const values = new Map<string, string>()
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  }
}

function ContextHarness() {
  const { state, dispatch, warning } = useAppState()

  return (
    <>
      <p>{`${state.navigation.level} ${state.navigation.section}`}</p>
      {warning ? <p role="status">{warning}</p> : null}
      <button
        type="button"
        onClick={() => dispatch({ type: 'SELECT_PRIMARY', primary: '학습' })}
      >
        학습 전환
      </button>
      <button
        type="button"
        onClick={() => {
          dispatch({ type: 'SET_DIFFICULTY', difficulty: 'hard' })
          dispatch({ type: 'SET_QUIZ_TYPE', quizType: 'dictation' })
        }}
      >
        연속 변경
      </button>
    </>
  )
}

describe('AppStateProvider persistence', () => {
  it('does not save on mount and persists the exact next state after transitions', async () => {
    const user = userEvent.setup()
    const storage = memoryStorage()
    render(
      <AppStateProvider storage={storage}>
        <ContextHarness />
      </AppStateProvider>,
    )

    expect(storage.setItem).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '학습 전환' }))
    expect(screen.getByText('기초 학습')).toBeInTheDocument()
    expect(JSON.parse(storage.values.get(STORAGE_KEY) ?? '{}').navigation.section).toBe(
      '학습',
    )

    await user.click(screen.getByRole('button', { name: '연속 변경' }))
    const saved = JSON.parse(storage.values.get(STORAGE_KEY) ?? '{}')
    expect(saved.navigation).toMatchObject({
      studyDifficulty: 'hard',
      quizType: 'dictation',
    })
    expect(storage.setItem).toHaveBeenCalledTimes(3)
  })

  it('keeps the in-memory transition and exposes a warning when saving fails', async () => {
    const user = userEvent.setup()
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new DOMException('full', 'QuotaExceededError')
      }),
    }
    render(
      <AppStateProvider storage={storage}>
        <ContextHarness />
      </AppStateProvider>,
    )

    await user.click(screen.getByRole('button', { name: '학습 전환' }))

    expect(screen.getByText('기초 학습')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/저장/)
  })
})
