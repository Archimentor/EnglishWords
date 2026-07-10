import { readFileSync } from 'node:fs'
import { DIFFICULTIES, LEVELS } from '../src/domain/content/types'
import type {
  ContentCatalog,
  GrammarNode,
  Level,
  PhrasalVerbItem,
  StoryContent,
  WordEntry,
  WordItem,
} from '../src/domain/content/types'
import { validateCatalog, validateStoryCoverage } from '../src/domain/content/validation'

const WORDLIST_FILES: Record<Level, string> = {
  기초: '../public/data/wordlists/기초.json',
  유치원: '../public/data/wordlists/유치원.json',
  초등학교: '../public/data/wordlists/초등학교.json',
  중학교: '../public/data/wordlists/중학교.json',
}

const PHRASAL_FILES: Record<Level, string> = {
  기초: '../public/data/phrasal-verbs/by-level/기초.json',
  유치원: '../public/data/phrasal-verbs/by-level/유치원.json',
  초등학교: '../public/data/phrasal-verbs/by-level/초등학교.json',
  중학교: '../public/data/phrasal-verbs/by-level/중학교.json',
}

const STORY_FILES: Record<Level, string> = {
  기초: '../public/data/stories/기초.json',
  유치원: '../public/data/stories/유치원.json',
  초등학교: '../public/data/stories/초등학교.json',
  중학교: '../public/data/stories/중학교.json',
}

const TOP_PHRASAL_FILE = '../public/data/phrasal-verbs/top-1000.json'
const GRAMMAR_FILE = '../public/data/grammar/nodes.json'
const PHRASAL_SCHEMA_FILE = '../public/data/schema/phrasal.schema.json'
const STORY_SCHEMA_FILE = '../public/data/schema/story.schema.json'

const CONTENT_FILES = [
  ...LEVELS.map((level) => WORDLIST_FILES[level]),
  GRAMMAR_FILE,
  TOP_PHRASAL_FILE,
  ...LEVELS.map((level) => PHRASAL_FILES[level]),
  ...LEVELS.map((level) => STORY_FILES[level]),
  PHRASAL_SCHEMA_FILE,
  STORY_SCHEMA_FILE,
] as const

const EXPECTED_PHRASALS: Record<
  Level,
  ReadonlyArray<readonly [id: string, phrase: string]>
> = {
  기초: [
    ['phrasal-wake-up', 'wake up'],
    ['phrasal-sit-down', 'sit down'],
  ],
  유치원: [
    ['phrasal-stand-up', 'stand up'],
    ['phrasal-put-on', 'put on'],
  ],
  초등학교: [
    ['phrasal-look-for', 'look for'],
    ['phrasal-find-out', 'find out'],
  ],
  중학교: [
    ['phrasal-carry-on', 'carry on'],
    ['phrasal-deal-with', 'deal with'],
  ],
}

const EXPECTED_STORIES: Record<Level, { title: string; storyText: string }> = {
  기초: {
    title: '함께 노는 친구들',
    storyText:
      'A happy baby sees a bird, a cat, and a dog. They eat, play with a ball, and rest together.',
  },
  유치원: {
    title: '학교의 하루',
    storyText:
      'At school, a teacher puts a green book on a chair. I draw with my friend, and then we jump outside.',
  },
  초등학교: {
    title: '신중한 학생',
    storyText:
      'A careful student reads each question because she wants the right answer. She will decide, explore different ideas, and improve her work.',
  },
  중학교: {
    title: '근거와 목표',
    storyText:
      'To achieve a goal, compare each claim with evidence. Although opinions influence us, good work may require us to maintain focus and respond clearly.',
  },
}

const PHRASAL_FIELDS = [
  'id',
  'baseVerb',
  'particle',
  'phrasalVerb',
  'levelHint',
  'meaningKo',
  'examples',
  'partOfSpeech',
  'usageNotes',
  'difficulty',
] as const

const STORY_FIELDS = [
  'schemaVersion',
  'level',
  'title',
  'isManual',
  'coverage',
  'usedWords',
  'storyText',
] as const

const PLACEHOLDER_PATTERN = /TODO|TBD|준비\s*중|placeholder|lorem ipsum/i

interface SchemaNode {
  type?: string | string[]
  enum?: string[]
  const?: string
  pattern?: string
  minItems?: number
  minimum?: number
  maximum?: number
  required?: string[]
  properties?: Record<string, SchemaNode>
  additionalProperties?: boolean
  items?: SchemaNode
  $ref?: string
}

interface PhrasalSchema extends SchemaNode {
  $schema: string
  $defs: Record<'PhrasalVerbItem', SchemaNode>
}

interface StorySchema extends SchemaNode {
  $schema: string
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T
}

