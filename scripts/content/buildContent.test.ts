import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse, relative, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { LEVELS } from '../../src/domain/content/types'
import type { ContentCatalog, StoryContent } from '../../src/domain/content/types'
import { wordFamilyFor } from '../../src/domain/content/wordFamilies'
import { makeCatalog, makeWord } from '../../src/test/fixtures'
import {
  acquireBuildLock,
  buildLockPathForDataRoot,
  DEFAULT_BUILD_LOCK_PATH,
} from '../build-lock'
import {
  PHRASAL_CONTENT_SOURCE_IDS,
  type PhrasalCatalogProvenance,
} from './buildPhrasalCatalog'
import {
  buildContent,
  commitContentArtifacts,
  CONTENT_GENERATION_MARKER_NAME,
  contentGenerationSwapPaths,
  createContentGeneration,
  resolveContentBuildPaths,
  validateContentGenerationResidue,
  validateContentProvenance,
  type ContentBuildOptions,
  type ContentGenerationInput,
} from './buildContent'
import {
  WORD_CONTENT_SOURCE_IDS,
  type WordCatalogProvenance,
} from './buildWordCatalog'
import {
  PHRASAL_ALIGNMENT_MODEL,
  PHRASAL_TRANSLATION_MODEL,
} from './phrasalSource'
import {
  manualStorySourceDigest,
  phrasalCatalogOutputDigest,
  storyCatalogOutputDigest,
  wordCatalogOutputDigest,
} from './catalogDigest'
import {
  DEFAULT_CONTENT_CACHE_ROOT,
  DEFAULT_CONTENT_DATA_ROOT,
  DEFAULT_MANUAL_STORY_ROOT,
} from './paths'
import type { ApprovedManualStoryInput } from './manualStories'
import type { ContentSource, ContentSourceId } from './source-types'
import { CONTENT_SOURCES } from './sources'

const temporaryDirectories: string[] = []

const STORY_TEMPLATE_WORDS = [
  ['a', 'determiner', ['a']],
  ['and', 'conjunction', ['and']],
  ['at', 'preposition', ['at']],
  ['family', 'noun', ['family']],
  ['find', 'verb', ['find']],
  ['for', 'preposition', ['for']],
  ['from', 'preposition', ['from']],
  ['garden', 'noun', ['garden']],
  ['girl', 'noun', ['girl']],
  ['hand', 'noun', ['hand']],
  ['her', 'pronoun', ['her']],
  ['house', 'noun', ['house']],
  ['in', 'preposition', ['in']],
  ['letter', 'noun', ['letter']],
  ['look', 'verb', ['look', 'looks']],
  ['make', 'verb', ['make', 'makes']],
  ['near', 'preposition', ['near']],
  ['night', 'noun', ['night']],
  ['park', 'noun', ['park']],
  ['picture', 'noun', ['picture']],
  ['the', 'determiner', ['the']],
  ['to', 'preposition', ['to']],
  ['walk', 'verb', ['walk', 'walks']],
  ['with', 'preposition', ['with']],
  ['write', 'verb', ['write', 'writes']],
  ['young', 'adjective', ['young']],
] as const

function makeStoryCompatibleCatalog(): ContentCatalog {
  const catalog = makeCatalog()
  const existingLemmas = new Set(LEVELS.flatMap((level) =>
    catalog.wordlists[level].map(({ lemma }) => lemma)))
  const additions = STORY_TEMPLATE_WORDS.flatMap(([lemma, partOfSpeech, forms]) => {
    if (existingLemmas.has(lemma)) return []
    const family = wordFamilyFor(lemma)
    return [makeWord({
      id: `word-${lemma}`,
      word: lemma,
      lemma,
      familyId: family.familyId,
      isFamilyHead: family.isFamilyHead,
      level: '기초',
      entryOverrides: {
        partOfSpeech,
        forms: [...forms],
        meanings: [`${lemma} 시험 뜻`],
        ipa: `/${lemma}/`,
        examples: [`Use ${lemma} here.`, `Use ${lemma} again.`],
      },
    })]
  })
  return {
    ...catalog,
    wordlists: {
      ...catalog.wordlists,
      기초: [...catalog.wordlists.기초, ...additions],
    },
  }
}

function sourcesFor(sourceIds: readonly ContentSourceId[]): ContentSource[] {
  return sourceIds.map((sourceId) => {
    const source = CONTENT_SOURCES.find(({ id }) => id === sourceId)
    if (!source) throw new Error(`Missing fixture source: ${sourceId}`)
    return source
  })
}

function makeWordProvenance(catalog: ContentCatalog): WordCatalogProvenance {
  let nextSourceLine = 1
  const words: WordCatalogProvenance['words'] = LEVELS.flatMap((level) =>
    catalog.wordlists[level].map((word) => {
      const isEditorialBasic = level === '기초'
      const cefrLine = isEditorialBasic ? null : nextSourceLine++
      return {
        lemma: word.lemma,
        level,
        cefr: isEditorialBasic ? null : 'A1',
        cefrLine,
        frequencyRank: null,
        frequencyLine: null,
        entries: word.entries.map((entry) => ({
          koreanWiktionaryPage: isEditorialBasic ? null : word.lemma,
          omwSynsetIds: null,
          sourcePartOfSpeech: isEditorialBasic ? null : entry.partOfSpeech,
          catalogPartOfSpeech: entry.partOfSpeech,
          partOfSpeechResolution: isEditorialBasic
            ? 'editorial-basic' as const
            : 'exact-source-sense' as const,
          ipaSource: isEditorialBasic ? 'editorial-basic' as const : 'ipa-dict' as const,
          exampleSourceLines: isEditorialBasic ? null : [nextSourceLine++, nextSourceLine++],
        })),
      }
    }))
  return {
    schemaVersion: '4.0.0',
    generatedBy: 'scripts/content/buildWordCatalog.ts',
    outputDigest: wordCatalogOutputDigest(catalog.wordlists),
    selectionPolicy: {
      basic: 'fixture editorial selection',
      nonBasic: 'fixture sourced selection',
      quotas: Object.fromEntries(LEVELS.map((level) => [
        level,
        catalog.wordlists[level].length,
      ])) as Record<(typeof LEVELS)[number], number>,
    },
    sources: sourcesFor(WORD_CONTENT_SOURCE_IDS),
    words,
  }
}

