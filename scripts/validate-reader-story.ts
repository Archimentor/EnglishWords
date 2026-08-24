import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { readerPhrasalVerbMeanings } from '../src/domain/content/phrasalMeaning'
import { auditReaderEdition, buildReaderEdition } from '../src/domain/content/readerEdition'
import {
  readerStoryContextualPhrasalVerbs,
  readerStoryCoverage,
} from '../src/domain/content/readerStory'
import {
  englishStoryVocabularyText,
  inspectStoryVocabulary,
  storyProperNounTokens,
  storyVocabularyTokens,
} from '../src/domain/content/storyVocabulary'
import { LEVELS } from '../src/domain/content/types'
import type { Level, PhrasalVerbItem } from '../src/domain/content/types'
import { tokenizeStory } from '../src/features/story/storyTokens'
import { readCatalogFromDisk } from './catalog-files'

interface GlossRow {
  phrase: string
  senseId: string
}

interface GlossRegistry {
  glosses: GlossRow[]
}

interface LevelAudit {
  level: Level
  title: string
  chapters: number
  paragraphCounts: number[]
  sentenceCounts: number[]
  averageSentenceWords: number
  targetWordsUsed: number
  targetWordsAvailable: number
  targetCoverageRate: number
  contextualPhrasalVerbs: number
  clickableWordTokens: number
  clickablePhrasalUses: number
  properNounTokens: string[]
  duplicateSentences: string[]
  vocabularyViolations: string[]
  unclickableTokens: string[]
  phrasalIssues: string[]
}

const DATA_ROOT = resolve('public/data')
const REPORT_PATH = resolve('public/data/DEVELOPMENT/reader-story-coverage.json')
const MIN_AVERAGE_SENTENCE_WORDS: Readonly<Record<Level, number>> = {
  기초: 6,
  유치원: 7,
  초등학교: 9,
  중학교: 10,
}

function normalizedSentence(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase()
}

function storySentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+/gu) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function duplicateSentences(text: string): string[] {
  const counts = new Map<string, number>()
  for (const sentence of storySentences(text)) {
    const normalized = normalizedSentence(sentence)
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([sentence]) => sentence)
}

