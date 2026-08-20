import { readFileSync } from 'node:fs'
import type { GrammarNode } from '../src/domain/content/types'
import { validateCatalog } from '../src/domain/content/validation'
import { grammarProductionConstraintsForLevel } from '../src/domain/grammar/productionConstraints'
import { makeCatalog } from '../src/test/fixtures'

const DATA_FILES = [
  '../public/data/grammar/nodes.json',
  '../public/data/engine/difficulty-rules.json',
  '../public/data/engine/reprioritize-rules.json',
  '../public/data/engine/spacing-rules.json',
  '../public/data/schema/grammar-node.schema.json',
] as const

const EXPECTED_NODES: ReadonlyArray<readonly [string, GrammarNode['level'], string]> = [
  ['A1-G01', 'A1', '문장뼈대(SVC/SVO)'],
  ['A1-G02', 'A1', 'be동사/일반동사 현재 + 부정/의문 + WH-질문 기초'],
  ['A1-G03', 'A1', 'there is/are + 명사 복수'],
  ['A1-G04', 'A1', '현재진행/단순과거 기초'],
  ['A1-G05', 'A1', '인칭/소유/목적격 대명사'],
  ['A1-G06', 'A1', '관사/지시사/기본 전치사'],
  ['A1-G07', 'A1', "can/can't + 명령문"],
  ['A1-G08', 'A1', 'and/but/because + 빈도부사'],
  ['A2-G01', 'A2', '미래(will/be going to) + 계획/의도'],
  ['A2-G02', 'A2', '현재완료(have p.p.) + since/for/just/already/yet'],
  ['A2-G03', 'A2', '비교급/최상급 + as ... as'],
  ['A2-G04', 'A2', '수량표현/결정사 확장'],
  ['A2-G05', 'A2', '조동사 must/have to/should/may/could(과거능력/가능성 구분)'],
  ['A2-G06', 'A2', '수동태(현재/과거) + by 행위자 기초'],
  ['A2-G07', 'A2', '관계절 입문(who/which/that/where/when/whose)'],
  ['A2-G08', 'A2', '재귀대명사'],
  ['A2-G09', 'A2', 'to부정사/동명사 + 부가의문(tag question)'],
  ['B1-G01', 'B1', '시제 통합(현재완료 vs 과거, 과거완료 입문)'],
  ['B1-G02', 'B1', '조건문 0/1/2 + wish 기초'],
  ['B1-G03', 'B1', '간접화법(평서/의문/명령, 간접명령문 포함)'],
  ['B1-G04', 'B1', '명사절/간접의문문(that/if/whether/wh-)'],
  ['B1-G05', 'B1', '관계절 확장(제한/비제한, 생략)'],
  ['B1-G06', 'B1', "조동사 추측(might/must/can't) + 수동 확장"],
  ['B1-G07', 'B1', 'used to/would + 습관/상태 구분'],
  ['B1-G08', 'B1', '연결어 논리전개(however/therefore/although/while)'],
  ['B1-G09', 'B1', '동명사/부정사 의미차(stop to do / stop doing)'],
  ['B2-G01', 'B2', '완료진행/미래완료/시제 뉘앙스 선택'],
  ['B2-G02', 'B2', '가정법 3형/혼합가정법'],
  ['B2-G03', 'B2', 'modal perfect(should have/might have/must have)'],
  ['B2-G04', 'B2', '분사절/축약관계절/절 압축(완료분사 포함)'],
  ['B2-G05', 'B2', '강조/도치/분열문(It is ... that)'],
  ['B2-G06', 'B2', '사역/지각/수동 패턴(have/get O p.p.)'],
  ['B2-G07', 'B2', '전치사+관계대명사(in which/to whom)'],
  ['B2-G08', 'B2', '명사화/학술문체 기초'],
  ['B2-G09', 'B2', '복합 한정어(관사/수량/지시/한정어 순서)'],
  ['C1-G01', 'C1', '담화 문법(참조/대용/생략/결속장치)'],
  ['C1-G02', 'C1', '고급 도치/전위/fronting(so/such ... that 도치 포함)'],
  ['C1-G03', 'C1', 'stance/hedging(완곡·태도 표현)'],
  ['C1-G04', 'C1', '문장 밀도 제어(압축/확장/리듬)'],
  ['C1-G05', 'C1', '레지스터 전환(구어/업무/학술)'],
  ['C1-G06', 'C1', '오류 최소화(관사/전치사/시제선택/수일치)'],
  ['C1-G07', 'C1', '비원어민 직역 교정(자연 어순/콜로케이션)'],
]

