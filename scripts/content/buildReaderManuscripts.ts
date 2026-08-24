import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { auditReaderEdition, buildReaderEdition } from '../../src/domain/content/readerEdition'
import { readerPhrasalVerbMeanings } from '../../src/domain/content/phrasalMeaning'
import {
  readerStoryContextualPhrasalVerbs,
  readerStoryCoverage,
} from '../../src/domain/content/readerStory'
import { entryFormStrings, hasWholeWordForm } from '../../src/domain/content/storyForms'
import {
  englishStoryVocabularyText,
  inspectStoryVocabulary,
  inspectStoryVocabularyOccurrences,
} from '../../src/domain/content/storyVocabulary'
import { LEVELS } from '../../src/domain/content/types'
import type {
  Level,
  PhrasalVerbItem,
  StoryContent,
  WordItem,
} from '../../src/domain/content/types'
import { tokenizeStory } from '../../src/features/story/storyTokens'
import { manualStorySourceDigest } from './catalogDigest'
import { detectPhrasalUseSurface } from './storyPhrasalSurface'

interface ReaderManuscript {
  title: string
  chapterTitles: string[]
  chapters: string[][]
}

interface GlossRow {
  phrase: string
  senseId: string
  meaningKo: string
  englishDescription: string
}

interface GlossRegistry {
  glosses: GlossRow[]
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as T
}

function argumentValue(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

function parseLevel(): Level {
  const level = argumentValue('--level')
  if (!LEVELS.includes(level as Level)) throw new Error(`Use --level=${LEVELS.join('|')}`)
  return level as Level
}

function sentenceAt(text: string, index: number): string | undefined {
  return [...text.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/gu)]
    .find((match) => index >= match.index && index < match.index + match[0].length)
    ?.[0]
    .trim()
}

function sentenceContextsForToken(text: string, token: string): string[] {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/gu) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => hasWholeWordForm(sentence, token))
}

function storyWordUses(
  storyText: string,
  words: readonly WordItem[],
): StoryContent['usedWords'] {
  return words.flatMap((word) => {
    for (const entry of word.entries) {
      const form = entryFormStrings(entry).find((candidate) =>
        hasWholeWordForm(storyText, candidate))
      if (form) {
        return [{
          lemma: word.lemma,
          partOfSpeech: entry.partOfSpeech,
          forms: [form],
        }]
      }
    }
    return []
  })
}

