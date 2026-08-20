import { useEffect, useState } from 'react'
import {
  DIFFICULTIES,
  type Difficulty,
  type Level,
  type RuntimeCatalog,
} from '../../domain/content/types'
import { isMastered } from '../../domain/progress/mastery'
import type {
  DifficultyStats,
  LevelStudyAnalytics,
  MistakeRecord,
  WordMastery,
} from '../../domain/progress/types'
import {
  difficultyCalibrationMetrics,
  learnerSummaryMetrics,
  levelSessionCount,
  queueHealthMetrics,
  quizTypeOperationalMetrics,
} from '../../domain/progress/analytics'
import {
  createEmptyTrackingState,
  type TrackingState,
} from '../../domain/progress/tracking'
import { ProgressBar } from '../../components/ProgressBar'
import { QUIZ_TYPE_LABELS } from '../quiz/quizLabels'

interface LevelTargets {
  words: number
  phrasalVerbs: number
}

interface DashboardProps {
  level: Level
  catalog: RuntimeCatalog
  mastery: Readonly<Record<string, WordMastery>>
  mistakes: Readonly<Record<string, MistakeRecord>>
  studyAnalytics: LevelStudyAnalytics
  difficultyStats: Readonly<Record<Difficulty, DifficultyStats>>
  tracking?: TrackingState
  now?: number
  targets: LevelTargets
  onStudyMistakes: (ids: readonly string[]) => void
  onQuizMistakes: (ids: readonly string[]) => void
}

type CompletionFilter = 'completed' | 'incomplete'
const COMPLETION_PAGE_SIZE = 50
const DEFAULT_DASHBOARD_NOW = Date.now()
const DASHBOARD_REFRESH_INTERVAL_MS = 60_000

