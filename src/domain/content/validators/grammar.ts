import {
  GRAMMAR_DIFFICULTY_TAGS,
  GRAMMAR_EXAMPLE_DIFFICULTIES,
  GRAMMAR_EXERCISE_PHASES,
  GRAMMAR_EXERCISE_TYPES,
  GRAMMAR_LEVELS,
} from '../types'
import type {
  GrammarDifficultyTag,
  GrammarLevel,
  GrammarProductionConstraints,
  ValidationIssue,
} from '../types'
import {
  grammarProductionConstraintsForLevel,
  grammarProductionConstraintsMatchLevel,
} from '../../grammar/productionConstraints'
import {
  duplicateId,
  invalidCatalog,
  isNonBlankString,
  isRecord,
  rejectAdditionalProperties,
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
const GRAMMAR_NODE_FIELDS = [
  'id',
  'level',
  'title',
  'prerequisite',
  'difficultyTag',
  'canDo',
  'summary',
  'rules',
  'patterns',
  'examples',
  'exercises',
  'productionTask',
  'errorCodes',
  'errorNotes',
  'masteryRule',
] as const
const GRAMMAR_RULE_FIELDS = [
  'heading',
  'explanation',
  'keyPoints',
  'exceptions',
] as const
const GRAMMAR_EXAMPLE_FIELDS = ['english', 'korean', 'difficulty'] as const
const GRAMMAR_EXERCISE_FIELDS = [
  'id',
  'phase',
  'type',
  'prompt',
  'choices',
  'answer',
  'explanation',
  'errorCode',
] as const
const GRAMMAR_PRODUCTION_TASK_FIELDS = [
  'prompt',
  'requirements',
  'rubric',
  'constraints',
] as const
const GRAMMAR_PRODUCTION_CONSTRAINT_FIELDS = [
  'profileId',
  'minSentences',
  'maxSentences',
  'maxRevisionRounds',
  'rubricEvidenceCount',
  'parts',
  'evidenceRequirements',
] as const
const GRAMMAR_PRODUCTION_PART_FIELDS = [
  'id',
  'label',
  'register',
  'minSentences',
  'maxSentences',
] as const
const GRAMMAR_PRODUCTION_EVIDENCE_FIELDS = [
  'id',
  'label',
  'minSelections',
  'requiredPartIds',
] as const
const GRAMMAR_ERROR_NOTE_FIELDS = [
  'code',
  'title',
  'wrongExample',
  'correction',
  'reviewRule',
] as const
const GRAMMAR_MASTERY_RULE_FIELDS = [
  'quizAccuracy',
  'productionPass',
  'errorTolerance',
] as const

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

function validateUniqueStrings(
  values: unknown,
  path: string,
  minimumLength: number,
  issues: ValidationIssue[],
): values is string[] {
  if (!validateNonBlankArray(values, path, minimumLength, issues)) return false
  if (new Set(values).size !== values.length) {
    issues.push(invalidCatalog(path, `${path} must not contain duplicate values.`))
    return false
  }
  return true
}

function validateRules(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.length < 2) {
    issues.push(invalidCatalog(path, `${path} must contain at least 2 detailed rules.`))
    return
  }

  value.forEach((rule, index) => {
    const rulePath = `${path}[${index}]`
    if (!isRecord(rule)) {
      issues.push(invalidCatalog(rulePath, 'Grammar rule must be an object.'))
      return
    }
    rejectAdditionalProperties(rule, GRAMMAR_RULE_FIELDS, rulePath, 'grammar rule', issues)
    if (!isNonBlankString(rule.heading)) {
      issues.push(invalidCatalog(`${rulePath}.heading`, 'heading must be a non-blank string.'))
    }
    if (!isNonBlankString(rule.explanation)) {
      issues.push(
        invalidCatalog(`${rulePath}.explanation`, 'explanation must be a non-blank string.'),
      )
    }
    validateUniqueStrings(rule.keyPoints, `${rulePath}.keyPoints`, 2, issues)
    validateUniqueStrings(rule.exceptions, `${rulePath}.exceptions`, 1, issues)
  })
}

