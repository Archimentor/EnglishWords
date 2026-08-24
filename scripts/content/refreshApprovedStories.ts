import { readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

import { LEVELS } from '../../src/domain/content/types'
import type {
  GrammarNode,
  Level,
  PhrasalVerbItem,
  WordItem,
} from '../../src/domain/content/types'
import {
  commitContentArtifacts,
  createContentGeneration,
} from './buildContent'
import type { PhrasalCatalogProvenance } from './buildPhrasalCatalog'
import type { WordCatalogProvenance } from './buildWordCatalog'
import { loadApprovedManualStories } from './manualStories'

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function main(): Promise<void> {
  const dataRoot = resolve('public/data')
  const manualStoryRoot = resolve('scripts/content/manual-stories')
  const [
    wordlists,
    phrasalTop,
    phrasalByLevel,
    grammarNodes,
    wordProvenance,
    phrasalProvenance,
    approvedManualStories,
  ] = await Promise.all([
    Promise.all(LEVELS.map(async (level) => [
      level,
      await readJson<WordItem[]>(join(dataRoot, 'wordlists', `${level}.json`)),
    ])),
    readJson<PhrasalVerbItem[]>(join(dataRoot, 'phrasal-verbs', 'top-1000.json')),
    Promise.all(LEVELS.map(async (level) => [
      level,
      await readJson<PhrasalVerbItem[]>(
        join(dataRoot, 'phrasal-verbs', 'by-level', `${level}.json`),
      ),
    ])),
    readJson<GrammarNode[]>(join(dataRoot, 'grammar', 'nodes.json')),
    readJson<WordCatalogProvenance>(join(dataRoot, 'provenance', 'word-catalog.json')),
    readJson<PhrasalCatalogProvenance>(
      join(dataRoot, 'provenance', 'phrasal-catalog.json'),
    ),
    loadApprovedManualStories(manualStoryRoot),
  ])

  const generation = createContentGeneration({
    dataRoot,
    wordlists: Object.fromEntries(wordlists) as Record<Level, WordItem[]>,
    wordProvenance,
    phrasalTop,
    phrasalByLevel: Object.fromEntries(phrasalByLevel) as Record<Level, PhrasalVerbItem[]>,
    phrasalProvenance,
    grammarNodes,
    approvedManualStories,
  })
  const storyRootPrefix = `${join(dataRoot, 'stories')}${sep}`
  const storyProvenancePath = join(dataRoot, 'provenance', 'story-drafts.json')
  const artifacts = generation.artifacts.filter(({ target }) =>
    target.startsWith(storyRootPrefix) || target === storyProvenancePath)
  const result = await commitContentArtifacts(dataRoot, artifacts)

  if (result.status === 'committed-with-cleanup-residue') {
    console.warn(result.warning)
  }
  console.log(`Refreshed ${artifacts.length} approved story artifacts.`)
}

await main()
