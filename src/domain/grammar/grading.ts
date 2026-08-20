export function normalizeGrammarAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/u, '')
}

export function isGrammarAnswerCorrect(answer: string, expected: string): boolean {
  return normalizeGrammarAnswer(answer) === normalizeGrammarAnswer(expected)
}
