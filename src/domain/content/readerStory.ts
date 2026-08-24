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

const NARRATIVE_ANCHORS: Readonly<Record<Level, readonly string[]>> = {
  기초: [
    'the park', 'the big tree', 'the bakery', 'the river', 'the bridge',
    'the yellow ribbon', 'the flowers', 'the old house', 'the door', 'the window',
  ],
  유치원: [
    'the library', 'the storybook', 'the clock', 'the art room', 'the old picture',
    'the school garden', 'the red flower', 'the paper door', 'the classroom',
    'the white page', 'the new ending', 'the class',
  ],
  초등학교: [
    'the city garden', 'the fountain', 'the glass house', 'the oldest tree',
    'the public library', 'locker 214', 'the yellow house', 'the hill',
    'the storm shelter', 'the damaged map', 'the public meeting', 'the history room',
  ],
  중학교: [
    'Riverside', 'the public archive', 'the old map', 'the newspaper reports',
    'the community center', 'Mr. Park', 'the property registers', 'the bank records',
    'Ms. Lee', 'the email', 'the public library', 'Mr. Choi', 'the sealed box',
    'the internal memo', 'the final report', 'the review group',
  ],
}

const GENERIC_ANCHORS: Readonly<Record<Level, readonly [string, string]>> = {
  기초: ['the last stop', 'the next stop'],
  유치원: ['the last page', 'the next part of the story'],
  초등학교: ['the last clue', 'the next location'],
  중학교: ['the current evidence', 'the next source'],
}

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

function anchorNeedle(anchor: string): string {
  return anchor.toLowerCase().replace(/^the\s+/u, '')
}

function contextAnchor(
  text: string,
  level: Level,
  direction: 'previous' | 'next',
): string {
  const lower = text.toLowerCase()
  const fallback = GENERIC_ANCHORS[level][direction === 'previous' ? 0 : 1]
  let bestAnchor = fallback
  let bestPosition = direction === 'previous' ? -1 : Number.POSITIVE_INFINITY

  for (const anchor of NARRATIVE_ANCHORS[level]) {
    const needle = anchorNeedle(anchor)
    const position = direction === 'previous'
      ? lower.lastIndexOf(needle)
      : lower.indexOf(needle)
    if (position < 0) continue

    if (
      (direction === 'previous' && position > bestPosition)
      || (direction === 'next' && position < bestPosition)
    ) {
      bestAnchor = anchor
      bestPosition = position
    }
  }

  return bestAnchor
}

function bridgeLead(
  level: Level,
  previousParagraph: string,
  nextParagraph: string,
  seed: string,
): string {
  const previous = contextAnchor(previousParagraph, level, 'previous')
  const next = contextAnchor(nextParagraph, level, 'next')
  const variant = stableIndex(seed, 8)

  if (level === '기초') {
    return [
      `On the way from ${previous} to ${next}, Mina and the bird keep following the trail`,
      `After leaving ${previous}, Mina and the bird notice something new before they reach ${next}`,
      `The walk beyond ${previous} gives Mina another small surprise on the way to ${next}`,
      `Before they reach ${next}, Mina and the bird pause once more beyond ${previous}`,
      `Mina carries what she learned at ${previous} with her as she heads toward ${next}`,
      `The trail from ${previous} bends toward ${next}, and Mina stays alert`,
      `A little past ${previous}, Mina and the bird keep moving toward ${next}`,
      `Between ${previous} and ${next}, the search takes another turn`,
    ][variant]!
  }

  if (level === '유치원') {
    return [
      `As the story moves from ${previous} toward ${next}, Mina, Joon, and Sara follow the glow`,
      `After ${previous}, the glowing book guides the friends toward ${next}`,
      `Before the story reaches ${next}, another little moment opens beyond ${previous}`,
      `The light from ${previous} carries the three friends toward ${next}`,
      `With ${previous} still in their minds, the friends follow the story toward ${next}`,
      `The book turns gently from ${previous} toward ${next}, and the friends keep watching`,
      `Between ${previous} and ${next}, the story gives Mina and her friends another moment to share`,
      `As ${previous} fades behind them, a new part of the story begins on the way to ${next}`,
    ][variant]!
  }

  if (level === '초등학교') {
    return [
      `With the clue from ${previous} still in mind, Mina, Joon, and Sara continue toward ${next}`,
      `Before the friends reach ${next}, another part of the garden story surfaces beyond ${previous}`,
      `The search from ${previous} toward ${next} gives the friends another connection to consider`,
      `After ${previous}, Mina keeps the larger mystery in view as the group moves toward ${next}`,
      `Between ${previous} and ${next}, the friends uncover another piece of the same garden mystery`,
      `What the friends learned at ${previous} follows them as they head toward ${next}`,
      `The route beyond ${previous} keeps pointing toward ${next}, but the mystery adds another layer`,
      `Before leaving ${previous} completely behind, the friends find something that matters on the way to ${next}`,
    ][variant]!
  }

  return [
    `Before moving from ${previous} to ${next}, Mina checks one more connection in the evidence`,
    `The evidence from ${previous} raises another question before Mina turns to ${next}`,
    `As Mina moves from ${previous} toward ${next}, another source complicates the timeline`,
    `What Mina learned at ${previous} remains relevant as she prepares to examine ${next}`,
    `Between ${previous} and ${next}, Mina tests another piece of the Riverside record`,
    `Before ${next} can answer the next question, Mina compares it with what she found at ${previous}`,
    `The move from ${previous} to ${next} exposes another connection that Mina needs to verify`,
    `With the evidence from ${previous} still open, Mina follows the investigation toward ${next}`,
  ][variant]!
}

function buildSceneParagraph(
  level: Level,
  sentences: readonly string[],
  sceneIndex: number,
  previousParagraph: string,
  nextParagraph: string,
): string {
  const cleanSentences = sentences.map((sentence) => sentence.trim()).filter(Boolean)
  if (cleanSentences.length === 0) return ''
  const first = cleanSentences[0]!
  const rest = cleanSentences.slice(1)
  const lead = bridgeLead(
    level,
    previousParagraph,
    nextParagraph,
    `${sceneIndex}:${first}`,
  )
  return [`${lead}: ${first}`, ...rest].join(' ')
}

function weaveCoverageSentences(
  baseText: string,
  level: Level,
  sentences: readonly string[],
): string {
  if (sentences.length === 0) return baseText.trim()

  const paragraphs = baseText.trim().split(/\n\s*\n/u).filter(Boolean)
  if (paragraphs.length < 2) {
    const scene = buildSceneParagraph(level, sentences, 0, baseText, '')
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
          paragraphs[paragraphIndex]!,
          paragraphs[paragraphIndex + 1]!,
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
