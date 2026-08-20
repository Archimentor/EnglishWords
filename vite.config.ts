import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig, type Plugin } from 'vitest/config'
import {
  acquireBuildLocks,
  DEFAULT_BUILD_LOCK_PATH,
  LEGACY_CONTENT_BUILD_LOCK_PATH,
  releaseBuildLocks,
  type BuildLock,
} from './scripts/build-lock'
import {
  assertExactOfflineBundleOutputs,
  calculateOfflineSourceHash,
  createOfflineHtml,
  DEVELOPMENT_INDEX_HTML,
  pruneOfflineDistribution,
  promoteOfflineIndexes,
  recoverOfflineIndexTransaction,
} from './scripts/offline-build'
import type { ContentCatalog } from './src/domain/content/types'
import {
  validateCatalog,
  validateStoryCoverage,
} from './src/domain/content/validation'

const OFFLINE_CATALOG_PATHS = [
  'data/wordlists/기초.json',
  'data/wordlists/유치원.json',
  'data/wordlists/초등학교.json',
  'data/wordlists/중학교.json',
  'data/phrasal-verbs/top-1000.json',
  'data/phrasal-verbs/by-level/기초.json',
  'data/phrasal-verbs/by-level/유치원.json',
  'data/phrasal-verbs/by-level/초등학교.json',
  'data/phrasal-verbs/by-level/중학교.json',
  'data/stories/기초.json',
  'data/stories/유치원.json',
  'data/stories/초등학교.json',
  'data/stories/중학교.json',
  'data/grammar/nodes.json',
] as const

async function readOfflineCatalog(): Promise<string> {
  const publicRoot = resolve('public')
  const resources = new Map(await Promise.all(OFFLINE_CATALOG_PATHS.map(async (path) => [
    path,
    JSON.parse(await readFile(resolve(publicRoot, path), 'utf8')),
  ] as const)))

  const catalog: ContentCatalog = {
    wordlists: {
      기초: resources.get('data/wordlists/기초.json'),
      유치원: resources.get('data/wordlists/유치원.json'),
      초등학교: resources.get('data/wordlists/초등학교.json'),
      중학교: resources.get('data/wordlists/중학교.json'),
    },
    phrasalVerbs: {
      top: resources.get('data/phrasal-verbs/top-1000.json'),
      byLevel: {
        기초: resources.get('data/phrasal-verbs/by-level/기초.json'),
        유치원: resources.get('data/phrasal-verbs/by-level/유치원.json'),
        초등학교: resources.get('data/phrasal-verbs/by-level/초등학교.json'),
        중학교: resources.get('data/phrasal-verbs/by-level/중학교.json'),
      },
    },
    stories: {
      기초: resources.get('data/stories/기초.json'),
      유치원: resources.get('data/stories/유치원.json'),
      초등학교: resources.get('data/stories/초등학교.json'),
      중학교: resources.get('data/stories/중학교.json'),
    },
    grammarNodes: resources.get('data/grammar/nodes.json'),
  } as ContentCatalog

  const issues = [
    ...validateCatalog(catalog, 'development'),
    ...validateStoryCoverage(catalog),
  ]
  if (issues.length > 0) {
    const first = issues[0]!
    throw new Error(
      `Offline catalog validation failed (${issues.length}): ${first.code} at ${first.path}: ${first.message}`,
    )
  }

  const serializedCatalog = JSON.stringify(catalog).replaceAll('<', '\\u003c')
  return `globalThis.__ENGLISH_WORDS_EMBEDDED_CATALOG__=${serializedCatalog};\nglobalThis.__ENGLISH_WORDS_EMBEDDED_CATALOG_BUILD_VALIDATED__=true;\n`
}

function developmentIndexPlugin(): Plugin {
  return {
    name: 'development-index',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: () => DEVELOPMENT_INDEX_HTML,
    },
  }
}

