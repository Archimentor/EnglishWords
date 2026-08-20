import { StrictMode, useReducer } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Level, StudyItem } from '../../domain/content/types'
import { createEmptySessionQuizTypePerformance } from '../../domain/progress/tracking'
import { createInitialState, type AppState } from '../../state/appState'
import { appReducer, type AppAction } from '../../state/appReducer'
import type { SpeechPort } from './speech'
import { StudyView } from './StudyView'

const DAY_MS = 24 * 60 * 60 * 1_000

function makeItems(count: number, level: Level = '기초'): StudyItem[] {
  return Array.from({ length: count }, (_, index) => {
    const term = `${level}-word-${index + 1}`
    const forms = [term, `${term}s`]
    const meanings = [`뜻 ${index + 1}`, `보조 뜻 ${index + 1}`]
    const ipa = index === 1 ? '' : `/sound-${index + 1}/`
    const examples = [`Example ${index + 1}.`, `Another example ${index + 1}.`]
    return {
      id: `word-${level}-${index + 1}`,
      kind: 'word',
      term,
      lemma: term,
      level,
      difficulty: 'normal',
      partsOfSpeech: ['noun'],
      forms,
      meanings,
      ipa: ipa || null,
      examples,
      entries: [{
        partOfSpeech: 'noun',
        forms,
        meanings,
        ipa,
        examples,
      }],
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

const zeroRandom = () => 0

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
  expect(action.tracking?.queue).toMatchObject({
    scope: 'standard',
    level: '기초',
    queueSize: 500,
    currentIndex: 0,
    recoveryIndex: 0,
    recovered: false,
    status: 'active',
    difficultyMix: {
      veryEasy: 0,
      easy: 0,
      normal: 500,
      hard: 0,
      veryHard: 0,
    },
    exposureComponents: {
      difficultyBase: 0.4,
      lowAccuracyBoost: 0,
      mistakeBoost: 0,
      recentWrongBoost: 0,
      scheduleBoost: 0,
      masteryBoost: 0,
      grammarBoost: 0,
      total: 0.4,
    },
    overdueCount: 0,
    mistakeCount: 0,
    priorityCount: 0,
    priorityEntries: [],
  })
  expect(action.tracking?.queue?.candidateItemIds).toHaveLength(600)
  expect(action.tracking?.queue?.orderedItemIds).toEqual(action.snapshot.queueIds)
  expect(action.tracking?.queue?.itemExposureWeights).toHaveLength(600)
  expect(action.tracking?.queue?.spacing).toEqual({
    minimumDistinctItems: 1,
    exceptionPolicy: 'strict',
    exceptionApplied: false,
    blockedItemIds: [],
  })
  await act(async () => Promise.resolve())
  expect(actionTypes(dispatch)).toEqual(['SAVE_STUDY_SESSION'])
})

test('실제 unmount는 큐와 세션을 중단 시각과 함께 기록한다', async () => {
  const items = makeItems(2)
  const dispatch = vi.fn()
  let timestamp = 1_000
  const view = render(
    <StudyView
      items={items}
      state={createInitialState()}
      dispatch={dispatch}
      speech={null}
      now={() => timestamp}
      random={zeroRandom}
    />,
  )

  await waitFor(() => expect(actionTypes(dispatch)).toEqual(['SAVE_STUDY_SESSION']))
  dispatch.mockClear()
  timestamp = 1_750
  view.unmount()
  await act(async () => Promise.resolve())

  expect(actionTypes(dispatch)).toEqual(['TRACK_STUDY_QUEUE'])
  expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
    type: 'TRACK_STUDY_QUEUE',
    queue: {
      scope: 'standard',
      status: 'interrupted',
      interruptedAt: 1_750,
      updatedAt: 1_750,
      currentIndex: 0,
    },
    session: {
      status: 'interrupted',
      startedAt: 1_000,
      endedAt: 1_750,
      durationMs: 750,
      performance: { attempts: 0, correct: 0 },
    },
  })
})

