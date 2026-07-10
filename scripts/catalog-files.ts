import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { LEVELS } from '../src/domain/content/types'
import type {
  ContentCatalog,
  GrammarNode,
  PhrasalVerbItem,
  StoryContent,
  WordItem,
} from '../src/domain/content/types'

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

export function catalogCounts(catalog: ContentCatalog): {
  words: number
  phrasalVerbs: number
  grammarNodes: number
  stories: number
} {
  return {
    words: Object.values(catalog.wordlists).reduce((total, words) => total + words.length, 0),
    phrasalVerbs: catalog.phrasalVerbs.top.length,
    grammarNodes: catalog.grammarNodes.length,
    stories: Object.keys(catalog.stories).length,
  }
}
