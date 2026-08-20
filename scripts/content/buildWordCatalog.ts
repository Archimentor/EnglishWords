import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import nlp from 'compromise'
import unbzip2 from 'unbzip2-stream'
import WinkPosTagger from 'wink-pos-tagger'

import { LEVELS } from '../../src/domain/content/types'
import type { Level, WordItem } from '../../src/domain/content/types'
import { normalizeWordExampleKey } from '../../src/domain/content/validators/words'
import { auditWordFamilyCapacity, familyForLemma } from '../../src/domain/content/wordFamilies'
import { BASIC_EDITORIAL_WORDS, buildBasicEditorialWords, parseIpaDictionary } from './buildBasicEditorial'
import { extractKoreanEntries } from './buildCatalog'
import type { KoreanMorphology } from './buildCatalog'
import { difficultyForPosition } from './difficultyBands'
import { requireVerifiedContentSourceCaches } from './fetchSources'
import { normalizeWord } from './normalize'
import { CONTENT_CACHE_DIR, CONTENT_SOURCES } from './sources'
import { wordCatalogOutputDigest } from './catalogDigest'
import type { OutputDigest } from './catalogDigest'
import type { ContentSource, ContentSourceId } from './source-types'

export const WORD_CONTENT_SOURCE_IDS = [
  'cefrj',
  'korean-wiktionary',
  'frequency',
  'tatoeba-english',
  'ipa-dict',
  'omw-english-wordnet',
  'omw-korean-wiktionary',
  'wordnet-3.0',
] as const satisfies readonly ContentSourceId[]

const WORD_CONTENT_SOURCES: readonly ContentSource[] = WORD_CONTENT_SOURCE_IDS.map((sourceId) => {
  const source = CONTENT_SOURCES.find(({ id }) => id === sourceId)
  if (!source) throw new Error(`Unknown word content source: ${sourceId}`)
  return source
})

const TARGET_NON_BASIC_WORDS = 4_500
const EXAMPLE_CANDIDATE_LIMIT = 100
const MIN_SURFACE_KIND_CANDIDATES = 40
const RECOVERY_MATCHED_EXAMPLE_LIMIT = 20
// OMW sense evidence comes from exact PWN coordinates and monosemy/convergence.
// Keep five POS-matched source sentences as a source-backed buffer before the
// release allocator selects its two globally unique examples.
export const OMW_RECOVERY_SOURCE_EXAMPLE_BUFFER = 5
const CEFR_ORDER = { A1: 0, A2: 1, B1: 2, B2: 3 } as const

type NonBasicLevel = Exclude<Level, '기초'>

const NON_BASIC_LEVEL_ORDER: Readonly<Record<NonBasicLevel, number>> = {
  유치원: 0,
  초등학교: 1,
  중학교: 2,
}

const LEARNER_LEVEL_ORDER: Readonly<Record<Level, number>> = {
  기초: -1,
  ...NON_BASIC_LEVEL_ORDER,
}

interface SensitiveTopicPolicy {
  id: string
  minimumLevel: NonBasicLevel
  lemmaPattern: RegExp
  meaningPattern: RegExp
  examplePattern: RegExp
}

/**
 * Auditable age-band policy. CEFR controls the general source band and these
 * categories raise concepts that need more context; they never lower a CEFR
 * band. The patterns intentionally describe topics, not arbitrary suffixes.
 */
export const SENSITIVE_TOPIC_POLICY: readonly SensitiveTopicPolicy[] = [
  {
    id: 'adult-relationships',
    minimumLevel: '초등학교',
    lemmaPattern: /^(?:bride|divorce|husband|marriage|marry|wedding|wife)$/i,
    meaningPattern: /(?:결혼|배우자|남편|아내|이혼)/,
    examplePattern: /\b(?:bride|divorc\w*|husband|marri\w*|wedding|wife)\b/i,
  },
  {
    id: 'commerce',
    minimumLevel: '초등학교',
    lemmaPattern: /^(?:ad|advertise|advertisement|advertising|agency|business|commerce|commercial|company)$/i,
    meaningPattern: /(?:광고|사업|상업|기업)/,
    examplePattern: /\b(?:advertis\w*|business(?:es)?|commerce|commercial)\b/i,
  },
  {
    id: 'conflict-crime-and-politics',
    minimumLevel: '중학교',
    lemmaPattern: /^(?:army|battle|crime|criminal|detention|election|gang|government|guilty|manslaughter|military|politics|political|prison|prisoner|robbery|soldier|terror|thief|troop|war|weapon)$/i,
    meaningPattern: /(?:감옥|강도|구금|구류|군대|군인|범죄|선거|유죄|전쟁|정부|정치|죄수|중범죄|테러|무기|과실치사|형사법)/,
    examplePattern: /\b(?:army|battle|crime|criminal|detention|election|gang|government|guilt(?:y)?|manslaughter|military|politic\w*|prison\w*|robber\w*|soldier\w*|terror\w*|thie(?:f|ves)|troops?|war|weapons?)\b/i,
  },
  {
    id: 'substances-and-addiction',
    minimumLevel: '중학교',
    lemmaPattern: /^(?:addict|addicted|addiction|alcohol|alcoholic|beer|cigarette|drug|gambling|liquor|tobacco|vape|vodka|whisky|whiskey|wine)$/i,
    meaningPattern: /(?:도박|마약|알코올|약물|중독|담배|맥주|(?<![가-힣])술(?![가-힣])|포도주)/,
    examplePattern: /\b(?:addict\w*|alcohol\w*|beer|cigarettes?|drugg?\w*|gambl\w*|liquor|tobacco|vaping?|vodka|whisk(?:e)?y|wine)\b/i,
  },
  {
    id: 'mortality-and-serious-illness',
    minimumLevel: '중학교',
    lemmaPattern: /^(?:cancer|dead|death|die|disease|funeral|grave|illness|mortality)$/i,
    meaningPattern: /(?:사망|죽[은음다]|장례|중병|암(?:,|\s|$))/,
    examplePattern: /\b(?:cancer|dead|death|died|dies|disease|funeral|grave|killed|mortality)\b/i,
  },
  {
    id: 'identity-and-orientation-context',
    minimumLevel: '중학교',
    lemmaPattern: /^(?:bisexual|bisexuality|gay|homosexual|homosexuality|lesbian|transgender)$/i,
    meaningPattern: /(?:동성애|동성애자|레즈비언|성적\s*지향|양성애|트랜스젠더)/,
    examplePattern: /\b(?:bisexual(?:ity)?|gay|homosexual(?:ity)?|lesbians?|sexual orientation|transgender)\b/i,
  },
  {
    id: 'mental-health',
    minimumLevel: '중학교',
    lemmaPattern: /^(?:anxiety|depressed|depression|psychiatric)$/i,
    meaningPattern: /(?:불안\s*장애|우울증|정신\s*(?:건강|병|질환)|정신의학)/,
    examplePattern: /\b(?:anxiety disorder|depress(?:ed|ion)|mental (?:health|illness)|psychiatric)\b/i,
  },
] as const

interface RequiredCoreWord {
  lemma: string
  partOfSpeech: string
  meanings: readonly string[]
  examples: readonly [string, string]
}

// Foundational closed-class anchors live in the checked-in basic editorial
// catalog. Keeping this typed extension point empty prevents a second copy in
// the sourced non-basic catalog while preserving the builder's generic path.
export const REQUIRED_CORE_WORDS: readonly RequiredCoreWord[] = []

const REQUIRED_CORE_WORD_LEMMAS = new Set<string>(
  REQUIRED_CORE_WORDS.map(({ lemma }) => lemma),
)

export type CefrLevel = keyof typeof CEFR_ORDER

export const KINDERGARTEN_SOURCE_FALLBACK_CEFR: CefrLevel = 'A2'

interface CefrRecord {
  level: CefrLevel
  partOfSpeech: string
  line: number
}

interface FrequencyRecord {
  rank: number
  partOfSpeech: string
  line: number
}

interface ExampleRecord {
  sentence: string
  line: number
  partOfSpeechMatch: boolean
}

interface RawExampleRecord extends ExampleRecord {
  entryKey: string
  lemma: string
  partOfSpeech: string
  matchedForms: string[]
  usesInflectedForm: boolean
}

interface ExampleTarget {
  lemma: string
  partOfSpeech: string
}

export interface ExampleMatchingDiagnostics {
  rawCandidates: number
  matchedCandidates: number
  recoveryCandidates: number
  recoveryMatched: number
  unmatchedSamples: string[]
}

type PrimaryWiktionaryResolution =
  | 'exact-source-sense'
  | 'alternate-wiktionary-sense'
  | 'editorial-source-pos-override'

type PartOfSpeechResolution =
  | PrimaryWiktionaryResolution
  | 'additional-wiktionary-sense'
  | 'omw-bilingual-synset'
  | 'editorial-core-anchor'

interface VerifiedWordEntryCandidate {
  partOfSpeechResolution: PartOfSpeechResolution
  partOfSpeech: string
  meanings: string[]
  ipa: string
  forms: string[] | Record<string, string>
  examples: ExampleRecord[]
  omwSynsetIds?: string[]
}

type WordForms = VerifiedWordEntryCandidate['forms']

interface VerifiedWordCandidate {
  lemma: string
  cefr?: CefrRecord
  frequency?: FrequencyRecord
  sourcePartOfSpeech: string
  entries: VerifiedWordEntryCandidate[]
}

interface SelectedWordEntry extends VerifiedWordEntryCandidate {
  selectedExamples: [ExampleRecord, ExampleRecord]
}

interface SelectedWord extends Omit<VerifiedWordCandidate, 'entries'> {
  level: Level
  entries: SelectedWordEntry[]
}

interface AllocatedWord extends Omit<VerifiedWordCandidate, 'entries'> {
  level: NonBasicLevel
  entries: VerifiedWordEntryCandidate[]
}

export interface WordCatalogProvenance {
  schemaVersion: '4.0.0'
  generatedBy: 'scripts/content/buildWordCatalog.ts'
  outputDigest: OutputDigest
  selectionPolicy: {
    basic: string
    nonBasic: string
    quotas: Record<Level, number>
  }
  sources: readonly ContentSource[]
  words: Array<{
    lemma: string
    level: Level
    cefr: CefrLevel | null
    cefrLine: number | null
    frequencyRank: number | null
    frequencyLine: number | null
    entries: Array<{
      koreanWiktionaryPage: string | null
      omwSynsetIds: string[] | null
      sourcePartOfSpeech: string | null
      catalogPartOfSpeech: string
      partOfSpeechResolution: 'editorial-basic' | PartOfSpeechResolution
      ipaSource: 'ipa-dict' | 'editorial-basic'
      exampleSourceLines: number[] | null
    }>
  }>
}

export interface OmwBilingualEntry {
  partOfSpeech: 'adjective' | 'adverb' | 'noun' | 'verb'
  meanings: string[]
  synsetIds: string[]
}

const OMW_PART_OF_SPEECH: Readonly<Record<string, OmwBilingualEntry['partOfSpeech']>> = {
  a: 'adjective',
  n: 'noun',
  r: 'adverb',
  v: 'verb',
}

const UNSAFE_OMW_MEANING =
  /(?:강간|고문|마약|매춘|살인|성교|성기|성행위|아편|음란|자살|총기|폭탄|포르노|혐오|헤로인)/

function safeOmwMeaning(value: string): string | undefined {
  const meaning = value.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (
    meaning.length === 0
    || meaning.length > 80
    || !/[가-힣]/.test(meaning)
    || /[<>{}[\]|]/.test(meaning)
    || UNSAFE_OMW_MEANING.test(meaning)
    || UNSUITABLE_ALTERNATE_SENSE.test(meaning)
    || isInflectionCrossReference(meaning)
  ) return undefined
  return meaning
}

/**
 * Joins the two commit-pinned OMW tables only on an exact PWN3 synset id.
 * No first-row or fuzzy translation fallback is allowed. A lemma/POS is kept
 * only when it is monosemous in the PWN table, or when every listed synset has
 * a Korean row and their Korean labels converge. Every returned meaning keeps
 * all exact offset/POS coordinates that licensed it.
 */
export function parseOmwBilingualLexicon(
  englishSource: string,
  koreanSource: string,
): Map<string, OmwBilingualEntry[]> {
  const koreanBySynset = new Map<string, string[]>()
  for (const line of koreanSource.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith('#')) continue
    const [synsetId, relation, ...valueParts] = line.split('\t')
    if (!synsetId || relation !== 'kor:lemma') continue
    const meaning = safeOmwMeaning(valueParts.join('\t'))
    if (!meaning || !/^\d{8}-[anrv]$/.test(synsetId)) continue
    const meanings = koreanBySynset.get(synsetId) ?? []
    if (!meanings.includes(meaning)) meanings.push(meaning)
    koreanBySynset.set(synsetId, meanings)
  }

  const allSynsetsByEntry = new Map<string, Set<string>>()
  const joinedMeaningsByEntry = new Map<string, Map<string, string[]>>()
  for (const line of englishSource.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith('#')) continue
    const [synsetId, relation, ...valueParts] = line.split('\t')
    const lemma = normalizedLemma(valueParts.join('\t'))
    const partOfSpeech = synsetId ? OMW_PART_OF_SPEECH[synsetId.at(-1) ?? ''] : undefined
    if (relation !== 'lemma' || !synsetId || !lemma || !partOfSpeech) continue
    const key = entryExampleKey(lemma, partOfSpeech)
    const allSynsets = allSynsetsByEntry.get(key) ?? new Set()
    allSynsets.add(synsetId)
    allSynsetsByEntry.set(key, allSynsets)
    const meanings = koreanBySynset.get(synsetId)
    if (meanings) {
      const joined = joinedMeaningsByEntry.get(key) ?? new Map()
      joined.set(synsetId, meanings)
      joinedMeaningsByEntry.set(key, joined)
    }
  }

  const grouped = new Map<string, OmwBilingualEntry[]>()
  for (const [key, allSynsets] of allSynsetsByEntry) {
    const joined = joinedMeaningsByEntry.get(key)
    if (!joined || joined.size !== allSynsets.size) continue
    const [lemma, partOfSpeech] = key.split('\0') as [string, OmwBilingualEntry['partOfSpeech']]
    const meaningSets = [...joined.values()].map((meanings) => new Set(meanings))
    const convergedMeanings = [...(meaningSets[0] ?? [])]
      .filter((meaning) => meaningSets.every((meanings) => meanings.has(meaning)))
      .slice(0, 4)
    if (allSynsets.size > 1 && convergedMeanings.length === 0) continue
    const meanings = allSynsets.size === 1
      ? [...joined.values()][0]!.slice(0, 4)
      : convergedMeanings
    const entries = grouped.get(lemma) ?? []
    entries.push({
      partOfSpeech,
      meanings,
      synsetIds: [...allSynsets].sort(),
    })
    grouped.set(lemma, entries)
  }
  return grouped
}

function normalizedLemma(value: string): string | undefined {
  const lemma = value.trim().toLowerCase()
  return /^[a-z]+$/.test(lemma) ? lemma : undefined
}

function laterLearnerLevel(
  left: NonBasicLevel,
  right: NonBasicLevel,
): NonBasicLevel {
  return NON_BASIC_LEVEL_ORDER[left] >= NON_BASIC_LEVEL_ORDER[right] ? left : right
}

export function minimumLearnerLevelForWord(
  lemma: string,
  cefr: CefrLevel | undefined,
  meanings: readonly string[] = [],
): NonBasicLevel {
  let minimumLevel: NonBasicLevel = cefr === 'A1'
    ? '유치원'
    : cefr === 'A2' || cefr === 'B1'
      ? '초등학교'
      : '중학교'
  const normalized = lemma.trim().toLowerCase()
  const meaningText = meanings.join(' ')
  for (const policy of SENSITIVE_TOPIC_POLICY) {
    if (policy.lemmaPattern.test(normalized) || policy.meaningPattern.test(meaningText)) {
      minimumLevel = laterLearnerLevel(minimumLevel, policy.minimumLevel)
    }
  }
  return minimumLevel
}

