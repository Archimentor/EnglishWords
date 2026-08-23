import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  buildReaderStoryText,
  readerStoryCoverage,
} from '../src/domain/content/readerStory'
import type {
  Level,
  PhrasalVerbItem,
  StoryContent,
  WordItem,
} from '../src/domain/content/types'
import { LEVELS } from '../src/domain/content/types'
import { curatedStoryText } from '../src/features/story/curatedStories'

const WORD_TARGETS: Readonly<Record<Level, number>> = {
  기초: 500,
  유치원: 500,
  초등학교: 1_500,
  중학교: 2_500,
}
const PHRASAL_TARGET = 250

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as T
}

function sentenceCount(text: string): number {
  return text.match(/[^.!?]+[.!?]+/gu)?.length ?? 0
}

function paragraphCount(text: string): number {
  return text.split(/\n\s*\n/u).filter((paragraph) => paragraph.trim()).length
}

let failed = false

for (const level of LEVELS) {
  const [words, phrasalVerbs, story] = await Promise.all([
    readJson<WordItem[]>(`public/data/wordlists/${level}.json`),
    readJson<PhrasalVerbItem[]>(`public/data/phrasal-verbs/by-level/${level}.json`),
    readJson<StoryContent>(`public/data/stories/${level}.json`),
  ])

  if (words.length !== WORD_TARGETS[level]) {
    console.error(`[reader-story] ${level}: word catalog ${words.length} != target ${WORD_TARGETS[level]}`)
    failed = true
  }
  if (phrasalVerbs.length !== PHRASAL_TARGET) {
    console.error(`[reader-story] ${level}: phrasal catalog ${phrasalVerbs.length} != target ${PHRASAL_TARGET}`)
    failed = true
  }

  const baseText = curatedStoryText(story)
  const readerText = buildReaderStoryText(baseText, level, words, phrasalVerbs)
  const coverage = readerStoryCoverage(readerText, words, phrasalVerbs)

  console.log([
    `[reader-story] ${level}`,
    `words=${coverage.wordCoveredCount}/${coverage.wordTotalCount}`,
    `phrasals=${coverage.phrasalVerbCoveredCount}/${coverage.phrasalVerbTotalCount}`,
    `paragraphs=${paragraphCount(readerText)}`,
    `sentences=${sentenceCount(readerText)}`,
  ].join(' '))

  if (coverage.missingWordIds.length > 0) {
    console.error(
      `[reader-story] ${level}: missing words (${coverage.missingWordIds.length}) ${coverage.missingWordLemmas.slice(0, 40).join(', ')}`,
    )
    failed = true
  }
  if (coverage.missingPhrasalVerbIds.length > 0) {
    console.error(
      `[reader-story] ${level}: missing phrasals (${coverage.missingPhrasalVerbIds.length}) ${coverage.missingPhrasalVerbs.slice(0, 40).join(', ')}`,
    )
    failed = true
  }

  const baseFirstParagraph = baseText.split(/\n\s*\n/u).find(Boolean)?.trim() ?? ''
  const baseLastParagraph = baseText.split(/\n\s*\n/u).filter(Boolean).at(-1)?.trim() ?? ''
  if (!readerText.startsWith(baseFirstParagraph) || !readerText.endsWith(baseLastParagraph)) {
    console.error(`[reader-story] ${level}: curated opening or resolution was displaced.`)
    failed = true
  }
}

if (failed) {
  process.exitCode = 1
} else {
  console.log('[reader-story] PASS: actual displayed reader stories cover every level word and phrasal verb.')
}