function lexicalBase(value: string): string {
  return value.replace(/[‘’]/gu, "'").replace(/'s$/u, '')
}

function unclickableStoryTokens(
  text: string,
  tokens: ReturnType<typeof tokenizeStory>,
): string[] {
  const properNouns = storyProperNounTokens(text)
  const unclickable = new Set<string>()
  for (const token of tokens) {
    if (token.type !== 'text') continue
    for (const lexical of storyVocabularyTokens(token.value)) {
      if (
        properNouns.has(lexical.normalized)
        || properNouns.has(lexicalBase(lexical.normalized))
      ) {
        continue
      }
      unclickable.add(lexical.normalized)
    }
  }
  return [...unclickable].sort()
}

function phrasalCatalogForLevel(
  level: Level,
  byLevel: Readonly<Record<Level, readonly PhrasalVerbItem[]>>,
): PhrasalVerbItem[] {
  return LEVELS
    .slice(0, LEVELS.indexOf(level) + 1)
    .flatMap((candidate) => byLevel[candidate])
}

async function main(): Promise<void> {
  const [catalog, glossRegistry] = await Promise.all([
    readCatalogFromDisk(DATA_ROOT),
    readFile(resolve('scripts/content/phrasal-glosses.json'), 'utf8')
      .then((value) => JSON.parse(value) as GlossRegistry),
  ])
  const allWords = LEVELS.flatMap((level) => catalog.wordlists[level])
  const glossesByPhrase = new Map(glossRegistry.glosses.map((row) => [row.phrase, row]))
  const audits: LevelAudit[] = []
  const failures: string[] = []

  for (const level of LEVELS) {
    const levelIndex = LEVELS.indexOf(level)
    const story = catalog.stories[level]
    const targetWords = catalog.wordlists[level]
    const allowedWords = LEVELS
      .slice(0, levelIndex + 1)
      .flatMap((candidate) => catalog.wordlists[candidate])
    const allowedPhrasals = phrasalCatalogForLevel(level, catalog.phrasalVerbs.byLevel)
    const edition = buildReaderEdition(story, allowedWords)
    const chapterAudit = auditReaderEdition(edition)
    const vocabulary = inspectStoryVocabulary(
      story.storyText,
      allowedWords,
      allWords,
      story.usedPhrasalVerbs,
    )
    const frontMatterVocabulary = inspectStoryVocabulary(
      englishStoryVocabularyText([story.title, ...story.chapterTitles].join('. ')),
      allowedWords,
      allWords,
    )
    const contextualPhrasals = readerStoryContextualPhrasalVerbs(
      story.storyText,
      story.usedPhrasalVerbs,
      allowedPhrasals,
    )
    const storyTokens = tokenizeStory(
      story.storyText,
      story.usedWords,
      allowedWords,
      contextualPhrasals,
    )
    const unclickableTokens = unclickableStoryTokens(story.storyText, storyTokens)
    const coverage = readerStoryCoverage(
      story.storyText,
      targetWords,
      allowedPhrasals.filter(({ id }) =>
        story.usedPhrasalVerbs.some((use) => use.id === id)),
      story.usedPhrasalVerbs,
    )
    const sentences = storySentences(story.storyText)
    const averageSentenceWords = sentences.length === 0
      ? 0
      : storyVocabularyTokens(story.storyText).length / sentences.length
    const repeated = duplicateSentences(story.storyText)
    const catalogById = new Map(allowedPhrasals.map((item) => [item.id, item]))
    const phrasalIssues: string[] = []

    for (const use of story.usedPhrasalVerbs) {
      const item = catalogById.get(use.id)
      const gloss = glossesByPhrase.get(use.phrasalVerb)
      if (!item) {
        phrasalIssues.push(`${use.phrasalVerb}: not in cumulative level catalog`)
        continue
      }
      if (!gloss || gloss.senseId !== use.senseId) {
        phrasalIssues.push(`${use.phrasalVerb}: senseId does not match sense registry`)
      }
      if (readerPhrasalVerbMeanings(item)[0] !== use.meaningKo) {
        phrasalIssues.push(`${use.phrasalVerb}: displayed Korean meaning is stale`)
      }
      if (!contextualPhrasals.some((candidate) =>
        candidate.item.id === use.id
        && candidate.form === use.storyForm
        && candidate.context === use.context
        && candidate.meaningKo === use.meaningKo)) {
        phrasalIssues.push(`${use.phrasalVerb}: exact form/context is not clickable`)
      }
    }

    const targetCoverageRate = coverage.wordTotalCount === 0
      ? 0
      : coverage.wordCoveredCount / coverage.wordTotalCount
    const levelFailures = [
      ...(chapterAudit.shortChapterIndexes.length > 0
        ? [`short chapters ${chapterAudit.shortChapterIndexes.map((index) => index + 1).join(', ')}`]
        : []),
      ...(vocabulary.violations.length > 0
        ? [`vocabulary violations ${vocabulary.violations.map(({ token }) => token).join(', ')}`]
        : []),
      ...(frontMatterVocabulary.violations.length > 0
        ? [`title violations ${frontMatterVocabulary.violations.map(({ token }) => token).join(', ')}`]
        : []),
      ...(unclickableTokens.length > 0
        ? [`unclickable tokens ${unclickableTokens.join(', ')}`]
        : []),
      ...(contextualPhrasals.length !== story.usedPhrasalVerbs.length
        ? ['not every recorded phrasal use resolves in the displayed prose']
        : []),
      ...(phrasalIssues.length > 0 ? phrasalIssues : []),
      ...(repeated.length > 0 ? [`duplicate sentences ${repeated.join(' | ')}`] : []),
      ...(averageSentenceWords < MIN_AVERAGE_SENTENCE_WORDS[level]
        ? [`average sentence length ${averageSentenceWords.toFixed(2)} is too short`]
        : []),
      ...(Math.abs(story.coverage.coverageRate - targetCoverageRate) > 1e-12
        ? ['stored target coverage rate does not match displayed prose']
        : []),
      ...(story.coverage.allowUpperLevelWords !== false
        ? ['upper-level words are allowed by metadata']
        : []),
      ...(story.coverage.mustCoverAll
        ? ['mustCoverAll would force a catalog list into the novel']
        : []),
    ]
    failures.push(...levelFailures.map((failure) => `${level}: ${failure}`))
    audits.push({
      level,
      title: story.title,
      chapters: chapterAudit.chapterCount,
      paragraphCounts: chapterAudit.paragraphCounts,
      sentenceCounts: chapterAudit.sentenceCounts,
      averageSentenceWords: Number(averageSentenceWords.toFixed(2)),
      targetWordsUsed: coverage.wordCoveredCount,
      targetWordsAvailable: coverage.wordTotalCount,
      targetCoverageRate,
      contextualPhrasalVerbs: contextualPhrasals.length,
      clickableWordTokens: storyTokens.filter(({ type }) => type === 'word').length,
      clickablePhrasalUses: storyTokens.filter(({ type }) => type === 'phrasalVerb').length,
      properNounTokens: [...storyProperNounTokens(story.storyText)].sort(),
      duplicateSentences: repeated,
      vocabularyViolations: [
        ...vocabulary.violations.map(({ token }) => token),
        ...frontMatterVocabulary.violations.map(({ token }) => token),
      ],
      unclickableTokens,
      phrasalIssues,
    })
  }

  await writeFile(REPORT_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    contract: {
      chapterCount: 6,
      minimumParagraphsPerChapter: 5,
      minimumSentencesPerChapter: 12,
      separateVocabularyCards: false,
      separatePhrasalVerbCards: false,
      cumulativeVocabularyByLevel: true,
      properNounsAllowedAtEveryLevel: true,
      actualProseTokensMustBeClickable: true,
      phrasalMeaningsBoundToExactContext: true,
    },
    levels: audits,
  }, null, 2)}\n`, 'utf8')

  if (failures.length > 0) throw new Error(failures.join('\n'))
  for (const audit of audits) {
    console.log(
      `${audit.level}: ${audit.chapters} chapters, `
      + `${audit.sentenceCounts.reduce((sum, count) => sum + count, 0)} sentences, `
      + `${audit.targetWordsUsed}/${audit.targetWordsAvailable} target words, `
      + `${audit.contextualPhrasalVerbs} contextual phrasal verbs, `
      + `${audit.unclickableTokens.length} unclickable tokens`,
    )
  }
  console.log(`Reader-story audit passed. Report: ${REPORT_PATH}`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
