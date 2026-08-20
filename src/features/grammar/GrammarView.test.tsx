import { useReducer, useRef } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GrammarNode } from '../../domain/content/types'
import {
  emptyGrammarMastery,
  type GrammarMastery,
} from '../../domain/grammar/mastery'
import { isGrammarAnswerCorrect } from '../../domain/grammar/grading'
import { appReducer } from '../../state/appReducer'
import { createInitialState } from '../../state/appState'
import {
  makeGrammarNode,
  makeGrammarNodes,
  makeGrammarProductionRecord,
  makeWord,
} from '../../test/fixtures'
import { GrammarView } from './GrammarView'

function grammarNodes(): GrammarNode[] {
  return makeGrammarNodes().map((node) =>
    node.id === 'A1-G01'
      ? {
          ...node,
          title: '문장뼈대(SVC/SVO)',
          summary: '주어, 동사, 목적어와 보어의 자리를 구분한다.',
        }
      : node,
  )
}

function completedMastery(
  overrides: Partial<GrammarMastery> = {},
): GrammarMastery {
  return {
    ...emptyGrammarMastery(),
    attempts: 3,
    correct: 3,
    diagnosticAttempts: 1,
    practiceAttempts: 1,
    rediagnosticAttempts: 1,
    productionAttempts: 1,
    productionPassed: true,
    exerciseResults: {
      diagnostic: { phase: 'diagnostic', correct: true, errorCode: 'ART-01' },
      practice: { phase: 'practice', correct: true, errorCode: 'PREP-01' },
      rediagnostic: { phase: 'rediagnostic', correct: true, errorCode: 'TENSE-01' },
    },
    production: makeGrammarProductionRecord(makeGrammarNode()),
    completed: true,
    ...overrides,
  }
}

function practicedMastery(node: GrammarNode): GrammarMastery {
  const diagnostic = node.exercises.find(({ phase }) => phase === 'diagnostic')!
  const practice = node.exercises.find(({ phase }) => phase === 'practice')!
  return {
    ...emptyGrammarMastery(),
    attempts: 2,
    correct: 2,
    diagnosticAttempts: 1,
    practiceAttempts: 1,
    exerciseResults: {
      [diagnostic.id]: {
        phase: diagnostic.phase,
        correct: true,
        errorCode: diagnostic.errorCode,
      },
      [practice.id]: {
        phase: practice.phase,
        correct: true,
        errorCode: practice.errorCode,
      },
    },
  }
}

function approvedProductionMastery(): GrammarMastery {
  return {
    ...emptyGrammarMastery(),
    productionAttempts: 1,
    productionPassed: true,
    production: makeGrammarProductionRecord(makeGrammarNode()),
  }
}

function GrammarHarness({
  initialMastery = {},
}: {
  initialMastery?: Record<string, GrammarMastery>
}) {
  const nodes = grammarNodes()
  const attemptSequence = useRef(0)
  const [state, dispatch] = useReducer(appReducer, {
    ...createInitialState(),
    grammarMastery: initialMastery,
  })
  return (
    <GrammarView
      nodes={nodes}
      words={[makeWord({
        id: 'word-child',
        word: 'child',
        lemma: 'child',
        level: '기초',
        entryOverrides: { meanings: ['아이'], forms: ['child', 'children'] },
      })]}
      grammarSection="A1"
      selectedNodeId="A1-G01"
      mastery={state.grammarMastery}
      onSelectLevel={vi.fn()}
      onSelectNode={vi.fn()}
      onRecordExercise={(node, exercise, correct) => {
        attemptSequence.current += 1
        dispatch({
          type: 'RECORD_GRAMMAR_EXERCISE',
          nodeId: node.id,
          attempt: {
            attemptId: `${exercise.id}-attempt-${attemptSequence.current}`,
            exerciseId: exercise.id,
            reviewNodeId: node.prerequisite ?? node.id,
            phase: exercise.phase,
            correct,
            errorCode: exercise.errorCode,
          },
          masteryRule: node.masteryRule,
        })
      }}
      onRecordPrerequisiteReview={(node, reviewedNode) => dispatch({
        type: 'RECORD_GRAMMAR_PREREQUISITE_REVIEW',
        nodeId: node.id,
        reviewedNodeId: reviewedNode.id,
        masteryRule: node.masteryRule,
      })}
      onSubmitProduction={(node, submission) => dispatch({
        type: 'SUBMIT_GRAMMAR_PRODUCTION',
        nodeId: node.id,
        submission,
        productionTask: node.productionTask,
        masteryRule: node.masteryRule,
      })}
      onReviewProduction={(node, reviewChecks) => dispatch({
        type: 'REVIEW_GRAMMAR_PRODUCTION',
        nodeId: node.id,
        reviewChecks,
        masteryRule: node.masteryRule,
      })}
    />
  )
}

