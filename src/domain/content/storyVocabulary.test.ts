import { describe, expect, test } from 'vitest'

import { inspectStoryVocabulary, storyProperNounTokens } from './storyVocabulary'
import type { Level, WordItem } from './types'

function word(lemma: string, level: Level): WordItem {
  return {
    id: `word-${lemma}`,
    word: lemma,
    lemma,
    level,
    familyId: `${lemma}-family`,
    isFamilyHead: true,
    difficulty: 'veryEasy',
    entries: [{
      partOfSpeech: 'verb',
      forms: [lemma],
      meanings: ['뜻'],
      ipa: '/x/',
      examples: [],
    }],
  }
}

describe('story vocabulary boundaries', () => {
  test('allows the selected level and lower levels but reports an upper-level form', () => {
    const basic = word('play', '기초')
    const elementary = word('discover', '초등학교')

    expect(inspectStoryVocabulary(
      'Mina play discover.',
      [basic],
      [basic, elementary],
    ).violations).toEqual([
      { token: 'discover', catalogLevel: '초등학교' },
    ])
  })

  test('allows proper nouns even when their lowercase form belongs to an upper level', () => {
    const basic = word('calls', '기초')
    const upperNameHomograph = word('hope', '초등학교')
    const report = inspectStoryVocabulary(
      'Mina calls Hope. Mina calls Joon.',
      [basic],
      [basic, upperNameHomograph],
    )

    expect(report.properNouns).toEqual(expect.arrayContaining(['hope', 'joon', 'mina']))
    expect(report.violations).toEqual([])
  })

  test('does not mistake a capitalized sentence-opening common word for a proper noun', () => {
    const basic = word('play', '기초')
    const upper = word('discover', '초등학교')

    expect(inspectStoryVocabulary(
      'Discover play.',
      [basic],
      [basic, upper],
    ).violations).toEqual([
      { token: 'discover', catalogLevel: '초등학교' },
    ])
    expect(inspectStoryVocabulary('Lantern play.', [basic]).violations).toEqual([
      { token: 'lantern', catalogLevel: null },
    ])
  })

  test('does not lower an upper word through a multiword inflection', () => {
    const tired = word('tired', '기초')
    tired.entries[0]!.forms = ['tired', 'more tired']
    const more = word('more', '초등학교')

    expect(inspectStoryVocabulary(
      'Mina is more tired.',
      [tired, word('is', '기초')],
      [tired, more],
    ).violations).toEqual([
      { token: 'more', catalogLevel: '초등학교' },
    ])
  })

  test('recognizes honorific names and acronyms but rejects pronouns and single letters', () => {
    const properNouns = storyProperNounTokens(
      "I ask Mr. Choi about NASA. `It is ready. The note says I’m ready, You’ll win, with M.",
    )

    expect(properNouns).toEqual(new Set(['mr', 'choi', 'nasa']))
  })
})
