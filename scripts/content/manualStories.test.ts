import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { Level, StoryContent } from '../../src/domain/content/types'
import { manualStorySourceDigest } from './catalogDigest'
import {
  approvedManualStoryPath,
  loadApprovedManualStories,
  validateApprovedManualStory,
  type ApprovedManualStoryInput,
} from './manualStories'
import { DEFAULT_MANUAL_STORY_ROOT } from './paths'

function storyFixture(level: Level = '기초'): StoryContent {
  return {
    schemaVersion: '2.0.0',
    level,
    title: '사람이 검수한 이야기',
    chapterTitles: ['하나', '둘', '셋', '넷', '다섯', '여섯'],
    isManual: true,
    coverage: {
      mustCoverAll: false,
      allowUpperLevelWords: false,
      coverageRate: 0,
      phrasalVerbCoverageRate: 0,
    },
    usedWords: [],
    usedPhrasalVerbs: [],
    storyText: 'Mina.',
  }
}

function approvedInput(story = storyFixture()): ApprovedManualStoryInput {
  return {
    schemaVersion: '1.0.0',
    story,
    approval: {
      reviewer: 'editor@example.com',
      reviewedAt: '2026-08-20T00:00:00.000Z',
      sourceDigest: manualStorySourceDigest(story),
    },
  }
}

describe('approved manual story inputs', () => {
  it('loads an exact per-level canonical input and leaves missing levels absent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wordmaster-manual-stories-'))
    try {
      const input = approvedInput()
      await writeFile(
        approvedManualStoryPath(directory, '기초'),
        `${JSON.stringify(input, null, 2)}\n`,
        'utf8',
      )

      await expect(loadApprovedManualStories(directory)).resolves.toEqual({ 기초: input })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects a changed story, non-canonical review timestamp, or automated draft flag', () => {
    const changedStory = approvedInput()
    changedStory.story.title = 'digest 이후 바뀐 제목'

    const badTimestamp = approvedInput()
    badTimestamp.approval.reviewedAt = '2026-08-20'

    const automatedStory = storyFixture()
    automatedStory.isManual = false
    const automatedInput = approvedInput(automatedStory)

    const upperLevelStory = storyFixture()
    const coverage = upperLevelStory.coverage as { allowUpperLevelWords: boolean }
    coverage.allowUpperLevelWords = true
    const upperLevelInput = approvedInput(upperLevelStory)

    expect(validateApprovedManualStory(changedStory, '기초')).toContainEqual(
      expect.stringContaining('approval.sourceDigest.value'),
    )
    expect(validateApprovedManualStory(badTimestamp, '기초')).toContainEqual(
      expect.stringContaining('approval.reviewedAt'),
    )
    expect(validateApprovedManualStory(automatedInput, '기초')).toContainEqual(
      expect.stringContaining('story.isManual'),
    )
    expect(validateApprovedManualStory(upperLevelInput, '기초')).toContainEqual(
      expect.stringContaining('story.coverage.allowUpperLevelWords must be false'),
    )
  })

  it('requires every reviewer, reviewedAt, and sourceDigest approval field', () => {
    const missingReviewer = structuredClone(approvedInput()) as unknown as {
      approval: Record<string, unknown>
    }
    const missingReviewedAt = structuredClone(approvedInput()) as unknown as {
      approval: Record<string, unknown>
    }
    const missingSourceDigest = structuredClone(approvedInput()) as unknown as {
      approval: Record<string, unknown>
    }
    delete missingReviewer.approval.reviewer
    delete missingReviewedAt.approval.reviewedAt
    delete missingSourceDigest.approval.sourceDigest

    expect(validateApprovedManualStory(missingReviewer, '기초')).toContainEqual(
      expect.stringContaining('approval.reviewer'),
    )
    expect(validateApprovedManualStory(missingReviewedAt, '기초')).toContainEqual(
      expect.stringContaining('approval.reviewedAt'),
    )
    expect(validateApprovedManualStory(missingSourceDigest, '기초')).toContainEqual(
      expect.stringContaining('approval.sourceDigest'),
    )
  })

  it('rejects a digest-valid input whose story payload is structurally incomplete', () => {
    const incompleteStory = {
      schemaVersion: '1.0.0',
      level: '기초',
      isManual: true,
    } as unknown as StoryContent
    const input = approvedInput(incompleteStory)

    expect(validateApprovedManualStory(input, '기초')).toEqual(expect.arrayContaining([
      expect.stringContaining('story.title'),
      expect.stringContaining('story.coverage'),
      expect.stringContaining('story.usedWords'),
      expect.stringContaining('story.usedPhrasalVerbs'),
      expect.stringContaining('story.storyText'),
    ]))
  })

  it('fails closed on an unrecognized canonical approval filename', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wordmaster-manual-stories-'))
    try {
      await writeFile(
        join(directory, '잘못된레벨.approved.json'),
        `${JSON.stringify(approvedInput(), null, 2)}\n`,
        'utf8',
      )

      await expect(loadApprovedManualStories(directory)).rejects.toThrow(
        'Unrecognized approved manual story file',
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps the checked-in example digest-valid without loading it as an approval', async () => {
    const example = JSON.parse(await readFile(
      join(DEFAULT_MANUAL_STORY_ROOT, 'approved-story.example.json'),
      'utf8',
    )) as unknown

    expect(validateApprovedManualStory(example, '기초')).toEqual([])
  })
})
