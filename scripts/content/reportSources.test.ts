import { describe, expect, test } from 'vitest'
import type { ContentSourceCacheStatus } from './fetchSources'
import { formatContentSourceReport, hasUnverifiedCaches } from './reportSources'
import { CONTENT_SOURCES } from './sources'

const FIRST_SOURCE = CONTENT_SOURCES[0]!
const SECOND_SOURCE = CONTENT_SOURCES[1]!

describe('content source report', () => {
  test('prints provenance and cache verification state for every source', () => {
    const statuses: ContentSourceCacheStatus[] = [
      { source: FIRST_SOURCE, cachePresent: true, verified: true },
      { source: SECOND_SOURCE, cachePresent: false, verified: false },
    ]

    expect(JSON.parse(formatContentSourceReport(statuses))).toEqual([
      {
        id: 'cefrj',
        url: FIRST_SOURCE.url,
        license: FIRST_SOURCE.license,
        attribution: FIRST_SOURCE.attribution,
        expectedSha256: FIRST_SOURCE.sha256,
        cachePresent: true,
        verified: true,
      },
      {
        id: 'korean-wiktionary',
        url: SECOND_SOURCE.url,
        license: SECOND_SOURCE.license,
        attribution: SECOND_SOURCE.attribution,
        expectedSha256: SECOND_SOURCE.sha256,
        cachePresent: false,
        verified: false,
      },
    ])
    expect(hasUnverifiedCaches(statuses)).toBe(true)
    expect(hasUnverifiedCaches(statuses.slice(0, 1))).toBe(false)
  })
})