export type KindergartenAllocationPhase = 'primary-a1' | 'fallback-a2' | 'ineligible'

/**
 * CEFR is proficiency evidence, not an age-safety label. Kindergarten consumes
 * every safe A1 head first, then may fill only the remaining quota with safe,
 * source-labelled A2 heads. B1/B2/unrated and every sensitive topic stay out.
 */
export function kindergartenAllocationPhase(
  lemma: string,
  cefr: CefrLevel | undefined,
  meanings: readonly string[] = [],
): KindergartenAllocationPhase {
  const normalized = lemma.trim().toLowerCase()
  const meaningText = meanings.join(' ')
  const sensitive = SENSITIVE_TOPIC_POLICY.some((policy) =>
    policy.lemmaPattern.test(normalized) || policy.meaningPattern.test(meaningText))
  if (sensitive) return 'ineligible'
  if (cefr === 'A1') return 'primary-a1'
  return cefr === KINDERGARTEN_SOURCE_FALLBACK_CEFR ? 'fallback-a2' : 'ineligible'
}

export function isLearnerSafeExampleForLevel(
  sentence: string,
  level: Level,
): boolean {
  if (!isLearnerSafeExample(sentence)) return false
  return SENSITIVE_TOPIC_POLICY.every((policy) =>
    LEARNER_LEVEL_ORDER[level] >= LEARNER_LEVEL_ORDER[policy.minimumLevel]
      || !policy.examplePattern.test(sentence))
}

