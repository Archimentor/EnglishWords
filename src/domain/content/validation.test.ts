import {
  makeCatalog,
  makeGrammarNodes,
  makePhrasalVerb,
  makeReleaseCatalog,
} from '../../test/fixtures'
import type { ContentCatalog, Level, PhrasalVerbItem } from './types'
import { validateCatalog, validateStoryCoverage } from './validation'

function makePhrasalCatalog(
  top: PhrasalVerbItem[],
  byLevelOverrides: Partial<Record<Level, PhrasalVerbItem[]>> = {},
): ContentCatalog {
  return makeCatalog({
    phrasalVerbs: {
      top,
      byLevel: {
        기초: [],
        유치원: [],
        초등학교: [],
        중학교: [],
        ...byLevelOverrides,
      },
    },
  })
}

describe('validateCatalog', () => {
  test('개발 모드에서 유효한 카탈로그를 허용한다', () => {
    expect(validateCatalog(makeCatalog(), 'development')).toEqual([])
  })

  test('뒤 레벨에서 다시 등장한 lemma를 거부한다', () => {
    const issues = validateCatalog(makeCatalog({ duplicateLemma: 'play' }), 'development')

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'DUPLICATE_LEMMA',
        path: 'wordlists.유치원[0].lemma',
      }),
    )
  })

  test('나중에 등장한 중복 단어 ID를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          유치원: { id: 'word-play' },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'DUPLICATE_ID',
        path: 'wordlists.유치원[0].id',
      }),
    )
  })

  test('대표 단어가 없는 word family를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          기초: { isFamilyHead: false },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(expect.objectContaining({ code: 'FAMILY_HEAD_COUNT' }))
  })

  test('대표 단어가 둘인 word family를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          유치원: { familyId: 'family-play' },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(expect.objectContaining({ code: 'FAMILY_HEAD_COUNT' }))
  })

  test('뜻이 없는 품사 entry를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          기초: { entryOverrides: { meanings: [] } },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'EMPTY_MEANINGS',
        path: 'wordlists.기초[0].entries[0].meanings',
      }),
    )
  })

  test('예문이 두 개보다 적은 품사 entry를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          기초: { entryOverrides: { examples: ['I play outside.'] } },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'EXAMPLES_TOO_FEW',
        path: 'wordlists.기초[0].entries[0].examples',
      }),
    )
  })

  test('공백뿐인 IPA를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          기초: { entryOverrides: { ipa: '   ' } },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'MISSING_IPA',
        path: 'wordlists.기초[0].entries[0].ipa',
      }),
    )
  })

  test.each([
    ['null', null, 'catalog'],
    ['배열', [], 'catalog'],
    ['wordlists 누락', {}, 'wordlists'],
  ])('%s 입력에서 예외 대신 INVALID_CATALOG를 반환한다', (_name, catalog, path) => {
    expect(() => validateCatalog(catalog, 'development')).not.toThrow()
    expect(validateCatalog(catalog, 'development')).toContainEqual(
      expect.objectContaining({ code: 'INVALID_CATALOG', path }),
    )
  })

  test('형태가 잘못된 단어에서 정확한 경로의 INVALID_CATALOG를 반환한다', () => {
    const validCatalog = makeCatalog()
    const malformedCatalog = {
      ...validCatalog,
      wordlists: {
        ...validCatalog.wordlists,
        기초: [{ ...validCatalog.wordlists.기초[0]!, id: 42 }],
      },
    }

    expect(() => validateCatalog(malformedCatalog, 'development')).not.toThrow()
    expect(validateCatalog(malformedCatalog, 'development')).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_CATALOG',
        path: 'wordlists.기초[0].id',
      }),
    )
  })

  test('유효한 top과 byLevel 구동사를 허용한다', () => {
    const phrasal = makePhrasalVerb()

    expect(
      validateCatalog(
        makePhrasalCatalog([phrasal], { 기초: [{ ...phrasal }] }),
        'development',
      ),
    ).toEqual([])
  })

  test.each<[string, Partial<PhrasalVerbItem>, string]>([
    ['공백 baseVerb', { baseVerb: '   ' }, 'phrasalVerbs.top[0].baseVerb'],
    ['빈 meaningKo', { meaningKo: [] }, 'phrasalVerbs.top[0].meaningKo'],
    ['예문 1개', { examples: ['Wake up!'] }, 'phrasalVerbs.top[0].examples'],
  ])('%s 구동사를 경로별로 거부한다', (_name, overrides, path) => {
    const phrasal = makePhrasalVerb(overrides)
    const issues = validateCatalog(
      makePhrasalCatalog([phrasal], { 기초: [{ ...phrasal }] }),
      'development',
    )

    expect(issues).toContainEqual(expect.objectContaining({ code: 'INVALID_CATALOG', path }))
  })

  test.each<[
    string,
    (catalog: ContentCatalog) => unknown,
    string,
  ]>([
    [
      'top 항목 null',
      (catalog) => ({
        ...catalog,
        phrasalVerbs: { ...catalog.phrasalVerbs, top: [null] },
      }),
      'phrasalVerbs.top[0]',
    ],
    [
      'top meaningKo null',
      (catalog) => {
        const phrasal = makePhrasalVerb()
        return {
          ...catalog,
          phrasalVerbs: {
            top: [{ ...phrasal, meaningKo: null }],
            byLevel: { ...catalog.phrasalVerbs.byLevel, 기초: [phrasal] },
          },
        }
      },
      'phrasalVerbs.top[0].meaningKo',
    ],
    [
      'byLevel examples null',
      (catalog) => {
        const phrasal = makePhrasalVerb()
        return {
          ...catalog,
          phrasalVerbs: {
            top: [phrasal],
            byLevel: {
              ...catalog.phrasalVerbs.byLevel,
              기초: [{ ...phrasal, examples: null }],
            },
          },
        }
      },
      'phrasalVerbs.byLevel.기초[0].examples',
    ],
  ])('%s에서 예외 대신 INVALID_CATALOG를 반환한다', (_name, mutate, path) => {
    const malformed = mutate(makeCatalog())

    expect(() => validateCatalog(malformed, 'development')).not.toThrow()
    expect(validateCatalog(malformed, 'development')).toContainEqual(
      expect.objectContaining({ code: 'INVALID_CATALOG', path }),
    )
  })

  test('단어와 구동사가 공유한 ID의 나중 구동사 경로를 거부한다', () => {
    const phrasal = makePhrasalVerb({ id: 'word-play' })
    const issues = validateCatalog(
      makePhrasalCatalog([phrasal], { 기초: [{ ...phrasal }] }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'DUPLICATE_ID',
        path: 'phrasalVerbs.top[0].id',
      }),
    )
  })

  test('top 구동사의 나중 중복 ID 경로를 거부한다', () => {
    const phrasal = makePhrasalVerb()
    const issues = validateCatalog(
      makePhrasalCatalog([phrasal, { ...phrasal }], { 기초: [{ ...phrasal }] }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'DUPLICATE_ID',
        path: 'phrasalVerbs.top[1].id',
      }),
    )
  })

  test.each([
    [
      'top에만 있는 ID',
      () => {
        const phrasal = makePhrasalVerb()
        return makePhrasalCatalog([phrasal])
      },
      'phrasalVerbs.top[0].id',
    ],
    [
      'byLevel에만 있는 ID',
      () => {
        const phrasal = makePhrasalVerb()
        return makePhrasalCatalog([], { 기초: [phrasal] })
      },
      'phrasalVerbs.byLevel.기초[0].id',
    ],
  ] as const)('%s로 기준 집합이 다르면 거부한다', (_name, catalogFactory, path) => {
    expect(validateCatalog(catalogFactory(), 'development')).toContainEqual(
      expect.objectContaining({ code: 'PHRASAL_REFERENCE_MISMATCH', path }),
    )
  })

  test('같은 구동사 ID가 두 byLevel 파일에 속하면 두 번째 경로를 거부한다', () => {
    const phrasal = makePhrasalVerb()
    const issues = validateCatalog(
      makePhrasalCatalog([phrasal], {
        기초: [{ ...phrasal }],
        유치원: [{ ...phrasal, levelHint: '유치원' }],
      }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'PHRASAL_DUPLICATE_LEVEL',
        path: 'phrasalVerbs.byLevel.유치원[0].id',
      }),
    )
  })

  test('구동사 levelHint가 byLevel 컨테이너와 다르면 거부한다', () => {
    const phrasal = makePhrasalVerb({ levelHint: '유치원' })
    const issues = validateCatalog(
      makePhrasalCatalog([phrasal], { 기초: [{ ...phrasal }] }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'PHRASAL_LEVEL_MISMATCH',
        path: 'phrasalVerbs.byLevel.기초[0].levelHint',
      }),
    )
  })

  test('문법 노드가 42개가 아니면 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({ grammarNodes: makeGrammarNodes().slice(0, 41) }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'GRAMMAR_NODE_COUNT', path: 'grammarNodes' }),
    )
  })

  test('문법 노드 ID 형식이 잘못되면 거부한다', () => {
    const nodes = makeGrammarNodes()
    nodes[0] = { ...nodes[0]!, id: 'A1-G1' }

    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development')).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_GRAMMAR_NODE_ID',
        path: 'grammarNodes[0].id',
      }),
    )
  })

  test('문법 노드 ID 접두사와 level이 다르면 거부한다', () => {
    const nodes = makeGrammarNodes()
    nodes[0] = { ...nodes[0]!, level: 'A2' }

    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development')).toContainEqual(
      expect.objectContaining({
        code: 'GRAMMAR_LEVEL_MISMATCH',
        path: 'grammarNodes[0].level',
      }),
    )
  })

  test('문법 노드의 나중 중복 ID 경로를 거부한다', () => {
    const nodes = makeGrammarNodes()
    nodes[1] = { ...nodes[1]!, id: nodes[0]!.id }

    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development')).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_ID', path: 'grammarNodes[1].id' }),
    )
  })

  test.each<[
    string,
    (catalog: ContentCatalog) => unknown,
    string,
  ]>([
    [
      '노드 null',
      (catalog) => ({ ...catalog, grammarNodes: [null, ...catalog.grammarNodes.slice(1)] }),
      'grammarNodes[0]',
    ],
    [
      'canDo null',
      (catalog) => ({
        ...catalog,
        grammarNodes: [
          { ...catalog.grammarNodes[0], canDo: null },
          ...catalog.grammarNodes.slice(1),
        ],
      }),
      'grammarNodes[0].canDo',
    ],
    [
      '빈 patterns',
      (catalog) => ({
        ...catalog,
        grammarNodes: [
          { ...catalog.grammarNodes[0], patterns: [] },
          ...catalog.grammarNodes.slice(1),
        ],
      }),
      'grammarNodes[0].patterns',
    ],
    [
      'masteryRule null',
      (catalog) => ({
        ...catalog,
        grammarNodes: [
          { ...catalog.grammarNodes[0], masteryRule: null },
          ...catalog.grammarNodes.slice(1),
        ],
      }),
      'grammarNodes[0].masteryRule',
    ],
    [
      'quizAccuracy 문자열',
      (catalog) => ({
        ...catalog,
        grammarNodes: [
          {
            ...catalog.grammarNodes[0],
            masteryRule: {
              ...catalog.grammarNodes[0]!.masteryRule,
              quizAccuracy: '0.8',
            },
          },
          ...catalog.grammarNodes.slice(1),
        ],
      }),
      'grammarNodes[0].masteryRule.quizAccuracy',
    ],
  ])('%s 문법 값에서 예외 대신 INVALID_CATALOG를 반환한다', (_name, mutate, path) => {
    const malformed = mutate(makeCatalog())

    expect(() => validateCatalog(malformed, 'development')).not.toThrow()
    expect(validateCatalog(malformed, 'development')).toContainEqual(
      expect.objectContaining({ code: 'INVALID_CATALOG', path }),
    )
  })

  test('작은 카탈로그는 릴리스 모드에서 단어와 구동사 수량 부족을 보고한다', () => {
    const issues = validateCatalog(makeCatalog(), 'release')

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'WORD_COUNT_MISMATCH' }),
        expect.objectContaining({ code: 'PHRASAL_COUNT_MISMATCH' }),
      ]),
    )
  })

  test('정확한 릴리스 수량에서 수량 불일치를 보고하지 않는다', () => {
    const countIssues = validateCatalog(makeReleaseCatalog(), 'release').filter(({ code }) =>
      code.endsWith('_COUNT_MISMATCH'),
    )

    expect(countIssues).toEqual([])
  })

  test.each<[
    string,
    (catalog: ContentCatalog) => unknown,
    string,
  ]>([
    [
      '스토리 null',
      (catalog) => ({ ...catalog, stories: { ...catalog.stories, 기초: null } }),
      'stories.기초',
    ],
    [
      'coverage null',
      (catalog) => ({
        ...catalog,
        stories: {
          ...catalog.stories,
          기초: { ...catalog.stories.기초, coverage: null },
        },
      }),
      'stories.기초.coverage',
    ],
    [
      'usedWords 항목 null',
      (catalog) => ({
        ...catalog,
        stories: {
          ...catalog.stories,
          기초: { ...catalog.stories.기초, usedWords: [null] },
        },
      }),
      'stories.기초.usedWords[0]',
    ],
  ])('%s에서 예외 대신 INVALID_CATALOG를 반환한다', (_name, mutate, path) => {
    const malformed = mutate(makeCatalog())

    expect(() => validateCatalog(malformed, 'development')).not.toThrow()
    expect(validateCatalog(malformed, 'development')).toContainEqual(
      expect.objectContaining({ code: 'INVALID_CATALOG', path }),
    )
  })
})

describe('validateStoryCoverage', () => {
  test('기본 카탈로그의 모든 레벨 단어를 스토리가 커버한다', () => {
    expect(validateStoryCoverage(makeCatalog())).toEqual([])
  })

  test('mustCoverAll 스토리에서 빠진 lemma의 정확한 경로와 메시지를 반환한다', () => {
    const catalog = makeCatalog()
    catalog.stories.기초.usedWords = []

    expect(validateStoryCoverage(catalog)).toContainEqual({
      code: 'STORY_COVERAGE_MISSING',
      path: 'stories.기초.usedWords',
      message: 'Story for 기초 is missing required lemma "play".',
    })
  })

  test('mustCoverAll 스토리의 coverageRate가 1이 아니면 거부한다', () => {
    const catalog = makeCatalog()
    catalog.stories.기초.coverage.coverageRate = 0.75

    expect(validateStoryCoverage(catalog)).toContainEqual(
      expect.objectContaining({
        code: 'STORY_COVERAGE_RATE',
        path: 'stories.기초.coverage.coverageRate',
      }),
    )
  })
})