const DIFFICULTIES = ['veryEasy', 'easy', 'normal', 'hard', 'veryHard'] as const
type Difficulty = (typeof DIFFICULTIES)[number]

const EXPECTED_DIFFICULTY_MATRIX: Record<Difficulty, Record<Difficulty, number>> = {
  veryEasy: { veryEasy: 0.45, easy: 0.3, normal: 0.2, hard: 0.04, veryHard: 0.01 },
  easy: { veryEasy: 0.25, easy: 0.35, normal: 0.25, hard: 0.1, veryHard: 0.05 },
  normal: { veryEasy: 0.1, easy: 0.25, normal: 0.4, hard: 0.15, veryHard: 0.1 },
  hard: { veryEasy: 0.05, easy: 0.15, normal: 0.3, hard: 0.3, veryHard: 0.2 },
  veryHard: { veryEasy: 0.02, easy: 0.08, normal: 0.2, hard: 0.35, veryHard: 0.35 },
}

interface DifficultyRules {
  schemaVersion: string
  matrix: Record<Difficulty, Record<Difficulty, number>>
}

interface ReprioritizeRules {
  schemaVersion: string
  singleWrongBoost: number
  streakWrongBoost: number
  priorityWindow: number
  lowAccuracyThreshold: number
  groupBoost: number
}

interface SpacingRules {
  schemaVersion: string
  minimumGap: number
  immediateDuplicateProhibited: boolean
  correctStreakWeightDecay: number
  maximumCorrectStreakForDecay: number
  supportedExceptionPolicies: string[]
  defaultExceptionPolicy: string
  examDensityRequiresAudit: boolean
}

interface SchemaProperty {
  $ref?: string
  type?: string | string[]
  const?: string | number | boolean | null
  enum?: string[]
  pattern?: string
  minItems?: number
  maxItems?: number
  minContains?: number
  maxContains?: number
  minLength?: number
  minimum?: number
  maximum?: number
  required?: string[]
  properties?: Record<string, SchemaProperty>
  allOf?: SchemaProperty[]
  contains?: SchemaProperty
  if?: SchemaProperty
  then?: SchemaProperty
  else?: SchemaProperty
  additionalProperties?: boolean
}

interface GrammarNodeSchema {
  $schema: string
  type: string
  required: string[]
  properties: Record<string, SchemaProperty>
  $defs: Record<string, SchemaProperty>
  allOf: SchemaProperty[]
  additionalProperties: boolean
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T
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

function collectNonBlankStringContracts(value: unknown): SchemaProperty[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectNonBlankStringContracts)
  }
  if (value === null || typeof value !== 'object') return []

  const contract = value as SchemaProperty
  const current = contract.type === 'string' && contract.minLength === 1
    ? [contract]
    : []
  return [
    ...current,
    ...Object.values(value).flatMap(collectNonBlankStringContracts),
  ]
}

function acceptsStringContract(contract: SchemaProperty, value: string): boolean {
  if (contract.type !== 'string') return false
  if (contract.minLength !== undefined && value.length < contract.minLength) return false
  return contract.pattern === undefined || new RegExp(contract.pattern).test(value)
}

