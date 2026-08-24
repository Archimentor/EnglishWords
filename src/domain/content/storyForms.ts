import type { WordEntry } from './types'

export function entryFormStrings(entry: Pick<WordEntry, 'forms'>): string[] {
  return Array.isArray(entry.forms) ? [...entry.forms] : Object.values(entry.forms)
}

export function isInternalStoryWordCharacter(
  value: string | undefined,
): boolean {
  return value !== undefined && /[\p{L}\p{N}'’–-]/u.test(value)
}

function isInternalWholeWordBoundary(text: string, index: number): boolean {
  const value = text[index]
  if (value === undefined) return false
  if (/[\p{L}\p{N}–-]/u.test(value)) return true
  if (!/['’]/u.test(value)) return false

  // Apostrophes are part of contractions and possessives only when they sit
  // between two word characters. The same glyph used as an opening or closing
  // quotation mark must remain a valid whole-word boundary.
  return /[\p{L}\p{N}]/u.test(text[index - 1] ?? '')
    && /[\p{L}\p{N}]/u.test(text[index + 1] ?? '')
}

export function hasWholeWordBoundaries(
  text: string,
  start: number,
  length: number,
): boolean {
  return !isInternalWholeWordBoundary(text, start - 1)
    && !isInternalWholeWordBoundary(text, start + length)
}

export function hasWholeWordForm(storyText: string, form: string): boolean {
  if (form.length === 0) return false

  const normalizedStory = storyText.toLowerCase()
  const normalizedForm = form.toLowerCase()
  let cursor = normalizedStory.indexOf(normalizedForm)

  while (cursor !== -1) {
    if (hasWholeWordBoundaries(storyText, cursor, normalizedForm.length)) {
      return true
    }
    cursor = normalizedStory.indexOf(normalizedForm, cursor + 1)
  }

  return false
}
