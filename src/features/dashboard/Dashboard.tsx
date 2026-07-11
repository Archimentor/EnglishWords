import type { Level, RuntimeCatalog } from '../../domain/content/types'
import { isMastered } from '../../domain/progress/mastery'
import type { MistakeRecord, WordMastery } from '../../domain/progress/types'
import { ProgressBar } from '../../components/ProgressBar'

interface LevelTargets {
  words: number
  phrasalVerbs: number
}

interface DashboardProps {
  level: Level
  catalog: RuntimeCatalog
  mastery: Readonly<Record<string, WordMastery>>
  mistakes: Readonly<Record<string, MistakeRecord>>
  targets: LevelTargets
  onStudyMistakes: (ids: readonly string[]) => void
  onQuizMistakes: (ids: readonly string[]) => void
}

function mastered(id: string, mastery: Readonly<Record<string, WordMastery>>): boolean {
  const value = mastery[id]
  return value ? isMastered(value) : false
}

export function Dashboard({
  level,
  catalog,
  mastery,
  mistakes,
  targets,
  onStudyMistakes,
  onQuizMistakes,
}: DashboardProps) {
  const items = catalog.itemsByLevel[level]
  const completedCount = items.filter(({ id }) => mastered(id, mastery)).length
  const mistakeItems = items.filter(({ id }) => (mistakes[id]?.wrongCount ?? 0) > 0)
  const mistakeIds = mistakeItems.map(({ id }) => id)
  const completedWords = items.filter(
    ({ id, kind }) => kind === 'word' && mastered(id, mastery),
  ).length
  const completedPhrasals = items.filter(
    ({ id, kind }) => kind === 'phrasalVerb' && mastered(id, mastery),
  ).length

  return (
    <section className="view view--dashboard" aria-labelledby="dashboard-title">
      <header className="feature-header">
        <p className="feature-kicker">오늘의 학습 현황</p>
        <h2 id="dashboard-title">{`${level} 학습 대시보드`}</h2>
      </header>
      <dl className="metric-grid">
        <div className="metric" data-tone="complete">
          <dt>완료</dt>
          <dd aria-label="완료 항목 수">{`${completedCount}개`}</dd>
        </div>
        <div className="metric" data-tone="remaining">
          <dt>미완료</dt>
          <dd aria-label="미완료 항목 수">{`${items.length - completedCount}개`}</dd>
        </div>
        <div className="metric" data-tone="mistake">
          <dt>오답</dt>
          <dd aria-label="오답 항목 수">{`${mistakeIds.length}개`}</dd>
        </div>
      </dl>

      <div className="dashboard-layout">
        <section className="panel dashboard-progress" aria-label="목표 진행률">
          <ProgressBar
            label="단어 목표 진행"
            value={completedWords}
            max={targets.words}
          />
          <ProgressBar
            label="구동사 목표 진행"
            value={completedPhrasals}
            max={targets.phrasalVerbs}
          />
        </section>

        <section className="panel mistake-panel" aria-labelledby="mistake-title">
          <h3 id="mistake-title">오답 노트</h3>
          {mistakeItems.length === 0 ? (
            <p className="empty-copy">아직 등록된 오답이 없습니다.</p>
          ) : (
            <ul className="mistake-list">
              {mistakeItems.map((item) => (
                <li key={item.id}>
                  <strong>{item.term}</strong> — {item.meanings.join(', ')}
                </li>
              ))}
            </ul>
          )}
          <div className="action-row">
            <button
              type="button"
              disabled={mistakeIds.length === 0}
              onClick={() => onStudyMistakes(mistakeIds)}
            >
              오답 다시 학습
            </button>
            <button
              type="button"
              disabled={mistakeIds.length === 0}
              onClick={() => onQuizMistakes(mistakeIds)}
            >
              오답 퀴즈
            </button>
          </div>
        </section>
      </div>
    </section>
  )
}
