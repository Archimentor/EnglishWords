import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import {
  buildEditorialGlossIndex,
  extractKoreanEntries,
  parseKoreanMorphologyTemplate,
  readEditorialGlossManifest,
  requireVerifiedCatalogCapacity,
  resolveKoreanMeanings,
  selectPhrasalVerbs,
} from './buildCatalog'

describe('source catalog construction', () => {
  test('parses reviewed Korean Wiktionary verb and plural templates', () => {
    expect(parseKoreanMorphologyTemplate('{{동사변화|freeze|froze|[[frozen]]}}')).toEqual({
      lemma: 'freeze', past: ['froze'], pastParticiple: ['frozen'],
    })
    expect(parseKoreanMorphologyTemplate('{{동사변화|sew|sewed|sewed/sewn}}')).toEqual({
      lemma: 'sew', past: ['sewed'], pastParticiple: ['sewed', 'sewn'],
    })
    expect(parseKoreanMorphologyTemplate(
      '{{동사변화|bear|[[bore]]/(고어)bare|[[borne]]/(수동태)[[born]]}}',
    )).toEqual({
      lemma: 'bear', past: ['bore', 'bare'], pastParticiple: ['borne', 'born'],
    })
    expect(parseKoreanMorphologyTemplate('{{복수|criterion|[[criteria]]}}')).toEqual({
      lemma: 'criterion', plurals: ['criteria'],
    })
    expect(parseKoreanMorphologyTemplate('{{복수|means|means}}')).toEqual({
      lemma: 'means', plurals: ['means'],
    })
    expect(parseKoreanMorphologyTemplate(
      '{{복수|lift|lifts<ref>Oxford English Dictionary</ref>}}',
    )).toEqual({ lemma: 'lift', plurals: ['lifts'] })
    expect(parseKoreanMorphologyTemplate('{{동사변화|can|-|(없음)}}')).toEqual({
      lemma: 'can',
    })
  })

  test('attaches and merges morphology only inside its English POS section', () => {
    const entries = extractKoreanEntries(`
== 영어 ==
=== 동사 ===
{{동사변화|lie|lay|lain}}
{{동사변화|lie|lied|lied}}
# 눕다.
=== 명사 ===
{{복수|lie|lies}}
# 거짓말.
== 독일어 ==
{{동사변화|lie|bad|bad}}
# 잘못된 외부 언어 뜻
`)

    expect(entries).toEqual([
      {
        partOfSpeech: 'verb',
        meanings: ['눕다'],
        ipa: '',
        morphology: {
          lemma: 'lie',
          past: ['lay', 'lied'],
          pastParticiple: ['lain', 'lied'],
        },
      },
      {
        partOfSpeech: 'noun',
        meanings: ['거짓말'],
        ipa: '',
        morphology: { lemma: 'lie', plurals: ['lies'] },
      },
    ])
  })

  test('retains a morphology template placed before its POS heading', () => {
    expect(extractKoreanEntries(`
== 영어 ==
{{동사변화|arise|arose|arisen}}
=== 동사 ===
# 발생하다.
`)).toEqual([{
      partOfSpeech: 'verb',
      meanings: ['발생하다'],
      ipa: '',
      morphology: {
        lemma: 'arise', past: ['arose'], pastParticiple: ['arisen'],
      },
    }])
  })

  test('extracts numbered definition bullets without accepting metadata or examples', () => {
    expect(extractKoreanEntries(`
== 영어 ==
=== 명사 ===
*어원: 고대 영어에서 유래.
* '''1.''' [[아내]], [[부인]].
:* His wife is here. 그의 아내가 여기 있다.
* '''2-a.''' [[배우자]].
*유의어: spouse 배우자
`)).toEqual([{
      partOfSpeech: 'noun', meanings: ['아내, 부인', '배우자'], ipa: '',
    }])
  })

  test('extracts bold numbered definitions whose source omits the optional period', () => {
    expect(extractKoreanEntries(`
== 영어 ==
[[분류:영어 명사]]
* '''1''' (동물) [[박쥐]].
# (스포츠) 공을 치는 [[방망이]].
`)).toEqual([{
      partOfSpeech: 'noun',
      meanings: ['(동물) 박쥐', '(스포츠) 공을 치는 방망이'],
      ipa: '',
    }])
  })

  test('does not treat numbered bullets under a non-POS heading as noun definitions', () => {
    expect(extractKoreanEntries(`
== 영어 ==
=== 명사 ===
* '''1.''' [[아내]].
=== 파생어 ===
* '''1.''' [[아내]]와 관련된 파생 표현.
=== 어원 ===
* '''1.''' 고대 영어에서 유래.
`)).toEqual([{
      partOfSpeech: 'noun', meanings: ['아내'], ipa: '',
    }])
  })

  test('does not guess noun for an unheaded definition without an English POS category', () => {
    expect(extractKoreanEntries(`
== 영어 ==
* '''1.''' 근거 없는 품사 추정.
`)).toEqual([])
  })

  test('extracts Korean meanings and IPA from an English Wiktionary page', () => {
    const entries = extractKoreanEntries(`
== 영어 ==
=== 명사 ===
* {{IPA|en|/kæt/}}
# [[고양이]]
`)

    expect(entries).toEqual([{ partOfSpeech: 'noun', meanings: ['고양이'], ipa: '/kæt/' }])
  })

  test('removes image metadata and leading definition punctuation from meanings', () => {
    expect(extractKoreanEntries(`
== 영어 ==
=== 명사 ===
# : [[계획]]. [[File:Project.jpg|thumb|150px|건설 프로젝트 현장]]
# [[컵]]. [[파일:Mug.jpg|thumb|머그]]
`)).toEqual([{
      partOfSpeech: 'noun', meanings: ['계획', '컵'], ipa: '',
    }])
  })

  test('uses an English category for an unheaded first POS before later headings', () => {
    const entries = extractKoreanEntries(`
== 영어 ==
# [[공공]]의, [[대중]]의.
=== 명사 ===
# [[공중]], [[대중]].
== 프랑스어 ==
# public
[[분류:영어 형용사]]
`)

    expect(entries).toEqual([
      { partOfSpeech: 'adjective', meanings: ['공공의, 대중의'], ipa: '' },
      { partOfSpeech: 'noun', meanings: ['공중, 대중'], ipa: '' },
    ])
  })

  test('normalizes Korean Wiktionary function-word headings instead of treating them as nouns', () => {
    const entries = extractKoreanEntries(`
== 영어 ==
=== 관사 ===
# 어떤, 한.
=== 수사 ===
# 하나.
=== 감탄사 ===
# 안녕.
=== 조동사 ===
# 할 수 있다.
`)

    expect(entries.map(({ partOfSpeech }) => partOfSpeech)).toEqual([
      'determiner', 'numeral', 'interjection', 'verb',
    ])
  })

  test('selects phrasals only with a Korean gloss, pronunciation, and two examples', () => {
    const selected = selectPhrasalVerbs([
      {
        phrase: 'look up',
        levelHint: '기초',
        meanings: ['찾아보다'],
        ipa: '/lʊk ʌp/',
        examples: ['Look up the word.', 'I look up the address.'],
      },
      {
        phrase: 'bad record',
        levelHint: '기초',
        meanings: [],
        ipa: '/bad/',
        examples: ['Bad record one.', 'Bad record two.'],
      },
    ], { 기초: 1, 유치원: 0, 초등학교: 0, 중학교: 0 })

    expect(selected.기초).toEqual([
      expect.objectContaining({ phrasalVerb: 'look up', ipa: '/lʊk ʌp/' }),
    ])
  })

  test('refuses to write a partial catalog when verified source capacity is short', () => {
    expect(() => requireVerifiedCatalogCapacity({
      words: { 기초: 1, 유치원: 0, 초등학교: 0, 중학교: 0 },
      phrasals: { 기초: 0, 유치원: 0, 초등학교: 0, 중학교: 0 },
    }, {
      wordQuotas: { 기초: 2, 유치원: 0, 초등학교: 0, 중학교: 0 },
      phrasalQuotas: { 기초: 0, 유치원: 0, 초등학교: 0, 중학교: 0 },
    })).toThrow('Verified word source capacity is insufficient for 기초: expected 2, found 1')
  })

  test('uses a traceable editorial Korean gloss only after Wiktionary has no gloss', () => {
    const editorial = buildEditorialGlossIndex([{
      term: 'look up',
      meaning: '찾아보다',
      sourceKind: 'editorial',
      reviewer: 'editorial-team',
      reviewDate: '2026-07-11',
      evidenceUrl: 'https://example.org/evidence/look-up',
    }])

    expect(resolveKoreanMeanings('look up', ['올려다보다'], editorial)).toEqual({
      sourceKind: 'wiktionary',
      meanings: ['올려다보다'],
    })
    expect(resolveKoreanMeanings('look up', [], editorial)).toEqual({
      sourceKind: 'editorial',
      meanings: ['찾아보다'],
    })
  })

  test('rejects untraceable or ambiguous editorial gloss records', () => {
    expect(() => buildEditorialGlossIndex([{
      term: 'look up',
      meaning: '찾아보다',
      sourceKind: 'editorial',
      reviewer: '',
      reviewDate: 'not-a-date',
      evidenceUrl: '',
    }])).toThrow('Editorial gloss for "look up" is missing reviewer')

    expect(() => buildEditorialGlossIndex([
      {
        term: 'look up', meaning: '찾아보다', sourceKind: 'editorial', reviewer: 'A',
        reviewDate: '2026-07-11', evidenceUrl: 'https://example.org/one',
      },
      {
        term: 'LOOK UP', meaning: '검색하다', sourceKind: 'editorial', reviewer: 'B',
        reviewDate: '2026-07-11', evidenceUrl: 'https://example.org/two',
      },
    ])).toThrow('Duplicate editorial gloss term: look up')
  })

  test('loads the structured editorial manifest through the same traceability gate', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wordmaster-editorial-'))
    const manifestPath = join(directory, 'glosses.json')
    try {
      await writeFile(manifestPath, JSON.stringify([{
        term: 'turn on',
        meaning: '켜다',
        sourceKind: 'editorial',
        reviewer: 'editorial-team',
        reviewDate: '2026-07-11',
        evidenceUrl: 'https://example.org/evidence/turn-on',
      }]))

      await expect(readEditorialGlossManifest(manifestPath)).resolves.toHaveProperty('size', 1)

      await writeFile(manifestPath, JSON.stringify({ term: 'not an array' }))
      await expect(readEditorialGlossManifest(manifestPath))
        .rejects.toThrow('Editorial gloss manifest must be a JSON array')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
