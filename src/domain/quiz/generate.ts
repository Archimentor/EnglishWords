import {
  DIFFICULTIES,
  type Difficulty,
  type StudyItem,
} from '../content/types'
import type {
  ItemScheduleRecord,
  QuizTypeTrackingStats,
} from '../progress/tracking'
import type {
  DifficultyStats,
  MistakeRecord,
  WordMastery,
} from '../progress/types'
import { buildStudyQueue } from '../scheduler/queue'
import {
  DIFFICULTY_MATRIX,
  type DifficultyMatrix,
} from '../scheduler/difficulty'
import { normalizeAnswer } from './grade'
import type {
  ChoiceQuizQuestion,
  ChoiceQuizType,
  QuizQuestion,
  QuizType,
  SentenceTarget,
  TextQuizQuestion,
  QuizSessionSummary,
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
  sourceIds?: ReadonlySet<string>
  sampling?: QuizSamplingProfile
}

export interface QuizSamplingProfile {
  selectedDifficulty: Difficulty
  mistakes?: Readonly<Record<string, MistakeRecord>>
  difficultyStats?: Partial<Record<Difficulty, DifficultyStats>>
  quizHistory?: readonly QuizSessionSummary[]
  itemSchedule?: Readonly<Record<string, ItemScheduleRecord>>
  mastery?: Readonly<Record<string, WordMastery>>
  grammarReviewItemIds?: ReadonlySet<string>
  quizTypeStats?: Partial<Record<QuizType, QuizTypeTrackingStats>>
  now?: number
}

export interface QuizDifficultyCalibrationAudit {
  selectedDifficulty: Difficulty
  accuracy: number | null
  accuracyShift: number
  recordedAdjustment: number
  totalShift: number
  effectiveDifficultyPosition: number
}

interface QuestionSource {
  item: StudyItem
  answer: string
  sentence?: SentenceTarget
}

type VerbFormsByLemma = ReadonlyMap<string, readonly string[]>

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

const NOMINAL_PHRASAL_PREFIXES = new Set([
  'a',
  'an',
  'the',
  'my',
  'your',
  'his',
  'its',
  'our',
  'their',
])

const MIN_CALIBRATION_ATTEMPTS = 3
const LOW_TYPE_ACCURACY = 0.6
const HIGH_TYPE_ACCURACY = 0.85
const MAX_RECORDED_DIFFICULTY_ADJUSTMENT = 1
const MAX_TOTAL_DIFFICULTY_SHIFT = 2

function finiteClamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}

export function auditQuizDifficultyCalibration(
  selectedDifficulty: Difficulty,
  stats?: QuizTypeTrackingStats,
): QuizDifficultyCalibrationAudit {
  const attempts = Number.isFinite(stats?.attempts)
    ? Math.floor(finiteClamp(stats?.attempts ?? 0, 0, Number.MAX_SAFE_INTEGER))
    : 0
  const hasValidCorrect = Number.isFinite(stats?.correct)
  const correct = hasValidCorrect
    ? finiteClamp(stats?.correct ?? 0, 0, attempts)
    : 0
  const accuracy = attempts >= MIN_CALIBRATION_ATTEMPTS && hasValidCorrect
    ? correct / attempts
    : null
  const accuracyShift = accuracy === null
    ? 0
    : accuracy < LOW_TYPE_ACCURACY
      ? -1
      : accuracy > HIGH_TYPE_ACCURACY
        ? 1
        : 0
  const averageAdjustment = (stats?.adjustmentTotal ?? 0) / attempts
  const recordedAdjustment = attempts < MIN_CALIBRATION_ATTEMPTS
    || !Number.isFinite(averageAdjustment)
    ? 0
    : finiteClamp(
        averageAdjustment,
        -MAX_RECORDED_DIFFICULTY_ADJUSTMENT,
        MAX_RECORDED_DIFFICULTY_ADJUSTMENT,
      )
  const totalShift = finiteClamp(
    accuracyShift + recordedAdjustment,
    -MAX_TOTAL_DIFFICULTY_SHIFT,
    MAX_TOTAL_DIFFICULTY_SHIFT,
  )
  const selectedIndex = DIFFICULTIES.indexOf(selectedDifficulty)
  const effectiveDifficultyPosition = finiteClamp(
    selectedIndex + totalShift,
    0,
    DIFFICULTIES.length - 1,
  )

  return {
    selectedDifficulty,
    accuracy,
    accuracyShift,
    recordedAdjustment,
    totalShift,
    effectiveDifficultyPosition,
  }
}

