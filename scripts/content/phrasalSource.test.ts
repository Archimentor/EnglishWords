import { gzipSync } from 'node:zlib'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  PINNED_PHRASAL_ALIGNMENTS,
  PINNED_PHRASAL_RECOVERY,
  PHRASAL_SOURCE_EXCLUSIONS,
  containsPhrasalBase,
  containsPhrasalUse,
  isSafePhrasalContent,
  isSuitablePhrasalExample,
  readPinnedPhrasalRecovery,
  selectPhrasalSources,
} from './phrasalSource'
import { MACHINE_ASSISTED_SAME_AS_GLOSSES } from './phrasalGlossOverrides'

function sourceFixture(count = 8) {
  const verbs = ['wake', 'look', 'turn', 'carry', 'bring', 'pick', 'set', 'hold'].slice(0, count)
  const rawSource = Object.fromEntries(Array.from({ length: count }, (_, index) => {
    const phrase = `${verbs[index]} up`
    return [phrase, {
      descriptions: [`to perform ${phrase}`],
      examples: [`We can ${phrase} together.`, `They will ${phrase} tomorrow.`],
      frequency: count - index,
    }]
  }))
  const ipaSource = [
    ...verbs.map((verb, index) => `${verb}\t/v${index}/`),
    'up\t/ʌp/',
  ].join('\n')
  const frequencySource = [
    'Rank,Word,Part of speech,Frequency,Dispersion',
    ...verbs.map((verb, index) => `${index + 1},${verb},v,1,1`),
  ].join('\n')
  const cefrSource = [
    'headword,pos,CEFR,CoreInventory 1,CoreInventory 2,Threshold',
    ...verbs.map((verb) => `${verb},verb,A1,,,`),
  ].join('\n')
  return { rawSource, ipaSource, frequencySource, cefrSource }
}

test('selects complete two-word phrases with unique examples and equal level slices', () => {
  const { rawSource, ipaSource, frequencySource, cefrSource } = sourceFixture()

  const selected = selectPhrasalSources({
    rawSource, ipaSource, frequencySource, cefrSource, count: 8,
  })
  expect(selected.map(({ level }) => level)).toEqual([
    '기초', '기초', '유치원', '유치원', '초등학교', '초등학교', '중학교', '중학교',
  ])
  expect(new Set(selected.flatMap(({ examples }) => examples))).toHaveLength(16)
  expect(selected[0]).toMatchObject({ phrase: 'wake up', ipa: '/v0 ʌp/' })
})

test('recognizes contiguous and limited separable phrasal uses', () => {
  expect(containsPhrasalBase('Please wake up now.', 'wake up')).toBe(true)
  expect(containsPhrasalBase('Another cup of coffee will wake me up.', 'wake up')).toBe(true)
  expect(containsPhrasalBase('It takes a crisis to wake people right back up.', 'wake up')).toBe(true)
  expect(containsPhrasalBase('They wake the whole entire tired team up.', 'wake up')).toBe(false)
  expect(containsPhrasalBase('They stayed awake all night.', 'wake up')).toBe(false)
  expect(containsPhrasalUse('Since they would not share, I was shelling out for two rooms.', 'shell out'))
    .toBe(true)
  expect(containsPhrasalUse('She took the whiskey bottle out of my hand.', 'bottle out'))
    .toBe(false)
  expect(containsPhrasalUse('He blew the smoke out of the window.', 'smoke out')).toBe(false)
  expect(containsPhrasalUse('He took the cigarette butt out of his mouth.', 'butt out')).toBe(false)
  expect(containsPhrasalUse('She did not want to come at all.', 'come at')).toBe(false)
  expect(containsPhrasalUse('My lungs heave to take in the air.', 'heave to')).toBe(false)
  expect(containsPhrasalUse('We get about 30 million visitors each year.', 'get about')).toBe(false)
  expect(containsPhrasalUse('The city changed over time.', 'change over')).toBe(false)
  expect(containsPhrasalUse('The studio made over 400 copies.', 'make over')).toBe(false)
  expect(containsPhrasalUse('There was a key in the lock.', 'key in')).toBe(false)
  expect(containsPhrasalUse('He waved a long stick at me.', 'stick at')).toBe(false)
  expect(containsPhrasalUse('It is cool down here.', 'cool down')).toBe(false)
  expect(containsPhrasalUse('I lose sleep over the decision.', 'sleep over')).toBe(false)
  expect(containsPhrasalUse('She lay on her back.', 'lay on')).toBe(false)
  expect(containsPhrasalUse('The firm will hire out of the local college.', 'hire out')).toBe(false)
  expect(containsPhrasalUse('You need a car to get about here.', 'get about')).toBe(true)
  expect(containsPhrasalUse('We changed over to a new system.', 'change over')).toBe(true)
  expect(containsPhrasalUse('Please key the details in carefully.', 'key in')).toBe(true)
  expect(containsPhrasalUse('Stick at the task until it is done.', 'stick at')).toBe(true)
  expect(containsPhrasalUse('Please cool down and think clearly.', 'cool down')).toBe(true)
  expect(containsPhrasalUse('Can I sleep over tonight?', 'sleep over')).toBe(true)
  expect(containsPhrasalUse('They laid on extra buses.', 'lay on')).toBe(true)
  expect(containsPhrasalUse('He said it’ll all come out in court.', 'come out')).toBe(true)
  expect(containsPhrasalUse('They set to work after lunch.', 'set to')).toBe(true)
})

