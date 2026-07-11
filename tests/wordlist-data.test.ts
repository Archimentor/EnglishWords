import { readFileSync } from 'node:fs'
import { DIFFICULTIES, LEVELS } from '../src/domain/content/types'
import type { Level, WordEntry, WordItem } from '../src/domain/content/types'
import * as contentValidation from '../src/domain/content/validation'
import { makeCatalog } from '../src/test/fixtures'

const WORDLIST_FILES: Record<Level, string> = {
  기초: '../public/data/wordlists/기초.json',
  유치원: '../public/data/wordlists/유치원.json',
  초등학교: '../public/data/wordlists/초등학교.json',
  중학교: '../public/data/wordlists/중학교.json',
}

const EXPECTED_WORDS: Record<Level, readonly string[]> = {
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

const WORD_ITEM_FIELDS = [
  'id',
  'word',
  'lemma',
  'level',
  'familyId',
  'isFamilyHead',
  'difficulty',
  'entries',
] as const

const WORD_ENTRY_FIELDS = [
  'partOfSpeech',
  'forms',
  'meanings',
  'ipa',
  'examples',
] as const

const VERB_FORM_KEYS = ['base', 's3', 'past', 'participle', 'pastParticiple'] as const
const PLACEHOLDER_PATTERN = /TODO|TBD|준비\s*중|placeholder/i

interface SchemaNode {
  type?: string
  enum?: string[]
  pattern?: string
  minItems?: number
  minProperties?: number
  required?: string[]
  items?: SchemaNode
  properties?: Record<string, SchemaNode>
  additionalProperties?: boolean | SchemaNode
  oneOf?: SchemaNode[]
  $ref?: string
}

interface WordlistSchema extends SchemaNode {
  $schema: string
  $defs: Record<'WordItem' | 'WordEntry', SchemaNode>
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T
}

function loadWordlists(): Record<Level, WordItem[]> {
  return Object.fromEntries(
    LEVELS.map((level) => [level, readJson<WordItem[]>(WORDLIST_FILES[level])]),
  ) as Record<Level, WordItem[]>
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

describe('representative wordlist data', () => {
  test.each(LEVELS)('%s 파일의 단계별 lemma 수와 순서를 보장한다', (level) => {
    const words = loadWordlists()[level]

    if (level === '기초') {
      expect(words).toHaveLength(200)
      expect(words.slice(0, 5).map(({ lemma }) => lemma))
        .toEqual(['apple', 'baby', 'bag', 'ball', 'bed'])
    } else {
      expect(words).toHaveLength(8)
      expect(words.map(({ lemma }) => lemma)).toEqual(EXPECTED_WORDS[level])
    }
    expect(words.every(({ word, lemma, level: itemLevel }) => word === lemma && itemLevel === level))
      .toBe(true)
    if (level !== '기초') {
      expect(new Set(words.map(({ difficulty }) => difficulty)).size).toBeGreaterThan(1)
    }
  })

  test('224개 항목의 ID, lemma, 예문이 중복되지 않고 모든 난이도를 대표한다', () => {
    const words = LEVELS.flatMap((level) => loadWordlists()[level])
    const examples = words.flatMap(({ entries }) =>
      entries.flatMap((entry) => entry.examples),
    )

    expect(words).toHaveLength(224)
    expect(new Set(words.map(({ id }) => id)).size).toBe(224)
    expect(new Set(words.map(({ lemma }) => lemma)).size).toBe(224)
    expect(new Set(words.map(({ difficulty }) => difficulty))).toEqual(new Set(DIFFICULTIES))
    expect(new Set(examples).size).toBe(examples.length)
  })

  test('모든 entry가 발음, 뜻, 형태, 예문을 갖고 각 항목 예문에 lemma가 독립 단어로 나온다', () => {
    const words = LEVELS.flatMap((level) => loadWordlists()[level])

    for (const item of words) {
      expect(item.entries.length).toBeGreaterThanOrEqual(1)
      expect(item.isFamilyHead).toBe(true)

      for (const entry of item.entries) {
        expect(entry.partOfSpeech.trim()).not.toBe('')
        expect(entry.meanings.length).toBeGreaterThanOrEqual(1)
        expect(entry.meanings.every((meaning) => meaning.trim().length > 0)).toBe(true)
        expect(entry.ipa.trim()).not.toBe('')
        expect(entry.examples.length).toBeGreaterThanOrEqual(2)
        expect(entry.examples.every((example) => example.trim().length > 0)).toBe(true)
        expect(formStrings(entry.forms).length).toBeGreaterThanOrEqual(1)
        expect(formStrings(entry.forms).every((form) => form.trim().length > 0)).toBe(true)

        if (entry.partOfSpeech === 'verb') {
          expect(Array.isArray(entry.forms)).toBe(false)
          expect(Object.keys(entry.forms)).toEqual(VERB_FORM_KEYS)
        } else if (entry.partOfSpeech === 'noun') {
          expect(Array.isArray(entry.forms)).toBe(true)
        }
      }

      const lemmaPattern = new RegExp(`\\b${item.lemma}\\b`, 'i')
      expect(item.entries.some(({ examples }) => examples.some((example) => lemmaPattern.test(example))))
        .toBe(true)
    }
  })

  test('레벨이 파일과 일치하고 placeholder 텍스트가 없다', () => {
    const wordlists = loadWordlists()

    for (const level of LEVELS) {
      expect(wordlists[level].every((item) => item.level === level)).toBe(true)
    }

    expect(collectStrings(wordlists).some((value) => PLACEHOLDER_PATTERN.test(value))).toBe(false)
  })

  test('실제 wordlist를 검증하되 Task 3C 전에는 story coverage를 사용하지 않는다', () => {
    const catalog = makeCatalog({ wordlists: loadWordlists() })
    const storyCoverageSpy = vi.spyOn(contentValidation, 'validateStoryCoverage')

    try {
      expect(contentValidation.validateCatalog(catalog, 'development')).toEqual([])
      expect(storyCoverageSpy).not.toHaveBeenCalled()
    } finally {
      storyCoverageSpy.mockRestore()
    }
  })
})

describe('wordlist JSON schema', () => {
  test('draft 2020-12로 WordItem과 entry의 닫힌 계약을 정의한다', () => {
    const schema = readJson<WordlistSchema>('../public/data/schema/wordlist.schema.json')
    const itemSchema = schema.$defs.WordItem
    const entrySchema = schema.$defs.WordEntry

    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.type).toBe('array')
    expect(schema.minItems).toBe(1)
    expect(schema.items).toEqual({ $ref: '#/$defs/WordItem' })

    expect(itemSchema.required).toEqual(WORD_ITEM_FIELDS)
    expect(itemSchema.additionalProperties).toBe(false)
    expect(itemSchema.properties?.level?.enum).toEqual(LEVELS)
    expect(itemSchema.properties?.difficulty?.enum).toEqual(DIFFICULTIES)
    expect(itemSchema.properties?.entries?.minItems).toBe(1)
    for (const field of ['id', 'word', 'lemma', 'familyId'] as const) {
      expect(itemSchema.properties?.[field]?.pattern).toBe('\\S')
    }

    expect(entrySchema.required).toEqual(WORD_ENTRY_FIELDS)
    expect(entrySchema.additionalProperties).toBe(false)
    expect(entrySchema.properties?.meanings?.minItems).toBe(1)
    expect(entrySchema.properties?.examples?.minItems).toBe(2)
    expect(entrySchema.properties?.ipa?.pattern).toBe('\\S')

    const forms = entrySchema.properties?.forms?.oneOf
    expect(forms).toHaveLength(2)
    expect(forms?.[0]).toMatchObject({
      type: 'array',
      minItems: 1,
      items: { type: 'string', pattern: '\\S' },
    })
    expect(forms?.[1]).toMatchObject({
      type: 'object',
      minProperties: 1,
      additionalProperties: { type: 'string', pattern: '\\S' },
    })
  })
})
