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
const MAX_REPEATED_SENTENCE_RATE = 0.2
const MAX_AVERAGE_SENTENCE_WORDS: Readonly<Record<Level, number>> = {
  기초: 15,
  유치원: 18,
  초등학교: 24,
  중학교: 32,
}
const MECHANICAL_LABEL = /\b(?:Trail step|Story page|Garden record|Archive file)\s+\d+\s*:/giu
const LEGACY_FIXED_FRAME = /\b(?:Before Mina leaves the place, the blue bird notices a small note nearby|A little farther on, Mina finds a folded paper beside the red path|Before the page turns again, the storybook shows Mina, Joon, and Sara a few short lines|Before leaving the area, Mina finds another bundle connected to the garden’s history|Before moving to the next source, Mina reviews another set of Riverside records beside her timeline)\b/gu
const LEGACY_SCENE_CLOSER = /with “[A-Za-z][A-Za-z'’-]*” still in mind\./gu
const LOW_LEVEL_BANNED: Readonly<Record<Level, readonly string[]>> = {
  기초: ['abortion', 'adultery', 'army', 'arson', 'brothel', 'election', 'executioner', 'fraud', 'gun', 'jail', 'murder', 'parliament', 'pistol', 'poison', 'porn', 'prison', 'prostitute', 'rifle', 'riot', 'sex', 'suicide', 'terrorism', 'war', 'weapon'],
  유치원: ['abortion', 'adultery', 'army', 'arson', 'brothel', 'executioner', 'fraud', 'gun', 'jail', 'murder', 'parliament', 'pistol', 'poison', 'porn', 'prison', 'prostitute', 'rifle', 'riot', 'sex', 'suicide', 'terrorism', 'weapon'],
  초등학교: ['abortion', 'adultery', 'brothel', 'dildo', 'executioner', 'porn', 'prostitute', 'semen', 'sperm', 'suicide'],
  중학교: [],
}

interface RepeatedSentenceSample {
  sentence: string
  count: number
}

interface LevelReport {
  words: { covered: number; total: number; missing: string[] }
  phrasalVerbs: { covered: number; total: number; missing: string[] }
  paragraphs: { curated: number; reader: number }
  sentences: {
    total: number
    unique: number
    repeated: number
    repeatedRate: number
    averageWords: number
    maxWords: number
    repeatedSamples: RepeatedSentenceSample[]
  }
  quality: {
    mechanicalLabels: number
    legacyFixedFrames: number
    legacySceneClosers: number
    lowLevelUnsafeHits: string[]
    fallbackLikeSentences: number
  }
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

function sentenceWordCount(sentence: string): number {
  return sentence.match(/[A-Za-z]+(?:['’~-][A-Za-z]+)*/gu)?.length ?? 0
}

function repeatedSentenceSamples(values: readonly string[]): RepeatedSentenceSample[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([sentence, count]) => ({ sentence, count }))
}

function bannedHits(level: Level, text: string): string[] {
  const lower = text.toLowerCase()
  return LOW_LEVEL_BANNED[level]
    .filter((term) => new RegExp(`\\b${term}\\b`, 'u').test(lower))
}

function fallbackLikeSentenceCount(values: readonly string[]): number {
  return values.filter((sentence) =>
    /[“”]/u.test(sentence)
    && /\b(?:uses?|shows?|includes?|mentions?|marked?|reference|label|expression|line|record|note|page|card)\b/iu.test(sentence),
  ).length
}

let failed = false
const report = {} as Record<Level, LevelReport>
const wordlists = {} as Record<Level, WordItem[]>

for (const level of LEVELS) {
  wordlists[level] = await readJson<WordItem[]>(`public/data/wordlists/${level}.json`)
}

for (const level of LEVELS) {
  const words = wordlists[level]
  const [phrasalVerbs, story] = await Promise.all([
    readJson<PhrasalVerbItem[]>(`public/data/phrasal-verbs/by-level/${level}.json`),
    readJson<StoryContent>(`public/data/stories/${level}.json`),
  ])
  const allowedWords = LEVELS
    .slice(0, LEVELS.indexOf(level) + 1)
    .flatMap((lookupLevel) => wordlists[lookupLevel])

  if (words.length !== WORD_TARGETS[level]) {
    console.error(`[reader-story] ${level}: word catalog ${words.length} != target ${WORD_TARGETS[level]}`)
    failed = true
  }
  if (phrasalVerbs.length !== PHRASAL_TARGET) {
    console.error(`[reader-story] ${level}: phrasal catalog ${phrasalVerbs.length} != target ${PHRASAL_TARGET}`)
    failed = true
  }

  const baseText = curatedStoryText(story)
  const readerText = buildReaderStoryText(
    baseText,
    level,
    words,
    phrasalVerbs,
    allowedWords,
  )
  const coverage = readerStoryCoverage(readerText, words, phrasalVerbs)
  const readerSentences = sentences(readerText)
  const uniqueSentenceCount = new Set(readerSentences).size
  const repeated = readerSentences.length - uniqueSentenceCount
  const repeatedRate = readerSentences.length > 0 ? repeated / readerSentences.length : 0
  const wordCounts = readerSentences.map(sentenceWordCount)
  const averageWords = wordCounts.length > 0
    ? wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length
    : 0
  const maxWords = Math.max(0, ...wordCounts)
  const mechanicalLabels = readerText.match(MECHANICAL_LABEL)?.length ?? 0
  const legacyFixedFrames = readerText.match(LEGACY_FIXED_FRAME)?.length ?? 0
  const legacySceneClosers = readerText.match(LEGACY_SCENE_CLOSER)?.length ?? 0
  const unsafeHits = bannedHits(level, readerText)
  const fallbackLikeSentences = fallbackLikeSentenceCount(readerSentences)

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
      repeated,
      repeatedRate: Number(repeatedRate.toFixed(4)),
      averageWords: Number(averageWords.toFixed(2)),
      maxWords,
      repeatedSamples: repeatedSentenceSamples(readerSentences),
    },
    quality: {
      mechanicalLabels,
      legacyFixedFrames,
      legacySceneClosers,
      lowLevelUnsafeHits: unsafeHits,
      fallbackLikeSentences,
    },
  }

  console.log([
    `[reader-story] ${level}`,
    `words=${coverage.wordCoveredCount}/${coverage.wordTotalCount}`,
    `phrasals=${coverage.phrasalVerbCoveredCount}/${coverage.phrasalVerbTotalCount}`,
    `paragraphs=${paragraphCount(readerText)}`,
    `sentences=${readerSentences.length}`,
    `repeated=${repeated} (${(repeatedRate * 100).toFixed(1)}%)`,
    `avgWords=${averageWords.toFixed(1)}`,
    `fallbackLike=${fallbackLikeSentences}`,
    `legacyFrames=${legacyFixedFrames + legacySceneClosers}`,
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
  if (mechanicalLabels > 0) {
    console.error(`[reader-story] ${level}: found ${mechanicalLabels} mechanical scene labels.`)
    failed = true
  }
  if (legacyFixedFrames > 0 || legacySceneClosers > 0) {
    console.error(
      `[reader-story] ${level}: found ${legacyFixedFrames} legacy fixed openings and ${legacySceneClosers} legacy scene closers.`,
    )
    failed = true
  }
  if (repeatedRate > MAX_REPEATED_SENTENCE_RATE) {
    console.error(
      `[reader-story] ${level}: repeated sentence rate ${(repeatedRate * 100).toFixed(1)}% exceeds ${(MAX_REPEATED_SENTENCE_RATE * 100).toFixed(0)}%.`,
    )
    failed = true
  }
  if (averageWords > MAX_AVERAGE_SENTENCE_WORDS[level]) {
    console.error(
      `[reader-story] ${level}: average sentence length ${averageWords.toFixed(1)} exceeds ${MAX_AVERAGE_SENTENCE_WORDS[level]} words.`,
    )
    failed = true
  }
  if (unsafeHits.length > 0) {
    console.error(`[reader-story] ${level}: unsafe level terms remain: ${unsafeHits.join(', ')}.`)
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
  console.log('[reader-story] PASS: coverage and narrative quality gates passed for every displayed reader story.')
}
