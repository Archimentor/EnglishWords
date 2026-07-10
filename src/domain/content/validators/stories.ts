import { LEVELS } from '../types'
import type { ContentCatalog, Level, ValidationIssue } from '../types'
import {
  invalidCatalog,
  isFiniteNumber,
  isLevel,
  isNonBlankString,
  isRate,
  isRecord,
  validateNonBlankArray,
} from './guards'

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
    if (!isRate(value.coverage.coverageRate)) {
      issues.push(
        invalidCatalog(
          `${path}.coverage.coverageRate`,
          'coverageRate must be a number between 0 and 1.',
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

export function validateStories(value: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push(invalidCatalog('stories', 'stories must be an object keyed by level.'))
    return
  }

  for (const level of LEVELS) {
    validateStory(value[level], level, `stories.${level}`, issues)
  }
}

export function validateStoryCoverage(catalog: ContentCatalog): ValidationIssue[] {
  const value: unknown = catalog
  if (!isRecord(value) || !isRecord(value.wordlists) || !isRecord(value.stories)) {
    return []
  }

  const issues: ValidationIssue[] = []
  const lemmaLevels = new Map<string, number>()
  const wordlists = value.wordlists
  const stories = value.stories

  LEVELS.forEach((level, levelIndex) => {
    const words = wordlists[level]
    if (!Array.isArray(words)) {
      return
    }
    for (const word of words) {
      if (isRecord(word) && isNonBlankString(word.lemma) && !lemmaLevels.has(word.lemma)) {
        lemmaLevels.set(word.lemma, levelIndex)
      }
    }
  })

  LEVELS.forEach((level, storyLevelIndex) => {
    const words = wordlists[level]
    const story = stories[level]
    if (!Array.isArray(words) || !isRecord(story) || !isRecord(story.coverage)) {
      return
    }
    const coverage = story.coverage

    const usedLemmas = new Set<string>()
    if (Array.isArray(story.usedWords)) {
      story.usedWords.forEach((usedWord, index) => {
        if (!isRecord(usedWord) || !isNonBlankString(usedWord.lemma)) {
          return
        }
        usedLemmas.add(usedWord.lemma)

        const wordLevelIndex = lemmaLevels.get(usedWord.lemma)
        if (wordLevelIndex === undefined) {
          issues.push({
            code: 'STORY_UNKNOWN_WORD',
            path: `stories.${level}.usedWords[${index}].lemma`,
            message: `Story for ${level} uses unknown lemma "${usedWord.lemma}".`,
          })
        } else if (
          coverage.allowUpperLevelWords === false &&
          wordLevelIndex > storyLevelIndex
        ) {
          issues.push({
            code: 'STORY_UPPER_LEVEL_WORD',
            path: `stories.${level}.usedWords[${index}].lemma`,
            message: `Story for ${level} cannot use upper-level lemma "${usedWord.lemma}".`,
          })
        }
      })
    }

    if (coverage.mustCoverAll === true && Array.isArray(story.usedWords)) {
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

    if (coverage.mustCoverAll === true && coverage.coverageRate !== 1) {
      issues.push({
        code: 'STORY_COVERAGE_RATE',
        path: `stories.${level}.coverage.coverageRate`,
        message: `Story for ${level} must have coverageRate 1 when mustCoverAll is true.`,
      })
    }
  })

  return issues
}
