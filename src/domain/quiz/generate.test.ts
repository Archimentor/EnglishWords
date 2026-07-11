import type { StudyItem } from '../content/types'
import { generateQuiz, QuizGenerationError } from './generate'
import { normalizeAnswer } from './grade'
import { QUIZ_TYPES } from './types'

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
  },
]

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 4_294_967_296
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
