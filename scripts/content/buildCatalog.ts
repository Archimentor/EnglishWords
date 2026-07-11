import type { Difficulty, Level, PhrasalVerbItem } from '../../src/domain/content/types'
import { PHRASAL_QUOTA } from './normalize'

export interface KoreanEntry {
  partOfSpeech: string
  meanings: string[]
  ipa: string
}

export interface CandidatePhrasalVerb {
  phrase: string
  levelHint: Level
  meanings: string[]
  ipa: string
  examples: string[]
}

export interface CatalogCapacity {
  words: Record<Level, number>
  phrasals: Record<Level, number>
}

export interface CatalogQuotas {
  wordQuotas: Record<Level, number>
  phrasalQuotas: Record<Level, number>
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
  const match = source.match(/^== 영어 ==\s*$/m)
  if (!match || match.index === undefined) return ''
  const rest = source.slice(match.index + match[0].length)
  const nextLanguage = rest.search(/^== [^=]+ ==\s*$/m)
  return nextLanguage === -1 ? rest : rest.slice(0, nextLanguage)
}

function stripWikitext(value: string): string {
  return value
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/''+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^[#*:;\s]+|[\s.;]+$/g, '')
}

function partOfSpeech(header: string): string {
  if (/동사/.test(header)) return 'verb'
  if (/형용사/.test(header)) return 'adjective'
  if (/부사/.test(header)) return 'adverb'
  if (/전치사/.test(header)) return 'preposition'
  if (/대명사/.test(header)) return 'pronoun'
  if (/관사|한정사/.test(header)) return 'determiner'
  if (/접속사/.test(header)) return 'conjunction'
  return 'noun'
}

function findIpa(section: string): string {
  const template = section.match(/\{\{IPA\|(?:en\|)?([^}|]+)[^}]*\}\}/i)
  if (template) return `/${template[1].trim().replace(/^\/+|\/+$/g, '')}/`
  const prose = section.match(/IPA\(key\):\s*\/([^/]+)\//i)
  return prose ? `/${prose[1]}/` : ''
}

export function extractKoreanEntries(source: string): KoreanEntry[] {
  const section = englishSection(source)
  if (!section) return []

  const ipa = findIpa(section)
  const entries: KoreanEntry[] = []
  let currentPart = 'noun'
  let meanings: string[] = []

  const flush = () => {
    const distinct = [...new Set(meanings)]
    if (distinct.length > 0) entries.push({ partOfSpeech: currentPart, meanings: distinct, ipa })
    meanings = []
  }

  for (const line of section.split(/\r?\n/)) {
    const header = line.match(/^={3,4}\s*([^=]+?)\s*={3,4}\s*$/)
    if (header) {
      flush()
      currentPart = partOfSpeech(header[1])
      continue
    }

    if (/^#(?![#:*])/.test(line) && /[가-힣]/.test(line)) {
      const meaning = stripWikitext(line)
      if (meaning) meanings.push(meaning)
    }
  }
  flush()

  return entries
}

function difficultyFor(level: Level): Difficulty {
  return { 기초: 'veryEasy', 유치원: 'easy', 초등학교: 'normal', 중학교: 'hard' }[level]
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

  return {
    id: `phrasal-${normalizePhraseId(candidate.phrase)}`,
    baseVerb: parts[0],
    particle: parts[1],
    phrasalVerb: parts.join(' '),
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
