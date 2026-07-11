import type {
  StoryContent,
  WordEntry,
  WordItem,
} from '../../domain/content/types'

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

function entryForms(entry: WordEntry): readonly string[] {
  return Array.isArray(entry.forms) ? entry.forms : Object.values(entry.forms)
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}_]/u.test(value)
}

function hasWholeWordBoundaries(
  storyText: string,
  start: number,
  length: number,
): boolean {
  return (
    !isWordCharacter(storyText[start - 1]) &&
    !isWordCharacter(storyText[start + length])
  )
}

function resolveRecordedForms(
  usedWords: StoryContent['usedWords'],
  levelWords: readonly WordItem[],
): RecordedForm[] {
  const recordedForms = new Map<string, RecordedForm>()

  for (const usedWord of usedWords) {
    const word = levelWords.find((candidate) => candidate.lemma === usedWord.lemma)
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

    const knownForms = new Set(entryForms(entry).map((form) => form.toLowerCase()))
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
  const tokens: StoryToken[] = []
  let textStart = 0
  let cursor = 0

  while (cursor < storyText.length) {
    const matchingForm = forms.find(
      (candidate) =>
        storyText
          .slice(cursor, cursor + candidate.form.length)
          .toLowerCase() === candidate.normalized &&
        hasWholeWordBoundaries(storyText, cursor, candidate.form.length),
    )

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
