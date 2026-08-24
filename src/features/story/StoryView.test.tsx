import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { makePhrasalVerb, makeStory, makeWord } from '../../test/fixtures'
import type { StoryContent, WordItem } from '../../domain/content/types'
import { StoryView } from './StoryView'

const SENSE_ID = 'a'.repeat(64)

function sixChapterText(firstChapter: string): string {
  return [
    firstChapter,
    'Mina can play. Mina can play. Mina can play.',
    'Mina can play. Mina can play. Mina can play.',
    'Mina can play. Mina can play. Mina can play.',
    'Mina can play. Mina can play. Mina can play.',
    'Mina can play. Mina can play. Mina can play.',
  ].join('\n\n\n')
}

function novel(
  firstChapter: string,
  overrides: Partial<StoryContent> = {},
): StoryContent {
  return makeStory('기초', {
    title: 'The Test Novel',
    chapterTitles: [
      'Morning',
      'Road',
      'Letter',
      'Rain',
      'Home',
      'Night',
    ],
    storyText: sixChapterText(firstChapter),
    ...overrides,
  })
}

function dictionaryWord(token: string, index: number): WordItem {
  return makeWord({
    id: `word-story-fixture-${index}`,
    word: token,
    lemma: token,
    familyId: `family-story-fixture-${index}`,
    entryOverrides: { forms: [token], examples: [] },
  })
}

function TestStoryView(props: ComponentProps<typeof StoryView>) {
  const providedWords = props.lookupWords ?? props.levelWords
  const knownForms = new Set(providedWords.flatMap((word) => word.entries.flatMap((entry) =>
    (Array.isArray(entry.forms) ? entry.forms : Object.values(entry.forms))
      .map((form) => form.toLowerCase()))))
  const textTokens = props.story.storyText.toLowerCase()
    .match(/[\p{L}\p{N}]+(?:['’~-][\p{L}\p{N}]+)*/gu) ?? []
  const fixtureWords = [...new Set(textTokens)]
    .filter((token) => token !== 'mina' && !knownForms.has(token))
    .map(dictionaryWord)

  return <StoryView {...props} lookupWords={[...providedWords, ...fixtureWords]} />
}

test('소설 화면은 별도 단어·표현 카드 없이 챕터 본문만 읽게 한다', () => {
  const story = novel('Mina can play. Mina can play.', {
    title: 'The Blue Bag',
  })

  render(<TestStoryView story={story} levelWords={[makeWord()]} />)
  const article = screen.getByRole('article')

  expect(within(article).getByRole('heading', { name: 'The Blue Bag' })).toBeInTheDocument()
  expect(within(article).getByText('챕터 1 / 6')).toBeInTheDocument()
  expect(within(article).getByRole('heading', { name: 'Morning' })).toBeInTheDocument()
  expect(article).toHaveTextContent('Mina can play. Mina can play.')
  expect(article).not.toHaveTextContent('이번 장면의 단어')
  expect(article).not.toHaveTextContent('이번 장면의 표현')
  expect(article).not.toHaveTextContent('전체 학습 단어')
  expect(article).not.toHaveTextContent('전체 학습 구동사')
})

test('다음 버튼은 1~2문장짜리 장면이 아니라 다음 챕터로 이동한다', async () => {
  const user = userEvent.setup()
  render(<TestStoryView story={novel('Mina can play.')} levelWords={[makeWord()]} />)

  await user.click(screen.getByRole('button', { name: '다음 챕터 (2)' }))

  expect(screen.getByText('챕터 2 / 6')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Road' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '이전 챕터' })).toBeEnabled()
})

test('본문 일반 단어를 누르면 같은 읽기 화면에서 뜻을 확인하고 원래 단어로 돌아간다', async () => {
  const user = userEvent.setup()
  render(<TestStoryView story={novel('Mina can play.')} levelWords={[makeWord()]} />)
  const trigger = screen.getAllByRole('button', { name: 'story word: play' })[0]!

  await user.click(trigger)
  expect(screen.getByRole('heading', { name: 'play 단어 상세' })).toBeInTheDocument()
  expect(screen.getByText('놀다')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '닫기' }))
  expect(trigger).toHaveFocus()
})

test('구동사 구성 단어는 각각 클릭되고 작은 구 표식은 정확한 본문 뜻과 문장을 연다', async () => {
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
      examples: ['Look up.'],
    },
  })
  const context = 'I wake up early.'
  const story = novel(context, {
    usedWords: [
      { lemma: 'wake', partOfSpeech: 'verb', forms: ['wake'] },
      { lemma: 'up', partOfSpeech: 'adverb', forms: ['up'] },
    ],
    usedPhrasalVerbs: [{
      id: phrasalVerb.id,
      phrasalVerb: phrasalVerb.phrasalVerb,
      storyForm: 'wake up',
      context,
      senseId: SENSE_ID,
      meaningKo: '잠에서 깨다',
    }],
  })

  render(
    <TestStoryView
      story={story}
      levelWords={[wake, up]}
      levelPhrasalVerbs={[phrasalVerb]}
    />,
  )

  const phrase = document.querySelector('[data-phrasal-verb="wake up"]')
  expect(phrase).not.toBeNull()
  const wakeTrigger = within(phrase as HTMLElement)
    .getByRole('button', { name: 'story word: wake' })
  const upTrigger = within(phrase as HTMLElement)
    .getByRole('button', { name: 'story word: up' })
  const phrasalTrigger = within(phrase as HTMLElement)
    .getByRole('button', { name: 'story phrasal verb: wake up' })

  expect(wakeTrigger).toHaveClass('story-word-button')
  expect(upTrigger).toHaveClass('story-word-button')
  expect(phrasalTrigger).toHaveClass('story-inline-phrasal__badge')
  expect(phrasalTrigger).toHaveTextContent('구')

  await user.click(wakeTrigger)
  expect(screen.getByRole('heading', { name: 'wake 단어 상세' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '닫기' }))

  await user.click(phrasalTrigger)
  expect(screen.getByRole('heading', { name: 'wake up 구동사 상세' })).toBeInTheDocument()
  expect(screen.getByText('잠에서 깨다')).toBeInTheDocument()
  expect(screen.getByText(context)).toBeInTheDocument()
})

