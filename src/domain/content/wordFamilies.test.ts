import { describe, expect, test } from 'vitest'

import { BASIC_EDITORIAL_WORDS } from '../../../scripts/content/buildBasicEditorial'
import {
  CURATED_WORD_FAMILY_OVERRIDES,
  EDITORIAL_WORD_FAMILY_OVERRIDES,
  SOURCE_VERIFIED_WORD_FAMILIES,
  auditWordFamilyCapacity,
  wordFamilyFor,
} from './wordFamilies'
import { SOURCE_VERIFIED_WORD_FAMILY_ROWS } from './wordFamilySourceRegistry'

function senseLemma(senseKey: string): string {
  return senseKey.split('%', 1)[0]!.replaceAll('_', '-').toLowerCase()
}

describe('canonical word-family registry', () => {
  test('keeps the 500-word basic curriculum entirely on unique family heads', () => {
    const identities = BASIC_EDITORIAL_WORDS.map(({ lemma }) => wordFamilyFor(lemma))

    expect(BASIC_EDITORIAL_WORDS).toHaveLength(500)
    expect(identities.every(({ isFamilyHead }) => isFamilyHead)).toBe(true)
    expect(new Set(identities.map(({ familyId }) => familyId)).size).toBe(500)
  })

  test('separates maintainer-curated overrides from source-verified relationships', () => {
    expect(EDITORIAL_WORD_FAMILY_OVERRIDES).toHaveLength(3)
    expect(EDITORIAL_WORD_FAMILY_OVERRIDES.every(({ review }) =>
      review.status === 'maintainer-curated')).toBe(true)
    expect(SOURCE_VERIFIED_WORD_FAMILIES).toHaveLength(996)
    expect(SOURCE_VERIFIED_WORD_FAMILIES.every(({ review }) =>
      review.status === 'source-verified'
      && review.sourceId === 'wordnet-3.0'
      && review.relation === 'derivationally-related-form')).toBe(true)
    expect(CURATED_WORD_FAMILY_OVERRIDES).toHaveLength(999)
  })

  test('freezes the source capacity and exact sense-key evidence coordinates', () => {
    expect(SOURCE_VERIFIED_WORD_FAMILY_ROWS).toHaveLength(996)
    expect(SOURCE_VERIFIED_WORD_FAMILY_ROWS.reduce(
      (count, [, members]) => count + members.length,
      0,
    )).toBe(2_285)
    expect(SOURCE_VERIFIED_WORD_FAMILY_ROWS.reduce(
      (count, [, , evidence]) => count + evidence.length,
      0,
    )).toBe(1_299)
  })

  test('forms closed, connected components without overlapping members', () => {
    const globalMemberOwners = new Map<string, string>()
    const globalEvidence = new Map<string, Set<string>>()

    for (const [headLemma, members, evidence] of SOURCE_VERIFIED_WORD_FAMILY_ROWS) {
      const memberSet = new Set<string>(members)
      expect(memberSet.size).toBe(members.length)
      expect(memberSet.has(headLemma)).toBe(true)

      for (const member of members) {
        expect(globalMemberOwners.has(member), member).toBe(false)
        globalMemberOwners.set(member, headLemma)
        if (!globalEvidence.has(member)) globalEvidence.set(member, new Set())
      }
      for (const [leftSenseKey, rightSenseKey] of evidence) {
        const left = senseLemma(leftSenseKey)
        const right = senseLemma(rightSenseKey)
        expect(memberSet.has(left), `${headLemma}: ${leftSenseKey}`).toBe(true)
        expect(memberSet.has(right), `${headLemma}: ${rightSenseKey}`).toBe(true)
        globalEvidence.get(left)!.add(right)
        globalEvidence.get(right)!.add(left)
      }

      const reached = new Set<string>([headLemma])
      const pending: string[] = [headLemma]
      while (pending.length > 0) {
        for (const neighbor of globalEvidence.get(pending.pop()!) ?? []) {
          if (!reached.has(neighbor)) {
            reached.add(neighbor)
            pending.push(neighbor)
          }
        }
      }
      expect(reached, headLemma).toEqual(memberSet)
    }

    const components = new Map<string, Set<string>>()
    for (const member of globalMemberOwners.keys()) {
      if (components.has(member)) continue
      const component = new Set([member])
      const pending = [member]
      while (pending.length > 0) {
        for (const neighbor of globalEvidence.get(pending.pop()!) ?? []) {
          if (!component.has(neighbor)) {
            component.add(neighbor)
            pending.push(neighbor)
          }
        }
      }
      component.forEach((lemma) => components.set(lemma, component))
      expect(new Set([...component].map((lemma) => globalMemberOwners.get(lemma))).size).toBe(1)
    }
  })

  test('keeps audited homonym and semantic-drift bridges in different families', () => {
    for (const [left, right] of [
      ['create', 'creature'],
      ['commission', 'commit'],
      ['commit', 'committee'],
      ['contain', 'continent'],
      ['crisis', 'critical'],
      ['drift', 'drive'],
      ['elect', 'eligible'],
      ['hypothecate', 'hypothesis'],
      ['tend', 'tender'],
    ] as const) {
      expect(wordFamilyFor(left).familyId, `${left}/${right}`)
        .not.toBe(wordFamilyFor(right).familyId)
    }
  })

  test('uses base heads unless the checked-in basic curriculum deliberately takes priority', () => {
    for (const [member, head] of [
      ['validity', 'valid'],
      ['weakness', 'weak'],
      ['ability', 'able'],
      ['education', 'educate'],
      ['employment', 'employ'],
      ['visitor', 'visitor'],
      ['artist', 'artist'],
      ['angry', 'angry'],
    ] as const) {
      expect(wordFamilyFor(member).headLemma).toBe(head)
    }
  })

  test('reports independent-head capacity and missing canonical heads explicitly', () => {
    expect(auditWordFamilyCapacity(
      ['write', 'writer', 'safe', 'validity', 'unrelated', 'unrelated'],
      ['write'],
    )).toEqual({
      inputLemmaCount: 6,
      uniqueLemmaCount: 5,
      duplicateLemmaCount: 1,
      representedFamilyCount: 4,
      selectableHeadCount: 2,
      nonHeadMemberCount: 2,
      blockedByBasicFamilyCount: 2,
      missingHeadFamilyIds: ['valid-family'],
    })
  })
})
