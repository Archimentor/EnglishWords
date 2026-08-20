import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const WORKFLOW_PATH = resolve('.github/workflows/pages.yml')
const CONTENT_REQUIREMENTS_PATH = resolve('scripts/content/requirements-content.txt')

function numericVersion(value: string): [number, number, number] {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/u)
  if (!match) throw new Error(`Invalid pinned version: ${value}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isAtLeast(
  actual: readonly number[],
  minimum: readonly number[],
): boolean {
  for (let index = 0; index < Math.max(actual.length, minimum.length); index += 1) {
    const difference = (actual[index] ?? 0) - (minimum[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return true
}

describe('toolchain supply-chain contracts', () => {
  it('pins every GitHub Action to an immutable full commit SHA', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8')
    const actionReferences = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gmu)]
      .map((match) => match[1]!)

    expect(actionReferences.length).toBeGreaterThan(0)
    expect(actionReferences.filter((reference) => !/@[a-f0-9]{40}$/u.test(reference)))
      .toEqual([])
  })

  it('keeps the SentencePiece model parser on the fixed release line', () => {
    const requirements = readFileSync(CONTENT_REQUIREMENTS_PATH, 'utf8')
    const version = requirements.match(/^sentencepiece==(\d+\.\d+\.\d+)$/mu)?.[1]

    expect(version).toBeDefined()
    expect(isAtLeast(numericVersion(version!), [0, 2, 1])).toBe(true)
  })
})