function loadWordlists(): Record<Level, WordItem[]> {
  return Object.fromEntries(
    LEVELS.map((level) => [level, readJson<WordItem[]>(WORDLIST_FILES[level])]),
  ) as Record<Level, WordItem[]>
}

function loadCatalog(): ContentCatalog {
  return {
    wordlists: loadWordlists(),
    phrasalVerbs: {
      top: readJson<PhrasalVerbItem[]>(TOP_PHRASAL_FILE),
      byLevel: Object.fromEntries(
        LEVELS.map((level) => [
          level,
          readJson<PhrasalVerbItem[]>(PHRASAL_FILES[level]),
        ]),
      ) as Record<Level, PhrasalVerbItem[]>,
    },
    stories: Object.fromEntries(
      LEVELS.map((level) => [level, readJson<StoryContent>(STORY_FILES[level])]),
    ) as Record<Level, StoryContent>,
    grammarNodes: readJson<GrammarNode[]>(GRAMMAR_FILE),
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings)
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings)
  }
  return []
}

function formStrings(forms: WordEntry['forms']): string[] {
  return Array.isArray(forms) ? forms : Object.values(forms)
}

function standalonePattern(text: string): RegExp {
  const escapedWords = text
    .split(' ')
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')

  return new RegExp(`\\b${escapedWords}\\b`, 'i')
}

describe('구동사와 수동 스토리 콘텐츠', () => {
  test('필수 wordlist, 문법, 구동사, 스토리, 스키마 파일을 모두 읽고 파싱한다', () => {
    const failures = CONTENT_FILES.flatMap((path) => {
      try {
        readJson(path)
        return []
      } catch (error) {
        return [`${path}: ${error instanceof Error ? error.message : String(error)}`]
      }
    })

    expect(failures).toEqual([])
  })

  test('실제 전체 카탈로그와 수동 스토리 커버리지가 개발 검증을 통과한다', () => {
    const catalog = loadCatalog()

    expect(validateCatalog(catalog, 'development')).toEqual([])
    expect(validateStoryCoverage(catalog)).toEqual([])
  })

  test('top 8개와 레벨별 2개가 정확한 ID, 구동사, 동일 payload를 공유한다', () => {
    const { top, byLevel } = loadCatalog().phrasalVerbs
    const expectedTop = LEVELS.flatMap((level) =>
      EXPECTED_PHRASALS[level].map(([id, phrase]) => [id, phrase, level]),
    )

    expect(top).toHaveLength(8)
    expect(top.map(({ id, phrasalVerb, levelHint }) => [id, phrasalVerb, levelHint]))
      .toEqual(expectedTop)

    for (const level of LEVELS) {
      expect(byLevel[level]).toHaveLength(2)
      expect(byLevel[level].map(({ id, phrasalVerb }) => [id, phrasalVerb]))
        .toEqual(EXPECTED_PHRASALS[level])
    }

    const byLevelUnion = LEVELS.flatMap((level) => byLevel[level])
    expect(byLevelUnion).toEqual(top)

    const topById = new Map(top.map((item) => [item.id, item]))
    byLevelUnion.forEach((item) => expect(item).toEqual(topById.get(item.id)))
  })

  test('모든 구동사에 완전한 한국어 뜻, 고유 예문, 사용 설명과 독립 구동사 예문이 있다', () => {
    const top = loadCatalog().phrasalVerbs.top
    const allExamples = top.flatMap(({ examples }) => examples)

    expect(new Set(allExamples).size).toBe(allExamples.length)
    expect(collectStrings(top).some((value) => PLACEHOLDER_PATTERN.test(value))).toBe(false)

    for (const item of top) {
      expect(item.id).toBe(`phrasal-${item.phrasalVerb.replaceAll(' ', '-')}`)
      expect(item.phrasalVerb).toBe(`${item.baseVerb} ${item.particle}`)
      expect(item.meaningKo.length).toBeGreaterThanOrEqual(1)
      expect(item.meaningKo.every((meaning) => meaning.trim().length > 0)).toBe(true)
      expect(item.examples.length).toBeGreaterThanOrEqual(2)
      expect(item.examples.every((example) => example.trim().length > 0)).toBe(true)
      expect(item.examples.some((example) => standalonePattern(item.phrasalVerb).test(example)))
        .toBe(true)
      expect(item.partOfSpeech).toBe('phrasalVerb')
      expect(item.usageNotes.trim().length).toBeGreaterThanOrEqual(10)
      expect(item.usageNotes).toMatch(/[가-힣]/)
    }

    expect(new Set(top.map(({ difficulty }) => difficulty)).size).toBeGreaterThan(1)
  })

  test.each(LEVELS)('%s 스토리는 해당 wordlist 전체를 정확한 품사와 형태로 사용한다', (level) => {
    const catalog = loadCatalog()
    const words = catalog.wordlists[level]
    const story = catalog.stories[level]

    expect(story).toMatchObject({
      schemaVersion: '1.0.0',
      level,
      isManual: true,
      coverage: {
        mustCoverAll: true,
        allowUpperLevelWords: false,
        coverageRate: 1,
      },
      ...EXPECTED_STORIES[level],
    })
    expect(story.title).toMatch(/[가-힣]/)
    expect(story.title.length).toBeLessThanOrEqual(20)
    expect(story.usedWords.map(({ lemma }) => lemma)).toEqual(words.map(({ lemma }) => lemma))

    story.usedWords.forEach((usedWord, index) => {
      const word = words[index]
      const entry = word?.entries[0]

      expect(word).toBeDefined()
      expect(entry).toBeDefined()
      expect(usedWord).toEqual({
        lemma: word?.lemma,
        partOfSpeech: entry?.partOfSpeech,
        forms: entry ? formStrings(entry.forms) : [],
      })
      expect(standalonePattern(usedWord.lemma).test(story.storyText)).toBe(true)
    })

    expect(collectStrings(story).some((value) => PLACEHOLDER_PATTERN.test(value))).toBe(false)
  })
})