function makePhrasalProvenance(catalog: ContentCatalog): PhrasalCatalogProvenance {
  return {
    schemaVersion: '2.0.0',
    generatedBy: 'scripts/content/buildPhrasalCatalog.ts',
    outputDigest: phrasalCatalogOutputDigest(
      catalog.phrasalVerbs.top,
      catalog.phrasalVerbs.byLevel,
    ),
    selectionPolicy: 'fixture source selection',
    sources: sourcesFor(PHRASAL_CONTENT_SOURCE_IDS),
    translation: {
      model: PHRASAL_TRANSLATION_MODEL,
      status: 'machine-assisted-draft-not-human-reviewed',
      caveat: 'Fixture translation remains a machine draft.',
    },
    alignment: {
      model: PHRASAL_ALIGNMENT_MODEL,
      status: 'machine-assisted-draft-not-human-reviewed',
      caveat: 'Fixture alignment remains a machine draft.',
    },
    phrases: catalog.phrasalVerbs.top.map((item, sourceIndex) => {
      const englishDescription = `Pinned fixture description for ${item.phrasalVerb}`
      return {
        phrase: item.phrasalVerb,
        level: item.levelHint,
        sourceIndex,
        sourceFrequency: 1,
        baseFrequencyRank: null,
        baseCefr: null,
        englishDescription,
        sourceDescription: englishDescription,
        selectionMethod: 'machine-assisted-audited-source-pair',
        translationStatus: 'machine-translated',
        reviewStatus: 'machine-assisted-draft-not-human-reviewed',
        senseId: createHash('sha256')
          .update(`${item.phrasalVerb}\n${englishDescription}`, 'utf8').digest('hex'),
        exampleOrigins: [{
          kind: 'phrasal-verbs-source',
          sourceId: 'phrasal-verbs',
          sourceIndex,
          exampleIndex: 0,
        }, {
          kind: 'phrasal-verbs-source',
          sourceId: 'phrasal-verbs',
          sourceIndex,
          exampleIndex: 1,
        }] as const,
      }
    }),
  }
}

function makeGenerationInput(
  catalog: ContentCatalog,
  dataRoot = 'generated-data',
): ContentGenerationInput {
  return {
    dataRoot,
    wordlists: catalog.wordlists,
    wordProvenance: makeWordProvenance(catalog),
    phrasalTop: catalog.phrasalVerbs.top,
    phrasalByLevel: catalog.phrasalVerbs.byLevel,
    phrasalProvenance: makePhrasalProvenance(catalog),
    grammarNodes: catalog.grammarNodes,
  }
}

function makeApprovedManualStoryInput(story: StoryContent): ApprovedManualStoryInput {
  return {
    schemaVersion: '1.0.0',
    story,
    approval: {
      reviewer: 'editor@example.com',
      reviewedAt: '2026-08-20T00:00:00.000Z',
      sourceDigest: manualStorySourceDigest(story),
    },
  }
}

function makeBuildOptions(
  catalog: ContentCatalog,
  dataRoot: string,
  overrides: Partial<ContentBuildOptions> = {},
): ContentBuildOptions {
  return {
    dataRoot,
    buildWords: async () => ({
      wordlists: catalog.wordlists,
      provenance: makeWordProvenance(catalog),
    }),
    buildPhrasals: async () => ({
      top: catalog.phrasalVerbs.top,
      byLevel: catalog.phrasalVerbs.byLevel,
      provenance: makePhrasalProvenance(catalog),
    }),
    readGrammar: async () => catalog.grammarNodes,
    loadManualStories: async () => ({}),
    commit: async () => undefined,
    ...overrides,
  }
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'wordmaster-content-build-'))
  temporaryDirectories.push(directory)
  return directory
}

async function makeTemporaryDataRoot(): Promise<string> {
  const directory = await makeTemporaryDirectory()
  const dataRoot = join(directory, 'data')
  await mkdir(dataRoot)
  return dataRoot
}

interface DirectorySnapshot {
  directories: string[]
  files: Record<string, string>
}

async function snapshotDirectory(root: string): Promise<DirectorySnapshot> {
  const directories: string[] = []
  const files: Record<string, string> = {}

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      const relativePath = relative(root, path)
      if (entry.isDirectory()) {
        directories.push(relativePath)
        await visit(path)
      } else {
        files[relativePath] = (await readFile(path)).toString('base64')
      }
    }
  }

  await visit(root)
  directories.sort()
  return { directories, files: Object.fromEntries(Object.entries(files).sort()) }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

async function writeGenerationMarkerFixture(
  directory: string,
  dataRoot: string,
  role: 'staging' | 'rollback',
  token: string,
): Promise<void> {
  await writeFile(join(directory, CONTENT_GENERATION_MARKER_NAME), `${JSON.stringify({
    schemaVersion: '1.0.0',
    kind: 'english-words-content-generation-swap',
    dataRoot: resolve(dataRoot),
    role,
    token,
  }, null, 2)}\n`)
}

async function expectNoSwapResidue(dataRoot: string): Promise<void> {
  const paths = contentGenerationSwapPaths(dataRoot)
  expect(await pathExists(paths.stagingRoot)).toBe(false)
  expect(await pathExists(paths.rollbackRoot)).toBe(false)
  expect(await pathExists(join(dataRoot, CONTENT_GENERATION_MARKER_NAME))).toBe(false)
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })))
})

