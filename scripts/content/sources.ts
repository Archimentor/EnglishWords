import type { ContentSource } from './source-types'

export const CONTENT_CACHE_DIR = '.content-cache'

export const CONTENT_SOURCES: readonly ContentSource[] = [
  {
    id: 'cefrj',
    url: 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv',
    sha256: 'b0dd3c635f1c9a4fdf1490c7e5b7c48e8bbe55b652ad0c9860a95f98e10ae498',
    license: 'CEFR-J terms of use',
    attribution: 'CEFR-J Vocabulary Profile 1.5',
    cacheFile: 'cefrj-vocabulary-profile-1.5.csv',
  },
  {
    id: 'korean-wiktionary',
    url: 'https://kaikki.org/dictionary/downloads/ko/ko-extract.jsonl.gz',
    sha256: 'ba18b12642d534532feb85c42ec77e3f7686f1c2da795a59b030098342c39cb6',
    license: 'CC BY-SA 4.0',
    attribution: 'Korean Wiktionary via Wiktextract/Kaikki',
    cacheFile: 'ko-extract.jsonl.gz',
  },
  {
    id: 'frequency',
    url: 'https://raw.githubusercontent.com/filiph/english_words/master/data/word-freq-top5000.csv',
    sha256: '87a73f5bca66862983dd430ba5d37129706f761291b433d33fcac8de117f66fc',
    license: 'MIT',
    attribution: 'filiph/english_words',
    cacheFile: 'word-freq-top5000.csv',
  },
  {
    id: 'tatoeba-english',
    url: 'https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2',
    sha256: '53428b2911d201a3fd12619cbd6f2235a6d46c63eca7701acc8043116039b230',
    license: 'CC BY 2.0 FR',
    attribution: 'Tatoeba Project',
    cacheFile: 'eng_sentences.tsv.bz2',
  },
]

export function parseSha256(value: string): string {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`Invalid SHA-256: ${value}`)
  }

  return value.toLowerCase()
}
