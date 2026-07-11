export interface SpeechPort {
  speak: (text: string) => void | Promise<void>
}

type SpeechSynthesisPort = Pick<SpeechSynthesis, 'cancel' | 'speak'>

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

  return {
    speak(text) {
      synthesis.cancel()
      synthesis.speak(new Utterance(text))
    },
  }
}
