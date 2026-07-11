import { gradeAnswer, normalizeAnswer } from './grade'
import type { QuizQuestion } from './types'

const textQuestion: QuizQuestion = {
  id: 'quiz-dictation-0-word-play',
  type: 'dictation',
  inputMode: 'text',
  sourceItemId: 'word-play',
  prompt: '들은 단어를 입력하세요.',
  correctAnswer: 'Play',
  explanation: 'play: 놀다',
  speechText: 'play',
}

const choiceQuestion: QuizQuestion = {
  id: 'quiz-en-ko-0-word-play',
  type: 'en-ko',
  inputMode: 'choice',
  sourceItemId: 'word-play',
  prompt: 'play',
  correctAnswer: '놀다',
  explanation: 'play: 놀다',
  options: ['책', '놀다', '달리다', '사과'],
}

describe('normalizeAnswer', () => {
  it('ignores surrounding whitespace, English case, and trailing sentence punctuation', () => {
    expect(normalizeAnswer('  PLAY.!?  ')).toBe('play')
    expect(normalizeAnswer('  PLAY .!?  ')).toBe('play')
  })

  it('preserves internal whitespace and non-terminal punctuation', () => {
    expect(normalizeAnswer('wake  up')).toBe('wake  up')
    expect(normalizeAnswer('play, now')).toBe('play, now')
  })
})

describe('gradeAnswer', () => {
  it('grades choice and text questions with the same normalization rules', () => {
    expect(gradeAnswer(textQuestion, ' play!!! ')).toMatchObject({
      questionId: textQuestion.id,
      sourceItemId: 'word-play',
      type: 'dictation',
      correctAnswer: 'Play',
      isCorrect: true,
    })
    expect(gradeAnswer(choiceQuestion, ' 놀다. ')).toMatchObject({
      type: 'en-ko',
      isCorrect: true,
    })
  })

  it.each(['pla', 'plaay', 'play now', ''])('rejects an inexact answer %j', (answer) => {
    expect(gradeAnswer(textQuestion, answer).isCorrect).toBe(false)
  })
})
