import { createBrowserSpeechPort } from './speech'

test('브라우저 발음 어댑터는 이전 재생을 취소하고 새 utterance를 말한다', () => {
  const construct = vi.fn()
  class MockUtterance {
    constructor(readonly text: string) {
      construct(text)
    }
  }
  const synthesis = {
    cancel: vi.fn(),
    speak: vi.fn(),
  }
  const port = createBrowserSpeechPort(
    synthesis,
    MockUtterance as unknown as typeof SpeechSynthesisUtterance,
  )

  port?.speak('play')

  expect(synthesis.cancel).toHaveBeenCalledOnce()
  expect(construct).toHaveBeenCalledWith('play')
  expect(synthesis.speak).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'play' }),
  )
})

test('필수 브라우저 API가 없으면 발음 포트를 만들지 않는다', () => {
  expect(createBrowserSpeechPort(undefined, undefined)).toBeNull()
})
