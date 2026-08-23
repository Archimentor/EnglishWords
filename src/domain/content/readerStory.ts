import { entryFormStrings, hasWholeWordForm } from './storyForms'
import type { Level, PhrasalVerbItem, WordItem } from './types'

export interface ReaderStoryCoverage {
  wordCoveredCount: number
  wordTotalCount: number
  phrasalVerbCoveredCount: number
  phrasalVerbTotalCount: number
  missingWordIds: string[]
  missingWordLemmas: string[]
  missingPhrasalVerbIds: string[]
  missingPhrasalVerbs: string[]
}

interface TextLookup {
  text: string
  tokens: ReadonlySet<string>
}

interface WordExampleCandidate {
  text: string
  wordIds: Set<string>
}

const SCENE_SENTENCE_LIMIT: Readonly<Record<Level, number>> = {
  기초: 8,
  유치원: 8,
  초등학교: 10,
  중학교: 12,
}

const LOW_LEVEL_UNSAFE: Readonly<Record<Level, RegExp | null>> = {
  기초: /\b(?:abortion|adultery|alcohol|army|arson|assange|bible|brothel|company|court|crime|death|dildo|election|execution|executioner|fraud|god|government|gun|jail|jewish|murder|muslim|parliament|pistol|poison|porn|prison|professional|prostitute|quran|religion|rifle|riot|semen|sex|shotgun|slavery|sperm|suicide|terror|terrorism|war|weapon)\b/iu,
  유치원: /\b(?:abortion|adultery|army|arson|assange|bible|brothel|court|dildo|execution|executioner|fraud|god|government|gun|jail|jewish|murder|muslim|parliament|pistol|poison|porn|prison|professional|prostitute|quran|religion|rifle|riot|semen|sex|shotgun|sperm|suicide|terror|terrorism|weapon)\b/iu,
  초등학교: /\b(?:abortion|adultery|brothel|dildo|executioner|porn|prostitute|semen|sperm|suicide)\b/iu,
  중학교: null,
}

const STORY_FRAMES: Readonly<Record<Level, readonly [string, string][]>> = {
  기초: [
    ['Mina and the blue bird follow another mark on the map', 'Mina checks the clue and keeps moving with the bird'],
    ['Mina finds a new note beside the path and reads it carefully', 'The note helps Mina choose the next turn'],
    ['Mina finds a little page that someone left near the next mark', 'Mina puts the page in her bag and follows the red line again'],
    ['The bird chirps when Mina stops at another clue', 'Mina understands the clue and the two friends move on'],
  ],
  유치원: [
    ['The storybook turns a new page while Mina, Joon, and Sara lean closer', 'The picture glows softly as the friends prepare for the next page'],
    ['A small golden light runs across the paper and another little story appears', 'Mina smiles when the light points toward the next page'],
    ['The book shows the friends another memory from long ago', 'The three friends talk about the memory before the book changes again'],
    ['A new picture grows across the white page while the friends read every line', 'One more star shines when the friends finish the page'],
  ],
  초등학교: [
    ['Mina finds another bundle connected to the four letters, and Joon and Sara help her open it carefully', 'The friends record what they learned and return to the next clue'],
    ['Mina opens a folder of memories from people who once used the garden while Sara checks the dates', 'Joon marks the useful details on their map before the search continues'],
    ['Mina discovers notes behind an old photograph that explain another part of the garden’s history', 'The new evidence makes the earlier clue clearer for the three friends'],
    ['The friends sit under the tree with a small box of records from past visitors', 'Mina connects the final page in the box to their next stop'],
  ],
  중학교: [
    ['Mina reads another set of Riverside records beside the timeline instead of relying on the shortened public summary', 'She separates observation from opinion before returning to the main investigation'],
    ['Mina opens another file box and reads its accounts in chronological order rather than assuming that every witness agrees', 'She notes which points can be checked against independent evidence'],
    ['The archive index leads Mina to another packet of letters, reports, and interview notes that add missing context', 'Mina records the source of every claim before connecting the packet to the larger timeline'],
    ['During the supervised review, Mina opens a folder that earlier summaries had reduced to a single line', 'She keeps the conflicting accounts side by side so the final report will preserve uncertainty'],
  ],
}

const SCENE_LABEL: Readonly<Record<Level, string>> = {
  기초: 'Trail step',
  유치원: 'Story page',
  초등학교: 'Garden record',
  중학교: 'Archive file',
}

