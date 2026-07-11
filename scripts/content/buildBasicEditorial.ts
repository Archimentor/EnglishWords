import { readFile, writeFile } from 'node:fs/promises'

import type { StoryContent, WordEntry, WordItem } from '../../src/domain/content/types'
import { normalizeWord } from './normalize'

type WordKind = 'noun' | 'verb' | 'adjective'

interface BasicEditorialWord {
  lemma: string
  kind: WordKind
  meaning: string
  examples?: [string, string]
}

/**
 * Directly edited beginner vocabulary. These words are intentionally kept in
 * source control instead of being an opaque translation-service export.
 */
export const BASIC_EDITORIAL_WORDS: readonly BasicEditorialWord[] = [
  ['apple', 'noun', '사과'], ['baby', 'noun', '아기'], ['bag', 'noun', '가방'],
  ['ball', 'noun', '공'], ['bed', 'noun', '침대'], ['bird', 'noun', '새'],
  ['fish', 'noun', '물고기'], ['boy', 'noun', '소년'], ['bread', 'noun', '빵'],
  ['bus', 'noun', '버스'], ['cake', 'noun', '케이크'], ['car', 'noun', '자동차'],
  ['cat', 'noun', '고양이'], ['hat', 'noun', '모자'], ['child', 'noun', '아이'],
  ['city', 'noun', '도시'], ['class', 'noun', '수업'], ['clock', 'noun', '시계'],
  ['clothes', 'noun', '옷'], ['cup', 'noun', '컵'], ['day', 'noun', '날'],
  ['dog', 'noun', '개'], ['door', 'noun', '문'], ['egg', 'noun', '달걀'],
  ['family', 'noun', '가족'], ['flower', 'noun', '꽃'], ['ice', 'noun', '얼음'],
  ['game', 'noun', '게임'], ['girl', 'noun', '소녀'], ['hand', 'noun', '손'],
  ['house', 'noun', '집'], ['key', 'noun', '열쇠'], ['kitchen', 'noun', '부엌'],
  ['letter', 'noun', '편지'], ['milk', 'noun', '우유'], ['money', 'noun', '돈'],
  ['moon', 'noun', '달'], ['morning', 'noun', '아침'], ['name', 'noun', '이름'],
  ['night', 'noun', '밤'], ['parent', 'noun', '부모'], ['park', 'noun', '공원'],
  ['pen', 'noun', '펜'], ['picture', 'noun', '그림'], ['room', 'noun', '방'],
  ['king', 'noun', '왕'], ['shoe', 'noun', '신발'], ['sister', 'noun', '자매'],
  ['song', 'noun', '노래'], ['table', 'noun', '탁자'],
  ['be', 'verb', '이다', ['To be kind is good.', 'Be happy today.']],
  ['come', 'verb', '오다', ['Come here, please.', 'They come home after school.']],
  ['do', 'verb', '하다', ['I do my homework.', 'We do it together.']],
  ['drink', 'verb', '마시다', ['I drink water.', 'We drink milk.']],
  ['eat', 'verb', '먹다', ['I eat an apple.', 'We eat bread.']],
  ['find', 'verb', '찾다', ['I find my key.', 'We find the book.']],
  ['get', 'verb', '얻다', ['I get a gift.', 'We get on the bus.']],
  ['give', 'verb', '주다', ['I give Mom a flower.', 'We give help to friends.']],
  ['go', 'verb', '가다', ['I go home.', 'We go to school.']],
  ['have', 'verb', '가지다', ['I have a book.', 'We have a game.']],
  ['help', 'verb', '돕다', ['I help my friend.', 'We help Dad.']],
  ['know', 'verb', '알다', ['I know your name.', 'We know the answer.']],
  ['like', 'verb', '좋아하다', ['I like music.', 'We like games.']],
  ['look', 'verb', '보다', ['I look at the moon.', 'We look outside.']],
  ['make', 'verb', '만들다', ['I make a cake.', 'We make a picture.']],
  ['play', 'verb', '놀다', ['The children play outside.', 'We play a game together.']],
  ['read', 'verb', '읽다', ['I read a book.', 'We read together.']],
  ['run', 'verb', '달리다', ['I run in the park.', 'We run fast.']],
  ['see', 'verb', '보다', ['I see a bird.', 'We see the moon.']],
  ['sit', 'verb', '앉다', ['I sit on a chair.', 'We sit together.']],
  ['sleep', 'verb', '자다', ['I sleep at night.', 'Babies sleep.']],
  ['take', 'verb', '가지고 가다', ['I take a bus.', 'We take a picture.']],
  ['talk', 'verb', '말하다', ['I talk to my teacher.', 'We talk together.']],
  ['walk', 'verb', '걷다', ['I walk to school.', 'We walk in the park.']],
  ['write', 'verb', '쓰다', ['I write a letter.', 'We write our names.']],
  ['big', 'adjective', '큰'], ['black', 'adjective', '검은'], ['blue', 'adjective', '파란'],
  ['clean', 'adjective', '깨끗한'], ['cold', 'adjective', '차가운'], ['fast', 'adjective', '빠른'],
  ['good', 'adjective', '좋은'], ['juice', 'noun', '주스'],
  ['happy', 'adjective', '행복한', ['I am happy today.', 'The happy child smiles.']],
  ['hot', 'adjective', '뜨거운'], ['little', 'adjective', '작은'], ['long', 'adjective', '긴'],
  ['new', 'adjective', '새로운'], ['old', 'adjective', '오래된'], ['red', 'adjective', '빨간'],
  ['sad', 'adjective', '슬픈'], ['short', 'adjective', '짧은'], ['small', 'adjective', '작은'],
  ['strong', 'adjective', '강한'], ['tall', 'adjective', '키가 큰'],
  ['tired', 'adjective', '피곤한', ['I am tired today.', 'We feel tired after the game.']],
  ['warm', 'adjective', '따뜻한'], ['white', 'adjective', '하얀'],
  ['yellow', 'adjective', '노란'], ['young', 'adjective', '어린'],
].map(([lemma, kind, meaning, examples]) => ({ lemma, kind, meaning, examples })) as readonly BasicEditorialWord[]