function validateExamples(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.length < 2) {
    issues.push(invalidCatalog(path, `${path} must contain at least 2 translated examples.`))
    return
  }

  value.forEach((example, index) => {
    const examplePath = `${path}[${index}]`
    if (!isRecord(example)) {
      issues.push(invalidCatalog(examplePath, 'Grammar example must be an object.'))
      return
    }
    rejectAdditionalProperties(
      example,
      GRAMMAR_EXAMPLE_FIELDS,
      examplePath,
      'grammar example',
      issues,
    )
    for (const field of ['english', 'korean'] as const) {
      if (!isNonBlankString(example[field])) {
        issues.push(
          invalidCatalog(`${examplePath}.${field}`, `${field} must be a non-blank string.`),
        )
      }
    }
    if (
      typeof example.difficulty !== 'string' ||
      !(GRAMMAR_EXAMPLE_DIFFICULTIES as readonly string[]).includes(example.difficulty)
    ) {
      issues.push(
        invalidCatalog(`${examplePath}.difficulty`, 'difficulty is not recognized.'),
      )
    }
  })
}

function validateExercises(
  value: unknown,
  path: string,
  errorCodes: readonly string[],
  issues: ValidationIssue[],
): Set<string> {
  const trackedErrorCodes = new Set<string>()
  if (!Array.isArray(value) || value.length !== GRAMMAR_EXERCISE_PHASES.length) {
    issues.push(
      invalidCatalog(
        path,
        `${path} must contain exactly one diagnostic, practice, and rediagnostic exercise.`,
      ),
    )
    return trackedErrorCodes
  }

  const ids = new Set<string>()
  const phases = new Set<string>()
  const phaseCounts = new Map<string, number>()
  value.forEach((exercise, index) => {
    const exercisePath = `${path}[${index}]`
    if (!isRecord(exercise)) {
      issues.push(invalidCatalog(exercisePath, 'Grammar exercise must be an object.'))
      return
    }
    rejectAdditionalProperties(
      exercise,
      GRAMMAR_EXERCISE_FIELDS,
      exercisePath,
      'grammar exercise',
      issues,
    )
    if (!isNonBlankString(exercise.id)) {
      issues.push(invalidCatalog(`${exercisePath}.id`, 'id must be a non-blank string.'))
    } else if (ids.has(exercise.id)) {
      issues.push(invalidCatalog(`${exercisePath}.id`, `Exercise id "${exercise.id}" is duplicated.`))
    } else {
      ids.add(exercise.id)
    }

    const phase = exercise.phase
    if (
      typeof phase !== 'string' ||
      !(GRAMMAR_EXERCISE_PHASES as readonly string[]).includes(phase)
    ) {
      issues.push(invalidCatalog(`${exercisePath}.phase`, 'phase is not recognized.'))
    } else {
      phases.add(phase)
      phaseCounts.set(phase, (phaseCounts.get(phase) ?? 0) + 1)
      if (isNonBlankString(exercise.errorCode)) {
        trackedErrorCodes.add(exercise.errorCode)
      }
    }

    const type = exercise.type
    if (
      typeof type !== 'string' ||
      !(GRAMMAR_EXERCISE_TYPES as readonly string[]).includes(type)
    ) {
      issues.push(invalidCatalog(`${exercisePath}.type`, 'type is not recognized.'))
    }

    for (const field of ['prompt', 'answer', 'explanation'] as const) {
      if (!isNonBlankString(exercise[field])) {
        issues.push(
          invalidCatalog(`${exercisePath}.${field}`, `${field} must be a non-blank string.`),
        )
      }
    }

    if (!Array.isArray(exercise.choices) || !exercise.choices.every(isNonBlankString)) {
      issues.push(
        invalidCatalog(`${exercisePath}.choices`, 'choices must be an array of non-blank strings.'),
      )
    } else if (type === 'choice') {
      if (exercise.choices.length < 2 || new Set(exercise.choices).size !== exercise.choices.length) {
        issues.push(
          invalidCatalog(
            `${exercisePath}.choices`,
            'A choice exercise must contain at least 2 unique choices.',
          ),
        )
      }
      if (isNonBlankString(exercise.answer) && !exercise.choices.includes(exercise.answer)) {
        issues.push(
          invalidCatalog(
            `${exercisePath}.answer`,
            'A choice exercise answer must appear in choices.',
          ),
        )
      }
    } else if (exercise.choices.length !== 0) {
      issues.push(
        invalidCatalog(
          `${exercisePath}.choices`,
          'Only choice exercises may define answer choices.',
        ),
      )
    }

    if (!isNonBlankString(exercise.errorCode) || !errorCodes.includes(exercise.errorCode)) {
      issues.push(
        invalidCatalog(
          `${exercisePath}.errorCode`,
          'errorCode must be a non-blank member of the node errorCodes.',
        ),
      )
    }
  })

  for (const phase of GRAMMAR_EXERCISE_PHASES) {
    if (!phases.has(phase)) {
      issues.push(
        invalidCatalog(path, `${path} must include a ${phase} exercise.`),
      )
    }
    if ((phaseCounts.get(phase) ?? 0) > 1) {
      issues.push(
        invalidCatalog(path, `${path} must include exactly one ${phase} exercise.`),
      )
    }
  }

  return trackedErrorCodes
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value > 0
}