test('중단 기록으로 다시 열면 같은 큐·세션 ID와 복구 지점을 재사용한다', async () => {
  const items = makeItems(2)
  const initial = createInitialState()
  const firstDispatch = vi.fn()
  let timestamp = 1_000
  const firstView = render(
    <StudyView
      items={items}
      state={initial}
      dispatch={firstDispatch}
      speech={null}
      now={() => timestamp}
      random={zeroRandom}
    />,
  )
  await waitFor(() => expect(actionTypes(firstDispatch)).toEqual(['SAVE_STUDY_SESSION']))
  const initialSave = firstDispatch.mock.calls[0]?.[0] as AppAction
  if (initialSave.type !== 'SAVE_STUDY_SESSION') throw new Error('Expected initial save')

  timestamp = 1_500
  firstView.unmount()
  await act(async () => Promise.resolve())
  const interrupted = firstDispatch.mock.calls.at(-1)?.[0] as AppAction
  if (interrupted.type !== 'TRACK_STUDY_QUEUE') throw new Error('Expected interruption')
  const persisted = appReducer(appReducer(initial, initialSave), interrupted)
  persisted.tracking.itemSchedule[items[0]!.id] = {
    kind: 'word',
    level: '기초',
    ease: 1.3,
    lastSeenAt: 1_500,
    nextDueAt: 1_500,
    weight: 2,
    lastLevel: '기초',
  }
  const resumedDispatch = vi.fn()
  timestamp = 2_000
  render(
    <StudyView
      items={items}
      state={persisted}
      dispatch={resumedDispatch}
      speech={null}
      now={() => timestamp}
      random={zeroRandom}
    />,
  )

  await waitFor(() => expect(actionTypes(resumedDispatch)).toContain('SAVE_STUDY_SESSION'))
  const resumed = resumedDispatch.mock.calls[0]?.[0] as AppAction
  expect(resumed).toMatchObject({
    type: 'SAVE_STUDY_SESSION',
    tracking: {
      queue: {
        id: interrupted.queue.id,
        sessionId: interrupted.queue.sessionId,
        status: 'active',
        interruptedAt: null,
        recovered: true,
        recoveryIndex: 0,
      },
    },
  })
  if (resumed.type !== 'SAVE_STUDY_SESSION') throw new Error('Expected resumed save')
  expect(resumed.tracking?.queue?.candidateItemIds).toEqual(
    interrupted.queue.candidateItemIds,
  )
  expect(resumed.tracking?.queue?.itemExposureWeights).toEqual(
    interrupted.queue.itemExposureWeights,
  )
  expect(resumed.tracking?.queue?.spacing).toEqual(interrupted.queue.spacing)
})