/** RFC-4180-style parser for the pinned, one-record-per-line source CSV files. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let value = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      fields.push(value)
      value = ''
    } else {
      value += character
    }
  }
  fields.push(value)
  return fields
}

function sourceRows(source: string): string[][] {
  return source.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(parseCsvLine)
}

export function parseCefrCsv(source: string): Map<string, CefrRecord> {
  return new Map([...parseCefrEvidence(source)].map(([lemma, evidence]) => [
    lemma,
    [...evidence].sort((left, right) =>
      CEFR_ORDER[left.level] - CEFR_ORDER[right.level] || left.line - right.line)[0]!,
  ]))
}

export function parseCefrEvidence(source: string): Map<string, CefrRecord[]> {
  const [headers, ...rows] = sourceRows(source)
  if (!headers) throw new Error('CEFR-J source is empty')
  const headword = headers.indexOf('headword')
  const pos = headers.indexOf('pos')
  const cefr = headers.indexOf('CEFR')
  if ([headword, pos, cefr].some((index) => index < 0)) {
    throw new Error('CEFR-J source headers are not recognized')
  }

  const records = new Map<string, CefrRecord[]>()
  rows.forEach((row, index) => {
    const lemma = normalizedLemma(row[headword] ?? '')
    const level = row[cefr]?.trim() as CefrLevel | undefined
    const partOfSpeech = row[pos]?.trim()
    if (!lemma || !level || !(level in CEFR_ORDER) || !partOfSpeech) return

    const existing = records.get(lemma) ?? []
    existing.push({ level, partOfSpeech, line: index + 2 })
    records.set(lemma, existing)
  })
  return records
}

export function parseFrequencyCsv(source: string): Map<string, FrequencyRecord> {
  return new Map([...parseFrequencyEvidence(source)].map(([lemma, evidence]) => [
    lemma,
    [...evidence].sort((left, right) => left.rank - right.rank || left.line - right.line)[0]!,
  ]))
}

export function parseFrequencyEvidence(source: string): Map<string, FrequencyRecord[]> {
  const [headers, ...rows] = sourceRows(source)
  if (!headers) throw new Error('Frequency source is empty')
  const rank = headers.indexOf('Rank')
  const word = headers.indexOf('Word')
  const pos = headers.indexOf('Part of speech')
  if ([rank, word, pos].some((index) => index < 0)) {
    throw new Error('Frequency source headers are not recognized')
  }

  const records = new Map<string, FrequencyRecord[]>()
  rows.forEach((row, index) => {
    const lemma = normalizedLemma(row[word] ?? '')
    const parsedRank = Number(row[rank])
    const partOfSpeech = row[pos]?.trim()
    if (!lemma || !Number.isInteger(parsedRank) || parsedRank <= 0 || !partOfSpeech) return
    const existing = records.get(lemma) ?? []
    existing.push({ rank: parsedRank, partOfSpeech, line: index + 2 })
    records.set(lemma, existing)
  })
  return records
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([a-f0-9]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

export function parseWikiPageXml(pageXml: string): { title: string; text: string } | undefined {
  const title = pageXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]
  const text = pageXml.match(/<text\b[^>]*>([\s\S]*?)<\/text>/)?.[1]
  if (title === undefined || text === undefined) return undefined
  return { title: decodeXml(title).trim(), text: decodeXml(text) }
}

export function parseWikiPageTitle(pageXml: string): string | undefined {
  const title = pageXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]
  return title === undefined ? undefined : decodeXml(title).trim()
}

async function readKoreanWiktionary(
  path: string,
  targets: ReadonlySet<string>,
): Promise<Map<string, ReturnType<typeof extractKoreanEntries>>> {
  const pages = new Map<string, ReturnType<typeof extractKoreanEntries>>()
  const decompressed = new PassThrough()
  createReadStream(path).pipe(unbzip2()).pipe(decompressed)
  decompressed.setEncoding('utf8')
  let pending = ''

  for await (const chunk of decompressed) {
    pending += chunk as string
    let boundary = pending.indexOf('</page>')
    while (boundary >= 0) {
      const pageXml = pending.slice(0, boundary + '</page>'.length)
      pending = pending.slice(boundary + '</page>'.length)
      const title = parseWikiPageTitle(pageXml)
      const lemma = title ? normalizedLemma(title) : undefined
      if (lemma && targets.has(lemma)) {
        const page = parseWikiPageXml(pageXml)
        if (page) {
          const entries = extractKoreanEntries(page.text)
          if (entries.length > 0) pages.set(lemma, entries)
        }
      }
      boundary = pending.indexOf('</page>')
    }
  }
  return pages
}

const FREQUENCY_POS: Record<string, string> = {
  a: 'determiner',
  c: 'conjunction',
  i: 'preposition',
  j: 'adjective',
  m: 'numeral',
  n: 'noun',
  p: 'pronoun',
  r: 'adverb',
  t: 'infinitiveMarker',
  u: 'interjection',
  v: 'verb',
}

export function normalizedPartOfSpeech(
  cefrPartOfSpeech: string | undefined,
  frequencyPartOfSpeech: string | undefined,
): string {
  const cefr = cefrPartOfSpeech?.trim().toLowerCase()
  if (cefr) {
    const aliases: Record<string, string> = {
      'be-verb': 'verb',
      'do-verb': 'verb',
      'have-verb': 'verb',
      'infinitive-to': 'infinitiveMarker',
      'modal auxiliary': 'verb',
      number: 'numeral',
    }
    return aliases[cefr] ?? cefr
  }
  const frequency = frequencyPartOfSpeech?.trim().toLowerCase()
  return frequency ? (FREQUENCY_POS[frequency] ?? 'other') : 'other'
}

const IRREGULAR_VERBS: Record<string, readonly [string, string, string, string]> = {
  arise: ['arises', 'arose', 'arising', 'arisen'],
  awake: ['awakes', 'awoke', 'awaking', 'awoken'],
  babysit: ['babysits', 'babysat', 'babysitting', 'babysat'],
  bear: ['bears', 'bore', 'bearing', 'borne'],
  beat: ['beats', 'beat', 'beating', 'beaten'],
  be: ['is', 'was', 'being', 'been'],
  bet: ['bets', 'bet', 'betting', 'bet'],
  bid: ['bids', 'bid', 'bidding', 'bid'],
  become: ['becomes', 'became', 'becoming', 'become'],
  beget: ['begets', 'begot', 'begetting', 'begotten'],
  behold: ['beholds', 'beheld', 'beholding', 'beheld'],
  beset: ['besets', 'beset', 'besetting', 'beset'],
  begin: ['begins', 'began', 'beginning', 'begun'],
  bend: ['bends', 'bent', 'bending', 'bent'],
  bind: ['binds', 'bound', 'binding', 'bound'],
  bite: ['bites', 'bit', 'biting', 'bitten'],
  bleed: ['bleeds', 'bled', 'bleeding', 'bled'],
  blow: ['blows', 'blew', 'blowing', 'blown'],
  break: ['breaks', 'broke', 'breaking', 'broken'],
  breed: ['breeds', 'bred', 'breeding', 'bred'],
  bring: ['brings', 'brought', 'bringing', 'brought'],
  broadcast: ['broadcasts', 'broadcast', 'broadcasting', 'broadcast'],
  build: ['builds', 'built', 'building', 'built'],
  burst: ['bursts', 'burst', 'bursting', 'burst'],
  buy: ['buys', 'bought', 'buying', 'bought'],
  catch: ['catches', 'caught', 'catching', 'caught'],
  cast: ['casts', 'cast', 'casting', 'cast'],
  choose: ['chooses', 'chose', 'choosing', 'chosen'],
  cling: ['clings', 'clung', 'clinging', 'clung'],
  come: ['comes', 'came', 'coming', 'come'],
  cost: ['costs', 'cost', 'costing', 'cost'],
  creep: ['creeps', 'crept', 'creeping', 'crept'],
  cut: ['cuts', 'cut', 'cutting', 'cut'],
  do: ['does', 'did', 'doing', 'done'],
  dig: ['digs', 'dug', 'digging', 'dug'],
  draw: ['draws', 'drew', 'drawing', 'drawn'],
  deal: ['deals', 'dealt', 'dealing', 'dealt'],
  drink: ['drinks', 'drank', 'drinking', 'drunk'],
  drive: ['drives', 'drove', 'driving', 'driven'],
  eat: ['eats', 'ate', 'eating', 'eaten'],
  fall: ['falls', 'fell', 'falling', 'fallen'],
  feel: ['feels', 'felt', 'feeling', 'felt'],
  feed: ['feeds', 'fed', 'feeding', 'fed'],
  fight: ['fights', 'fought', 'fighting', 'fought'],
  find: ['finds', 'found', 'finding', 'found'],
  fly: ['flies', 'flew', 'flying', 'flown'],
  fling: ['flings', 'flung', 'flinging', 'flung'],
  flee: ['flees', 'fled', 'fleeing', 'fled'],
  forbid: ['forbids', 'forbade', 'forbidding', 'forbidden'],
  forgive: ['forgives', 'forgave', 'forgiving', 'forgiven'],
  forecast: ['forecasts', 'forecast', 'forecasting', 'forecast'],
  forget: ['forgets', 'forgot', 'forgetting', 'forgotten'],
  freeze: ['freezes', 'froze', 'freezing', 'frozen'],
  get: ['gets', 'got', 'getting', 'gotten'],
  give: ['gives', 'gave', 'giving', 'given'],
  go: ['goes', 'went', 'going', 'gone'],
  grow: ['grows', 'grew', 'growing', 'grown'],
  hang: ['hangs', 'hung', 'hanging', 'hung'],
  have: ['has', 'had', 'having', 'had'],
  hear: ['hears', 'heard', 'hearing', 'heard'],
  hide: ['hides', 'hid', 'hiding', 'hidden'],
  hit: ['hits', 'hit', 'hitting', 'hit'],
  hold: ['holds', 'held', 'holding', 'held'],
  hurt: ['hurts', 'hurt', 'hurting', 'hurt'],
  keep: ['keeps', 'kept', 'keeping', 'kept'],
  know: ['knows', 'knew', 'knowing', 'known'],
  kneel: ['kneels', 'kneeled', 'kneeling', 'kneeled'],
  lead: ['leads', 'led', 'leading', 'led'],
  lay: ['lays', 'laid', 'laying', 'laid'],
  leave: ['leaves', 'left', 'leaving', 'left'],
  lend: ['lends', 'lent', 'lending', 'lent'],
  let: ['lets', 'let', 'letting', 'let'],
  lie: ['lies', 'lay', 'lying', 'lain'],
  lose: ['loses', 'lost', 'losing', 'lost'],
  light: ['lights', 'lit', 'lighting', 'lit'],
  make: ['makes', 'made', 'making', 'made'],
  mean: ['means', 'meant', 'meaning', 'meant'],
  meet: ['meets', 'met', 'meeting', 'met'],
  mistake: ['mistakes', 'mistook', 'mistaking', 'mistaken'],
  pay: ['pays', 'paid', 'paying', 'paid'],
  put: ['puts', 'put', 'putting', 'put'],
  prove: ['proves', 'proved', 'proving', 'proven'],
  quit: ['quits', 'quit', 'quitting', 'quit'],
  read: ['reads', 'read', 'reading', 'read'],
  rebuild: ['rebuilds', 'rebuilt', 'rebuilding', 'rebuilt'],
  redo: ['redoes', 'redid', 'redoing', 'redone'],
  remake: ['remakes', 'remade', 'remaking', 'remade'],
  repay: ['repays', 'repaid', 'repaying', 'repaid'],
  reread: ['rereads', 'reread', 'rereading', 'reread'],
  reset: ['resets', 'reset', 'resetting', 'reset'],
  retell: ['retells', 'retold', 'retelling', 'retold'],
  retake: ['retakes', 'retook', 'retaking', 'retaken'],
  rewrite: ['rewrites', 'rewrote', 'rewriting', 'rewritten'],
  rid: ['rids', 'rid', 'ridding', 'rid'],
  ride: ['rides', 'rode', 'riding', 'ridden'],
  ring: ['rings', 'rang', 'ringing', 'rung'],
  rise: ['rises', 'rose', 'rising', 'risen'],
  run: ['runs', 'ran', 'running', 'run'],
  say: ['says', 'said', 'saying', 'said'],
  see: ['sees', 'saw', 'seeing', 'seen'],
  seek: ['seeks', 'sought', 'seeking', 'sought'],
  send: ['sends', 'sent', 'sending', 'sent'],
  sell: ['sells', 'sold', 'selling', 'sold'],
  sew: ['sews', 'sewed', 'sewing', 'sewn'],
  set: ['sets', 'set', 'setting', 'set'],
  shed: ['sheds', 'shed', 'shedding', 'shed'],
  shut: ['shuts', 'shut', 'shutting', 'shut'],
  shine: ['shines', 'shone', 'shining', 'shone'],
  shake: ['shakes', 'shook', 'shaking', 'shaken'],
  show: ['shows', 'showed', 'showing', 'shown'],
  shoot: ['shoots', 'shot', 'shooting', 'shot'],
  shrink: ['shrinks', 'shrank', 'shrinking', 'shrunk'],
  sing: ['sings', 'sang', 'singing', 'sung'],
  sink: ['sinks', 'sank', 'sinking', 'sunk'],
  slide: ['slides', 'slid', 'sliding', 'slid'],
  smell: ['smells', 'smelled', 'smelling', 'smelled'],
  sow: ['sows', 'sowed', 'sowing', 'sown'],
  sit: ['sits', 'sat', 'sitting', 'sat'],
  sleep: ['sleeps', 'slept', 'sleeping', 'slept'],
  speak: ['speaks', 'spoke', 'speaking', 'spoken'],
  spin: ['spins', 'spun', 'spinning', 'spun'],
  spit: ['spits', 'spat', 'spitting', 'spat'],
  speed: ['speeds', 'sped', 'speeding', 'sped'],
  spell: ['spells', 'spelled', 'spelling', 'spelled'],
  spill: ['spills', 'spilled', 'spilling', 'spilled'],
  spend: ['spends', 'spent', 'spending', 'spent'],
  split: ['splits', 'split', 'splitting', 'split'],
  spread: ['spreads', 'spread', 'spreading', 'spread'],
  spring: ['springs', 'sprang', 'springing', 'sprung'],
  steal: ['steals', 'stole', 'stealing', 'stolen'],
  stick: ['sticks', 'stuck', 'sticking', 'stuck'],
  stink: ['stinks', 'stunk', 'stinking', 'stunk'],
  stand: ['stands', 'stood', 'standing', 'stood'],
  strive: ['strives', 'strove', 'striving', 'striven'],
  strike: ['strikes', 'struck', 'striking', 'struck'],
  swear: ['swears', 'swore', 'swearing', 'sworn'],
  swing: ['swings', 'swung', 'swinging', 'swung'],
  sweep: ['sweeps', 'swept', 'sweeping', 'swept'],
  swim: ['swims', 'swam', 'swimming', 'swum'],
  take: ['takes', 'took', 'taking', 'taken'],
  teach: ['teaches', 'taught', 'teaching', 'taught'],
  tear: ['tears', 'tore', 'tearing', 'torn'],
  tell: ['tells', 'told', 'telling', 'told'],
  think: ['thinks', 'thought', 'thinking', 'thought'],
  thrust: ['thrusts', 'thrust', 'thrusting', 'thrust'],
  tread: ['treads', 'trod', 'treading', 'trodden'],
  throw: ['throws', 'threw', 'throwing', 'thrown'],
  understand: ['understands', 'understood', 'understanding', 'understood'],
  undergo: ['undergoes', 'underwent', 'undergoing', 'undergone'],
  undertake: ['undertakes', 'undertook', 'undertaking', 'undertaken'],
  undo: ['undoes', 'undid', 'undoing', 'undone'],
  uphold: ['upholds', 'upheld', 'upholding', 'upheld'],
  upset: ['upsets', 'upset', 'upsetting', 'upset'],
  wake: ['wakes', 'woke', 'waking', 'woken'],
  wear: ['wears', 'wore', 'wearing', 'worn'],
  weep: ['weeps', 'wept', 'weeping', 'wept'],
  win: ['wins', 'won', 'winning', 'won'],
  wind: ['winds', 'wound', 'winding', 'wound'],
  write: ['writes', 'wrote', 'writing', 'written'],
  withdraw: ['withdraws', 'withdrew', 'withdrawing', 'withdrawn'],
  withhold: ['withholds', 'withheld', 'withholding', 'withheld'],
  withstand: ['withstands', 'withstood', 'withstanding', 'withstood'],
  wring: ['wrings', 'wrung', 'wringing', 'wrung'],
  foresee: ['foresees', 'foresaw', 'foreseeing', 'foreseen'],
  mislead: ['misleads', 'misled', 'misleading', 'misled'],
  misread: ['misreads', 'misread', 'misreading', 'misread'],
  misunderstand: ['misunderstands', 'misunderstood', 'misunderstanding', 'misunderstood'],
  outdo: ['outdoes', 'outdid', 'outdoing', 'outdone'],
  outgrow: ['outgrows', 'outgrew', 'outgrowing', 'outgrown'],
  outrun: ['outruns', 'outran', 'outrunning', 'outrun'],
  overdo: ['overdoes', 'overdid', 'overdoing', 'overdone'],
  overcome: ['overcomes', 'overcame', 'overcoming', 'overcome'],
  overeat: ['overeats', 'overate', 'overeating', 'overeaten'],
  overhear: ['overhears', 'overheard', 'overhearing', 'overheard'],
  overrun: ['overruns', 'overran', 'overrunning', 'overrun'],
  oversee: ['oversees', 'oversaw', 'overseeing', 'overseen'],
  oversleep: ['oversleeps', 'overslept', 'oversleeping', 'overslept'],
  overtake: ['overtakes', 'overtook', 'overtaking', 'overtaken'],
  overthrow: ['overthrows', 'overthrew', 'overthrowing', 'overthrown'],
}

const IRREGULAR_VERB_VARIANTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  bid: { pastVariant: 'bade', pastParticipleVariant: 'bidden' },
  lie: { pastVariant: 'lied', pastParticipleVariant: 'lied' },
  ring: { pastVariant: 'ringed', pastParticipleVariant: 'ringed' },
  wind: { pastVariant: 'winded', pastParticipleVariant: 'winded' },
}

const MODAL_VERBS = new Set([
  'can', 'could', 'may', 'might', 'must', 'ought', 'shall', 'should', 'will', 'would',
])

const REVIEWED_MODAL_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  can: ['could'],
  may: ['might'],
  shall: ['should'],
  will: ['would'],
}

const STRESSED_FINAL_DOUBLE_VERBS = new Set([
  'acquit', 'admit', 'allot', 'commit', 'compel', 'confer', 'control', 'defer',
  'deter', 'enroll', 'equip', 'excel', 'expel', 'format', 'handicap', 'incur',
  'infer', 'input', 'kidnap', 'occur', 'omit', 'outfit', 'output', 'overlap',
  'overstep', 'patrol', 'permit', 'prefer', 'program', 'propel', 'recur', 'refer',
  'rebel', 'regret', 'repel', 'submit', 'transfer',
  'transmit',
])

const FINAL_C_TAKES_K_VERBS = new Set([
  'frolic', 'mimic', 'panic', 'picnic', 'shellac', 'tarmac', 'traffic',
])

const GERUND_KEEPS_FINAL_E_VERBS = new Set([
  'canoe', 'dye', 'eye', 'hoe', 'shoe', 'singe', 'tinge', 'tiptoe', 'toe', 'whinge',
])

function doubledFinalConsonant(lemma: string): boolean {
  if (/(.)\1$/.test(lemma)) return false
  if (STRESSED_FINAL_DOUBLE_VERBS.has(lemma)) return true
  const vowelGroups = lemma.match(/[aeiouy]+/g)?.length ?? 0
  return vowelGroups === 1 && /[^aeiouy][aeiou][^aeiouwxy]$/.test(lemma)
}

function thirdPerson(lemma: string): string {
  if (/[^aeiou]y$/.test(lemma)) return `${lemma.slice(0, -1)}ies`
  if (/z$/.test(lemma) && !/zz$/.test(lemma)) return `${lemma}zes`
  if (/(?:do|go|echo|embargo|torpedo|veto)$/.test(lemma)) return `${lemma}es`
  if (/(?:s|sh|ch|x|zz)$/.test(lemma)) return `${lemma}es`
  return `${lemma}s`
}

function regularPast(lemma: string): string {
  if (lemma.endsWith('e')) return `${lemma}d`
  if (/[^aeiou]y$/.test(lemma)) return `${lemma.slice(0, -1)}ied`
  if (FINAL_C_TAKES_K_VERBS.has(lemma)) return `${lemma}ked`
  if (/z$/.test(lemma) && !/zz$/.test(lemma)) return `${lemma}zed`
  if (doubledFinalConsonant(lemma)) return `${lemma}${lemma.at(-1)}ed`
  return `${lemma}ed`
}

function presentParticiple(lemma: string): string {
  if (lemma.endsWith('ie')) return `${lemma.slice(0, -2)}ying`
  if (FINAL_C_TAKES_K_VERBS.has(lemma)) return `${lemma}king`
  if (/z$/.test(lemma) && !/zz$/.test(lemma)) return `${lemma}zing`
  if (GERUND_KEEPS_FINAL_E_VERBS.has(lemma)) return `${lemma}ing`
  if (lemma.endsWith('e') && !lemma.endsWith('ee')) return `${lemma.slice(0, -1)}ing`
  if (doubledFinalConsonant(lemma)) return `${lemma}${lemma.at(-1)}ing`
  return `${lemma}ing`
}

const INVARIANT_NOUNS = new Set([
  'advice', 'aerobics', 'aids', 'aircraft', 'athletics', 'badminton', 'bacteria',
  'baggage', 'barracks', 'belongings', 'boxing', 'british', 'camping', 'cattle', 'chess',
  'chinese', 'climbing', 'clothes', 'clothing', 'criteria', 'customs', 'data', 'deer',
  'diabetes', 'diving', 'earnings', 'economics', 'elderly', 'equipment', 'ethics',
  'electricity', 'evidence', 'expertise', 'fishing', 'french', 'fun', 'furniture',
  'gambling', 'garbage', 'gardening', 'glasses', 'golf', 'goods', 'gymnastics', 'hardware',
  'headquarters', 'health', 'hiking', 'hockey', 'homework', 'importance', 'independence',
  'hunting', 'information', 'ironing', 'japanese', 'jeans', 'judo', 'knowledge',
  'leisure', 'luck', 'luggage', 'lyrics', 'machinery', 'malaria', 'mathematics', 'means',
  'media', 'merchandise', 'music', 'mutton', 'news', 'offspring', 'pants', 'peace', 'people',
  'personnel', 'physics', 'pneumonia', 'police', 'politics', 'pollution', 'poverty',
  'premises', 'prevention', 'progress', 'publicity', 'research', 'rubbish', 'rugby', 'safety',
  'salmon', 'scissors', 'series', 'sheep', 'shopping', 'shorts', 'soccer', 'sodium',
  'software', 'spanish', 'species', 'statistics', 'sunglasses', 'surroundings', 'swimming',
  'tennis', 'thanks', 'traffic', 'trousers', 'tuberculosis', 'unemployed', 'walking',
  'violence', 'weather', 'applause', 'cash', 'engineering', 'shoplifting', 'drinking',
  'accounting', 'fighting', 'overwork',
])

const IRREGULAR_NOUN_PLURALS: Readonly<Record<string, string>> = {
  addendum: 'addenda', alga: 'algae', alumnus: 'alumni', analysis: 'analyses',
  appendix: 'appendices', axis: 'axes', bacterium: 'bacteria', basis: 'bases',
  barman: 'barmen', calf: 'calves', cactus: 'cacti', chairman: 'chairmen',
  child: 'children', craftsman: 'craftsmen', corpus: 'corpora',
  criterion: 'criteria', crisis: 'crises', curriculum: 'curricula', datum: 'data',
  diagnosis: 'diagnoses', die: 'dice', ellipsis: 'ellipses', foot: 'feet',
  fisherman: 'fishermen', freshman: 'freshmen', gentleman: 'gentlemen',
  formula: 'formulas', fungus: 'fungi', genus: 'genera', goose: 'geese',
  grandchild: 'grandchildren',
  half: 'halves', hero: 'heroes', hoof: 'hooves', housewife: 'housewives',
  hypothesis: 'hypotheses', knife: 'knives', larva: 'larvae', leaf: 'leaves',
  life: 'lives', loaf: 'loaves', louse: 'lice', man: 'men', matrix: 'matrices',
  medium: 'media', memorandum: 'memoranda', mouse: 'mice', nucleus: 'nuclei',
  oasis: 'oases', octopus: 'octopuses', ox: 'oxen', parenthesis: 'parentheses',
  person: 'people', phenomenon: 'phenomena', policeman: 'policemen',
  policewoman: 'policewomen', potato: 'potatoes', radius: 'radii', july: 'julys',
  paralysis: 'paralyses', scarf: 'scarves', self: 'selves', shelf: 'shelves',
  soliloquy: 'soliloquies', stimulus: 'stimuli', stomach: 'stomachs', syllabus: 'syllabi',
  synthesis: 'syntheses', thesis: 'theses', thief: 'thieves', tooth: 'teeth',
  tomato: 'tomatoes', vertex: 'vertices', wife: 'wives', wolf: 'wolves',
  spokesman: 'spokesmen', statesman: 'statesmen', woman: 'women', workman: 'workmen',
}

function plural(lemma: string): string {
  if (INVARIANT_NOUNS.has(lemma)) return lemma
  if (IRREGULAR_NOUN_PLURALS[lemma]) return IRREGULAR_NOUN_PLURALS[lemma]
  if (/[^aeiou]y$/.test(lemma)) return `${lemma.slice(0, -1)}ies`
  if (/z$/.test(lemma) && !/zz$/.test(lemma)) return `${lemma}zes`
  if (/(?:s|sh|ch|x|zz)$/.test(lemma)) return `${lemma}es`
  return `${lemma}s`
}

function matchingSourceMorphology(
  lemma: string,
  morphology: KoreanMorphology | undefined,
): KoreanMorphology | undefined {
  return morphology?.lemma === lemma ? morphology : undefined
}

function appendVariants(
  forms: Record<string, string>,
  keyPrefix: 'past' | 'pastParticiple',
  values: readonly string[],
): void {
  const usedValues = new Set(Object.entries(forms)
    .filter(([key]) => key === keyPrefix || key.startsWith(`${keyPrefix}Variant`))
    .map(([, value]) => value))
  let variant = 1
  for (const value of values) {
    if (usedValues.has(value)) continue
    const key = `${keyPrefix}Variant${variant === 1 ? '' : variant}`
    forms[key] = value
    usedValues.add(value)
    variant += 1
  }
}

export function formsFor(
  lemma: string,
  partOfSpeech: string,
  morphology?: KoreanMorphology,
): WordForms {
  const sourceMorphology = matchingSourceMorphology(lemma, morphology)
  if (partOfSpeech === 'verb') {
    if (MODAL_VERBS.has(lemma)) {
      const reviewedVariants = new Set(REVIEWED_MODAL_VARIANTS[lemma] ?? [])
      return [...new Set([
        lemma,
        ...(sourceMorphology?.past ?? []).filter((form) => reviewedVariants.has(form)),
        ...(sourceMorphology?.pastParticiple ?? []).filter((form) => reviewedVariants.has(form)),
      ])]
    }
    if (lemma === 'be') {
      const forms: Record<string, string> = {
        base: 'be', firstPerson: 'am', s3: 'is', presentPlural: 'are',
        past: 'was', pastPlural: 'were', participle: 'being', pastParticiple: 'been',
      }
      appendVariants(forms, 'past', sourceMorphology?.past ?? [])
      appendVariants(forms, 'pastParticiple', sourceMorphology?.pastParticiple ?? [])
      return forms
    }
    const irregular = IRREGULAR_VERBS[lemma]
    const regularPastForm = regularPast(lemma)
    const [s3, fallbackPast, participle, fallbackPastParticiple] = irregular ?? [
      thirdPerson(lemma),
      regularPastForm,
      presentParticiple(lemma),
      regularPastForm,
    ]
    const reviewedVariants = IRREGULAR_VERB_VARIANTS[lemma] ?? {}
    const reviewedPast = Object.entries(reviewedVariants)
      .filter(([key]) => key.startsWith('pastVariant'))
      .map(([, value]) => value)
    const reviewedPastParticiples = Object.entries(reviewedVariants)
      .filter(([key]) => key.startsWith('pastParticipleVariant'))
      .map(([, value]) => value)
    const pastValues = [...new Set([
      ...(sourceMorphology?.past?.length ? sourceMorphology.past : [fallbackPast]),
      ...reviewedPast,
    ])]
    const pastParticipleValues = [...new Set([
      ...(sourceMorphology?.pastParticiple?.length
        ? sourceMorphology.pastParticiple
        : [fallbackPastParticiple]),
      ...reviewedPastParticiples,
    ])]
    const forms: Record<string, string> = {
      base: lemma,
      s3,
      past: pastValues[0]!,
      participle,
      pastParticiple: pastParticipleValues[0]!,
    }
    appendVariants(forms, 'past', pastValues.slice(1))
    appendVariants(forms, 'pastParticiple', pastParticipleValues.slice(1))
    return forms
  }
  if (partOfSpeech === 'noun') {
    if (INVARIANT_NOUNS.has(lemma)) return [lemma]
    const reviewedPlural = IRREGULAR_NOUN_PLURALS[lemma]
    if (reviewedPlural) {
      const reviewedVariants = lemma === 'person' ? ['people', 'persons'] : [reviewedPlural]
      return [...new Set([lemma, ...reviewedVariants])]
    }
    return sourceMorphology?.plurals?.length
      ? [...new Set([lemma, ...sourceMorphology.plurals])]
      : [lemma, plural(lemma)]
  }
  // Comparative and superlative acceptability is lexical, not a safe length rule
  // (for example, "unique" must not become "uniquer"). Keep the verified lemma
  // unless an editorial source supplies additional adjective forms.
  return [lemma]
}

function requiredCoreCandidates(
  cefr: ReadonlyMap<string, CefrRecord>,
  frequency: ReadonlyMap<string, FrequencyRecord>,
  ipa: ReadonlyMap<string, string>,
): VerifiedWordCandidate[] {
  return REQUIRED_CORE_WORDS.map((anchor) => {
    const cefrRecord = cefr.get(anchor.lemma)
    const frequencyRecord = frequency.get(anchor.lemma)
    const pronunciation = ipa.get(anchor.lemma)
    if (!cefrRecord || !frequencyRecord || !pronunciation) {
      throw new Error(`Required core word ${anchor.lemma} is missing pinned source evidence`)
    }

    const sourcePartOfSpeech = normalizedPartOfSpeech(
      cefrRecord.partOfSpeech,
      frequencyRecord.partOfSpeech,
    )
    if (sourcePartOfSpeech !== anchor.partOfSpeech) {
      throw new Error(
        `Required core word ${anchor.lemma} expected ${anchor.partOfSpeech}; `
          + `pinned sources resolve to ${sourcePartOfSpeech}`,
      )
    }

    return {
      lemma: anchor.lemma,
      cefr: cefrRecord,
      frequency: frequencyRecord,
      sourcePartOfSpeech,
      entries: [{
        partOfSpeechResolution: 'editorial-core-anchor',
        partOfSpeech: anchor.partOfSpeech,
        meanings: [...anchor.meanings],
        ipa: pronunciation,
        forms: formsFor(anchor.lemma, anchor.partOfSpeech),
        examples: anchor.examples.map((sentence) => ({
          sentence,
          line: 0,
          partOfSpeechMatch: true,
        })),
      }],
    }
  })
}

export function matchingKoreanEntry<T extends { partOfSpeech: string }>(
  entries: readonly T[],
  sourcePartOfSpeech: string,
): T | undefined {
  return entries.find((entry) => entry.partOfSpeech === sourcePartOfSpeech)
}

const UNSUITABLE_ALTERNATE_SENSE =
  /(?:알파벳|고유\s*명사|남자\s*이름|여자\s*이름|도량형|로마자|약어|두문자|줄임말|머리글자|기호|미국(?:\s|$|[.,;])|과거(?:형|분사)|given name)/i

// Korean Wiktionary currently mislabels this small audited subset. Both pinned
// CEFR/frequency sources agree on the override POS and the source gloss itself
// matches that use, so normalize only these reviewed pages. Words outside this
// registry keep the dictionary POS, including separate lexical noun senses.
const SOURCE_ALIGNED_PART_OF_SPEECH_OVERRIDES: Readonly<Record<string, string>> = {
  anything: 'pronoun',
  everybody: 'pronoun',
  everything: 'pronoun',
  reveal: 'verb',
  some: 'pronoun',
  something: 'pronoun',
  tone: 'noun',
}

export function resolveKoreanEntry<T extends { partOfSpeech: string; meanings: readonly string[] }>(
  entries: readonly T[],
  sourcePartOfSpeech: string,
): { entry: T; resolution: PrimaryWiktionaryResolution } | undefined {
  const exact = matchingKoreanEntry(entries, sourcePartOfSpeech)
  if (exact) return { entry: exact, resolution: 'exact-source-sense' }

  const alternate = entries.find((entry) =>
    entry.partOfSpeech !== 'other'
    && entry.meanings.some((meaning) =>
      /[가-힣]/.test(meaning) && !UNSUITABLE_ALTERNATE_SENSE.test(meaning)))
  return alternate
    ? { entry: alternate, resolution: 'alternate-wiktionary-sense' }
    : undefined
}

interface ResolvedKoreanEntry {
  partOfSpeech: string
  meanings: string[]
  resolution: Exclude<PartOfSpeechResolution, 'editorial-core-anchor'>
  morphology?: KoreanMorphology
  omwSynsetIds?: string[]
}

function mergeSourceMorphology(
  current: KoreanMorphology | undefined,
  incoming: KoreanMorphology,
): KoreanMorphology {
  if (!current || current.lemma !== incoming.lemma) return incoming
  const union = (left: readonly string[] | undefined, right: readonly string[] | undefined) =>
    [...new Set([...(left ?? []), ...(right ?? [])])]
  const past = union(current.past, incoming.past)
  const pastParticiple = union(current.pastParticiple, incoming.pastParticiple)
  const plurals = union(current.plurals, incoming.plurals)
  return {
    lemma: current.lemma,
    ...(past.length > 0 ? { past } : {}),
    ...(pastParticiple.length > 0 ? { pastParticiple } : {}),
    ...(plurals.length > 0 ? { plurals } : {}),
  }
}

/**
 * Preserves one reviewed entry per distinct Wiktionary POS. The source-aligned
 * sense stays first so level selection remains compatible with the previous
 * one-entry catalog; additional POS entries are explicit rather than silently
 * replacing that primary sense.
 */
