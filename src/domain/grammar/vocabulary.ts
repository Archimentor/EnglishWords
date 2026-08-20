import type { GrammarNode, WordItem } from '../content/types'
import { grammarAccuracy, type GrammarMastery } from './mastery'

function normalizedToken(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[’']/gu, "'")
    .replace(/^'+|'+$/gu, '')
    .replace(/'s$/u, '')
}

function tokensIn(value: string): string[] {
  return [...value.matchAll(/[A-Za-z]+(?:[’'][A-Za-z]+)?/gu)]
    .map(([token]) => normalizedToken(token))
    .filter(Boolean)
}

function wordForms(word: WordItem): string[] {
  return [...new Set([
    word.word,
    word.lemma,
    ...word.entries.flatMap(({ forms }) =>
      Array.isArray(forms) ? forms : Object.values(forms)),
  ].map(normalizedToken).filter((form) => form && !form.includes(' ')))]
}

export function grammarVocabularyText(node: GrammarNode): string {
  return [
    ...node.examples.map(({ english }) => english),
    ...node.exercises.flatMap(({ prompt, choices, answer }) => [prompt, ...choices, answer]),
    ...node.errorNotes.flatMap(({ wrongExample, correction }) => [wrongExample, correction]),
  ].join(' ')
}

export function relatedGrammarWords(
  node: GrammarNode,
  words: readonly WordItem[],
  limit = 12,
): WordItem[] {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError('limit must be non-negative')
  const orderedTokens = tokensIn(grammarVocabularyText(node))
  const firstIndex = new Map<string, number>()
  orderedTokens.forEach((token, index) => {
    if (!firstIndex.has(token)) firstIndex.set(token, index)
  })

  return words
    .flatMap((word) => {
      const matchedAt = wordForms(word)
        .map((form) => firstIndex.get(form))
        .filter((index): index is number => index !== undefined)
      return matchedAt.length > 0 ? [{ word, index: Math.min(...matchedAt) }] : []
    })
    .sort((left, right) => left.index - right.index || left.word.lemma.localeCompare(right.word.lemma))
    .slice(0, limit)
    .map(({ word }) => word)
}

export function grammarReviewItemIds(
  nodes: readonly GrammarNode[],
  words: readonly WordItem[],
  masteryByNode: Readonly<Record<string, GrammarMastery>>,
): ReadonlySet<string> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const reviewNodeIds = new Set<string>()

  for (const node of nodes) {
    const mastery = masteryByNode[node.id]
    if (!mastery || mastery.completed) continue
    const belowTarget = mastery.attempts > 0 && (
      grammarAccuracy(mastery) < node.masteryRule.quizAccuracy ||
      mastery.retryCount > 0
    )
    if (!mastery.mustReview && !belowTarget) continue
    reviewNodeIds.add(node.id)
    const requiredNodeId = mastery.reviewRequirement?.nodeId
    if (requiredNodeId && nodesById.has(requiredNodeId)) {
      reviewNodeIds.add(requiredNodeId)
    }
  }

  const ids = new Set<string>()
  for (const node of nodes) {
    if (!reviewNodeIds.has(node.id)) continue
    for (const word of relatedGrammarWords(node, words, words.length)) {
      ids.add(word.id)
    }
  }
  return ids
}
