import type { WordEntry, WordItem } from '../../domain/content/types'

interface StoryWordDetailProps {
  word: WordItem
  entry: WordEntry
  onClose: () => void
}

function formatForms(forms: WordEntry['forms']): string {
  return (Array.isArray(forms) ? forms : Object.values(forms)).join(', ')
}

export function StoryWordDetail({
  word,
  entry,
  onClose,
}: StoryWordDetailProps) {
  return (
    <aside
      id="story-word-detail"
      className="story-word-detail"
      aria-labelledby="story-word-detail-title"
    >
      <div className="story-word-detail__header">
        <h3 id="story-word-detail-title">{`${word.word} 단어 상세`}</h3>
        <button type="button" className="button--secondary" onClick={onClose}>
          닫기
        </button>
      </div>
      <p>{`품사: ${entry.partOfSpeech}`}</p>
      <p>{entry.ipa}</p>
      <p>{`형태: ${formatForms(entry.forms)}`}</p>
      <h4>뜻</h4>
      <ul>
        {entry.meanings.map((meaning) => (
          <li key={meaning}>{meaning}</li>
        ))}
      </ul>
      <h4>예문</h4>
      <ul>
        {entry.examples.map((example) => (
          <li key={example}>{example}</li>
        ))}
      </ul>
    </aside>
  )
}
