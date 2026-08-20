import { createHash, randomUUID } from 'node:crypto'
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  acquireBuildLock,
  buildLockPathForDataRoot,
} from '../build-lock'
import { LEVELS } from '../../src/domain/content/types'
import type {
  ContentCatalog,
  GrammarNode,
  Level,
  PhrasalVerbItem,
  StoryContent,
  ValidationIssue,
  WordItem,
} from '../../src/domain/content/types'
import { validateCatalog, validateStoryCoverage } from '../../src/domain/content/validation'
import {
  PHRASAL_CONTENT_SOURCE_IDS,
  buildPhrasalCatalog,
  type PhrasalCatalogProvenance,
} from './buildPhrasalCatalog'
import { buildStoryDraft } from './buildStoryDrafts'
import {
  WORD_CONTENT_SOURCE_IDS,
  buildWordCatalog,
  type WordCatalogProvenance,
} from './buildWordCatalog'
import {
  PHRASAL_ALIGNMENT_MODEL,
  PHRASAL_TRANSLATION_MODEL,
} from './phrasalSource'
import {
  OUTPUT_DIGEST_ALGORITHM,
  OUTPUT_DIGEST_CANONICALIZATION,
  phrasalCatalogOutputDigest,
  storyCatalogOutputDigest,
  wordCatalogOutputDigest,
} from './catalogDigest'
import type { OutputDigest } from './catalogDigest'
import {
  CONTENT_REPOSITORY_ROOT,
  DEFAULT_CONTENT_CACHE_ROOT,
  DEFAULT_CONTENT_DATA_ROOT,
  DEFAULT_MANUAL_STORY_ROOT,
} from './paths'
import {
  APPROVED_MANUAL_STORY_SCHEMA_VERSION,
  assertApprovedManualStories,
  loadApprovedManualStories,
  validateApprovedManualStory,
  type ApprovedManualStories,
  type ManualStoryApproval,
} from './manualStories'
import type { ContentSource, ContentSourceId } from './source-types'
import { CONTENT_SOURCES } from './sources'
import { refineGrammarNodes } from './refineGrammarContent'

export const CONTENT_GENERATION_MARKER_NAME = '.content-generation-swap.json'
const CONTENT_GENERATION_MARKER_SCHEMA_VERSION = '1.0.0'

type WordBuildResult = Awaited<ReturnType<typeof buildWordCatalog>>
type PhrasalBuildResult = Awaited<ReturnType<typeof buildPhrasalCatalog>>

export interface ContentArtifact {
  target: string
  bytes: Buffer
}

export interface ContentGenerationInput {
  dataRoot: string
  wordlists: Record<Level, WordItem[]>
  wordProvenance: WordCatalogProvenance
  phrasalTop: PhrasalVerbItem[]
  phrasalByLevel: Record<Level, PhrasalVerbItem[]>
  phrasalProvenance: PhrasalCatalogProvenance
  grammarNodes: GrammarNode[]
  approvedManualStories?: ApprovedManualStories
}

export interface ContentGeneration {
  catalog: ContentCatalog
  artifacts: ContentArtifact[]
}

export type ContentCommitResult =
  | {
      status: 'committed-clean'
      cleanupAttempts: number
    }
  | {
      status: 'committed-with-cleanup-residue'
      cleanupAttempts: number
      residuePaths: string[]
      warning: string
    }

export interface ContentBuildResult extends ContentGeneration {
  commitResult: ContentCommitResult
}

export type StoryCatalogProvenanceStatus =
  | 'automated-drafts'
  | 'mixed-approved-manual-and-automated'
  | 'approved-manual-stories'

interface AutomatedStoryProvenanceRecord {
  level: Level
  source: 'automated-draft'
  lemmaCount: number
  coverageRate: number
}

interface ApprovedManualStoryProvenanceRecord {
  level: Level
  source: 'approved-manual-input'
  lemmaCount: number
  coverageRate: number
  approval: ManualStoryApproval
}

export interface StoryCatalogProvenance {
  schemaVersion: '3.0.0'
  generatedBy: 'scripts/content/buildContent.ts'
  outputDigest: OutputDigest
  status: StoryCatalogProvenanceStatus
  releaseGate: string
  stories: Array<AutomatedStoryProvenanceRecord | ApprovedManualStoryProvenanceRecord>
}

export interface ContentProvenanceValidationInput {
  wordlists: Record<Level, WordItem[]>
  wordProvenance: unknown
  phrasalTop: PhrasalVerbItem[]
  phrasalByLevel: Record<Level, PhrasalVerbItem[]>
  phrasalProvenance: unknown
  stories: Record<Level, StoryContent>
  storyProvenance: unknown
}

export interface ContentBuildOptions {
  cacheRoot?: string
  dataRoot?: string
  manualStoryRoot?: string
  buildWords?: (cacheRoot: string) => Promise<WordBuildResult>
  buildPhrasals?: (cacheRoot: string) => Promise<PhrasalBuildResult>
  readGrammar?: (path: string) => Promise<GrammarNode[]>
  loadManualStories?: (root: string) => Promise<ApprovedManualStories>
  commit?: (
    dataRoot: string,
    artifacts: readonly ContentArtifact[],
  ) => Promise<ContentCommitResult | void>
}

export interface ContentCommitOptions {
  afterRecovery?: (paths: Readonly<ContentGenerationSwapPaths>) => void | Promise<void>
  afterStage?: (paths: Readonly<ContentGenerationSwapPaths>) => void | Promise<void>
  beforePromote?: (paths: Readonly<ContentGenerationSwapPaths>) => void | Promise<void>
  beforeFinalize?: (paths: Readonly<ContentGenerationSwapPaths>) => void | Promise<void>
  beforeRollbackCleanup?: (paths: Readonly<ContentGenerationSwapPaths>) => void | Promise<void>
}

export interface ContentGenerationSwapPaths {
  dataRoot: string
  parentRoot: string
  stagingRoot: string
  rollbackRoot: string
  lockPath: string
}

export function resolveContentBuildPaths(options: Pick<
  ContentBuildOptions,
  'cacheRoot' | 'dataRoot' | 'manualStoryRoot'
> = {}): { cacheRoot: string; dataRoot: string; manualStoryRoot: string } {
  return {
    cacheRoot: resolve(CONTENT_REPOSITORY_ROOT, options.cacheRoot ?? DEFAULT_CONTENT_CACHE_ROOT),
    dataRoot: resolve(CONTENT_REPOSITORY_ROOT, options.dataRoot ?? DEFAULT_CONTENT_DATA_ROOT),
    manualStoryRoot: resolve(
      CONTENT_REPOSITORY_ROOT,
      options.manualStoryRoot ?? DEFAULT_MANUAL_STORY_ROOT,
    ),
  }
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function artifact(target: string, value: unknown): ContentArtifact {
  return { target, bytes: jsonBytes(value) }
}

const CONTENT_SOURCE_FIELDS = [
  'id',
  'url',
  'sha256',
  'license',
  'attribution',
  'cacheFile',
] as const satisfies readonly (keyof ContentSource)[]

const WORD_PROVENANCE_RESOLUTIONS = new Set([
  'editorial-basic',
  'exact-source-sense',
  'alternate-wiktionary-sense',
  'editorial-source-pos-override',
  'additional-wiktionary-sense',
  'omw-bilingual-synset',
  'editorial-core-anchor',
])

const SOURCE_CEFR_LEVELS = new Set(['A1', 'A2', 'B1', 'B2'])
const MACHINE_DRAFT_STATUS = 'machine-assisted-draft-not-human-reviewed'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value)
}

function validateExactFields(
  value: Record<string, unknown>,
  expectedFields: readonly string[],
  path: string,
  issues: string[],
): void {
  const expected = [...expectedFields].sort()
  const actual = Object.keys(value).sort()
  if (actual.length !== expected.length
    || actual.some((field, index) => field !== expected[index])) {
    issues.push(`${path} must contain exactly these fields: ${expectedFields.join(', ')}`)
  }
}