export function resolveKoreanEntries<T extends {
  partOfSpeech: string
  meanings: readonly string[]
  morphology?: KoreanMorphology
}>(
  entries: readonly T[],
  sourcePartOfSpeech: string,
  lemma?: string,
): ResolvedKoreanEntry[] {
  const cleanedEntries: Array<T & { meanings: string[] }> = entries.flatMap((entry) => {
    const meanings = entry.meanings
      .map(cleanMeaning)
      .filter((meaning): meaning is string => Boolean(meaning))
      .filter((meaning) => !isInflectionCrossReference(meaning))
    if (meanings.length === 0) return []
    return [{ ...entry, meanings }]
  })
  const editorialPartOfSpeechOverrideApplied = Boolean(
    lemma
    && SOURCE_ALIGNED_PART_OF_SPEECH_OVERRIDES[lemma] === sourcePartOfSpeech
    && !cleanedEntries.some((entry) => entry.partOfSpeech === sourcePartOfSpeech),
  )
  const lexicalEntries = cleanedEntries.map((entry) => ({
    ...entry,
    partOfSpeech: editorialPartOfSpeechOverrideApplied
      ? sourcePartOfSpeech
      : entry.partOfSpeech,
  }))
  const primary = resolveKoreanEntry(lexicalEntries, sourcePartOfSpeech)
  if (!primary) return []

  const meaningGroupsByPartOfSpeech = new Map<string, string[][]>()
  const morphologyByPartOfSpeech = new Map<string, KoreanMorphology>()
  for (const entry of lexicalEntries) {
    if (entry.partOfSpeech === 'other') continue
    const meanings = entry.meanings
      .filter((meaning) =>
        entry.partOfSpeech === sourcePartOfSpeech || !UNSUITABLE_ALTERNATE_SENSE.test(meaning))
    if (meanings.length === 0) continue
    const groups = meaningGroupsByPartOfSpeech.get(entry.partOfSpeech) ?? []
    groups.push([...new Set(meanings)])
    meaningGroupsByPartOfSpeech.set(entry.partOfSpeech, groups)
    if (entry.morphology && (!lemma || entry.morphology.lemma === lemma)) {
      morphologyByPartOfSpeech.set(
        entry.partOfSpeech,
        mergeSourceMorphology(morphologyByPartOfSpeech.get(entry.partOfSpeech), entry.morphology),
      )
    }
  }

  const meaningsByPartOfSpeech = new Map<string, string[]>(
    [...meaningGroupsByPartOfSpeech].map(([partOfSpeech, groups]) => {
      const selected: string[] = []
      const maximumGroupLength = Math.max(...groups.map((group) => group.length))
      for (let position = 0; position < maximumGroupLength && selected.length < 4; position += 1) {
        for (const group of groups) {
          const meaning = group[position]
          if (meaning && !selected.includes(meaning)) selected.push(meaning)
          if (selected.length === 4) break
        }
      }
      return [partOfSpeech, selected] as const
    }),
  )

  const primaryMeanings = meaningsByPartOfSpeech.get(primary.entry.partOfSpeech)
  if (!primaryMeanings) return []
  const resolved: ResolvedKoreanEntry[] = [{
    partOfSpeech: primary.entry.partOfSpeech,
    meanings: primaryMeanings,
    resolution: editorialPartOfSpeechOverrideApplied
      ? 'editorial-source-pos-override'
      : primary.resolution,
    ...(morphologyByPartOfSpeech.has(primary.entry.partOfSpeech)
      ? { morphology: morphologyByPartOfSpeech.get(primary.entry.partOfSpeech)! }
      : {}),
  }]
  for (const [partOfSpeech, meanings] of meaningsByPartOfSpeech) {
    if (partOfSpeech === primary.entry.partOfSpeech) continue
    resolved.push({
      partOfSpeech,
      meanings,
      resolution: 'additional-wiktionary-sense',
      ...(morphologyByPartOfSpeech.has(partOfSpeech)
        ? { morphology: morphologyByPartOfSpeech.get(partOfSpeech)! }
        : {}),
    })
  }
  return resolved
}

interface SourceAlignedKoreanResolution {
  sourcePartOfSpeech: string
  entries: ResolvedKoreanEntry[]
  cefr?: CefrRecord
  frequency?: FrequencyRecord
}

/**
 * Joins every pinned source POS to the dictionary before choosing a level.
 * This avoids assigning an A1 noun row to a catalog entry whose only verified
 * dictionary sense is an A2 verb merely because that noun row appeared first.
 */
export function resolveSourceAlignedKoreanEntries<T extends {
  partOfSpeech: string
  meanings: readonly string[]
  morphology?: KoreanMorphology
}>(
  lemma: string,
  entries: readonly T[],
  cefrEvidence: readonly CefrRecord[],
  frequencyEvidence: readonly FrequencyRecord[],
): SourceAlignedKoreanResolution | undefined {
  const partsOfSpeech = new Set<string>()
  cefrEvidence.forEach((record) =>
    partsOfSpeech.add(normalizedPartOfSpeech(record.partOfSpeech, undefined)))
  frequencyEvidence.forEach((record) =>
    partsOfSpeech.add(normalizedPartOfSpeech(undefined, record.partOfSpeech)))

  const evaluated = [...partsOfSpeech].flatMap((sourcePartOfSpeech) => {
    const resolved = resolveKoreanEntries(entries, sourcePartOfSpeech, lemma)
    if (resolved.length === 0) return []
    const cefr = cefrEvidence
      .filter((record) =>
        normalizedPartOfSpeech(record.partOfSpeech, undefined) === sourcePartOfSpeech)
      .sort((left, right) =>
        CEFR_ORDER[left.level] - CEFR_ORDER[right.level] || left.line - right.line)[0]
    const frequency = frequencyEvidence
      .filter((record) =>
        normalizedPartOfSpeech(undefined, record.partOfSpeech) === sourcePartOfSpeech)
      .sort((left, right) => left.rank - right.rank || left.line - right.line)[0]
    return [{ sourcePartOfSpeech, entries: resolved, ...(cefr ? { cefr } : {}), ...(frequency ? { frequency } : {}) }]
  })
  if (evaluated.length === 0) return undefined

  const compareSourceEvidence = (
    left: SourceAlignedKoreanResolution,
    right: SourceAlignedKoreanResolution,
  ) => (left.cefr ? CEFR_ORDER[left.cefr.level] : 4)
    - (right.cefr ? CEFR_ORDER[right.cefr.level] : 4)
    || (left.frequency?.rank ?? 10_000) - (right.frequency?.rank ?? 10_000)
    || left.sourcePartOfSpeech.localeCompare(right.sourcePartOfSpeech)
  const exact = evaluated
    .filter((candidate) => (
      candidate.entries[0]?.resolution === 'exact-source-sense'
      || candidate.entries[0]?.resolution === 'editorial-source-pos-override'
    ))
    .sort(compareSourceEvidence)[0]
  if (exact) return exact

  const fallbackPartOfSpeech = normalizedPartOfSpeech(
    [...cefrEvidence].sort((left, right) =>
      CEFR_ORDER[left.level] - CEFR_ORDER[right.level] || left.line - right.line)[0]?.partOfSpeech,
    [...frequencyEvidence].sort((left, right) =>
      left.rank - right.rank || left.line - right.line)[0]?.partOfSpeech,
  )
  return evaluated.find(({ sourcePartOfSpeech }) => sourcePartOfSpeech === fallbackPartOfSpeech)
    ?? [...evaluated].sort(compareSourceEvidence)[0]
}

export function resolveOmwBilingualEntries(
  entries: readonly OmwBilingualEntry[],
  cefrEvidence: readonly CefrRecord[],
  frequencyEvidence: readonly FrequencyRecord[],
): SourceAlignedKoreanResolution | undefined {
  const entriesByPartOfSpeech = new Map<string, OmwBilingualEntry>(
    entries.map((entry) => [entry.partOfSpeech, entry]),
  )
  const evidencedPartsOfSpeech = [
    ...[...cefrEvidence]
      .sort((left, right) => CEFR_ORDER[left.level] - CEFR_ORDER[right.level] || left.line - right.line)
      .map((record) => normalizedPartOfSpeech(record.partOfSpeech, undefined)),
    ...[...frequencyEvidence]
      .sort((left, right) => left.rank - right.rank || left.line - right.line)
      .map((record) => normalizedPartOfSpeech(undefined, record.partOfSpeech)),
  ]
  const priority = ['noun', 'verb', 'adjective', 'adverb'] as const
  const sourcePartOfSpeech = evidencedPartsOfSpeech.find((partOfSpeech) =>
    entriesByPartOfSpeech.has(partOfSpeech))
    ?? priority.find((partOfSpeech) => entriesByPartOfSpeech.has(partOfSpeech))
  if (!sourcePartOfSpeech) return undefined

  const ordered = [
    entriesByPartOfSpeech.get(sourcePartOfSpeech)!,
    ...entries.filter(({ partOfSpeech }) => partOfSpeech !== sourcePartOfSpeech),
  ]
  const cefr = cefrEvidence.find((record) =>
    normalizedPartOfSpeech(record.partOfSpeech, undefined) === sourcePartOfSpeech)
  const frequency = frequencyEvidence.find((record) =>
    normalizedPartOfSpeech(undefined, record.partOfSpeech) === sourcePartOfSpeech)
  return {
    sourcePartOfSpeech,
    entries: ordered.map((entry) => ({
      partOfSpeech: entry.partOfSpeech,
      meanings: [...entry.meanings],
      resolution: 'omw-bilingual-synset',
      omwSynsetIds: [...entry.synsetIds],
    })),
    ...(cefr ? { cefr } : {}),
    ...(frequency ? { frequency } : {}),
  }
}

function cleanMeaning(value: string): string | undefined {
  const cleaned = value
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/[.;]?\s*(?:thumb|thumbnail)(?:\|\d+px)?\|.*$/i, '')
    .replace(/〔\s*〕/g, '')
    .replace(/\s*\|\s*/g, ' 또는 ')
    .replace(/\s+/g, ' ')
    .replace(/^\d+[.)]\s*/, '')
    .trim()
    .replace(/^=\s*/, '')
    .replace(/^[:;,.·\-–—]+\s*/, '')
    .trim()
  return cleaned && /[가-힣]/.test(cleaned) ? cleaned.slice(0, 240) : undefined
}

export function isInflectionCrossReference(meaning: string): boolean {
  const match = meaning.trim().replace(/[.]$/, '').match(
    /^(?:\([^)]*\)\s*)?(?:동사\s+)?['"]?[a-z]+['"]?(?:\s*\([^)]*\))?\s*(?:(?:동사)?의)?\s+(.+)$/i,
  )
  if (!match) return false
  const remainder = match[1]!
  if (!/(?:동명사|분사|진행형|과거|현재|복수형|원형|부정사|활용형)/.test(remainder)) {
    return false
  }
  const residue = remainder
    .replace(/\([^)]*\)/g, '')
    .replace(
      /(?:현재\s*진행형|현재\s*완료형|과거\s*완료형|동명사형?|현재분사형?|과거분사형?|복수형|부정사형?|활용형|[123]\s*인칭|일인칭|이인칭|삼인칭|인칭|모든|단수|복수|단순|직설법|가정법|접속법|명령법|현재형?|과거형?|미래형?|원형|시제|형태|동사)/g,
      '',
    )
    .replace(/(?:및|또는|혹은|과|와|의|,|\/|\s)/g, '')
  return residue.length === 0
}

