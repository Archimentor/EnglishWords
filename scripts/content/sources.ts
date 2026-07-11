import type { ContentSource } from './source-types'

export const CONTENT_CACHE_DIR = '.content-cache'

export const CONTENT_SOURCES: readonly ContentSource[] = [
  {
    id: 'cefrj',
    url: 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/d4e45b75b38f27b30dfc5c44d8c571aec7e7092f/cefrj-vocabulary-profile-1.5.csv',
    sha256: 'b0dd3c635f1c9a4fdf1490c7e5b7c48e8bbe55b652ad0c9860a95f98e10ae498',
    license: 'CEFR-J terms of use',
    attribution: 'CEFR-J Vocabulary Profile 1.5',
    cacheFile: 'cefrj-vocabulary-profile-1.5.csv',
  },
  {
    id: 'korean-wiktionary',
    url: 'https://dumps.wikimedia.org/kowiktionary/20260701/kowiktionary-20260701-pages-articles.xml.bz2',
    sha256: '190f1b94870c5a09f3006f2d61d10da4d4997e5c968f4491186215c2e33b460e',
    license: 'CC BY-SA 4.0',
    attribution: 'Korean Wiktionary contributors via Wikimedia Dumps',
    cacheFile: 'kowiktionary-20260701-pages-articles.xml.bz2',
  },
  {
    id: 'frequency',
    url: 'https://raw.githubusercontent.com/filiph/english_words/4191ae1341c5e3dc640731c20f118746a51e7143/data/word-freq-top5000.csv',
    sha256: '87a73f5bca66862983dd430ba5d37129706f761291b433d33fcac8de117f66fc',
    license: 'MIT',
    attribution: 'filiph/english_words',
    cacheFile: 'word-freq-top5000.csv',
  },
  {
    id: 'tatoeba-english',
    url: 'https://object.pouta.csc.fi/OPUS-Tatoeba/v2023-04-12/mono/en.txt.gz',
    sha256: 'a32c5500cd76b9479859764fb78537a4b9b53fab8fa3bdc0fc04dd70f28bf29b',
    license: 'CC BY 2.0 FR',
    attribution: 'OPUS Tatoeba v2023-04-12 (Tiedemann 2012; source: Tatoeba Project)',
    cacheFile: 'opus-tatoeba-v2023-04-12-en.txt.gz',
  },
  {
    id: 'ipa-dict',
    url: 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/43c3570eb3553bdd19fccd2bd0091534889af023/data/en_US.txt',
    sha256: '2af6f154a5c363275f052d1f85acedef38ed185ca9745aa4314be77f6b70de67',
    license: 'MIT',
    attribution: 'open-dict-data/ipa-dict (MIT; third-party credit)',
    cacheFile: 'ipa-dict-en_US.txt',
  },
]

export function parseSha256(value: string): string {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`Invalid SHA-256: ${value}`)
  }

  return value.toLowerCase()
}

export function isImmutableSourceUrl(value: string): boolean {
  const gitHubCommitUrl = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\/.+$/i
  const wikimediaDatedDump = /^https:\/\/dumps\.wikimedia\.org\/[^/]+\/(\d{8})\/[^/]+-\1-[^/]+$/
  const opusVersionedRelease = /^https:\/\/object\.pouta\.csc\.fi\/OPUS-Tatoeba\/v\d{4}-\d{2}-\d{2}\/.+$/

  return gitHubCommitUrl.test(value)
    || wikimediaDatedDump.test(value)
    || opusVersionedRelease.test(value)
}