test('스케줄·숙련·문법 규칙을 큐 순서와 음수 보존 평균 감사값에 반영한다', async () => {
  const items = makeItems(3)
  const state = createInitialState()
  const now = 10 * DAY_MS
  state.tracking.itemSchedule[items[0]!.id] = {
    kind: 'word',
    level: '기초',
    ease: 3,
    lastSeenAt: now,
    nextDueAt: now + 7 * DAY_MS,
    weight: 0,
    lastLevel: '기초',
  }
  state.tracking.itemSchedule[items[1]!.id] = {
    kind: 'word',
    level: '기초',
    ease: 2.5,
    lastSeenAt: now - 2 * DAY_MS,
    nextDueAt: now - DAY_MS,
    weight: 0,
    lastLevel: '기초',
  }
  state.mastery[items[0]!.id] = {
    attempts: 10,
    correct: 10,
    wrong: 0,
    correctStreak: 5,
    wrongStreak: 0,
  }
  const grammarReviewItemIds = new Set([items[2]!.id])
  const dispatch = vi.fn()

  render(
    <StudyView
      items={items}
      state={state}
      dispatch={dispatch}
      speech={null}
      random={() => 0.5}
      grammarReviewItemIds={grammarReviewItemIds}
      now={() => now}
    />,
  )

  await waitFor(() => expect(dispatch).toHaveBeenCalledOnce())
  const action = dispatch.mock.calls[0]?.[0] as AppAction
  if (action.type !== 'SAVE_STUDY_SESSION') throw new Error('Expected session save')
  expect(action.snapshot.queueIds[0]).toBe(items[1]!.id)
  expect(action.tracking?.queue?.overdueCount).toBe(1)
  const exposure = action.tracking?.queue?.exposureComponents
  expect(exposure?.scheduleBoost).toBeLessThan(0)
  expect(exposure?.masteryBoost).toBeLessThan(0)
  expect(exposure?.grammarBoost).toBe(0.04)
  expect(exposure?.total).toBeCloseTo(
    (exposure?.difficultyBase ?? 0)
      + (exposure?.lowAccuracyBoost ?? 0)
      + (exposure?.mistakeBoost ?? 0)
      + (exposure?.recentWrongBoost ?? 0)
      + (exposure?.scheduleBoost ?? 0)
      + (exposure?.masteryBoost ?? 0)
      + (exposure?.grammarBoost ?? 0),
  )
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
  const progress = screen.getByRole('progressbar', { name: '학습 진행' })
  const card = screen.getByRole('button', { name: /카드 뒤집기/ })
  const difficulty = screen.getByRole('group', { name: '학습 난이도' })
  expect(progress.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(card.compareDocumentPosition(difficulty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('다중 품사 카드를 뒤집으면 형태·뜻·IPA·예문 관계를 entry별로 표시한다', async () => {
  const user = userEvent.setup()
  const base = makeItems(1)[0]!
  const item: StudyItem = {
    ...base,
    term: 'play',
    lemma: 'play',
    partsOfSpeech: ['verb', 'noun'],
    forms: ['play', 'plays', 'played', 'playing'],
    meanings: ['놀다', '연극'],
    ipa: '/pleɪ/',
    examples: ['They played outside.', 'The play was funny.'],
    entries: [
      {
        partOfSpeech: 'verb',
        forms: {
          base: 'play',
          s3: 'plays',
          past: 'played',
          participle: 'playing',
        },
        meanings: ['놀다'],
        ipa: '/pleɪ/',
        examples: ['They played outside.'],
      },
      {
        partOfSpeech: 'noun',
        forms: ['play', 'plays'],
        meanings: ['연극'],
        ipa: '/pleɪ/',
        examples: ['The play was funny.'],
      },
    ],
  }

  render(
    <StudyView
      items={[item]}
      state={stateWithSession([item])}
      dispatch={vi.fn()}
      speech={null}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'play 카드 뒤집기' }))
  const verbEntry = screen.getByRole('region', { name: 'verb' })
  const nounEntry = screen.getByRole('region', { name: 'noun' })

  expect(within(verbEntry).getByText(/기본형: play/)).toBeInTheDocument()
  expect(within(verbEntry).getByText('놀다')).toBeInTheDocument()
  expect(within(verbEntry).getByText('They played outside.')).toBeInTheDocument()
  expect(within(verbEntry).queryByText('연극')).not.toBeInTheDocument()
  expect(within(nounEntry).getByText('play, plays')).toBeInTheDocument()
  expect(within(nounEntry).getByText('연극')).toBeInTheDocument()
  expect(within(nounEntry).getByText('The play was funny.')).toBeInTheDocument()
  expect(within(nounEntry).queryByText('놀다')).not.toBeInTheDocument()
  expect(within(verbEntry).getByText('/pleɪ/')).toBeInTheDocument()
  expect(within(nounEntry).getByText('/pleɪ/')).toBeInTheDocument()
})

test('일치하는 미완료 큐와 세션 ID를 재사용하고 복구 지점을 표시한다', async () => {
  const user = userEvent.setup()
  const items = makeItems(2)
  const state = stateWithSession(items, 1)
  state.tracking.queueHistory = [{
    id: 'existing-study-queue',
    sessionId: 'existing-study-session',
    scope: 'standard',
    level: '기초',
    generatedAt: 100,
    startedAt: 100,
    updatedAt: 200,
    interruptedAt: 200,
    status: 'interrupted',
    selectedDifficulty: 'normal',
    difficultyMix: { veryEasy: 0, easy: 0, normal: 2, hard: 0, veryHard: 0 },
    queueSize: 2,
    currentIndex: 1,
    recoveryIndex: 0,
    recovered: false,
    mistakeCount: 0,
    priorityCount: 0,
    overdueCount: 0,
    exposureComponents: {
      difficultyBase: 0.4,
      lowAccuracyBoost: 0,
      mistakeBoost: 0,
      recentWrongBoost: 0,
      scheduleBoost: 0,
      masteryBoost: 0,
      grammarBoost: 0,
      total: 0.4,
    },
    auditCompleteness: 'legacy',
    candidateItemIds: [],
    orderedItemIds: [],
    itemExposureWeights: [],
    spacing: {
      minimumDistinctItems: 1,
      exceptionPolicy: 'strict',
      exceptionApplied: false,
      blockedItemIds: [],
    },
    priorityEntries: [],
  }]
  state.tracking.sessionHistory = [{
    id: 'existing-study-session',
    kind: 'study',
    level: '기초',
    startedAt: 100,
    endedAt: 200,
    durationMs: 100,
    status: 'interrupted',
    performance: {
      attempts: 1,
      correct: 1,
      byQuizType: createEmptySessionQuizTypePerformance(),
    },
    adjustments: { mistakeBoost: 0.15, difficultyBoost: 0.1, priority: 1 },
  }]
  const dispatch = vi.fn()
  let timestamp = 300

  render(
    <StudyView
      items={items}
      state={state}
      dispatch={dispatch}
      speech={null}
      now={() => timestamp}
    />,
  )

  await waitFor(() => expect(actionTypes(dispatch)).toContain('SAVE_STUDY_SESSION'))
  const resumed = dispatch.mock.calls
    .map(([action]) => action as AppAction)
    .find((action) => action.type === 'SAVE_STUDY_SESSION')
  expect(resumed?.tracking?.queue).toMatchObject({
    id: 'existing-study-queue',
    sessionId: 'existing-study-session',
    recovered: true,
    recoveryIndex: 1,
    currentIndex: 1,
    status: 'active',
    interruptedAt: null,
    updatedAt: 300,
  })

  timestamp = 400
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))
  const record = dispatch.mock.calls
    .map(([action]) => action as AppAction)
    .reverse()
    .find((action) => action.type === 'RECORD_STUDY')
  expect(record?.tracking?.session).toMatchObject({
    id: 'existing-study-session',
    status: 'completed',
    performance: { attempts: 2, correct: 2 },
    adjustments: { mistakeBoost: 0.15, difficultyBoost: 0.1, priority: 1 },
  })
})

test('복원 tail의 지연 복습 앞에는 distinct spacer를 보존한다', async () => {
  const user = userEvent.setup()
  const items = makeItems(8)
  const pending = items[6]!
  const restoredItems = [items[0]!, pending, items[1]!, items[2]!, items[3]!]
  const state = stateWithSession(restoredItems)
  state.mistakes[pending.id] = {
    wrongCount: 2,
    wrongStreak: 2,
    priorityRemaining: 3,
    reviewPending: true,
    reviewSpacingRemaining: 1,
  }
  const dispatch = vi.fn()

  render(
    <StudyView
      items={items}
      state={state}
      dispatch={dispatch}
      speech={null}
      random={() => 0.5}
    />,
  )

  expect(screen.getByText(items[0]!.term)).toBeInTheDocument()
  await waitFor(() =>
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SAVE_STUDY_SESSION',
      level: '기초',
      snapshot: expect.objectContaining({ currentIndex: 0 }),
    })),
  )
  const save = dispatch.mock.calls.find(
    ([action]) => (action as AppAction).type === 'SAVE_STUDY_SESSION',
  )?.[0] as AppAction | undefined
  if (save?.type !== 'SAVE_STUDY_SESSION') throw new Error('Expected session save')
  expect(save.snapshot.queueIds[0]).toBe(items[0]!.id)
  expect(save.snapshot.queueIds[1]).not.toBe(pending.id)
  expect(save.snapshot.queueIds[2]).toBe(pending.id)

  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))

  const spacer = items.find(({ id }) => id === save.snapshot.queueIds[1])
  expect(spacer).toBeDefined()
  expect(spacer!.id).not.toBe(pending.id)
  expect(screen.getByText(spacer!.term)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))

  expect(screen.getByText(pending.term)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: new RegExp(`${pending.term} 카드 뒤집기`) }))
    .toHaveFocus()
})

