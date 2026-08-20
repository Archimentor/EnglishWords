import { formatWordForms } from './formatForms'

describe('formatWordForms', () => {
  it('joins unlabelled forms in source order', () => {
    expect(formatWordForms(['answer', 'answers'])).toBe('answer, answers')
  })

  it('presents morphology keys with learner-facing Korean labels', () => {
    expect(formatWordForms({
      base: 'play',
      s3: 'plays',
      past: 'played',
      participle: 'playing',
      pastParticiple: 'played',
    })).toBe(
      '기본형: play, 3인칭 단수 현재형: plays, 과거형: played, '
        + '현재분사: playing, 과거분사: played',
    )
  })

  it('does not expose an unknown internal source key', () => {
    expect(formatWordForms({ sourceSpecificKey: 'variant' })).toBe('기타 형태: variant')
  })

  it('labels every morphology key currently emitted by the catalog', () => {
    const rendered = formatWordForms({
      base: 'base',
      firstPerson: 'firstPerson',
      s3: 's3',
      presentPlural: 'presentPlural',
      past: 'past',
      pastVariant: 'pastVariant',
      pastPlural: 'pastPlural',
      participle: 'participle',
      pastParticiple: 'pastParticiple',
      pastParticipleVariant: 'pastParticipleVariant',
      pastParticipleVariant2: 'pastParticipleVariant2',
    })

    expect(rendered).not.toContain('기타 형태')
    expect(rendered).toContain('1인칭 단수 현재형: firstPerson')
    expect(rendered).toContain('과거형 변형: pastVariant')
    expect(rendered).toContain('과거분사 변형 2: pastParticipleVariant2')
  })
})