const noop = vi.fn()

test('문법 예문의 단어장 형태를 레벨과 뜻으로 연결한다', () => {
  render(<GrammarHarness />)

  const links = screen.getByRole('list', { name: '이 문법 노드의 관련 단어' })
  expect(within(links).getByText('child')).toBeInTheDocument()
  expect(within(links).getByText('기초')).toBeInTheDocument()
  expect(within(links).getByText('아이')).toBeInTheDocument()
})

test('문법 대시보드는 전체 숙달도, 레벨별 진도와 오류 집중 항목을 보여준다', () => {
  render(
    <GrammarView
      nodes={grammarNodes()}
      grammarSection="대시보드"
      selectedNodeId={null}
      mastery={{
        'A1-G01': completedMastery({ errorCounts: { 'WO-01': 2 } }),
      }}
      onSelectLevel={noop}
      onSelectNode={noop}
      onRecordExercise={noop}
      onRecordPrerequisiteReview={noop}
      onSubmitProduction={noop}
      onReviewProduction={noop}
    />,
  )

  expect(screen.getByText('전체 42개 중 1개 숙달')).toBeInTheDocument()
  expect(screen.getByText('A1 1/8')).toBeInTheDocument()
  expect(screen.getByText('A2 0/9')).toBeInTheDocument()
  expect(screen.getByText('C1 0/7')).toBeInTheDocument()
  expect(screen.getByText('WO-01 2회')).toBeInTheDocument()
})

test('문법 대시보드 추천은 잠긴 오류 노드 대신 학습 가능한 첫 노드를 선택한다', async () => {
  const user = userEvent.setup()
  const onSelectNode = vi.fn()
  render(
    <GrammarView
      nodes={grammarNodes()}
      grammarSection="대시보드"
      selectedNodeId={null}
      mastery={{
        'A1-G02': {
          ...emptyGrammarMastery(),
          attempts: 9,
          retryCount: 9,
          errorCounts: { 'WO-01': 9 },
        },
      }}
      onSelectLevel={noop}
      onSelectNode={onSelectNode}
      onRecordExercise={noop}
      onRecordPrerequisiteReview={noop}
      onSubmitProduction={noop}
      onReviewProduction={noop}
    />,
  )

  const recommendation = screen.getByRole('button', {
    name: 'A1-G01 추천 학습 선택',
  })
  expect(recommendation).toHaveTextContent('다음 새 학습')
  expect(screen.queryByRole('button', { name: 'A1-G02 추천 학습 선택' }))
    .not.toBeInTheDocument()

  await user.click(recommendation)
  expect(onSelectNode).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'A1-G01' }),
  )
})