test('reserves required phrases before frequency truncation', () => {
  const fixture = sourceFixture()
  const selected = selectPhrasalSources({
    ...fixture,
    count: 4,
    requiredPhrases: ['hold up'],
  })

  expect(selected.map(({ phrase }) => phrase)).toEqual([
    'hold up', 'wake up', 'look up', 'turn up',
  ])
  expect(selected.map(({ level }) => level)).toEqual([
    '기초', '유치원', '초등학교', '중학교',
  ])
  expect(new Set(selected.flatMap(({ examples }) => examples))).toHaveLength(8)
})

test('accepts a source pair made entirely from verified inflected phrasal uses', () => {
  const fixture = sourceFixture(1)
  fixture.rawSource['wake up'] = {
    descriptions: ['to stop sleeping'],
    examples: ['She wakes up before class.', 'They woke up early yesterday.'],
    frequency: 1,
  }

  expect(selectPhrasalSources({ ...fixture, count: 1 })[0]).toMatchObject({
    phrase: 'wake up',
    examples: ['She wakes up before class.', 'They woke up early yesterday.'],
  })
})

test('pins the common social sense of hang out through preparation and translation overrides', () => {
  const examples = [
    'Tom and his friends often hang out at the park together.',
    'Tom and his friends often hang out together after school.',
  ]
  expect(PINNED_PHRASAL_ALIGNMENTS['hang out']).toEqual({
    englishDescription: 'same as hang',
    examples,
  })
  expect(PINNED_PHRASAL_RECOVERY.filter(({ phrase }) => phrase === 'hang out'))
    .toEqual([
      { phrase: 'hang out', line: 15_947, sentence: examples[0] },
      { phrase: 'hang out', line: 64_244, sentence: examples[1] },
    ])
  expect(MACHINE_ASSISTED_SAME_AS_GLOSSES['hang out']).toEqual({
    englishDescription: 'same as hang',
    meaningKo: '친구들과 어울려 시간을 보내다',
  })
})

