import { readFile, readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'

import { LEVELS } from '../../src/domain/content/types'
import type { Level, StoryContent } from '../../src/domain/content/types'
import {
  MAX_READER_CHAPTER_COUNT,
  MIN_READER_CHAPTER_COUNT,
} from '../../src/domain/content/readerEdition'
import {
  OUTPUT_DIGEST_ALGORITHM,
  OUTPUT_DIGEST_CANONICALIZATION,
  manualStorySourceDigest,
  type OutputDigest,
} from './catalogDigest'

export const APPROVED_MANUAL_STORY_SCHEMA_VERSION = '1.0.0' as const
export const APPROVED_MANUAL_STORY_FILE_SUFFIX = '.approved.json' as const

export interface ManualStoryApproval {
  reviewer: string
  reviewedAt: string
  sourceDigest: OutputDigest
}

export interface ApprovedManualStoryInput {
  schemaVersion: typeof APPROVED_MANUAL_STORY_SCHEMA_VERSION
  story: StoryContent
  approval: ManualStoryApproval
}

export type ApprovedManualStories = Partial<Record<Level, ApprovedManualStoryInput>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const expected = [...fields].sort()
  const actual = Object.keys(value).sort()
  return actual.length === expected.length
    && actual.every((field, index) => field === expected[index])
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateStoryPayload(
  value: Record<string, unknown>,
  expectedLevel: Level,
  path: string,
): string[] {
  const issues: string[] = []
  if (!hasExactFields(value, [
    'schemaVersion',
    'level',
    'title',
    'chapterTitles',
    'isManual',
    'coverage',
    'usedWords',
    'usedPhrasalVerbs',
    'storyText',
  ])) {
    issues.push(
      `${path} must contain exactly schemaVersion, level, title, chapterTitles, isManual, coverage, usedWords, usedPhrasalVerbs, storyText`,
    )
  }

  if (!Array.isArray(value.usedPhrasalVerbs)) {
    issues.push(`${path}.usedPhrasalVerbs must be an array`)
  } else {
    value.usedPhrasalVerbs.forEach((usedPhrasalVerb, index) => {
      const usedPhrasalPath = `${path}.usedPhrasalVerbs[${index}]`
      if (!isRecord(usedPhrasalVerb)) {
        issues.push(`${usedPhrasalPath} must be an object`)
        return
      }
      const fields = [
        'id',
        'phrasalVerb',
        'storyForm',
        'context',
        'senseId',
        'meaningKo',
      ] as const
      if (!hasExactFields(usedPhrasalVerb, fields)) {
        issues.push(`${usedPhrasalPath} must contain exactly ${fields.join(', ')}`)
      }
      for (const field of fields) {
        if (!isNonBlankString(usedPhrasalVerb[field])) {
          issues.push(`${usedPhrasalPath}.${field} must be a non-blank string`)
        }
      }
      if (
        isNonBlankString(usedPhrasalVerb.senseId)
        && !/^[a-f0-9]{64}$/u.test(usedPhrasalVerb.senseId)
      ) {
        issues.push(`${usedPhrasalPath}.senseId must be a lowercase SHA-256 digest`)
      }
    })
  }
  if (value.schemaVersion !== '2.0.0') {
    issues.push(`${path}.schemaVersion must be 2.0.0`)
  }
  if (value.level !== expectedLevel) {
    issues.push(`${path}.level must match ${expectedLevel}`)
  }
  if (!isNonBlankString(value.title)) {
    issues.push(`${path}.title must be a non-blank string`)
  }
  if (
    !Array.isArray(value.chapterTitles)
    || value.chapterTitles.length < MIN_READER_CHAPTER_COUNT
    || value.chapterTitles.length > MAX_READER_CHAPTER_COUNT
    || !value.chapterTitles.every(isNonBlankString)
  ) {
    issues.push(
      `${path}.chapterTitles must contain ${MIN_READER_CHAPTER_COUNT}-${MAX_READER_CHAPTER_COUNT} non-blank strings`,
    )
  }
  if (value.isManual !== true) {
    issues.push(`${path}.isManual must already be true in the approved source`)
  }

  if (!isRecord(value.coverage)) {
    issues.push(`${path}.coverage must be an object`)
  } else {
    if (!hasExactFields(
      value.coverage,
      [
        'mustCoverAll',
        'allowUpperLevelWords',
        'coverageRate',
        'phrasalVerbCoverageRate',
      ],
    )) {
      issues.push(
        `${path}.coverage must contain exactly mustCoverAll, allowUpperLevelWords, coverageRate, phrasalVerbCoverageRate`,
      )
    }
    if (typeof value.coverage.mustCoverAll !== 'boolean') {
      issues.push(`${path}.coverage.mustCoverAll must be a boolean`)
    }
    if (typeof value.coverage.allowUpperLevelWords !== 'boolean') {
      issues.push(`${path}.coverage.allowUpperLevelWords must be a boolean`)
    } else if (value.coverage.allowUpperLevelWords !== false) {
      issues.push(`${path}.coverage.allowUpperLevelWords must be false`)
    }
    if (
      typeof value.coverage.coverageRate !== 'number'
      || !Number.isFinite(value.coverage.coverageRate)
      || value.coverage.coverageRate < 0
      || value.coverage.coverageRate > 1
    ) {
      issues.push(`${path}.coverage.coverageRate must be a number between 0 and 1`)
    }
    if (
      typeof value.coverage.phrasalVerbCoverageRate !== 'number'
      || !Number.isFinite(value.coverage.phrasalVerbCoverageRate)
      || value.coverage.phrasalVerbCoverageRate < 0
      || value.coverage.phrasalVerbCoverageRate > 1
    ) {
      issues.push(
        `${path}.coverage.phrasalVerbCoverageRate must be a number between 0 and 1`,
      )
    }
  }

  if (!Array.isArray(value.usedWords)) {
    issues.push(`${path}.usedWords must be an array`)
  } else {
    value.usedWords.forEach((usedWord, index) => {
      const usedWordPath = `${path}.usedWords[${index}]`
      if (!isRecord(usedWord)) {
        issues.push(`${usedWordPath} must be an object`)
        return
      }
      if (!hasExactFields(usedWord, ['lemma', 'partOfSpeech', 'forms'])) {
        issues.push(`${usedWordPath} must contain exactly lemma, partOfSpeech, forms`)
      }
      if (!isNonBlankString(usedWord.lemma)) {
        issues.push(`${usedWordPath}.lemma must be a non-blank string`)
      }
      if (!isNonBlankString(usedWord.partOfSpeech)) {
        issues.push(`${usedWordPath}.partOfSpeech must be a non-blank string`)
      }
      if (
        !Array.isArray(usedWord.forms)
        || usedWord.forms.length === 0
        || !usedWord.forms.every(isNonBlankString)
      ) {
        issues.push(`${usedWordPath}.forms must contain non-blank strings`)
      }
    })
  }

  if (!isNonBlankString(value.storyText)) {
    issues.push(`${path}.storyText must be a non-blank string`)
  }
  return issues
}

function canonicalReviewTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = new Date(value)
  return Number.isFinite(timestamp.valueOf()) && timestamp.toISOString() === value
}

