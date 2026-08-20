import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import {
  EARLY_LEARNER_PHRASAL_EXAMPLE_POLICY,
  EARLY_LEARNER_PHRASAL_SEMANTIC_POLICY,
  PHRASAL_CONTENT_SOURCE_IDS,
  assignPhrasalLevelsForLearners,
  assertCanonicalPhrasalOrder,
  buildPhrasalCatalog,
  isPhrasalContentAgeAppropriate,
  isPhrasalExampleAgeAppropriate,
  parsePhrasalGlossManifest,
  resolvePhrasalCatalogPaths,
} from './buildPhrasalCatalog'
import {
  PHRASAL_ALIGNMENT_MODEL,
  PHRASAL_TRANSLATION_MODEL,
  REQUIRED_PHRASAL_PHRASES,
  containsPhrasalUse,
} from './phrasalSource'
import {
  CONTENT_REPOSITORY_ROOT,
  DEFAULT_CONTENT_CACHE_ROOT,
  PHRASAL_GLOSS_MANIFEST_PATH,
} from './paths'

function readManifest() {
  return parsePhrasalGlossManifest(JSON.parse(readFileSync(
    PHRASAL_GLOSS_MANIFEST_PATH,
    'utf8',
  )))
}

test('checked-in phrasal registry is exhaustive, explicit, and provenance-complete', () => {
  const manifest = readManifest()

  expect(manifest.schemaVersion).toBe('5.0.0')
  expect(manifest.model).toEqual(PHRASAL_TRANSLATION_MODEL)
  expect(manifest.alignmentModel).toEqual(PHRASAL_ALIGNMENT_MODEL)
  expect(manifest.generator).toMatchObject({
    registryPolicy: 'exhaustive-machine-assisted-audit-v1',
    auditedRows: '1000',
    unresolvedRows: '0',
    crossReferenceDescriptions: '0',
    sourcePairRows: expect.stringMatching(/^\d+$/),
    editorialCorrectionRows: expect.stringMatching(/^\d+$/),
  })
  expect(Object.values(manifest.generator).every((value) => typeof value === 'string')).toBe(true)
  expect(manifest.reviewStatus).toBe('machine-assisted-draft-not-human-reviewed')
  expect(manifest.glosses).toHaveLength(1_000)

  expect(new Set(manifest.glosses.map(({ phrase }) => phrase)).size).toBe(1_000)
  expect(manifest.glosses.slice(0, REQUIRED_PHRASAL_PHRASES.length).map(({ phrase }) => phrase))
    .toEqual(REQUIRED_PHRASAL_PHRASES)
  expect(manifest.glosses.every(({ meaningKo }) => /[가-힣]/.test(meaningKo))).toBe(true)
  expect(manifest.glosses.every(({ englishDescription, sourceDescription }) =>
    englishDescription.trim().length > 0
    && !englishDescription.startsWith('same as ')
    && sourceDescription.trim().length > 0)).toBe(true)
  expect(manifest.glosses.every(({ senseId }) => /^[a-f0-9]{64}$/.test(senseId))).toBe(true)
  expect(manifest.glosses.every(({ reviewStatus }) =>
    reviewStatus === 'machine-assisted-draft-not-human-reviewed')).toBe(true)

  expect(manifest.glosses.every(({ examples }) =>
    examples.length === 2 && examples[0] !== examples[1])).toBe(true)
  expect(manifest.glosses.every(({ phrase, examples }) =>
    examples.every((example) => containsPhrasalUse(example, phrase)))).toBe(true)
  const examples = manifest.glosses.flatMap(({ examples: itemExamples }) => itemExamples)
  expect(examples).toHaveLength(2_000)
  expect(new Set(examples).size).toBe(2_000)

  const editorialRows = manifest.glosses.filter(({ selectionMethod }) =>
    selectionMethod === 'machine-assisted-editorial-correction')
  const sourceRows = manifest.glosses.filter(({ selectionMethod }) =>
    selectionMethod === 'machine-assisted-audited-source-pair')
  expect(editorialRows.length).toBeGreaterThan(0)
  expect(sourceRows.length).toBeGreaterThan(0)
  expect(manifest.generator.editorialCorrectionRows).toBe(String(editorialRows.length))
  expect(manifest.generator.sourcePairRows).toBe(String(sourceRows.length))
  expect(editorialRows.every(({ exampleOrigins, translationStatus }) =>
    translationStatus === 'machine-assisted-editorial-correction'
    && exampleOrigins.every(({ kind }) =>
      kind === 'definition-conditioned-machine-generated'))).toBe(true)
  expect(sourceRows.every(({ exampleOrigins, translationStatus }) =>
    translationStatus !== 'machine-assisted-editorial-correction'
    && exampleOrigins.every(({ kind }) =>
      kind !== 'definition-conditioned-machine-generated'))).toBe(true)
  expect(sourceRows.some(({ exampleOrigins }) => exampleOrigins.some(({ kind }) =>
    kind === 'tatoeba-pinned-source'))).toBe(true)

  expect(JSON.stringify(manifest)).not.toContain('machine-semantic-ranking')
  expect(JSON.stringify(manifest)).not.toContain('machine-semantic-match')

  const selectedPhrases = new Set(manifest.glosses.map(({ phrase }) => phrase))
  for (const phrase of [
    'bottle out', 'butt out', 'come at', 'drink in', 'get after', 'heave to',
    'run up', 'shake down', 'smoke out',
  ]) {
    expect(selectedPhrases.has(phrase), phrase).toBe(false)
  }
}, 20_000)

