export const QUIZ_TYPES = [
  'en-ko',
  'ko-en',
  'sentence-meaning',
  'sentence-blank',
  'dictation',
  'sentence-transform',
] as const

export type QuizType = (typeof QUIZ_TYPES)[number]

export type ChoiceQuizType =
  | 'en-ko'
  | 'ko-en'
  | 'sentence-meaning'
  | 'sentence-blank'

export type TextQuizType = 'dictation' | 'sentence-transform'

export interface SentenceTarget {
  before: string
  target: string
  after: string
}

interface QuizQuestionBase {
  id: string
  type: QuizType
  sourceItemId: string
  prompt: string
  correctAnswer: string
  explanation: string
  sentence?: SentenceTarget
}

export interface ChoiceQuizQuestion extends QuizQuestionBase {
  type: ChoiceQuizType
  inputMode: 'choice'
  options: string[]
}

export interface TextQuizQuestion extends QuizQuestionBase {
  type: TextQuizType
  inputMode: 'text'
  speechText?: string
}

export type QuizQuestion = ChoiceQuizQuestion | TextQuizQuestion

export interface GradedAnswer {
  questionId: string
  sourceItemId: string
  type: QuizType
  answer: string
  correctAnswer: string
  isCorrect: boolean
}

export interface QuizTypeStats {
  correct: number
  wrong: number
  total: number
  accuracy: number
}

export interface QuizHeatmapEntry {
  questionId: string
  sourceItemId: string
  type: QuizType
  isCorrect: boolean
}

export interface QuizSessionSummary {
  score: number
  total: number
  accuracy: number
  typeStats: Record<QuizType, QuizTypeStats>
  heatmap: QuizHeatmapEntry[]
  wrongItemIds: string[]
}
