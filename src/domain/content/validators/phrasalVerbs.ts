import { LEVELS } from '../types'
import type { Level, ValidationIssue, ValidationMode } from '../types'
import {
  duplicateId,
  invalidCatalog,
  isDifficulty,
  isLevel,
  isNonBlankString,
  isRecord,
  rejectAdditionalProperties,
  validateNonBlankArray,
} from './guards'

const RELEASE_PHRASAL_COUNT = 250
const PHRASAL_VERB_FIELDS = [
  'id',
  'baseVerb',
  'particle',
  'phrasalVerb',
  'ipa',
  'levelHint',
  'meaningKo',
  'examples',
  'partOfSpeech',
  'usageNotes',
  'difficulty',
] as const

interface ValidatedPhrasalIdentity {
  id: string
  idPath: string
  itemPath: string
  levelHint?: Level
  contentKey?: string
}

interface LeveledPhrasalIdentity extends ValidatedPhrasalIdentity {
  level: Level
}

function validateNonBlankField(
  value: unknown,
  field: string,
  path: string,
  issues: ValidationIssue[],
): value is string {
  if (isNonBlankString(value)) {
    return true
  }
  issues.push(invalidCatalog(`${path}.${field}`, `${field} must be a non-blank string.`))
  return false
}

function validatePhrasalVerbItem(
  item: unknown,
  path: string,
  issues: ValidationIssue[],
): ValidatedPhrasalIdentity | undefined {
  if (!isRecord(item)) {
    issues.push(invalidCatalog(path, 'Phrasal verb item must be an object.'))
    return undefined
  }

  rejectAdditionalProperties(item, PHRASAL_VERB_FIELDS, path, 'phrasal verb', issues)

  const id = item.id
  const baseVerb = item.baseVerb
  const particle = item.particle
  const phrasalVerb = item.phrasalVerb
  const ipa = item.ipa
  const usageNotes = item.usageNotes
  const levelHint = item.levelHint
  const partOfSpeech = item.partOfSpeech
  const difficulty = item.difficulty
  const meaningKo = item.meaningKo
  const examples = item.examples

  const hasId = validateNonBlankField(id, 'id', path, issues)
  const hasBaseVerb = validateNonBlankField(baseVerb, 'baseVerb', path, issues)
  const hasParticle = validateNonBlankField(particle, 'particle', path, issues)
  const hasPhrasalVerb = validateNonBlankField(phrasalVerb, 'phrasalVerb', path, issues)
  const hasIpa = validateNonBlankField(ipa, 'ipa', path, issues)
  const hasUsageNotes = validateNonBlankField(usageNotes, 'usageNotes', path, issues)

  const hasLevelHint = isLevel(levelHint)
  if (!hasLevelHint) {
    issues.push(invalidCatalog(`${path}.levelHint`, 'levelHint is not recognized.'))
  }
  const hasPartOfSpeech = partOfSpeech === 'phrasalVerb'
  if (!hasPartOfSpeech) {
    issues.push(
      invalidCatalog(`${path}.partOfSpeech`, 'partOfSpeech must be "phrasalVerb".'),
    )
  }
  const hasDifficulty = isDifficulty(difficulty)
  if (!hasDifficulty) {
    issues.push(invalidCatalog(`${path}.difficulty`, 'difficulty is not recognized.'))
  }

  const hasMeaningKo = validateNonBlankArray(meaningKo, `${path}.meaningKo`, 1, issues)
  const hasExamples = validateNonBlankArray(examples, `${path}.examples`, 2, issues)

  if (!hasId) {
    return undefined
  }

  const identity: ValidatedPhrasalIdentity = {
    id,
    idPath: `${path}.id`,
    itemPath: path,
  }
  if (hasLevelHint) {
    identity.levelHint = levelHint
  }
  if (
    hasBaseVerb &&
    hasParticle &&
    hasPhrasalVerb &&
    hasIpa &&
    hasLevelHint &&
    hasMeaningKo &&
    hasExamples &&
    hasPartOfSpeech &&
    hasUsageNotes &&
    hasDifficulty
  ) {
    identity.contentKey = JSON.stringify([
      baseVerb,
      particle,
      phrasalVerb,
      ipa,
      levelHint,
      meaningKo,
      examples,
      partOfSpeech,
      usageNotes,
      difficulty,
    ])
  }
  return identity
}

