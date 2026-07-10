import type { ValidationIssue, ValidationMode } from './types'
import { validateGrammarNodes } from './validators/grammar'
import { invalidCatalog, isRecord } from './validators/guards'
import { validatePhrasalVerbs } from './validators/phrasalVerbs'
import { validateStories } from './validators/stories'
import { validateWordlists } from './validators/words'

export { validateStoryCoverage } from './validators/stories'

export function validateCatalog(catalog: unknown, mode: ValidationMode): ValidationIssue[] {
  if (!isRecord(catalog)) {
    return [invalidCatalog('catalog', 'Catalog must be an object.')]
  }

  const issues: ValidationIssue[] = []
  const contentIds = validateWordlists(catalog.wordlists, mode, issues)

  validatePhrasalVerbs(catalog.phrasalVerbs, contentIds, mode, issues)
  validateGrammarNodes(catalog.grammarNodes, contentIds, issues)
  validateStories(catalog.stories, issues)

  return issues
}
