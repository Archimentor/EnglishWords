import type { GradedAnswer, QuizQuestion } from './types'

export function normalizeAnswer(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[.!?]+$/u, '').trim()
}

export function gradeAnswer(question: QuizQuestion, answer: string): GradedAnswer {
  return {
    questionId: question.id,
    sourceItemId: question.sourceItemId,
    type: question.type,
    answer,
    correctAnswer: question.correctAnswer,
    isCorrect: normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer),
  }
}
