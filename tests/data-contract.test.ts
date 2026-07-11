import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ValidationIssue } from '../src/domain/content/types'
import { LEVELS } from '../src/domain/content/types'
import { catalogCounts, readCatalogFromDisk } from '../scripts/catalog-files'
import {
  formatValidationIssues,
  main,
  parseValidationMode,
  validateData,
} from '../scripts/validate-data'

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const DATA_ROOT = resolve(TEST_DIRECTORY, '../public/data')
const EXPECTED_COUNTS = {
  words: 124,
  phrasalVerbs: 8,
  grammarNodes: 42,
  stories: 4,
}

describe('data catalog contract', () => {
  test('reads every content JSON file into the expected catalog totals', async () => {
    const catalog = await readCatalogFromDisk(DATA_ROOT)

    expect(catalogCounts(catalog)).toEqual(EXPECTED_COUNTS)
  })

  test('development validation and CLI succeed with concise counts', async () => {
    const result = await validateData(DATA_ROOT, 'development')
    const logs: string[] = []
    const errors: string[] = []

    expect(result.issues).toEqual([])
    expect(result.counts).toEqual(EXPECTED_COUNTS)
    await expect(
      main(['--mode=development'], {
        dataRoot: DATA_ROOT,
        log: (line) => logs.push(line),
        error: (line) => errors.push(line),
      }),
    ).resolves.toBe(0)
    expect(errors).toEqual([])
    expect(logs.join('\n')).toMatch(/words=124/)
    expect(logs.join('\n')).toMatch(/phrasalVerbs=8/)
    expect(logs.join('\n')).toMatch(/grammarNodes=42/)
    expect(logs.join('\n')).toMatch(/stories=4/)
    expect(logs.join('\n')).toMatch(/succeeded/i)
  })

  test('release validation reports only per-level word and phrasal count gaps', async () => {
    const { issues } = await validateData(DATA_ROOT, 'release')

    expect(issues.length).toBeGreaterThan(0)
    expect(new Set(issues.map(({ code }) => code))).toEqual(
      new Set(['WORD_COUNT_MISMATCH', 'PHRASAL_COUNT_MISMATCH']),
    )
    for (const level of LEVELS) {
      expect(issues).toContainEqual(
        expect.objectContaining({
          code: 'WORD_COUNT_MISMATCH',
          path: `wordlists.${level}`,
        }),
      )
      expect(issues).toContainEqual(
        expect.objectContaining({
          code: 'PHRASAL_COUNT_MISMATCH',
          path: `phrasalVerbs.byLevel.${level}`,
        }),
      )
    }
  })

  test('release CLI fails and prints both count issue codes', async () => {
    const logs: string[] = []
    const errors: string[] = []

    await expect(
      main(['--mode=release'], {
        dataRoot: DATA_ROOT,
        log: (line) => logs.push(line),
        error: (line) => errors.push(line),
      }),
    ).resolves.toBe(1)
    expect(logs).toEqual([])
    expect(errors.join('\n')).toContain('WORD_COUNT_MISMATCH')
    expect(errors.join('\n')).toContain('PHRASAL_COUNT_MISMATCH')
  })

  test('parses only the two exact validation mode arguments', () => {
    expect(parseValidationMode(['--mode=development'])).toBe('development')
    expect(parseValidationMode(['--mode=release'])).toBe('release')

    for (const args of [[], ['--mode=staging'], ['--mode=release', '--extra']]) {
      expect(() => parseValidationMode(args)).toThrow(
        'Usage: validate-data --mode=development|--mode=release',
      )
    }
  })

  test('CLI reports invalid arguments and read failures with exit code 2', async () => {
    const invalidErrors: string[] = []
    const missingErrors: string[] = []
    const missingRoot = resolve(TEST_DIRECTORY, '../public/__missing-data-root__')

    await expect(
      main([], { error: (line) => invalidErrors.push(line) }),
    ).resolves.toBe(2)
    expect(invalidErrors).toEqual([
      'Usage: validate-data --mode=development|--mode=release',
    ])

    await expect(
      main(['--mode=development'], {
        dataRoot: missingRoot,
        error: (line) => missingErrors.push(line),
      }),
    ).resolves.toBe(2)
    expect(missingErrors.join('\n')).toContain(missingRoot)
    expect(missingErrors.join('\n')).toMatch(/\.json/)
  })

  test('CLI reports malformed JSON structure as validation issues', async () => {
    const tempDirectory = await mkdtemp(resolve(tmpdir(), 'englishwords-data-contract-'))
    const tempRoot = resolve(tempDirectory, 'data')

    try {
      await cp(DATA_ROOT, tempRoot, { recursive: true })
      await writeFile(
        resolve(tempRoot, 'phrasal-verbs/top-1000.json'),
        'null\n',
        'utf8',
      )
      const logs: string[] = []
      const errors: string[] = []

      await expect(
        main(['--mode=development'], {
          dataRoot: tempRoot,
          log: (line) => logs.push(line),
          error: (line) => errors.push(line),
        }),
      ).resolves.toBe(1)
      expect(logs).toEqual([])
      expect(errors.join('\n')).toContain(
        'INVALID_CATALOG phrasalVerbs.top: phrasalVerbs.top must be an array.',
      )
      expect(errors.join('\n')).not.toMatch(/\.length|reading ['"]length['"]/)
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  test('formats one exact line per validation issue', () => {
    const issues: ValidationIssue[] = [
      {
        code: 'WORD_COUNT_MISMATCH',
        path: 'wordlists.기초',
        message: 'Expected 500 words for 기초; found 8.',
      },
      {
        code: 'PHRASAL_COUNT_MISMATCH',
        path: 'phrasalVerbs.byLevel.기초',
        message: 'Expected 250 phrasal verbs for 기초; found 2.',
      },
    ]

    expect(formatValidationIssues(issues)).toBe(
      'WORD_COUNT_MISMATCH wordlists.기초: Expected 500 words for 기초; found 8.\n' +
        'PHRASAL_COUNT_MISMATCH phrasalVerbs.byLevel.기초: Expected 250 phrasal verbs for 기초; found 2.',
    )
  })

  test('a missing data root rejects with the missing JSON file path', async () => {
    const missingRoot = resolve(TEST_DIRECTORY, '../public/__missing-data-root__')

    let thrown: unknown
    try {
      await readCatalogFromDisk(missingRoot)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toContain(missingRoot)
    expect((thrown as Error).message).toMatch(/\.json/)
  })
})