function offlineCatalogPlugin(): Plugin {
  let heldBuildLocks: BuildLock[] = []
  let releasePromise: Promise<void> | undefined
  let sourceHashAtBuildStart: string | undefined
  let pendingOfflineBuild: { html: string; outputDirectory: string } | undefined

  async function releaseHeldBuildLocks(): Promise<void> {
    if (heldBuildLocks.length > 0) {
      const locksToRelease = heldBuildLocks
      heldBuildLocks = []
      releasePromise = releaseBuildLocks(locksToRelease)
    }
    await releasePromise
  }

  return {
    name: 'offline-catalog',
    enforce: 'post',
    apply: 'build',
    async buildStart() {
      if (this.meta.watchMode) {
        this.error(
          'Offline single-file builds do not support --watch. '
            + 'Use npm run dev for watched development or run npm run build once.',
        )
      }
      pendingOfflineBuild = undefined
      if (heldBuildLocks.length === 0) {
        releasePromise = undefined
        heldBuildLocks = await acquireBuildLocks([
          DEFAULT_BUILD_LOCK_PATH,
          LEGACY_CONTENT_BUILD_LOCK_PATH,
        ])
      }

      try {
        await recoverOfflineIndexTransaction()
        sourceHashAtBuildStart = await calculateOfflineSourceHash()
      } catch (error) {
        try {
          await releaseHeldBuildLocks()
        } catch (releaseError) {
          throw new AggregateError(
            [error, releaseError],
            'Offline build initialization failed and its locks could not be released.',
            { cause: releaseError },
          )
        }
        throw error
      }
    },
    async buildEnd(error) {
      if (error) {
        pendingOfflineBuild = undefined
        sourceHashAtBuildStart = undefined
        await releaseHeldBuildLocks()
      }
    },
    async renderError() {
      pendingOfflineBuild = undefined
      sourceHashAtBuildStart = undefined
      await releaseHeldBuildLocks()
    },
    async generateBundle(outputOptions, bundle) {
      const outputs = Object.values(bundle)
      try {
        assertExactOfflineBundleOutputs(outputs)
      } catch (error) {
        this.error(error instanceof Error ? error : String(error))
      }

      const entryChunk = outputs.find(
        (output) => output.type === 'chunk' && output.isEntry,
      )
      const cssAsset = outputs.find(
        (output) => output.type === 'asset' && output.fileName.endsWith('.css'),
      )
      if (entryChunk?.type !== 'chunk' || cssAsset?.type !== 'asset') {
        this.error('Offline bundle assets could not be resolved.')
      }
      if (!sourceHashAtBuildStart || heldBuildLocks.length === 0) {
        this.error('Offline build snapshot was not initialized under the build locks.')
      }

      const css = typeof cssAsset.source === 'string'
        ? cssAsset.source
        : new TextDecoder().decode(cssAsset.source)
      const catalog = await readOfflineCatalog()
      const outputDirectory = resolve(outputOptions.dir ?? 'dist')
      pendingOfflineBuild = {
        html: createOfflineHtml({
          catalog,
          css,
          javascript: entryChunk.code,
          notices: await readFile(resolve('THIRD_PARTY_NOTICES.md'), 'utf8'),
          sourceHash: sourceHashAtBuildStart,
        }),
        outputDirectory,
      }
    },
    async closeBundle() {
      const offlineBuild = pendingOfflineBuild
      const expectedSourceHash = sourceHashAtBuildStart
      let buildFailure: unknown
      let releaseFailure: unknown

      try {
        if (offlineBuild && expectedSourceHash) {
          await pruneOfflineDistribution(offlineBuild.outputDirectory)
          await promoteOfflineIndexes(offlineBuild.html, {
            distIndexPath: resolve(offlineBuild.outputDirectory, 'index.html'),
            rootIndexPath: resolve('index.html'),
            async beforePromote() {
              const sourceHashBeforeCommit = await calculateOfflineSourceHash()
              if (sourceHashBeforeCommit !== expectedSourceHash) {
                throw new Error(
                  'Offline source inputs changed while the bundle was being built; '
                    + 'the existing root and dist indexes were preserved. Run the build again.',
                )
              }
            },
          })
        }
      } catch (error) {
        buildFailure = error
      } finally {
        pendingOfflineBuild = undefined
        sourceHashAtBuildStart = undefined
        try {
          await releaseHeldBuildLocks()
        } catch (error) {
          releaseFailure = error
        }
      }

      if (buildFailure && releaseFailure) {
        throw new AggregateError(
          [buildFailure, releaseFailure],
          'Offline build failed and its locks could not be released.',
          { cause: buildFailure },
        )
      }
      if (buildFailure) throw buildFailure
      if (releaseFailure) throw releaseFailure
    },
  }
}

export default defineConfig(({ command }) => ({
  base: './',
  define: command === 'build'
    ? { 'process.env.NODE_ENV': JSON.stringify('production') }
    : {},
  plugins: [developmentIndexPlugin(), react(), offlineCatalogPlugin()],
  build: {
    copyPublicDir: false,
    emptyOutDir: false,
    write: false,
    lib: {
      entry: resolve('src/main.tsx'),
      name: 'EnglishWordsMaster',
      formats: ['iife'],
      fileName: () => 'app.iife.js',
      cssFileName: 'app',
    },
  },
  test: {
    exclude: [...configDefaults.exclude, '**/.worktrees/**', 'tests/browser/**'],
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
}))