describe('구동사 JSON 스키마', () => {
  test('draft 2020-12 배열과 닫힌 PhrasalVerbItem 계약을 정의한다', () => {
    const schema = readJson<PhrasalSchema>(PHRASAL_SCHEMA_FILE)
    const itemSchema = schema.$defs.PhrasalVerbItem

    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.type).toBe('array')
    expect(schema.minItems).toBe(1)
    expect(schema.items).toEqual({ $ref: '#/$defs/PhrasalVerbItem' })
    expect(itemSchema.required).toEqual(PHRASAL_FIELDS)
    expect(Object.keys(itemSchema.properties ?? {})).toEqual(PHRASAL_FIELDS)
    expect(itemSchema.additionalProperties).toBe(false)

    for (const field of ['id', 'baseVerb', 'particle', 'phrasalVerb', 'usageNotes'] as const) {
      expect(itemSchema.properties?.[field]?.pattern).toBe('\\S')
    }
    expect(itemSchema.properties?.levelHint?.enum).toEqual(LEVELS)
    expect(itemSchema.properties?.difficulty?.enum).toEqual(DIFFICULTIES)
    expect(itemSchema.properties?.meaningKo).toMatchObject({ minItems: 1 })
    expect(itemSchema.properties?.meaningKo?.items?.pattern).toBe('\\S')
    expect(itemSchema.properties?.examples).toMatchObject({ minItems: 2 })
    expect(itemSchema.properties?.examples?.items?.pattern).toBe('\\S')
    expect(itemSchema.properties?.partOfSpeech).toMatchObject({
      type: 'string',
      const: 'phrasalVerb',
    })
  })
})

describe('수동 스토리 JSON 스키마', () => {
  test('draft 2020-12 닫힌 계약에 필수 필드, 배열 하한과 coverage 범위를 정의한다', () => {
    const schema = readJson<StorySchema>(STORY_SCHEMA_FILE)
    const coverageSchema = schema.properties?.coverage
    const usedWordsSchema = schema.properties?.usedWords
    const usedWordSchema = usedWordsSchema?.items

    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.type).toBe('object')
    expect(schema.required).toEqual(STORY_FIELDS)
    expect(Object.keys(schema.properties ?? {})).toEqual(STORY_FIELDS)
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties?.schemaVersion?.pattern).toBe('\\S')
    expect(schema.properties?.level?.enum).toEqual(LEVELS)
    expect(schema.properties?.title?.pattern).toBe('\\S')
    expect(schema.properties?.storyText?.pattern).toBe('\\S')
    expect(schema.properties?.isManual?.type).toBe('boolean')

    expect(coverageSchema?.required).toEqual([
      'mustCoverAll',
      'allowUpperLevelWords',
      'coverageRate',
    ])
    expect(coverageSchema?.additionalProperties).toBe(false)
    expect(coverageSchema?.properties?.mustCoverAll?.type).toBe('boolean')
    expect(coverageSchema?.properties?.allowUpperLevelWords?.type).toBe('boolean')
    expect(coverageSchema?.properties?.coverageRate).toMatchObject({
      type: 'number',
      minimum: 0,
      maximum: 1,
    })

    expect(usedWordsSchema?.minItems).toBe(1)
    expect(usedWordSchema?.required).toEqual(['lemma', 'partOfSpeech', 'forms'])
    expect(usedWordSchema?.additionalProperties).toBe(false)
    expect(usedWordSchema?.properties?.lemma?.pattern).toBe('\\S')
    expect(usedWordSchema?.properties?.partOfSpeech?.pattern).toBe('\\S')
    expect(usedWordSchema?.properties?.forms?.minItems).toBe(1)
    expect(usedWordSchema?.properties?.forms?.items?.pattern).toBe('\\S')
  })
})
