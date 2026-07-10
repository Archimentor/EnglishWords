import { makeCatalog, makePhrasalVerb, makeWord } from '../../test/fixtures'
import { LEVELS } from './types'
import { normalizeCatalog, normalizePhrasalVerb, normalizeWord } from './normalize'

describe('normalizeWord', () => {
  it('combines every part of speech for play into one stable study item', () => {
    const word = makeWord({
      difficulty: 'normal',
      entries: [
        {
          partOfSpeech: 'verb',
          forms: {
            base: 'play',
            s3: 'plays',
            past: 'played',
            participle: 'playing',
            pastParticiple: 'played',
          },
          meanings: ['놀다', '경기하다', '연주하다'],
          ipa: '   ',
          examples: [
            'The children play outside.',
            'We play soccer after school.',
            'I play the piano for Mom.',
          ],
        },
        {
          partOfSpeech: 'noun',
          forms: ['play', 'plays'],
          meanings: ['연극', '놀다'],
          ipa: '/pleɪ/',
          examples: [
            'Our class puts on a play.',
            'We watched a funny play.',
            'The children play outside.',
          ],
        },
      ],
    })

    expect(normalizeWord(word)).toEqual({
      id: 'word-play',
      kind: 'word',
      term: 'play',
      lemma: 'play',
      level: '기초',
      difficulty: 'normal',
      partsOfSpeech: ['verb', 'noun'],
      forms: ['play', 'plays', 'played', 'playing'],
      meanings: ['놀다', '경기하다', '연주하다', '연극'],
      ipa: '/pleɪ/',
      examples: [
        'The children play outside.',
        'We play soccer after school.',
        'I play the piano for Mom.',
        'Our class puts on a play.',
        'We watched a funny play.',
      ],
    })
  })

  it('preserves answer array forms and flattens object forms by value insertion order', () => {
    const word = makeWord({
      id: 'word-answer',
      word: 'answer',
      lemma: 'answer',
      level: '초등학교',
      difficulty: 'easy',
      entries: [
        {
          partOfSpeech: 'noun',
          forms: ['answer', 'answers'],
          meanings: ['대답', '정답'],
          ipa: '/ˈænsɚ/',
          examples: ['Write your answer on the line.', 'Her answer was clear and polite.'],
        },
        {
          partOfSpeech: 'verb',
          forms: {
            base: 'answer',
            s3: 'answers',
            past: 'answered',
            participle: 'answering',
            pastParticiple: 'answered',
          },
          meanings: ['대답하다'],
          ipa: '/ˈænsɚ/',
          examples: [
            'Please answer the first question.',
            'I answer my teacher in a full sentence.',
          ],
        },
      ],
    })

    const item = normalizeWord(word)

    expect(item.partsOfSpeech).toEqual(['noun', 'verb'])
    expect(item.forms).toEqual(['answer', 'answers', 'answered', 'answering'])
    expect(item.meanings).toEqual(['대답', '정답', '대답하다'])
    expect(item.examples).toEqual([
      'Write your answer on the line.',
      'Her answer was clear and polite.',
      'Please answer the first question.',
      'I answer my teacher in a full sentence.',
    ])
  })
})

describe('normalizePhrasalVerb', () => {
  it('maps a leveled phrasal verb into a study item', () => {
    expect(normalizePhrasalVerb(makePhrasalVerb())).toEqual({
      id: 'phrasal-wake-up',
      kind: 'phrasalVerb',
      term: 'wake up',
      lemma: 'wake up',
      level: '기초',
      difficulty: 'veryEasy',
      partsOfSpeech: ['phrasalVerb'],
      forms: ['wake up'],
      meanings: ['잠에서 깨다'],
      ipa: null,
      examples: ['I wake up early.', 'We wake up at seven.'],
    })
  })
})

describe('normalizeCatalog', () => {
  it('indexes words before level phrasals once across all four levels', () => {
    const phrasal = makePhrasalVerb()
    const catalog = makeCatalog({
      phrasalVerbs: {
        top: [phrasal],
        byLevel: {
          기초: [{ ...phrasal }],
          유치원: [],
          초등학교: [],
          중학교: [],
        },
      },
    })

    const runtime = normalizeCatalog(catalog)

    expect(Object.keys(runtime.itemsByLevel)).toEqual(LEVELS)
    expect(runtime.itemsByLevel.기초.map(({ term }) => term)).toEqual(['play', 'wake up'])
    expect(runtime.itemsByLevel.유치원.map(({ term }) => term)).toEqual(['book'])
    expect(runtime.itemsByLevel.초등학교.map(({ term }) => term)).toEqual(['answer'])
    expect(runtime.itemsByLevel.중학교.map(({ term }) => term)).toEqual(['achieve'])

    const indexedItems = LEVELS.flatMap((level) => runtime.itemsByLevel[level])
    expect(Object.values(runtime.itemsById)).toEqual(indexedItems)
    expect(new Set(indexedItems.map(({ id }) => id)).size).toBe(indexedItems.length)
    indexedItems.forEach((item) => expect(runtime.itemsById[item.id]).toBe(item))
  })
})
