import {
  DIFFICULTIES,
  LEVELS,
} from '../domain/content/types'
import type { DifficultyStats } from '../domain/progress/types'
import { QUIZ_TYPES, type QuizTypeStats } from '../domain/quiz/types'
import {
  createInitialState,
  GRAMMAR_SECTIONS,
  SECTIONS,
  type AppState,
  type NavigationState,
  type StudySessionSnapshot,
} from './appState'

export const STORAGE_KEY = 'wordMasterMainMenuState'

export type LoadStatus = 'empty' | 'loaded' | 'migrated' | 'recovered'

export interface LoadResult {
  state: AppState
  status: LoadStatus
  warning: string | null
  rawBackup: string | null
}

export type SaveResult = { ok: true } | { ok: false; message: string }

const RECOVERY_WARNING = '저장된 학습 상태가 손상되어 기본 상태로 복구했습니다.'
const MIGRATION_WARNING = '이전 버전의 메뉴 상태를 현재 학습 상태로 이전했습니다.'
const SAVE_ERROR_MESSAGE = '학습 상태를 저장하지 못했습니다.'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEnumValue<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return typeof value === 'string' && values.includes(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function isRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasOnlyKeys(record: UnknownRecord, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key))
}

function hasExactKeys(record: UnknownRecord, expected: readonly string[]): boolean {
  const keys = Object.keys(record)
  return keys.length === expected.length && expected.every((key) => keys.includes(key))
}

function isNavigationState(value: unknown): value is NavigationState {
  if (!isRecord(value)) return false

  return (
    hasExactKeys(value, [
      'level',
      'section',
      'grammarSection',
      'grammarNodeId',
      'studyDifficulty',
      'quizType',
    ]) &&
    isEnumValue(LEVELS, value.level) &&
    isEnumValue(SECTIONS, value.section) &&
    isEnumValue(GRAMMAR_SECTIONS, value.grammarSection) &&
    (value.grammarNodeId === null || isNonEmptyString(value.grammarNodeId)) &&
    isEnumValue(DIFFICULTIES, value.studyDifficulty) &&
    isEnumValue(QUIZ_TYPES, value.quizType)
  )
}

function isWordMastery(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (
    !hasExactKeys(value, [
      'attempts',
      'correct',
      'wrong',
      'correctStreak',
      'wrongStreak',
    ]) ||
    !isNonNegativeInteger(value.attempts) ||
    !isNonNegativeInteger(value.correct) ||
    !isNonNegativeInteger(value.wrong) ||
    !isNonNegativeInteger(value.correctStreak) ||
    !isNonNegativeInteger(value.wrongStreak)
  ) {
    return false
  }

  return (
    value.correct + value.wrong === value.attempts &&
    value.correctStreak <= value.correct &&
    value.wrongStreak <= value.wrong &&
    (value.correctStreak === 0 || value.wrongStreak === 0)
  )
}

function isMistakeRecord(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (
    !hasExactKeys(value, ['wrongCount', 'wrongStreak', 'priorityRemaining']) ||
    !isNonNegativeInteger(value.wrongCount) ||
    !isNonNegativeInteger(value.wrongStreak) ||
    !isNonNegativeInteger(value.priorityRemaining)
  ) {
    return false
  }

  return value.wrongStreak <= value.wrongCount && value.priorityRemaining <= 3
}

function isRecordOf(value: unknown, validator: (item: unknown) => boolean): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).every(isNonEmptyString) &&
    Object.values(value).every(validator)
  )
}

function isStudySessionSnapshot(value: unknown): value is StudySessionSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, ['queueIds', 'currentIndex'])) return false
  if (!Array.isArray(value.queueIds) || !value.queueIds.every(isNonEmptyString)) return false
  if (new Set(value.queueIds).size !== value.queueIds.length) return false

  return (
    isNonNegativeInteger(value.currentIndex) &&
    value.currentIndex <= value.queueIds.length
  )
}

function isStudySessions(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, LEVELS)) return false
  return Object.values(value).every(isStudySessionSnapshot)
}

function isDifficultyStats(value: unknown): value is DifficultyStats {
  if (!isRecord(value)) return false
  if (!hasExactKeys(value, ['attempts', 'correct'])) return false
  return (
    isNonNegativeInteger(value.attempts) &&
    isNonNegativeInteger(value.correct) &&
    value.correct <= value.attempts
  )
}

function isDifficultyStatsRecord(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, DIFFICULTIES)) return false
  return DIFFICULTIES.every((difficulty) => isDifficultyStats(value[difficulty]))
}

function isQuizTypeStats(value: unknown): value is QuizTypeStats {
  if (!isRecord(value) || !hasExactKeys(value, ['correct', 'wrong', 'total', 'accuracy'])) {
    return false
  }
  if (
    !isNonNegativeInteger(value.correct) ||
    !isNonNegativeInteger(value.wrong) ||
    !isNonNegativeInteger(value.total) ||
    !isRate(value.accuracy) ||
    value.correct + value.wrong !== value.total
  ) {
    return false
  }

  const expectedAccuracy = value.total === 0 ? 0 : value.correct / value.total
  return value.accuracy === expectedAccuracy
}