describe('createContentGeneration', () => {
  it('computes deterministic output digests independent of object key insertion order', () => {
    const source = makeStoryCompatibleCatalog()
    const original = source.wordlists.기초[0]!
    const reordered = Object.fromEntries(
      Object.entries(original).reverse(),
    ) as unknown as typeof original
    const reorderedWordlists = structuredClone(source.wordlists)
    reorderedWordlists.기초[0] = reordered

    expect(wordCatalogOutputDigest(reorderedWordlists))
      .toEqual(wordCatalogOutputDigest(source.wordlists))
    reorderedWordlists.기초[0] = {
      ...reordered,
      lemma: `${reordered.lemma}-changed`,
    }
    expect(wordCatalogOutputDigest(reorderedWordlists).value)
      .not.toBe(wordCatalogOutputDigest(source.wordlists).value)
  })

  it('validates the complete in-memory catalog and includes every generated artifact', () => {
    const source = makeStoryCompatibleCatalog()
    const generation = createContentGeneration(makeGenerationInput(source))

    expect(generation.artifacts).toHaveLength(17)
    const grammarArtifact = generation.artifacts.find(({ target }) =>
      target.endsWith(join('grammar', 'nodes.json')))
    expect(JSON.parse(grammarArtifact!.bytes.toString('utf8')))
      .toEqual(generation.catalog.grammarNodes)
    expect(LEVELS.every((level) => !generation.catalog.stories[level].isManual)).toBe(true)
    const storyProvenance = generation.artifacts.find(({ target }) =>
      target.endsWith('story-drafts.json'))
    expect(storyProvenance).toBeDefined()
    expect(JSON.parse(storyProvenance!.bytes.toString('utf8'))).toMatchObject({
      schemaVersion: '3.0.0',
      status: 'automated-drafts',
      outputDigest: {
        algorithm: 'sha256',
        canonicalization: 'sorted-json-v1',
        value: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      stories: LEVELS.map((level) => ({
        level,
        source: 'automated-draft',
        lemmaCount: generation.catalog.stories[level].usedWords.length,
        coverageRate: generation.catalog.stories[level].coverage.coverageRate,
      })),
    })
  })

  it('preserves approved human stories and drafts only the missing levels', () => {
    const source = makeStoryCompatibleCatalog()
    const initial = createContentGeneration(makeGenerationInput(source))
    const manualStory: StoryContent = {
      ...structuredClone(initial.catalog.stories.기초),
      title: '사람이 최종 검수한 기초 이야기',
      isManual: true,
    }
    const input = makeGenerationInput(source)
    input.approvedManualStories = {
      기초: makeApprovedManualStoryInput(manualStory),
    }

    const generation = createContentGeneration(input)
    expect(generation.catalog.stories.기초).toEqual(manualStory)
    expect(LEVELS.slice(1).every((level) =>
      generation.catalog.stories[level].isManual === false)).toBe(true)

    const provenanceArtifact = generation.artifacts.find(({ target }) =>
      target.endsWith('story-drafts.json'))!
    const provenance = JSON.parse(provenanceArtifact.bytes.toString('utf8'))
    expect(provenance).toMatchObject({
      schemaVersion: '3.0.0',
      status: 'mixed-approved-manual-and-automated',
      stories: [{
        level: '기초',
        source: 'approved-manual-input',
        approval: input.approvedManualStories.기초!.approval,
      }, ...LEVELS.slice(1).map((level) => ({
        level,
        source: 'automated-draft',
      }))],
    })
  })

  it('loads approved inputs through the aggregate build before committing', async () => {
    const source = makeStoryCompatibleCatalog()
    const directory = await makeTemporaryDataRoot()
    const initial = createContentGeneration(makeGenerationInput(source))
    const manualStory: StoryContent = {
      ...structuredClone(initial.catalog.stories.기초),
      title: '빌드가 보존할 승인 소설',
      isManual: true,
    }
    const approved = { 기초: makeApprovedManualStoryInput(manualStory) }
    const manualStoryRoot = join(directory, 'canonical-manual-stories')
    const loadManualStories = vi.fn(async () => approved)
    const commit = vi.fn(async () => undefined)

    const generation = await buildContent(makeBuildOptions(source, directory, {
      manualStoryRoot,
      loadManualStories,
      commit,
    }))

    expect(loadManualStories).toHaveBeenCalledOnce()
    expect(loadManualStories).toHaveBeenCalledWith(resolve(manualStoryRoot))
    expect(generation.catalog.stories.기초).toEqual(manualStory)
    expect(generation.catalog.stories.유치원.isManual).toBe(false)
    expect(commit).toHaveBeenCalledOnce()
  })

  it('does not let approval metadata promote an automated draft', () => {
    const source = makeStoryCompatibleCatalog()
    const draft = createContentGeneration(makeGenerationInput(source)).catalog.stories.기초
    const input = makeGenerationInput(source)
    input.approvedManualStories = {
      기초: makeApprovedManualStoryInput(draft),
    }

    expect(() => createContentGeneration(input)).toThrow(
      'Approved manual story input failed validation',
    )
  })

  it('reads legacy automated provenance but never lets schema v2 attest manual approval', () => {
    const source = makeStoryCompatibleCatalog()
    const input = makeGenerationInput(source)
    const generation = createContentGeneration(input)
    const stories = generation.catalog.stories
    const legacyProvenance = {
      schemaVersion: '2.0.0',
      generatedBy: 'scripts/content/buildStoryDrafts.ts',
      outputDigest: storyCatalogOutputDigest(stories),
      status: 'automated-draft-awaiting-human-editorial-review',
      releaseGate: 'Every story keeps isManual=false until a human has read and approved the final text.',
      stories: LEVELS.map((level) => ({
        level,
        lemmaCount: stories[level].usedWords.length,
        coverageRate: stories[level].coverage.coverageRate,
      })),
    }

    const validationInput = {
      wordlists: input.wordlists,
      wordProvenance: input.wordProvenance,
      phrasalTop: input.phrasalTop,
      phrasalByLevel: input.phrasalByLevel,
      phrasalProvenance: input.phrasalProvenance,
      stories,
      storyProvenance: legacyProvenance,
    }
    expect(validateContentProvenance(validationInput)).toEqual([])

    const forgedStories = structuredClone(stories)
    forgedStories.기초.isManual = true
    const forgedLegacy = {
      ...legacyProvenance,
      outputDigest: storyCatalogOutputDigest(forgedStories),
    }
    expect(validateContentProvenance({
      ...validationInput,
      stories: forgedStories,
      storyProvenance: forgedLegacy,
    })).toContainEqual(expect.objectContaining({
      code: 'INVALID_PROVENANCE',
      path: 'storyProvenance.stories[0].source',
    }))
  })

  it.each([
    {
      name: 'the word provenance schema is stale',
      mutate: (input: ContentGenerationInput) => ({
        ...input,
        wordProvenance: { ...input.wordProvenance, schemaVersion: '1.0.0' },
      }),
    },
    {
      name: 'the word output digest does not match the catalog',
      mutate: (input: ContentGenerationInput) => ({
        ...input,
        wordProvenance: {
          ...input.wordProvenance,
          outputDigest: {
            ...input.wordProvenance.outputDigest,
            value: '0'.repeat(64),
          },
        },
      }),
    },
    {
      name: 'a word entry points at the wrong part of speech',
      mutate: (input: ContentGenerationInput) => {
        const firstWord = input.wordProvenance.words[0]!
        return {
          ...input,
          wordProvenance: {
            ...input.wordProvenance,
            words: [{
              ...firstWord,
              entries: [{
                ...firstWord.entries[0]!,
                catalogPartOfSpeech: 'wrong-part-of-speech',
              }, ...firstWord.entries.slice(1)],
            }, ...input.wordProvenance.words.slice(1)],
          },
        }
      },
    },
    {
      name: 'a phrasal source coordinate names the wrong phrase',
      mutate: (input: ContentGenerationInput) => ({
        ...input,
        phrasalProvenance: {
          ...input.phrasalProvenance,
          phrases: [{
            ...input.phrasalProvenance.phrases[0]!,
            phrase: 'not the catalog phrase',
          }, ...input.phrasalProvenance.phrases.slice(1)],
        },
      }),
    },
    {
      name: 'the phrasal output digest does not match the catalog',
      mutate: (input: ContentGenerationInput) => ({
        ...input,
        phrasalProvenance: {
          ...input.phrasalProvenance,
          outputDigest: {
            ...input.phrasalProvenance.outputDigest,
            value: 'f'.repeat(64),
          },
        },
      }),
    },
    {
      name: 'the phrasal provenance lists an unused source',
      mutate: (input: ContentGenerationInput) => ({
        ...input,
        phrasalProvenance: {
          ...input.phrasalProvenance,
          sources: CONTENT_SOURCES,
        },
      }),
    },
    {
      name: 'the phrasal provenance root contains an undeclared field',
      mutate: (input: ContentGenerationInput) => ({
        ...input,
        phrasalProvenance: {
          ...input.phrasalProvenance,
          undeclared: true,
        },
      }),
    },
  ])('rejects invalid provenance when $name', ({ mutate }) => {
    const input = mutate(makeGenerationInput(makeStoryCompatibleCatalog()))
    expect(() => createContentGeneration(input as ContentGenerationInput))
      .toThrow('Generated content provenance failed validation')
  })

  it('binds story provenance to the generated story payload', () => {
    const source = makeStoryCompatibleCatalog()
    const input = makeGenerationInput(source)
    const generation = createContentGeneration(input)
    const storyArtifact = generation.artifacts.find(({ target }) =>
      target.endsWith('story-drafts.json'))!
    const storyProvenance = JSON.parse(storyArtifact.bytes.toString('utf8'))
    const stories = structuredClone(generation.catalog.stories)
    stories.기초.title = `${stories.기초.title} 변조`

    expect(validateContentProvenance({
      wordlists: input.wordlists,
      wordProvenance: input.wordProvenance,
      phrasalTop: input.phrasalTop,
      phrasalByLevel: input.phrasalByLevel,
      phrasalProvenance: input.phrasalProvenance,
      stories,
      storyProvenance,
    })).toContainEqual(expect.objectContaining({
      code: 'PROVENANCE_DIGEST_MISMATCH',
      path: 'storyProvenance.outputDigest.value',
    }))
  })

  it('validates approval metadata copied into manual story provenance', () => {
    const source = makeStoryCompatibleCatalog()
    const draft = createContentGeneration(makeGenerationInput(source)).catalog.stories.기초
    const manualStory = { ...structuredClone(draft), isManual: true }
    const input = makeGenerationInput(source)
    input.approvedManualStories = {
      기초: makeApprovedManualStoryInput(manualStory),
    }
    const generation = createContentGeneration(input)
    const storyArtifact = generation.artifacts.find(({ target }) =>
      target.endsWith('story-drafts.json'))!
    const storyProvenance = JSON.parse(storyArtifact.bytes.toString('utf8'))
    storyProvenance.stories[0].approval.reviewer = '   '
    storyProvenance.stories[0].approval.sourceDigest.value = '0'.repeat(64)

    expect(validateContentProvenance({
      wordlists: input.wordlists,
      wordProvenance: input.wordProvenance,
      phrasalTop: input.phrasalTop,
      phrasalByLevel: input.phrasalByLevel,
      phrasalProvenance: input.phrasalProvenance,
      stories: generation.catalog.stories,
      storyProvenance,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'INVALID_PROVENANCE',
        path: 'storyProvenance.stories[0].approval.reviewer',
      }),
      expect.objectContaining({
        code: 'INVALID_PROVENANCE',
        path: 'storyProvenance.stories[0].approval.sourceDigest.value',
      }),
    ]))
  })

  it('does not invoke the commit when complete-catalog validation fails', async () => {
    const source = makeStoryCompatibleCatalog()
    const directory = await makeTemporaryDataRoot()
    const commit = vi.fn(async () => undefined)

    await expect(buildContent({
      dataRoot: directory,
      buildWords: async () => ({
        wordlists: source.wordlists,
        provenance: makeWordProvenance(source),
      }),
      buildPhrasals: async () => ({
        top: source.phrasalVerbs.top,
        byLevel: source.phrasalVerbs.byLevel,
        provenance: makePhrasalProvenance(source),
      }),
      readGrammar: async () => [],
      commit,
    })).rejects.toThrow('Generated content failed development validation')

    expect(commit).not.toHaveBeenCalled()
    expect(await readdir(directory)).not.toContain('.content-build.lock')
    expect(await pathExists(buildLockPathForDataRoot(directory))).toBe(false)
  })
})

