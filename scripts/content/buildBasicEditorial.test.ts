import { describe, expect, test } from 'vitest'

import { DIFFICULTIES } from '../../src/domain/content/types'
import { normalizeWordExampleKey } from '../../src/domain/content/validators/words'
import {
  BASIC_EDITORIAL_WORDS,
  BASIC_NOUN_EXAMPLES,
  buildBasicEditorialWords,
  parseIpaDictionary,
} from './buildBasicEditorial'
import { isLearnerSafeExample } from './buildWordCatalog'

describe('basic editorial word batch', () => {
  test('contains the first 500 directly reviewed foundational words', () => {
    expect(BASIC_EDITORIAL_WORDS).toHaveLength(500)
    expect(new Set(BASIC_EDITORIAL_WORDS.map(({ lemma }) => lemma)).size).toBe(500)
    expect(BASIC_EDITORIAL_WORDS.every(({ meaning }) => /[가-힣]/.test(meaning))).toBe(true)
  })

  test('selects the first valid pronunciation when the IPA source lists variants', () => {
    expect(parseIpaDictionary('clothes\t/ˈkɫoʊðz/, /ˈkɫoʊz/').get('clothes'))
      .toBe('/ˈkɫoʊðz/')
  })

  test('provides exactly two explicit contextual examples for every selected noun', () => {
    const selectedNouns = BASIC_EDITORIAL_WORDS
      .filter(({ kind }) => kind === 'noun')
      .map(({ lemma }) => lemma)
      .sort()

    expect(Object.keys(BASIC_NOUN_EXAMPLES).sort()).toEqual(selectedNouns)
    expect(Object.entries(BASIC_NOUN_EXAMPLES).every(([lemma, examples]) =>
      examples.length === 2
      && examples[0] !== examples[1]
      && examples.every((example) => new RegExp(`\\b${lemma}\\b`, 'i').test(example)),
    )).toBe(true)
    expect(Object.values(BASIC_NOUN_EXAMPLES).flat().some((example) =>
      /^The [a-z]+ is here\.$|^I like this [a-z]+\.$/i.test(example),
    )).toBe(false)
  })

  test('builds valid foundation words from the pinned IPA dictionary', () => {
    const ipa = new Map(BASIC_EDITORIAL_WORDS
      .filter(({ lemma }) => lemma !== 'clothes')
      .map(({ lemma }) => [lemma, '/test/']))

    const words = buildBasicEditorialWords(ipa)

    expect(words).toHaveLength(500)
    expect(words[0]).toMatchObject({ level: '기초', lemma: 'a' })
    expect(words.slice(0, 33).map(({ entries }) => entries[0]!.partOfSpeech))
      .toEqual([
        'determiner', 'determiner',
        'pronoun', 'pronoun', 'pronoun', 'pronoun', 'pronoun', 'pronoun', 'pronoun', 'pronoun',
        'conjunction', 'conjunction', 'conjunction',
        'preposition', 'preposition', 'preposition', 'preposition', 'preposition',
        'preposition', 'preposition', 'preposition', 'preposition',
        'determiner', 'determiner', 'determiner', 'determiner', 'determiner', 'determiner',
        'determiner', 'determiner', 'adverb', 'adverb', 'verb',
      ])
    expect(words.find(({ lemma }) => lemma === 'toy')).toBeDefined()
    expect(words.find(({ lemma }) => lemma === 'writer')).toBeUndefined()
    expect(words.find(({ lemma }) => lemma === 'active')).toBeUndefined()
    expect(['soldier', 'army', 'dead'].every((lemma) =>
      words.every((word) => word.lemma !== lemma))).toBe(true)
    expect(['fold', 'gather', 'greet'].every((lemma) =>
      words.some((word) => word.lemma === lemma))).toBe(true)
    expect(words.find(({ lemma }) => lemma === 'go')?.entries[0]).toMatchObject({
      partOfSpeech: 'verb',
      meanings: ['가다'],
      forms: expect.objectContaining({ past: 'went', pastParticiple: 'gone' }),
    })
    expect(words.find(({ lemma }) => lemma === 'clothes')?.entries[0]?.ipa).toBe('/kloʊðz/')
    expect(words.find(({ lemma }) => lemma === 'red')?.entries[0]?.forms)
      .toEqual(['red', 'redder', 'reddest'])
    expect(words.find(({ lemma }) => lemma === 'flat')?.entries[0]?.forms)
      .toEqual(['flat', 'flatter', 'flattest'])
    expect(words.find(({ lemma }) => lemma === 'glad')?.entries[0]?.forms)
      .toEqual(['glad', 'gladder', 'gladdest'])
    expect(words.find(({ lemma }) => lemma === 'potato')?.entries[0]?.forms)
      .toEqual(['potato', 'potatoes'])
    expect(words.find(({ lemma }) => lemma === 'tomato')?.entries[0]?.forms)
      .toEqual(['tomato', 'tomatoes'])
    expect(JSON.stringify(words)).not.toMatch(/reder|redest|flater|flatest|glader|gladest|potatos|tomatos/)
    expect(words.every(({ entries }) => entries[0]!.examples.length >= 2)).toBe(true)
    const allExamples = words.flatMap(({ entries }) =>
      entries.flatMap(({ examples }) => examples))
    expect(new Set(allExamples.map(normalizeWordExampleKey)).size).toBe(allExamples.length)
    expect(allExamples.every((example) =>
      isLearnerSafeExample(example)
      && example.length <= 60
      && (example.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)?.length ?? 0) <= 12
      && /^[A-Z]/.test(example)
      && /[.!?]$/.test(example)
      && !/\s{2,}|\boclock\b/i.test(example),
    )).toBe(true)
    for (const word of words) {
      const forms = word.entries.flatMap(({ forms }) =>
        Array.isArray(forms) ? forms : Object.values(forms))
      const patterns = forms.map((form) => new RegExp(
        `\\b${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        'i',
      ))
      expect(word.entries[0]!.examples.every((example) =>
        patterns.some((pattern) => pattern.test(example))), word.lemma).toBe(true)
    }
    const adjectiveExamples = words
      .filter(({ entries }) => entries[0]?.partOfSpeech === 'adjective')
      .flatMap(({ entries }) => entries[0]!.examples)
    const adjectiveCount = words.filter(({ entries }) =>
      entries[0]?.partOfSpeech === 'adjective').length
    expect(adjectiveExamples).toHaveLength(adjectiveCount * 2)
    expect(new Set(adjectiveExamples).size).toBe(adjectiveCount * 2)
    expect(adjectiveExamples.some((example) => /^The ball is |^It looks /.test(example)))
      .toBe(false)
    expect(words.find(({ lemma }) => lemma === 'sad')?.entries[0]?.examples)
      .toEqual(['The child feels sad today.', 'It was a sad story.'])
    expect(words.find(({ lemma }) => lemma === 'cloudy')?.entries[0]?.examples)
      .toEqual(['The sky is cloudy today.', 'It was a cloudy morning.'])
    expect(words.find(({ lemma }) => lemma === 'hungry')?.entries[0]?.examples)
      .toEqual(['The child is hungry.', 'Our hungry dog waited for food.'])
    expect(words.find(({ lemma }) => lemma === 'get')?.entries[0]).toMatchObject({
      meanings: ['얻다'],
      examples: ['I get a gift from my aunt.', 'We get new books at school.'],
    })
    expect(words.find(({ lemma }) => lemma === 'take')?.entries[0]).toMatchObject({
      meanings: ['가지고 가다'],
      examples: ['I take my lunch to school.', 'We take warm clothes on the trip.'],
    })
    expect(words.find(({ lemma }) => lemma === 'act')?.entries[0]).toMatchObject({
      meanings: ['행동하다'],
      examples: ['I act calmly when a problem happens.', 'We act with care near the wet floor.'],
    })
    expect(words.find(({ lemma }) => lemma === 'beat')?.entries[0]).toMatchObject({
      meanings: ['이기다'],
      examples: ['I beat my brother at chess.', 'We beat the other team in the game.'],
    })
    const correctedAdjectiveExamples: Readonly<Record<string, readonly [string, string]>> = {
      busy: ['The teacher is busy now.', 'My father is busy at work.'],
      calm: ['The child stayed calm.', 'She spoke in a calm voice.'],
      clear: ['The sky is clear tonight.', 'The lake water is clear.'],
      cold: ['The water is cold.', 'She drank cold milk.'],
      excited: ['The children are excited about the trip.', 'The excited child smiled.'],
      hot: ['The soup is hot.', 'The tea is still hot.'],
      lonely: ['The child felt lonely.', 'The old man felt lonely.'],
      nervous: ['The student feels nervous.', 'The nervous driver drove slowly.'],
      normal: ['It was a normal school day.', 'That is a normal reaction.'],
      ready: ['The team is ready to play.', 'Dinner is ready now.'],
    }
    for (const [lemma, examples] of Object.entries(correctedAdjectiveExamples)) {
      expect(words.find((word) => word.lemma === lemma)?.entries[0]?.examples, lemma)
        .toEqual(examples)
    }
    expect(new Set(words.map(({ difficulty }) => difficulty))).toEqual(new Set(DIFFICULTIES))
    expect(DIFFICULTIES.map((difficulty) =>
      words.filter((word) => word.difficulty === difficulty).length))
      .toEqual([100, 100, 100, 100, 100])
  })

})
