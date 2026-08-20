export interface SpeechPort {
  speak: (text: string) => void | Promise<void>
  cancel: () => void
}

type SpeechSynthesisPort = Pick<SpeechSynthesis, 'cancel' | 'speak'> &
  Partial<Pick<SpeechSynthesis, 'getVoices'>>

function selectEnglishVoice(
  synthesis: SpeechSynthesisPort,
): SpeechSynthesisVoice | undefined {
  let voices: SpeechSynthesisVoice[]
  try {
    voices = synthesis.getVoices?.() ?? []
  } catch {
    return undefined
  }

  const englishVoices = voices.filter(({ lang }) => /^en(?:[-_]|$)/iu.test(lang))
  return englishVoices.find(({ lang }) => /^en[-_]US$/iu.test(lang))
    ?? englishVoices.find(({ default: isDefault }) => isDefault)
    ?? englishVoices[0]
}

function defaultSynthesis(): SpeechSynthesisPort | undefined {
  return typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis
}

function defaultUtterance(): typeof SpeechSynthesisUtterance | undefined {
  return typeof SpeechSynthesisUtterance === 'undefined'
    ? undefined
    : SpeechSynthesisUtterance
}

export function createBrowserSpeechPort(
  synthesis: SpeechSynthesisPort | undefined = defaultSynthesis(),
  Utterance: typeof SpeechSynthesisUtterance | undefined = defaultUtterance(),
): SpeechPort | null {
  if (!synthesis || !Utterance) return null

  const availableSynthesis = synthesis
  const AvailableUtterance = Utterance

  let cancelPending: (() => void) | null = null

  function cancel(): void {
    availableSynthesis.cancel()
    const pending = cancelPending
    cancelPending = null
    pending?.()
  }

  return {
    cancel,
    speak(text) {
      cancel()

      return new Promise<void>((resolve, reject) => {
        const utterance = new AvailableUtterance(text)
        const voice = selectEnglishVoice(availableSynthesis)
        utterance.lang = voice?.lang || 'en-US'
        if (voice) utterance.voice = voice
        let settled = false

        function finish(error?: Error): void {
          if (settled) return
          settled = true
          if (cancelPending === cancelCurrent) cancelPending = null
          if (error) reject(error)
          else resolve()
        }

        function cancelCurrent(): void {
          finish(new Error('Speech synthesis canceled.'))
        }

        cancelPending = cancelCurrent
        utterance.onend = () => finish()
        utterance.onerror = (event) => {
          finish(new Error(event.error || 'Speech synthesis failed.'))
        }

        try {
          availableSynthesis.speak(utterance)
        } catch (error) {
          finish(
            error instanceof Error
              ? error
              : new Error('Speech synthesis failed.'),
          )
        }
      })
    },
  }
}
