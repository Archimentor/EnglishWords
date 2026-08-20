import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ValidationIssue } from '../src/domain/content/types'
import { LEVELS } from '../src/domain/content/types'
import { catalogCounts, readCatalogFromDisk } from '../scripts/catalog-files'
import { acquireBuildLock, buildLockPathForDataRoot } from '../scripts/build-lock'
import {
  formatValidationIssues,
  main,
  parseValidationMode,
  validateData,
} from '../scripts/validate-data'
import { storyCatalogOutputDigest } from '../scripts/content/catalogDigest'
import {
  commitContentArtifacts,
  CONTENT_GENERATION_MARKER_NAME,
  contentGenerationSwapPaths,
  validateContentGenerationResidue,
} from '../scripts/content/buildContent'

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const DATA_ROOT = resolve(TEST_DIRECTORY, '../public/data')
const EXPECTED_COUNTS = {
  words: 5000,
  phrasalVerbs: 1000,
  grammarNodes: 42,
  stories: 4,
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeGenerationMarker(
  directory: string,
  dataRoot: string,
  role: 'staging' | 'rollback',
  token = '11111111-1111-4111-8111-111111111111',
): Promise<void> {
  await writeJsonFile(resolve(directory, CONTENT_GENERATION_MARKER_NAME), {
    schemaVersion: '1.0.0',
    kind: 'english-words-content-generation-swap',
    dataRoot: resolve(dataRoot),
    role,
    token,
  })
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
    expect(logs.join('\n')).toMatch(/words=5000/)
    expect(logs.join('\n')).toMatch(/phrasalVerbs=1000/)
    expect(logs.join('\n')).toMatch(/grammarNodes=42/)
    expect(logs.join('\n')).toMatch(/stories=4/)
    expect(logs.join('\n')).toMatch(/succeeded/i)
  }, 15_000)

  test('production release validation reflects the current story approvals', async () => {
    const { catalog, issues } = await validateData(DATA_ROOT, 'release')
    const expectedIssues = LEVELS
      .filter((level) => catalog.stories[level].isManual === false)
      .map((level) => ({
        code: 'STORY_NOT_MANUAL' as const,
        path: `stories.${level}.isManual`,
        message: `Story for ${level} must be manually reviewed before release.`,
      }))

    expect(issues).toEqual(expectedIssues)
  })

  test('release validation and CLI reject an intentionally unreviewed fixture', async () => {
    const tempDirectory = await mkdtemp(resolve(tmpdir(), 'englishwords-release-gate-'))
    const tempRoot = resolve(tempDirectory, 'data')
    const logs: string[] = []
    const errors: string[] = []

    try {
      await cp(DATA_ROOT, tempRoot, { recursive: true })
      const fixtureCatalog = await readCatalogFromDisk(tempRoot)
      await Promise.all(LEVELS.map((level) => writeFile(
        resolve(tempRoot, 'stories', `${level}.json`),
        `${JSON.stringify({ ...fixtureCatalog.stories[level], isManual: false }, null, 2)}\n`,
        'utf8',
      )))
      const updatedCatalog = await readCatalogFromDisk(tempRoot)
      const storyProvenancePath = resolve(tempRoot, 'provenance/story-drafts.json')
      const storyProvenance = await readJsonFile<Record<string, unknown>>(storyProvenancePath)
      await writeJsonFile(storyProvenancePath, {
        ...storyProvenance,
        outputDigest: storyCatalogOutputDigest(updatedCatalog.stories),
        status: 'automated-drafts',
        stories: LEVELS.map((level) => ({
          level,
          source: 'automated-draft',
          lemmaCount: updatedCatalog.stories[level].usedWords.length,
          phrasalVerbCount: updatedCatalog.stories[level].usedPhrasalVerbs.length,
          coverageRate: updatedCatalog.stories[level].coverage.coverageRate,
        })),
      })

      const { issues } = await validateData(tempRoot, 'release')
      expect(issues).toEqual(LEVELS.map((level) => ({
        code: 'STORY_NOT_MANUAL',
        path: `stories.${level}.isManual`,
        message: `Story for ${level} must be manually reviewed before release.`,
      })))

      await expect(
        main(['--mode=release'], {
          dataRoot: tempRoot,
          log: (line) => logs.push(line),
          error: (line) => errors.push(line),
        }),
      ).resolves.toBe(1)
      expect(logs).toEqual([])
      expect(errors.join('\n')).toContain('STORY_NOT_MANUAL')
      expect(errors.join('\n')).not.toContain('WORD_COUNT_MISMATCH')
      expect(errors.join('\n')).not.toContain('PHRASAL_COUNT_MISMATCH')
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  }, 15_000)

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

  test('an active shared build lock alone is not reported as generation residue', async () => {
    const tempDirectory = await mkdtemp(resolve(tmpdir(), 'englishwords-active-lock-'))
    const tempRoot = resolve(tempDirectory, 'data')
    await mkdir(tempRoot)
    const lock = await acquireBuildLock(buildLockPathForDataRoot(tempRoot))
    try {
      await expect(validateContentGenerationResidue(tempRoot)).resolves.toEqual([])
    } finally {
      await lock.release()
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  test.each([
    ['staging', 'stagingRoot', 'staging', 'contentBuild.stagingRoot'],
    ['rollback', 'rollbackRoot', 'rollback', 'contentBuild.rollbackRoot'],
    ['data-root journal', 'dataRoot', 'staging', 'contentBuild.dataRootMarker'],
  ] as const)(
    '%s generation state is a structured validation residue',
    async (_state, directoryKey, role, issuePath) => {
      const tempDirectory = await mkdtemp(resolve(tmpdir(), 'englishwords-generation-state-'))
      const tempRoot = resolve(tempDirectory, 'data')
      await mkdir(tempRoot)
      const paths = contentGenerationSwapPaths(tempRoot)
      const markerDirectory = paths[directoryKey]
      try {
        if (markerDirectory !== tempRoot) await mkdir(markerDirectory)
        await writeGenerationMarker(markerDirectory, tempRoot, role)

        await expect(validateContentGenerationResidue(tempRoot)).resolves.toContainEqual(
          expect.objectContaining({
            code: 'CONTENT_BUILD_RESIDUE',
            path: issuePath,
          }),
        )
      } finally {
        await rm(tempDirectory, { recursive: true, force: true })
      }
    },
  )

  test('unowned generation path collisions are structured unsafe residue', async () => {
    const tempDirectory = await mkdtemp(resolve(tmpdir(), 'englishwords-unsafe-residue-'))
    const tempRoot = resolve(tempDirectory, 'data')
    await mkdir(tempRoot)
    const paths = contentGenerationSwapPaths(tempRoot)
    try {
      await mkdir(paths.stagingRoot)
      await writeFile(resolve(paths.stagingRoot, 'owner.txt'), 'unknown owner')

      await expect(validateContentGenerationResidue(tempRoot)).resolves.toContainEqual(
        expect.objectContaining({
          code: 'UNSAFE_CONTENT_BUILD_RESIDUE',
          path: 'contentBuild.stagingRoot',
        }),
      )
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  test('post-commit cleanup residue makes validate:data and its CLI fail', async () => {
    const tempDirectory = await mkdtemp(resolve(tmpdir(), 'englishwords-cleanup-residue-'))
    const tempRoot = resolve(tempDirectory, 'data')
    const errors: string[] = []
    try {
      await cp(DATA_ROOT, tempRoot, { recursive: true })
      const target = resolve(tempRoot, 'grammar/nodes.json')
      const result = await commitContentArtifacts(
        tempRoot,
        [{ target, bytes: await readFile(target) }],
        { beforeRollbackCleanup: () => { throw new Error('injected cleanup failure') } },
      )
      expect(result.status).toBe('committed-with-cleanup-residue')

      const { issues } = await validateData(tempRoot, 'development')
      expect(issues).toContainEqual(expect.objectContaining({
        code: 'CONTENT_BUILD_RESIDUE',
        path: 'contentBuild.rollbackRoot',
      }))
      await expect(main(['--mode=development'], {
        dataRoot: tempRoot,
        log: () => undefined,
        error: (line) => errors.push(line),
      })).resolves.toBe(1)
      expect(errors.join('\n')).toContain('CONTENT_BUILD_RESIDUE contentBuild.rollbackRoot')
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
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

  test('missing provenance is a structured validation failure instead of an unhandled read error', async () => {
    const tempDirectory = await mkdtemp(resolve(tmpdir(), 'englishwords-provenance-missing-'))
    const tempRoot = resolve(tempDirectory, 'data')
    try {
      await cp(DATA_ROOT, tempRoot, { recursive: true })
      await unlink(resolve(tempRoot, 'provenance/word-catalog.json'))

      const { issues } = await validateData(tempRoot, 'development')
      expect(issues).toContainEqual(expect.objectContaining({
        code: 'PROVENANCE_READ_ERROR',
        path: 'provenance.wordCatalog',
      }))
      await expect(main(['--mode=development'], {
        dataRoot: tempRoot,
        log: () => undefined,
        error: () => undefined,
      })).resolves.toBe(1)
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  test('stale, open, source-divergent, and row-divergent provenance fails closed', async () => {
    const tempDirectory = await mkdtemp(resolve(tmpdir(), 'englishwords-provenance-contract-'))
    const tempRoot = resolve(tempDirectory, 'data')
    try {
      await cp(DATA_ROOT, tempRoot, { recursive: true })
      const wordPath = resolve(tempRoot, 'provenance/word-catalog.json')
      const phrasalPath = resolve(tempRoot, 'provenance/phrasal-catalog.json')
      const storyPath = resolve(tempRoot, 'provenance/story-drafts.json')
      const word = await readJsonFile<Record<string, unknown> & {
        schemaVersion: string
      }>(wordPath)
      const phrasal = await readJsonFile<Record<string, unknown> & {
        phrases: Array<{ phrase: string }>
        sources: Array<{ sha256: string }>
        undeclared?: boolean
      }>(phrasalPath)
      const story = await readJsonFile<Record<string, unknown> & {
        stories: unknown[]
      }>(storyPath)
      word.schemaVersion = '2.0.0'
      phrasal.undeclared = true
      phrasal.sources[0]!.sha256 = '0'.repeat(64)
      phrasal.phrases[0]!.phrase = 'not the catalog phrase'
      story.stories.pop()
      await Promise.all([
        writeJsonFile(wordPath, word),
        writeJsonFile(phrasalPath, phrasal),
        writeJsonFile(storyPath, story),
      ])

      const { issues } = await validateData(tempRoot, 'development')
      expect(issues).toContainEqual(expect.objectContaining({
        code: 'INVALID_PROVENANCE',
        path: 'wordProvenance.schemaVersion',
      }))
      expect(issues).toContainEqual(expect.objectContaining({
        code: 'INVALID_PROVENANCE',
        path: 'phrasalProvenance',
      }))
      expect(issues).toContainEqual(expect.objectContaining({
        code: 'INVALID_PROVENANCE',
        path: 'phrasalProvenance.sources[0].sha256',
      }))
      expect(issues).toContainEqual(expect.objectContaining({
        code: 'INVALID_PROVENANCE',
        path: 'phrasalProvenance.phrases[0].phrase',
      }))
      expect(issues).toContainEqual(expect.objectContaining({
        code: 'INVALID_PROVENANCE',
        path: 'storyProvenance.stories',
      }))
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  test('catalog payload tampering is rejected by its provenance digest', async () => {
    const tempDirectory = await mkdtemp(resolve(tmpdir(), 'englishwords-provenance-digest-'))
    const tempRoot = resolve(tempDirectory, 'data')
    try {
      await cp(DATA_ROOT, tempRoot, { recursive: true })
      const catalog = await readCatalogFromDisk(tempRoot)
      const original = catalog.phrasalVerbs.top[0]!
      const tampered = {
        ...original,
        meaningKo: [...original.meaningKo, '검증용 변조'],
      }
      catalog.phrasalVerbs.top[0] = tampered
      const levelItems = catalog.phrasalVerbs.byLevel[original.levelHint]
      const levelIndex = levelItems.findIndex(({ id }) => id === original.id)
      levelItems[levelIndex] = tampered
      await Promise.all([
        writeJsonFile(resolve(tempRoot, 'phrasal-verbs/top-1000.json'), catalog.phrasalVerbs.top),
        writeJsonFile(
          resolve(tempRoot, 'phrasal-verbs/by-level', `${original.levelHint}.json`),
          levelItems,
        ),
      ])

      const { issues } = await validateData(tempRoot, 'development')
      expect(issues).toContainEqual(expect.objectContaining({
        code: 'PROVENANCE_DIGEST_MISMATCH',
        path: 'phrasalProvenance.outputDigest.value',
      }))
      expect(issues.some(({ code }) => code === 'PHRASAL_CONTENT_MISMATCH')).toBe(false)
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
