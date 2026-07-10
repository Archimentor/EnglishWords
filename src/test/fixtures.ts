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
  duplicateLemma?: string
  wordOverrides?: Partial<Record<Level, WordFixtureOverrides>>
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
    schemaVersion: 1,
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

  const wordlists = Object.fromEntries(
    LEVELS.map((level) => {
      const { lemma, difficulty } = levelWords[level]
      const duplicateLemma = level === '유치원' ? options.duplicateLemma : undefined
      const resolvedLemma = duplicateLemma ?? lemma

      return [
        level,
        [
          makeWord({
            id: `word-${lemma}`,
            word: resolvedLemma,
            lemma: resolvedLemma,
            level,
            familyId: `family-${lemma}`,
            difficulty,
            ...options.wordOverrides?.[level],
          }),
        ],
      ]
    }),
  ) as Record<Level, WordItem[]>

  return {
    wordlists,
    phrasalVerbs: {
      top: [],
      byLevel: {
        기초: [],
        유치원: [],
        초등학교: [],
        중학교: [],
      },
    },
    stories: {
      기초: makeStory('기초'),
      유치원: makeStory('유치원'),
      초등학교: makeStory('초등학교'),
      중학교: makeStory('중학교'),
    },
    grammarNodes: makeGrammarNodes(),
  }
}
