import { LEVELS } from '../types'
import type { Level, ValidationIssue, ValidationMode } from '../types'
import { wordFamilyFor } from '../wordFamilies'
import {
  duplicateId,
  invalidCatalog,
  isDifficulty,
  isLevel,
  isNonBlankString,
  isRecord,
  isStringArray,
  rejectAdditionalProperties,
} from './guards'

const RELEASE_WORD_COUNTS: Record<Level, number> = {
  기초: 500,
  유치원: 500,
  초등학교: 1500,
  중학교: 2500,
}

const WORD_ITEM_FIELDS = [
  'id',
  'word',
  'lemma',
  'level',
  'familyId',
  'isFamilyHead',
  'difficulty',
  'entries',
] as const

const WORD_ENTRY_FIELDS = [
  'partOfSpeech',
  'forms',
  'meanings',
  'ipa',
  'examples',
] as const

interface ValidatedWordIdentity {
  id: string
  lemma: string
  familyId: string
  isFamilyHead: boolean
  itemPath: string
  familyPath: string
}

export function normalizeWordExampleKey(example: string): string {
  return example.trim().normalize('NFKC').toLocaleLowerCase('en-US')
}

function isWordForms(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(isNonBlankString)
  }

  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  return (
    entries.length > 0 &&
    entries.every(([name, form]) => isNonBlankString(name) && isNonBlankString(form))
  )
}

function validateWordEntry(
  entry: unknown,
  path: string,
  seenExampleKeys: Set<string>,
  issues: ValidationIssue[],
): void {
  if (!isRecord(entry)) {
    issues.push(invalidCatalog(path, 'Word entry must be an object.'))
    return
  }

  rejectAdditionalProperties(entry, WORD_ENTRY_FIELDS, path, 'wordlist', issues)

  if (!isNonBlankString(entry.partOfSpeech)) {
    issues.push(invalidCatalog(`${path}.partOfSpeech`, 'partOfSpeech must be a non-blank string.'))
  }

  if (!isWordForms(entry.forms)) {
    issues.push(
      invalidCatalog(`${path}.forms`, 'forms must be a string array or a string-valued object.'),
    )
  }

  if (!isStringArray(entry.meanings)) {
    issues.push(invalidCatalog(`${path}.meanings`, 'meanings must be a string array.'))
  } else if (entry.meanings.length === 0) {
    issues.push({
      code: 'EMPTY_MEANINGS',
      path: `${path}.meanings`,
      message: 'A word entry must have at least one meaning.',
    })
  } else if (!entry.meanings.every(isNonBlankString)) {
    issues.push(
      invalidCatalog(`${path}.meanings`, 'meanings must contain only non-blank strings.'),
    )
  }

  if (typeof entry.ipa !== 'string') {
    issues.push(invalidCatalog(`${path}.ipa`, 'ipa must be a string.'))
  } else if (entry.ipa.trim().length === 0) {
    issues.push({
      code: 'MISSING_IPA',
      path: `${path}.ipa`,
      message: 'A word entry must include an IPA pronunciation.',
    })
  }

  if (!isStringArray(entry.examples)) {
    issues.push(invalidCatalog(`${path}.examples`, 'examples must be a string array.'))
  } else if (entry.examples.length < 2) {
    issues.push({
      code: 'EXAMPLES_TOO_FEW',
      path: `${path}.examples`,
      message: 'A word entry must have at least two examples.',
    })
  } else if (!entry.examples.every(isNonBlankString)) {
    issues.push(
      invalidCatalog(`${path}.examples`, 'examples must contain only non-blank strings.'),
    )
  } else {
    entry.examples.forEach((example, index) => {
      const key = normalizeWordExampleKey(example)
      if (seenExampleKeys.has(key)) {
        issues.push({
          code: 'DUPLICATE_WORD_EXAMPLE',
          path: `${path}.examples[${index}]`,
          message: 'Word example duplicates an earlier example after normalization.',
        })
      } else {
        seenExampleKeys.add(key)
      }
    })
  }
}

