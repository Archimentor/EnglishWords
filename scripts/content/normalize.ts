import { LEVELS } from '../../src/domain/content/types'
import type { Difficulty, Level, WordItem } from '../../src/domain/content/types'
import { wordFamilyFor } from '../../src/domain/content/wordFamilies'

export const WORD_QUOTAS = { 기초: 500, 유치원: 500, 초등학교: 1500, 중학교: 2500 } as const
export const PHRASAL_QUOTA = 250

export interface CandidateWord {
  lemma: string
  levelBucket: Level
  rank: number
  partOfSpeech: string
  meanings: string[]
  ipa: string
  forms: string[] | Record<string, string>
  examples: string[]
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

function idPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function formValues(forms: CandidateWord['forms']): string[] {
  return Array.isArray(forms) ? forms : Object.values(forms)
}

function normalizedForms(forms: CandidateWord['forms']): CandidateWord['forms'] {
  if (Array.isArray(forms)) {
    return [...new Set(forms.map((form) => form.trim()).filter(Boolean))]
  }

  return Object.fromEntries(
    Object.entries(forms)
      .map(([name, form]) => [name, form.trim()] as const)
      .filter(([, form]) => Boolean(form)),
  )
}

function isComplete(candidate: CandidateWord): boolean {
  return candidate.lemma.trim().length > 0
    && candidate.partOfSpeech.trim().length > 0
    && candidate.meanings.some((meaning) => /[가-힣]/.test(meaning))
    && /^\/[^/]+\/$/.test(candidate.ipa.trim())
    && formValues(candidate.forms).some((form) => form.trim().length > 0)
    && new Set(candidate.examples.filter((example) => example.trim().length > 0)).size >= 2
}

export function normalizeWord(candidate: CandidateWord, level = candidate.levelBucket): WordItem {
  if (!isComplete(candidate)) {
    throw new Error(`${candidate.lemma} is incomplete`)
  }

  const lemma = candidate.lemma.toLowerCase()
  const family = wordFamilyFor(lemma)

  return {
    id: `word-${idPart(lemma)}`,
    word: lemma,
    lemma,
    level,
    familyId: family.familyId,
    isFamilyHead: family.isFamilyHead,
    difficulty: difficultyFor(level),
    entries: [{
      partOfSpeech: candidate.partOfSpeech,
      forms: normalizedForms(candidate.forms),
      meanings: [...new Set(candidate.meanings.map((meaning) => meaning.trim()).filter(Boolean))],
      ipa: candidate.ipa.trim(),
      examples: [...new Set(candidate.examples.map((example) => example.trim()).filter(Boolean))],
    }],
  }
}

export function selectWords(
  candidates: readonly CandidateWord[],
  quotas: Record<Level, number> = WORD_QUOTAS,
): Record<Level, WordItem[]> {
  const selected = new Set<string>()
  const selectedFamilies = new Set<string>()
  const ordered = [...candidates].sort((left, right) => left.rank - right.rank || left.lemma.localeCompare(right.lemma))

  return Object.fromEntries(LEVELS.map((level) => {
    const words: WordItem[] = []

    for (const candidate of ordered) {
      const key = candidate.lemma.toLowerCase()
      const family = wordFamilyFor(key)
      if (
        candidate.levelBucket !== level
        || selected.has(key)
        || !family.isFamilyHead
        || selectedFamilies.has(family.familyId)
      ) continue

      try {
        const word = normalizeWord(candidate, level)
        words.push(word)
        selected.add(key)
        selectedFamilies.add(word.familyId)
      } catch {
        // A rejected record never consumes a quota; catalog construction reports its shortage.
      }

      if (words.length === quotas[level]) break
    }

    if (words.length !== quotas[level]) {
      throw new Error(`Insufficient verified words for ${level}: expected ${quotas[level]}, found ${words.length}`)
    }
    return [level, words]
  })) as Record<Level, WordItem[]>
}