test('audited phrasal corrections preserve the approved senses and example provenance', () => {
  const manifest = readManifest()
  const byPhrase = new Map(manifest.glosses.map((gloss) => [gloss.phrase, gloss]))
  const correctedSenses = {
    'fall into': [
      'to belong to or be classified as part of a particular group or category',
      '특정 집단이나 범주에 속하거나 그 일부로 분류되다',
      '5d5a828389457bb84aba07bfdd48bf5455f4d1c222eccff1c91010f94eb62229',
    ],
    'swing at': [
      'to try to hit someone or something by swinging a hand, bat, racket, or similar object',
      '손이나 방망이, 라켓 등을 휘둘러 누군가나 무언가를 치려고 하다',
      '60217bb6d221395f74c2dca3b6b099df67db2973edae742a2c24d513103f5eed',
    ],
    'turn against': [
      'to direct anger or opposition toward someone, or to stop supporting them and begin opposing them',
      '분노나 반대를 누군가에게 돌리거나, 지지를 멈추고 반대하기 시작하다',
      '9efab16b119de653e047b09c964707cca50b854c9b8266709cb2083feda74dbe',
    ],
    'pay into': [
      'to put money into an account, fund, or payment scheme',
      '계좌나 기금, 납입 제도에 돈을 넣다',
      '8cdf8516d03f2b42694b6791646e2be27b92f1bd24574e95a1428ba0984ec87b',
    ],
    'lie with': [
      'if responsibility, blame, power, or a decision lies with someone, they have that responsibility or authority',
      '책임이나 비난, 권한, 결정권이 누군가에게 있다',
      '9edaaa97ed73c012ac98dd7aba619917de709899c05d48b090b4cb964dd12305',
    ],
    'hook up': [
      'to connect a device or computer to another device, system, or network',
      '기기나 컴퓨터를 다른 기기나 시스템, 네트워크에 연결하다',
      '5828c5148cfd7eff6eb9445c041f0189d650cab8f078a8508897a162b012bcbc',
    ],
    'firm up': [
      'to make something stronger or more definite',
      '무언가를 더 강하게 하거나 더 확실하게 정하다',
      '00b70b14111a285790115c833c9c936ca41e92206e492d54246924b39db3cf3b',
    ],
    'show off': [
      'to display someone or something so that they are noticed or admired, or to make their attractive qualities easy to see',
      '사람이나 사물을 눈에 띄거나 돋보이게 드러내다',
      '2b644f6a7847c8d3984606b7763765320f3ed7678d35ff7be4f4e2ec5c5255f0',
    ],
    'spread out': [
      'to open, extend, or separate things across a surface or area',
      '무언가를 펼치거나 표면이나 영역에 넓게 벌려 놓다',
      'b1ede80de3c34d27dbd79f10928b608e8b0ef77c5bbc0429bfa04dd4e978f19f',
    ],
    'lay out': [
      'to arrange or spread something in a planned way so that its parts can be seen clearly',
      '각 부분이 잘 보이도록 무언가를 계획적으로 배치하거나 펼치다',
      '26586d0c832e3919a22b559661ec1b3339b1f752f641e31de4b6e74fbcc28bd5',
    ],
    'mark out': [
      'to distinguish someone from others or show that they are suited for a particular role',
      '누군가를 다른 사람들과 구별되게 하거나 특정 역할에 적합함을 보여주다',
      '5e56b6e0bb13ae341bf8701adac8c334d943e13ec9371fc3429e91ad5edec5c4',
    ],
    'weigh into': [
      'to become forcefully involved in a discussion or campaign, often by criticizing someone',
      '토론이나 캠페인에 적극적으로 끼어들며, 흔히 누군가를 강하게 비판하다',
      '2e527c44a726fc3d8d89e792d1e9715b0103a51123329bc599d88d3b623c0ebe',
    ],
    'tone down': [
      'to make something less strong, noticeable, severe, or offensive',
      '무언가의 강도나 두드러짐, 심각성, 불쾌감을 줄이다',
      '52670da6412743083b8bf99e242396835cf1204bf282fc123cac1661fc80bc8f',
    ],
    'curl up': [
      'to sit or lie with your body curved and your arms and legs drawn close',
      '몸을 굽히고 팔다리를 가까이 모은 채 앉거나 눕다',
      'af51643d76808ea8e6516a3c5b7e18aef4c19345f2a2b5d7af6765661f495b82',
    ],
  } as const

  for (const [phrase, [englishDescription, meaningKo, senseId]] of Object.entries(
    correctedSenses,
  )) {
    expect(byPhrase.get(phrase)).toMatchObject({ englishDescription, meaningKo, senseId })
  }

  for (const phrase of Object.keys(correctedSenses).filter(
    (candidate) => candidate !== 'fall into' && candidate !== 'swing at',
  )) {
    expect(byPhrase.get(phrase)?.translationStatus)
      .toBe('machine-assisted-gloss-override')
  }

  expect(byPhrase.get('look through')).toMatchObject({
    examples: [
      'But I looked through the book yesterday and found a huge number of favourite dishes in it.',
      'I’ve just been looking through your cookery books for inspiration.',
    ],
    exampleOrigins: [{ sourceIndex: 1714, exampleIndex: 0 }, { sourceIndex: 1714, exampleIndex: 7 }],
  })
  expect(byPhrase.get('take away')).toMatchObject({
    examples: [
      'A few hooligans couldn’t take away from the team’s success.',
      'We are using ethanol from corn, but it is not taking away from our food.',
    ],
    exampleOrigins: [{ sourceIndex: 2937, exampleIndex: 0 }, { sourceIndex: 2937, exampleIndex: 23 }],
  })
  expect(byPhrase.get('come up')).toMatchObject({
    examples: [
      'We’ve got a busy period coming up in a couple of weeks.',
      'Our flight hasn’t come up yet.',
    ],
    exampleOrigins: [{ sourceIndex: 571, exampleIndex: 11 }, { sourceIndex: 571, exampleIndex: 4 }],
  })
  expect(byPhrase.get('draw in')).toMatchObject({
    examples: [
      'She paused to draw in a slow breath.',
      'Noah opened the window and drew in the cool morning air.',
    ],
    exampleOrigins: [
      { kind: 'definition-conditioned-machine-generated', promptVersion: 'phrasal-editorial-v1' },
      { kind: 'definition-conditioned-machine-generated', promptVersion: 'phrasal-editorial-v1' },
    ],
    selectionMethod: 'machine-assisted-editorial-correction',
    translationStatus: 'machine-assisted-editorial-correction',
  })
  expect(byPhrase.get('move in')).toMatchObject({
    examples: [
      'He’s moving in with his friends from college.',
      'But then I remembered an experience Alexis and Chris had had when they first sold their separate homes to move in together.',
    ],
    exampleOrigins: [{ sourceIndex: 1816, exampleIndex: 1 }, { sourceIndex: 1816, exampleIndex: 0 }],
  })
  expect(byPhrase.get('cut through')).toMatchObject({
    examples: [
      'He cut his way through the jungle with a machete.',
      'She tried to cut through the undergrowth.',
    ],
    exampleOrigins: [{ sourceIndex: 673, exampleIndex: 1 }, { sourceIndex: 673, exampleIndex: 3 }],
  })
  expect(byPhrase.get('base on')).toMatchObject({
    examples: [
      'Prices are based on two people sharing a room.',
      'The prosecution’s case is based largely on evidence from ex-members of the gang.',
    ],
    exampleOrigins: [{ sourceIndex: 79, exampleIndex: 2 }, { sourceIndex: 79, exampleIndex: 4 }],
  })
})

