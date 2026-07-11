import { GRAMMAR_LEVELS, type GrammarNode } from '../../domain/content/types'
import { GRAMMAR_SECTIONS, type GrammarSection } from '../../state/appState'

interface GrammarViewProps {
  nodes: readonly GrammarNode[]
  grammarSection: GrammarSection
  selectedNodeId: string | null
  onSelectLevel: (section: GrammarSection) => void
  onSelectNode: (node: GrammarNode) => void
}

function percent(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`
}

export function GrammarView({
  nodes,
  grammarSection,
  selectedNodeId,
  onSelectLevel,
  onSelectNode,
}: GrammarViewProps) {
  const selectedNode = selectedNodeId && grammarSection !== '대시보드'
    ? nodes.find(
        ({ id, level }) => id === selectedNodeId && level === grammarSection,
      )
    : undefined
  const selectedIndex = selectedNode
    ? nodes.findIndex(({ id }) => id === selectedNode.id)
    : -1

  return (
    <section
      className="view view--grammar"
      data-state={selectedNode ? 'detail' : 'index'}
      aria-labelledby="grammar-title"
    >
      <header className="feature-header">
        <p className="feature-kicker">42개 핵심 문법 지도</p>
        <h2 id="grammar-title">문법 학습</h2>
      </header>
      <nav className="nav-row grammar-levels" aria-label="문법 레벨">
        {GRAMMAR_SECTIONS.map((section) => (
          <button
            key={section}
            className="nav-chip nav-chip--secondary"
            type="button"
            aria-current={grammarSection === section ? 'page' : undefined}
            data-state={grammarSection === section ? 'active' : 'inactive'}
            onClick={() => onSelectLevel(section)}
          >
            {section}
          </button>
        ))}
      </nav>

      {grammarSection === '대시보드' ? (
        <section className="panel grammar-summary" aria-labelledby="grammar-summary-title">
          <h3 id="grammar-summary-title">{`전체 ${nodes.length}개 노드`}</h3>
          <ul>
            {GRAMMAR_LEVELS.map((level) => (
              <li key={level}>
                {`${level} ${nodes.filter((node) => node.level === level).length}개`}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="grammar-workspace">
          <nav className="grammar-node-nav" aria-label={`${grammarSection} 문법 노드`}>
            {nodes
              .filter(({ level }) => level === grammarSection)
              .map((node) => (
                <button
                  key={node.id}
                  className="grammar-node-button"
                  type="button"
                  aria-current={selectedNode?.id === node.id ? 'page' : undefined}
                  data-state={selectedNode?.id === node.id ? 'active' : 'inactive'}
                  onClick={() => onSelectNode(node)}
                >
                  {`${node.id} ${node.title}`}
                </button>
              ))}
          </nav>

          {selectedNode ? (
            <article className="panel grammar-detail" aria-labelledby="grammar-detail-title">
              <p>{`난이도 태그: ${selectedNode.difficultyTag}`}</p>
              <p>{`선행 노드: ${selectedNode.prerequisite ?? '없음'}`}</p>
              <h3 id="grammar-detail-title">{`${selectedNode.id} ${selectedNode.title}`}</h3>
              <p>{selectedNode.summary}</p>

              <h4>Can-do</h4>
              <ul>
                {selectedNode.canDo.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <h4>패턴</h4>
              <ul>
                {selectedNode.patterns.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <h4>예문</h4>
              <ul>
                {selectedNode.examples.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <h4>오류 코드</h4>
              <ul>
                {selectedNode.errorCodes.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <h4>통과 기준</h4>
              <ul>
                <li>{`정답률 ${percent(selectedNode.masteryRule.quizAccuracy)}`}</li>
                <li>
                  {selectedNode.masteryRule.productionPass
                    ? '생산 과제 통과 필요'
                    : '생산 과제 통과 불필요'}
                </li>
                <li>{`오류 허용 ${percent(selectedNode.masteryRule.errorTolerance)}`}</li>
              </ul>

              <div className="action-row grammar-pager">
                <button
                  type="button"
                  disabled={selectedIndex <= 0}
                  onClick={() => {
                    const previous = nodes[selectedIndex - 1]
                    if (previous) onSelectNode(previous)
                  }}
                >
                  이전 문법
                </button>
                <button
                  type="button"
                  disabled={selectedIndex < 0 || selectedIndex >= nodes.length - 1}
                  onClick={() => {
                    const next = nodes[selectedIndex + 1]
                    if (next) onSelectNode(next)
                  }}
                >
                  다음 문법
                </button>
              </div>
            </article>
          ) : (
            <p className="panel empty-state">문법 노드를 선택하세요.</p>
          )}
        </div>
      )}
    </section>
  )
}