function isNullableSentenceMaximum(
  value: unknown,
  minimum: unknown,
): value is number | null {
  return value === null || (
    isPositiveInteger(value) &&
    isPositiveInteger(minimum) &&
    value >= minimum
  )
}

function validateProductionConstraints(
  value: unknown,
  path: string,
  level: GrammarLevel | null,
  issues: ValidationIssue[],
): value is GrammarProductionConstraints {
  if (!isRecord(value)) {
    issues.push(invalidCatalog(path, 'constraints must be an object.'))
    return false
  }
  rejectAdditionalProperties(
    value,
    GRAMMAR_PRODUCTION_CONSTRAINT_FIELDS,
    path,
    'grammar production constraints',
    issues,
  )

  let valid = true
  if (!isNonBlankString(value.profileId)) {
    issues.push(invalidCatalog(`${path}.profileId`, 'profileId must be a non-blank string.'))
    valid = false
  }
  if (!isPositiveInteger(value.minSentences)) {
    issues.push(invalidCatalog(`${path}.minSentences`, 'minSentences must be a positive integer.'))
    valid = false
  }
  if (!isNullableSentenceMaximum(value.maxSentences, value.minSentences)) {
    issues.push(invalidCatalog(
      `${path}.maxSentences`,
      'maxSentences must be null or an integer no smaller than minSentences.',
    ))
    valid = false
  }
  if (!(value.maxRevisionRounds === null || (
    Number.isInteger(value.maxRevisionRounds) &&
    typeof value.maxRevisionRounds === 'number' &&
    value.maxRevisionRounds >= 0
  ))) {
    issues.push(invalidCatalog(
      `${path}.maxRevisionRounds`,
      'maxRevisionRounds must be null or a non-negative integer.',
    ))
    valid = false
  }
  if (!isPositiveInteger(value.rubricEvidenceCount)) {
    issues.push(invalidCatalog(
      `${path}.rubricEvidenceCount`,
      'rubricEvidenceCount must be a positive integer.',
    ))
    valid = false
  }

  const partIds = new Set<string>()
  if (!Array.isArray(value.parts) || value.parts.length === 0) {
    issues.push(invalidCatalog(`${path}.parts`, 'parts must contain at least one part.'))
    valid = false
  } else {
    value.parts.forEach((part, index) => {
      const partPath = `${path}.parts[${index}]`
      if (!isRecord(part)) {
        issues.push(invalidCatalog(partPath, 'Production part constraint must be an object.'))
        valid = false
        return
      }
      rejectAdditionalProperties(
        part,
        GRAMMAR_PRODUCTION_PART_FIELDS,
        partPath,
        'grammar production part constraint',
        issues,
      )
      if (!isNonBlankString(part.id) || partIds.has(part.id)) {
        issues.push(invalidCatalog(`${partPath}.id`, 'Part id must be non-blank and unique.'))
        valid = false
      } else {
        partIds.add(part.id)
      }
      if (!isNonBlankString(part.label)) {
        issues.push(invalidCatalog(`${partPath}.label`, 'Part label must be a non-blank string.'))
        valid = false
      }
      if (!(part.register === null || isNonBlankString(part.register))) {
        issues.push(invalidCatalog(
          `${partPath}.register`,
          'Part register must be null or a non-blank string.',
        ))
        valid = false
      }
      if (!isPositiveInteger(part.minSentences)) {
        issues.push(invalidCatalog(
          `${partPath}.minSentences`,
          'Part minSentences must be a positive integer.',
        ))
        valid = false
      }
      if (!isNullableSentenceMaximum(part.maxSentences, part.minSentences)) {
        issues.push(invalidCatalog(
          `${partPath}.maxSentences`,
          'Part maxSentences must be null or no smaller than minSentences.',
        ))
        valid = false
      }
    })
  }

  const evidenceIds = new Set<string>()
  if (!Array.isArray(value.evidenceRequirements) || value.evidenceRequirements.length === 0) {
    issues.push(invalidCatalog(
      `${path}.evidenceRequirements`,
      'evidenceRequirements must contain at least one fail-closed review requirement.',
    ))
    valid = false
  } else {
    value.evidenceRequirements.forEach((requirement, index) => {
      const requirementPath = `${path}.evidenceRequirements[${index}]`
      if (!isRecord(requirement)) {
        issues.push(invalidCatalog(
          requirementPath,
          'Production evidence constraint must be an object.',
        ))
        valid = false
        return
      }
      rejectAdditionalProperties(
        requirement,
        GRAMMAR_PRODUCTION_EVIDENCE_FIELDS,
        requirementPath,
        'grammar production evidence constraint',
        issues,
      )
      if (!isNonBlankString(requirement.id) || evidenceIds.has(requirement.id)) {
        issues.push(invalidCatalog(
          `${requirementPath}.id`,
          'Evidence requirement id must be non-blank and unique.',
        ))
        valid = false
      } else {
        evidenceIds.add(requirement.id)
      }
      if (!isNonBlankString(requirement.label)) {
        issues.push(invalidCatalog(
          `${requirementPath}.label`,
          'Evidence requirement label must be a non-blank string.',
        ))
        valid = false
      }
      if (!isPositiveInteger(requirement.minSelections)) {
        issues.push(invalidCatalog(
          `${requirementPath}.minSelections`,
          'minSelections must be a positive integer.',
        ))
        valid = false
      }
      if (
        !Array.isArray(requirement.requiredPartIds) ||
        !requirement.requiredPartIds.every(isNonBlankString) ||
        new Set(requirement.requiredPartIds).size !== requirement.requiredPartIds.length ||
        requirement.requiredPartIds.some((partId) => !partIds.has(partId)) ||
        (isPositiveInteger(requirement.minSelections) &&
          requirement.requiredPartIds.length > requirement.minSelections)
      ) {
        issues.push(invalidCatalog(
          `${requirementPath}.requiredPartIds`,
          'requiredPartIds must be unique known parts covered by minSelections.',
        ))
        valid = false
      }
    })
  }

  if (
    valid &&
    level &&
    !grammarProductionConstraintsMatchLevel(
      level,
      value as unknown as GrammarProductionConstraints,
    )
  ) {
    issues.push(invalidCatalog(
      path,
      `${level} production constraints must match the canonical ${grammarProductionConstraintsForLevel(level).profileId} profile.`,
    ))
    return false
  }
  return valid
}