test('복원 큐에 없던 active priority도 잠긴 현재 카드 뒤에 삽입한다', async () => {
  const items = makeItems(8)
  const state = stateWithSession(items.slice(0, 5))
  const priority = items[6]!
  state.mistakes[priority.id] = {
    wrongCount: 2,
    wrongStreak: 2,
    priorityRemaining: 3,
  }
  const dispatch = vi.fn()

  render(
    <StudyView
      items={items}
      state={state}
      dispatch={dispatch}
      speech={null}
      random={() => 0.5}
    />,
  )

  await waitFor(() => {
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SAVE_STUDY_SESSION',
      level: '기초',
      snapshot: expect.objectContaining({
        queueIds: expect.arrayContaining([priority.id]),
        currentIndex: 0,
      }),
    }))
  })
  const save = dispatch.mock.calls.find(
    ([action]) => (action as AppAction).type === 'SAVE_STUDY_SESSION',
  )?.[0] as AppAction | undefined
  if (save?.type !== 'SAVE_STUDY_SESSION') throw new Error('Expected session save')
  expect(save.snapshot.queueIds[0]).toBe(items[0]!.id)
  expect(save.snapshot.queueIds[1]).toBe(priority.id)
  expect(save.tracking?.queue).toMatchObject({
    mistakeCount: 1,
    priorityCount: 1,
    priorityEntries: [{
      itemId: priority.id,
      priority: 0.3,
      insertedAt: expect.any(Number),
    }],
  })
})

