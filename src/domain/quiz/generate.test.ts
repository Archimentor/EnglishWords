import type { StudyItem } from '../content/types'
import type { QuizTypeTrackingStats } from '../progress/tracking'
import {
  auditQuizDifficultyCalibration,
  generateQuiz,
  QuizGenerationError,
} from './generate'
import { normalizeAnswer } from './grade'
import { QUIZ_TYPES, type QuizSessionSummary } from './types'

const SEED_ITEMS: StudyItem[] = [
  {
    id: 'word-play',
    kind: 'word',
    term: 'play',
    lemma: 'play',
    level: '기초',
    difficulty: 'veryEasy',
    partsOfSpeech: ['verb'],
    forms: ['play', 'plays', 'played', 'playing'],
    meanings: ['놀다'],
    ipa: '/pleɪ/',
    examples: ['The playground is busy.', 'They played outside yesterday.'],
    entries: [{
      partOfSpeech: 'verb',
      forms: ['play', 'plays', 'played', 'playing'],
      meanings: ['놀다'],
      ipa: '/pleɪ/',
      examples: ['The playground is busy.', 'They played outside yesterday.'],
    }],
  },
  {
    id: 'phrasal-wake-up',
    kind: 'phrasalVerb',
    term: 'wake up',
    lemma: 'wake up',
    level: '기초',
    difficulty: 'easy',
    partsOfSpeech: ['phrasalVerb'],
    forms: ['wake up'],
    meanings: ['잠에서 깨다'],
    ipa: null,
    examples: ['I wake up at seven.', 'We wake up early on school days.'],
    entries: [{
      partOfSpeech: 'phrasalVerb',
      forms: ['wake up'],
      meanings: ['잠에서 깨다'],
      ipa: '',
      examples: ['I wake up at seven.', 'We wake up early on school days.'],
    }],
  },
  {
    id: 'word-book',
    kind: 'word',
    term: 'book',
    lemma: 'book',
    level: '기초',
    difficulty: 'easy',
    partsOfSpeech: ['noun'],
    forms: ['book', 'books'],
    meanings: ['책'],
    ipa: '/bʊk/',
    examples: ['This book is new.', 'The books are on the desk.'],
    entries: [{
      partOfSpeech: 'noun',
      forms: ['book', 'books'],
      meanings: ['책'],
      ipa: '/bʊk/',
      examples: ['This book is new.', 'The books are on the desk.'],
    }],
  },
  {
    id: 'word-apple',
    kind: 'word',
    term: 'apple',
    lemma: 'apple',
    level: '기초',
    difficulty: 'normal',
    partsOfSpeech: ['noun'],
    forms: ['apple', 'apples'],
    meanings: ['사과'],
    ipa: '/ˈæpəl/',
    examples: ['I eat an apple.', 'The apples are red.'],
    entries: [{
      partOfSpeech: 'noun',
      forms: ['apple', 'apples'],
      meanings: ['사과'],
      ipa: '/ˈæpəl/',
      examples: ['I eat an apple.', 'The apples are red.'],
    }],
  },
  {
    id: 'word-run',
    kind: 'word',
    term: 'run',
    lemma: 'run',
    level: '기초',
    difficulty: 'normal',
    partsOfSpeech: ['verb'],
    forms: ['run', 'runs', 'ran', 'running'],
    meanings: ['달리다'],
    ipa: '/rʌn/',
    examples: ['They run every morning.', 'She ran to the gate.'],
    entries: [{
      partOfSpeech: 'verb',
      forms: ['run', 'runs', 'ran', 'running'],
      meanings: ['달리다'],
      ipa: '/rʌn/',
      examples: ['They run every morning.', 'She ran to the gate.'],
    }],
  },
  {
    id: 'word-happy',
    kind: 'word',
    term: 'happy',
    lemma: 'happy',
    level: '기초',
    difficulty: 'normal',
    partsOfSpeech: ['adjective'],
    forms: ['happy', 'happier', 'happiest'],
    meanings: ['행복한'],
    ipa: '/ˈhæpi/',
    examples: ['The happy child smiled.', 'I am happy today.'],
    entries: [{
      partOfSpeech: 'adjective',
      forms: ['happy', 'happier', 'happiest'],
      meanings: ['행복한'],
      ipa: '/ˈhæpi/',
      examples: ['The happy child smiled.', 'I am happy today.'],
    }],
  },
]

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

