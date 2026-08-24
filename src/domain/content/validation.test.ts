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

  test('상위 레벨 어휘 허용 플래그를 거부한다', () => {
    const catalog = makeCatalog()
    const coverage = catalog.stories.기초.coverage as { allowUpperLevelWords: boolean }
    coverage.allowUpperLevelWords = true

    expect(validateCatalog(catalog, 'development')).toContainEqual({
      code: 'STORY_UPPER_LEVEL_WORDS_ALLOWED',
      path: 'stories.기초.coverage.allowUpperLevelWords',
      message: 'Stories may use only their own and lower-level vocabulary.',
    })
  })

  test('뒤 레벨에서 다시 등장한 lemma를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({ wordOverrides: { 유치원: { word: 'play', lemma: 'play' } } }),
      'development',
    )

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

  test('다른 lemma를 잘못된 family에 넣으면 canonical ID 불일치로 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          유치원: { familyId: 'play-family' },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'WORD_FAMILY_ID_MISMATCH',
      path: 'wordlists.유치원[0].familyId',
      message: expect.stringContaining('book-family'),
    }))
  })

  test('source registry 밖의 lemma도 canonical singleton family ID를 강제한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          기초: {
            id: 'word-zorbax',
            word: 'zorbax',
            lemma: 'zorbax',
            familyId: 'invented-family',
            isFamilyHead: true,
          },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'WORD_FAMILY_ID_MISMATCH',
      path: 'wordlists.기초[0].familyId',
      message: expect.stringContaining('zorbax-family'),
    }))
  })

  test.each([
    ['write', 'write-family'],
    ['act', 'act-family'],
    ['create', 'create-family'],
  ] as const)('curated family %s는 head lemma 한 항목만 있으면 허용한다', (lemma, familyId) => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          기초: {
            id: `word-${lemma}`,
            word: lemma,
            lemma,
            familyId,
            isFamilyHead: true,
          },
        },
      }),
      'development',
    )

    expect(issues.filter(({ code }) => code.includes('FAMILY'))).toEqual([])
  })

  test.each([
    ['write', 'writer', 'write-family'],
    ['act', 'action', 'act-family'],
    ['act', 'activity', 'act-family'],
    ['act', 'actor', 'act-family'],
    ['act', 'active', 'act-family'],
    ['create', 'creation', 'create-family'],
    ['create', 'creative', 'create-family'],
    ['create', 'creativity', 'create-family'],
  ] as const)('%s와 파생어 %s를 함께 두면 family 중복으로 거부한다', (
    headLemma,
    memberLemma,
    familyId,
  ) => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          기초: {
            id: `word-${headLemma}`,
            word: headLemma,
            lemma: headLemma,
            familyId,
            isFamilyHead: true,
          },
          유치원: {
            id: `word-${memberLemma}`,
            word: memberLemma,
            lemma: memberLemma,
            familyId,
            isFamilyHead: false,
          },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'DUPLICATE_WORD_FAMILY',
      message: expect.stringContaining(familyId),
    }))
    expect(issues.filter(({ code }) => code.startsWith('WORD_FAMILY_')
      || code === 'FAMILY_HEAD_COUNT')).toEqual([])
  })

  test.each([
    ['writer', 'write-family'],
    ['action', 'act-family'],
    ['activity', 'act-family'],
    ['actor', 'act-family'],
    ['active', 'act-family'],
    ['creation', 'create-family'],
    ['creative', 'create-family'],
    ['creativity', 'create-family'],
  ] as const)('curated 파생어 %s를 가짜 singleton family로 분리하면 거부한다', (
    lemma,
    expectedFamilyId,
  ) => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          기초: {
            id: `word-${lemma}`,
            word: lemma,
            lemma,
            familyId: `${lemma}-family`,
            isFamilyHead: true,
          },
        },
      }),
      'development',
    )

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'WORD_FAMILY_ID_MISMATCH',
        message: expect.stringContaining(expectedFamilyId),
      }),
      expect.objectContaining({ code: 'WORD_FAMILY_HEAD_MISMATCH' }),
    ]))
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

  test.each<[
    string,
    (catalog: ContentCatalog) => unknown,
    string,
  ]>([
    [
      '빈 forms 배열',
      (catalog) => ({
        ...catalog,
        wordlists: {
          ...catalog.wordlists,
          기초: [{
            ...catalog.wordlists.기초[0],
            entries: [{ ...catalog.wordlists.기초[0]!.entries[0], forms: [] }],
          }],
        },
      }),
      'wordlists.기초[0].entries[0].forms',
    ],
    [
      '공백 forms 값',
      (catalog) => ({
        ...catalog,
        wordlists: {
          ...catalog.wordlists,
          기초: [{
            ...catalog.wordlists.기초[0],
            entries: [{ ...catalog.wordlists.기초[0]!.entries[0], forms: ['   '] }],
          }],
        },
      }),
      'wordlists.기초[0].entries[0].forms',
    ],
    [
      '공백 meaning',
      (catalog) => ({
        ...catalog,
        wordlists: {
          ...catalog.wordlists,
          기초: [{
            ...catalog.wordlists.기초[0],
            entries: [{ ...catalog.wordlists.기초[0]!.entries[0], meanings: ['   '] }],
          }],
        },
      }),
      'wordlists.기초[0].entries[0].meanings',
    ],
    [
      '공백 example',
      (catalog) => ({
        ...catalog,
        wordlists: {
          ...catalog.wordlists,
          기초: [{
            ...catalog.wordlists.기초[0],
            entries: [{ ...catalog.wordlists.기초[0]!.entries[0], examples: ['   ', 'Play now.'] }],
          }],
        },
      }),
      'wordlists.기초[0].entries[0].examples',
    ],
    [
      'WordItem 추가 필드',
      (catalog) => ({
        ...catalog,
        wordlists: {
          ...catalog.wordlists,
          기초: [{ ...catalog.wordlists.기초[0], unexpected: true }],
        },
      }),
      'wordlists.기초[0].unexpected',
    ],
    [
      'WordEntry 추가 필드',
      (catalog) => ({
        ...catalog,
        wordlists: {
          ...catalog.wordlists,
          기초: [{
            ...catalog.wordlists.기초[0],
            entries: [{ ...catalog.wordlists.기초[0]!.entries[0], unexpected: true }],
          }],
        },
      }),
      'wordlists.기초[0].entries[0].unexpected',
    ],
  ])('wordlist schema와 달리 %s인 입력을 거부한다', (_name, mutate, path) => {
    const issues = validateCatalog(mutate(makeCatalog()), 'development')

    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_CATALOG', path }),
    )
  })

  test.each<[
    string,
    (catalog: ContentCatalog) => unknown,
    string,
  ]>([
    [
      'Story 추가 필드',
      (catalog) => ({
        ...catalog,
        stories: {
          ...catalog.stories,
          기초: { ...catalog.stories.기초, unexpected: true },
        },
      }),
      'stories.기초.unexpected',
    ],
    [
      'Story coverage 추가 필드',
      (catalog) => ({
        ...catalog,
        stories: {
          ...catalog.stories,
          기초: {
            ...catalog.stories.기초,
            coverage: { ...catalog.stories.기초.coverage, unexpected: true },
          },
        },
      }),
      'stories.기초.coverage.unexpected',
    ],
    [
      'Story usedWords 추가 필드',
      (catalog) => ({
        ...catalog,
        stories: {
          ...catalog.stories,
          기초: {
            ...catalog.stories.기초,
            usedWords: [{ ...catalog.stories.기초.usedWords[0], unexpected: true }],
          },
        },
      }),
      'stories.기초.usedWords[0].unexpected',
    ],
    [
      'top 구동사 추가 필드',
      (catalog) => {
        const phrasal = makePhrasalVerb()
        return {
          ...catalog,
          phrasalVerbs: {
            top: [{ ...phrasal, unexpected: true }],
            byLevel: { ...catalog.phrasalVerbs.byLevel, 기초: [phrasal] },
          },
        }
      },
      'phrasalVerbs.top[0].unexpected',
    ],
    [
      '레벨별 구동사 추가 필드',
      (catalog) => {
        const phrasal = makePhrasalVerb()
        return {
          ...catalog,
          phrasalVerbs: {
            top: [phrasal],
            byLevel: {
              ...catalog.phrasalVerbs.byLevel,
              기초: [{ ...phrasal, unexpected: true }],
            },
          },
        }
      },
      'phrasalVerbs.byLevel.기초[0].unexpected',
    ],
    [
      '문법 노드 추가 필드',
      (catalog) => ({
        ...catalog,
        grammarNodes: [
          { ...catalog.grammarNodes[0], unexpected: true },
          ...catalog.grammarNodes.slice(1),
        ],
      }),
      'grammarNodes[0].unexpected',
    ],
    [
      '문법 masteryRule 추가 필드',
      (catalog) => ({
        ...catalog,
        grammarNodes: [
          {
            ...catalog.grammarNodes[0],
            masteryRule: {
              ...catalog.grammarNodes[0]!.masteryRule,
              unexpected: true,
            },
          },
          ...catalog.grammarNodes.slice(1),
        ],
      }),
      'grammarNodes[0].masteryRule.unexpected',
    ],
  ])('공개 schema와 달리 %s인 입력을 거부한다', (_name, mutate, path) => {
    const issues = validateCatalog(mutate(makeCatalog()), 'development')

    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_CATALOG', path }),
    )
  })

  test.each([
    ['null', null, 'catalog'],
    ['배열', [], 'catalog'],
    ['wordlists 누락', {}, 'wordlists'],
  ])('%s 입력에서 예외 대신 INVALID_CATALOG를 반환한다', (_name, catalog, path) => {
    const issues = validateCatalog(catalog, 'development')

    expect(issues).toContainEqual(
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

    const issues = validateCatalog(malformedCatalog, 'development')

    expect(issues).toContainEqual(
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
    ['공백 ipa', { ipa: '   ' }, 'phrasalVerbs.top[0].ipa'],
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
    const issues = validateCatalog(malformed, 'development')

    expect(issues).toContainEqual(
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

  test.each([
    [
      'levelHint',
      () => makePhrasalVerb({ levelHint: '유치원' }),
    ],
    [
      'meaningKo',
      () => makePhrasalVerb({ meaningKo: ['일어나다'] }),
    ],
  ] as const)('top과 byLevel의 %s 콘텐츠가 다르면 거부한다', (_field, makeTop) => {
    const byLevel = makePhrasalVerb()
    const issues = validateCatalog(
      makePhrasalCatalog([makeTop()], { 기초: [byLevel] }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'PHRASAL_CONTENT_MISMATCH',
        path: 'phrasalVerbs.byLevel.기초[0]',
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

  test('42개여도 예상 집합 밖의 문법 ID를 거부한다', () => {
    const nodes = makeGrammarNodes()
    nodes[7] = { ...nodes[7]!, id: 'A1-G42' }

    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development')).toContainEqual(
      expect.objectContaining({
        code: 'GRAMMAR_NODE_SET_MISMATCH',
        path: 'grammarNodes[7].id',
      }),
    )
  })

  test.each([
    [0, 'A1-G42'],
    [1, 'A1-G42'],
  ] as const)('%i번 문법 노드의 잘못된 선행 ID를 거부한다', (index, prerequisite) => {
    const nodes = makeGrammarNodes()
    nodes[index] = { ...nodes[index]!, prerequisite }

    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development')).toContainEqual(
      expect.objectContaining({
        code: 'GRAMMAR_PREREQUISITE_MISMATCH',
        path: `grammarNodes[${index}].prerequisite`,
      }),
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

  test('문법 노드의 예문이 두 개보다 적으면 거부한다', () => {
    const nodes = makeGrammarNodes()
    nodes[0] = { ...nodes[0]!, examples: [nodes[0]!.examples[0]!] }

    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development')).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_CATALOG',
        path: 'grammarNodes[0].examples',
      }),
    )
  })

  test('문법 ID가 이전 단어 ID와 겹치면 문법 경로를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({ wordOverrides: { 기초: { id: 'A1-G01' } } }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_ID', path: 'grammarNodes[0].id' }),
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
    const issues = validateCatalog(malformed, 'development')

    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_CATALOG', path }),
    )
  })

  test('문법 masteryRule 비율이 0과 1 사이가 아니면 거부한다', () => {
    const nodes = makeGrammarNodes()
    nodes[0] = {
      ...nodes[0]!,
      masteryRule: {
        ...nodes[0]!.masteryRule,
        quizAccuracy: -0.01,
        errorTolerance: 1.01,
      },
    }
    const issues = validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development')

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_CATALOG',
          path: 'grammarNodes[0].masteryRule.quizAccuracy',
        }),
        expect.objectContaining({
          code: 'INVALID_CATALOG',
          path: 'grammarNodes[0].masteryRule.errorTolerance',
        }),
      ]),
    )
  })

  test('스토리 coverageRate가 0과 1 사이가 아니면 거부한다', () => {
    const catalog = makeCatalog()
    catalog.stories.기초.coverage.coverageRate = 1.01

    expect(validateCatalog(catalog, 'development')).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_CATALOG',
        path: 'stories.기초.coverage.coverageRate',
      }),
    )
  })

  test('스토리 schemaVersion 문자열 1.0.0을 허용한다', () => {
    const catalog = makeCatalog()
    const versionedCatalog = {
      ...catalog,
      stories: Object.fromEntries(
        Object.entries(catalog.stories).map(([level, story]) => [
          level,
          { ...story, schemaVersion: '1.0.0' },
        ]),
      ),
    }

    expect(validateCatalog(versionedCatalog, 'development')).toEqual([])
  })

  test.each([1, ''])('스토리 schemaVersion %j을 정확한 경로에서 거부한다', (schemaVersion) => {
    const catalog = makeCatalog()
    const malformed = {
      ...catalog,
      stories: {
        ...catalog.stories,
        기초: { ...catalog.stories.기초, schemaVersion },
      },
    }

    expect(validateCatalog(malformed, 'development')).toContainEqual({
      code: 'INVALID_CATALOG',
      path: 'stories.기초.schemaVersion',
      message: 'schemaVersion must be non-blank.',
    })
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

  test('문법 masteryRule은 계획에 고정된 80%·산출 통과·20% 계약만 허용한다', () => {
    const nodes = makeGrammarNodes()
    nodes[0] = {
      ...nodes[0]!,
      masteryRule: {
        quizAccuracy: 0.6,
        productionPass: false,
        errorTolerance: 0.4,
      },
    }

    const issues = validateCatalog(
      makeCatalog({ grammarNodes: nodes }),
      'development',
    )

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'grammarNodes[0].masteryRule.quizAccuracy' }),
      expect.objectContaining({ path: 'grammarNodes[0].masteryRule.productionPass' }),
      expect.objectContaining({ path: 'grammarNodes[0].masteryRule.errorTolerance' }),
    ]))
  })

  test('문법 산출 제약은 각 CEFR 레벨의 canonical profile과 정확히 일치해야 한다', () => {
    const nodes = makeGrammarNodes()
    nodes[0] = {
      ...nodes[0]!,
      productionTask: {
        ...nodes[0]!.productionTask,
        constraints: {
          ...nodes[0]!.productionTask.constraints,
          minSentences: 5,
        },
      },
    }

    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development'))
      .toContainEqual(expect.objectContaining({
        code: 'INVALID_CATALOG',
        path: 'grammarNodes[0].productionTask.constraints',
        message: expect.stringContaining('canonical A1-production-v1'),
      }))
  })

  test('문법 노드에 3단계 연습 중 하나가 빠지면 거부한다', () => {
    const nodes = makeGrammarNodes()
    nodes[0] = {
      ...nodes[0]!,
      exercises: nodes[0]!.exercises.filter(({ phase }) => phase !== 'rediagnostic'),
    }

    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development')).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_CATALOG',
        path: 'grammarNodes[0].exercises',
      }),
    )
  })

  test('문법 노드의 모든 오류 코드는 문항 또는 산출 점검에 연결되어야 한다', () => {
    const nodes = makeGrammarNodes()
    nodes[0] = {
      ...nodes[0]!,
      productionTask: {
        ...nodes[0]!.productionTask,
        rubric: nodes[0]!.productionTask.rubric.filter((line) => !line.includes('SV-01')),
      },
    }

    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development'))
      .toContainEqual(expect.objectContaining({
        code: 'INVALID_CATALOG',
        path: 'grammarNodes[0].errorCodes',
        message: expect.stringContaining('SV-01 must be linked'),
      }))
  })

  test('오류 코드 접두사를 뺀 예외 설명이 전체 문법 말뭉치에서 반복되면 거부한다', () => {
    const nodes = makeGrammarNodes()
    nodes[0] = {
      ...nodes[0]!,
      rules: nodes[0]!.rules.map((rule) => ({
        ...rule,
        exceptions: ['WO-01: 같은 상투적 설명이다.'],
      })),
    }
    nodes[1] = {
      ...nodes[1]!,
      rules: nodes[1]!.rules.map((rule) => ({
        ...rule,
        exceptions: ['SV-01: 같은  상투적 설명이다.'],
      })),
    }

    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development'))
      .toContainEqual(expect.objectContaining({
        code: 'DUPLICATE_GRAMMAR_GUIDANCE',
      }))
  })

  test('문법 노드에 같은 단계의 연습이 중복되면 거부한다', () => {
    const nodes = makeGrammarNodes()
    const duplicate = {
      ...nodes[0]!.exercises[0]!,
      id: 'A1-G01-diagnostic-duplicate',
    }
    nodes[0] = {
      ...nodes[0]!,
      exercises: [...nodes[0]!.exercises, duplicate],
    }

    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development'))
      .toContainEqual(expect.objectContaining({
        code: 'INVALID_CATALOG',
        path: 'grammarNodes[0].exercises',
      }))
  })

  test('오류 노트 코드는 errorCodes를 정확히 한 번씩 설명해야 한다', () => {
    const nodes = makeGrammarNodes()
    nodes[0] = { ...nodes[0]!, errorNotes: nodes[0]!.errorNotes.slice(0, 1) }

    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development')).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_CATALOG',
        path: 'grammarNodes[0].errorNotes',
      }),
    )
  })

  test('자동 생성 소설은 개발 중에는 허용하지만 릴리스에서는 수동 검수를 요구한다', () => {
    const catalog = makeCatalog()
    catalog.stories.기초.isManual = false

    expect(validateCatalog(catalog, 'development')).not.toContainEqual(
      expect.objectContaining({ code: 'STORY_NOT_MANUAL' }),
    )
    expect(validateCatalog(catalog, 'release')).toContainEqual({
      code: 'STORY_NOT_MANUAL',
      path: 'stories.기초.isManual',
      message: 'Story for 기초 must be reviewed before release.',
    })
  })

  test('승인 소설이 따옴표 단어 나열이면 서사 정본으로 인정하지 않는다', () => {
    const catalog = makeCatalog()
    catalog.stories.기초.storyText = '“play”, “play”, “play”.'

    expect(validateCatalog(catalog, 'development')).toContainEqual({
      code: 'STORY_WORD_ENUMERATION',
      path: 'stories.기초.storyText',
      message: 'The novel must use vocabulary in prose, not as a quoted word list.',
    })
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
    const issues = validateCatalog(malformed, 'development')

    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_CATALOG', path }),
    )
  })
})

