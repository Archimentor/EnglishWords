import { DIFFICULTIES } from '../../src/domain/content/types'
import { difficultyForPosition } from './difficultyBands'

test.each([5, 250, 500, 1_500, 2_500])(
  'spreads %i ranked items across every difficulty band',
  (count) => {
    const difficulties = Array.from(
      { length: count },
      (_, index) => difficultyForPosition(index, count),
    )

    expect(new Set(difficulties)).toEqual(new Set(DIFFICULTIES))
    for (const difficulty of DIFFICULTIES) {
      const bandCount = difficulties.filter((value) => value === difficulty).length
      expect(bandCount).toBeGreaterThanOrEqual(Math.floor(count / DIFFICULTIES.length))
      expect(bandCount).toBeLessThanOrEqual(Math.ceil(count / DIFFICULTIES.length))
    }
  },
)

test.each([
  [-1, 5],
  [5, 5],
  [0, 0],
  [0.5, 5],
  [0, 5.5],
])('rejects invalid position %s of %s', (index, count) => {
  expect(() => difficultyForPosition(index, count)).toThrow(RangeError)
})
