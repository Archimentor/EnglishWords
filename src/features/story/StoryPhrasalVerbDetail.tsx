import { useEffect, useRef, useState } from 'react'
import type { PhrasalVerbItem } from '../../domain/content/types'
import type { SpeechPort } from '../study/speech'

const SPEECH_ERROR = '발음 재생을 지원하지 않는 브라우저입니다.'

interface StoryPhrasalVerbDetailProps {
  item: PhrasalVerbItem
  context: string
  meaningKo: string
  speech: SpeechPort | null
  onClose: () => void
}

export function StoryPhrasalVerbDetail({
  item,
  context,
  meaningKo,
  speech,
  onClose,
}: StoryPhrasalVerbDetailProps) {
  const [speechError, setSpeechError] = useState<string | null>(null)
  const speechRequest = useRef(0)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(
    () => () => {
      speechRequest.current += 1
      speech?.cancel()
    },
    [speech],
  )

  async function handleSpeak(): Promise<void> {
    const request = speechRequest.current + 1
    speechRequest.current = request
    setSpeechError(null)
    if (!speech) {
      setSpeechError(SPEECH_ERROR)
      return
    }
    try {
      await speech.speak(item.phrasalVerb)
    } catch {
      if (speechRequest.current === request) setSpeechError(SPEECH_ERROR)
    }
  }

  return (
    <aside
      id="story-word-detail"
      className="story-word-detail story-word-inspector"
      aria-labelledby="story-word-detail-title"
      aria-live="polite"
    >
      <div className="story-word-detail__header">
        <h3 id="story-word-detail-title">{`${item.phrasalVerb} 구동사 상세`}</h3>
        <button
          ref={closeButtonRef}
          type="button"
          className="button--secondary"
          onClick={onClose}
        >
          닫기
        </button>
      </div>
      <p>품사: 구동사</p>
      <p>{item.ipa}</p>
      <button
        type="button"
        className="button--secondary"
        aria-label={`${item.phrasalVerb} 발음 듣기`}
        onClick={handleSpeak}
      >
        발음 듣기
      </button>
      {speechError ? (
        <p className="inline-status" data-tone="error" role="status">
          {speechError}
        </p>
      ) : null}
      <p>{`표제형: ${item.phrasalVerb}`}</p>
      <h4>본문에서의 뜻</h4>
      <p>{meaningKo}</p>
      <h4>본문 문장</h4>
      <p>{context}</p>
    </aside>
  )
}
