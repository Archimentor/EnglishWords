import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  auditReaderEdition,
  buildReaderEdition,
  MAX_READER_CHAPTER_COUNT,
  MIN_READER_CHAPTER_COUNT,
  MIN_READER_CHAPTER_PARAGRAPHS,
  MIN_READER_CHAPTER_SENTENCES,
  readerNarrativeText,
} from '../src/domain/content/readerEdition'
import {
  englishStoryVocabularyText,
  inspectStoryVocabulary,
} from '../src/domain/content/storyVocabulary'
import { LEVELS } from '../src/domain/content/types'
import type { Level, StoryContent, WordItem } from '../src/domain/content/types'

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as T
}

const wordlists = Object.fromEntries(LEVELS.map((level) => [
  level,
  readJson<WordItem[]>(`public/data/wordlists/${level}.json`),
])) as Record<Level, WordItem[]>
const stories = Object.fromEntries(LEVELS.map((level) => [
  level,
  readJson<StoryContent>(`public/data/stories/${level}.json`),
])) as Record<Level, StoryContent>

function allowedWords(level: Level): WordItem[] {
  return LEVELS
    .slice(0, LEVELS.indexOf(level) + 1)
    .flatMap((candidateLevel) => wordlists[candidateLevel])
}

describe('챕터형 레벨별 소설', () => {
  test.each(LEVELS)('%s 소설은 짧은 장면 묶음이 아니라 충분한 분량의 챕터로 구성된다', (level) => {
    const story = stories[level]
    const edition = buildReaderEdition(story, allowedWords(level))
    const audit = auditReaderEdition(edition)
    const chapterCount = edition.chapters.length

    expect(chapterCount).toBeGreaterThanOrEqual(MIN_READER_CHAPTER_COUNT)
    expect(chapterCount).toBeLessThanOrEqual(MAX_READER_CHAPTER_COUNT)
    expect(story.chapterTitles).toHaveLength(chapterCount)
    expect(new Set(story.chapterTitles).size).toBe(chapterCount)
    expect(new Set(edition.chapters.map(({ text }) => text)).size).toBe(chapterCount)
    expect(audit.chapterCount).toBe(chapterCount)
    expect(audit.paragraphCounts.every(
      (count) => count >= MIN_READER_CHAPTER_PARAGRAPHS,
    )).toBe(true)
    expect(audit.sentenceCounts.every(
      (count) => count >= MIN_READER_CHAPTER_SENTENCES,
    )).toBe(true)
    expect(audit.shortChapterIndexes).toEqual([])
    expect(readerNarrativeText(edition)).toBe(story.storyText.trim())
  })

  test.each(LEVELS)('%s 제목과 본문은 해당 레벨까지의 누적 어휘 경계를 지킨다', (level) => {
    const story = stories[level]
    const allowed = allowedWords(level)
    const frontMatter = [story.title, ...story.chapterTitles].join('. ')

    expect(inspectStoryVocabulary(
      story.storyText,
      allowed,
      allowed,
      story.usedPhrasalVerbs,
    ).violations).toEqual([])
    expect(inspectStoryVocabulary(
      englishStoryVocabularyText(frontMatter),
      allowed,
    ).violations).toEqual([])
  })

  test.each(LEVELS)('%s 리더 에디션 생성은 결정적이며 원고를 재작성하지 않는다', (level) => {
    const allowed = allowedWords(level)
    const first = buildReaderEdition(stories[level], allowed)
    const second = buildReaderEdition(stories[level], allowed)

    expect(first).toEqual(second)
    expect(first.chapters.map(({ title }) => title)).toEqual(stories[level].chapterTitles)
  })
})
