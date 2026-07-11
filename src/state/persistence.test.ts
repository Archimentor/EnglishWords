import { DIFFICULTIES } from '../domain/content/types'
import { QUIZ_TYPES } from '../domain/quiz/types'
import type { QuizSessionSummary } from '../domain/quiz/types'
import { createInitialState } from './appState'
import type { AppState } from './appState'
import { loadAppState, saveAppState, STORAGE_KEY } from './persistence'

interface MemoryStorage extends Pick<Storage, 'getItem' | 'setItem'> {
  values: Map<string, string>
}

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const values = new Map(Object.entries(initial))

  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  }
}

function quizSummary(): QuizSessionSummary {
  const typeStats = Object.fromEntries(
    QUIZ_TYPES.map((type) => [
      type,
      type === 'en-ko'
        ? { correct: 0, wrong: 1, total: 1, accuracy: 0 }
        : { correct: 0, wrong: 0, total: 0, accuracy: 0 },
    ]),
  ) as QuizSessionSummary['typeStats']

  return {
    score: 0,
    total: 1,
    accuracy: 0,
    typeStats,
    heatmap: [
      {
        questionId: 'q-1',
        sourceItemId: 'word-play',
        type: 'en-ko',
        isCorrect: false,
      },
    ],
    wrongItemIds: ['word-play'],
  }
}

function populatedState(): AppState {
  const initial = createInitialState()

  return {
    ...initial,
    navigation: {
      level: '초등학교',
      section: '학습',
      grammarSection: 'A2',
      grammarNodeId: 'A2-G01',
      studyDifficulty: 'hard',
      quizType: 'dictation',
    },
    mastery: {
      'word-play': {
        attempts: 3,
        correct: 3,
        wrong: 0,
        correctStreak: 3,
        wrongStreak: 0,
      },
    },
    mistakes: {
      'word-book': { wrongCount: 2, wrongStreak: 2, priorityRemaining: 3 },
    },
    studySessions: {
      초등학교: { queueIds: ['word-play', 'word-book'], currentIndex: 1 },
    },
    difficultyStats: {
      ...initial.difficultyStats,
      hard: { attempts: 5, correct: 3 },
    },
    quizHistory: [quizSummary()],
  }
}

describe('createInitialState', () => {
  it('creates a fresh version 1 state with all difficulty buckets', () => {
    const first = createInitialState()
    const second = createInitialState()

    expect(first).toEqual({
      schemaVersion: 1,
      navigation: {
        level: '기초',
        section: '대시보드',
        grammarSection: '대시보드',
        grammarNodeId: null,
        studyDifficulty: 'normal',
        quizType: 'en-ko',
      },
      mastery: {},
      mistakes: {},
      studySessions: {},
      difficultyStats: Object.fromEntries(
        DIFFICULTIES.map((difficulty) => [difficulty, { attempts: 0, correct: 0 }]),
      ),
      quizHistory: [],
    })
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(second.navigation).not.toBe(first.navigation)
    expect(second.difficultyStats.normal).not.toBe(first.difficultyStats.normal)
  })
})

