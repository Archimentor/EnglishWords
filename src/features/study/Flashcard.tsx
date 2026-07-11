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
    <article>
      <button
        type="button"
        aria-label={`${item.term} 카드 뒤집기`}
        aria-pressed={flipped}
        aria-expanded={flipped}
        aria-controls={detailsId}
        onClick={onToggle}
      >
        <strong>{item.term}</strong>
        <span>{item.ipa ?? '발음기호 없음'}</span>
      </button>
      {flipped ? (
        <section id={detailsId} aria-label={`${item.term} 카드 내용`}>
          <h3>뜻</h3>
          <ul>
            {item.meanings.map((meaning) => <li key={meaning}>{meaning}</li>)}
          </ul>
          <h3>예문</h3>
          <ul>
            {item.examples.map((example) => <li key={example}>{example}</li>)}
          </ul>
        </section>
      ) : null}
      <button
        type="button"
        aria-label={`${item.term} 발음 듣기`}
        onClick={onSpeak}
      >
        발음 듣기
      </button>
    </article>
  )
}
