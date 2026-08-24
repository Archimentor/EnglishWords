import type { Level, StoryContent, WordItem } from './types'

export const READER_CHAPTER_COUNT = 6
export const MIN_READER_CHAPTER_PARAGRAPHS = 5
export const MIN_READER_CHAPTER_SENTENCES = 12

export interface ReaderEditionChapter {
  id: string
  title: string
  text: string
}

export interface ReaderEdition {
  level: Level
  title: string
  chapters: readonly ReaderEditionChapter[]
}

export interface ReaderEditionAudit {
  chapterCount: number
  paragraphCounts: number[]
  sentenceCounts: number[]
  shortChapterIndexes: number[]
}

export function splitReaderChapters(storyText: string): string[] {
  return storyText
    .trim()
    .split(/\r?\n\s*\r?\n\s*\r?\n/gu)
    .map((chapter) => chapter.trim())
    .filter(Boolean)
}

function paragraphCount(text: string): number {
  return text.split(/\r?\n\s*\r?\n/gu).filter((paragraph) => paragraph.trim()).length
}

function sentenceCount(text: string): number {
  return text.match(/[^.!?]+[.!?]+/gu)?.length ?? 0
}

export function buildReaderEdition(
  story: Pick<
    StoryContent,
    'level' | 'title' | 'chapterTitles' | 'storyText' | 'usedPhrasalVerbs'
  >,
  _allowedWords: readonly WordItem[],
): ReaderEdition {
  const chapters = splitReaderChapters(story.storyText)
  if (chapters.length !== READER_CHAPTER_COUNT) {
    throw new Error(
      `${story.level} approved novel must contain exactly ${READER_CHAPTER_COUNT} substantial chapters.`,
    )
  }
  if (story.chapterTitles.length !== READER_CHAPTER_COUNT) {
    throw new Error(
      `${story.level} approved novel must provide exactly ${READER_CHAPTER_COUNT} chapter titles.`,
    )
  }

  return {
    level: story.level,
    title: story.title,
    chapters: chapters.map((text, index) => ({
      id: `${story.level}-reader-chapter-${index + 1}`,
      title: story.chapterTitles[index]!,
      text,
    })),
  }
}

export function auditReaderEdition(edition: ReaderEdition): ReaderEditionAudit {
  const paragraphCounts = edition.chapters.map(({ text }) => paragraphCount(text))
  const sentenceCounts = edition.chapters.map(({ text }) => sentenceCount(text))
  return {
    chapterCount: edition.chapters.length,
    paragraphCounts,
    sentenceCounts,
    shortChapterIndexes: edition.chapters.flatMap((_, index) =>
      paragraphCounts[index]! < MIN_READER_CHAPTER_PARAGRAPHS
      || sentenceCounts[index]! < MIN_READER_CHAPTER_SENTENCES
        ? [index]
        : []),
  }
}

export function readerNarrativeText(edition: ReaderEdition): string {
  return edition.chapters.map(({ text }) => text).join('\n\n\n')
}
