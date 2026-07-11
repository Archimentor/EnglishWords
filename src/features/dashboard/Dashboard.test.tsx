import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Level, WordItem } from '../../domain/content/types'
import { normalizeCatalog } from '../../domain/content/normalize'
import type { MistakeRecord, WordMastery } from '../../domain/progress/types'
import { makeCatalog, makePhrasalVerb, makeWord } from '../../test/fixtures'
import { Dashboard } from './Dashboard'

function runtimeCatalog() {
  const wordlists: Record<Level, WordItem[]> = {
    기초: [
      makeWord(),
      makeWord({
        id: 'word-book',
        word: 'book',
        lemma: 'book',
        familyId: 'family-book',
        entryOverrides: { meanings: ['책'], forms: ['book', 'books'] },
      }),
    ],
    유치원: [
      makeWord({
        id: 'word-other-level',
        word: 'other',
        lemma: 'other',
        level: '유치원',
        familyId: 'family-other',
      }),
    ],
    초등학교: [],
    중학교: [],
  }
  const phrasal = makePhrasalVerb()

  return normalizeCatalog(
    makeCatalog({
      wordlists,
      phrasalVerbs: {
        top: [phrasal],
        byLevel: {
          기초: [phrasal],
          유치원: [],
          초등학교: [],
          중학교: [],
        },
      },
    }),
  )
}

const MASTERED: WordMastery = {
  attempts: 3,
  correct: 3,
  wrong: 0,
  correctStreak: 3,
  wrongStreak: 0,
}

test('완료·미완료·오답을 현재 레벨의 단어와 구동사에서 집계한다', async () => {
  const user = userEvent.setup()
  const catalog = runtimeCatalog()
  const mastery = { 'word-play': MASTERED }
  const mistakes: Record<string, MistakeRecord> = {
    'phrasal-wake-up': { wrongCount: 2, wrongStreak: 2, priorityRemaining: 3 },
    'word-other-level': { wrongCount: 1, wrongStreak: 1, priorityRemaining: 0 },
    stale: { wrongCount: 1, wrongStreak: 1, priorityRemaining: 0 },
  }
  const onStudyMistakes = vi.fn()
  const onQuizMistakes = vi.fn()

  render(
    <Dashboard
      level="기초"
      catalog={catalog}
      mastery={mastery}
      mistakes={mistakes}
      targets={{ words: 500, phrasalVerbs: 250 }}
      onStudyMistakes={onStudyMistakes}
      onQuizMistakes={onQuizMistakes}
    />,
  )

  expect(screen.getByLabelText('완료 항목 수')).toHaveTextContent('1')
  expect(screen.getByLabelText('미완료 항목 수')).toHaveTextContent('2')
  expect(screen.getByLabelText('오답 항목 수')).toHaveTextContent('1')
  expect(screen.getByText('wake up')).toBeInTheDocument()
  expect(screen.queryByText('other')).not.toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: '단어 목표 진행' })).toHaveAttribute(
    'aria-valuemax',
    '500',
  )
  expect(
    screen.getByRole('progressbar', { name: '구동사 목표 진행' }),
  ).toHaveAttribute('aria-valuemax', '250')

  await user.click(screen.getByRole('button', { name: '오답 다시 학습' }))
  await user.click(screen.getByRole('button', { name: '오답 퀴즈' }))
  expect(onStudyMistakes).toHaveBeenCalledWith(['phrasal-wake-up'])
  expect(onQuizMistakes).toHaveBeenCalledWith(['phrasal-wake-up'])
})

test('오답이 없으면 빈 상태를 알리고 오답 작업을 비활성화한다', () => {
  render(
    <Dashboard
      level="기초"
      catalog={runtimeCatalog()}
      mastery={{}}
      mistakes={{}}
      targets={{ words: 500, phrasalVerbs: 250 }}
      onStudyMistakes={vi.fn()}
      onQuizMistakes={vi.fn()}
    />,
  )

  expect(screen.getByText('아직 등록된 오답이 없습니다.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '오답 다시 학습' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '오답 퀴즈' })).toBeDisabled()
})
