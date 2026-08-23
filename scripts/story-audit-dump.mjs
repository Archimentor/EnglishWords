import { readFile, writeFile } from 'node:fs/promises'

const LEVELS = ['기초', '유치원', '초등학교', '중학교']

const GENERATED_STAGE_OPENINGS = [
  /^The [^.]+ had a blue line\. Mina began a new walk with the [^.]+\.\s*/u,
  /^The [^.]+ became dark, and rain fell\. Mina was afraid, but the [^.]+ was with her\.\s*/u,
  /^The map did not have the road\. Mina listened to the [^.]+ and changed her plan\.\s*/u,
  /^At a dark old house, Mina found the family from the picture\. The door was closed, and they asked for help\.\s*/u,
  /^The red line ended at the [^.]+\. Mina carried the pages with her\.\s*/u,
]

const GENERATED_STAGE_CLOSINGS = [
  /\s*Mina put the page on the map and followed the red line\.$/u,
  /\s*The new picture had a road for Mina\. She held the [^.]+ and went on\.$/u,
  /\s*Mina joined the lines and made a new plan\. She went on with the [^.]+\.$/u,
  /\s*The picture became clear, and Mina opened a new door\. The family followed her\.$/u,
  /\s*The pages made a full picture\. Mina found the way, and the family was happy\.$/u,
]

const GENERATED_VOICE_PREFIX = /(?:A child read from the page|A woman wrote on the page|A boy talked to Mina|A girl called from the city|The picture opened, and Mina heard):/gu
const NARRATIVE_LEADS = [
  'Mina read:', 'A note beside it said:', 'Another line read:', 'Someone nearby said:',
  'The next message said:', 'A voice from the page added:', 'Farther down, Mina found:',
  'Another clue read:', 'The page continued:', 'A small note said:', 'The next line said:',
  'One final message read:',
]

const PHRASAL_SCENE_FRAMES = {
  기초: {
    openings: [
      'Mina and the bird went on to the next place.',
      'At the next turn, Mina found people who had seen the blue mark.',
      'The bird stopped, and Mina listened for the next clue.',
      'A little farther on, Mina and the bird came to a new place.',
    ],
    closings: [
      'Mina kept the messages in mind and went on with the bird.',
      'The clues showed the way, so Mina and the bird went on.',
      'Mina marked the place on the map and kept walking.',
      'The bird went ahead, and Mina followed it down the road.',
    ],
  },
  유치원: {
    openings: [
      'The glowing book opened another page while Mina and her friends watched.',
      'A new light moved across the page and showed another part of the lost story.',
      'Mina turned the page, and a new part of the school story appeared.',
      'Mina and her friends came closer when a hidden page began to shine.',
    ],
    closings: [
      'Mina wrote down what they learned before the light moved to the next page.',
      'The friends put the new messages together and kept reading.',
      'Another piece of the lost story was back in place, but the book had more to show.',
      'The page grew quiet again, and Mina knew the next clue was near.',
    ],
  },
  초등학교: {
    openings: [
      'The next clue led Mina and her team to another part of the city.',
      'As they followed the four letters, the team found messages connected to the garden.',
      'The trail turned again, and several records gave Mina a new view of the mystery.',
      'Before they moved on, Mina compared several accounts left along the route.',
    ],
    closings: [
      'Mina compared the messages, added the useful details to her notebook, and followed the next clue.',
      'Together the details narrowed the search, so the team continued toward the garden.',
      'The team now understood a little more about what the city had forgotten.',
      'Mina kept the evidence with the letters and led the team to the next stop.',
    ],
  },
  중학교: {
    openings: [
      'The next file contained statements from several sources connected to the investigation.',
      'Mina compared another group of records before deciding what could be treated as evidence.',
      'A new set of witness accounts complicated the public version of the case.',
      'Before updating the report, Mina reviewed several independent statements from the district.',
    ],
    closings: [
      'Mina recorded the statements separately, marked the points that could be verified, and continued the investigation.',
      'The accounts did not all agree, but together they exposed another gap in the public record.',
      'Mina added the supported details to her notes and kept the original sources unchanged.',
      'The evidence now pointed to the next part of the record, so Mina continued tracing the case.',
    ],
  },
}

const PHRASAL_SCENE_LEADS = [
  'The first account said:', 'Another message read:', 'A second source added:',
  'One more note said:', 'The last account in the group read:',
]

function splitParagraphs(text) {
  return text.trim().split(/\n\s*\n/u).filter((paragraph) => paragraph.trim())
}

function smoothVocabularyParagraph(paragraph, paragraphIndex) {
  let smoothed = paragraph.trim()
  for (const pattern of GENERATED_STAGE_OPENINGS) smoothed = smoothed.replace(pattern, '')
  for (const pattern of GENERATED_STAGE_CLOSINGS) smoothed = smoothed.replace(pattern, '')
  let voiceIndex = 0
  smoothed = smoothed.replace(GENERATED_VOICE_PREFIX, () => {
    const lead = NARRATIVE_LEADS[(paragraphIndex * 3 + voiceIndex) % NARRATIVE_LEADS.length]
    voiceIndex += 1
    return lead
  })
  return smoothed.replace(/\s+/gu, ' ').trim()
}

function buildPhrasalNarrativeParagraph(level, paragraphIndex, uses, fallback) {
  if (uses.length === 0) return fallback
  const frame = PHRASAL_SCENE_FRAMES[level]
  const opening = frame.openings[paragraphIndex % frame.openings.length]
  const closing = frame.closings[paragraphIndex % frame.closings.length]
  const evidence = uses.map((use, index) =>
    `${PHRASAL_SCENE_LEADS[index % PHRASAL_SCENE_LEADS.length]} ${use.example}`)
  return [opening, ...evidence, closing].join(' ')
}

