import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { LEVELS } from '../../src/domain/content/types'
import type { Level, PhrasalVerbItem } from '../../src/domain/content/types'
import { difficultyForPosition } from './difficultyBands'
import { requireVerifiedContentSourceCaches } from './fetchSources'
import type { ContentSource, ContentSourceId } from './source-types'
import { CONTENT_SOURCES } from './sources'
import { phrasalCatalogOutputDigest } from './catalogDigest'
import type { OutputDigest } from './catalogDigest'
import {
  CONTENT_REPOSITORY_ROOT,
  DEFAULT_CONTENT_CACHE_ROOT,
  PHRASAL_GLOSS_MANIFEST_PATH,
} from './paths'
import {
  PHRASAL_ALIGNMENT_MODEL,
  PHRASAL_PREPARED_CANDIDATE_COUNT,
  PHRASAL_TRANSLATION_MODEL,
  PINNED_PHRASAL_ALIGNMENTS,
  PINNED_PHRASAL_RECOVERY,
  REQUIRED_PHRASAL_PHRASES,
  containsPhrasalUse,
  isSafePhrasalContent,
  isSuitablePhrasalExample,
  readPinnedPhrasalRecovery,
  selectPhrasalSources,
  type SelectedPhrasalSource,
} from './phrasalSource'

export const PHRASAL_CONTENT_SOURCE_IDS = [
  'phrasal-verbs',
  'ipa-dict',
  'frequency',
  'cefrj',
  'tatoeba-english',
] as const satisfies readonly ContentSourceId[]

const PHRASAL_CONTENT_SOURCES: readonly ContentSource[] = PHRASAL_CONTENT_SOURCE_IDS
  .map((sourceId) => {
    const source = CONTENT_SOURCES.find(({ id }) => id === sourceId)
    if (!source) throw new Error(`Unknown phrasal content source: ${sourceId}`)
    return source
  })

type PhrasalExampleOrigin = {
  kind: 'phrasal-verbs-source'
  sourceId: 'phrasal-verbs'
  sourceIndex: number
  exampleIndex: number
} | {
  kind: 'tatoeba-pinned-source'
  sourceId: 'tatoeba-english'
  line: number
} | {
  kind: 'definition-conditioned-machine-generated'
  promptVersion: 'phrasal-editorial-v1'
}

interface PhrasalGloss {
  phrase: string
  senseId: string
  meaningKo: string
  englishDescription: string
  sourceDescription: string
  examples: [string, string]
  exampleOrigins: [PhrasalExampleOrigin, PhrasalExampleOrigin]
  selectionMethod: 'machine-assisted-audited-source-pair'
    | 'machine-assisted-editorial-correction'
  translationStatus: 'machine-translated'
    | 'machine-assisted-gloss-override'
    | 'machine-assisted-editorial-correction'
  reviewStatus: 'machine-assisted-draft-not-human-reviewed'
}

interface PhrasalGlossManifest {
  schemaVersion: '5.0.0'
  model: typeof PHRASAL_TRANSLATION_MODEL
  alignmentModel: typeof PHRASAL_ALIGNMENT_MODEL
  generator: Record<string, string>
  reviewStatus: 'machine-assisted-draft-not-human-reviewed'
  glosses: PhrasalGloss[]
}

export interface PhrasalCatalogProvenance {
  schemaVersion: '2.0.0'
  generatedBy: 'scripts/content/buildPhrasalCatalog.ts'
  outputDigest: OutputDigest
  selectionPolicy: string
  sources: readonly ContentSource[]
  translation: {
    model: typeof PHRASAL_TRANSLATION_MODEL
    status: PhrasalGlossManifest['reviewStatus']
    caveat: string
  }
  alignment: {
    model: typeof PHRASAL_ALIGNMENT_MODEL
    status: PhrasalGlossManifest['reviewStatus']
    caveat: string
  }
  phrases: Array<{
    phrase: string
    level: Level
    sourceIndex: number
    sourceFrequency: number
    baseFrequencyRank: number | null
    baseCefr: string | null
    englishDescription: string
    sourceDescription: string
    selectionMethod: PhrasalGloss['selectionMethod']
    translationStatus: PhrasalGloss['translationStatus']
    reviewStatus: PhrasalGloss['reviewStatus']
    senseId: string
    exampleOrigins: PhrasalGloss['exampleOrigins']
  }>
}

