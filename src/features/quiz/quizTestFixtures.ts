import type { StudyItem } from '../../domain/content/types'

export function makeQuizItems(count = 10): StudyItem[] {
  return Array.from({ length: count }, (_, index) => {
    const term = `term${index + 1}`
    const forms = [term, `${term}s`]
    const meanings = [`뜻${index + 1}`]
    const ipa = `/term-${index + 1}/`
    const examples = [`I use ${term} today.`, `The ${term}s are here.`]
    return {
      id: `word-${index + 1}`,
      kind: 'word',
      term,
      lemma: term,
      level: '기초',
      difficulty: index % 2 === 0 ? 'easy' : 'hard',
      partsOfSpeech: ['noun'],
      forms,
      meanings,
      ipa,
      examples,
      entries: [{ partOfSpeech: 'noun', forms, meanings, ipa, examples }],
    }
  })
}
