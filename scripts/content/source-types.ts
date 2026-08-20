export type ContentSourceId =
  | 'cefrj'
  | 'korean-wiktionary'
  | 'frequency'
  | 'tatoeba-english'
  | 'ipa-dict'
  | 'omw-english-wordnet'
  | 'omw-korean-wiktionary'
  | 'wordnet-3.0'
  | 'phrasal-verbs'

export interface ContentSource {
  id: ContentSourceId
  url: string
  sha256: string
  license: string
  attribution: string
  cacheFile: string
}
