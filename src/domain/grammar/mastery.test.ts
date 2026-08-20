import {
  makeGrammarNode,
  makeGrammarNodes,
  makeGrammarProductionRecord,
  makeGrammarProductionSubmission,
} from '../../test/fixtures'
import {
  emptyGrammarMastery,
  grammarAccuracy,
  grammarErrorCategoryProgress,
  grammarErrorClusters,
  grammarLevelProgress,
  isGrammarProductionSubmissionValid,
  isGrammarNodeUnlocked,
  latestGrammarExerciseResult,
  recordGrammarExercise,
  recordGrammarPrerequisiteReview,
  recordGrammarProduction,
  recordGrammarProductionReview,
  restartGrammarProductionCycle,
  type GrammarExerciseResult,
  type GrammarMastery,
} from './mastery'

const rule = {
  quizAccuracy: 0.8,
  productionPass: true,
  errorTolerance: 0.2,
}
const productionNode = makeGrammarNode()
const productionTask = productionNode.productionTask
const productionReviewChecks = Array.from(
  {
    length: productionTask.rubric.length +
      productionTask.constraints.evidenceRequirements.length,
  },
  () => true,
)

function completedMastery(
  errorCodes: readonly string[] = ['ART-01', 'PREP-01', 'TENSE-01'],
): GrammarMastery {
  const phases = ['diagnostic', 'practice', 'rediagnostic'] as const
  const exerciseResults = Object.fromEntries(phases.map((phase, index) => [
    `exercise-${phase}`,
    {
      phase,
      correct: true,
      errorCode: errorCodes[index] ?? 'WO-01',
    } satisfies GrammarExerciseResult,
  ]))

  return {
    ...emptyGrammarMastery(),
    attempts: 3,
    correct: 3,
    diagnosticAttempts: 1,
    practiceAttempts: 1,
    rediagnosticAttempts: 1,
    productionAttempts: 1,
    productionPassed: true,
    exerciseResults,
    production: makeGrammarProductionRecord(productionNode),
    completed: true,
  }
}

function attempt(
  exerciseId: string,
  phase: 'diagnostic' | 'practice' | 'rediagnostic',
  correct: boolean,
  errorCode: string,
  attemptId?: string,
) {
  return {
    ...(attemptId ? { attemptId } : {}),
    exerciseId,
    phase,
    correct,
    errorCode,
    reviewNodeId: 'A1-G01',
  }
}

const production = makeGrammarProductionSubmission(productionNode)

function practicedMasteryFor(nodeId: string): GrammarMastery {
  let mastery = emptyGrammarMastery()
  mastery = recordGrammarExercise(
    mastery,
    attempt(`${nodeId}-diagnostic`, 'diagnostic', true, 'WO-01'),
    rule,
  )
  return recordGrammarExercise(
    mastery,
    attempt(`${nodeId}-practice`, 'practice', true, 'WO-01'),
    rule,
  )
}

function sentenceText(count: number, marker = 'clear'): string {
  return Array.from(
    { length: count },
    (_, index) => `The learner writes ${marker} sentence ${index + 1}.`,
  ).join(' ')
}