describe('validateStoryCoverage', () => {
  test('충분한 챕터 본문과 실제 사용 메타데이터가 맞는 기본 카탈로그를 허용한다', () => {
    expect(validateStoryCoverage(makeCatalog())).toEqual([])
  })

  test('전체 단어 강제 모드에서는 실제 본문에 빠진 단어를 보고한다', () => {
    const catalog = makeCatalog()
    const story = catalog.stories.기초
    story.storyText = story.storyText.replaceAll(/\bplay\b/gu, 'Mina')
    story.usedWords = []
    story.coverage = {
      mustCoverAll: true,
      allowUpperLevelWords: false,
      coverageRate: 0,
      phrasalVerbCoverageRate: 0,
    }

    expect(validateStoryCoverage(catalog)).toContainEqual({
      code: 'STORY_COVERAGE_MISSING',
      path: 'stories.기초.storyText',
      message: 'Novel for 기초 is missing required word "play".',
    })
  })

  test('소설은 허용된 챕터 범위 안에서 각 챕터가 충분한 분량이어야 한다', () => {
    const catalog = makeCatalog()
    catalog.stories.기초.storyText = Array.from(
      { length: 6 },
      () => 'Mina play.',
    ).join('\n\n\n')

    expect(validateStoryCoverage(catalog)).toContainEqual(
      expect.objectContaining({
        code: 'STORY_CHAPTER_TOO_SHORT',
        path: 'stories.기초.storyText',
      }),
    )

    catalog.stories.기초.storyText = Array.from(
      { length: 5 },
      () => 'Mina play.',
    ).join('\n\n\n')
    expect(validateStoryCoverage(catalog)).toContainEqual(
      expect.objectContaining({
        code: 'STORY_CHAPTER_STRUCTURE',
        path: 'stories.기초.storyText',
      }),
    )
  })

  test('상위 레벨 소설은 하위 어휘를 허용하고 하위 소설은 상위 어휘를 거부한다', () => {
    const catalog = makeCatalog()
    catalog.stories.중학교.storyText += ' Mina play.'
    catalog.stories.기초.storyText += ' Mina answer.'

    const issues = validateStoryCoverage(catalog)
    expect(issues).not.toContainEqual(expect.objectContaining({
      code: 'STORY_UPPER_LEVEL_WORD_IN_TEXT',
      message: expect.stringContaining('"play"'),
    }))
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'STORY_UPPER_LEVEL_WORD_IN_TEXT',
      path: 'stories.기초.storyText',
      message: expect.stringContaining('"answer"'),
    }))
  })

  test('본문과 제목의 미등록 일반 어휘를 각각 거부하되 고유명사는 허용한다', () => {
    const catalog = makeCatalog()
    catalog.stories.기초.storyText += ' Mina quizzacious. Mina Joon.'
    catalog.stories.기초.chapterTitles[0] = 'play quizzacious'

    const issues = validateStoryCoverage(catalog)
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'STORY_UNKNOWN_TEXT_WORD',
      path: 'stories.기초.storyText',
      message: expect.stringContaining('"quizzacious"'),
    }))
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'STORY_UNKNOWN_TITLE_WORD',
      path: 'stories.기초.chapterTitles',
      message: expect.stringContaining('"quizzacious"'),
    }))
    expect(issues).not.toContainEqual(expect.objectContaining({
      code: 'STORY_UNKNOWN_TEXT_WORD',
      message: expect.stringContaining('"joon"'),
    }))
  })

  test('기록 형태는 실제 entry에 정의되고 본문에도 whole word로 나와야 한다', () => {
    const catalog = makeCatalog()
    catalog.wordlists.기초[0]!.entries[0]!.forms = ['play', 'played']
    catalog.stories.기초.usedWords[0]!.forms = ['invented', 'played']

    expect(validateStoryCoverage(catalog)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STORY_FORM_UNKNOWN',
        path: 'stories.기초.usedWords[0].forms[0]',
      }),
      expect.objectContaining({
        code: 'STORY_FORM_MISSING',
        path: 'stories.기초.usedWords[0].forms[1]',
      }),
    ]))
  })

  test('usedWords는 실제 본문에 쓰인 현재 레벨 lemma와 정확히 일치해야 한다', () => {
    const catalog = makeCatalog()
    catalog.stories.기초.usedWords = []

    expect(validateStoryCoverage(catalog)).toContainEqual({
      code: 'STORY_USED_WORD_MISSING',
      path: 'stories.기초.usedWords',
      message: 'Actual target-level prose word "play" is missing from metadata.',
    })
  })

  test('coverageRate는 별도 카드가 아닌 실제 본문 사용률과 같아야 한다', () => {
    const catalog = makeCatalog()
    catalog.stories.기초.coverage.coverageRate = 0.5

    expect(validateStoryCoverage(catalog)).toContainEqual(
      expect.objectContaining({
        code: 'STORY_COVERAGE_RATE',
        path: 'stories.기초.coverage.coverageRate',
      }),
    )
  })

  test('구동사 선언은 누적 카탈로그·표면형·정확한 문장·문맥 뜻을 모두 검증한다', () => {
    const phrasalVerb = makePhrasalVerb()
    const catalog = makePhrasalCatalog([phrasalVerb], { 기초: [{ ...phrasalVerb }] })
    const use = catalog.stories.기초.usedPhrasalVerbs[0]!
    use.phrasalVerb = 'invented phrase'
    use.context = 'Mina invented a different sentence.'
    use.meaningKo = '잘못된 뜻'

    expect(validateStoryCoverage(catalog)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STORY_PHRASAL_MISMATCH',
        path: 'stories.기초.usedPhrasalVerbs[0].phrasalVerb',
      }),
      expect.objectContaining({
        code: 'STORY_PHRASAL_CONTEXT_MISSING',
        path: 'stories.기초.usedPhrasalVerbs[0].context',
      }),
      expect.objectContaining({
        code: 'STORY_PHRASAL_MEANING_MISMATCH',
        path: 'stories.기초.usedPhrasalVerbs[0].meaningKo',
      }),
    ]))
  })

  test('malformed word entry가 있어도 카탈로그 검증은 구조화된 이슈를 반환한다', () => {
    const catalog = makeCatalog()
    const malformedWord = catalog.wordlists.기초[0] as unknown as { entries: unknown[] }
    malformedWord.entries = [null]

    expect(validateCatalog(catalog, 'development')).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_CATALOG',
        path: 'wordlists.기초[0].entries[0]',
      }),
    )
  })
})
