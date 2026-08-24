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
import { tokenizeKnownWords, tokenizeStoryParagraphs } from './storyTokens'
import './story.css'

const STORY_PARAGRAPH_PAGE_SIZE = 4
const EMPTY_PHRASAL_VERBS: readonly PhrasalVerbItem[] = []

interface StoryViewProps {
  story: StoryContent
  levelWords: readonly WordItem[]
  levelPhrasalVerbs?: readonly PhrasalVerbItem[]
  lookupWords?: readonly WordItem[]
  phrasalLookupWords?: readonly WordItem[]
  targetWordCount: number
  targetPhrasalVerbCount?: number
  speech?: SpeechPort | null
}

export function StoryView({
  story,
  levelWords,
  levelPhrasalVerbs = EMPTY_PHRASAL_VERBS,
  lookupWords = levelWords,
  phrasalLookupWords = lookupWords,
  speech = null,
}: StoryViewProps) {
  const [selectedWord, setSelectedWord] = useState<{
    story: StoryContent
    selectionKey: string
    surface: string
    word: WordItem
    entry: WordEntry
  } | null>(null)
  const [selectedPhrasalVerb, setSelectedPhrasalVerb] = useState<{
    story: StoryContent
    selectionKey: string
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

  function renderWordButton(
    value: string,
    word: WordItem,
    entry: WordEntry,
    selectionKey: string,
    key: string,
  ) {
    const isSelected = activeSelectedWord?.selectionKey === selectionKey
    return (
      <button
        key={key}
        ref={isSelected ? selectedTriggerRef : undefined}
        type="button"
        className="story-word-button"
        aria-label={`story word: ${value}`}
        aria-expanded={isSelected}
        aria-controls={isSelected ? 'story-word-detail' : undefined}
        onClick={(event) => {
          selectedTriggerRef.current = event.currentTarget
          setSelectedPhrasalVerb(null)
          setSelectedWord({ story, selectionKey, surface: value, word, entry })
        }}
      >
        {value}
      </button>
    )
  }

  function renderTokens(tokens: (typeof readingParagraphs)[number]) {
    return tokens.map((token) => {
      if (token.type === 'text') {
        return <span key={`text-${token.tokenIndex}`}>{token.value}</span>
      }

      if (token.type === 'phrasalVerb') {
        const phrasalSelectionKey = `phrasal-${token.tokenIndex}`
        const isSelected = activeSelectedPhrasalVerb?.selectionKey === phrasalSelectionKey
        const wordParts = tokenizeKnownWords(token.value, phrasalLookupWords)
        return (
          <span
            className="story-inline-phrasal"
            key={`phrasal-${token.tokenIndex}`}
            data-phrasal-verb={token.phrasalVerb.phrasalVerb}
          >
            <span className="story-inline-phrasal__words">
              {wordParts.map((part, partIndex) => {
                if (part.type !== 'word') {
                  return (
                    <span key={`phrasal-text-${token.tokenIndex}-${partIndex}`}>
                      {part.value}
                    </span>
                  )
                }
                return renderWordButton(
                  part.value,
                  part.word,
                  part.entry,
                  `phrasal-word-${token.tokenIndex}-${partIndex}`,
                  `phrasal-word-${token.tokenIndex}-${partIndex}`,
                )
              })}
            </span>
            <button
              ref={isSelected ? selectedTriggerRef : undefined}
              type="button"
              className="story-inline-phrasal-meaning-button"
              aria-label={`story phrasal verb: ${token.value}`}
              aria-expanded={isSelected}
              aria-controls={isSelected ? 'story-word-detail' : undefined}
              title={`${token.value} 구동사 뜻 보기`}
              onClick={(event) => {
                selectedTriggerRef.current = event.currentTarget
                setSelectedWord(null)
                setSelectedPhrasalVerb({
                  story,
                  selectionKey: phrasalSelectionKey,
                  item: token.phrasalVerb,
                })
              }}
            />
          </span>
        )
      }

      return renderWordButton(
        token.value,
        token.word,
        token.entry,
        `word-${token.tokenIndex}`,
        `word-${token.tokenIndex}`,
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
            key={`${story.level}-${activeSelectedWord.selectionKey}`}
            word={activeSelectedWord.word}
            entry={activeSelectedWord.entry}
            speechText={activeSelectedWord.surface}
            speech={speech}
            onClose={closeDetail}
          />
        ) : activeSelectedPhrasalVerb ? (
          <StoryPhrasalVerbDetail
            key={`${story.level}-${activeSelectedPhrasalVerb.selectionKey}`}
            item={activeSelectedPhrasalVerb.item}
            speech={speech}
            onClose={closeDetail}
          />
        ) : null}
      </div>
    </article>
  )
}