const BLOCKED_CATALOG_LEMMAS = new Set([
  'ass', 'bitch', 'bomb', 'bomber', 'bombing', 'cocaine', 'condom', 'cunt', 'damn',
  'ecstasy',
  'execution', 'fuck', 'gun', 'heroin', 'intercourse', 'kill', 'killer', 'killing',
  'marijuana', 'massacre', 'masturbate', 'masturbation', 'methamphetamine', 'murder',
  'murderer', 'naked', 'nude', 'opium', 'orgasm', 'penis', 'piss', 'porn',
  'pornography', 'prostitute', 'prostitution', 'rape', 'rapist', 'sex', 'sexual',
  'sexy', 'shoot', 'shooting', 'shot', 'shit', 'suicide', 'suicidal', 'terrorist', 'torture',
  'vagina',
])

const BLOCKED_CATALOG_LEMMA_PATTERNS = [
  /^(?:bomb(?:ed|er|ers|ing|ings|s)?|gun(?:s)?|kill(?:ed|er|ers|ing|ings|s)?|murder(?:ed|er|ers|ing|s)?|rap(?:e|ed|es|ing|ist|ists)|shoot(?:er|ers|ing|ings|s)?|shot(?:s)?|stabb?(?:ed|er|ers|ing|ings|s)?)$/i,
] as const

// These source rows are surface inflections, not independent lexical lemmas.
// `running` is excluded because its pinned Korean page contains only an
// inflection cross-reference and a cross-POS gloss, not a verified noun sense.
const NON_LEXICAL_INFLECTION_LEMMAS = new Set([
  'am', 'are', 'been', 'had', 'is', 'running', 'was', 'were',
])

const UNSAFE_EXAMPLE = [
  /\b(?:\w*fuck\w*|shit(?:ty|s)?|bitch(?:es)?|cunts?|nigg(?:er|a)s?|trann(?:y|ies)|damn(?:ed)?|piss(?:ed|ing)?)\b/i,
  /\b(?:anal sex|blowjobs?|child sex|ejaculat\w*|fetish\w*|intercourse|masturbat\w*|orgasm\w*|penis|porn(?:ography)?|prostitut\w*|rape\w*|sex(?:ual(?:ity)?)?|sexy|striptease|vagina|virginity)\b/i,
  /\b(?:cocaine|drugs?|drugg(?:ed|ing)|drug dealer|ecstasy|heroin|marijuana|methadone|methamphetamine|opioid|opium|overdose|rohypnol)\b/i,
  /\b(?:self[- ]harm|suicid\w*|genocid\w*|massacre\w*|murder\w*|serial killer|tortur\w*)\b/i,
  /\b(?:blood\w*|bomb\w*|bullets?|child trafficking|death sentence|execute protesters|guns?|kill(?:ed|ing|s)?|lynch\w*|rifles?|shoot\w*|shots?|stabb?\w*|weapons?)\b/i,
  /\b(?:anti-intellectualism|butthole|crap|misogyn\w*|poop\w*|topless|ugly witch)\b/i,
  /\b(?:tone down (?:his|her|their|your) gayness|(?:hate|hates|hated|hating) (?:bisexual|gay|homosexual|lesbian|transgender) (?:people|persons?)|(?:bisexual|gay|homosexual|lesbian|transgender) (?:people|persons?) (?:are|were) (?:abnormal|disgusting|inferior|sick)|people with depression (?:are|were) (?:dangerous|lazy|weak))\b/i,
  /\b(?:alcohol|beer|booze|bourbon|brandy|champagne|cigarettes?|cigars?|dope|drunk|ecstasy|gin|lager|liquor|nicotine|rohypnol|rum|stoned|tobacco|vape|vodka|whisk(?:e)?y|wine)\b/i,
  /\b(?:killer|naked|terrorist)\b/i,
  /\b(?:death and destruction|death of (?:a |the )?(?:baby|child)|drink wet cement|rail me|strip(?:ped|ping)? naked)\b/i,
  /\b(?:baby|boy|child|father|girl|husband|man|mother|person|wife|woman)\s+died\b/i,
  /\b(?:Dick|Fadil|Layla|Mary|Tom|Yanni|Ziri)\s+died\b/i,
] as const

