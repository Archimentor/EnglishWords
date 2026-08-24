import { entryFormStrings, isInternalStoryWordCharacter } from './storyForms'
import { LEVELS } from './types'
import type { Level, StoryContent, WordItem } from './types'

const STORY_TOKEN_PATTERN = /[\p{L}\p{N}]+(?:['’~-][\p{L}\p{N}]+)*/gu
const HONORIFICS = new Set(['dr', 'lady', 'lord', 'miss', 'mr', 'mrs', 'ms', 'prof', 'sir'])
const DEFAULT_PROPER_NOUNS = new Set([
  'aisha',
  'harbor',
  'joon',
  'leo',
  'maple',
  'mina',
  'riverside',
  'sara',
])
const NEVER_PROPER_NOUNS = new Set([
  'he', 'i', 'it', 'she', 'that', 'there', 'they', 'we', 'what', 'who', 'you',
])
const vocabularyFormsCache = new WeakMap<readonly WordItem[], ReadonlySet<string>>()
const catalogLevelsCache = new WeakMap<readonly WordItem[], ReadonlyMap<string, Level>>()

export interface StoryVocabularyToken {
  surface: string
  normalized: string
  index: number
  sentenceInitial: boolean
}

export interface StoryVocabularyViolation {
  token: string
  catalogLevel: Level | null
}

export interface StoryVocabularyReport {
  allowedTokenCount: number
  properNouns: string[]
  violations: StoryVocabularyViolation[]
}

export type StoryPhrasalVocabularyUse = Pick<
  StoryContent['usedPhrasalVerbs'][number],
  'storyForm' | 'context'
>

function lexicalBase(normalized: string): string {
  return normalized.replace(/['’]s$/u, '')
}

function isNeverProperNoun(base: string): boolean {
  const normalized = base.replaceAll('’', "'")
  const contractionBase = normalized.split("'", 1)[0]!
  return normalized.length < 2 || NEVER_PROPER_NOUNS.has(contractionBase)
}

function isCapitalized(surface: string): boolean {
  return /^\p{Lu}/u.test(surface)
}

function isAcronym(surface: string): boolean {
  const letters = surface.match(/\p{L}/gu) ?? []
  return letters.length >= 2 && letters.every((letter) => /\p{Lu}/u.test(letter))
}

function isSentenceInitial(text: string, index: number): boolean {
  let cursor = index - 1
  while (cursor >= 0 && /\s/u.test(text[cursor]!)) cursor -= 1
  if (cursor < 0) return true

  const whitespace = text.slice(cursor + 1, index)
  if (/\n\s*\n/u.test(whitespace)) return true

  return /[.!?:;“‘`"'([{]/u.test(text[cursor]!)
}

export function storyVocabularyTokens(text: string): StoryVocabularyToken[] {
  return [...text.matchAll(STORY_TOKEN_PATTERN)].map((match) => ({
    surface: match[0],
    normalized: match[0].toLowerCase(),
    index: match.index,
    sentenceInitial: isSentenceInitial(text, match.index),
  }))
}

/** Keeps only English lexical material when auditing display titles. */
export function englishStoryVocabularyText(text: string): string {
  return storyVocabularyTokens(text)
    .filter(({ surface }) => /\p{Script=Latin}/u.test(surface))
    .map(({ surface }) => surface)
    .join(' ')
}

/**
 * Infers names from English capitalization without treating every sentence-opening
 * capital as a name. A name must appear capitalized away from a sentence boundary,
 * be an acronym, follow an honorific, or be the fixed protagonist name.
 */
export function storyProperNounTokens(text: string): ReadonlySet<string> {
  const tokens = storyVocabularyTokens(text)
  const usesByBase = new Map<string, StoryVocabularyToken[]>()

  for (const token of tokens) {
    const base = lexicalBase(token.normalized)
    const uses = usesByBase.get(base) ?? []
    uses.push(token)
    usesByBase.set(base, uses)
  }

  const properBases = new Set(DEFAULT_PROPER_NOUNS)
  for (const [base, uses] of usesByBase) {
    if (isNeverProperNoun(base) || !uses.every(({ surface }) => isCapitalized(surface))) {
      continue
    }
    if (uses.some(({ sentenceInitial }) => !sentenceInitial) || uses.some(({ surface }) => isAcronym(surface))) {
      properBases.add(base)
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!
    const next = tokens[index + 1]
    if (!HONORIFICS.has(lexicalBase(token.normalized)) || !next || !isCapitalized(next.surface)) {
      continue
    }

    const gap = text.slice(token.index + token.surface.length, next.index)
    if (!/^\.?\s+$/u.test(gap)) continue
    properBases.add(lexicalBase(token.normalized))
    properBases.add(lexicalBase(next.normalized))
  }

  return new Set(tokens
    .filter(({ normalized }) => properBases.has(lexicalBase(normalized)))
    .map(({ normalized }) => normalized))
}

function singleTokenForm(value: string): string | null {
  const tokens = storyVocabularyTokens(value)
  // A multiword inflection such as "more tired" must not make an upper-level
  // helper such as "more" available unless it has its own allowed catalog item.
  return tokens.length === 1 ? tokens[0]!.normalized : null
}

export function storyVocabularyForms(words: readonly WordItem[]): ReadonlySet<string> {
  const cached = vocabularyFormsCache.get(words)
  if (cached) return cached

  const forms = new Set<string>()
  for (const word of words) {
    const values = [
      word.word,
      word.lemma,
      ...word.entries.flatMap((entry) => entryFormStrings(entry)),
    ]
    for (const value of values) {
      const form = singleTokenForm(value)
      if (form) forms.add(form)
    }
  }
  vocabularyFormsCache.set(words, forms)
  return forms
}

function catalogTokenLevels(words: readonly WordItem[]): ReadonlyMap<string, Level> {
  const cached = catalogLevelsCache.get(words)
  if (cached) return cached

  const levels = new Map<string, Level>()
  for (const word of words) {
    const values = [
      word.word,
      word.lemma,
      ...word.entries.flatMap((entry) => entryFormStrings(entry)),
    ]
    const tokens = new Set(values.flatMap((value) => {
      const token = singleTokenForm(value)
      return token ? [token] : []
    }))
    for (const token of tokens) {
      const current = levels.get(token)
      if (
        current === undefined
        || LEVELS.indexOf(word.level) < LEVELS.indexOf(current)
      ) {
        levels.set(token, word.level)
      }
    }
  }
  catalogLevelsCache.set(words, levels)
  return levels
}

function wholeTextOccurrences(text: string, form: string): number[] {
  const normalizedText = text.toLowerCase()
  const normalizedForm = form.toLowerCase()
  const occurrences: number[] = []
  let cursor = normalizedText.indexOf(normalizedForm)
  while (cursor !== -1) {
    const end = cursor + normalizedForm.length
    if (
      !isInternalStoryWordCharacter(text[cursor - 1])
      && !isInternalStoryWordCharacter(text[end])
    ) {
      occurrences.push(cursor)
    }
    cursor = normalizedText.indexOf(normalizedForm, cursor + 1)
  }
  return occurrences
}

/**
 * A levelled phrasal verb may contain a verb or particle that is not an
 * independently available word at that reader level. Only those two lexical
 * components are exempted, and only inside the exact approved story context.
 * Any object between a separable verb and particle still has to be a normal
 * allowed word (or a proper noun).
 */
function phrasalComponentTokenIndexes(
  text: string,
  uses: readonly StoryPhrasalVocabularyUse[],
): ReadonlySet<number> {
  const exempt = new Set<number>()
  const tokens = storyVocabularyTokens(text)

  for (const use of uses) {
    if (!use.context.trim() || !use.storyForm.trim()) continue
    for (const contextStart of wholeTextOccurrences(text, use.context)) {
      const contextText = text.slice(contextStart, contextStart + use.context.length)
      for (const localStart of wholeTextOccurrences(contextText, use.storyForm)) {
        const formStart = contextStart + localStart
        const formEnd = formStart + use.storyForm.length
        const formTokens = tokens.filter(({ index }) =>
          index >= formStart && index < formEnd)
        if (formTokens.length < 2) continue
        exempt.add(formTokens[0]!.index)
        exempt.add(formTokens.at(-1)!.index)
      }
    }
  }

  return exempt
}

export function inspectStoryVocabulary(
  text: string,
  allowedWords: readonly WordItem[],
  catalogWords: readonly WordItem[] = allowedWords,
  phrasalUses: readonly StoryPhrasalVocabularyUse[] = [],
): StoryVocabularyReport {
  const allowedForms = storyVocabularyForms(allowedWords)
  const properNouns = storyProperNounTokens(text)
  const catalogLevels = catalogTokenLevels(catalogWords)
  const phrasalComponentIndexes = phrasalComponentTokenIndexes(text, phrasalUses)
  const violations = new Map<string, StoryVocabularyViolation>()

  for (const { index, normalized } of storyVocabularyTokens(text)) {
    if (
      allowedForms.has(normalized)
      || properNouns.has(normalized)
      || phrasalComponentIndexes.has(index)
      || violations.has(normalized)
    ) {
      continue
    }
    violations.set(normalized, {
      token: normalized,
      catalogLevel: catalogLevels.get(normalized) ?? null,
    })
  }

  return {
    allowedTokenCount: allowedForms.size,
    properNouns: [...properNouns].filter((token) => !allowedForms.has(token)).sort(),
    violations: [...violations.values()].sort((left, right) =>
      left.token.localeCompare(right.token)),
  }
}

export function usesOnlyStoryVocabulary(
  text: string,
  allowedWords: readonly WordItem[],
  phrasalUses: readonly StoryPhrasalVocabularyUse[] = [],
): boolean {
  return inspectStoryVocabulary(text, allowedWords, allowedWords, phrasalUses)
    .violations.length === 0
}
