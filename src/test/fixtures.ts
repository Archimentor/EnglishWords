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
import { grammarProductionConstraintsForLevel } from '../domain/grammar/productionConstraints'
import {
  grammarProductionDraft,
  grammarProductionReviewCount,
  type GrammarProductionEvidenceReference,
  type GrammarProductionRecord,
  type GrammarProductionSubmission,
} from '../domain/grammar/mastery'
import { wordFamilyFor } from '../domain/content/wordFamilies'

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
  const lemma = wordOverrides.lemma ?? 'play'
  const family = wordFamilyFor(lemma)

  return {
    id: 'word-play',
    word: 'play',
    lemma: 'play',
    level: '기초',
    familyId: family.familyId,
    isFamilyHead: family.isFamilyHead,
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
    ipa: '/ˈweɪk ˈəp/',
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
  const id = overrides.id ?? 'A1-G01'
  const level = overrides.level ?? 'A1'
  const title = overrides.title ?? '문장뼈대(SVC/SVO)'
  const errorCodes = overrides.errorCodes ?? ['WO-01', 'SV-01']
  const base: GrammarNode = {
    id,
    level,
    title,
    prerequisite: overrides.prerequisite ?? null,
    difficultyTag: overrides.difficultyTag ?? 'core',
    canDo: overrides.canDo ?? [
      '문장 구조를 찾는다',
      '기본 문장을 만든다',
      '어순을 점검한다',
    ],
    summary: overrides.summary ?? '영어 기본 문장 구조를 익힌다.',
    rules: overrides.rules ?? [
      {
        heading: `${title} 핵심 형태`,
        explanation: '주어와 동사의 역할을 확인해 기본 문장 구조를 정확히 만든다.',
        keyPoints: ['주어 다음에 동사를 둔다.', '동사 뒤의 목적어와 보어를 구분한다.'],
        exceptions: ['be동사는 목적어 대신 주어를 설명하는 보어와 결합할 수 있다.'],
      },
      {
        heading: `${title} 의미 점검`,
        explanation: '형태를 바꾼 뒤에도 문장의 의미와 수일치를 함께 확인한다.',
        keyPoints: ['문맥에 맞는 동사를 고른다.', '주어에 맞게 동사 형태를 바꾼다.'],
        exceptions: ['한국어 어순을 그대로 옮기지 않는다.'],
      },
    ],
    patterns: overrides.patterns ?? ['S + V + C', 'S + V + O'],
    examples: overrides.examples ?? [
      {
        english: 'The child is happy.',
        korean: '그 아이는 행복하다.',
        difficulty: 'guided',
      },
      {
        english: 'The child plays a game.',
        korean: '그 아이는 게임을 한다.',
        difficulty: 'independent',
      },
    ],
    exercises: overrides.exercises ?? [
      {
        id: `${id}-diagnostic`,
        phase: 'diagnostic',
        type: 'choice',
        prompt: '올바른 문장을 고르세요.',
        choices: ['Happy the child is.', 'The child is happy.'],
        answer: 'The child is happy.',
        explanation: '주어-동사-보어 순서를 사용한다.',
        errorCode: errorCodes[0] ?? 'WO-01',
      },
      {
        id: `${id}-practice`,
        phase: 'practice',
        type: 'translation',
        prompt: '그 아이는 행복하다를 영어로 쓰세요.',
        choices: [],
        answer: 'The child is happy.',
        explanation: 'The child 다음에 is와 보어 happy를 쓴다.',
        errorCode: errorCodes[0] ?? 'WO-01',
      },
      {
        id: `${id}-rediagnostic`,
        phase: 'rediagnostic',
        type: 'errorCorrection',
        prompt: 'Child the plays a game.을 고치세요.',
        choices: [],
        answer: 'The child plays a game.',
        explanation: '주어-동사-목적어 순서로 고친다.',
        errorCode: errorCodes[0] ?? 'WO-01',
      },
    ],
    productionTask: overrides.productionTask ?? {
      prompt: `${title}을 사용해 연결되는 문장 네 개를 쓰세요.`,
      requirements: ['목표 패턴을 한 번 사용한다.', '주어와 동사의 수를 일치시킨다.'],
      rubric: [
        '형태와 어순이 정확하다.',
        '네 문장의 의미가 자연스럽게 연결된다.',
        `${errorCodes.join(', ')}를 최종 점검한다.`,
      ],
      constraints: grammarProductionConstraintsForLevel(level),
    },
    errorCodes,
    errorNotes: overrides.errorNotes ?? errorCodes.map((code) => ({
      code,
      title: '형태와 어순 오류',
      wrongExample: 'Child the is happy.',
      correction: 'The child is happy.처럼 주어 다음에 동사를 둔다.',
      reviewRule: `${code}가 두 번 연속 발생하면 선행 규칙을 복습한다.`,
    })),
    masteryRule: {
      quizAccuracy: 0.8,
      productionPass: true,
      errorTolerance: 0.2,
    },
  }
  return { ...base, ...overrides }
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

export function makeGrammarProductionSubmission(
  node: GrammarNode = makeGrammarNode(),
  options: {
    partTexts?: Readonly<Record<string, string>>
    revisionNote?: string | null
  } = {},
): GrammarProductionSubmission {
  let sentenceNumber = 0
  const parts = node.productionTask.constraints.parts.map((part) => {
    const generated = Array.from({ length: part.minSentences }, () => {
      sentenceNumber += 1
      return `The learner writes clear sentence ${sentenceNumber}.`
    }).join(' ')
    return {
      partId: part.id,
      text: options.partTexts?.[part.id] ?? generated,
    }
  })
  const references = parts.flatMap((part) =>
    grammarProductionSentencesForFixture(part.text).map((_, sentenceIndex) => ({
      partId: part.partId,
      sentenceIndex,
    })))
  const referenceForPart = (partId: string) =>
    references.find((reference) => reference.partId === partId)
  const requirementEvidence = node.productionTask.constraints.evidenceRequirements.map(
    (requirement) => {
      const selections: GrammarProductionEvidenceReference[] = requirement.requiredPartIds
        .map(referenceForPart)
        .filter((reference): reference is GrammarProductionEvidenceReference =>
          reference !== undefined)
      for (const reference of references) {
        if (selections.length >= requirement.minSelections) break
        if (!selections.some((selected) =>
          selected.partId === reference.partId &&
          selected.sentenceIndex === reference.sentenceIndex)) {
          selections.push(reference)
        }
      }
      return { requirementId: requirement.id, selections }
    },
  )
  return {
    draft: grammarProductionDraft(parts),
    parts,
    requirementEvidence,
    rubricEvidence: Array.from(
      { length: node.productionTask.rubric.length },
      (_, index) => references[index % references.length]!,
    ),
    revisionNote: options.revisionNote ?? null,
  }
}

function grammarProductionSentencesForFixture(value: string): string[] {
  return value.split(/[.!?]+/u).map((sentence) => sentence.trim()).filter(Boolean)
}

export function makeGrammarProductionRecord(
  node: GrammarNode = makeGrammarNode(),
  options: {
    status?: GrammarProductionRecord['reviewStatus']
    revisionRound?: number
    cycleStartAttempt?: number
    revisionNote?: string | null
    partTexts?: Readonly<Record<string, string>>
  } = {},
): GrammarProductionRecord {
  const status = options.status ?? 'approved'
  const revisionRound = options.revisionRound ?? 0
  const submission = makeGrammarProductionSubmission(node, {
    ...(options.partTexts === undefined ? {} : { partTexts: options.partTexts }),
    revisionNote: options.revisionNote ?? (
      node.productionTask.constraints.maxRevisionRounds !== null && revisionRound > 0
        ? `Corrected revision round ${revisionRound}.`
        : null
    ),
  })
  const base = {
    ...submission,
    cycleStartAttempt: options.cycleStartAttempt ?? 1,
    revisionRound,
    reviewStatus: status,
    reviewChecks: null,
  } satisfies GrammarProductionRecord
  const reviewCount = grammarProductionReviewCount(base)
  return {
    ...base,
    reviewChecks: status === 'pending'
      ? null
      : Array.from({ length: reviewCount }, (_, index) =>
          status === 'approved' || index > 0),
  }
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
    vocabularyPracticeText: 'Mina.',
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
      LEVELS.map((level, levelIndex) => {
        const { lemma, difficulty } = levelWords[level]
        const overrides = options.wordOverrides?.[level]
        const surface = overrides?.word ?? lemma

        return [
          level,
          [
            makeWord({
              id: `word-${lemma}`,
              word: lemma,
              lemma,
              level,
              familyId: wordFamilyFor(lemma).familyId,
              isFamilyHead: wordFamilyFor(lemma).isFamilyHead,
              difficulty,
              ...overrides,
              entryOverrides: {
                forms: [surface],
                examples: [
                  `I use ${surface} in level ${levelIndex + 1}.`,
                  `We review ${surface} during level ${levelIndex + 1} practice.`,
                ],
                ...overrides?.entryOverrides,
              },
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
          storyText: wordlists[level]
            .map((word) => `${word.word}.`)
            .join(' '),
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
          familyId: wordFamilyFor(`lemma-${key}`).familyId,
          isFamilyHead: wordFamilyFor(`lemma-${key}`).isFamilyHead,
          entryOverrides: {
            examples: [
              `I study word ${key} today.`,
              `We review word ${key} together.`,
            ],
          },
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
