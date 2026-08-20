import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import type { GrammarNode } from '../../src/domain/content/types'
import { grammarProductionConstraintsForLevel } from '../../src/domain/grammar/productionConstraints'
import {
  AUDITED_ERROR_PAIRS,
  refineGrammarNodes,
} from './refineGrammarContent'

function sourceNodes(): GrammarNode[] {
  return JSON.parse(
    readFileSync('public/data/grammar/nodes.json', 'utf8'),
  ) as GrammarNode[]
}

function normalizedException(value: string): string {
  return value.replace(/^[A-Z]+-\d+:\s*/u, '').replace(/\s+/gu, ' ').trim()
}

describe('grammar content refinement', () => {
  test('is byte-stable when the generated grammar is used as the next build input', () => {
    const once = refineGrammarNodes(sourceNodes())
    expect(refineGrammarNodes(once)).toEqual(once)
  })

  test('links every error code to a varied exercise or an explicit production check', () => {
    const nodes = refineGrammarNodes(sourceNodes())

    expect(nodes).toHaveLength(42)
    for (const node of nodes) {
      const exerciseCodes = new Set(node.exercises.map(({ errorCode }) => errorCode))
      const productionChecks = node.productionTask.rubric.join(' ')
      expect(exerciseCodes.size, node.id).toBe(
        Math.min(3, node.errorCodes.length),
      )
      for (const code of node.errorCodes) {
        expect(
          exerciseCodes.has(code) || productionChecks.includes(code),
          `${node.id}/${code}`,
        ).toBe(true)
      }
    }
  })

  test('emits the canonical level production profile for all 42 nodes', () => {
    const nodes = refineGrammarNodes(sourceNodes())

    expect(nodes).toHaveLength(42)
    for (const node of nodes) {
      expect(node.productionTask.constraints, node.id).toEqual(
        grammarProductionConstraintsForLevel(node.level),
      )
      expect(node.productionTask.rubric, node.id).toHaveLength(3)
      for (const requirement of node.productionTask.constraints.evidenceRequirements) {
        expect(node.productionTask.requirements, `${node.id}/${requirement.id}`)
          .toContain(requirement.label)
      }
    }
  })

  test('removes corpus-wide boilerplate repetition from exception guidance', () => {
    const exceptions = refineGrammarNodes(sourceNodes()).flatMap((node) =>
      node.rules.flatMap(({ exceptions: values }) => values))
    const normalized = exceptions.map(normalizedException)

    expect(normalized).toHaveLength(176)
    expect(new Set(normalized).size).toBe(normalized.length)
  })

  test('has one fail-closed audited pair for every node and error code', () => {
    const source = sourceNodes()
    const expectedKeys = source.flatMap((node) =>
      node.errorCodes.map((code) => `${node.id}:${code}`)).sort()
    const actualKeys = Object.keys(AUDITED_ERROR_PAIRS).sort()

    expect(source).toHaveLength(42)
    expect(expectedKeys).toHaveLength(88)
    expect(actualKeys).toEqual(expectedKeys)
    expect(new Set(Object.values(AUDITED_ERROR_PAIRS).map((pair) =>
      `${pair.wrong}\u0000${pair.correct}`)).size).toBe(88)

    for (const node of source) {
      for (const code of node.errorCodes) {
        const key = `${node.id}:${code}`
        const pair = AUDITED_ERROR_PAIRS[key]!
        expect(node.patterns, key).toContain(pair.targetPattern)
        expect(pair.wrong, key).not.toBe(pair.correct)
        expect(`${pair.wrong} ${pair.correct}`, key).not.toMatch(/\(task \d+\)/i)
      }
    }
  })

  test('keeps every audited pair anchored to its own grammar node', () => {
    const anchors: Readonly<Record<string, RegExp>> = {
      'A1-G01': /\b(?:soup|brother)\b/i,
      'A1-G02': /\b(?:Mina|cousins?)\b/i,
      'A1-G03': /\b(?:cups?|pharmacy)\b/i,
      'A1-G04': /\b(?:children|train|Busan)\b/i,
      'A1-G05': /\b(?:called|calls?)\b/i,
      'A1-G06': /\b(?:dog|lesson)\b/i,
      'A1-G07': /\b(?:swim|window)\b/i,
      'A1-G08': /\b(?:raining|tired)\b/i,
      'A2-G01': /\bJeju\b/i,
      'A2-G02': /\b(?:neighborhood|years)\b/i,
      'A2-G03': /\b(?:route|Maya)\b/i,
      'A2-G04': /\b(?:milk|chairs)\b/i,
      'A2-G05': /\b(?:visitors|swim)\b/i,
      'A2-G06': /\b(?:museum|documents)\b/i,
      'A2-G07': /(?:\bwoman\b|café)/i,
      'A2-G08': /\b(?:bicycle|coach)\b/i,
      'A2-G09': /\bNora\b/i,
      'B1-G01': /\b(?:film|train)\b/i,
      'B1-G02': /\b(?:answer|wish|problem)\b/i,
      'B1-G03': /\b(?:Jin|guide|exit)\b/i,
      'B1-G04': /\b(?:plan|ATM)\b/i,
      'B1-G05': /\b(?:book|Patel)\b/i,
      'B1-G06': /\b(?:lights|applications)\b/i,
      'B1-G07': /\b(?:river|grandfather)\b/i,
      'B1-G08': /\b(?:task|road)\b/i,
      'B1-G09': /\b(?:water|door)\b/i,
      'B2-G01': /\b(?:rehears\w*|certification)\b/i,
      'B2-G02': /\b(?:forecast|Berlin)\b/i,
      'B2-G03': /\b(?:schedule|package)\b/i,
      'B2-G04': /\b(?:presentation|documents)\b/i,
      'B2-G05': /\b(?:craftsmanship|Hana)\b/i,
      'B2-G06': /\b(?:conditioner|door)\b/i,
      'B2-G07': /\b(?:committee|heat)\b/i,
      'B2-G08': /\b(?:city|sample)\b/i,
      'B2-G09': /\b(?:proposals|sisters)\b/i,
      'C1-G01': /\b(?:proposal|teams)\b/i,
      'C1-G02': /\b(?:audit|evidence)\b/i,
      'C1-G03': /\b(?:decline|reporting)\b/i,
      'C1-G04': /\b(?:policy|processing)\b/i,
      'C1-G05': /\b(?:figures|study)\b/i,
      'C1-G06': /\b(?:research|impact|mobility)\b/i,
      'C1-G07': /\b(?:evidence|proposal)\b/i,
    }

    expect(Object.keys(anchors).sort()).toEqual(sourceNodes().map(({ id }) => id).sort())
    for (const [key, pair] of Object.entries(AUDITED_ERROR_PAIRS)) {
      const nodeId = key.split(':', 1)[0]!
      expect(anchors[nodeId]!.test(`${pair.wrong} ${pair.correct}`), key).toBe(true)
    }
  })

  test('emits each audited pair with its reviewed target pattern', () => {
    for (const node of refineGrammarNodes(sourceNodes())) {
      for (const note of node.errorNotes) {
        const key = `${node.id}:${note.code}`
        const pair = AUDITED_ERROR_PAIRS[key]!
        expect(note.wrongExample, key).toBe(pair.wrong)
        expect(note.correction, key).toContain(`올바른 예: ${pair.correct}`)
        expect(note.correction, key).toContain(`목표 패턴: ${pair.targetPattern}`)
      }
    }
  })

  test('fixes the audited WH-question, collocation, and preposition mismatches', () => {
    const nodes = refineGrammarNodes(sourceNodes())
    const note = (nodeId: string, code: string) => nodes
      .find(({ id }) => id === nodeId)!
      .errorNotes.find((entry) => entry.code === code)!

    expect(note('A1-G02', 'WO-02')).toMatchObject({
      wrongExample: 'Where your cousin does work?',
      correction: expect.stringContaining('Where does your cousin work?'),
    })
    expect(note('C1-G07', 'REG-08')).toMatchObject({
      wrongExample: 'We did a decision after reviewing the evidence.',
      correction: expect.stringContaining('We made a decision'),
    })
    expect(note('C1-G07', 'PREP-06')).toMatchObject({
      wrongExample: "The team discussed about the proposal in detail at yesterday's meeting.",
      correction: expect.stringContaining('discussed the proposal'),
    })
  })
})
