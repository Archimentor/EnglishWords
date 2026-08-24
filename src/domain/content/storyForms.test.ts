import { hasWholeWordForm } from './storyForms'

describe('hasWholeWordForm', () => {
  test('따옴표 안의 단어를 온전한 단어로 인식한다', () => {
    expect(hasWholeWordForm("'Oh,' Mina said.", 'oh')).toBe(true)
    expect(hasWholeWordForm('“Mommy!” the child cried.', 'mommy')).toBe(true)
  })

  test('축약형과 소유격 안쪽의 일부 문자열은 온전한 단어로 보지 않는다', () => {
    expect(hasWholeWordForm("Mina doesn't leave.", 'doesn')).toBe(false)
    expect(hasWholeWordForm("Mina's bag is blue.", 'mina')).toBe(false)
  })
})