function validateOutputDigest(
  value: unknown,
  expected: OutputDigest,
  path: string,
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return
  }
  validateExactFields(value, ['algorithm', 'canonicalization', 'value'], path, issues)
  if (value.algorithm !== OUTPUT_DIGEST_ALGORITHM) {
    issues.push(`${path}.algorithm must be ${OUTPUT_DIGEST_ALGORITHM}`)
  }
  if (value.canonicalization !== OUTPUT_DIGEST_CANONICALIZATION) {
    issues.push(`${path}.canonicalization must be ${OUTPUT_DIGEST_CANONICALIZATION}`)
  }
  if (typeof value.value !== 'string' || !/^[a-f0-9]{64}$/.test(value.value)) {
    issues.push(`${path}.value must be a lowercase SHA-256 digest`)
  } else if (value.value !== expected.value) {
    issues.push(`${path}.value must match the current catalog output`)
  }
}

function expectedSources(sourceIds: readonly ContentSourceId[]): readonly ContentSource[] {
  return sourceIds.map((sourceId) => {
    const source = CONTENT_SOURCES.find(({ id }) => id === sourceId)
    if (!source) throw new Error(`Unknown configured content source: ${sourceId}`)
    return source
  })
}

function validateSources(
  value: unknown,
  sourceIds: readonly ContentSourceId[],
  path: string,
  issues: string[],
): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`)
    return
  }

  const expected = expectedSources(sourceIds)
  if (value.length !== expected.length) {
    issues.push(`${path} must contain exactly ${expected.length} source records`)
  }
  expected.forEach((expectedSource, index) => {
    const actualSource = value[index]
    if (!isRecord(actualSource)) {
      issues.push(`${path}[${index}] must be an object`)
      return
    }
    validateExactFields(actualSource, CONTENT_SOURCE_FIELDS, `${path}[${index}]`, issues)
    for (const field of CONTENT_SOURCE_FIELDS) {
      if (actualSource[field] !== expectedSource[field]) {
        issues.push(`${path}[${index}].${field} does not match pinned source ${expectedSource.id}`)
      }
    }
  })
}

function validateModel(
  value: unknown,
  expected: Readonly<{ id: string; revision: string; license: string }>,
  path: string,
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return
  }
  validateExactFields(value, ['id', 'revision', 'license'], path, issues)
  for (const field of ['id', 'revision', 'license'] as const) {
    if (value[field] !== expected[field]) {
      issues.push(`${path}.${field} does not match the pinned model`)
    }
  }
}

function validateWordProvenance(
  value: unknown,
  wordlists: Record<Level, WordItem[]>,
): string[] {
  const issues: string[] = []
  if (!isRecord(value)) return ['wordProvenance must be an object']

  validateExactFields(
    value,
    ['schemaVersion', 'generatedBy', 'outputDigest', 'selectionPolicy', 'sources', 'words'],
    'wordProvenance',
    issues,
  )
  if (value.schemaVersion !== '4.0.0') {
    issues.push('wordProvenance.schemaVersion must be 4.0.0')
  }
  if (value.generatedBy !== 'scripts/content/buildWordCatalog.ts') {
    issues.push('wordProvenance.generatedBy must identify buildWordCatalog.ts')
  }
  validateOutputDigest(
    value.outputDigest,
    wordCatalogOutputDigest(wordlists),
    'wordProvenance.outputDigest',
    issues,
  )
  if (value.schemaVersion !== '4.0.0' || value.outputDigest === undefined) return issues

  if (!isRecord(value.selectionPolicy)) {
    issues.push('wordProvenance.selectionPolicy must be an object')
  } else {
    validateExactFields(
      value.selectionPolicy,
      ['basic', 'nonBasic', 'quotas'],
      'wordProvenance.selectionPolicy',
      issues,
    )
    if (!isNonBlankString(value.selectionPolicy.basic)) {
      issues.push('wordProvenance.selectionPolicy.basic must be non-blank')
    }
    if (!isNonBlankString(value.selectionPolicy.nonBasic)) {
      issues.push('wordProvenance.selectionPolicy.nonBasic must be non-blank')
    }
    if (!isRecord(value.selectionPolicy.quotas)) {
      issues.push('wordProvenance.selectionPolicy.quotas must be an object')
    } else {
      validateExactFields(
        value.selectionPolicy.quotas,
        LEVELS,
        'wordProvenance.selectionPolicy.quotas',
        issues,
      )
      for (const level of LEVELS) {
        if (value.selectionPolicy.quotas[level] !== wordlists[level].length) {
          issues.push(`wordProvenance.selectionPolicy.quotas.${level} must match the catalog`)
        }
      }
    }
  }

  validateSources(
    value.sources,
    WORD_CONTENT_SOURCE_IDS,
    'wordProvenance.sources',
    issues,
  )

  const expectedWords = LEVELS.flatMap((level) =>
    wordlists[level].map((word) => ({ level, word })))
  if (!Array.isArray(value.words)) {
    issues.push('wordProvenance.words must be an array')
    return issues
  }
  const provenanceWords = value.words
  if (provenanceWords.length !== expectedWords.length) {
    issues.push('wordProvenance.words must have one record for every catalog word')
  }

  expectedWords.forEach(({ level, word }, wordIndex) => {
    const record = provenanceWords[wordIndex]
    const path = `wordProvenance.words[${wordIndex}]`
    if (!isRecord(record)) {
      issues.push(`${path} must be an object`)
      return
    }
    validateExactFields(
      record,
      ['lemma', 'level', 'cefr', 'cefrLine', 'frequencyRank', 'frequencyLine', 'entries'],
      path,
      issues,
    )
    if (record.lemma !== word.lemma) issues.push(`${path}.lemma must match ${word.lemma}`)
    if (record.level !== level) issues.push(`${path}.level must match ${level}`)
    if (record.cefr !== null && !SOURCE_CEFR_LEVELS.has(String(record.cefr))) {
      issues.push(`${path}.cefr must be null or a pinned CEFR coordinate`)
    }
    if (!isNullablePositiveInteger(record.cefrLine)) {
      issues.push(`${path}.cefrLine must be null or a positive source line`)
    }
    if ((record.cefr === null) !== (record.cefrLine === null)) {
      issues.push(`${path}.cefr and cefrLine must either both be present or both be null`)
    }
    if (!isNullablePositiveInteger(record.frequencyRank)) {
      issues.push(`${path}.frequencyRank must be null or a positive rank`)
    }
    if (!isNullablePositiveInteger(record.frequencyLine)) {
      issues.push(`${path}.frequencyLine must be null or a positive source line`)
    }
    if ((record.frequencyRank === null) !== (record.frequencyLine === null)) {
      issues.push(`${path}.frequencyRank and frequencyLine must either both be present or both be null`)
    }

    if (!Array.isArray(record.entries)) {
      issues.push(`${path}.entries must be an array`)
      return
    }
    const provenanceEntries = record.entries
    if (provenanceEntries.length !== word.entries.length) {
      issues.push(`${path}.entries must have one record for every catalog entry`)
    }
    word.entries.forEach((wordEntry, entryIndex) => {
      const entry = provenanceEntries[entryIndex]
      const entryPath = `${path}.entries[${entryIndex}]`
      if (!isRecord(entry)) {
        issues.push(`${entryPath} must be an object`)
        return
      }
      validateExactFields(
        entry,
        [
          'koreanWiktionaryPage',
          'omwSynsetIds',
          'sourcePartOfSpeech',
          'catalogPartOfSpeech',
          'partOfSpeechResolution',
          'ipaSource',
          'exampleSourceLines',
        ],
        entryPath,
        issues,
      )
      if (entry.catalogPartOfSpeech !== wordEntry.partOfSpeech) {
        issues.push(`${entryPath}.catalogPartOfSpeech must match the catalog entry`)
      }
      if (!WORD_PROVENANCE_RESOLUTIONS.has(String(entry.partOfSpeechResolution))) {
        issues.push(`${entryPath}.partOfSpeechResolution is not recognized`)
        return
      }
      if (entry.ipaSource !== 'ipa-dict' && entry.ipaSource !== 'editorial-basic') {
        issues.push(`${entryPath}.ipaSource is not recognized`)
      }
      if (entry.koreanWiktionaryPage !== null && !isNonBlankString(entry.koreanWiktionaryPage)) {
        issues.push(`${entryPath}.koreanWiktionaryPage must be null or non-blank`)
      }
      const omwSynsetIdsAreValid = entry.omwSynsetIds === null
        || (Array.isArray(entry.omwSynsetIds)
          && entry.omwSynsetIds.length > 0
          && new Set(entry.omwSynsetIds).size === entry.omwSynsetIds.length
          && entry.omwSynsetIds.every((coordinate) =>
            typeof coordinate === 'string' && /^\d{8}-[anrv]$/.test(coordinate)))
      if (!omwSynsetIdsAreValid) {
        issues.push(`${entryPath}.omwSynsetIds must be null or unique PWN3 offset/POS coordinates`)
      }
      if (entry.sourcePartOfSpeech !== null && !isNonBlankString(entry.sourcePartOfSpeech)) {
        issues.push(`${entryPath}.sourcePartOfSpeech must be null or non-blank`)
      }
      const sourceLinesAreValid = entry.exampleSourceLines === null
        || (Array.isArray(entry.exampleSourceLines)
          && entry.exampleSourceLines.length === 2
          && entry.exampleSourceLines.every(isPositiveInteger))
      if (!sourceLinesAreValid) {
        issues.push(`${entryPath}.exampleSourceLines must be null or two positive source lines`)
      }

      if (entry.partOfSpeechResolution === 'editorial-basic') {
        if (
          level !== '기초'
          || record.cefr !== null
          || record.cefrLine !== null
          || record.frequencyRank !== null
          || record.frequencyLine !== null
          || entry.koreanWiktionaryPage !== null
          || entry.omwSynsetIds !== null
          || entry.sourcePartOfSpeech !== null
          || entry.exampleSourceLines !== null
        ) {
          issues.push(`${entryPath} editorial-basic coordinates must all be editorial/null`)
        }
      } else if (entry.partOfSpeechResolution === 'editorial-core-anchor') {
        if (
          entry.koreanWiktionaryPage !== null
          || entry.omwSynsetIds !== null
          || entry.sourcePartOfSpeech !== wordEntry.partOfSpeech
          || entry.exampleSourceLines !== null
          || entry.ipaSource !== 'ipa-dict'
          || (
            record.cefrLine === null
            && record.frequencyLine === null
          )
        ) {
          issues.push(`${entryPath} editorial-core-anchor coordinates are invalid`)
        }
      } else if (entry.partOfSpeechResolution === 'omw-bilingual-synset') {
        if (
          entry.koreanWiktionaryPage !== null
          || !Array.isArray(entry.omwSynsetIds)
          || entry.omwSynsetIds.length === 0
          || !isNonBlankString(entry.sourcePartOfSpeech)
          || !Array.isArray(entry.exampleSourceLines)
          || entry.exampleSourceLines.length !== 2
          || !entry.exampleSourceLines.every(isPositiveInteger)
          || entry.ipaSource !== 'ipa-dict'
        ) {
          issues.push(`${entryPath} OMW coordinates must identify synsets, POS, and two example lines`)
        }
      } else if (
        entry.koreanWiktionaryPage !== word.lemma
        || entry.omwSynsetIds !== null
        || !isNonBlankString(entry.sourcePartOfSpeech)
        || (
          (
            entry.partOfSpeechResolution === 'exact-source-sense'
            || entry.partOfSpeechResolution === 'editorial-source-pos-override'
          )
          && entry.sourcePartOfSpeech !== wordEntry.partOfSpeech
        )
        || (
          entry.partOfSpeechResolution !== 'exact-source-sense'
          && entry.partOfSpeechResolution !== 'editorial-source-pos-override'
          && entry.sourcePartOfSpeech === wordEntry.partOfSpeech
        )
        || !Array.isArray(entry.exampleSourceLines)
        || entry.exampleSourceLines.length !== 2
        || !entry.exampleSourceLines.every(isPositiveInteger)
        || entry.ipaSource !== 'ipa-dict'
        || (
          record.cefrLine === null
          && record.frequencyLine === null
        )
      ) {
        issues.push(`${entryPath} sourced coordinates must identify the lemma and two example lines`)
      }
    })
  })

  return issues
}

function validatePhrasalPipeline(
  value: unknown,
  expectedModel: Readonly<{ id: string; revision: string; license: string }>,
  path: string,
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return
  }
  validateExactFields(value, ['model', 'status', 'caveat'], path, issues)
  validateModel(value.model, expectedModel, `${path}.model`, issues)
  if (value.status !== MACHINE_DRAFT_STATUS) {
    issues.push(`${path}.status must preserve the machine-draft status`)
  }
  if (!isNonBlankString(value.caveat)) issues.push(`${path}.caveat must be non-blank`)
}

function phrasalSenseId(phrase: string, englishDescription: string): string {
  return createHash('sha256').update(`${phrase}\n${englishDescription}`, 'utf8').digest('hex')
}

function phrasalExampleOriginKind(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return undefined
  const fields = Object.keys(value).sort().join(',')
  if (value.kind === 'phrasal-verbs-source'
    && fields === 'exampleIndex,kind,sourceId,sourceIndex'
    && value.sourceId === 'phrasal-verbs'
    && isNonNegativeInteger(value.sourceIndex)
    && isNonNegativeInteger(value.exampleIndex)) return value.kind
  if (value.kind === 'tatoeba-pinned-source'
    && fields === 'kind,line,sourceId'
    && value.sourceId === 'tatoeba-english'
    && isPositiveInteger(value.line)) return value.kind
  if (value.kind === 'definition-conditioned-machine-generated'
    && fields === 'kind,promptVersion'
    && value.promptVersion === 'phrasal-editorial-v1') return value.kind
  return undefined
}

function validatePhrasalProvenance(
  value: unknown,
  phrasalTop: PhrasalVerbItem[],
  phrasalByLevel: Record<Level, PhrasalVerbItem[]>,
): string[] {
  const issues: string[] = []
  if (!isRecord(value)) return ['phrasalProvenance must be an object']

  validateExactFields(
    value,
    [
      'schemaVersion',
      'generatedBy',
      'outputDigest',
      'selectionPolicy',
      'sources',
      'translation',
      'alignment',
      'phrases',
    ],
    'phrasalProvenance',
    issues,
  )
  if (value.schemaVersion !== '2.0.0') {
    issues.push('phrasalProvenance.schemaVersion must be 2.0.0')
  }
  if (value.generatedBy !== 'scripts/content/buildPhrasalCatalog.ts') {
    issues.push('phrasalProvenance.generatedBy must identify buildPhrasalCatalog.ts')
  }
  validateOutputDigest(
    value.outputDigest,
    phrasalCatalogOutputDigest(phrasalTop, phrasalByLevel),
    'phrasalProvenance.outputDigest',
    issues,
  )
  if (value.schemaVersion !== '2.0.0' || value.outputDigest === undefined) return issues
  if (!isNonBlankString(value.selectionPolicy)) {
    issues.push('phrasalProvenance.selectionPolicy must be non-blank')
  }
  validateSources(
    value.sources,
    PHRASAL_CONTENT_SOURCE_IDS,
    'phrasalProvenance.sources',
    issues,
  )
  validatePhrasalPipeline(
    value.translation,
    PHRASAL_TRANSLATION_MODEL,
    'phrasalProvenance.translation',
    issues,
  )
  validatePhrasalPipeline(
    value.alignment,
    PHRASAL_ALIGNMENT_MODEL,
    'phrasalProvenance.alignment',
    issues,
  )

  if (!Array.isArray(value.phrases)) {
    issues.push('phrasalProvenance.phrases must be an array')
    return issues
  }
  const provenancePhrases = value.phrases
  if (provenancePhrases.length !== phrasalTop.length) {
    issues.push('phrasalProvenance.phrases must have one record for every catalog phrase')
  }
  phrasalTop.forEach((item, phraseIndex) => {
    const record = provenancePhrases[phraseIndex]
    const path = `phrasalProvenance.phrases[${phraseIndex}]`
    if (!isRecord(record)) {
      issues.push(`${path} must be an object`)
      return
    }
    validateExactFields(
      record,
      [
        'phrase',
        'level',
        'sourceIndex',
        'sourceFrequency',
        'baseFrequencyRank',
        'baseCefr',
        'englishDescription',
        'sourceDescription',
        'selectionMethod',
        'translationStatus',
        'reviewStatus',
        'senseId',
        'exampleOrigins',
      ],
      path,
      issues,
    )
    if (record.phrase !== item.phrasalVerb) {
      issues.push(`${path}.phrase must match ${item.phrasalVerb}`)
    }
    if (record.level !== item.levelHint) {
      issues.push(`${path}.level must match ${item.levelHint}`)
    }
    if (!isNonNegativeInteger(record.sourceIndex)) {
      issues.push(`${path}.sourceIndex must be a non-negative source index`)
    }
    if (!isNonNegativeInteger(record.sourceFrequency)) {
      issues.push(`${path}.sourceFrequency must be a non-negative source coordinate`)
    }
    if (!isNullablePositiveInteger(record.baseFrequencyRank)) {
      issues.push(`${path}.baseFrequencyRank must be null or a positive rank`)
    }
    if (record.baseCefr !== null && !SOURCE_CEFR_LEVELS.has(String(record.baseCefr))) {
      issues.push(`${path}.baseCefr must be null or a pinned CEFR coordinate`)
    }
    if (!isNonBlankString(record.englishDescription)) {
      issues.push(`${path}.englishDescription must be non-blank`)
    } else if (record.englishDescription.startsWith('same as ')) {
      issues.push(`${path}.englishDescription must be an explicit definition`)
    }
    if (!isNonBlankString(record.sourceDescription)) {
      issues.push(`${path}.sourceDescription must be non-blank`)
    }
    if (!isNonBlankString(record.senseId)
      || !isNonBlankString(record.englishDescription)
      || !isNonBlankString(record.phrase)
      || record.senseId !== phrasalSenseId(record.phrase, record.englishDescription)) {
      issues.push(`${path}.senseId must bind the phrase to its explicit definition`)
    }
    if (record.reviewStatus !== MACHINE_DRAFT_STATUS) {
      issues.push(`${path}.reviewStatus must preserve the machine-draft status`)
    }
    if (!['machine-assisted-audited-source-pair', 'machine-assisted-editorial-correction']
      .includes(String(record.selectionMethod))) {
      issues.push(`${path}.selectionMethod must identify the exhaustive audit result`)
    }
    if (!['machine-translated', 'machine-assisted-gloss-override',
      'machine-assisted-editorial-correction']
      .includes(String(record.translationStatus))) {
      issues.push(`${path}.translationStatus must identify the machine draft method`)
    }
    const originKinds = Array.isArray(record.exampleOrigins)
      ? record.exampleOrigins.map(phrasalExampleOriginKind)
      : []
    if (originKinds.length !== 2 || originKinds.some((kind) => kind === undefined)) {
      issues.push(`${path}.exampleOrigins must contain two exact source or generation records`)
    } else {
      const isEditorial = record.selectionMethod === 'machine-assisted-editorial-correction'
      const allGenerated = originKinds.every((kind) =>
        kind === 'definition-conditioned-machine-generated')
      const hasGenerated = originKinds.some((kind) =>
        kind === 'definition-conditioned-machine-generated')
      if ((isEditorial && (!allGenerated
        || record.translationStatus !== 'machine-assisted-editorial-correction'))
        || (!isEditorial && (hasGenerated
          || record.translationStatus === 'machine-assisted-editorial-correction'))) {
        issues.push(`${path} editorial provenance must agree across method, translation, and examples`)
      }
    }
  })

  return issues
}

const LEGACY_STORY_DRAFT_STATUS = 'automated-draft-awaiting-human-editorial-review'
const LEGACY_STORY_RELEASE_GATE = 'Every story keeps isManual=false until a human has read and approved the final text.'
const STORY_RELEASE_GATE = 'Only a validated approved manual input may set isManual=true; automated drafts remain unreleasable.'

function storyCatalogStatus(
  stories: Record<Level, StoryContent>,
): StoryCatalogProvenanceStatus {
  const manualCount = LEVELS.filter((level) => stories[level].isManual).length
  if (manualCount === 0) return 'automated-drafts'
  if (manualCount === LEVELS.length) return 'approved-manual-stories'
  return 'mixed-approved-manual-and-automated'
}

function validateStoryProvenanceMetrics(
  record: Record<string, unknown>,
  story: StoryContent,
  level: Level,
  path: string,
  issues: string[],
): void {
  if (record.level !== level) issues.push(`${path}.level must match ${level}`)
  if (record.lemmaCount !== story.usedWords.length) {
    issues.push(`${path}.lemmaCount must match the current story`)
  }
  if (record.coverageRate !== story.coverage.coverageRate) {
    issues.push(`${path}.coverageRate must match the current story`)
  }
}

function validateLegacyStoryProvenance(
  value: Record<string, unknown>,
  stories: Record<Level, StoryContent>,
): string[] {
  const issues: string[] = []
  validateExactFields(
    value,
    ['schemaVersion', 'generatedBy', 'outputDigest', 'status', 'releaseGate', 'stories'],
    'storyProvenance',
    issues,
  )
  if (value.generatedBy !== 'scripts/content/buildStoryDrafts.ts') {
    issues.push('storyProvenance.generatedBy must identify buildStoryDrafts.ts')
  }
  validateOutputDigest(
    value.outputDigest,
    storyCatalogOutputDigest(stories),
    'storyProvenance.outputDigest',
    issues,
  )
  if (value.status !== LEGACY_STORY_DRAFT_STATUS) {
    issues.push(`storyProvenance.status must be ${LEGACY_STORY_DRAFT_STATUS}`)
  }
  if (value.releaseGate !== LEGACY_STORY_RELEASE_GATE) {
    issues.push('storyProvenance.releaseGate must preserve the manual-review release gate')
  }
  if (!Array.isArray(value.stories)) {
    issues.push('storyProvenance.stories must be an array')
    return issues
  }
  const provenanceStories = value.stories
  if (provenanceStories.length !== LEVELS.length) {
    issues.push(`storyProvenance.stories must contain exactly ${LEVELS.length} level records`)
  }
  LEVELS.forEach((level, index) => {
    const record = provenanceStories[index]
    const path = `storyProvenance.stories[${index}]`
    if (!isRecord(record)) {
      issues.push(`${path} must be an object`)
      return
    }
    validateExactFields(record, ['level', 'lemmaCount', 'coverageRate'], path, issues)
    validateStoryProvenanceMetrics(record, stories[level], level, path, issues)
    if (stories[level].isManual) {
      issues.push(
        `${path}.source legacy schema 2.0.0 cannot attest an approved manual story`,
      )
    }
  })
  return issues
}

function validateCurrentStoryProvenance(
  value: Record<string, unknown>,
  stories: Record<Level, StoryContent>,
): string[] {
  const issues: string[] = []
  validateExactFields(
    value,
    ['schemaVersion', 'generatedBy', 'outputDigest', 'status', 'releaseGate', 'stories'],
    'storyProvenance',
    issues,
  )
  if (value.generatedBy !== 'scripts/content/buildContent.ts') {
    issues.push('storyProvenance.generatedBy must identify buildContent.ts')
  }
  validateOutputDigest(
    value.outputDigest,
    storyCatalogOutputDigest(stories),
    'storyProvenance.outputDigest',
    issues,
  )
  const expectedStatus = storyCatalogStatus(stories)
  if (value.status !== expectedStatus) {
    issues.push(`storyProvenance.status must be ${expectedStatus}`)
  }
  if (value.releaseGate !== STORY_RELEASE_GATE) {
    issues.push('storyProvenance.releaseGate must preserve the approved-input release gate')
  }
  if (!Array.isArray(value.stories)) {
    issues.push('storyProvenance.stories must be an array')
    return issues
  }
  const provenanceStories = value.stories
  if (provenanceStories.length !== LEVELS.length) {
    issues.push(`storyProvenance.stories must contain exactly ${LEVELS.length} level records`)
  }

  LEVELS.forEach((level, index) => {
    const record = provenanceStories[index]
    const path = `storyProvenance.stories[${index}]`
    if (!isRecord(record)) {
      issues.push(`${path} must be an object`)
      return
    }

    if (record.source === 'automated-draft') {
      validateExactFields(
        record,
        ['level', 'source', 'lemmaCount', 'coverageRate'],
        path,
        issues,
      )
      if (stories[level].isManual) {
        issues.push(`${path}.source must identify the current story as approved manual input`)
      }
    } else if (record.source === 'approved-manual-input') {
      validateExactFields(
        record,
        ['level', 'source', 'lemmaCount', 'coverageRate', 'approval'],
        path,
        issues,
      )
      if (!stories[level].isManual) {
        issues.push(`${path}.source cannot promote an automated story draft`)
      }
      issues.push(...validateApprovedManualStory({
        schemaVersion: APPROVED_MANUAL_STORY_SCHEMA_VERSION,
        story: stories[level],
        approval: record.approval,
      }, level, path))
    } else {
      validateExactFields(
        record,
        ['level', 'source', 'lemmaCount', 'coverageRate'],
        path,
        issues,
      )
      issues.push(`${path}.source must be automated-draft or approved-manual-input`)
    }
    validateStoryProvenanceMetrics(record, stories[level], level, path, issues)
  })
  return issues
}

function validateStoryProvenance(
  value: unknown,
  stories: Record<Level, StoryContent>,
): string[] {
  if (!isRecord(value)) return ['storyProvenance must be an object']
  if (value.schemaVersion === '2.0.0') {
    return validateLegacyStoryProvenance(value, stories)
  }
  if (value.schemaVersion === '3.0.0') {
    return validateCurrentStoryProvenance(value, stories)
  }
  return ['storyProvenance.schemaVersion must be 2.0.0 or 3.0.0']
}

function structuredProvenanceIssue(detail: string): ValidationIssue {
  const separator = detail.indexOf(' ')
  const path = separator === -1 ? 'provenance' : detail.slice(0, separator)
  const message = separator === -1 ? detail : detail.slice(separator + 1)
  return {
    code: path.includes('outputDigest')
      ? 'PROVENANCE_DIGEST_MISMATCH'
      : 'INVALID_PROVENANCE',
    path,
    message,
  }
}

export function validateContentProvenance(
  input: ContentProvenanceValidationInput,
): ValidationIssue[] {
  return [
    ...validateWordProvenance(input.wordProvenance, input.wordlists),
    ...validatePhrasalProvenance(
      input.phrasalProvenance,
      input.phrasalTop,
      input.phrasalByLevel,
    ),
    ...validateStoryProvenance(input.storyProvenance, input.stories),
  ].map(structuredProvenanceIssue)
}

function assertValidProvenance(input: ContentProvenanceValidationInput): void {
  const issues = validateContentProvenance(input)
  if (issues.length === 0) return
  throw new Error([
    `Generated content provenance failed validation with ${issues.length} issue(s):`,
    ...issues.map(({ code, path, message }) => `${code} ${path}: ${message}`),
  ].join('\n'))
}

export function storyCatalogProvenance(
  stories: Record<Level, StoryContent>,
  approvedManualStories: ApprovedManualStories,
): StoryCatalogProvenance {
  assertApprovedManualStories(approvedManualStories)
  return {
    schemaVersion: '3.0.0',
    generatedBy: 'scripts/content/buildContent.ts',
    outputDigest: storyCatalogOutputDigest(stories),
    status: storyCatalogStatus(stories),
    releaseGate: STORY_RELEASE_GATE,
    stories: LEVELS.map((level) => {
      const approvalInput = approvedManualStories[level]
      const metrics = {
        level,
        lemmaCount: stories[level].usedWords.length,
        coverageRate: stories[level].coverage.coverageRate,
      }
      if (!approvalInput) return { ...metrics, source: 'automated-draft' as const }
      return {
        ...metrics,
        source: 'approved-manual-input' as const,
        approval: approvalInput.approval,
      }
    }),
  }
}

function formatValidationFailure(catalog: ContentCatalog): string | null {
  const issues = [
    ...validateCatalog(catalog, 'development'),
    ...validateStoryCoverage(catalog),
  ]
  if (issues.length === 0) return null

  return [
    `Generated content failed development validation with ${issues.length} issue(s):`,
    ...issues.map(({ code, path, message }) => `${code} ${path}: ${message}`),
  ].join('\n')
}

export function createContentGeneration(input: ContentGenerationInput): ContentGeneration {
  const approvedManualStories = input.approvedManualStories ?? {}
  assertApprovedManualStories(approvedManualStories)
  const stories = Object.fromEntries(LEVELS.map((level, levelIndex) => [
    level,
    approvedManualStories[level]?.story ?? buildStoryDraft(
      level,
      input.wordlists[level],
      LEVELS.slice(0, levelIndex + 1).flatMap((allowedLevel) => input.wordlists[allowedLevel]),
    ),
  ])) as Record<Level, StoryContent>

  const catalog: ContentCatalog = {
    wordlists: input.wordlists,
    phrasalVerbs: {
      top: input.phrasalTop,
      byLevel: input.phrasalByLevel,
    },
    stories,
    grammarNodes: input.grammarNodes,
  }
  const validationFailure = formatValidationFailure(catalog)
  if (validationFailure !== null) throw new Error(validationFailure)
  const storyProvenance = storyCatalogProvenance(stories, approvedManualStories)
  assertValidProvenance({
    wordlists: input.wordlists,
    wordProvenance: input.wordProvenance,
    phrasalTop: input.phrasalTop,
    phrasalByLevel: input.phrasalByLevel,
    phrasalProvenance: input.phrasalProvenance,
    stories,
    storyProvenance,
  })

  const dataRoot = resolve(input.dataRoot)
  const artifacts = [
    ...LEVELS.map((level) => artifact(
      join(dataRoot, 'wordlists', `${level}.json`),
      input.wordlists[level],
    )),
    artifact(join(dataRoot, 'phrasal-verbs', 'top-1000.json'), input.phrasalTop),
    ...LEVELS.map((level) => artifact(
      join(dataRoot, 'phrasal-verbs', 'by-level', `${level}.json`),
      input.phrasalByLevel[level],
    )),
    ...LEVELS.map((level) => artifact(
      join(dataRoot, 'stories', `${level}.json`),
      stories[level],
    )),
    artifact(join(dataRoot, 'grammar', 'nodes.json'), input.grammarNodes),
    artifact(join(dataRoot, 'provenance', 'word-catalog.json'), input.wordProvenance),
    artifact(join(dataRoot, 'provenance', 'phrasal-catalog.json'), input.phrasalProvenance),
    artifact(join(dataRoot, 'provenance', 'story-drafts.json'), storyProvenance),
  ]

  return { catalog, artifacts }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

type GenerationMarkerRole = 'staging' | 'rollback'

interface GenerationMarker {
  schemaVersion: typeof CONTENT_GENERATION_MARKER_SCHEMA_VERSION
  kind: 'english-words-content-generation-swap'
  dataRoot: string
  role: GenerationMarkerRole
  token: string
}

interface PreparedContentArtifact extends ContentArtifact {
  relativeTarget: string
  stagedTarget: string
}

function pathKey(path: string): string {
  const resolvedPath = resolve(path)
  return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath
}

function samePath(left: string, right: string): boolean {
  return pathKey(left) === pathKey(right)
}

export function contentGenerationSwapPaths(dataRoot: string): ContentGenerationSwapPaths {
  const resolvedDataRoot = resolve(dataRoot)
  const parentRoot = dirname(resolvedDataRoot)
  if (samePath(resolvedDataRoot, parentRoot)) {
    throw new Error(`Content data root cannot be a filesystem root: ${resolvedDataRoot}`)
  }

  const dataRootName = basename(resolvedDataRoot)
  const stagingRoot = resolve(parentRoot, `.${dataRootName}.content-staging`)
  const rollbackRoot = resolve(parentRoot, `.${dataRootName}.content-rollback`)
  const lockPath = buildLockPathForDataRoot(resolvedDataRoot)
  const allPaths = [resolvedDataRoot, stagingRoot, rollbackRoot, lockPath]
  if (new Set(allPaths.map(pathKey)).size !== allPaths.length) {
    throw new Error(`Content generation paths collide for data root: ${resolvedDataRoot}`)
  }
  if (![stagingRoot, rollbackRoot, lockPath].every((path) => samePath(dirname(path), parentRoot))) {
    throw new Error(`Content generation paths must be fixed siblings of: ${resolvedDataRoot}`)
  }

  return {
    dataRoot: resolvedDataRoot,
    parentRoot,
    stagingRoot,
    rollbackRoot,
    lockPath,
  }
}

function markerPath(directory: string): string {
  return join(directory, CONTENT_GENERATION_MARKER_NAME)
}

function legacyContentBuildLockPath(dataRoot: string): string {
  return join(dataRoot, '.content-build.lock')
}

async function assertLegacyContentBuildLockAbsent(dataRoot: string): Promise<void> {
  const legacyLockPath = legacyContentBuildLockPath(dataRoot)
  try {
    await lstat(legacyLockPath)
  } catch (error) {
    if (isMissingFile(error)) return
    throw error
  }
  throw new Error(
    `Legacy content build lock exists at ${legacyLockPath} and was preserved. `
      + 'The shared sibling lock is held, but a legacy writer may still be active; '
      + 'verify that no legacy build is running before removing that lock manually.',
  )
}

function markerBytes(marker: GenerationMarker): Buffer {
  return jsonBytes(marker)
}

function createGenerationMarker(
  paths: ContentGenerationSwapPaths,
  role: GenerationMarkerRole,
  token: string,
): GenerationMarker {
  return {
    schemaVersion: CONTENT_GENERATION_MARKER_SCHEMA_VERSION,
    kind: 'english-words-content-generation-swap',
    dataRoot: paths.dataRoot,
    role,
    token,
  }
}

async function pathIsDirectory(path: string, label: string): Promise<boolean> {
  try {
    const stats = await lstat(path)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`${label} must be a real directory and was preserved: ${path}`)
    }
    return true
  } catch (error) {
    if (isMissingFile(error)) return false
    throw error
  }
}

function parseGenerationMarker(value: unknown, path: string): GenerationMarker {
  if (!isRecord(value)) throw new Error(`Unsafe content generation marker was preserved: ${path}`)
  const fields = Object.keys(value).sort().join(',')
  if (
    fields !== 'dataRoot,kind,role,schemaVersion,token'
    || value.schemaVersion !== CONTENT_GENERATION_MARKER_SCHEMA_VERSION
    || value.kind !== 'english-words-content-generation-swap'
    || typeof value.dataRoot !== 'string'
    || (value.role !== 'staging' && value.role !== 'rollback')
    || typeof value.token !== 'string'
    || !/^[0-9a-f-]{36}$/iu.test(value.token)
  ) {
    throw new Error(`Unsafe content generation marker was preserved: ${path}`)
  }
  return value as unknown as GenerationMarker
}

async function readGenerationMarker(
  directory: string,
  paths: ContentGenerationSwapPaths,
): Promise<GenerationMarker | undefined> {
  const path = markerPath(directory)
  let serialized: string
  try {
    serialized = await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return undefined
    throw error
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch (error) {
    throw new Error(`Unsafe content generation marker was preserved: ${path}`, { cause: error })
  }
  const marker = parseGenerationMarker(parsed, path)
  if (!samePath(marker.dataRoot, paths.dataRoot) || marker.dataRoot !== paths.dataRoot) {
    throw new Error(`Content generation marker names a different data root and was preserved: ${path}`)
  }
  return marker
}

function assertMarker(
  marker: GenerationMarker | undefined,
  role: GenerationMarkerRole,
  path: string,
  token?: string,
): asserts marker is GenerationMarker {
  if (!marker || marker.role !== role || (token !== undefined && marker.token !== token)) {
    throw new Error(`Unowned or conflicting content generation residue was preserved: ${path}`)
  }
}

async function writeGenerationMarker(
  directory: string,
  marker: GenerationMarker,
): Promise<void> {
  await writeFile(markerPath(directory), markerBytes(marker), { flag: 'wx' })
}

async function removeGenerationMarker(
  directory: string,
  paths: ContentGenerationSwapPaths,
  expected: GenerationMarker,
): Promise<void> {
  const observed = await readGenerationMarker(directory, paths)
  assertMarker(observed, expected.role, directory, expected.token)
  await unlink(markerPath(directory))
}

async function removeOwnedSwapDirectory(
  directory: string,
  paths: ContentGenerationSwapPaths,
  expected: GenerationMarker,
): Promise<void> {
  if (!samePath(directory, paths.stagingRoot) && !samePath(directory, paths.rollbackRoot)) {
    throw new Error(`Refusing to recursively remove a non-swap directory: ${directory}`)
  }
  const observed = await readGenerationMarker(directory, paths)
  assertMarker(observed, expected.role, directory, expected.token)
  await rm(directory, { recursive: true })
}

async function assertNoSymbolicLinks(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`Content generation refuses to copy symbolic links: ${path}`)
    }
    if (entry.isDirectory()) await assertNoSymbolicLinks(path)
  }
}

function prepareContentArtifacts(
  paths: ContentGenerationSwapPaths,
  artifacts: readonly ContentArtifact[],
): PreparedContentArtifact[] {
  if (artifacts.length === 0) throw new Error('Content generation requires at least one artifact')
  const seen = new Set<string>()
  const prepared = artifacts.map((item) => {
    if (!Buffer.isBuffer(item.bytes)) throw new Error(`Content artifact bytes must be a Buffer: ${item.target}`)
    const target = resolve(item.target)
    const relativeTarget = relative(paths.dataRoot, target)
    if (
      relativeTarget.length === 0
      || isAbsolute(relativeTarget)
      || relativeTarget === '..'
      || relativeTarget.startsWith(`..${sep}`)
    ) {
      throw new Error(`Content artifact target must be strictly inside ${paths.dataRoot}: ${target}`)
    }
    if (
      samePath(target, markerPath(paths.dataRoot))
      || samePath(target, legacyContentBuildLockPath(paths.dataRoot))
    ) {
      throw new Error(`Content artifact target is reserved for generation safety: ${target}`)
    }
    const key = pathKey(target)
    if (seen.has(key)) throw new Error(`Duplicate content artifact target: ${target}`)
    seen.add(key)

    const stagedTarget = resolve(paths.stagingRoot, relativeTarget)
    const stagedRelativeTarget = relative(paths.stagingRoot, stagedTarget)
    if (
      stagedRelativeTarget.length === 0
      || isAbsolute(stagedRelativeTarget)
      || stagedRelativeTarget === '..'
      || stagedRelativeTarget.startsWith(`..${sep}`)
    ) {
      throw new Error(`Content artifact staging path escaped its generation: ${target}`)
    }
    return { target, relativeTarget, stagedTarget, bytes: item.bytes }
  })

  const sortedKeys = [...seen].sort((left, right) => left.length - right.length)
  for (const [index, parent] of sortedKeys.entries()) {
    if (sortedKeys.slice(index + 1).some((candidate) => candidate.startsWith(`${parent}${sep}`))) {
      throw new Error(`Content artifact targets cannot contain one another: ${parent}`)
    }
  }
  return prepared
}

async function recoverContentGenerationSwap(
  paths: ContentGenerationSwapPaths,
): Promise<void> {
  const dataRootExists = await pathIsDirectory(paths.dataRoot, 'Content data root')
  const stagingExists = await pathIsDirectory(paths.stagingRoot, 'Content staging residue')
  const rollbackExists = await pathIsDirectory(paths.rollbackRoot, 'Content rollback residue')
  const dataMarker = dataRootExists
    ? await readGenerationMarker(paths.dataRoot, paths)
    : undefined
  const stagingMarker = stagingExists
    ? await readGenerationMarker(paths.stagingRoot, paths)
    : undefined
  const rollbackMarker = rollbackExists
    ? await readGenerationMarker(paths.rollbackRoot, paths)
    : undefined

  if (stagingExists) assertMarker(stagingMarker, 'staging', paths.stagingRoot)
  if (rollbackExists) assertMarker(rollbackMarker, 'rollback', paths.rollbackRoot)

  if (!dataRootExists) {
    if (!rollbackExists) {
      if (stagingExists) {
        throw new Error(
          `Content data root is missing and cannot be recovered from staging alone: ${paths.dataRoot}`,
        )
      }
      return
    }
    assertMarker(rollbackMarker, 'rollback', paths.rollbackRoot)
    if (stagingMarker && stagingMarker.token !== rollbackMarker.token) {
      throw new Error('Content generation residues have conflicting ownership tokens and were preserved')
    }
    await rename(paths.rollbackRoot, paths.dataRoot)
    await removeGenerationMarker(paths.dataRoot, paths, rollbackMarker)
    if (stagingMarker) {
      await removeOwnedSwapDirectory(paths.stagingRoot, paths, stagingMarker)
    }
    return
  }

  if (dataMarker?.role === 'rollback') {
    if (rollbackExists) {
      throw new Error('Both the data root and rollback residue claim the prior generation; both were preserved')
    }
    if (stagingMarker && stagingMarker.token !== dataMarker.token) {
      throw new Error('Content generation residues have conflicting ownership tokens and were preserved')
    }
    await removeGenerationMarker(paths.dataRoot, paths, dataMarker)
    if (stagingMarker) {
      await removeOwnedSwapDirectory(paths.stagingRoot, paths, stagingMarker)
    }
    return
  }

  if (dataMarker?.role === 'staging') {
    if (stagingExists) {
      throw new Error('Both the data root and staging residue claim the new generation; both were preserved')
    }
    if (rollbackMarker && rollbackMarker.token !== dataMarker.token) {
      throw new Error('Content generation residues have conflicting ownership tokens and were preserved')
    }
    await removeGenerationMarker(paths.dataRoot, paths, dataMarker)
    if (rollbackMarker) {
      await removeOwnedSwapDirectory(paths.rollbackRoot, paths, rollbackMarker)
    }
    return
  }

  if (dataMarker !== undefined) {
    throw new Error(`Content data root contains an unsupported generation marker: ${paths.dataRoot}`)
  }
  if (stagingMarker && rollbackMarker) {
    throw new Error('Ambiguous staging and rollback residues were preserved for manual inspection')
  }
  if (stagingMarker) {
    await removeOwnedSwapDirectory(paths.stagingRoot, paths, stagingMarker)
  }
  if (rollbackMarker) {
    await removeOwnedSwapDirectory(paths.rollbackRoot, paths, rollbackMarker)
  }
}

export async function validateContentGenerationResidue(
  dataRoot: string,
): Promise<ValidationIssue[]> {
  let paths: ContentGenerationSwapPaths
  try {
    paths = contentGenerationSwapPaths(dataRoot)
  } catch (error) {
    return [{
      code: 'UNSAFE_CONTENT_BUILD_RESIDUE',
      path: 'contentBuild.paths',
      message: error instanceof Error ? error.message : String(error),
    }]
  }

  const issues: ValidationIssue[] = []
  const recognizedMarkers: GenerationMarker[] = []
  const swapDirectories = [
    ['stagingRoot', paths.stagingRoot, 'staging'],
    ['rollbackRoot', paths.rollbackRoot, 'rollback'],
  ] as const
  for (const [pathName, directory, expectedRole] of swapDirectories) {
    let stats
    try {
      stats = await lstat(directory)
    } catch (error) {
      if (isMissingFile(error)) continue
      issues.push({
        code: 'UNSAFE_CONTENT_BUILD_RESIDUE',
        path: `contentBuild.${pathName}`,
        message: `Could not inspect content build residue ${directory}: ${String(error)}`,
      })
      continue
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      issues.push({
        code: 'UNSAFE_CONTENT_BUILD_RESIDUE',
        path: `contentBuild.${pathName}`,
        message: `Content build residue is not a real owned directory and was preserved: ${directory}`,
      })
      continue
    }
    try {
      const marker = await readGenerationMarker(directory, paths)
      if (!marker || marker.role !== expectedRole) {
        throw new Error('the ownership marker is missing or has the wrong role')
      }
      recognizedMarkers.push(marker)
      issues.push({
        code: 'CONTENT_BUILD_RESIDUE',
        path: `contentBuild.${pathName}`,
        message: `Owned ${expectedRole} generation residue remains at ${directory}; the next content build will retry cleanup.`,
      })
    } catch (error) {
      issues.push({
        code: 'UNSAFE_CONTENT_BUILD_RESIDUE',
        path: `contentBuild.${pathName}`,
        message: `Content build residue could not be verified and was preserved at ${directory}: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  try {
    const dataRootStats = await lstat(paths.dataRoot)
    if (dataRootStats.isSymbolicLink() || !dataRootStats.isDirectory()) {
      issues.push({
        code: 'UNSAFE_CONTENT_BUILD_RESIDUE',
        path: 'contentBuild.dataRootMarker',
        message: `Content data root is not a real directory: ${paths.dataRoot}`,
      })
    } else {
      const marker = await readGenerationMarker(paths.dataRoot, paths)
      if (marker) {
        recognizedMarkers.push(marker)
        issues.push({
          code: 'CONTENT_BUILD_RESIDUE',
          path: 'contentBuild.dataRootMarker',
          message: `Committed data root still contains a ${marker.role} generation journal marker at ${markerPath(paths.dataRoot)}.`,
        })
      }
    }
  } catch (error) {
    if (!isMissingFile(error)) {
      issues.push({
        code: 'UNSAFE_CONTENT_BUILD_RESIDUE',
        path: 'contentBuild.dataRootMarker',
        message: `Could not verify the content generation journal marker: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  if (new Set(recognizedMarkers.map(({ token }) => token)).size > 1) {
    issues.push({
      code: 'UNSAFE_CONTENT_BUILD_RESIDUE',
      path: 'contentBuild.ownership',
      message: 'Content generation residue markers have conflicting ownership tokens and require manual inspection.',
    })
  }

  return issues
}

async function restorePreviousGeneration(
  paths: ContentGenerationSwapPaths,
  stagingMarker: GenerationMarker,
  rollbackMarker: GenerationMarker,
  state: { originalMarked: boolean; originalMoved: boolean; stagingPromoted: boolean },
): Promise<unknown[]> {
  const failures: unknown[] = []
  if (state.stagingPromoted) {
    try {
      await rename(paths.dataRoot, paths.stagingRoot)
      state.stagingPromoted = false
    } catch (error) {
      failures.push(error)
    }
  }
  if (state.originalMoved) {
    try {
      await rename(paths.rollbackRoot, paths.dataRoot)
      state.originalMoved = false
    } catch (error) {
      failures.push(error)
    }
  }
  if (state.originalMarked && !state.originalMoved) {
    try {
      await removeGenerationMarker(paths.dataRoot, paths, rollbackMarker)
      state.originalMarked = false
    } catch (error) {
      failures.push(error)
    }
  }
  if (!state.stagingPromoted) {
    try {
      if (await pathIsDirectory(paths.stagingRoot, 'Content staging residue')) {
        await removeOwnedSwapDirectory(paths.stagingRoot, paths, stagingMarker)
      }
    } catch (error) {
      failures.push(error)
    }
  }
  return failures
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (isMissingFile(error)) return false
    throw error
  }
}

async function committedResiduePaths(
  paths: ContentGenerationSwapPaths,
): Promise<string[]> {
  const candidates = [markerPath(paths.dataRoot), paths.rollbackRoot]
  const exists = await Promise.all(candidates.map(pathExists))
  return candidates.filter((_path, index) => exists[index])
}

async function cleanCommittedGeneration(
  paths: ContentGenerationSwapPaths,
  stagingMarker: GenerationMarker,
  rollbackMarker: GenerationMarker,
  options: ContentCommitOptions,
): Promise<ContentCommitResult> {
  const maximumAttempts = 2
  let lastFailure: unknown

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      if (!await pathIsDirectory(paths.dataRoot, 'Committed content data root')) {
        throw new Error(`Committed content data root disappeared: ${paths.dataRoot}`)
      }
      await options.beforeFinalize?.(paths)
      const observedDataMarker = await readGenerationMarker(paths.dataRoot, paths)
      if (observedDataMarker) {
        assertMarker(observedDataMarker, 'staging', paths.dataRoot, stagingMarker.token)
        await removeGenerationMarker(paths.dataRoot, paths, stagingMarker)
      }

      if (await pathIsDirectory(paths.rollbackRoot, 'Committed content rollback residue')) {
        await options.beforeRollbackCleanup?.(paths)
        await removeOwnedSwapDirectory(paths.rollbackRoot, paths, rollbackMarker)
      }
      return { status: 'committed-clean', cleanupAttempts: attempt }
    } catch (error) {
      lastFailure = error
    }
  }

  let residuePaths: string[]
  let inspectionDetail = ''
  try {
    residuePaths = await committedResiduePaths(paths)
  } catch (error) {
    residuePaths = [markerPath(paths.dataRoot), paths.rollbackRoot]
    inspectionDetail = ` Residue inspection also failed: ${error instanceof Error ? error.message : String(error)}.`
  }
  if (residuePaths.length === 0) {
    return { status: 'committed-clean', cleanupAttempts: maximumAttempts }
  }
  const detail = lastFailure instanceof Error ? lastFailure.message : String(lastFailure)
  return {
    status: 'committed-with-cleanup-residue',
    cleanupAttempts: maximumAttempts,
    residuePaths,
    warning: `Content generation was committed, but cleanup remains at ${residuePaths.join(', ')}: ${detail}.${inspectionDetail} `
      + 'The next content build will retry cleanup; validate:data and validate:release will fail until it is clean.',
  }
}

export async function commitContentArtifacts(
  dataRoot: string,
  artifacts: readonly ContentArtifact[],
  options: ContentCommitOptions = {},
): Promise<ContentCommitResult> {
  const paths = contentGenerationSwapPaths(dataRoot)
  const prepared = prepareContentArtifacts(paths, artifacts)
  await assertLegacyContentBuildLockAbsent(paths.dataRoot)
  await recoverContentGenerationSwap(paths)
  await assertLegacyContentBuildLockAbsent(paths.dataRoot)
  await options.afterRecovery?.(paths)
  if (!await pathIsDirectory(paths.dataRoot, 'Content data root')) {
    throw new Error(`Content data root does not exist: ${paths.dataRoot}`)
  }
  await assertNoSymbolicLinks(paths.dataRoot)

  const token = randomUUID()
  const stagingMarker = createGenerationMarker(paths, 'staging', token)
  const rollbackMarker = createGenerationMarker(paths, 'rollback', token)
  const state = { originalMarked: false, originalMoved: false, stagingPromoted: false }

  try {
    await mkdir(paths.stagingRoot)
    await writeGenerationMarker(paths.stagingRoot, stagingMarker)
    const sourceEntries = await readdir(paths.dataRoot)
    for (const entry of sourceEntries) {
      await cp(join(paths.dataRoot, entry), join(paths.stagingRoot, entry), {
        recursive: true,
        force: false,
        errorOnExist: true,
      })
    }
    await assertNoSymbolicLinks(paths.stagingRoot)

    for (const item of prepared) {
      await mkdir(dirname(item.stagedTarget), { recursive: true })
      await writeFile(item.stagedTarget, item.bytes)
    }
    await options.afterStage?.(paths)
    for (const item of prepared) {
      const observed = await readFile(item.stagedTarget)
      if (!observed.equals(item.bytes)) {
        throw new Error(`Staged content artifact failed byte validation: ${item.relativeTarget}`)
      }
    }
    const observedStagingMarker = await readGenerationMarker(paths.stagingRoot, paths)
    assertMarker(observedStagingMarker, 'staging', paths.stagingRoot, token)

    await writeGenerationMarker(paths.dataRoot, rollbackMarker)
    state.originalMarked = true
    await rename(paths.dataRoot, paths.rollbackRoot)
    state.originalMoved = true
    await options.beforePromote?.(paths)
    await rename(paths.stagingRoot, paths.dataRoot)
    state.stagingPromoted = true
  } catch (error) {
    const rollbackFailures = await restorePreviousGeneration(
      paths,
      stagingMarker,
      rollbackMarker,
      state,
    )
    if (rollbackFailures.length > 0) {
      throw new AggregateError(
        [error, ...rollbackFailures],
        'Content generation swap failed and the previous generation could not be fully restored',
        { cause: error },
      )
    }
    throw error
  }

  return cleanCommittedGeneration(paths, stagingMarker, rollbackMarker, options)
}

async function readGrammarFile(path: string): Promise<GrammarNode[]> {
  return JSON.parse(await readFile(path, 'utf8')) as GrammarNode[]
}

export async function buildContent(options: ContentBuildOptions = {}): Promise<ContentBuildResult> {
  const { cacheRoot, dataRoot, manualStoryRoot } = resolveContentBuildPaths(options)
  const swapPaths = contentGenerationSwapPaths(dataRoot)
  const buildWords = options.buildWords ?? buildWordCatalog
  const buildPhrasals = options.buildPhrasals ?? buildPhrasalCatalog
  const readGrammar = options.readGrammar ?? readGrammarFile
  const loadManualStories = options.loadManualStories ?? loadApprovedManualStories
  const commit = options.commit ?? commitContentArtifacts
  const buildLock = await acquireBuildLock(swapPaths.lockPath)
  let generation: ContentGeneration | undefined
  let commitResult: ContentCommitResult | undefined
  let buildFailed = false
  let buildFailure: unknown
  let lockReleaseFailed = false
  let lockReleaseFailure: unknown

  try {
    await assertLegacyContentBuildLockAbsent(dataRoot)
    await recoverContentGenerationSwap(swapPaths)
    await assertLegacyContentBuildLockAbsent(dataRoot)
    const approvedManualStories = await loadManualStories(manualStoryRoot)
    const wordBuild = await buildWords(cacheRoot)
    const phrasalBuild = await buildPhrasals(cacheRoot)
    const grammarNodes = refineGrammarNodes(
      await readGrammar(join(dataRoot, 'grammar', 'nodes.json')),
    )
    generation = createContentGeneration({
      dataRoot,
      wordlists: wordBuild.wordlists,
      wordProvenance: wordBuild.provenance,
      phrasalTop: phrasalBuild.top,
      phrasalByLevel: phrasalBuild.byLevel,
      phrasalProvenance: phrasalBuild.provenance,
      grammarNodes,
      approvedManualStories,
    })

    commitResult = await commit(dataRoot, generation.artifacts) ?? {
      status: 'committed-clean',
      cleanupAttempts: 0,
    }
  } catch (error) {
    buildFailed = true
    buildFailure = error
  } finally {
    try {
      await buildLock.release()
    } catch (lockError) {
      lockReleaseFailed = true
      lockReleaseFailure = lockError
    }
  }

  if (buildFailed) {
    if (lockReleaseFailed) {
      throw new AggregateError(
        [buildFailure, lockReleaseFailure],
        'Content build failed and its lock could not be released',
        { cause: buildFailure },
      )
    }
    throw buildFailure
  }
  if (lockReleaseFailed) throw lockReleaseFailure
  if (!generation) throw new Error('Content build completed without a generation')
  if (!commitResult) throw new Error('Content build completed without a commit result')
  return { ...generation, commitResult }
}

async function main(): Promise<void> {
  const generation = await buildContent()
  if (generation.commitResult.status === 'committed-with-cleanup-residue') {
    console.warn(generation.commitResult.warning)
  }
  console.log(`Built and committed ${generation.artifacts.length} validated content artifacts.`)
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  await main()
}
