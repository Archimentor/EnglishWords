import type { Level } from '../domain/content/types'
import { isMastered } from '../domain/progress/mastery'
import type { WordMastery } from '../domain/progress/types'
import type { NavigationState } from '../state/appState'

const TARGET_WORD_COUNTS: Record<Level, number> = {
  기초: 500,
  유치원: 500,
  초등학교: 1_500,
  중학교: 2_500,
}

interface KpiStripProps {
  navigation: NavigationState
  wordIds: readonly string[]
  mastery: Readonly<Record<string, WordMastery>>
}

function currentScreenLabel(navigation: NavigationState): string {
  if (navigation.section === '문법') {
    if (navigation.grammarNodeId) return `문법 ${navigation.grammarNodeId}`
    return `문법 ${navigation.grammarSection}`
  }
  return `${navigation.level} ${navigation.section}`
}

function percentage(value: number): string {
  return `${Number(value.toFixed(1))}%`
}

export function KpiStrip({ navigation, wordIds, mastery }: KpiStripProps) {
  const target = TARGET_WORD_COUNTS[navigation.level]
  const masteredCount = wordIds.filter((id) => {
    const value = mastery[id]
    return value ? isMastered(value) : false
  }).length

  return (
    <section aria-label="학습 현황">
      <p>
        <span>현재 화면</span>{' '}
        <strong>{currentScreenLabel(navigation)}</strong>
      </p>
      <p>
        <span>단어 범위</span>{' '}
        <strong>{`${wordIds.length} / 목표 ${target}`}</strong>
      </p>
      <p>
        <span>목표 대비 완료율</span>{' '}
        <strong>{percentage((masteredCount / target) * 100)}</strong>
      </p>
    </section>
  )
}
