import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makePhrasalVerb, makeStory, makeWord } from '../../test/fixtures'
import * as storyTokenization from './storyTokens'
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
  expect(within(article).getByText('통합 단어장 전체 포함: 예')).toBeInTheDocument()
  expect(within(article).getByText('상위 레벨 단어 허용: 아니요')).toBeInTheDocument()
  expect(within(article).getByText('현재 대표 데이터 커버리지 100%')).toBeInTheDocument()
  expect(within(article).getByText('일반 단어 8 / 8')).toBeInTheDocument()
  expect(within(article).getByText('릴리스 목표 대비 8 / 500 (1.6%)')).toBeInTheDocument()
  expect(within(article).getByText(/word-1.*verb.*word-1s/)).toBeInTheDocument()
})

test('본편과 전체 커버리지 어휘 장면을 분리하고 연습 단어도 조회한다', async () => {
  const user = userEvent.setup()
  const word = makeWord({
    entryOverrides: { forms: ['play', 'played'] },
  })
  const story = makeStory('기초', {
    storyText: 'Mina walked to the park and found a bird.',
    vocabularyPracticeText: 'The children played together.',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['played'] }],
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)

  expect(screen.getByText('Mina walked to the park and found a bird.')).toBeVisible()
  const practiceWord = screen.getByRole('button', { name: 'story word: played' })
  expect(practiceWord).not.toBeVisible()

  await user.click(screen.getByText('일반 단어 확장 장면 · 전체 1개'))
  expect(practiceWord).toBeVisible()
  await user.click(practiceWord)

  expect(screen.getByRole('heading', { name: 'play 단어 상세' })).toBeInTheDocument()
})

test('구동사 확장 장면에서 단어장 구동사의 실제 예문과 상세를 제공한다', async () => {
  const user = userEvent.setup()
  const phrasalVerb = makePhrasalVerb()
  const story = makeStory('기초', {
    usedPhrasalVerbs: [{
      id: phrasalVerb.id,
      phrasalVerb: phrasalVerb.phrasalVerb,
      example: phrasalVerb.examples[0]!,
    }],
    phrasalVerbPracticeText: `Mina opened the next page. ${phrasalVerb.examples[0]} Mina went on.`,
  })

  render(
    <StoryView
      story={story}
      levelWords={[makeWord()]}
      levelPhrasalVerbs={[phrasalVerb]}
      targetWordCount={500}
      targetPhrasalVerbCount={250}
    />,
  )

  expect(screen.getByText('구동사 1 / 1')).toBeInTheDocument()
  const trigger = screen.getByRole('button', { name: 'story phrasal verb: wake up' })
  expect(trigger).not.toBeVisible()
  await user.click(screen.getByText('구동사 확장 장면 · 전체 1개'))
  expect(screen.getByRole('region', { name: '구동사 확장 장면 1' }))
    .toHaveTextContent(phrasalVerb.examples[0]!)
  await user.click(trigger)

  expect(screen.getByRole('heading', { name: 'wake up 구동사 상세' })).toBeInTheDocument()
  expect(screen.getByText('잠에서 깨다')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '닫기' }))
  expect(trigger).toHaveFocus()
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
  expect(screen.getByText('통합 단어장 전체 포함: 아니요')).toBeInTheDocument()
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

test('opening a story word moves focus into the detail and closing returns it', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['played'] }],
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
  const trigger = screen.getByRole('button', { name: 'story word: played' })

  await user.click(trigger)
  const close = screen.getByRole('button', { name: '닫기' })
  expect(close).toHaveFocus()

  await user.click(close)
  expect(trigger).toHaveFocus()
})

