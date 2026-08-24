import type {
  Level,
  PhrasalVerbItem,
  StoryContent,
  WordItem,
} from '../../src/domain/content/types'
import { entryFormStrings } from '../../src/domain/content/storyForms'

const CHAPTER_TITLES = [
  'Mina',
  'Joon',
  'Sara',
  'Leo',
  'Maple',
  'Harbor',
] as const

function draftChapter(surface: string): string {
  return Array.from(
    { length: 5 },
    () => Array.from({ length: 3 }, () => `Mina ${surface}.`).join(' '),
  ).join('\n\n')
}

/**
 * Produces an intentionally unapproved fallback. Release builds are expected
 * to replace every level with a digest-bound approved novel. The fallback is
 * deliberately small and carries no fabricated phrasal-sense bindings.
 */
export function buildStoryDraft(
  level: Level,
  words: readonly WordItem[],
  _allowedWords: readonly WordItem[] = words,
  _phrasalVerbs: readonly PhrasalVerbItem[] = [],
): StoryContent {
  const firstWord = words[0]
  if (!firstWord) throw new Error(`Cannot create an empty ${level} story draft.`)
  const firstEntry = firstWord.entries[0]
  if (!firstEntry) throw new Error(`Cannot create a ${level} story draft without a word entry.`)
  const surface = entryFormStrings(firstEntry)[0] ?? firstWord.word

  return {
    schemaVersion: '2.0.0',
    level,
    title: 'Mina',
    chapterTitles: [...CHAPTER_TITLES],
    isManual: false,
    coverage: {
      mustCoverAll: false,
      allowUpperLevelWords: false,
      coverageRate: 1 / words.length,
    },
    usedWords: [{
      lemma: firstWord.lemma,
      partOfSpeech: firstEntry.partOfSpeech,
      forms: [surface],
    }],
    usedPhrasalVerbs: [],
    storyText: CHAPTER_TITLES
      .map(() => draftChapter(surface))
      .join('\n\n\n'),
  }
}