describe('문법 커리큘럼 데이터', () => {
  test('필수 JSON 다섯 개를 모두 디스크에서 읽고 파싱한다', () => {
    const failures = DATA_FILES.flatMap((path) => {
      try {
        readJson(path)
        return []
      } catch (error) {
        return [`${path}: ${error instanceof Error ? error.message : String(error)}`]
      }
    })

    expect(failures).toEqual([])
  })

  test('권위 순서와 제목을 따르는 42개 노드가 카탈로그 검증을 통과한다', () => {
    const nodes = readJson<GrammarNode[]>('../public/data/grammar/nodes.json')

    expect(nodes).toHaveLength(42)
    expect(nodes.map(({ id, level, title }) => [id, level, title])).toEqual(EXPECTED_NODES)
    expect(nodes[0]?.id).toBe('A1-G01')
    expect(nodes.at(-1)?.id).toBe('C1-G07')
    expect(
      nodes.reduce<Record<GrammarNode['level'], number>>(
        (counts, node) => ({ ...counts, [node.level]: counts[node.level] + 1 }),
        { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 },
      ),
    ).toEqual({ A1: 8, A2: 9, B1: 9, B2: 9, C1: 7 })
    expect(validateCatalog(makeCatalog({ grammarNodes: nodes }), 'development')).toEqual([])
  })

  test('각 노드는 구체적인 학습·산출 콘텐츠와 정확한 숙달 규칙을 가진다', () => {
    const nodes = readJson<GrammarNode[]>('../public/data/grammar/nodes.json')
    const placeholderToken = /TODO|TBD|준비\s*중|placeholder/i

    nodes.forEach((node, index) => {
      expect(collectStrings(node).every((value) => value.trim().length > 0)).toBe(true)
      expect(node.canDo.length).toBeGreaterThanOrEqual(3)
      expect(node.rules.length).toBeGreaterThanOrEqual(2)
      expect(node.rules.every((rule) => rule.keyPoints.length >= 2)).toBe(true)
      expect(node.patterns.length).toBeGreaterThanOrEqual(2)
      expect(node.examples.length).toBeGreaterThanOrEqual(2)
      expect(node.examples.every((example) => (
        example.english.trim().length > 0 &&
        example.korean.trim().length > 0 &&
        ['guided', 'independent'].includes(example.difficulty)
      ))).toBe(true)
      expect(new Set(node.exercises.map(({ phase }) => phase))).toEqual(
        new Set(['diagnostic', 'practice', 'rediagnostic']),
      )
      expect(node.productionTask.requirements.length).toBeGreaterThanOrEqual(2)
      expect(node.productionTask.rubric).toHaveLength(3)
      expect(node.productionTask.constraints, node.id).toEqual(
        grammarProductionConstraintsForLevel(node.level),
      )
      expect(node.errorCodes.length).toBeGreaterThanOrEqual(1)
      expect(node.errorNotes.map(({ code }) => code).sort()).toEqual(
        [...node.errorCodes].sort(),
      )
      expect(node.errorCodes.every((code) => /^(ART|PREP|TENSE|WO|SV|MODAL|CLAUSE|REG)-\d{2}$/.test(code))).toBe(true)
      expect(JSON.stringify(node)).not.toMatch(placeholderToken)
      expect(node.prerequisite).toBe(index === 0 ? null : EXPECTED_NODES[index - 1]?.[0])
      expect(node.masteryRule).toEqual({
        quizAccuracy: 0.8,
        productionPass: true,
        errorTolerance: 0.2,
      })
    })
  })

  test('세 학습 단계는 노드 오류 코드를 실제 문항과 산출 점검에 연결한다', () => {
    const nodes = readJson<GrammarNode[]>('../public/data/grammar/nodes.json')

    nodes.forEach((node) => {
      for (const phase of ['diagnostic', 'practice', 'rediagnostic']) {
        expect(
          node.exercises.filter((exercise) => exercise.phase === phase),
          `${node.id}:${phase}`,
        ).toHaveLength(1)
      }
      const diagnostic = node.exercises.find(({ phase }) => phase === 'diagnostic')
      const practice = node.exercises.find(({ phase }) => phase === 'practice')
      const rediagnostic = node.exercises.find(({ phase }) => phase === 'rediagnostic')

      expect(diagnostic, node.id).toBeDefined()
      expect(practice, node.id).toBeDefined()
      expect(rediagnostic, node.id).toBeDefined()
      if (!diagnostic || !practice || !rediagnostic) {
        throw new Error(`${node.id} is missing a grammar exercise phase.`)
      }

      const exerciseCodes = new Set(node.exercises.map(({ errorCode }) => errorCode))
      expect(exerciseCodes.size, node.id).toBe(Math.min(3, node.errorCodes.length))
      const productionChecks = node.productionTask.rubric.join(' ')
      for (const code of node.errorCodes) {
        expect(
          exerciseCodes.has(code) || productionChecks.includes(code),
          `${node.id}/${code}`,
        ).toBe(true)
      }

      expect(diagnostic.type, node.id).toBe('choice')
      expect(diagnostic.choices, node.id).toContain(diagnostic.answer)
      expect(diagnostic.choices.some((choice) => choice !== diagnostic.answer), node.id)
        .toBe(true)
      for (const exercise of [practice, rediagnostic]) {
        expect(exercise, node.id).toMatchObject({ type: 'errorCorrection', choices: [] })
        const correctionSource = exercise.prompt
          .slice(exercise.prompt.lastIndexOf(':') + 1)
          .trim()
        expect(correctionSource, `${node.id}/${exercise.phase}`).not.toBe(exercise.answer)
        expect(exercise.explanation, `${node.id}/${exercise.phase}`)
          .toContain(exercise.errorCode)
        expect(exercise.explanation, `${node.id}/${exercise.phase}`)
          .toContain(exercise.answer)
      }
    })
  })

  test('오류 코드 접두사를 제외한 예외 설명이 176개 모두 서로 다르다', () => {
    const nodes = readJson<GrammarNode[]>('../public/data/grammar/nodes.json')
    const exceptions = nodes.flatMap((node) =>
      node.rules.flatMap((rule) => rule.exceptions))
    const normalized = exceptions.map((value) => value
      .replace(/^[A-Z]+-\d+:\s*/u, '')
      .normalize('NFKC')
      .replace(/\s+/gu, ' ')
      .trim())

    expect(normalized).toHaveLength(176)
    expect(new Set(normalized).size).toBe(normalized.length)
  })

  test('A1은 다음 레벨 게이트에 필요한 ART, PREP, TENSE 실제 문항을 모두 제공한다', () => {
    const nodes = readJson<GrammarNode[]>('../public/data/grammar/nodes.json')
    const a1Codes = nodes
      .filter(({ level }) => level === 'A1')
      .flatMap(({ exercises }) => exercises.map(({ errorCode }) => errorCode))

    for (const category of ['ART', 'PREP', 'TENSE']) {
      expect(
        a1Codes.filter((code) => code?.startsWith(`${category}-`)).length,
        category,
      ).toBeGreaterThan(0)
    }
  })

  test('A1-G06은 시간과 장소 전치사의 서로 다른 기준을 정확히 제시한다', () => {
    const nodes = readJson<GrammarNode[]>('../public/data/grammar/nodes.json')
    const prepositionNode = nodes.find(({ id }) => id === 'A1-G06')

    expect(prepositionNode?.patterns).toEqual([
      'a/an + singular count noun / the + specific noun',
      'this/that + singular noun / these/those + plural noun',
      'at + clock time / on + day or date / in + month or year',
      'at + point / on + surface / in + enclosed area',
    ])
  })

  test('B2-G09은 all과 both의 한정어 배열을 별도 패턴으로 제시한다', () => {
    const nodes = readJson<GrammarNode[]>('../public/data/grammar/nodes.json')
    const determinerNode = nodes.find(({ id }) => id === 'B2-G09')

    expect(determinerNode).toMatchObject({
      patterns: [
        'predeterminer + central determiner + postdeterminer + adjective + noun',
        'all + [the/these/my] + number + plural noun',
        'both + [the/these/my] + adjective + plural noun',
      ],
      examples: [
        expect.objectContaining({
          english: 'All three remaining proposals require further review.',
          korean: '남은 제안 세 건 모두 추가 검토가 필요하다.',
        }),
        expect.objectContaining({
          english: 'Both my younger sisters study environmental science.',
          korean: '내 여동생 둘 다 환경과학을 공부한다.',
        }),
      ],
    })
  })

  test('C1-G03은 조동사와 appear to 완곡 표현을 별도의 올바른 패턴으로 제시한다', () => {
    const nodes = readJson<GrammarNode[]>('../public/data/grammar/nodes.json')
    const hedgingNode = nodes.find(({ id }) => id === 'C1-G03')

    expect(hedgingNode?.patterns).toEqual([
      'S + may/might + base verb',
      'S + appears to + base verb',
      'It is possible/likely that + clause',
      'The evidence suggests/indicates that + clause',
    ])
  })
})

