import { expect, test } from 'vitest'

import {
  buildReaderStoryText,
  readerStoryContextualPhrasalVerbs,
  readerStoryCoverage,
  readerStoryPhrasalVerbs,
} from './readerStory'
import { inspectStoryVocabulary } from './storyVocabulary'
import type { Level, PhrasalVerbItem, StoryContent, WordItem } from './types'

const TEST_SENSE_ID = 'a'.repeat(64)

function word(
  lemma: string,
  options: {
    id?: string
    level?: Level
    partOfSpeech?: string
    forms?: string[]
  } = {},
): WordItem {
  return {
    id: options.id ?? `word-${lemma}`,
    word: lemma,
    lemma,
    level: options.level ?? '기초',
    familyId: `${options.id ?? lemma}-family`,
    isFamilyHead: true,
    difficulty: 'veryEasy',
    entries: [{
      partOfSpeech: options.partOfSpeech ?? 'noun',
      forms: options.forms ?? [lemma],
      meanings: ['테스트'],
      ipa: '/test/',
      examples: [],
    }],
  }
}

function phrasal(
  id: string,
  phrasalVerb: string,
  examples: string[],
): PhrasalVerbItem {
  const [baseVerb, ...particles] = phrasalVerb.split(' ')
  return {
    id,
    baseVerb: baseVerb!,
    particle: particles.join(' '),
    phrasalVerb,
    ipa: '/test/',
    levelHint: '기초',
    meaningKo: ['돌보다'],
    examples,
    partOfSpeech: 'phrasalVerb',
    usageNotes: '등록된 본문 문맥에 맞는 뜻만 표시합니다.',
    difficulty: 'veryEasy',
  }
}

function contextualUse(
  item: PhrasalVerbItem,
  context: string,
  storyForm = item.phrasalVerb,
): StoryContent['usedPhrasalVerbs'][number] {
  return {
    id: item.id,
    phrasalVerb: item.phrasalVerb,
    storyForm,
    context,
    senseId: TEST_SENSE_ID,
    meaningKo: '돌보다',
  }
}

const ALLOWED_WORDS = [
  word('a'),
  word('be', { forms: ['be', 'is'] }),
  word('happy', { partOfSpeech: 'adjective' }),
  word('have', { forms: ['have', 'has'], partOfSpeech: 'verb' }),
  word('look', { partOfSpeech: 'verb' }),
  word('after'),
  word('map'),
  word('story'),
]

test('표시 소설은 승인 본문을 그대로 보존하고 별도 암기 문장을 덧붙이지 않는다', () => {
  const base = 'Mina has a map.\n\nMina is happy.'

  const text = buildReaderStoryText(base, '기초', ALLOWED_WORDS)

  expect(text).toBe(base)
  expect(inspectStoryVocabulary(text, ALLOWED_WORDS).violations).toEqual([])
})

test('누적 하위 어휘와 고유명사는 허용하지만 상위 일반 단어는 거부한다', () => {
  expect(() => buildReaderStoryText(
    'Mina has a story.',
    '유치원',
    ALLOWED_WORDS,
  )).not.toThrow()
  expect(() => buildReaderStoryText(
    'Mina discovered a story.',
    '유치원',
    ALLOWED_WORDS,
  )).toThrow(/disallowed token\(s\): discovered/u)
})

test('구성어가 허용 범위 안에 있는 구동사만 후보로 삼는다', () => {
  const phrasals = [
    phrasal('look-after', 'look after', ['Mina will look after Joon.']),
    phrasal('wake-up', 'wake up', ['Mina will wake up.']),
  ]

  expect(readerStoryPhrasalVerbs(phrasals, ALLOWED_WORDS)
    .map(({ phrasalVerb }) => phrasalVerb)).toEqual(['look after'])
})

test('구동사는 정확한 본문 문장·표면형·문맥 뜻이 함께 맞을 때만 연결한다', () => {
  const item = phrasal('look-after', 'look after', [
    'Mina will look after Joon.',
    'Sara can look after the bird.',
  ])
  const context = 'Mina will look after Joon.'
  const use = contextualUse(item, context)

  expect(readerStoryContextualPhrasalVerbs(context, [use], [item])).toEqual([{
    item,
    form: 'look after',
    context,
    meaningKo: '돌보다',
  }])
  expect(readerStoryContextualPhrasalVerbs(
    'Mina will look after a map.',
    [use],
    [item],
  )).toEqual([])
})

test('문장 안에 없는 표면형이나 불완전한 sense ID는 구동사 뜻을 열지 않는다', () => {
  const item = phrasal('look-after', 'look after', ['Mina will look after Joon.'])
  const context = item.examples[0]!
  const wrongForm = contextualUse(item, context, 'looked after')
  const wrongSense = { ...contextualUse(item, context), senseId: 'not-a-digest' }

  expect(readerStoryContextualPhrasalVerbs(context, [wrongForm], [item])).toEqual([])
  expect(readerStoryContextualPhrasalVerbs(context, [wrongSense], [item])).toEqual([])
})

test('커버리지는 별도 카드가 아니라 실제 본문에 나타난 항목만 센다', () => {
  const map = ALLOWED_WORDS.find(({ lemma }) => lemma === 'map')!
  const item = phrasal('look-after', 'look after', ['Mina will look after Joon.'])
  const context = 'Mina will look after Joon.'
  const coverage = readerStoryCoverage(
    `Mina has a map. ${context}`,
    [map],
    [item],
    [contextualUse(item, context)],
  )

  expect(coverage.wordCoveredCount).toBe(1)
  expect(coverage.phrasalVerbCoveredCount).toBe(1)
  expect(coverage.missingPhrasalVerbs).toEqual([])
})
