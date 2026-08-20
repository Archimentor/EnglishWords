import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { describe, expect, test } from 'vitest'

import {
  OMW_RECOVERY_SOURCE_EXAMPLE_BUFFER,
  KINDERGARTEN_SOURCE_FALLBACK_CEFR,
  REQUIRED_CORE_WORDS,
  exampleTargetsBySurfaceForm,
  formsFor,
  isBlockedCatalogLemma,
  isInflectionCrossReference,
  kindergartenAllocationPhase,
  isLearnerSafeExampleForLevel,
  isSuitableExample,
  matchingKoreanEntry,
  minimumLearnerLevelForWord,
  normalizedPartOfSpeech,
  parseCefrCsv,
  parseCefrEvidence,
  parseCsvLine,
  parseFrequencyCsv,
  parseFrequencyEvidence,
  parseOmwBilingualLexicon,
  parseWikiPageTitle,
  parseWikiPageXml,
  readTatoebaExamples,
  resolveKoreanEntry,
  resolveKoreanEntries,
  resolveOmwBilingualEntries,
  resolveSourceAlignedKoreanEntries,
  sentenceFormsMatchPartOfSpeech,
  sentenceMatchesPartOfSpeech,
} from './buildWordCatalog'

describe('full word catalog source parsers', () => {
  test('keeps foundational closed-class anchors exclusively in the basic editorial batch', () => {
    expect(REQUIRED_CORE_WORDS).toEqual([])
  })

  test('parses quoted CSV cells and escaped quotes', () => {
    expect(parseCsvLine('one,"two, three","say ""yes"""')).toEqual([
      'one', 'two, three', 'say "yes"',
    ])
  })

  test('uses the earliest CEFR level and first frequency rank for a lemma', () => {
    const cefr = parseCefrCsv([
      'headword,pos,CEFR,CoreInventory 1,CoreInventory 2,Threshold',
      'travel,verb,B1,,,',
      'travel,noun,A2,,,',
    ].join('\n'))
    const frequency = parseFrequencyCsv([
      'Rank,Word,Part of speech,Frequency,Dispersion',
      '10,Travel,v,1,1',
      '20,travel,n,1,1',
    ].join('\n'))

    expect(cefr.get('travel')).toEqual({ level: 'A2', partOfSpeech: 'noun', line: 3 })
    expect(frequency.get('travel')).toEqual({ rank: 10, partOfSpeech: 'v', line: 2 })
    expect(parseCefrEvidence([
      'headword,pos,CEFR,CoreInventory 1,CoreInventory 2,Threshold',
      'travel,verb,B1,,,',
      'travel,noun,A2,,,',
    ].join('\n')).get('travel')).toEqual([
      { level: 'B1', partOfSpeech: 'verb', line: 2 },
      { level: 'A2', partOfSpeech: 'noun', line: 3 },
    ])
    expect(parseFrequencyEvidence([
      'Rank,Word,Part of speech,Frequency,Dispersion',
      '10,Travel,v,1,1',
      '20,travel,n,1,1',
    ].join('\n')).get('travel')).toEqual([
      { rank: 10, partOfSpeech: 'v', line: 2 },
      { rank: 20, partOfSpeech: 'n', line: 3 },
    ])
  })

  test('decodes a Wikimedia XML page without loading the full dump', () => {
    const page = '<page><title>take &amp; give</title><revision><text xml:space="preserve">== 영어 ==\n# 주고받다 &lt;nowiki&gt;</text></revision></page>'
    expect(parseWikiPageTitle(page)).toBe('take & give')
    expect(parseWikiPageXml(page)).toEqual({
      title: 'take & give', text: '== 영어 ==\n# 주고받다 <nowiki>',
    })
  })

  test('joins OMW English and Korean rows only by exact PWN3 synset coordinates', () => {
    const lexicon = parseOmwBilingualLexicon([
      '# Princeton WordNet\teng\thttp://wordnet.princeton.edu/\twordnet',
      '00001740-a\tlemma\table',
      '00001740-a\tlemma\tcapable',
      '00002098-a\tlemma\tunable',
      '00003000-n\tlemma\tdrug',
      'malformed\tlemma\tguess',
    ].join('\n'), [
      '# Wiktionary\tkor\thttp://wiktionary.org/\tCC BY-SA',
      '00001740-a\tkor:lemma\t할 수 있는',
      '00001740-a\tkor:lemma\t유능한',
      '00002098-a\tkor:lemma\t할 수 없는',
      '00003000-n\tkor:lemma\t마약',
      '00009999-a\tkor:lemma\t추측 번역',
    ].join('\n'))

    expect(lexicon.get('able')).toEqual([{
      partOfSpeech: 'adjective',
      meanings: ['할 수 있는', '유능한'],
      synsetIds: ['00001740-a'],
    }])
    expect(lexicon.get('capable')).toEqual(lexicon.get('able'))
    expect(lexicon.get('unable')).toEqual([{
      partOfSpeech: 'adjective',
      meanings: ['할 수 없는'],
      synsetIds: ['00002098-a'],
    }])
    expect(lexicon.has('drug')).toBe(false)
    expect(lexicon.has('guess')).toBe(false)
  })

  test('accepts only monosemous or translation-convergent OMW lemma/POS rows', () => {
    expect(OMW_RECOVERY_SOURCE_EXAMPLE_BUFFER).toBe(5)
    const lexicon = parseOmwBilingualLexicon([
      '00000001-n\tlemma\tsingle',
      '00000002-n\tlemma\tincomplete',
      '00000003-n\tlemma\tincomplete',
      '00000004-v\tlemma\tdivergent',
      '00000005-v\tlemma\tdivergent',
      '00000006-a\tlemma\tconvergent',
      '00000007-a\tlemma\tconvergent',
    ].join('\n'), [
      '00000001-n\tkor:lemma\t하나',
      '00000002-n\tkor:lemma\t일부',
      '00000004-v\tkor:lemma\t가르다',
      '00000005-v\tkor:lemma\t벗어나다',
      '00000006-a\tkor:lemma\t모이는',
      '00000006-a\tkor:lemma\t첫째 뜻',
      '00000007-a\tkor:lemma\t모이는',
      '00000007-a\tkor:lemma\t둘째 뜻',
    ].join('\n'))

    expect(lexicon.get('single')).toEqual([{
      partOfSpeech: 'noun', meanings: ['하나'], synsetIds: ['00000001-n'],
    }])
    expect(lexicon.has('incomplete')).toBe(false)
    expect(lexicon.has('divergent')).toBe(false)
    expect(lexicon.get('convergent')).toEqual([{
      partOfSpeech: 'adjective',
      meanings: ['모이는'],
      synsetIds: ['00000006-a', '00000007-a'],
    }])
  })

  test('retains OMW POS and synset coordinates while preferring matching source evidence', () => {
    const resolved = resolveOmwBilingualEntries([
      { partOfSpeech: 'noun', meanings: ['기록'], synsetIds: ['00000001-n'] },
      { partOfSpeech: 'verb', meanings: ['기록하다'], synsetIds: ['00000002-v'] },
    ], [
      { level: 'B1', partOfSpeech: 'verb', line: 7 },
    ], [])

    expect(resolved).toEqual({
      sourcePartOfSpeech: 'verb',
      cefr: { level: 'B1', partOfSpeech: 'verb', line: 7 },
      entries: [
        {
          partOfSpeech: 'verb', meanings: ['기록하다'],
          resolution: 'omw-bilingual-synset', omwSynsetIds: ['00000002-v'],
        },
        {
          partOfSpeech: 'noun', meanings: ['기록'],
          resolution: 'omw-bilingual-synset', omwSynsetIds: ['00000001-n'],
        },
      ],
    })
  })

  test('normalizes source POS codes and produces stable morphology shapes', () => {
    expect(normalizedPartOfSpeech(undefined, 'v')).toBe('verb')
    expect(normalizedPartOfSpeech('modal auxiliary', undefined)).toBe('verb')
    expect(normalizedPartOfSpeech('be-verb', undefined)).toBe('verb')
    expect(normalizedPartOfSpeech('have-verb', undefined)).toBe('verb')
    expect(normalizedPartOfSpeech('infinitive-to', undefined)).toBe('infinitiveMarker')
    expect(normalizedPartOfSpeech('number', undefined)).toBe('numeral')
    expect(formsFor('study', 'verb')).toEqual({
      base: 'study', s3: 'studies', past: 'studied', participle: 'studying', pastParticiple: 'studied',
    })
    expect(formsFor('child', 'noun')).toEqual(['child', 'children'])
    expect(formsFor('belief', 'noun')).toEqual(['belief', 'beliefs'])
    expect(formsFor('chef', 'noun')).toEqual(['chef', 'chefs'])
    expect(formsFor('happy', 'adjective')).toEqual(['happy'])
    expect(formsFor('unique', 'adjective')).toEqual(['unique'])
    expect(formsFor('must', 'verb')).toEqual(['must'])
    expect(formsFor('may', 'verb', {
      lemma: 'may', past: ['might'],
    })).toEqual(['may', 'might'])
    expect(formsFor('shall', 'verb', {
      lemma: 'shall', past: ['should'],
    })).toEqual(['shall', 'should'])
    expect(formsFor('will', 'verb', {
      lemma: 'will', past: ['would'],
    })).toEqual(['will', 'would'])
    expect(formsFor('can', 'verb', {
      lemma: 'can', past: ['could', 'canned'], pastParticiple: ['couth', 'canned'],
    })).toEqual(['can', 'could'])
    expect(formsFor('be', 'verb')).toEqual({
      base: 'be', firstPerson: 'am', s3: 'is', presentPlural: 'are',
      past: 'was', pastPlural: 'were', participle: 'being', pastParticiple: 'been',
    })
    expect(formsFor('quiz', 'verb')).toEqual({
      base: 'quiz', s3: 'quizzes', past: 'quizzed', participle: 'quizzing', pastParticiple: 'quizzed',
    })
    expect(formsFor('panic', 'verb')).toEqual({
      base: 'panic', s3: 'panics', past: 'panicked', participle: 'panicking', pastParticiple: 'panicked',
    })
    expect(formsFor('web', 'verb')).toEqual({
      base: 'web', s3: 'webs', past: 'webbed', participle: 'webbing', pastParticiple: 'webbed',
    })
    expect(formsFor('retell', 'verb')).toEqual({
      base: 'retell', s3: 'retells', past: 'retold', participle: 'retelling', pastParticiple: 'retold',
    })
    expect(formsFor('skip', 'verb')).toEqual({
      base: 'skip', s3: 'skips', past: 'skipped', participle: 'skipping', pastParticiple: 'skipped',
    })
    expect(formsFor('lie', 'verb')).toEqual({
      base: 'lie', s3: 'lies', past: 'lay', participle: 'lying', pastParticiple: 'lain',
      pastVariant: 'lied', pastParticipleVariant: 'lied',
    })
    expect(formsFor('freeze', 'verb')).toEqual({
      base: 'freeze', s3: 'freezes', past: 'froze', participle: 'freezing', pastParticiple: 'frozen',
    })
    expect(formsFor('wake', 'verb')).toEqual({
      base: 'wake', s3: 'wakes', past: 'woke', participle: 'waking', pastParticiple: 'woken',
    })
    expect(formsFor('sew', 'verb')).toEqual({
      base: 'sew', s3: 'sews', past: 'sewed', participle: 'sewing', pastParticiple: 'sewn',
    })
    expect(formsFor('strive', 'verb')).toEqual({
      base: 'strive', s3: 'strives', past: 'strove', participle: 'striving', pastParticiple: 'striven',
    })
    expect(formsFor('mistake', 'verb')).toEqual({
      base: 'mistake', s3: 'mistakes', past: 'mistook', participle: 'mistaking', pastParticiple: 'mistaken',
    })
    expect(formsFor('shoot', 'verb')).toEqual({
      base: 'shoot', s3: 'shoots', past: 'shot', participle: 'shooting', pastParticiple: 'shot',
    })
    expect(formsFor('strike', 'verb')).toEqual({
      base: 'strike', s3: 'strikes', past: 'struck', participle: 'striking', pastParticiple: 'struck',
    })
    expect(formsFor('swing', 'verb')).toEqual({
      base: 'swing', s3: 'swings', past: 'swung', participle: 'swinging', pastParticiple: 'swung',
    })
    expect(formsFor('smite', 'verb', {
      lemma: 'smite', past: ['smote'], pastParticiple: ['smitten'],
    })).toEqual({
      base: 'smite', s3: 'smites', past: 'smote', participle: 'smiting', pastParticiple: 'smitten',
    })
    expect(formsFor('reset', 'verb')).toEqual({
      base: 'reset', s3: 'resets', past: 'reset', participle: 'resetting', pastParticiple: 'reset',
    })
    expect(formsFor('behave', 'verb')).toEqual({
      base: 'behave', s3: 'behaves', past: 'behaved', participle: 'behaving', pastParticiple: 'behaved',
    })
    expect(formsFor('shampoo', 'verb')).toEqual({
      base: 'shampoo', s3: 'shampoos', past: 'shampooed', participle: 'shampooing', pastParticiple: 'shampooed',
    })
    expect(formsFor('reprove', 'verb')).toEqual({
      base: 'reprove', s3: 'reproves', past: 'reproved', participle: 'reproving', pastParticiple: 'reproved',
    })
    expect(formsFor('enroll', 'verb')).toEqual({
      base: 'enroll', s3: 'enrolls', past: 'enrolled', participle: 'enrolling', pastParticiple: 'enrolled',
    })
    expect(formsFor('overstep', 'verb')).toEqual({
      base: 'overstep', s3: 'oversteps', past: 'overstepped', participle: 'overstepping', pastParticiple: 'overstepped',
    })
    expect(formsFor('layer', 'verb')).toEqual({
      base: 'layer', s3: 'layers', past: 'layered', participle: 'layering', pastParticiple: 'layered',
    })
    expect(formsFor('rebel', 'verb')).toEqual({
      base: 'rebel', s3: 'rebels', past: 'rebelled', participle: 'rebelling', pastParticiple: 'rebelled',
    })
    expect(formsFor('lesson', 'noun')).toEqual(['lesson', 'lessons'])
    expect(formsFor('history', 'noun')).toEqual(['history', 'histories'])
    expect(formsFor('lens', 'noun')).toEqual(['lens', 'lenses'])
    expect(formsFor('euro', 'noun')).toEqual(['euro', 'euros'])
    expect(formsFor('sodium', 'noun')).toEqual(['sodium'])
    expect(formsFor('sheep', 'noun')).toEqual(['sheep'])
    expect(formsFor('series', 'noun')).toEqual(['series'])
    expect(formsFor('species', 'noun')).toEqual(['species'])
    expect(formsFor('news', 'noun')).toEqual(['news'])
    expect(formsFor('tuberculosis', 'noun')).toEqual(['tuberculosis'])
    expect(formsFor('barman', 'noun')).toEqual(['barman', 'barmen'])
    expect(formsFor('craftsman', 'noun')).toEqual(['craftsman', 'craftsmen'])
    expect(formsFor('fisherman', 'noun')).toEqual(['fisherman', 'fishermen'])
    expect(formsFor('freshman', 'noun')).toEqual(['freshman', 'freshmen'])
    expect(formsFor('gentleman', 'noun')).toEqual(['gentleman', 'gentlemen'])
    expect(formsFor('policeman', 'noun')).toEqual(['policeman', 'policemen'])
    expect(formsFor('policewoman', 'noun')).toEqual(['policewoman', 'policewomen'])
    expect(formsFor('spokesman', 'noun')).toEqual(['spokesman', 'spokesmen'])
    expect(formsFor('workman', 'noun', {
      lemma: 'workman', plurals: ['workmans'],
    })).toEqual(['workman', 'workmen'])
    expect(formsFor('cattle', 'noun', {
      lemma: 'cattle', plurals: ['cattles'],
    })).toEqual(['cattle'])
    for (const lemma of [
      'badminton', 'boxing', 'british', 'camping', 'chess', 'climbing', 'data', 'diving',
      'elderly', 'fishing', 'french', 'fun', 'gambling', 'gardening', 'golf', 'hiking',
      'hockey', 'hunting', 'ironing', 'judo', 'luck', 'mutton', 'peace', 'personnel',
      'rugby', 'shopping', 'soccer', 'spanish', 'swimming', 'tennis', 'unemployed', 'walking',
      'accounting', 'applause', 'drinking', 'electricity', 'engineering', 'fighting',
      'garbage', 'hardware', 'health', 'importance', 'independence', 'leisure', 'music',
      'overwork', 'pollution', 'poverty', 'prevention', 'publicity', 'rubbish', 'safety',
      'shoplifting', 'violence',
    ]) {
      expect(formsFor(lemma, 'noun'), lemma).toEqual([lemma])
    }
    expect(formsFor('july', 'noun')).toEqual(['july', 'julys'])
    expect(formsFor('grandchild', 'noun')).toEqual(['grandchild', 'grandchildren'])
    expect(formsFor('sew', 'verb', {
      lemma: 'sew', past: ['sewed'], pastParticiple: ['sewed', 'sewn'],
    })).toEqual({
      base: 'sew', s3: 'sews', past: 'sewed', participle: 'sewing',
      pastParticiple: 'sewed', pastParticipleVariant: 'sewn',
    })
    expect(formsFor('person', 'noun', {
      lemma: 'person', plurals: ['people', 'persons'],
    })).toEqual(['person', 'people', 'persons'])
    expect(formsFor('index', 'noun', {
      lemma: 'index', plurals: ['indexes', 'indices'],
    })).toEqual(['index', 'indexes', 'indices'])
    expect(formsFor('fallen', 'verb', {
      lemma: 'fall', past: ['fell'], pastParticiple: ['fallen'],
    })).toEqual({
      base: 'fallen', s3: 'fallens', past: 'fallened', participle: 'fallening',
      pastParticiple: 'fallened',
    })
  })

  test('exact dictionary matcher never silently returns a different POS', () => {
    const entries = [
      { partOfSpeech: 'noun', meanings: ['문자 에이'] },
      { partOfSpeech: 'determiner', meanings: ['어떤, 한'] },
    ]

    expect(matchingKoreanEntry(entries, 'determiner')).toBe(entries[1])
    expect(matchingKoreanEntry(entries, 'verb')).toBeUndefined()
  })

  test('marks a safe alternate dictionary sense explicitly and rejects names or letter senses', () => {
    expect(resolveKoreanEntry([
      { partOfSpeech: 'verb', meanings: ['시도하다'] },
    ], 'noun')).toEqual({
      entry: { partOfSpeech: 'verb', meanings: ['시도하다'] },
      resolution: 'alternate-wiktionary-sense',
    })
    expect(resolveKoreanEntry([
      { partOfSpeech: 'noun', meanings: ['남자 이름'] },
      { partOfSpeech: 'noun', meanings: ['로마자 알파벳의 첫째 글자'] },
    ], 'verb')).toBeUndefined()
  })

  test('keeps one source-aligned entry per distinct verified Wiktionary POS', () => {
    expect(resolveKoreanEntries([
      { partOfSpeech: 'noun', meanings: ['대답', '응답'] },
      { partOfSpeech: 'verb', meanings: ['대답하다', '남자 이름'] },
      { partOfSpeech: 'noun', meanings: ['해답'] },
      { partOfSpeech: 'other', meanings: ['분류할 수 없는 뜻'] },
    ], 'noun')).toEqual([
      {
        partOfSpeech: 'noun',
        meanings: ['대답', '해답', '응답'],
        resolution: 'exact-source-sense',
      },
      {
        partOfSpeech: 'verb',
        meanings: ['대답하다'],
        resolution: 'additional-wiktionary-sense',
      },
    ])
  })

  test('keeps representative meanings from separate same-POS source senses', () => {
    expect(resolveKoreanEntries([
      { partOfSpeech: 'noun', meanings: ['띠', '끈', '테'] },
      { partOfSpeech: 'noun', meanings: ['음악단', '악단'] },
    ], 'noun', 'band')).toEqual([{
      partOfSpeech: 'noun',
      meanings: ['띠', '음악단', '끈', '악단'],
      resolution: 'exact-source-sense',
    }])
  })

  test('unions source morphology by POS and rejects a template for another page lemma', () => {
    expect(resolveKoreanEntries([
      {
        partOfSpeech: 'verb', meanings: ['눕다'],
        morphology: { lemma: 'lie', past: ['lay'], pastParticiple: ['lain'] },
      },
      {
        partOfSpeech: 'verb', meanings: ['거짓말하다'],
        morphology: { lemma: 'lie', past: ['lied'], pastParticiple: ['lied'] },
      },
    ], 'verb', 'lie')).toEqual([{
      partOfSpeech: 'verb',
      meanings: ['눕다', '거짓말하다'],
      resolution: 'exact-source-sense',
      morphology: {
        lemma: 'lie', past: ['lay', 'lied'], pastParticiple: ['lain', 'lied'],
      },
    }])

    expect(resolveKoreanEntries([{
      partOfSpeech: 'verb', meanings: ['떨어진'],
      morphology: { lemma: 'fall', past: ['fell'], pastParticiple: ['fallen'] },
    }], 'verb', 'fallen')).toEqual([{
      partOfSpeech: 'verb', meanings: ['떨어진'], resolution: 'exact-source-sense',
    }])
  })

  test('joins all source POS rows before assigning CEFR level evidence', () => {
    expect(resolveSourceAlignedKoreanEntries(
      'travel',
      [{ partOfSpeech: 'verb', meanings: ['여행하다'] }],
      [
        { level: 'A1', partOfSpeech: 'noun', line: 2 },
        { level: 'A2', partOfSpeech: 'verb', line: 3 },
      ],
      [
        { rank: 10, partOfSpeech: 'n', line: 2 },
        { rank: 20, partOfSpeech: 'v', line: 3 },
      ],
    )).toEqual({
      sourcePartOfSpeech: 'verb',
      entries: [{
        partOfSpeech: 'verb', meanings: ['여행하다'], resolution: 'exact-source-sense',
      }],
      cefr: { level: 'A2', partOfSpeech: 'verb', line: 3 },
      frequency: { rank: 20, partOfSpeech: 'v', line: 3 },
    })

    expect(resolveSourceAlignedKoreanEntries(
      'record',
      [
        { partOfSpeech: 'noun', meanings: ['기록'] },
        { partOfSpeech: 'verb', meanings: ['기록하다'] },
      ],
      [
        { level: 'A2', partOfSpeech: 'noun', line: 2 },
        { level: 'A1', partOfSpeech: 'verb', line: 3 },
      ],
      [],
    )).toMatchObject({
      sourcePartOfSpeech: 'verb',
      cefr: { level: 'A1', partOfSpeech: 'verb', line: 3 },
      entries: [expect.objectContaining({
        partOfSpeech: 'verb', resolution: 'exact-source-sense',
      }), expect.objectContaining({
        partOfSpeech: 'noun', resolution: 'additional-wiktionary-sense',
      })],
    })
  })

  test('rejects pure inflection cross-references but retains lexicalized plural senses', () => {
    expect(isInflectionCrossReference('do의 동명사 및 현재분사')).toBe(true)
    expect(isInflectionCrossReference("'find'의 과거, 과거분사")).toBe(true)
    expect(isInflectionCrossReference('criterion의 복수형')).toBe(true)
    expect(isInflectionCrossReference('fall 의 과거분사')).toBe(true)
    expect(isInflectionCrossReference('동사 rise의 과거형')).toBe(true)
    expect(isInflectionCrossReference('follow의 동명사형 및 현재분사형')).toBe(true)
    expect(isInflectionCrossReference('동사 bind의 과거 및 과거분사')).toBe(true)
    expect(isInflectionCrossReference('(구식) bind의 과거형과 과거분사')).toBe(true)
    expect(isInflectionCrossReference('statistic의 3인칭 단수 단순 현재 직설법 시제')).toBe(true)
    expect(isInflectionCrossReference('mean의 삼인칭 단수 현재형')).toBe(true)
    expect(isInflectionCrossReference("'lie' (위치나 물리적 자세와 관련된 뜻 한정)의 과거형"))
      .toBe(true)
    expect(isInflectionCrossReference('be 의 1인칭 단수 현재형')).toBe(true)
    expect(isInflectionCrossReference('be 동사의 1인칭 복수, 2인칭 단수 및 복수, 3인칭 복수의 현재형'))
      .toBe(true)
    expect(isInflectionCrossReference('be 동사의 이인칭 단수 및 모든 복수 인칭 과거'))
      .toBe(true)
    expect(isInflectionCrossReference('have 과거 및 과거분사')).toBe(true)
    expect(isInflectionCrossReference('write의 현재 진행형')).toBe(true)
    expect(isInflectionCrossReference('run 의 동명사, 현재진행형 형태')).toBe(true)
    expect(isInflectionCrossReference('(복수형으로 쓰며) 안경')).toBe(false)
    expect(resolveKoreanEntries([
      { partOfSpeech: 'verb', meanings: ['do의 동명사 및 현재분사'] },
    ], 'verb')).toEqual([])
    expect(resolveKoreanEntries([
      { partOfSpeech: 'verb', meanings: ['do의 동명사 및 현재분사'] },
      { partOfSpeech: 'noun', meanings: ['행위'] },
    ], 'verb')).toEqual([{
      partOfSpeech: 'noun',
      meanings: ['행위'],
      resolution: 'alternate-wiktionary-sense',
    }])
    expect(resolveKoreanEntries([
      { partOfSpeech: 'noun', meanings: ["'glass'의 복수형", '(복수형으로 쓰며) 안경'] },
    ], 'noun')).toEqual([{
      partOfSpeech: 'noun',
      meanings: ['(복수형으로 쓰며) 안경'],
      resolution: 'exact-source-sense',
    }])
    expect(resolveKoreanEntries([
      { partOfSpeech: 'noun', meanings: [': 막연히 어떤 것'] },
    ], 'pronoun', 'something')).toEqual([{
      partOfSpeech: 'pronoun',
      meanings: ['막연히 어떤 것'],
      resolution: 'editorial-source-pos-override',
    }])
    expect(resolveKoreanEntries([
      { partOfSpeech: 'noun', meanings: ['= 관, 튜브', '〔〕 관 모양 용기'] },
    ], 'noun')).toEqual([{
      partOfSpeech: 'noun',
      meanings: ['관, 튜브', '관 모양 용기'],
      resolution: 'exact-source-sense',
    }])
    expect(resolveKoreanEntries([
      { partOfSpeech: 'noun', meanings: ['1. = 관'] },
    ], 'noun')).toEqual([{
      partOfSpeech: 'noun',
      meanings: ['관'],
      resolution: 'exact-source-sense',
    }])
    expect(resolveKoreanEntries([
      { partOfSpeech: 'noun', meanings: ['어떤 것'] },
    ], 'pronoun', 'some')).toEqual([{
      partOfSpeech: 'pronoun',
      meanings: ['어떤 것'],
      resolution: 'editorial-source-pos-override',
    }])
    expect(formsFor('some', 'pronoun')).toEqual(['some'])

    expect(resolveKoreanEntries([
      { partOfSpeech: 'noun', meanings: ['폭로하다, 누설하다'] },
    ], 'verb', 'reveal')).toEqual([{
      partOfSpeech: 'verb',
      meanings: ['폭로하다, 누설하다'],
      resolution: 'editorial-source-pos-override',
    }])
    expect(resolveKoreanEntries([
      { partOfSpeech: 'verb', meanings: ['당김, 뻗침'] },
    ], 'noun', 'tone')).toEqual([{
      partOfSpeech: 'noun',
      meanings: ['당김, 뻗침'],
      resolution: 'editorial-source-pos-override',
    }])
  })

  test('accepts only examples where the lemma has the requested part of speech', () => {
    expect(sentenceMatchesPartOfSpeech('The answer is correct.', 'answer', 'noun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('I answer the question.', 'answer', 'verb')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('She answered the question.', 'answered', 'verb')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('The answers are correct.', 'answers', 'noun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('The answer is correct.', 'answer', 'verb')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('I answer the question.', 'answer', 'noun')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('I want to go home.', 'to', 'infinitiveMarker')).toBe(true)
    expect(sentenceFormsMatchPartOfSpeech(
      'She answered the question.',
      ['answer', 'answers', 'answered', 'answering'],
      'verb',
    )).toBe(true)
    expect(sentenceMatchesPartOfSpeech('I do not know.', 'not', 'adverb')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('I never go there.', 'never', 'adverb')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('I never go there.', 'there', 'adverb')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('We stay unless it rains.', 'unless', 'conjunction')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('We left early lest it rain.', 'lest', 'conjunction')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('Someone is at the door.', 'someone', 'pronoun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('Some were missing.', 'some', 'pronoun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('I bought some.', 'some', 'pronoun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('Some of them were missing.', 'some', 'pronoun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('I offered some to Mary.', 'some', 'pronoun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('Some people came.', 'some', 'pronoun')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('Everyone is ready.', 'everyone', 'pronoun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('None are ready.', 'none', 'pronoun')).toBe(true)
    expect(sentenceFormsMatchPartOfSpeech(
      'Can you explain what PKO stands for?',
      ['stand', 'stands'],
      'noun',
    ))
      .toBe(false)
    expect(sentenceFormsMatchPartOfSpeech(
      'Can you explain what PKO stands for?',
      ['stand', 'stands'],
      'verb',
    ))
      .toBe(true)
    expect(sentenceFormsMatchPartOfSpeech(
      'The woman stands before the library.',
      ['stand', 'stands'],
      'noun',
    ))
      .toBe(false)
    expect(sentenceFormsMatchPartOfSpeech(
      'Experts say inflation stands at three percent.',
      ['stand', 'stands'],
      'noun',
    )).toBe(false)
    expect(sentenceFormsMatchPartOfSpeech(
      'Experts say inflation stands at three percent.',
      ['stand', 'stands'],
      'verb',
    )).toBe(true)
    expect(sentenceFormsMatchPartOfSpeech(
      'The accused stands trial.',
      ['stand', 'stands'],
      'noun',
    )).toBe(false)
    expect(sentenceFormsMatchPartOfSpeech(
      'The accused stands trial.',
      ['stand', 'stands'],
      'verb',
    )).toBe(true)
    expect(sentenceFormsMatchPartOfSpeech(
      'She bought two music stands.',
      ['stand', 'stands'],
      'noun',
    )).toBe(true)
    expect(sentenceFormsMatchPartOfSpeech(
      'She bought two music stands.',
      ['stand', 'stands'],
      'verb',
    )).toBe(false)
    for (const sentence of [
      'The red stands are near the wall.',
      'The wooden stands hold cameras.',
      'The damaged stands are unsafe.',
      'The folded stands take less space.',
      'We placed music stands by the wall.',
    ]) {
      expect(sentenceFormsMatchPartOfSpeech(sentence, ['stand', 'stands'], 'noun'), sentence)
        .toBe(true)
      expect(sentenceFormsMatchPartOfSpeech(sentence, ['stand', 'stands'], 'verb'), sentence)
        .toBe(false)
    }
    for (const sentence of [
      'My point still stands.',
      'Life stands explained.',
      'A plastic dinosaur stands guard outside.',
      'The castle stands facing a lake.',
      'The dove stands for peace.',
      'Tom will destroy everybody who stands in his way.',
      'No one stands up for the Palestinians.',
      'We shall annihilate anyone who stands in our way!',
      'We are a nation that stands for the rule of law.',
      'This stands corrected.',
      'That stands explained.',
      'One stands accused.',
    ]) {
      expect(sentenceFormsMatchPartOfSpeech(sentence, ['stand', 'stands'], 'noun'), sentence)
        .toBe(false)
      expect(sentenceFormsMatchPartOfSpeech(sentence, ['stand', 'stands'], 'verb'), sentence)
        .toBe(true)
    }
    expect(sentenceFormsMatchPartOfSpeech(
      'We placed music stands near the wall.',
      ['stand', 'stands'],
      'noun',
    )).toBe(true)
    expect(sentenceFormsMatchPartOfSpeech(
      'We placed music stands near the wall.',
      ['stand', 'stands'],
      'verb',
    )).toBe(false)
    expect(sentenceFormsMatchPartOfSpeech(
      'They put rubber bands in my braces.',
      ['band', 'bands'],
      'verb',
    ))
      .toBe(false)
    expect(sentenceFormsMatchPartOfSpeech(
      'They put rubber bands in my braces.',
      ['band', 'bands'],
      'noun',
    ))
      .toBe(true)
    expect(sentenceFormsMatchPartOfSpeech(
      'She bands the papers.',
      ['band', 'bands'],
      'noun',
    )).toBe(false)
    expect(sentenceFormsMatchPartOfSpeech(
      'She bands the papers.',
      ['band', 'bands'],
      'verb',
    )).toBe(true)
    for (const sentence of [
      'The rubber bands on this box are blue.',
      'School bands from Boston are popular.',
      'College bands from Boston are popular.',
      'Local rock bands play tonight.',
      'Doctors say rubber bands help braces.',
      'Lo, Panthus, flying from the Grecian bands, Panthus draws near.',
    ]) {
      expect(sentenceFormsMatchPartOfSpeech(sentence, ['band', 'bands'], 'noun'), sentence)
        .toBe(true)
      expect(sentenceFormsMatchPartOfSpeech(sentence, ['band', 'bands'], 'verb'), sentence)
        .toBe(false)
    }
    expect(sentenceFormsMatchPartOfSpeech(
      'Someone else likes this book.',
      ['like', 'likes'],
      'noun',
    )).toBe(false)
    expect(sentenceFormsMatchPartOfSpeech(
      'Someone else likes this book.',
      ['like', 'likes'],
      'verb',
    )).toBe(true)
    expect(sentenceMatchesPartOfSpeech('Somebody is at the door.', 'somebody', 'noun')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('Somebody is at the door.', 'somebody', 'pronoun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('He is a nobody.', 'nobody', 'noun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('He is a nobody.', 'nobody', 'pronoun')).toBe(false)
    expect(sentenceFormsMatchPartOfSpeech(
      'The writing-table stood by the window.',
      ['writing'],
      'noun',
      'writing',
    )).toBe(false)
    expect(sentenceMatchesPartOfSpeech('The teacher saw nobody.', 'nobody', 'noun')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('The teacher saw nobody.', 'nobody', 'pronoun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech(
      'Are you sure that nobody can see us?',
      'nobody',
      'noun',
    )).toBe(false)
    expect(sentenceMatchesPartOfSpeech(
      'Are you sure that nobody can see us?',
      'nobody',
      'pronoun',
    )).toBe(true)
    expect(sentenceMatchesPartOfSpeech('A child told somebody.', 'somebody', 'noun')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('A child told somebody.', 'somebody', 'pronoun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech(
      "Everyone's against somebody in war.",
      'somebody',
      'noun',
    )).toBe(false)
    expect(sentenceMatchesPartOfSpeech(
      "Everyone's against somebody in war.",
      'somebody',
      'pronoun',
    )).toBe(true)
    expect(sentenceMatchesPartOfSpeech('The teacher heard nothing.', 'nothing', 'noun')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('The teacher heard nothing.', 'nothing', 'pronoun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech(
      'I thought that nothing would happen.',
      'nothing',
      'noun',
    )).toBe(false)
    expect(sentenceMatchesPartOfSpeech(
      'I thought that nothing would happen.',
      'nothing',
      'pronoun',
    )).toBe(true)
    expect(sentenceMatchesPartOfSpeech('They are complete nobodies.', 'nobodies', 'noun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('She whispered sweet nothings.', 'nothings', 'noun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('The can is empty.', 'can', 'noun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('The can is empty.', 'can', 'verb')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('The soup is in a can.', 'can', 'noun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('The soup is in a can.', 'can', 'verb')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('The metal can fell over.', 'can', 'noun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('The metal can fell over.', 'can', 'verb')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('This can is empty.', 'can', 'noun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('This can is empty.', 'can', 'verb')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('My can is empty.', 'can', 'noun')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('My can is empty.', 'can', 'verb')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('Can you help?', 'can', 'noun')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('Can you help?', 'can', 'verb')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('Can there be another way?', 'can', 'noun')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('Can there be another way?', 'can', 'verb')).toBe(true)
    for (const sentence of [
      'This can be useful.',
      'That can happen.',
      'That can work.',
      'That can help.',
    ]) {
      expect(sentenceMatchesPartOfSpeech(sentence, 'can', 'noun'), sentence).toBe(false)
      expect(sentenceMatchesPartOfSpeech(sentence, 'can', 'verb'), sentence).toBe(false)
    }
    expect(sentenceMatchesPartOfSpeech('The dog can be useful.', 'can', 'noun')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('The dog can be useful.', 'can', 'verb')).toBe(true)
    expect(sentenceMatchesPartOfSpeech('A dog can run faster than a man can.', 'can', 'verb'))
      .toBe(true)
    expect(sentenceMatchesPartOfSpeech('A dog can run faster than a man can.', 'can', 'noun'))
      .toBe(false)
    expect(sentenceMatchesPartOfSpeech('They can the tomatoes.', 'can', 'noun')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('They can the tomatoes.', 'can', 'verb')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('No students came.', 'no', 'adverb')).toBe(false)
    expect(sentenceMatchesPartOfSpeech('He ran down the hill.', 'down', 'adverb')).toBe(false)
  })

  test('requires independent POS agreement for ambiguous source examples', () => {
    const rejected = [
      ['to', 'adverb', 'Do you have any idea what Tom is up to?'],
      ['to', 'adverb', 'He washed the plates up to surprise her.'],
      ['that', 'adjective', 'Tom can do all that and more.'],
      ['that', 'adjective', 'Tom thought he was all that and a bag of chips.'],
      ['film', 'verb', 'Do you enjoy plays, films, and such?'],
      ['hurt', 'noun', "David didn't want Amanda to get hurt."],
      ['hurt', 'noun', 'Too many people are getting hurt.'],
      ['pacific', 'adjective', 'He crossed the immense pacific on a raft.'],
      ['divide', 'noun', 'Opinions unite or divide people.'],
      ['bar', 'verb', 'Can you start again from bar thirty?'],
      ['speed', 'verb', "Let's bring Tom up to speed on this."],
      ['hatch', 'noun', 'A chick will soon hatch from the egg.'],
      ['bloom', 'noun', 'Not all flowers bloom in the spring.'],
      ['bloom', 'noun', 'The apple trees bloom in the spring.'],
      ['burst', 'noun', 'A glorious sight burst on our view.'],
      ['burst', 'noun', 'Tom and Mary both burst out laughing.'],
      ['fist', 'verb', 'Tom is tight-fisted.'],
      ['fist', 'verb', "Well, it's the way you shop that's tight-fisted then."],
      ['hybrid', 'adjective', 'What should we call this hybrid?'],
      ['wait', 'noun', 'Good things come to those that wait.'],
      ['wait', 'noun', "I'd better wait until Tom gets here."],
      ['suspect', 'adjective', "She isn't a suspect anymore, is she?"],
      ['suspect', 'adjective', "Detectives don't suspect foul play."],
      ['compliment', 'verb', "I'm not used to such compliments."],
      ['step', 'verb', 'Do you know what steps to take next?'],
      ['senior', 'adjective', "Donald was actually Jessica's senior."],
      ['last', 'verb', 'At last her fifteenth birthday came.'],
      ['last', 'noun', 'What the Germans build lasts forever.'],
      ['bath', 'verb', 'The north wind is my fire, the rain my only bath.'],
      ['special', 'noun', 'I know Tom is a special-needs child.'],
      ['special', 'noun', 'I thought she was my special friend.'],
      ['access', 'verb', 'Access to the resort is quite easy.'],
      ['metropolitan', 'noun', "Kyoto Metropolitan Prefecture's capital is Kyoto City."],
      ['metropolitan', 'noun', 'How high is the Tokyo Metropolitan Government Office Building?'],
      ['since', 'preposition', 'Felix has since gone back to school.'],
      ['general', 'adjective', 'He (had) appointed him general also.'],
      ['cast', 'noun', 'The rainbow casts rain on the earth.'],
      ['favor', 'verb', 'I only have one more favor to ask.'],
      ['ruin', 'verb', 'A war has reduced the city to ruins.'],
      ['ruin', 'noun', "Don't let this ruin your friendship."],
      ['serial', 'adjective', 'Do you mean "cereal" or "serial"?'],
      ['professional', 'noun', "It's a professional-looking website."],
      ['want', 'noun', 'All I want is a chance to apologize.'],
      ['want', 'noun', 'All I want is for Tom to be happy here.'],
      ['shelter', 'verb', 'They took shelter under an oak tree.'],
      ['third', 'noun', 'Mary met her third husband at a gym.'],
      ['third', 'noun', 'Ziri told his story in third person.'],
      ['pass', 'noun', 'A smack passes while a word remains.'],
      ['effect', 'verb', 'What effects would planetary alignment have?'],
      ['dose', 'verb', 'Animals were injected with the various doses.'],
      ['surrender', 'noun', "If Tom doesn't surrender, shoot him."],
      ['surrender', 'noun', 'Sami had no choice but to surrender.'],
      ['sacrifice', 'noun', 'It is better to obey than sacrifice.'],
      ['stain', 'verb', 'There were blood stains on the floor.'],
      ['stain', 'verb', 'There were oil stains on the blanket.'],
      ['stick', 'noun', "I think you'd better stick with Tom."],
      ['jar', 'verb', 'Yanni has four more jars of fig jam to give away.'],
      ['expert', 'adjective', 'I need an expert on tropical plants.'],
      ['expert', 'adjective', 'James was an expert in martial arts.'],
      ['subject', 'verb', 'Latecomers are subject to a penalty.'],
      ['subject', 'verb', 'The plan is subject to his approval.'],
      ['comb', 'noun', 'Tom seldom bothers to comb his hair.'],
      ['test', 'verb', 'Have you had any blood tests lately?'],
      ['stuff', 'verb', 'I think that you make this stuff up.'],
      ['stuff', 'verb', 'I want to throw all this stuff away.'],
      ['concrete', 'adjective', 'The foundation is bedded in concrete.'],
      ['concrete', 'noun', 'Mary says she has no concrete plans.'],
      ['well', 'interjection', 'Everything is turning out very well.'],
      ['well', 'interjection', 'He is rich and, moreover, well-born.'],
      ['well', 'noun', 'How did you learn to draw this well?'],
      ['dread', 'noun', 'Why do you think animals dread fire?'],
      ['caution', 'verb', 'Caution, the doors are now closing!'],
    ] as const

    for (const [lemma, partOfSpeech, sentence] of rejected) {
      const forms = formsFor(lemma, partOfSpeech)
      const values = Array.isArray(forms) ? forms : Object.values(forms)
      expect(
        sentenceFormsMatchPartOfSpeech(sentence, values, partOfSpeech, lemma, true),
        `${lemma}/${partOfSpeech}: ${sentence}`,
      ).toBe(false)
    }

    const accepted = [
      ['film', 'verb', 'Daniel began to prepare for filming.'],
      ['bloom', 'noun', 'The roses are in full bloom.'],
      ['burst', 'noun', 'A sudden burst of laughter filled the room.'],
      ['wait', 'noun', 'It was a long wait.'],
      ['suspect', 'adjective', 'Police found a suspect package.'],
      ['special', 'noun', "Today's specials are on the board."],
      ['ruin', 'noun', 'I want to visit the ruins of Athens.'],
      ['subject', 'verb', 'They subjected him to harsh conditions.'],
      ['well', 'interjection', "Well, let's begin."],
      ['hybrid', 'adjective', 'Tom bought a hybrid car.'],
      ['speed', 'verb', 'The car sped up.'],
      ['since', 'preposition', 'He has been busy since this morning.'],
      ['general', 'adjective', 'The book is useful for general readers.'],
      ['concrete', 'adjective', 'The warnings are clear and concrete.'],
      ['professional', 'noun', 'Both Tom and Mary are professionals.'],
    ] as const

    for (const [lemma, partOfSpeech, sentence] of accepted) {
      const forms = formsFor(lemma, partOfSpeech)
      const values = Array.isArray(forms) ? forms : Object.values(forms)
      expect(
        sentenceFormsMatchPartOfSpeech(sentence, values, partOfSpeech, lemma, true),
        `${lemma}/${partOfSpeech}: ${sentence}`,
      ).toBe(true)
    }
  })

  test('maps inflections while dropping surfaces shared by different same-POS lemmas', () => {
    const targets = exampleTargetsBySurfaceForm(new Map([
      ['find', new Set(['verb'])],
      ['found', new Set(['verb', 'adjective'])],
      ['answer', new Set(['noun', 'verb'])],
    ]))

    expect(targets.get('answered')).toEqual([{ lemma: 'answer', partOfSpeech: 'verb' }])
    expect(targets.get('answers')).toEqual([
      { lemma: 'answer', partOfSpeech: 'noun' },
      { lemma: 'answer', partOfSpeech: 'verb' },
    ])
    expect(targets.get('found')).toEqual([{ lemma: 'found', partOfSpeech: 'adjective' }])
  })

  test('uses the same source-aware forms for example matching as catalog output', () => {
    const targets = exampleTargetsBySurfaceForm(
      new Map([['chairman', new Set(['noun'])]]),
      new Map([['chairman\u0000noun', ['chairman', 'chairmen']]]),
    )

    expect(targets.get('chairmen')).toEqual([{ lemma: 'chairman', partOfSpeech: 'noun' }])
    expect(targets.has('chairmans')).toBe(false)
  })

  test('deduplicates repeated source sentences before accepting two inflected examples', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wordmaster-tatoeba-'))
    const path = join(directory, 'examples.txt.gz')
    try {
      await writeFile(path, gzipSync([
        'She answered the question.',
        'She answered the question.',
        'They answered very quickly.',
      ].join('\n')))

      const diagnostics = new Map()
      const result = await readTatoebaExamples(
        path,
        new Map([['answer', new Set(['verb'])]]),
        new Map(),
        diagnostics,
      )
      const examples = [...result.values()].flat()
      expect(new Set(examples.map(({ sentence }) => sentence))).toEqual(new Set([
        'She answered the question.',
        'They answered very quickly.',
      ]))
      expect(new Set(examples.map(({ sentence }) => sentence)).size).toBe(examples.length)
      expect(diagnostics.get('answer\u0000verb')).toMatchObject({
        rawCandidates: 2,
        matchedCandidates: 2,
        unmatchedSamples: [],
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('does not treat a hyphenated compound as a standalone headword example', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wordmaster-tatoeba-'))
    const path = join(directory, 'examples.txt.gz')
    try {
      await writeFile(path, gzipSync([
        'I have forty-eight years on my back.',
        'He is older than you by eight years.',
        'Eight students joined the reading club.',
      ].join('\n')))

      const result = await readTatoebaExamples(
        path,
        new Map([['eight', new Set(['numeral'])]]),
      )
      const sentences = result.get('eight\u0000numeral')?.map(({ sentence }) => sentence) ?? []

      expect(sentences).toEqual([
        'He is older than you by eight years.',
        'Eight students joined the reading club.',
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('retains base-form evidence when ambiguous inflections fill the bounded reservoir', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wordmaster-tatoeba-balance-'))
    const path = join(directory, 'examples.txt.gz')
    try {
      const ambiguousInflections = Array.from(
        { length: 110 },
        (_, index) => `The answers in test ${index} are correct.`,
      )
      await writeFile(path, gzipSync([
        ...ambiguousInflections,
        'I answer the first question.',
        'We answer the next question.',
      ].join('\n')))

      const result = await readTatoebaExamples(
        path,
        new Map([['answer', new Set(['verb'])]]),
      )
      const sentences = [...result.values()].flat().map(({ sentence }) => sentence)
      expect(sentences).toContain('I answer the first question.')
      expect(sentences).toContain('We answer the next question.')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('backfills valid POS evidence hidden behind a full wrong-POS reservoir', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wordmaster-tatoeba-recovery-'))
    const path = join(directory, 'examples.txt.gz')
    try {
      const wrongPartOfSpeech = Array.from(
        { length: 110 },
        (_, index) => `The answer for item ${index} is correct.`,
      )
      await writeFile(path, gzipSync([
        ...wrongPartOfSpeech,
        'During the long class discussion, we answer the difficult question together.',
        'After a thoughtful pause, they answer the difficult question together.',
      ].join('\n')))
      const diagnostics = new Map()
      const result = await readTatoebaExamples(
        path,
        new Map([['answer', new Set(['verb'])]]),
        new Map(),
        diagnostics,
      )
      const sentences = result.get('answer\u0000verb')?.map(({ sentence }) => sentence) ?? []

      expect(sentences).toEqual(expect.arrayContaining([
        'During the long class discussion, we answer the difficult question together.',
        'After a thoughtful pause, they answer the difficult question together.',
      ]))
      expect(diagnostics.get('answer\u0000verb')).toMatchObject({
        rawCandidates: 100,
        matchedCandidates: 0,
        recoveryMatched: 2,
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('keeps the learner catalog and source examples age-appropriate and concise', () => {
    expect(isBlockedCatalogLemma('cocaine')).toBe(true)
    expect(isBlockedCatalogLemma('am')).toBe(true)
    expect(isBlockedCatalogLemma('were')).toBe(true)
    expect(isBlockedCatalogLemma('running')).toBe(true)
    for (const lemma of ['bombed', 'bombings', 'guns', 'killed', 'murdered', 'raped', 'shoots', 'shots', 'stabbed']) {
      expect(isBlockedCatalogLemma(lemma), lemma).toBe(true)
    }
    expect(isBlockedCatalogLemma('assistance')).toBe(false)
    expect(isSuitableExample('The class finished its project on time.')).toBe(true)
    expect(isSuitableExample('The police found cocaine in his baggage.')).toBe(false)
    for (const sentence of [
      'I want you to strip naked and rail me.',
      'Drink wet cement and get really stoned.',
      'He was a stone-cold killer.',
      'Ziri staged the death of the baby.',
      'We pigged out on pizza and beer.',
      'Dick died when he was ten years old.',
      'They found drugs and Rohypnol in the bag.',
      'The bombing used guns and bullets.',
      'He was stabbed after the shooting.',
      'They carried dangerous weapons and rifles.',
      'Anti-intellectualism is often couched as criticism.',
      'I told him to tone down his gayness.',
    ]) expect(isSuitableExample(sentence), sentence).toBe(false)
    expect(isSuitableExample('We used a hoe in the garden.')).toBe(true)
    expect(isSuitableExample('The stars are hard to see with the naked eye.')).toBe(true)
    expect(isSuitableExample('We played a game to kill time.')).toBe(true)
    expect(isSuitableExample("Bye motherfuckers, it's time to fly!")).toBe(false)
    expect(isSuitableExample('Dan accused Linda of being a tranny.')).toBe(false)
    expect(isSuitableExample("I'm pretty sure my drink was drugged.")).toBe(false)
    expect(isSuitableExample(`This sentence is ${'far too long '.repeat(15)}.`)).toBe(false)
  })

  test('uses CEFR and sensitive-topic policy to keep early-childhood material concrete', () => {
    expect(minimumLearnerLevelForWord('apple', 'A1', ['사과'])).toBe('유치원')
    expect(minimumLearnerLevelForWord('business', 'A1', ['사업'])).toBe('초등학교')
    expect(minimumLearnerLevelForWord('wife', 'A1', ['아내'])).toBe('초등학교')
    expect(minimumLearnerLevelForWord('war', 'A1', ['전쟁'])).toBe('중학교')
    expect(minimumLearnerLevelForWord('flower', 'A2', ['꽃'])).toBe('초등학교')
    expect(minimumLearnerLevelForWord('simple', 'B1', ['단순한'])).toBe('초등학교')
    expect(minimumLearnerLevelForWord('artist', 'A1', ['예술가'])).toBe('유치원')
    expect(minimumLearnerLevelForWord('engineer', 'A1', ['기술자'])).toBe('유치원')
    expect(minimumLearnerLevelForWord('wine', 'A1', ['술'])).toBe('중학교')
    for (const [lemma, meaning] of [
      ['gay', '동성애자'],
      ['depression', '우울증'],
      ['guilty', '유죄인'],
      ['detention', '구금'],
      ['manslaughter', '과실치사'],
    ] as const) {
      expect(minimumLearnerLevelForWord(lemma, 'A1', [meaning]), lemma).toBe('중학교')
    }

    expect(isLearnerSafeExampleForLevel(
      'The class discussed the history of the war.',
      '기초',
    )).toBe(false)

    expect(isLearnerSafeExampleForLevel(
      'The small shop has a new business sign.',
      '유치원',
    )).toBe(false)
    expect(isLearnerSafeExampleForLevel(
      'The small shop has a new business sign.',
      '초등학교',
    )).toBe(true)
    expect(isLearnerSafeExampleForLevel(
      'The class discussed the history of the war.',
      '초등학교',
    )).toBe(false)
    expect(isLearnerSafeExampleForLevel(
      'The class discussed the history of the war.',
      '중학교',
    )).toBe(true)

    for (const sentence of [
      'Alex is gay and lives with his partner.',
      'Depression is a mental health condition.',
      'The court found him guilty.',
      'The judge ordered his detention.',
      'The charge was reduced to manslaughter.',
    ]) {
      expect(isLearnerSafeExampleForLevel(sentence, '초등학교'), sentence).toBe(false)
      expect(isLearnerSafeExampleForLevel(sentence, '중학교'), sentence).toBe(true)
    }
  })

  test('exhausts safe A1 before the deterministic A2 kindergarten fallback and rejects B1', () => {
    expect(KINDERGARTEN_SOURCE_FALLBACK_CEFR).toBe('A2')
    expect(kindergartenAllocationPhase('apple', 'A1', ['사과'])).toBe('primary-a1')
    expect(kindergartenAllocationPhase('flower', 'A2', ['꽃'])).toBe('fallback-a2')
    expect(kindergartenAllocationPhase('simple', 'B1', ['단순한'])).toBe('ineligible')
    expect(kindergartenAllocationPhase('business', 'A2', ['사업'])).toBe('ineligible')
    expect(kindergartenAllocationPhase('war', 'A2', ['전쟁'])).toBe('ineligible')
  })

  test('allows neutral identity language at the middle-school band but rejects hate and stigma globally', () => {
    expect(isSuitableExample('Alex is gay and lives with his partner.')).toBe(true)
    expect(isLearnerSafeExampleForLevel(
      'Alex is gay and lives with his partner.',
      '중학교',
    )).toBe(true)
    for (const sentence of [
      'I told him to tone down his gayness.',
      'Gay people are disgusting.',
      'People with depression are lazy.',
    ]) {
      expect(isSuitableExample(sentence), sentence).toBe(false)
      expect(isLearnerSafeExampleForLevel(sentence, '중학교'), sentence).toBe(false)
    }
  })
})