export function validatePhrasalVerbs(
  value: unknown,
  contentIds: Set<string>,
  mode: ValidationMode,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(
      invalidCatalog('phrasalVerbs', 'phrasalVerbs must contain top and byLevel objects.'),
    )
    return
  }

  const topItems: ValidatedPhrasalIdentity[] = []
  if (!Array.isArray(value.top)) {
    issues.push(invalidCatalog('phrasalVerbs.top', 'phrasalVerbs.top must be an array.'))
  } else {
    value.top.forEach((item, index) => {
      const identity = validatePhrasalVerbItem(
        item,
        `phrasalVerbs.top[${index}]`,
        issues,
      )
      if (identity) {
        topItems.push(identity)
      }
    })
  }

  const byLevelItems: LeveledPhrasalIdentity[] = []
  if (!isRecord(value.byLevel)) {
    issues.push(
      invalidCatalog(
        'phrasalVerbs.byLevel',
        'phrasalVerbs.byLevel must be an object keyed by level.',
      ),
    )
  } else {
    for (const level of LEVELS) {
      const items = value.byLevel[level]
      const levelPath = `phrasalVerbs.byLevel.${level}`

      if (!Array.isArray(items)) {
        issues.push(invalidCatalog(levelPath, `${levelPath} must be an array.`))
        continue
      }

      if (mode === 'release' && items.length !== RELEASE_PHRASAL_COUNT) {
        issues.push({
          code: 'PHRASAL_COUNT_MISMATCH',
          path: levelPath,
          message: `Expected ${RELEASE_PHRASAL_COUNT} phrasal verbs for ${level}; found ${items.length}.`,
        })
      }

      items.forEach((item, index) => {
        const itemPath = `${levelPath}[${index}]`
        const identity = validatePhrasalVerbItem(item, itemPath, issues)
        if (!identity) {
          return
        }

        if (identity.levelHint !== undefined && identity.levelHint !== level) {
          issues.push({
            code: 'PHRASAL_LEVEL_MISMATCH',
            path: `${itemPath}.levelHint`,
            message: `Phrasal verb levelHint must match its ${level} byLevel container.`,
          })
        }

        byLevelItems.push({ ...identity, level })
      })
    }
  }

  const topById = new Map<string, ValidatedPhrasalIdentity>()
  for (const item of topItems) {
    if (contentIds.has(item.id) || topById.has(item.id)) {
      issues.push(duplicateId(item.idPath, item.id, 'Phrasal verb'))
    }
    if (!topById.has(item.id)) {
      topById.set(item.id, item)
      contentIds.add(item.id)
    }
  }

  const byLevelById = new Map<string, LeveledPhrasalIdentity>()
  for (const item of byLevelItems) {
    const previous = byLevelById.get(item.id)
    if (previous) {
      if (previous.level === item.level) {
        issues.push(duplicateId(item.idPath, item.id, 'Phrasal verb'))
      } else {
        issues.push({
          code: 'PHRASAL_DUPLICATE_LEVEL',
          path: item.idPath,
          message: `Phrasal verb id "${item.id}" appears in both ${previous.level} and ${item.level}.`,
        })
      }
    } else {
      byLevelById.set(item.id, item)
    }

    const canonical = topById.get(item.id)
    if (
      canonical?.contentKey !== undefined &&
      item.contentKey !== undefined &&
      canonical.contentKey !== item.contentKey
    ) {
      issues.push({
        code: 'PHRASAL_CONTENT_MISMATCH',
        path: item.itemPath,
        message: `Phrasal verb id "${item.id}" differs between top and byLevel.`,
      })
    }

    if (!previous && !canonical) {
      if (contentIds.has(item.id)) {
        issues.push(duplicateId(item.idPath, item.id, 'Phrasal verb'))
      }
      contentIds.add(item.id)
    }
  }

  for (const [id, item] of topById) {
    if (!byLevelById.has(id)) {
      issues.push({
        code: 'PHRASAL_REFERENCE_MISMATCH',
        path: item.idPath,
        message: `Phrasal verb id "${id}" appears in top but not byLevel.`,
      })
    }
  }

  for (const [id, item] of byLevelById) {
    if (!topById.has(id)) {
      issues.push({
        code: 'PHRASAL_REFERENCE_MISMATCH',
        path: item.idPath,
        message: `Phrasal verb id "${id}" appears in byLevel but not top.`,
      })
    }
  }
}
