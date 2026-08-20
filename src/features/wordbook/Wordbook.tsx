import { useDeferredValue, useMemo, useState } from 'react'
import { formatWordForms } from '../../domain/content/formatForms'
import type {
  Level,
  RuntimeCatalog,
  StudyItem,
  WordEntry,
} from '../../domain/content/types'

const WORDS_PER_PAGE = 100
type WordbookCategory = 'all' | StudyItem['kind']

interface WordbookProps {
  level: Level
  catalog: RuntimeCatalog
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ')
}

function searchableText(item: StudyItem): string {
  return normalizeSearch(
    [item.term, item.lemma, ...item.forms, ...item.meanings].join(' '),
  )
}

function LevelWordbook({ level, catalog }: WordbookProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<WordbookCategory>('all')
  const [pagination, setPagination] = useState({ query: '', count: WORDS_PER_PAGE })
  const deferredSearch = useDeferredValue(search)
  const query = normalizeSearch(deferredSearch)
  const results = useMemo(
    () => catalog.itemsByLevel[level].filter(
      (item) => (category === 'all' || item.kind === category)
        && (query.length === 0 || searchableText(item).includes(query)),
    ),
    [catalog.itemsByLevel, category, level, query],
  )
  const visibleCount = pagination.query === query ? pagination.count : WORDS_PER_PAGE
  const visibleResults = results.slice(0, visibleCount)
  const remainingCount = results.length - visibleResults.length
  const isSearchPending = search !== deferredSearch

  function showMore(): void {
    setPagination({
      query,
      count: Math.min(visibleResults.length + WORDS_PER_PAGE, results.length),
    })
  }

  return (
    <section
      className="view view--wordbook"
      aria-labelledby="wordbook-title"
      aria-busy={isSearchPending}
    >
      <h2 id="wordbook-title">{`${level} 단어장`}</h2>
      <form className="search-bar" role="search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="wordbook-search">단어 검색</label>
        <input
          id="wordbook-search"
          className="search-input"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label htmlFor="wordbook-category">항목 종류</label>
        <select
          id="wordbook-category"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value as WordbookCategory)
            setPagination({ query: '', count: WORDS_PER_PAGE })
          }}
        >
          <option value="all">전체</option>
          <option value="word">일반 단어</option>
          <option value="phrasalVerb">구동사</option>
        </select>
      </form>
      <p className="result-count" role="status" aria-live="polite">
        {results.length === 0
          ? '검색 결과가 없습니다.'
          : remainingCount > 0
            ? `검색 결과 ${results.length}개 중 ${visibleResults.length}개 표시`
            : `검색 결과 ${results.length}개`}
      </p>

      {results.length === 0 ? (
        <div className="empty-state" aria-hidden="true">검색 조건을 바꿔 보세요.</div>
      ) : (
        <div className="table-scroll" role="region" aria-label="단어장 표" tabIndex={0}>
          <table className="word-table">
            <caption className="visually-hidden">{`${level} 단어장 검색 결과`}</caption>
            <thead>
              <tr>
                <th scope="col">Word</th>
                <th scope="col">품사</th>
                <th scope="col">형태</th>
                <th scope="col">뜻</th>
                <th scope="col">발음</th>
                <th scope="col">예문</th>
              </tr>
            </thead>
            <tbody id="wordbook-results">
              {visibleResults.flatMap((item) =>
                item.entries.map((entry, entryIndex) => (
                  <tr key={`${item.id}:${entryIndex}`}>
                    <th scope="row">{item.term}</th>
                    <td>{partOfSpeechLabel(item, entry)}</td>
                    <td>{formatWordForms(entry.forms)}</td>
                    <td>{entry.meanings.join(', ')}</td>
                    <td>{entry.ipa.trim() || '—'}</td>
                    <td>{entry.examples.join(' / ')}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
      {remainingCount > 0 && (
        <div className="action-row wordbook-pagination">
          <button
            className="button button--secondary"
            type="button"
            aria-controls="wordbook-results"
            onClick={showMore}
          >
            {`더 보기 (${remainingCount}개 남음)`}
          </button>
        </div>
      )}
    </section>
  )
}

function partOfSpeechLabel(item: StudyItem, entry: WordEntry): string {
  return item.kind === 'phrasalVerb' ? '구동사' : entry.partOfSpeech
}

export function Wordbook({ level, catalog }: WordbookProps) {
  return <LevelWordbook key={level} level={level} catalog={catalog} />
}
