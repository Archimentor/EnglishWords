import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContentLoadError } from '../domain/content/loadCatalog'
import { createInitialState } from '../state/appState'
import { STORAGE_KEY } from '../state/persistence'
import { makeAppCatalog } from '../test/appCatalog'
import { App } from './App'

function memoryStorage(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(STORAGE_KEY, initial)
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  }
}

test('콘텐츠를 불러오는 동안 ready 화면을 렌더링하지 않는다', async () => {
  let resolve!: (catalog: ReturnType<typeof makeAppCatalog>) => void
  const pending = new Promise<ReturnType<typeof makeAppCatalog>>((done) => {
    resolve = done
  })
  render(<App loadCatalog={() => pending} storage={memoryStorage()} />)

  expect(screen.getByRole('status')).toHaveTextContent(
    '학습 콘텐츠를 불러오는 중입니다.',
  )
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument()

  resolve(makeAppCatalog())
  expect(
    await screen.findByRole('heading', { name: '기초 학습 대시보드' }),
  ).toBeInTheDocument()
})

test('콘텐츠 실패 경로와 상태를 보여주고 새 Promise로 재시도한다', async () => {
  const user = userEvent.setup()
  const error = new ContentLoadError(
    'CONTENT_LOAD_FAILED',
    'Failed to load /data/wordlists/기초.json: HTTP 500.',
    { path: '/data/wordlists/기초.json', status: 500 },
  )
  let resolveRetry!: (catalog: ReturnType<typeof makeAppCatalog>) => void
  const retryPending = new Promise<ReturnType<typeof makeAppCatalog>>((resolve) => {
    resolveRetry = resolve
  })
  const loader = vi
    .fn<() => Promise<ReturnType<typeof makeAppCatalog>>>()
    .mockRejectedValueOnce(error)
    .mockReturnValueOnce(retryPending)
  render(<App loadCatalog={loader} storage={memoryStorage()} />)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '학습 콘텐츠를 불러오지 못했습니다',
  )
  expect(screen.getByRole('alert')).toHaveTextContent('/data/wordlists/기초.json')
  expect(screen.getByRole('alert')).toHaveTextContent('HTTP 500')

  await user.click(screen.getByRole('button', { name: '다시 시도' }))
  expect(loader).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent(
    '학습 콘텐츠를 불러오는 중입니다.',
  )
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument()

  resolveRetry(makeAppCatalog())
  expect(
    await screen.findByRole('heading', { name: '기초 학습 대시보드' }),
  ).toBeInTheDocument()
})

test('동기 loader 예외를 안전한 일반 오류로 바꾼다', async () => {
  render(
    <App
      loadCatalog={() => {
        throw new Error('내부 stack 비밀')
      }}
      storage={memoryStorage()}
    />,
  )

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('학습 콘텐츠를 불러오지 못했습니다')
  expect(alert).not.toHaveTextContent('내부 stack 비밀')
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
})

test('검증 오류는 첫 경로와 전체 문제 수만 안전하게 요약한다', async () => {
  const error = new ContentLoadError(
    'CONTENT_INVALID',
    'raw catalog should stay private',
    {
      issues: [
        { code: 'WORD_ID', path: 'wordlists.기초[0].id', message: 'ID가 비었습니다.' },
        { code: 'WORD_MEANING', path: 'wordlists.기초[0].entries', message: '뜻이 없습니다.' },
      ],
    },
  )
  render(
    <App
      loadCatalog={() => Promise.reject(error)}
      storage={memoryStorage()}
    />,
  )

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('검증 문제 2개')
  expect(alert).toHaveTextContent('wordlists.기초[0].id')
  expect(alert).not.toHaveTextContent('raw catalog should stay private')
})

test('이전 loader의 늦은 완료가 최신 catalog를 덮어쓰지 않는다', async () => {
  let resolveOld!: (catalog: ReturnType<typeof makeAppCatalog>) => void
  let resolveLatest!: (catalog: ReturnType<typeof makeAppCatalog>) => void
  const oldPending = new Promise<ReturnType<typeof makeAppCatalog>>((resolve) => {
    resolveOld = resolve
  })
  const latestPending = new Promise<ReturnType<typeof makeAppCatalog>>((resolve) => {
    resolveLatest = resolve
  })
  const oldCatalog = makeAppCatalog()
  oldCatalog.stories.기초.title = '오래된 이야기'
  const latestCatalog = makeAppCatalog()
  latestCatalog.stories.기초.title = '최신 이야기'
  const storage = memoryStorage()
  const { rerender } = render(
    <App loadCatalog={() => oldPending} storage={storage} />,
  )

  rerender(<App loadCatalog={() => latestPending} storage={storage} />)
  await act(async () => resolveLatest(latestCatalog))
  await screen.findByRole('heading', { name: '기초 학습 대시보드' })
  await act(async () => resolveOld(oldCatalog))

  await userEvent.click(screen.getByRole('button', { name: '소설' }))
  expect(screen.getByRole('heading', { name: '최신 이야기' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '오래된 이야기' })).not.toBeInTheDocument()
})