function useDashboardNow(explicitNow: number | undefined): number {
  const [liveNow, setLiveNow] = useState(DEFAULT_DASHBOARD_NOW)

  useEffect(() => {
    if (explicitNow !== undefined) return
    const intervalId = window.setInterval(() => {
      setLiveNow(Date.now())
    }, DASHBOARD_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [explicitNow])

  return explicitNow ?? liveNow
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function duration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0초'
  const seconds = Math.round(milliseconds / 1_000)
  if (seconds < 60) return `${seconds}초`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder === 0 ? `${minutes}분` : `${minutes}분 ${remainder}초`
}

function dateTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
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
  studyAnalytics,
  difficultyStats,
  tracking = createEmptyTrackingState(),
  now,
  targets,
  onStudyMistakes,
  onQuizMistakes,
}: DashboardProps) {
  const dashboardNow = useDashboardNow(now)
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>('incomplete')
  const [visibleCompletionCount, setVisibleCompletionCount] = useState(COMPLETION_PAGE_SIZE)
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
  const totalSelections = Object.values(studyAnalytics.selectedDifficulty)
    .reduce((total, count) => total + count, 0)
  const totalWrongReexposures = Object.values(studyAnalytics.wrongReexposures)
    .reduce((total, count) => total + count, 0)
  const completionItems = items.filter(({ id }) =>
    completionFilter === 'completed' ? mastered(id, mastery) : !mastered(id, mastery))
  const visibleCompletionItems = completionItems.slice(0, visibleCompletionCount)
  const summary = learnerSummaryMetrics(tracking, level, dashboardNow)
  const sessionCount = levelSessionCount(tracking, level)
  const calibration = difficultyCalibrationMetrics(studyAnalytics, difficultyStats)
  const typeMetrics = quizTypeOperationalMetrics(tracking, level)
  const levelItemIds = new Set(items.map(({ id }) => id))
  const queueHealth = queueHealthMetrics(
    tracking,
    mistakes,
    level,
    levelItemIds,
    dashboardNow,
  )
  const totalExposures = Object.values(studyAnalytics.exposedDifficulty)
    .reduce((total, count) => total + count, 0)
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const scheduleRows = Object.entries(tracking.itemSchedule)
    .filter(([itemId, schedule]) => levelItemIds.has(itemId) && schedule.level === level)
    .sort((left, right) => (
      left[1].nextDueAt - right[1].nextDueAt || left[0].localeCompare(right[0])
    ))
    .slice(0, 20)
  const sessionRows = tracking.sessionHistory
    .filter((session) => session.level === level)
    .slice(-10)
    .reverse()
  const queueRows = tracking.queueHistory
    .filter((queue) => queue.level === level)
    .slice(-5)
    .reverse()

  const difficultyLabels: Record<Difficulty, string> = {
    veryEasy: '아주쉬움',
    easy: '쉬움',
    normal: '보통',
    hard: '어려움',
    veryHard: '아주어려움',
  }

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
        <div className="metric">
          <dt>연속 학습</dt>
          <dd aria-label="현재 연속 학습일">{`${summary.currentStreakDays}일`}</dd>
        </div>
        <div className="metric">
          <dt>최근 7일 학습률</dt>
          <dd aria-label="최근 7일 학습률">{percent(summary.recentActivityRate)}</dd>
        </div>
        <div className="metric">
          <dt>전체 정답률</dt>
          <dd aria-label="전체 정답률">{percent(summary.overallAccuracy)}</dd>
        </div>
        <div className="metric">
          <dt>미완료 큐</dt>
          <dd aria-label="미완료 큐 크기">{`${summary.incompleteQueueSize}개`}</dd>
        </div>
      </dl>

      <div className="dashboard-layout">
        <section className="panel dashboard-progress" aria-label="목표 진행률">
          <p>{`누적 세션 ${sessionCount}회`}</p>
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

        <section className="panel completion-panel" aria-labelledby="completion-title">
          <h3 id="completion-title">완료·미완료 항목</h3>
          <div className="action-row" role="group" aria-label="암기 상태 필터">
            {(['incomplete', 'completed'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={completionFilter === filter}
                onClick={() => {
                  setCompletionFilter(filter)
                  setVisibleCompletionCount(COMPLETION_PAGE_SIZE)
                }}
              >
                {filter === 'completed'
                  ? `완료 ${completedCount}개`
                  : `미완료 ${items.length - completedCount}개`}
              </button>
            ))}
          </div>
          {visibleCompletionItems.length === 0 ? (
            <p className="empty-copy">해당 상태의 항목이 없습니다.</p>
          ) : (
            <ul
              className="completion-list"
              aria-label={completionFilter === 'completed' ? '완료 항목 목록' : '미완료 항목 목록'}
            >
              {visibleCompletionItems.map((item) => (
                <li key={item.id}>
                  <strong>{item.term}</strong>
                  <span>{item.kind === 'phrasalVerb' ? '구동사' : '일반 단어'}</span>
                  <span>{item.meanings.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
          {visibleCompletionItems.length < completionItems.length ? (
            <button
              type="button"
              onClick={() => setVisibleCompletionCount((count) =>
                Math.min(count + COMPLETION_PAGE_SIZE, completionItems.length))}
            >
              {`더 보기 (${completionItems.length - visibleCompletionItems.length}개 남음)`}
            </button>
          ) : null}
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

        <section className="panel analytics-panel" aria-labelledby="analytics-title">
          <h3 id="analytics-title">학습 분석</h3>
          <p>{`오답 재노출 ${totalWrongReexposures}회`}</p>
          <div
            className="table-scroll"
            role="region"
            tabIndex={0}
            aria-label="난이도별 학습 분석 표"
          >
            <table className="word-table analytics-table">
              <thead>
                <tr>
                  <th scope="col">난이도</th>
                  <th scope="col">선택 비율</th>
                  <th scope="col">실제 노출</th>
                  <th scope="col">퀴즈 정답률</th>
                  <th scope="col">선택-정답 편차</th>
                  <th scope="col">노출 비율</th>
                </tr>
              </thead>
              <tbody>
                {DIFFICULTIES.map((difficulty) => {
                  const quiz = difficultyStats[difficulty]
                  const selected = studyAnalytics.selectedDifficulty[difficulty]
                  const selectedRate = totalSelections === 0
                    ? 0
                    : Math.round((selected / totalSelections) * 100)
                  const quizAccuracy = quiz.attempts === 0
                    ? 0
                    : Math.round((quiz.correct / quiz.attempts) * 100)
                  const exposed = studyAnalytics.exposedDifficulty[difficulty]
                  const exposedRate = totalExposures === 0
                    ? 0
                    : Math.round((exposed / totalExposures) * 100)
                  const gap = calibration.find((metric) => (
                    metric.difficulty === difficulty
                  ))?.selectionAccuracyGap ?? 0
                  return (
                    <tr key={difficulty}>
                      <th scope="row">{difficultyLabels[difficulty]}</th>
                      <td>{`${selectedRate}% (${selected}회)`}</td>
                      <td>{`${exposed}회`}</td>
                      <td>{`${quizAccuracy}% (${quiz.correct}/${quiz.attempts})`}</td>
                      <td>{`${gap >= 0 ? '+' : ''}${Math.round(gap * 100)}%p`}</td>
                      <td>{`${exposedRate}%`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel analytics-panel" aria-labelledby="quiz-operation-title">
          <h3 id="quiz-operation-title">퀴즈 유형별 운영 지표</h3>
          <div
            className="table-scroll"
            role="region"
            tabIndex={0}
            aria-label="퀴즈 유형별 운영 지표 표"
          >
            <table className="word-table analytics-table">
              <thead>
                <tr>
                  <th scope="col">유형</th>
                  <th scope="col">정확도</th>
                  <th scope="col">평균 반응</th>
                  <th scope="col">재출제 효율</th>
                  <th scope="col">연속 오답률</th>
                  <th scope="col">평균 보정</th>
                </tr>
              </thead>
              <tbody>
                {typeMetrics.map((metric) => (
                  <tr key={metric.type}>
                    <th scope="row">{QUIZ_TYPE_LABELS[metric.type]}</th>
                    <td>{`${percent(metric.accuracy)} (${metric.attempts}회)`}</td>
                    <td>{duration(metric.averageAnswerTimeMs)}</td>
                    <td>{percent(metric.reexposureEfficiency)}</td>
                    <td>{percent(metric.wrongRunRate)}</td>
                    <td>{metric.averageAdjustment.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel analytics-panel" aria-labelledby="queue-health-title">
          <h3 id="queue-health-title">큐 건강도</h3>
          <dl className="metric-grid metric-grid--compact">
            <div className="metric">
              <dt>mistakeBankRatio</dt>
              <dd>{percent(queueHealth.mistakeBankRatio)}</dd>
            </div>
            <div className="metric">
              <dt>prioritySaturation</dt>
              <dd>{percent(queueHealth.prioritySaturation)}</dd>
            </div>
            <div className="metric">
              <dt>overdueItems</dt>
              <dd>{`${queueHealth.overdueItems}개`}</dd>
            </div>
          </dl>
        </section>

        <section className="panel analytics-panel" aria-labelledby="schedule-title">
          <h3 id="schedule-title">항목별 복습 일정</h3>
          {scheduleRows.length === 0 ? (
            <p className="empty-copy">기록된 복습 일정이 없습니다.</p>
          ) : (
            <div className="table-scroll" role="region" tabIndex={0} aria-label="항목별 복습 일정 표">
              <table className="word-table analytics-table">
                <thead>
                  <tr>
                    <th scope="col">항목</th>
                    <th scope="col">ease</th>
                    <th scope="col">마지막 학습</th>
                    <th scope="col">다음 복습</th>
                    <th scope="col">weight</th>
                    <th scope="col">최근 레벨</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleRows.map(([itemId, schedule]) => (
                    <tr key={itemId}>
                      <th scope="row">{itemsById.get(itemId)?.term ?? itemId}</th>
                      <td>{schedule.ease.toFixed(2)}</td>
                      <td>{dateTime(schedule.lastSeenAt)}</td>
                      <td>{dateTime(schedule.nextDueAt)}</td>
                      <td>{schedule.weight.toFixed(2)}</td>
                      <td>{schedule.lastLevel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel analytics-panel" aria-labelledby="session-history-title">
          <h3 id="session-history-title">최근 세션 이력</h3>
          {sessionRows.length === 0 ? (
            <p className="empty-copy">완료되거나 중단된 세션이 없습니다.</p>
          ) : (
            <div className="table-scroll" role="region" tabIndex={0} aria-label="최근 세션 이력 표">
              <table className="word-table analytics-table">
                <thead>
                  <tr>
                    <th scope="col">종류</th>
                    <th scope="col">상태</th>
                    <th scope="col">종료</th>
                    <th scope="col">소요시간</th>
                    <th scope="col">성과</th>
                    <th scope="col">보정 합계</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionRows.map((session) => (
                    <tr key={session.id}>
                      <th scope="row">{session.kind}</th>
                      <td>{session.status}</td>
                      <td>{dateTime(session.endedAt)}</td>
                      <td>{duration(session.durationMs)}</td>
                      <td>{`${session.performance.correct}/${session.performance.attempts}`}</td>
                      <td>{(
                        session.adjustments.mistakeBoost +
                        session.adjustments.difficultyBoost +
                        session.adjustments.priority
                      ).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel analytics-panel" aria-labelledby="queue-history-title">
          <h3 id="queue-history-title">최근 큐 생성·복구 이력</h3>
          {queueRows.length === 0 ? (
            <p className="empty-copy">생성된 학습 큐가 없습니다.</p>
          ) : (
            <div className="table-scroll" role="region" tabIndex={0} aria-label="최근 큐 이력 표">
              <table className="word-table analytics-table">
                <thead>
                  <tr>
                    <th scope="col">생성</th>
                    <th scope="col">상태</th>
                    <th scope="col">난이도</th>
                    <th scope="col">진행/복구</th>
                    <th scope="col">우선 항목</th>
                    <th scope="col">평균 가중치</th>
                  </tr>
                </thead>
                <tbody>
                  {queueRows.map((queue) => (
                    <tr key={queue.id}>
                      <th scope="row">{dateTime(queue.generatedAt)}</th>
                      <td>{queue.status}</td>
                      <td>{difficultyLabels[queue.selectedDifficulty]}</td>
                      <td>{`${queue.currentIndex}/${queue.queueSize} · ${queue.recovered ? `복구 ${queue.recoveryIndex}` : '신규'}`}</td>
                      <td>{`${queue.priorityCount}개`}</td>
                      <td>{queue.exposureComponents.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
