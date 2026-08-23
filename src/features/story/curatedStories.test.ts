import { makeStory } from '../../test/fixtures'
import type { Level } from '../../domain/content/types'
import { curatedStoryText } from './curatedStories'

const PRODUCTION_TITLES: Record<Level, string> = {
  기초: '빨간 공을 따라간 Mina',
  유치원: '빛을 잃은 이야기책',
  초등학교: '네 장의 편지와 비밀 정원',
  중학교: '도시의 마지막 기록',
}

const MIN_PARAGRAPHS: Record<Level, number> = {
  기초: 18,
  유치원: 22,
  초등학교: 28,
  중학교: 32,
}

const MAX_AVERAGE_SENTENCE_WORDS: Record<Level, number> = {
  기초: 9,
  유치원: 12,
  초등학교: 18,
  중학교: 24,
}

function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+/gu)?.map((sentence) => sentence.trim()) ?? []
}

function sentenceWordCount(sentence: string): number {
  return sentence.match(/[A-Za-z]+(?:['’~-][A-Za-z]+)*/gu)?.length ?? 0
}

function averageSentenceWords(text: string): number {
  const values = sentences(text)
  const wordCount = values.reduce((sum, sentence) =>
    sum + sentenceWordCount(sentence), 0)
  return values.length > 0 ? wordCount / values.length : 0
}

function duplicateMeaningfulSentences(values: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (sentenceWordCount(value) < 4) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([sentence, count]) => `${count}× ${sentence}`)
}

test.each(Object.keys(PRODUCTION_TITLES) as Level[])('%s 재작성본은 완결형 다문단 소설이다', (level) => {
  const story = makeStory(level, {
    title: PRODUCTION_TITLES[level],
    storyText: 'legacy source text',
  })
  const text = curatedStoryText(story)
  const paragraphs = text.split(/\n\s*\n/u).filter(Boolean)
  const storySentences = sentences(text)

  expect(text).not.toContain('legacy source text')
  expect(paragraphs.length).toBeGreaterThanOrEqual(MIN_PARAGRAPHS[level])
  expect(storySentences.length).toBeGreaterThan(paragraphs.length)
  expect(duplicateMeaningfulSentences(storySentences)).toEqual([])
  expect(paragraphs[0]).toMatch(/\bMina\b/u)
  expect(paragraphs.at(-1)).toMatch(/\bMina\b/u)
  expect(averageSentenceWords(text)).toBeLessThanOrEqual(MAX_AVERAGE_SENTENCE_WORDS[level])
})

test('기초와 유치원 본문에는 성인·정치·범죄 중심 어휘가 없다', () => {
  const banned = /\b(?:abortion|adultery|brothel|dildo|semen|sperm|incest|terrorism|parliament|election|fraud|prison|executioner|gun|shotgun|pistol|rifle)\b/iu

  for (const level of ['기초', '유치원'] as const) {
    const text = curatedStoryText(makeStory(level, { title: PRODUCTION_TITLES[level] }))
    expect(text).not.toMatch(banned)
  }
})

test('초등학교 본문은 하나의 비밀 정원 사건으로 시작해 같은 사건으로 끝난다', () => {
  const text = curatedStoryText(makeStory('초등학교', {
    title: PRODUCTION_TITLES.초등학교,
  }))

  expect(text).toMatch(/green envelope/u)
  expect(text).toMatch(/four hidden letters/u)
  expect(text).toMatch(/oldest tree/u)
  expect(text).toMatch(/plan to close the garden was stopped/u)
  expect(text).toMatch(/story people almost forgot/u)
})

test('중학교 본문은 기록 조사에서 검증·공개·복원까지 인과관계를 완결한다', () => {
  const text = curatedStoryText(makeStory('중학교', {
    title: PRODUCTION_TITLES.중학교,
  }))

  expect(text).toMatch(/blank space in the public archive/u)
  expect(text).toMatch(/created a timeline/u)
  expect(text).toMatch(/independent evidence/u)
  expect(text).toMatch(/Before publishing/u)
  expect(text).toMatch(/independent review group/u)
  expect(text).toMatch(/public record is never just the past/u)
})