describe('문법 노드 JSON 스키마', () => {
  test('draft 2020-12 계약에 필수 필드, ID 패턴, 배열 하한을 명시한다', () => {
    const schema = readJson<GrammarNodeSchema>(
      '../public/data/schema/grammar-node.schema.json',
    )
    const fields = [
      'id',
      'level',
      'title',
      'prerequisite',
      'difficultyTag',
      'canDo',
      'summary',
      'rules',
      'patterns',
      'examples',
      'exercises',
      'productionTask',
      'errorCodes',
      'errorNotes',
      'masteryRule',
    ]

    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect([...schema.required].sort()).toEqual([...fields].sort())
    expect(Object.keys(schema.properties).sort()).toEqual([...fields].sort())
    expect(schema.properties.id?.pattern).toBe('^(A1|A2|B1|B2|C1)-G\\d{2}$')
    expect(schema.properties.level?.enum).toEqual(['A1', 'A2', 'B1', 'B2', 'C1'])
    expect(schema.properties.difficultyTag?.enum).toEqual([
      'core',
      'expansion',
      'integration',
      'complex',
      'precision',
    ])
    expect(schema.properties.canDo?.minItems).toBe(3)
    expect(schema.properties.rules?.minItems).toBe(2)
    expect(schema.properties.patterns?.minItems).toBe(1)
    expect(schema.properties.examples?.minItems).toBe(2)
    expect(schema.properties.exercises?.minItems).toBe(3)
    expect(schema.properties.exercises?.maxItems).toBe(3)
    expect(schema.properties.exercises?.minContains).toBe(1)
    expect(schema.properties.exercises?.maxContains).toBe(1)
    expect(schema.properties.errorCodes?.minItems).toBe(1)

    const productionProfiles = {
      A1: ['A1-production-v1', 4, 6, null],
      A2: ['A2-production-v1', 6, 8, null],
      B1: ['B1-production-v1', 8, 12, null],
      B2: ['B2-production-v1', 4, null, null],
      C1: ['C1-production-v1', 2, null, 2],
    } as const
    for (const [level, [profileId, minimum, maximum, revisions]] of Object.entries(
      productionProfiles,
    )) {
      const contract = schema.allOf.find(
        (entry) => entry.if?.properties?.level?.const === level,
      )
      expect(
        contract?.then?.properties?.productionTask?.properties?.constraints?.properties,
        level,
      ).toMatchObject({
        profileId: { const: profileId },
        minSentences: { const: minimum },
        maxSentences: { const: maximum },
        maxRevisionRounds: { const: revisions },
      })
    }

    const phaseCardinalityContracts = [
      schema.properties.exercises,
      ...schema.allOf.map((contract) => contract.properties?.exercises),
    ]
    for (const phase of ['diagnostic', 'practice', 'rediagnostic']) {
      expect(
        phaseCardinalityContracts.find(
          (contract) => contract?.contains?.properties?.phase?.const === phase,
        ),
        phase,
      ).toMatchObject({ minContains: 1, maxContains: 1 })
    }

    expect(schema.properties.masteryRule?.$ref).toBe('#/$defs/masteryRule')
    const mastery = schema.$defs.masteryRule
    expect(mastery?.required).toEqual(['quizAccuracy', 'productionPass', 'errorTolerance'])
    expect(mastery?.additionalProperties).toBe(false)
    expect(mastery?.properties?.quizAccuracy).toEqual({ type: 'number', const: 0.8 })
    expect(mastery?.properties?.productionPass).toEqual({ type: 'boolean', const: true })
    expect(mastery?.properties?.errorTolerance).toEqual({ type: 'number', const: 0.2 })

    const rediagnosticContract = schema.$defs.exercise?.allOf?.find(
      (contract) => contract.if?.properties?.phase?.const === 'rediagnostic',
    )
    expect(rediagnosticContract?.then?.properties).toMatchObject({
      type: { const: 'errorCorrection' },
      choices: { maxItems: 0 },
      errorCode: { type: 'string', minLength: 1, pattern: '\\S' },
    })
    expect(schema.$defs.exercise?.properties?.errorCode).toMatchObject({
      type: 'string',
      minLength: 1,
      pattern: '\\S',
    })
  })

  test('공백-only 문자열 fixture를 공개 schema와 runtime이 모두 거부한다', () => {
    const schema = readJson<GrammarNodeSchema>(
      '../public/data/schema/grammar-node.schema.json',
    )
    const nonBlankContracts = collectNonBlankStringContracts(schema)
    const titleContract = schema.properties.title
    const catalog = makeCatalog()
    const malformed = {
      ...catalog,
      grammarNodes: [
        { ...catalog.grammarNodes[0]!, title: '   ' },
        ...catalog.grammarNodes.slice(1),
      ],
    }

    expect(nonBlankContracts.length).toBeGreaterThan(0)
    expect(nonBlankContracts.every(({ pattern }) => pattern === '\\S')).toBe(true)
    expect(titleContract).toBeDefined()
    expect(acceptsStringContract(titleContract!, '   ')).toBe(false)
    expect(validateCatalog(malformed, 'development')).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_CATALOG',
        path: 'grammarNodes[0].title',
      }),
    )
  })
})