export const PHRASAL_ALIGNMENT_THRESHOLD = 0.09
export const PHRASAL_MINIMUM_EXAMPLE_SIMILARITY = 0.05
export const PHRASAL_MINIMUM_PAIR_SIMILARITY = 0.05

export const EARLY_LEARNER_PHRASAL_EXAMPLE_POLICY: Readonly<Partial<Record<Level, Readonly<{
  maxCharacters: number
  maxWords: number
  maxWordLength: number
}>>>> = {
  기초: { maxCharacters: 60, maxWords: 12, maxWordLength: 10 },
  유치원: { maxCharacters: 80, maxWords: 16, maxWordLength: 12 },
}

const EARLY_LEARNER_SENSITIVE_CONTENT = /\b(?:abortion|admission|applicant|bank(?:ing)?|barrister|boyfriend|cambridge|campaign|candidate|court|credit|debt|divorc\w*|election|elitism|fee\w*|girlfriend|government|insurance|intellectualis\w*|investment|lawsuit|loan|marriage|mortgage|parliament|politic\w*|prosecut\w*|retire\w*|salary|shares?|spouse|tax(?:es)?|wages?|war|wife|husband)\b/i

export interface PhrasalLearnerContent {
  phrase: string
  description: string
  meaningKo: string
  examples: readonly string[]
}

interface EarlyLearnerPhrasalSemanticPolicy {
  id: 'financial-transactions' | 'adult-relationships' | 'abandonment'
  minimumLevel: Level
  englishDescriptionPattern: RegExp
  koreanMeaningPattern: RegExp
}

/**
 * Meaning-level exclusions for the two earliest learner bands. Patterns run
 * only against the selected English description and Korean gloss: a phrasal
 * verb's surface form alone must never reject an unrelated, learner-safe sense.
 */
export const EARLY_LEARNER_PHRASAL_SEMANTIC_POLICY = [
  {
    id: 'financial-transactions',
    minimumLevel: '초등학교',
    englishDescriptionPattern: /\b(?:money|cash|bank(?:ing)?|bank account|financ(?:e|ial)|funds?|payments?|pension|loans?|mortgages?|salary|wages?|tax(?:es)?|investments?|shares?|credit|debts?|fees?|bills?)\b|\bagree how much (?:each|a|the|someone|somebody|people|person|group).{0,50}\bpay\b/i,
    koreanMeaningPattern: /(?:돈|현금|계좌|기금|납입|금액|결제|지불|저축|절약|급여|월급|임금|세금|투자|대출|빚|부채|연금|보험료)/,
  },
  {
    id: 'adult-relationships',
    minimumLevel: '초등학교',
    englishDescriptionPattern: /\b(?:boyfriend|divorc\w*|girlfriend|husband|marriage|marry|romantic relationship|spouse|wife)\b/i,
    koreanMeaningPattern: /(?:결혼|혼인|남자친구|여자친구|남편|아내|배우자|이혼|연인)/,
  },
  {
    id: 'abandonment',
    minimumLevel: '초등학교',
    englishDescriptionPattern: /\b(?:abandon\w*|desert(?:ed|ing|s)?|suddenly leave (?:a person|someone|somebody) who needs you|leave (?:a |the )?situation that depends on you)\b/i,
    koreanMeaningPattern: /(?:필요로\s*하는\s*(?:사람|상황).{0,20}떠나|(?:사람|상황).{0,15}(?:버리|저버리|유기))/,
  },
] as const satisfies readonly EarlyLearnerPhrasalSemanticPolicy[]

const CEFR_DIFFICULTY_ORDER: Readonly<Record<string, number>> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
  C2: 5,
}

