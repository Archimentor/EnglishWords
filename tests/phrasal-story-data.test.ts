import { readFileSync } from 'node:fs'
import {
  containsPhrasalUse,
  isSafePhrasalContent,
  isSuitablePhrasalExample,
} from '../scripts/content/phrasalSource'
import {
  isPhrasalContentAgeAppropriate,
  type PhrasalCatalogProvenance,
} from '../scripts/content/buildPhrasalCatalog'
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
import { hasWholeWordForm } from '../src/domain/content/storyForms'

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
const PHRASAL_PROVENANCE_FILE = '../public/data/provenance/phrasal-catalog.json'
const GRAMMAR_FILE = '../public/data/grammar/nodes.json'
const PHRASAL_SCHEMA_FILE = '../public/data/schema/phrasal.schema.json'
const STORY_SCHEMA_FILE = '../public/data/schema/story.schema.json'

const CONTENT_FILES = [
  ...LEVELS.map((level) => WORDLIST_FILES[level]),
  GRAMMAR_FILE,
  TOP_PHRASAL_FILE,
  PHRASAL_PROVENANCE_FILE,
  ...LEVELS.map((level) => PHRASAL_FILES[level]),
  ...LEVELS.map((level) => STORY_FILES[level]),
  PHRASAL_SCHEMA_FILE,
  STORY_SCHEMA_FILE,
] as const

const PHRASAL_QUOTA = 250