export function isBlockedCatalogLemma(lemma: string): boolean {
  const normalized = lemma.trim().toLowerCase()
  return BLOCKED_CATALOG_LEMMAS.has(normalized)
    || NON_LEXICAL_INFLECTION_LEMMAS.has(normalized)
    || BLOCKED_CATALOG_LEMMA_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function isLearnerSafeExample(sentence: string): boolean {
  const trimmed = sentence.trim()
  const safetyText = trimmed
    .replace(/\bkill(?:ed|ing|s)? time\b/gi, 'spend time')
    .replace(/\bnaked eye\b/gi, 'unaided eye')
  return trimmed.length > 0
    && trimmed.length <= 120
    && /^[A-Z\d]/.test(trimmed)
    && /[.!?]$/.test(trimmed)
    && !UNSAFE_EXAMPLE.some((pattern) => pattern.test(safetyText))
}

export function isSuitableExample(sentence: string): boolean {
  return sentence.trim().length >= 12 && isLearnerSafeExample(sentence)
}

function exampleQuality(example: ExampleRecord): number {
  const { sentence } = example
  const tokenCount = sentence.match(/[a-z]+(?:'[a-z]+)?/gi)?.length ?? 0
  const lengthPenalty = Math.abs(sentence.length - 36)
  const complexityPenalty = Math.max(0, tokenCount - 10) * 10
  const punctuationPenalty = (sentence.match(/[:;—“”]/g)?.length ?? 0) * 12
  const sourceNamePenalty = (sentence.match(
    /\b(?:Algeria|Biden|Fadil|Iran|Israel|Kabyl\w*|Layla|NATO|Putin|Russia|Skura|Trump|Ukraine|Yanni)\b/g,
  )?.length ?? 0) * 20
  const partOfSpeechPenalty = example.partOfSpeechMatch ? 0 : 500
  return lengthPenalty + complexityPenalty + punctuationPenalty + sourceNamePenalty + partOfSpeechPenalty
}

function compareExamples(left: ExampleRecord, right: ExampleRecord): number {
  return exampleQuality(left) - exampleQuality(right)
    || left.sentence.localeCompare(right.sentence)
    || left.line - right.line
}

function exampleTokens(sentence: string): Set<string> {
  return new Set(sentence.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [])
}

const PART_OF_SPEECH_TAGS: Readonly<Record<string, readonly string[]>> = {
  adjective: ['Adjective'],
  adverb: ['Adverb'],
  conjunction: ['Conjunction'],
  determiner: ['Determiner'],
  infinitiveMarker: ['Infinitive'],
  interjection: ['Expression'],
  noun: ['Noun'],
  numeral: ['Value'],
  preposition: ['Preposition'],
  pronoun: ['Pronoun'],
  verb: ['Verb'],
}

const SPECIALIZED_PART_OF_SPEECH_TAGS: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = {
  adverb: {
    never: ['Negative'],
    not: ['Negative'],
    there: ['Noun'],
  },
  conjunction: {
    lest: ['Condition'],
    unless: ['Condition'],
  },
  pronoun: Object.fromEntries([
    'anybody', 'anyone', 'anything', 'everybody', 'everyone', 'everything',
    'nobody', 'none', 'nothing', 'somebody', 'someone', 'something',
  ].map((lemma) => [lemma, ['Noun'] as const])),
}

const LEXICALIZED_INDEFINITE_NOUN_FORMS = new Set([
  'nobody', 'nobodies', 'nothing', 'nothings', 'somebody', 'somebodies',
])
const ARTICLE_DETERMINERS = new Set(['a', 'an', 'the'])
const AMBIGUOUS_CAN_DETERMINERS = new Set([
  'any', 'each', 'either', 'neither', 'some', 'that', 'these', 'this', 'those',
])
const REVIEWED_CAN_NOUN_MODIFIERS = new Set([
  'aerosol', 'aluminum', 'beer', 'coffee', 'garbage', 'gas', 'metal', 'oil', 'paint', 'soda',
  'soup', 'spray', 'tin', 'trash', 'watering',
])
const REVIEWED_INDEFINITE_NOUN_ADJECTIVES = new Set([
  'absolute', 'complete', 'famous', 'important', 'mere', 'pathetic', 'perfect', 'real', 'total',
  'virtual',
])
const REVIEWED_STAND_NOUN_MODIFIERS = new Set([
  'camera', 'coat', 'concession', 'display', 'lemonade', 'microphone', 'music', 'witness',
])
const STAND_VERB_SUBJECT_FORMS = new Set([
  'each', 'either', 'neither', 'one', 'that', 'this', 'whatever', 'which', 'who', 'whoever',
])
const REVIEWED_BAND_NOUN_MODIFIERS = new Set([
  'brass', 'college', 'grecian', 'jazz', 'marching', 'music', 'rock', 'rubber', 'school',
  'wedding',
])
const REVIEWED_BAND_NOUN_PREDICATES = new Set([
  'are', 'exist', 'form', 'formed', 'forms', 'have', 'help', 'is', 'perform', 'play', 'remain',
  'sound', 'tour', 'was', 'were',
])

interface TaggedTerm {
  normal?: string
  tags?: string[]
}

interface IndependentTaggedTerm {
  value: string
  normal: string
  pos: string
}

const independentPosTagger = new WinkPosTagger()

const INDEPENDENT_PART_OF_SPEECH_TAGS: Readonly<Record<string, readonly string[]>> = {
  adjective: ['JJ', 'JJR', 'JJS'],
  adverb: ['RB', 'RBR', 'RBS', 'RP', 'WRB'],
  conjunction: ['CC', 'IN', 'WRB'],
  determiner: ['DT', 'PDT', 'WDT'],
  infinitiveMarker: ['TO'],
  interjection: ['UH'],
  noun: ['NN', 'NNP', 'NNPS', 'NNS'],
  numeral: ['CD'],
  preposition: ['IN', 'TO'],
  pronoun: ['PRP', 'PRP$', 'WP', 'WP$'],
  verb: ['MD', 'VB', 'VBD', 'VBG', 'VBN', 'VBP', 'VBZ'],
}

function hasAnyTag(term: TaggedTerm | undefined, tags: readonly string[]): boolean {
  return Boolean(term?.tags?.some((tag) => tags.includes(tag)))
}

function adjacentDeterminer(
  terms: readonly TaggedTerm[],
  index: number,
): TaggedTerm | undefined {
  let cursor = index - 1
  while (cursor >= 0 && hasAnyTag(terms[cursor], ['Adjective'])) cursor -= 1
  const candidate = terms[cursor]
  return hasAnyTag(candidate, ['Determiner', 'Possessive']) ? candidate : undefined
}

function isStrongNounDeterminer(term: TaggedTerm | undefined): boolean {
  return hasAnyTag(term, ['Possessive']) || ARTICLE_DETERMINERS.has(term?.normal ?? '')
}

function isPluralQuantity(term: TaggedTerm | undefined): boolean {
  return hasAnyTag(term, ['Value']) && !['1', 'one'].includes(term?.normal ?? '')
}

function nextMeaningfulTermIndex(terms: readonly TaggedTerm[], index: number): number {
  let nextIndex = index + 1
  while (hasAnyTag(terms[nextIndex], ['Adverb', 'Negative'])) nextIndex += 1
  return nextIndex
}

function isInfinitiveVerb(term: TaggedTerm | undefined): boolean {
  return hasAnyTag(term, ['Verb']) && hasAnyTag(term, ['Infinitive'])
}

function isCommonNoun(term: TaggedTerm | undefined): boolean {
  return hasAnyTag(term, ['Noun'])
    && !hasAnyTag(term, ['Pronoun', 'ProperNoun', 'Person', 'Actor', 'Acronym'])
}

function hasLexicalIndefiniteNounContext(
  terms: readonly TaggedTerm[],
  index: number,
): boolean {
  if (hasAnyTag(terms[index], ['Plural'])) return true
  const previous = terms[index - 1]
  if (isStrongNounDeterminer(previous)) return true
  return REVIEWED_INDEFINITE_NOUN_ADJECTIVES.has(previous?.normal ?? '')
    && isStrongNounDeterminer(terms[index - 2])
}

function isStrongModalCanContext(terms: readonly TaggedTerm[], index: number): boolean {
  const nextIndex = nextMeaningfulTermIndex(terms, index)
  if (isInfinitiveVerb(terms[nextIndex])) return true

  if (index === 0 && (
    hasAnyTag(terms[1], [
      'Noun', 'Pronoun', 'ProperNoun', 'Person', 'Actor', 'Acronym', 'Determiner', 'There',
    ]) || terms[1]?.normal === 'there'
  )) {
    return terms.slice(2).some((term) => isInfinitiveVerb(term))
  }

  if (index === terms.length - 1) {
    return hasAnyTag(terms[index - 1], ['Pronoun', 'ProperNoun', 'Person', 'Actor', 'Acronym'])
  }
  return false
}

function hasStandModifierDeterminer(
  terms: readonly TaggedTerm[],
  index: number,
): boolean {
  let cursor = index - 1
  let sawModifier = false
  while (cursor >= 0 && hasAnyTag(terms[cursor], ['Adjective', 'PastTense'])) {
    sawModifier = true
    cursor -= 1
  }
  return sawModifier && (
    isStrongNounDeterminer(terms[cursor]) || isPluralQuantity(terms[cursor])
  )
}

function matchStandSurface(
  terms: readonly TaggedTerm[],
  index: number,
  partOfSpeech: string,
): boolean | undefined {
  if (partOfSpeech !== 'noun' && partOfSpeech !== 'verb') return undefined
  const term = terms[index]
  const previous = terms[index - 1]
  const previousPrevious = terms[index - 2]
  const next = terms[index + 1]

  const hasReviewedNounModifier = REVIEWED_STAND_NOUN_MODIFIERS.has(previous?.normal ?? '')
  const hasReviewedCompoundContext = hasReviewedNounModifier && (
    isStrongNounDeterminer(adjacentDeterminer(terms, index - 1))
    || isPluralQuantity(terms[index - 2])
    || terms.slice(0, Math.max(0, index - 1)).some((candidate) =>
      hasAnyTag(candidate, ['Verb']))
  )
  const hasStrongNounLeft = hasReviewedCompoundContext
    || isStrongNounDeterminer(previous)
    || isPluralQuantity(previous)
    || ['these', 'those'].includes(previous?.normal ?? '')
    || hasStandModifierDeterminer(terms, index)
  const hasEarlierPredicate = terms.slice(0, Math.max(0, index - 1))
    .some((candidate) => hasAnyTag(candidate, ['Verb']))
  const hasFollowingPredicate = hasAnyTag(next, ['Verb', 'Auxiliary', 'Copula'])
    && !hasAnyTag(next, ['Gerund'])
  const hasObjectTail = hasEarlierPredicate
    && (!next || hasAnyTag(next, ['Preposition', 'Adjective']))
  if (hasStrongNounLeft && (hasFollowingPredicate || hasObjectTail)) {
    return partOfSpeech === 'noun'
  }

  if (hasAnyTag(term, ['Verb'])) return partOfSpeech === 'verb'
  const hasStrongVerbSubject = hasAnyTag(previous, [
    'Pronoun', 'ProperNoun', 'Person', 'Actor', 'Acronym',
  ]) || isCommonNoun(previous)
    || ['also', 'always', 'now', 'still'].includes(previous?.normal ?? '')
    || STAND_VERB_SUBJECT_FORMS.has(previous?.normal ?? '')
    || (
      hasAnyTag(previous, ['PastTense'])
      && hasAnyTag(previousPrevious, ['Determiner'])
    ) || hasStandModifierDeterminer(terms, index)
  if (hasStrongVerbSubject) return partOfSpeech === 'verb'

  // Compromise sometimes labels ambiguous "stands" as a plural noun. Without
  // strong local evidence, rejecting the candidate is safer than fabricating
  // either noun or verb provenance.
  return false
}

function matchBandSurface(
  terms: readonly TaggedTerm[],
  index: number,
  partOfSpeech: string,
): boolean | undefined {
  if (partOfSpeech !== 'noun' && partOfSpeech !== 'verb') return undefined
  const term = terms[index]
  const previous = terms[index - 1]
  const previousPrevious = terms[index - 2]
  const next = terms[index + 1]
  const hasReviewedNounModifier = REVIEWED_BAND_NOUN_MODIFIERS.has(previous?.normal ?? '')
  const hasNounContinuation = !next
    || hasAnyTag(next, ['Preposition', 'Verb', 'Auxiliary', 'Copula'])
    || REVIEWED_BAND_NOUN_PREDICATES.has(next.normal ?? '')
    || terms.slice(index + 1).some((candidate) => hasAnyTag(candidate, ['Verb', 'Copula']))
  if (hasReviewedNounModifier && hasNounContinuation) return partOfSpeech === 'noun'
  if (hasAnyTag(term, ['Noun'])) return partOfSpeech === 'noun'

  const hasContradictoryCompoundContext = isCommonNoun(previous) && (
    hasAnyTag(next, ['Preposition'])
    || terms.slice(index + 1).some((candidate) => hasAnyTag(candidate, ['Copula']))
    || (hasAnyTag(previousPrevious, ['Verb']) && hasNounContinuation)
  )
  if (hasContradictoryCompoundContext) return false
  if (hasAnyTag(term, ['Verb'])) return partOfSpeech === 'verb'
  return false
}

function specializedSurfaceMatch(
  terms: readonly TaggedTerm[],
  index: number,
  form: string,
  catalogLemma: string,
  partOfSpeech: string,
): boolean | undefined {
  if (catalogLemma === 'some' && form === 'some' && partOfSpeech === 'pronoun') {
    const next = terms[index + 1]
    return !next
      || next.normal === 'to'
      || hasAnyTag(next, ['Verb', 'Auxiliary', 'Copula', 'Preposition'])
  }

  if (
    LEXICALIZED_INDEFINITE_NOUN_FORMS.has(form)
    && (partOfSpeech === 'noun' || partOfSpeech === 'pronoun')
  ) {
    const lexicalNoun = hasLexicalIndefiniteNounContext(terms, index)
    return partOfSpeech === 'noun' ? lexicalNoun : !lexicalNoun
  }

  if (catalogLemma === 'can' && form === 'can'
    && (partOfSpeech === 'noun' || partOfSpeech === 'verb')) {
    const determiner = adjacentDeterminer(terms, index)
    const nextIndex = nextMeaningfulTermIndex(terms, index)
    const next = terms[nextIndex]
    const followedByInfinitive = isInfinitiveVerb(next)
    if (isStrongNounDeterminer(determiner)) return partOfSpeech === 'noun'

    const determinerNormal = determiner?.normal ?? ''
    if (AMBIGUOUS_CAN_DETERMINERS.has(determinerNormal)) {
      if (followedByInfinitive) return false
      if (hasAnyTag(next, ['Verb', 'Copula', 'PastTense'])) return partOfSpeech === 'noun'
    }

    const previous = terms[index - 1]
    const hasReviewedContainerModifier = REVIEWED_CAN_NOUN_MODIFIERS.has(previous?.normal ?? '')
      && isStrongNounDeterminer(adjacentDeterminer(terms, index - 1))
    if (hasReviewedContainerModifier && !followedByInfinitive) {
      return partOfSpeech === 'noun'
    }

    const modal = isStrongModalCanContext(terms, index)
    return partOfSpeech === 'verb' ? modal : false
  }

  if (catalogLemma === 'stand' && form === 'stands') {
    return matchStandSurface(terms, index, partOfSpeech)
  }
  if (catalogLemma === 'band' && form === 'bands') {
    return matchBandSurface(terms, index, partOfSpeech)
  }
  return undefined
}

function taggedTerms(sentence: string): TaggedTerm[] {
  return (nlp(sentence).json() as Array<{ terms?: TaggedTerm[] }>)
    .flatMap((item) => item.terms ?? [])
}

function independentTaggedTerms(sentence: string): IndependentTaggedTerm[] {
  return independentPosTagger.tagSentence(sentence).map((term) => ({
    value: term.value,
    normal: term.normal,
    pos: term.pos,
  }))
}

function isIndependentWord(term: IndependentTaggedTerm | undefined): boolean {
  return Boolean(term && /[a-z0-9]/i.test(term.value))
}

function adjacentIndependentWordIndex(
  terms: readonly IndependentTaggedTerm[],
  index: number,
  direction: -1 | 1,
): number | undefined {
  let cursor = index + direction
  while (cursor >= 0 && cursor < terms.length) {
    if (isIndependentWord(terms[cursor])) return cursor
    cursor += direction
  }
  return undefined
}

function hasHyphenBoundary(
  terms: readonly IndependentTaggedTerm[],
  index: number,
): boolean {
  return terms[index - 1]?.pos === 'HYPH' || terms[index + 1]?.pos === 'HYPH'
}

function hasQuoteBoundary(
  terms: readonly IndependentTaggedTerm[],
  index: number,
): boolean {
  return ['"', "'", '“', '”'].includes(terms[index - 1]?.value ?? '')
    || ['"', "'", '“', '”'].includes(terms[index + 1]?.value ?? '')
}

function hasIndependentPartOfSpeech(term: IndependentTaggedTerm, partOfSpeech: string): boolean {
  return (INDEPENDENT_PART_OF_SPEECH_TAGS[partOfSpeech] ?? []).includes(term.pos)
}

function adjectiveSyntaxMatches(
  terms: readonly IndependentTaggedTerm[],
  index: number,
): boolean {
  const previousIndex = adjacentIndependentWordIndex(terms, index, -1)
  const nextIndex = adjacentIndependentWordIndex(terms, index, 1)
  const previous = previousIndex === undefined ? undefined : terms[previousIndex]
  const next = nextIndex === undefined ? undefined : terms[nextIndex]
  if (next?.pos.startsWith('NN')) return true
  if (next?.pos.startsWith('JJ')) {
    const afterNextIndex = adjacentIndependentWordIndex(terms, nextIndex!, 1)
    if (afterNextIndex !== undefined && terms[afterNextIndex]?.pos.startsWith('NN')) return true
  }
  if (previous && [
    'am', 'are', 'be', 'became', 'become', 'been', 'being', 'feel', 'felt', 'is', 'look',
    'looks', 'remain', 'remained', 'seem', 'seemed', 'seems', 'sound', 'sounds', 'was', 'were',
  ].includes(previous.normal)) return true
  if (previous?.pos === 'CC' && previousIndex !== undefined) {
    const coordinatedIndex = adjacentIndependentWordIndex(terms, previousIndex, -1)
    return coordinatedIndex !== undefined && terms[coordinatedIndex]?.pos.startsWith('JJ') === true
  }
  return false
}

function prepositionSyntaxMatches(
  terms: readonly IndependentTaggedTerm[],
  index: number,
): boolean {
  const nextIndex = adjacentIndependentWordIndex(terms, index, 1)
  if (nextIndex === undefined) return false
  const nextPos = terms[nextIndex]!.pos
  return nextPos.startsWith('NN')
    || nextPos.startsWith('PRP')
    || ['CD', 'DT', 'JJ', 'JJR', 'JJS', 'PDT', 'WDT', 'WP', 'WP$'].includes(nextPos)
}

function reviewedIndependentSyntaxVeto(
  terms: readonly IndependentTaggedTerm[],
  index: number,
  catalogLemma: string,
  partOfSpeech: string,
): boolean {
  const previousIndex = adjacentIndependentWordIndex(terms, index, -1)
  const nextIndex = adjacentIndependentWordIndex(terms, index, 1)
  const previous = previousIndex === undefined ? undefined : terms[previousIndex]
  const next = nextIndex === undefined ? undefined : terms[nextIndex]

  if (partOfSpeech === 'verb') {
    if (catalogLemma === 'speed' && previous?.normal === 'to' && previousIndex !== undefined) {
      const beforeTo = adjacentIndependentWordIndex(terms, previousIndex, -1)
      if (beforeTo !== undefined && terms[beforeTo]?.normal === 'up') return true
    }
    if (catalogLemma === 'last' && previous?.normal === 'at') return true
  }

  if (partOfSpeech === 'noun') {
    if (terms[index]?.pos === 'NNP' && next?.pos.startsWith('NN')) return true
    if (catalogLemma === 'burst' && ['into', 'on', 'out'].includes(next?.normal ?? '')) return true
    if (catalogLemma === 'wait' && previous?.normal === 'that') return true
    if (catalogLemma === 'sacrifice' && previous?.normal === 'than') return true
    if (catalogLemma === 'ruin' && previous?.pos === 'DT' && next?.pos === 'PRP$') return true
  }
  return false
}

function independentTermsMatchPartOfSpeech(
  terms: readonly IndependentTaggedTerm[],
  form: string,
  partOfSpeech: string,
  catalogLemma: string,
): boolean {
  return terms.some((term, index) => {
    if (
      term.normal !== form
      || hasHyphenBoundary(terms, index)
      || hasQuoteBoundary(terms, index)
    ) return false
    if (partOfSpeech === 'interjection' && catalogLemma === 'well') {
      const previousIndex = adjacentIndependentWordIndex(terms, index, -1)
      if (previousIndex === undefined && terms[index + 1]?.value === ',') return true
    }
    if (partOfSpeech === 'adjective') {
      if (!adjectiveSyntaxMatches(terms, index)) return false
      if (hasIndependentPartOfSpeech(term, partOfSpeech)) return true
      const previousIndex = adjacentIndependentWordIndex(terms, index, -1)
      const nextIndex = adjacentIndependentWordIndex(terms, index, 1)
      const previous = previousIndex === undefined ? undefined : terms[previousIndex]
      const next = nextIndex === undefined ? undefined : terms[nextIndex]
      if (term.pos.startsWith('NN') && next?.pos.startsWith('NN')) return true
      return Boolean(previous && [
        'am', 'are', 'be', 'became', 'become', 'been', 'being', 'feel', 'felt', 'is',
        'look', 'looks', 'remain', 'remained', 'seem', 'seemed', 'seems', 'sound',
        'sounds', 'was', 'were',
      ].includes(previous.normal))
    }
    if (!hasIndependentPartOfSpeech(term, partOfSpeech)) return false
    if (partOfSpeech === 'preposition' && !prepositionSyntaxMatches(terms, index)) return false
    return !reviewedIndependentSyntaxVeto(terms, index, catalogLemma, partOfSpeech)
  })
}

function combinedTaggedTermsMatchPartOfSpeech(
  terms: readonly TaggedTerm[],
  independentTerms: readonly IndependentTaggedTerm[],
  form: string,
  partOfSpeech: string,
  catalogLemma: string,
  requireIndependentAgreement: boolean,
): boolean {
  if (!taggedTermsMatchPartOfSpeech(terms, form, partOfSpeech, catalogLemma)) return false
  if (!requireIndependentAgreement) return true
  const matchingTermIndexes = terms.flatMap((term, index) =>
    term.normal === form ? [index] : [])
  const specializedMatches = matchingTermIndexes.map((index) =>
    specializedSurfaceMatch(terms, index, form, catalogLemma, partOfSpeech))
  if (specializedMatches.some((match) => match !== undefined)) {
    return specializedMatches.some((match) => match === true)
  }
  return independentTermsMatchPartOfSpeech(
    independentTerms,
    form,
    partOfSpeech,
    catalogLemma,
  )
}

function taggedTermsMatchPartOfSpeech(
  terms: readonly TaggedTerm[],
  form: string,
  partOfSpeech: string,
  catalogLemma: string = form,
): boolean {
  if (partOfSpeech === 'infinitiveMarker') {
    return terms.some((term, index) =>
      term.normal === form
      && terms[index + 1]?.tags?.includes('Verb')
      && terms[index + 1]?.tags?.includes('Infinitive'))
  }
  const matchingTermIndexes = terms.flatMap((term, index) =>
    term.normal === form ? [index] : [])
  const specializedMatches = matchingTermIndexes.map((index) =>
    specializedSurfaceMatch(terms, index, form, catalogLemma, partOfSpeech))
  if (specializedMatches.some((match) => match !== undefined)) {
    return specializedMatches.some((match) => match === true)
  }
  const expectedTags = [
    ...(PART_OF_SPEECH_TAGS[partOfSpeech] ?? []),
    ...(SPECIALIZED_PART_OF_SPEECH_TAGS[partOfSpeech]?.[catalogLemma] ?? []),
    ...(SPECIALIZED_PART_OF_SPEECH_TAGS[partOfSpeech]?.[form] ?? []),
  ]
  return Boolean(expectedTags?.some((expectedTag) => matchingTermIndexes.some((index) =>
    terms[index]?.tags?.includes(expectedTag))))
}

export function sentenceMatchesPartOfSpeech(
  sentence: string,
  lemma: string,
  partOfSpeech: string,
): boolean {
  return sentenceFormsMatchPartOfSpeech(sentence, [lemma], partOfSpeech)
}

function hasStandaloneSurfaceForm(sentence: string, form: string): boolean {
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(?<![A-Za-z'’\u2010-\u2015-])${escaped}(?![A-Za-z'’\u2010-\u2015-])`,
    'i',
  ).test(sentence)
}

export function sentenceFormsMatchPartOfSpeech(
  sentence: string,
  forms: readonly string[],
  partOfSpeech: string,
  catalogLemma: string = forms[0] ?? '',
  requireIndependentAgreement = false,
): boolean {
  const terms = taggedTerms(sentence)
  const independentTerms = requireIndependentAgreement ? independentTaggedTerms(sentence) : []
  return forms.some((form) => {
    if (!hasStandaloneSurfaceForm(sentence, form)) return false
    return combinedTaggedTermsMatchPartOfSpeech(
      terms,
      independentTerms,
      form,
      partOfSpeech,
      catalogLemma,
      requireIndependentAgreement,
    )
  })
}

function entryExampleKey(lemma: string, partOfSpeech: string): string {
  return `${lemma}\u0000${partOfSpeech}`
}

function addRawExample(
  examples: RawExampleRecord[],
  candidate: RawExampleRecord,
): void {
  if (examples.some((example) => example.sentence === candidate.sentence)) return
  if (examples.length < EXAMPLE_CANDIDATE_LIMIT) {
    examples.push(candidate)
    return
  }

  const sameKindCount = examples.filter(({ usesInflectedForm }) =>
    usesInflectedForm === candidate.usesInflectedForm).length
  const oppositeKindCount = examples.length - sameKindCount
  const needsBalance = sameKindCount < MIN_SURFACE_KIND_CANDIDATES
  const replaceable = examples
    .map((example, index) => ({ example, index }))
    .filter(({ example }) => needsBalance
      ? example.usesInflectedForm !== candidate.usesInflectedForm
      : example.usesInflectedForm === candidate.usesInflectedForm
        || oppositeKindCount > MIN_SURFACE_KIND_CANDIDATES)
  let worst = replaceable[0]
  for (const current of replaceable.slice(1)) {
    if (worst && compareExamples(current.example, worst.example) > 0) worst = current
  }
  if (!worst) return
  if (needsBalance || compareExamples(candidate, worst.example) < 0) {
    examples[worst.index] = candidate
  }
}

function formStrings(forms: string[] | Record<string, string>): string[] {
  return Array.isArray(forms) ? forms : Object.values(forms)
}

/**
 * Resolves catalog forms to one lemma per POS. If an inflection is also an
 * exact lemma for the same POS (for example, `find` -> `found` versus the verb
 * `found`), every same-POS mapping for that surface is ignored. A POS tagger
 * cannot distinguish those meanings, so choosing either lemma would fabricate
 * provenance.
 */
export function exampleTargetsBySurfaceForm(
  targets: ReadonlyMap<string, ReadonlySet<string>>,
  formsByEntry: ReadonlyMap<string, WordForms> = new Map(),
): Map<string, ExampleTarget[]> {
  const unresolved = new Map<string, ExampleTarget[]>()
  for (const [lemma, partsOfSpeech] of targets) {
    for (const partOfSpeech of partsOfSpeech) {
      const entryForms = formsByEntry.get(entryExampleKey(lemma, partOfSpeech))
        ?? formsFor(lemma, partOfSpeech)
      const forms = new Set([lemma, ...formStrings(entryForms)]
        .map((form) => form.trim().toLowerCase())
        .filter((form) => /^[a-z]+$/.test(form)))
      for (const form of forms) {
        const entries = unresolved.get(form) ?? []
        entries.push({ lemma, partOfSpeech })
        unresolved.set(form, entries)
      }
    }
  }

  const resolved = new Map<string, ExampleTarget[]>()
  for (const [form, entries] of unresolved) {
    const byPartOfSpeech = new Map<string, ExampleTarget[]>()
    for (const entry of entries) {
      const samePartOfSpeech = byPartOfSpeech.get(entry.partOfSpeech) ?? []
      samePartOfSpeech.push(entry)
      byPartOfSpeech.set(entry.partOfSpeech, samePartOfSpeech)
    }

    const unambiguous = [...byPartOfSpeech.values()].flatMap((samePartOfSpeech) => {
      return samePartOfSpeech.length === 1 ? samePartOfSpeech : []
    })
    if (unambiguous.length > 0) resolved.set(form, unambiguous)
  }
  return resolved
}

export async function readTatoebaExamples(
  path: string,
  targets: ReadonlyMap<string, ReadonlySet<string>>,
  formsByEntry: ReadonlyMap<string, WordForms> = new Map(),
  diagnostics?: Map<string, ExampleMatchingDiagnostics>,
): Promise<Map<string, ExampleRecord[]>> {
  const targetsBySurfaceForm = exampleTargetsBySurfaceForm(targets, formsByEntry)
  const candidatesByEntry = new Map<string, RawExampleRecord[]>()
  const input = createReadStream(path).pipe(createGunzip())
  const lines = createInterface({ input, crlfDelay: Infinity })
  let lineNumber = 0

  for await (const rawLine of lines) {
    lineNumber += 1
    const sentence = rawLine.trim()
    if (!isSuitableExample(sentence)) continue
    const matchesByEntry = new Map<string, { target: ExampleTarget; forms: string[] }>()
    for (const form of exampleTokens(sentence)) {
      if (!hasStandaloneSurfaceForm(sentence, form)) continue
      for (const target of targetsBySurfaceForm.get(form) ?? []) {
        const key = entryExampleKey(target.lemma, target.partOfSpeech)
        const match = matchesByEntry.get(key) ?? { target, forms: [] }
        match.forms.push(form)
        matchesByEntry.set(key, match)
      }
    }
    for (const [key, { target, forms }] of matchesByEntry) {
      const examples = candidatesByEntry.get(key) ?? []
      const candidate: RawExampleRecord = {
        sentence,
        line: lineNumber,
        partOfSpeechMatch: true,
        entryKey: key,
        lemma: target.lemma,
        partOfSpeech: target.partOfSpeech,
        matchedForms: forms,
        usesInflectedForm: forms.some((form) => form !== target.lemma),
      }
      addRawExample(examples, candidate)
      candidatesByEntry.set(key, examples)
    }
  }

  const result = new Map<string, ExampleRecord[]>()
  const candidatesBySentence = new Map<string, RawExampleRecord[]>()
  candidatesByEntry.forEach((examples, key) => {
    diagnostics?.set(key, {
      rawCandidates: examples.length,
      matchedCandidates: 0,
      recoveryCandidates: 0,
      recoveryMatched: 0,
      unmatchedSamples: [],
    })
    for (const example of examples) {
      const sameSentence = candidatesBySentence.get(example.sentence) ?? []
      sameSentence.push(example)
      candidatesBySentence.set(example.sentence, sameSentence)
    }
  })
  candidatesByEntry.clear()

  for (const [sentence, examples] of candidatesBySentence) {
    const terms = taggedTerms(sentence)
    const needsIndependentAgreement = examples.some((example) =>
      (targets.get(example.lemma)?.size ?? 0) > 1)
    const independentTerms = needsIndependentAgreement ? independentTaggedTerms(sentence) : []
    for (const example of examples) {
      const requireIndependentAgreement = (targets.get(example.lemma)?.size ?? 0) > 1
      const partOfSpeechMatches = example.matchedForms.some((form) =>
        combinedTaggedTermsMatchPartOfSpeech(
          terms,
          independentTerms,
          form,
          example.partOfSpeech,
          example.lemma,
          requireIndependentAgreement,
        ))
      const diagnostic = diagnostics?.get(example.entryKey)
      if (!partOfSpeechMatches) {
        if (diagnostic && diagnostic.unmatchedSamples.length < 3) {
          diagnostic.unmatchedSamples.push(example.sentence)
        }
        continue
      }
      if (diagnostic) diagnostic.matchedCandidates += 1
      const matchingExamples = result.get(example.entryKey) ?? []
      matchingExamples.push({
        sentence: example.sentence,
        line: example.line,
        partOfSpeechMatch: true,
      })
      result.set(example.entryKey, matchingExamples)
    }
  }
  result.forEach((examples) => {
    examples.sort(compareExamples)
  })

  // The first pass deliberately bounds memory before POS tagging. For a
  // frequent homograph, however, 100 wrong-POS uses can fill that reservoir
  // before two valid uses appear. Re-scan only entries that still lack the
  // required two examples, tag each matching sentence immediately, and retain
  // a small evidence cushion for globally unique assignment.
  const mappedEntryKeys = new Set(
    [...targetsBySurfaceForm.values()].flatMap((surfaceTargets) =>
      surfaceTargets.map((target) => entryExampleKey(target.lemma, target.partOfSpeech))),
  )
  const recoveryKeys = new Set<string>()
  for (const [lemma, partsOfSpeech] of targets) {
    for (const partOfSpeech of partsOfSpeech) {
      const key = entryExampleKey(lemma, partOfSpeech)
      if (mappedEntryKeys.has(key) && (result.get(key)?.length ?? 0) < 2) recoveryKeys.add(key)
    }
  }

  if (recoveryKeys.size > 0) {
    const seenByEntry = new Map<string, Set<string>>(
      [...recoveryKeys].map((key) => [
        key,
        new Set((result.get(key) ?? []).map(({ sentence }) => sentence)),
      ]),
    )
    const recoveryInput = createReadStream(path).pipe(createGunzip())
    const recoveryLines = createInterface({ input: recoveryInput, crlfDelay: Infinity })
    let recoveryLineNumber = 0

    for await (const rawLine of recoveryLines) {
      recoveryLineNumber += 1
      const sentence = rawLine.trim()
      if (!isSuitableExample(sentence)) continue
      const matchesByEntry = new Map<string, { target: ExampleTarget; forms: string[] }>()
      for (const form of exampleTokens(sentence)) {
        if (!hasStandaloneSurfaceForm(sentence, form)) continue
        for (const target of targetsBySurfaceForm.get(form) ?? []) {
          const key = entryExampleKey(target.lemma, target.partOfSpeech)
          if (!recoveryKeys.has(key) || seenByEntry.get(key)?.has(sentence)) continue
          const match = matchesByEntry.get(key) ?? { target, forms: [] }
          match.forms.push(form)
          matchesByEntry.set(key, match)
        }
      }
      if (matchesByEntry.size === 0) continue

      const terms = taggedTerms(sentence)
      const needsIndependentAgreement = [...matchesByEntry.values()].some(({ target }) =>
        (targets.get(target.lemma)?.size ?? 0) > 1)
      const independentTerms = needsIndependentAgreement ? independentTaggedTerms(sentence) : []
      for (const [key, { target, forms }] of matchesByEntry) {
        let diagnostic = diagnostics?.get(key)
        if (diagnostics && !diagnostic) {
          diagnostic = {
            rawCandidates: 0,
            matchedCandidates: 0,
            recoveryCandidates: 0,
            recoveryMatched: 0,
            unmatchedSamples: [],
          }
          diagnostics.set(key, diagnostic)
        }
        if (diagnostic) diagnostic.recoveryCandidates += 1
        const requireIndependentAgreement = (targets.get(target.lemma)?.size ?? 0) > 1
        if (!forms.some((form) =>
          combinedTaggedTermsMatchPartOfSpeech(
            terms,
            independentTerms,
            form,
            target.partOfSpeech,
            target.lemma,
            requireIndependentAgreement,
          ))) continue

        const examples = result.get(key) ?? []
        examples.push({ sentence, line: recoveryLineNumber, partOfSpeechMatch: true })
        result.set(key, examples)
        seenByEntry.get(key)?.add(sentence)
        if (diagnostic) diagnostic.recoveryMatched += 1
        if (examples.length >= RECOVERY_MATCHED_EXAMPLE_LIMIT) recoveryKeys.delete(key)
      }
      if (recoveryKeys.size === 0) {
        recoveryLines.close()
        recoveryInput.destroy()
        break
      }
    }
    result.forEach((examples) => examples.sort(compareExamples))
  }
  return result
}

function candidateOrder(left: VerifiedWordCandidate, right: VerifiedWordCandidate): number {
  const leftLevel = left.cefr ? CEFR_ORDER[left.cefr.level] : 4
  const rightLevel = right.cefr ? CEFR_ORDER[right.cefr.level] : 4
  return leftLevel - rightLevel
    || Number(left.entries[0]?.partOfSpeechResolution === 'alternate-wiktionary-sense')
      - Number(right.entries[0]?.partOfSpeechResolution === 'alternate-wiktionary-sense')
    || (left.frequency?.rank ?? 10_000) - (right.frequency?.rank ?? 10_000)
    || left.lemma.localeCompare(right.lemma)
}

function hasLowercaseSurface(sentence: string, forms: WordForms): boolean {
  const alternatives = formStrings(forms)
    .filter((form) => /^[a-z]+$/.test(form))
    .sort((left, right) => right.length - left.length)
  if (alternatives.length === 0) return false
  return new RegExp(
    `(?:^|[^A-Za-z])(?:${alternatives.join('|')})(?=$|[^A-Za-z])`,
  ).test(sentence)
}

function omwRecoveryInflectionAliases(
  lexicon: ReadonlyMap<string, readonly OmwBilingualEntry[]>,
): ReadonlySet<string> {
  const lemmas = new Set(lexicon.keys())
  const aliases = new Set<string>()
  for (const [lemma, entries] of lexicon) {
    for (const entry of entries) {
      for (const form of formStrings(formsFor(lemma, entry.partOfSpeech))) {
        if (form !== lemma && lemmas.has(form)) aliases.add(form)
      }
    }
  }
  return aliases
}

function assignExamples(
  candidates: readonly AllocatedWord[],
  reservedExampleKeys: ReadonlySet<string> = new Set(),
): Map<string, [ExampleRecord, ExampleRecord]> {
  const selected = new Map<string, [ExampleRecord, ExampleRecord]>()
  const usedExampleKeys = new Set(reservedExampleKeys)
  const rarestFirst = candidates.flatMap((candidate) => candidate.entries.map((entry) => ({
    candidate,
    entry,
  }))).sort((left, right) =>
    left.entry.examples.length - right.entry.examples.length
      || candidateOrder(left.candidate, right.candidate)
      || left.entry.partOfSpeech.localeCompare(right.entry.partOfSpeech))

  for (const { candidate, entry } of rarestFirst) {
    const choices: ExampleRecord[] = []
    const choiceKeys = new Set<string>()
    for (const example of entry.examples) {
      if (!isLearnerSafeExampleForLevel(example.sentence, candidate.level)) continue
      const key = normalizeWordExampleKey(example.sentence)
      if (usedExampleKeys.has(key) || choiceKeys.has(key)) continue
      choices.push(example)
      choiceKeys.add(key)
      if (choices.length === 2) break
    }
    if (choices.length < 2) {
      throw new Error(`Missing two globally unique source examples for ${candidate.lemma}/${entry.partOfSpeech}`)
    }
    selected.set(entryExampleKey(candidate.lemma, entry.partOfSpeech), [choices[0]!, choices[1]!])
    choiceKeys.forEach((key) => usedExampleKeys.add(key))
  }
  return selected
}

function selectCandidates(
  candidates: readonly VerifiedWordCandidate[],
  reservedExampleKeys: ReadonlySet<string> = new Set(),
): SelectedWord[] {
  const basicFamilyIds = new Set(BASIC_EDITORIAL_WORDS.map(({ lemma }) =>
    familyForLemma(lemma).familyId))
  const ordered = [...candidates]
    .filter(({ lemma }) => {
      const family = familyForLemma(lemma)
      return family.isFamilyHead && !basicFamilyIds.has(family.familyId)
    })
    .sort(candidateOrder)
  const capacity = auditWordFamilyCapacity(
    candidates.map(({ lemma }) => lemma),
    BASIC_EDITORIAL_WORDS.map(({ lemma }) => lemma),
  )
  console.log(
    `[content:words:family-capacity] ${JSON.stringify(capacity)}`,
  )
  if (ordered.length < TARGET_NON_BASIC_WORDS) {
    throw new Error(
      `Expected ${TARGET_NON_BASIC_WORDS} verified non-basic family heads; found ${ordered.length}`,
    )
  }
  const candidatesByLemma = new Map(ordered.map((candidate) => [candidate.lemma, candidate]))
  const required = REQUIRED_CORE_WORDS.map(({ lemma }) => {
    const candidate = candidatesByLemma.get(lemma)
    if (!candidate) throw new Error(`Required core word is not eligible: ${lemma}`)
    return candidate
  })
  const candidatePool = [
    ...required,
    ...ordered.filter(({ lemma }) => !REQUIRED_CORE_WORD_LEMMAS.has(lemma)),
  ]
  const levels: Array<[NonBasicLevel, number]> = [
    ['유치원', 500],
    ['초등학교', 1_500],
    ['중학교', 2_500],
  ]
  const allocated: AllocatedWord[] = []
  const allocatedLemmas = new Set<string>()
  const allocatedFamilyIds = new Set(basicFamilyIds)
  for (const [level, count] of levels) {
    const passes = level === '유치원'
      ? ['primary-a1', 'fallback-a2'] as const
      : ['standard'] as const
    for (const pass of passes) {
      for (const candidate of candidatePool) {
        const family = familyForLemma(candidate.lemma)
        if (
          allocatedLemmas.has(candidate.lemma)
          || allocatedFamilyIds.has(family.familyId)
        ) continue
        const meanings = candidate.entries.flatMap((entry) => entry.meanings)
        const eligibleForLevel = level === '유치원'
          ? kindergartenAllocationPhase(candidate.lemma, candidate.cefr?.level, meanings) === pass
          : NON_BASIC_LEVEL_ORDER[level] >= NON_BASIC_LEVEL_ORDER[
              REQUIRED_CORE_WORD_LEMMAS.has(candidate.lemma)
                ? '유치원'
                : minimumLearnerLevelForWord(candidate.lemma, candidate.cefr?.level, meanings)
            ]
        if (!eligibleForLevel) continue
        const hasEnoughAgeAppropriateExamples = candidate.entries.every((entry) => {
          const keys = new Set(entry.examples
            .filter(({ sentence }) => isLearnerSafeExampleForLevel(sentence, level))
            .map(({ sentence }) => normalizeWordExampleKey(sentence)))
          return keys.size >= 2
        })
        if (!hasEnoughAgeAppropriateExamples) continue
        allocated.push({ ...candidate, level })
        allocatedLemmas.add(candidate.lemma)
        allocatedFamilyIds.add(family.familyId)
        if (allocated.filter((word) => word.level === level).length === count) break
      }
      if (allocated.filter((word) => word.level === level).length === count) break
    }
    const actual = allocated.filter((word) => word.level === level).length
    if (actual !== count) {
      throw new Error(
        `Insufficient age-appropriate verified words for ${level}: expected ${count}; found ${actual}`,
      )
    }
  }
  if (allocated.length !== TARGET_NON_BASIC_WORDS) {
    throw new Error(
      `Expected ${TARGET_NON_BASIC_WORDS} age-banded words; found ${allocated.length}`,
    )
  }

  const examples = assignExamples(allocated, reservedExampleKeys)
  return allocated.map((candidate): SelectedWord => ({
    ...candidate,
    entries: candidate.entries.map((entry) => ({
      ...entry,
      selectedExamples: examples.get(entryExampleKey(candidate.lemma, entry.partOfSpeech))!,
    })),
  }))
}

function toWordItem(selected: SelectedWord, indexWithinLevel: number, count: number): WordItem {
  const primaryEntry = selected.entries[0]
  if (!primaryEntry) throw new Error(`Missing primary entry for ${selected.lemma}`)
  const item = normalizeWord({
    lemma: selected.lemma,
    levelBucket: selected.level,
    rank: selected.frequency?.rank ?? 10_000,
    partOfSpeech: primaryEntry.partOfSpeech,
    meanings: primaryEntry.meanings,
    ipa: primaryEntry.ipa,
    forms: primaryEntry.forms,
    examples: primaryEntry.selectedExamples.map(({ sentence }) => sentence),
  })
  const entries = selected.entries.map((entry) => normalizeWord({
    lemma: selected.lemma,
    levelBucket: selected.level,
    rank: selected.frequency?.rank ?? 10_000,
    partOfSpeech: entry.partOfSpeech,
    meanings: entry.meanings,
    ipa: entry.ipa,
    forms: entry.forms,
    examples: entry.selectedExamples.map(({ sentence }) => sentence),
  }).entries[0]!)
  return { ...item, difficulty: difficultyForPosition(indexWithinLevel, count), entries }
}

export async function buildWordCatalog(cacheRoot = CONTENT_CACHE_DIR): Promise<{
  wordlists: Record<Level, WordItem[]>
  provenance: WordCatalogProvenance
}> {
  await requireVerifiedContentSourceCaches(WORD_CONTENT_SOURCE_IDS, cacheRoot)
  const [cefrSource, frequencySource, ipaSource, omwEnglishSource, omwKoreanSource] = await Promise.all([
    readFile(join(cacheRoot, 'cefrj-vocabulary-profile-1.5.csv'), 'utf8'),
    readFile(join(cacheRoot, 'word-freq-top5000.csv'), 'utf8'),
    readFile(join(cacheRoot, 'ipa-dict-en_US.txt'), 'utf8'),
    readFile(join(cacheRoot, 'wn-data-eng.tab'), 'utf8'),
    readFile(join(cacheRoot, 'wn-wikt-kor.tab'), 'utf8'),
  ])
  const cefr = parseCefrCsv(cefrSource)
  const cefrEvidence = parseCefrEvidence(cefrSource)
  const frequency = parseFrequencyCsv(frequencySource)
  const frequencyEvidence = parseFrequencyEvidence(frequencySource)
  const ipa = parseIpaDictionary(ipaSource)
  const omw = parseOmwBilingualLexicon(omwEnglishSource, omwKoreanSource)
  const recoveryInflectionAliases = omwRecoveryInflectionAliases(omw)
  const basicLemmas = new Set(BASIC_EDITORIAL_WORDS.map(({ lemma }) => lemma))
  const duplicatedCoreWords = REQUIRED_CORE_WORDS
    .filter(({ lemma }) => basicLemmas.has(lemma))
    .map(({ lemma }) => lemma)
  if (duplicatedCoreWords.length > 0) {
    throw new Error(`Required core words duplicate the basic editorial catalog: ${duplicatedCoreWords.join(', ')}`)
  }
  const primarySourceLemmas = new Set([...cefr.keys(), ...frequency.keys()])
  const targetLemmas = new Set([...primarySourceLemmas, ...omw.keys()].filter((lemma) => {
    const omwOnly = !primarySourceLemmas.has(lemma)
    return !basicLemmas.has(lemma)
      && !REQUIRED_CORE_WORD_LEMMAS.has(lemma)
      && !isBlockedCatalogLemma(lemma)
      && (!omwOnly || (lemma.length >= 3 && !recoveryInflectionAliases.has(lemma)))
  }))
  const wiktionary = await readKoreanWiktionary(
    join(cacheRoot, 'kowiktionary-20260701-pages-articles.xml.bz2'),
    targetLemmas,
  )
  const candidatesWithLexicon = new Map<string, {
    sourcePartOfSpeech: string
    entries: ResolvedKoreanEntry[]
    cefr?: CefrRecord
    frequency?: FrequencyRecord
  }>([...targetLemmas].flatMap((lemma) => {
    if (!ipa.has(lemma)) return []
    const sourceCefrEvidence = cefrEvidence.get(lemma) ?? []
    const sourceFrequencyEvidence = frequencyEvidence.get(lemma) ?? []
    const entries = wiktionary.get(lemma)
    const resolved = (entries
      ? resolveSourceAlignedKoreanEntries(
          lemma,
          entries,
          sourceCefrEvidence,
          sourceFrequencyEvidence,
        )
      : undefined) ?? resolveOmwBilingualEntries(
        omw.get(lemma) ?? [],
        sourceCefrEvidence,
        sourceFrequencyEvidence,
      )
    return resolved
      ? [[lemma, resolved] as const]
      : []
  }))
  console.log(
    `[content:words] ${targetLemmas.size} source lemmas; `
      + `${candidatesWithLexicon.size} have IPA and Korean lexicon evidence`,
  )
  const targetPartsOfSpeech = new Map([...candidatesWithLexicon].map(([lemma, resolved]) =>
    [lemma, new Set(resolved.entries.map(({ partOfSpeech }) => partOfSpeech))]))
  const formsByEntry = new Map<string, WordForms>(
    [...candidatesWithLexicon].flatMap(([lemma, resolved]) =>
      resolved.entries.map((entry) => [
        entryExampleKey(lemma, entry.partOfSpeech),
        formsFor(lemma, entry.partOfSpeech, entry.morphology),
      ] as const)),
  )
  const mappedSurfaceCounts = new Map<string, number>()
  for (const targets of exampleTargetsBySurfaceForm(targetPartsOfSpeech, formsByEntry).values()) {
    for (const target of targets) {
      const key = entryExampleKey(target.lemma, target.partOfSpeech)
      mappedSurfaceCounts.set(key, (mappedSurfaceCounts.get(key) ?? 0) + 1)
    }
  }
  const exampleDiagnostics = new Map<string, ExampleMatchingDiagnostics>()
  const tatoeba = await readTatoebaExamples(
    join(cacheRoot, 'opus-tatoeba-v2023-04-12-en.txt.gz'),
    targetPartsOfSpeech,
    formsByEntry,
    exampleDiagnostics,
  )

  const candidates: VerifiedWordCandidate[] = []
  for (const [lemma, resolved] of candidatesWithLexicon) {
    const cefrRecord = resolved.cefr
    const frequencyRecord = resolved.frequency
    const { sourcePartOfSpeech } = resolved
    const verifiedEntries = resolved.entries.flatMap((entry) => {
      const sourceExamples = tatoeba.get(entryExampleKey(lemma, entry.partOfSpeech)) ?? []
      const examples = entry.resolution === 'omw-bilingual-synset'
        ? sourceExamples.filter(({ sentence }) =>
            hasLowercaseSurface(sentence, formsByEntry.get(entryExampleKey(lemma, entry.partOfSpeech))!))
        : sourceExamples
      const minimumExamples = entry.resolution === 'omw-bilingual-synset'
        ? OMW_RECOVERY_SOURCE_EXAMPLE_BUFFER
        : 2
      return examples.length >= minimumExamples
        && examples.every(({ partOfSpeechMatch }) => partOfSpeechMatch)
        ? [{
            partOfSpeechResolution: entry.resolution,
            partOfSpeech: entry.partOfSpeech,
            meanings: entry.meanings,
            ipa: ipa.get(lemma)!,
            forms: formsByEntry.get(entryExampleKey(lemma, entry.partOfSpeech))!,
            examples,
            ...(entry.omwSynsetIds ? { omwSynsetIds: entry.omwSynsetIds } : {}),
          } satisfies VerifiedWordEntryCandidate]
        : []
    })
    if (
      verifiedEntries.length === 0
      || verifiedEntries[0]?.partOfSpeech !== resolved.entries[0]?.partOfSpeech
    ) continue
    candidates.push({
      lemma,
      ...(cefrRecord ? { cefr: cefrRecord } : {}),
      ...(frequencyRecord ? { frequency: frequencyRecord } : {}),
      sourcePartOfSpeech,
      entries: verifiedEntries,
    })
  }
  candidates.push(...requiredCoreCandidates(cefr, frequency, ipa))
  console.log(
    `[content:words] ${tatoeba.size} POS entries have matched examples; `
      + `${candidates.length} non-basic lemmas passed all evidence gates`,
  )
  if (candidates.length < TARGET_NON_BASIC_WORDS) {
    const failures = [...candidatesWithLexicon].flatMap(([lemma, resolved]) => {
      const primary = resolved.entries[0]
      if (!primary) return []
      const key = entryExampleKey(lemma, primary.partOfSpeech)
      const matchedExamples = tatoeba.get(key)?.length ?? 0
      if (matchedExamples >= 2) return []
      const diagnostic = exampleDiagnostics.get(key)
      return [{
        lemma,
        partOfSpeech: primary.partOfSpeech,
        forms: formStrings(formsByEntry.get(key)!),
        mappedSurfaces: mappedSurfaceCounts.get(key) ?? 0,
        rawCandidates: diagnostic?.rawCandidates ?? 0,
        matchedCandidates: diagnostic?.matchedCandidates ?? 0,
        recoveryCandidates: diagnostic?.recoveryCandidates ?? 0,
        recoveryMatched: diagnostic?.recoveryMatched ?? 0,
        unmatchedSamples: diagnostic?.unmatchedSamples ?? [],
      }]
    })
    console.log(`[content:words] ${failures.length} primary entries failed example evidence`)
    failures.forEach((failure) => {
      console.log(`[content:words:failure] ${JSON.stringify(failure)}`)
    })
  }

  const basic = buildBasicEditorialWords(ipa)
  if (
    basic.some(({ isFamilyHead }) => !isFamilyHead)
    || new Set(basic.map(({ familyId }) => familyId)).size !== basic.length
  ) {
    throw new Error('Every basic editorial word must be a unique word-family head')
  }
  const basicExampleKeys = new Set<string>()
  for (const word of basic) {
    const meaningText = word.entries.flatMap(({ meanings }) => meanings).join(' ')
    const sensitivePolicy = SENSITIVE_TOPIC_POLICY.find((policy) =>
      policy.lemmaPattern.test(word.lemma) || policy.meaningPattern.test(meaningText))
    if (sensitivePolicy) {
      throw new Error(
        `Basic editorial word violates ${sensitivePolicy.id} age policy: ${word.lemma}`,
      )
    }
  }
  for (const example of basic.flatMap(({ entries }) =>
    entries.flatMap(({ examples }) => examples))) {
    if (!isLearnerSafeExampleForLevel(example, '기초')) {
      throw new Error(`Basic editorial example violates the age policy: ${example}`)
    }
    const key = normalizeWordExampleKey(example)
    if (basicExampleKeys.has(key)) {
      throw new Error(`Basic editorial examples are not globally unique: ${example}`)
    }
    basicExampleKeys.add(key)
  }
  const selected = selectCandidates(candidates, basicExampleKeys)
  const allSelectedFamilies = [
    ...basic.map(({ familyId, isFamilyHead }) => ({ familyId, isFamilyHead })),
    ...selected.map(({ lemma }) => familyForLemma(lemma)),
  ]
  if (
    allSelectedFamilies.some(({ isFamilyHead }) => !isFamilyHead)
    || new Set(allSelectedFamilies.map(({ familyId }) => familyId)).size
      !== allSelectedFamilies.length
  ) {
    throw new Error('Every selected catalog word must be a globally unique word-family head')
  }
  const wordlists = { 기초: basic, 유치원: [], 초등학교: [], 중학교: [] } as Record<Level, WordItem[]>
  for (const level of LEVELS.slice(1)) {
    const levelWords = selected.filter((word) => word.level === level)
    wordlists[level] = levelWords.map((word, index) => toWordItem(word, index, levelWords.length))
  }

  const selectedByLemma = new Map(selected.map((word) => [word.lemma, word]))
  const provenance: WordCatalogProvenance = {
    schemaVersion: '4.0.0',
    generatedBy: 'scripts/content/buildWordCatalog.ts',
    outputDigest: wordCatalogOutputDigest(wordlists),
    selectionPolicy: {
      basic: '500 checked-in editorial words, in source order; exclude every configured sensitive-topic lemma, meaning, and example',
      nonBasic: 'CEFR A1→A2→B1→B2→unrated; allocate every safe A1 head to kindergarten first and use safe source-labelled A2 heads only for its remaining quota, while B1 may start at elementary school and B2/unrated start at middle school; configured sensitive topics can only raise that floor and are never eligible for the A2 kindergarten fallback; prefer exact source-POS Korean Wiktionary senses and audited POS corrections, then exact PWN3-synset OMW recovery restricted to monosemous lemma/POS rows or all-synset Korean-label convergence; require IPA and a five-sentence POS-matched source buffer before selecting two globally unique Tatoeba examples; then frequency rank and lemma; select only the checked-in basic-priority or WordNet-source-verified canonical head of each family; exact sequential quotas',
      quotas: { 기초: 500, 유치원: 500, 초등학교: 1_500, 중학교: 2_500 },
    },
    sources: WORD_CONTENT_SOURCES,
    words: LEVELS.flatMap((level) => wordlists[level].map((word) => {
      const source = selectedByLemma.get(word.lemma)
      return {
        lemma: word.lemma,
        level,
        cefr: source?.cefr?.level ?? null,
        cefrLine: source?.cefr?.line ?? null,
        frequencyRank: source?.frequency?.rank ?? null,
        frequencyLine: source?.frequency?.line ?? null,
        entries: word.entries.map((entry, index) => {
          const sourceEntry = source?.entries[index]
          const isCoreAnchor = sourceEntry?.partOfSpeechResolution === 'editorial-core-anchor'
          const isOmwBilingual = sourceEntry?.partOfSpeechResolution === 'omw-bilingual-synset'
          return {
            koreanWiktionaryPage: source && !isCoreAnchor && !isOmwBilingual ? source.lemma : null,
            omwSynsetIds: sourceEntry?.omwSynsetIds ?? null,
            sourcePartOfSpeech: source?.sourcePartOfSpeech ?? null,
            catalogPartOfSpeech: entry.partOfSpeech,
            partOfSpeechResolution: sourceEntry?.partOfSpeechResolution ?? 'editorial-basic',
            ipaSource: source || ipa.has(word.lemma) ? 'ipa-dict' : 'editorial-basic',
            exampleSourceLines: sourceEntry && !isCoreAnchor
              ? sourceEntry.selectedExamples.map(({ line }) => line)
              : null,
          }
        }),
      }
    })),
  }
  return { wordlists, provenance }
}