test('재진단과 집중 복습 큐를 실제 상태로 만들고 각 노드를 선택할 수 있다', async () => {
  const user = userEvent.setup()
  const onSelectNode = vi.fn()
  const nodes = grammarNodes().slice(0, 2).map((node) => ({
    ...node,
    prerequisite: null,
  }))
  const rediagnosticNode = nodes[1]!
  const rediagnosticMastery: GrammarMastery = {
    ...practicedMastery(rediagnosticNode),
    productionAttempts: 1,
    productionPassed: true,
    production: approvedProductionMastery().production,
    retryCount: 1,
    errorCounts: { 'SV-01': 1 },
  }
  render(
    <GrammarView
      nodes={nodes}
      grammarSection="대시보드"
      selectedNodeId={null}
      mastery={{
        'A1-G01': {
          ...emptyGrammarMastery(),
          attempts: 2,
          retryCount: 2,
          errorCounts: { 'WO-01': 2 },
          mustReview: true,
          reviewRequirement: {
            nodeId: 'A1-G01',
            errorCode: 'WO-01',
            completed: false,
          },
        },
        [rediagnosticNode.id]: rediagnosticMastery,
      }}
      onSelectLevel={noop}
      onSelectNode={onSelectNode}
      onRecordExercise={noop}
      onRecordPrerequisiteReview={noop}
      onSubmitProduction={noop}
      onReviewProduction={noop}
    />,
  )

  expect(screen.getByRole('heading', { name: '재진단 큐 1개' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '집중 복습 큐 1개' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'A1-G01 추천 학습 선택' }))
    .toHaveTextContent('연속 오류 집중 복습')

  await user.click(screen.getByRole('button', { name: 'A1-G02 재진단 선택' }))
  await user.click(screen.getByRole('button', { name: 'A1-G01 집중 복습 선택' }))
  expect(onSelectNode).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ id: 'A1-G02' }),
  )
  expect(onSelectNode).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ id: 'A1-G01' }),
  )
})

test('선행 통과율과 재진단 횟수는 현재 카탈로그만 집계한다', () => {
  render(
    <GrammarView
      nodes={grammarNodes()}
      grammarSection="대시보드"
      selectedNodeId={null}
      mastery={{
        'A1-G01': completedMastery({ rediagnosticAttempts: 3 }),
        'REMOVED-G99': completedMastery({
          rediagnosticAttempts: 99,
          errorCounts: { 'STALE-01': 99 },
        }),
      }}
      onSelectLevel={noop}
      onSelectNode={noop}
      onRecordExercise={noop}
      onRecordPrerequisiteReview={noop}
      onSubmitProduction={noop}
      onReviewProduction={noop}
    />,
  )

  const metrics = screen.getByLabelText('문법 학습 진단 지표')
  expect(metrics).toHaveTextContent('선행노드 통과율 1/41 (2.4%)')
  expect(metrics).toHaveTextContent('재진단 반복 횟수 3회')
  expect(screen.queryByText(/STALE-01/)).not.toBeInTheDocument()
})

test('모든 현재 노드가 숙달되면 더 이상 추천하지 않고 완료 상태를 표시한다', () => {
  const nodes = grammarNodes()
  render(
    <GrammarView
      nodes={nodes}
      grammarSection="대시보드"
      selectedNodeId={null}
      mastery={Object.fromEntries(nodes.map(({ id }) => [id, completedMastery()]))}
      onSelectLevel={noop}
      onSelectNode={noop}
      onRecordExercise={noop}
      onRecordPrerequisiteReview={noop}
      onSubmitProduction={noop}
      onReviewProduction={noop}
    />,
  )

  expect(screen.getByText('모든 문법 학습을 완료했습니다.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /추천 학습 선택/ }))
    .not.toBeInTheDocument()
})

test('선행 노드와 이전 레벨 80% 기준을 충족하기 전에는 노드를 잠근다', async () => {
  const user = userEvent.setup()
  const onSelectNode = vi.fn()
  render(
    <GrammarView
      nodes={grammarNodes()}
      grammarSection="A1"
      selectedNodeId={null}
      mastery={{}}
      onSelectLevel={noop}
      onSelectNode={onSelectNode}
      onRecordExercise={noop}
      onRecordPrerequisiteReview={noop}
      onSubmitProduction={noop}
      onReviewProduction={noop}
    />,
  )

  const first = screen.getByRole('button', { name: /A1-G01.*학습 가능/ })
  const second = screen.getByRole('button', { name: /A1-G02.*잠김/ })
  expect(first).toBeEnabled()
  expect(second).toBeDisabled()

  await user.click(first)
  expect(onSelectNode).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'A1-G01' }),
  )
})

