import type { QuizType } from '../../domain/quiz/types'

export const QUIZ_TYPE_LABELS: Record<QuizType, string> = {
  'en-ko': '4지선다 영어→한글',
  'ko-en': '4지선다 한글→영어',
  'sentence-meaning': '문장 밑줄 단어 의미 선택',
  'sentence-blank': '문장 빈칸 단어 선택',
  dictation: '받아쓰기(듣기 입력)',
  'sentence-transform': '짧은 문장 변환',
}
