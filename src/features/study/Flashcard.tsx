import { useId, type Ref } from 'react'
import { formatWordForms } from '../../domain/content/formatForms'
import type { StudyItem } from '../../domain/content/types'

interface FlashcardProps {
  item: StudyItem
  flipped: boolean
  onToggle: () => void
  onSpeak: () => void
  buttonRef?: Ref<HTMLButtonElement>
}

export function Flashcard({
  item,
  flipped,
  onToggle,
  onSpeak,
  buttonRef,
}: FlashcardProps) {
  const detailsId = useId()

  return (
    <article className="flashcard" data-state={flipped ? 'flipped' : 'front'}>
      <button
        ref={buttonRef}
        className="flashcard-face"
        type="button"
        aria-label={`${item.term} 카드 뒤집기`}
        aria-pressed={flipped}
        aria-expanded={flipped}
        aria-controls={detailsId}
        onClick={onToggle}
      >
        <strong className="flashcard-term">{item.term}</strong>
        <span className="flashcard-ipa">{item.ipa ?? '발음기호 없음'}</span>
      </button>
      <section
        id={detailsId}
        className="flashcard-details"
        aria-label={`${item.term} 카드 내용`}
        hidden={!flipped}
      >
        <h3 className="visually-hidden">품사별 카드 내용</h3>
        <div className="flashcard-entry-list">
          {item.entries.map((entry, entryIndex) => {
            const headingId = `${detailsId}-entry-${entryIndex}`
            const ipa = entry.ipa.trim()

            return (
              <section
                key={`${entry.partOfSpeech}:${entryIndex}`}
                className="flashcard-entry"
                aria-labelledby={headingId}
              >
                <h4 id={headingId}>
                  {item.kind === 'phrasalVerb' ? '구동사' : entry.partOfSpeech}
                </h4>
                <dl>
                  <dt>형태</dt>
                  <dd>{formatWordForms(entry.forms)}</dd>
                  {ipa ? (
                    <>
                      <dt>발음</dt>
                      <dd>{ipa}</dd>
                    </>
                  ) : null}
                  <dt>뜻</dt>
                  <dd>
                    <ul>
                      {entry.meanings.map((meaning) => <li key={meaning}>{meaning}</li>)}
                    </ul>
                  </dd>
                  <dt>예문</dt>
                  <dd>
                    <ul>
                      {entry.examples.map((example) => <li key={example}>{example}</li>)}
                    </ul>
                  </dd>
                </dl>
              </section>
            )
          })}
        </div>
      </section>
      <button
        className="button button--secondary speech-button"
        type="button"
        aria-label={`${item.term} 발음 듣기`}
        onClick={onSpeak}
      >
        발음 듣기
      </button>
    </article>
  )
}
