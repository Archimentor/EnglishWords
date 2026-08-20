import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  ContentCatalog,
  ValidationIssue,
  ValidationMode,
} from '../src/domain/content/types'
import { validateCatalog, validateStoryCoverage } from '../src/domain/content/validation'
import {
  catalogCounts,
  readCatalogFromDisk,
  readCatalogProvenanceFromDisk,
} from './catalog-files'
import {
  validateContentGenerationResidue,
  validateContentProvenance,
} from './content/buildContent'

const USAGE = 'Usage: validate-data --mode=development|--mode=release'
const MODULE_PATH = resolve(fileURLToPath(import.meta.url))
const DEFAULT_DATA_ROOT = resolve(dirname(MODULE_PATH), '../public/data')

export interface ValidationCliPorts {
  dataRoot?: string
  log?: (line: string) => void
  error?: (line: string) => void
}

export function parseValidationMode(args: string[]): ValidationMode {
  if (args.length === 1 && args[0] === '--mode=development') {
    return 'development'
  }
  if (args.length === 1 && args[0] === '--mode=release') {
    return 'release'
  }
  throw new Error(USAGE)
}

export function formatValidationIssues(issues: readonly ValidationIssue[]): string {
  return issues.map(({ code, path, message }) => `${code} ${path}: ${message}`).join('\n')
}

export async function validateData(
  dataRoot: string,
  mode: ValidationMode,
): Promise<{
  catalog: ContentCatalog
  counts: ReturnType<typeof catalogCounts>
  issues: ValidationIssue[]
}> {
  const [catalog, provenanceRead, contentBuildIssues] = await Promise.all([
    readCatalogFromDisk(dataRoot),
    readCatalogProvenanceFromDisk(dataRoot),
    validateContentGenerationResidue(dataRoot),
  ])
  const catalogIssues = [
    ...validateCatalog(catalog, mode),
    ...validateStoryCoverage(catalog),
  ]
  const canValidateProvenance = !catalogIssues.some(({ code }) => code === 'INVALID_CATALOG')
  const provenanceIssues = canValidateProvenance
    ? validateContentProvenance({
        wordlists: catalog.wordlists,
        wordProvenance: provenanceRead.provenance.wordCatalog,
        phrasalTop: catalog.phrasalVerbs.top,
        phrasalByLevel: catalog.phrasalVerbs.byLevel,
        phrasalProvenance: provenanceRead.provenance.phrasalCatalog,
        stories: catalog.stories,
        storyProvenance: provenanceRead.provenance.storyDrafts,
      })
    : []
  const issues = [
    ...contentBuildIssues,
    ...catalogIssues,
    ...provenanceRead.issues,
    ...provenanceIssues,
  ]

  return {
    catalog,
    counts: catalogCounts(catalog),
    issues,
  }
}

export async function main(
  args: string[] = process.argv.slice(2),
  ports: ValidationCliPorts = {},
): Promise<number> {
  const log = ports.log ?? console.log
  const writeError = ports.error ?? console.error

  try {
    const mode = parseValidationMode(args)
    const { counts, issues } = await validateData(ports.dataRoot ?? DEFAULT_DATA_ROOT, mode)

    if (issues.length > 0) {
      for (const issue of issues) {
        writeError(formatValidationIssues([issue]))
      }
      return 1
    }

    log(
      `Data counts: words=${counts.words} phrasalVerbs=${counts.phrasalVerbs} ` +
        `grammarNodes=${counts.grammarNodes} stories=${counts.stories}`,
    )
    log(`Validation succeeded (${mode}).`)
    return 0
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error))
    return 2
  }
}

function pathsAreEqual(left: string, right: string): boolean {
  if (process.platform === 'win32') {
    return left.toLowerCase() === right.toLowerCase()
  }
  return left === right
}

const entryPath = process.argv[1]
if (entryPath !== undefined && pathsAreEqual(MODULE_PATH, resolve(entryPath))) {
  void main().then((exitCode) => {
    process.exitCode = exitCode
  })
}
