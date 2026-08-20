import { createBrowserSpeechPort } from './speech'

test('브라우저 발음 어댑터는 이전 재생을 취소하고 utterance 종료까지 기다린다', async () => {
  const construct = vi.fn()
  const koreanVoice = { lang: 'ko-KR', default: true } as SpeechSynthesisVoice
  const englishVoice = { lang: 'en-US', default: false } as SpeechSynthesisVoice
  class MockUtterance {
    onend: (() => void) | null = null
    onerror: ((event: { error: string }) => void) | null = null
    lang = ''
    voice: SpeechSynthesisVoice | null = null

    constructor(readonly text: string) {
      construct(text)
    }
  }
  let spoken: MockUtterance | undefined
  const synthesis = {
    cancel: vi.fn(),
    getVoices: vi.fn(() => [koreanVoice, englishVoice]),
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
      spoken = utterance as unknown as MockUtterance
    }),
  }
  const port = createBrowserSpeechPort(
    synthesis,
    MockUtterance as unknown as typeof SpeechSynthesisUtterance,
  )

  const speaking = port?.speak('play')

  expect(synthesis.cancel).toHaveBeenCalledOnce()
  expect(construct).toHaveBeenCalledWith('play')
  expect(synthesis.speak).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'play', lang: 'en-US', voice: englishVoice }),
  )
  spoken?.onend?.()
  await expect(speaking).resolves.toBeUndefined()

  port?.cancel()
  expect(synthesis.cancel).toHaveBeenCalledTimes(2)
})

test('미국 영어 음성이 없으면 다른 영어 음성을 선택하고 영어 언어를 유지한다', async () => {
  const britishVoice = { lang: 'en-GB', default: false } as SpeechSynthesisVoice
  class MockUtterance {
    onend: (() => void) | null = null
    onerror: ((event: { error: string }) => void) | null = null
    lang = ''
    voice: SpeechSynthesisVoice | null = null

    constructor(readonly text: string) {}
  }
  let spoken: MockUtterance | undefined
  const port = createBrowserSpeechPort(
    {
      cancel: vi.fn(),
      getVoices: () => [britishVoice],
      speak: (utterance) => {
        spoken = utterance as unknown as MockUtterance
      },
    },
    MockUtterance as unknown as typeof SpeechSynthesisUtterance,
  )

  const speaking = port?.speak('book')
  expect(spoken).toMatchObject({ lang: 'en-GB', voice: britishVoice })
  spoken?.onend?.()
  await expect(speaking).resolves.toBeUndefined()
})

test('브라우저의 비동기 utterance 오류를 호출자에게 전달한다', async () => {
  class MockUtterance {
    onend: (() => void) | null = null
    onerror: ((event: { error: string }) => void) | null = null

    constructor(readonly text: string) {}
  }
  let spoken: MockUtterance | undefined
  const port = createBrowserSpeechPort(
    {
      cancel: vi.fn(),
      speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
        spoken = utterance as unknown as MockUtterance
      }),
    },
    MockUtterance as unknown as typeof SpeechSynthesisUtterance,
  )

  const speaking = port?.speak('play')
  spoken?.onerror?.({ error: 'audio-busy' })

  await expect(speaking).rejects.toThrow('audio-busy')
})

test('필수 브라우저 API가 없으면 발음 포트를 만들지 않는다', () => {
  expect(createBrowserSpeechPort(undefined, undefined)).toBeNull()
})
