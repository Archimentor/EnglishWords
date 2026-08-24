import { buildReaderStoryText, readerStoryCoverage } from './readerStory'
import type { PhrasalVerbItem, WordItem } from './types'

function word(
  id: string,
  lemma: string,
  partOfSpeech: string,
  examples: string[],
): WordItem {
  return {
    id,
    word: lemma,
    lemma,
    level: '기초',
    familyId: `${id}-family`,
    isFamilyHead: true,
    difficulty: 'veryEasy',
    entries: [{
      partOfSpeech,
      forms: [lemma],
      meanings: ['테스트'],
      ipa: '/test/',
      examples,
    }],
  }
}

function phrasal(
  id: string,
  phrasalVerb: string,
  examples: string[],
): PhrasalVerbItem {
  const [baseVerb, ...particles] = phrasalVerb.split(' ')
  return {
    id,
    baseVerb: baseVerb!,
    particle: particles.join(' '),
    phrasalVerb,
    ipa: '/test/',
    levelHint: '기초',
    meaningKo: ['테스트'],
    examples,
    partOfSpeech: 'phrasalVerb',
    usageNotes: '',
    difficulty: 'veryEasy',
  }
}

test('실제 표시 본문에 누락 단어와 구동사를 자연스러운 원천 예문으로 보충하고 완결 문단을 보존한다', () => {
  const words = [
    word('ball', 'ball', 'noun', ['The red ball is near the tree.']),
    word('lantern', 'lantern', 'noun', ['A lantern shines beside the gate.']),
  ]
  const phrasals = [
    phrasal('look-after', 'look after', ['We look after the little bird together.']),
  ]
  const base = 'Mina has a red ball.\n\nShe follows a small map.\n\nMina smiles at home.'

  const text = buildReaderStoryText(base, '기초', words, phrasals)
  const coverage = readerStoryCoverage(text, words, phrasals)

  expect(text).toContain('A lantern shines beside the gate.')
  expect(text).toContain('We look after the little bird together.')
  expect(text).toMatch(/^Mina has a red ball\./u)
  expect(text).toMatch(/Mina smiles at home\.$/u)
  expect(text).not.toMatch(/\b(?:Trail step|Story page|Garden record|Archive file)\s+\d+\s*:/iu)
  expect(coverage.missingWordIds).toEqual([])
  expect(coverage.missingPhrasalVerbIds).toEqual([])
})

test('저학년에서 위험한 원천 예문은 그대로 삽입하지 않고 안전한 직접 문장을 사용한다', () => {
  const words = [
    word('garden', 'garden', 'noun', ['The garden is open today.']),
    word('signal', 'signal', 'noun', ['The army followed the signal during the war.']),
  ]
  const base = 'Mina walks in the garden.\n\nShe finds a note.\n\nMina goes home.'

  const text = buildReaderStoryText(base, '기초', words, [])
  const coverage = readerStoryCoverage(text, words, [])

  expect(text).toContain('signal')
  expect(text).not.toMatch(/\barmy\b|\bwar\b/iu)
  expect(text).not.toMatch(/[“”]\s*signal\s*[“”]/iu)
  expect(coverage.missingWordIds).toEqual([])
})

test('위험한 원천 예문이 여러 개여도 메타 학습문장 대신 장면 안의 직접 문장으로 분산한다', () => {
  const words = [
    word('signal-a', 'signal', 'noun', ['The army followed the signal during the war.']),
    word('marker-a', 'marker', 'noun', ['The army carried the marker during the war.']),
    word('token-a', 'token', 'noun', ['The army found the token during the war.']),
    word('symbol-a', 'symbol', 'noun', ['The army copied the symbol during the war.']),
  ]
  const base = 'Mina starts with a map.\n\nShe follows the path.\n\nMina arrives home.'

  const text = buildReaderStoryText(base, '기초', words, [])
  const metaSentences = text.match(/[^.!?]+[.!?]+/gu)?.filter((sentence) =>
    /[“”]/u.test(sentence)
    && /\b(?:word|sentence|page|card|label|expression|record|note)\b/iu.test(sentence)) ?? []

  expect(metaSentences).toEqual([])
  expect(text).not.toMatch(/\barmy\b|\bwar\b/iu)
  expect(readerStoryCoverage(text, words, []).missingWordIds).toEqual([])
})

test('삽입 장면은 고정 프레임 대신 앞뒤 사건의 위치를 연결한다', () => {
  const words = [
    word('lantern', 'lantern', 'noun', ['A lantern shines beside the gate.']),
  ]
  const base = [
    'Mina leaves the bakery and walks toward the river.',
    'At the bridge, the little bird finds a blue feather.',
    'Mina reaches the old house before sunset.',
  ].join('\n\n')

  const text = buildReaderStoryText(base, '기초', words, [])
  const lanternParagraph = text.split(/\n\s*\n/u).find((paragraph) => paragraph.includes('lantern')) ?? ''

  expect(lanternParagraph).toContain('A lantern shines beside the gate.')
  expect(lanternParagraph).toMatch(/(?:bakery|river|bridge|old house)/u)
  expect(text).not.toMatch(/Before Mina leaves the place|A little farther on, Mina finds a folded paper/u)
  expect(text).not.toMatch(/with “[A-Za-z]+” still in mind/u)
})
