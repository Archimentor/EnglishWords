import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Level, WordItem } from '../../domain/content/types'
import { normalizeCatalog } from '../../domain/content/normalize'
import type { MistakeRecord, WordMastery } from '../../domain/progress/types'
import { makeCatalog, makePhrasalVerb, makeWord } from '../../test/fixtures'
import { createInitialState } from '../../state/appState'
import { Dashboard } from './Dashboard'

const DASHBOARD_NOW = new Date(2026, 7, 19, 9).getTime()

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
  const initial = createInitialState()

  render(
    <Dashboard
      level="기초"
      catalog={catalog}
      mastery={mastery}
      mistakes={mistakes}
      studyAnalytics={initial.studyAnalytics.기초}
      difficultyStats={initial.difficultyStats.기초}
      now={DASHBOARD_NOW}
      targets={{ words: 500, phrasalVerbs: 250 }}
      onStudyMistakes={onStudyMistakes}
      onQuizMistakes={onQuizMistakes}
    />,
  )

  expect(screen.getByLabelText('완료 항목 수')).toHaveTextContent('1')
  expect(screen.getByLabelText('미완료 항목 수')).toHaveTextContent('2')
  expect(screen.getByLabelText('오답 항목 수')).toHaveTextContent('1')
  expect(screen.getAllByText('wake up').length).toBeGreaterThan(0)
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

  const incomplete = screen.getByRole('list', { name: '미완료 항목 목록' })
  expect(within(incomplete).getByText('book')).toBeInTheDocument()
  expect(within(incomplete).getByText('wake up')).toBeInTheDocument()
  expect(within(incomplete).queryByText('play')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '완료 1개' }))
  const completed = screen.getByRole('list', { name: '완료 항목 목록' })
  expect(within(completed).getByText('play')).toBeInTheDocument()
  expect(within(completed).queryByText('book')).not.toBeInTheDocument()
})

test('오답이 없으면 빈 상태를 알리고 오답 작업을 비활성화한다', () => {
  const initial = createInitialState()
  render(
    <Dashboard
      level="기초"
      catalog={runtimeCatalog()}
      mastery={{}}
      mistakes={{}}
      studyAnalytics={initial.studyAnalytics.기초}
      difficultyStats={initial.difficultyStats.기초}
      now={DASHBOARD_NOW}
      targets={{ words: 500, phrasalVerbs: 250 }}
      onStudyMistakes={vi.fn()}
      onQuizMistakes={vi.fn()}
    />,
  )

  expect(screen.getByText('아직 등록된 오답이 없습니다.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '오답 다시 학습' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '오답 퀴즈' })).toBeDisabled()
})

test('선택 난이도·실제 노출·퀴즈 정확도·오답 재노출 분석을 표시한다', () => {
  const initial = createInitialState()
  initial.studyAnalytics.기초.selectedDifficulty.hard = 3
  initial.studyAnalytics.기초.selectedDifficulty.normal = 1
  initial.studyAnalytics.기초.exposedDifficulty.veryHard = 2
  initial.studyAnalytics.기초.wrongReexposures['word-play'] = 2
  initial.studyAnalytics.유치원.selectedDifficulty.easy = 9
  initial.studyAnalytics.유치원.wrongReexposures['word-other-level'] = 9
  initial.difficultyStats.기초.hard = { attempts: 4, correct: 3 }
  initial.difficultyStats.유치원.hard = { attempts: 9, correct: 0 }

  render(
    <Dashboard
      level="기초"
      catalog={runtimeCatalog()}
      mastery={{}}
      mistakes={{}}
      studyAnalytics={initial.studyAnalytics.기초}
      difficultyStats={initial.difficultyStats.기초}
      now={DASHBOARD_NOW}
      targets={{ words: 500, phrasalVerbs: 250 }}
      onStudyMistakes={vi.fn()}
      onQuizMistakes={vi.fn()}
    />,
  )

  expect(screen.getByText('오답 재노출 2회')).toBeInTheDocument()
  expect(screen.queryByText('오답 재노출 9회')).not.toBeInTheDocument()
  expect(screen.queryByText('0% (0/9)')).not.toBeInTheDocument()
  const hardRow = screen.getByRole('row', { name: /어려움 75% \(3회\) 0회 75% \(3\/4\)/ })
  expect(hardRow).toBeInTheDocument()
  expect(screen.getByRole('row', { name: /아주어려움 0% \(0회\) 2회/ }))
    .toBeInTheDocument()
})

test('연속 학습·유형 반응 지표·큐 건강도를 추적 상태에서 표시한다', () => {
  const initial = createInitialState()
  const now = DASHBOARD_NOW
  initial.tracking.dailyActivity['2026-08-19'] = {
    sessions: 1,
    attempts: 4,
    correct: 3,
    durationMs: 60_000,
  }
  initial.tracking.quizTypeStats.기초['en-ko'] = {
    attempts: 4,
    correct: 3,
    totalAnswerTimeMs: 8_000,
    averageAnswerTimeMs: 2_000,
    reexposureAttempts: 2,
    reexposureCorrect: 1,
    wrongRunTransitions: 1,
    adjustmentTotal: 0.4,
  }

  render(
    <Dashboard
      level="기초"
      catalog={runtimeCatalog()}
      mastery={{}}
      mistakes={{
        'word-play': { wrongCount: 2, wrongStreak: 2, priorityRemaining: 3 },
      }}
      studyAnalytics={initial.studyAnalytics.기초}
      difficultyStats={initial.difficultyStats.기초}
      tracking={initial.tracking}
      now={now}
      targets={{ words: 500, phrasalVerbs: 250 }}
      onStudyMistakes={vi.fn()}
      onQuizMistakes={vi.fn()}
    />,
  )

  expect(screen.getByLabelText('현재 연속 학습일')).toHaveTextContent('1일')
  expect(screen.getByLabelText('전체 정답률')).toHaveTextContent('75%')
  expect(screen.getByRole('row', {
    name: /4지선다 영어→한글 75% \(4회\) 2초 50% 33% 0.10/,
  })).toBeInTheDocument()
  expect(screen.getByText('mistakeBankRatio').nextElementSibling).toHaveTextContent('33%')
  expect(screen.getByText('prioritySaturation').nextElementSibling).toHaveTextContent('33%')
})

test('명시 now가 없으면 열린 대시보드의 시간 의존 지표를 주기적으로 갱신한다', () => {
  vi.useFakeTimers()
  const startedAt = Date.now()
  const initial = createInitialState()
  initial.tracking.itemSchedule['word-play'] = {
    kind: 'word',
    level: '기초',
    ease: 2.5,
    lastSeenAt: startedAt,
    nextDueAt: startedAt + 30_000,
    weight: 0.4,
    lastLevel: '기초',
  }
  const view = render(
    <Dashboard
      level="기초"
      catalog={runtimeCatalog()}
      mastery={{}}
      mistakes={{}}
      studyAnalytics={initial.studyAnalytics.기초}
      difficultyStats={initial.difficultyStats.기초}
      tracking={initial.tracking}
      targets={{ words: 500, phrasalVerbs: 250 }}
      onStudyMistakes={vi.fn()}
      onQuizMistakes={vi.fn()}
    />,
  )

  try {
    expect(screen.getByText('overdueItems').nextElementSibling).toHaveTextContent('0개')
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByText('overdueItems').nextElementSibling).toHaveTextContent('1개')
  } finally {
    view.unmount()
    vi.useRealTimers()
  }
})
