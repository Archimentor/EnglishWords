import { expect, test } from 'vitest'

import type { WordItem } from '../../src/domain/content/types'
import { buildStoryDraft } from './buildStoryDrafts'

function word(lemma: string, partOfSpeech: string): WordItem {
  return {
    id: `word-${lemma}`,
    word: lemma,
    lemma,
    level: '기초',
    familyId: `${lemma}-family`,
    isFamilyHead: true,
    difficulty: 'veryEasy',
    entries: [{ partOfSpeech, forms: [lemma], meanings: ['뜻'], ipa: '/x/', examples: ['one', 'two'] }],
  }
}

test('builds a structurally valid but explicitly unreviewed fallback draft', () => {
  const words = [
    word('apple', 'noun'), word('walk', 'verb'), word('happy', 'adjective'), word('slowly', 'adverb'),
  ]
  const story = buildStoryDraft('기초', words)
  expect(story.isManual).toBe(false)
  expect(story.usedWords.map(({ lemma }) => lemma)).toEqual(['apple'])
  expect(story.coverage).toMatchObject({ mustCoverAll: false, coverageRate: 0.25 })
  for (const { lemma } of story.usedWords) {
    expect(story.storyText).toMatch(new RegExp(`\\b${lemma}\\b`))
  }
  const tokens = story.storyText.toLowerCase()
    .match(/[\p{L}\p{N}]+(?:['’–-][\p{L}\p{N}]+)*/gu) ?? []
  expect(new Set(tokens)).toEqual(new Set(['mina', 'apple']))
  expect(story.chapterTitles).toHaveLength(6)
  const chapters = story.storyText.split(/\n\s*\n\s*\n/u)
  expect(chapters).toHaveLength(6)
  expect(chapters.every((chapter) => chapter.split(/\n\s*\n/u).length === 5)).toBe(true)
  expect(chapters.every(
    (chapter) => (chapter.match(/[^.!?]+[.!?]+/gu)?.length ?? 0) >= 12,
  )).toBe(true)
  expect(story.usedPhrasalVerbs).toEqual([])
})
