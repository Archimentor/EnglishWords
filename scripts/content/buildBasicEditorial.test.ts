import { describe, expect, test } from 'vitest'

import {
  BASIC_EDITORIAL_WORDS,
  buildBasicEditorialStory,
  buildBasicEditorialWords,
  parseIpaDictionary,
} from './buildBasicEditorial'

describe('basic editorial word batch', () => {
  test('contains the first 100 directly reviewed foundational words', () => {
    expect(BASIC_EDITORIAL_WORDS).toHaveLength(100)
    expect(new Set(BASIC_EDITORIAL_WORDS.map(({ lemma }) => lemma)).size).toBe(100)
    expect(BASIC_EDITORIAL_WORDS.every(({ meaning }) => /[가-힣]/.test(meaning))).toBe(true)
  })

  test('selects the first valid pronunciation when the IPA source lists variants', () => {
    expect(parseIpaDictionary('clothes\t/ˈkɫoʊðz/, /ˈkɫoʊz/').get('clothes'))
      .toBe('/ˈkɫoʊðz/')
  })

  test('builds valid foundation words from the pinned IPA dictionary', () => {
    const ipa = new Map(BASIC_EDITORIAL_WORDS
      .filter(({ lemma }) => lemma !== 'clothes')
      .map(({ lemma }) => [lemma, '/test/']))

    const words = buildBasicEditorialWords(ipa)

    expect(words).toHaveLength(100)
    expect(words[0]).toMatchObject({ level: '기초', lemma: 'apple' })
    expect(words.find(({ lemma }) => lemma === 'go')?.entries[0]).toMatchObject({
      partOfSpeech: 'verb',
      meanings: ['가다'],
      forms: expect.objectContaining({ past: 'went', pastParticiple: 'gone' }),
    })
    expect(words.find(({ lemma }) => lemma === 'clothes')?.entries[0]?.ipa).toBe('/kloʊðz/')
    expect(words.every(({ entries }) => entries[0].examples.length >= 2)).toBe(true)
  })

  test('creates a clickable reading story that covers every batch word', () => {
    const ipa = new Map(BASIC_EDITORIAL_WORDS.map(({ lemma }) => [lemma, '/test/']))
    const words = buildBasicEditorialWords(ipa)

    const story = buildBasicEditorialStory(words)

    expect(story.coverage.coverageRate).toBe(1)
    expect(story.usedWords).toHaveLength(100)
    expect(story.usedWords.every(({ lemma, forms }) => {
      const word = words.find((candidate) => candidate.lemma === lemma)!
      const entry = word.entries[0]!
      const entryForms = Array.isArray(entry.forms) ? entry.forms : Object.values(entry.forms)
      return forms.join('|') === entryForms.join('|')
        && new RegExp(`\\b${lemma}\\b`, 'i').test(story.storyText)
    })).toBe(true)
  })
})
