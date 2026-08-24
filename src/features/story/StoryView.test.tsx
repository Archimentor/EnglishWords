import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makePhrasalVerb, makeStory, makeWord } from '../../test/fixtures'
import * as storyTokenization from './storyTokens'
import { StoryView } from './StoryView'

test('소설 화면에는 본문만 표시하고 커버리지와 학습 목록 카드를 숨긴다', () => {
  const word = makeWord()
  const story = makeStory('기초', {
    title: '함께 노는 친구들',
    storyText: 'The children play together.',
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
  const article = screen.getByRole('article')

  expect(within(article).getByRole('heading', { name: '함께 노는 친구들' })).toBeInTheDocument()
  expect(within(article).getByText(/The children/u)).toBeInTheDocument()
  expect(within(article).queryByText('실제 소설 본문 커버리지')).not.toBeInTheDocument()
  expect(within(article).queryByText('전체 학습 단어')).not.toBeInTheDocument()
  expect(within(article).queryByText('전체 학습 구동사')).not.toBeInTheDocument()
  expect(within(article).queryByText(/스키마/u)).not.toBeInTheDocument()
  expect(within(article).queryByText(/100% 다루도록/u)).not.toBeInTheDocument()
})

test('배포 소설은 기존 확장 예문 대신 재작성 본문을 보여준다', async () => {
  const user = userEvent.setup()
  const story = makeStory('기초', {
    title: '빨간 공을 따라간 Mina',
    storyText: 'LEGACY STORY SHOULD NOT APPEAR.',
    vocabularyPracticeText: 'LEGACY VOCABULARY SHOULD NOT APPEAR.',
    phrasalVerbPracticeText: 'LEGACY PHRASAL SHOULD NOT APPEAR.',
  })

  render(<StoryView story={story} levelWords={[makeWord()]} targetWordCount={500} />)

  expect(screen.getByText(/Mina has a red ball/u)).toBeVisible()
  expect(screen.queryByText(/LEGACY STORY/u)).not.toBeInTheDocument()
  expect(screen.queryByText(/LEGACY VOCABULARY/u)).not.toBeInTheDocument()
  expect(screen.queryByText(/LEGACY PHRASAL/u)).not.toBeInTheDocument()

  const loadMore = screen.getByRole('button', { name: /다음 이야기 보기/u })
  await user.click(loadMore)
  expect(screen.getByText(/Mina opens the letter/u)).toBeVisible()
})

test('구동사 안의 단어는 초록 밑줄로 따로 누르고 아래 붉은 밑줄은 구동사 상세를 연다', async () => {
  const user = userEvent.setup()
  const phrasalVerb = makePhrasalVerb()
  const wake = makeWord({
    id: 'word-wake',
    word: 'wake',
    lemma: 'wake',
    familyId: 'family-wake',
    entryOverrides: {
      partOfSpeech: 'verb',
      forms: ['wake'],
      meanings: ['깨다'],
      ipa: '/weɪk/',
      examples: ['I wake early.'],
    },
  })
  const up = makeWord({
    id: 'word-up',
    word: 'up',
    lemma: 'up',
    familyId: 'family-up',
    entryOverrides: {
      partOfSpeech: 'adverb',
      forms: ['up'],
      meanings: ['위로'],
      ipa: '/ʌp/',
      examples: ['Look up.'],
    },
  })
  const story = makeStory('기초', {
    title: '구동사 테스트',
    storyText: 'I wake up early.',
    usedWords: [
      { lemma: 'wake', partOfSpeech: 'verb', forms: ['wake'] },
      { lemma: 'up', partOfSpeech: 'adverb', forms: ['up'] },
    ],
    usedPhrasalVerbs: [{
      id: phrasalVerb.id,
      phrasalVerb: phrasalVerb.phrasalVerb,
      example: phrasalVerb.examples[0]!,
    }],
  })

  render(
    <StoryView
      story={story}
      levelWords={[wake, up]}
      levelPhrasalVerbs={[phrasalVerb]}
      targetWordCount={500}
      targetPhrasalVerbCount={250}
    />,
  )

  const phrase = document.querySelector('[data-phrasal-verb="wake up"]')
  expect(phrase).not.toBeNull()
  const wakeTrigger = within(phrase as HTMLElement).getByRole('button', { name: 'story word: wake' })
  const upTrigger = within(phrase as HTMLElement).getByRole('button', { name: 'story word: up' })
  const phrasalTrigger = within(phrase as HTMLElement).getByRole('button', {
    name: 'story phrasal verb: wake up',
  })

  expect(wakeTrigger).toHaveClass('story-word-button')
  expect(upTrigger).toHaveClass('story-word-button')
  expect(phrasalTrigger).toHaveClass('story-inline-phrasal-meaning-button')
  expect(screen.queryByText('전체 학습 구동사')).not.toBeInTheDocument()

  await user.click(wakeTrigger)
  expect(screen.getByRole('heading', { name: 'wake 단어 상세' })).toBeInTheDocument()
  expect(screen.getByText('깨다')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '닫기' }))
  expect(wakeTrigger).toHaveFocus()

  await user.click(upTrigger)
  expect(screen.getByRole('heading', { name: 'up 단어 상세' })).toBeInTheDocument()
  expect(screen.getByText('위로')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '닫기' }))
  expect(upTrigger).toHaveFocus()

  await user.click(phrasalTrigger)
  expect(screen.getByRole('heading', { name: 'wake up 구동사 상세' })).toBeInTheDocument()
  expect(screen.getByText('잠에서 깨다')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '닫기' }))
  expect(phrasalTrigger).toHaveFocus()
})

