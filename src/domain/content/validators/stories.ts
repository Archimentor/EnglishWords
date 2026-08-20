import { LEVELS } from '../types'
import { hasWholeWordForm } from '../storyForms'
import type {
  ContentCatalog,
  Level,
  ValidationIssue,
  ValidationMode,
} from '../types'
import {
  invalidCatalog,
  isLevel,
  isNonBlankString,
  isRate,
  isRecord,
  rejectAdditionalProperties,
  validateNonBlankArray,
} from './guards'

const STORY_FIELDS = [
  'schemaVersion',
  'level',
  'title',
  'isManual',
  'coverage',
  'usedWords',
  'storyText',
  'vocabularyPracticeText',
] as const

const STORY_COVERAGE_FIELDS = [
  'mustCoverAll',
  'allowUpperLevelWords',
  'coverageRate',
] as const

const STORY_USED_WORD_FIELDS = ['lemma', 'partOfSpeech', 'forms'] as const

const QUOTED_WORD_ENUMERATION = /[“"]\s*[\p{L}\p{N}]+(?:['’–-][\p{L}\p{N}]+)*\s*[”"]\s*,\s*[“"]/u

interface StoryFormOwner {
  level: Level
  levelIndex: number
  lemmas: Set<string>
}

// A fixed protagonist name is metadata rather than a lexical learning target.
// Every other story token, including closed-class grammar and numerals, must be
// owned by the catalog so the level boundary cannot be bypassed by a whitelist.
const ALLOWED_NON_CATALOG_STORY_TOKENS = new Set([
  'mina', "mina's", 'mina’s',
])

function storyTokenSet(storyText: string): Set<string> {
  return new Set(storyText.toLowerCase().match(/[\p{L}\p{N}]+(?:['’–-][\p{L}\p{N}]+)*/gu) ?? [])
}

function storyContainsForm(storyText: string, tokens: ReadonlySet<string>, form: string): boolean {
  const normalized = form.toLowerCase()
  return /^[\p{L}\p{N}]+(?:['’–-][\p{L}\p{N}]+)*$/u.test(normalized)
    ? tokens.has(normalized)
    : hasWholeWordForm(storyText, form)
}

function isAllowedNonCatalogStoryToken(token: string): boolean {
  return ALLOWED_NON_CATALOG_STORY_TOKENS.has(token)
}

function validatedEntryForms(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(isNonBlankString) ? value : null
  }
  if (!isRecord(value)) return null

  const forms = Object.values(value)
  return forms.length > 0 && forms.every(isNonBlankString) ? forms : null
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

  rejectAdditionalProperties(value, STORY_USED_WORD_FIELDS, path, 'story', issues)

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

function validateNarrativeStructure(
  storyText: string,
  usedWordCount: number,
  path: string,
  issues: ValidationIssue[],
): void {
  if (QUOTED_WORD_ENUMERATION.test(storyText)) {
    issues.push({
      code: 'STORY_WORD_ENUMERATION',
      path,
      message: 'A reviewed story must use vocabulary in prose, not as a quoted word list.',
    })
  }

  // Tiny validation fixtures exercise the schema rather than release-scale prose.
  // Real level stories contain hundreds of required lemmas, so structural checks
  // start at 50 reviewed words and scale with the actual coverage obligation.
  if (usedWordCount < 50) return

  const paragraphs = storyText.trim().split(/\n\s*\n/u).filter((paragraph) => paragraph.trim())
  const sentences = storyText.match(/[^.!?]+[.!?]+/gu) ?? []
  const multiSentenceParagraphs = paragraphs.filter((paragraph) =>
    (paragraph.match(/[.!?]+/gu) ?? []).length >= 2)
  const minaCount = storyText.match(/\bMina\b/gu)?.length ?? 0
  const minimumSentences = 12
  const minimumParagraphs = 7
  const minimumMinaMentions = Math.max(4, Math.ceil(paragraphs.length / 4))
  const firstParagraph = paragraphs[0] ?? ''
  const lastParagraph = paragraphs.at(-1) ?? ''

  if (
    sentences.length < minimumSentences
    || paragraphs.length < minimumParagraphs
    || multiSentenceParagraphs.length < Math.ceil(paragraphs.length / 2)
    || minaCount < minimumMinaMentions
    || !/\bMina\b/u.test(firstParagraph)
    || !/\bMina\b/u.test(lastParagraph)
  ) {
    issues.push({
      code: 'STORY_NARRATIVE_STRUCTURE',
      path,
      message: [
        'A reviewed story must be connected multi-paragraph prose with Mina present from setup to resolution.',
        `Found ${paragraphs.length} paragraphs, ${sentences.length} sentences, ${multiSentenceParagraphs.length} multi-sentence paragraphs, and ${minaCount} Mina mentions.`,
      ].join(' '),
    })
  }
}

function validateStory(
  value: unknown,
  level: Level,
  path: string,
  mode: ValidationMode,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(invalidCatalog(path, 'Story must be an object.'))
    return
  }


  rejectAdditionalProperties(value, STORY_FIELDS, path, 'story', issues)

  if (!isNonBlankString(value.schemaVersion)) {
    issues.push(
      invalidCatalog(`${path}.schemaVersion`, 'schemaVersion must be a non-blank string.'),
    )
  }
  if (!isLevel(value.level) || value.level !== level) {
    issues.push(invalidCatalog(`${path}.level`, `level must match its ${level} story container.`))
  }
  if (!isNonBlankString(value.title)) {
    issues.push(invalidCatalog(`${path}.title`, 'title must be a non-blank string.'))
  }
  if (typeof value.isManual !== 'boolean') {
    issues.push(invalidCatalog(`${path}.isManual`, 'isManual must be a boolean.'))
  } else if (mode === 'release' && value.isManual === false) {
    issues.push({
      code: 'STORY_NOT_MANUAL',
      path: `${path}.isManual`,
      message: `Story for ${level} must be manually reviewed before release.`,
    })
  }

  if (!isRecord(value.coverage)) {
    issues.push(invalidCatalog(`${path}.coverage`, 'coverage must be an object.'))
  } else {
    rejectAdditionalProperties(
      value.coverage,
      STORY_COVERAGE_FIELDS,
      `${path}.coverage`,
      'story',
      issues,
    )
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
  } else if (value.isManual === true && Array.isArray(value.usedWords)) {
    validateNarrativeStructure(
      value.storyText,
      value.usedWords.length,
      `${path}.storyText`,
      issues,
    )
  }
  if (!isNonBlankString(value.vocabularyPracticeText)) {
    issues.push(invalidCatalog(
      `${path}.vocabularyPracticeText`,
      'vocabularyPracticeText must be a non-blank string.',
    ))
  } else if (QUOTED_WORD_ENUMERATION.test(value.vocabularyPracticeText)) {
    issues.push({
      code: 'STORY_WORD_ENUMERATION',
      path: `${path}.vocabularyPracticeText`,
      message: 'Vocabulary practice must use complete scenes, not a quoted word list.',
    })
  }
}

export function validateStories(
  value: unknown,
  mode: ValidationMode,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(invalidCatalog('stories', 'stories must be an object keyed by level.'))
    return
  }

  for (const level of LEVELS) {
    validateStory(value[level], level, `stories.${level}`, mode, issues)
  }
}

export function validateStoryCoverage(catalog: ContentCatalog): ValidationIssue[] {
  const value: unknown = catalog
  if (!isRecord(value) || !isRecord(value.wordlists) || !isRecord(value.stories)) {
    return []
  }

  const issues: ValidationIssue[] = []
  const lemmaLevels = new Map<string, number>()
  const wordsByLemma = new Map<string, Array<Record<string, unknown>>>()
  const formOwners = new Map<string, StoryFormOwner>()
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
      if (isRecord(word) && isNonBlankString(word.lemma) && Array.isArray(word.entries)) {
        const candidates = wordsByLemma.get(word.lemma) ?? []
        candidates.push(word)
        wordsByLemma.set(word.lemma, candidates)

        for (const entry of word.entries) {
          if (!isRecord(entry)) continue
          const forms = validatedEntryForms(entry.forms)
          if (!forms) continue

          for (const form of forms) {
            const normalizedForm = form.toLowerCase()
            const owner = formOwners.get(normalizedForm)
            if (!owner || levelIndex < owner.levelIndex) {
              formOwners.set(normalizedForm, {
                level,
                levelIndex,
                lemmas: new Set([word.lemma]),
              })
            } else if (levelIndex === owner.levelIndex) {
              owner.lemmas.add(word.lemma)
            }
          }
        }
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
    const storyText = isNonBlankString(story.storyText) ? story.storyText : ''
    const vocabularyPracticeText = isNonBlankString(story.vocabularyPracticeText)
      ? story.vocabularyPracticeText
      : ''
    const readingPackageText = `${storyText}\n\n${vocabularyPracticeText}`
    const readingPackageTokens = storyTokenSet(readingPackageText)

    const usedLemmas = new Set<string>()
    const usedFormEntries = new Map<string, { lemma: string; partOfSpeech: string }>()
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

        if (!isNonBlankString(usedWord.partOfSpeech) || !Array.isArray(usedWord.forms)) {
          return
        }
        const lemma = usedWord.lemma
        const partOfSpeech = usedWord.partOfSpeech

        const candidateEntries = (wordsByLemma.get(lemma) ?? [])
          .flatMap((word) => Array.isArray(word.entries) ? word.entries : [])
        const entryRecords = candidateEntries.filter(isRecord)
        if (candidateEntries.length === 0 || entryRecords.length === 0) return
        const matchingEntry = entryRecords.find(
          (entry) => entry.partOfSpeech === partOfSpeech,
        )

        if (!matchingEntry) {
          if (wordLevelIndex !== undefined) {
            issues.push({
              code: 'STORY_POS_MISMATCH',
              path: `stories.${level}.usedWords[${index}].partOfSpeech`,
              message: `Story word "${lemma}" has no "${partOfSpeech}" entry.`,
            })
          }
          return
        }

        const forms = validatedEntryForms(matchingEntry.forms)
        if (!forms) return

        const knownForms = new Set(
          forms.map((form) => form.toLowerCase()),
        )
        usedWord.forms.forEach((form, formIndex) => {
          if (!isNonBlankString(form)) return
          const formPath = `stories.${level}.usedWords[${index}].forms[${formIndex}]`

          if (!knownForms.has(form.toLowerCase())) {
            issues.push({
              code: 'STORY_FORM_UNKNOWN',
              path: formPath,
              message: `Story form "${form}" is not defined for ${lemma} (${partOfSpeech}).`,
            })
            return
          }

          const normalizedForm = form.toLowerCase()
          const existingEntry = usedFormEntries.get(normalizedForm)
          if (
            existingEntry
            && (
              existingEntry.lemma !== lemma
              || existingEntry.partOfSpeech !== partOfSpeech
            )
          ) {
            issues.push({
              code: 'STORY_AMBIGUOUS_FORM',
              path: formPath,
              message: `Story form "${form}" resolves to both ${existingEntry.lemma} (${existingEntry.partOfSpeech}) and ${lemma} (${partOfSpeech}).`,
            })
          } else {
            usedFormEntries.set(normalizedForm, {
              lemma,
              partOfSpeech,
            })
          }

          if (!storyContainsForm(readingPackageText, readingPackageTokens, form)) {
            issues.push({
              code: 'STORY_FORM_MISSING',
              path: formPath,
              message: `Story form "${form}" does not appear as a whole word in the ${level} story.`,
            })
          }
        })
      })
    }

    if (
      coverage.allowUpperLevelWords === false
      && (isNonBlankString(story.storyText) || isNonBlankString(story.vocabularyPracticeText))
    ) {
      const textSections = [
        ['storyText', storyText],
        ['vocabularyPracticeText', vocabularyPracticeText],
      ] as const
      for (const [field, text] of textSections) {
        const tokens = storyTokenSet(text)
        for (const [form, owner] of [...formOwners].sort(([left], [right]) =>
          left.localeCompare(right))) {
          if (
            owner.levelIndex <= storyLevelIndex
            || !storyContainsForm(text, tokens, form)
          ) continue

          issues.push({
            code: 'STORY_UPPER_LEVEL_WORD_IN_TEXT',
            path: `stories.${level}.${field}`,
            message: `Story for ${level} contains upper-level form "${form}" from ${[...owner.lemmas].join(', ')} (${owner.level}).`,
          })
        }
      }
    }

    const textSections = [
      ['storyText', storyText],
      ['vocabularyPracticeText', vocabularyPracticeText],
    ] as const
    for (const [field, text] of textSections) {
      if (!text) continue
      for (const token of [...storyTokenSet(text)].sort((left, right) =>
        left.localeCompare(right))) {
        if (formOwners.has(token) || isAllowedNonCatalogStoryToken(token)) continue

        issues.push({
          code: 'STORY_UNKNOWN_TEXT_WORD',
          path: `stories.${level}.${field}`,
          message: `Story package for ${level} contains unregistered lexical token "${token}".`,
        })
      }
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
