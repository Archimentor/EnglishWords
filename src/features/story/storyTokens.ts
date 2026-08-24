import type { ReaderStoryPhrasalVerbUse } from '../../domain/content/readerStory'
import {
  entryFormStrings,
  hasWholeWordBoundaries,
} from '../../domain/content/storyForms'
import type {
  PhrasalVerbItem,
  StoryContent,
  WordEntry,
  WordItem,
} from '../../domain/content/types'

export type StoryToken =
  | { type: 'text'; value: string }
  | { type: 'word'; value: string; word: WordItem; entry: WordEntry }
  | {
    type: 'phrasalVerb'
    value: string
    phrasalVerb: PhrasalVerbItem
    phrasalUse: ReaderStoryPhrasalVerbUse
  }

interface WordMatch {
  form: string
  normalized: string
  word: WordItem
  entry: WordEntry
}

interface FormTrieNode {
  children: Map<string, FormTrieNode>
  match?: WordMatch
}

interface PositionedPhrasalMatch {
  start: number
  end: number
  use: ReaderStoryPhrasalVerbUse
}

function dictionaryMatchRank(match: WordMatch): number {
  if (match.word.lemma.toLowerCase() === match.normalized) return 0
  if (match.word.word.toLowerCase() === match.normalized) return 1
  return 2
}

function requestedDictionaryForms(text: string): Set<string> {
  return new Set(
    text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’~-][\p{L}\p{N}]+)*/gu) ?? [],
  )
}

function dictionaryWordForms(
  words: readonly WordItem[],
  requestedForms: ReadonlySet<string>,
): WordMatch[] {
  const byForm = new Map<string, WordMatch>()

  for (const word of words) {
    for (const entry of word.entries) {
      for (const form of entryFormStrings(entry)) {
        const trimmed = form.trim()
        if (!trimmed || /\s/u.test(trimmed)) continue
        const normalized = trimmed.toLowerCase()
        if (!requestedForms.has(normalized)) continue
        const candidate = { form: trimmed, normalized, word, entry }
        const existing = byForm.get(normalized)
        if (!existing || dictionaryMatchRank(candidate) < dictionaryMatchRank(existing)) {
          byForm.set(normalized, candidate)
        }
      }
    }
  }

  return [...byForm.values()]
}

function recordedWordForms(
  usedWords: StoryContent['usedWords'],
  levelWords: readonly WordItem[],
): WordMatch[] {
  const recorded = new Map<string, WordMatch>()
  const wordsByLemma = new Map(levelWords.map((word) => [word.lemma, word]))

  for (const usedWord of usedWords) {
    const word = wordsByLemma.get(usedWord.lemma)
    if (!word) {
      throw new Error(
        `Story word "${usedWord.lemma}" (${usedWord.partOfSpeech}) does not resolve.`,
      )
    }
    const entry = word.entries.find(
      (candidate) => candidate.partOfSpeech === usedWord.partOfSpeech,
    )
    if (!entry) {
      throw new Error(
        `Story entry for ${usedWord.lemma} (${usedWord.partOfSpeech}) does not resolve.`,
      )
    }
    const knownForms = new Set(entryFormStrings(entry).map((form) => form.toLowerCase()))
    for (const form of usedWord.forms) {
      const normalized = form.toLowerCase()
      if (!knownForms.has(normalized)) {
        throw new Error(
          `Story form "${form}" is not defined for ${usedWord.lemma} (${usedWord.partOfSpeech}).`,
        )
      }
      const existing = recorded.get(normalized)
      if (existing && (existing.word !== word || existing.entry !== entry)) {
        throw new Error(`Story form "${form}" resolves to more than one word entry.`)
      }
      recorded.set(normalized, { form, normalized, word, entry })
    }
  }
  return [...recorded.values()]
}

function resolveWordMatches(
  storyText: string,
  usedWords: StoryContent['usedWords'],
  words: readonly WordItem[],
): WordMatch[] {
  const byForm = new Map<string, WordMatch>()
  for (const match of dictionaryWordForms(words, requestedDictionaryForms(storyText))) {
    byForm.set(match.normalized, match)
  }
  for (const match of recordedWordForms(usedWords, words)) {
    byForm.set(match.normalized, match)
  }
  return [...byForm.values()].sort(
    (left, right) => right.form.length - left.form.length
      || left.normalized.localeCompare(right.normalized),
  )
}

function buildFormTrie(forms: readonly WordMatch[]): FormTrieNode {
  const root: FormTrieNode = { children: new Map() }
  for (const form of forms) {
    let node = root
    for (const character of form.normalized) {
      const child = node.children.get(character) ?? { children: new Map() }
      node.children.set(character, child)
      node = child
    }
    node.match = form
  }
  return root
}

function longestWordMatchAt(
  storyText: string,
  normalizedStory: string,
  cursor: number,
  trie: FormTrieNode,
): WordMatch | undefined {
  let node = trie
  let offset = cursor
  let longest: WordMatch | undefined
  while (offset < normalizedStory.length) {
    const character = normalizedStory[offset]
    if (character === undefined) break
    const child = node.children.get(character)
    if (!child) break
    node = child
    offset += 1
    if (node.match && hasWholeWordBoundaries(storyText, cursor, node.match.form.length)) {
      longest = node.match
    }
  }
  return longest
}

