import { useMemo, useRef, useState } from 'react'
import type {
  Level,
  PhrasalVerbItem,
  StoryContent,
  WordEntry,
  WordItem,
} from '../../domain/content/types'
import type { SpeechPort } from '../study/speech'
import { StoryPhrasalVerbDetail } from './StoryPhrasalVerbDetail'
import { StoryWordDetail } from './StoryWordDetail'
import { tokenizeStoryParagraphs } from './storyTokens'

const STORY_PARAGRAPH_PAGE_SIZE = 4
const USED_WORD_PAGE_SIZE = 100
const EMPTY_PHRASAL_VERBS: readonly PhrasalVerbItem[] = []

interface StoryViewProps {
  story: StoryContent
  levelWords: readonly WordItem[]
  levelPhrasalVerbs?: readonly PhrasalVerbItem[]
  lookupWords?: readonly WordItem[]
  targetWordCount: number
  targetPhrasalVerbCount?: number
  speech?: SpeechPort | null
}

const GENERATED_STAGE_OPENINGS = [
  /^The [^.]+ had a blue line\. Mina began a new walk with the [^.]+\.\s*/u,
  /^The [^.]+ became dark, and rain fell\. Mina was afraid, but the [^.]+ was with her\.\s*/u,
  /^The map did not have the road\. Mina listened to the [^.]+ and changed her plan\.\s*/u,
  /^At a dark old house, Mina found the family from the picture\. The door was closed, and they asked for help\.\s*/u,
  /^The red line ended at the [^.]+\. Mina carried the pages with her\.\s*/u,
] as const

const GENERATED_STAGE_CLOSINGS = [
  /\s*Mina put the page on the map and followed the red line\.$/u,
  /\s*The new picture had a road for Mina\. She held the [^.]+ and went on\.$/u,
  /\s*Mina joined the lines and made a new plan\. She went on with the [^.]+\.$/u,
  /\s*The picture became clear, and Mina opened a new door\. The family followed her\.$/u,
  /\s*The pages made a full picture\. Mina found the way, and the family was happy\.$/u,
] as const

const GENERATED_VOICE_PREFIX = /(?:A child read from the page|A woman wrote on the page|A boy talked to Mina|A girl called from the city|The picture opened, and Mina heard):/gu

const NARRATIVE_LEADS = [
  'Mina read:',
  'A note beside it said:',
  'Another line read:',
  'Someone nearby said:',
  'The next message said:',
  'A voice from the page added:',
  'Farther down, Mina found:',
  'Another clue read:',
  'The page continued:',
  'A small note said:',
  'The next line said:',
  'One final message read:',
] as const

function smoothVocabularyParagraph(paragraph: string, paragraphIndex: number): string {
  let smoothed = paragraph.trim()
  for (const pattern of GENERATED_STAGE_OPENINGS) smoothed = smoothed.replace(pattern, '')
  for (const pattern of GENERATED_STAGE_CLOSINGS) smoothed = smoothed.replace(pattern, '')

  let voiceIndex = 0
  smoothed = smoothed.replace(GENERATED_VOICE_PREFIX, () => {
    const lead = NARRATIVE_LEADS[(paragraphIndex * 3 + voiceIndex) % NARRATIVE_LEADS.length]!
    voiceIndex += 1
    return lead
  })
  return smoothed.replace(/\s+/gu, ' ').trim()
}

function smoothVocabularyPracticeText(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/u)
    .filter((paragraph) => paragraph.trim())
    .map(smoothVocabularyParagraph)
    .join('\n\n')
}

const PHRASAL_SCENE_FRAMES: Record<Level, {
  openings: readonly string[]
  closings: readonly string[]
}> = {
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
  'The first account said:',
  'Another message read:',
  'A second source added:',
  'One more note said:',
  'The last account in the group read:',
] as const

function buildPhrasalNarrativeParagraph(
  level: Level,
  paragraphIndex: number,
  uses: StoryContent['usedPhrasalVerbs'],
  fallback: string,
): string {
  if (uses.length === 0) return fallback
  const frame = PHRASAL_SCENE_FRAMES[level]
  const opening = frame.openings[paragraphIndex % frame.openings.length]!
  const closing = frame.closings[paragraphIndex % frame.closings.length]!
  const evidence = uses.map((use, index) =>
    `${PHRASAL_SCENE_LEADS[index % PHRASAL_SCENE_LEADS.length]} ${use.example}`)
  return [opening, ...evidence, closing].join(' ')
}

