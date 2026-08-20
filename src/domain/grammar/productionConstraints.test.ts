import { describe, expect, test } from 'vitest'

import type { GrammarLevel } from '../content/types'
import {
  grammarProductionConstraintsForLevel,
  grammarProductionConstraintsMatchLevel,
} from './productionConstraints'

describe('grammar production constraints', () => {
  test.each<{
    level: GrammarLevel
    sentences: readonly [number, number | null]
    partIds: string[]
    requirementIds: string[]
    revisionRounds: number | null
  }>([
    {
      level: 'A1',
      sentences: [4, 6],
      partIds: ['response'],
      requirementIds: [
        'personal-context',
        'yes-no-question',
        'wh-question',
        'target-structure',
      ],
      revisionRounds: null,
    },
    {
      level: 'A2',
      sentences: [6, 8],
      partIds: ['response'],
      requirementIds: [
        'plan',
        'experience',
        'obligation',
        'comparison',
        'relative-clause',
        'target-structure',
      ],
      revisionRounds: null,
    },
    {
      level: 'B1',
      sentences: [8, 12],
      partIds: ['response'],
      requirementIds: ['cause-effect', 'required-clause', 'target-structure'],
      revisionRounds: null,
    },
    {
      level: 'B2',
      sentences: [4, null],
      partIds: ['introduction', 'evidence', 'counterargument', 'conclusion'],
      requirementIds: ['complex-structures'],
      revisionRounds: null,
    },
    {
      level: 'C1',
      sentences: [2, null],
      partIds: ['work-email', 'academic-paragraph'],
      requirementIds: ['same-content', 'register-control'],
      revisionRounds: 2,
    },
  ])('$level profile is a canonical fail-closed contract', ({
    level,
    sentences,
    partIds,
    requirementIds,
    revisionRounds,
  }) => {
    const constraints = grammarProductionConstraintsForLevel(level)

    expect([constraints.minSentences, constraints.maxSentences]).toEqual(sentences)
    expect(constraints.parts.map(({ id }) => id)).toEqual(partIds)
    expect(constraints.evidenceRequirements.map(({ id }) => id)).toEqual(requirementIds)
    expect(constraints.maxRevisionRounds).toBe(revisionRounds)
    expect(constraints.rubricEvidenceCount).toBe(3)
    expect(grammarProductionConstraintsMatchLevel(level, constraints)).toBe(true)
    expect(grammarProductionConstraintsMatchLevel(level, {
      ...constraints,
      minSentences: constraints.minSentences + 1,
    })).toBe(false)
  })

  test('B2 and C1 enforce their cross-part evidence minimums', () => {
    const b2 = grammarProductionConstraintsForLevel('B2')
    const c1 = grammarProductionConstraintsForLevel('C1')

    expect(b2.evidenceRequirements[0]).toMatchObject({
      id: 'complex-structures',
      minSelections: 3,
    })
    expect(c1.parts.map(({ register }) => register)).toEqual([
      'work-email',
      'academic',
    ])
    expect(c1.evidenceRequirements).toEqual([
      expect.objectContaining({
        id: 'same-content',
        minSelections: 2,
        requiredPartIds: ['work-email', 'academic-paragraph'],
      }),
      expect.objectContaining({
        id: 'register-control',
        minSelections: 2,
        requiredPartIds: ['work-email', 'academic-paragraph'],
      }),
    ])
  })
})
