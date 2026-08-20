import { SOURCE_VERIFIED_WORD_FAMILY_ROWS } from './wordFamilySourceRegistry'

interface EditorialFamilyReview {
  status: 'maintainer-curated'
  rationale: string
}

interface SourceVerifiedFamilyReview {
  status: 'source-verified'
  sourceId: 'wordnet-3.0'
  relation: 'derivationally-related-form'
  evidence: readonly (readonly [leftSenseKey: string, rightSenseKey: string])[]
  rationale: string
}

export interface CuratedWordFamilyDefinition {
  familyId: string
  headLemma: string
  members: readonly string[]
  review: EditorialFamilyReview | SourceVerifiedFamilyReview
}

export interface WordFamilyIdentity {
  familyId: string
  headLemma: string
  isFamilyHead: boolean
  source: 'editorial-override' | 'wordnet-source-verified' | 'self-family'
}

/**
 * Explicit derivational-family registry.
 *
 * This registry intentionally does not infer families with suffix stripping or
 * stemming. A new relationship becomes part of the catalog contract only
 * after its members, one head lemma, and applicable source evidence are checked
 * in and exercised by the registry tests.
 */
export const EDITORIAL_WORD_FAMILY_OVERRIDES = [
  {
    familyId: 'write-family',
    headLemma: 'write',
    members: ['write', 'writer', 'writing'],
    review: {
      status: 'maintainer-curated',
      rationale: 'writer and the lexical noun writing are transparent derivatives of write',
    },
  },
  {
    familyId: 'act-family',
    headLemma: 'act',
    members: ['act', 'action', 'activity', 'actor', 'active'],
    review: {
      status: 'maintainer-curated',
      rationale: 'action, activity, actor, and active are reviewed members of the act family',
    },
  },
  {
    familyId: 'create-family',
    headLemma: 'create',
    members: ['create', 'creation', 'creative', 'creativity', 'creator'],
    review: {
      status: 'maintainer-curated',
      rationale: 'creation, creative, creativity, and creator are reviewed members of the create family; creature is intentionally excluded as semantic drift',
    },
  },
] as const satisfies readonly CuratedWordFamilyDefinition[]

export const SOURCE_VERIFIED_WORD_FAMILIES: readonly CuratedWordFamilyDefinition[] =
  SOURCE_VERIFIED_WORD_FAMILY_ROWS.map(([headLemma, members, evidence]) => ({
    familyId: `${headLemma}-family`,
    headLemma,
    members,
    review: {
      status: 'source-verified',
      sourceId: 'wordnet-3.0',
      relation: 'derivationally-related-form',
      evidence,
      rationale: 'Exact WordNet 3.0 derivational sense-key relations; no stemming or suffix inference',
    },
  }))

export const CURATED_WORD_FAMILY_OVERRIDES: readonly CuratedWordFamilyDefinition[] = [
  ...EDITORIAL_WORD_FAMILY_OVERRIDES,
  ...SOURCE_VERIFIED_WORD_FAMILIES,
]

function normalizedLemma(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US')
}