const IRREGULAR_NOUN_FORMS: Readonly<Record<string, string[]>> = {
  child: ['child', 'children'],
  clothes: ['clothes'],
  bread: ['bread'],
  milk: ['milk'],
  money: ['money'],
}

const VERB_FORMS: Readonly<Record<string, Record<string, string>>> = {
  be: { base: 'be', s3: 'is', past: 'was', participle: 'being', pastParticiple: 'been' },
  come: { base: 'come', s3: 'comes', past: 'came', participle: 'coming', pastParticiple: 'come' },
  do: { base: 'do', s3: 'does', past: 'did', participle: 'doing', pastParticiple: 'done' },
  drink: { base: 'drink', s3: 'drinks', past: 'drank', participle: 'drinking', pastParticiple: 'drunk' },
  eat: { base: 'eat', s3: 'eats', past: 'ate', participle: 'eating', pastParticiple: 'eaten' },
  find: { base: 'find', s3: 'finds', past: 'found', participle: 'finding', pastParticiple: 'found' },
  get: { base: 'get', s3: 'gets', past: 'got', participle: 'getting', pastParticiple: 'got' },
  give: { base: 'give', s3: 'gives', past: 'gave', participle: 'giving', pastParticiple: 'given' },
  go: { base: 'go', s3: 'goes', past: 'went', participle: 'going', pastParticiple: 'gone' },
  have: { base: 'have', s3: 'has', past: 'had', participle: 'having', pastParticiple: 'had' },
  help: { base: 'help', s3: 'helps', past: 'helped', participle: 'helping', pastParticiple: 'helped' },
  know: { base: 'know', s3: 'knows', past: 'knew', participle: 'knowing', pastParticiple: 'known' },
  like: { base: 'like', s3: 'likes', past: 'liked', participle: 'liking', pastParticiple: 'liked' },
  look: { base: 'look', s3: 'looks', past: 'looked', participle: 'looking', pastParticiple: 'looked' },
  make: { base: 'make', s3: 'makes', past: 'made', participle: 'making', pastParticiple: 'made' },
  play: { base: 'play', s3: 'plays', past: 'played', participle: 'playing', pastParticiple: 'played' },
  read: { base: 'read', s3: 'reads', past: 'read', participle: 'reading', pastParticiple: 'read' },
  run: { base: 'run', s3: 'runs', past: 'ran', participle: 'running', pastParticiple: 'run' },
  see: { base: 'see', s3: 'sees', past: 'saw', participle: 'seeing', pastParticiple: 'seen' },
  sit: { base: 'sit', s3: 'sits', past: 'sat', participle: 'sitting', pastParticiple: 'sat' },
  sleep: { base: 'sleep', s3: 'sleeps', past: 'slept', participle: 'sleeping', pastParticiple: 'slept' },
  take: { base: 'take', s3: 'takes', past: 'took', participle: 'taking', pastParticiple: 'taken' },
  talk: { base: 'talk', s3: 'talks', past: 'talked', participle: 'talking', pastParticiple: 'talked' },
  walk: { base: 'walk', s3: 'walks', past: 'walked', participle: 'walking', pastParticiple: 'walked' },
  write: { base: 'write', s3: 'writes', past: 'wrote', participle: 'writing', pastParticiple: 'written' },
}

