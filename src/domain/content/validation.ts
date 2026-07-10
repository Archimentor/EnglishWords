import { DIFFICULTIES, LEVELS } from './types'
import type { Difficulty, Level, ValidationIssue, ValidationMode } from './types'

type UnknownRecord = Record<string, unknown>

interface ValidatedWordIdentity {
  id: string
  lemma: string
  familyId: string
  isFamilyHead: boolean
  familyPath: string
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value)
}

function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value)
}

function isWordForms(value: unknown): boolean {
  if (isStringArray(value)) {
    return true
  }

  return isRecord(value) && Object.values(value).every((form) => typeof form === 'string')
}

function invalidCatalog(path: string, message: string): ValidationIssue {
  return { code: 'INVALID_CATALOG', path, message }
}

function validateWordEntry(
  entry: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(entry)) {
    issues.push(invalidCatalog(path, 'Word entry must be an object.'))
    return
  }

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
  }
}

function validateWordItem(
  item: unknown,
  level: Level,
  path: string,
  issues: ValidationIssue[],
): ValidatedWordIdentity | undefined {
  if (!isRecord(item)) {
    issues.push(invalidCatalog(path, 'Word item must be an object.'))
    return undefined
  }

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
  if (!isDifficulty(difficulty)) {
    issues.push(invalidCatalog(`${path}.difficulty`, 'difficulty is not recognized.'))
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    issues.push(invalidCatalog(`${path}.entries`, 'entries must be a non-empty array.'))
  } else {
    entries.forEach((entry, index) => validateWordEntry(entry, `${path}.entries[${index}]`, issues))
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
    familyPath: `${path}.familyId`,
  }
}

function validateWordInvariants(
  words: ValidatedWordIdentity[],
  issues: ValidationIssue[],
): void {
  const ids = new Set<string>()
  const lemmas = new Set<string>()
  const families = new Map<string, { headCount: number; path: string }>()

  for (const word of words) {
    const itemPath = word.familyPath.slice(0, -'.familyId'.length)

    if (ids.has(word.id)) {
      issues.push({
        code: 'DUPLICATE_ID',
        path: `${itemPath}.id`,
        message: `Word id "${word.id}" appears more than once.`,
      })
    } else {
      ids.add(word.id)
    }

    if (lemmas.has(word.lemma)) {
      issues.push({
        code: 'DUPLICATE_LEMMA',
        path: `${itemPath}.lemma`,
        message: `Lemma "${word.lemma}" appears in more than one word item.`,
      })
    } else {
      lemmas.add(word.lemma)
    }

    const family = families.get(word.familyId) ?? { headCount: 0, path: word.familyPath }
    if (word.isFamilyHead) {
      family.headCount += 1
    }
    families.set(word.familyId, family)
  }

  for (const [familyId, family] of families) {
    if (family.headCount !== 1) {
      issues.push({
        code: 'FAMILY_HEAD_COUNT',
        path: family.path,
        message: `Family "${familyId}" must have exactly one head; found ${family.headCount}.`,
      })
    }
  }
}

export function validateCatalog(catalog: unknown, mode: ValidationMode): ValidationIssue[] {
  void mode

  if (!isRecord(catalog)) {
    return [invalidCatalog('catalog', 'Catalog must be an object.')]
  }

  if (!isRecord(catalog.wordlists)) {
    return [invalidCatalog('wordlists', 'wordlists must be an object keyed by level.')]
  }

  const issues: ValidationIssue[] = []
  const words: ValidatedWordIdentity[] = []

  for (const level of LEVELS) {
    const levelWords = catalog.wordlists[level]
    const levelPath = `wordlists.${level}`

    if (!Array.isArray(levelWords)) {
      issues.push(invalidCatalog(levelPath, `${levelPath} must be an array.`))
      continue
    }

    levelWords.forEach((item, index) => {
      const word = validateWordItem(item, level, `${levelPath}[${index}]`, issues)
      if (word) {
        words.push(word)
      }
    })
  }

  validateWordInvariants(words, issues)
  return issues
}
