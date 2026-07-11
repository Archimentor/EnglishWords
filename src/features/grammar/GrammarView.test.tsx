import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GrammarNode } from '../../domain/content/types'
import { makeGrammarNodes } from '../../test/fixtures'
import { GrammarView } from './GrammarView'

function grammarNodes(): GrammarNode[] {
  return makeGrammarNodes().map((node) =>
    node.id === 'A2-G01'
      ? {
          ...node,
          title: '미래(will/be going to)',
          summary: '계획과 예측을 구분한다.',
          patterns: ['S + will + V', 'S + be going to + V'],
          examples: ['It will rain.', 'I am going to study.'],
          errorCodes: ['TENSE-20'],
        }
      : node,
  )
}

test('문법 대시보드는 전체 42개와 레벨별 수량을 보여준다', () => {
  render(
    <GrammarView
      nodes={grammarNodes()}
      grammarSection="대시보드"
      selectedNodeId={null}
      onSelectLevel={vi.fn()}
      onSelectNode={vi.fn()}
    />,
  )

  expect(screen.getByText('전체 42개 노드')).toBeInTheDocument()
  expect(screen.getByText('A1 8개')).toBeInTheDocument()
  expect(screen.getByText('A2 9개')).toBeInTheDocument()
  expect(screen.getByText('C1 7개')).toBeInTheDocument()
})

test('레벨과 노드를 선택하고 모든 학습 계약을 상세로 표시한다', async () => {
  const user = userEvent.setup()
  const nodes = grammarNodes()
  const onSelectLevel = vi.fn()
  const onSelectNode = vi.fn()
  const view = render(
    <GrammarView
      nodes={nodes}
      grammarSection="대시보드"
      selectedNodeId={null}
      onSelectLevel={onSelectLevel}
      onSelectNode={onSelectNode}
    />,
  )

  await user.click(
    within(screen.getByRole('navigation', { name: '문법 레벨' })).getByRole(
      'button',
      { name: 'A2' },
    ),
  )
  expect(onSelectLevel).toHaveBeenCalledWith('A2')

  view.rerender(
    <GrammarView
      nodes={nodes}
      grammarSection="A2"
      selectedNodeId={null}
      onSelectLevel={onSelectLevel}
      onSelectNode={onSelectNode}
    />,
  )
  await user.click(screen.getByRole('button', { name: /A2-G01.*미래/ }))
  expect(onSelectNode).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'A2-G01' }),
  )

  view.rerender(
    <GrammarView
      nodes={nodes}
      grammarSection="A2"
      selectedNodeId="A2-G01"
      onSelectLevel={onSelectLevel}
      onSelectNode={onSelectNode}
    />,
  )
  expect(screen.getByRole('heading', { name: /미래/ })).toBeInTheDocument()
  expect(screen.getByText('계획과 예측을 구분한다.')).toBeInTheDocument()
  expect(screen.getByText('S + will + V')).toBeInTheDocument()
  expect(screen.getByText('It will rain.')).toBeInTheDocument()
  expect(screen.getByText('TENSE-20')).toBeInTheDocument()
  expect(screen.getByText(/정답률 80%/)).toBeInTheDocument()
  expect(screen.getByText(/생산 과제 통과 필요/)).toBeInTheDocument()
  expect(screen.getByText(/오류 허용 20%/)).toBeInTheDocument()
})

test('전체 문법 순서로 이전·다음 이동하고 stale 노드는 안전하게 처리한다', async () => {
  const user = userEvent.setup()
  const nodes = grammarNodes()
  const onSelectNode = vi.fn()
  const view = render(
    <GrammarView
      nodes={nodes}
      grammarSection="A1"
      selectedNodeId="A1-G08"
      onSelectLevel={vi.fn()}
      onSelectNode={onSelectNode}
    />,
  )

  await user.click(screen.getByRole('button', { name: '다음 문법' }))
  expect(onSelectNode).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'A2-G01' }),
  )

  view.rerender(
    <GrammarView
      nodes={nodes}
      grammarSection="A2"
      selectedNodeId="삭제된-노드"
      onSelectLevel={vi.fn()}
      onSelectNode={onSelectNode}
    />,
  )
  expect(screen.getByText('문법 노드를 선택하세요.')).toBeInTheDocument()
})
