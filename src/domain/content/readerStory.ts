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
  기초: 6,
  유치원: 7,
  초등학교: 8,
  중학교: 10,
}

const LOW_LEVEL_UNSAFE: Readonly<Record<Level, RegExp | null>> = {
  기초: /\b(?:abortion|adultery|alcohol|army|arson|assange|bible|brothel|company|court|crime|death|dildo|election|execution|executioner|fraud|god|government|gun|jail|jewish|murder|muslim|parliament|pistol|poison|porn|prison|professional|prostitute|quran|religion|rifle|riot|semen|sex|shotgun|slavery|sperm|suicide|terror|terrorism|war|weapon)\b/iu,
  유치원: /\b(?:abortion|adultery|army|arson|assange|bible|brothel|court|dildo|execution|executioner|fraud|god|government|gun|jail|jewish|murder|muslim|parliament|pistol|poison|porn|prison|professional|prostitute|quran|religion|rifle|riot|semen|sex|shotgun|sperm|suicide|terror|terrorism|weapon)\b/iu,
  초등학교: /\b(?:abortion|adultery|brothel|dildo|executioner|porn|prostitute|semen|sperm|suicide)\b/iu,
  중학교: null,
}

const STORY_FRAMES: Readonly<Record<Level, readonly [string, string][]>> = {
  기초: [
    ['Before Mina leaves the place, the blue bird notices a small note nearby', 'The last line matches the map, so Mina and the bird keep walking'],
    ['A little farther on, Mina finds a folded paper beside the red path', 'Mina puts the paper safely in her bag and follows the next mark'],
    ['The bird chirps at a small card near the road, and Mina stops to read it', 'One detail helps Mina understand where they should go next'],
    ['Near the next tree, Mina sees a short message waiting under a stone', 'When Mina finishes, she smiles at the bird and they move on together'],
    ['Mina finds another clue just before the path turns', 'The clue makes the next part of the map easier to follow'],
    ['At the next stop, Mina and the bird discover a few short notes', 'After reading them, Mina checks the red line and starts walking again'],
    ['A small paper appears near the next mark on the map', 'Mina keeps the useful clue and continues with the blue bird'],
    ['The bird taps a page on the ground, and Mina picks it up', 'The page gives them one more hint before they leave'],
  ],
  유치원: [
    ['Before the page turns again, the storybook shows Mina, Joon, and Sara a few short lines', 'The friends talk about what they learned before the light moves on'],
    ['A warm gold light runs across the next page and reveals another small memory', 'Mina smiles when the final line makes the next picture glow'],
    ['The old book opens to a page the friends have not seen before', 'When they finish reading, a little star appears near the next page'],
    ['A new picture grows across the paper while Mina and her friends watch', 'The picture becomes bright when the friends understand the message'],
    ['The book pauses on another memory from the school', 'Mina, Joon, and Sara read it together before the page turns'],
    ['A small paper door opens inside the storybook and shows another scene', 'The friends remember the scene as the golden light moves forward'],
    ['One more page shines softly under Mina’s hands', 'The last line gives the friends a new idea about the missing ending'],
    ['The storybook lets the friends hear another voice from long ago', 'They listen carefully, then follow the light to the next part of the story'],
  ],
  초등학교: [
    ['Before leaving the area, Mina finds another bundle connected to the garden’s history, and Joon and Sara help her examine it', 'They record the useful details and return to the main clue'],
    ['A nearby folder contains several short memories from people who once used the garden', 'Mina compares the details with the map before the three friends continue'],
    ['Behind an old photograph, Mina discovers a few notes that add another piece to the garden’s story', 'The new details make the next part of the mystery easier to understand'],
    ['The friends find a small box of records near the path and read the contents in order', 'When they finish, Mina connects the records to the clue they are already following'],
    ['Another envelope contains messages that were saved by people who cared for the garden', 'Sara checks the dates while Mina marks the details that may matter later'],
    ['Near the next location, Joon notices a packet that everyone else had missed', 'The friends study it together, then continue with a clearer idea of what happened'],
    ['Mina pauses to review another set of notes before they move to the next place', 'A repeated detail links the notes to the larger mystery'],
    ['The search uncovers another group of short records from the garden’s past', 'Mina adds the useful evidence to her notebook and keeps going'],
  ],
  중학교: [
    ['Before moving to the next source, Mina reviews another set of Riverside records beside her timeline', 'She marks what can be verified and returns to the main investigation'],
    ['A second file box gives Mina several accounts that were never explained in the shortened public summary', 'She keeps the conflicting details side by side instead of forcing them into one version'],
    ['The archive index leads Mina to another packet of letters, reports, and interview notes', 'Mina records the source of each claim before connecting it to the larger timeline'],
    ['During the supervised review, Mina opens a folder that earlier summaries had reduced to a few lines', 'She separates fact, memory, and opinion before deciding what the material can prove'],
    ['Another group of records fills a gap between two dates on Mina’s timeline', 'She notes the points that can be checked against independent evidence'],
    ['Mina compares another set of documents with the sources she has already collected', 'The comparison does not answer every question, but it narrows the next one'],
    ['A newly indexed packet contains voices that the official summary did not preserve in detail', 'Mina keeps the different accounts visible so the final report will not erase disagreement'],
    ['Before drafting the next section, Mina reads another file from beginning to end', 'She adds only the claims that can be traced to a source'],
  ],
}

