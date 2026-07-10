import { readFileSync } from 'node:fs'
import type { GrammarNode } from '../src/domain/content/types'
import { validateCatalog } from '../src/domain/content/validation'
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
}

interface SchemaProperty {
  type?: string | string[]
  enum?: string[]
  pattern?: string
  minItems?: number
  minimum?: number
  maximum?: number
  required?: string[]
  properties?: Record<string, SchemaProperty>
  additionalProperties?: boolean
}

interface GrammarNodeSchema {
  $schema: string
  type: string
  required: string[]
  properties: Record<string, SchemaProperty>
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
      expect(node.patterns.length).toBeGreaterThanOrEqual(2)
      expect(node.examples.length).toBeGreaterThanOrEqual(2)
      expect(node.errorCodes.length).toBeGreaterThanOrEqual(1)
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
        'All three remaining proposals require further review.',
        'Both my younger sisters study environmental science.',
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
      'patterns',
      'examples',
      'errorCodes',
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
    expect(schema.properties.patterns?.minItems).toBe(1)
    expect(schema.properties.examples?.minItems).toBe(2)
    expect(schema.properties.errorCodes?.minItems).toBe(1)

    const mastery = schema.properties.masteryRule
    expect(mastery?.required).toEqual(['quizAccuracy', 'productionPass', 'errorTolerance'])
    expect(mastery?.additionalProperties).toBe(false)
    expect(mastery?.properties?.quizAccuracy).toMatchObject({ minimum: 0, maximum: 1 })
    expect(mastery?.properties?.productionPass?.type).toBe('boolean')
    expect(mastery?.properties?.errorTolerance).toMatchObject({ minimum: 0, maximum: 1 })
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
    })
  })
})