function calibratedDifficultyMatrix(
  selectedDifficulty: Difficulty,
  stats?: QuizTypeTrackingStats,
): DifficultyMatrix {
  const { effectiveDifficultyPosition } = auditQuizDifficultyCalibration(
    selectedDifficulty,
    stats,
  )
  const lowerIndex = Math.floor(effectiveDifficultyPosition)
  const upperIndex = Math.ceil(effectiveDifficultyPosition)
  const fraction = effectiveDifficultyPosition - lowerIndex
  const lowerDifficulty = DIFFICULTIES[lowerIndex] ?? selectedDifficulty
  const upperDifficulty = DIFFICULTIES[upperIndex] ?? lowerDifficulty
  const lowerRow = DIFFICULTY_MATRIX[lowerDifficulty]
  const upperRow = DIFFICULTY_MATRIX[upperDifficulty]
  const calibratedRow = Object.fromEntries(DIFFICULTIES.map((difficulty) => [
    difficulty,
    lowerRow[difficulty] + (upperRow[difficulty] - lowerRow[difficulty]) * fraction,
  ])) as DifficultyMatrix[Difficulty]

  return {
    ...DIFFICULTY_MATRIX,
    [selectedDifficulty]: calibratedRow,
  }
}

// Irregular forms are deliberately explicit. The normalised phrasal-verb
// model currently retains only the base expression, so forms confirmed by
// audited content must not be inferred from an arbitrary neighbouring word.
const VERIFIED_IRREGULAR_PHRASAL_BASE_FORMS: Readonly<Record<string, readonly string[]>> = {
  wake: ['woke', 'woken'],
}

function regularVerbForms(base: string): string[] {
  if (!/^[a-z]+$/iu.test(base)) return []

  const lower = base.toLocaleLowerCase()
  const consonantY = /[^aeiou]y$/u.test(lower)
  const thirdPerson = consonantY
    ? `${lower.slice(0, -1)}ies`
    : /(s|x|z|ch|sh|o)$/u.test(lower)
      ? `${lower}es`
      : `${lower}s`
  const past = consonantY
    ? `${lower.slice(0, -1)}ied`
    : lower.endsWith('e')
      ? `${lower}d`
      : `${lower}ed`
  const presentParticiple = lower.endsWith('ie')
    ? `${lower.slice(0, -2)}ying`
    : lower.endsWith('e') && !lower.endsWith('ee')
      ? `${lower.slice(0, -1)}ing`
      : `${lower}ing`

  return [lower, thirdPerson, past, presentParticiple]
}

function collectVerbForms(items: readonly StudyItem[]): VerbFormsByLemma {
  const formsByLemma = new Map<string, Set<string>>()

  for (const item of items) {
    if (item.kind !== 'word' || !item.partsOfSpeech.includes('verb')) continue
    const lemma = item.lemma.trim().toLocaleLowerCase()
    if (!lemma) continue
    const forms = formsByLemma.get(lemma) ?? new Set<string>()
    for (const form of [item.term, ...item.forms]) {
      const normalized = form.trim().toLocaleLowerCase()
      if (/^[a-z]+$/iu.test(normalized)) forms.add(normalized)
    }
    formsByLemma.set(lemma, forms)
  }

  return new Map(
    [...formsByLemma].map(([lemma, forms]) => [lemma, [...forms]]),
  )
}

function surfaceFormsFor(
  item: StudyItem,
  verbFormsByLemma: VerbFormsByLemma,
): string[] {
  const forms = new Set([item.term, ...item.forms].map((form) => form.trim()).filter(Boolean))
  if (item.kind !== 'phrasalVerb') {
    return [...forms].sort((left, right) => right.length - left.length)
  }

  const [base, ...particles] = item.term.trim().split(/\s+/u)
  if (!base || particles.length === 0 || !/^[a-z]+$/iu.test(base)) {
    return [...forms].sort((left, right) => right.length - left.length)
  }

  const lowerBase = base.toLocaleLowerCase()
  const baseForms = new Set([
    ...regularVerbForms(lowerBase),
    ...(verbFormsByLemma.get(lowerBase) ?? []),
    ...(VERIFIED_IRREGULAR_PHRASAL_BASE_FORMS[lowerBase] ?? []),
  ])
  const suffix = particles.join(' ')
  for (const baseForm of baseForms) forms.add(`${baseForm} ${suffix}`)

  return [...forms].sort((left, right) => right.length - left.length)
}