describe('loadAppState and saveAppState', () => {
  it('returns an empty initial state when storage has no value', () => {
    const result = loadAppState(memoryStorage())

    expect(result).toEqual({
      state: createInitialState(),
      status: 'empty',
      warning: null,
      rawBackup: null,
    })
  })

  it('round-trips a complete valid version 1 state', () => {
    const storage = memoryStorage()
    const state = populatedState()

    expect(saveAppState(storage, state)).toEqual({ ok: true })
    expect(loadAppState(storage)).toEqual({
      state,
      status: 'loaded',
      warning: null,
      rawBackup: null,
    })
  })

  it('migrates the documented flat menu state and preserves its raw source', () => {
    const raw = JSON.stringify({
      level: '초등학교',
      section: '학습',
      grammarSection: 'A2',
      studyDifficulty: 'hard',
      quizType: 'dictation',
    })
    const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))

    expect(result.status).toBe('migrated')
    expect(result.warning).toMatch(/이전 버전/)
    expect(result.rawBackup).toBe(raw)
    expect(result.state.navigation).toMatchObject({
      level: '초등학교',
      section: '학습',
      grammarSection: 'A2',
      studyDifficulty: 'hard',
      quizType: 'dictation',
    })
  })

  it('fills missing legacy menu fields with defaults', () => {
    const raw = JSON.stringify({ level: '유치원' })

    expect(loadAppState(memoryStorage({ [STORAGE_KEY]: raw })).state.navigation).toEqual({
      ...createInitialState().navigation,
      level: '유치원',
    })
  })

  it.each([
    ['bad json', '{bad json'],
    ['null root', JSON.stringify(null)],
    ['array root', JSON.stringify([])],
    ['primitive root', JSON.stringify('state')],
    ['unsupported schema', JSON.stringify({ schemaVersion: 2 })],
    ['invalid legacy enum', JSON.stringify({ level: '고등학교' })],
  ])('recovers %s with a warning and raw backup', (_label, raw) => {
    const result = loadAppState(memoryStorage({ [STORAGE_KEY]: raw }))

    expect(result.state).toEqual(createInitialState())
    expect(result.status).toBe('recovered')
    expect(result.warning).toMatch(/저장된 학습 상태/)
    expect(result.rawBackup).toBe(raw)
  })

  it('rejects invalid nested counters and session indexes', () => {
    const invalidMastery = populatedState()
    invalidMastery.mastery['word-play'] = {
      attempts: 3,
      correct: 2,
      wrong: 0,
      correctStreak: 2,
      wrongStreak: 0,
    }
    const invalidSession = populatedState()
    invalidSession.studySessions.초등학교 = {
      queueIds: ['word-play', 'word-play'],
      currentIndex: 3,
    }

    for (const state of [invalidMastery, invalidSession]) {
      const result = loadAppState(
        memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) }),
      )
      expect(result.status).toBe('recovered')
      expect(result.state).toEqual(createInitialState())
    }
  })

  it('rejects impossible simultaneous streaks and priority outside the three-slot window', () => {
    const impossibleStreaks = populatedState()
    impossibleStreaks.mastery['word-play'] = {
      attempts: 4,
      correct: 3,
      wrong: 1,
      correctStreak: 2,
      wrongStreak: 1,
    }
    const invalidPriority = populatedState()
    invalidPriority.mistakes['word-book'] = {
      wrongCount: 4,
      wrongStreak: 4,
      priorityRemaining: 4,
    }

    for (const state of [impossibleStreaks, invalidPriority]) {
      expect(
        loadAppState(memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) })).status,
      ).toBe('recovered')
    }
  })

  it('rejects an invalid current navigation enum and inconsistent wrong-item summary', () => {
    const invalidNavigation = populatedState()
    invalidNavigation.navigation.section = '설정' as AppState['navigation']['section']
    const invalidSummary = populatedState()
    invalidSummary.quizHistory[0]!.wrongItemIds = ['word-other']

    for (const state of [invalidNavigation, invalidSummary]) {
      const result = loadAppState(
        memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) }),
      )
      expect(result.status).toBe('recovered')
      expect(result.state).toEqual(createInitialState())
    }
  })

  it('rejects incomplete difficulty stats and more than seven quiz summaries', () => {
    const incompleteStats = populatedState()
    delete (incompleteStats.difficultyStats as Partial<AppState['difficultyStats']>).easy
    const oldHistory = populatedState()
    oldHistory.quizHistory = Array.from({ length: 8 }, quizSummary)

    for (const state of [incompleteStats, oldHistory]) {
      expect(
        loadAppState(memoryStorage({ [STORAGE_KEY]: JSON.stringify(state) })).status,
      ).toBe('recovered')
    }
  })

  it('recovers when reading storage throws without claiming a raw backup', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError')
      }),
    }

    expect(loadAppState(storage)).toEqual({
      state: createInitialState(),
      status: 'recovered',
      warning: expect.stringMatching(/저장된 학습 상태/),
      rawBackup: null,
    })
  })

  it('returns a failure result when storage quota is exceeded', () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new DOMException('full', 'QuotaExceededError')
      }),
    }

    expect(saveAppState(storage, createInitialState())).toEqual({
      ok: false,
      message: expect.stringMatching(/저장/),
    })
  })

  it('returns a failure before writing when serialization fails', () => {
    const storage = memoryStorage()
    const circular = createInitialState() as AppState & { self?: unknown }
    circular.self = circular

    expect(saveAppState(storage, circular)).toEqual({
      ok: false,
      message: expect.stringMatching(/저장/),
    })
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('never overwrites a corrupt source while recovering it', () => {
    const raw = '{bad json'
    const storage = memoryStorage({ [STORAGE_KEY]: raw })

    loadAppState(storage)

    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.values.get(STORAGE_KEY)).toBe(raw)
  })
})
