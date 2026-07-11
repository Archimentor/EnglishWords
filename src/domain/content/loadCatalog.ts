import { normalizeCatalog } from './normalize'
import { validateCatalog, validateStoryCoverage } from './validation'
import type { ContentCatalog, RuntimeCatalog, ValidationIssue } from './types'

export const CONTENT_PATHS = [
  'data/wordlists/기초.json',
  'data/wordlists/유치원.json',
  'data/wordlists/초등학교.json',
  'data/wordlists/중학교.json',
  'data/phrasal-verbs/top-1000.json',
  'data/phrasal-verbs/by-level/기초.json',
  'data/phrasal-verbs/by-level/유치원.json',
  'data/phrasal-verbs/by-level/초등학교.json',
  'data/phrasal-verbs/by-level/중학교.json',
  'data/stories/기초.json',
  'data/stories/유치원.json',
  'data/stories/초등학교.json',
  'data/stories/중학교.json',
  'data/grammar/nodes.json',
] as const

export type ContentLoadErrorCode =
  | 'CONTENT_LOAD_FAILED'
  | 'CONTENT_PARSE_FAILED'
  | 'CONTENT_INVALID'

interface ContentLoadErrorDetails {
  path?: string
  status?: number
  issues?: ValidationIssue[]
  cause?: unknown
}

export class ContentLoadError extends Error {
  readonly code: ContentLoadErrorCode
  readonly path?: string
  readonly status?: number
  readonly issues?: ValidationIssue[]

  constructor(
    code: ContentLoadErrorCode,
    message: string,
    details: ContentLoadErrorDetails = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause })
    this.name = 'ContentLoadError'
    this.code = code
    if (details.path !== undefined) {
      this.path = details.path
    }
    if (details.status !== undefined) {
      this.status = details.status
    }
    if (details.issues !== undefined) {
      this.issues = details.issues
    }
  }
}

async function loadJson(path: string, fetcher: typeof fetch): Promise<unknown> {
  let response: Response
  try {
    response = await fetcher(path)
  } catch (cause) {
    throw new ContentLoadError(
      'CONTENT_LOAD_FAILED',
      `Failed to load ${path}.`,
      { path, cause },
    )
  }

  if (!response.ok) {
    const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
    throw new ContentLoadError(
      'CONTENT_LOAD_FAILED',
      `Failed to load ${path}: HTTP ${status}.`,
      { path, status: response.status },
    )
  }

  try {
    return await response.json()
  } catch (cause) {
    throw new ContentLoadError(
      'CONTENT_PARSE_FAILED',
      `Failed to parse JSON from ${path}.`,
      { path, cause },
    )
  }
}

function assembleCatalog(resources: ReadonlyMap<string, unknown>): ContentCatalog {
  return {
    wordlists: {
      기초: resources.get('data/wordlists/기초.json'),
      유치원: resources.get('data/wordlists/유치원.json'),
      초등학교: resources.get('data/wordlists/초등학교.json'),
      중학교: resources.get('data/wordlists/중학교.json'),
    },
    phrasalVerbs: {
      top: resources.get('data/phrasal-verbs/top-1000.json'),
      byLevel: {
        기초: resources.get('data/phrasal-verbs/by-level/기초.json'),
        유치원: resources.get('data/phrasal-verbs/by-level/유치원.json'),
        초등학교: resources.get('data/phrasal-verbs/by-level/초등학교.json'),
        중학교: resources.get('data/phrasal-verbs/by-level/중학교.json'),
      },
    },
    stories: {
      기초: resources.get('data/stories/기초.json'),
      유치원: resources.get('data/stories/유치원.json'),
      초등학교: resources.get('data/stories/초등학교.json'),
      중학교: resources.get('data/stories/중학교.json'),
    },
    grammarNodes: resources.get('data/grammar/nodes.json'),
  } as ContentCatalog
}

function invalidCatalogError(issues: ValidationIssue[]): ContentLoadError {
  const firstIssue = issues[0]
  const summary = firstIssue
    ? `${firstIssue.code} at ${firstIssue.path}: ${firstIssue.message}`
    : 'Unknown validation issue'

  return new ContentLoadError(
    'CONTENT_INVALID',
    `Content catalog is invalid (${issues.length} total): ${summary}`,
    { issues },
  )
}

/**
 * Validates and normalizes the catalog object embedded into an offline build.
 * This deliberately shares the normal loading validation path so a file-opened
 * build cannot bypass catalog integrity checks.
 */
export function loadEmbeddedCatalog(catalog: ContentCatalog): RuntimeCatalog {
  const issues = [
    ...validateCatalog(catalog, 'development'),
    ...validateStoryCoverage(catalog),
  ]

  if (issues.length > 0) {
    throw invalidCatalogError(issues)
  }

  return normalizeCatalog(catalog)
}

function embeddedCatalog(): ContentCatalog | undefined {
  return (globalThis as typeof globalThis & {
    __ENGLISH_WORDS_EMBEDDED_CATALOG__?: ContentCatalog
  }).__ENGLISH_WORDS_EMBEDDED_CATALOG__
}

function resolveContentPath(path: string, baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.length === 0
    ? '/'
    : baseUrl.endsWith('/')
      ? baseUrl
      : `${baseUrl}/`

  return `${normalizedBaseUrl}${path}`
}

export async function loadCatalog(
  fetcher: typeof fetch = fetch,
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<RuntimeCatalog> {
  const embedded = embeddedCatalog()
  if (embedded) {
    return loadEmbeddedCatalog(embedded)
  }

  const entries = await Promise.all(
    CONTENT_PATHS.map(async (path) => [
      path,
      await loadJson(resolveContentPath(path, baseUrl), fetcher),
    ] as const),
  )
  const catalog = assembleCatalog(new Map(entries))
  return loadEmbeddedCatalog(catalog)
}
