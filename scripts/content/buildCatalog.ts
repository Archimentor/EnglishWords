import { readFile } from 'node:fs/promises'

import type { Difficulty, Level, PhrasalVerbItem } from '../../src/domain/content/types'
import { PHRASAL_QUOTA } from './normalize'

export interface KoreanEntry {
  partOfSpeech: string
  meanings: string[]
  ipa: string
  morphology?: KoreanMorphology
}

export interface KoreanMorphology {
  lemma: string
  past?: string[]
  pastParticiple?: string[]
  plurals?: string[]
}

export interface CandidatePhrasalVerb {
  phrase: string
  levelHint: Level
  meanings: string[]
  ipa: string
  examples: string[]
}

/**
 * A human-reviewed Korean gloss used only when the Korean Wiktionary source
 * has no usable meaning. Every field is release-critical provenance.
 */
export interface EditorialGlossRecord {
  term: string
  meaning: string
  sourceKind: string
  reviewer: string
  reviewDate: string
  evidenceUrl: string
}

export interface KoreanMeaningResolution {
  sourceKind: 'wiktionary' | 'editorial'
  meanings: string[]
}

export interface CatalogCapacity {
  words: Record<Level, number>
  phrasals: Record<Level, number>
}

export interface CatalogQuotas {
  wordQuotas: Record<Level, number>
  phrasalQuotas: Record<Level, number>
}

function normalizedTerm(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function isValidReviewDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value)
}

function hasEvidenceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Validates the editorial handoff before it is allowed to affect a catalog.
 * A term may have exactly one reviewed gloss, avoiding silent meaning choices.
 */
export function buildEditorialGlossIndex(
  records: readonly EditorialGlossRecord[],
): ReadonlyMap<string, EditorialGlossRecord> {
  const index = new Map<string, EditorialGlossRecord>()

  for (const record of records) {
    const term = normalizedTerm(record.term)
    if (!term) throw new Error('Editorial gloss is missing term')
    if (!/[가-힣]/.test(record.meaning)) {
      throw new Error(`Editorial gloss for "${term}" is missing Korean meaning`)
    }
    if (record.sourceKind !== 'editorial') {
      throw new Error(`Editorial gloss for "${term}" must declare sourceKind "editorial"`)
    }
    if (!record.reviewer.trim()) throw new Error(`Editorial gloss for "${term}" is missing reviewer`)
    if (!isValidReviewDate(record.reviewDate)) {
      throw new Error(`Editorial gloss for "${term}" has an invalid reviewDate`)
    }
    if (!hasEvidenceUrl(record.evidenceUrl)) {
      throw new Error(`Editorial gloss for "${term}" is missing evidenceUrl`)
    }
    if (index.has(term)) throw new Error(`Duplicate editorial gloss term: ${term}`)
    index.set(term, {
      ...record,
      term,
      meaning: record.meaning.trim(),
      reviewer: record.reviewer.trim(),
      reviewDate: record.reviewDate,
      evidenceUrl: record.evidenceUrl.trim(),
    })
  }

  return index
}

function parseEditorialGlossRecord(value: unknown, index: number): EditorialGlossRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Editorial gloss at index ${index} must be an object`)
  }

  const record = value as Record<string, unknown>
  const fields = ['term', 'meaning', 'sourceKind', 'reviewer', 'reviewDate', 'evidenceUrl'] as const
  for (const field of fields) {
    if (typeof record[field] !== 'string') {
      throw new Error(`Editorial gloss at index ${index} is missing ${field}`)
    }
  }

  return record as unknown as EditorialGlossRecord
}

/** Reads a checked-in editorial input file; it is never silently optional. */
export async function readEditorialGlossManifest(
  manifestPath: string,
): Promise<ReadonlyMap<string, EditorialGlossRecord>> {
  let decoded: unknown
  try {
    decoded = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read editorial gloss manifest: ${detail}`, { cause: error })
  }

  if (!Array.isArray(decoded)) throw new Error('Editorial gloss manifest must be a JSON array')
  return buildEditorialGlossIndex(decoded.map(parseEditorialGlossRecord))
}

/**
 * Keeps source-derived Korean Wiktionary meanings authoritative. Editorial
 * glosses are a traceable fallback, never an overwrite.
 */
export function resolveKoreanMeanings(
  term: string,
  wiktionaryMeanings: readonly string[],
  editorialGlosses: ReadonlyMap<string, EditorialGlossRecord>,
): KoreanMeaningResolution | undefined {
  const verifiedMeanings = [...new Set(wiktionaryMeanings.map((meaning) => meaning.trim())
    .filter((meaning) => /[가-힣]/.test(meaning)))]
  if (verifiedMeanings.length > 0) {
    return { sourceKind: 'wiktionary', meanings: verifiedMeanings }
  }

  const editorial = editorialGlosses.get(normalizedTerm(term))
  if (!editorial) return undefined
  return { sourceKind: 'editorial', meanings: [editorial.meaning] }
}

