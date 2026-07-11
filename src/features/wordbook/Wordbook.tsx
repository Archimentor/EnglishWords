import { useState } from 'react'
import type { Level, RuntimeCatalog, StudyItem } from '../../domain/content/types'

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
  const query = normalizeSearch(search)
  const results = catalog.itemsByLevel[level].filter(
    (item) => query.length === 0 || searchableText(item).includes(query),
  )

  return (
    <section className="view view--wordbook" aria-labelledby="wordbook-title">
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
      </form>
      <p className="result-count" role="status" aria-live="polite">
        {results.length === 0 ? '검색 결과가 없습니다.' : `검색 결과 ${results.length}개`}
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
                <th scope="col">뜻</th>
                <th scope="col">예문</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.term}</th>
                  <td>
                    {item.kind === 'phrasalVerb'
                      ? '구동사'
                      : item.partsOfSpeech.join(', ')}
                  </td>
                  <td>{item.meanings.join(', ')}</td>
                  <td>{item.examples.join(' / ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function Wordbook({ level, catalog }: WordbookProps) {
  return <LevelWordbook key={level} level={level} catalog={catalog} />
}
