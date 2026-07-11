import { makeStory, makeWord } from '../../test/fixtures'
import { tokenizeStory } from './storyTokens'

test('uses the longest recorded surface form while preserving surrounding text', () => {
  const word = makeWord({
    entryOverrides: {
      forms: ['play', 'played', 'playing'],
    },
  })
  const story = makeStory('기초', {
    storyText: 'They played, then play again.',
    usedWords: [
      {
        lemma: 'play',
        partOfSpeech: 'verb',
        forms: ['play', 'played'],
      },
    ],
  })

  expect(tokenizeStory(story.storyText, story.usedWords, [word])).toEqual([
    { type: 'text', value: 'They ' },
    expect.objectContaining({ type: 'word', value: 'played', word }),
    { type: 'text', value: ', then ' },
    expect.objectContaining({ type: 'word', value: 'play', word }),
    { type: 'text', value: ' again.' },
  ])
})

test('does not match a recorded form inside a larger word', () => {
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'The display is bright, but children play outside.',
  })

  expect(tokenizeStory(story.storyText, story.usedWords, [word])).toEqual([
    { type: 'text', value: 'The display is bright, but children ' },
    expect.objectContaining({ type: 'word', value: 'play', word }),
    { type: 'text', value: ' outside.' },
  ])
})

test('fails deterministically when a recorded story form is absent from the entry', () => {
  const word = makeWord({
    entryOverrides: {
      forms: ['play'],
    },
  })
  const story = makeStory('기초', {
    usedWords: [
      {
        lemma: 'play',
        partOfSpeech: 'verb',
        forms: ['played'],
      },
    ],
  })

  expect(() => tokenizeStory(story.storyText, story.usedWords, [word])).toThrow(
    'Story form "played" is not defined for play (verb).',
  )
})
