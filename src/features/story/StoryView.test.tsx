import { render, screen, within } from '@testing-library/react'
import { makeStory, makeWord } from '../../test/fixtures'
import { StoryView } from './StoryView'

test('수동 소설과 대표/릴리스 커버리지를 분리해 표시한다', () => {
  const levelWords = Array.from({ length: 8 }, (_, index) => {
    const lemma = `word-${index + 1}`
    return makeWord({
      id: lemma,
      word: lemma,
      lemma,
      familyId: `family-${lemma}`,
    })
  })
  const story = makeStory('기초', {
    title: '함께 노는 친구들',
    storyText: 'A safe <story> stays plain text.',
    usedWords: levelWords.map((word) => ({
      lemma: word.lemma,
      partOfSpeech: 'noun',
      forms: [word.word, `${word.word}s`],
    })),
  })

  render(
    <StoryView story={story} levelWords={levelWords} targetWordCount={500} />,
  )
  const article = screen.getByRole('article')

  expect(within(article).getByRole('heading', { name: '함께 노는 친구들' })).toBeInTheDocument()
  expect(within(article).getByText('A safe <story> stays plain text.')).toBeInTheDocument()
  expect(within(article).getByText('수동 작성: 예')).toBeInTheDocument()
  expect(within(article).getByText('모든 대표 단어 포함: 예')).toBeInTheDocument()
  expect(within(article).getByText('상위 레벨 단어 허용: 아니요')).toBeInTheDocument()
  expect(within(article).getByText('현재 대표 데이터 커버리지 100%')).toBeInTheDocument()
  expect(within(article).getByText('대표 단어 8 / 8')).toBeInTheDocument()
  expect(within(article).getByText('릴리스 목표 대비 8 / 500 (1.6%)')).toBeInTheDocument()
  expect(within(article).getByText(/word-1.*noun.*word-1s/)).toBeInTheDocument()
})

test('false 메타데이터 상태도 텍스트로 명확히 표시한다', () => {
  const story = makeStory('기초', {
    isManual: false,
    coverage: {
      mustCoverAll: false,
      allowUpperLevelWords: true,
      coverageRate: 0.5,
    },
  })

  render(
    <StoryView
      story={story}
      levelWords={[makeWord()]}
      targetWordCount={500}
    />,
  )

  expect(screen.getByText('수동 작성: 아니요')).toBeInTheDocument()
  expect(screen.getByText('모든 대표 단어 포함: 아니요')).toBeInTheDocument()
  expect(screen.getByText('상위 레벨 단어 허용: 예')).toBeInTheDocument()
  expect(screen.getByText('현재 대표 데이터 커버리지 50%')).toBeInTheDocument()
})