test('정상 카드 진행에서 다음 3슬롯에 예약된 우선 항목은 3에서 2로 줄어든다', async () => {
  const user = userEvent.setup()
  const items = makeItems(3)
  const initial = stateWithSession(items)
  const priority = items[2]!
  initial.mistakes[priority.id] = {
    wrongCount: 2,
    wrongStreak: 2,
    priorityRemaining: 3,
  }

  function StatefulStudy() {
    const [state, dispatch] = useReducer(appReducer, initial)
    return (
      <>
        <span data-testid="priority-remaining">
          {state.mistakes[priority.id]?.priorityRemaining ?? 'resolved'}
        </span>
        <StudyView items={items} state={state} dispatch={dispatch} speech={null} />
      </>
    )
  }

  render(<StatefulStudy />)
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))

  expect(screen.getByTestId('priority-remaining')).toHaveTextContent('2')
  expect(screen.getByText(priority.term)).toBeInTheDocument()
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
      speech={{ speak: vi.fn(), cancel: vi.fn() }}
    />,
  )
  const card = screen.getByRole('button', { name: /기초-word-1 카드 뒤집기/ })
  const detailsId = card.getAttribute('aria-controls')
  const closedDetails = detailsId ? document.getElementById(detailsId) : null

  expect(card).toHaveAttribute('aria-pressed', 'false')
  expect(closedDetails).not.toBeNull()
  expect(closedDetails).toHaveAttribute('hidden')
  expect(screen.getByText('뜻 1')).not.toBeVisible()
  await user.click(card)

  expect(card).toHaveAttribute('aria-pressed', 'true')
  expect(card).toHaveAttribute('aria-expanded', 'true')
  const details = screen.getByRole('region', { name: '기초-word-1 카드 내용' })
  expect(card).toHaveAttribute('aria-controls', details.id)
  expect(details).toBe(closedDetails)
  expect(details).not.toHaveAttribute('hidden')
  expect(card).not.toContainElement(details)
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
  expect(
    screen.getByRole('button', { name: /기초-word-2 카드 뒤집기/ }),
  ).toHaveFocus()
})

test('같은 카드의 회상 버튼이 커밋 전에 두 번 눌려도 한 번만 기록한다', async () => {
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

  await waitFor(() => expect(actionTypes(dispatch)).toContain('SAVE_STUDY_SESSION'))
  const initialSaveCount = dispatch.mock.calls.filter(
    ([action]) => (action as AppAction).type === 'SAVE_STUDY_SESSION',
  ).length

  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  const recall = screen.getByRole('button', { name: '기억했어요' })
  act(() => {
    recall.click()
    recall.click()
  })

  expect(
    dispatch.mock.calls.filter(
      ([action]) => (action as AppAction).type === 'RECORD_STUDY',
    ),
  ).toHaveLength(1)
  expect(
    dispatch.mock.calls.filter(
      ([action]) => (action as AppAction).type === 'SAVE_STUDY_SESSION',
    ),
  ).toHaveLength(initialSaveCount + 1)
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

  expect(dispatch.mock.calls.at(-3)?.[0]).toEqual({
    type: 'ADVANCE_STUDY_SLOT',
    level: '기초',
    itemId: items[0]?.id,
    selectedDifficulty: 'normal',
    itemDifficulty: items[0]?.difficulty,
    priorityItemIds: [],
  })
  expect(dispatch.mock.calls.at(-2)?.[0]).toMatchObject({
    type: 'RECORD_STUDY',
    itemId: items[0]?.id,
    correct: false,
  })
  expect(dispatch.mock.calls.at(-1)?.[0]).toMatchObject({
    type: 'SAVE_STUDY_SESSION',
    snapshot: { currentIndex: 1 },
  })
})