test('상위 레벨 소설에 기록된 하위 레벨 단어도 누적 사전에서 상세를 연다', async () => {
  const user = userEvent.setup()
  const lowerWord = makeWord()
  const currentWord = makeWord({
    id: 'word-achieve',
    word: 'achieve',
    lemma: 'achieve',
    level: '중학교',
    familyId: 'family-achieve',
    entryOverrides: { forms: ['achieve'] },
  })
  const story = makeStory('중학교', {
    storyText: 'Students play together.',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['play'] }],
  })

  render(
    <StoryView
      story={story}
      levelWords={[currentWord]}
      lookupWords={[lowerWord, currentWord]}
      targetWordCount={2500}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'story word: play' }))

  expect(screen.getByRole('heading', { name: 'play 단어 상세' })).toBeInTheDocument()
  expect(screen.getByText('일반 단어 0 / 1')).toBeInTheDocument()
})

test('선택한 소설 표면형의 발음을 재생하고 상세를 닫을 때 취소한다', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['played'] }],
  })
  const speech = { speak: vi.fn().mockResolvedValue(undefined), cancel: vi.fn() }

  render(
    <StoryView
      story={story}
      levelWords={[word]}
      targetWordCount={500}
      speech={speech}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'story word: played' }))
  await user.click(screen.getByRole('button', { name: 'played 발음 듣기' }))

  expect(speech.speak).toHaveBeenCalledWith('played')
  await user.click(screen.getByRole('button', { name: '닫기' }))
  expect(speech.cancel).toHaveBeenCalled()
})

test('소설 발음 실패를 알리되 단어 상세는 계속 표시한다', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['played'] }],
  })
  const speech = {
    speak: vi.fn().mockRejectedValue(new Error('speech failed')),
    cancel: vi.fn(),
  }

  render(
    <StoryView
      story={story}
      levelWords={[word]}
      targetWordCount={500}
      speech={speech}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'story word: played' }))
  await user.click(screen.getByRole('button', { name: 'played 발음 듣기' }))

  expect(screen.getByRole('status')).toHaveTextContent(
    '발음 재생을 지원하지 않는 브라우저입니다.',
  )
  expect(screen.getByText('놀다')).toBeInTheDocument()
})

test('reuses tokenization when opening and closing a word detail', async () => {
  const user = userEvent.setup()
  const tokenizeSpy = vi.spyOn(storyTokenization, 'tokenizeStoryParagraphs')
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['played'] }],
  })

  try {
    render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
    expect(tokenizeSpy).toHaveBeenCalledTimes(3)

    await user.click(screen.getByRole('button', { name: 'story word: played' }))
    await user.click(screen.getByRole('button', { name: '닫기' }))

    expect(tokenizeSpy).toHaveBeenCalledTimes(3)
  } finally {
    tokenizeSpy.mockRestore()
  }
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

test('keeps scroll position while moving focus into the visible detail panel', async () => {
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
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus()
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

test('큰 소설 본문을 문장 중간이 아닌 문단 단위로 점진 렌더링한다', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const repeated = Array.from({ length: 180 }, (_, index) =>
    `The children played together. Paragraph ${index + 1} ended.`).join('\n\n')
  const story = makeStory('기초', {
    storyText: repeated,
    usedWords: Array.from({ length: 220 }, () => ({
      lemma: 'play',
      partOfSpeech: 'verb',
      forms: ['played'],
    })),
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)

  expect(screen.getAllByRole('button', { name: 'story word: played' }).length)
    .toBe(4)
  expect(screen.getByText(/Paragraph 4 ended\./)).toBeInTheDocument()
  expect(screen.queryByText(/Paragraph 5 ended\./)).not.toBeInTheDocument()
  const storyMore = screen.getByRole('button', { name: /다음 문단 보기/ })
  await user.click(storyMore)
  expect(screen.getAllByRole('button', { name: 'story word: played' }).length)
    .toBe(8)
  expect(screen.getByText(/Paragraph 8 ended\./)).toBeInTheDocument()

  expect(screen.getAllByText(/play · verb · played/)).toHaveLength(100)
  await user.click(screen.getByRole('button', { name: /사용 단어 더 보기/ }))
  expect(screen.getAllByText(/play · verb · played/)).toHaveLength(200)
})