describe('buildContent lock', () => {
  it('rejects a concurrent build under the shared sibling lock before builders can run', async () => {
    const source = makeStoryCompatibleCatalog()
    const directory = await makeTemporaryDataRoot()
    const lockPath = buildLockPathForDataRoot(directory)
    const sentinel = join(directory, 'sentinel.json')
    await writeFile(sentinel, 'original bytes', 'utf8')
    let signalFirstBuilder!: () => void
    let releaseFirstBuilder!: () => void
    const firstBuilderEntered = new Promise<void>((resolvePromise) => {
      signalFirstBuilder = resolvePromise
    })
    const firstBuilderRelease = new Promise<void>((resolvePromise) => {
      releaseFirstBuilder = resolvePromise
    })
    const firstBuild = buildContent(makeBuildOptions(source, directory, {
      buildWords: async () => {
        signalFirstBuilder()
        await firstBuilderRelease
        return {
          wordlists: source.wordlists,
          provenance: makeWordProvenance(source),
        }
      },
    }))
    await firstBuilderEntered

    const secondBuildWords = vi.fn(async () => ({
      wordlists: source.wordlists,
      provenance: makeWordProvenance(source),
    }))
    const secondBuildPhrasals = vi.fn(async () => ({
      top: source.phrasalVerbs.top,
      byLevel: source.phrasalVerbs.byLevel,
      provenance: makePhrasalProvenance(source),
    }))
    const secondCommit = vi.fn(async () => undefined)

    try {
      await expect(buildContent(makeBuildOptions(source, directory, {
        buildWords: secondBuildWords,
        buildPhrasals: secondBuildPhrasals,
        commit: secondCommit,
      }))).rejects.toThrow(/Build lock already exists.*Stale locks are not removed automatically/u)

      expect(secondBuildWords).not.toHaveBeenCalled()
      expect(secondBuildPhrasals).not.toHaveBeenCalled()
      expect(secondCommit).not.toHaveBeenCalled()
      expect(await readFile(sentinel, 'utf8')).toBe('original bytes')
      expect(await pathExists(lockPath)).toBe(true)
      expect(await readdir(directory)).not.toContain('.content-build.lock')
    } finally {
      releaseFirstBuilder()
      await firstBuild
    }

    expect(await pathExists(lockPath)).toBe(false)
  })

  it('preserves an existing shared sibling lock and gives a safe manual-recovery message', async () => {
    const source = makeStoryCompatibleCatalog()
    const directory = await makeTemporaryDataRoot()
    const lockPath = buildLockPathForDataRoot(directory)
    const staleLock = '{"pid":123,"startedAt":"stale"}\n'
    await writeFile(lockPath, staleLock, { flag: 'wx' })
    const buildWords = vi.fn(async () => ({
      wordlists: source.wordlists,
      provenance: makeWordProvenance(source),
    }))

    await expect(buildContent(makeBuildOptions(source, directory, { buildWords })))
      .rejects.toThrow(/verify that no build is active before removing the lock manually/u)

    expect(buildWords).not.toHaveBeenCalled()
    expect(await readFile(lockPath, 'utf8')).toBe(staleLock)
  })

  it('holds the lock through generation and commit, cleans it after failure, and permits reacquisition', async () => {
    const source = makeStoryCompatibleCatalog()
    const directory = await makeTemporaryDataRoot()
    const lockPath = buildLockPathForDataRoot(directory)

    await expect(buildContent(makeBuildOptions(source, directory, {
      buildWords: async () => {
        expect(await readFile(lockPath, 'utf8')).toContain(`"pid":${process.pid}`)
        throw new Error('injected generation failure')
      },
    }))).rejects.toThrow('injected generation failure')
    expect(await pathExists(lockPath)).toBe(false)

    const commit = vi.fn(async (committedRoot: string) => {
      expect(committedRoot).toBe(resolve(directory))
      expect(await readFile(lockPath, 'utf8')).toContain(`"pid":${process.pid}`)
    })
    await buildContent(makeBuildOptions(source, directory, {
      buildWords: async () => {
        expect(await readFile(lockPath, 'utf8')).toContain(`"pid":${process.pid}`)
        return {
          wordlists: source.wordlists,
          provenance: makeWordProvenance(source),
        }
      },
      buildPhrasals: async () => {
        expect(await readFile(lockPath, 'utf8')).toContain(`"pid":${process.pid}`)
        return {
          top: source.phrasalVerbs.top,
          byLevel: source.phrasalVerbs.byLevel,
          provenance: makePhrasalProvenance(source),
        }
      },
      commit,
    }))

    expect(commit).toHaveBeenCalledOnce()
    expect(await pathExists(lockPath)).toBe(false)
  })

  it.each([
    ['active-looking', `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`],
    ['stale-looking', '{"pid":123,"startedAt":"2000-01-01T00:00:00.000Z"}\n'],
  ])('fails closed on and preserves an %s legacy data-root lock', async (_kind, legacyBytes) => {
    const source = makeStoryCompatibleCatalog()
    const directory = await makeTemporaryDataRoot()
    const siblingLockPath = buildLockPathForDataRoot(directory)
    const legacyLockPath = join(directory, '.content-build.lock')
    await writeFile(legacyLockPath, legacyBytes, { flag: 'wx' })
    const buildWords = vi.fn(async () => ({
      wordlists: source.wordlists,
      provenance: makeWordProvenance(source),
    }))
    const commit = vi.fn(async () => undefined)

    await expect(buildContent(makeBuildOptions(source, directory, { buildWords, commit })))
      .rejects.toThrow(/Legacy content build lock exists.*was preserved/u)

    expect(buildWords).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
    expect(await readFile(legacyLockPath, 'utf8')).toBe(legacyBytes)
    expect(await pathExists(siblingLockPath)).toBe(false)
  })

  it('acquires the shared sibling lock before inspecting a legacy data-root lock', async () => {
    const source = makeStoryCompatibleCatalog()
    const directory = await makeTemporaryDataRoot()
    const siblingLockPath = buildLockPathForDataRoot(directory)
    const legacyLockPath = join(directory, '.content-build.lock')
    const siblingLock = await acquireBuildLock(siblingLockPath)
    await writeFile(legacyLockPath, 'legacy lock bytes', { flag: 'wx' })

    try {
      await expect(buildContent(makeBuildOptions(source, directory)))
        .rejects.toThrow(/Build lock already exists/u)
      expect(await readFile(legacyLockPath, 'utf8')).toBe('legacy lock bytes')
    } finally {
      await siblingLock.release()
    }
  })

  it('is mutually exclusive with a consumer holding the same offline-build lock', async () => {
    const source = makeStoryCompatibleCatalog()
    const directory = await makeTemporaryDataRoot()
    const lockPath = buildLockPathForDataRoot(directory)
    const offlineBuildLock = await acquireBuildLock(lockPath)
    const buildWords = vi.fn(async () => ({
      wordlists: source.wordlists,
      provenance: makeWordProvenance(source),
    }))

    try {
      await expect(buildContent(makeBuildOptions(source, directory, { buildWords })))
        .rejects.toThrow(/Build lock already exists/u)
      expect(buildWords).not.toHaveBeenCalled()
    } finally {
      await offlineBuildLock.release()
    }
  })

  it('propagates an explicit committed cleanup-residue result without rejecting the build', async () => {
    const source = makeStoryCompatibleCatalog()
    const directory = await makeTemporaryDataRoot()
    const commitResult = {
      status: 'committed-with-cleanup-residue' as const,
      cleanupAttempts: 2,
      residuePaths: [contentGenerationSwapPaths(directory).rollbackRoot],
      warning: 'explicit cleanup residue warning',
    }

    await expect(buildContent(makeBuildOptions(source, directory, {
      commit: async () => commitResult,
    }))).resolves.toMatchObject({ commitResult })
  })
})

