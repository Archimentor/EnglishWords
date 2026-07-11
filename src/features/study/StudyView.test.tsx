import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Level, StudyItem } from '../../domain/content/types'
import { createInitialState, type AppState } from '../../state/appState'
import type { AppAction } from '../../state/appReducer'
import type { SpeechPort } from './speech'
import { StudyView } from './StudyView'

function makeItems(count: number, level: Level = '기초'): StudyItem[] {
  return Array.from({ length: count }, (_, index) => {
    const term = `${level}-word-${index + 1}`
    return {
      id: `word-${level}-${index + 1}`,
      kind: 'word',
      term,
      lemma: term,
      level,
      difficulty: 'normal',
      partsOfSpeech: ['noun'],
      forms: [term, `${term}s`],
      meanings: [`뜻 ${index + 1}`, `보조 뜻 ${index + 1}`],
      ipa: index === 1 ? null : `/sound-${index + 1}/`,
      examples: [`Example ${index + 1}.`, `Another example ${index + 1}.`],
    }
  })
}

function stateWithSession(
  items: readonly StudyItem[],
  currentIndex = 0,
  level: Level = '기초',
): AppState {
  const state = createInitialState()
  state.navigation.level = level
  state.studySessions[level] = {
    queueIds: items.map(({ id }) => id),
    currentIndex,
  }
  return state
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

function actionTypes(dispatch: ReturnType<typeof vi.fn>): string[] {
  return dispatch.mock.calls.map(([action]) => (action as AppAction).type)
}

test('저장 세션이 없으면 최대 500개 고유 큐를 한 번 생성해 즉시 저장한다', async () => {
  const dispatch = vi.fn()
  const items = makeItems(600)

  render(
    <StrictMode>
      <StudyView
        items={items}
        state={createInitialState()}
        dispatch={dispatch}
        speech={null}
        random={seededRandom(1)}
      />
    </StrictMode>,
  )

  await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
  const action = dispatch.mock.calls[0]?.[0] as AppAction
  expect(action.type).toBe('SAVE_STUDY_SESSION')
  if (action.type !== 'SAVE_STUDY_SESSION') throw new Error('Expected session save')
  expect(action.snapshot.queueIds).toHaveLength(500)
  expect(new Set(action.snapshot.queueIds).size).toBe(500)
  expect(action.snapshot.currentIndex).toBe(0)
})

test('저장된 위치와 현재 카드를 복원하고 IPA 없음도 표시한다', () => {
  const items = makeItems(10)
  render(
    <StudyView
      items={items}
      state={stateWithSession(items, 1)}
      dispatch={vi.fn()}
      speech={null}
    />,
  )

  expect(screen.getByText('2 / 10')).toBeInTheDocument()
  expect(screen.getByText('기초-word-2')).toBeInTheDocument()
  expect(screen.getByText('발음기호 없음')).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: '학습 진행' })).toHaveAttribute(
    'aria-valuenow',
    '2',
  )
})

test('카드를 뒤집으면 모든 뜻과 예문을 보여주고 다음 카드에서 닫힌다', async () => {
  const user = userEvent.setup()
  const items = makeItems(3)
  const dispatch = vi.fn()
  render(
    <StudyView
      items={items}
      state={stateWithSession(items)}
      dispatch={dispatch}
      speech={{ speak: vi.fn() }}
    />,
  )
  const card = screen.getByRole('button', { name: /기초-word-1 카드 뒤집기/ })

  expect(card).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByText('뜻 1')).not.toBeInTheDocument()
  await user.click(card)

  expect(card).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('뜻 1')).toBeInTheDocument()
  expect(screen.getByText('보조 뜻 1')).toBeInTheDocument()
  expect(screen.getByText('Example 1.')).toBeInTheDocument()
  expect(screen.getByText('Another example 1.')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '기억했어요' }))
  expect(actionTypes(dispatch).slice(-2)).toEqual(['RECORD_STUDY', 'SAVE_STUDY_SESSION'])
  expect(dispatch.mock.calls.at(-2)?.[0]).toMatchObject({
    type: 'RECORD_STUDY',
    itemId: items[0]?.id,
    correct: true,
  })
  expect(screen.getByText('2 / 3')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /기초-word-2 카드 뒤집기/ }),
  ).toHaveAttribute('aria-pressed', 'false')
})

