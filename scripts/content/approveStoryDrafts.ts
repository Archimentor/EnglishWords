import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { LEVELS } from '../../src/domain/content/types'
import type { Level, PhrasalVerbItem, WordItem } from '../../src/domain/content/types'
import { buildStoryDraft } from './buildStoryDrafts'
import { manualStorySourceDigest } from './catalogDigest'
import {
  APPROVED_MANUAL_STORY_SCHEMA_VERSION,
  approvedManualStoryPath,
  type ApprovedManualStoryInput,
  validateApprovedManualStory,
} from './manualStories'
import { DEFAULT_CONTENT_DATA_ROOT, DEFAULT_MANUAL_STORY_ROOT } from './paths'

interface ApprovalOptions {
  reviewer: string
  reviewedAt: string
  confirmed: boolean
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function parseOptions(args: readonly string[]): ApprovalOptions {
  const reviewer = optionValue(args, '--reviewer')?.trim() ?? ''
  const reviewedAt = optionValue(args, '--reviewed-at')?.trim() ?? ''
  return {
    reviewer,
    reviewedAt,
    confirmed: args.includes('--confirm-user-approved'),
  }
}

function assertOptions(options: ApprovalOptions): void {
  if (!options.confirmed) {
    throw new Error('Refusing to approve drafts without --confirm-user-approved.')
  }
  if (!options.reviewer) throw new Error('--reviewer must be a non-blank name.')
  const timestamp = new Date(options.reviewedAt)
  if (!Number.isFinite(timestamp.valueOf()) || timestamp.toISOString() !== options.reviewedAt) {
    throw new Error('--reviewed-at must be a canonical UTC ISO timestamp.')
  }
}

async function readWordlist(level: Level): Promise<WordItem[]> {
  return JSON.parse(await readFile(
    join(DEFAULT_CONTENT_DATA_ROOT, 'wordlists', `${level}.json`),
    'utf8',
  )) as WordItem[]
}

async function readPhrasalVerbs(level: Level): Promise<PhrasalVerbItem[]> {
  return JSON.parse(await readFile(
    join(DEFAULT_CONTENT_DATA_ROOT, 'phrasal-verbs', 'by-level', `${level}.json`),
    'utf8',
  )) as PhrasalVerbItem[]
}

export async function approveStoryDrafts(options: ApprovalOptions): Promise<void> {
  assertOptions(options)
  await mkdir(DEFAULT_MANUAL_STORY_ROOT, { recursive: true })

  const allowedWords: WordItem[] = []
  for (const level of LEVELS) {
    const words = await readWordlist(level)
    const phrasalVerbs = await readPhrasalVerbs(level)
    allowedWords.push(...words)
    const story = {
      ...buildStoryDraft(level, words, allowedWords, phrasalVerbs),
      isManual: true,
    }
    const input: ApprovedManualStoryInput = {
      schemaVersion: APPROVED_MANUAL_STORY_SCHEMA_VERSION,
      story,
      approval: {
        reviewer: options.reviewer,
        reviewedAt: options.reviewedAt,
        sourceDigest: manualStorySourceDigest(story),
      },
    }
    const issues = validateApprovedManualStory(input, level)
    if (issues.length > 0) {
      throw new Error(`Generated approval for ${level} is invalid:\n${issues.join('\n')}`)
    }
    await writeFile(
      approvedManualStoryPath(DEFAULT_MANUAL_STORY_ROOT, level),
      `${JSON.stringify(input, null, 2)}\n`,
      'utf8',
    )
    console.log(`[story:approve] ${level} ${input.approval.sourceDigest.value}`)
  }
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  approveStoryDrafts(parseOptions(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
