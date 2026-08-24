import type {
  PhrasalVerbItem,
  StoryContent,
  WordEntry,
  WordItem,
} from '../../domain/content/types'
import {
  entryFormStrings,
  isInternalStoryWordCharacter,
} from '../../domain/content/storyForms'

export type StoryToken =
  | { type: 'text'; value: string }
  | { type: 'word'; value: string; word: WordItem; entry: WordEntry }
  | { type: 'phrasalVerb'; value: string; phrasalVerb: PhrasalVerbItem }

interface RecordedMatch {
  kind: 'word' | 'phrasalVerb'
  form: string
  normalized: string
  word?: WordItem
  entry?: WordEntry
  phrasalVerb?: PhrasalVerbItem
}

interface FormTrieNode {
  children: Map<string, FormTrieNode>
  recordedMatch?: RecordedMatch
}

function hasWholeWordBoundaries(
  storyText: string,
  start: number,
  length: number,
): boolean {
  return (
    !isInternalStoryWordCharacter(storyText[start - 1]) &&
    !isInternalStoryWordCharacter(storyText[start + length])
  )
}

function resolveRecordedWordForms(
  usedWords: StoryContent['usedWords'],
  levelWords: readonly WordItem[],
): RecordedMatch[] {
  const recordedForms = new Map<string, RecordedMatch>()
  const wordsByLemma = new Map(levelWords.map((word) => [word.lemma, word]))

  for (const usedWord of usedWords) {
    const word = wordsByLemma.get(usedWord.lemma)
    if (!word) {
      throw new Error(
        `Story word "${usedWord.lemma}" (${usedWord.partOfSpeech}) does not resolve to a level word.`,
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

      const existing = recordedForms.get(normalized)
      if (existing && (existing.word !== word || existing.entry !== entry)) {
        throw new Error(
          `Story form "${form}" resolves to more than one word entry.`,
        )
      }

      recordedForms.set(normalized, {
        kind: 'word',
        form,
        normalized,
        word,
        entry,
      })
    }
  }

  return [...recordedForms.values()]
}

function resolvePhrasalVerbForms(
  phrasalVerbs: readonly PhrasalVerbItem[],
): RecordedMatch[] {
  const recorded = new Map<string, RecordedMatch>()

  for (const item of phrasalVerbs) {
    const form = item.phrasalVerb.trim()
    if (!form) continue
    const normalized = form.toLowerCase()
    const existing = recorded.get(normalized)
    if (existing && existing.phrasalVerb?.id !== item.id) {
      throw new Error(`Phrasal verb "${form}" resolves to more than one catalog item.`)
    }
    recorded.set(normalized, {
      kind: 'phrasalVerb',
      form,
      normalized,
      phrasalVerb: item,
    })
  }

  return [...recorded.values()]
}

function resolveRecordedMatches(
  usedWords: StoryContent['usedWords'],
  levelWords: readonly WordItem[],
  phrasalVerbs: readonly PhrasalVerbItem[],
): RecordedMatch[] {
  const byForm = new Map<string, RecordedMatch>()

  for (const match of resolveRecordedWordForms(usedWords, levelWords)) {
    byForm.set(match.normalized, match)
  }
  for (const match of resolvePhrasalVerbForms(phrasalVerbs)) {
    const existing = byForm.get(match.normalized)
    if (!existing || existing.kind === 'word') byForm.set(match.normalized, match)
  }

  return [...byForm.values()].sort(
    (left, right) =>
      right.form.length - left.form.length
      || Number(right.kind === 'phrasalVerb') - Number(left.kind === 'phrasalVerb')
      || left.normalized.localeCompare(right.normalized),
  )
}

function buildFormTrie(forms: readonly RecordedMatch[]): FormTrieNode {
  const root: FormTrieNode = { children: new Map() }

  for (const form of forms) {
    let node = root
    for (const character of form.normalized) {
      const child = node.children.get(character) ?? { children: new Map() }
      node.children.set(character, child)
      node = child
    }
    node.recordedMatch = form
  }

  return root
}

function longestMatchAt(
  storyText: string,
  normalizedStory: string,
  cursor: number,
  trie: FormTrieNode,
): RecordedMatch | undefined {
  if (isInternalStoryWordCharacter(storyText[cursor - 1])) return undefined

  let node = trie
  let offset = cursor
  let longestMatch: RecordedMatch | undefined

  while (offset < normalizedStory.length) {
    const character = normalizedStory[offset]
    if (character === undefined) break
    const child = node.children.get(character)
    if (!child) break

    node = child
    offset += 1
    if (
      node.recordedMatch
      && hasWholeWordBoundaries(storyText, cursor, node.recordedMatch.form.length)
    ) {
      longestMatch = node.recordedMatch
    }
  }

  return longestMatch
}

/**
 * Splits a story into verbatim text and clickable learning forms.
 * Matching is case-insensitive and whole-word only. The longest match wins,
 * so a multi-word phrasal verb is kept intact instead of being split into
 * separate clickable word tokens.
 */
export function tokenizeStory(
  storyText: string,
  usedWords: StoryContent['usedWords'],
  levelWords: readonly WordItem[],
  phrasalVerbs: readonly PhrasalVerbItem[] = [],
): StoryToken[] {
  const matches = resolveRecordedMatches(usedWords, levelWords, phrasalVerbs)
  const formTrie = buildFormTrie(matches)
  const normalizedStory = storyText.toLowerCase()
  const tokens: StoryToken[] = []
  let textStart = 0
  let cursor = 0

  while (cursor < storyText.length) {
    const matchingForm = longestMatchAt(storyText, normalizedStory, cursor, formTrie)

    if (!matchingForm) {
      cursor += 1
      continue
    }

    if (textStart < cursor) {
      tokens.push({ type: 'text', value: storyText.slice(textStart, cursor) })
    }

    const value = storyText.slice(cursor, cursor + matchingForm.form.length)
    if (matchingForm.kind === 'phrasalVerb' && matchingForm.phrasalVerb) {
      tokens.push({
        type: 'phrasalVerb',
        value,
        phrasalVerb: matchingForm.phrasalVerb,
      })
    } else if (matchingForm.word && matchingForm.entry) {
      tokens.push({
        type: 'word',
        value,
        word: matchingForm.word,
        entry: matchingForm.entry,
      })
    }

    cursor += matchingForm.form.length
    textStart = cursor
  }

  if (textStart < storyText.length) {
    tokens.push({ type: 'text', value: storyText.slice(textStart) })
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', value: storyText }]
}

const STORY_PARAGRAPH_SEPARATOR = '\u0000'

export function tokenizeStoryParagraphs(
  storyText: string,
  usedWords: StoryContent['usedWords'],
  levelWords: readonly WordItem[],
  phrasalVerbs: readonly PhrasalVerbItem[] = [],
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
