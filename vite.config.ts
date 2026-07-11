import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react-swc'
import { defineConfig, type Plugin } from 'vitest/config'

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

  const catalog = {
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
  }

  return `globalThis.__ENGLISH_WORDS_EMBEDDED_CATALOG__=${JSON.stringify(catalog)};\n`
}

function offlineCatalogPlugin(): Plugin {
  return {
    name: 'offline-catalog',
    apply: 'build',
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'data/catalog.js',
        source: await readOfflineCatalog(),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source: `<!doctype html>\n<html lang="ko">\n  <head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>영단어 5000 마스터</title>\n    <link rel="stylesheet" href="./app.css">\n  </head>\n  <body>\n    <div id="root"></div>\n    <script src="./data/catalog.js"></script>\n    <script src="./app.iife.js"></script>\n  </body>\n</html>\n`,
      })
    },
  }
}

export default defineConfig(({ command }) => ({
  base: './',
  define: command === 'build'
    ? { 'process.env.NODE_ENV': JSON.stringify('production') }
    : {},
  plugins: [react(), offlineCatalogPlugin()],
  build: {
    lib: {
      entry: resolve('src/main.tsx'),
      name: 'EnglishWordsMaster',
      formats: ['iife'],
      fileName: () => 'app.iife.js',
      cssFileName: 'app',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
}))
