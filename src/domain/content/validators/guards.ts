import { DIFFICULTIES, LEVELS } from '../types'
import type { Difficulty, Level, ValidationIssue } from '../types'

type UnknownRecord = Record<string, unknown>

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isNonBlankStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonBlankString)
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isRate(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

export function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value)
}

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value)
}

export function invalidCatalog(path: string, message: string): ValidationIssue {
  return { code: 'INVALID_CATALOG', path, message }
}

export function rejectAdditionalProperties(
  value: Record<string, unknown>,
  allowedFields: readonly string[],
  path: string,
  schemaName: string,
  issues: ValidationIssue[],
): void {
  for (const field of Object.keys(value)) {
    if (!allowedFields.includes(field)) {
      issues.push(
        invalidCatalog(
          `${path}.${field}`,
          `${field} is not allowed by the ${schemaName} schema.`,
        ),
      )
    }
  }
}

export function duplicateId(
  path: string,
  id: string,
  subject = 'Content',
): ValidationIssue {
  return {
    code: 'DUPLICATE_ID',
    path,
    message: `${subject} id "${id}" appears more than once.`,
  }
}

export function validateNonBlankArray(
  value: unknown,
  path: string,
  minimumLength: number,
  issues: ValidationIssue[],
): value is string[] {
  if (!isNonBlankStringArray(value)) {
    issues.push(invalidCatalog(path, `${path} must be an array of non-blank strings.`))
    return false
  }
  if (value.length < minimumLength) {
    issues.push(
      invalidCatalog(path, `${path} must contain at least ${minimumLength} item(s).`),
    )
    return false
  }
  return true
}