describe('학습 엔진 규칙 데이터', () => {
  test('난이도 전이 행렬이 지정 확률과 합계 1을 유지한다', () => {
    const rules = readJson<DifficultyRules>('../public/data/engine/difficulty-rules.json')

    expect(rules.schemaVersion).toBe('1.0.0')
    expect(Object.keys(rules.matrix)).toEqual(DIFFICULTIES)
    expect(rules.matrix).toEqual(EXPECTED_DIFFICULTY_MATRIX)
    DIFFICULTIES.forEach((difficulty) => {
      expect(Object.keys(rules.matrix[difficulty])).toEqual(DIFFICULTIES)
      expect(Object.values(rules.matrix[difficulty]).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10)
    })
  })

  test('오답 재우선순위 규칙이 지정값과 정확히 일치한다', () => {
    const rules = readJson<ReprioritizeRules>(
      '../public/data/engine/reprioritize-rules.json',
    )

    expect(rules).toEqual({
      schemaVersion: '1.0.0',
      singleWrongBoost: 0.15,
      streakWrongBoost: 0.3,
      priorityWindow: 3,
      lowAccuracyThreshold: 0.6,
      groupBoost: 0.1,
    })
  })

  test('간격 규칙이 즉시 중복 노출을 금지한다', () => {
    const rules = readJson<SpacingRules>('../public/data/engine/spacing-rules.json')

    expect(rules).toEqual({
      schemaVersion: '1.0.0',
      minimumGap: 1,
      immediateDuplicateProhibited: true,
      correctStreakWeightDecay: 0.025,
      maximumCorrectStreakForDecay: 5,
      supportedExceptionPolicies: ['strict', 'exam-density'],
      defaultExceptionPolicy: 'strict',
      examDensityRequiresAudit: true,
    })
  })
})
