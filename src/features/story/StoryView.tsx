import { useMemo, useRef, useState } from 'react'
import type { StoryContent, WordEntry, WordItem } from '../../domain/content/types'
import type { SpeechPort } from '../study/speech'
import { StoryWordDetail } from './StoryWordDetail'
import { tokenizeStoryParagraphs } from './storyTokens'

const STORY_PARAGRAPH_PAGE_SIZE = 4
const PRACTICE_PARAGRAPH_PAGE_SIZE = 2
const USED_WORD_PAGE_SIZE = 100

interface StoryViewProps {
  story: StoryContent
  levelWords: readonly WordItem[]
  lookupWords?: readonly WordItem[]
  targetWordCount: number
  speech?: SpeechPort | null
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
  lookupWords = levelWords,
  targetWordCount,
  speech = null,
}: StoryViewProps) {
  const [selectedWord, setSelectedWord] = useState<{
    story: StoryContent
    tokenIndex: number
    surface: string
    word: WordItem
    entry: WordEntry
  } | null>(null)
  const [selectedStory, setSelectedStory] = useState(story)
  const [visibleParagraphCount, setVisibleParagraphCount] = useState(STORY_PARAGRAPH_PAGE_SIZE)
  const [visiblePracticeParagraphCount, setVisiblePracticeParagraphCount] = useState(
    PRACTICE_PARAGRAPH_PAGE_SIZE,
  )
  const [visibleWordCount, setVisibleWordCount] = useState(USED_WORD_PAGE_SIZE)
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null)

  if (selectedStory !== story) {
    setSelectedStory(story)
    setSelectedWord(null)
    setVisibleParagraphCount(STORY_PARAGRAPH_PAGE_SIZE)
    setVisiblePracticeParagraphCount(PRACTICE_PARAGRAPH_PAGE_SIZE)
    setVisibleWordCount(USED_WORD_PAGE_SIZE)
  }

  const { coveredCount, paragraphs, practiceParagraphs } = useMemo(() => {
    const levelLemmas = new Set(levelWords.map(({ lemma }) => lemma))
    const coveredLemmas = new Set(
      story.usedWords
        .map(({ lemma }) => lemma)
        .filter((lemma) => levelLemmas.has(lemma)),
    )

    let tokenIndex = 0
    const tokenizeParagraphs = (text: string) =>
      tokenizeStoryParagraphs(text, story.usedWords, lookupWords).map((tokens) => tokens.map((token) => ({
        ...token,
        tokenIndex: tokenIndex++,
      })))
    const storyParagraphs = tokenizeParagraphs(story.storyText)
    const vocabularyPracticeParagraphs = tokenizeParagraphs(story.vocabularyPracticeText)

    return {
      coveredCount: coveredLemmas.size,
      paragraphs: storyParagraphs,
      practiceParagraphs: vocabularyPracticeParagraphs,
    }
  }, [levelWords, lookupWords, story])
  const targetRate = targetWordCount > 0 ? coveredCount / targetWordCount : 0
  const activeSelectedWord = selectedWord?.story === story ? selectedWord : null
  const storyParagraphLimit = Math.min(visibleParagraphCount, paragraphs.length)
  const visibleParagraphs = paragraphs.slice(0, storyParagraphLimit)
  const practiceParagraphLimit = Math.min(
    visiblePracticeParagraphCount,
    practiceParagraphs.length,
  )
  const visiblePracticeParagraphs = practiceParagraphs.slice(0, practiceParagraphLimit)
  const visibleWords = story.usedWords.slice(0, visibleWordCount)

  function closeDetail() {
    setSelectedWord(null)
    selectedTriggerRef.current?.focus()
  }

  function renderTokens(tokens: (typeof paragraphs)[number]) {
    return tokens.map((token) => {
      if (token.type === 'text') {
        return <span key={`text-${token.tokenIndex}`}>{token.value}</span>
      }

      if (!token.word || !token.entry) {
        return null
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
        if (event.key === 'Escape' && activeSelectedWord) {
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
          <p className="story-reading-hint">밑줄 친 단어를 누르면 뜻과 예문이 바로 열립니다.</p>
          <div className="story-body">
            {visibleParagraphs.map((tokens, paragraphIndex) => (
              <p className="story-paragraph" key={`paragraph-${paragraphIndex}`}>
                {renderTokens(tokens)}
              </p>
            ))}
          </div>
          {storyParagraphLimit < paragraphs.length ? (
            <button
              className="button button--secondary story-load-more"
              type="button"
              onClick={() => setVisibleParagraphCount((count) =>
                count + STORY_PARAGRAPH_PAGE_SIZE)}
            >
              {`다음 문단 보기 (${paragraphs.length - storyParagraphLimit}개 남음)`}
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
        ) : null}
      </div>

      <details className="panel story-practice">
        <summary>{`어휘 장면 연습 · 전체 ${story.usedWords.length}개 단어`}</summary>
        <p className="story-practice__intro">
          본편의 흐름을 끊지 않도록 전체 단어 커버리지 장면을 별도로 제공합니다.
        </p>
        <div className="story-body story-body--practice">
          {visiblePracticeParagraphs.map((tokens, paragraphIndex) => (
            <p className="story-paragraph" key={`practice-paragraph-${paragraphIndex}`}>
              {renderTokens(tokens)}
            </p>
          ))}
        </div>
        {practiceParagraphLimit < practiceParagraphs.length ? (
          <button
            className="button button--secondary story-load-more"
            type="button"
            onClick={() => setVisiblePracticeParagraphCount((count) =>
              count + PRACTICE_PARAGRAPH_PAGE_SIZE)}
          >
            {`다음 연습 장면 보기 (${practiceParagraphs.length - practiceParagraphLimit}개 남음)`}
          </button>
        ) : null}
      </details>

      <div className="story-meta-grid">
        <section className="panel" aria-labelledby="story-coverage-title">
          <h3 id="story-coverage-title">커버리지 정보</h3>
          <ul>
            <li>{`수동 작성: ${yesNo(story.isManual)}`}</li>
            <li>{`모든 대표 단어 포함: ${yesNo(story.coverage.mustCoverAll)}`}</li>
            <li>{`상위 레벨 단어 허용: ${yesNo(story.coverage.allowUpperLevelWords)}`}</li>
            <li>{`현재 대표 데이터 커버리지 ${percent(story.coverage.coverageRate)}`}</li>
            <li>{`대표 단어 ${coveredCount} / ${levelWords.length}`}</li>
            <li>{`릴리스 목표 대비 ${coveredCount} / ${targetWordCount} (${percent(targetRate)})`}</li>
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
      </div>
    </article>
  )
}
