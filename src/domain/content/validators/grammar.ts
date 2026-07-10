import { GRAMMAR_DIFFICULTY_TAGS, GRAMMAR_LEVELS } from '../types'
import type {
  GrammarDifficultyTag,
  GrammarLevel,
  ValidationIssue,
} from '../types'
import {
  duplicateId,
  invalidCatalog,
  isNonBlankString,
  isRate,
  isRecord,
  validateNonBlankArray,
} from './guards'

const GRAMMAR_NODE_COUNTS: Record<GrammarLevel, number> = {
  A1: 8,
  A2: 9,
  B1: 9,
  B2: 9,
  C1: 7,
}
const EXPECTED_GRAMMAR_NODE_IDS = GRAMMAR_LEVELS.flatMap((level) =>
  Array.from(
    { length: GRAMMAR_NODE_COUNTS[level] },
    (_, index) => `${level}-G${String(index + 1).padStart(2, '0')}`,
  ),
)
const GRAMMAR_NODE_ID = new RegExp(`^(${GRAMMAR_LEVELS.join('|')})-G\\d{2}$`)
const GRAMMAR_NODE_COUNT = EXPECTED_GRAMMAR_NODE_IDS.length

interface ValidatedId {
  id: string
  idPath: string
}

function isGrammarLevel(value: unknown): value is GrammarLevel {
  return typeof value === 'string' && (GRAMMAR_LEVELS as readonly string[]).includes(value)
}

function isGrammarDifficultyTag(value: unknown): value is GrammarDifficultyTag {
  return (
    typeof value === 'string' &&
    (GRAMMAR_DIFFICULTY_TAGS as readonly string[]).includes(value)
  )
}

function validateGrammarNode(
  node: unknown,
  path: string,
  issues: ValidationIssue[],
): ValidatedId | undefined {
  if (!isRecord(node)) {
    issues.push(invalidCatalog(path, 'Grammar node must be an object.'))
    return undefined
  }

  const id = node.id
  if (!isNonBlankString(id)) {
    issues.push(invalidCatalog(`${path}.id`, 'id must be a non-blank string.'))
  } else if (!GRAMMAR_NODE_ID.test(id)) {
    issues.push({
      code: 'INVALID_GRAMMAR_NODE_ID',
      path: `${path}.id`,
      message: `Grammar node id "${id}" must match ${GRAMMAR_NODE_ID.source}.`,
    })
  }

  if (!isGrammarLevel(node.level)) {
    issues.push(invalidCatalog(`${path}.level`, 'level is not a recognized grammar level.'))
  } else {
    const idMatch = isNonBlankString(id) ? GRAMMAR_NODE_ID.exec(id) : null
    if (idMatch && idMatch[1] !== node.level) {
      issues.push({
        code: 'GRAMMAR_LEVEL_MISMATCH',
        path: `${path}.level`,
        message: `Grammar node level "${node.level}" must match id prefix "${idMatch[1]}".`,
      })
    }
  }

  if (!isNonBlankString(node.title)) {
    issues.push(invalidCatalog(`${path}.title`, 'title must be a non-blank string.'))
  }
  if (node.prerequisite !== null && !isNonBlankString(node.prerequisite)) {
    issues.push(
      invalidCatalog(
        `${path}.prerequisite`,
        'prerequisite must be null or a non-blank string.',
      ),
    )
  }
  if (!isGrammarDifficultyTag(node.difficultyTag)) {
    issues.push(
      invalidCatalog(`${path}.difficultyTag`, 'difficultyTag is not recognized.'),
    )
  }
  if (!isNonBlankString(node.summary)) {
    issues.push(invalidCatalog(`${path}.summary`, 'summary must be a non-blank string.'))
  }

  validateNonBlankArray(node.canDo, `${path}.canDo`, 3, issues)
  validateNonBlankArray(node.patterns, `${path}.patterns`, 1, issues)
  validateNonBlankArray(node.examples, `${path}.examples`, 1, issues)
  validateNonBlankArray(node.errorCodes, `${path}.errorCodes`, 1, issues)

  if (!isRecord(node.masteryRule)) {
    issues.push(invalidCatalog(`${path}.masteryRule`, 'masteryRule must be an object.'))
  } else {
    if (!isRate(node.masteryRule.quizAccuracy)) {
      issues.push(
        invalidCatalog(
          `${path}.masteryRule.quizAccuracy`,
          'quizAccuracy must be a number between 0 and 1.',
        ),
      )
    }
    if (typeof node.masteryRule.productionPass !== 'boolean') {
      issues.push(
        invalidCatalog(
          `${path}.masteryRule.productionPass`,
          'productionPass must be a boolean.',
        ),
      )
    }
    if (!isRate(node.masteryRule.errorTolerance)) {
      issues.push(
        invalidCatalog(
          `${path}.masteryRule.errorTolerance`,
          'errorTolerance must be a number between 0 and 1.',
        ),
      )
    }
  }

  return isNonBlankString(id) ? { id, idPath: `${path}.id` } : undefined
}

export function validateGrammarNodes(
  value: unknown,
  contentIds: Set<string>,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(invalidCatalog('grammarNodes', 'grammarNodes must be an array.'))
    return
  }

  if (value.length !== GRAMMAR_NODE_COUNT) {
    issues.push({
      code: 'GRAMMAR_NODE_COUNT',
      path: 'grammarNodes',
      message: `Expected exactly ${GRAMMAR_NODE_COUNT} grammar nodes; found ${value.length}.`,
    })
  }

  value.forEach((node, index) => {
    const identity = validateGrammarNode(node, `grammarNodes[${index}]`, issues)
    const expectedId = EXPECTED_GRAMMAR_NODE_IDS[index]

    if (identity && identity.id !== expectedId) {
      issues.push({
        code: 'GRAMMAR_NODE_SET_MISMATCH',
        path: identity.idPath,
        message: expectedId
          ? `Expected grammar node id "${expectedId}" at index ${index}; found "${identity.id}".`
          : `Grammar node id "${identity.id}" is not in the authoritative node set.`,
      })
    }

    if (isRecord(node) && expectedId !== undefined) {
      const expectedPrerequisite = index === 0 ? null : EXPECTED_GRAMMAR_NODE_IDS[index - 1]
      if (node.prerequisite !== expectedPrerequisite) {
        issues.push({
          code: 'GRAMMAR_PREREQUISITE_MISMATCH',
          path: `grammarNodes[${index}].prerequisite`,
          message: `Grammar node "${expectedId}" must reference ${expectedPrerequisite ?? 'null'} as its prerequisite.`,
        })
      }
    }

    if (!identity) {
      return
    }
    if (contentIds.has(identity.id)) {
      issues.push(duplicateId(identity.idPath, identity.id, 'Grammar node'))
    } else {
      contentIds.add(identity.id)
    }
  })
}
