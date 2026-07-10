import { DIFFICULTIES, LEVELS } from './types'
import type {
  ContentCatalog,
  Difficulty,
  GrammarDifficultyTag,
  GrammarLevel,
  Level,
  ValidationIssue,
  ValidationMode,
} from './types'

type UnknownRecord = Record<string, unknown>

const GRAMMAR_LEVELS: readonly GrammarLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1']
const GRAMMAR_DIFFICULTY_TAGS: readonly GrammarDifficultyTag[] = [
  'core',
  'expansion',
  'integration',
  'complex',
  'precision',
]
const GRAMMAR_NODE_ID = /^(A1|A2|B1|B2|C1)-G\d{2}$/
const GRAMMAR_NODE_COUNT = 42
const RELEASE_WORD_COUNTS: Record<Level, number> = {
  기초: 500,
  유치원: 500,
  초등학교: 1500,
  중학교: 2500,
}
const RELEASE_PHRASAL_COUNT = 250

interface ValidatedWordIdentity {
  id: string
  idPath: string
  lemma: string
  familyId: string
  isFamilyHead: boolean
  familyPath: string
}

interface ValidatedId {
  id: string
  idPath: string
}

interface ValidatedPhrasalIdentity extends ValidatedId {
  levelHint?: Level
}

interface LeveledPhrasalIdentity extends ValidatedId {
  level: Level
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

function isNonBlankStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonBlankString)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value)
}

function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value)
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
    idPath: `${path}.id`,
    lemma,
    familyId,
    isFamilyHead,
    familyPath: `${path}.familyId`,
  }
}

function validateWordInvariants(
  words: ValidatedWordIdentity[],
  issues: ValidationIssue[],
): Set<string> {
  const ids = new Set<string>()
  const lemmas = new Set<string>()
  const families = new Map<string, { headCount: number; path: string }>()

  for (const word of words) {
    const itemPath = word.familyPath.slice(0, -'.familyId'.length)

    if (ids.has(word.id)) {
      issues.push({
        code: 'DUPLICATE_ID',
        path: word.idPath,
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

  return ids
}

function validateNonBlankArray(
  value: unknown,
  path: string,
  minimumLength: number,
  issues: ValidationIssue[],
): void {
  if (!isNonBlankStringArray(value)) {
    issues.push(invalidCatalog(path, `${path} must be an array of non-blank strings.`))
  } else if (value.length < minimumLength) {
    issues.push(
      invalidCatalog(path, `${path} must contain at least ${minimumLength} item(s).`),
    )
  }
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

  for (const field of ['id', 'baseVerb', 'particle', 'phrasalVerb', 'usageNotes'] as const) {
    if (!isNonBlankString(item[field])) {
      issues.push(invalidCatalog(`${path}.${field}`, `${field} must be a non-blank string.`))
    }
  }

  if (!isLevel(item.levelHint)) {
    issues.push(invalidCatalog(`${path}.levelHint`, 'levelHint is not recognized.'))
  }
  if (item.partOfSpeech !== 'phrasalVerb') {
    issues.push(
      invalidCatalog(`${path}.partOfSpeech`, 'partOfSpeech must be "phrasalVerb".'),
    )
  }
  if (!isDifficulty(item.difficulty)) {
    issues.push(invalidCatalog(`${path}.difficulty`, 'difficulty is not recognized.'))
  }

  validateNonBlankArray(item.meaningKo, `${path}.meaningKo`, 1, issues)
  validateNonBlankArray(item.examples, `${path}.examples`, 2, issues)

  if (!isNonBlankString(item.id)) {
    return undefined
  }

  const identity: ValidatedPhrasalIdentity = {
    id: item.id,
    idPath: `${path}.id`,
  }
  if (isLevel(item.levelHint)) {
    identity.levelHint = item.levelHint
  }
  return identity
}

function duplicateId(path: string, id: string, subject = 'Content'): ValidationIssue {
  return {
    code: 'DUPLICATE_ID',
    path,
    message: `${subject} id "${id}" appears more than once.`,
  }
}

function validatePhrasalVerbs(
  value: unknown,
  wordIds: Set<string>,
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

        byLevelItems.push({ id: identity.id, idPath: identity.idPath, level })
      })
    }
  }

  const topById = new Map<string, ValidatedPhrasalIdentity>()
  for (const item of topItems) {
    if (wordIds.has(item.id) || topById.has(item.id)) {
      issues.push(duplicateId(item.idPath, item.id, 'Phrasal verb'))
    }
    if (!topById.has(item.id)) {
      topById.set(item.id, item)
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

    if (!topById.has(item.id) && wordIds.has(item.id)) {
      issues.push(duplicateId(item.idPath, item.id, 'Phrasal verb'))
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
    if (!isFiniteNumber(node.masteryRule.quizAccuracy)) {
      issues.push(
        invalidCatalog(
          `${path}.masteryRule.quizAccuracy`,
          'quizAccuracy must be a finite number.',
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
    if (!isFiniteNumber(node.masteryRule.errorTolerance)) {
      issues.push(
        invalidCatalog(
          `${path}.masteryRule.errorTolerance`,
          'errorTolerance must be a finite number.',
        ),
      )
    }
  }

  return isNonBlankString(id) ? { id, idPath: `${path}.id` } : undefined
}

function validateGrammarNodes(value: unknown, issues: ValidationIssue[]): void {
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

  const ids = new Set<string>()
  value.forEach((node, index) => {
    const identity = validateGrammarNode(node, `grammarNodes[${index}]`, issues)
    if (!identity) {
      return
    }
    if (ids.has(identity.id)) {
      issues.push(duplicateId(identity.idPath, identity.id, 'Grammar node'))
    } else {
      ids.add(identity.id)
    }
  })
}

function validateStoryUsedWord(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(invalidCatalog(path, 'Story usedWords item must be an object.'))
    return
  }

  if (!isNonBlankString(value.lemma)) {
    issues.push(invalidCatalog(`${path}.lemma`, 'lemma must be a non-blank string.'))
  }
  if (!isNonBlankString(value.partOfSpeech)) {
    issues.push(
      invalidCatalog(`${path}.partOfSpeech`, 'partOfSpeech must be a non-blank string.'),
    )
  }
  validateNonBlankArray(value.forms, `${path}.forms`, 1, issues)
}

function validateStory(
  value: unknown,
  level: Level,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(invalidCatalog(path, 'Story must be an object.'))
    return
  }

  if (!isFiniteNumber(value.schemaVersion)) {
    issues.push(invalidCatalog(`${path}.schemaVersion`, 'schemaVersion must be a finite number.'))
  }
  if (!isLevel(value.level) || value.level !== level) {
    issues.push(invalidCatalog(`${path}.level`, `level must match its ${level} story container.`))
  }
  if (!isNonBlankString(value.title)) {
    issues.push(invalidCatalog(`${path}.title`, 'title must be a non-blank string.'))
  }
  if (typeof value.isManual !== 'boolean') {
    issues.push(invalidCatalog(`${path}.isManual`, 'isManual must be a boolean.'))
  }

  if (!isRecord(value.coverage)) {
    issues.push(invalidCatalog(`${path}.coverage`, 'coverage must be an object.'))
  } else {
    if (typeof value.coverage.mustCoverAll !== 'boolean') {
      issues.push(
        invalidCatalog(`${path}.coverage.mustCoverAll`, 'mustCoverAll must be a boolean.'),
      )
    }
    if (typeof value.coverage.allowUpperLevelWords !== 'boolean') {
      issues.push(
        invalidCatalog(
          `${path}.coverage.allowUpperLevelWords`,
          'allowUpperLevelWords must be a boolean.',
        ),
      )
    }
    if (!isFiniteNumber(value.coverage.coverageRate)) {
      issues.push(
        invalidCatalog(
          `${path}.coverage.coverageRate`,
          'coverageRate must be a finite number.',
        ),
      )
    }
  }

  if (!Array.isArray(value.usedWords)) {
    issues.push(invalidCatalog(`${path}.usedWords`, 'usedWords must be an array.'))
  } else {
    value.usedWords.forEach((word, index) =>
      validateStoryUsedWord(word, `${path}.usedWords[${index}]`, issues),
    )
  }

  if (!isNonBlankString(value.storyText)) {
    issues.push(invalidCatalog(`${path}.storyText`, 'storyText must be a non-blank string.'))
  }
}

function validateStories(value: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push(invalidCatalog('stories', 'stories must be an object keyed by level.'))
    return
  }

  for (const level of LEVELS) {
    validateStory(value[level], level, `stories.${level}`, issues)
  }
}

export function validateCatalog(catalog: unknown, mode: ValidationMode): ValidationIssue[] {
  if (!isRecord(catalog)) {
    return [invalidCatalog('catalog', 'Catalog must be an object.')]
  }

  const issues: ValidationIssue[] = []
  const words: ValidatedWordIdentity[] = []

  if (!isRecord(catalog.wordlists)) {
    issues.push(invalidCatalog('wordlists', 'wordlists must be an object keyed by level.'))
  } else {
    for (const level of LEVELS) {
      const levelWords = catalog.wordlists[level]
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
        const word = validateWordItem(item, level, `${levelPath}[${index}]`, issues)
        if (word) {
          words.push(word)
        }
      })
    }
  }

  const wordIds = validateWordInvariants(words, issues)
  validatePhrasalVerbs(catalog.phrasalVerbs, wordIds, mode, issues)
  validateGrammarNodes(catalog.grammarNodes, issues)
  validateStories(catalog.stories, issues)

  return issues
}

