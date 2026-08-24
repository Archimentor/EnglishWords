import { useMemo, useRef, useState } from 'react'
import type {
  PhrasalVerbItem,
  StoryContent,
  WordEntry,
  WordItem,
} from '../../domain/content/types'
import { buildReaderEdition } from '../../domain/content/readerEdition'
import {
  readerStoryContextualPhrasalVerbs,
} from '../../domain/content/readerStory'
import type { SpeechPort } from '../study/speech'
import { StoryPhrasalVerbDetail } from './StoryPhrasalVerbDetail'
import { StoryWordDetail } from './StoryWordDetail'
import { tokenizeKnownWords, tokenizeStoryParagraphs } from './storyTokens'
import './story.css'

const EMPTY_PHRASAL_VERBS: readonly PhrasalVerbItem[] = []

interface StoryViewProps {
  story: StoryContent
  levelWords: readonly WordItem[]
  levelPhrasalVerbs?: readonly PhrasalVerbItem[]
  lookupWords?: readonly WordItem[]
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
    selectionKey: string
    surface: string
    word: WordItem
    entry: WordEntry
  } | null>(null)
  const [selectedPhrasalVerb, setSelectedPhrasalVerb] = useState<{
    story: StoryContent
    selectionKey: string
    item: PhrasalVerbItem
    context: string
    meaningKo: string
  } | null>(null)
  const [selectedStory, setSelectedStory] = useState(story)
  const [readerChapterIndex, setReaderChapterIndex] = useState(0)
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null)

  if (selectedStory !== story) {
    setSelectedStory(story)
    setSelectedWord(null)
    setSelectedPhrasalVerb(null)
    setReaderChapterIndex(0)
  }

  const readerEdition = useMemo(
    () => buildReaderEdition(story, lookupWords),
    [lookupWords, story],
  )
  const readerChapter = readerEdition.chapters[readerChapterIndex]!

  const displayStoryText = useMemo(
    () => readerChapter.text.trim(),
    [readerChapter.text],
  )

  const contextualPhrasalVerbs = useMemo(
    () => readerStoryContextualPhrasalVerbs(
      displayStoryText,
      story.usedPhrasalVerbs,
      levelPhrasalVerbs,
    ),
    [displayStoryText, levelPhrasalVerbs, story.usedPhrasalVerbs],
  )

  const readingParagraphs = useMemo(() => {
    let tokenIndex = 0
    return tokenizeStoryParagraphs(
      displayStoryText,
      story.usedWords,
      lookupWords,
      contextualPhrasalVerbs,
    ).map((tokens) => tokens.map((token) => ({
      ...token,
      tokenIndex: tokenIndex++,
    })))
  }, [contextualPhrasalVerbs, displayStoryText, lookupWords, story.usedWords])

  const activeSelectedWord = selectedWord?.story === story ? selectedWord : null
  const activeSelectedPhrasalVerb = selectedPhrasalVerb?.story === story
    ? selectedPhrasalVerb
    : null
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

  function renderTokens(
    tokens: (typeof readingParagraphs)[number],
    namespace = 'narrative',
  ) {
    return tokens.map((token) => {
      if (token.type === 'text') {
        return <span key={`${namespace}-text-${token.tokenIndex}`}>{token.value}</span>
      }

      if (token.type === 'phrasalVerb') {
        const phrasalSelectionKey = `${namespace}-phrasal-${token.tokenIndex}`
        const isSelected = activeSelectedPhrasalVerb?.selectionKey === phrasalSelectionKey
        const wordParts = tokenizeKnownWords(token.value, lookupWords)
        const selectPhrasalVerb = (trigger: HTMLButtonElement) => {
          selectedTriggerRef.current = trigger
          setSelectedWord(null)
          setSelectedPhrasalVerb({
            story,
            selectionKey: phrasalSelectionKey,
            item: token.phrasalVerb,
            context: token.phrasalUse.context,
            meaningKo: token.phrasalUse.meaningKo,
          })
        }
        return (
          <span
            className="story-inline-phrasal"
            key={`${namespace}-phrasal-${token.tokenIndex}`}
            data-phrasal-verb={token.phrasalVerb.phrasalVerb}
          >
            <span className="story-inline-phrasal__words">
              {wordParts.flatMap((part, partIndex) => {
                if (part.type === 'word') {
                  return [renderWordButton(
                    part.value,
                    part.word,
                    part.entry,
                    `${namespace}-phrasal-word-${token.tokenIndex}-${partIndex}`,
                    `${namespace}-phrasal-word-${token.tokenIndex}-${partIndex}`,
                  )]
                }
                return part.value
                  .split(/([\p{L}\p{N}]+(?:['’~-][\p{L}\p{N}]+)*)/gu)
                  .filter(Boolean)
                  .map((value, textPartIndex) => /[\p{L}\p{N}]/u.test(value) ? (
                    <button
                      key={`${namespace}-phrasal-component-${token.tokenIndex}-${partIndex}-${textPartIndex}`}
                      type="button"
                      className="story-phrasal-component-button"
                      aria-label={`story phrasal component: ${value} (${token.value})`}
                      aria-expanded={isSelected}
                      aria-controls={isSelected ? 'story-word-detail' : undefined}
                      onClick={(event) => selectPhrasalVerb(event.currentTarget)}
                    >
                      {value}
                    </button>
                  ) : (
                    <span key={`${namespace}-phrasal-text-${token.tokenIndex}-${partIndex}-${textPartIndex}`}>
                      {value}
                    </span>
                  ))
              })}
            </span>
            <button
              type="button"
              className="story-inline-phrasal__badge"
              aria-label={`story phrasal verb: ${token.value}`}
              aria-expanded={isSelected}
              aria-controls={isSelected ? 'story-word-detail' : undefined}
              title={`${token.value} 구동사 뜻 보기`}
              onClick={(event) => selectPhrasalVerb(event.currentTarget)}
            >
              구
            </button>
          </span>
        )
      }

      return renderWordButton(
        token.value,
        token.word,
        token.entry,
        `${namespace}-word-${token.tokenIndex}`,
        `${namespace}-word-${token.tokenIndex}`,
      )
    })
  }

  function moveReaderChapter(nextIndex: number) {
    setSelectedWord(null)
    setSelectedPhrasalVerb(null)
    setReaderChapterIndex(nextIndex)
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
        <h2 id="story-title">{readerEdition.title}</h2>
      </header>

      <div className="story-reading-layout">
        <div className="story-reading-column">
          <section
            className="story-reader-chapter"
            aria-labelledby={`${readerChapter.id}-title`}
          >
            <header className="story-reader-chapter__header">
              <p>{`챕터 ${readerChapterIndex + 1} / ${readerEdition.chapters.length}`}</p>
              <h3 id={`${readerChapter.id}-title`}>{readerChapter.title}</h3>
            </header>
            <div className="story-body">
              {readingParagraphs.map((tokens, paragraphIndex) => (
                <p className="story-paragraph" key={`paragraph-${paragraphIndex}`}>
                  {renderTokens(tokens)}
                </p>
              ))}
            </div>
          </section>
          <nav className="story-reader-navigation" aria-label="소설 챕터 이동">
            <button
              className="button button--secondary"
              type="button"
              disabled={readerChapterIndex === 0}
              onClick={() => moveReaderChapter(readerChapterIndex - 1)}
            >
              이전 챕터
            </button>
            <span>{`${readerChapterIndex + 1} / ${readerEdition.chapters.length}`}</span>
            <button
              className="button button--secondary"
              type="button"
              disabled={readerChapterIndex === readerEdition.chapters.length - 1}
              onClick={() => moveReaderChapter(readerChapterIndex + 1)}
            >
              {readerChapterIndex === readerEdition.chapters.length - 1
                ? '소설 읽기 완료'
                : `다음 챕터 (${readerChapterIndex + 2})`}
            </button>
          </nav>
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
            context={activeSelectedPhrasalVerb.context}
            meaningKo={activeSelectedPhrasalVerb.meaningKo}
            speech={speech}
            onClose={closeDetail}
          />
        ) : null}
      </div>
    </article>
  )
}
