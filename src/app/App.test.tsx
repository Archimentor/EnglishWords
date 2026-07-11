import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInitialState } from '../state/appState'
import { STORAGE_KEY } from '../state/persistence'
import { makeAppCatalog } from '../test/appCatalog'
import { App } from './App'

const loadCatalog = async () => makeAppCatalog()

interface MemoryStorage extends Pick<Storage, 'getItem' | 'setItem'> {
  values: Map<string, string>
}

function memoryStorage(): MemoryStorage {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('서비스 이름과 초기 레벨 대시보드를 보여준다', async () => {
  render(<App storage={memoryStorage()} loadCatalog={loadCatalog} />)

  expect(
    await screen.findByRole('heading', { name: '기초 학습 대시보드' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '영단어 5000 마스터' })).toBeInTheDocument()
  expect(screen.getByText('8 / 목표 500')).toBeInTheDocument()
  const kpis = screen.getByRole('region', { name: '학습 현황' })
  expect(within(kpis).getByText('0%')).toBeInTheDocument()
  expect(within(kpis).queryByText(/100%/)).not.toBeInTheDocument()
})

test('실제 대표 단어 ID의 저장된 숙련도를 목표 완료율에 반영한다', async () => {
  const storage = memoryStorage()
  const state = createInitialState()
  state.mastery['app-word-play'] = {
    attempts: 3,
    correct: 3,
    wrong: 0,
    correctStreak: 3,
    wrongStreak: 0,
  }
  storage.values.set(STORAGE_KEY, JSON.stringify(state))

  render(<App storage={storage} loadCatalog={loadCatalog} />)

  expect(
    within(await screen.findByRole('region', { name: '학습 현황' })).getByText('0.2%'),
  ).toBeInTheDocument()
})

test('학습을 누르면 레벨 메뉴를 열고 컨텍스트 레벨 선택 즉시 학습으로 진입한다', async () => {
  const user = userEvent.setup()
  render(<App storage={memoryStorage()} loadCatalog={loadCatalog} />)

  await user.click(await screen.findByRole('button', { name: '학습' }))
  const levelMenu = screen.getByRole('navigation', { name: '학습 레벨 메뉴' })
  await user.click(within(levelMenu).getByRole('button', { name: '초등학교' }))

  expect(screen.getByRole('heading', { name: '초등학교 플래시카드 학습' })).toBeInTheDocument()
  expect(within(levelMenu).getByRole('button', { name: '초등학교' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('단어장은 최상위 메뉴가 아니라 레벨 컨텍스트 메뉴다', async () => {
  render(<App storage={memoryStorage()} loadCatalog={loadCatalog} />)

  expect(await screen.findByRole('navigation', { name: '주 메뉴' })).not.toHaveTextContent(
    '단어장',
  )
  expect(screen.getByRole('navigation', { name: '레벨 메뉴' })).toHaveTextContent(
    '단어장',
  )
})

test('활성 주 메뉴와 컨텍스트 메뉴만 aria-current로 표시한다', async () => {
  const user = userEvent.setup()
  render(<App storage={memoryStorage()} loadCatalog={loadCatalog} />)
  const primary = await screen.findByRole('navigation', { name: '주 메뉴' })

  expect(within(primary).getByRole('button', { name: '기초' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await user.click(within(primary).getByRole('button', { name: '문법' }))

  expect(within(primary).getByRole('button', { name: '문법' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(within(primary).getByRole('button', { name: '기초' })).not.toHaveAttribute(
    'aria-current',
  )
  expect(screen.getByRole('navigation', { name: '문법 메뉴' })).toBeInTheDocument()
})

test('같은 저장소로 다시 렌더링하면 메뉴 선택을 복원한다', async () => {
  const user = userEvent.setup()
  const storage = memoryStorage()
  const first = render(<App storage={storage} loadCatalog={loadCatalog} />)

  await user.click(await screen.findByRole('button', { name: '퀴즈' }))
  await user.click(
    within(screen.getByRole('navigation', { name: '퀴즈 레벨 메뉴' })).getByRole(
      'button',
      { name: '중학교' },
    ),
  )
  first.unmount()
  render(<App storage={storage} loadCatalog={loadCatalog} />)

  expect(await screen.findByRole('heading', { name: '퀴즈' })).toBeInTheDocument()
  expect(
    within(screen.getByRole('navigation', { name: '퀴즈 레벨 메뉴' })).getByRole(
      'button',
      { name: '중학교' },
    ),
  ).toHaveAttribute('aria-current', 'page')
})