function percent(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`
}

function yesNo(value: boolean): string {
  return value ? '예' : '아니요'
}

export function StoryView({
  story,
  levelWords,
  levelPhrasalVerbs = EMPTY_PHRASAL_VERBS,
  lookupWords = levelWords,
  targetWordCount,
  targetPhrasalVerbCount = 0,
  speech = null,
}: StoryViewProps) {
  const [selectedWord, setSelectedWord] = useState<{
    story: StoryContent
    tokenIndex: number
    surface: string
    word: WordItem
    entry: WordEntry
  } | null>(null)
  const [selectedPhrasalVerb, setSelectedPhrasalVerb] = useState<{
    story: StoryContent
    item: PhrasalVerbItem
  } | null>(null)
  const [selectedStory, setSelectedStory] = useState(story)
  const [visibleParagraphCount, setVisibleParagraphCount] = useState(STORY_PARAGRAPH_PAGE_SIZE)
  const [visibleWordCount, setVisibleWordCount] = useState(USED_WORD_PAGE_SIZE)
  const [visiblePhrasalVerbCount, setVisiblePhrasalVerbCount] = useState(USED_WORD_PAGE_SIZE)
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null)

  if (selectedStory !== story) {
    setSelectedStory(story)
    setSelectedWord(null)
    setSelectedPhrasalVerb(null)
    setVisibleParagraphCount(STORY_PARAGRAPH_PAGE_SIZE)
    setVisibleWordCount(USED_WORD_PAGE_SIZE)
    setVisiblePhrasalVerbCount(USED_WORD_PAGE_SIZE)
  }

  const {
    coveredCount,
    coveredPhrasalVerbCount,
    readingParagraphs,
    phrasalVerbsById,
  } = useMemo(() => {
    const levelLemmas = new Set(levelWords.map(({ lemma }) => lemma))
    const coveredLemmas = new Set(
      story.usedWords
        .map(({ lemma }) => lemma)
        .filter((lemma) => levelLemmas.has(lemma)),
    )
    const levelPhrasalIds = new Set(levelPhrasalVerbs.map(({ id }) => id))
    const coveredPhrasalIds = new Set(
      story.usedPhrasalVerbs
        .map(({ id }) => id)
        .filter((id) => levelPhrasalIds.has(id)),
    )
    const phrasalById = new Map(levelPhrasalVerbs.map((item) => [item.id, item]))

    let tokenIndex = 0
    const tokenizeParagraphs = (text: string) =>
      tokenizeStoryParagraphs(text, story.usedWords, lookupWords).map((tokens) => tokens.map((token) => ({
        ...token,
        tokenIndex: tokenIndex++,
      })))

    const storyParagraphs = tokenizeParagraphs(story.storyText)
    const vocabularyNarrativeText = smoothVocabularyPracticeText(story.vocabularyPracticeText)
    const vocabularyParagraphs = tokenizeParagraphs(vocabularyNarrativeText)
    const phrasalRawParagraphs = story.phrasalVerbPracticeText
      .trim()
      .split(/\n\s*\n/u)
      .filter((paragraph) => paragraph.trim())
    const phrasalUsesByParagraph = phrasalRawParagraphs.map((paragraph) =>
      story.usedPhrasalVerbs.filter(({ example }) => paragraph.includes(example)))
    const phrasalNarrativeText = phrasalRawParagraphs
      .map((paragraph, paragraphIndex) => buildPhrasalNarrativeParagraph(
        story.level,
        paragraphIndex,
        phrasalUsesByParagraph[paragraphIndex] ?? [],
        paragraph,
      ))
      .join('\n\n')
    const phrasalParagraphs = tokenizeParagraphs(phrasalNarrativeText)

    type TokenParagraph = (typeof storyParagraphs)[number]
    type ReadingParagraph = {
      tokens: TokenParagraph
      phrasalUses: StoryContent['usedPhrasalVerbs']
    }

    const supplementalParagraphs: ReadingParagraph[] = []
    const supplementalCount = Math.max(vocabularyParagraphs.length, phrasalParagraphs.length)
    for (let index = 0; index < supplementalCount; index += 1) {
      const vocabulary = vocabularyParagraphs[index]
      if (vocabulary) supplementalParagraphs.push({ tokens: vocabulary, phrasalUses: [] })
      const phrasal = phrasalParagraphs[index]
      if (phrasal) {
        supplementalParagraphs.push({
          tokens: phrasal,
          phrasalUses: phrasalUsesByParagraph[index] ?? [],
        })
      }
    }

    const mergedParagraphs: ReadingParagraph[] = []
    if (storyParagraphs.length === 0) {
      mergedParagraphs.push(...supplementalParagraphs)
    } else {
      let supplementalIndex = 0
      storyParagraphs.forEach((tokens, storyIndex) => {
        mergedParagraphs.push({ tokens, phrasalUses: [] })
        const targetSupplementalCount = Math.round(
          ((storyIndex + 1) * supplementalParagraphs.length) / storyParagraphs.length,
        )
        while (supplementalIndex < targetSupplementalCount) {
          const supplemental = supplementalParagraphs[supplementalIndex]
          if (supplemental) mergedParagraphs.push(supplemental)
          supplementalIndex += 1
        }
      })
      mergedParagraphs.push(...supplementalParagraphs.slice(supplementalIndex))
    }

    return {
      coveredCount: coveredLemmas.size,
      coveredPhrasalVerbCount: coveredPhrasalIds.size,
      readingParagraphs: mergedParagraphs,
      phrasalVerbsById: phrasalById,
    }
  }, [levelPhrasalVerbs, levelWords, lookupWords, story])

  const targetRate = targetWordCount > 0 ? coveredCount / targetWordCount : 0
  const phrasalTargetRate = targetPhrasalVerbCount > 0
    ? coveredPhrasalVerbCount / targetPhrasalVerbCount
    : 0
  const combinedCoveredCount = coveredCount + coveredPhrasalVerbCount
  const combinedCatalogCount = levelWords.length + levelPhrasalVerbs.length
  const combinedTargetCount = targetWordCount + targetPhrasalVerbCount
  const activeSelectedWord = selectedWord?.story === story ? selectedWord : null
  const activeSelectedPhrasalVerb = selectedPhrasalVerb?.story === story
    ? selectedPhrasalVerb
    : null
  const paragraphLimit = Math.min(visibleParagraphCount, readingParagraphs.length)
  const visibleReadingParagraphs = readingParagraphs.slice(0, paragraphLimit)
  const visibleWords = story.usedWords.slice(0, visibleWordCount)
  const visiblePhrasalVerbs = story.usedPhrasalVerbs.slice(0, visiblePhrasalVerbCount)

  function closeDetail() {
    setSelectedWord(null)
    setSelectedPhrasalVerb(null)
    selectedTriggerRef.current?.focus()
  }

  function renderTokens(tokens: (typeof readingParagraphs)[number]['tokens']) {
    return tokens.map((token) => {
      if (token.type === 'text') {
        return <span key={`text-${token.tokenIndex}`}>{token.value}</span>
      }

      if (!token.word || !token.entry) return null

      const isSelected = activeSelectedWord?.tokenIndex === token.tokenIndex
      return (
        <button
          key={`word-${token.tokenIndex}`}
          ref={isSelected ? selectedTriggerRef : undefined}
          type="button"
          className="story-word-button"
          aria-label={`story word: ${token.value}`}
          aria-expanded={isSelected}
          aria-controls={isSelected ? 'story-word-detail' : undefined}
          onClick={(event) => {
            selectedTriggerRef.current = event.currentTarget
            setSelectedPhrasalVerb(null)
            setSelectedWord({
              story,
              tokenIndex: token.tokenIndex,
              surface: token.value,
              word: token.word!,
              entry: token.entry!,
            })
          }}
        >
          {token.value}
        </button>
      )
    })
  }

  return (
    <article
      className="view view--story reading-sheet"
      aria-labelledby="story-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && (activeSelectedWord || activeSelectedPhrasalVerb)) {
          event.preventDefault()
          closeDetail()
        }
      }}
    >
      <header className="feature-header">
        <p>{`${story.level} · 스키마 ${story.schemaVersion}`}</p>
        <h2 id="story-title">{story.title}</h2>
      </header>
      <div className="story-reading-layout">
        <div className="story-reading-column">
          <p className="story-reading-hint">
            밑줄 친 단어와 구동사를 누르면 뜻과 예문이 바로 열립니다.
          </p>
          <div className="story-body">
            {visibleReadingParagraphs.map(({ tokens, phrasalUses }, paragraphIndex) => (
              <section className="story-phrasal-scene" key={`paragraph-${paragraphIndex}`}>
                <p className="story-paragraph">{renderTokens(tokens)}</p>
                {phrasalUses.length > 0 ? (
                  <div className="story-phrasal-scene__terms">
                    {phrasalUses.map((use) => {
                      const item = phrasalVerbsById.get(use.id)
                      if (!item) return null
                      const isSelected = activeSelectedPhrasalVerb?.item.id === item.id
                      return (
                        <button
                          key={item.id}
                          ref={isSelected ? selectedTriggerRef : undefined}
                          type="button"
                          className="story-word-button story-phrasal-button"
                          aria-label={`story phrasal verb: ${item.phrasalVerb}`}
                          aria-expanded={isSelected}
                          aria-controls={isSelected ? 'story-word-detail' : undefined}
                          onClick={(event) => {
                            selectedTriggerRef.current = event.currentTarget
                            setSelectedWord(null)
                            setSelectedPhrasalVerb({ story, item })
                          }}
                        >
                          {item.phrasalVerb}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
          {paragraphLimit < readingParagraphs.length ? (
            <button
              className="button button--secondary story-load-more"
              type="button"
              onClick={() => setVisibleParagraphCount((count) =>
                count + STORY_PARAGRAPH_PAGE_SIZE)}
            >
              {`다음 이야기 보기 (${readingParagraphs.length - paragraphLimit}개 문단 남음)`}
            </button>
          ) : null}
        </div>

        {activeSelectedWord ? (
          <StoryWordDetail
            key={`${story.level}-${activeSelectedWord.tokenIndex}`}
            word={activeSelectedWord.word}
            entry={activeSelectedWord.entry}
            speechText={activeSelectedWord.surface}
            speech={speech}
            onClose={closeDetail}
          />
        ) : activeSelectedPhrasalVerb ? (
          <StoryPhrasalVerbDetail
            key={`${story.level}-${activeSelectedPhrasalVerb.item.id}`}
            item={activeSelectedPhrasalVerb.item}
            speech={speech}
            onClose={closeDetail}
          />
        ) : null}
      </div>

      <div className="story-meta-grid">
        <section className="panel" aria-labelledby="story-coverage-title">
          <h3 id="story-coverage-title">커버리지 정보</h3>
          <ul>
            <li>{`수동 작성: ${yesNo(story.isManual)}`}</li>
            <li>{`통합 단어장 전체 포함: ${yesNo(story.coverage.mustCoverAll)}`}</li>
            <li>{`상위 레벨 단어 허용: ${yesNo(story.coverage.allowUpperLevelWords)}`}</li>
            <li>{`현재 대표 데이터 커버리지 ${percent(story.coverage.coverageRate)}`}</li>
            <li>{`일반 단어 ${coveredCount} / ${levelWords.length}`}</li>
            <li>{`구동사 ${coveredPhrasalVerbCount} / ${levelPhrasalVerbs.length}`}</li>
            <li>{`릴리스 목표 대비 ${coveredCount} / ${targetWordCount} (${percent(targetRate)})`}</li>
            <li>{`구동사 목표 대비 ${coveredPhrasalVerbCount} / ${targetPhrasalVerbCount} (${percent(phrasalTargetRate)})`}</li>
            <li>{`통합 단어장 ${combinedCoveredCount} / ${combinedCatalogCount}`}</li>
            <li>{`통합 릴리스 목표 ${combinedCoveredCount} / ${combinedTargetCount}`}</li>
          </ul>
        </section>

        <section className="panel" aria-labelledby="story-words-title">
          <h3 id="story-words-title">사용 단어</h3>
          <ul>
            {visibleWords.map((word, index) => (
              <li key={`${word.lemma}-${word.partOfSpeech}-${index}`}>
                {`${word.lemma} · ${word.partOfSpeech} · ${word.forms.join(', ')}`}
              </li>
            ))}
          </ul>
          {visibleWords.length < story.usedWords.length ? (
            <button
              className="button button--secondary story-load-more"
              type="button"
              onClick={() => setVisibleWordCount((count) => count + USED_WORD_PAGE_SIZE)}
            >
              {`사용 단어 더 보기 (${story.usedWords.length - visibleWords.length}개 남음)`}
            </button>
          ) : null}
        </section>

        <section className="panel" aria-labelledby="story-phrasal-verbs-title">
          <h3 id="story-phrasal-verbs-title">사용 구동사</h3>
          <ul>
            {visiblePhrasalVerbs.map((item) => (
              <li key={item.id}>{`${item.phrasalVerb} · ${item.example}`}</li>
            ))}
          </ul>
          {visiblePhrasalVerbs.length < story.usedPhrasalVerbs.length ? (
            <button
              className="button button--secondary story-load-more"
              type="button"
              onClick={() => setVisiblePhrasalVerbCount((count) => count + USED_WORD_PAGE_SIZE)}
            >
              {`사용 구동사 더 보기 (${story.usedPhrasalVerbs.length - visiblePhrasalVerbs.length}개 남음)`}
            </button>
          ) : null}
        </section>
      </div>
    </article>
  )
}
