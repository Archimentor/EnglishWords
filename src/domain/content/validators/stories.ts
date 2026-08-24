import {
  auditReaderEdition,
  buildReaderEdition,
  MAX_READER_CHAPTER_COUNT,
  MIN_READER_CHAPTER_COUNT,
} from '../readerEdition'
import { readerPhrasalVerbMeanings } from '../phrasalMeaning'
import { readerStoryCoverage } from '../readerStory'
import { entryFormStrings, hasWholeWordForm } from '../storyForms'
import { englishStoryVocabularyText, inspectStoryVocabulary } from '../storyVocabulary'
import { LEVELS } from '../types'
import type {
  ContentCatalog,
  Level,
  ValidationIssue,
  ValidationMode,
  WordItem,
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
  'chapterTitles',
  'isManual',
  'coverage',
  'usedWords',
  'usedPhrasalVerbs',
  'storyText',
] as const

const STORY_COVERAGE_FIELDS = [
  'mustCoverAll',
  'allowUpperLevelWords',
  'coverageRate',
  'phrasalVerbCoverageRate',
] as const

const STORY_USED_WORD_FIELDS = ['lemma', 'partOfSpeech', 'forms'] as const
const STORY_USED_PHRASAL_VERB_FIELDS = [
  'id',
  'phrasalVerb',
  'storyForm',
  'context',
  'senseId',
  'meaningKo',
] as const

const QUOTED_WORD_ENUMERATION = /[“"]\s*[\p{L}\p{N}]+(?:['’–-][\p{L}\p{N}]+)*\s*[”"]\s*,\s*[“"]/u

function validateStoryUsedWord(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(invalidCatalog(path, 'Story usedWords item must be an object.'))
    return
  }
  rejectAdditionalProperties(value, STORY_USED_WORD_FIELDS, path, 'story word', issues)
  if (!isNonBlankString(value.lemma)) {
    issues.push(invalidCatalog(`${path}.lemma`, 'lemma must be a non-blank string.'))
  }
  if (!isNonBlankString(value.partOfSpeech)) {
    issues.push(invalidCatalog(
      `${path}.partOfSpeech`,
      'partOfSpeech must be a non-blank string.',
    ))
  }
  validateNonBlankArray(value.forms, `${path}.forms`, 1, issues)
}

