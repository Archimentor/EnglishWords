import { describe, expect, test } from 'vitest'
import type { ContentSourceCacheStatus } from './fetchSources'
import { formatContentSourceReport, hasUnverifiedCaches } from './reportSources'
import { CONTENT_SOURCES } from './sources'

describe('content source report', () => {
  test('prints provenance and cache verification state for every source', () => {
    const statuses: ContentSourceCacheStatus[] = [
      { source: CONTENT_SOURCES[0], cachePresent: true, verified: true },
      { source: CONTENT_SOURCES[1], cachePresent: false, verified: false },
    ]

    expect(JSON.parse(formatContentSourceReport(statuses))).toEqual([
      {
        id: 'cefrj',
        url: CONTENT_SOURCES[0].url,
        license: CONTENT_SOURCES[0].license,
        attribution: CONTENT_SOURCES[0].attribution,
        expectedSha256: CONTENT_SOURCES[0].sha256,
        cachePresent: true,
        verified: true,
      },
      {
        id: 'korean-wiktionary',
        url: CONTENT_SOURCES[1].url,
        license: CONTENT_SOURCES[1].license,
        attribution: CONTENT_SOURCES[1].attribution,
        expectedSha256: CONTENT_SOURCES[1].sha256,
        cachePresent: false,
        verified: false,
      },
    ])
    expect(hasUnverifiedCaches(statuses)).toBe(true)
    expect(hasUnverifiedCaches(statuses.slice(0, 1))).toBe(false)
  })
})