test('ready 이후 loader 교체 중에는 이전 catalog를 숨긴다', async () => {
  const firstCatalog = makeAppCatalog()
  const firstLoader = vi.fn(async () => firstCatalog)
  let resolveReplacement!: (catalog: ReturnType<typeof makeAppCatalog>) => void
  const replacementPending = new Promise<ReturnType<typeof makeAppCatalog>>((resolve) => {
    resolveReplacement = resolve
  })
  const replacementLoader = vi.fn(() => replacementPending)
  const storage = memoryStorage()
  const { rerender } = render(
    <App loadCatalog={firstLoader} storage={storage} />,
  )
  await screen.findByRole('heading', { name: '기초 학습 대시보드' })

  rerender(<App loadCatalog={replacementLoader} storage={storage} />)
  expect(screen.getByText('학습 콘텐츠를 불러오는 중입니다.')).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument()

  resolveReplacement(makeAppCatalog())
  expect(
    await screen.findByRole('heading', { name: '기초 학습 대시보드' }),
  ).toBeInTheDocument()
})

test('loader A에서 B를 거쳐 같은 A로 돌아와도 오래된 A catalog를 재노출하지 않는다', async () => {
  const firstCatalog = makeAppCatalog()
  let resolveNextA!: (catalog: ReturnType<typeof makeAppCatalog>) => void
  let resolveB!: (catalog: ReturnType<typeof makeAppCatalog>) => void
  const nextAPending = new Promise<ReturnType<typeof makeAppCatalog>>((resolve) => {
    resolveNextA = resolve
  })
  const bPending = new Promise<ReturnType<typeof makeAppCatalog>>((resolve) => {
    resolveB = resolve
  })
  const loaderA = vi
    .fn<() => Promise<ReturnType<typeof makeAppCatalog>>>()
    .mockResolvedValueOnce(firstCatalog)
    .mockReturnValueOnce(nextAPending)
  const loaderB = vi.fn(() => bPending)
  const storage = memoryStorage()
  const { rerender } = render(
    <App loadCatalog={loaderA} storage={storage} />,
  )
  await screen.findByRole('heading', { name: '기초 학습 대시보드' })

  rerender(<App loadCatalog={loaderB} storage={storage} />)
  expect(screen.getByText('학습 콘텐츠를 불러오는 중입니다.')).toBeInTheDocument()
  rerender(<App loadCatalog={loaderA} storage={storage} />)

  expect(screen.getByText('학습 콘텐츠를 불러오는 중입니다.')).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument()
  await waitFor(() => expect(loaderA).toHaveBeenCalledTimes(2))

  resolveNextA(makeAppCatalog())
  await screen.findByRole('heading', { name: '기초 학습 대시보드' })
  resolveB(makeAppCatalog())
})

test('주입된 음성 포트가 바뀌면 최신 포트를 사용한다', async () => {
  const user = userEvent.setup()
  const catalog = makeAppCatalog()
  const loader = vi.fn(async () => catalog)
  const firstSpeech = { speak: vi.fn() }
  const latestSpeech = { speak: vi.fn() }
  const storage = memoryStorage()
  const { rerender } = render(
    <App loadCatalog={loader} storage={storage} speech={firstSpeech} />,
  )
  await user.click(await screen.findByRole('button', { name: '학습' }))
  await user.click(screen.getByRole('button', { name: /발음 듣기/ }))
  expect(firstSpeech.speak).toHaveBeenCalledOnce()

  rerender(<App loadCatalog={loader} storage={storage} speech={latestSpeech} />)
  await user.click(screen.getByRole('button', { name: /발음 듣기/ }))
  expect(latestSpeech.speak).toHaveBeenCalledOnce()
  expect(firstSpeech.speak).toHaveBeenCalledOnce()
})

test('pending loader를 unmount한 뒤 늦게 완료해도 상태 갱신을 시도하지 않는다', async () => {
  let resolve!: (catalog: ReturnType<typeof makeAppCatalog>) => void
  const pending = new Promise<ReturnType<typeof makeAppCatalog>>((done) => {
    resolve = done
  })
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const { unmount } = render(
    <App loadCatalog={() => pending} storage={memoryStorage()} />,
  )
  unmount()

  await act(async () => resolve(makeAppCatalog()))
  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore()
})

