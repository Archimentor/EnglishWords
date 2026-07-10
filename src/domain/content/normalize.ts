import { LEVELS } from './types'
import type {
  ContentCatalog,
  Level,
  PhrasalVerbItem,
  RuntimeCatalog,
  StudyItem,
  WordItem,
} from './types'

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export function normalizeWord(word: WordItem): StudyItem {
  return {
    id: word.id,
    kind: 'word',
    term: word.word,
    lemma: word.lemma,
    level: word.level,
    difficulty: word.difficulty,
    partsOfSpeech: unique(word.entries.map(({ partOfSpeech }) => partOfSpeech)),
    forms: unique(
      word.entries.flatMap(({ forms }) =>
        Array.isArray(forms) ? forms : Object.values(forms),
      ),
    ),
    meanings: unique(word.entries.flatMap(({ meanings }) => meanings)),
    ipa: word.entries.find(({ ipa }) => ipa.trim().length > 0)?.ipa.trim() ?? null,
    examples: unique(word.entries.flatMap(({ examples }) => examples)),
  }
}

export function normalizePhrasalVerb(phrasalVerb: PhrasalVerbItem): StudyItem {
  return {
    id: phrasalVerb.id,
    kind: 'phrasalVerb',
    term: phrasalVerb.phrasalVerb,
    lemma: phrasalVerb.phrasalVerb,
    level: phrasalVerb.levelHint,
    difficulty: phrasalVerb.difficulty,
    partsOfSpeech: ['phrasalVerb'],
    forms: [phrasalVerb.phrasalVerb],
    meanings: [...phrasalVerb.meaningKo],
    ipa: null,
    examples: [...phrasalVerb.examples],
  }
}

export function normalizeCatalog(catalog: ContentCatalog): RuntimeCatalog {
  const itemsByLevel = Object.fromEntries(
    LEVELS.map((level) => [
      level,
      [
        ...catalog.wordlists[level].map(normalizeWord),
        ...catalog.phrasalVerbs.byLevel[level].map(normalizePhrasalVerb),
      ],
    ]),
  ) as Record<Level, StudyItem[]>
  const itemsById = Object.fromEntries(
    LEVELS.flatMap((level) => itemsByLevel[level]).map((item) => [item.id, item]),
  )

  return { ...catalog, itemsByLevel, itemsById }
}
