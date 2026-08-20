import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { QuizSessionSummary } from '../domain/quiz/types'
import { QUIZ_TYPES } from '../domain/quiz/types'
import { createInitialState } from './appState'
import { AppStateProvider } from './AppStateContext'
import { appReducer } from './appReducer'
import { BACKUP_STORAGE_KEY, STORAGE_KEY } from './persistence'
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

  it('consumes priority only for the exposed item and advances pending-review spacing', () => {
    const state = createInitialState()
    state.mistakes = {
      'word-play': {
        wrongCount: 2,
        wrongStreak: 2,
        priorityRemaining: 3,
        reviewPending: true,
        reviewSpacingRemaining: 0,
      },
      'word-book': {
        wrongCount: 3,
        wrongStreak: 3,
        priorityRemaining: 1,
        reviewPending: true,
        reviewSpacingRemaining: 1,
      },
      'word-read': { wrongCount: 2, wrongStreak: 2, priorityRemaining: 0 },
    }

    const advanced = appReducer(state, {
      type: 'ADVANCE_STUDY_SLOT',
      level: '초등학교',
      itemId: 'word-play',
      selectedDifficulty: 'easy',
      itemDifficulty: 'hard',
      priorityItemIds: ['word-play'],
    })

    expect(advanced.mistakes).toEqual({
      'word-play': { wrongCount: 2, wrongStreak: 2, priorityRemaining: 2 },
      'word-book': {
        wrongCount: 3,
        wrongStreak: 3,
        priorityRemaining: 1,
        reviewPending: true,
        reviewSpacingRemaining: 0,
      },
      'word-read': { wrongCount: 2, wrongStreak: 2, priorityRemaining: 0 },
    })
    expect(advanced.studyAnalytics.초등학교.selectedDifficulty.easy).toBe(1)
    expect(advanced.studyAnalytics.초등학교.exposedDifficulty.hard).toBe(1)
    expect(advanced.studyAnalytics.초등학교.wrongReexposures).toEqual({ 'word-play': 1 })
    expect(advanced.studyAnalytics.기초).toEqual(state.studyAnalytics.기초)
    expect(state.mistakes['word-play']?.priorityRemaining).toBe(3)
  })

  it('counts down only priorities actually reserved inside their next-slot window', () => {
    const state = createInitialState()
    state.mistakes = {
      'word-priority': { wrongCount: 2, wrongStreak: 2, priorityRemaining: 3 },
      'word-outside': { wrongCount: 2, wrongStreak: 2, priorityRemaining: 3 },
    }

    const afterFirstSlot = appReducer(state, {
      type: 'ADVANCE_STUDY_SLOT',
      level: '기초',
      itemId: 'word-normal-1',
      selectedDifficulty: 'normal',
      itemDifficulty: 'normal',
      priorityItemIds: ['word-priority'],
    })
    const afterSecondSlot = appReducer(afterFirstSlot, {
      type: 'ADVANCE_STUDY_SLOT',
      level: '중학교',
      itemId: 'word-normal-2',
      selectedDifficulty: 'normal',
      itemDifficulty: 'hard',
      priorityItemIds: ['word-priority'],
    })

    expect(afterFirstSlot.mistakes['word-priority']?.priorityRemaining).toBe(2)
    expect(afterSecondSlot.mistakes['word-priority']?.priorityRemaining).toBe(1)
    expect(afterSecondSlot.mistakes['word-outside']?.priorityRemaining).toBe(3)
    expect(afterSecondSlot.studyAnalytics.기초.selectedDifficulty.normal).toBe(1)
    expect(afterSecondSlot.studyAnalytics.기초.exposedDifficulty.normal).toBe(1)
    expect(afterSecondSlot.studyAnalytics.중학교.selectedDifficulty.normal).toBe(1)
    expect(afterSecondSlot.studyAnalytics.중학교.exposedDifficulty.hard).toBe(1)
    expect(afterSecondSlot.studyAnalytics.유치원).toEqual(state.studyAnalytics.유치원)
  })

  it('marks every wrong quiz item for one guaranteed later exposure', () => {
    const initial = createInitialState()
    initial.mistakes = {
      'word-early': { wrongCount: 1, wrongStreak: 1, priorityRemaining: 0 },
      'word-last': { wrongCount: 1, wrongStreak: 1, priorityRemaining: 0 },
    }
    const summary = quizSummary('word-last')
    summary.total = 2
    summary.typeStats['en-ko'] = {
      correct: 0,
      wrong: 2,
      total: 2,
      accuracy: 0,
    }
    summary.heatmap.unshift({
      questionId: 'q-word-early',
      sourceItemId: 'word-early',
      type: 'en-ko',
      isCorrect: false,
    })
    summary.wrongItemIds = ['word-early', 'word-last']

    const recorded = appReducer(initial, { type: 'RECORD_QUIZ', summary })

    expect(recorded.mistakes['word-early']).toMatchObject({
      reviewPending: true,
      reviewSpacingRemaining: 0,
    })
    expect(recorded.mistakes['word-last']).toMatchObject({
      reviewPending: true,
      reviewSpacingRemaining: 1,
    })
  })

  it('schedules a wrong answer immediately so leaving an unfinished quiz cannot lose review', () => {
    const wrong = appReducer(createInitialState(), {
      type: 'RECORD_QUIZ_ATTEMPT',
      level: '기초',
      attempt: {
        sourceItemId: 'word-last',
        difficulty: 'hard',
        isCorrect: false,
      },
    })

    expect(wrong.mistakes['word-last']).toMatchObject({
      reviewPending: true,
      reviewSpacingRemaining: 1,
    })

    const afterSpacer = appReducer(wrong, {
      type: 'RECORD_QUIZ_ATTEMPT',
      level: '기초',
      attempt: {
        sourceItemId: 'word-spacer',
        difficulty: 'normal',
        isCorrect: true,
      },
    })
    expect(afterSpacer.mistakes['word-last']).toMatchObject({
      reviewPending: true,
      reviewSpacingRemaining: 0,
    })
  })

  it('isolates quiz difficulty statistics by level and keeps only the latest seven summaries', () => {
    const result = Array.from({ length: 8 }, (_, index) => index).reduce(
      (state, index) => {
        const attempted = appReducer(state, {
          type: 'RECORD_QUIZ_ATTEMPT',
          level: index < 4 ? '기초' : '유치원',
          attempt: {
            sourceItemId: `word-${index}`,
            difficulty: 'hard',
            isCorrect: index % 2 === 0,
          },
        })
        return appReducer(attempted, {
          type: 'RECORD_QUIZ',
          summary: quizSummary(`word-${index}`),
        })
      },
      createInitialState(),
    )

    expect(result.difficultyStats.기초.hard).toEqual({ attempts: 4, correct: 2 })
    expect(result.difficultyStats.유치원.hard).toEqual({ attempts: 4, correct: 2 })
    expect(result.difficultyStats.초등학교.hard).toEqual({ attempts: 0, correct: 0 })
    expect(result.quizHistory).toHaveLength(7)
    expect(result.quizHistory[0]?.wrongItemIds).toEqual(['word-1'])
    expect(result.quizHistory[6]?.wrongItemIds).toEqual(['word-7'])
  })
})