function englishWords(value: string): string[] {
  return value.match(/[A-Za-z]+(?:['’~-][A-Za-z]+)*/g) ?? []
}

export function isPhrasalExampleAgeAppropriate(value: string, level: Level): boolean {
  if (!isSuitablePhrasalExample(value)) return false
  const policy = EARLY_LEARNER_PHRASAL_EXAMPLE_POLICY[level]
  if (!policy) return true

  const words = englishWords(value)
  return value.trim().length <= policy.maxCharacters
    && words.length <= policy.maxWords
    && words.every((word) => word.replace(/[^A-Za-z]/g, '').length <= policy.maxWordLength)
    && !EARLY_LEARNER_SENSITIVE_CONTENT.test(value)
}

export function isPhrasalContentAgeAppropriate(
  source: PhrasalLearnerContent,
  level: Level,
): boolean {
  const phrase = source.phrase.trim()
  const description = source.description.trim()
  const meaningKo = source.meaningKo.trim()
  if (!phrase || !description || !meaningKo) return false
  if (!source.examples.every((example) => isPhrasalExampleAgeAppropriate(example, level))) {
    return false
  }

  const levelIndex = LEVELS.indexOf(level)
  return EARLY_LEARNER_PHRASAL_SEMANTIC_POLICY.every((policy) => {
    if (levelIndex >= LEVELS.indexOf(policy.minimumLevel)) return true
    return !policy.englishDescriptionPattern.test(description)
      && !policy.koreanMeaningPattern.test(meaningKo)
  })
}

function learnerContentBand(source: PhrasalLearnerContent): number {
  const firstSuitableLevel = LEVELS.findIndex((level) =>
    isPhrasalContentAgeAppropriate(source, level))
  return firstSuitableLevel === -1 ? LEVELS.length : firstSuitableLevel
}

export function assignPhrasalLevelsForLearners<T extends {
  phrase: string
  description: string
  meaningKo: string
  examples: readonly string[]
  baseCefr: string | null
}>(sources: readonly T[]): Array<T & { level: Level }> {
  const perLevel = sources.length / LEVELS.length
  if (!Number.isInteger(perLevel) || perLevel <= 0) {
    throw new Error('Phrasal source count must divide evenly across all learner levels')
  }

  LEVELS.forEach((level, levelIndex) => {
    const cumulativeQuota = perLevel * (levelIndex + 1)
    const capacity = sources.filter((source) =>
      isPhrasalContentAgeAppropriate(source, level)).length
    if (capacity < cumulativeQuota) {
      throw new Error(
        `Insufficient age-appropriate phrasal content capacity for ${level}: ${capacity} eligible for ${cumulativeQuota} cumulative slots`,
      )
    }
  })

  const requiredOrder = new Map<string, number>(
    REQUIRED_PHRASAL_PHRASES.map((phrase, index) => [phrase, index]),
  )
  const ordered = sources.map((source, sourceOrder) => ({ source, sourceOrder })).sort((left, right) => {
    const contentBandDifference = learnerContentBand(left.source) - learnerContentBand(right.source)
    if (contentBandDifference !== 0) return contentBandDifference

    const leftRequired = requiredOrder.get(left.source.phrase)
    const rightRequired = requiredOrder.get(right.source.phrase)
    if (leftRequired !== undefined || rightRequired !== undefined) {
      if (leftRequired === undefined) return 1
      if (rightRequired === undefined) return -1
      return leftRequired - rightRequired
    }

    return (CEFR_DIFFICULTY_ORDER[left.source.baseCefr ?? ''] ?? 6)
        - (CEFR_DIFFICULTY_ORDER[right.source.baseCefr ?? ''] ?? 6)
      || left.sourceOrder - right.sourceOrder
  })

  return ordered.map(({ source }, index) => {
    const level = LEVELS[Math.floor(index / perLevel)]!
    if (!isPhrasalContentAgeAppropriate(source, level)) {
      throw new Error(
        `Insufficient age-appropriate phrasal content for ${level}: ${source.phrase}`,
      )
    }
    return { ...source, level }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function senseIdFor(phrase: string, englishDescription: string): string {
  return createHash('sha256').update(`${phrase}\n${englishDescription}`, 'utf8').digest('hex')
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function parseExampleOrigin(value: unknown): PhrasalExampleOrigin | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return undefined
  if (value.kind === 'phrasal-verbs-source'
    && Object.keys(value).sort().join(',') === 'exampleIndex,kind,sourceId,sourceIndex'
    && value.sourceId === 'phrasal-verbs'
    && isNonNegativeInteger(value.sourceIndex)
    && isNonNegativeInteger(value.exampleIndex)) {
    return value as PhrasalExampleOrigin
  }
  if (value.kind === 'tatoeba-pinned-source'
    && Object.keys(value).sort().join(',') === 'kind,line,sourceId'
    && value.sourceId === 'tatoeba-english'
    && isPositiveInteger(value.line)) {
    return value as PhrasalExampleOrigin
  }
  if (value.kind === 'definition-conditioned-machine-generated'
    && Object.keys(value).sort().join(',') === 'kind,promptVersion'
    && value.promptVersion === 'phrasal-editorial-v1') {
    return value as PhrasalExampleOrigin
  }
  return undefined
}

export function parsePhrasalGlossManifest(value: unknown): PhrasalGlossManifest {
  if (!isRecord(value) || value.schemaVersion !== '5.0.0' || !Array.isArray(value.glosses)) {
    throw new Error('Phrasal gloss manifest has an invalid root contract')
  }
  if (JSON.stringify(value.model) !== JSON.stringify(PHRASAL_TRANSLATION_MODEL)) {
    throw new Error('Phrasal gloss manifest does not use the pinned translation model')
  }
  if (JSON.stringify(value.alignmentModel) !== JSON.stringify(PHRASAL_ALIGNMENT_MODEL)) {
    throw new Error('Phrasal gloss manifest does not use the pinned alignment model')
  }
  if (value.reviewStatus !== 'machine-assisted-draft-not-human-reviewed'
    || !isRecord(value.generator)) {
    throw new Error('Phrasal gloss manifest is missing generation provenance')
  }
  if (value.generator.registryPolicy !== 'exhaustive-machine-assisted-audit-v1'
    || value.generator.auditedRows !== '1000'
    || value.generator.unresolvedRows !== '0'
    || value.generator.crossReferenceDescriptions !== '0') {
    throw new Error('Phrasal gloss manifest does not use the canonical registry policy')
  }
  const seen = new Set<string>()
  const seenExamples = new Set<string>()
  const glosses = value.glosses.map((item, index) => {
    const expectedFields = [
      'englishDescription', 'exampleOrigins', 'examples', 'meaningKo', 'phrase',
      'reviewStatus', 'selectionMethod', 'senseId', 'sourceDescription',
      'translationStatus',
    ]
    if (!isRecord(item)
      || Object.keys(item).sort().join(',') !== expectedFields.sort().join(',')
      || typeof item.phrase !== 'string'
      || !/^[a-z]+ [a-z]+$/.test(item.phrase)
      || typeof item.senseId !== 'string'
      || typeof item.meaningKo !== 'string'
      || !/[가-힣]/.test(item.meaningKo)
      || !isSafePhrasalContent(item.meaningKo)
      || typeof item.englishDescription !== 'string'
      || item.englishDescription.trim().length === 0
      || !isSafePhrasalContent(item.englishDescription)
      || item.englishDescription.startsWith('same as ')
      || typeof item.sourceDescription !== 'string'
      || item.sourceDescription.trim().length === 0
      || !isSafePhrasalContent(item.sourceDescription)
      || !Array.isArray(item.examples)
      || item.examples.length !== 2
      || !item.examples.every((example) => typeof example === 'string' && isSuitablePhrasalExample(example))
      || item.examples[0] === item.examples[1]
      || !item.examples.every((example) => typeof example === 'string'
        && containsPhrasalUse(example, item.phrase as string))
      || !Array.isArray(item.exampleOrigins)
      || item.exampleOrigins.length !== 2
      || item.exampleOrigins.some((origin) => parseExampleOrigin(origin) === undefined)
      || !['machine-assisted-audited-source-pair', 'machine-assisted-editorial-correction']
        .includes(String(item.selectionMethod))
      || ![
        'machine-translated',
        'machine-assisted-gloss-override',
        'machine-assisted-editorial-correction',
      ].includes(String(item.translationStatus))
      || item.reviewStatus !== 'machine-assisted-draft-not-human-reviewed') {
      throw new Error(`Invalid phrasal gloss at index ${index}`)
    }
    if (item.senseId !== senseIdFor(item.phrase, item.englishDescription)) {
      throw new Error(`Invalid phrasal sense ID: ${item.phrase}`)
    }
    const parsedOrigins = item.exampleOrigins.map(parseExampleOrigin) as PhrasalExampleOrigin[]
    const isEditorial = item.selectionMethod === 'machine-assisted-editorial-correction'
    const allExamplesGenerated = parsedOrigins.every(({ kind }) =>
      kind === 'definition-conditioned-machine-generated')
    const hasGeneratedExample = parsedOrigins.some(({ kind }) =>
      kind === 'definition-conditioned-machine-generated')
    if ((isEditorial && (!allExamplesGenerated
      || item.translationStatus !== 'machine-assisted-editorial-correction'))
      || (!isEditorial && (hasGeneratedExample
        || item.translationStatus === 'machine-assisted-editorial-correction'))) {
      throw new Error(`Invalid phrasal editorial provenance: ${item.phrase}`)
    }
    if (seen.has(item.phrase)) throw new Error(`Duplicate phrasal gloss: ${item.phrase}`)
    for (const example of item.examples as string[]) {
      if (seenExamples.has(example)) throw new Error(`Duplicate phrasal example: ${example}`)
      seenExamples.add(example)
    }
    seen.add(item.phrase)
    return item as unknown as PhrasalGloss
  })
  const missingRequired = REQUIRED_PHRASAL_PHRASES.filter((phrase) => !seen.has(phrase))
  if (missingRequired.length > 0) {
    throw new Error(`Phrasal gloss manifest is missing required phrases: ${missingRequired.join(', ')}`)
  }
  const editorialRows = glosses.filter(({ selectionMethod }) =>
    selectionMethod === 'machine-assisted-editorial-correction').length
  if (value.generator.editorialCorrectionRows !== String(editorialRows)
    || value.generator.sourcePairRows !== String(glosses.length - editorialRows)) {
    throw new Error('Phrasal gloss manifest has inconsistent registry counts')
  }
  return {
    schemaVersion: '5.0.0',
    model: PHRASAL_TRANSLATION_MODEL,
    alignmentModel: PHRASAL_ALIGNMENT_MODEL,
    generator: Object.fromEntries(Object.entries(value.generator).map(([key, entry]) => {
      if (typeof entry !== 'string') throw new Error(`Invalid generator field: ${key}`)
      return [key, entry]
    })),
    reviewStatus: 'machine-assisted-draft-not-human-reviewed',
    glosses,
  }
}

function toPhrasalItem(
  source: SelectedPhrasalSource,
  gloss: PhrasalGloss,
  indexWithinLevel: number,
  levelCount: number,
): PhrasalVerbItem {
  return {
    id: `phrasal-${source.phrase.replaceAll(' ', '-')}`,
    baseVerb: source.baseVerb,
    particle: source.particle,
    phrasalVerb: source.phrase,
    ipa: source.ipa,
    levelHint: source.level,
    meaningKo: [gloss.meaningKo],
    examples: gloss.examples,
    partOfSpeech: 'phrasalVerb',
    usageNotes: '전수 기계 보조 감사로 고정한 영어 의미·예문과 한국어 초안이며, 사람 편집 검수 전입니다.',
    difficulty: difficultyForPosition(indexWithinLevel, levelCount),
  }
}

export function assertCanonicalPhrasalOrder(
  manifestPhrases: readonly string[],
  selectedSources: readonly Pick<SelectedPhrasalSource, 'phrase'>[],
): void {
  const retainedPhrases = new Set(manifestPhrases)
  const expectedOrder = selectedSources
    .filter(({ phrase }) => retainedPhrases.has(phrase))
    .map(({ phrase }) => phrase)
  if (expectedOrder.length !== manifestPhrases.length
    || expectedOrder.some((phrase, index) => phrase !== manifestPhrases[index])) {
    throw new Error('Phrasal gloss manifest order does not match canonical source selection order')
  }
}

export function resolvePhrasalCatalogPaths(cacheRoot = DEFAULT_CONTENT_CACHE_ROOT): {
  cacheRoot: string
  glossManifest: string
} {
  return {
    cacheRoot: resolve(CONTENT_REPOSITORY_ROOT, cacheRoot),
    glossManifest: PHRASAL_GLOSS_MANIFEST_PATH,
  }
}

export async function buildPhrasalCatalog(cacheRoot = DEFAULT_CONTENT_CACHE_ROOT): Promise<{
  top: PhrasalVerbItem[]
  byLevel: Record<Level, PhrasalVerbItem[]>
  provenance: PhrasalCatalogProvenance
}> {
  const paths = resolvePhrasalCatalogPaths(cacheRoot)
  await requireVerifiedContentSourceCaches(PHRASAL_CONTENT_SOURCE_IDS, paths.cacheRoot)
  const [
    rawSource,
    ipaSource,
    frequencySource,
    cefrSource,
    recoveryExamples,
    rawGlosses,
  ] = await Promise.all([
    readFile(join(paths.cacheRoot, 'generated-english-phrasal-verbs.json'), 'utf8').then(JSON.parse),
    readFile(join(paths.cacheRoot, 'ipa-dict-en_US.txt'), 'utf8'),
    readFile(join(paths.cacheRoot, 'word-freq-top5000.csv'), 'utf8'),
    readFile(join(paths.cacheRoot, 'cefrj-vocabulary-profile-1.5.csv'), 'utf8'),
    readPinnedPhrasalRecovery(join(paths.cacheRoot, 'opus-tatoeba-v2023-04-12-en.txt.gz')),
    readFile(paths.glossManifest, 'utf8').then(JSON.parse),
  ])
  const candidates = selectPhrasalSources({
    rawSource,
    ipaSource,
    frequencySource,
    cefrSource,
    count: PHRASAL_PREPARED_CANDIDATE_COUNT,
    requiredPhrases: [...new Set([
      ...REQUIRED_PHRASAL_PHRASES,
      ...Object.keys(PINNED_PHRASAL_ALIGNMENTS),
    ])],
    recoveryExamples,
  })
  const manifest = parsePhrasalGlossManifest(rawGlosses)
  if (manifest.glosses.length !== 1_000) {
    throw new Error(`Expected 1000 phrasal glosses; found ${manifest.glosses.length}`)
  }
  const candidatesByPhrase = new Map(candidates.map((source) => [source.phrase, source]))
  assertCanonicalPhrasalOrder(manifest.glosses.map(({ phrase }) => phrase), candidates)
  if (!isRecord(rawSource)) throw new Error('Phrasal source must be an object keyed by phrase')
  const rawEntries = Object.entries(rawSource)
  const recoveryByLine = new Map<number, (typeof PINNED_PHRASAL_RECOVERY)[number]>(
    PINNED_PHRASAL_RECOVERY.map((record) => [record.line, record]),
  )
  const alignedSources = manifest.glosses.map((gloss): SelectedPhrasalSource & {
    meaningKo: string
  } => {
    const candidate = candidatesByPhrase.get(gloss.phrase)
    if (!candidate
      || !candidate.descriptions.includes(gloss.sourceDescription)) {
      throw new Error(`Missing or stale aligned source for ${gloss.phrase}`)
    }
    gloss.examples.forEach((example, exampleIndex) => {
      const origin = gloss.exampleOrigins[exampleIndex]!
      if (origin.kind === 'definition-conditioned-machine-generated') return
      if (origin.kind === 'tatoeba-pinned-source') {
        const recovery = recoveryByLine.get(origin.line)
        if (!recovery || recovery.phrase !== gloss.phrase || recovery.sentence !== example
          || !recoveryExamples.get(gloss.phrase)?.includes(example)) {
          throw new Error(`Stale Tatoeba example origin for ${gloss.phrase}`)
        }
        return
      }
      const rawEntry = rawEntries[origin.sourceIndex]
      const rawRecord = rawEntry?.[1]
      const rawExamples = isRecord(rawRecord) && Array.isArray(rawRecord.examples)
        ? rawRecord.examples
        : undefined
      if (origin.sourceIndex !== candidate.sourceIndex
        || rawEntry?.[0].trim().toLowerCase() !== gloss.phrase
        || typeof rawExamples?.[origin.exampleIndex] !== 'string'
        || rawExamples[origin.exampleIndex].trim() !== example) {
        throw new Error(`Stale phrasal source example origin for ${gloss.phrase}`)
      }
    })
    return {
      ...candidate,
      description: gloss.englishDescription,
      meaningKo: gloss.meaningKo,
      examples: gloss.examples,
    }
  })
  const sources = assignPhrasalLevelsForLearners(alignedSources)
  const glosses = new Map(manifest.glosses.map((gloss) => [gloss.phrase, gloss]))
  const byLevel = Object.fromEntries(LEVELS.map((level) => {
    const levelSources = sources.filter((source) => source.level === level)
    return [level, levelSources.map((source, index) => {
      const gloss = glosses.get(source.phrase)
      if (!gloss || gloss.englishDescription !== source.description) {
        throw new Error(`Missing or stale Korean gloss for ${source.phrase}`)
      }
      return toPhrasalItem(source, gloss, index, levelSources.length)
    })]
  })) as Record<Level, PhrasalVerbItem[]>
  const top = LEVELS.flatMap((level) => byLevel[level])
  const provenance: PhrasalCatalogProvenance = {
    schemaVersion: '2.0.0',
    generatedBy: 'scripts/content/buildPhrasalCatalog.ts',
    outputDigest: phrasalCatalogOutputDigest(top, byLevel),
    selectionPolicy: `canonical schema-v5 registry of 1000 exhaustively machine-assisted-audited two-word phrases; zero unresolved or cross-reference descriptions; every retained source example has an exact pinned source coordinate and every editorial replacement is definition-conditioned with explicit generated provenance; stable early-learner ordering by example readability plus a composed phrase-description-Korean-gloss semantic gate, CEFR, and canonical source order; 250 items per level with cumulative capacity checks`,
    sources: PHRASAL_CONTENT_SOURCES,
    translation: {
      model: PHRASAL_TRANSLATION_MODEL,
      status: manifest.reviewStatus,
      caveat: 'Korean glosses are pinned-model translations or machine-assisted editorial corrections and are not represented as human editorial review.',
    },
    alignment: {
      model: PHRASAL_ALIGNMENT_MODEL,
      status: manifest.reviewStatus,
      caveat: 'All 1000 rows were exhaustively machine-assisted audited. Source pairs retain exact coordinates; corrected pairs are definition-conditioned machine-generated drafts. Neither is represented as human editorial review.',
    },
    phrases: sources.map((source) => {
      const gloss = glosses.get(source.phrase)
      if (!gloss) throw new Error(`Missing aligned provenance for ${source.phrase}`)
      return {
        phrase: source.phrase,
        level: source.level,
        sourceIndex: source.sourceIndex,
        sourceFrequency: source.sourceFrequency,
        baseFrequencyRank: source.baseFrequencyRank,
        baseCefr: source.baseCefr,
        englishDescription: gloss.englishDescription,
        sourceDescription: gloss.sourceDescription,
        selectionMethod: gloss.selectionMethod,
        translationStatus: gloss.translationStatus,
        reviewStatus: gloss.reviewStatus,
        senseId: gloss.senseId,
        exampleOrigins: gloss.exampleOrigins,
      }
    }),
  }
  return { top, byLevel, provenance }
}