test('상세 화면은 규칙, 번역 예문, 산출 과제와 오류 교정 내용을 모두 표시한다', () => {
  render(<GrammarHarness />)

  expect(screen.getByRole('heading', { name: /A1-G01 문장뼈대/ })).toBeInTheDocument()
  expect(screen.getByText('주어, 동사, 목적어와 보어의 자리를 구분한다.')).toBeInTheDocument()
  expect(screen.getByText('그 아이는 행복하다.')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '문법 개념' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '단계형 학습' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '오답 노트' })).toBeInTheDocument()
  expect(screen.getByText(/산출 과제 통과 필요/)).toBeInTheDocument()
})

test('B2 산출 화면은 서론·근거·반론·결론과 세 개의 복합문 근거를 분리한다', () => {
  const previous = makeGrammarNode({ id: 'B1-G01', level: 'B1' })
  const node = makeGrammarNode({ id: 'B2-G01', level: 'B2' })
  render(
    <GrammarView
      nodes={[previous, node]}
      grammarSection="B2"
      selectedNodeId={node.id}
      mastery={{
        [previous.id]: completedMastery(),
        [node.id]: practicedMastery(node),
      }}
      onSelectLevel={noop}
      onSelectNode={noop}
      onRecordExercise={noop}
      onRecordPrerequisiteReview={noop}
      onSubmitProduction={noop}
      onReviewProduction={noop}
    />,
  )

  for (const part of ['서론', '근거', '반론', '결론']) {
    expect(screen.getByLabelText(`${node.id} ${part} 답안`)).toBeEnabled()
  }
  expect(screen.getAllByLabelText(new RegExp(`${node.id} 필수 근거 1-`)))
    .toHaveLength(3)
  expect(screen.getByText('전체 4문장 이상')).toBeInTheDocument()
})

test('C1 산출 화면은 두 레지스터와 두 번의 교정 한도 뒤 새 사이클을 제공한다', async () => {
  const user = userEvent.setup()
  const previous = makeGrammarNode({ id: 'B2-G01', level: 'B2' })
  const node = makeGrammarNode({ id: 'C1-G01', level: 'C1' })
  const onRestartProduction = vi.fn()
  render(
    <GrammarView
      nodes={[previous, node]}
      grammarSection="C1"
      selectedNodeId={node.id}
      mastery={{
        [previous.id]: completedMastery(),
        [node.id]: {
          ...practicedMastery(node),
          productionAttempts: 3,
          retryCount: 3,
          production: makeGrammarProductionRecord(node, {
            status: 'rejected',
            revisionRound: 2,
            cycleStartAttempt: 1,
          }),
        },
      }}
      onSelectLevel={noop}
      onSelectNode={noop}
      onRecordExercise={noop}
      onRecordPrerequisiteReview={noop}
      onSubmitProduction={noop}
      onReviewProduction={noop}
      onRestartProduction={onRestartProduction}
    />,
  )

  expect(screen.getByLabelText(`${node.id} 업무 이메일 문체 답안`)).toBeDisabled()
  expect(screen.getByLabelText(`${node.id} 학술 단락 문체 답안`)).toBeDisabled()
  expect(screen.getByText(/자체 교정 2회를 모두 사용했습니다/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '새 산출 사이클 시작' }))
  expect(onRestartProduction).toHaveBeenCalledWith(node)
})

test('정답 결과는 같은 문항의 중복 제출을 막고 오답 결과는 수정 제출을 허용한다', async () => {
  const user = userEvent.setup()
  render(<GrammarHarness />)

  const diagnosticForm = screen.getByText('1. 진단').closest('form')!
  await user.click(within(diagnosticForm).getByRole('radio', { name: 'Happy the child is.' }))
  await user.click(within(diagnosticForm).getByRole('button', { name: '채점하기' }))

  const retry = within(diagnosticForm).getByRole('button', { name: '다시 채점하기' })
  expect(retry).toBeDisabled()
  await user.click(within(diagnosticForm).getByRole('radio', { name: 'The child is happy.' }))
  expect(retry).toBeEnabled()
  await user.click(retry)

  expect(within(diagnosticForm).getByRole('button', { name: '채점 완료' })).toBeDisabled()
  expect(within(diagnosticForm).getByText('정답입니다.')).toBeInTheDocument()
})

