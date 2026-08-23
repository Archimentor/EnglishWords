import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makePhrasalVerb, makeStory, makeWord } from '../../test/fixtures'
import * as storyTokenization from './storyTokens'
import { StoryView } from './StoryView'

test('실제 표시 본문의 일반단어와 구동사 커버리지를 표시한다', () => {
  const levelWords = Array.from({ length: 8 }, (_, index) => {
    const lemma = `word-${index + 1}`
    return makeWord({
      id: lemma,
      word: lemma,
      lemma,
      familyId: `family-${lemma}`,
      entryOverrides: { forms: [lemma, `${lemma}s`] },
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

  render(<StoryView story={story} levelWords={levelWords} targetWordCount={500} />)
  const article = screen.getByRole('article')

  expect(within(article).getByRole('heading', { name: '함께 노는 친구들' })).toBeInTheDocument()
  expect(within(article).getByText('A safe <story> stays plain text.')).toBeInTheDocument()
  expect(within(article).getByText('수동 검수 원본: 예')).toBeInTheDocument()
  expect(within(article).getByText('전체 커버리지 요구: 예')).toBeInTheDocument()
  expect(within(article).getByText('일반 단어 8 / 8')).toBeInTheDocument()
  expect(within(article).getByText('구동사 0 / 0')).toBeInTheDocument()
  expect(within(article).getByText('미사용 일반 단어 0개')).toBeInTheDocument()
  expect(within(article).getByText('미사용 구동사 0개')).toBeInTheDocument()
  expect(within(article).getByText('릴리스 목표 대비 8 / 500 (1.6%)')).toBeInTheDocument()
})

test('배포 소설은 기존 확장 예문 대신 재작성 본문과 실제 커버리지 장면을 보여준다', async () => {
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

test('구동사는 실제 본문 안에서도 사용되고 별도 학습 목록에서 상세를 연다', async () => {
  const user = userEvent.setup()
  const phrasalVerb = makePhrasalVerb()
  const example = phrasalVerb.examples[0]!
  const story = makeStory('기초', {
    storyText: 'Mina followed the road with the bird.',
    vocabularyPracticeText: 'The children played together.',
    usedPhrasalVerbs: [{
      id: phrasalVerb.id,
      phrasalVerb: phrasalVerb.phrasalVerb,
      example,
    }],
    phrasalVerbPracticeText: `The map had another page. ${example} Mina went on.`,
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
  expect(document.querySelector('.story-body')).toHaveTextContent(phrasalVerb.phrasalVerb)

  const trigger = screen.getByRole('button', { name: 'story phrasal verb: wake up' })
  await user.click(trigger)

  expect(screen.getByRole('heading', { name: 'wake up 구동사 상세' })).toBeInTheDocument()
  expect(screen.getByText('잠에서 깨다')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '닫기' }))
  expect(trigger).toHaveFocus()
})

test('false 메타데이터 상태도 텍스트로 명확히 표시한다', () => {
  const story = makeStory('기초', {
    isManual: false,
    coverage: { mustCoverAll: false, allowUpperLevelWords: true, coverageRate: 0.5 },
  })

  render(<StoryView story={story} levelWords={[makeWord()]} targetWordCount={500} />)

  expect(screen.getByText('수동 검수 원본: 아니요')).toBeInTheDocument()
  expect(screen.getByText('전체 커버리지 요구: 아니요')).toBeInTheDocument()
  expect(screen.getByText('미사용 일반 단어 0개')).toBeInTheDocument()
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

  await user.click(screen.getByRole('button', { name: 'story word: play' }))
  expect(screen.getByRole('heading', { name: 'play 단어 상세' })).toBeInTheDocument()
  expect(screen.getByText('일반 단어 1 / 1')).toBeInTheDocument()
  expect(screen.getByText('미사용 일반 단어 0개')).toBeInTheDocument()
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
