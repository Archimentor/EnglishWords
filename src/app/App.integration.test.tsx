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

test('레벨 대시보드는 선택한 레벨의 학습 분석만 표시한다', async () => {
  const user = userEvent.setup()
  const state = createInitialState()
  state.studyAnalytics.기초.selectedDifficulty.easy = 2
  state.studyAnalytics.기초.exposedDifficulty.easy = 1
  state.studyAnalytics.기초.wrongReexposures['word-play'] = 1
  state.difficultyStats.기초.easy = { attempts: 2, correct: 2 }
  state.studyAnalytics.유치원.selectedDifficulty.hard = 3
  state.studyAnalytics.유치원.exposedDifficulty.veryHard = 2
  state.studyAnalytics.유치원.wrongReexposures['word-kindergarten'] = 4
  state.difficultyStats.유치원.hard = { attempts: 4, correct: 1 }

  render(
    <App
      loadCatalog={async () => makeAppCatalog()}
      storage={memoryStorage(JSON.stringify(state))}
      speech={null}
    />,
  )

  await screen.findByRole('heading', { name: '기초 학습 대시보드' })
  expect(screen.getByText('오답 재노출 1회')).toBeInTheDocument()
  expect(screen.getByRole('row', {
    name: /^쉬움 100% \(2회\) 1회 100% \(2\/2\)/,
  })).toBeInTheDocument()
  expect(screen.queryByText('25% (1/4)')).not.toBeInTheDocument()
  expect(screen.queryByText('오답 재노출 4회')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '유치원' }))

  expect(await screen.findByRole('heading', { name: '유치원 학습 대시보드' }))
    .toBeInTheDocument()
  expect(screen.getByText('오답 재노출 4회')).toBeInTheDocument()
  expect(screen.getByRole('row', {
    name: /^어려움 100% \(3회\) 0회 25% \(1\/4\)/,
  })).toBeInTheDocument()
  expect(screen.getByRole('row', { name: /^아주어려움 0% \(0회\) 2회/ }))
    .toBeInTheDocument()
  expect(screen.queryByText('오답 재노출 1회')).not.toBeInTheDocument()
  expect(screen.queryByText('100% (2/2)')).not.toBeInTheDocument()
})

test('손상 상태 경고에서 byte-identical 복구 원본을 확인하고 다운로드할 수 있다', async () => {
  const user = userEvent.setup()
  const raw = ' {bad json}\r\n'

  render(
    <App
      loadCatalog={async () => makeAppCatalog()}
      storage={memoryStorage(raw)}
      speech={null}
    />,
  )

  await screen.findByRole('heading', { name: '기초 학습 대시보드' })
  expect(screen.getByRole('status')).toHaveTextContent(/손상되어 기본 상태로 복구/)

  await user.click(screen.getByText('복구 원본 보기'))
  expect(screen.getByTestId('state-raw-backup')).toHaveTextContent(raw.trim())
  expect(screen.getByRole('link', { name: '복구 원본 다운로드' })).toHaveAttribute(
    'download',
    'wordmaster-recovery-backup.txt',
  )
})

test('복구 원본에 단독 surrogate가 있어도 손실 없는 UTF-16 다운로드를 제공한다', async () => {
  const user = userEvent.setup()
  const raw = String.fromCharCode(0xd800)

  render(
    <App
      loadCatalog={async () => makeAppCatalog()}
      storage={memoryStorage(raw)}
      speech={null}
    />,
  )

  await screen.findByRole('heading', { name: '기초 학습 대시보드' })
  await user.click(screen.getByText('복구 원본 보기'))
  expect(screen.getByTestId('state-raw-backup').textContent).toBe(raw)
  const link = screen.getByRole('link', { name: '복구 원본 다운로드' })
  expect(link).toHaveAttribute('download', 'wordmaster-recovery-backup.txt')
  const href = link.getAttribute('href')
  expect(href).toMatch(/^data:text\/plain;charset=utf-16le;base64,/)
  const decoded = atob(href?.split(',')[1] ?? '')
  expect([...decoded].map((character) => character.charCodeAt(0)))
    .toEqual([0xff, 0xfe, 0x00, 0xd8])
})

