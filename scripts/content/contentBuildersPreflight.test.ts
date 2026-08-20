import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPhrasalCatalog } from './buildPhrasalCatalog'
import { buildWordCatalog } from './buildWordCatalog'
import { preparePhrasalTranslation } from './preparePhrasalTranslation'

interface BuilderCase {
  name: string
  cacheFile: string
  sourceId: string
  run: (cacheRoot: string) => Promise<unknown>
}

const BUILDERS: BuilderCase[] = [
  {
    name: 'word catalog builder',
    cacheFile: 'cefrj-vocabulary-profile-1.5.csv',
    sourceId: 'cefrj',
    run: buildWordCatalog,
  },
  {
    name: 'phrasal translation preparation',
    cacheFile: 'generated-english-phrasal-verbs.json',
    sourceId: 'phrasal-verbs',
    run: preparePhrasalTranslation,
  },
  {
    name: 'phrasal catalog builder',
    cacheFile: 'generated-english-phrasal-verbs.json',
    sourceId: 'phrasal-verbs',
    run: buildPhrasalCatalog,
  },
]

test.each(BUILDERS)('$name rejects a tampered pinned cache before parsing', async ({
  cacheFile,
  run,
  sourceId,
}) => {
  const cacheRoot = await mkdtemp(join(tmpdir(), 'english-words-builder-preflight-'))

  try {
    await writeFile(join(cacheRoot, cacheFile), 'tampered snapshot')
    await expect(run(cacheRoot)).rejects.toThrow(
      new RegExp(`SHA-256 mismatch for ${sourceId}`),
    )
  } finally {
    await rm(cacheRoot, { force: true, recursive: true })
  }
})