function validateWordItem(
  item: unknown,
  level: Level,
  path: string,
  seenExampleKeys: Set<string>,
  issues: ValidationIssue[],
): ValidatedWordIdentity | undefined {
  if (!isRecord(item)) {
    issues.push(invalidCatalog(path, 'Word item must be an object.'))
    return undefined
  }

  rejectAdditionalProperties(item, WORD_ITEM_FIELDS, path, 'wordlist', issues)

  const id = item.id
  const word = item.word
  const lemma = item.lemma
  const itemLevel = item.level
  const familyId = item.familyId
  const isFamilyHead = item.isFamilyHead
  const difficulty = item.difficulty
  const entries = item.entries

  if (!isNonBlankString(id)) {
    issues.push(invalidCatalog(`${path}.id`, 'id must be a non-blank string.'))
  }
  if (!isNonBlankString(word)) {
    issues.push(invalidCatalog(`${path}.word`, 'word must be a non-blank string.'))
  }
  if (!isNonBlankString(lemma)) {
    issues.push(invalidCatalog(`${path}.lemma`, 'lemma must be a non-blank string.'))
  }
  if (!isLevel(itemLevel) || itemLevel !== level) {
    issues.push(
      invalidCatalog(`${path}.level`, `level must match its ${level} wordlist container.`),
    )
  }
  if (!isNonBlankString(familyId)) {
    issues.push(invalidCatalog(`${path}.familyId`, 'familyId must be a non-blank string.'))
  }
  if (typeof isFamilyHead !== 'boolean') {
    issues.push(invalidCatalog(`${path}.isFamilyHead`, 'isFamilyHead must be a boolean.'))
  }
  if (isNonBlankString(lemma)) {
    const canonicalFamily = wordFamilyFor(lemma)
    if (isNonBlankString(familyId) && familyId !== canonicalFamily.familyId) {
      issues.push({
        code: 'WORD_FAMILY_ID_MISMATCH',
        path: `${path}.familyId`,
        message: `Lemma "${lemma}" must belong to canonical family "${canonicalFamily.familyId}".`,
      })
    }
    if (
      typeof isFamilyHead === 'boolean'
      && isFamilyHead !== canonicalFamily.isFamilyHead
    ) {
      issues.push({
        code: 'WORD_FAMILY_HEAD_MISMATCH',
        path: `${path}.isFamilyHead`,
        message: `Lemma "${lemma}" must use "${canonicalFamily.headLemma}" as its canonical family head.`,
      })
    }
  }
  if (!isDifficulty(difficulty)) {
    issues.push(invalidCatalog(`${path}.difficulty`, 'difficulty is not recognized.'))
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    issues.push(invalidCatalog(`${path}.entries`, 'entries must be a non-empty array.'))
  } else {
    entries.forEach((entry, index) => validateWordEntry(
      entry,
      `${path}.entries[${index}]`,
      seenExampleKeys,
      issues,
    ))
  }

  if (
    !isNonBlankString(id) ||
    !isNonBlankString(lemma) ||
    !isNonBlankString(familyId) ||
    typeof isFamilyHead !== 'boolean'
  ) {
    return undefined
  }

  return {
    id,
    lemma,
    familyId,
    isFamilyHead,
    itemPath: path,
    familyPath: `${path}.familyId`,
  }
}

function validateWordInvariants(
  words: ValidatedWordIdentity[],
  issues: ValidationIssue[],
): Set<string> {
  const ids = new Set<string>()
  const lemmas = new Set<string>()
  const families = new Map<string, { headCount: number; itemCount: number; path: string }>()

  for (const word of words) {
    if (ids.has(word.id)) {
      issues.push(duplicateId(`${word.itemPath}.id`, word.id, 'Word'))
    } else {
      ids.add(word.id)
    }

    if (lemmas.has(word.lemma)) {
      issues.push({
        code: 'DUPLICATE_LEMMA',
        path: `${word.itemPath}.lemma`,
        message: `Lemma "${word.lemma}" appears in more than one word item.`,
      })
    } else {
      lemmas.add(word.lemma)
    }

    const family = families.get(word.familyId) ?? {
      headCount: 0,
      itemCount: 0,
      path: word.familyPath,
    }
    family.itemCount += 1
    if (word.isFamilyHead) {
      family.headCount += 1
    }
    families.set(word.familyId, family)
  }

  for (const [familyId, family] of families) {
    if (family.itemCount !== 1) {
      issues.push({
        code: 'DUPLICATE_WORD_FAMILY',
        path: family.path,
        message: `Family "${familyId}" must contain exactly one catalog item; found ${family.itemCount}.`,
      })
    }
    if (family.headCount !== 1) {
      issues.push({
        code: 'FAMILY_HEAD_COUNT',
        path: family.path,
        message: `Family "${familyId}" must have exactly one head; found ${family.headCount}.`,
      })
    }
  }

  return ids
}

export function validateWordlists(
  value: unknown,
  mode: ValidationMode,
  issues: ValidationIssue[],
): Set<string> {
  const words: ValidatedWordIdentity[] = []
  const seenExampleKeys = new Set<string>()

  if (!isRecord(value)) {
    issues.push(invalidCatalog('wordlists', 'wordlists must be an object keyed by level.'))
    return validateWordInvariants(words, issues)
  }

  for (const level of LEVELS) {
    const levelWords = value[level]
    const levelPath = `wordlists.${level}`

    if (!Array.isArray(levelWords)) {
      issues.push(invalidCatalog(levelPath, `${levelPath} must be an array.`))
      continue
    }

    if (mode === 'release' && levelWords.length !== RELEASE_WORD_COUNTS[level]) {
      issues.push({
        code: 'WORD_COUNT_MISMATCH',
        path: levelPath,
        message: `Expected ${RELEASE_WORD_COUNTS[level]} words for ${level}; found ${levelWords.length}.`,
      })
    }

    levelWords.forEach((item, index) => {
      const word = validateWordItem(
        item,
        level,
        `${levelPath}[${index}]`,
        seenExampleKeys,
        issues,
      )
      if (word) {
        words.push(word)
      }
    })
  }

  return validateWordInvariants(words, issues)
}
