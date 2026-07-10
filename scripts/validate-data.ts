import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  ContentCatalog,
  ValidationIssue,
  ValidationMode,
} from '../src/domain/content/types'
import { validateCatalog, validateStoryCoverage } from '../src/domain/content/validation'
import { catalogCounts, readCatalogFromDisk } from './catalog-files'

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
  const catalog = await readCatalogFromDisk(dataRoot)
  const issues = [
    ...validateCatalog(catalog, mode),
    ...validateStoryCoverage(catalog),
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