test('회상마다 항목 시간·가중치와 누적 세션을 기록하고 마지막 큐를 완료한다', async () => {
  const user = userEvent.setup()
  const items = makeItems(2)
  const dispatch = vi.fn()
  let timestamp = 1_000

  render(
    <StudyView
      items={items}
      state={stateWithSession(items)}
      dispatch={dispatch}
      speech={null}
      now={() => timestamp}
      grammarReviewItemIds={new Set([items[0]!.id])}
    />,
  )

  await waitFor(() => expect(actionTypes(dispatch)).toContain('SAVE_STUDY_SESSION'))
  timestamp = 1_500
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))

  let records = dispatch.mock.calls
    .map(([action]) => action as AppAction)
    .filter((action) => action.type === 'RECORD_STUDY')
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({
    type: 'RECORD_STUDY',
    itemId: items[0]!.id,
    correct: true,
    tracking: {
      itemKind: 'word',
      itemLevel: '기초',
      occurredAt: 1_500,
      weight: 0.52,
      session: {
        kind: 'study',
        level: '기초',
        startedAt: 1_000,
        endedAt: 1_500,
        durationMs: 500,
        status: 'interrupted',
        performance: { attempts: 1, correct: 1 },
      },
    },
  })
  let saves = dispatch.mock.calls
    .map(([action]) => action as AppAction)
    .filter((action) => action.type === 'SAVE_STUDY_SESSION')
  expect(saves.at(-1)?.tracking?.queue).toMatchObject({
    currentIndex: 1,
    status: 'active',
  })

  timestamp = 2_300
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '다시 볼게요' }))

  records = dispatch.mock.calls
    .map(([action]) => action as AppAction)
    .filter((action) => action.type === 'RECORD_STUDY')
  expect(records).toHaveLength(2)
  expect(records[1]?.tracking?.session).toMatchObject({
    id: records[0]?.tracking?.session?.id,
    startedAt: 1_000,
    endedAt: 2_300,
    durationMs: 1_300,
    status: 'completed',
    performance: { attempts: 2, correct: 1 },
    adjustments: {
      mistakeBoost: 0,
      difficultyBoost: 0.12,
      priority: 0,
    },
  })
  saves = dispatch.mock.calls
    .map(([action]) => action as AppAction)
    .filter((action) => action.type === 'SAVE_STUDY_SESSION')
  expect(saves.at(-1)?.tracking?.queue).toMatchObject({
    currentIndex: 2,
    status: 'completed',
  })
})

test('세션 보정에 schedule·mastery 하향 방향을 음수로 보존한다', async () => {
  const user = userEvent.setup()
  const item = makeItems(1)[0]!
  const state = stateWithSession([item])
  const startedAt = 10 * DAY_MS
  state.mastery[item.id] = {
    attempts: 5,
    correct: 5,
    wrong: 0,
    correctStreak: 5,
    wrongStreak: 0,
  }
  state.tracking.itemSchedule[item.id] = {
    kind: item.kind,
    level: item.level,
    ease: 3,
    lastSeenAt: startedAt,
    nextDueAt: startedAt + 7 * DAY_MS,
    weight: 0,
    lastLevel: item.level,
  }
  const dispatch = vi.fn()
  let timestamp = startedAt
  render(
    <StudyView
      items={[item]}
      state={state}
      dispatch={dispatch}
      speech={null}
      now={() => timestamp}
      random={zeroRandom}
    />,
  )

  await waitFor(() => expect(actionTypes(dispatch)).toContain('SAVE_STUDY_SESSION'))
  timestamp += 1_000
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))

  const record = dispatch.mock.calls
    .map(([action]) => action as AppAction)
    .find((action) => action.type === 'RECORD_STUDY')
  expect(record?.tracking?.session?.adjustments.difficultyBoost).toBeLessThan(0)
})

test('실제 reducer에서 itemSchedule·daily·session·queue 추적 상태를 함께 갱신한다', async () => {
  const user = userEvent.setup()
  const items = makeItems(1)
  const initial = createInitialState()
  let timestamp = 5_000

  function StatefulTrackedStudy() {
    const [state, dispatch] = useReducer(appReducer, initial)
    const activity = Object.values(state.tracking.dailyActivity).reduce(
      (totals, value) => ({
        attempts: totals.attempts + value.attempts,
        correct: totals.correct + value.correct,
      }),
      { attempts: 0, correct: 0 },
    )
    return (
      <>
        <span data-testid="tracked-weight">
          {state.tracking.itemSchedule[items[0]!.id]?.weight ?? 'none'}
        </span>
        <span data-testid="tracked-activity">
          {`${activity.attempts}/${activity.correct}`}
        </span>
        <span data-testid="tracked-session">
          {state.tracking.sessionHistory.at(-1)?.status ?? 'none'}
        </span>
        <span data-testid="tracked-queue">
          {state.tracking.queueHistory.at(-1)?.status ?? 'none'}
        </span>
        <StudyView
          items={items}
          state={state}
          dispatch={dispatch}
          speech={null}
          now={() => timestamp}
        />
      </>
    )
  }

  render(<StatefulTrackedStudy />)
  await waitFor(() => expect(screen.getByTestId('tracked-queue')).toHaveTextContent('active'))
  timestamp = 5_800
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))

  expect(screen.getByTestId('tracked-weight')).toHaveTextContent('0.4')
  expect(screen.getByTestId('tracked-activity')).toHaveTextContent('1/1')
  expect(screen.getByTestId('tracked-session')).toHaveTextContent('completed')
  expect(screen.getByTestId('tracked-queue')).toHaveTextContent('completed')
})

