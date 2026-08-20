import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Level, WordItem } from '../../domain/content/types'
import { normalizeCatalog } from '../../domain/content/normalize'
import { makeCatalog, makePhrasalVerb, makeWord } from '../../test/fixtures'
import { Wordbook } from './Wordbook'

function runtimeCatalog() {
  const play = makeWord({
    entries: [
      {
        partOfSpeech: 'verb',
        forms: {
          base: 'play',
          s3: 'plays',
          past: 'played',
          participle: 'playing',
          pastParticiple: 'played',
        },
        meanings: ['놀다'],
        ipa: '/pleɪ/',
        examples: ['We play outside.', 'They played together.'],
      },
      {
        partOfSpeech: 'noun',
        forms: ['play', 'plays'],
        meanings: ['연극'],
        ipa: '/pleɪ/',
        examples: ['The play was funny.', 'We watched a play.'],
      },
    ],
  })
  const book = makeWord({
    id: 'word-book',
    word: 'book',
    lemma: 'book',
    familyId: 'family-book',
    entryOverrides: {
      partOfSpeech: 'noun',
      forms: ['book', 'books'],
      meanings: ['책'],
      ipa: '/bʊk/',
      examples: ['This book is new.', 'The books are on the desk.'],
    },
  })
  const other = makeWord({
    id: 'word-other',
    word: 'other',
    lemma: 'other',
    familyId: 'family-other',
    level: '유치원',
  })
  const wordlists: Record<Level, WordItem[]> = {
    기초: [play, book],
    유치원: [other],
    초등학교: [],
    중학교: [],
  }
  const phrasal = makePhrasalVerb()

  return normalizeCatalog(
    makeCatalog({
      wordlists,
      phrasalVerbs: {
        top: [phrasal],
        byLevel: {
          기초: [phrasal],
          유치원: [],
          초등학교: [],
          중학교: [],
        },
      },
    }),
  )
}

function largeRuntimeCatalog(size = 250) {
  const catalog = runtimeCatalog()
  const prototype = catalog.itemsByLevel.기초[0]!

  return {
    ...catalog,
    itemsByLevel: {
      ...catalog.itemsByLevel,
      기초: Array.from({ length: size }, (_, index) => {
        const suffix = String(index).padStart(4, '0')
        return {
          ...prototype,
          id: `word-term-${suffix}`,
          term: `term-${suffix}`,
          lemma: `term-${suffix}`,
          forms: [`term-${suffix}`],
          partsOfSpeech: ['noun'],
          meanings: [`뜻-${suffix}`],
          examples: [`The term-${suffix} is here.`],
          entries: [{
            partOfSpeech: 'noun',
            forms: [`term-${suffix}`],
            meanings: [`뜻-${suffix}`],
            ipa: `/term-${suffix}/`,
            examples: [`The term-${suffix} is here.`],
          }],
        }
      }),
    },
  }
}

test('단어와 구동사를 같은 검색 결과에서 형태·뜻까지 검색한다', async () => {
  const user = userEvent.setup()
  render(<Wordbook level="기초" catalog={runtimeCatalog()} />)
  const search = screen.getByRole('searchbox', { name: '단어 검색' })

  await user.type(search, '  WAKE   UP  ')
  expect(screen.getByRole('row', { name: /wake up/ })).toBeInTheDocument()
  expect(screen.getByText('검색 결과 1개')).toBeInTheDocument()

  await user.clear(search)
  await user.type(search, '책')
  expect(screen.getByRole('row', { name: /book/ })).toBeInTheDocument()

  await user.clear(search)
  await user.type(search, 'played')
  const playRows = screen.getAllByRole('row', { name: /^play / })
  expect(playRows).toHaveLength(2)
  const verbRow = playRows.find((row) => within(row).queryByText('verb'))
  const nounRow = playRows.find((row) => within(row).queryByText('noun'))
  if (!verbRow || !nounRow) throw new Error('Expected separate verb and noun rows')
  expect(within(verbRow).getByText('놀다')).toBeInTheDocument()
  expect(within(verbRow).getByText(/기본형: play, 3인칭 단수 현재형: plays/))
    .toBeInTheDocument()
  expect(within(verbRow).queryByText('연극')).not.toBeInTheDocument()
  expect(within(nounRow).getByText('연극')).toBeInTheDocument()
  expect(within(nounRow).getByText('play, plays')).toBeInTheDocument()
  expect(within(nounRow).queryByText('놀다')).not.toBeInTheDocument()
  expect(screen.queryByText('other')).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: '단어장 표' })).toHaveAttribute(
    'tabindex',
    '0',
  )
  expect(
    screen.getByRole('table', { name: '기초 단어장 검색 결과' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: '형태' })).toBeInTheDocument()
})

test('검색 결과가 없음을 알리고 레벨 변경 시 검색어를 초기화한다', async () => {
  const user = userEvent.setup()
  const catalog = runtimeCatalog()
  const view = render(<Wordbook level="기초" catalog={catalog} />)
  const search = screen.getByRole('searchbox', { name: '단어 검색' })

  await user.type(search, '없는말')
  expect(screen.getByRole('status')).toHaveTextContent('검색 결과가 없습니다.')
  expect(document.querySelectorAll('[role="status"], [aria-live]')).toHaveLength(1)

  view.rerender(<Wordbook level="유치원" catalog={catalog} />)
  expect(screen.getByRole('searchbox', { name: '단어 검색' })).toHaveValue('')
  expect(screen.getByRole('row', { name: /other/ })).toBeInTheDocument()

  view.rerender(<Wordbook level="기초" catalog={catalog} />)
  expect(screen.getByRole('searchbox', { name: '단어 검색' })).toHaveValue('')
  expect(screen.getAllByRole('row', { name: /^play / })).toHaveLength(2)
})

test('일반 단어와 구동사 카테고리를 독립적으로 필터링한다', async () => {
  const user = userEvent.setup()
  render(<Wordbook level="기초" catalog={runtimeCatalog()} />)
  const category = screen.getByRole('combobox', { name: '항목 종류' })

  await user.selectOptions(category, 'phrasalVerb')
  expect(screen.getByRole('row', { name: /wake up/ })).toBeInTheDocument()
  expect(screen.queryByRole('row', { name: /^play / })).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('검색 결과 1개')

  await user.selectOptions(category, 'word')
  expect(screen.queryByRole('row', { name: /wake up/ })).not.toBeInTheDocument()
  expect(screen.getAllByRole('row', { name: /^play / })).toHaveLength(2)
})

test('대규모 단어장은 100개씩 표시하고 전체 집합에서 검색한다', async () => {
  const user = userEvent.setup()
  render(<Wordbook level="기초" catalog={largeRuntimeCatalog()} />)

  expect(screen.getAllByRole('row')).toHaveLength(101)
  expect(screen.getByRole('status')).toHaveTextContent('검색 결과 250개 중 100개 표시')

  await user.click(screen.getByRole('button', { name: '더 보기 (150개 남음)' }))
  expect(screen.getAllByRole('row')).toHaveLength(201)
  expect(screen.getByRole('status')).toHaveTextContent('검색 결과 250개 중 200개 표시')

  await user.type(screen.getByRole('searchbox', { name: '단어 검색' }), 'term-0249')
  expect(await screen.findByRole('row', { name: /term-0249/ })).toBeInTheDocument()
  expect(screen.getAllByRole('row')).toHaveLength(2)
  expect(screen.queryByRole('button', { name: /더 보기/ })).not.toBeInTheDocument()
})
