import { LEVELS } from '../domain/content/types'
import type {
  ContentCatalog,
  Difficulty,
  GrammarDifficultyTag,
  GrammarLevel,
  GrammarNode,
  Level,
  PhrasalVerbItem,
  StoryContent,
  WordEntry,
  WordItem,
} from '../domain/content/types'

type WordFixtureOverrides = Partial<WordItem> & {
  entryOverrides?: Partial<WordEntry>
}

interface MakeCatalogOptions {
  wordOverrides?: Partial<Record<Level, WordFixtureOverrides>>
  wordlists?: Record<Level, WordItem[]>
  phrasalVerbs?: ContentCatalog['phrasalVerbs']
  grammarNodes?: GrammarNode[]
  stories?: ContentCatalog['stories']
}

export function makeWord(overrides: WordFixtureOverrides = {}): WordItem {
  const { entryOverrides, ...wordOverrides } = overrides

  return {
    id: 'word-play',
    word: 'play',
    lemma: 'play',
    level: '기초',
    familyId: 'family-play',
    isFamilyHead: true,
    difficulty: 'veryEasy',
    entries: [
      {
        partOfSpeech: 'verb',
        forms: ['play', 'plays', 'played', 'playing'],
        meanings: ['놀다'],
        ipa: '/pleɪ/',
        examples: ['I play outside.', 'They play after school.'],
        ...entryOverrides,
      },
    ],
    ...wordOverrides,
  }
}

export function makePhrasalVerb(
  overrides: Partial<PhrasalVerbItem> = {},
): PhrasalVerbItem {
  return {
    id: 'phrasal-wake-up',
    baseVerb: 'wake',
    particle: 'up',
    phrasalVerb: 'wake up',
    levelHint: '기초',
    meaningKo: ['잠에서 깨다'],
    examples: ['I wake up early.', 'We wake up at seven.'],
    partOfSpeech: 'phrasalVerb',
    usageNotes: '일어나거나 잠에서 깰 때 쓴다.',
    difficulty: 'veryEasy',
    ...overrides,
  }
}

export function makeGrammarNode(overrides: Partial<GrammarNode> = {}): GrammarNode {
  return {
    id: 'A1-G01',
    level: 'A1',
    title: '문장뼈대(SVC/SVO)',
    prerequisite: null,
    difficultyTag: 'core',
    canDo: ['문장 구조를 찾는다', '기본 문장을 만든다', '어순을 점검한다'],
    summary: '영어 기본 문장 구조를 익힌다.',
    patterns: ['S + V + C', 'S + V + O'],
    examples: ['The child is happy.', 'The child plays a game.'],
    errorCodes: ['WO-01', 'SV-01'],
    masteryRule: {
      quizAccuracy: 0.8,
      productionPass: true,
      errorTolerance: 0.2,
    },
    ...overrides,
  }
}

export function makeGrammarNodes(): GrammarNode[] {
  const levelDetails: ReadonlyArray<
    readonly [GrammarLevel, GrammarDifficultyTag, number]
  > = [
    ['A1', 'core', 8],
    ['A2', 'expansion', 9],
    ['B1', 'integration', 9],
    ['B2', 'complex', 9],
    ['C1', 'precision', 7],
  ]
  let previousId: string | null = null

  return levelDetails.flatMap(([level, difficultyTag, count]) =>
    Array.from({ length: count }, (_, index) => {
      const id = `${level}-G${String(index + 1).padStart(2, '0')}`
      const node = makeGrammarNode({
        id,
        level,
        difficultyTag,
        title: `${level} 문법 ${index + 1}`,
        prerequisite: previousId,
      })
      previousId = id
      return node
    }),
  )
}

export function makeStory(
  level: Level = '기초',
  overrides: Partial<StoryContent> = {},
): StoryContent {
  return {
    schemaVersion: '1.0.0',
    level,
    title: `${level} 대표 이야기`,
    isManual: true,
    coverage: {
      mustCoverAll: true,
      allowUpperLevelWords: false,
      coverageRate: 1,
    },
    usedWords: [
      {
        lemma: 'play',
        partOfSpeech: 'verb',
        forms: ['play'],
      },
    ],
    storyText: 'The children play together.',
    ...overrides,
  }
}

export function makeCatalog(options: MakeCatalogOptions = {}): ContentCatalog {
  const levelWords: Record<Level, { lemma: string; difficulty: Difficulty }> = {
    기초: { lemma: 'play', difficulty: 'veryEasy' },
    유치원: { lemma: 'book', difficulty: 'easy' },
    초등학교: { lemma: 'answer', difficulty: 'normal' },
    중학교: { lemma: 'achieve', difficulty: 'hard' },
  }

  const wordlists =
    options.wordlists ??
    (Object.fromEntries(
      LEVELS.map((level) => {
        const { lemma, difficulty } = levelWords[level]

        return [
          level,
          [
            makeWord({
              id: `word-${lemma}`,
              word: lemma,
              lemma,
              level,
              familyId: `family-${lemma}`,
              difficulty,
              ...options.wordOverrides?.[level],
            }),
          ],
        ]
      }),
    ) as Record<Level, WordItem[]>)

  const stories =
    options.stories ??
    (Object.fromEntries(
      LEVELS.map((level) => [
        level,
        makeStory(level, {
          usedWords: wordlists[level].map((word) => ({
            lemma: word.lemma,
            partOfSpeech: word.entries[0]?.partOfSpeech ?? 'word',
            forms: [word.word],
          })),
        }),
      ]),
    ) as ContentCatalog['stories'])

  return {
    wordlists,
    phrasalVerbs:
      options.phrasalVerbs ??
      {
        top: [],
        byLevel: {
          기초: [],
          유치원: [],
          초등학교: [],
          중학교: [],
        },
      },
    stories,
    grammarNodes: options.grammarNodes ?? makeGrammarNodes(),
  }
}

export function makeReleaseCatalog(): ContentCatalog {
  const wordCounts: Record<Level, number> = {
    기초: 500,
    유치원: 500,
    초등학교: 1500,
    중학교: 2500,
  }

  const wordlists = Object.fromEntries(
    LEVELS.map((level) => [
      level,
      Array.from({ length: wordCounts[level] }, (_, index) => {
        const key = `${level}-${index + 1}`
        return makeWord({
          id: `word-${key}`,
          word: `word-${key}`,
          lemma: `lemma-${key}`,
          level,
          familyId: `family-${key}`,
        })
      }),
    ]),
  ) as Record<Level, WordItem[]>

  const byLevel = Object.fromEntries(
    LEVELS.map((level) => [
      level,
      Array.from({ length: 250 }, (_, index) => {
        const key = `${level}-${index + 1}`
        return makePhrasalVerb({
          id: `phrasal-${key}`,
          baseVerb: `verb-${key}`,
          phrasalVerb: `verb-${key} up`,
          levelHint: level,
        })
      }),
    ]),
  ) as Record<Level, PhrasalVerbItem[]>

  return makeCatalog({
    wordlists,
    phrasalVerbs: {
      top: LEVELS.flatMap((level) => byLevel[level]),
      byLevel,
    },
  })
}
