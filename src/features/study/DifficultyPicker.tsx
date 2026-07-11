import { DIFFICULTIES, type Difficulty } from '../../domain/content/types'

const LABELS: Record<Difficulty, string> = {
  veryEasy: '아주쉬움',
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
  veryHard: '아주어려움',
}

interface DifficultyPickerProps {
  value: Difficulty
  onChange: (value: Difficulty) => void
}

export function DifficultyPicker({ value, onChange }: DifficultyPickerProps) {
  return (
    <fieldset>
      <legend>학습 난이도</legend>
      {DIFFICULTIES.map((difficulty) => (
        <button
          key={difficulty}
          type="button"
          aria-pressed={value === difficulty}
          onClick={() => onChange(difficulty)}
        >
          {LABELS[difficulty]}
        </button>
      ))}
    </fieldset>
  )
}