function isQuizSummary(value: unknown): boolean {
  if (!isRecord(value)) return false
  const typeStats = value.typeStats
  const heatmap = value.heatmap
  const wrongItemIds = value.wrongItemIds

  if (
    !hasExactKeys(value, [
      'score',
      'total',
      'accuracy',
      'typeStats',
      'heatmap',
      'wrongItemIds',
    ]) ||
    !isNonNegativeInteger(value.score) ||
    !isNonNegativeInteger(value.total) ||
    value.score > value.total ||
    !isRate(value.accuracy) ||
    !isRecord(typeStats) ||
    !hasExactKeys(typeStats, QUIZ_TYPES) ||
    !QUIZ_TYPES.every((type) => isQuizTypeStats(typeStats[type])) ||
    !Array.isArray(heatmap) ||
    !Array.isArray(wrongItemIds)
  ) {
    return false
  }

  const heatmapValid = heatmap.every(
    (entry) =>
      isRecord(entry) &&
      hasExactKeys(entry, ['questionId', 'sourceItemId', 'type', 'isCorrect']) &&
      isNonEmptyString(entry.questionId) &&
      isNonEmptyString(entry.sourceItemId) &&
      isEnumValue(QUIZ_TYPES, entry.type) &&
      typeof entry.isCorrect === 'boolean',
  )
  if (!heatmapValid || heatmap.length !== value.total) return false
  if (!wrongItemIds.every(isNonEmptyString)) return false
  if (new Set(wrongItemIds).size !== wrongItemIds.length) return false

  const expectedAccuracy = value.total === 0 ? 0 : value.score / value.total
  if (value.accuracy !== expectedAccuracy) return false

  const correctCount = heatmap.filter(
    (entry) => isRecord(entry) && entry.isCorrect === true,
  ).length
  if (correctCount !== value.score) return false

  const expectedWrongItemIds = [
    ...new Set(
      heatmap
        .filter((entry) => isRecord(entry) && entry.isCorrect === false)
        .map((entry) => (isRecord(entry) ? entry.sourceItemId : null))
        .filter(isNonEmptyString),
    ),
  ]
  if (
    expectedWrongItemIds.length !== wrongItemIds.length ||
    expectedWrongItemIds.some((id, index) => id !== wrongItemIds[index])
  ) {
    return false
  }

  return QUIZ_TYPES.every((type) => {
    const entries = heatmap.filter(
      (entry) => isRecord(entry) && entry.type === type,
    )
    const stats = typeStats[type] as QuizTypeStats
    return (
      entries.length === stats.total &&
      entries.filter((entry) => isRecord(entry) && entry.isCorrect === true).length ===
        stats.correct
    )
  })
}

export function isAppState(value: unknown): value is AppState {
  if (!isRecord(value)) return false
  if (
    !hasExactKeys(value, [
      'schemaVersion',
      'navigation',
      'mastery',
      'mistakes',
      'studySessions',
      'difficultyStats',
      'quizHistory',
    ]) ||
    value.schemaVersion !== 1 ||
    !isNavigationState(value.navigation) ||
    !isRecordOf(value.mastery, isWordMastery) ||
    !isRecordOf(value.mistakes, isMistakeRecord) ||
    !isStudySessions(value.studySessions) ||
    !isDifficultyStatsRecord(value.difficultyStats) ||
    !Array.isArray(value.quizHistory) ||
    value.quizHistory.length > 7
  ) {
    return false
  }

  return value.quizHistory.every(isQuizSummary)
}

const LEGACY_KEYS = [
  'level',
  'section',
  'grammarSection',
  'studyDifficulty',
  'quizType',
] as const

function migrateLegacy(value: unknown): AppState | null {
  if (!isRecord(value) || Object.keys(value).length === 0) return null
  if ('schemaVersion' in value || !hasOnlyKeys(value, LEGACY_KEYS)) return null

  const state = createInitialState()
  const navigation = { ...state.navigation }

  if ('level' in value) {
    if (!isEnumValue(LEVELS, value.level)) return null
    navigation.level = value.level
  }
  if ('section' in value) {
    if (!isEnumValue(SECTIONS, value.section)) return null
    navigation.section = value.section
  }
  if ('grammarSection' in value) {
    if (!isEnumValue(GRAMMAR_SECTIONS, value.grammarSection)) return null
    navigation.grammarSection = value.grammarSection
  }
  if ('studyDifficulty' in value) {
    if (!isEnumValue(DIFFICULTIES, value.studyDifficulty)) return null
    navigation.studyDifficulty = value.studyDifficulty
  }
  if ('quizType' in value) {
    if (!isEnumValue(QUIZ_TYPES, value.quizType)) return null
    navigation.quizType = value.quizType
  }

  return { ...state, navigation }
}

function recovered(rawBackup: string | null): LoadResult {
  return {
    state: createInitialState(),
    status: 'recovered',
    warning: RECOVERY_WARNING,
    rawBackup,
  }
}

export function loadAppState(storage: Pick<Storage, 'getItem'>): LoadResult {
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return recovered(null)
  }

  if (raw === null) {
    return {
      state: createInitialState(),
      status: 'empty',
      warning: null,
      rawBackup: null,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return recovered(raw)
  }

  if (isAppState(parsed)) {
    return { state: parsed, status: 'loaded', warning: null, rawBackup: null }
  }

  const migrated = migrateLegacy(parsed)
  if (migrated) {
    return {
      state: migrated,
      status: 'migrated',
      warning: MIGRATION_WARNING,
      rawBackup: raw,
    }
  }

  return recovered(raw)
}

export function saveAppState(
  storage: Pick<Storage, 'setItem'>,
  state: AppState,
): SaveResult {
  try {
    if (!isAppState(state)) return { ok: false, message: SAVE_ERROR_MESSAGE }
    const serialized = JSON.stringify(state)
    storage.setItem(STORAGE_KEY, serialized)
    return { ok: true }
  } catch {
    return { ok: false, message: SAVE_ERROR_MESSAGE }
  }
}