function wrongQuizSummary(sourceItemId: string): QuizSessionSummary {
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
    heatmap: [{
      questionId: `question-${sourceItemId}`,
      sourceItemId,
      type: 'en-ko',
      isCorrect: false,
    }],
    wrongItemIds: [sourceItemId],
  }
}

function makeLargeQuizItems(count: number): StudyItem[] {
  return Array.from({ length: count }, (_, index) => {
    const term = `term-${index}`
    return {
      ...SEED_ITEMS[0]!,
      id: `word-large-${index}`,
      term,
      lemma: term,
      forms: [term],
      meanings: [`meaning-${index}`],
      examples: [`The ${term} appears here.`],
    }
  })
}

function trackingStats(
  overrides: Partial<QuizTypeTrackingStats> = {},
): QuizTypeTrackingStats {
  return {
    attempts: 0,
    correct: 0,
    totalAnswerTimeMs: 0,
    averageAnswerTimeMs: 0,
    reexposureAttempts: 0,
    reexposureCorrect: 0,
    wrongRunTransitions: 0,
    adjustmentTotal: 0,
    ...overrides,
  }
}

describe('generateQuiz', () => {
  it.each(QUIZ_TYPES)('creates a %s question with an answer and source', (type) => {
    const [question] = generateQuiz(SEED_ITEMS, type, {
      count: 1,
      random: seededRandom(3),
    })

    expect(question).toMatchObject({ type })
    expect(question?.correctAnswer).not.toBe('')
    expect(question?.sourceItemId).toBeTruthy()
  })

  it.each(['en-ko', 'ko-en', 'sentence-meaning', 'sentence-blank'] as const)(
    'creates four unique shuffled options for %s',
    (type) => {
      const [question] = generateQuiz(SEED_ITEMS, type, {
        count: 1,
        random: seededRandom(4),
      })

      expect(question?.inputMode).toBe('choice')
      if (question?.inputMode !== 'choice') throw new Error('Expected a choice question')

      expect(question.options).toHaveLength(4)
      expect(new Set(question.options.map(normalizeAnswer)).size).toBe(4)
      expect(question.options.map(normalizeAnswer)).toContain(
        normalizeAnswer(question.correctAnswer),
      )
    },
  )

  it('excludes synonymous English answers from ko-en distractors', () => {
    const synonym = {
      ...SEED_ITEMS[0]!,
      id: 'word-frolic',
      term: 'frolic',
      lemma: 'frolic',
      forms: ['frolic', 'frolics', 'frolicked', 'frolicking'],
      meanings: ['놀다'],
      examples: ['Children frolic outside.'],
    }
    const sources = [...SEED_ITEMS, synonym]
    const questions = generateQuiz(sources, 'ko-en', {
      count: sources.length,
      random: seededRandom(12),
    })
    const playQuestion = questions.find(({ sourceItemId }) => sourceItemId === 'word-play')
    const frolicQuestion = questions.find(({ sourceItemId }) => sourceItemId === 'word-frolic')

    if (playQuestion?.inputMode !== 'choice' || frolicQuestion?.inputMode !== 'choice') {
      throw new Error('Expected ko-en choice questions')
    }
    expect(playQuestion.options).toHaveLength(4)
    expect(frolicQuestion.options).toHaveLength(4)
    expect(playQuestion.options.map(normalizeAnswer)).not.toContain('frolic')
    expect(frolicQuestion.options.map(normalizeAnswer)).not.toContain('play')
  })

  it('excludes an English distractor whose secondary meaning matches the ko-en prompt', () => {
    const secondarySynonym: StudyItem = {
      ...SEED_ITEMS[0]!,
      id: 'word-frolic',
      term: 'frolic',
      lemma: 'frolic',
      forms: ['frolic', 'frolics', 'frolicked', 'frolicking'],
      meanings: ['장난치다', '놀다'],
      examples: ['Children frolic outside.'],
    }
    const questions = generateQuiz([...SEED_ITEMS, secondarySynonym], 'ko-en', {
      count: 1,
      sourceIds: new Set(['word-play']),
      random: seededRandom(31),
    })
    const [playQuestion] = questions

    if (playQuestion?.inputMode !== 'choice') {
      throw new Error('Expected a ko-en choice question')
    }
    expect(playQuestion.options.map(normalizeAnswer)).not.toContain('frolic')
  })

  it.each(['en-ko', 'sentence-meaning'] as const)(
    'excludes every accepted source meaning from %s distractors',
    (type) => {
      const aspect: StudyItem = {
        ...SEED_ITEMS[0]!,
        id: 'word-aspect',
        term: 'aspect',
        lemma: 'aspect',
        forms: ['aspect', 'aspects'],
        meanings: ['국면', '방향'],
        examples: ['We study this aspect carefully.'],
      }
      const direction: StudyItem = {
        ...SEED_ITEMS[2]!,
        id: 'word-direction',
        term: 'direction',
        lemma: 'direction',
        forms: ['direction', 'directions'],
        meanings: ['방향'],
        examples: ['This direction is clear.'],
      }
      const questions = generateQuiz([...SEED_ITEMS, aspect, direction], type, {
        count: 1,
        sourceIds: new Set(['word-aspect']),
        random: seededRandom(32),
      })
      const [aspectQuestion] = questions

      if (aspectQuestion?.inputMode !== 'choice') {
        throw new Error(`Expected a ${type} choice question`)
      }
      expect(aspectQuestion.options.map(normalizeAnswer)).not.toContain('방향')
    },
  )

  it('throws when a ko-en question has fewer than three unambiguous distractors', () => {
    const synonym = {
      ...SEED_ITEMS[0]!,
      id: 'word-frolic',
      term: 'frolic',
      lemma: 'frolic',
      forms: ['frolic'],
      meanings: ['놀다'],
    }
    const ambiguousPool = [SEED_ITEMS[0]!, synonym, SEED_ITEMS[2]!, SEED_ITEMS[3]!]

    expect(() =>
      generateQuiz(ambiguousPool, 'ko-en', {
        count: ambiguousPool.length,
        random: seededRandom(13),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'QUIZ_POOL_TOO_SMALL',
        quizType: 'ko-en',
        requestedCount: ambiguousPool.length,
        availableQuestionCount: ambiguousPool.length,
        availableOptionCount: 3,
      }),
    )
  })

  it.each(['dictation', 'sentence-transform'] as const)(
    'creates a text-entry question without options for %s',
    (type) => {
      const [question] = generateQuiz(SEED_ITEMS, type, {
        count: 1,
        random: seededRandom(5),
      })

      expect(question?.inputMode).toBe('text')
      expect(question).not.toHaveProperty('options')
    },
  )

  it('uses the exact spoken term for dictation', () => {
    const questions = generateQuiz(SEED_ITEMS, 'dictation', {
      count: SEED_ITEMS.length,
      random: seededRandom(6),
    })

    for (const question of questions) {
      if (question.inputMode !== 'text') throw new Error('Expected text input')
      const source = SEED_ITEMS.find(({ id }) => id === question.sourceItemId)!
      expect(question.speechText).toBe(source.term)
      expect(question.correctAnswer).toBe(source.term)
    }
  })

  it.each(['sentence-meaning', 'sentence-blank', 'sentence-transform'] as const)(
    'matches whole surface forms and skips a term embedded in playground for %s',
    (type) => {
      const questions = generateQuiz(SEED_ITEMS, type, {
        count: SEED_ITEMS.length,
        random: seededRandom(7),
      })
      const playQuestion = questions.find(({ sourceItemId }) => sourceItemId === 'word-play')

      expect(playQuestion?.sentence).toEqual({
        before: 'They ',
        target: 'played',
        after: ' outside yesterday.',
      })
      if (type !== 'sentence-meaning') {
        expect(playQuestion?.correctAnswer).toBe('played')
      }
    },
  )

  it('supports a multi-word phrasal verb as one sentence target', () => {
    const questions = generateQuiz(SEED_ITEMS, 'sentence-blank', {
      count: SEED_ITEMS.length,
      random: seededRandom(8),
    })

    expect(
      questions.find(({ sourceItemId }) => sourceItemId === 'phrasal-wake-up')?.sentence,
    ).toMatchObject({ target: 'wake up' })
  })

  it.each([
    ['wake up', 'woke up', 'Mina woke up before her alarm.'],
    ['pick up', 'picked up', 'Leo picked up the blue notebook.'],
  ] as const)(
    'recognizes the verified contiguous inflection %s -> %s',
    (term, target, example) => {
      const phrasal: StudyItem = {
        ...SEED_ITEMS[1]!,
        id: `phrasal-${term.replace(' ', '-')}`,
        term,
        lemma: term,
        forms: [term],
        examples: [example],
      }
      const [question] = generateQuiz([phrasal], 'sentence-transform', { count: 1 })

      expect(question?.sentence).toEqual({
        before: example.slice(0, example.indexOf(target)),
        target,
        after: example.slice(example.indexOf(target) + target.length),
      })
      expect(question?.correctAnswer).toBe(target)
    },
  )

  it.each([
    ['wake up', 'This was a wake up call for everyone.'],
    ['look at', 'The book at home is new.'],
  ] as const)(
    'does not guess a phrasal target from the noun/preposition sequence in %s',
    (term, example) => {
      const phrasal: StudyItem = {
        ...SEED_ITEMS[1]!,
        id: `phrasal-invalid-${term.replace(' ', '-')}`,
        term,
        lemma: term,
        forms: [term],
        examples: [example],
      }

      expect(() =>
        generateQuiz([phrasal], 'sentence-transform', { count: 1 }),
      ).toThrowError(
        expect.objectContaining({
          code: 'QUIZ_POOL_TOO_SMALL',
          availableQuestionCount: 0,
        }),
      )
    },
  )

  it('keeps a valid phrasal target after an object pronoun', () => {
    const phrasal: StudyItem = {
      ...SEED_ITEMS[1]!,
      examples: ['Her parents watched her wake up slowly.'],
    }

    const [question] = generateQuiz([phrasal], 'sentence-transform', { count: 1 })

    expect(question?.sentence?.target).toBe('wake up')
  })

  it('replaces only the sentence target when rendering a blank prompt', () => {
    const questions = generateQuiz(SEED_ITEMS, 'sentence-blank', {
      count: SEED_ITEMS.length,
      random: seededRandom(8),
    })

    expect(questions.find(({ sourceItemId }) => sourceItemId === 'word-play')?.prompt).toBe(
      'They _____ outside yesterday.',
    )
  })

  it('includes a meaning hint in sentence-transform prompts', () => {
    const questions = generateQuiz(SEED_ITEMS, 'sentence-transform', {
      count: SEED_ITEMS.length,
      random: seededRandom(8),
    })

    expect(
      questions.find(({ sourceItemId }) => sourceItemId === 'word-play')?.prompt,
    ).toContain('놀다')
  })

  it('selects source items without replacement and is reproducible', () => {
    const first = generateQuiz(SEED_ITEMS, 'en-ko', {
      count: 4,
      random: seededRandom(9),
    })
    const second = generateQuiz(SEED_ITEMS, 'en-ko', {
      count: 4,
      random: seededRandom(9),
    })

    expect(new Set(first.map(({ sourceItemId }) => sourceItemId)).size).toBe(4)
    expect(second).toEqual(first)
  })

  it('rejects a review request when spacing removes every selected source', () => {
    expect(() => generateQuiz(SEED_ITEMS, 'en-ko', {
      count: 1,
      sourceIds: new Set(['word-play']),
      sampling: {
        selectedDifficulty: 'normal',
        mistakes: {
          'word-play': {
            wrongCount: 1,
            wrongStreak: 1,
            priorityRemaining: 0,
            reviewPending: true,
            reviewSpacingRemaining: 1,
          },
        },
      },
      random: seededRandom(33),
    })).toThrowError(
      expect.objectContaining({
        code: 'QUIZ_POOL_TOO_SMALL',
        requestedCount: 1,
        availableQuestionCount: 0,
      }),
    )
  })

  it('samples only the requested question prefix from a large source pool', () => {
    const random = vi.fn(() => 0.5)
    const questions = generateQuiz(makeLargeQuizItems(5_000), 'dictation', {
      count: 5,
      random,
    })

    expect(questions).toHaveLength(5)
    expect(new Set(questions.map(({ sourceItemId }) => sourceItemId)).size).toBe(5)
    expect(random).toHaveBeenCalledTimes(5)
  })

  it('samples only three distractors from a large answer pool', () => {
    const items = makeLargeQuizItems(5_000)
    const random = vi.fn(() => 0.5)
    const [question] = generateQuiz(items, 'en-ko', {
      count: 1,
      sourceIds: new Set([items[0]!.id]),
      random,
    })

    expect(question?.inputMode).toBe('choice')
    if (question?.inputMode !== 'choice') throw new Error('Expected a choice question')
    expect(question.options).toHaveLength(4)
    expect(new Set(question.options.map(normalizeAnswer)).size).toBe(4)
    expect(random).toHaveBeenCalledTimes(6)
  })

  it('limits question sources while keeping the full pool for distractors', () => {
    const [question] = generateQuiz(SEED_ITEMS, 'en-ko', {
      count: 1,
      sourceIds: new Set(['word-play']),
      random: seededRandom(12),
    })

    expect(question?.sourceItemId).toBe('word-play')
    expect(question?.inputMode).toBe('choice')
    if (question?.inputMode !== 'choice') throw new Error('Expected choice question')
    expect(question.options).toHaveLength(4)
    expect(new Set(question.options.map(normalizeAnswer)).size).toBe(4)
  })

  it('puts an unresolved consecutive mistake inside the three-question priority window', () => {
    const questions = generateQuiz(SEED_ITEMS, 'en-ko', {
      count: 3,
      random: () => 0.5,
      sampling: {
        selectedDifficulty: 'normal',
        mistakes: {
          'word-run': {
            wrongCount: 2,
            wrongStreak: 2,
            priorityRemaining: 3,
          },
        },
        difficultyStats: {},
      },
    })

    expect(questions[0]?.sourceItemId).toBe('word-run')
    expect(new Set(questions.map(({ sourceItemId }) => sourceItemId)).size).toBe(3)
  })

  it('forwards recent quiz history when ordering pending review sources', () => {
    const [question] = generateQuiz(SEED_ITEMS, 'en-ko', {
      count: 1,
      random: () => 0.5,
      sampling: {
        selectedDifficulty: 'normal',
        mistakes: {
          'word-play': {
            wrongCount: 1,
            wrongStreak: 1,
            priorityRemaining: 0,
            reviewPending: true,
            reviewSpacingRemaining: 0,
          },
          'word-run': {
            wrongCount: 1,
            wrongStreak: 1,
            priorityRemaining: 0,
            reviewPending: true,
            reviewSpacingRemaining: 0,
          },
        },
        quizHistory: [wrongQuizSummary('word-play')],
      },
    })

    expect(question?.sourceItemId).toBe('word-play')
  })

  it('uses low-accuracy difficulty statistics when sampling valid sources', () => {
    const hardItem: StudyItem = {
      ...SEED_ITEMS[5]!,
      id: 'word-challenge',
      term: 'challenge',
      lemma: 'challenge',
      difficulty: 'hard',
      forms: ['challenge'],
      meanings: ['도전'],
      examples: ['This challenge is useful.'],
    }
    const items = [...SEED_ITEMS, hardItem]
    const sourceIds = new Set(['word-apple', hardItem.id])
    const sequence = () => {
      const values = [0.5, 0.7]
      return () => values.shift() ?? 0
    }

    const withoutBoost = generateQuiz(items, 'en-ko', {
      count: 1,
      sourceIds,
      random: sequence(),
      sampling: {
        selectedDifficulty: 'normal',
        mistakes: {},
        difficultyStats: {},
      },
    })
    const withBoost = generateQuiz(items, 'en-ko', {
      count: 1,
      sourceIds,
      random: sequence(),
      sampling: {
        selectedDifficulty: 'normal',
        mistakes: {},
        difficultyStats: {
          hard: { attempts: 10, correct: 5 },
        },
      },
    })

    expect(withoutBoost[0]?.sourceItemId).toBe('word-apple')
    expect(withBoost[0]?.sourceItemId).toBe(hardItem.id)
  })

  it('combines current-type accuracy and recorded adjustment into a bounded audit', () => {
    const audit = auditQuizDifficultyCalibration('normal', trackingStats({
      attempts: 10,
      correct: 9,
      adjustmentTotal: 5,
    }))

    expect(audit).toEqual({
      selectedDifficulty: 'normal',
      accuracy: 0.9,
      accuracyShift: 1,
      recordedAdjustment: 0.5,
      totalShift: 1.5,
      effectiveDifficultyPosition: 3.5,
    })
    expect(auditQuizDifficultyCalibration('normal', trackingStats({
      attempts: 10,
      correct: 0,
      adjustmentTotal: -100,
    }))).toMatchObject({
      accuracyShift: -1,
      recordedAdjustment: -1,
      totalShift: -2,
      effectiveDifficultyPosition: 0,
    })
  })

  it('uses cumulative accuracy for the current quiz type to recalibrate difficulty mix', () => {
    const easyItem = SEED_ITEMS[2]!
    const hardItem: StudyItem = {
      ...SEED_ITEMS[5]!,
      id: 'word-challenge-calibrated',
      term: 'challenge',
      lemma: 'challenge',
      difficulty: 'hard',
      forms: ['challenge'],
      meanings: ['도전'],
      examples: ['This challenge is useful.'],
    }
    const items = [...SEED_ITEMS, hardItem]
    const sourceIds = new Set([easyItem.id, hardItem.id])
    const sequence = () => {
      const values = [0.5, 0.6]
      return () => values.shift() ?? 0
    }
    const baseline = generateQuiz(items, 'en-ko', {
      count: 1,
      sourceIds,
      random: sequence(),
      sampling: { selectedDifficulty: 'normal' },
    })
    const calibrated = generateQuiz(items, 'en-ko', {
      count: 1,
      sourceIds,
      random: sequence(),
      sampling: {
        selectedDifficulty: 'normal',
        quizTypeStats: {
          'en-ko': trackingStats({ attempts: 10, correct: 9 }),
        },
      },
    })

    expect(baseline[0]?.sourceItemId).toBe(easyItem.id)
    expect(calibrated[0]?.sourceItemId).toBe(hardItem.id)
  })

  it('forwards schedule, mastery, and grammar-review rules into quiz source sampling', () => {
    const sourceIds = new Set(['word-apple', 'word-run'])
    const now = 10 * 24 * 60 * 60 * 1_000
    const [question] = generateQuiz(SEED_ITEMS, 'en-ko', {
      count: 1,
      sourceIds,
      random: () => 0.5,
      sampling: {
        selectedDifficulty: 'normal',
        now,
        itemSchedule: {
          'word-apple': {
            kind: 'word',
            level: '기초',
            ease: 3,
            lastSeenAt: now,
            nextDueAt: now + 7 * 24 * 60 * 60 * 1_000,
            weight: 0,
            lastLevel: '기초',
          },
          'word-run': {
            kind: 'word',
            level: '기초',
            ease: 1.3,
            lastSeenAt: now - 7 * 24 * 60 * 60 * 1_000,
            nextDueAt: now - 24 * 60 * 60 * 1_000,
            weight: 1,
            lastLevel: '기초',
          },
        },
        mastery: {
          'word-apple': {
            attempts: 10,
            correct: 10,
            wrong: 0,
            correctStreak: 5,
            wrongStreak: 0,
          },
          'word-run': {
            attempts: 5,
            correct: 1,
            wrong: 4,
            correctStreak: 0,
            wrongStreak: 1,
          },
        },
        grammarReviewItemIds: new Set(['word-run']),
      },
    })

    expect(question?.sourceItemId).toBe('word-run')
  })

  it('ignores malformed cumulative type statistics without producing invalid weights', () => {
    const expectedNeutral = {
      selectedDifficulty: 'normal',
      accuracy: null,
      accuracyShift: 0,
      recordedAdjustment: 0,
      totalShift: 0,
      effectiveDifficultyPosition: 2,
    }

    expect(auditQuizDifficultyCalibration('normal', trackingStats({
      attempts: Number.POSITIVE_INFINITY,
      correct: Number.NaN,
      adjustmentTotal: Number.POSITIVE_INFINITY,
    }))).toEqual(expectedNeutral)
    expect(auditQuizDifficultyCalibration('normal', trackingStats({
      attempts: 10,
      correct: Number.NaN,
      adjustmentTotal: Number.NaN,
    }))).toEqual(expectedNeutral)
  })

  it.each([
    ['en-ko', ['play', '놀다', 'verb']],
    ['ko-en', ['놀다', 'play', 'verb']],
    ['sentence-meaning', ['played', 'play', '놀다']],
    ['sentence-blank', ['played', 'play', '놀다']],
    ['dictation', ['play', '/pleɪ/']],
    ['sentence-transform', ['played', 'play', '놀다']],
  ] as const)('%s 해설에 유형별 근거를 포함한다', (type, fragments) => {
    const [question] = generateQuiz(SEED_ITEMS, type, {
      count: 1,
      sourceIds: new Set(['word-play']),
      random: seededRandom(21),
    })

    for (const fragment of fragments) {
      expect(question?.explanation).toContain(fragment)
    }
  })

  it('reports an empty question pool when every constrained source ID is stale', () => {
    expect(() =>
      generateQuiz(SEED_ITEMS, 'dictation', {
        count: 1,
        sourceIds: new Set(['missing-id']),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'QUIZ_POOL_TOO_SMALL',
        availableQuestionCount: 0,
      }),
    )
  })

  it('treats repeated item IDs as one source candidate', () => {
    const repeatedSource = [...SEED_ITEMS, structuredClone(SEED_ITEMS[0]!)]

    expect(() =>
      generateQuiz(repeatedSource, 'en-ko', {
        count: SEED_ITEMS.length + 1,
        random: seededRandom(9),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'QUIZ_POOL_TOO_SMALL',
        availableQuestionCount: SEED_ITEMS.length,
      }),
    )
  })

  it('throws a structured error when an objective pool has fewer than four items', () => {
    expect(() =>
      generateQuiz(SEED_ITEMS.slice(0, 3), 'en-ko', {
        count: 1,
        random: seededRandom(10),
      }),
    ).toThrow(QuizGenerationError)

    try {
      generateQuiz(SEED_ITEMS.slice(0, 3), 'en-ko', { count: 1 })
    } catch (error) {
      expect(error).toMatchObject({
        code: 'QUIZ_POOL_TOO_SMALL',
        quizType: 'en-ko',
        requestedCount: 1,
        availableOptionCount: 3,
      })
    }
  })

  it('never creates duplicate options when distinct meanings are insufficient', () => {
    const duplicateMeanings = SEED_ITEMS.slice(0, 4).map((item) => ({
      ...item,
      meanings: ['같은 뜻'],
    }))

    expect(() => generateQuiz(duplicateMeanings, 'en-ko', { count: 1 })).toThrowError(
      expect.objectContaining({ code: 'QUIZ_POOL_TOO_SMALL' }),
    )
  })

  it('reports how many valid sentence sources are available', () => {
    const invalid = {
      ...SEED_ITEMS[0]!,
      id: 'word-missing-surface',
      examples: ['Nothing useful appears here.'],
    }

    expect(() =>
      generateQuiz([SEED_ITEMS[1]!, invalid], 'sentence-transform', { count: 2 }),
    ).toThrowError(
      expect.objectContaining({
        code: 'QUIZ_POOL_TOO_SMALL',
        availableQuestionCount: 1,
      }),
    )
  })

  it('does not mutate the source array or items', () => {
    const snapshot = structuredClone(SEED_ITEMS)

    generateQuiz(SEED_ITEMS, 'ko-en', { count: 3, random: seededRandom(11) })

    expect(SEED_ITEMS).toEqual(snapshot)
  })
})