test('오답을 고쳐 숙달하면 상세 정답률도 최신 문항별 결과로 완료 상태와 일치한다', async () => {
  const user = userEvent.setup()
  const node = grammarNodes()[0]!
  const diagnostic = node.exercises.find(({ phase }) => phase === 'diagnostic')!
  const practice = node.exercises.find(({ phase }) => phase === 'practice')!
  const rediagnostic = node.exercises.find(({ phase }) => phase === 'rediagnostic')!
  const mastery: GrammarMastery = {
    ...emptyGrammarMastery(),
    attempts: 3,
    correct: 2,
    diagnosticAttempts: 1,
    practiceAttempts: 1,
    rediagnosticAttempts: 1,
    productionAttempts: 1,
    productionPassed: true,
    retryCount: 1,
    errorCounts: { [diagnostic.errorCode]: 1 },
    errorStreaks: { [diagnostic.errorCode]: 1 },
    exerciseResults: {
      [`${diagnostic.id}-prior-wrong`]: {
        exerciseId: diagnostic.id,
        phase: diagnostic.phase,
        correct: false,
        errorCode: diagnostic.errorCode,
      },
      [practice.id]: {
        phase: practice.phase,
        correct: true,
        errorCode: practice.errorCode,
      },
      [rediagnostic.id]: {
        phase: rediagnostic.phase,
        correct: true,
        errorCode: rediagnostic.errorCode,
      },
    },
    production: makeGrammarProductionRecord(node),
  }
  render(<GrammarHarness initialMastery={{ [node.id]: mastery }} />)

  const diagnosticForm = screen.getByText('1. 진단').closest('form')!
  await user.click(within(diagnosticForm).getByRole('radio', {
    name: 'The child is happy.',
  }))
  await user.click(within(diagnosticForm).getByRole('button', {
    name: '다시 채점하기',
  }))

  expect(screen.getByText('숙달 완료')).toBeInTheDocument()
  expect(screen.getByText('정답률: 100%')).toBeInTheDocument()
})

test('서로 다른 노드가 같은 문항 ID를 써도 답안과 채점 피드백을 공유하지 않는다', async () => {
  const user = userEvent.setup()
  const nodes = grammarNodes().map((node) => (
    node.id === 'A1-G01' || node.id === 'A1-G02'
      ? {
          ...node,
          exercises: node.exercises.map((exercise) => (
            exercise.phase === 'diagnostic'
              ? { ...exercise, id: 'shared-diagnostic' }
              : exercise
          )),
        }
      : node
  ))
  const mastery = { 'A1-G01': completedMastery() }
  const commonProps = {
    nodes,
    grammarSection: 'A1' as const,
    mastery,
    onSelectLevel: noop,
    onSelectNode: noop,
    onRecordExercise: noop,
    onRecordPrerequisiteReview: noop,
    onSubmitProduction: noop,
    onReviewProduction: noop,
  }
  const { rerender } = render(
    <GrammarView {...commonProps} selectedNodeId="A1-G01" />,
  )

  const firstDiagnostic = screen.getByText('1. 진단').closest('form')!
  await user.click(
    within(firstDiagnostic).getByRole('radio', { name: 'The child is happy.' }),
  )
  await user.click(within(firstDiagnostic).getByRole('button', { name: '채점하기' }))
  expect(within(firstDiagnostic).getByText('정답입니다.')).toBeInTheDocument()

  rerender(<GrammarView {...commonProps} selectedNodeId="A1-G02" />)

  const secondDiagnostic = screen.getByText('1. 진단').closest('form')!
  expect(
    within(secondDiagnostic).getByRole('radio', { name: 'The child is happy.' }),
  ).not.toBeChecked()
  expect(within(secondDiagnostic).queryByText('정답입니다.')).not.toBeInTheDocument()
  expect(within(secondDiagnostic).getByRole('button', { name: '채점하기' })).toBeDisabled()
})

