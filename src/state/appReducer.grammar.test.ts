import { appReducer } from './appReducer'
import { createInitialState } from './appState'
import {
  makeGrammarNode,
  makeGrammarProductionRecord,
  makeGrammarProductionSubmission,
} from '../test/fixtures'
import { emptyGrammarMastery } from '../domain/grammar/mastery'

const masteryRule = {
  quizAccuracy: 0.8,
  productionPass: true,
  errorTolerance: 0.2,
}

const diagnosticAttempt = {
  attemptId: 'A1-G01-diagnostic-attempt-1',
  exerciseId: 'A1-G01-diagnostic',
  phase: 'diagnostic' as const,
  correct: true,
  errorCode: 'WO-01',
  reviewNodeId: 'A1-G01',
}

const productionNode = makeGrammarNode()
const productionSubmission = makeGrammarProductionSubmission(productionNode)
const productionReviewChecks = Array.from({
  length: productionNode.productionTask.rubric.length +
    productionNode.productionTask.constraints.evidenceRequirements.length,
}, () => true)

describe('appReducer grammar mastery', () => {
  it('records one exercise result per node and makes duplicate dispatch idempotent', () => {
    const first = appReducer(createInitialState(), {
      type: 'RECORD_GRAMMAR_EXERCISE',
      nodeId: 'A1-G01',
      attempt: diagnosticAttempt,
      masteryRule,
    })
    const duplicated = appReducer(first, {
      type: 'RECORD_GRAMMAR_EXERCISE',
      nodeId: 'A1-G01',
      attempt: diagnosticAttempt,
      masteryRule,
    })

    expect(duplicated.grammarMastery['A1-G01']).toBe(
      first.grammarMastery['A1-G01'],
    )
    expect(duplicated.grammarMastery['A1-G01']).toMatchObject({
      attempts: 1,
      correct: 1,
      diagnosticAttempts: 1,
    })
  })

  it('separates production submission from rubric review approval', () => {
    const initial = createInitialState()
    expect(appReducer(initial, {
      type: 'SUBMIT_GRAMMAR_PRODUCTION',
      nodeId: 'A1-G01',
      submission: productionSubmission,
      productionTask: productionNode.productionTask,
      masteryRule,
    })).toBe(initial)

    let state = appReducer(initial, {
      type: 'RECORD_GRAMMAR_EXERCISE',
      nodeId: 'A1-G01',
      attempt: diagnosticAttempt,
      masteryRule,
    })
    state = appReducer(state, {
      type: 'RECORD_GRAMMAR_EXERCISE',
      nodeId: 'A1-G01',
      attempt: {
        ...diagnosticAttempt,
        attemptId: 'A1-G01-practice-attempt-1',
        exerciseId: 'A1-G01-practice',
        phase: 'practice',
      },
      masteryRule,
    })
    state = appReducer(state, {
      type: 'SUBMIT_GRAMMAR_PRODUCTION',
      nodeId: 'A1-G01',
      submission: productionSubmission,
      productionTask: productionNode.productionTask,
      masteryRule,
    })

    expect(state.grammarMastery['A1-G01']).toMatchObject({
      productionAttempts: 1,
      productionPassed: false,
      production: { reviewStatus: 'pending' },
    })

    state = appReducer(state, {
      type: 'REVIEW_GRAMMAR_PRODUCTION',
      nodeId: 'A1-G01',
      reviewChecks: productionReviewChecks,
      masteryRule,
    })

    expect(state.grammarMastery['A1-G01']).toMatchObject({
      productionPassed: true,
      production: { reviewStatus: 'approved', reviewChecks: productionReviewChecks },
    })
  })

  it('records the exact prerequisite review without mutating another node', () => {
    let state = createInitialState()
    for (const [exerciseId, phase] of [
      ['A1-G02-diagnostic', 'diagnostic'],
      ['A1-G02-practice', 'practice'],
    ] as const) {
      state = appReducer(state, {
        type: 'RECORD_GRAMMAR_EXERCISE',
        nodeId: 'A1-G02',
        attempt: {
          exerciseId,
          phase,
          correct: false,
          errorCode: 'WO-01',
          reviewNodeId: 'A1-G01',
        },
        masteryRule,
      })
    }
    const firstNode = appReducer(state, {
      type: 'RECORD_GRAMMAR_EXERCISE',
      nodeId: 'A1-G01',
      attempt: diagnosticAttempt,
      masteryRule,
    }).grammarMastery['A1-G01']

    state = appReducer({
      ...state,
      grammarMastery: {
        ...state.grammarMastery,
        'A1-G01': firstNode!,
      },
    }, {
      type: 'RECORD_GRAMMAR_PREREQUISITE_REVIEW',
      nodeId: 'A1-G02',
      reviewedNodeId: 'A1-G01',
      masteryRule,
    })

    expect(state.grammarMastery['A1-G02']?.reviewRequirement).toEqual({
      nodeId: 'A1-G01',
      errorCode: 'WO-01',
      completed: true,
    })
    expect(state.grammarMastery['A1-G01']).toBe(firstNode)
  })

  it('restarts a C1 cycle after two rejected revisions without erasing cumulative attempts', () => {
    const node = makeGrammarNode({ id: 'C1-G01', level: 'C1' })
    const initial = createInitialState()
    const state = {
      ...initial,
      grammarMastery: {
        'C1-G01': {
          ...emptyGrammarMastery(),
          attempts: 2,
          correct: 2,
          diagnosticAttempts: 1,
          practiceAttempts: 1,
          productionAttempts: 3,
          retryCount: 3,
          exerciseResults: {
            diagnostic: {
              phase: 'diagnostic' as const,
              correct: true,
              errorCode: 'REG-01',
            },
            practice: {
              phase: 'practice' as const,
              correct: true,
              errorCode: 'REG-01',
            },
          },
          production: makeGrammarProductionRecord(node, {
            status: 'rejected',
            revisionRound: 2,
            cycleStartAttempt: 1,
          }),
        },
      },
    }

    const restarted = appReducer(state, {
      type: 'RESTART_GRAMMAR_PRODUCTION',
      nodeId: node.id,
      productionTask: node.productionTask,
      masteryRule,
    })

    expect(restarted.grammarMastery[node.id]).toMatchObject({
      attempts: 2,
      productionAttempts: 3,
      retryCount: 3,
      productionPassed: false,
      production: null,
    })
  })
})