export function validateStoryCoverage(catalog: ContentCatalog): ValidationIssue[] {
  const value: unknown = catalog
  if (!isRecord(value) || !isRecord(value.wordlists) || !isRecord(value.stories)) {
    return []
  }

  const issues: ValidationIssue[] = []

  for (const level of LEVELS) {
    const words = value.wordlists[level]
    const story = value.stories[level]
    if (!Array.isArray(words) || !isRecord(story) || !isRecord(story.coverage)) {
      continue
    }
    if (story.coverage.mustCoverAll !== true) {
      continue
    }

    if (Array.isArray(story.usedWords)) {
      const usedLemmas = new Set<string>()
      for (const usedWord of story.usedWords) {
        if (isRecord(usedWord) && isNonBlankString(usedWord.lemma)) {
          usedLemmas.add(usedWord.lemma)
        }
      }

      const requiredLemmas = new Set<string>()
      for (const word of words) {
        if (isRecord(word) && isNonBlankString(word.lemma)) {
          requiredLemmas.add(word.lemma)
        }
      }

      for (const lemma of requiredLemmas) {
        if (!usedLemmas.has(lemma)) {
          issues.push({
            code: 'STORY_COVERAGE_MISSING',
            path: `stories.${level}.usedWords`,
            message: `Story for ${level} is missing required lemma "${lemma}".`,
          })
        }
      }
    }

    if (story.coverage.coverageRate !== 1) {
      issues.push({
        code: 'STORY_COVERAGE_RATE',
        path: `stories.${level}.coverage.coverageRate`,
        message: `Story for ${level} must have coverageRate 1 when mustCoverAll is true.`,
      })
    }
  }

  return issues
}