test('승인 문장과 다른 곳의 같은 철자는 구동사 뜻을 잘못 열지 않는다', () => {
  const phrasalVerb = makePhrasalVerb()
  const wake = makeWord({
    id: 'word-wake',
    word: 'wake',
    lemma: 'wake',
    familyId: 'family-wake',
    entryOverrides: { partOfSpeech: 'verb', forms: ['wake'] },
  })
  const up = makeWord({
    id: 'word-up',
    word: 'up',
    lemma: 'up',
    familyId: 'family-up',
    entryOverrides: { partOfSpeech: 'adverb', forms: ['up'] },
  })
  const story = novel('I wake up late.', {
    usedWords: [
      { lemma: 'wake', partOfSpeech: 'verb', forms: ['wake'] },
      { lemma: 'up', partOfSpeech: 'adverb', forms: ['up'] },
    ],
    usedPhrasalVerbs: [{
      id: phrasalVerb.id,
      phrasalVerb: phrasalVerb.phrasalVerb,
      storyForm: 'wake up',
      context: 'I wake up early.',
      senseId: SENSE_ID,
      meaningKo: '잠에서 깨다',
    }],
  })

  render(
    <TestStoryView
      story={story}
      levelWords={[wake, up]}
      levelPhrasalVerbs={[phrasalVerb]}
    />,
  )

  expect(screen.queryByRole('button', { name: 'story phrasal verb: wake up' }))
    .not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'story word: wake' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'story word: up' })).toBeInTheDocument()
})