test('repairs the five audited Korean meanings and replaces weak source pairs', () => {
  const byPhrase = new Map(readManifest().glosses.map((gloss) => [gloss.phrase, gloss]))
  const corrections = {
    'hang out': {
      englishDescription: 'to spend time relaxing or socializing with other people',
      sourceDescription: 'same as hang',
      meaningKo: '친구들과 어울려 시간을 보내다',
      examples: [
        'Children like to hang out with friends after school.',
        'We hung out in the park on Saturday.',
      ],
    },
    'tune out': {
      meaningKo: '주의를 기울이지 않고 흘려듣다',
      examples: [
        'It is easy to tune out during a long speech.',
        'She tuned out the noise and focused on her book.',
      ],
    },
    'dig over': {
      meaningKo: '새 식물을 심을 준비를 하려고 땅을 파서 고르다',
      examples: [
        'We dig over the garden before planting new flowers.',
        'Dad dug over the soil to prepare it for seeds.',
      ],
    },
    'lose out': {
      meaningKo: '다른 사람이 얻는 이익이나 기회를 얻지 못하다',
      examples: [
        'Hurry, or you may lose out on a place in the team.',
        'She lost out because she sent the form too late.',
      ],
    },
    'lay on': {
      meaningKo: '음식, 오락, 서비스 등을 특히 무료로 제공하다',
      examples: [
        'The school laid on a bus for the class trip.',
        'They lay on free snacks for every club meeting.',
      ],
    },
  } as const

  for (const [phrase, correction] of Object.entries(corrections)) {
    expect(byPhrase.get(phrase)).toMatchObject({
      ...correction,
      selectionMethod: 'machine-assisted-editorial-correction',
      translationStatus: 'machine-assisted-editorial-correction',
      exampleOrigins: [
        { kind: 'definition-conditioned-machine-generated' },
        { kind: 'definition-conditioned-machine-generated' },
      ],
    })
  }
  expect(byPhrase.get('lay on')?.meaningKo.match(/특히/g)).toHaveLength(1)
})

