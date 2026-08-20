import { createHash } from 'node:crypto'

import { LEVELS } from '../../src/domain/content/types'
import type {
  Level,
  PhrasalVerbItem,
  StoryContent,
  WordItem,
} from '../../src/domain/content/types'

export const OUTPUT_DIGEST_ALGORITHM = 'sha256' as const
export const OUTPUT_DIGEST_CANONICALIZATION = 'sorted-json-v1' as const

export interface OutputDigest {
  algorithm: typeof OUTPUT_DIGEST_ALGORITHM
  canonicalization: typeof OUTPUT_DIGEST_CANONICALIZATION
  value: string
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON cannot contain a non-finite number')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  throw new Error(`Canonical JSON cannot contain ${typeof value}`)
}

function outputDigest(payload: unknown): OutputDigest {
  return {
    algorithm: OUTPUT_DIGEST_ALGORITHM,
    canonicalization: OUTPUT_DIGEST_CANONICALIZATION,
    value: createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex'),
  }
}

function leveled<T>(value: Record<Level, T>): Record<Level, T> {
  return Object.fromEntries(LEVELS.map((level) => [level, value[level]])) as Record<Level, T>
}

export function wordCatalogOutputDigest(wordlists: Record<Level, WordItem[]>): OutputDigest {
  return outputDigest({
    kind: 'word-catalog-v1',
    wordlists: leveled(wordlists),
  })
}

export function phrasalCatalogOutputDigest(
  top: PhrasalVerbItem[],
  byLevel: Record<Level, PhrasalVerbItem[]>,
): OutputDigest {
  return outputDigest({
    kind: 'phrasal-catalog-v1',
    top,
    byLevel: leveled(byLevel),
  })
}

export function storyCatalogOutputDigest(stories: Record<Level, StoryContent>): OutputDigest {
  return outputDigest({
    kind: 'story-catalog-v1',
    stories: leveled(stories),
  })
}

export function manualStorySourceDigest(story: StoryContent): OutputDigest {
  return outputDigest({
    kind: 'approved-manual-story-source-v1',
    story,
  })
}
