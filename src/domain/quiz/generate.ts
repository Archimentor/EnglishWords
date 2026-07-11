import type { StudyItem } from '../content/types'
import { normalizeAnswer } from './grade'
import type {
  ChoiceQuizQuestion,
  ChoiceQuizType,
  QuizQuestion,
  QuizType,
  SentenceTarget,
  TextQuizQuestion,
} from './types'

export const QUIZ_POOL_TOO_SMALL = 'QUIZ_POOL_TOO_SMALL' as const

interface QuizGenerationErrorDetails {
  quizType: QuizType
  requestedCount: number
  availableQuestionCount?: number
  availableOptionCount?: number
}

export class QuizGenerationError extends Error {
  readonly code = QUIZ_POOL_TOO_SMALL
  readonly quizType: QuizType
  readonly requestedCount: number
  readonly availableQuestionCount?: number
  readonly availableOptionCount?: number

  constructor(details: QuizGenerationErrorDetails) {
    super(`Not enough content to generate ${details.quizType} quiz questions.`)
    this.name = 'QuizGenerationError'
    this.quizType = details.quizType
    this.requestedCount = details.requestedCount
    if (details.availableQuestionCount !== undefined) {
      this.availableQuestionCount = details.availableQuestionCount
    }
    if (details.availableOptionCount !== undefined) {
      this.availableOptionCount = details.availableOptionCount
    }
  }
}

export interface GenerateQuizOptions {
  count?: number
  random?: () => number
}

interface QuestionSource {
  item: StudyItem
  answer: string
  sentence?: SentenceTarget
}

const CHOICE_TYPES = new Set<QuizType>([
  'en-ko',
  'ko-en',
  'sentence-meaning',
  'sentence-blank',
])