test('마지막 카드 정답은 해소된 오답·우선순위와 완료 큐 감사를 같은 상태로 기록한다', async () => {
  const user = userEvent.setup()
  const item = makeItems(1)[0]!
  const initial = stateWithSession([item])
  initial.mistakes[item.id] = {
    wrongCount: 2,
    wrongStreak: 2,
    priorityRemaining: 3,
  }

  function StatefulFinalRecall() {
    const [state, dispatch] = useReducer(appReducer, initial)
    const queue = state.tracking.queueHistory.at(-1)
    return (
      <>
        <span data-testid="final-mistake">
          {state.mistakes[item.id] ? 'pending' : 'resolved'}
        </span>
        <span data-testid="final-queue-audit">
          {queue
            ? `${queue.status}:${queue.currentIndex}/${queue.queueSize}:${queue.mistakeCount}:${queue.priorityCount}:${queue.priorityEntries.length}`
            : 'none'}
        </span>
        <StudyView items={[item]} state={state} dispatch={dispatch} speech={null} />
      </>
    )
  }

  render(<StatefulFinalRecall />)
  await waitFor(() => expect(screen.getByTestId('final-queue-audit'))
    .toHaveTextContent('active:0/1:1:1:1'))
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))

  expect(screen.getByTestId('final-mistake')).toHaveTextContent('resolved')
  expect(screen.getByTestId('final-queue-audit'))
    .toHaveTextContent('completed:1/1:0:0:0')
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

  await waitFor(() => expect(actionTypes(dispatch)).toContain('SAVE_STUDY_SESSION'))
  dispatch.mockClear()

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
  expect(
    screen.getByRole('group', { name: '학습 난이도' }).querySelectorAll(
      '[aria-pressed="true"]',
    ),
  ).toHaveLength(1)
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
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SAVE_STUDY_SESSION',
      level: '기초',
      snapshot: { queueIds: [items[0]!.id, items[1]!.id], currentIndex: 1 },
    })),
  )
})

test('저장된 초과 큐도 500개로 제한하고 범위 밖 위치를 완료로 보정한다', async () => {
  const dispatch = vi.fn()
  const items = makeItems(600)
  const state = stateWithSession(items, 550)

  render(
    <StudyView items={items} state={state} dispatch={dispatch} speech={null} />,
  )

  expect(screen.getByRole('heading', { name: '학습 세션 완료' })).toBeInTheDocument()
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
  const action = dispatch.mock.calls[0]?.[0] as AppAction
  if (action.type !== 'SAVE_STUDY_SESSION') throw new Error('Expected session save')
  expect(action.snapshot.queueIds).toHaveLength(500)
  expect(action.snapshot.currentIndex).toBe(500)
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
    cancel: vi.fn(),
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

test('이전 카드의 늦은 TTS 실패가 최신 카드의 성공 상태를 덮어쓰지 않는다', async () => {
  const user = userEvent.setup()
  const items = makeItems(2)
  let rejectFirst!: (reason?: unknown) => void
  const firstRequest = new Promise<void>((_resolve, reject) => {
    rejectFirst = reject
  })
  const speech: SpeechPort = {
    speak: vi
      .fn()
      .mockImplementationOnce(() => firstRequest)
      .mockResolvedValueOnce(undefined),
    cancel: vi.fn(),
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
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))
  await user.click(screen.getByRole('button', { name: '기초-word-2 발음 듣기' }))
  expect(screen.queryByText('발음 재생을 지원하지 않는 브라우저입니다.')).not.toBeInTheDocument()

  await act(async () => {
    rejectFirst(new Error('late failure'))
    await Promise.resolve()
  })

  await waitFor(() =>
    expect(
      screen.queryByText('발음 재생을 지원하지 않는 브라우저입니다.'),
    ).not.toBeInTheDocument(),
  )
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

test('오답 review 모드는 정규 세션 snapshot을 덮어쓰지 않고 회상만 기록한다', async () => {
  const user = userEvent.setup()
  const items = makeItems(3)
  const state = stateWithSession(items, 1)
  const originalSnapshot = structuredClone(state.studySessions.기초)
  const dispatch = vi.fn()
  const onExitReview = vi.fn()

  render(
    <StudyView
      items={items}
      state={state}
      dispatch={dispatch}
      speech={null}
      mode="mistakes"
      candidateIds={[items[0]!.id]}
      onExitReview={onExitReview}
      random={zeroRandom}
    />,
  )

  expect(screen.getByText('1 / 1')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '전체 학습으로 돌아가기' })).toBeInTheDocument()
  await waitFor(() => expect(actionTypes(dispatch)).toEqual(['TRACK_STUDY_QUEUE']))
  expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
    type: 'TRACK_STUDY_QUEUE',
    queue: { scope: 'mistakes', status: 'active' },
  })
  dispatch.mockClear()
  await user.click(screen.getByRole('button', { name: '어려움' }))
  expect(actionTypes(dispatch)).toEqual(['TRACK_STUDY_QUEUE'])
  dispatch.mockClear()
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  await user.click(screen.getByRole('button', { name: '기억했어요' }))

  expect(actionTypes(dispatch)).toEqual([
    'ADVANCE_STUDY_SLOT',
    'RECORD_STUDY',
    'TRACK_STUDY_QUEUE',
  ])
  const record = dispatch.mock.calls
    .map(([action]) => action as AppAction)
    .find((action) => action.type === 'RECORD_STUDY')
  if (!record || record.type !== 'RECORD_STUDY') throw new Error('Expected study record')
  expect(record.tracking).toMatchObject({
    itemKind: 'word',
    itemLevel: '기초',
    weight: expect.any(Number),
    session: {
      kind: 'study',
      level: '기초',
      status: 'completed',
      performance: { attempts: 1, correct: 1 },
    },
  })
  expect(actionTypes(dispatch)).not.toContain('SAVE_STUDY_SESSION')
  expect(state.studySessions.기초).toEqual(originalSnapshot)
})