function allSubstringStarts(text: string, requested: string): number[] {
  const normalizedText = text.toLowerCase()
  const normalizedRequested = requested.toLowerCase()
  if (!normalizedRequested) return []
  const starts: number[] = []
  let start = normalizedText.indexOf(normalizedRequested)
  while (start >= 0) {
    starts.push(start)
    start = normalizedText.indexOf(normalizedRequested, start + 1)
  }
  return starts
}

/**
 * A phrase is positioned through its approved sentence. A matching spelling in
 * another sentence is left as ordinary words, so it cannot open the wrong
 * contextual meaning.
 */
function positionedPhrasalMatches(
  storyText: string,
  phrasalVerbs: readonly ReaderStoryPhrasalVerbUse[],
): PositionedPhrasalMatch[] {
  const matches = new Map<number, PositionedPhrasalMatch>()
  for (const use of phrasalVerbs) {
    for (const contextStart of allSubstringStarts(storyText, use.context)) {
      const context = storyText.slice(contextStart, contextStart + use.context.length)
      for (const formStart of allSubstringStarts(context, use.form)) {
        if (!hasWholeWordBoundaries(context, formStart, use.form.length)) continue
        const start = contextStart + formStart
        const candidate = { start, end: start + use.form.length, use }
        const existing = matches.get(start)
        if (existing && existing.use.item.id !== use.item.id) {
          throw new Error(
            `Phrasal verb "${use.form}" resolves to more than one item at one position.`,
          )
        }
        matches.set(start, candidate)
      }
    }
  }
  return [...matches.values()].sort((left, right) => left.start - right.start)
}

function tokenizeMatches(
  storyText: string,
  wordMatches: readonly WordMatch[],
  positionedPhrasals: readonly PositionedPhrasalMatch[] = [],
): StoryToken[] {
  const formTrie = buildFormTrie(wordMatches)
  const normalizedStory = storyText.toLowerCase()
  const phrasalByStart = new Map(positionedPhrasals.map((match) => [match.start, match]))
  const tokens: StoryToken[] = []
  let textStart = 0
  let cursor = 0

  while (cursor < storyText.length) {
    const phrasal = phrasalByStart.get(cursor)
    if (phrasal) {
      if (textStart < cursor) {
        tokens.push({ type: 'text', value: storyText.slice(textStart, cursor) })
      }
      tokens.push({
        type: 'phrasalVerb',
        value: storyText.slice(phrasal.start, phrasal.end),
        phrasalVerb: phrasal.use.item,
        phrasalUse: phrasal.use,
      })
      cursor = phrasal.end
      textStart = cursor
      continue
    }

    const word = longestWordMatchAt(storyText, normalizedStory, cursor, formTrie)
    if (!word) {
      cursor += 1
      continue
    }
    if (textStart < cursor) {
      tokens.push({ type: 'text', value: storyText.slice(textStart, cursor) })
    }
    const value = storyText.slice(cursor, cursor + word.form.length)
    tokens.push({ type: 'word', value, word: word.word, entry: word.entry })
    cursor += word.form.length
    textStart = cursor
  }

  if (textStart < storyText.length) {
    tokens.push({ type: 'text', value: storyText.slice(textStart) })
  }
  return tokens.length > 0 ? tokens : [{ type: 'text', value: storyText }]
}

/** Every known word and each exact contextual phrasal use becomes clickable. */
export function tokenizeStory(
  storyText: string,
  usedWords: StoryContent['usedWords'],
  levelWords: readonly WordItem[],
  phrasalVerbs: readonly ReaderStoryPhrasalVerbUse[] = [],
): StoryToken[] {
  return tokenizeMatches(
    storyText,
    resolveWordMatches(storyText, usedWords, levelWords),
    positionedPhrasalMatches(storyText, phrasalVerbs),
  )
}

export function tokenizeKnownWords(text: string, words: readonly WordItem[]): StoryToken[] {
  return tokenizeMatches(text, dictionaryWordForms(words, requestedDictionaryForms(text)))
}

const STORY_PARAGRAPH_SEPARATOR = '\u0000'

export function tokenizeStoryParagraphs(
  storyText: string,
  usedWords: StoryContent['usedWords'],
  levelWords: readonly WordItem[],
  phrasalVerbs: readonly ReaderStoryPhrasalVerbUse[] = [],
): StoryToken[][] {
  const paragraphs = storyText
    .trim()
    .split(/\n\s*\n/u)
    .filter((paragraph) => paragraph.trim())
  if (paragraphs.length === 0) return []

  const tokenized = tokenizeStory(
    paragraphs.join(STORY_PARAGRAPH_SEPARATOR),
    usedWords,
    levelWords,
    phrasalVerbs,
  )
  const result: StoryToken[][] = [[]]
  for (const token of tokenized) {
    if (token.type !== 'text') {
      result.at(-1)!.push(token)
      continue
    }
    const parts = token.value.split(STORY_PARAGRAPH_SEPARATOR)
    parts.forEach((part, index) => {
      if (part) result.at(-1)!.push({ type: 'text', value: part })
      if (index < parts.length - 1) result.push([])
    })
  }
  return result
}
