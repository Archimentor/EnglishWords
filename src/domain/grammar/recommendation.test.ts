import type { GrammarNode } from '../content/types'
import { makeGrammarNodes } from '../../test/fixtures'
import {
  emptyGrammarMastery,
  type GrammarMastery,
} from './mastery'
import { selectGrammarLearningPlan } from './recommendation'

function mastery(overrides: Partial<GrammarMastery> = {}): GrammarMastery {
  return {
    ...emptyGrammarMastery(),
    ...overrides,
  }
}

function completedMastery(
  rediagnosticAttempts = 1,
): GrammarMastery {
  return mastery({
    attempts: 3,
    correct: 3,
    diagnosticAttempts: 1,
    practiceAttempts: 1,
    rediagnosticAttempts,
    productionAttempts: 1,
    productionPassed: true,
    completed: true,
  })
}

function readyForRediagnosis(node: GrammarNode): GrammarMastery {
  const diagnostic = node.exercises.find(({ phase }) => phase === 'diagnostic')!
  const practice = node.exercises.find(({ phase }) => phase === 'practice')!
  return mastery({
    attempts: 2,
    correct: 2,
    diagnosticAttempts: 1,
    practiceAttempts: 1,
    productionAttempts: 1,
    productionPassed: true,
    errorCounts: { 'WO-01': 2 },
    retryCount: 2,
    exerciseResults: {
      [diagnostic.id]: {
        phase: diagnostic.phase,
        correct: true,
        errorCode: diagnostic.errorCode,
      },
      [practice.id]: {
        phase: practice.phase,
        correct: true,
        errorCode: practice.errorCode,
      },
    },
  })
}

describe('selectGrammarLearningPlan', () => {
  it('is deterministic and never recommends a locked node or stale mastery', () => {
    const nodes = makeGrammarNodes().slice(0, 3)
    const masteryByNode = {
      'A1-G02': mastery({
        attempts: 7,
        retryCount: 7,
        errorCounts: { 'WO-01': 7 },
      }),
      'REMOVED-G99': mastery({
        attempts: 99,
        retryCount: 99,
        errorCounts: { 'STALE-01': 99 },
        rediagnosticAttempts: 99,
      }),
    }

    const forward = selectGrammarLearningPlan(nodes, masteryByNode)
    const reverse = selectGrammarLearningPlan([...nodes].reverse(), masteryByNode)

    expect(forward.recommendation).toMatchObject({
      node: { id: 'A1-G01' },
      reason: 'next-unstarted',
    })
    expect(reverse.recommendation).toEqual(forward.recommendation)
    expect(forward.rediagnosticRepeatCount).toBe(0)
  })

  it('prioritizes a valid must-review requirement as focused review', () => {
    const nodes = makeGrammarNodes().slice(0, 3)
    const plan = selectGrammarLearningPlan(nodes, {
      'A1-G01': mastery({
        attempts: 2,
        retryCount: 2,
        errorCounts: { 'WO-01': 2 },
        mustReview: true,
        reviewRequirement: {
          nodeId: 'A1-G01',
          errorCode: 'WO-01',
          completed: false,
        },
      }),
    })

    expect(plan.recommendation).toMatchObject({
      node: { id: 'A1-G01' },
      reason: 'focus-review',
      errorCount: 2,
    })
    expect(plan.focusReviewQueue.map(({ node }) => node.id)).toEqual(['A1-G01'])
  })

  it('routes an approved production into the rediagnostic queue', () => {
    const nodes = makeGrammarNodes().slice(0, 3)
    const first = nodes[0]!
    const plan = selectGrammarLearningPlan(nodes, {
      [first.id]: readyForRediagnosis(first),
    })

    expect(plan.recommendation).toMatchObject({
      node: { id: first.id },
      reason: 'rediagnostic',
    })
    expect(plan.rediagnosticQueue.map(({ node }) => node.id)).toEqual([first.id])
  })

  it('uses errors, progress, then unstarted state as the general priority', () => {
    const nodes = makeGrammarNodes().slice(0, 3).map((node) => ({
      ...node,
      prerequisite: null,
    }))
    const plan = selectGrammarLearningPlan([...nodes].reverse(), {
      'A1-G01': mastery({ attempts: 1 }),
      'A1-G02': mastery({ attempts: 2, retryCount: 1, errorCounts: { 'WO-01': 1 } }),
    })

    expect(plan.recommendation).toMatchObject({
      node: { id: 'A1-G02' },
      reason: 'error-recovery',
    })
  })

  it('ignores an orphaned review requirement instead of recommending it', () => {
    const nodes = makeGrammarNodes().slice(0, 2)
    const plan = selectGrammarLearningPlan(nodes, {
      'A1-G01': mastery({
        mustReview: true,
        reviewRequirement: {
          nodeId: 'REMOVED-G99',
          errorCode: 'WO-01',
          completed: false,
        },
      }),
    })

    expect(plan.recommendation).toBeNull()
    expect(plan.focusReviewQueue).toEqual([])
  })

  it('reports prerequisite pass rate, repeat count, and catalog completion from current nodes', () => {
    const nodes = makeGrammarNodes().slice(0, 3)
    const masteryByNode = {
      'A1-G01': completedMastery(2),
      'A1-G02': completedMastery(3),
      'REMOVED-G99': completedMastery(100),
    }
    const plan = selectGrammarLearningPlan(nodes, masteryByNode)

    expect(plan.prerequisitePassRate).toEqual({ passed: 2, total: 2, ratio: 1 })
    expect(plan.rediagnosticRepeatCount).toBe(5)
    expect(plan.completedCount).toBe(2)
    expect(plan.totalCount).toBe(3)
    expect(plan.allCompleted).toBe(false)
    expect(plan.recommendation?.node.id).toBe('A1-G03')

    const completed = selectGrammarLearningPlan(nodes, {
      ...masteryByNode,
      'A1-G03': completedMastery(4),
    })
    expect(completed.allCompleted).toBe(true)
    expect(completed.recommendation).toBeNull()
  })
})