export function requireVerifiedCatalogCapacity(
  capacity: CatalogCapacity,
  quotas: CatalogQuotas,
): void {
  for (const level of ['기초', '유치원', '초등학교', '중학교'] as const) {
    if (capacity.words[level] < quotas.wordQuotas[level]) {
      throw new Error(
        `Verified word source capacity is insufficient for ${level}: expected ${quotas.wordQuotas[level]}, found ${capacity.words[level]}`,
      )
    }
    if (capacity.phrasals[level] < quotas.phrasalQuotas[level]) {
      throw new Error(
        `Verified phrasal source capacity is insufficient for ${level}: expected ${quotas.phrasalQuotas[level]}, found ${capacity.phrasals[level]}`,
      )
    }
  }
}

function englishSection(source: string): string {
  const match = source.match(/^==\s*영어\s*==\s*$/m)
  if (!match || match.index === undefined) return ''
  const rest = source.slice(match.index + match[0].length)
  const nextLanguage = rest.search(/^==\s*[^=]+?\s*==\s*$/m)
  return nextLanguage === -1 ? rest : rest.slice(0, nextLanguage)
}

function stripWikitext(value: string): string {
  return value
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[\s*:?(?:file|image|파일|그림):[^\]]*\]\]/gi, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/''+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^[#*:;,\s]+|[\s.;]+$/g, '')
}

function partOfSpeech(header: string): string | undefined {
  if (/조동사/.test(header)) return 'verb'
  if (/동사/.test(header)) return 'verb'
  if (/형용사/.test(header)) return 'adjective'
  if (/부사/.test(header)) return 'adverb'
  if (/전치사/.test(header)) return 'preposition'
  if (/대명사/.test(header)) return 'pronoun'
  if (/관사|한정사/.test(header)) return 'determiner'
  if (/접속사/.test(header)) return 'conjunction'
  if (/감탄사/.test(header)) return 'interjection'
  if (/수사/.test(header)) return 'numeral'
  if (/명사/.test(header)) return 'noun'
  return undefined
}

function defaultEnglishPartOfSpeech(source: string): string | undefined {
  const category = source.match(
    /\[\[분류:영어\s*(조동사|동사|형용사|부사|전치사|대명사|관사|한정사|접속사|감탄사|수사|명사)[^\]]*\]\]/,
  )
  return category ? partOfSpeech(category[1]!) : undefined
}

function findIpa(section: string): string {
  const template = section.match(/\{\{IPA\|(?:en\|)?([^}|]+)[^}]*\}\}/i)
  if (template) return `/${template[1]!.trim().replace(/^\/+|\/+$/g, '')}/`
  const prose = section.match(/IPA\(key\):\s*\/([^/]+)\//i)
  return prose ? `/${prose[1]}/` : ''
}

function morphologyValues(value: string): string[] {
  return [...new Set(value
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .split(/\s*[/,]\s*/)
    .map((candidate) => candidate.replace(/\([^)]*\)/g, '').trim().toLowerCase())
    .filter((candidate) => /^[a-z]+$/.test(candidate)))]
}

export function parseKoreanMorphologyTemplate(line: string): KoreanMorphology | undefined {
  const match = line.match(/\{\{(동사변화|복수)\|([^{}]*)\}\}/)
  if (!match) return undefined
  const fields = match[2]!.split('|')
  const lemma = morphologyValues(fields[0] ?? '')[0]
  if (!lemma) return undefined

  if (match[1] === '동사변화') {
    const past = morphologyValues(fields[1] ?? '')
    const pastParticiple = morphologyValues(fields[2] ?? '')
    return {
      lemma,
      ...(past.length > 0 ? { past } : {}),
      ...(pastParticiple.length > 0 ? { pastParticiple } : {}),
    }
  }
  const plurals = morphologyValues(fields[1] ?? '')
  return { lemma, ...(plurals.length > 0 ? { plurals } : {}) }
}

function mergeMorphology(
  current: KoreanMorphology | undefined,
  incoming: KoreanMorphology,
): KoreanMorphology {
  if (!current || current.lemma !== incoming.lemma) return incoming
  const merge = (left: readonly string[] | undefined, right: readonly string[] | undefined) => {
    const values = [...new Set([...(left ?? []), ...(right ?? [])])]
    return values.length > 0 ? values : undefined
  }
  const past = merge(current.past, incoming.past)
  const pastParticiple = merge(current.pastParticiple, incoming.pastParticiple)
  const plurals = merge(current.plurals, incoming.plurals)
  return {
    lemma: current.lemma,
    ...(past ? { past } : {}),
    ...(pastParticiple ? { pastParticiple } : {}),
    ...(plurals ? { plurals } : {}),
  }
}

