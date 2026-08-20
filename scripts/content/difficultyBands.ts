import { DIFFICULTIES } from '../../src/domain/content/types'
import type { Difficulty } from '../../src/domain/content/types'

/** Maps a deterministic within-level rank onto all five learner difficulty bands. */
export function difficultyForPosition(index: number, count: number): Difficulty {
  if (
    !Number.isInteger(index)
    || !Number.isInteger(count)
    || count <= 0
    || index < 0
    || index >= count
  ) {
    throw new RangeError(`Invalid difficulty position ${index} of ${count}.`)
  }

  const band = Math.min(
    DIFFICULTIES.length - 1,
    Math.floor((index * DIFFICULTIES.length) / count),
  )
  return DIFFICULTIES[band]!
}