function sentences(text) {
  return text
    .replace(/[“”]/gu, '"')
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/u)
    .map((value) => value.trim())
    .filter(Boolean)
}

function words(text) {
  return text.match(/[A-Za-z]+(?:['’~-][A-Za-z]+)*/gu) ?? []
}

function syllablesInWord(raw) {
  const word = raw.toLowerCase().replace(/[^a-z]/g, '')
  if (!word) return 0
  if (word.length <= 3) return 1
  const stripped = word.replace(/(?:e|es|ed)$/u, '')
  const groups = stripped.match(/[aeiouy]+/g)?.length ?? 1
  return Math.max(1, groups)
}

function metrics(text, paragraphs) {
  const sentenceList = sentences(text)
  const wordList = words(text)
  const sentenceLengths = sentenceList.map((sentence) => words(sentence).length).sort((a, b) => a - b)
  const syllables = wordList.reduce((sum, word) => sum + syllablesInWord(word), 0)
  const count = wordList.length || 1
  const sentenceCount = sentenceList.length || 1
  const avgWords = count / sentenceCount
  const avgSyllables = syllables / count
  const fleschEase = 206.835 - 1.015 * avgWords - 84.6 * avgSyllables
  const fkGrade = 0.39 * avgWords + 11.8 * avgSyllables - 15.59
  const normSentences = sentenceList.map((sentence) => sentence.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim())
  const exactDuplicateSentences = normSentences.length - new Set(normSentences).size
  const starts = sentenceList.map((sentence) => words(sentence).slice(0, 5).join(' ').toLowerCase())
  const startCounts = new Map()
  for (const start of starts) startCounts.set(start, (startCounts.get(start) ?? 0) + 1)
  const commonStarts = [...startCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const p90Index = Math.max(0, Math.ceil(sentenceLengths.length * 0.9) - 1)
  return {
    paragraphs,
    sentences: sentenceList.length,
    words: wordList.length,
    uniqueWords: new Set(wordList.map((word) => word.toLowerCase())).size,
    avgWordsPerSentence: Number(avgWords.toFixed(2)),
    p90WordsPerSentence: sentenceLengths[p90Index] ?? 0,
    maxWordsPerSentence: sentenceLengths.at(-1) ?? 0,
    fleschEase: Number(fleschEase.toFixed(1)),
    fkGrade: Number(fkGrade.toFixed(1)),
    exactDuplicateSentences,
    commonStarts,
  }
}

const summary = {}
const dumpLines = ['level\tseq\ttype\tsourceIndex\ttext']

for (const level of LEVELS) {
  const story = JSON.parse(await readFile(new URL(`../public/data/stories/${level}.json`, import.meta.url), 'utf8'))
  const storyParagraphs = splitParagraphs(story.storyText).map((text, sourceIndex) => ({ type: 'story', sourceIndex, text }))
  const vocabularyParagraphs = splitParagraphs(story.vocabularyPracticeText)
    .map((paragraph, sourceIndex) => ({ type: 'vocab', sourceIndex, text: smoothVocabularyParagraph(paragraph, sourceIndex) }))
  const phrasalRawParagraphs = splitParagraphs(story.phrasalVerbPracticeText)
  const phrasalParagraphs = phrasalRawParagraphs.map((paragraph, sourceIndex) => {
    const uses = story.usedPhrasalVerbs.filter(({ example }) => paragraph.includes(example))
    return {
      type: 'phrasal',
      sourceIndex,
      text: buildPhrasalNarrativeParagraph(level, sourceIndex, uses, paragraph),
    }
  })
  const supplemental = []
  const supplementalCount = Math.max(vocabularyParagraphs.length, phrasalParagraphs.length)
  for (let index = 0; index < supplementalCount; index += 1) {
    if (vocabularyParagraphs[index]) supplemental.push(vocabularyParagraphs[index])
    if (phrasalParagraphs[index]) supplemental.push(phrasalParagraphs[index])
  }
  const merged = []
  if (storyParagraphs.length === 0) {
    merged.push(...supplemental)
  } else {
    let supplementalIndex = 0
    storyParagraphs.forEach((paragraph, storyIndex) => {
      merged.push(paragraph)
      const targetSupplementalCount = Math.round(((storyIndex + 1) * supplemental.length) / storyParagraphs.length)
      while (supplementalIndex < targetSupplementalCount) {
        if (supplemental[supplementalIndex]) merged.push(supplemental[supplementalIndex])
        supplementalIndex += 1
      }
    })
    merged.push(...supplemental.slice(supplementalIndex))
  }

  const mergedText = merged.map(({ text }) => text).join('\n\n')
  summary[level] = {
    title: story.title,
    usedWords: story.usedWords.length,
    usedPhrasalVerbs: story.usedPhrasalVerbs.length,
    sourceParagraphs: {
      story: storyParagraphs.length,
      vocabulary: vocabularyParagraphs.length,
      phrasal: phrasalParagraphs.length,
      merged: merged.length,
    },
    metrics: metrics(mergedText, merged.length),
    typeTransitions: merged.slice(1).reduce((acc, item, index) => {
      const key = `${merged[index].type}->${item.type}`
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {}),
  }

  merged.forEach((item, index) => {
    const cleaned = item.text.replace(/[\t\r\n]+/gu, ' ').replace(/\s+/gu, ' ').trim()
    dumpLines.push(`${level}\t${index + 1}\t${item.type}\t${item.sourceIndex + 1}\t${cleaned}`)
  })
}

await writeFile('.github/story-audit-summary.json', `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
await writeFile('.github/story-audit-dump.tsv', `${dumpLines.join('\n')}\n`, 'utf8')
console.log('Story audit dump written.')
