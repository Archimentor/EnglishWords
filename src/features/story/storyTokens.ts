import type {
  StoryContent,
  WordEntry,
  WordItem,
} from '../../domain/content/types'
import {
  entryFormStrings,
  isInternalStoryWordCharacter,
} from '../../domain/content/storyForms'

export interface StoryToken {
  type: 'text' | 'word'
  value: string
  word?: WordItem
  entry?: WordEntry
}

interface RecordedForm {
  form: string
  normalized: string
  word: WordItem
  entry: WordEntry
}

interface FormTrieNode {
  children: Map<string, FormTrieNode>
  recordedForm?: RecordedForm
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

function resolveRecordedForms(
  usedWords: StoryContent['usedWords'],
  levelWords: readonly WordItem[],
): RecordedForm[] {
  const recordedForms = new Map<string, RecordedForm>()
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

      recordedForms.set(normalized, { form, normalized, word, entry })
    }
  }

  return [...recordedForms.values()].sort(
    (left, right) =>
      right.form.length - left.form.length || left.normalized.localeCompare(right.normalized),
  )
}

function buildFormTrie(forms: readonly RecordedForm[]): FormTrieNode {
  const root: FormTrieNode = { children: new Map() }

  for (const form of forms) {
    let node = root
    for (const character of form.normalized) {
      const child = node.children.get(character) ?? { children: new Map() }
      node.children.set(character, child)
      node = child
    }
    node.recordedForm = form
  }

  return root
}

function longestMatchAt(
  storyText: string,
  normalizedStory: string,
  cursor: number,
  trie: FormTrieNode,
): RecordedForm | undefined {
  if (isInternalStoryWordCharacter(storyText[cursor - 1])) return undefined

  let node = trie
  let offset = cursor
  let longestMatch: RecordedForm | undefined

  while (offset < normalizedStory.length) {
    const character = normalizedStory[offset]
    if (character === undefined) break
    const child = node.children.get(character)
    if (!child) break

    node = child
    offset += 1
    if (
      node.recordedForm &&
      hasWholeWordBoundaries(storyText, cursor, node.recordedForm.form.length)
    ) {
      longestMatch = node.recordedForm
    }
  }

  return longestMatch
}

/**
 * Splits a story into verbatim text and clickable forms recorded by the story.
 * Matching is case-insensitive, whole-word only, and prefers the longest form.
 */
export function tokenizeStory(
  storyText: string,
  usedWords: StoryContent['usedWords'],
  levelWords: readonly WordItem[],
): StoryToken[] {
  const forms = resolveRecordedForms(usedWords, levelWords)
  const formTrie = buildFormTrie(forms)
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
    tokens.push({
      type: 'word',
      value: storyText.slice(cursor, cursor + matchingForm.form.length),
      word: matchingForm.word,
      entry: matchingForm.entry,
    })
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
  )
  const result: StoryToken[][] = [[]]
  for (const token of tokenized) {
    if (token.type === 'word') {
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
