import { entryFormStrings, hasWholeWordForm } from './storyForms'
import { inspectStoryVocabulary, usesOnlyStoryVocabulary } from './storyVocabulary'
import type {
  Level,
  PhrasalVerbItem,
  StoryContent,
  WordItem,
} from './types'

export interface ReaderStoryCoverage {
  wordCoveredCount: number
  wordTotalCount: number
  phrasalVerbCoveredCount: number
  phrasalVerbTotalCount: number
  missingWordIds: string[]
  missingWordLemmas: string[]
  missingPhrasalVerbIds: string[]
  missingPhrasalVerbs: string[]
}

interface TextLookup {
  text: string
  tokens: ReadonlySet<string>
}

export interface ReaderStoryPhrasalVerbUse {
  item: PhrasalVerbItem
  form: string
  context: string
  meaningKo: string
}

function wordForms(word: WordItem): string[] {
  return [...new Set(word.entries.flatMap((entry) => entryFormStrings(entry)))]
    .filter((form) => form.trim().length > 0)
}

function storyTokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’~-][\p{L}\p{N}]+)*/gu) ?? [],
  )
}

function makeLookup(text: string): TextLookup {
  return { text, tokens: storyTokens(text) }
}

function isSimpleForm(form: string): boolean {
  return /^[\p{L}\p{N}]+(?:['’~-][\p{L}\p{N}]+)*$/u.test(form)
}

function lookupContainsForm(lookup: TextLookup, form: string): boolean {
  const normalized = form.toLowerCase()
  return isSimpleForm(normalized)
    ? lookup.tokens.has(normalized)
    : hasWholeWordForm(lookup.text, form)
}

function wordAppears(lookup: TextLookup, word: WordItem): boolean {
  return wordForms(word).some((form) => lookupContainsForm(lookup, form))
}

/**
 * Measures catalog coverage in the actual displayed novel. A phrasal verb
 * counts only when its approved context and exact story form both occur in the
 * prose; hidden practice text cannot satisfy this audit.
 */
export function readerStoryCoverage(
  text: string,
  words: readonly WordItem[],
  phrasalVerbs: readonly PhrasalVerbItem[],
  usedPhrasalVerbs: StoryContent['usedPhrasalVerbs'] = [],
): ReaderStoryCoverage {
  const lookup = makeLookup(text)
  const missingWords = words.filter((word) => !wordAppears(lookup, word))
  const contextualUses = readerStoryContextualPhrasalVerbs(
    text,
    usedPhrasalVerbs,
    phrasalVerbs,
  )
  const coveredPhrasalIds = new Set(contextualUses.map(({ item }) => item.id))
  const missingPhrasalVerbs = phrasalVerbs.filter(({ id }) =>
    !coveredPhrasalIds.has(id))

  return {
    wordCoveredCount: words.length - missingWords.length,
    wordTotalCount: words.length,
    phrasalVerbCoveredCount: phrasalVerbs.length - missingPhrasalVerbs.length,
    phrasalVerbTotalCount: phrasalVerbs.length,
    missingWordIds: missingWords.map(({ id }) => id),
    missingWordLemmas: missingWords.map(({ lemma }) => lemma),
    missingPhrasalVerbIds: missingPhrasalVerbs.map(({ id }) => id),
    missingPhrasalVerbs: missingPhrasalVerbs.map(({ phrasalVerb }) => phrasalVerb),
  }
}

/** Returns phrasal verbs whose component words stay inside the level boundary. */
export function readerStoryPhrasalVerbs(
  phrasalVerbs: readonly PhrasalVerbItem[],
  allowedWords: readonly WordItem[],
): PhrasalVerbItem[] {
  return phrasalVerbs.filter(({ phrasalVerb }) =>
    usesOnlyStoryVocabulary(phrasalVerb, allowedWords))
}

function normalizedContext(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[‘’]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^["']+|["']+$/gu, '')
    .toLowerCase()
}

function storySentenceContexts(text: string): ReadonlySet<string> {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/gu) ?? []
  return new Set(sentences.map(normalizedContext).filter(Boolean))
}

/**
 * Connects a phrase to its audited Korean meaning only inside the exact novel
 * sentence recorded by the manuscript. A coincidental spelling elsewhere
 * remains ordinary clickable words instead of receiving an unrelated sense.
 */
export function readerStoryContextualPhrasalVerbs(
  storyText: string,
  usedPhrasalVerbs: StoryContent['usedPhrasalVerbs'],
  catalogPhrasalVerbs: readonly PhrasalVerbItem[],
): ReaderStoryPhrasalVerbUse[] {
  const sentenceContexts = storySentenceContexts(storyText)
  const catalogById = new Map(catalogPhrasalVerbs.map((item) => [item.id, item]))

  return usedPhrasalVerbs.flatMap((used) => {
    const item = catalogById.get(used.id)
    if (
      !item
      || used.phrasalVerb !== item.phrasalVerb
      || item.meaningKo.every((meaning) => !meaning.trim())
      || !/^[a-f0-9]{64}$/u.test(used.senseId)
      || !used.meaningKo.trim()
      || !hasWholeWordForm(used.context, used.storyForm)
      || !sentenceContexts.has(normalizedContext(used.context))
    ) {
      return []
    }
    return [{
      item,
      form: used.storyForm,
      context: used.context,
      meaningKo: used.meaningKo,
    }]
  })
}

function assertVocabularyBoundary(
  text: string,
  level: Level,
  allowedWords: readonly WordItem[],
  usedPhrasalVerbs: StoryContent['usedPhrasalVerbs'],
): void {
  const report = inspectStoryVocabulary(
    text,
    allowedWords,
    allowedWords,
    usedPhrasalVerbs,
  )
  if (report.violations.length === 0) return
  const sample = report.violations.slice(0, 20).map(({ token }) => token).join(', ')
  throw new Error(
    `Reader story source for ${level} contains ${report.violations.length} disallowed token(s): ${sample}`,
  )
}

/**
 * Produces the text shown in the reader. The edited narrative is kept verbatim;
 * no generated catalog examples or word-list material is added to the novel.
 */
export function buildReaderStoryText(
  baseText: string,
  level: Level,
  allowedWords: readonly WordItem[],
  usedPhrasalVerbs: StoryContent['usedPhrasalVerbs'] = [],
): string {
  const result = baseText.trim()
  assertVocabularyBoundary(result, level, allowedWords, usedPhrasalVerbs)
  return result
}