test('다시 볼게요는 명시적인 오답으로 기록한 뒤 위치를 저장한다', async () => {
  const user = userEvent.setup()
  const items = makeItems(2)
  const dispatch = vi.fn()
  render(
    <StudyView
      items={items}
      state={stateWithSession(items)}
      dispatch={dispatch}
      speech={null}
    />,
  )

  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '다시 볼게요' }))

  expect(dispatch.mock.calls.at(-2)?.[0]).toEqual({
    type: 'RECORD_STUDY',
    itemId: items[0]?.id,
    correct: false,
  })
  expect(dispatch.mock.calls.at(-1)?.[0]).toMatchObject({
    type: 'SAVE_STUDY_SESSION',
    snapshot: { currentIndex: 1 },
  })
})

test('난이도 변경은 현재 카드를 유지하고 뒤쪽만 재가중하며 숙련도를 건드리지 않는다', async () => {
  const user = userEvent.setup()
  const items = makeItems(8)
  const dispatch = vi.fn()
  render(
    <StudyView
      items={items}
      state={stateWithSession(items, 2)}
      dispatch={dispatch}
      speech={null}
      random={seededRandom(4)}
    />,
  )

  await user.click(screen.getByRole('button', { name: '어려움' }))

  expect(actionTypes(dispatch)).toEqual(['SET_DIFFICULTY', 'SAVE_STUDY_SESSION'])
  expect(dispatch.mock.calls[0]?.[0]).toEqual({
    type: 'SET_DIFFICULTY',
    difficulty: 'hard',
  })
  const save = dispatch.mock.calls[1]?.[0] as AppAction
  if (save.type !== 'SAVE_STUDY_SESSION') throw new Error('Expected session save')
  expect(save.snapshot.currentIndex).toBe(2)
  expect(save.snapshot.queueIds.slice(0, 3)).toEqual(items.slice(0, 3).map(({ id }) => id))
  expect(new Set(save.snapshot.queueIds).size).toBe(items.length)
  expect(actionTypes(dispatch)).not.toContain('RECORD_STUDY')
  expect(screen.getByText(items[2]!.term)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '어려움' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('삭제·중복·다른 레벨 ID를 정리하고 다음 유효 카드 위치를 보존한다', async () => {
  const dispatch = vi.fn()
  const items = [...makeItems(2), ...makeItems(1, '유치원')]
  const state = createInitialState()
  state.studySessions.기초 = {
    queueIds: [items[0]!.id, items[0]!.id, 'missing', items[2]!.id, items[1]!.id],
    currentIndex: 2,
  }

  render(
    <StudyView items={items} state={state} dispatch={dispatch} speech={null} />,
  )

  expect(screen.getByText(items[1]!.term)).toBeInTheDocument()
  expect(screen.getByText('2 / 2')).toBeInTheDocument()
  await vi.waitFor(() =>
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SAVE_STUDY_SESSION',
      level: '기초',
      snapshot: { queueIds: [items[0]!.id, items[1]!.id], currentIndex: 1 },
    }),
  )
})

test('완료 위치는 마지막 카드를 반복하지 않고 새 세션을 시작할 수 있다', async () => {
  const user = userEvent.setup()
  const items = makeItems(2)
  const dispatch = vi.fn()
  render(
    <StudyView
      items={items}
      state={stateWithSession(items, items.length)}
      dispatch={dispatch}
      speech={null}
      random={seededRandom(6)}
    />,
  )

  expect(screen.getByRole('heading', { name: '학습 세션 완료' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /카드 뒤집기/ })).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '새 세션 시작' }))
  expect(screen.getByText('1 / 2')).toBeInTheDocument()
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'SAVE_STUDY_SESSION',
      snapshot: expect.objectContaining({ currentIndex: 0 }),
    }),
  )
})

test('TTS 실패를 알리되 카드 학습은 계속할 수 있다', async () => {
  const user = userEvent.setup()
  const items = makeItems(2)
  const speech: SpeechPort = {
    speak: vi.fn(() => {
      throw new Error('speech failed')
    }),
  }
  render(
    <StudyView
      items={items}
      state={stateWithSession(items)}
      dispatch={vi.fn()}
      speech={speech}
    />,
  )

  await user.click(screen.getByRole('button', { name: '기초-word-1 발음 듣기' }))
  expect(screen.getByRole('status')).toHaveTextContent(
    '발음 재생을 지원하지 않는 브라우저입니다.',
  )
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  expect(screen.getByText('뜻 1')).toBeInTheDocument()
})

test('학습할 현재 레벨 항목이 없으면 큐를 저장하지 않고 안내한다', () => {
  const dispatch = vi.fn()
  render(
    <StudyView
      items={makeItems(2, '유치원')}
      state={createInitialState()}
      dispatch={dispatch}
      speech={null}
    />,
  )

  expect(screen.getByText('이 레벨에 학습할 항목이 없습니다.')).toBeInTheDocument()
  expect(dispatch).not.toHaveBeenCalled()
})