test('스토리 메타데이터 상태는 소설 화면에 표시하지 않는다', () => {
  const story = makeStory('기초', {
    isManual: false,
    coverage: { mustCoverAll: false, allowUpperLevelWords: true, coverageRate: 0.5 },
  })

  render(<StoryView story={story} levelWords={[makeWord()]} targetWordCount={500} />)

  expect(screen.queryByText(/수동 검수 원본/u)).not.toBeInTheDocument()
  expect(screen.queryByText(/전체 커버리지 요구/u)).not.toBeInTheDocument()
  expect(screen.queryByText(/미사용 일반 단어/u)).not.toBeInTheDocument()
})

test('clicking a story surface form shows its exact word entry', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    vocabularyPracticeText: '',
    phrasalVerbPracticeText: '',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['played'] }],
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
  await user.click(screen.getByRole('button', { name: 'story word: played' }))

  expect(screen.getByRole('heading', { name: 'play 단어 상세' })).toBeInTheDocument()
  expect(screen.getByText('품사: verb')).toBeInTheDocument()
  expect(screen.getByText('/pleɪ/')).toBeInTheDocument()
  expect(screen.getByText('놀다')).toBeInTheDocument()
  expect(screen.getByText('형태: play, plays, played, playing')).toBeInTheDocument()
})

test('상세를 닫으면 선택한 단어로 포커스를 돌려준다', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    vocabularyPracticeText: '',
    phrasalVerbPracticeText: '',
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
    vocabularyPracticeText: '',
    phrasalVerbPracticeText: '',
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

  await userEvent.setup().click(screen.getByRole('button', { name: 'story word: play' }))
  expect(screen.getByRole('heading', { name: 'play 단어 상세' })).toBeInTheDocument()
  expect(screen.queryByText('실제 소설 본문 커버리지')).not.toBeInTheDocument()
})

test('선택한 소설 표면형의 발음을 재생하고 상세를 닫을 때 취소한다', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    vocabularyPracticeText: '',
    phrasalVerbPracticeText: '',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['played'] }],
  })
  const speech = { speak: vi.fn().mockResolvedValue(undefined), cancel: vi.fn() }

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} speech={speech} />)
  await user.click(screen.getByRole('button', { name: 'story word: played' }))
  await user.click(screen.getByRole('button', { name: 'played 발음 듣기' }))

  expect(speech.speak).toHaveBeenCalledWith('played')
  await user.click(screen.getByRole('button', { name: '닫기' }))
  expect(speech.cancel).toHaveBeenCalled()
})

test('단어 상세를 여닫을 때 본문 토큰화를 다시 수행하지 않는다', async () => {
  const user = userEvent.setup()
  const tokenizeSpy = vi.spyOn(storyTokenization, 'tokenizeStoryParagraphs')
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The children played together.',
    vocabularyPracticeText: '',
    phrasalVerbPracticeText: '',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['played'] }],
  })

  try {
    render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
    expect(tokenizeSpy).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'story word: played' }))
    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(tokenizeSpy).toHaveBeenCalledTimes(1)
  } finally {
    tokenizeSpy.mockRestore()
  }
})

test('Escape는 반복된 단어 중 실제 선택한 위치로 포커스를 복원한다', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'They played, then played again.',
    vocabularyPracticeText: '',
    phrasalVerbPracticeText: '',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['played'] }],
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
  const triggers = screen.getAllByRole('button', { name: 'story word: played' })
  const secondTrigger = triggers[1]!
  await user.click(secondTrigger)
  await user.keyboard('{Escape}')
  expect(secondTrigger).toHaveFocus()
})

test('표시하는 소설이 바뀌면 기존 상세 선택을 초기화한다', async () => {
  const user = userEvent.setup()
  const play = makeWord()
  const playStory = makeStory('기초', {
    storyText: 'The children played together.',
    vocabularyPracticeText: '',
    phrasalVerbPracticeText: '',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['played'] }],
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
    vocabularyPracticeText: '',
    phrasalVerbPracticeText: '',
    usedWords: [{ lemma: 'book', partOfSpeech: 'verb', forms: ['book'] }],
  })

  const { rerender } = render(
    <StoryView story={playStory} levelWords={[play]} targetWordCount={500} />,
  )
  await user.click(screen.getByRole('button', { name: 'story word: played' }))
  expect(screen.getByRole('heading', { name: 'play 단어 상세' })).toBeInTheDocument()

  rerender(<StoryView story={bookStory} levelWords={[book]} targetWordCount={500} />)
  expect(screen.queryByRole('heading', { name: 'play 단어 상세' })).not.toBeInTheDocument()
})

test('긴 소설을 문장 중간이 아닌 문단 단위로 점진 렌더링한다', async () => {
  const user = userEvent.setup()
  const word = makeWord()
  const repeated = Array.from({ length: 20 }, (_, index) =>
    `The children played together. Paragraph ${index + 1} ended.`).join('\n\n')
  const story = makeStory('기초', {
    storyText: repeated,
    vocabularyPracticeText: '',
    phrasalVerbPracticeText: '',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['played'] }],
  })

  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)

  expect(screen.getByText(/Paragraph 4 ended/u)).toBeVisible()
  expect(screen.queryByText(/Paragraph 5 ended/u)).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /다음 이야기 보기/u }))
  expect(screen.getByText(/Paragraph 8 ended/u)).toBeVisible()
  expect(screen.queryByText(/Paragraph 9 ended/u)).not.toBeInTheDocument()
})
