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

const SCENE_SENTENCE_LIMIT: Readonly<Record<Level, number>> = {
  기초: 4,
  유치원: 5,
  초등학교: 6,
  중학교: 7,
}

const LOW_LEVEL_UNSAFE: Readonly<Record<Level, RegExp | null>> = {
  기초: /\b(?:abortion|adultery|alcohol|army|arson|assange|brothel|court|crime|death|dildo|election|execution|executioner|fraud|gun|jail|murder|parliament|pistol|poison|porn|prison|prostitute|quran|rifle|riot|semen|sex|shotgun|slavery|sperm|suicide|terror|terrorism|war|weapon)\b/iu,
  유치원: /\b(?:abortion|adultery|army|arson|assange|brothel|dildo|execution|executioner|fraud|gun|jail|murder|parliament|pistol|poison|porn|prison|prostitute|rifle|riot|semen|sex|shotgun|sperm|suicide|terror|terrorism|weapon)\b/iu,
  초등학교: /\b(?:abortion|adultery|brothel|dildo|executioner|porn|prostitute|semen|sperm|suicide)\b/iu,
  중학교: null,
}

const STORY_FRAMES: Readonly<Record<Level, readonly [string, string][]>> = {
  기초: [
    ['The map opens one more small path. Mina follows it with the blue bird.', 'Mina checks the map, and they keep going together.'],
    ['A new note waits beside the path. Mina reads it while the bird watches.', 'The note helps Mina choose the next turn.'],
    ['Near the next mark, Mina finds a little page that someone left for them.', 'Mina puts the page in her bag and follows the red line again.'],
    ['The bird chirps at another clue. Mina stops and looks closely.', 'When the clue is clear, Mina and the bird move on.'],
  ],
  유치원: [
    ['The storybook turns another page by itself. Mina, Joon, and Sara lean closer.', 'The picture glows softly, and the friends turn the page together.'],
    ['A small golden light runs across the paper. Another little story appears.', 'Mina smiles when the light moves to the next page.'],
    ['The book shows the friends another memory from long ago.', 'The three friends talk about what they saw before the page changes again.'],
    ['A new picture grows across the white page. The friends read every line.', 'When they finish, one more star shines near the edge of the book.'],
  ],
  초등학교: [
    ['Inside the history room, Mina finds another bundle connected to the four letters. Joon and Sara help her open it carefully.', 'They record what they learned, return the papers to the bundle, and follow the next clue.'],
    ['The next folder contains short memories from people who once used the garden. Mina reads them while Sara checks the dates.', 'Joon marks the useful details on their map, and the three friends continue the search.'],
    ['Behind an old photograph, Mina discovers several notes that explain another part of the garden’s history.', 'The notes make the earlier clue clearer, so Mina adds them to the evidence they are carrying.'],
    ['A small box near the path holds more records from past visitors. The friends sit under the tree and read them in order.', 'When the last page is finished, Mina sees how this piece of the history connects to their next stop.'],
  ],
  중학교: [
    ['The Riverside collection contains another set of records that had never been summarized in the public report. Mina reads them beside her timeline.', 'She marks the source of each statement, separates observation from opinion, and returns to the main investigation.'],
    ['A second file box gives Mina more voices from the district. She reads the material in chronological order instead of assuming that every account agrees.', 'After comparing the pages, Mina notes the points that can be checked against independent evidence.'],
    ['The archive index leads Mina to another packet of letters, reports, and interview notes. Each document adds a small part of the missing context.', 'Mina records where every claim came from before she connects the packet to the larger Riverside timeline.'],
    ['During the supervised review, Mina opens another folder that previous summaries had reduced to a single line. The original pages are much more detailed.', 'She keeps the conflicting accounts side by side so the final report will show uncertainty instead of hiding it.'],
  ],
}

function wordForms(word: WordItem): string[] {
  return [...new Set(word.entries.flatMap((entry) => entryFormStrings(entry)))]
    .filter((form) => form.trim().length > 0)
}

function wordAppears(text: string, word: WordItem): boolean {
  return wordForms(word).some((form) => hasWholeWordForm(text, form))
}

function phrasalVerbAppears(text: string, item: PhrasalVerbItem): boolean {
  return hasWholeWordForm(text, item.phrasalVerb)
}

export function readerStoryCoverage(
  text: string,
  words: readonly WordItem[],
  phrasalVerbs: readonly PhrasalVerbItem[],
): ReaderStoryCoverage {
  const missingWords = words.filter((word) => !wordAppears(text, word))
  const missingPhrasalVerbs = phrasalVerbs.filter((item) =>
    !phrasalVerbAppears(text, item))

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

function bestWordExample(word: WordItem, level: Level): string | null {
  const forms = wordForms(word)
  const candidates = word.entries
    .flatMap((entry) => entry.examples)
    .filter((example) => forms.some((form) => hasWholeWordForm(example, form)))
    .filter((example) => isSafeExample(level, example))
    .sort((left, right) => exampleScore(left, level) - exampleScore(right, level))
  return candidates[0] ?? null
}

function bestPhrasalExample(item: PhrasalVerbItem, level: Level): string | null {
  const exact = item.examples
    .filter((example) => hasWholeWordForm(example, item.phrasalVerb))
    .filter((example) => isSafeExample(level, example))
    .sort((left, right) => exampleScore(left, level) - exampleScore(right, level))
  if (exact.length > 0) return exact[0]!

  const safe = item.examples
    .filter((example) => isSafeExample(level, example))
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

function coverageSentences(
  baseText: string,
  level: Level,
  words: readonly WordItem[],
  phrasalVerbs: readonly PhrasalVerbItem[],
): string[] {
  const initial = readerStoryCoverage(baseText, words, phrasalVerbs)
  const missingWordIds = new Set(initial.missingWordIds)
  const missingPhrasalIds = new Set(initial.missingPhrasalVerbIds)

  const wordSentences = words
    .filter(({ id }) => missingWordIds.has(id))
    .map((word) => bestWordExample(word, level) ?? fallbackWordSentence(word, level))

  const phrasalSentences = phrasalVerbs
    .filter(({ id }) => missingPhrasalIds.has(id))
    .map((item) => bestPhrasalExample(item, level) ?? fallbackPhrasalSentence(item, level))

  return uniqueSentences([...wordSentences, ...phrasalSentences])
}

function buildCoverageScenes(
  level: Level,
  sentences: readonly string[],
): string[] {
  if (sentences.length === 0) return []
  const frames = STORY_FRAMES[level]
  const limit = SCENE_SENTENCE_LIMIT[level]
  const scenes: string[] = []

  for (let index = 0; index < sentences.length; index += limit) {
    const frame = frames[scenes.length % frames.length]!
    const body = sentences.slice(index, index + limit).join(' ')
    scenes.push(`${frame[0]} ${body} ${frame[1]}`)
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
): string {
  const scenes = buildCoverageScenes(
    level,
    coverageSentences(baseText, level, words, phrasalVerbs),
  )
  const woven = weaveScenes(baseText, scenes)
  return guaranteeExactCoverage(woven, level, words, phrasalVerbs)
}
