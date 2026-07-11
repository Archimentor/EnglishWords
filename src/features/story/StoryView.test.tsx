import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
      entryOverrides: {
        forms: [lemma, `${lemma}s`],
      },
    })
  })
  const story = makeStory('기초', {
    title: '함께 노는 친구들',
    storyText: 'A safe <story> stays plain text.',
    usedWords: levelWords.map((word) => ({
      lemma: word.lemma,
      partOfSpeech: 'verb',
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
  expect(within(article).getByText(/word-1.*verb.*word-1s/)).toBeInTheDocument()
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

test('clicking a story surface form shows its exact word entry', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    usedWords: [
      {
        lemma: 'play',
        partOfSpeech: 'verb',
        forms: ['played'],
      },
    ],
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)

  await user.click(screen.getByRole('button', { name: 'story word: played' }))

  expect(screen.getByRole('heading', { name: 'play 단어 상세' })).toBeInTheDocument()
  expect(screen.getByText('품사: verb')).toBeInTheDocument()
  expect(screen.getByText('/pleɪ/')).toBeInTheDocument()
  expect(screen.getByText('놀다')).toBeInTheDocument()
  expect(screen.getByText('형태: play, plays, played, playing')).toBeInTheDocument()
  expect(screen.getByText('I play outside.')).toBeInTheDocument()
  expect(screen.getByText('They play after school.')).toBeInTheDocument()
})

test('shows the selected word in the reading workspace rather than below the whole story', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['played'] }],
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
  await user.click(screen.getByRole('button', { name: 'story word: played' }))

  const detail = screen.getByRole('complementary', { name: 'play 단어 상세' })
  expect(detail.closest('.story-reading-layout')).not.toBeNull()
  expect(detail).toHaveClass('story-word-inspector')
})

test('Escape closes the detail and restores focus to the selected word', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    usedWords: [
      {
        lemma: 'play',
        partOfSpeech: 'verb',
        forms: ['played'],
      },
    ],
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
  const trigger = screen.getByRole('button', { name: 'story word: played' })

  await user.click(trigger)
  await user.keyboard('{Escape}')

  expect(screen.queryByRole('heading', { name: 'play 단어 상세' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

test('Escape restores focus to the exact repeated story word that was selected', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'They played, then played again.',
    usedWords: [
      {
        lemma: 'play',
        partOfSpeech: 'verb',
        forms: ['played'],
      },
    ],
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
  const [firstTrigger] = screen.getAllByRole('button', {
    name: 'story word: played',
  })

  await user.click(firstTrigger!)
  await user.keyboard('{Escape}')

  expect(firstTrigger).toHaveFocus()
})

test('resets the selected detail when the displayed story changes', async () => {
  const user = userEvent.setup()
  const play = makeWord()
  const playStory = makeStory('기초', {
    storyText: 'The children played together.',
    usedWords: [
      {
        lemma: 'play',
        partOfSpeech: 'verb',
        forms: ['played'],
      },
    ],
  })
  const book = makeWord({
    id: 'word-book',
    word: 'book',
    lemma: 'book',
    level: '유치원',
    entryOverrides: { forms: ['book'] },
  })
  const bookStory = makeStory('유치원', {
    storyText: 'I carry a book.',
    usedWords: [
      {
        lemma: 'book',
        partOfSpeech: 'verb',
        forms: ['book'],
      },
    ],
  })

  const { rerender } = render(
    <StoryView story={playStory} levelWords={[play]} targetWordCount={500} />,
  )
  await user.click(screen.getByRole('button', { name: 'story word: played' }))
  expect(screen.getByRole('heading', { name: 'play 단어 상세' })).toBeInTheDocument()

  rerender(
    <StoryView story={bookStory} levelWords={[book]} targetWordCount={500} />,
  )

  expect(screen.queryByRole('heading', { name: 'play 단어 상세' })).not.toBeInTheDocument()
})

test('does not restore a stale selection when returning to an earlier story object', async () => {
  const user = userEvent.setup()
  const play = makeWord()
  const playStory = makeStory('기초', {
    storyText: 'The children played together.',
    usedWords: [
      {
        lemma: 'play',
        partOfSpeech: 'verb',
        forms: ['played'],
      },
    ],
  })
  const book = makeWord({
    id: 'word-book',
    word: 'book',
    lemma: 'book',
    level: '유치원',
    entryOverrides: { forms: ['book'] },
  })
  const bookStory = makeStory('유치원', {
    storyText: 'I carry a book.',
    usedWords: [
      {
        lemma: 'book',
        partOfSpeech: 'verb',
        forms: ['book'],
      },
    ],
  })

  const { rerender } = render(
    <StoryView story={playStory} levelWords={[play]} targetWordCount={500} />,
  )
  await user.click(screen.getByRole('button', { name: 'story word: played' }))
  rerender(
    <StoryView story={bookStory} levelWords={[book]} targetWordCount={500} />,
  )
  rerender(
    <StoryView story={playStory} levelWords={[play]} targetWordCount={500} />,
  )

  expect(screen.queryByRole('heading', { name: 'play 단어 상세' })).not.toBeInTheDocument()
})

test('keeps reading position on the clicked word while updating the visible detail panel', async () => {
  const user = userEvent.setup()
  const scrollIntoView = vi.fn()
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView',
  )
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })

  try {
    const word = makeWord()
    const story = makeStory('기초', {
      storyText: 'The children played together.',
      usedWords: [
        {
          lemma: 'play',
          partOfSpeech: 'verb',
          forms: ['played'],
        },
      ],
    })
    render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)

    await user.click(screen.getByRole('button', { name: 'story word: played' }))

    await screen.findByRole('complementary', { name: 'play 단어 상세' })
    expect(screen.getByRole('button', { name: 'story word: played' })).toHaveFocus()
    expect(scrollIntoView).not.toHaveBeenCalled()
  } finally {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor)
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    }
  }
})

test('only exposes detail controls while a story word is expanded', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    usedWords: [
      {
        lemma: 'play',
        partOfSpeech: 'verb',
        forms: ['played'],
      },
    ],
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
  const trigger = screen.getByRole('button', { name: 'story word: played' })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(trigger).not.toHaveAttribute('aria-controls')
  expect(trigger).not.toHaveAttribute('aria-pressed')

  await user.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(trigger).toHaveAttribute('aria-controls', 'story-word-detail')
  expect(trigger).not.toHaveAttribute('aria-pressed')

  await user.keyboard('{Escape}')
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(trigger).not.toHaveAttribute('aria-controls')
})

test('the close button closes the detail and restores focus to the selected word', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    usedWords: [
      {
        lemma: 'play',
        partOfSpeech: 'verb',
        forms: ['played'],
      },
    ],
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
  const trigger = screen.getByRole('button', { name: 'story word: played' })
  await user.click(trigger)
  await user.click(screen.getByRole('button', { name: '닫기' }))

  expect(screen.queryByRole('heading', { name: 'play 단어 상세' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
