import { QUIZ_TYPES } from './types'
import type { GradedAnswer, QuizSessionSummary, QuizType, QuizTypeStats } from './types'

function emptyStats(): QuizTypeStats {
  return { correct: 0, wrong: 0, total: 0, accuracy: 0 }
}

function initialTypeStats(): Record<QuizType, QuizTypeStats> {
  return Object.fromEntries(QUIZ_TYPES.map((type) => [type, emptyStats()])) as Record<
    QuizType,
    QuizTypeStats
  >
}

export function summarizeQuiz(answers: readonly GradedAnswer[]): QuizSessionSummary {
  const typeStats = initialTypeStats()

  for (const answer of answers) {
    const stats = typeStats[answer.type]
    stats.total += 1
    if (answer.isCorrect) {
      stats.correct += 1
    } else {
      stats.wrong += 1
    }
  }

  for (const stats of Object.values(typeStats)) {
    stats.accuracy = stats.total === 0 ? 0 : stats.correct / stats.total
  }

  const score = answers.filter(({ isCorrect }) => isCorrect).length

  return {
    score,
    total: answers.length,
    accuracy: answers.length === 0 ? 0 : score / answers.length,
    typeStats,
    heatmap: answers.map(({ questionId, sourceItemId, type, isCorrect }) => ({
      questionId,
      sourceItemId,
      type,
      isCorrect,
    })),
    wrongItemIds: [
      ...new Set(
        answers.filter(({ isCorrect }) => !isCorrect).map(({ sourceItemId }) => sourceItemId),
      ),
    ],
  }
}