function isChoiceType(type: QuizType): type is ChoiceQuizType {
  return CHOICE_TYPES.has(type)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function findSentenceTarget(item: StudyItem): SentenceTarget | undefined {
  const surfaceForms = [...new Set([item.term, ...item.forms].filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  )

  for (const example of item.examples) {
    for (const form of surfaceForms) {
      const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}'’–-])${escapeRegExp(form)}(?![\\p{L}\\p{N}'’–-])`,
        'iu',
      )
      const match = pattern.exec(example)
      if (match?.index !== undefined) {
        return {
          before: example.slice(0, match.index),
          target: match[0],
          after: example.slice(match.index + match[0].length),
        }
      }
    }
  }

  return undefined
}

function makeSource(item: StudyItem, type: QuizType): QuestionSource | undefined {
  if (type === 'en-ko' || type === 'sentence-meaning') {
    const answer = item.meanings[0]
    if (!answer) return undefined
    if (type === 'en-ko') return { item, answer }

    const sentence = findSentenceTarget(item)
    return sentence ? { item, answer, sentence } : undefined
  }

  if (type === 'ko-en' || type === 'dictation') {
    return item.term ? { item, answer: item.term } : undefined
  }

  const sentence = findSentenceTarget(item)
  return sentence ? { item, answer: sentence.target, sentence } : undefined
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = result[index]
    result[index] = result[swapIndex] as T
    result[swapIndex] = current as T
  }
  return result
}

function uniqueAnswers(sources: readonly QuestionSource[]): string[] {
  const answers = new Map<string, string>()
  for (const source of sources) {
    const key = normalizeAnswer(source.answer)
    if (key && !answers.has(key)) answers.set(key, source.answer)
  }
  return [...answers.values()]
}

function uniqueSources(sources: readonly QuestionSource[]): QuestionSource[] {
  const sourcesById = new Map<string, QuestionSource>()
  for (const source of sources) {
    if (!sourcesById.has(source.item.id)) sourcesById.set(source.item.id, source)
  }
  return [...sourcesById.values()]
}

function optionPoolForSource(
  source: QuestionSource,
  type: ChoiceQuizType,
  sources: readonly QuestionSource[],
  sharedPool: readonly string[],
): string[] {
  if (type !== 'ko-en') return [...sharedPool]

  const promptKey = normalizeAnswer(source.item.meanings[0] ?? '')
  return uniqueAnswers(
    sources.filter(
      (candidate) =>
        candidate.item.id === source.item.id ||
        normalizeAnswer(candidate.item.meanings[0] ?? '') !== promptKey,
    ),
  )
}

function sentenceText(sentence: SentenceTarget): string {
  return `${sentence.before}${sentence.target}${sentence.after}`
}

function blankSentence(sentence: SentenceTarget): string {
  return `${sentence.before}_____${sentence.after}`
}

function explanationFor(item: StudyItem): string {
  return `${item.term}: ${item.meanings.join(', ')}`
}

function makeOptions(
  correctAnswer: string,
  answerPool: readonly string[],
  random: () => number,
): string[] {
  const correctKey = normalizeAnswer(correctAnswer)
  const distractors = answerPool.filter((answer) => normalizeAnswer(answer) !== correctKey)
  return shuffled([correctAnswer, ...shuffled(distractors, random).slice(0, 3)], random)
}

function makeChoiceQuestion(
  source: QuestionSource,
  type: ChoiceQuizType,
  index: number,
  answerPool: readonly string[],
  random: () => number,
): ChoiceQuizQuestion {
  const { item, answer, sentence } = source
  const base = {
    id: `quiz-${type}-${index}-${item.id}`,
    type,
    inputMode: 'choice' as const,
    sourceItemId: item.id,
    correctAnswer: answer,
    explanation: explanationFor(item),
    options: makeOptions(answer, answerPool, random),
  }

  if (type === 'en-ko') {
    return { ...base, prompt: item.term }
  }
  if (type === 'ko-en') {
    return { ...base, prompt: item.meanings[0] ?? '' }
  }
  if (!sentence) throw new Error('Sentence question is missing its target.')
  if (type === 'sentence-meaning') {
    return { ...base, prompt: sentenceText(sentence), sentence }
  }
  return { ...base, prompt: blankSentence(sentence), sentence }
}

function makeTextQuestion(
  source: QuestionSource,
  type: 'dictation' | 'sentence-transform',
  index: number,
): TextQuizQuestion {
  const { item, answer, sentence } = source
  const base = {
    id: `quiz-${type}-${index}-${item.id}`,
    type,
    inputMode: 'text' as const,
    sourceItemId: item.id,
    correctAnswer: answer,
    explanation: explanationFor(item),
  }

  if (type === 'dictation') {
    return {
      ...base,
      prompt: '들은 단어를 입력하세요.',
      speechText: item.term,
    }
  }

  if (!sentence) throw new Error('Sentence question is missing its target.')
  return {
    ...base,
    prompt: `${blankSentence(sentence)} (뜻: ${item.meanings.join(', ')})`,
    sentence,
  }
}

export function generateQuiz(
  items: readonly StudyItem[],
  type: QuizType,
  options: GenerateQuizOptions = {},
): QuizQuestion[] {
  const count = options.count ?? 10
  const random = options.random ?? Math.random
  const sources = uniqueSources(
    items
      .map((item) => makeSource(item, type))
      .filter((source): source is QuestionSource => source !== undefined),
  )

  if (count < 0 || !Number.isInteger(count) || sources.length < count) {
    throw new QuizGenerationError({
      quizType: type,
      requestedCount: count,
      availableQuestionCount: sources.length,
    })
  }

  const answerPool = uniqueAnswers(sources)
  if (isChoiceType(type) && answerPool.length < 4) {
    throw new QuizGenerationError({
      quizType: type,
      requestedCount: count,
      availableQuestionCount: sources.length,
      availableOptionCount: answerPool.length,
    })
  }

  const selectedSources = shuffled(sources, random).slice(0, count)
  if (!isChoiceType(type)) {
    return selectedSources.map((source, index) => makeTextQuestion(source, type, index))
  }

  const optionPools = selectedSources.map((source) =>
    optionPoolForSource(source, type, sources, answerPool),
  )
  const insufficientPool = optionPools.find((pool) => pool.length < 4)
  if (insufficientPool) {
    throw new QuizGenerationError({
      quizType: type,
      requestedCount: count,
      availableQuestionCount: sources.length,
      availableOptionCount: insufficientPool.length,
    })
  }

  return selectedSources.map((source, index) => {
    const optionPool = optionPools[index]
    if (!optionPool) throw new Error('Question option pool is missing.')
    return makeChoiceQuestion(source, type, index, optionPool, random)
  })
}
