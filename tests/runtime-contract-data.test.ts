import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import type { StudyItem } from '../src/domain/content/types'
import {
  difficultyAccuracyBoost,
  mistakeBoost,
} from '../src/domain/progress/mastery'
import {
  MAX_QUEUE_HISTORY,
  MAX_QUIZ_RESPONSE_HISTORY,
  MAX_SESSION_HISTORY,
  MAX_STATE_LOAD_HISTORY,
  MAX_STUDY_QUEUE_PRIORITY_COUNT,
  MAX_STUDY_QUEUE_SIZE,
  TRACKING_QUEUE_AUDIT_COMPLETENESS,
  TRACKING_SCHEMA_VERSION,
} from '../src/domain/progress/tracking'
import {
  DEFAULT_STUDY_SPACING_POLICY,
  auditStudyItemWeight,
} from '../src/domain/scheduler/queue'
import { createInitialState } from '../src/state/appState'

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T
}

interface ErrorWeights {
  schemaVersion: string
  singleWrongBoost: number
  consecutiveWrongBoost: number
  consecutiveWrongThreshold: number
  maximumMistakeBoost: number
  priorityWindow: number
  lowAccuracyThreshold: number
  lowAccuracyBoost: number
}

interface Calibration {
  schemaVersion: string
  recentQuizWindow: number
  recentWrongPerSessionBoost: number
  maximumRecentWrongBoost: number
  grammarReviewBoost: number
  schedule: Record<string, number>
  mastery: Record<string, number>
  exposureWeight: { minimum: number; maximum: number }
}

interface JsonSchema {
  properties: Record<string, { const?: number; maxItems?: number }>
  required: string[]
  $defs?: {
    queue?: {
      properties?: {
        auditCompleteness?: { enum?: string[] }
        queueSize?: { maximum?: number }
        currentIndex?: { maximum?: number }
        recoveryIndex?: { maximum?: number }
        orderedItemIds?: { maxItems?: number }
        priorityCount?: { maximum?: number }
        priorityEntries?: { maxItems?: number }
      }
    }
    weightComponents?: {
      required?: string[]
      properties?: Record<
        string,
        { type?: string; minimum?: number; maximum?: number }
      >
    }
    grammarProduction?: {
      required?: string[]
      properties?: {
        rubricEvidence?: {
          minItems?: number
          maxItems?: number
          uniqueItems?: boolean
        }
      }
    }
    grammarMastery?: {
      required?: string[]
    }
  }
}

const item: StudyItem = {
  id: 'word-test',
  kind: 'word',
  term: 'test',
  lemma: 'test',
  level: '기초',
  difficulty: 'normal',
  partsOfSpeech: ['noun'],
  forms: ['test', 'tests'],
  meanings: ['시험'],
  ipa: '/test/',
  examples: ['The test is short.', 'We take a test today.'],
  entries: [{
    partOfSpeech: 'noun',
    forms: ['test', 'tests'],
    meanings: ['시험'],
    ipa: '/test/',
    examples: ['The test is short.', 'We take a test today.'],
  }],
}