function familyIdPart(value: string): string {
  return normalizedLemma(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function buildCuratedWordFamilyIndex(
  definitions: readonly CuratedWordFamilyDefinition[],
): ReadonlyMap<string, WordFamilyIdentity> {
  const index = new Map<string, WordFamilyIdentity>()
  const familyIds = new Set<string>()

  for (const definition of definitions) {
    const headLemma = normalizedLemma(definition.headLemma)
    const members = definition.members.map(normalizedLemma)
    const expectedFamilyId = `${familyIdPart(headLemma)}-family`

    if (definition.review.rationale.trim().length === 0) {
      throw new Error(`Word family ${definition.familyId} is missing its review rationale`)
    }
    if (definition.familyId !== expectedFamilyId) {
      throw new Error(
        `Word family ${definition.familyId} must use the head-derived id ${expectedFamilyId}`,
      )
    }
    if (familyIds.has(definition.familyId)) {
      throw new Error(`Duplicate curated word family id: ${definition.familyId}`)
    }
    if (members.length < 2) {
      throw new Error(`Curated word family ${definition.familyId} must contain at least two members`)
    }
    if (new Set(members).size !== members.length) {
      throw new Error(`Curated word family ${definition.familyId} contains duplicate members`)
    }
    if (!members.includes(headLemma)) {
      throw new Error(`Curated word family ${definition.familyId} does not contain its head lemma`)
    }

    if (definition.review.status === 'source-verified') {
      if (
        definition.review.sourceId !== 'wordnet-3.0'
        || definition.review.relation !== 'derivationally-related-form'
        || definition.review.evidence.length === 0
      ) {
        throw new Error(`Source-verified word family ${definition.familyId} is missing WordNet evidence`)
      }
      const memberSet = new Set(members)
      const evidenceGraph = new Map<string, Set<string>>(members.map((member) => [member, new Set()]))
      for (const [leftSenseKey, rightSenseKey] of definition.review.evidence) {
        if (!/^[^%]+%\d:[0-9a-f]{2}:[0-9a-f]{2}:[^:]*:[^:]*$/i.test(leftSenseKey)
          || !/^[^%]+%\d:[0-9a-f]{2}:[0-9a-f]{2}:[^:]*:[^:]*$/i.test(rightSenseKey)) {
          throw new Error(`Source-verified word family ${definition.familyId} has an invalid sense key`)
        }
        const leftLemma = normalizedLemma(leftSenseKey.split('%', 1)[0]!.replaceAll('_', '-'))
        const rightLemma = normalizedLemma(rightSenseKey.split('%', 1)[0]!.replaceAll('_', '-'))
        if (!memberSet.has(leftLemma) || !memberSet.has(rightLemma) || leftLemma === rightLemma) {
          throw new Error(`Source-verified word family ${definition.familyId} has out-of-family evidence`)
        }
        evidenceGraph.get(leftLemma)!.add(rightLemma)
        evidenceGraph.get(rightLemma)!.add(leftLemma)
      }
      const reached = new Set<string>([headLemma])
      const pending = [headLemma]
      while (pending.length > 0) {
        for (const neighbor of evidenceGraph.get(pending.pop()!) ?? []) {
          if (!reached.has(neighbor)) {
            reached.add(neighbor)
            pending.push(neighbor)
          }
        }
      }
      if (reached.size !== members.length) {
        throw new Error(`Source-verified word family ${definition.familyId} is not component-connected`)
      }
    }

    familyIds.add(definition.familyId)
    for (const lemma of members) {
      if (!/^[a-z]+(?:[-'][a-z]+)*$/.test(lemma)) {
        throw new Error(`Curated word family member is not a normalized English lemma: ${lemma}`)
      }
      if (index.has(lemma)) {
        throw new Error(`Curated word family member appears more than once: ${lemma}`)
      }
      index.set(lemma, {
        familyId: definition.familyId,
        headLemma,
        isFamilyHead: lemma === headLemma,
        source: definition.review.status === 'source-verified'
          ? 'wordnet-source-verified'
          : 'editorial-override',
      })
    }
  }

  return index
}

export const CURATED_WORD_FAMILY_INDEX = buildCuratedWordFamilyIndex(
  CURATED_WORD_FAMILY_OVERRIDES,
)

export function curatedWordFamilyFor(lemma: string): WordFamilyIdentity | undefined {
  return CURATED_WORD_FAMILY_INDEX.get(normalizedLemma(lemma))
}

export function familyForLemma(lemma: string): WordFamilyIdentity {
  const normalized = normalizedLemma(lemma)
  return curatedWordFamilyFor(normalized) ?? {
    familyId: `${familyIdPart(normalized)}-family`,
    headLemma: normalized,
    isFamilyHead: true,
    source: 'self-family',
  }
}

export const wordFamilyFor = familyForLemma

export interface WordFamilyCapacityAudit {
  inputLemmaCount: number
  uniqueLemmaCount: number
  duplicateLemmaCount: number
  representedFamilyCount: number
  selectableHeadCount: number
  nonHeadMemberCount: number
  blockedByBasicFamilyCount: number
  missingHeadFamilyIds: string[]
}

export function auditWordFamilyCapacity(
  lemmas: readonly string[],
  basicLemmas: readonly string[] = [],
): WordFamilyCapacityAudit {
  const uniqueLemmas = [...new Set(lemmas.map(normalizedLemma))]
  const uniqueBasicLemmas = new Set(basicLemmas.map(normalizedLemma))
  const basicFamilyIds = new Set(
    [...uniqueBasicLemmas].map((lemma) => familyForLemma(lemma).familyId),
  )
  const represented = new Map<string, { headLemma: string; members: string[] }>()
  let selectableHeadCount = 0
  let nonHeadMemberCount = 0
  let blockedByBasicFamilyCount = 0

  for (const lemma of uniqueLemmas) {
    const family = familyForLemma(lemma)
    const record = represented.get(family.familyId) ?? {
      headLemma: family.headLemma,
      members: [],
    }
    record.members.push(lemma)
    represented.set(family.familyId, record)
    if (!family.isFamilyHead) nonHeadMemberCount += 1
    if (basicFamilyIds.has(family.familyId)) {
      blockedByBasicFamilyCount += 1
    } else if (family.isFamilyHead) {
      selectableHeadCount += 1
    }
  }

  const presentLemmas = new Set(uniqueLemmas)
  return {
    inputLemmaCount: lemmas.length,
    uniqueLemmaCount: uniqueLemmas.length,
    duplicateLemmaCount: lemmas.length - uniqueLemmas.length,
    representedFamilyCount: represented.size,
    selectableHeadCount,
    nonHeadMemberCount,
    blockedByBasicFamilyCount,
    missingHeadFamilyIds: [...represented]
      .filter(([, family]) => !presentLemmas.has(family.headLemma))
      .map(([familyId]) => familyId)
      .sort(),
  }
}