test('exam-density 예외는 막힌 오답을 노출하고 적용 사실을 큐 감사에 남긴다', async () => {
  const item = makeItems(1)[0]!
  const state = createInitialState()
  state.mistakes[item.id] = {
    wrongCount: 1,
    wrongStreak: 1,
    priorityRemaining: 0,
    reviewPending: true,
    reviewSpacingRemaining: 1,
  }
  const dispatch = vi.fn()
  render(
    <StudyView
      items={[item]}
      state={state}
      dispatch={dispatch}
      speech={null}
      mode="mistakes"
      candidateIds={[item.id]}
      onExitReview={vi.fn()}
      spacingPolicy={{
        minimumDistinctItems: 1,
        exceptionPolicy: 'exam-density',
      }}
      random={zeroRandom}
    />,
  )

  expect(screen.getByRole('button', { name: /카드 뒤집기/ })).toBeInTheDocument()
  await waitFor(() => expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
    type: 'TRACK_STUDY_QUEUE',
    queue: {
      orderedItemIds: [item.id],
      spacing: {
        exceptionPolicy: 'exam-density',
        exceptionApplied: true,
        blockedItemIds: [item.id],
      },
    },
  }))
})

test('간격을 채울 다른 카드가 없으면 오답을 노출하지 않고 전체 학습 복귀를 안내한다', async () => {
  const user = userEvent.setup()
  const item = makeItems(1)[0]!
  const state = createInitialState()
  state.mistakes[item.id] = {
    wrongCount: 1,
    wrongStreak: 1,
    priorityRemaining: 0,
    reviewPending: true,
    reviewSpacingRemaining: 1,
  }
  const dispatch = vi.fn()
  const onExitReview = vi.fn()

  render(
    <StudyView
      items={[item]}
      state={state}
      dispatch={dispatch}
      speech={null}
      mode="mistakes"
      candidateIds={[item.id]}
      onExitReview={onExitReview}
      random={zeroRandom}
    />,
  )

  expect(screen.getByRole('heading', { name: '최소 간격 대기 중' })).toBeInTheDocument()
  expect(
    screen.getByText(/전체 학습에서 다른 카드를 먼저 학습해 주세요/),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /카드 뒤집기/ })).not.toBeInTheDocument()
  await waitFor(() => expect(actionTypes(dispatch)).toEqual(['TRACK_STUDY_QUEUE']))
  expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
    type: 'TRACK_STUDY_QUEUE',
    queue: {
      scope: 'mistakes',
      status: 'active',
      orderedItemIds: [],
      spacing: {
        exceptionPolicy: 'strict',
        exceptionApplied: false,
        blockedItemIds: [item.id],
      },
    },
  })

  await user.click(screen.getByRole('button', { name: '전체 학습으로 돌아가기' }))
  expect(onExitReview).toHaveBeenCalledOnce()
})

test('비어 있거나 stale인 오답 review에서도 전체 학습으로 나갈 수 있다', async () => {
  const user = userEvent.setup()
  const onExitReview = vi.fn()
  render(
    <StudyView
      items={makeItems(2)}
      state={createInitialState()}
      dispatch={vi.fn()}
      speech={null}
      mode="mistakes"
      candidateIds={['missing-id']}
      onExitReview={onExitReview}
    />,
  )

  expect(screen.getByText('이 레벨에 학습할 항목이 없습니다.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '전체 학습으로 돌아가기' }))
  expect(onExitReview).toHaveBeenCalledOnce()
})