describe('공개 런타임 계약 데이터', () => {
  test('오답 가중치 파일이 실행 코드와 정확히 일치한다', () => {
    const rules = readJson<ErrorWeights>('../public/data/engine/error-weights.json')

    expect(rules).toEqual({
      schemaVersion: '1.0.0',
      singleWrongBoost: 0.15,
      consecutiveWrongBoost: 0.3,
      consecutiveWrongThreshold: 2,
      maximumMistakeBoost: 0.3,
      priorityWindow: 3,
      lowAccuracyThreshold: 0.6,
      lowAccuracyBoost: 0.1,
    })
    expect(mistakeBoost({ wrongCount: 1, wrongStreak: 1, priorityRemaining: 0 }))
      .toBe(rules.singleWrongBoost)
    expect(mistakeBoost({ wrongCount: 2, wrongStreak: 2, priorityRemaining: 3 }))
      .toBe(rules.consecutiveWrongBoost)
    expect(difficultyAccuracyBoost({ attempts: 5, correct: 2 }))
      .toBe(rules.lowAccuracyBoost)
  })

  test('교정 파일이 실제 큐 가중치 구성요소와 경계를 고정한다', () => {
    const rules = readJson<Calibration>('../public/data/engine/calibration.json')
    const errorWeights = readJson<ErrorWeights>('../public/data/engine/error-weights.json')
    const tracker = readJson<JsonSchema>('../public/data/schema/tracker.schema.json')
    const now = 10_000
    const audit = auditStudyItemWeight(item, {
      selectedDifficulty: 'normal',
      difficultyStats: { normal: { attempts: 5, correct: 2 } },
      mistakes: {
        [item.id]: {
          wrongCount: 2,
          wrongStreak: 2,
          priorityRemaining: 3,
          nextBoost: 0.2,
          cooldownAt: now,
        },
      },
      quizHistory: [{
        score: 0,
        total: 1,
        accuracy: 0,
        typeStats: Object.fromEntries([
          'en-ko', 'ko-en', 'sentence-meaning', 'sentence-blank', 'dictation', 'sentence-transform',
        ].map((type) => [type, { correct: 0, wrong: 0, total: 0, accuracy: 0 }])),
        heatmap: [],
        wrongItemIds: [item.id],
      }] as never,
      grammarReviewItemIds: new Set([item.id]),
      now,
    })

    expect(rules.schemaVersion).toBe('1.0.0')
    expect(audit.components).toMatchObject({
      lowAccuracyBoost: 0.1,
      mistakeBoost: errorWeights.maximumMistakeBoost,
      recentWrongBoost: rules.recentWrongPerSessionBoost + 0.2,
      grammarBoost: rules.grammarReviewBoost,
    })
    expect(rules).toMatchObject({
      recentQuizWindow: 7,
      maximumRecentWrongBoost: 0.45,
      mastery: {
        targetAccuracy: 0.8,
        newItemBoost: 0.06,
        correctStreakDecay: 0.025,
        maximumCorrectStreak: 5,
      },
      exposureWeight: { minimum: 0.001, maximum: 4 },
    })
    const actualQueueComponents = { ...audit.components, total: audit.total }
    expect(tracker.$defs?.weightComponents?.required)
      .toEqual(Object.keys(actualQueueComponents))
    expect(tracker.$defs?.weightComponents?.properties?.total).toEqual({
      type: 'number',
      minimum: rules.exposureWeight.minimum,
      maximum: rules.exposureWeight.maximum,
    })
    expect(actualQueueComponents.total).toBeGreaterThanOrEqual(rules.exposureWeight.minimum)
    expect(actualQueueComponents.total).toBeLessThanOrEqual(rules.exposureWeight.maximum)
  })

  test('간격 예외 정책은 기본 strict이며 감사 없는 우회를 허용하지 않는다', () => {
    const rules = readJson<{
      minimumGap: number
      immediateDuplicateProhibited: boolean
      defaultExceptionPolicy: string
      supportedExceptionPolicies: string[]
      examDensityRequiresAudit: boolean
    }>('../public/data/engine/spacing-rules.json')

    expect(DEFAULT_STUDY_SPACING_POLICY).toEqual({
      minimumDistinctItems: rules.minimumGap,
      exceptionPolicy: rules.defaultExceptionPolicy,
    })
    expect(rules.immediateDuplicateProhibited).toBe(true)
    expect(rules.supportedExceptionPolicies).toEqual(['strict', 'exam-density'])
    expect(rules.examDensityRequiresAudit).toBe(true)
  })

  test('학습자·추적 스키마가 현재 저장 버전과 이력 한도를 선언한다', () => {
    const learner = readJson<JsonSchema>('../public/data/schema/learner-state.schema.json')
    const tracker = readJson<JsonSchema>('../public/data/schema/tracker.schema.json')
    const state = createInitialState()

    expect(learner.properties.schemaVersion?.const).toBe(state.schemaVersion)
    expect(learner.required).toEqual(Object.keys(state))
    expect(tracker.properties.trackingVersion?.const).toBe(TRACKING_SCHEMA_VERSION)
    expect(tracker.required).toEqual(Object.keys(state.tracking))
    expect(tracker.properties.quizResponses?.maxItems).toBe(MAX_QUIZ_RESPONSE_HISTORY)
    expect(tracker.properties.sessionHistory?.maxItems).toBe(MAX_SESSION_HISTORY)
    expect(tracker.properties.queueHistory?.maxItems).toBe(MAX_QUEUE_HISTORY)
    expect(tracker.properties.stateLoadHistory?.maxItems).toBe(MAX_STATE_LOAD_HISTORY)
    expect(tracker.$defs?.queue?.properties?.auditCompleteness?.enum)
      .toEqual([...TRACKING_QUEUE_AUDIT_COMPLETENESS])
    expect(tracker.$defs?.queue?.properties).toMatchObject({
      queueSize: { maximum: MAX_STUDY_QUEUE_SIZE },
      currentIndex: { maximum: MAX_STUDY_QUEUE_SIZE },
      recoveryIndex: { maximum: MAX_STUDY_QUEUE_SIZE },
      orderedItemIds: { maxItems: MAX_STUDY_QUEUE_SIZE },
      priorityCount: { maximum: MAX_STUDY_QUEUE_PRIORITY_COUNT },
      priorityEntries: { maxItems: MAX_STUDY_QUEUE_PRIORITY_COUNT },
    })
    expect(learner.$defs?.grammarProduction?.required).toEqual([
      'draft',
      'parts',
      'requirementEvidence',
      'rubricEvidence',
      'cycleStartAttempt',
      'revisionRound',
      'revisionNote',
      'reviewStatus',
      'reviewChecks',
    ])
    expect(learner.$defs?.grammarProduction?.properties?.rubricEvidence)
      .toMatchObject({ minItems: 3, maxItems: 3 })
    expect(learner.$defs?.grammarProduction?.properties?.rubricEvidence?.uniqueItems)
      .toBeUndefined()
    expect(learner.$defs?.grammarMastery?.required)
      .toContain('productionAttempts')
  })

  test('마이그레이션 및 릴리스 기록이 현재 버전과 사람 검수 게이트를 고정한다', () => {
    const history = readJson<{
      currentLearnerStateVersion: number
      currentTrackingVersion: number
      migrations: Array<{ from: string | number; to: string | number }>
      failurePolicy: string
    }>('../public/data/DEVELOPMENT/migration-history.json')
    const notes = readJson<{
      learnerStateVersion: number
      trackingVersion: number
      releaseGates: { manualStoryApproval: { required: boolean; levels: string[] } }
    }>('../public/data/DEVELOPMENT/release-notes.json')

    expect(history.currentLearnerStateVersion).toBe(7)
    expect(history.currentTrackingVersion).toBe(TRACKING_SCHEMA_VERSION)
    expect(history.migrations.map(({ from }) => from))
      .toEqual(['legacy-navigation', 1, 2, 3, 4, 5, '6-tracking-v1', 6])
    expect(history.migrations).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'legacy-navigation', to: 7 }),
      expect.objectContaining({ from: 6, to: 7 }),
    ]))
    expect(history.failurePolicy).toMatch(/recovered/)
    expect(notes).toMatchObject({
      learnerStateVersion: 7,
      trackingVersion: TRACKING_SCHEMA_VERSION,
      releaseGates: { manualStoryApproval: { required: true } },
    })
    expect(notes.releaseGates.manualStoryApproval.levels)
      .toEqual(['기초', '유치원', '초등학교', '중학교'])
  })
})