test('대시보드에서 단어장·문법·소설·학습·퀴즈 화면을 실제 catalog로 이동한다', async () => {
  const user = userEvent.setup()
  render(
    <App
      loadCatalog={async () => makeAppCatalog()}
      storage={memoryStorage()}
      speech={{ speak: vi.fn() }}
    />,
  )
  await screen.findByRole('heading', { name: '기초 학습 대시보드' })

  await user.click(screen.getByRole('button', { name: '단어장' }))
  await user.type(screen.getByRole('searchbox', { name: '단어 검색' }), 'wake up')
  expect(screen.getByRole('row', { name: /wake up/ })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '문법' }))
  await user.click(
    within(screen.getByRole('navigation', { name: '문법 레벨' })).getByRole(
      'button',
      { name: 'A2' },
    ),
  )
  await user.click(screen.getByRole('button', { name: /A2-G01/ }))
  expect(screen.getByRole('heading', { name: /A2-G01/ })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '기초' }))
  await user.click(screen.getByRole('button', { name: '소설' }))
  const story = screen.getByRole('article')
  expect(within(story).getByRole('heading', { name: '기초 대표 이야기' })).toBeInTheDocument()
  expect(within(story).getByText('릴리스 목표 대비 8 / 500 (1.6%)')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '학습' }))
  expect(screen.getByRole('heading', { name: '기초 플래시카드 학습' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '퀴즈' }))
  expect(screen.getByRole('group', { name: '퀴즈 유형' })).toBeInTheDocument()
  expect(screen.getByText('현재 1 / 전체 10')).toBeInTheDocument()
})

test('오답 review 학습은 기존 정규 세션 snapshot을 보존한다', async () => {
  const user = userEvent.setup()
  const catalog = makeAppCatalog()
  const state = createInitialState()
  const regularSnapshot = {
    queueIds: catalog.itemsByLevel.기초.slice(0, 3).map(({ id }) => id),
    currentIndex: 1,
  }
  state.studySessions.기초 = regularSnapshot
  state.mistakes['app-word-play'] = {
    wrongCount: 2,
    wrongStreak: 2,
    priorityRemaining: 3,
  }
  const storage = memoryStorage(JSON.stringify(state))
  render(
    <App
      loadCatalog={async () => catalog}
      storage={storage}
      speech={null}
    />,
  )
  await screen.findByText('play')

  await user.click(screen.getByRole('button', { name: '오답 다시 학습' }))
  expect(screen.getByText('1 / 1')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))

  const saved = JSON.parse(storage.values.get(STORAGE_KEY) ?? '{}')
  expect(saved.studySessions.기초).toEqual(regularSnapshot)
  expect(saved.mastery['app-word-play']).toMatchObject({ attempts: 1, correct: 1 })
  expect(saved.mistakes['app-word-play']).toBeUndefined()

  await user.click(screen.getByRole('button', { name: '전체 학습으로 돌아가기' }))
  expect(screen.getByText('2 / 3')).toBeInTheDocument()
})

test('일반 학습 세션은 평가 후 새로고침해도 다음 위치를 복원한다', async () => {
  const user = userEvent.setup()
  const catalog = makeAppCatalog()
  const loader = vi.fn(async () => catalog)
  const storage = memoryStorage()
  const first = render(
    <App loadCatalog={loader} storage={storage} speech={null} />,
  )
  await user.click(await screen.findByRole('button', { name: '학습' }))
  expect(screen.getByText('1 / 10')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))
  expect(screen.getByText('2 / 10')).toBeInTheDocument()

  first.unmount()
  render(<App loadCatalog={loader} storage={storage} speech={null} />)
  expect(await screen.findByText('2 / 10')).toBeInTheDocument()
})