function hasNominalPhrasalPrefix(example: string, matchIndex: number): boolean {
  const precedingText = example.slice(0, matchIndex)
  const previousWord = precedingText.match(/[\p{L}\p{N}'’–-]+(?=\s*$)/u)?.[0]
  return previousWord
    ? NOMINAL_PHRASAL_PREFIXES.has(previousWord.toLocaleLowerCase())
    : false
}

function findSentenceTarget(
  item: StudyItem,
  verbFormsByLemma: VerbFormsByLemma,
): SentenceTarget | undefined {
  const surfaceForms = surfaceFormsFor(item, verbFormsByLemma)

  for (const example of item.examples) {
    for (const form of surfaceForms) {
      const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}'’–-])${escapeRegExp(form)}(?![\\p{L}\\p{N}'’–-])`,
        'iu',
      )
      const match = pattern.exec(example)
      if (match?.index !== undefined) {
        if (item.kind === 'phrasalVerb' && hasNominalPhrasalPrefix(example, match.index)) {
          continue
        }
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

function makeSource(
  item: StudyItem,
  type: QuizType,
  verbFormsByLemma: VerbFormsByLemma,
): QuestionSource | undefined {
  if (type === 'en-ko' || type === 'sentence-meaning') {
    const answer = item.meanings[0]
    if (!answer) return undefined
    if (type === 'en-ko') return { item, answer }

    const sentence = findSentenceTarget(item, verbFormsByLemma)
    return sentence ? { item, answer, sentence } : undefined
  }

  if (type === 'ko-en' || type === 'dictation') {
    return item.term ? { item, answer: item.term } : undefined
  }

  const sentence = findSentenceTarget(item, verbFormsByLemma)
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

function sampled<T>(
  values: readonly T[],
  count: number,
  random: () => number,
): T[] {
  const sampleSize = Math.min(count, values.length)
  const shuffleCount = Math.min(sampleSize, Math.max(0, values.length - 1))
  const swaps = new Map<number, number>()
  const result: T[] = []

  // A partial Fisher-Yates shuffle keeps the same uniform, without-replacement
  // semantics while materializing and randomizing only the requested prefix.
  for (let index = 0; index < shuffleCount; index += 1) {
    const swapIndex = index + Math.floor(random() * (values.length - index))
    const selectedIndex = swaps.get(swapIndex) ?? swapIndex
    const currentIndex = swaps.get(index) ?? index
    result.push(values[selectedIndex]!)
    swaps.delete(index)
    if (swapIndex !== index) swaps.set(swapIndex, currentIndex)
  }

  // Selecting the complete input leaves one deterministic final value after
  // the last random swap, just like a full Fisher-Yates shuffle.
  if (result.length < sampleSize) {
    const finalIndex = swaps.get(result.length) ?? result.length
    result.push(values[finalIndex]!)
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
  if (type === 'en-ko' || type === 'sentence-meaning') {
    const correctKey = normalizeAnswer(source.answer)
    const acceptedMeaningKeys = new Set(
      source.item.meanings.map(normalizeAnswer).filter(Boolean),
    )
    return sharedPool.filter((answer) => {
      const answerKey = normalizeAnswer(answer)
      return answerKey === correctKey || !acceptedMeaningKeys.has(answerKey)
    })
  }

  if (type !== 'ko-en') return [...sharedPool]

  const promptKey = normalizeAnswer(source.item.meanings[0] ?? '')
  return uniqueAnswers(
    sources.filter(
      (candidate) =>
        candidate.item.id === source.item.id ||
        candidate.item.meanings.every(
          (meaning) => normalizeAnswer(meaning) !== promptKey,
        ),
    ),
  )
}

function sentenceText(sentence: SentenceTarget): string {
  return `${sentence.before}${sentence.target}${sentence.after}`
}

function blankSentence(sentence: SentenceTarget): string {
  return `${sentence.before}_____${sentence.after}`
}

function explanationFor(source: QuestionSource, type: QuizType): string {
  const { item, sentence } = source
  const meanings = item.meanings.join(', ')
  const partsOfSpeech = item.partsOfSpeech.join(', ')

  if (type === 'en-ko') {
    return `"${item.term}"은 ${partsOfSpeech}이며 뜻은 ${meanings}입니다.`
  }
  if (type === 'ko-en') {
    return `"${meanings}"에 해당하는 영어 표현은 "${item.term}"이며 품사는 ${partsOfSpeech}입니다.`
  }
  if (type === 'sentence-meaning') {
    return `문장 속 "${sentence?.target ?? item.term}"은 기본형 "${item.term}"의 형태이며 ${meanings}라는 뜻입니다.`
  }
  if (type === 'sentence-blank') {
    return `빈칸에는 문맥에 맞는 형태 "${sentence?.target ?? item.term}"이 필요합니다. 기본형은 "${item.term}", 뜻은 ${meanings}입니다.`
  }
  if (type === 'dictation') {
    const pronunciation = item.ipa ? ` 발음 표기는 ${item.ipa}입니다.` : ''
    return `정확한 철자는 "${item.term}"이고 뜻은 ${meanings}입니다.${pronunciation}`
  }
  return `문맥에 필요한 형태는 "${sentence?.target ?? item.term}"이며 기본형 "${item.term}"에서 바뀐 형태입니다. 뜻은 ${meanings}입니다.`
}

function makeOptions(
  correctAnswer: string,
  answerPool: readonly string[],
  random: () => number,
): string[] {
  const correctKey = normalizeAnswer(correctAnswer)
  const distractors = answerPool.filter((answer) => normalizeAnswer(answer) !== correctKey)
  return shuffled([correctAnswer, ...sampled(distractors, 3, random)], random)
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
    explanation: explanationFor(source, type),
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
    explanation: explanationFor(source, type),
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
  const verbFormsByLemma = collectVerbForms(items)
  const allSources = uniqueSources(
    items
      .map((item) => makeSource(item, type, verbFormsByLemma))
      .filter((source): source is QuestionSource => source !== undefined),
  )
  const sources = options.sourceIds
    ? allSources.filter(({ item }) => options.sourceIds?.has(item.id))
    : allSources

  if (count < 0 || !Number.isInteger(count) || sources.length < count) {
    throw new QuizGenerationError({
      quizType: type,
      requestedCount: count,
      availableQuestionCount: sources.length,
    })
  }

  const answerPool = uniqueAnswers(allSources)
  if (isChoiceType(type) && answerPool.length < 4) {
    throw new QuizGenerationError({
      quizType: type,
      requestedCount: count,
      availableQuestionCount: sources.length,
      availableOptionCount: answerPool.length,
    })
  }

  const selectedSources = options.sampling
    ? (() => {
        const sourceById = new Map(sources.map((source) => [source.item.id, source]))
        return buildStudyQueue(
          sources.map(({ item }) => item),
          {
            selectedDifficulty: options.sampling.selectedDifficulty,
            matrix: calibratedDifficultyMatrix(
              options.sampling.selectedDifficulty,
              options.sampling.quizTypeStats?.[type],
            ),
            ...(options.sampling.mistakes
              ? { mistakes: options.sampling.mistakes }
              : {}),
            ...(options.sampling.difficultyStats
              ? { difficultyStats: options.sampling.difficultyStats }
              : {}),
            ...(options.sampling.quizHistory
              ? { quizHistory: options.sampling.quizHistory }
              : {}),
            ...(options.sampling.itemSchedule
              ? { itemSchedule: options.sampling.itemSchedule }
              : {}),
            ...(options.sampling.mastery
              ? { mastery: options.sampling.mastery }
              : {}),
            ...(options.sampling.grammarReviewItemIds
              ? { grammarReviewItemIds: options.sampling.grammarReviewItemIds }
              : {}),
            ...(options.sampling.now !== undefined
              ? { now: options.sampling.now }
              : {}),
            limit: count,
            random,
          },
        ).map((item) => sourceById.get(item.id)!)
      })()
    : sampled(sources, count, random)
  if (selectedSources.length < count) {
    throw new QuizGenerationError({
      quizType: type,
      requestedCount: count,
      availableQuestionCount: selectedSources.length,
      ...(isChoiceType(type) ? { availableOptionCount: answerPool.length } : {}),
    })
  }
  if (!isChoiceType(type)) {
    return selectedSources.map((source, index) => makeTextQuestion(source, type, index))
  }

  const optionPools = selectedSources.map((source) =>
    optionPoolForSource(source, type, allSources, answerPool),
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