const PHRASAL_FIELDS = [
  'id',
  'baseVerb',
  'particle',
  'phrasalVerb',
  'ipa',
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
  'usedPhrasalVerbs',
  'storyText',
  'vocabularyPracticeText',
  'phrasalVerbPracticeText',
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

describe('구동사와 승인 정본 스토리 콘텐츠', () => {
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

  test('실제 전체 카탈로그와 스토리 커버리지가 개발 검증을 통과한다', () => {
    const catalog = loadCatalog()

    expect(validateCatalog(catalog, 'development')).toEqual([])
    expect(validateStoryCoverage(catalog)).toEqual([])
  })

  test('top 1,000개와 레벨별 250개가 전역적으로 유일하고 동일 payload를 공유한다', () => {
    const { top, byLevel } = loadCatalog().phrasalVerbs

    expect(top).toHaveLength(PHRASAL_QUOTA * LEVELS.length)
    expect(new Set(top.map(({ id }) => id)).size).toBe(top.length)
    expect(new Set(top.map(({ phrasalVerb }) => phrasalVerb)).size).toBe(top.length)

    for (const level of LEVELS) {
      expect(byLevel[level]).toHaveLength(PHRASAL_QUOTA)
      expect(byLevel[level].every(({ levelHint }) => levelHint === level)).toBe(true)
    }

    const byLevelUnion = LEVELS.flatMap((level) => byLevel[level])
    expect(byLevelUnion).toEqual(top)

    const topById = new Map(top.map((item) => [item.id, item]))
    byLevelUnion.forEach((item) => expect(item).toEqual(topById.get(item.id)))
  })

  test('모든 구동사에 완전한 한국어 뜻, 고유 예문, 사용 설명과 독립 구동사 예문이 있다', () => {
    const { top, byLevel } = loadCatalog().phrasalVerbs
    const provenance = readJson<PhrasalCatalogProvenance>(PHRASAL_PROVENANCE_FILE)
    const provenanceByPhrase = new Map(provenance.phrases.map((phrase) => [phrase.phrase, phrase]))
    const allExamples = top.flatMap(({ examples }) => examples)

    expect(new Set(allExamples).size).toBe(allExamples.length)
    expect(collectStrings(top).some((value) => PLACEHOLDER_PATTERN.test(value))).toBe(false)

    for (const item of top) {
      expect(item.id).toBe(`phrasal-${item.phrasalVerb.replaceAll(' ', '-')}`)
      expect(item.phrasalVerb).toBe(`${item.baseVerb} ${item.particle}`)
      expect(item.ipa).toMatch(/^\/[^/]+\/$/)
      expect(item.meaningKo.length).toBeGreaterThanOrEqual(1)
      expect(item.meaningKo.every((meaning) => meaning.trim().length > 0)).toBe(true)
      expect(item.examples.length).toBeGreaterThanOrEqual(2)
      expect(item.examples.every((example) => example.trim().length > 0)).toBe(true)
      expect(item.examples.every(isSuitablePhrasalExample)).toBe(true)
      if (item.levelHint === '기초' || item.levelHint === '유치원') {
        const phraseProvenance = provenanceByPhrase.get(item.phrasalVerb)
        expect(phraseProvenance, item.phrasalVerb).toBeDefined()
        expect(isPhrasalContentAgeAppropriate({
          phrase: item.phrasalVerb,
          description: phraseProvenance!.englishDescription,
          meaningKo: item.meaningKo[0]!,
          examples: item.examples,
        }, item.levelHint), item.phrasalVerb).toBe(true)
      }
      expect(item.meaningKo.every(isSafePhrasalContent)).toBe(true)
      expect(
        item.examples.every((example) => containsPhrasalUse(example, item.phrasalVerb)),
        item.phrasalVerb,
      ).toBe(true)
      expect(item.partOfSpeech).toBe('phrasalVerb')
      expect(item.usageNotes.trim().length).toBeGreaterThanOrEqual(10)
      expect(item.usageNotes).toMatch(/[가-힣]/)
    }

    expect(new Set(top.map(({ difficulty }) => difficulty))).toEqual(new Set(DIFFICULTIES))
    for (const level of LEVELS) {
      expect(new Set(byLevel[level].map(({ difficulty }) => difficulty)))
        .toEqual(new Set(DIFFICULTIES))
    }
    const laterOnlySenses = new Set([
      'pay into', 'cough up', 'settle up', 'marry off', 'walk out', 'put aside', 'pay out',
    ])
    expect(top.filter(({ phrasalVerb }) => laterOnlySenses.has(phrasalVerb))
      .every(({ levelHint }) => levelHint === '초등학교' || levelHint === '중학교')).toBe(true)
  }, 20_000)

  test('감사된 다섯 구동사의 뜻과 대표 sense가 자연스러운 정본을 유지한다', () => {
    const byPhrase = new Map(loadCatalog().phrasalVerbs.top.map((item) => [item.phrasalVerb, item]))

    expect(byPhrase.get('hang out')).toMatchObject({
      meaningKo: ['친구들과 어울려 시간을 보내다'],
      examples: expect.arrayContaining([
        'Children like to hang out with friends after school.',
      ]),
    })
    expect(byPhrase.get('tune out')?.meaningKo).toEqual(['주의를 기울이지 않고 흘려듣다'])
    expect(byPhrase.get('dig over')?.meaningKo)
      .toEqual(['새 식물을 심을 준비를 하려고 땅을 파서 고르다'])
    expect(byPhrase.get('lose out')?.meaningKo)
      .toEqual(['다른 사람이 얻는 이익이나 기회를 얻지 못하다'])
    expect(byPhrase.get('lay on')?.meaningKo).toEqual(['음식, 오락, 서비스 등을 특히 무료로 제공하다'])
  })

  test.each(LEVELS)('%s 승인 정본 스토리는 통합 단어장 전체를 실제 장면에서 사용한다', (level) => {
    const catalog = loadCatalog()
    const words = catalog.wordlists[level]
    const phrasalVerbs = catalog.phrasalVerbs.byLevel[level]
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
    })
    expect(story.title).toMatch(/[가-힣]/)
    expect(story.title.length).toBeLessThanOrEqual(20)
    expect(story.usedWords.map(({ lemma }) => lemma)).toEqual(words.map(({ lemma }) => lemma))
    expect(story.usedPhrasalVerbs.map(({ id }) => id))
      .toEqual(phrasalVerbs.map(({ id }) => id))

    story.usedWords.forEach((usedWord) => {
      const word = words.find(({ lemma }) => lemma === usedWord.lemma)
      const hasMatchingEntry = word?.entries.some((entry) => {
        const normalizedForms = formStrings(entry.forms)

        return entry.partOfSpeech === usedWord.partOfSpeech
          && usedWord.forms.every((form) => normalizedForms.includes(form))
      })

      expect(word).toBeDefined()
      expect(hasMatchingEntry).toBe(true)
      expect(usedWord.forms.length).toBeGreaterThan(0)
      const readingPackage = [
        story.storyText,
        story.vocabularyPracticeText,
        story.phrasalVerbPracticeText,
      ].join('\n\n')
      expect(usedWord.forms.every((form) => hasWholeWordForm(readingPackage, form))).toBe(true)
    })

    story.usedPhrasalVerbs.forEach((usedPhrasalVerb) => {
      const phrasalVerb = phrasalVerbs.find(({ id }) => id === usedPhrasalVerb.id)
      expect(phrasalVerb).toBeDefined()
      expect(usedPhrasalVerb.phrasalVerb).toBe(phrasalVerb?.phrasalVerb)
      expect(phrasalVerb?.examples).toContain(usedPhrasalVerb.example)
      expect(containsPhrasalUse(usedPhrasalVerb.example, usedPhrasalVerb.phrasalVerb)).toBe(true)
      expect(story.phrasalVerbPracticeText).toContain(usedPhrasalVerb.example)
      expect(story.phrasalVerbPracticeText).toContain(`“${usedPhrasalVerb.example}”`)
    })

    const paragraphs = story.storyText.trim().split(/\n\s*\n/u)
    const sentences = story.storyText.match(/[^.!?]+[.!?]+/gu) ?? []
    const multiSentenceParagraphs = paragraphs.filter((paragraph) =>
      (paragraph.match(/[.!?]+/gu) ?? []).length >= 2)
    expect(story.storyText).not.toMatch(
      /[“"]\s*[\p{L}\p{N}]+(?:['’–-][\p{L}\p{N}]+)*\s*[”"]\s*,\s*[“"]/u,
    )
    expect(paragraphs[0]).toMatch(/\bMina\b/u)
    expect(paragraphs.at(-1)).toMatch(/\bMina\b/u)
    expect(sentences.length).toBeGreaterThanOrEqual(12)
    expect(multiSentenceParagraphs.length).toBeGreaterThanOrEqual(Math.ceil(paragraphs.length / 2))
    expect(story.vocabularyPracticeText.trim().split(/\n\s*\n/u).length).toBeGreaterThan(0)
    const quotedWordExamples = [...story.vocabularyPracticeText.matchAll(/“([^”]+)”/gu)]
    expect(quotedWordExamples.length).toBeGreaterThanOrEqual(words.length - 1)
    const phrasalParagraphs = story.phrasalVerbPracticeText.trim().split(/\n\s*\n/u)
    expect(phrasalParagraphs.length).toBeGreaterThanOrEqual(Math.ceil(phrasalVerbs.length / 5))
    expect(phrasalParagraphs.every((paragraph) => /\bMina\b/u.test(paragraph))).toBe(true)
    expect(new Set(phrasalParagraphs).size).toBe(phrasalParagraphs.length)

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

    for (const field of ['id', 'baseVerb', 'particle', 'phrasalVerb', 'ipa', 'usageNotes'] as const) {
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
    const usedPhrasalVerbsSchema = schema.properties?.usedPhrasalVerbs
    const usedPhrasalVerbSchema = usedPhrasalVerbsSchema?.items

    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.type).toBe('object')
    expect(schema.required).toEqual(STORY_FIELDS)
    expect(Object.keys(schema.properties ?? {})).toEqual(STORY_FIELDS)
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties?.schemaVersion?.pattern).toBe('\\S')
    expect(schema.properties?.level?.enum).toEqual(LEVELS)
    expect(schema.properties?.title?.pattern).toBe('\\S')
    expect(schema.properties?.storyText?.pattern).toBe('\\S')
    expect(schema.properties?.vocabularyPracticeText?.pattern).toBe('\\S')
    expect(schema.properties?.phrasalVerbPracticeText?.pattern).toBe('\\S')
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
    expect(usedPhrasalVerbSchema?.required).toEqual(['id', 'phrasalVerb', 'example'])
    expect(usedPhrasalVerbSchema?.additionalProperties).toBe(false)
    expect(usedPhrasalVerbSchema?.properties?.id?.pattern).toBe('\\S')
    expect(usedPhrasalVerbSchema?.properties?.phrasalVerb?.pattern).toBe('\\S')
    expect(usedPhrasalVerbSchema?.properties?.example?.pattern).toBe('\\S')
  })
})