export function extractKoreanEntries(source: string): KoreanEntry[] {
  const section = englishSection(source)
  if (!section) return []

  const ipa = findIpa(section)
  // Korean Wiktionary commonly places morphology immediately before the POS
  // heading (and sometimes above a transitive/intransitive subheading). Collect
  // it at English-page scope first so a heading flush cannot silently discard
  // the source paradigm. `formsFor` later verifies that the template lemma is
  // the catalog page lemma before using it.
  const morphologyByPartOfSpeech = new Map<string, KoreanMorphology>()
  for (const line of section.split(/\r?\n/)) {
    const parsed = parseKoreanMorphologyTemplate(line)
    if (!parsed) continue
    const partOfSpeech = /\{\{복수\|/.test(line) ? 'noun' : 'verb'
    const current = morphologyByPartOfSpeech.get(partOfSpeech)
    if (!current || current.lemma === parsed.lemma) {
      morphologyByPartOfSpeech.set(partOfSpeech, mergeMorphology(current, parsed))
    }
  }
  const entries: KoreanEntry[] = []
  let currentPart: string | undefined = defaultEnglishPartOfSpeech(source)
  let meanings: string[] = []

  const flush = () => {
    const distinct = [...new Set(meanings)]
    if (distinct.length > 0 && currentPart) {
      const morphology = morphologyByPartOfSpeech.get(currentPart)
      entries.push({
        partOfSpeech: currentPart,
        meanings: distinct,
        ipa,
        ...(morphology ? { morphology } : {}),
      })
    }
    meanings = []
  }

  for (const line of section.split(/\r?\n/)) {
    const header = line.match(/^={3,4}\s*([^=]+?)\s*={3,4}\s*$/)
    if (header) {
      flush()
      currentPart = partOfSpeech(header[1]!)
      continue
    }

    const numberedBullet = line.match(
      /^\*\s*(?:(?:''')\d+(?:-[a-z])?(?:[.)])?'''|\d+(?:-[a-z])?[.)])\s*/i,
    )
    const definitionLine = /^#(?![#:*])/.test(line)
      ? line
      : numberedBullet
        ? line.replace(numberedBullet[0], '# ')
        : undefined
    if (definitionLine && /[가-힣]/.test(definitionLine)) {
      const meaning = stripWikitext(definitionLine)
      if (meaning) meanings.push(meaning)
    }
  }
  flush()

  return entries
}

function difficultyFor(level: Level): Difficulty {
  const difficulties: Record<Level, Difficulty> = {
    기초: 'veryEasy',
    유치원: 'easy',
    초등학교: 'normal',
    중학교: 'hard',
  }
  return difficulties[level]
}

function normalizePhraseId(phrase: string): string {
  return phrase.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function normalizePhrasal(candidate: CandidatePhrasalVerb): PhrasalVerbItem | undefined {
  const parts = candidate.phrase.toLowerCase().trim().split(/\s+/)
  const examples = [...new Set(candidate.examples.map((example) => example.trim()).filter(Boolean))]
  if (
    parts.length !== 2
    || !parts.every((part) => /^[a-z]+$/.test(part))
    || !candidate.meanings.some((meaning) => /[가-힣]/.test(meaning))
    || !/^\/[^/]+\/$/.test(candidate.ipa.trim())
    || examples.length < 2
  ) return undefined

  const [baseVerb, particle] = parts
  if (!baseVerb || !particle) return undefined

  return {
    id: `phrasal-${normalizePhraseId(candidate.phrase)}`,
    baseVerb,
    particle,
    phrasalVerb: parts.join(' '),
    ipa: candidate.ipa.trim(),
    levelHint: candidate.levelHint,
    meaningKo: [...new Set(candidate.meanings.map((meaning) => meaning.trim()).filter(Boolean))],
    examples,
    partOfSpeech: 'phrasalVerb',
    usageNotes: '출처 문장에서 확인한 구동사 용법입니다.',
    difficulty: difficultyFor(candidate.levelHint),
  }
}

export function selectPhrasalVerbs(
  candidates: readonly CandidatePhrasalVerb[],
  quotas: Record<Level, number> = {
    기초: PHRASAL_QUOTA,
    유치원: PHRASAL_QUOTA,
    초등학교: PHRASAL_QUOTA,
    중학교: PHRASAL_QUOTA,
  },
): Record<Level, PhrasalVerbItem[]> {
  const result = { 기초: [], 유치원: [], 초등학교: [], 중학교: [] } as Record<Level, PhrasalVerbItem[]>
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const item = normalizePhrasal(candidate)
    if (!item || seen.has(item.phrasalVerb) || result[item.levelHint].length >= quotas[item.levelHint]) continue
    result[item.levelHint].push(item)
    seen.add(item.phrasalVerb)
  }

  for (const level of Object.keys(result) as Level[]) {
    if (result[level].length !== quotas[level]) {
      throw new Error(`Insufficient verified phrasal verbs for ${level}: expected ${quotas[level]}, found ${result[level].length}`)
    }
  }

  return result
}