test('산출 과제는 근거 제출 후 검토 대기하며, 거절 수정과 명시적 승인 뒤에만 재진단을 연다', async () => {
  const user = userEvent.setup()
  render(<GrammarHarness />)

  expect(screen.getByLabelText('A1-G01 2. 학습·변형 연습 답안')).toBeDisabled()
  await user.click(screen.getByRole('radio', { name: 'The child is happy.' }))
  await user.click(screen.getByRole('button', { name: '채점하기' }))

  const practice = screen.getByLabelText('A1-G01 2. 학습·변형 연습 답안')
  await user.type(practice, 'the child is happy')
  await user.click(
    within(practice.closest('form')!).getByRole('button', { name: '채점하기' }),
  )

  const production = screen.getByLabelText('A1-G01 산출 과제 답안')
  await user.type(
    production,
    'The child is very happy. She plays a fun game. Her friend smiles today. They walk home together.',
  )
  for (const evidence of screen.getAllByLabelText(/A1-G01 필수 근거/)) {
    await user.selectOptions(evidence, '["response",0]')
  }
  for (const [index, evidence] of screen
    .getAllByLabelText(/A1-G01 루브릭 근거/)
    .entries()) {
    await user.selectOptions(evidence, `["response",${index}]`)
  }
  await user.click(screen.getByRole('button', { name: '산출 과제 제출' }))

  expect(screen.getByText(/산출 과제가 검토 대기 중입니다/)).toBeInTheDocument()
  const rediagnostic = screen.getByLabelText('A1-G01 4. 재진단 답안')
  expect(rediagnostic).toBeDisabled()

  await user.selectOptions(screen.getByLabelText('A1-G01 루브릭 검토 1'), 'met')
  await user.selectOptions(screen.getByLabelText('A1-G01 루브릭 검토 2'), 'revise')
  await user.selectOptions(screen.getByLabelText('A1-G01 루브릭 검토 3'), 'met')
  for (const check of screen.getAllByLabelText(/A1-G01 필수 요건 검토/)) {
    await user.selectOptions(check, 'met')
  }
  await user.click(screen.getByRole('button', { name: '루브릭 검토 저장' }))

  expect(screen.getByText(/루브릭 검토 결과 수정이 필요합니다/)).toBeInTheDocument()
  expect(rediagnostic).toBeDisabled()
  await user.type(production, ' The team learns together.')
  await user.click(screen.getByRole('button', { name: '산출 과제 다시 제출' }))
  await user.selectOptions(screen.getByLabelText('A1-G01 루브릭 검토 1'), 'met')
  await user.selectOptions(screen.getByLabelText('A1-G01 루브릭 검토 2'), 'met')
  await user.selectOptions(screen.getByLabelText('A1-G01 루브릭 검토 3'), 'met')
  for (const check of screen.getAllByLabelText(/A1-G01 필수 요건 검토/)) {
    await user.selectOptions(check, 'met')
  }
  await user.click(screen.getByRole('button', { name: '루브릭 검토 저장' }))

  expect(screen.getByText(/산출 과제 검토가 승인되었습니다/)).toBeInTheDocument()
  expect(rediagnostic).toBeEnabled()
  await user.type(rediagnostic, 'The child plays a game.')
  await user.click(
    within(rediagnostic.closest('form')!).getByRole('button', { name: '채점하기' }),
  )

  expect(screen.getByText('숙달 완료')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /A1-G02.*학습 가능/ })).toBeEnabled()
}, 20_000)

test('빈약한 네 문장은 루브릭 근거를 골라도 산출 기록으로 제출하지 않는다', async () => {
  const user = userEvent.setup()
  const nodes = grammarNodes()
  const node = nodes[0]!
  const onSubmitProduction = vi.fn()
  render(
    <GrammarView
      nodes={nodes}
      grammarSection="A1"
      selectedNodeId={node.id}
      mastery={{ [node.id]: practicedMastery(node) }}
      onSelectLevel={noop}
      onSelectNode={noop}
      onRecordExercise={noop}
      onRecordPrerequisiteReview={noop}
      onSubmitProduction={onSubmitProduction}
      onReviewProduction={noop}
    />,
  )

  await user.type(screen.getByLabelText('A1-G01 산출 과제 답안'), 'x. x. x. x.')
  for (const evidence of screen.getAllByLabelText(/A1-G01 필수 근거/)) {
    await user.selectOptions(evidence, '["response",0]')
  }
  for (const [index, evidence] of screen
    .getAllByLabelText(/A1-G01 루브릭 근거/)
    .entries()) {
    await user.selectOptions(evidence, `["response",${index}]`)
  }
  await user.click(screen.getByRole('button', { name: '산출 과제 제출' }))

  expect(onSubmitProduction).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('세 단어 이상')
})