describe('grammar mastery', () => {
  it('records every deliberate retry while replaying one submit action exactly once', () => {
    let mastery = emptyGrammarMastery()
    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-diagnostic', 'diagnostic', false, 'WO-01', 'attempt-1'),
      rule,
    )
    const duplicated = recordGrammarExercise(
      mastery,
      attempt('A1-G01-diagnostic', 'diagnostic', false, 'WO-01', 'attempt-1'),
      rule,
    )
    expect(duplicated).toBe(mastery)

    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-diagnostic', 'diagnostic', true, 'WO-01', 'attempt-2'),
      rule,
    )

    expect(mastery).toMatchObject({
      attempts: 2,
      correct: 1,
      diagnosticAttempts: 2,
      retryCount: 1,
      errorCounts: { 'WO-01': 1 },
    })
    expect(latestGrammarExerciseResult(mastery, 'A1-G01-diagnostic')?.correct)
      .toBe(true)
  })

  it('treats two changed wrong submissions on the same exercise as a repeated error', () => {
    let mastery = emptyGrammarMastery()
    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-diagnostic', 'diagnostic', false, 'WO-01', 'attempt-1'),
      rule,
    )
    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-diagnostic', 'diagnostic', false, 'WO-01', 'attempt-2'),
      rule,
    )

    expect(mastery).toMatchObject({
      attempts: 2,
      correct: 0,
      retryCount: 2,
      errorCounts: { 'WO-01': 2 },
      errorStreaks: { 'WO-01': 2 },
      mustReview: true,
      reviewRequirement: {
        nodeId: 'A1-G01',
        errorCode: 'WO-01',
        completed: false,
      },
    })
  })

  it('requires diagnostic, practice, approved production, and rediagnostic before completion', () => {
    let mastery = emptyGrammarMastery()
    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-diagnostic', 'diagnostic', true, 'WO-01'),
      rule,
    )
    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-practice', 'practice', true, 'WO-01'),
      rule,
    )
    const beforeSingleCriterion = mastery
    expect(recordGrammarProduction(
      mastery,
      {
        ...production,
        rubricEvidence: [production.rubricEvidence[0]!],
      },
      productionTask,
      rule,
    )).toBe(beforeSingleCriterion)

    mastery = recordGrammarProduction(mastery, production, productionTask, rule)

    expect(mastery.production?.reviewStatus).toBe('pending')
    expect(mastery.productionPassed).toBe(false)
    expect(mastery.completed).toBe(false)

    mastery = recordGrammarProductionReview(mastery, productionReviewChecks, rule)
    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-rediagnostic', 'rediagnostic', true, 'SV-01'),
      rule,
    )

    expect(mastery).toMatchObject({
      attempts: 3,
      correct: 3,
      diagnosticAttempts: 1,
      practiceAttempts: 1,
      rediagnosticAttempts: 1,
      productionAttempts: 1,
      productionPassed: true,
      completed: true,
    })
    expect(mastery.production?.reviewStatus).toBe('approved')
    expect(grammarAccuracy(mastery)).toBe(1)
  })

  it('rejects weak production evidence and keeps a reviewed rejection from unlocking mastery', () => {
    let mastery = recordGrammarProduction(
      emptyGrammarMastery(),
      {
        ...production,
        draft: 'x. x. x. x.',
        parts: [{ partId: 'response', text: 'x. x. x. x.' }],
      },
      productionTask,
      rule,
    )
    expect(mastery.productionAttempts).toBe(0)
    expect(mastery.production).toBeNull()

    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-diagnostic', 'diagnostic', true, 'WO-01'),
      rule,
    )
    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-practice', 'practice', true, 'WO-01'),
      rule,
    )
    mastery = recordGrammarProduction(mastery, production, productionTask, rule)
    const rejectedChecks = [...productionReviewChecks]
    rejectedChecks[1] = false
    mastery = recordGrammarProductionReview(mastery, rejectedChecks, rule)

    expect(mastery.production).toMatchObject({
      reviewStatus: 'rejected',
      reviewChecks: rejectedChecks,
    })
    expect(mastery.productionPassed).toBe(false)
  })

  it('enforces the learning phase order and rejects incomplete review arrays', () => {
    const empty = emptyGrammarMastery()
    expect(recordGrammarExercise(
      empty,
      attempt('A1-G01-practice', 'practice', true, 'WO-01'),
      rule,
    )).toBe(empty)
    expect(recordGrammarProduction(empty, production, productionTask, rule)).toBe(empty)

    let mastery = recordGrammarExercise(
      empty,
      attempt('A1-G01-diagnostic', 'diagnostic', true, 'WO-01'),
      rule,
    )
    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-practice', 'practice', true, 'WO-01'),
      rule,
    )
    expect(recordGrammarExercise(
      mastery,
      attempt('A1-G01-rediagnostic', 'rediagnostic', true, 'SV-01'),
      rule,
    )).toBe(mastery)

    mastery = recordGrammarProduction(mastery, production, productionTask, rule)
    const sparseChecks = Array<boolean>(productionReviewChecks.length)
    expect(recordGrammarProductionReview(mastery, sparseChecks, rule)).toBe(mastery)
  })

  test.each([
    ['A1', 3, false],
    ['A1', 4, true],
    ['A1', 6, true],
    ['A1', 7, false],
    ['A2', 5, false],
    ['A2', 6, true],
    ['A2', 8, true],
    ['A2', 9, false],
    ['B1', 7, false],
    ['B1', 8, true],
    ['B1', 12, true],
    ['B1', 13, false],
  ] as const)('%s production accepts %i sentences: %s', (level, count, valid) => {
    const node = makeGrammarNode({ id: `${level}-G01`, level })
    const submission = makeGrammarProductionSubmission(node, {
      partTexts: { response: sentenceText(count) },
    })

    expect(isGrammarProductionSubmissionValid(submission, node.productionTask)).toBe(valid)
  })

  it('treats evidence selection counts as minimums while rejecting missing required evidence', () => {
    const node = makeGrammarNode()
    const submission = makeGrammarProductionSubmission(node)
    submission.requirementEvidence[0]!.selections.push({
      partId: 'response',
      sentenceIndex: 1,
    })
    expect(isGrammarProductionSubmissionValid(submission, node.productionTask)).toBe(true)

    const missingWhEvidence = structuredClone(submission)
    missingWhEvidence.requirementEvidence[2]!.selections = []
    expect(isGrammarProductionSubmissionValid(
      missingWhEvidence,
      node.productionTask,
    )).toBe(false)
  })

  it('requires all B2 sections and at least three selected complex-structure sentences', () => {
    const node = makeGrammarNode({ id: 'B2-G01', level: 'B2' })
    const valid = makeGrammarProductionSubmission(node)
    expect(isGrammarProductionSubmissionValid(valid, node.productionTask)).toBe(true)

    const missingConclusion = structuredClone(valid)
    missingConclusion.parts.pop()
    missingConclusion.draft = missingConclusion.parts.map(({ text }) => text).join('\n\n')
    expect(isGrammarProductionSubmissionValid(
      missingConclusion,
      node.productionTask,
    )).toBe(false)

    const twoComplexStructures = structuredClone(valid)
    twoComplexStructures.requirementEvidence[0]!.selections.pop()
    expect(isGrammarProductionSubmissionValid(
      twoComplexStructures,
      node.productionTask,
    )).toBe(false)
  })

  it('requires C1 evidence from both registers and permits only two revisions per cycle', () => {
    const node = makeGrammarNode({ id: 'C1-G01', level: 'C1' })
    const task = node.productionTask
    const initial = makeGrammarProductionSubmission(node)
    expect(isGrammarProductionSubmissionValid(initial, task)).toBe(true)
    expect(initial.parts.map(({ text }) => text.match(/[.!?]/gu)?.length ?? 0))
      .toEqual([1, 1])
    expect(initial.rubricEvidence).toEqual([
      { partId: 'work-email', sentenceIndex: 0 },
      { partId: 'academic-paragraph', sentenceIndex: 0 },
      { partId: 'work-email', sentenceIndex: 0 },
    ])

    const oneRegisterOnly = makeGrammarProductionSubmission(node, {
      partTexts: {
        'work-email': sentenceText(2, 'email-only'),
        'academic-paragraph': sentenceText(1, 'academic'),
      },
    })
    oneRegisterOnly.requirementEvidence[0]!.selections = [
      { partId: 'work-email', sentenceIndex: 0 },
      { partId: 'work-email', sentenceIndex: 1 },
    ]
    expect(isGrammarProductionSubmissionValid(oneRegisterOnly, task)).toBe(false)

    let mastery = practicedMasteryFor(node.id)
    mastery = recordGrammarProduction(mastery, initial, task, rule)
    const rejectedChecks = Array.from(
      { length: task.rubric.length + task.constraints.evidenceRequirements.length },
      (_, index) => index > 0,
    )
    mastery = recordGrammarProductionReview(mastery, rejectedChecks, rule)

    for (const revisionRound of [1, 2]) {
      const revision = makeGrammarProductionSubmission(node, {
        partTexts: {
          'work-email': sentenceText(1, `email-${revisionRound}`),
          'academic-paragraph': sentenceText(2, `academic-${revisionRound}`),
        },
        revisionNote: `I corrected revision ${revisionRound}.`,
      })
      mastery = recordGrammarProduction(mastery, revision, task, rule)
      expect(mastery.production).toMatchObject({
        revisionRound,
        cycleStartAttempt: 1,
        reviewStatus: 'pending',
      })
      mastery = recordGrammarProductionReview(mastery, rejectedChecks, rule)
    }

    const blockedThirdRevision = recordGrammarProduction(
      mastery,
      makeGrammarProductionSubmission(node, {
        partTexts: {
          'work-email': sentenceText(1, 'blocked-email'),
          'academic-paragraph': sentenceText(2, 'blocked-academic'),
        },
        revisionNote: 'A third revision should be blocked.',
      }),
      task,
      rule,
    )
    expect(blockedThirdRevision).toBe(mastery)

    const restarted = restartGrammarProductionCycle(mastery, task, rule)
    expect(restarted).toMatchObject({
      productionAttempts: 3,
      retryCount: 3,
      productionPassed: false,
      production: null,
    })

    const nextCycle = recordGrammarProduction(restarted, initial, task, rule)
    expect(nextCycle).toMatchObject({
      productionAttempts: 4,
      production: {
        cycleStartAttempt: 4,
        revisionRound: 0,
        reviewStatus: 'pending',
      },
    })
  })

  it('blocks rediagnosis until the required prerequisite review is explicitly completed', () => {
    let mastery = emptyGrammarMastery()
    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-diagnostic', 'diagnostic', false, 'WO-01'),
      rule,
    )
    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-practice', 'practice', false, 'WO-01'),
      rule,
    )

    expect(mastery.mustReview).toBe(true)
    expect(mastery.reviewRequirement).toEqual({
      nodeId: 'A1-G01',
      errorCode: 'WO-01',
      completed: false,
    })

    mastery = recordGrammarProduction(mastery, production, productionTask, rule)
    mastery = recordGrammarProductionReview(mastery, productionReviewChecks, rule)

    const blocked = recordGrammarExercise(
      mastery,
      attempt('A1-G01-rediagnostic', 'rediagnostic', true, 'WO-01'),
      rule,
    )
    expect(blocked).toBe(mastery)
    expect(blocked.rediagnosticAttempts).toBe(0)

    const wrongReview = recordGrammarPrerequisiteReview(mastery, 'A1-G02', rule)
    expect(wrongReview).toBe(mastery)

    mastery = recordGrammarPrerequisiteReview(mastery, 'A1-G01', rule)
    expect(mastery.reviewRequirement?.completed).toBe(true)

    mastery = recordGrammarExercise(
      mastery,
      attempt('A1-G01-rediagnostic', 'rediagnostic', true, 'WO-01'),
      rule,
    )
    expect(mastery.mustReview).toBe(false)
    expect(mastery.reviewRequirement).toBeNull()
    expect(mastery.rediagnosticAttempts).toBe(1)
  })

  it('aggregates level progress and historical error clusters', () => {
    const nodes = makeGrammarNodes()
    const mastery = {
      'A1-G01': { ...completedMastery(), errorCounts: { 'WO-01': 2 } },
      'A1-G02': { ...completedMastery(), errorCounts: { 'SV-01': 1, 'WO-01': 1 } },
    }

    expect(grammarLevelProgress('A1', nodes, mastery)).toEqual({
      level: 'A1',
      completed: 2,
      total: 8,
      ratio: 0.25,
    })
    expect(grammarErrorClusters(mastery)).toEqual([
      { code: 'WO-01', count: 3 },
      { code: 'SV-01', count: 1 },
    ])
    expect(grammarErrorClusters({
      ...mastery,
      'REMOVED-G99': { ...completedMastery(), errorCounts: { 'STALE-01': 99 } },
    }, nodes)).toEqual([
      { code: 'WO-01', count: 3 },
      { code: 'SV-01', count: 1 },
    ])
  })

  it('uses unique exercise outcomes as the real category denominator', () => {
    const nodes = makeGrammarNodes()
    const mastery = {
      'A1-G01': completedMastery(),
      'A1-G02': {
        ...completedMastery(),
        correct: 2,
        exerciseResults: {
          ...completedMastery().exerciseResults,
          'exercise-practice': {
            phase: 'practice' as const,
            correct: false,
            errorCode: 'PREP-01',
          },
        },
      },
    }

    expect(grammarErrorCategoryProgress('A1', nodes, mastery)).toEqual({
      article: { attempts: 2, correct: 2, accuracy: 1 },
      preposition: { attempts: 2, correct: 1, accuracy: 0.5 },
      tense: { attempts: 2, correct: 2, accuracy: 1 },
    })
  })

  it('opens the next level at 80 percent without requiring the previous linear tail', () => {
    const nodes = makeGrammarNodes()
    const first = nodes[0]!
    const second = nodes[1]!
    const a2First = nodes.find(({ id }) => id === 'A2-G01')!

    expect(isGrammarNodeUnlocked(first, nodes, {})).toBe(true)
    expect(isGrammarNodeUnlocked(second, nodes, {})).toBe(false)
    expect(
      isGrammarNodeUnlocked(second, nodes, { 'A1-G01': completedMastery() }),
    ).toBe(true)
    expect(isGrammarNodeUnlocked(
      { ...first, id: 'A1-G99', prerequisite: 'REMOVED-G98' },
      nodes,
      {},
    )).toBe(false)

    const belowThreshold = Object.fromEntries(
      ['A1-G01', 'A1-G02', 'A1-G03', 'A1-G04', 'A1-G05', 'A1-G06'].map(
        (id) => [id, completedMastery()],
      ),
    )
    expect(isGrammarNodeUnlocked(a2First, nodes, belowThreshold)).toBe(false)

    const atThresholdWithoutTail = {
      ...belowThreshold,
      'A1-G07': completedMastery(),
    }
    expect(isGrammarNodeUnlocked(a2First, nodes, atThresholdWithoutTail)).toBe(true)

    const threeWrongPrepositions: GrammarMastery = {
      ...emptyGrammarMastery(),
      attempts: 3,
      diagnosticAttempts: 1,
      practiceAttempts: 1,
      rediagnosticAttempts: 1,
      exerciseResults: {
        diagnostic: { phase: 'diagnostic', correct: false, errorCode: 'PREP-01' },
        practice: { phase: 'practice', correct: false, errorCode: 'PREP-01' },
        rediagnostic: { phase: 'rediagnostic', correct: false, errorCode: 'PREP-01' },
      },
    }
    const exactlySeventyPercent = {
      ...atThresholdWithoutTail,
      'A1-G08': threeWrongPrepositions,
    }
    expect(grammarErrorCategoryProgress('A1', nodes, exactlySeventyPercent).preposition)
      .toEqual({ attempts: 10, correct: 7, accuracy: 0.7 })
    expect(isGrammarNodeUnlocked(a2First, nodes, exactlySeventyPercent)).toBe(true)

    const sixOfNinePrepositions = {
      ...exactlySeventyPercent,
      'A1-G07': completedMastery(['ART-01', 'ART-01', 'TENSE-01']),
    }
    expect(grammarErrorCategoryProgress('A1', nodes, sixOfNinePrepositions).preposition)
      .toEqual({ attempts: 9, correct: 6, accuracy: 6 / 9 })
    expect(isGrammarNodeUnlocked(a2First, nodes, sixOfNinePrepositions)).toBe(false)

    const weakPrepositions = {
      ...atThresholdWithoutTail,
      'A1-G01': {
        ...completedMastery(),
        correct: 2,
        exerciseResults: {
          ...completedMastery().exerciseResults,
          'exercise-practice': {
            phase: 'practice' as const,
            correct: false,
            errorCode: 'PREP-01',
          },
        },
      },
      'A1-G02': completedMastery(['ART-01', 'ART-01', 'TENSE-01']),
      'A1-G03': completedMastery(['ART-01', 'ART-01', 'TENSE-01']),
      'A1-G04': completedMastery(['ART-01', 'ART-01', 'TENSE-01']),
      'A1-G05': completedMastery(['ART-01', 'ART-01', 'TENSE-01']),
      'A1-G06': completedMastery(['ART-01', 'ART-01', 'TENSE-01']),
      'A1-G07': completedMastery(['ART-01', 'ART-01', 'TENSE-01']),
    }
    expect(isGrammarNodeUnlocked(a2First, nodes, weakPrepositions)).toBe(false)
  })
})
