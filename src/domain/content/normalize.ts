import { LEVELS } from './types'
import type {
  ContentCatalog,
  Level,
  PhrasalVerbItem,
  RuntimeCatalog,
  StudyItem,
  WordEntry,
  WordItem,
} from './types'

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function cloneEntry(entry: WordEntry): WordEntry {
  return {
    partOfSpeech: entry.partOfSpeech,
    forms: Array.isArray(entry.forms) ? [...entry.forms] : { ...entry.forms },
    meanings: [...entry.meanings],
    ipa: entry.ipa,
    examples: [...entry.examples],
  }
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
    entries: word.entries.map(cloneEntry),
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
    ipa: phrasalVerb.ipa.trim(),
    examples: [...phrasalVerb.examples],
    entries: [{
      partOfSpeech: phrasalVerb.partOfSpeech,
      forms: [phrasalVerb.phrasalVerb],
      meanings: [...phrasalVerb.meaningKo],
      ipa: phrasalVerb.ipa.trim(),
      examples: [...phrasalVerb.examples],
    }],
  }
}

export function normalizeCatalog(catalog: ContentCatalog): RuntimeCatalog {
  const levelCache: Partial<Record<Level, StudyItem[]>> = {}
  const itemsByLevel = {} as Record<Level, StudyItem[]>

  for (const level of LEVELS) {
    Object.defineProperty(itemsByLevel, level, {
      enumerable: true,
      get(): StudyItem[] {
        const cached = levelCache[level]
        if (cached) return cached

        const normalized = [
          ...catalog.wordlists[level].map(normalizeWord),
          ...catalog.phrasalVerbs.byLevel[level].map(normalizePhrasalVerb),
        ]
        levelCache[level] = normalized
        return normalized
      },
    })
  }

  let itemsByIdCache: Record<string, StudyItem> | undefined
  const runtime = { ...catalog, itemsByLevel } as RuntimeCatalog
  Object.defineProperty(runtime, 'itemsById', {
    enumerable: true,
    get(): Record<string, StudyItem> {
      itemsByIdCache ??= Object.fromEntries(
        LEVELS.flatMap((level) => itemsByLevel[level]).map((item) => [item.id, item]),
      )
      return itemsByIdCache
    },
  })

  return runtime
}