describe('commitContentArtifacts', () => {
  it('clones the complete data generation and promotes all artifacts as one directory', async () => {
    const dataRoot = await makeTemporaryDataRoot()
    const grammarBytes = Buffer.from([0, 1, 2, 255, 13, 10])
    const schemaBytes = Buffer.from('{"title":"preserved"}\r\n', 'utf8')
    await mkdir(join(dataRoot, 'grammar'), { recursive: true })
    await mkdir(join(dataRoot, 'schema', 'empty-directory'), { recursive: true })
    await mkdir(join(dataRoot, 'generated'), { recursive: true })
    await writeFile(join(dataRoot, 'grammar', 'nodes.json'), grammarBytes)
    await writeFile(join(dataRoot, 'schema', 'catalog.schema.json'), schemaBytes)
    await writeFile(join(dataRoot, 'generated', 'first.json'), 'old first')

    const replacements = [{
      target: join(dataRoot, 'generated', 'first.json'),
      bytes: Buffer.from('new first\n'),
    }, {
      target: join(dataRoot, 'generated', 'second.json'),
      bytes: Buffer.from('new second\n'),
    }]

    await expect(commitContentArtifacts(dataRoot, replacements)).resolves.toEqual({
      status: 'committed-clean',
      cleanupAttempts: 1,
    })

    expect(await readFile(join(dataRoot, 'grammar', 'nodes.json'))).toEqual(grammarBytes)
    expect(await readFile(join(dataRoot, 'schema', 'catalog.schema.json'))).toEqual(schemaBytes)
    expect(await pathExists(join(dataRoot, 'schema', 'empty-directory'))).toBe(true)
    for (const replacement of replacements) {
      expect(await readFile(replacement.target)).toEqual(replacement.bytes)
    }
    await expectNoSwapResidue(dataRoot)
  })

  it('restores the complete previous generation byte-for-byte before the commit point', async () => {
    const dataRoot = await makeTemporaryDataRoot()
    await mkdir(join(dataRoot, 'grammar'), { recursive: true })
    await mkdir(join(dataRoot, 'schema', 'empty'), { recursive: true })
    await writeFile(join(dataRoot, 'grammar', 'nodes.json'), Buffer.from([0, 255, 1, 13, 10]))
    await writeFile(join(dataRoot, 'schema', 'catalog.json'), 'schema without newline')
    await writeFile(join(dataRoot, 'old.json'), 'old bytes\r\n')
    const original = await snapshotDirectory(dataRoot)

    await expect(commitContentArtifacts(
      dataRoot,
      [{ target: join(dataRoot, 'old.json'), bytes: Buffer.from('replacement') }],
      { beforePromote: () => { throw new Error('injected pre-commit failure') } },
    )).rejects.toThrow('injected pre-commit failure')

    expect(await snapshotDirectory(dataRoot)).toEqual(original)
    await expectNoSwapResidue(dataRoot)
  })

  it.each(['beforeFinalize', 'beforeRollbackCleanup'] as const)(
    'keeps the committed generation and returns explicit residue after %s cleanup fails twice',
    async (failurePoint) => {
      const dataRoot = await makeTemporaryDataRoot()
      const target = join(dataRoot, 'catalog.json')
      await writeFile(target, 'old bytes')
      const hook = vi.fn(() => {
        throw new Error(`injected ${failurePoint} cleanup failure`)
      })
      const result = await commitContentArtifacts(
        dataRoot,
        [{ target, bytes: Buffer.from('committed new bytes') }],
        failurePoint === 'beforeFinalize'
          ? { beforeFinalize: hook }
          : { beforeRollbackCleanup: hook },
      )

      expect(result).toMatchObject({
        status: 'committed-with-cleanup-residue',
        cleanupAttempts: 2,
        residuePaths: expect.any(Array),
        warning: expect.stringContaining('validate:data and validate:release will fail'),
      })
      expect(hook).toHaveBeenCalledTimes(2)
      expect(await readFile(target, 'utf8')).toBe('committed new bytes')
      const residueIssues = await validateContentGenerationResidue(dataRoot)
      expect(residueIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'CONTENT_BUILD_RESIDUE' }),
      ]))
    },
  )

  it('retries a transient post-commit rollback cleanup failure and returns clean success', async () => {
    const dataRoot = await makeTemporaryDataRoot()
    const target = join(dataRoot, 'catalog.json')
    await writeFile(target, 'old bytes')
    const beforeRollbackCleanup = vi.fn(() => {
      if (beforeRollbackCleanup.mock.calls.length === 1) {
        throw new Error('transient cleanup failure')
      }
    })

    const result = await commitContentArtifacts(
      dataRoot,
      [{ target, bytes: Buffer.from('committed new bytes') }],
      { beforeRollbackCleanup },
    )

    expect(result).toEqual({ status: 'committed-clean', cleanupAttempts: 2 })
    expect(await readFile(target, 'utf8')).toBe('committed new bytes')
    await expectNoSwapResidue(dataRoot)
  })

  it('validates every staged artifact before moving the current data root', async () => {
    const dataRoot = await makeTemporaryDataRoot()
    const target = join(dataRoot, 'catalog.json')
    await writeFile(target, 'original bytes')
    const original = await snapshotDirectory(dataRoot)

    await expect(commitContentArtifacts(
      dataRoot,
      [{ target, bytes: Buffer.from('validated replacement') }],
      {
        async afterStage(paths) {
          await writeFile(join(paths.stagingRoot, 'catalog.json'), 'corrupted after staging')
        },
      },
    )).rejects.toThrow(/failed byte validation/u)

    expect(await snapshotDirectory(dataRoot)).toEqual(original)
    await expectNoSwapResidue(dataRoot)
  })

  it('does not copy or remove an existing legacy lock during a direct generation swap', async () => {
    const dataRoot = await makeTemporaryDataRoot()
    const legacyLockPath = join(dataRoot, '.content-build.lock')
    const legacyBytes = Buffer.from('{"pid":321,"startedAt":"stale"}\r\n')
    await writeFile(legacyLockPath, legacyBytes, { flag: 'wx' })
    await writeFile(join(dataRoot, 'original.json'), 'original bytes')
    const original = await snapshotDirectory(dataRoot)

    await expect(commitContentArtifacts(dataRoot, [{
      target: join(dataRoot, 'generated.json'),
      bytes: Buffer.from('new bytes'),
    }])).rejects.toThrow(/Legacy content build lock exists.*was preserved/u)

    expect(await snapshotDirectory(dataRoot)).toEqual(original)
    expect(await readFile(legacyLockPath)).toEqual(legacyBytes)
    const paths = contentGenerationSwapPaths(dataRoot)
    expect(await pathExists(paths.stagingRoot)).toBe(false)
    expect(await pathExists(paths.rollbackRoot)).toBe(false)
  })

  it('rejects outside, root, reserved, duplicate, and containing targets before mutation', async () => {
    const dataRoot = await makeTemporaryDataRoot()
    const paths = contentGenerationSwapPaths(dataRoot)
    const originalTarget = join(dataRoot, 'original.json')
    const outsideTarget = join(paths.parentRoot, 'outside.json')
    await writeFile(originalTarget, 'original bytes')
    await writeFile(outsideTarget, 'outside bytes')
    const original = await snapshotDirectory(dataRoot)
    const byte = Buffer.from('replacement')

    await expect(commitContentArtifacts(dataRoot, [{ target: outsideTarget, bytes: byte }]))
      .rejects.toThrow(/strictly inside/u)
    await expect(commitContentArtifacts(dataRoot, [{ target: dataRoot, bytes: byte }]))
      .rejects.toThrow(/strictly inside/u)
    await expect(commitContentArtifacts(dataRoot, [{
      target: join(dataRoot, CONTENT_GENERATION_MARKER_NAME),
      bytes: byte,
    }])).rejects.toThrow(/reserved for generation safety/u)
    await expect(commitContentArtifacts(dataRoot, [{
      target: join(dataRoot, '.content-build.lock'),
      bytes: byte,
    }])).rejects.toThrow(/reserved for generation safety/u)
    await expect(commitContentArtifacts(dataRoot, [{
      target: join(dataRoot, 'duplicate.json'),
      bytes: byte,
    }, {
      target: join(dataRoot, 'nested', '..', 'duplicate.json'),
      bytes: byte,
    }])).rejects.toThrow(/Duplicate content artifact target/u)
    await expect(commitContentArtifacts(dataRoot, [{
      target: join(dataRoot, 'container'),
      bytes: byte,
    }, {
      target: join(dataRoot, 'container', 'child.json'),
      bytes: byte,
    }])).rejects.toThrow(/cannot contain one another/u)

    expect(await snapshotDirectory(dataRoot)).toEqual(original)
    expect(await readFile(outsideTarget, 'utf8')).toBe('outside bytes')
    await expectNoSwapResidue(dataRoot)
  })

  it('rejects a filesystem root before deriving any destructive sibling path', () => {
    const filesystemRoot = parse(resolve('.')).root
    expect(() => contentGenerationSwapPaths(filesystemRoot))
      .toThrow(/cannot be a filesystem root/u)
  })

  it.each(['stagingRoot', 'rollbackRoot'] as const)(
    'fails closed and preserves an unowned %s collision',
    async (residueKey) => {
      const dataRoot = await makeTemporaryDataRoot()
      const paths = contentGenerationSwapPaths(dataRoot)
      const residue = paths[residueKey]
      await writeFile(join(dataRoot, 'original.json'), 'original bytes')
      await mkdir(residue)
      await writeFile(join(residue, 'owner.txt'), 'not owned by the content builder')
      const original = await snapshotDirectory(dataRoot)

      await expect(commitContentArtifacts(dataRoot, [{
        target: join(dataRoot, 'generated.json'),
        bytes: Buffer.from('new bytes'),
      }])).rejects.toThrow(/Unowned or conflicting content generation residue/u)

      expect(await snapshotDirectory(dataRoot)).toEqual(original)
      expect(await readFile(join(residue, 'owner.txt'), 'utf8'))
        .toBe('not owned by the content builder')
    },
  )

  it('fails closed when a residue marker belongs to another data root', async () => {
    const dataRoot = await makeTemporaryDataRoot()
    const paths = contentGenerationSwapPaths(dataRoot)
    await writeFile(join(dataRoot, 'original.json'), 'original bytes')
    await mkdir(paths.stagingRoot)
    await writeGenerationMarkerFixture(
      paths.stagingRoot,
      join(paths.parentRoot, 'different-data-root'),
      'staging',
      randomUUID(),
    )

    await expect(commitContentArtifacts(dataRoot, [{
      target: join(dataRoot, 'generated.json'),
      bytes: Buffer.from('new bytes'),
    }])).rejects.toThrow(/different data root/u)

    expect(await readFile(join(dataRoot, 'original.json'), 'utf8')).toBe('original bytes')
    expect(await pathExists(paths.stagingRoot)).toBe(true)
  })

  it('removes an owned pre-swap staging residue and leaves the current generation intact', async () => {
    const dataRoot = await makeTemporaryDataRoot()
    const paths = contentGenerationSwapPaths(dataRoot)
    const token = randomUUID()
    await writeFile(join(dataRoot, 'original.json'), 'original bytes')
    const original = await snapshotDirectory(dataRoot)
    await mkdir(paths.stagingRoot)
    await writeGenerationMarkerFixture(paths.stagingRoot, dataRoot, 'staging', token)
    await writeFile(join(paths.stagingRoot, 'partial.json'), 'partial bytes')

    await expect(commitContentArtifacts(
      dataRoot,
      [{ target: join(dataRoot, 'generated.json'), bytes: Buffer.from('new bytes') }],
      { afterRecovery: () => { throw new Error('stop after recovery') } },
    )).rejects.toThrow('stop after recovery')

    expect(await snapshotDirectory(dataRoot)).toEqual(original)
    await expectNoSwapResidue(dataRoot)
  })

  it('restores a missing data root from an owned rollback crash residue', async () => {
    const container = await makeTemporaryDirectory()
    const dataRoot = join(container, 'data')
    const paths = contentGenerationSwapPaths(dataRoot)
    const token = randomUUID()
    await mkdir(paths.rollbackRoot)
    await mkdir(join(paths.rollbackRoot, 'grammar'))
    await writeFile(join(paths.rollbackRoot, 'old.json'), Buffer.from([0, 255, 13, 10]))
    await writeFile(join(paths.rollbackRoot, 'grammar', 'nodes.json'), 'old grammar')
    await writeGenerationMarkerFixture(paths.rollbackRoot, dataRoot, 'rollback', token)
    await mkdir(paths.stagingRoot)
    await writeGenerationMarkerFixture(paths.stagingRoot, dataRoot, 'staging', token)
    await writeFile(join(paths.stagingRoot, 'partial.json'), 'partial generation')

    await expect(commitContentArtifacts(
      dataRoot,
      [{ target: join(dataRoot, 'generated.json'), bytes: Buffer.from('new bytes') }],
      { afterRecovery: () => { throw new Error('stop after recovery') } },
    )).rejects.toThrow('stop after recovery')

    expect(await readFile(join(dataRoot, 'old.json'))).toEqual(Buffer.from([0, 255, 13, 10]))
    expect(await readFile(join(dataRoot, 'grammar', 'nodes.json'), 'utf8')).toBe('old grammar')
    await expectNoSwapResidue(dataRoot)
  })

  it('finalizes a promoted crash generation and removes its old rollback generation', async () => {
    const dataRoot = await makeTemporaryDataRoot()
    const paths = contentGenerationSwapPaths(dataRoot)
    const token = randomUUID()
    await writeFile(join(dataRoot, 'new.json'), 'unfinalized new generation')
    await writeGenerationMarkerFixture(dataRoot, dataRoot, 'staging', token)
    await mkdir(paths.rollbackRoot)
    await writeFile(join(paths.rollbackRoot, 'old.json'), 'byte-exact old generation\r\n')
    await writeGenerationMarkerFixture(paths.rollbackRoot, dataRoot, 'rollback', token)

    await expect(commitContentArtifacts(
      dataRoot,
      [{ target: join(dataRoot, 'generated.json'), bytes: Buffer.from('new bytes') }],
      { afterRecovery: () => { throw new Error('stop after recovery') } },
    )).rejects.toThrow('stop after recovery')

    expect(await readdir(dataRoot)).toEqual(['new.json'])
    expect(await readFile(join(dataRoot, 'new.json'), 'utf8'))
      .toBe('unfinalized new generation')
    await expectNoSwapResidue(dataRoot)
  })

  it('fails closed on conflicting crash-residue ownership tokens', async () => {
    const dataRoot = await makeTemporaryDataRoot()
    const paths = contentGenerationSwapPaths(dataRoot)
    await writeFile(join(dataRoot, 'new.json'), 'unfinalized new generation')
    await writeGenerationMarkerFixture(dataRoot, dataRoot, 'staging', randomUUID())
    await mkdir(paths.rollbackRoot)
    await writeFile(join(paths.rollbackRoot, 'old.json'), 'old generation')
    await writeGenerationMarkerFixture(paths.rollbackRoot, dataRoot, 'rollback', randomUUID())

    await expect(commitContentArtifacts(dataRoot, [{
      target: join(dataRoot, 'generated.json'),
      bytes: Buffer.from('new bytes'),
    }])).rejects.toThrow(/conflicting ownership tokens/u)

    expect(await readFile(join(dataRoot, 'new.json'), 'utf8'))
      .toBe('unfinalized new generation')
    expect(await readFile(join(paths.rollbackRoot, 'old.json'), 'utf8')).toBe('old generation')
    await expect(validateContentGenerationResidue(dataRoot)).resolves.toContainEqual(
      expect.objectContaining({
        code: 'UNSAFE_CONTENT_BUILD_RESIDUE',
        path: 'contentBuild.ownership',
      }),
    )
  })
})