const SCENE_CUE_STOPWORDS = new Set([
  'about', 'after', 'again', 'along', 'another', 'before', 'being', 'because',
  'could', 'every', 'first', 'from', 'have', 'into', 'little', 'mina', 'more',
  'next', 'other', 'people', 'said', 'same', 'short', 'some', 'that', 'their',
  'there', 'these', 'they', 'this', 'those', 'through', 'under', 'very', 'when',
  'where', 'which', 'while', 'with', 'would',
])

const FALLBACK_SCENE_CUES = [
  'detail', 'message', 'picture', 'clue', 'note', 'memory', 'line', 'mark',
] as const

const META_SOURCE_PATTERN = /\b(?:definition|expression|label|means?|phrase|sentence|spelling|term|word)\b/iu

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

function exampleScore(example: string, level: Level): number {
  const wordCount = example.match(/[A-Za-z]+(?:['’~-][A-Za-z]+)*/gu)?.length ?? 0
  const sentencePenalty = Math.max(0, wordCount - ({
    기초: 10,
    유치원: 13,
    초등학교: 20,
    중학교: 28,
  } as const)[level])
  const metaPenalty = META_SOURCE_PATTERN.test(example) ? 20 : 0
  return wordCount + sentencePenalty * 3 + metaPenalty
}

function bestPhrasalExample(
  item: PhrasalVerbItem,
  level: Level,
): string | null {
  return item.examples
    .filter((example) => hasWholeWordForm(example, item.phrasalVerb))
    .filter((example) => isSafeExample(level, example))
    .sort((left, right) => exampleScore(left, level) - exampleScore(right, level))[0] ?? null
}

function preferredWordForm(word: WordItem): string {
  const forms = wordForms(word)
  const exactLemma = forms.find((form) => form.toLowerCase() === word.lemma.toLowerCase())
  if (exactLemma) return exactLemma
  const exactWord = forms.find((form) => form.toLowerCase() === word.word.toLowerCase())
  return exactWord ?? forms[0] ?? word.lemma
}

function stableIndex(key: string, size: number): number {
  let hash = 0
  for (const character of key) hash = (hash * 31 + character.codePointAt(0)!) >>> 0
  return size === 0 ? 0 : hash % size
}

function chooseTemplate(key: string, templates: readonly string[]): string {
  return templates[stableIndex(key, templates.length)] ?? templates[0] ?? ''
}

function fallbackWordSentence(word: WordItem, level: Level): string {
  const form = preferredWordForm(word)
  const partOfSpeech = word.entries[0]?.partOfSpeech.toLowerCase() ?? ''

  if (/adjective/u.test(partOfSpeech)) {
    const templates = level === '기초' || level === '유치원'
      ? [
          `The next part of the path looks ${form}.`,
          `The little bird seems ${form} for a moment.`,
          `The old place feels ${form} to Mina.`,
          `The next scene becomes ${form} as Mina watches.`,
        ]
      : [
          `One part of the evidence seems ${form} when Mina checks it again.`,
          `The next account appears ${form} beside the earlier record.`,
          `A detail in the timeline looks ${form} after the comparison.`,
          `The situation feels ${form} as Mina reviews the evidence.`,
        ]
    return chooseTemplate(word.id, templates)
  }

  if (/adverb/u.test(partOfSpeech)) {
    const templates = level === '기초' || level === '유치원'
      ? [
          `Mina moves ${form} toward the next stop.`,
          `The little bird flies ${form} beside Mina.`,
          `Mina looks around ${form} before walking on.`,
          `They continue ${form} along the path.`,
        ]
      : [
          `Mina reads the next source ${form} before marking it.`,
          `She compares the two records ${form}.`,
          `The investigation moves ${form} toward the next question.`,
          `Mina reviews the detail ${form} before adding it to the timeline.`,
        ]
    return chooseTemplate(word.id, templates)
  }

  if (/noun/u.test(partOfSpeech)) {
    const templates = level === '기초' || level === '유치원'
      ? [
          `Mina notices the ${form} near the path.`,
          `The little bird leads Mina toward the ${form}.`,
          `Mina finds the ${form} beside the next stop.`,
          `The ${form} becomes part of Mina’s next clue.`,
        ]
      : [
          `Mina notices the ${form} while checking the next clue.`,
          `The ${form} becomes relevant when Mina compares the evidence.`,
          `Mina adds the ${form} to the details she is following.`,
          `The investigation leads Mina back to the ${form}.`,
        ]
    return chooseTemplate(word.id, templates)
  }

  const quoted = `“${form}”`
  const templates = level === '기초' || level === '유치원'
    ? [
        `Mina hears ${quoted} as the friends decide what to do next.`,
        `The friends use ${quoted} while they talk about the next step.`,
        `Mina says ${quoted} before they continue together.`,
        `Someone nearby says ${quoted}, and Mina keeps walking.`,
      ]
    : [
        `Mina hears ${quoted} during the next conversation.`,
        `The group uses ${quoted} while discussing the evidence.`,
        `Mina records ${quoted} from the conversation before moving on.`,
        `A witness says ${quoted} while explaining the next detail.`,
      ]
  return chooseTemplate(word.id, templates)
}

function fallbackPhrasalSentence(item: PhrasalVerbItem, level: Level): string {
  const quoted = `“${item.phrasalVerb}”`
  const templates = level === '기초' || level === '유치원'
    ? [
        `Mina hears ${quoted} while the friends decide what to do next.`,
        `The friends use ${quoted} as they talk beside the path.`,
        `Mina repeats ${quoted} before they move on together.`,
        `Someone nearby says ${quoted}, and the friends continue.`,
      ]
    : [
        `Mina hears ${quoted} during the next interview.`,
        `The group uses ${quoted} while discussing the evidence.`,
        `Mina records ${quoted} from the conversation before moving on.`,
        `A witness says ${quoted} while explaining what happened next.`,
      ]
  return chooseTemplate(item.id, templates)
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
): string[] {
  const missingIds = new Set(
    readerStoryCoverage(baseText, [], phrasalVerbs).missingPhrasalVerbIds,
  )
  return uniqueSentences(
    phrasalVerbs
      .filter(({ id }) => missingIds.has(id))
      .map((item) => bestPhrasalExample(item, level)
        ?? fallbackPhrasalSentence(item, level)),
  )
}

function greedyWordCoverageSentences(
  seedText: string,
  level: Level,
  words: readonly WordItem[],
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
      if (!isSafeExample(level, example)) continue
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
): string[] {
  const phrasalSentences = phrasalCoverageSentences(baseText, level, phrasalVerbs)
  const wordSeed = [baseText, ...phrasalSentences].join(' ')
  const wordSentences = greedyWordCoverageSentences(wordSeed, level, words)
  return uniqueSentences([...phrasalSentences, ...wordSentences])
}

function overlapScore(sentence: string, context: string): number {
  const sentenceTokens = storyTokens(sentence)
  const contextTokens = storyTokens(context)
  let score = 0
  for (const token of sentenceTokens) {
    if (token.length >= 4 && contextTokens.has(token)) score += 1
  }
  return score
}

function assignSentencesToSlots(
  paragraphs: readonly string[],
  sentences: readonly string[],
): string[][] {
  const slotCount = Math.max(1, paragraphs.length - 1)
  const slots = Array.from({ length: slotCount }, () => [] as string[])

  sentences.forEach((sentence, sentenceIndex) => {
    let bestSlot = sentenceIndex % slotCount
    let bestScore = Number.NEGATIVE_INFINITY

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
      const context = `${paragraphs[slotIndex] ?? ''} ${paragraphs[slotIndex + 1] ?? ''}`
      const semantic = overlapScore(sentence, context)
      const loadPenalty = slots[slotIndex]!.length / Math.max(1, sentences.length / slotCount)
      const score = semantic * 4 - loadPenalty
      if (score > bestScore) {
        bestScore = score
        bestSlot = slotIndex
      }
    }

    slots[bestSlot]!.push(sentence)
  })

  return slots
}

function sceneCue(sentences: readonly string[], sceneIndex: number): string {
  const candidates = sentences
    .flatMap((sentence) => [...storyTokens(sentence)])
    .filter((token) => token.length >= 4 && !SCENE_CUE_STOPWORDS.has(token))
  const uniqueCandidates = [...new Set(candidates)]
  if (uniqueCandidates.length > 0) {
    return uniqueCandidates[stableIndex(`scene-${sceneIndex}`, uniqueCandidates.length)]!
  }
  return FALLBACK_SCENE_CUES[sceneIndex % FALLBACK_SCENE_CUES.length]!
}

function buildSceneParagraph(
  level: Level,
  sentences: readonly string[],
  sceneIndex: number,
): string {
  const frames = STORY_FRAMES[level]
  const frame = frames[sceneIndex % frames.length]!
  const cue = sceneCue(sentences, sceneIndex)
  return `${frame[0]}. ${sentences.join(' ')} ${frame[1]}, with “${cue}” still in mind.`
}

function weaveCoverageSentences(
  baseText: string,
  level: Level,
  sentences: readonly string[],
): string {
  if (sentences.length === 0) return baseText.trim()

  const paragraphs = baseText.trim().split(/\n\s*\n/u).filter(Boolean)
  if (paragraphs.length < 2) {
    const scene = buildSceneParagraph(level, sentences, 0)
    return [baseText.trim(), scene].filter(Boolean).join('\n\n')
  }

  const slots = assignSentencesToSlots(paragraphs, sentences)
  const result: string[] = []
  let sceneIndex = 0
  const limit = SCENE_SENTENCE_LIMIT[level]

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    result.push(paragraphs[paragraphIndex]!)
    if (paragraphIndex >= paragraphs.length - 1) continue

    const slotSentences = slots[paragraphIndex] ?? []
    for (let index = 0; index < slotSentences.length; index += limit) {
      result.push(
        buildSceneParagraph(
          level,
          slotSentences.slice(index, index + limit),
          sceneIndex,
        ),
      )
      sceneIndex += 1
    }
  }

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
  const rescueSentences = uniqueSentences([
    ...words
      .filter(({ id }) => missingWordIds.has(id))
      .map((word) => {
        const exactExample = word.entries
          .flatMap((entry) => entry.examples)
          .filter((example) => isSafeExample(level, example))
          .filter((example) => wordForms(word).some((form) => hasWholeWordForm(example, form)))
          .sort((left, right) => exampleScore(left, level) - exampleScore(right, level))[0]
        return exactExample ?? fallbackWordSentence(word, level)
      }),
    ...phrasalVerbs
      .filter(({ id }) => missingPhrasalIds.has(id))
      .map((item) => bestPhrasalExample(item, level)
        ?? fallbackPhrasalSentence(item, level)),
  ])

  if (rescueSentences.length === 0) return text

  const paragraphs = text.trim().split(/\n\s*\n/u).filter(Boolean)
  if (paragraphs.length < 2) return weaveCoverageSentences(text, level, rescueSentences)

  const resolution = paragraphs.at(-1)!
  const beforeResolution = paragraphs.slice(0, -1).join('\n\n')
  const rescued = weaveCoverageSentences(beforeResolution, level, rescueSentences)
  return `${rescued}\n\n${resolution}`
}

export function buildReaderStoryText(
  baseText: string,
  level: Level,
  words: readonly WordItem[],
  phrasalVerbs: readonly PhrasalVerbItem[],
  _allowedWords: readonly WordItem[] = words,
): string {
  const sentences = coverageSentences(baseText, level, words, phrasalVerbs)
  const woven = weaveCoverageSentences(baseText, level, sentences)
  return guaranteeExactCoverage(woven, level, words, phrasalVerbs)
}
