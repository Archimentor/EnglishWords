import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { LEVELS } from '../src/domain/content/types'
import type {
  ContentCatalog,
  GrammarNode,
  PhrasalVerbItem,
  StoryContent,
  ValidationIssue,
  WordItem,
} from '../src/domain/content/types'

export interface CatalogProvenanceFiles {
  wordCatalog: unknown
  phrasalCatalog: unknown
  storyDrafts: unknown
}

export interface CatalogProvenanceReadResult {
  provenance: CatalogProvenanceFiles
  issues: ValidationIssue[]
}

async function readJson<T>(filePath: string): Promise<T> {
  try {
    const source = await readFile(filePath, 'utf8')
    return JSON.parse(source) as T
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read or parse JSON file ${filePath}: ${detail}`, { cause: error })
  }
}

export async function readCatalogFromDisk(dataRoot: string): Promise<ContentCatalog> {
  const wordlistReads = LEVELS.map(async (level) =>
    [level, await readJson<WordItem[]>(join(dataRoot, 'wordlists', `${level}.json`))] as const,
  )
  const phrasalByLevelReads = LEVELS.map(async (level) =>
    [
      level,
      await readJson<PhrasalVerbItem[]>(
        join(dataRoot, 'phrasal-verbs', 'by-level', `${level}.json`),
      ),
    ] as const,
  )
  const storyReads = LEVELS.map(async (level) =>
    [level, await readJson<StoryContent>(join(dataRoot, 'stories', `${level}.json`))] as const,
  )

  const [wordlistEntries, top, phrasalByLevelEntries, storyEntries, grammarNodes] =
    await Promise.all([
      Promise.all(wordlistReads),
      readJson<PhrasalVerbItem[]>(join(dataRoot, 'phrasal-verbs', 'top-1000.json')),
      Promise.all(phrasalByLevelReads),
      Promise.all(storyReads),
      readJson<GrammarNode[]>(join(dataRoot, 'grammar', 'nodes.json')),
    ])

  return {
    wordlists: Object.fromEntries(wordlistEntries) as ContentCatalog['wordlists'],
    phrasalVerbs: {
      top,
      byLevel: Object.fromEntries(
        phrasalByLevelEntries,
      ) as ContentCatalog['phrasalVerbs']['byLevel'],
    },
    stories: Object.fromEntries(storyEntries) as ContentCatalog['stories'],
    grammarNodes,
  }
}

const PROVENANCE_FILES = [
  ['wordCatalog', 'word-catalog.json'],
  ['phrasalCatalog', 'phrasal-catalog.json'],
  ['storyDrafts', 'story-drafts.json'],
] as const

export async function readCatalogProvenanceFromDisk(
  dataRoot: string,
): Promise<CatalogProvenanceReadResult> {
  const entries: Array<{
    key: (typeof PROVENANCE_FILES)[number][0]
    value: unknown
    issue?: ValidationIssue
  }> = await Promise.all(PROVENANCE_FILES.map(async ([key, fileName]) => {
    const filePath = join(dataRoot, 'provenance', fileName)
    try {
      return {
        key,
        value: await readJson<unknown>(filePath),
      }
    } catch (error) {
      return {
        key,
        value: undefined,
        issue: {
          code: 'PROVENANCE_READ_ERROR',
          path: `provenance.${key}`,
          message: error instanceof Error ? error.message : String(error),
        } satisfies ValidationIssue,
      }
    }
  }))

  return {
    provenance: Object.fromEntries(
      entries.map(({ key, value }) => [key, value]),
    ) as unknown as CatalogProvenanceFiles,
    issues: entries.flatMap(({ issue }) => issue === undefined ? [] : [issue]),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

export function catalogCounts(catalog: unknown): {
  words: number
  phrasalVerbs: number
  grammarNodes: number
  stories: number
} {
  if (!isRecord(catalog)) {
    return { words: 0, phrasalVerbs: 0, grammarNodes: 0, stories: 0 }
  }

  const wordlists = isRecord(catalog.wordlists) ? catalog.wordlists : {}
  const phrasalVerbs = isRecord(catalog.phrasalVerbs) ? catalog.phrasalVerbs : {}
  const stories = isRecord(catalog.stories) ? catalog.stories : {}

  return {
    words: Object.values(wordlists).reduce<number>(
      (total, words) => total + arrayLength(words),
      0,
    ),
    phrasalVerbs: arrayLength(phrasalVerbs.top),
    grammarNodes: arrayLength(catalog.grammarNodes),
    stories: Object.keys(stories).length,
  }
}