describe('content build command contract', () => {
  it('keeps default cache and output paths anchored to the repository across cwd changes', () => {
    const originalCwd = process.cwd()
    process.chdir(resolve(originalCwd, '..'))
    try {
      expect(resolveContentBuildPaths()).toEqual({
        cacheRoot: DEFAULT_CONTENT_CACHE_ROOT,
        dataRoot: DEFAULT_CONTENT_DATA_ROOT,
        manualStoryRoot: DEFAULT_MANUAL_STORY_ROOT,
      })
      expect(resolveContentBuildPaths({
        cacheRoot: 'fixture-cache',
        dataRoot: 'fixture-data',
        manualStoryRoot: 'fixture-manual-stories',
      })).toEqual({
        cacheRoot: resolve(DEFAULT_CONTENT_CACHE_ROOT, '../fixture-cache'),
        dataRoot: resolve(DEFAULT_CONTENT_DATA_ROOT, '../../fixture-data'),
        manualStoryRoot: resolve(DEFAULT_MANUAL_STORY_ROOT, '../../../fixture-manual-stories'),
      })
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('derives fixed safe sibling generations and the exact shared Vite build lock', () => {
    const paths = contentGenerationSwapPaths(DEFAULT_CONTENT_DATA_ROOT)

    expect(paths.stagingRoot).toBe(join(paths.parentRoot, '.data.content-staging'))
    expect(paths.rollbackRoot).toBe(join(paths.parentRoot, '.data.content-rollback'))
    expect(paths.lockPath).toBe(DEFAULT_BUILD_LOCK_PATH)
    expect(relative(paths.dataRoot, paths.lockPath).startsWith('..')).toBe(true)
  })

  it('exposes only the aggregate command as a final content writer', async () => {
    const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['content:build']).toBe('tsx scripts/content/buildContent.ts')
    expect(packageJson.scripts).not.toHaveProperty('content:build:words')
    expect(packageJson.scripts).not.toHaveProperty('content:build:phrasals')
    expect(packageJson.scripts).not.toHaveProperty('content:build:stories')
  })

  it.each([
    'buildWordCatalog.ts',
    'buildPhrasalCatalog.ts',
    'buildStoryDrafts.ts',
  ])('%s has no direct executable writer path', async (fileName) => {
    const source = await readFile(resolve('scripts/content', fileName), 'utf8')
    expect(source).not.toContain('async function main()')
    expect(source).not.toContain('pathToFileURL')
    expect(source).not.toContain('writeJsonAtomically')
  })
})