const READER_META_TOKENS = new Set([
  'mina', 'joon', 'sara', 'mr', 'mrs', 'han', 'park', 'lee', 'choi',
  "i'm", "you're", "he's", "she's", "it's", "we're", "they're",
  "don't", "doesn't", "didn't", "can't", "couldn't", "won't", "wouldn't",
  "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't",
  "let's", "there's", "that's", "what's", "who's",
])

function wordForms(word: WordItem): string[] {
  return [...new Set(word.entries.flatMap((entry) => entryFormStrings(entry)))]
    .filter((form) => form.trim().length > 0)
}

function storyTokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’~-][\p{L}\p{N}]+)*/gu) ?? [],
  )
}

function makeLookup(text: string): TextLookup {
  return { text, tokens: storyTokens(text) }
}

function isSimpleForm(form: string): boolean {
  return /^[\p{L}\p{N}]+(?:['’~-][\p{L}\p{N}]+)*$/u.test(form)
}

function lookupContainsForm(lookup: TextLookup, form: string): boolean {
  const normalized = form.toLowerCase()
  return isSimpleForm(normalized)
    ? lookup.tokens.has(normalized)
    : hasWholeWordForm(lookup.text, form)
}

function wordAppears(lookup: TextLookup, word: WordItem): boolean {
  return wordForms(word).some((form) => lookupContainsForm(lookup, form))
}

function phrasalVerbAppears(lookup: TextLookup, item: PhrasalVerbItem): boolean {
  return lookupContainsForm(lookup, item.phrasalVerb)
}

export function readerStoryCoverage(
  text: string,
  words: readonly WordItem[],
  phrasalVerbs: readonly PhrasalVerbItem[],
): ReaderStoryCoverage {
  const lookup = makeLookup(text)
  const missingWords = words.filter((word) => !wordAppears(lookup, word))
  const missingPhrasalVerbs = phrasalVerbs.filter((item) =>
    !phrasalVerbAppears(lookup, item))

  return {
    wordCoveredCount: words.length - missingWords.length,
    wordTotalCount: words.length,
    phrasalVerbCoveredCount: phrasalVerbs.length - missingPhrasalVerbs.length,
    phrasalVerbTotalCount: phrasalVerbs.length,
    missingWordIds: missingWords.map(({ id }) => id),
    missingWordLemmas: missingWords.map(({ lemma }) => lemma),
    missingPhrasalVerbIds: missingPhrasalVerbs.map(({ id }) => id),
    missingPhrasalVerbs: missingPhrasalVerbs.map(({ phrasalVerb }) => phrasalVerb),
  }
}

function isSafeExample(level: Level, example: string): boolean {
  const blocked = LOW_LEVEL_UNSAFE[level]
  return blocked === null || !blocked.test(example)
}

function allowedExampleTokens(words: readonly WordItem[]): Set<string> {
  const allowed = new Set(READER_META_TOKENS)
  for (const word of words) {
    for (const form of wordForms(word)) {
      for (const token of storyTokens(form)) allowed.add(token)
    }
  }
  return allowed
}

function isLexicallyAllowedExample(
  example: string,
  allowedTokens: ReadonlySet<string>,
): boolean {
  for (const token of storyTokens(example)) {
    if (/^\d+$/u.test(token) || allowedTokens.has(token)) continue
    return false
  }
  return true
}

function isUsableExample(
  level: Level,
  example: string,
  allowedTokens: ReadonlySet<string>,
): boolean {
  return isSafeExample(level, example) && isLexicallyAllowedExample(example, allowedTokens)
}

function exampleScore(example: string, level: Level): number {
  const wordCount = example.match(/[A-Za-z]+(?:['’~-][A-Za-z]+)*/gu)?.length ?? 0
  const sentencePenalty = Math.max(0, wordCount - ({
    기초: 10,
    유치원: 13,
    초등학교: 20,
    중학교: 28,
  } as const)[level])
  return wordCount + sentencePenalty * 3
}

function bestPhrasalExample(
  item: PhrasalVerbItem,
  level: Level,
  allowedTokens: ReadonlySet<string>,
): string | null {
  const exact = item.examples
    .filter((example) => hasWholeWordForm(example, item.phrasalVerb))
    .filter((example) => isUsableExample(level, example, allowedTokens))
    .sort((left, right) => exampleScore(left, level) - exampleScore(right, level))
  if (exact.length > 0) return exact[0]!

  const safe = item.examples
    .filter((example) => isUsableExample(level, example, allowedTokens))
    .sort((left, right) => exampleScore(left, level) - exampleScore(right, level))
  return safe[0] ?? null
}

function preferredWordForm(word: WordItem): string {
  const forms = wordForms(word)
  const exactLemma = forms.find((form) => form.toLowerCase() === word.lemma.toLowerCase())
  if (exactLemma) return exactLemma
  const exactWord = forms.find((form) => form.toLowerCase() === word.word.toLowerCase())
  return exactWord ?? forms[0] ?? word.lemma
}

function fallbackWordSentence(word: WordItem, level: Level): string {
  const form = preferredWordForm(word)
  const partOfSpeech = word.entries[0]?.partOfSpeech.toLowerCase() ?? ''

  if (/adjective/u.test(partOfSpeech)) {
    return level === '기초' || level === '유치원'
      ? `Mina sees a picture that looks ${form}.`
      : `Mina notices that one record describes the scene as ${form}.`
  }
  if (/adverb/u.test(partOfSpeech)) {
    return `Mina writes “${form}” beside the line so she can remember how the action happens.`
  }
  if (/verb/u.test(partOfSpeech) && !/adverb/u.test(partOfSpeech)) {
    return `Mina writes “${form}” beside the next action in her notes.`
  }
  if (/noun/u.test(partOfSpeech)) {
    return level === '기초' || level === '유치원'
      ? `The next picture has a label for ${form}, and Mina points to it.`
      : `The next record mentions ${form}, so Mina marks the reference in her notebook.`
  }
  return `Mina finds the form “${form}” in the next line and keeps it with the clue.`
}

function fallbackPhrasalSentence(item: PhrasalVerbItem, level: Level): string {
  if (level === '기초' || level === '유치원') {
    return `Mina finds “${item.phrasalVerb}” in the next line and reads the expression with her friends.`
  }
  return `Mina marks the expression “${item.phrasalVerb}” because it changes how the next record should be understood.`
}

function uniqueSentences(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

function phrasalCoverageSentences(
  baseText: string,
  level: Level,
  phrasalVerbs: readonly PhrasalVerbItem[],
  allowedTokens: ReadonlySet<string>,
): string[] {
  const missingIds = new Set(
    readerStoryCoverage(baseText, [], phrasalVerbs).missingPhrasalVerbIds,
  )
  return uniqueSentences(
    phrasalVerbs
      .filter(({ id }) => missingIds.has(id))
      .map((item) => bestPhrasalExample(item, level, allowedTokens)
        ?? fallbackPhrasalSentence(item, level)),
  )
}

function greedyWordCoverageSentences(
  seedText: string,
  level: Level,
  words: readonly WordItem[],
  allowedTokens: ReadonlySet<string>,
): string[] {
  const missingIds = new Set(readerStoryCoverage(seedText, words, []).missingWordIds)
  if (missingIds.size === 0) return []

  const missingWords = words.filter(({ id }) => missingIds.has(id))
  const simpleFormOwners = new Map<string, Set<string>>()
  for (const word of missingWords) {
    for (const form of wordForms(word)) {
      const normalized = form.toLowerCase()
      if (!isSimpleForm(normalized)) continue
      const owners = simpleFormOwners.get(normalized) ?? new Set<string>()
      owners.add(word.id)
      simpleFormOwners.set(normalized, owners)
    }
  }

  const candidatesByText = new Map<string, WordExampleCandidate>()
  for (const word of missingWords) {
    const forms = wordForms(word)
    for (const example of word.entries.flatMap((entry) => entry.examples)) {
      if (!isUsableExample(level, example, allowedTokens)) continue
      if (!forms.some((form) => hasWholeWordForm(example, form))) continue
      const candidate = candidatesByText.get(example) ?? {
        text: example,
        wordIds: new Set<string>(),
      }
      candidate.wordIds.add(word.id)
      candidatesByText.set(example, candidate)
    }
  }

  for (const candidate of candidatesByText.values()) {
    for (const token of storyTokens(candidate.text)) {
      for (const ownerId of simpleFormOwners.get(token) ?? []) {
        candidate.wordIds.add(ownerId)
      }
    }
  }

  const candidates = [...candidatesByText.values()].sort((left, right) =>
    right.wordIds.size - left.wordIds.size
    || exampleScore(left.text, level) - exampleScore(right.text, level))
  const uncovered = new Set(missingIds)
  const selected: string[] = []

  for (const candidate of candidates) {
    const newlyCovered = [...candidate.wordIds].filter((id) => uncovered.has(id))
    if (newlyCovered.length === 0) continue
    selected.push(candidate.text)
    newlyCovered.forEach((id) => uncovered.delete(id))
    if (uncovered.size === 0) break
  }

  if (uncovered.size > 0) {
    selected.push(...missingWords
      .filter(({ id }) => uncovered.has(id))
      .map((word) => fallbackWordSentence(word, level)))
  }
  return uniqueSentences(selected)
}

function coverageSentences(
  baseText: string,
  level: Level,
  words: readonly WordItem[],
  phrasalVerbs: readonly PhrasalVerbItem[],
  allowedWords: readonly WordItem[],
): string[] {
  const allowedTokens = allowedExampleTokens(allowedWords)
  const phrasalSentences = phrasalCoverageSentences(
    baseText,
    level,
    phrasalVerbs,
    allowedTokens,
  )
  const wordSeed = [baseText, ...phrasalSentences].join(' ')
  const wordSentences = greedyWordCoverageSentences(
    wordSeed,
    level,
    words,
    allowedTokens,
  )
  return uniqueSentences([...phrasalSentences, ...wordSentences])
}

function buildCoverageScenes(
  level: Level,
  sentences: readonly string[],
): string[] {
  if (sentences.length === 0) return []
  const frames = STORY_FRAMES[level]
  const limit = SCENE_SENTENCE_LIMIT[level]
  const label = SCENE_LABEL[level]
  const scenes: string[] = []

  for (let index = 0; index < sentences.length; index += limit) {
    const sceneNumber = scenes.length + 1
    const frame = frames[scenes.length % frames.length]!
    const body = sentences.slice(index, index + limit).join(' ')
    scenes.push(
      `${label} ${sceneNumber}: ${frame[0]}. ${body} ${frame[1]} after ${label.toLowerCase()} ${sceneNumber}.`,
    )
  }
  return scenes
}

function weaveScenes(baseText: string, scenes: readonly string[]): string {
  if (scenes.length === 0) return baseText.trim()
  const paragraphs = baseText.trim().split(/\n\s*\n/u).filter(Boolean)
  if (paragraphs.length < 3) return [baseText.trim(), ...scenes].join('\n\n')

  const result: string[] = []
  const insertionSlots = Math.max(1, paragraphs.length - 2)
  let sceneCursor = 0

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    result.push(paragraphs[paragraphIndex]!)
    if (paragraphIndex >= paragraphs.length - 2 || sceneCursor >= scenes.length) continue

    const scenesLeft = scenes.length - sceneCursor
    const slotsLeft = insertionSlots - paragraphIndex
    const take = Math.max(1, Math.ceil(scenesLeft / Math.max(1, slotsLeft)))
    for (let count = 0; count < take && sceneCursor < scenes.length; count += 1) {
      result.push(scenes[sceneCursor++]!)
    }
  }

  while (sceneCursor < scenes.length) result.splice(result.length - 1, 0, scenes[sceneCursor++]!)
  return result.join('\n\n')
}

function guaranteeExactCoverage(
  text: string,
  level: Level,
  words: readonly WordItem[],
  phrasalVerbs: readonly PhrasalVerbItem[],
): string {
  const firstPass = readerStoryCoverage(text, words, phrasalVerbs)
  if (
    firstPass.missingWordIds.length === 0
    && firstPass.missingPhrasalVerbIds.length === 0
  ) return text

  const missingWordIds = new Set(firstPass.missingWordIds)
  const missingPhrasalIds = new Set(firstPass.missingPhrasalVerbIds)
  const rescueSentences = [
    ...words
      .filter(({ id }) => missingWordIds.has(id))
      .map((word) => fallbackWordSentence(word, level)),
    ...phrasalVerbs
      .filter(({ id }) => missingPhrasalIds.has(id))
      .map((item) => fallbackPhrasalSentence(item, level)),
  ]
  const rescueScenes = buildCoverageScenes(level, uniqueSentences(rescueSentences))
  return weaveScenes(text, rescueScenes)
}

export function buildReaderStoryText(
  baseText: string,
  level: Level,
  words: readonly WordItem[],
  phrasalVerbs: readonly PhrasalVerbItem[],
  allowedWords: readonly WordItem[] = words,
): string {
  const scenes = buildCoverageScenes(
    level,
    coverageSentences(baseText, level, words, phrasalVerbs, allowedWords),
  )
  const woven = weaveScenes(baseText, scenes)
  return guaranteeExactCoverage(woven, level, words, phrasalVerbs)
}
