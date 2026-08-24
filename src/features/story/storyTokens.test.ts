import { makePhrasalVerb, makeStory, makeWord } from '../../test/fixtures'
import { tokenizeStory, tokenizeStoryParagraphs } from './storyTokens'

test('tokenizes a long story once while preserving complete paragraph boundaries', () => {
  const word = makeWord()
  const story = makeStory('기초', {
    storyText: 'Mina can play.\n\nThe children played together.',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['play', 'played'] }],
  })

  const paragraphs = tokenizeStoryParagraphs(story.storyText, story.usedWords, [word])

  expect(paragraphs).toHaveLength(2)
  expect(paragraphs[0]).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'word', value: 'play' }),
  ]))
  expect(paragraphs[1]).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'word', value: 'played' }),
  ]))
  expect(paragraphs.flat().some((token) => token.value.includes('\u0000'))).toBe(false)
})

test('사전에 등록된 활용형은 usedWords에 기본형만 있어도 클릭 가능한 단어로 만든다', () => {
  const word = makeWord({
    entryOverrides: {
      forms: ['play', 'plays', 'played', 'playing'],
    },
  })
  const story = makeStory('기초', {
    storyText: 'Mina played while Joon was playing.',
    usedWords: [{ lemma: 'play', partOfSpeech: 'verb', forms: ['play'] }],
  })

  expect(tokenizeStory(story.storyText, story.usedWords, [word])).toEqual([
    { type: 'text', value: 'Mina ' },
    expect.objectContaining({ type: 'word', value: 'played', word }),
    { type: 'text', value: ' while Joon was ' },
    expect.objectContaining({ type: 'word', value: 'playing', word }),
    { type: 'text', value: '.' },
  ])
})

test('marks only the exact approved sentence as a contextual phrasal verb', () => {
  const wake = makeWord({
    id: 'word-wake',
    word: 'wake',
    lemma: 'wake',
    familyId: 'family-wake',
    entryOverrides: { forms: ['wake'] },
  })
  const up = makeWord({
    id: 'word-up',
    word: 'up',
    lemma: 'up',
    familyId: 'family-up',
    entryOverrides: { forms: ['up'] },
  })
  const phrasal = makePhrasalVerb()
  const storyText = 'I wake up early. Later, I wake up slowly.'
  const phrasalUse = {
    item: phrasal,
    form: 'wake up',
    context: 'I wake up early.',
    meaningKo: '잠에서 깨다',
  }

  expect(tokenizeStory(
    storyText,
    [
      { lemma: 'wake', partOfSpeech: 'verb', forms: ['wake'] },
      { lemma: 'up', partOfSpeech: 'verb', forms: ['up'] },
    ],
    [wake, up],
    [phrasalUse],
  )).toEqual([
    { type: 'text', value: 'I ' },
    {
      type: 'phrasalVerb',
      value: 'wake up',
      phrasalVerb: phrasal,
      phrasalUse,
    },
    { type: 'text', value: ' early. Later, I ' },
    expect.objectContaining({ type: 'word', value: 'wake', word: wake }),
    { type: 'text', value: ' ' },
    expect.objectContaining({ type: 'word', value: 'up', word: up }),
    { type: 'text', value: ' slowly.' },
  ])
})

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

test.each([
  ["can't", 'can'],
  ["dog’s", 'dog'],
  ['self-esteem', 'esteem'],
  ['well–being', 'being'],
] as const)('treats punctuation inside %s as an internal word boundary', (text, form) => {
  const word = makeWord({
    id: `word-${form}`,
    word: form,
    lemma: form,
    familyId: `family-${form}`,
    entryOverrides: { forms: [form] },
  })

  expect(
    tokenizeStory(
      text,
      [{ lemma: form, partOfSpeech: 'verb', forms: [form] }],
      [word],
    ),
  ).toEqual([{ type: 'text', value: text }])
})

test("matches an apostrophe or hyphen when it is part of the recorded form", () => {
  const contraction = makeWord({
    id: 'word-cannot',
    word: 'can',
    lemma: 'can',
    familyId: 'family-can',
    entryOverrides: { forms: ["can't"] },
  })
  const compound = makeWord({
    id: 'word-self-esteem',
    word: 'self-esteem',
    lemma: 'self-esteem',
    familyId: 'family-self-esteem',
    entryOverrides: { forms: ['self-esteem'] },
  })
  const storyText = "I can't ignore self-esteem."

  expect(
    tokenizeStory(
      storyText,
      [
        { lemma: 'can', partOfSpeech: 'verb', forms: ["can't"] },
        { lemma: 'self-esteem', partOfSpeech: 'verb', forms: ['self-esteem'] },
      ],
      [contraction, compound],
    ),
  ).toEqual([
    { type: 'text', value: 'I ' },
    expect.objectContaining({ type: 'word', value: "can't", word: contraction }),
    { type: 'text', value: ' ignore ' },
    expect.objectContaining({ type: 'word', value: 'self-esteem', word: compound }),
    { type: 'text', value: '.' },
  ])
})

test('does not slice once per recorded form at every story character', () => {
  const words = Array.from({ length: 250 }, (_, index) => {
    const lemma = `token${index}`
    return makeWord({
      id: `word-${lemma}`,
      word: lemma,
      lemma,
      familyId: `family-${lemma}`,
      entryOverrides: { forms: [lemma] },
    })
  })
  const usedWords = words.map((word) => ({
    lemma: word.lemma,
    partOfSpeech: 'verb',
    forms: [word.lemma],
  }))
  const sliceSpy = vi.spyOn(String.prototype, 'slice')

  try {
    const storyText = 'z'.repeat(2_000)
    expect(tokenizeStory(storyText, usedWords, words)).toEqual([
      { type: 'text', value: storyText },
    ])
    expect(sliceSpy).toHaveBeenCalledTimes(1)
  } finally {
    sliceSpy.mockRestore()
  }
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