function validateStoryUsedPhrasalVerb(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(invalidCatalog(path, 'Story usedPhrasalVerbs item must be an object.'))
    return
  }
  rejectAdditionalProperties(
    value,
    STORY_USED_PHRASAL_VERB_FIELDS,
    path,
    'story phrasal verb',
    issues,
  )
  for (const field of STORY_USED_PHRASAL_VERB_FIELDS) {
    if (!isNonBlankString(value[field])) {
      issues.push(invalidCatalog(`${path}.${field}`, `${field} must be a non-blank string.`))
    }
  }
  if (isNonBlankString(value.senseId) && !/^[a-f0-9]{64}$/u.test(value.senseId)) {
    issues.push(invalidCatalog(
      `${path}.senseId`,
      'senseId must be a lowercase SHA-256 digest.',
    ))
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
    issues.push(invalidCatalog(`${path}.schemaVersion`, 'schemaVersion must be non-blank.'))
  }
  if (!isLevel(value.level) || value.level !== level) {
    issues.push(invalidCatalog(`${path}.level`, `level must match ${level}.`))
  }
  if (!isNonBlankString(value.title)) {
    issues.push(invalidCatalog(`${path}.title`, 'title must be non-blank.'))
  }
  if (
    !Array.isArray(value.chapterTitles)
    || value.chapterTitles.length < MIN_READER_CHAPTER_COUNT
    || value.chapterTitles.length > MAX_READER_CHAPTER_COUNT
    || !value.chapterTitles.every(isNonBlankString)
  ) {
    issues.push(invalidCatalog(
      `${path}.chapterTitles`,
      `chapterTitles must contain ${MIN_READER_CHAPTER_COUNT}-${MAX_READER_CHAPTER_COUNT} non-blank titles.`,
    ))
  }
  if (typeof value.isManual !== 'boolean') {
    issues.push(invalidCatalog(`${path}.isManual`, 'isManual must be a boolean.'))
  } else if (mode === 'release' && value.isManual === false) {
    issues.push({
      code: 'STORY_NOT_MANUAL',
      path: `${path}.isManual`,
      message: `Story for ${level} must be reviewed before release.`,
    })
  }

  if (!isRecord(value.coverage)) {
    issues.push(invalidCatalog(`${path}.coverage`, 'coverage must be an object.'))
  } else {
    rejectAdditionalProperties(
      value.coverage,
      STORY_COVERAGE_FIELDS,
      `${path}.coverage`,
      'story coverage',
      issues,
    )
    if (typeof value.coverage.mustCoverAll !== 'boolean') {
      issues.push(invalidCatalog(
        `${path}.coverage.mustCoverAll`,
        'mustCoverAll must be a boolean.',
      ))
    }
    if (value.coverage.allowUpperLevelWords !== false) {
      issues.push({
        code: 'STORY_UPPER_LEVEL_WORDS_ALLOWED',
        path: `${path}.coverage.allowUpperLevelWords`,
        message: 'Stories may use only their own and lower-level vocabulary.',
      })
    }
    if (!isRate(value.coverage.coverageRate)) {
      issues.push(invalidCatalog(
        `${path}.coverage.coverageRate`,
        'coverageRate must be a number between 0 and 1.',
      ))
    }
    if (!isRate(value.coverage.phrasalVerbCoverageRate)) {
      issues.push(invalidCatalog(
        `${path}.coverage.phrasalVerbCoverageRate`,
        'phrasalVerbCoverageRate must be a number between 0 and 1.',
      ))
    }
  }

  if (!Array.isArray(value.usedWords)) {
    issues.push(invalidCatalog(`${path}.usedWords`, 'usedWords must be an array.'))
  } else {
    value.usedWords.forEach((item, index) =>
      validateStoryUsedWord(item, `${path}.usedWords[${index}]`, issues))
  }
  if (!Array.isArray(value.usedPhrasalVerbs)) {
    issues.push(invalidCatalog(
      `${path}.usedPhrasalVerbs`,
      'usedPhrasalVerbs must be an array.',
    ))
  } else {
    value.usedPhrasalVerbs.forEach((item, index) =>
      validateStoryUsedPhrasalVerb(
        item,
        `${path}.usedPhrasalVerbs[${index}]`,
        issues,
      ))
  }
  if (!isNonBlankString(value.storyText)) {
    issues.push(invalidCatalog(`${path}.storyText`, 'storyText must be non-blank.'))
  } else if (QUOTED_WORD_ENUMERATION.test(value.storyText)) {
    issues.push({
      code: 'STORY_WORD_ENUMERATION',
      path: `${path}.storyText`,
      message: 'The novel must use vocabulary in prose, not as a quoted word list.',
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
  for (const level of LEVELS) validateStory(value[level], level, `stories.${level}`, mode, issues)
}

function matchingWordEntry(
  words: readonly WordItem[],
  lemma: string,
  partOfSpeech: string,
): WordItem['entries'][number] | undefined {
  return words
    .filter((word) => word.lemma === lemma)
    .flatMap(({ entries }) => entries)
    .find((entry) => entry.partOfSpeech === partOfSpeech)
}

function normalizedContext(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[‘’]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()
}

function storySentenceContexts(text: string): ReadonlySet<string> {
  return new Set(
    (text.match(/[^.!?]+[.!?]+|[^.!?]+$/gu) ?? [])
      .map(normalizedContext)
      .filter(Boolean),
  )
}

export function validateStoryCoverage(catalog: ContentCatalog): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const allCatalogWords = LEVELS.flatMap((level) => catalog.wordlists[level])

  for (const [levelIndex, level] of LEVELS.entries()) {
    const story = catalog.stories[level]
    const targetWords = catalog.wordlists[level]
    const targetPhrasalVerbs = catalog.phrasalVerbs.byLevel[level]
    const allowedPhrasalVerbs = LEVELS
      .slice(0, levelIndex + 1)
      .flatMap((allowedLevel) => catalog.phrasalVerbs.byLevel[allowedLevel])
    const allowedWords = LEVELS
      .slice(0, levelIndex + 1)
      .flatMap((allowedLevel) => catalog.wordlists[allowedLevel])
    const path = `stories.${level}`

    let edition
    try {
      edition = buildReaderEdition(story, allowedWords)
    } catch (error) {
      issues.push({
        code: 'STORY_CHAPTER_STRUCTURE',
        path: `${path}.storyText`,
        message: error instanceof Error ? error.message : String(error),
      })
      continue
    }
    const editionAudit = auditReaderEdition(edition)
    if (editionAudit.shortChapterIndexes.length > 0) {
      issues.push({
        code: 'STORY_CHAPTER_TOO_SHORT',
        path: `${path}.storyText`,
        message: `Every chapter must contain developed prose; short chapters: ${editionAudit.shortChapterIndexes.map((index) => index + 1).join(', ')}.`,
      })
    }

    const vocabulary = inspectStoryVocabulary(
      story.storyText,
      allowedWords,
      allCatalogWords,
      story.usedPhrasalVerbs,
    )
    const frontMatterVocabulary = inspectStoryVocabulary(
      englishStoryVocabularyText([story.title, ...story.chapterTitles].join('. ')),
      allowedWords,
      allCatalogWords,
    )
    for (const violation of vocabulary.violations) {
      issues.push({
        code: violation.catalogLevel === null
          ? 'STORY_UNKNOWN_TEXT_WORD'
          : 'STORY_UPPER_LEVEL_WORD_IN_TEXT',
        path: `${path}.storyText`,
        message: violation.catalogLevel === null
          ? `Novel for ${level} contains unregistered lexical token "${violation.token}".`
          : `Novel for ${level} contains upper-level form "${violation.token}" (${violation.catalogLevel}).`,
      })
    }
    for (const violation of frontMatterVocabulary.violations) {
      issues.push({
        code: violation.catalogLevel === null
          ? 'STORY_UNKNOWN_TITLE_WORD'
          : 'STORY_UPPER_LEVEL_TITLE_WORD',
        path: `${path}.chapterTitles`,
        message: violation.catalogLevel === null
          ? `Novel title material for ${level} contains unregistered token "${violation.token}".`
          : `Novel title material for ${level} contains upper-level form "${violation.token}" (${violation.catalogLevel}).`,
      })
    }

    const usedLemmas = new Set<string>()
    const duplicateLemmas = new Set<string>()
    for (const [index, usedWord] of story.usedWords.entries()) {
      const usedPath = `${path}.usedWords[${index}]`
      if (usedLemmas.has(usedWord.lemma)) duplicateLemmas.add(usedWord.lemma)
      usedLemmas.add(usedWord.lemma)
      const entry = matchingWordEntry(allowedWords, usedWord.lemma, usedWord.partOfSpeech)
      if (!entry) {
        issues.push({
          code: 'STORY_UNKNOWN_WORD',
          path: `${usedPath}.lemma`,
          message: `No allowed ${usedWord.partOfSpeech} entry exists for "${usedWord.lemma}".`,
        })
        continue
      }
      const knownForms = new Set(entryFormStrings(entry).map((form) => form.toLowerCase()))
      for (const [formIndex, form] of usedWord.forms.entries()) {
        if (!knownForms.has(form.toLowerCase())) {
          issues.push({
            code: 'STORY_FORM_UNKNOWN',
            path: `${usedPath}.forms[${formIndex}]`,
            message: `Story form "${form}" is not defined for ${usedWord.lemma}.`,
          })
        } else if (!hasWholeWordForm(story.storyText, form)) {
          issues.push({
            code: 'STORY_FORM_MISSING',
            path: `${usedPath}.forms[${formIndex}]`,
            message: `Story form "${form}" does not occur in the novel.`,
          })
        }
      }
    }
    for (const lemma of duplicateLemmas) {
      issues.push({
        code: 'STORY_WORD_DUPLICATE',
        path: `${path}.usedWords`,
        message: `Story repeats used-word lemma "${lemma}".`,
      })
    }

    const phrasalsById = new Map(allowedPhrasalVerbs.map((item) => [item.id, item]))
    const contextSet = storySentenceContexts(story.storyText)
    const usedPhrasalIds = new Set<string>()
    for (const [index, use] of story.usedPhrasalVerbs.entries()) {
      const usePath = `${path}.usedPhrasalVerbs[${index}]`
      if (usedPhrasalIds.has(use.id)) {
        issues.push({
          code: 'STORY_PHRASAL_DUPLICATE',
          path: `${usePath}.id`,
          message: `Novel repeats phrasal verb id "${use.id}".`,
        })
      }
      usedPhrasalIds.add(use.id)
      const item = phrasalsById.get(use.id)
      if (!item) {
        issues.push({
          code: 'STORY_UNKNOWN_PHRASAL',
          path: `${usePath}.id`,
          message: `Novel uses an unknown or wrong-level phrasal verb id "${use.id}".`,
        })
        continue
      }
      if (use.phrasalVerb !== item.phrasalVerb) {
        issues.push({
          code: 'STORY_PHRASAL_MISMATCH',
          path: `${usePath}.phrasalVerb`,
          message: `Phrasal verb must match catalog id "${use.id}".`,
        })
      }
      const readerMeaning = readerPhrasalVerbMeanings(item)[0]
      if (!readerMeaning || use.meaningKo !== readerMeaning) {
        issues.push({
          code: 'STORY_PHRASAL_MEANING_MISMATCH',
          path: `${usePath}.meaningKo`,
          message: `Displayed Korean meaning for "${use.phrasalVerb}" must match its audited reader sense.`,
        })
      }
      if (
        !contextSet.has(normalizedContext(use.context))
        || !hasWholeWordForm(use.context, use.storyForm)
      ) {
        issues.push({
          code: 'STORY_PHRASAL_CONTEXT_MISSING',
          path: `${usePath}.context`,
          message: `Approved context and story form for "${use.phrasalVerb}" must occur in one exact novel sentence.`,
        })
      }
    }

    const coverage = readerStoryCoverage(
      story.storyText,
      targetWords,
      targetPhrasalVerbs,
      story.usedPhrasalVerbs,
    )
    const actualCoverageRate = coverage.wordTotalCount === 0
      ? 0
      : coverage.wordCoveredCount / coverage.wordTotalCount
    if (Math.abs(story.coverage.coverageRate - actualCoverageRate) > 1e-12) {
      issues.push({
        code: 'STORY_COVERAGE_RATE',
        path: `${path}.coverage.coverageRate`,
        message: `coverageRate must equal actual target-level prose coverage (${actualCoverageRate}).`,
      })
    }
    const actualPhrasalVerbCoverageRate = coverage.phrasalVerbTotalCount === 0
      ? 0
      : coverage.phrasalVerbCoveredCount / coverage.phrasalVerbTotalCount
    if (
      Math.abs(
        story.coverage.phrasalVerbCoverageRate - actualPhrasalVerbCoverageRate,
      ) > 1e-12
    ) {
      issues.push({
        code: 'STORY_PHRASAL_COVERAGE_RATE',
        path: `${path}.coverage.phrasalVerbCoverageRate`,
        message: `phrasalVerbCoverageRate must equal actual target-level prose coverage (${actualPhrasalVerbCoverageRate}).`,
      })
    }
    const actualTargetLemmas = new Set(
      targetWords
        .filter(({ id }) => !coverage.missingWordIds.includes(id))
        .map(({ lemma }) => lemma),
    )
    for (const lemma of actualTargetLemmas) {
      if (!usedLemmas.has(lemma)) {
        issues.push({
          code: 'STORY_USED_WORD_MISSING',
          path: `${path}.usedWords`,
          message: `Actual target-level prose word "${lemma}" is missing from metadata.`,
        })
      }
    }
    for (const lemma of usedLemmas) {
      if (!actualTargetLemmas.has(lemma)) {
        issues.push({
          code: 'STORY_USED_WORD_EXTRA',
          path: `${path}.usedWords`,
          message: `Metadata word "${lemma}" is not an actual target-level prose word.`,
        })
      }
    }
    if (story.isManual && !story.coverage.mustCoverAll) {
      issues.push({
        code: 'STORY_FULL_COVERAGE_REQUIRED',
        path: `${path}.coverage.mustCoverAll`,
        message: `Approved novel for ${level} must cover every target-level word and phrasal verb.`,
      })
    }
    if (story.coverage.mustCoverAll) {
      for (const lemma of coverage.missingWordLemmas) {
        issues.push({
          code: 'STORY_COVERAGE_MISSING',
          path: `${path}.storyText`,
          message: `Novel for ${level} is missing required word "${lemma}".`,
        })
      }
      for (const phrasalVerb of coverage.missingPhrasalVerbs) {
        issues.push({
          code: 'STORY_PHRASAL_COVERAGE_MISSING',
          path: `${path}.storyText`,
          message: `Novel for ${level} is missing required phrasal verb "${phrasalVerb}".`,
        })
      }
    }
  }

  return issues
}