/** A directly reviewed IPA correction for the one selected lemma absent upstream. */
const EDITORIAL_IPA: Readonly<Record<string, string>> = {
  clothes: '/kloʊðz/',
}

function plural(lemma: string): string {
  if (/(s|x|ch|sh)$/.test(lemma)) return `${lemma}es`
  if (/[^aeiou]y$/.test(lemma)) return `${lemma.slice(0, -1)}ies`
  return `${lemma}s`
}

function adjectiveForms(lemma: string): string[] {
  const irregular: Readonly<Record<string, string[]>> = {
    good: ['good', 'better', 'best'],
    little: ['little', 'less', 'least'],
  }
  if (irregular[lemma]) return irregular[lemma]
  if (lemma.endsWith('y')) return [lemma, `${lemma.slice(0, -1)}ier`, `${lemma.slice(0, -1)}iest`]
  return [lemma, `${lemma}er`, `${lemma}est`]
}

function examplesFor(word: BasicEditorialWord): [string, string] {
  if (word.examples) return word.examples
  if (word.kind === 'noun') {
    if (word.lemma === 'clothes') return ['My clothes are clean.', 'These clothes are new.']
    if (word.lemma === 'bread') return ['Bread is warm.', 'We eat bread together.']
    if (word.lemma === 'milk') return ['Milk is in the cup.', 'I drink milk every day.']
    if (word.lemma === 'money') return ['Money is in my bag.', 'I save my money.']
    return [`The ${word.lemma} is here.`, `I like this ${word.lemma}.`]
  }
  return [`The ball is ${word.lemma}.`, `It looks ${word.lemma}.`]
}

function formsFor(word: BasicEditorialWord): string[] | Record<string, string> {
  if (word.kind === 'verb') return VERB_FORMS[word.lemma]!
  if (word.kind === 'adjective') return adjectiveForms(word.lemma)
  return IRREGULAR_NOUN_FORMS[word.lemma] ?? [word.lemma, plural(word.lemma)]
}

export function buildBasicEditorialWords(ipaByLemma: ReadonlyMap<string, string>): WordItem[] {
  return BASIC_EDITORIAL_WORDS.map((word, rank) => {
    const ipa = ipaByLemma.get(word.lemma) ?? EDITORIAL_IPA[word.lemma]
    if (!ipa) throw new Error(`Missing pinned IPA for ${word.lemma}`)
    return normalizeWord({
      lemma: word.lemma,
      levelBucket: '기초',
      rank,
      partOfSpeech: word.kind,
      meanings: [word.meaning],
      ipa,
      forms: formsFor(word),
      examples: examplesFor(word),
    })
  })
}

function entryForms(entry: WordEntry): string[] {
  return Array.isArray(entry.forms) ? entry.forms : Object.values(entry.forms)
}

/** Builds an authored beginner reading passage from the directly reviewed examples. */
export function buildBasicEditorialStory(words: readonly WordItem[]): StoryContent {
  const readingLines = ['To be kind is good.', ...words.map((word) => word.entries[0]!.examples[0]!)]
  return {
    schemaVersion: '1.0.0',
    level: '기초',
    title: '작은 것들로 시작한 하루',
    isManual: true,
    coverage: {
      mustCoverAll: true,
      allowUpperLevelWords: false,
      coverageRate: 1,
    },
    usedWords: words.map((word) => ({
      lemma: word.lemma,
      partOfSpeech: word.entries[0]!.partOfSpeech,
      forms: entryForms(word.entries[0]!),
    })),
    storyText: readingLines.join(' '),
  }
}

export function parseIpaDictionary(source: string): Map<string, string> {
  const entries = source.split(/\r?\n/).flatMap((line) => {
    const [lemma, values] = line.split('\t')
    const ipa = values?.match(/\/[^/]+\//)?.[0]
    return lemma && ipa ? [[lemma.toLowerCase(), ipa] as const] : []
  })
  return new Map(entries)
}

export async function readIpaDictionary(path: string): Promise<Map<string, string>> {
  return parseIpaDictionary(await readFile(path, 'utf8'))
}

async function main(): Promise<void> {
  const ipa = await readIpaDictionary('.content-cache/ipa-dict-en_US.txt')
  await writeFile(
    'public/data/wordlists/기초.json',
    `${JSON.stringify(buildBasicEditorialWords(ipa), null, 2)}\n`,
  )
  await writeFile(
    'public/data/stories/기초.json',
    `${JSON.stringify(buildBasicEditorialStory(buildBasicEditorialWords(ipa)), null, 2)}\n`,
  )
}

if (process.argv[1]?.endsWith('buildBasicEditorial.ts')) {
  await main()
}
