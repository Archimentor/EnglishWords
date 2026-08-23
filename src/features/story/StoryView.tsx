import { useMemo, useRef, useState } from 'react'
import type {
  PhrasalVerbItem,
  StoryContent,
  WordEntry,
  WordItem,
} from '../../domain/content/types'
import type { SpeechPort } from '../study/speech'
import { curatedStoryText } from './curatedStories'
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

  const displayStoryText = curatedStoryText(story)

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
    const paragraphs = tokenizeStoryParagraphs(
      displayStoryText,
      story.usedWords,
      lookupWords,
    ).map((tokens) => tokens.map((token) => ({
      ...token,
      tokenIndex: tokenIndex++,
    })))

    return {
      coveredCount: coveredLemmas.size,
      coveredPhrasalVerbCount: coveredPhrasalIds.size,
      readingParagraphs: paragraphs,
      phrasalVerbsById: phrasalById,
    }
  }, [displayStoryText, levelPhrasalVerbs, levelWords, lookupWords, story])

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

  function renderTokens(tokens: (typeof readingParagraphs)[number]) {
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
            본문은 레벨에 맞춰 다시 쓴 완결형 소설입니다. 밑줄 친 단어를 누르면 뜻과 예문이 바로 열립니다.
          </p>
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
            key={`${story.level}-${activeSelectedPhrasalVerb.item.id}`}
            item={activeSelectedPhrasalVerb.item}
            speech={speech}
            onClose={closeDetail}
          />
        ) : null}
      </div>

      <div className="story-meta-grid">
        <section className="panel" aria-labelledby="story-coverage-title">
          <h3 id="story-coverage-title">학습 데이터 커버리지</h3>
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
          <p>
            전체 단어·구동사 커버리지는 학습 데이터 기준입니다. 소설 본문에는 이야기에 자연스럽고 레벨에 맞는 표현만 사용합니다.
          </p>
        </section>

        <section className="panel" aria-labelledby="story-words-title">
          <h3 id="story-words-title">전체 학습 단어</h3>
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
              {`학습 단어 더 보기 (${story.usedWords.length - visibleWords.length}개 남음)`}
            </button>
          ) : null}
        </section>

        <section className="panel" aria-labelledby="story-phrasal-verbs-title">
          <h3 id="story-phrasal-verbs-title">전체 학습 구동사</h3>
          <ul>
            {visiblePhrasalVerbs.map((use) => {
              const item = phrasalVerbsById.get(use.id)
              return (
                <li key={use.id}>
                  {item ? (
                    <button
                      type="button"
                      className="story-word-button story-phrasal-button"
                      aria-label={`story phrasal verb: ${item.phrasalVerb}`}
                      aria-expanded={activeSelectedPhrasalVerb?.item.id === item.id}
                      aria-controls={activeSelectedPhrasalVerb?.item.id === item.id
                        ? 'story-word-detail'
                        : undefined}
                      onClick={(event) => {
                        selectedTriggerRef.current = event.currentTarget
                        setSelectedWord(null)
                        setSelectedPhrasalVerb({ story, item })
                      }}
                    >
                      {item.phrasalVerb}
                    </button>
                  ) : use.phrasalVerb}
                </li>
              )
            })}
          </ul>
          {visiblePhrasalVerbs.length < story.usedPhrasalVerbs.length ? (
            <button
              className="button button--secondary story-load-more"
              type="button"
              onClick={() => setVisiblePhrasalVerbCount((count) => count + USED_WORD_PAGE_SIZE)}
            >
              {`학습 구동사 더 보기 (${story.usedPhrasalVerbs.length - visiblePhrasalVerbs.length}개 남음)`}
            </button>
          ) : null}
        </section>
      </div>
    </article>
  )
}
