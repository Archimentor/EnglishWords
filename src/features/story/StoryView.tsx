import type { StoryContent, WordItem } from '../../domain/content/types'

interface StoryViewProps {
  story: StoryContent
  levelWords: readonly WordItem[]
  targetWordCount: number
}

function percent(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`
}

function yesNo(value: boolean): string {
  return value ? '예' : '아니요'
}

export function StoryView({ story, levelWords, targetWordCount }: StoryViewProps) {
  const levelLemmas = new Set(levelWords.map(({ lemma }) => lemma))
  const coveredLemmas = new Set(
    story.usedWords
      .map(({ lemma }) => lemma)
      .filter((lemma) => levelLemmas.has(lemma)),
  )
  const coveredCount = coveredLemmas.size
  const targetRate = targetWordCount > 0 ? coveredCount / targetWordCount : 0

  return (
    <article className="view view--story reading-sheet" aria-labelledby="story-title">
      <header className="feature-header">
        <p>{`${story.level} · 스키마 ${story.schemaVersion}`}</p>
        <h2 id="story-title">{story.title}</h2>
      </header>
      <p className="story-body">{story.storyText}</p>

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
            {story.usedWords.map((word, index) => (
              <li key={`${word.lemma}-${word.partOfSpeech}-${index}`}>
                {`${word.lemma} · ${word.partOfSpeech} · ${word.forms.join(', ')}`}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  )
}
