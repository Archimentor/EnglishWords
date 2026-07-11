import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, Level, StudyItem } from '../../domain/content/types'
import { buildStudyQueue } from '../../domain/scheduler/queue'
import type { AppState } from '../../state/appState'
import type { AppAction } from '../../state/appReducer'
import { ProgressBar } from '../../components/ProgressBar'
import { DifficultyPicker } from './DifficultyPicker'
import { Flashcard } from './Flashcard'
import type { SpeechPort } from './speech'

const MAX_SESSION_SIZE = 500
const SPEECH_ERROR = '발음 재생을 지원하지 않는 브라우저입니다.'

interface StudyViewProps {
  items: readonly StudyItem[]
  state: AppState
  dispatch: (action: AppAction) => void
  speech: SpeechPort | null
  random?: () => number
}

interface LocalSession {
  queueIds: string[]
  currentIndex: number
  difficulty: Difficulty
  needsInitialSave: boolean
}

interface RestoredSession {
  queueIds: string[]
  currentIndex: number
  corrected: boolean
}

function uniqueItemsForLevel(
  items: readonly StudyItem[],
  level: Level,
): StudyItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (item.level !== level || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function restoreSnapshot(
  queueIds: readonly string[],
  currentIndex: number,
  validIds: ReadonlySet<string>,
): RestoredSession {
  const seen = new Set<string>()
  const filtered = queueIds.filter((id) => {
    if (!validIds.has(id) || seen.has(id)) return false
    seen.add(id)
    return true
  })

  let restoredIndex = filtered.length
  if (currentIndex < queueIds.length) {
    const currentId = queueIds[currentIndex]
    const currentPosition = currentId ? filtered.indexOf(currentId) : -1
    if (currentPosition >= 0) {
      restoredIndex = currentPosition
    } else {
      for (let index = currentIndex + 1; index < queueIds.length; index += 1) {
        const candidatePosition = filtered.indexOf(queueIds[index] ?? '')
        if (candidatePosition >= 0) {
          restoredIndex = candidatePosition
          break
        }
      }
    }
  }

  return {
    queueIds: filtered,
    currentIndex: restoredIndex,
    corrected: !sameIds(filtered, queueIds) || restoredIndex !== currentIndex,
  }
}

function generateQueue(
  items: readonly StudyItem[],
  state: AppState,
  difficulty: Difficulty,
  random: () => number,
  limit = MAX_SESSION_SIZE,
): string[] {
  return buildStudyQueue(items, {
    selectedDifficulty: difficulty,
    mistakes: state.mistakes,
    difficultyStats: state.difficultyStats,
    limit,
    random,
  }).map(({ id }) => id)
}

function createLocalSession(
  items: readonly StudyItem[],
  state: AppState,
  level: Level,
  random: () => number,
): LocalSession {
  if (items.length === 0) {
    return {
      queueIds: [],
      currentIndex: 0,
      difficulty: state.navigation.studyDifficulty,
      needsInitialSave: false,
    }
  }

  const snapshot = state.studySessions[level]
  if (snapshot) {
    const restored = restoreSnapshot(
      snapshot.queueIds,
      snapshot.currentIndex,
      new Set(items.map(({ id }) => id)),
    )
    if (restored.queueIds.length > 0) {
      return {
        ...restored,
        difficulty: state.navigation.studyDifficulty,
        needsInitialSave: restored.corrected,
      }
    }
  }

  return {
    queueIds: generateQueue(
      items,
      state,
      state.navigation.studyDifficulty,
      random,
    ),
    currentIndex: 0,
    difficulty: state.navigation.studyDifficulty,
    needsInitialSave: true,
  }
}

interface LevelStudyViewProps extends Omit<StudyViewProps, 'items'> {
  items: readonly StudyItem[]
  level: Level
}

function LevelStudyView({
  items,
  level,
  state,
  dispatch,
  speech,
  random = Math.random,
}: LevelStudyViewProps) {
  const [session, setSession] = useState(() =>
    createLocalSession(items, state, level, random),
  )
  const randomRef = useRef(random)
  const [flipped, setFlipped] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const initialSaves = useRef(new Set<string>())
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  )
  const queueItems = session.queueIds
    .map((id) => itemsById.get(id))
    .filter((item): item is StudyItem => item !== undefined)
  const currentItem = queueItems[session.currentIndex]

  useEffect(() => {
    if (!session.needsInitialSave || session.queueIds.length === 0) return
    const signature = `${level}:${session.currentIndex}:${session.queueIds.join('|')}`
    if (initialSaves.current.has(signature)) return
    initialSaves.current.add(signature)
    dispatch({
      type: 'SAVE_STUDY_SESSION',
      level,
      snapshot: {
        queueIds: [...session.queueIds],
        currentIndex: session.currentIndex,
      },
    })
  }, [dispatch, level, session])

  function saveSession(queueIds: readonly string[], currentIndex: number): void {
    dispatch({
      type: 'SAVE_STUDY_SESSION',
      level,
      snapshot: { queueIds: [...queueIds], currentIndex },
    })
  }

  function handleDifficulty(difficulty: Difficulty): void {
    if (difficulty === session.difficulty || !currentItem) return
    const prefix = session.queueIds.slice(0, session.currentIndex + 1)
    const prefixIds = new Set(prefix)
    const remaining = items.filter(({ id }) => !prefixIds.has(id))
    const tail = generateQueue(
      remaining,
      state,
      difficulty,
      randomRef.current,
      Math.max(0, MAX_SESSION_SIZE - prefix.length),
    )
    const queueIds = [...prefix, ...tail]

    dispatch({ type: 'SET_DIFFICULTY', difficulty })
    saveSession(queueIds, session.currentIndex)
    setSession((current) => ({
      ...current,
      queueIds,
      difficulty,
      needsInitialSave: false,
    }))
  }

  function handleRecall(correct: boolean): void {
    if (!currentItem || !flipped) return
    const nextIndex = session.currentIndex + 1

    dispatch({
      type: 'RECORD_STUDY',
      itemId: currentItem.id,
      correct,
    })
    saveSession(session.queueIds, nextIndex)
    setSession((current) => ({
      ...current,
      currentIndex: nextIndex,
      needsInitialSave: false,
    }))
    setFlipped(false)
  }

  async function handleSpeak(): Promise<void> {
    setSpeechError(null)
    if (!speech || !currentItem) {
      setSpeechError(SPEECH_ERROR)
      return
    }

    try {
      await speech.speak(currentItem.term)
    } catch {
      setSpeechError(SPEECH_ERROR)
    }
  }

  function startNewSession(): void {
    const queueIds = generateQueue(
      items,
      state,
      session.difficulty,
      randomRef.current,
    )
    const nextSession: LocalSession = {
      queueIds,
      currentIndex: 0,
      difficulty: session.difficulty,
      needsInitialSave: false,
    }
    setSession(nextSession)
    setFlipped(false)
    saveSession(queueIds, 0)
  }

  if (items.length === 0) {
    return (
      <section>
        <h2>{`${level} 플래시카드 학습`}</h2>
        <p>이 레벨에 학습할 항목이 없습니다.</p>
      </section>
    )
  }

  if (!currentItem) {
    return (
      <section>
        <h2>학습 세션 완료</h2>
        <p>{`${session.queueIds.length}개 항목을 모두 확인했습니다.`}</p>
        <button type="button" onClick={startNewSession}>새 세션 시작</button>
      </section>
    )
  }

  return (
    <section aria-labelledby="study-title">
      <h2 id="study-title">{`${level} 플래시카드 학습`}</h2>
      <ProgressBar
        label="학습 진행"
        value={session.currentIndex + 1}
        max={session.queueIds.length}
        valueText={`${session.currentIndex + 1} / ${session.queueIds.length}`}
      />
      <DifficultyPicker value={session.difficulty} onChange={handleDifficulty} />
      <Flashcard
        item={currentItem}
        flipped={flipped}
        onToggle={() => setFlipped((value) => !value)}
        onSpeak={() => void handleSpeak()}
      />
      {speechError ? <p role="status">{speechError}</p> : null}
      {flipped ? (
        <fieldset>
          <legend>회상 평가</legend>
          <button type="button" onClick={() => handleRecall(true)}>기억했어요</button>
          <button type="button" onClick={() => handleRecall(false)}>다시 볼게요</button>
        </fieldset>
      ) : null}
    </section>
  )
}

export function StudyView({
  items,
  state,
  dispatch,
  speech,
  random,
}: StudyViewProps) {
  const level = state.navigation.level
  const levelItems = uniqueItemsForLevel(items, level)
  const key = `${level}:${levelItems.map(({ id }) => id).join('|')}`
  const sharedProps = { state, dispatch, speech }

  return random ? (
    <LevelStudyView
      key={key}
      {...sharedProps}
      items={levelItems}
      level={level}
      random={random}
    />
  ) : (
    <LevelStudyView
      key={key}
      {...sharedProps}
      items={levelItems}
      level={level}
    />
  )
}