interface MemoryStorage extends Pick<Storage, 'getItem' | 'setItem'> {
  values: Map<string, string>
}

function memoryStorage(raw?: string): MemoryStorage {
  const values = new Map<string, string>()
  if (raw !== undefined) values.set(STORAGE_KEY, raw)
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
      <span data-testid="preferences">
        {`${state.navigation.studyDifficulty} ${state.navigation.quizType}`}
      </span>
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
  it('uses a tab-scoped memory store when the browser localStorage getter is unavailable', async () => {
    const user = userEvent.setup()
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('opaque origin', 'SecurityError')
      },
    })

    try {
      render(
        <AppStateProvider>
          <ContextHarness />
        </AppStateProvider>,
      )

      expect(screen.getByText('기초 대시보드')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent(/현재 탭에서만/)

      await user.click(screen.getByRole('button', { name: '학습 전환' }))
      expect(screen.getByText('기초 학습')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent(/새로고침하면 초기화/)
    } finally {
      if (descriptor) {
        Object.defineProperty(window, 'localStorage', descriptor)
      } else {
        Reflect.deleteProperty(window, 'localStorage')
      }
    }
  })

  it('persists load observability with the first transition and saves each exact next state', async () => {
    const user = userEvent.setup()
    const storage = memoryStorage()
    render(
      <AppStateProvider storage={storage}>
        <ContextHarness />
      </AppStateProvider>,
    )

    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.values.has(STORAGE_KEY)).toBe(false)
    await user.click(screen.getByRole('button', { name: '학습 전환' }))
    expect(
      JSON.parse(storage.values.get(STORAGE_KEY) ?? '{}').tracking.stateLoadHistory,
    ).toMatchObject([{ sequence: 1, outcome: 'empty', source: 'empty' }])
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

  it('accumulates each provider load event on that provider\'s next transition', async () => {
    const user = userEvent.setup()
    const storage = memoryStorage()
    const first = render(
      <AppStateProvider storage={storage}>
        <ContextHarness />
      </AppStateProvider>,
    )
    await user.click(screen.getByRole('button', { name: '학습 전환' }))
    first.unmount()

    render(
      <AppStateProvider storage={storage}>
        <ContextHarness />
      </AppStateProvider>,
    )
    await user.click(screen.getByRole('button', { name: '연속 변경' }))

    expect(
      JSON.parse(storage.values.get(STORAGE_KEY) ?? '{}').tracking.stateLoadHistory,
    ).toMatchObject([
      { sequence: 1, outcome: 'empty', source: 'empty' },
      { sequence: 2, outcome: 'loaded', source: 'current' },
    ])
  })

  it.each([
    ['empty', null],
    ['current', JSON.stringify(createInitialState())],
  ])('does not clobber a newer tab after an interleaved %s load', (_source, raw) => {
    const newer = createInitialState()
    newer.navigation.studyDifficulty = 'veryHard'
    const newerRaw = JSON.stringify(newer)
    const values = new Map<string, string>()
    if (raw !== null) values.set(STORAGE_KEY, raw)
    let servedInitialRead = false
    const storage = {
      getItem: vi.fn((key: string) => {
        if (key !== STORAGE_KEY) return values.get(key) ?? null
        if (!servedInitialRead) {
          servedInitialRead = true
          values.set(STORAGE_KEY, newerRaw)
          return raw
        }
        return values.get(key) ?? null
      }),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    }

    const view = render(
      <AppStateProvider storage={storage}>
        <ContextHarness />
      </AppStateProvider>,
    )

    expect(values.get(STORAGE_KEY)).toBe(newerRaw)
    expect(storage.setItem).not.toHaveBeenCalled()
    view.unmount()
  })

  it('backs up and immediately persists an unchanged legacy migration', () => {
    const raw = JSON.stringify({ level: '유치원', section: '단어장' })
    const storage = memoryStorage(raw)

    render(
      <AppStateProvider storage={storage}>
        <ContextHarness />
      </AppStateProvider>,
    )

    expect(storage.values.get(BACKUP_STORAGE_KEY)).toBe(raw)
    expect(JSON.parse(storage.values.get(STORAGE_KEY) ?? '{}')).toMatchObject({
      schemaVersion: 7,
      navigation: { level: '유치원', section: '단어장' },
      tracking: {
        stateLoadHistory: [{ outcome: 'migrated', source: 'legacy' }],
      },
    })
    expect(vi.mocked(storage.setItem).mock.calls[0]).toEqual([
      BACKUP_STORAGE_KEY,
      raw,
    ])
  })

  it.each([
    ['migration', JSON.stringify({ level: '유치원' })],
    ['recovery', '{bad json'],
  ])('does not replace an interleaved newer value during %s persistence', (_status, raw) => {
    const newer = createInitialState()
    newer.navigation.quizType = 'dictation'
    const newerRaw = JSON.stringify(newer)
    const values = new Map([[STORAGE_KEY, raw]])
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value)
        if (key === BACKUP_STORAGE_KEY) values.set(STORAGE_KEY, newerRaw)
      }),
    }

    const view = render(
      <AppStateProvider storage={storage}>
        <ContextHarness />
      </AppStateProvider>,
    )

    expect(values.get(BACKUP_STORAGE_KEY)).toBe(raw)
    expect(values.get(STORAGE_KEY)).toBe(newerRaw)
    expect(storage.setItem).not.toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.any(String),
    )
    view.unmount()
  })

  it('switches to tab memory when storage becomes unavailable during a write', async () => {
    const user = userEvent.setup()
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new DOMException('opaque origin', 'SecurityError')
      }),
    }
    render(
      <AppStateProvider storage={storage}>
        <ContextHarness />
      </AppStateProvider>,
    )

    await user.click(screen.getByRole('button', { name: '학습 전환' }))
    await user.click(screen.getByRole('button', { name: '연속 변경' }))

    expect(screen.getByText('기초 학습')).toBeInTheDocument()
    expect(screen.getByTestId('preferences')).toHaveTextContent('hard dictation')
    expect(screen.getByRole('status')).toHaveTextContent(/현재 탭에서만/)
    expect(screen.getByRole('status')).toHaveTextContent(/새로고침하면 초기화/)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })

  it('backs up a corrupt source before any transition can replace the primary value', async () => {
    const user = userEvent.setup()
    const raw = ' {bad json}\r\n'
    const storage = memoryStorage(raw)

    render(
      <AppStateProvider storage={storage}>
        <ContextHarness />
      </AppStateProvider>,
    )

    expect(storage.values.get(BACKUP_STORAGE_KEY)).toBe(raw)
    expect(JSON.parse(storage.values.get(STORAGE_KEY) ?? '{}')).toMatchObject({
      tracking: {
        stateLoadHistory: [{ outcome: 'recovered', source: 'malformed' }],
      },
    })

    await user.click(screen.getByRole('button', { name: '학습 전환' }))

    expect(JSON.parse(storage.values.get(STORAGE_KEY) ?? '{}').navigation.section).toBe(
      '학습',
    )
    expect(storage.values.get(BACKUP_STORAGE_KEY)).toBe(raw)
    expect(vi.mocked(storage.setItem).mock.calls[0]).toEqual([
      BACKUP_STORAGE_KEY,
      raw,
    ])
  })

  it('falls back to tab memory when a backed-up recovery cannot replace the primary value', async () => {
    const user = userEvent.setup()
    const raw = '{bad json'
    const values = new Map([[STORAGE_KEY, raw]])
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        if (key === STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError')
        values.set(key, value)
      }),
    }

    render(
      <AppStateProvider storage={storage}>
        <ContextHarness />
      </AppStateProvider>,
    )

    expect(values.get(BACKUP_STORAGE_KEY)).toBe(raw)
    expect(values.get(STORAGE_KEY)).toBe(raw)
    expect(screen.getByRole('status')).toHaveTextContent(/현재 탭에서만/)
    await user.click(screen.getByRole('button', { name: '학습 전환' }))
    expect(screen.getByText('기초 학습')).toBeInTheDocument()
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String))
    expect(storage.setItem).toHaveBeenCalledTimes(2)
  })

  it('does not overwrite the corrupt primary value when its backup cannot be saved', async () => {
    const user = userEvent.setup()
    const raw = '{bad json'
    const values = new Map([[STORAGE_KEY, raw]])
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        if (key === BACKUP_STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError')
        values.set(key, value)
      }),
    }

    render(
      <AppStateProvider storage={storage}>
        <ContextHarness />
      </AppStateProvider>,
    )
    await user.click(screen.getByRole('button', { name: '학습 전환' }))

    expect(screen.getByText('기초 학습')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/복구 원본/)
    expect(values.get(STORAGE_KEY)).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.any(String),
    )
  })
})