test('오답 퀴즈 결과를 단일 복습 큐로 넘기고 레벨 이탈 시 override를 해제한다', async () => {
  const user = userEvent.setup()
  const catalog = makeAppCatalog()
  const state = createInitialState()
  state.studySessions.기초 = {
    queueIds: catalog.itemsByLevel.기초.slice(0, 3).map(({ id }) => id),
    currentIndex: 1,
  }
  state.mistakes['app-word-play'] = {
    wrongCount: 2,
    wrongStreak: 2,
    priorityRemaining: 3,
  }
  render(
    <App
      loadCatalog={async () => catalog}
      storage={memoryStorage(JSON.stringify(state))}
      speech={null}
    />,
  )
  await screen.findByText('play')

  await user.click(screen.getByRole('button', { name: '오답 퀴즈' }))
  expect(await screen.findByTestId('quiz-prompt')).toHaveTextContent('play')
  const answers = within(screen.getByRole('group', { name: '답을 선택하세요' }))
  const wrongAnswer = answers
    .getAllByRole('button')
    .find((button) => button.textContent !== '놀다')
  expect(wrongAnswer).toBeDefined()
  await user.click(wrongAnswer!)
  expect(screen.getByRole('status')).toHaveTextContent('오답입니다')
  await user.click(screen.getByRole('button', { name: '결과 보기' }))
  expect(screen.getByRole('heading', { name: '퀴즈 결과' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '틀린 단어 다시 학습' }))
  expect(screen.getByText('1 / 1')).toBeInTheDocument()
  expect(screen.getByText('play')).toBeInTheDocument()

  const levelMenu = screen.getByRole('navigation', { name: '학습 레벨 메뉴' })
  await user.click(within(levelMenu).getByRole('button', { name: '유치원' }))
  await user.click(within(levelMenu).getByRole('button', { name: '기초' }))
  expect(screen.getByText('2 / 3')).toBeInTheDocument()
})

test('연속 두 번째 퀴즈 오답은 일반 학습 큐의 첫 3개 안에 자동 배치한다', async () => {
  const user = userEvent.setup()
  const catalog = makeAppCatalog()
  const state = createInitialState()
  state.mistakes['app-word-play'] = {
    wrongCount: 1,
    wrongStreak: 1,
    priorityRemaining: 0,
  }
  render(
    <App
      loadCatalog={async () => catalog}
      storage={memoryStorage(JSON.stringify(state))}
      speech={null}
    />,
  )
  await screen.findByText('play')

  await user.click(screen.getByRole('button', { name: '오답 퀴즈' }))
  const answers = within(screen.getByRole('group', { name: '답을 선택하세요' }))
  const wrongAnswer = answers
    .getAllByRole('button')
    .find((button) => button.textContent !== '놀다')
  expect(wrongAnswer).toBeDefined()
  await user.click(wrongAnswer!)
  await user.click(screen.getByRole('button', { name: '결과 보기' }))
  expect(screen.getByRole('heading', { name: '퀴즈 결과' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '학습' }))
  const firstThree: string[] = []
  for (let index = 0; index < 3; index += 1) {
    const card = screen.getByRole('button', { name: /카드 뒤집기/ })
    const term = card.querySelector('strong')?.textContent ?? ''
    firstThree.push(term)
    if (term === 'play') break
    await user.click(card)
    await user.click(screen.getByRole('button', { name: '기억했어요' }))
  }

  expect(firstThree).toContain('play')
})

test('저장 실패 후에도 화면 상태를 유지하고 경고를 닫을 수 있다', async () => {
  const user = userEvent.setup()
  const storage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }),
  }
  render(
    <App loadCatalog={async () => makeAppCatalog()} storage={storage} />,
  )
  await screen.findByRole('heading', { name: '기초 학습 대시보드' })

  await user.click(screen.getByRole('button', { name: '소설' }))
  expect(screen.getByRole('heading', { name: '기초 대표 이야기' })).toBeInTheDocument()
  expect(screen.getByText('학습 상태를 저장하지 못했습니다.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '알림 닫기' }))
  expect(screen.queryByText('학습 상태를 저장하지 못했습니다.')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '기초 대표 이야기' })).toBeInTheDocument()
})

test('손상 상태 경고는 로딩과 독립적으로 표시하고 닫을 수 있다', async () => {
  const user = userEvent.setup()
  let resolve!: (catalog: ReturnType<typeof makeAppCatalog>) => void
  const pending = new Promise<ReturnType<typeof makeAppCatalog>>((done) => {
    resolve = done
  })
  render(
    <App
      loadCatalog={() => pending}
      storage={memoryStorage('{bad json')}
    />,
  )

  expect(screen.getByText('저장된 학습 상태가 손상되어 기본 상태로 복구했습니다.')).toBeInTheDocument()
  expect(screen.getByText('학습 콘텐츠를 불러오는 중입니다.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '알림 닫기' }))
  expect(
    screen.queryByText('저장된 학습 상태가 손상되어 기본 상태로 복구했습니다.'),
  ).not.toBeInTheDocument()

  resolve(makeAppCatalog())
  expect(
    await screen.findByRole('heading', { name: '기초 학습 대시보드' }),
  ).toBeInTheDocument()
  expect(
    screen.queryByText('저장된 학습 상태가 손상되어 기본 상태로 복구했습니다.'),
  ).not.toBeInTheDocument()
})