async function main(): Promise<void> {
  const level = parseLevel()
  const summaryOnly = process.argv.includes('--summary')
  const missingOnly = process.argv.includes('--missing-only')
  const violationsOnly = process.argv.includes('--violations-only')
  const violationSentencesOnly = process.argv.includes('--violation-sentences')
  const tokensOnly = process.argv.includes('--tokens-only')
  const missingOffset = Number(argumentValue('--missing-offset') ?? 0)
  const missingLimit = Number(argumentValue('--missing-limit') ?? Number.MAX_SAFE_INTEGER)
  const violationOffset = Number(argumentValue('--violation-offset') ?? 0)
  const violationLimit = Number(argumentValue('--violation-limit') ?? Number.MAX_SAFE_INTEGER)
  const sentenceOffset = Number(argumentValue('--sentence-offset') ?? 0)
  const sentenceLimit = Number(argumentValue('--sentence-limit') ?? Number.MAX_SAFE_INTEGER)
  const contextToken = argumentValue('--context-token')
  const phrasalDebug = argumentValue('--phrasal-debug')
  const levelIndex = LEVELS.indexOf(level)
  const [manuscript, glossRegistry, ...catalogLists] = await Promise.all([
    readJson<ReaderManuscript>(`scripts/content/reader-manuscripts/${level}.json`),
    readJson<GlossRegistry>('scripts/content/phrasal-glosses.json'),
    ...LEVELS.flatMap((candidate) => [
      readJson<WordItem[]>(`public/data/wordlists/${candidate}.json`),
      readJson<PhrasalVerbItem[]>(`public/data/phrasal-verbs/by-level/${candidate}.json`),
    ]),
  ])
  const wordlists = catalogLists.filter((_, index) => index % 2 === 0) as WordItem[][]
  const phrasalLists = catalogLists.filter((_, index) => index % 2 === 1) as PhrasalVerbItem[][]
  const targetWords = wordlists[levelIndex]!
  const targetPhrasals = phrasalLists[levelIndex]!
  const allCatalogWords = wordlists.flat()
  const allCatalogPhrasals = phrasalLists.flat()
  const allowedWords = wordlists.slice(0, levelIndex + 1).flat()
  const allowedPhrasals = phrasalLists.slice(0, levelIndex + 1).flat()
  const storyText = manuscript.chapters
    .map((paragraphs) => paragraphs.join('\n\n'))
    .join('\n\n\n')
  const glossByPhrase = new Map(glossRegistry.glosses.map((row) => [row.phrase, row]))
  const bindingIssues: string[] = []
  const usedPhrasalVerbs = targetPhrasals.flatMap((item) => {
    const gloss = glossByPhrase.get(item.phrasalVerb)
    if (!gloss) {
      bindingIssues.push(`${item.phrasalVerb}: missing audited gloss`)
      return []
    }
    const use = detectPhrasalUseSurface(storyText, item)
    const context = use ? sentenceAt(storyText, use.start) : undefined
    if (!use || !context) {
      bindingIssues.push(`${item.phrasalVerb}: no grammatical story use found`)
      return []
    }
    return [{
      id: item.id,
      phrasalVerb: item.phrasalVerb,
      storyForm: use.form,
      context,
      senseId: gloss.senseId,
      meaningKo: readerPhrasalVerbMeanings(item)[0] ?? gloss.meaningKo,
    }]
  })
  const declaredPhrases = new Set(targetPhrasals.map(({ phrasalVerb }) => phrasalVerb))
  const unboundPhrasalSurfaces = allCatalogPhrasals.flatMap((item) => {
    const use = detectPhrasalUseSurface(storyText, item)
    const lexicalPartCount = use?.form.match(/[A-Za-z]+(?:['’~-][A-Za-z]+)*/gu)?.length ?? 0
    // Adjacent verb-particle spellings are reliably phrases. Wider spans can
    // also be ordinary verb + preposition syntax, so they require an explicit
    // manuscript binding instead of an automatic semantic guess.
    if (!use || lexicalPartCount !== 2 || declaredPhrases.has(item.phrasalVerb)) return []
    const itemLevel = LEVELS.find((candidate) =>
      phrasalLists[LEVELS.indexOf(candidate)]?.some(({ id }) => id === item.id))
    return [{
      phrase: item.phrasalVerb,
      form: use.form,
      level: itemLevel,
      context: sentenceAt(storyText, use.start),
      issue: itemLevel && LEVELS.indexOf(itemLevel) > levelIndex
        ? 'upper-level phrasal surface'
        : 'unbound allowed phrasal surface',
    }]
  })
  const usedWords = storyWordUses(storyText, targetWords)
  const coverage = readerStoryCoverage(
    storyText,
    targetWords,
    targetPhrasals,
    usedPhrasalVerbs,
  )
  const story: StoryContent = {
    schemaVersion: '2.0.0',
    level,
    title: manuscript.title,
    chapterTitles: manuscript.chapterTitles,
    isManual: true,
    coverage: {
      mustCoverAll: true,
      allowUpperLevelWords: false,
      coverageRate: coverage.wordCoveredCount / coverage.wordTotalCount,
      phrasalVerbCoverageRate:
        coverage.phrasalVerbCoveredCount / coverage.phrasalVerbTotalCount,
    },
    usedWords,
    usedPhrasalVerbs,
    storyText,
  }
  const vocabulary = inspectStoryVocabulary(
    storyText,
    allowedWords,
    allCatalogWords,
    usedPhrasalVerbs,
  )
  const vocabularyViolationOccurrences = inspectStoryVocabularyOccurrences(
    storyText,
    allowedWords,
    allCatalogWords,
    usedPhrasalVerbs,
  )
  const frontMatterVocabulary = inspectStoryVocabulary(
    englishStoryVocabularyText([manuscript.title, ...manuscript.chapterTitles].join('. ')),
    allowedWords,
    allCatalogWords,
  )
  const selectedVocabularyViolations = vocabulary.violations
    .filter(({ token }) => !contextToken || token === contextToken)
    .slice(violationOffset, violationOffset + violationLimit)
  const violationTokensBySentence = new Map<string, Set<string>>()
  for (const { index, token } of vocabularyViolationOccurrences) {
    const sentence = sentenceAt(storyText, index)
    if (!sentence) continue
    const tokens = violationTokensBySentence.get(sentence) ?? new Set<string>()
    tokens.add(token)
    violationTokensBySentence.set(sentence, tokens)
  }
  const violationSentences = [...violationTokensBySentence]
    .map(([sentence, tokens]) => ({ sentence, tokens: [...tokens] }))
    .sort((left, right) => storyText.indexOf(left.sentence) - storyText.indexOf(right.sentence))
  let editionIssue = ''
  let clickabilityIssue = ''
  let chapterAudit
  try {
    chapterAudit = auditReaderEdition(buildReaderEdition(story, allowedWords))
  } catch (error) {
    editionIssue = error instanceof Error ? error.message : String(error)
  }
  try {
    tokenizeStory(
      storyText,
      usedWords,
      allowedWords,
      readerStoryContextualPhrasalVerbs(
        storyText,
        usedPhrasalVerbs,
        allowedPhrasals,
      ),
    )
  } catch (error) {
    clickabilityIssue = error instanceof Error ? error.message : String(error)
  }
  const issues = [
    ...bindingIssues,
    ...coverage.missingWordLemmas.map((lemma) => `${lemma}: target word missing from prose`),
    ...coverage.missingPhrasalVerbs.map((phrase) => `${phrase}: binding does not cover prose`),
    ...vocabulary.violations.map(({ token, catalogLevel }) =>
      `${token}: disallowed${catalogLevel ? ` (${catalogLevel})` : ''}`),
    ...frontMatterVocabulary.violations.map(({ token, catalogLevel }) =>
      `title token ${token}: disallowed${catalogLevel ? ` (${catalogLevel})` : ''}`),
    ...(editionIssue ? [editionIssue] : []),
    ...(clickabilityIssue ? [clickabilityIssue] : []),
    ...(chapterAudit?.shortChapterIndexes.map((index) => `chapter ${index + 1}: too short`) ?? []),
  ]

  const report = {
    level,
    chapters: manuscript.chapters.length,
    paragraphCounts: manuscript.chapters.map((chapter) => chapter.length),
    usedWords: usedWords.length,
    targetWords: targetWords.length,
    usedPhrasalVerbs: usedPhrasalVerbs.length,
    missingTargetWords: coverage.missingWordLemmas,
    missingTargetPhrasalVerbs: coverage.missingPhrasalVerbs,
    ...(process.argv.includes('--audit-phrasals') ? {
      phrasalAudit: usedPhrasalVerbs.map(({
        phrasalVerb,
        storyForm,
        context,
        meaningKo,
      }) => ({ phrasalVerb, storyForm, meaningKo, context })),
    } : {}),
    vocabularyViolations: vocabulary.violations,
    ...(summaryOnly ? {
      vocabularyViolationExamples: vocabulary.violations.map(({ token }) => ({
        token,
        count: sentenceContextsForToken(storyText, token).length,
        context: sentenceContextsForToken(storyText, token)[0] ?? '',
      })),
    } : {}),
    ...(!summaryOnly || contextToken ? {
      vocabularyViolationContexts: vocabulary.violations
        .filter(({ token }) => !contextToken || token === contextToken)
        .map(({ token }) => ({
          token,
          contexts: sentenceContextsForToken(storyText, token),
        })),
    } : {}),
    frontMatterVocabularyViolations: frontMatterVocabulary.violations,
    bindingIssues,
    candidateUnboundPhrasalSurfaces: unboundPhrasalSurfaces,
    editionIssue,
    clickabilityIssue,
    chapterAudit,
  }
  console.log(JSON.stringify(
    phrasalDebug
      ? (() => {
          const use = usedPhrasalVerbs.find(({ phrasalVerb }) => phrasalVerb === phrasalDebug)
          return {
            level,
            use,
            isolatedContextVocabulary: use
              ? inspectStoryVocabulary(use.context, allowedWords, allCatalogWords, [use])
              : null,
            wholeStoryWithOneUse: use
              ? inspectStoryVocabulary(storyText, allowedWords, allCatalogWords, [use])
                .violations.filter(({ token }) =>
                  use.storyForm.toLowerCase().includes(token))
              : null,
          }
        })()
      : violationSentencesOnly
      ? {
          level,
          violationSentenceCount: violationSentences.length,
          violationSentences: violationSentences.slice(
            sentenceOffset,
            sentenceOffset + sentenceLimit,
          ),
        }
      : missingOnly
      ? tokensOnly
        ? {
            level,
            usedWords: usedWords.length,
            targetWords: targetWords.length,
            usedPhrasalVerbs: usedPhrasalVerbs.length,
            missingTargetWordCount: coverage.missingWordLemmas.length,
            missingTargetWords: coverage.missingWordLemmas.slice(
              missingOffset,
              missingOffset + missingLimit,
            ),
            missingTargetPhrasalVerbs: coverage.missingPhrasalVerbs,
          }
        : {
          level,
          usedWords: usedWords.length,
          targetWords: targetWords.length,
          usedPhrasalVerbs: usedPhrasalVerbs.length,
          undeclaredCoveredWordLemmas: targetWords
            .filter(({ lemma }) => !usedWords.some((used) => used.lemma === lemma))
            .map(({ lemma }) => lemma),
          missingTargetWordCount: coverage.missingWordLemmas.length,
          missingTargetWords: coverage.missingWordLemmas.slice(
            missingOffset,
            missingOffset + missingLimit,
          ),
          missingTargetPhrasalVerbs: coverage.missingPhrasalVerbs,
        }
      : violationsOnly
        ? {
            level,
            vocabularyViolations: tokensOnly
              ? selectedVocabularyViolations.map(({ token }) => token)
              : selectedVocabularyViolations,
            ...(!tokensOnly ? {
              vocabularyViolationExamples: selectedVocabularyViolations.map(({ token }) => ({
                token,
                count: sentenceContextsForToken(storyText, token).length,
                contexts: sentenceContextsForToken(storyText, token),
              })),
            } : {}),
            frontMatterVocabularyViolations: frontMatterVocabulary.violations,
            bindingIssues,
            candidateUnboundPhrasalSurfaces: unboundPhrasalSurfaces,
          }
        : report,
    null,
    2,
  ))

  if (issues.length > 0) {
    throw new Error(summaryOnly ? `${issues.length} audit issues` : issues.join('\n'))
  }
  if (process.argv.includes('--write')) {
    const approved = {
      schemaVersion: '1.0.0',
      story,
      approval: {
        reviewer: 'Codex-assisted prose and exhaustive automated audit',
        reviewedAt: new Date().toISOString(),
        sourceDigest: manualStorySourceDigest(story),
      },
    }
    await writeFile(
      resolve(`scripts/content/manual-stories/${level}.approved.json`),
      `${JSON.stringify(approved, null, 2)}\n`,
      'utf8',
    )
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
