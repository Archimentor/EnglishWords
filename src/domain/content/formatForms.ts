import type { WordEntry } from './types'

const FORM_LABELS: Readonly<Record<string, string>> = {
  base: '기본형',
  firstPerson: '1인칭 단수 현재형',
  s3: '3인칭 단수 현재형',
  presentPlural: '복수 현재형',
  past: '과거형',
  pastVariant: '과거형 변형',
  pastPlural: '복수 과거형',
  participle: '현재분사',
  pastParticiple: '과거분사',
  pastParticipleVariant: '과거분사 변형',
  pastParticipleVariant2: '과거분사 변형 2',
}

export function formatWordForms(forms: WordEntry['forms']): string {
  if (Array.isArray(forms)) return forms.join(', ')

  return Object.entries(forms)
    .map(([key, value]) => `${FORM_LABELS[key] ?? '기타 형태'}: ${value}`)
    .join(', ')
}
