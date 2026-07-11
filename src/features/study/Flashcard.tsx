import type { StudyItem } from '../../domain/content/types'

interface FlashcardProps {
  item: StudyItem
  flipped: boolean
  onToggle: () => void
  onSpeak: () => void
}

export function Flashcard({ item, flipped, onToggle, onSpeak }: FlashcardProps) {
  return (
    <article>
      <button
        type="button"
        aria-label={`${item.term} 카드 뒤집기`}
        aria-pressed={flipped}
        onClick={onToggle}
      >
        <strong>{item.term}</strong>
        <span>{item.ipa ?? '발음기호 없음'}</span>
        {flipped ? (
          <span>
            <span>뜻</span>
            <ul>
              {item.meanings.map((meaning) => <li key={meaning}>{meaning}</li>)}
            </ul>
            <span>예문</span>
            <ul>
              {item.examples.map((example) => <li key={example}>{example}</li>)}
            </ul>
          </span>
        ) : null}
      </button>
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
