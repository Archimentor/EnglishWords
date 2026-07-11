import { useId } from 'react'
import type { StudyItem } from '../../domain/content/types'

interface FlashcardProps {
  item: StudyItem
  flipped: boolean
  onToggle: () => void
  onSpeak: () => void
}

export function Flashcard({ item, flipped, onToggle, onSpeak }: FlashcardProps) {
  const detailsId = useId()

  return (
    <article className="flashcard" data-state={flipped ? 'flipped' : 'front'}>
      <button
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
          <h3>뜻</h3>
          <ul>
            {item.meanings.map((meaning) => <li key={meaning}>{meaning}</li>)}
          </ul>
          <h3>예문</h3>
          <ul>
            {item.examples.map((example) => <li key={example}>{example}</li>)}
          </ul>
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