test('rejects explicit phrasal phrases and learner-inappropriate source examples', () => {
  expect(isSafePhrasalContent('carry out the plan')).toBe(true)
  expect(isSafePhrasalContent('a sexual relationship')).toBe(false)
  expect(isSafePhrasalContent('the murder was hidden')).toBe(false)
  expect(isSafePhrasalContent('the gun went off')).toBe(false)
  expect(isSafePhrasalContent('she was pregnant')).toBe(false)
  expect(isSafePhrasalContent('he got drunk')).toBe(false)
  expect(isSafePhrasalContent('he drank beer and whisky')).toBe(false)
  expect(isSafePhrasalContent('she lit a cigarette')).toBe(false)
  expect(isSafePhrasalContent('he repeated that bullshit')).toBe(false)
  expect(isSafePhrasalContent('a hangover after scotch')).toBe(false)
  expect(isSafePhrasalContent('the story mentioned drugs')).toBe(false)
  expect(isSafePhrasalContent('her backside was sore')).toBe(false)
  expect(isSafePhrasalContent('she was wearing a bra')).toBe(false)
  expect(isSafePhrasalContent('he felt he was suffocating')).toBe(false)
  expect(isSafePhrasalContent('they went through hell')).toBe(false)
  expect(isSafePhrasalContent('the speech stirred up racial hatred')).toBe(false)
  expect(isSafePhrasalContent('the sentence used a tranny slur')).toBe(false)
  expect(isSafePhrasalContent('the claim promoted racism and homophobia')).toBe(false)
  expect(isSafePhrasalContent('a debate about abortion')).toBe(false)
  expect(isSafePhrasalContent('anti-intellectualism and elitism')).toBe(false)
  expect(isSafePhrasalContent('to make a fire stop burning by putting your feet down hard on it'))
    .toBe(true)
  expect(isSafePhrasalContent('the child was badly burned')).toBe(false)
  for (const unsafeExample of [
    'I could get by real easy without any of that bullshit breaking out here.',
    "She wasn't wearing a bra, but she did not expect to run into anyone who would care.",
    'Heike lay on her back with beads of moisture between her breasts.',
    'He bends to switch on the machine, the seat of his shorts stretching to frame his slim backside.',
    'As the scotch took hold of my brain and I started to nod off I fell into a dream.',
    'He was flying at midnight so he had to sleep off his hangover this afternoon.',
    'He went to the beach to try to walk off his hangover.',
    'Drugs really messed her up.',
    'He spent years trying to straighten out his drug-addict brother.',
    'A lot of the kids had been messing with drugs.',
    'Over one billion pounds of research money is poured into finding drugs that will wipe out the invader.',
    "What the hell's going to happen to her when you leave out of here because I imagine that's what you aim to do.",
    'He has been put through hell by this.',
    'She felt like she was suffocating inside her own life; as if it were one of those plastic bags dry-cleaners use to put over clothes.',
  ]) {
    expect(isSuitablePhrasalExample(unsafeExample), unsafeExample).toBe(false)
  }
  expect(isSuitablePhrasalExample('They carry out the plan together.')).toBe(true)
  expect(isSuitablePhrasalExample(`They carry out ${'a very long plan '.repeat(12)}.`)).toBe(false)
})

test('adds exact checksummed Tatoeba recovery records and fails closed on drift', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wordmaster-phrasal-recovery-'))
  const path = join(directory, 'examples.txt.gz')
  const records = [
    { phrase: 'talk round', line: 1, sentence: "I'll try to talk him round." },
    { phrase: 'see around', line: 3, sentence: "I haven't seen her around here." },
  ]
  try {
    await writeFile(path, gzipSync([
      records[0]!.sentence,
      'This line is intentionally ignored.',
      records[1]!.sentence,
    ].join('\n')))
    await expect(readPinnedPhrasalRecovery(path, records)).resolves.toEqual(new Map([
      ['talk round', [records[0]!.sentence]],
      ['see around', [records[1]!.sentence]],
    ]))

    await expect(readPinnedPhrasalRecovery(path, [{
      ...records[0]!, sentence: 'The source line changed.',
    }])).rejects.toThrow('mismatch at line 1')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('recovers a same-sense pair while excluding reviewed mixed-sense records', () => {
  expect([...PHRASAL_SOURCE_EXCLUSIONS]).toEqual([
    'button up', 'change over', 'choke down', 'chuck out', 'come at', 'come into',
    'dig into', 'double over', 'draw off', 'drink in', 'dust down', 'face down',
    'fight off', 'flare up', 'foul up', 'get after', 'go at', 'heat up', 'hire out',
    'hook into', 'jump on', 'lead with', 'mount up', 'order up', 'pack away',
    'pack in', 'play off', 'plunge in', 'press on', 'put about',
    'run in', 'run up', 'separate out', 'shake down', 'sign on', 'sit on',
    'stake out', 'talk down', 'tease out', 'tie down', 'toss out', 'whip into',
  ])
  const fixture = sourceFixture(3)
  const rawSource = {
    ...fixture.rawSource,
    'talk round': {
      descriptions: ['to succeed in persuading someone to agree to something'],
      examples: ['I can talk her round.', 'We had a talk round the table.'],
      frequency: 99,
    },
  }
  const ipaSource = `${fixture.ipaSource}\ntalk\t/tɔːk/\nround\t/raʊnd/`
  const frequencySource = `${fixture.frequencySource}\n99,talk,v,1,1`
  const cefrSource = `${fixture.cefrSource}\ntalk,verb,A2,, ,`

  expect(() => selectPhrasalSources({
    rawSource, ipaSource, frequencySource, cefrSource, count: 4,
  })).toThrow('found 3')

  const selected = selectPhrasalSources({
    rawSource,
    ipaSource,
    frequencySource,
    cefrSource,
    count: 4,
    recoveryExamples: new Map([['talk round', ["I'll try to talk him round."]]]),
  })
  expect(selected.find(({ phrase }) => phrase === 'talk round')?.examples).toEqual([
    'I can talk her round.',
    "I'll try to talk him round.",
  ])
})
