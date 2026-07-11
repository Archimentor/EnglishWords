export type ContentSourceId =
  | 'cefrj'
  | 'korean-wiktionary'
  | 'frequency'
  | 'tatoeba-english'

export interface ContentSource {
  id: ContentSourceId
  url: string
  sha256: string
  license: string
  attribution: string
  cacheFile: string
}
