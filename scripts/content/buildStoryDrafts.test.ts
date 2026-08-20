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

test('builds a complete but explicitly unreviewed narrative draft', () => {
  const words = [
    word('apple', 'noun'), word('walk', 'verb'), word('happy', 'adjective'), word('slowly', 'adverb'),
  ]
  const story = buildStoryDraft('기초', words)
  expect(story.isManual).toBe(false)
  expect(story.usedWords.map(({ lemma }) => lemma)).toEqual(['apple', 'walk', 'happy', 'slowly'])
  const readingPackage = `${story.storyText}\n\n${story.vocabularyPracticeText}`
  for (const { lemma } of story.usedWords) expect(readingPackage).toMatch(new RegExp(`\\b${lemma}\\b`))
  const tokens = readingPackage.toLowerCase().match(/[\p{L}\p{N}]+(?:['’–-][\p{L}\p{N}]+)*/gu) ?? []
  expect(new Set(tokens)).toEqual(new Set(['mina', ...words.map(({ lemma }) => lemma)]))
  expect(story.vocabularyPracticeText).not.toMatch(/[“"]\s*\w+\s*[”"]\s*,\s*[“"]/u)
})
