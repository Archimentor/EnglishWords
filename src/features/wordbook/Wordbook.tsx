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

export function Wordbook({ level, catalog }: WordbookProps) {
  const [searchState, setSearchState] = useState({ level, value: '' })
  const search = searchState.level === level ? searchState.value : ''
  const query = normalizeSearch(search)
  const results = catalog.itemsByLevel[level].filter(
    (item) => query.length === 0 || searchableText(item).includes(query),
  )

  return (
    <section aria-labelledby="wordbook-title">
      <h2 id="wordbook-title">{`${level} 단어장`}</h2>
      <form role="search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="wordbook-search">단어 검색</label>
        <input
          id="wordbook-search"
          type="search"
          value={search}
          onChange={(event) => setSearchState({ level, value: event.target.value })}
        />
      </form>
      <p aria-live="polite">{`검색 결과 ${results.length}개`}</p>

      {results.length === 0 ? (
        <p role="status">검색 결과가 없습니다.</p>
      ) : (
        <table>
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
      )}
    </section>
  )
}