test('orders readable examples and learner-safe selected senses into the earliest levels', () => {
  expect(EARLY_LEARNER_PHRASAL_EXAMPLE_POLICY).toEqual({
    기초: { maxCharacters: 60, maxWords: 12, maxWordLength: 10 },
    유치원: { maxCharacters: 80, maxWords: 16, maxWordLength: 12 },
  })
  expect(isPhrasalExampleAgeAppropriate('We put away our toys after class.', '기초')).toBe(true)
  expect(isPhrasalExampleAgeAppropriate(
    'Loyal savers put away money for retirement fees and investments.',
    '유치원',
  )).toBe(false)
  expect(isPhrasalExampleAgeAppropriate(
    'Anti-intellectualism and elitism can show up in a political campaign.',
    '유치원',
  )).toBe(false)
  expect(isPhrasalExampleAgeAppropriate(
    'We put away every bright classroom toy before walking home together today.',
    '기초',
  )).toBe(false)
  expect(EARLY_LEARNER_PHRASAL_SEMANTIC_POLICY.map(({ id, minimumLevel }) => ({
    id,
    minimumLevel,
  }))).toEqual([
    { id: 'financial-transactions', minimumLevel: '초등학교' },
    { id: 'adult-relationships', minimumLevel: '초등학교' },
    { id: 'abandonment', minimumLevel: '초등학교' },
  ])

  const safeAlternateSense = {
    phrase: 'pay out',
    description: 'to let a rope move out gradually',
    meaningKo: '밧줄을 천천히 풀어 주다',
    examples: [
      'We pay out the rope slowly.',
      'They pay out the line with care.',
    ],
  }
  expect(isPhrasalContentAgeAppropriate(safeAlternateSense, '기초')).toBe(true)
  expect(isPhrasalContentAgeAppropriate({
    ...safeAlternateSense,
    phrase: ' ',
  }, '기초')).toBe(false)
  expect(isPhrasalContentAgeAppropriate({
    ...safeAlternateSense,
    description: 'to give money to pay for something',
  }, '유치원')).toBe(false)
  expect(isPhrasalContentAgeAppropriate({
    ...safeAlternateSense,
    meaningKo: '계좌에 돈을 넣다',
  }, '유치원')).toBe(false)

  const manifest = readManifest()
  const learnerSources = manifest.glosses.map((gloss) => ({
    phrase: gloss.phrase,
    description: gloss.englishDescription,
    meaningKo: gloss.meaningKo,
    examples: gloss.examples,
    baseCefr: null,
  }))
  const restrictedPhrases = [
    'pay into',
    'cough up',
    'settle up',
    'marry off',
    'walk out',
    'put aside',
    'pay out',
  ] as const
  const learnerSourcesByPhrase = new Map(learnerSources.map((source) => [source.phrase, source]))
  for (const phrase of restrictedPhrases) {
    const source = learnerSourcesByPhrase.get(phrase)!
    expect(isPhrasalContentAgeAppropriate(source, '기초'), phrase).toBe(false)
    expect(isPhrasalContentAgeAppropriate(source, '유치원'), phrase).toBe(false)
    expect(isPhrasalContentAgeAppropriate(source, '초등학교'), phrase).toBe(true)
  }

  const assigned = assignPhrasalLevelsForLearners(learnerSources)
  expect(assigned).toHaveLength(1_000)
  for (const [levelIndex, level] of (['기초', '유치원', '초등학교', '중학교'] as const).entries()) {
    const levelItems = assigned.filter((item) => item.level === level)
    expect(levelItems).toHaveLength(250)
    expect(levelItems.every((source) => isPhrasalContentAgeAppropriate(source, level))).toBe(true)
    const capacity = learnerSources.filter((source) =>
      isPhrasalContentAgeAppropriate(source, level)).length
    expect(capacity).toBeGreaterThanOrEqual(250 * (levelIndex + 1))
  }
  const assignedByPhrase = new Map(assigned.map((source) => [source.phrase, source]))
  for (const phrase of restrictedPhrases) {
    expect(['초등학교', '중학교'], phrase).toContain(assignedByPhrase.get(phrase)?.level)
  }

  const invalid = Array.from({ length: 4 }, (_, index) => ({
    phrase: index === 0 ? 'wake up' : `phrase ${index}`,
    description: 'to begin being awake',
    meaningKo: '잠에서 깨다',
    examples: [
      'This deliberately oversized example keeps adding difficult words until it is much too long.',
      'Another deliberately oversized example keeps adding difficult words until it is too long.',
    ],
    baseCefr: 'A1',
  }))
  expect(() => assignPhrasalLevelsForLearners(invalid))
    .toThrow('Insufficient age-appropriate phrasal content capacity for 기초')
})

