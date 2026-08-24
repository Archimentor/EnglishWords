import { useMemo, useRef, useState } from 'react'
import type {
  PhrasalVerbItem,
  StoryContent,
  WordEntry,
  WordItem,
} from '../../domain/content/types'
import { buildReaderStoryText } from '../../domain/content/readerStory'
import type { SpeechPort } from '../study/speech'
import { curatedStoryText } from './curatedStories'
import { StoryPhrasalVerbDetail } from './StoryPhrasalVerbDetail'
import { StoryWordDetail } from './StoryWordDetail'
import { tokenizeStoryParagraphs } from './storyTokens'
import './story.css'

const STORY_PARAGRAPH_PAGE_SIZE = 4
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

export function StoryView({
  story,
  levelWords,
  levelPhrasalVerbs = EMPTY_PHRASAL_VERBS,
  lookupWords = levelWords,
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
    tokenIndex: number
    item: PhrasalVerbItem
  } | null>(null)
  const [selectedStory, setSelectedStory] = useState(story)
  const [visibleParagraphCount, setVisibleParagraphCount] = useState(STORY_PARAGRAPH_PAGE_SIZE)
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null)

  if (selectedStory !== story) {
    setSelectedStory(story)
    setSelectedWord(null)
    setSelectedPhrasalVerb(null)
    setVisibleParagraphCount(STORY_PARAGRAPH_PAGE_SIZE)
  }

  const curatedText = curatedStoryText(story)
  const displayStoryText = useMemo(
    () => buildReaderStoryText(
      curatedText,
      story.level,
      levelWords,
      levelPhrasalVerbs,
      lookupWords,
    ),
    [curatedText, levelPhrasalVerbs, levelWords, lookupWords, story.level],
  )

  const readingParagraphs = useMemo(() => {
    let tokenIndex = 0
    return tokenizeStoryParagraphs(
      displayStoryText,
      story.usedWords,
      lookupWords,
      levelPhrasalVerbs,
    ).map((tokens) => tokens.map((token) => ({
      ...token,
      tokenIndex: tokenIndex++,
    })))
  }, [displayStoryText, levelPhrasalVerbs, lookupWords, story.usedWords])

  const activeSelectedWord = selectedWord?.story === story ? selectedWord : null
  const activeSelectedPhrasalVerb = selectedPhrasalVerb?.story === story
    ? selectedPhrasalVerb
    : null
  const paragraphLimit = Math.min(visibleParagraphCount, readingParagraphs.length)
  const visibleReadingParagraphs = readingParagraphs.slice(0, paragraphLimit)

  function closeDetail() {
    setSelectedWord(null)
    setSelectedPhrasalVerb(null)
    selectedTriggerRef.current?.focus()
  }

  function renderTokens(tokens: (typeof readingParagraphs)[number]) {
    return tokens.map((token) => {
      if (token.type === 'text') {
        return <span key={`text-${token.tokenIndex}`}>{token.value}</span>
      }

      if (token.type === 'phrasalVerb') {
        const isSelected = activeSelectedPhrasalVerb?.tokenIndex === token.tokenIndex
        return (
          <button
            key={`phrasal-${token.tokenIndex}`}
            ref={isSelected ? selectedTriggerRef : undefined}
            type="button"
            className="story-inline-phrasal-button"
            aria-label={`story phrasal verb: ${token.value}`}
            aria-expanded={isSelected}
            aria-controls={isSelected ? 'story-word-detail' : undefined}
            onClick={(event) => {
              selectedTriggerRef.current = event.currentTarget
              setSelectedWord(null)
              setSelectedPhrasalVerb({
                story,
                tokenIndex: token.tokenIndex,
                item: token.phrasalVerb,
              })
            }}
          >
            {token.value}
          </button>
        )
      }

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
              word: token.word,
              entry: token.entry,
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
        <p>{story.level}</p>
        <h2 id="story-title">{story.title}</h2>
      </header>

      <div className="story-reading-layout">
        <div className="story-reading-column">
          <div className="story-body">
            {visibleReadingParagraphs.map((tokens, paragraphIndex) => (
              <section className="story-phrasal-scene" key={`paragraph-${paragraphIndex}`}>
                <p className="story-paragraph">{renderTokens(tokens)}</p>
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
            key={`${story.level}-${activeSelectedPhrasalVerb.tokenIndex}`}
            item={activeSelectedPhrasalVerb.item}
            speech={speech}
            onClose={closeDetail}
          />
        ) : null}
      </div>
    </article>
  )
}