test('상위 레벨 소설은 하위 레벨 단어를 실제 단어 entry로 연결한다', async () => {
  const user = userEvent.setup()
  const catalog = makeAppCatalog()
  const story = catalog.stories.유치원
  const baby = catalog.wordlists.기초.find(({ lemma }) => lemma === 'baby')
  if (!baby) throw new Error('Expected lower-level baby fixture')

  const chapters = story.storyText.split(/\n\s*\n\s*\n/u)
  chapters[0] = `${chapters[0]} baby.`
  story.storyText = chapters.join('\n\n\n')

  render(
    <App
      loadCatalog={async () => catalog}
      storage={memoryStorage()}
      speech={null}
    />,
  )

  await screen.findByRole('heading', { name: '기초 학습 대시보드' })
  await user.click(screen.getByRole('button', { name: '유치원' }))
  await user.click(screen.getByRole('button', { name: '소설' }))
  const babyToken = screen.getByRole('button', { name: 'story word: baby' })
  expect(babyToken).toBeInTheDocument()
  await user.click(babyToken)
  expect(
    screen.getByRole('heading', { name: 'baby 단어 상세' }),
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
  const firstSpeech = { speak: vi.fn(), cancel: vi.fn() }
  const latestSpeech = { speak: vi.fn(), cancel: vi.fn() }
  const storage = memoryStorage()
  const { rerender } = render(
    <App loadCatalog={loader} storage={storage} speech={firstSpeech} />,
  )
  await user.click(await screen.findByRole('button', { name: '학습' }))
  await user.click(
    within(screen.getByRole('navigation', { name: '학습 레벨 메뉴' })).getByRole(
      'button',
      { name: '기초' },
    ),
  )
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
      speech={{ speak: vi.fn(), cancel: vi.fn() }}
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
      { name: 'A1' },
    ),
  )
  await user.click(screen.getByRole('button', { name: /A1-G01/ }))
  expect(screen.getByRole('heading', { name: /A1-G01/ })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '기초' }))
  await user.click(screen.getByRole('button', { name: '소설' }))
  const story = screen.getByRole('article')
  expect(within(story).getByRole('heading', { name: 'baby', level: 2 })).toBeInTheDocument()
  expect(within(story).queryByText('실제 소설 본문 커버리지')).not.toBeInTheDocument()
  expect(within(story).queryByText('전체 학습 단어')).not.toBeInTheDocument()
  expect(within(story).queryByText('전체 학습 구동사')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '학습' }))
  expect(screen.getByRole('heading', { name: '학습 레벨 선택' })).toBeInTheDocument()
  await user.click(
    within(screen.getByRole('navigation', { name: '학습 레벨 메뉴' })).getByRole(
      'button',
      { name: '기초' },
    ),
  )
  expect(screen.getByRole('heading', { name: '기초 플래시카드 학습' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '퀴즈' }))
  expect(screen.getByRole('heading', { name: '퀴즈 레벨 선택' })).toBeInTheDocument()
  await user.click(
    within(screen.getByRole('navigation', { name: '퀴즈 레벨 메뉴' })).getByRole(
      'button',
      { name: '기초' },
    ),
  )
  expect(screen.getByRole('heading', { name: '퀴즈 유형 선택' })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: '퀴즈 유형' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '4지선다 영어→한글' }))
  expect(screen.getByText('현재 1 / 전체 10')).toBeInTheDocument()
})

test('문법 답안은 명시 clock으로 일별 활동과 중단 가능 세션 이력을 저장한다', async () => {
  const user = userEvent.setup()
  const storage = memoryStorage()
  const now = vi.fn()
    .mockReturnValueOnce(1_000)
    .mockReturnValueOnce(2_500)

  render(
    <App
      loadCatalog={async () => makeAppCatalog()}
      storage={storage}
      speech={null}
      now={now}
    />,
  )
  await screen.findByRole('heading', { name: '기초 학습 대시보드' })
  await user.click(screen.getByRole('button', { name: '문법' }))
  await user.click(
    within(screen.getByRole('navigation', { name: '문법 레벨' })).getByRole(
      'button',
      { name: 'A1' },
    ),
  )
  await user.click(screen.getByRole('button', { name: /A1-G01.*학습 가능/ }))

  const diagnostic = screen.getByText('1. 진단').closest('form')!
  await user.click(within(diagnostic).getByRole('radio', {
    name: 'The child is happy.',
  }))
  await user.click(within(diagnostic).getByRole('button', { name: '채점하기' }))

  await waitFor(() => {
    const raw = storage.values.get(STORAGE_KEY)
    expect(raw).toBeDefined()
    const saved = JSON.parse(raw!) as ReturnType<typeof createInitialState>
    expect(Object.values(saved.tracking.dailyActivity)).toEqual([
      { sessions: 1, attempts: 1, correct: 1, durationMs: 1_500 },
    ])
    expect(saved.tracking.sessionHistory).toEqual([
      expect.objectContaining({
        kind: 'grammar',
        level: 'A1',
        startedAt: 1_000,
        endedAt: 2_500,
        durationMs: 1_500,
        status: 'interrupted',
        performance: expect.objectContaining({ attempts: 1, correct: 1 }),
      }),
    ])
  })
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
  await screen.findByRole('heading', { name: '기초 학습 대시보드' })

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
  await user.click(
    within(screen.getByRole('navigation', { name: '학습 레벨 메뉴' })).getByRole(
      'button',
      { name: '기초' },
    ),
  )
  expect(screen.getByText('1 / 10')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))
  expect(screen.getByText('2 / 10')).toBeInTheDocument()

  first.unmount()
  render(<App loadCatalog={loader} storage={storage} speech={null} />)
  expect(await screen.findByText('2 / 10')).toBeInTheDocument()
})

test('오답 퀴즈 직후에는 최소 간격을 안내하고 전체 학습의 spacer 뒤에 복습한다', async () => {
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
  await screen.findByRole('heading', { name: '기초 학습 대시보드' })

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
  expect(screen.getByRole('heading', { name: '최소 간격 대기 중' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /카드 뒤집기/ })).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '전체 학습으로 돌아가기' }))
  expect(screen.getByText('2 / 4')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))
  expect(screen.getByText('3 / 4')).toBeInTheDocument()
  const spacer = screen.getByRole('button', { name: /카드 뒤집기/ })
  expect(spacer).not.toHaveAccessibleName(/play/u)
  await user.click(spacer)
  await user.click(screen.getByRole('button', { name: '기억했어요' }))
  expect(screen.getByText('4 / 4')).toBeInTheDocument()
  expect(screen.getByText('play')).toBeInTheDocument()
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
  await screen.findByRole('heading', { name: '기초 학습 대시보드' })

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
  await user.click(
    within(screen.getByRole('navigation', { name: '학습 레벨 메뉴' })).getByRole(
      'button',
      { name: '기초' },
    ),
  )
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
  expect(screen.getByRole('heading', { name: 'baby', level: 2 })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent(
    /학습 상태를 저장하지 못했습니다.*현재 탭에서만/u,
  )
  await user.click(screen.getByRole('button', { name: '알림 닫기' }))
  expect(
    screen.queryByText(/학습 상태를 저장하지 못했습니다/u),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'baby', level: 2 })).toBeInTheDocument()
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
