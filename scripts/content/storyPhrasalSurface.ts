import type { PhrasalVerbItem } from '../../src/domain/content/types'
import { formsFor } from './buildWordCatalog'
import { containsPhrasalUse } from './phrasalSource'

export interface DetectedPhrasalUse {
  form: string
  start: number
  end: number
}

const PHRASAL_PARTICLES = new Set([
  'about', 'across', 'after', 'against', 'along', 'around', 'away', 'back',
  'before', 'behind', 'by', 'down', 'for', 'forward', 'in', 'into', 'off',
  'on', 'out', 'over', 'round', 'through', 'to', 'together', 'up', 'with',
])

function lexicalTokens(text: string): Array<{ value: string; index: number; end: number }> {
  return [...text.matchAll(/[A-Za-z]+(?:['’~-][A-Za-z]+)*/gu)].map((match) => ({
    value: match[0],
    index: match.index,
    end: match.index + match[0].length,
  }))
}

export function detectPhrasalUseSurface(
  text: string,
  item: PhrasalVerbItem,
): DetectedPhrasalUse | undefined {
  const rawForms = formsFor(item.baseVerb, 'verb')
  const verbForms = new Set((Array.isArray(rawForms) ? rawForms : Object.values(rawForms))
    .map((form) => form.toLowerCase()))
  const particle = item.particle.toLowerCase()
  const tokens = lexicalTokens(text)
  const candidates: Array<DetectedPhrasalUse & {
    lexicalTokenCount: number
    interveningParticleCount: number
  }> = []
  for (let verbIndex = 0; verbIndex < tokens.length; verbIndex += 1) {
    const verb = tokens[verbIndex]!
    if (!verbForms.has(verb.value.toLowerCase())) continue
    for (
      let particleIndex = verbIndex + 1;
      particleIndex <= Math.min(tokens.length - 1, verbIndex + 4);
      particleIndex += 1
    ) {
      const candidate = tokens[particleIndex]!
      if (candidate.value.toLowerCase() !== particle) continue
      const form = text.slice(verb.index, candidate.end)
      if (/[.!?]|\n\s*\n/u.test(form)) continue
      if (containsPhrasalUse(form, item.phrasalVerb)) {
        candidates.push({
          form,
          start: verb.index,
          end: candidate.end,
          lexicalTokenCount: particleIndex - verbIndex + 1,
          interveningParticleCount: tokens
            .slice(verbIndex + 1, particleIndex)
            .filter(({ value }) => PHRASAL_PARTICLES.has(value.toLowerCase()))
            .length,
        })
      }
    }
  }

  return candidates
    .sort((left, right) =>
      left.interveningParticleCount - right.interveningParticleCount
      || left.lexicalTokenCount - right.lexicalTokenCount
      || left.start - right.start)
    .map(({ form, start, end }) => ({ form, start, end }))[0]
}
