import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  hasReaderGlossCorrection,
  readerPhrasalVerbMeanings,
} from '../src/domain/content/phrasalMeaning'
import { LEVELS } from '../src/domain/content/types'
import type { PhrasalVerbItem } from '../src/domain/content/types'

const items = LEVELS.flatMap((level) => JSON.parse(readFileSync(
  resolve(`public/data/phrasal-verbs/by-level/${level}.json`),
  'utf8',
)) as PhrasalVerbItem[])

describe('reader-facing phrasal verb meanings', () => {
  test('formats every catalog meaning as a concise Korean dictionary gloss', () => {
    const meanings = items.flatMap(readerPhrasalVerbMeanings)

    expect(items).toHaveLength(1_000)
    expect(meanings).toHaveLength(1_000)
    expect(meanings.every((meaning) => /[가-힣]/u.test(meaning))).toBe(true)
    expect(Math.max(...meanings.map((meaning) => meaning.length))).toBeLessThanOrEqual(45)
    expect(meanings).not.toContain('')
    for (const meaning of meanings) {
      expect(meaning).toMatch(/다$/u)
      expect(meaning).not.toMatch(/당신/u)
      expect(meaning).not.toMatch(/(?:거든요|죠|것$|위해서(?:입니다|요)?|사용됩니다|하세요|합니다|됩니다|있습니다|없습니다)$/u)
    }
  })

  test('corrects the ambiguous and visibly literal senses used in the reader', () => {
    const byPhrase = new Map(items.map((item) => [item.phrasalVerb, item]))

    expect(readerPhrasalVerbMeanings(byPhrase.get('talk round')!))
      .toEqual(['설득해 동의하게 하다'])
    expect(readerPhrasalVerbMeanings(byPhrase.get('come across')!))
      .toEqual(['특정한 인상을 주다'])
    expect(readerPhrasalVerbMeanings(byPhrase.get('check in')!))
      .toEqual(['호텔이나 병원에 도착해 등록하다'])
    expect(readerPhrasalVerbMeanings(byPhrase.get('wake up')!))
      .toEqual(['잠에서 깨다'])
    expect(items.filter(({ phrasalVerb }) => hasReaderGlossCorrection(phrasalVerb)).length)
      .toBeGreaterThanOrEqual(200)
  })
})