test('builds 250 age-appropriate phrasals per level from the pinned source chain', async () => {
  const { top, byLevel, provenance } = await buildPhrasalCatalog()

  expect(top).toHaveLength(1_000)
  for (const level of ['기초', '유치원', '초등학교', '중학교'] as const) {
    expect(byLevel[level]).toHaveLength(250)
  }
  for (const level of ['기초', '유치원'] as const) {
    const provenanceByPhrase = new Map(provenance.phrases.map((phrase) => [phrase.phrase, phrase]))
    expect(byLevel[level].every((item) => {
      const phraseProvenance = provenanceByPhrase.get(item.phrasalVerb)
      return phraseProvenance !== undefined && isPhrasalContentAgeAppropriate({
        phrase: item.phrasalVerb,
        description: phraseProvenance.englishDescription,
        meaningKo: item.meaningKo[0]!,
        examples: item.examples,
      }, level)
    })).toBe(true)
  }
  const restrictedPhrases = new Set([
    'pay into', 'cough up', 'settle up', 'marry off', 'walk out', 'put aside', 'pay out',
  ])
  expect(top.filter(({ phrasalVerb }) => restrictedPhrases.has(phrasalVerb))
    .every(({ levelHint }) => levelHint === '초등학교' || levelHint === '중학교')).toBe(true)
  expect(provenance.selectionPolicy).toContain('composed phrase-description-Korean-gloss semantic gate')
  expect(provenance.selectionPolicy).toContain('cumulative capacity checks')
  expect(new Map(top.map((item) => [item.phrasalVerb, item])).get('hang out')).toMatchObject({
    meaningKo: ['친구들과 어울려 시간을 보내다'],
  })
}, 120_000)