function validateProductionTask(
  value: unknown,
  path: string,
  level: GrammarLevel | null,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(invalidCatalog(path, 'productionTask must be an object.'))
    return
  }
  rejectAdditionalProperties(
    value,
    GRAMMAR_PRODUCTION_TASK_FIELDS,
    path,
    'grammar production task',
    issues,
  )
  if (!isNonBlankString(value.prompt)) {
    issues.push(invalidCatalog(`${path}.prompt`, 'prompt must be a non-blank string.'))
  }
  validateUniqueStrings(value.requirements, `${path}.requirements`, 2, issues)
  const rubric = value.rubric
  const constraints = value.constraints
  const rubricValid = validateUniqueStrings(rubric, `${path}.rubric`, 2, issues)
  const constraintsValid = validateProductionConstraints(
    constraints,
    `${path}.constraints`,
    level,
    issues,
  )
  if (
    rubricValid &&
    constraintsValid &&
    rubric.length !== constraints.rubricEvidenceCount
  ) {
    issues.push(invalidCatalog(
      `${path}.rubric`,
      `rubric must contain exactly ${constraints.rubricEvidenceCount} criteria.`,
    ))
  }
}

function validateErrorNotes(
  value: unknown,
  path: string,
  errorCodes: readonly string[],
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value) || value.length < errorCodes.length) {
    issues.push(
      invalidCatalog(path, `${path} must describe every node error code.`),
    )
    return
  }

  const noteCodes: string[] = []
  value.forEach((note, index) => {
    const notePath = `${path}[${index}]`
    if (!isRecord(note)) {
      issues.push(invalidCatalog(notePath, 'Grammar error note must be an object.'))
      return
    }
    rejectAdditionalProperties(
      note,
      GRAMMAR_ERROR_NOTE_FIELDS,
      notePath,
      'grammar error note',
      issues,
    )
    for (const field of [
      'code',
      'title',
      'wrongExample',
      'correction',
      'reviewRule',
    ] as const) {
      if (!isNonBlankString(note[field])) {
        issues.push(
          invalidCatalog(`${notePath}.${field}`, `${field} must be a non-blank string.`),
        )
      }
    }
    if (isNonBlankString(note.code)) noteCodes.push(note.code)
  })

  if (
    noteCodes.length !== errorCodes.length ||
    new Set(noteCodes).size !== noteCodes.length ||
    errorCodes.some((code) => !noteCodes.includes(code))
  ) {
    issues.push(
      invalidCatalog(path, 'errorNotes codes must match errorCodes exactly once.'),
    )
  }
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

  rejectAdditionalProperties(node, GRAMMAR_NODE_FIELDS, path, 'grammar node', issues)

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

  validateUniqueStrings(node.canDo, `${path}.canDo`, 3, issues)
  validateRules(node.rules, `${path}.rules`, issues)
  validateUniqueStrings(node.patterns, `${path}.patterns`, 1, issues)
  validateExamples(node.examples, `${path}.examples`, issues)
  const errorCodes = validateUniqueStrings(node.errorCodes, `${path}.errorCodes`, 1, issues)
    ? node.errorCodes
    : []
  const exerciseErrorCodes = validateExercises(
    node.exercises,
    `${path}.exercises`,
    errorCodes,
    issues,
  )
  validateProductionTask(
    node.productionTask,
    `${path}.productionTask`,
    isGrammarLevel(node.level) ? node.level : null,
    issues,
  )
  validateErrorNotes(node.errorNotes, `${path}.errorNotes`, errorCodes, issues)
  const productionChecks = isRecord(node.productionTask)
    ? JSON.stringify([node.productionTask.requirements, node.productionTask.rubric])
    : ''
  for (const code of errorCodes) {
    if (!exerciseErrorCodes.has(code) && !productionChecks.includes(code)) {
      issues.push(invalidCatalog(
        `${path}.errorCodes`,
        `${code} must be linked to an exercise or an explicit production check.`,
      ))
    }
  }

  if (!isRecord(node.masteryRule)) {
    issues.push(invalidCatalog(`${path}.masteryRule`, 'masteryRule must be an object.'))
  } else {
    rejectAdditionalProperties(
      node.masteryRule,
      GRAMMAR_MASTERY_RULE_FIELDS,
      `${path}.masteryRule`,
      'grammar mastery rule',
      issues,
    )
    if (node.masteryRule.quizAccuracy !== 0.8) {
      issues.push(
        invalidCatalog(
          `${path}.masteryRule.quizAccuracy`,
          'quizAccuracy must be the planned mastery threshold 0.8.',
        ),
      )
    }
    if (node.masteryRule.productionPass !== true) {
      issues.push(
        invalidCatalog(
          `${path}.masteryRule.productionPass`,
          'productionPass must be true for the required production review gate.',
        ),
      )
    }
    if (node.masteryRule.errorTolerance !== 0.2) {
      issues.push(
        invalidCatalog(
          `${path}.masteryRule.errorTolerance`,
          'errorTolerance must be the planned mastery threshold 0.2.',
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

  const seenNodeIds = new Set<string>()
  const exceptionGuidance = new Map<string, string>()
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

    if (isRecord(node) && isNonBlankString(node.prerequisite)) {
      if (!seenNodeIds.has(node.prerequisite)) {
        issues.push({
          code: 'GRAMMAR_PREREQUISITE_MISMATCH',
          path: `grammarNodes[${index}].prerequisite`,
          message: `Grammar prerequisite "${node.prerequisite}" must reference an earlier node.`,
        })
      }
    } else if (isRecord(node) && index > 0 && node.prerequisite === null) {
      issues.push({
        code: 'GRAMMAR_PREREQUISITE_MISMATCH',
        path: `grammarNodes[${index}].prerequisite`,
        message: `Grammar node "${expectedId ?? index}" must declare an earlier prerequisite.`,
      })
    }

    if (isRecord(node) && Array.isArray(node.rules)) {
      node.rules.forEach((rule, ruleIndex) => {
        if (!isRecord(rule) || !Array.isArray(rule.exceptions)) return
        rule.exceptions.forEach((exception, exceptionIndex) => {
          if (!isNonBlankString(exception) || !/^[A-Z]+-\d+:\s*/u.test(exception)) return
          const normalized = exception
            .replace(/^[A-Z]+-\d+:\s*/u, '')
            .normalize('NFKC')
            .replace(/\s+/gu, ' ')
            .trim()
            .toLocaleLowerCase('ko-KR')
          const currentPath = `grammarNodes[${index}].rules[${ruleIndex}].exceptions[${exceptionIndex}]`
          const firstPath = exceptionGuidance.get(normalized)
          if (firstPath) {
            issues.push({
              code: 'DUPLICATE_GRAMMAR_GUIDANCE',
              path: currentPath,
              message: `Grammar exception guidance duplicates ${firstPath}.`,
            })
          } else {
            exceptionGuidance.set(normalized, currentPath)
          }
        })
      })
    }

    if (!identity) return
    seenNodeIds.add(identity.id)
    if (contentIds.has(identity.id)) {
      issues.push(duplicateId(identity.idPath, identity.id, 'Grammar node'))
    } else {
      contentIds.add(identity.id)
    }
  })
}
