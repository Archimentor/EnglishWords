import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
const REPORT_PATH = resolve('public/data/DEVELOPMENT/reader-story-coverage.json')

interface LevelReport {
  words: { covered: number; total: number; missing: string[] }
  phrasalVerbs: { covered: number; total: number; missing: string[] }
  paragraphs: { curated: number; reader: number }
  sentences: { total: number; unique: number; repeated: number }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as T
}

function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+/gu)?.map((sentence) => sentence.trim()) ?? []
}

function paragraphCount(text: string): number {
  return text.split(/\n\s*\n/u).filter((paragraph) => paragraph.trim()).length
}

let failed = false
const report = {} as Record<Level, LevelReport>

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
  const readerSentences = sentences(readerText)
  const uniqueSentenceCount = new Set(readerSentences).size

  report[level] = {
    words: {
      covered: coverage.wordCoveredCount,
      total: coverage.wordTotalCount,
      missing: coverage.missingWordLemmas,
    },
    phrasalVerbs: {
      covered: coverage.phrasalVerbCoveredCount,
      total: coverage.phrasalVerbTotalCount,
      missing: coverage.missingPhrasalVerbs,
    },
    paragraphs: {
      curated: paragraphCount(baseText),
      reader: paragraphCount(readerText),
    },
    sentences: {
      total: readerSentences.length,
      unique: uniqueSentenceCount,
      repeated: readerSentences.length - uniqueSentenceCount,
    },
  }

  console.log([
    `[reader-story] ${level}`,
    `words=${coverage.wordCoveredCount}/${coverage.wordTotalCount}`,
    `phrasals=${coverage.phrasalVerbCoveredCount}/${coverage.phrasalVerbTotalCount}`,
    `paragraphs=${paragraphCount(readerText)}`,
    `sentences=${readerSentences.length}`,
    `repeated=${readerSentences.length - uniqueSentenceCount}`,
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

await mkdir(resolve('public/data/DEVELOPMENT'), { recursive: true })
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

if (failed) {
  process.exitCode = 1
} else {
  console.log('[reader-story] PASS: actual displayed reader stories cover every level word and phrasal verb.')
}
