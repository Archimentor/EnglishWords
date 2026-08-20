import { readFileSync } from 'node:fs'
import { DIFFICULTIES, LEVELS } from '../src/domain/content/types'
import type { Level, WordEntry, WordItem } from '../src/domain/content/types'
import {
  isBlockedCatalogLemma,
  isInflectionCrossReference,
  isLearnerSafeExample,
  isLearnerSafeExampleForLevel,
  isSuitableExample,
  SENSITIVE_TOPIC_POLICY,
  sentenceFormsMatchPartOfSpeech,
} from '../scripts/content/buildWordCatalog'
import * as contentValidation from '../src/domain/content/validation'
import { normalizeWordExampleKey } from '../src/domain/content/validators/words'
import {
  CURATED_WORD_FAMILY_OVERRIDES,
  wordFamilyFor,
} from '../src/domain/content/wordFamilies'
import { makeCatalog } from '../src/test/fixtures'

const WORDLIST_FILES: Record<Level, string> = {
  기초: '../public/data/wordlists/기초.json',
  유치원: '../public/data/wordlists/유치원.json',
  초등학교: '../public/data/wordlists/초등학교.json',
  중학교: '../public/data/wordlists/중학교.json',
}

const WORD_QUOTAS: Record<Level, number> = {
  기초: 500,
  유치원: 500,
  초등학교: 1500,
  중학교: 2500,
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

const REQUIRED_VERB_FORM_KEYS = ['base', 's3', 'past', 'participle', 'pastParticiple'] as const
const PLACEHOLDER_PATTERN = /TODO|TBD|준비\s*중|placeholder/i
const DEFECTIVE_VERBS = new Set([
  'can', 'could', 'may', 'might', 'must', 'ought', 'shall', 'should', 'will', 'would',
])
const DEFECTIVE_VERB_FORMS: Readonly<Record<string, readonly string[]>> = {
  can: ['can', 'could'],
  could: ['could'],
  may: ['may', 'might'],
  might: ['might'],
  must: ['must'],
  ought: ['ought'],
  shall: ['shall', 'should'],
  should: ['should'],
  will: ['will', 'would'],
  would: ['would'],
}

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

interface WordCatalogProvenance {
  schemaVersion: string
  generatedBy: string
  outputDigest: {
    algorithm: string
    canonicalization: string
    value: string
  }
  selectionPolicy: {
    quotas: Record<Level, number>
  }
  words: Array<{
    lemma: string
    level: Level
    cefrLine: number | null
    frequencyLine: number | null
    entries: Array<{
      koreanWiktionaryPage: string | null
      omwSynsetIds: string[] | null
      sourcePartOfSpeech: string | null
      catalogPartOfSpeech: string
      partOfSpeechResolution:
        | 'editorial-basic'
        | 'exact-source-sense'
        | 'alternate-wiktionary-sense'
        | 'editorial-source-pos-override'
        | 'additional-wiktionary-sense'
        | 'omw-bilingual-synset'
        | 'editorial-core-anchor'
      ipaSource: 'ipa-dict' | 'editorial-basic'
      exampleSourceLines: number[] | null
    }>
  }>
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

describe('release wordlist data', () => {
  test.each(LEVELS)('%s 파일은 최종 레벨 할당량과 항목 구조를 충족한다', (level) => {
    const words = loadWordlists()[level]

    expect(words).toHaveLength(WORD_QUOTAS[level])
    expect(words.every(({ word, lemma, level: itemLevel }) => word === lemma && itemLevel === level))
      .toBe(true)
    expect(new Set(words.map(({ id }) => id)).size).toBe(words.length)
    expect(new Set(words.map(({ lemma }) => lemma)).size).toBe(words.length)
    expect(words.every(({ isFamilyHead }) => isFamilyHead)).toBe(true)
    expect(new Set(words.map(({ familyId }) => familyId)).size).toBe(words.length)
    expect(new Set(words.map(({ difficulty }) => difficulty))).toEqual(new Set(DIFFICULTIES))
  })

  test('5,000개 항목의 ID·lemma·예문은 전역적으로 중복되지 않고 난이도를 대표한다', () => {
    const words = LEVELS.flatMap((level) => loadWordlists()[level])
    const examples = words.flatMap(({ entries }) =>
      entries.flatMap((entry) => entry.examples),
    )

    expect(words).toHaveLength(5000)
    expect(new Set(words.map(({ id }) => id)).size).toBe(words.length)
    expect(new Set(words.map(({ lemma }) => lemma)).size).toBe(words.length)
    expect(words.every(({ isFamilyHead }) => isFamilyHead)).toBe(true)
    expect(new Set(words.map(({ familyId }) => familyId)).size).toBe(words.length)
    expect(new Set(words.map(({ difficulty }) => difficulty))).toEqual(new Set(DIFFICULTIES))
    expect(new Set(examples.map(normalizeWordExampleKey)).size).toBe(examples.length)
  })

  test('curated 파생군은 원형 head만 남기고 파생 lemma를 중복 선택하지 않는다', () => {
    const wordsByLemma = new Map(LEVELS.flatMap((level) => loadWordlists()[level])
      .map((word) => [word.lemma, word]))

    for (const family of CURATED_WORD_FAMILY_OVERRIDES) {
      const selectedMembers = family.members.filter((lemma) => wordsByLemma.has(lemma))
      expect(
        selectedMembers.length === 0
          || (selectedMembers.length === 1 && selectedMembers[0] === family.headLemma),
        family.familyId,
      ).toBe(true)
      if (selectedMembers.length > 0) {
        expect(wordsByLemma.get(family.headLemma)).toMatchObject({
          familyId: family.familyId,
          isFamilyHead: true,
        })
      }
    }
  })

  test('모든 entry가 발음, 뜻, 형태를 갖고 각 예문에 해당 entry의 독립된 표면형이 나온다', () => {
    const words = LEVELS.flatMap((level) => loadWordlists()[level])

    for (const item of words) {
      expect(item.entries.length).toBeGreaterThanOrEqual(1)
      const family = wordFamilyFor(item.lemma)
      expect(item).toMatchObject({
        familyId: family.familyId,
        isFamilyHead: family.isFamilyHead,
      })

      for (const entry of item.entries) {
        expect(entry.partOfSpeech.trim()).not.toBe('')
        expect(entry.meanings.length).toBeGreaterThanOrEqual(1)
        expect(entry.meanings.every((meaning) => meaning.trim().length > 0)).toBe(true)
        expect(entry.ipa.trim()).not.toBe('')
        expect(entry.examples.length).toBeGreaterThanOrEqual(2)
        expect(entry.examples.every((example) => example.trim().length > 0)).toBe(true)
        expect(formStrings(entry.forms).length).toBeGreaterThanOrEqual(1)
        expect(formStrings(entry.forms).every((form) => form.trim().length > 0)).toBe(true)
        const formPatterns = formStrings(entry.forms).map((form) =>
          new RegExp(`\\b${form.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i'))
        expect(entry.examples.every((example) =>
          formPatterns.some((pattern) => pattern.test(example)))).toBe(true)

        if (entry.partOfSpeech === 'verb' && !Array.isArray(entry.forms)) {
          expect(REQUIRED_VERB_FORM_KEYS.every((key) => key in entry.forms)).toBe(true)
          if (item.lemma === 'be') {
            expect(entry.forms).toMatchObject({
              firstPerson: 'am', presentPlural: 'are', pastPlural: 'were',
            })
          }
        } else if (entry.partOfSpeech === 'verb') {
          expect(Array.isArray(entry.forms)).toBe(true)
          if (!Array.isArray(entry.forms)) throw new Error(`${item.lemma} must use defective verb forms`)
          expect(DEFECTIVE_VERBS.has(item.lemma)).toBe(true)
          expect(entry.forms[0]).toBe(item.lemma)
          expect(entry.forms.every((form) =>
            DEFECTIVE_VERB_FORMS[item.lemma]?.includes(form))).toBe(true)
        } else if (entry.partOfSpeech === 'noun') {
          expect(Array.isArray(entry.forms)).toBe(true)
        }
      }

    }
  }, 15_000)

  test('레벨이 파일과 일치하고 placeholder 텍스트가 없다', () => {
    const wordlists = loadWordlists()

    for (const level of LEVELS) {
      expect(wordlists[level].every((item) => item.level === level)).toBe(true)
    }

    expect(collectStrings(wordlists).some((value) => PLACEHOLDER_PATTERN.test(value))).toBe(false)
    expect(LEVELS.flatMap((level) => wordlists[level]).flatMap(({ lemma, entries }) =>
      entries.flatMap(({ meanings }) => meanings
        .filter((meaning) => /(?:thumb|thumbnail)\||^\s*[:;]/i.test(meaning))
        .map((meaning) => ({ lemma, meaning }))))).toEqual([])
    expect(LEVELS.flatMap((level) => wordlists[level]).flatMap(({ lemma, entries }) =>
      entries.flatMap(({ meanings }) => meanings
        .filter(isInflectionCrossReference)
        .map((meaning) => ({ lemma, meaning }))))).toEqual([])
  })

  test('학습자용 차단 어휘가 없고 모든 원천 예문이 길이·안전성 정책을 통과한다', () => {
    const words = LEVELS.flatMap((level) => loadWordlists()[level])
    const levelOrder = new Map(LEVELS.map((level, index) => [level, index]))

    expect(words.filter(({ lemma }) => isBlockedCatalogLemma(lemma))).toEqual([])
    expect(words.flatMap(({ lemma, level, entries }) => {
      const meaningText = entries.flatMap(({ meanings }) => meanings).join(' ')
      return SENSITIVE_TOPIC_POLICY
        .filter((policy) => (
          policy.lemmaPattern.test(lemma)
          || policy.meaningPattern.test(meaningText)
        ) && levelOrder.get(level)! < levelOrder.get(policy.minimumLevel)!)
        .map((policy) => ({ lemma, level, policy: policy.id }))
    })).toEqual([])
    expect(words.flatMap(({ lemma, level, entries }) => entries.flatMap(({ examples }) =>
      examples.filter((example) => !isLearnerSafeExample(example)
        || (level !== '기초' && !isSuitableExample(example))
        || !isLearnerSafeExampleForLevel(example, level))
        .map((example) => ({ lemma, example })),
    ))).toEqual([])
  })

  test('다의어 대표 품사·뜻·예문이 같은 의미로 정렬된다', () => {
    const words = new Map(LEVELS.flatMap((level) => loadWordlists()[level])
      .map((word) => [word.lemma, word]))
    const bat = words.get('bat')?.entries.find(({ partOfSpeech }) => partOfSpeech === 'noun')
    const reveal = words.get('reveal')?.entries[0]

    expect(bat?.meanings.join(' ')).toMatch(/박쥐/)
    expect(bat?.meanings.join(' ')).toMatch(/방망이|배트/)
    expect(bat?.examples).toHaveLength(2)
    expect(reveal).toMatchObject({
      partOfSpeech: 'verb',
      forms: expect.objectContaining({ base: 'reveal' }),
    })
    expect(reveal?.meanings.join(' ')).toMatch(/폭로하다|누설하다/)
  })

  test('entry별 품사 provenance가 전체 wordlist와 일치하고 원천·대체·추가 뜻을 추적한다', () => {
    const words = LEVELS.flatMap((level) => loadWordlists()[level])
    const provenance = readJson<WordCatalogProvenance>(
      '../public/data/provenance/word-catalog.json',
    )
    const records = new Map(provenance.words.map((record) => [record.lemma, record]))

    expect(provenance.schemaVersion).toBe('4.0.0')
    expect(provenance.generatedBy).toBe('scripts/content/buildWordCatalog.ts')
    expect(provenance.outputDigest).toMatchObject({
      algorithm: 'sha256',
      canonicalization: 'sorted-json-v1',
      value: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(provenance.selectionPolicy.quotas).toEqual(WORD_QUOTAS)
    expect(provenance.words).toHaveLength(words.length)
    expect(records.size).toBe(words.length)
    expect(words.flatMap<unknown>((word) => {
      const record = records.get(word.lemma)
      if (
        !record
        || record.level !== word.level
        || record.entries.length !== word.entries.length
      ) {
        return [{ lemma: word.lemma, record }]
      }

      const sourceCoordinatesArePresent = [record.cefrLine, record.frequencyLine]
        .some((line) => Number.isInteger(line) && line !== null && line > 0)
      return word.entries.flatMap<unknown>((actual, index) => {
        const entryRecord = record.entries[index]
        if (!entryRecord || entryRecord.catalogPartOfSpeech !== actual.partOfSpeech) {
          return [{ lemma: word.lemma, actual, entryRecord }]
        }

        if (entryRecord.partOfSpeechResolution === 'editorial-basic') {
          const valid = word.level === '기초'
            && entryRecord.sourcePartOfSpeech === null
            && entryRecord.koreanWiktionaryPage === null
            && entryRecord.omwSynsetIds === null
            && (entryRecord.ipaSource === 'editorial-basic'
              || entryRecord.ipaSource === 'ipa-dict')
            && entryRecord.exampleSourceLines === null
          return valid ? [] : [{ lemma: word.lemma, actual, entryRecord }]
        }

        const sourcePartOfSpeech = entryRecord.sourcePartOfSpeech
        if (entryRecord.partOfSpeechResolution === 'editorial-core-anchor') {
          const valid = sourcePartOfSpeech === actual.partOfSpeech
            && entryRecord.koreanWiktionaryPage === null
            && entryRecord.omwSynsetIds === null
            && entryRecord.ipaSource === 'ipa-dict'
            && entryRecord.exampleSourceLines === null
            && sourceCoordinatesArePresent
          return valid ? [] : [{ lemma: word.lemma, actual, entryRecord }]
        }

        const valid = word.level !== '기초'
          && typeof sourcePartOfSpeech === 'string'
          && sourcePartOfSpeech.trim().length > 0
          && entryRecord.ipaSource === 'ipa-dict'
          && entryRecord.exampleSourceLines?.length === 2
          && entryRecord.exampleSourceLines.every((line) => Number.isInteger(line) && line > 0)
          && (
            (entryRecord.partOfSpeechResolution === 'omw-bilingual-synset'
              && entryRecord.koreanWiktionaryPage === null
              && entryRecord.omwSynsetIds !== null
              && entryRecord.omwSynsetIds.length > 0
              && entryRecord.omwSynsetIds.every((coordinate) => /^\d{8}-[anrv]$/.test(coordinate)))
            || (entryRecord.koreanWiktionaryPage === word.lemma
              && entryRecord.omwSynsetIds === null
              && sourceCoordinatesArePresent
              && ((entryRecord.partOfSpeechResolution === 'exact-source-sense'
              || entryRecord.partOfSpeechResolution === 'editorial-source-pos-override')
              && sourcePartOfSpeech === actual.partOfSpeech)
              || ((entryRecord.partOfSpeechResolution === 'alternate-wiktionary-sense'
              || entryRecord.partOfSpeechResolution === 'additional-wiktionary-sense')
              && sourcePartOfSpeech !== actual.partOfSpeech))
          )
        return valid ? [] : [{ lemma: word.lemma, actual, entryRecord }]
      })
    })).toEqual([])
    const editorialBasic = provenance.words.filter(({ entries }) =>
      entries.every(({ partOfSpeechResolution }) => partOfSpeechResolution === 'editorial-basic'))
    expect(editorialBasic).toHaveLength(500)
    expect(editorialBasic.every(({ entries }) => entries.length === 1)).toBe(true)
    const coreAnchors = provenance.words.filter(({ entries }) => entries.some(
      ({ partOfSpeechResolution }) => partOfSpeechResolution === 'editorial-core-anchor',
    ))
    expect(coreAnchors).toHaveLength(0)
  })

  test('실제 비기초 다품사 lemma를 의미 있게 보존하고 모든 원천 예문의 품사를 검증한다', () => {
    const words = LEVELS.flatMap((level) => loadWordlists()[level])
    const provenance = readJson<WordCatalogProvenance>(
      '../public/data/provenance/word-catalog.json',
    )
    const provenanceByLemma = new Map(provenance.words.map((record) => [record.lemma, record]))
    const multiPartOfSpeechWords = words.filter(({ level, entries }) =>
      level !== '기초' && entries.length > 1)

    expect(multiPartOfSpeechWords.length).toBeGreaterThanOrEqual(20)
    expect(multiPartOfSpeechWords.every(({ entries }) =>
      new Set(entries.map(({ partOfSpeech }) => partOfSpeech)).size === entries.length)).toBe(true)

    const representativePartsOfSpeech = {
      answer: ['noun', 'verb'],
      book: ['noun', 'verb'],
      record: ['noun', 'verb'],
    } as const
    for (const [lemma, expectedPartsOfSpeech] of Object.entries(representativePartsOfSpeech)) {
      const word = words.find((candidate) => candidate.lemma === lemma)
      expect(word, `${lemma} must remain a selected non-basic lemma`).toBeDefined()
      expect(word?.level).not.toBe('기초')
      expect(word?.entries.map(({ partOfSpeech }) => partOfSpeech))
        .toEqual(expect.arrayContaining([...expectedPartsOfSpeech]))
    }

    for (const word of words) {
      const record = provenanceByLemma.get(word.lemma)
      expect(record, `${word.lemma} must have provenance`).toBeDefined()
      word.entries.forEach((entry, index) => {
        const sourceLines = record?.entries[index]?.exampleSourceLines
        if (sourceLines === null || sourceLines === undefined) return
        expect(sourceLines).toHaveLength(2)
        expect(entry.examples.every((sentence) =>
          sentenceFormsMatchPartOfSpeech(
            sentence,
            formStrings(entry.forms),
            entry.partOfSpeech,
            word.lemma,
            word.entries.length > 1,
          )),
        `${word.lemma}/${entry.partOfSpeech}`).toBe(true)
      })
    }
  }, 20_000)

  test('동형이의어 기능어는 문자·이름·약어 뜻으로 바뀌지 않는다', () => {
    const words = new Map(LEVELS.flatMap((level) => loadWordlists()[level])
      .map((word) => [word.lemma, word]))

    const expected = {
      a: { partOfSpeech: 'determiner', forms: ['a'], meaning: /하나의|어떤/ },
      i: { partOfSpeech: 'pronoun', forms: ['i'], meaning: /나/ },
      as: { partOfSpeech: 'preposition', forms: ['as'], meaning: /로서|처럼/ },
      us: { partOfSpeech: 'pronoun', forms: ['us'], meaning: /우리/ },
      will: { partOfSpeech: 'verb', forms: ['will'], meaning: /할 것이다|하려고/ },
    } as const
    const unsafeSense = /알파벳|로마자|남자 이름|여자 이름|미국(?:\s|$|[.,;])/i

    for (const [lemma, contract] of Object.entries(expected)) {
      const word = words.get(lemma)
      expect(word, `${lemma} must be present in the 5,000-word catalog`).toBeDefined()
      const entry = word?.entries[0]
      expect(entry, `${lemma} must have a learning entry`).toBeDefined()
      expect(entry).toMatchObject({
        partOfSpeech: contract.partOfSpeech,
        forms: contract.forms,
      })
      expect(entry?.meanings.join(' ')).toMatch(contract.meaning)
      expect(entry?.ipa).toMatch(/^\/[^/]+\/$/)
      expect(entry?.examples).toHaveLength(2)
      expect(new Set(entry?.examples ?? []).size).toBe(2)
      const lemmaPattern = new RegExp(`\\b${lemma}\\b`, 'i')
      expect(entry?.examples.every((example) => lemmaPattern.test(example))).toBe(true)
      expect(entry?.meanings.join(' '), lemma).not.toMatch(unsafeSense)
    }
  })

  test('활용형 lemma와 폐쇄형 품사를 독립 단어·가짜 활용으로 만들지 않는다', () => {
    const words = new Map(LEVELS.flatMap((level) => loadWordlists()[level])
      .map((word) => [word.lemma, word]))

    for (const lemma of ['am', 'are', 'been', 'had', 'is', 'running', 'was', 'were']) {
      expect(words.has(lemma), `${lemma} must be represented by its lexical headword`).toBe(false)
    }
    expect(words.get('writing')?.entries.some(({ partOfSpeech }) => partOfSpeech === 'verb') ?? false)
      .toBe(false)
    for (const lemma of ['anything', 'everybody', 'everything', 'something']) {
      const entry = words.get(lemma)?.entries[0]
      expect(entry?.partOfSpeech, lemma).toBe('pronoun')
      expect(entry?.forms, lemma).toEqual([lemma])
    }
    expect(words.get('can')?.entries.find(({ partOfSpeech }) => partOfSpeech === 'verb')?.forms)
      .toEqual(['can', 'could'])
    expect(words.get('workman')?.entries.find(({ partOfSpeech }) => partOfSpeech === 'noun')?.forms)
      .toEqual(['workman', 'workmen'])
    expect(words.get('cattle')?.entries.find(({ partOfSpeech }) => partOfSpeech === 'noun')?.forms)
      .toEqual(['cattle'])
  })

  test('실제 wordlist 구조는 스토리 검증과 독립적으로 development 검증을 통과한다', () => {
    const catalog = makeCatalog({ wordlists: loadWordlists() })
    LEVELS.forEach((level) => {
      catalog.stories[level].isManual = false
    })
    const storyCoverageSpy = vi.spyOn(contentValidation, 'validateStoryCoverage')

    try {
      expect(contentValidation.validateCatalog(catalog, 'development')).toEqual([])
      expect(storyCoverageSpy).not.toHaveBeenCalled()
    } finally {
      storyCoverageSpy.mockRestore()
    }
  })

  test('runtime 검증은 trim·Unicode·대소문자 차이만 있는 전역 예문 중복을 거부한다', () => {
    const catalog = makeCatalog()
    LEVELS.forEach((level, index) => {
      catalog.wordlists[level][0]!.entries[0]!.examples = [
        `Unique example ${index + 1}A.`,
        `Unique example ${index + 1}B.`,
      ]
    })
    catalog.wordlists.기초[0]!.entries[0]!.examples[0] =
      'This dam dwarfs even the Hoover dam.'
    catalog.wordlists.유치원[0]!.entries[0]!.examples[0] =
      '  ＴＨＩＳ DAM DWARFS EVEN THE HOOVER DAM.  '

    expect(contentValidation.validateCatalog(catalog, 'development')).toContainEqual({
      code: 'DUPLICATE_WORD_EXAMPLE',
      path: 'wordlists.유치원[0].entries[0].examples[0]',
      message: 'Word example duplicates an earlier example after normalization.',
    })
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
