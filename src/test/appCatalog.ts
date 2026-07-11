import { LEVELS, type Level, type PhrasalVerbItem, type WordItem } from '../domain/content/types'
import { normalizeCatalog } from '../domain/content/normalize'
import { makeCatalog, makePhrasalVerb, makeWord } from './fixtures'

const WORDS: Record<Level, readonly string[]> = {
  기초: ['baby', 'ball', 'bird', 'cat', 'dog', 'eat', 'happy', 'play'],
  유치원: ['book', 'chair', 'draw', 'friend', 'green', 'jump', 'school', 'teacher'],
  초등학교: [
    'answer',
    'because',
    'careful',
    'decide',
    'different',
    'explore',
    'improve',
    'question',
  ],
  중학교: [
    'achieve',
    'although',
    'compare',
    'evidence',
    'influence',
    'maintain',
    'require',
    'respond',
  ],
}

function wordsFor(level: Level): WordItem[] {
  return WORDS[level].map((word, index) =>
    makeWord({
      id: `app-word-${word}`,
      word,
      lemma: word,
      level,
      familyId: `family-${word}`,
      difficulty: index < 2 ? 'veryEasy' : index < 5 ? 'easy' : 'normal',
      entryOverrides: {
        forms: [word, `${word}s`],
        meanings: [word === 'play' ? '놀다' : `${word} 뜻`],
        examples: [`I use ${word} today.`, `The ${word}s are here.`],
      },
    }),
  )
}

function phrasalsFor(level: Level): PhrasalVerbItem[] {
  const terms: ReadonlyArray<readonly [string, string, string]> = level === '기초'
    ? [
        ['wake', 'up', '잠에서 깨다'],
        ['look', 'for', '찾다'],
      ]
    : [
        [`${level}-turn`, 'on', '켜다'],
        [`${level}-pick`, 'up', '집어 들다'],
      ]

  return terms.map(([baseVerb, particle, meaning]) =>
    makePhrasalVerb({
      id: `app-phrasal-${baseVerb}-${particle}`,
      baseVerb,
      particle,
      phrasalVerb: `${baseVerb} ${particle}`,
      levelHint: level,
      meaningKo: [meaning],
      examples: [
        `I ${baseVerb} ${particle} every day.`,
        `We ${baseVerb} ${particle} together.`,
      ],
    }),
  )
}

export function makeAppCatalog() {
  const wordlists = Object.fromEntries(
    LEVELS.map((level) => [level, wordsFor(level)]),
  ) as Record<Level, WordItem[]>
  const byLevel = Object.fromEntries(
    LEVELS.map((level) => [level, phrasalsFor(level)]),
  ) as Record<Level, PhrasalVerbItem[]>

  return normalizeCatalog(
    makeCatalog({
      wordlists,
      phrasalVerbs: {
        top: LEVELS.flatMap((level) => byLevel[level]),
        byLevel,
      },
    }),
  )
}