test('같은 오류가 두 번 이어지면 지정된 자기 규칙을 보여주고 복습 기록 전에는 재진단을 막는다', async () => {
  const user = userEvent.setup()
  render(
    <GrammarHarness
      initialMastery={{ 'A1-G01': approvedProductionMastery() }}
    />,
  )

  const diagnostic = screen.getByText('1. 진단').closest('form')!
  await user.click(within(diagnostic).getByRole('radio', { name: 'Happy the child is.' }))
  await user.click(within(diagnostic).getByRole('button', { name: '채점하기' }))

  const practice = screen.getByLabelText('A1-G01 2. 학습·변형 연습 답안')
  await user.type(practice, 'wrong answer')
  await user.click(
    within(practice.closest('form')!).getByRole('button', { name: '채점하기' }),
  )

  expect(screen.getByRole('heading', { name: /A1-G01.*집중 복습/ })).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(
    'WO-01 오류가 두 번 연속 발생했습니다',
  )
  expect(screen.getByText(/복습 완료가 기록되기 전에는 재진단할 수 없습니다/))
    .toBeInTheDocument()
  const rediagnostic = screen.getByLabelText('A1-G01 4. 재진단 답안')
  expect(rediagnostic).toBeDisabled()

  await user.click(screen.getByRole('button', { name: '복습 완료 기록' }))
  expect(screen.getByText('지정된 규칙의 복습 완료가 기록되었습니다.')).toBeInTheDocument()
  expect(rediagnostic).toBeEnabled()
})

test('80% 레벨 숙달과 실제 범주 정확도를 충족하면 마지막 선행 노드 완료 없이 다음 레벨 이동을 연다', async () => {
  const user = userEvent.setup()
  const nodes = grammarNodes()
  const mastery = Object.fromEntries(
    ['A1-G01', 'A1-G02', 'A1-G03', 'A1-G04', 'A1-G05', 'A1-G06', 'A1-G07'].map(
      (id) => [id, completedMastery()],
    ),
  )
  const onSelectNode = vi.fn()
  render(
    <GrammarView
      nodes={nodes}
      grammarSection="A1"
      selectedNodeId="A1-G08"
      mastery={mastery}
      onSelectLevel={noop}
      onSelectNode={onSelectNode}
      onRecordExercise={noop}
      onRecordPrerequisiteReview={noop}
      onSubmitProduction={noop}
      onReviewProduction={noop}
    />,
  )

  const next = screen.getByRole('button', { name: '다음 문법' })
  expect(next).toBeEnabled()
  await user.click(next)
  expect(onSelectNode).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'A2-G01' }),
  )
})

test('stale 노드는 상세 대신 안전한 선택 안내를 표시한다', () => {
  render(
    <GrammarView
      nodes={grammarNodes()}
      grammarSection="A2"
      selectedNodeId="삭제된-노드"
      mastery={{}}
      onSelectLevel={noop}
      onSelectNode={noop}
      onRecordExercise={noop}
      onRecordPrerequisiteReview={noop}
      onSubmitProduction={noop}
      onReviewProduction={noop}
    />,
  )

  expect(screen.getByText('학습 가능한 문법 노드를 선택하세요.')).toBeInTheDocument()
})

test('채점은 대소문자, 끝 문장부호와 공백 차이를 허용한다', () => {
  expect(isGrammarAnswerCorrect('  THE   CHILD IS HAPPY! ', 'The child is happy.')).toBe(true)
  expect(isGrammarAnswerCorrect('The child happy.', 'The child is happy.')).toBe(false)
})