function digestIssues(
  value: unknown,
  story: StoryContent,
  path: string,
): string[] {
  if (!isRecord(value)) return [`${path} must be an object`]

  const issues: string[] = []
  if (!hasExactFields(value, ['algorithm', 'canonicalization', 'value'])) {
    issues.push(`${path} must contain exactly algorithm, canonicalization, value`)
  }
  if (value.algorithm !== OUTPUT_DIGEST_ALGORITHM) {
    issues.push(`${path}.algorithm must be ${OUTPUT_DIGEST_ALGORITHM}`)
  }
  if (value.canonicalization !== OUTPUT_DIGEST_CANONICALIZATION) {
    issues.push(
      `${path}.canonicalization must be ${OUTPUT_DIGEST_CANONICALIZATION}`,
    )
  }
  if (typeof value.value !== 'string' || !/^[a-f0-9]{64}$/.test(value.value)) {
    issues.push(`${path}.value must be a lowercase SHA-256 digest`)
  } else {
    try {
      if (value.value !== manualStorySourceDigest(story).value) {
        issues.push(`${path}.value must match the exact approved story payload`)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      issues.push(`${path}.value could not be verified: ${detail}`)
    }
  }
  return issues
}

export function validateApprovedManualStory(
  value: unknown,
  expectedLevel: Level,
  path = `approvedManualStories.${expectedLevel}`,
): string[] {
  if (!isRecord(value)) return [`${path} must be an object`]

  const issues: string[] = []
  if (!hasExactFields(value, ['schemaVersion', 'story', 'approval'])) {
    issues.push(`${path} must contain exactly schemaVersion, story, approval`)
  }
  if (value.schemaVersion !== APPROVED_MANUAL_STORY_SCHEMA_VERSION) {
    issues.push(
      `${path}.schemaVersion must be ${APPROVED_MANUAL_STORY_SCHEMA_VERSION}`,
    )
  }

  if (!isRecord(value.story)) {
    issues.push(`${path}.story must be an object`)
  } else {
    issues.push(...validateStoryPayload(value.story, expectedLevel, `${path}.story`))
  }

  if (!isRecord(value.approval)) {
    issues.push(`${path}.approval must be an object`)
  } else {
    if (!hasExactFields(value.approval, ['reviewer', 'reviewedAt', 'sourceDigest'])) {
      issues.push(
        `${path}.approval must contain exactly reviewer, reviewedAt, sourceDigest`,
      )
    }
    if (
      typeof value.approval.reviewer !== 'string'
      || value.approval.reviewer.length === 0
      || value.approval.reviewer !== value.approval.reviewer.trim()
    ) {
      issues.push(`${path}.approval.reviewer must be a trimmed non-blank string`)
    }
    if (!canonicalReviewTimestamp(value.approval.reviewedAt)) {
      issues.push(
        `${path}.approval.reviewedAt must be a canonical UTC ISO timestamp`,
      )
    }
    if (isRecord(value.story)) {
      issues.push(...digestIssues(
        value.approval.sourceDigest,
        value.story as unknown as StoryContent,
        `${path}.approval.sourceDigest`,
      ))
    }
  }

  return issues
}

export function assertApprovedManualStories(
  value: unknown,
): asserts value is ApprovedManualStories {
  if (!isRecord(value)) {
    throw new Error('Approved manual story input failed validation:\napprovedManualStories must be an object')
  }

  const issues = Object.keys(value)
    .filter((key) => !(LEVELS as readonly string[]).includes(key))
    .map((key) => `approvedManualStories.${key} is not a recognized level`)

  for (const level of LEVELS) {
    if (!Object.prototype.hasOwnProperty.call(value, level)) continue
    issues.push(...validateApprovedManualStory(value[level], level))
  }

  if (issues.length > 0) {
    throw new Error([
      `Approved manual story input failed validation with ${issues.length} issue(s):`,
      ...issues,
    ].join('\n'))
  }
}

export function approvedManualStoryPath(root: string, level: Level): string {
  return join(root, `${level}${APPROVED_MANUAL_STORY_FILE_SUFFIX}`)
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

export async function loadApprovedManualStories(
  root: string,
): Promise<ApprovedManualStories> {
  let entries: Dirent<string>[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (isMissingPath(error)) return {}
    throw error
  }

  const expectedNames = new Set(
    LEVELS.map((level) => `${level}${APPROVED_MANUAL_STORY_FILE_SUFFIX}`),
  )
  const unexpected = entries.find(({ name }) =>
    name.endsWith(APPROVED_MANUAL_STORY_FILE_SUFFIX) && !expectedNames.has(name))
  if (unexpected) {
    throw new Error(`Unrecognized approved manual story file: ${join(root, unexpected.name)}`)
  }

  const byName = new Map(entries.map((entry) => [entry.name, entry]))
  const approved: ApprovedManualStories = {}
  for (const level of LEVELS) {
    const filePath = approvedManualStoryPath(root, level)
    const entry = byName.get(`${level}${APPROVED_MANUAL_STORY_FILE_SUFFIX}`)
    if (!entry) continue
    if (!entry.isFile()) {
      throw new Error(`Approved manual story input must be a regular file: ${filePath}`)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to read approved manual story input ${filePath}: ${detail}`, {
        cause: error,
      })
    }
    const issues = validateApprovedManualStory(parsed, level, filePath)
    if (issues.length > 0) {
      throw new Error([
        `Approved manual story input failed validation with ${issues.length} issue(s):`,
        ...issues,
      ].join('\n'))
    }
    approved[level] = parsed as ApprovedManualStoryInput
  }

  return approved
}