test('phrasal registry parser rejects stale senses and mixed editorial provenance', () => {
  const raw = JSON.parse(readFileSync(PHRASAL_GLOSS_MANIFEST_PATH, 'utf8'))
  const staleSense = structuredClone(raw)
  staleSense.glosses[0].senseId = '0'.repeat(64)
  expect(() => parsePhrasalGlossManifest(staleSense)).toThrow('Invalid phrasal sense ID')

  const unresolved = structuredClone(raw)
  unresolved.glosses[0].englishDescription = 'same as another phrase'
  expect(() => parsePhrasalGlossManifest(unresolved)).toThrow('Invalid phrasal gloss')

  const mixedProvenance = structuredClone(raw)
  const sourceRow = mixedProvenance.glosses.find(({ selectionMethod }: {
    selectionMethod: string
  }) => selectionMethod === 'machine-assisted-audited-source-pair')
  sourceRow.exampleOrigins[0] = {
    kind: 'definition-conditioned-machine-generated',
    promptVersion: 'phrasal-editorial-v1',
  }
  expect(() => parsePhrasalGlossManifest(mixedProvenance))
    .toThrow('Invalid phrasal editorial provenance')
})

test('canonical source order is fail-closed before level assignment', () => {
  const selected = [
    { phrase: 'wake up' },
    { phrase: 'get up' },
    { phrase: 'go out' },
  ]
  expect(() => assertCanonicalPhrasalOrder(
    ['wake up', 'go out'],
    selected,
  )).not.toThrow()
  expect(() => assertCanonicalPhrasalOrder(
    ['go out', 'wake up'],
    selected,
  )).toThrow('does not match canonical source selection order')
})

test('default cache and canonical registry paths do not follow process cwd', () => {
  const originalCwd = process.cwd()
  process.chdir(resolve(CONTENT_REPOSITORY_ROOT, '..'))
  try {
    expect(resolvePhrasalCatalogPaths()).toEqual({
      cacheRoot: DEFAULT_CONTENT_CACHE_ROOT,
      glossManifest: PHRASAL_GLOSS_MANIFEST_PATH,
    })
    expect(resolvePhrasalCatalogPaths('fixture-cache')).toEqual({
      cacheRoot: resolve(CONTENT_REPOSITORY_ROOT, 'fixture-cache'),
      glossManifest: PHRASAL_GLOSS_MANIFEST_PATH,
    })
  } finally {
    process.chdir(originalCwd)
  }
})

test('checked-in phrasal provenance lists only the pinned inputs used by its builder', () => {
  const provenance = JSON.parse(readFileSync(
    resolve(CONTENT_REPOSITORY_ROOT, 'public/data/provenance/phrasal-catalog.json'),
    'utf8',
  )) as {
    schemaVersion: string
    outputDigest: { algorithm: string; canonicalization: string; value: string }
    sources: Array<{ id: string }>
  }

  expect(provenance.schemaVersion).toBe('2.0.0')
  expect(provenance.outputDigest).toMatchObject({
    algorithm: 'sha256',
    canonicalization: 'sorted-json-v1',
    value: expect.stringMatching(/^[a-f0-9]{64}$/),
  })
  expect(provenance.sources.map(({ id }) => id)).toEqual(PHRASAL_CONTENT_SOURCE_IDS)
  expect(provenance.sources.map(({ id }) => id)).not.toContain('korean-wiktionary')
  expect(provenance.sources.map(({ id }) => id)).toContain('tatoeba-english')
})
