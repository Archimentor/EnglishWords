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
        forms: ['play', 'played'],
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
    entryOverrides: { meanings: ['책'], forms: ['book', 'books'] },
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
  const playRow = screen.getByRole('row', { name: /play/ })
  expect(within(playRow).getByText(/verb.*noun/)).toBeInTheDocument()
  expect(within(playRow).getByText(/놀다.*연극/)).toBeInTheDocument()
  expect(screen.queryByText('other')).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: '단어장 표' })).toHaveAttribute(
    'tabindex',
    '0',
  )
  expect(
    screen.getByRole('table', { name: '기초 단어장 검색 결과' }),
  ).toBeInTheDocument()
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
  expect(screen.getByRole('row', { name: /^play / })).toBeInTheDocument()
})
