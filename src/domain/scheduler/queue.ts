import type { Difficulty, StudyItem } from '../content/types'
import type { DifficultyStats, MistakeRecord } from '../progress/types'
import {
  DIFFICULTY_MATRIX,
  reviewWeight,
  type DifficultyMatrix,
} from './difficulty'

const DEFAULT_QUEUE_LIMIT = 500
const PRIORITY_WINDOW = 3

export interface BuildStudyQueueOptions {
  selectedDifficulty: Difficulty
  mistakes?: Readonly<Record<string, MistakeRecord>>
  difficultyStats?: Partial<Record<Difficulty, DifficultyStats>>
  limit?: number
  random?: () => number
  matrix?: DifficultyMatrix
}

interface WeightedItem {
  item: StudyItem
  key: number
  isPriority: boolean
}

function uniqueById(items: readonly StudyItem[]): StudyItem[] {
  const seen = new Set<string>()

  return items.filter(({ id }) => {
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function normalizedLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_QUEUE_LIMIT
  if (!Number.isFinite(limit) || limit <= 0) return 0
  return Math.floor(limit)
}

export function buildStudyQueue(
  candidates: readonly StudyItem[],
  options: BuildStudyQueueOptions,
): StudyItem[] {
  const {
    selectedDifficulty,
    mistakes = {},
    difficultyStats = {},
    random = Math.random,
    matrix = DIFFICULTY_MATRIX,
  } = options
  const limit = normalizedLimit(options.limit)
  if (limit === 0) return []

  const weighted: WeightedItem[] = uniqueById(candidates).map((item) => {
    const mistake = mistakes[item.id]
    const weight = reviewWeight(
      selectedDifficulty,
      item.difficulty,
      difficultyStats[item.difficulty],
      mistake,
      matrix,
    )

    return {
      item,
      key: random() ** (1 / weight),
      isPriority:
        (mistake?.wrongStreak ?? 0) >= 2 &&
        (mistake?.priorityRemaining ?? 0) > 0,
    }
  })

  weighted.sort((left, right) => right.key - left.key)

  const priorityCount = Math.min(PRIORITY_WINDOW, limit)
  const priority = weighted.filter(({ isPriority }) => isPriority).slice(0, priorityCount)
  const priorityIds = new Set(priority.map(({ item }) => item.id))
  const remainder = weighted.filter(({ item }) => !priorityIds.has(item.id))

  return [...priority, ...remainder]
    .slice(0, Math.min(limit, weighted.length))
    .map(({ item }) => item)
}
