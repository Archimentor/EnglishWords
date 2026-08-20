import type { WordEntry } from './types'

export function entryFormStrings(entry: Pick<WordEntry, 'forms'>): string[] {
  return Array.isArray(entry.forms) ? [...entry.forms] : Object.values(entry.forms)
}

export function isInternalStoryWordCharacter(
  value: string | undefined,
): boolean {
  return value !== undefined && /[\p{L}\p{N}'’–-]/u.test(value)
}

export function hasWholeWordForm(storyText: string, form: string): boolean {
  if (form.length === 0) return false

  const normalizedStory = storyText.toLowerCase()
  const normalizedForm = form.toLowerCase()
  let cursor = normalizedStory.indexOf(normalizedForm)

  while (cursor !== -1) {
    const end = cursor + normalizedForm.length
    if (
      !isInternalStoryWordCharacter(storyText[cursor - 1]) &&
      !isInternalStoryWordCharacter(storyText[end])
    ) {
      return true
    }
    cursor = normalizedStory.indexOf(normalizedForm, cursor + 1)
  }

  return false
}
