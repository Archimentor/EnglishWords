import { makeCatalog, makePhrasalVerb, makeWord } from '../../test/fixtures'
import type { ContentCatalog } from './types'
import { CONTENT_PATHS, ContentLoadError, loadCatalog } from './loadCatalog'

const EXPECTED_CONTENT_PATHS = [
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
const EXPECTED_ROOT_REQUEST_PATHS = EXPECTED_CONTENT_PATHS.map((path) => `/${path}`)

type ResponseFactory = () => Response | Promise<Response>
type ResponseGate = {
  promise: Promise<Response>
  resolve: (response: Response) => void
}

function requestPath(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }
  if (input instanceof URL) {
    return input.pathname
  }
  return new URL(input.url).pathname
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value) ?? 'null', {
    headers: { 'Content-Type': 'application/json' },
  })
}

function payloadsFor(catalog: ContentCatalog): Map<string, unknown> {
  return new Map<string, unknown>([
    ...Object.entries(catalog.wordlists).map(([level, words]) => [
      `/data/wordlists/${level}.json`,
      words,
    ] as const),
    ['/data/phrasal-verbs/top-1000.json', catalog.phrasalVerbs.top],
    ...Object.entries(catalog.phrasalVerbs.byLevel).map(([level, phrasals]) => [
      `/data/phrasal-verbs/by-level/${level}.json`,
      phrasals,
    ] as const),
    ...Object.entries(catalog.stories).map(([level, story]) => [
      `/data/stories/${level}.json`,
      story,
    ] as const),
    ['/data/grammar/nodes.json', catalog.grammarNodes],
  ])
}

function makeFetcher(
  catalog: ContentCatalog,
  overrides: ReadonlyMap<string, ResponseFactory> = new Map(),
): { fetcher: typeof fetch; requests: string[] } {
  const payloads = payloadsFor(catalog)
  const requests: string[] = []
  const fetcher: typeof fetch = async (input) => {
    const path = requestPath(input)
    requests.push(path)

    const override = overrides.get(path)
    if (override) {
      return override()
    }
    if (!payloads.has(path)) {
      return new Response(null, { status: 404, statusText: 'Not Found' })
    }
    return jsonResponse(payloads.get(path))
  }

  return { fetcher, requests }
}

async function captureLoadError(promise: Promise<unknown>): Promise<ContentLoadError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ContentLoadError)
    return error as ContentLoadError
  }
  throw new Error('Expected loadCatalog to reject.')
}

describe('loadCatalog', () => {
  it('requests all 14 resources once and returns normalized words and phrasals', async () => {
    const phrasal = makePhrasalVerb()
    const catalog = makeCatalog({
      wordOverrides: { 기초: { difficulty: 'normal' } },
      phrasalVerbs: {
        top: [phrasal],
        byLevel: {
          기초: [{ ...phrasal }],
          유치원: [],
          초등학교: [],
          중학교: [],
        },
      },
    })
    const { fetcher, requests } = makeFetcher(catalog)

    const runtime = await loadCatalog(fetcher)

    expect(CONTENT_PATHS).toEqual(EXPECTED_CONTENT_PATHS)
    expect(requests).toEqual(EXPECTED_ROOT_REQUEST_PATHS)
    expect(new Set(requests).size).toBe(14)
    expect(runtime.itemsByLevel.기초.map(({ term }) => term)).toEqual(['play', 'wake up'])
    expect(runtime.itemsById['word-play']?.difficulty).toBe('normal')
  })

  it.each(['/EnglishWords/', '/EnglishWords'])(
    'resolves and assembles all resources under deployment base %s',
    async (baseUrl) => {
      const catalog = makeCatalog()
      const payloads = payloadsFor(catalog)
      const requests: string[] = []
      const fetcher: typeof fetch = async (input) => {
        const path = requestPath(input)
        requests.push(path)
        const rootPath = path.replace(/^\/EnglishWords/, '')

        if (!payloads.has(rootPath)) {
          return new Response(null, { status: 404, statusText: 'Not Found' })
        }
        return jsonResponse(payloads.get(rootPath))
      }

      const runtime = await loadCatalog(fetcher, baseUrl)

      expect(requests).toEqual(
        EXPECTED_CONTENT_PATHS.map((path) => `/EnglishWords/${path}`),
      )
      expect(runtime.itemsByLevel.기초.map(({ term }) => term)).toEqual(['play'])
      expect(runtime.itemsById['word-play']).toBe(runtime.itemsByLevel.기초[0])
    },
  )

  it('starts every independent request before any response resolves', async () => {
    const catalog = makeCatalog()
    const payloads = payloadsFor(catalog)
    const requests: string[] = []
    const gates = new Map<string, ResponseGate>(
      EXPECTED_ROOT_REQUEST_PATHS.map((path) => {
        let resolve!: (response: Response) => void
        const promise = new Promise<Response>((responseResolve) => {
          resolve = responseResolve
        })
        return [path, { promise, resolve }] as const
      }),
    )
    const fetcher: typeof fetch = (input) => {
      const path = requestPath(input)
      requests.push(path)
      return (
        gates.get(path)?.promise ??
        Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }))
      )
    }

    const pendingLoad = loadCatalog(fetcher)
    await Promise.resolve()
    const requestsBeforeResolution = [...requests]

    EXPECTED_ROOT_REQUEST_PATHS.forEach((path) => {
      gates.get(path)?.resolve(jsonResponse(payloads.get(path)))
    })
    await pendingLoad

    expect(requestsBeforeResolution).toEqual(EXPECTED_ROOT_REQUEST_PATHS)
  })

  it('wraps a non-ok wordlist response with its path and status', async () => {
    const failedPath = '/data/wordlists/기초.json'
    const { fetcher } = makeFetcher(
      makeCatalog(),
      new Map([
        [
          failedPath,
          () => new Response(null, { status: 500, statusText: 'Internal Server Error' }),
        ],
      ]),
    )

    const error = await captureLoadError(loadCatalog(fetcher))

    expect(error.code).toBe('CONTENT_LOAD_FAILED')
    expect(error.path).toBe(failedPath)
    expect(error.status).toBe(500)
    expect(error.message).toContain(failedPath)
    expect(error.message).toContain('500')
  })

  it('wraps a grammar JSON failure with its original cause and path', async () => {
    const failedPath = '/data/grammar/nodes.json'
    const parseCause = new SyntaxError('broken grammar JSON')
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        throw parseCause
      },
    } as unknown as Response
    const { fetcher } = makeFetcher(
      makeCatalog(),
      new Map([[failedPath, () => response]]),
    )

    const error = await captureLoadError(loadCatalog(fetcher))

    expect(error.code).toBe('CONTENT_PARSE_FAILED')
    expect(error.path).toBe(failedPath)
    expect(error.cause).toBe(parseCause)
  })

  it('rejects a structurally valid catalog with a duplicate lemma and exposes issues', async () => {
    const catalog = makeCatalog()
    catalog.wordlists.유치원.push(
      makeWord({
        id: 'word-play-duplicate',
        word: 'play',
        lemma: 'play',
        level: '유치원',
        familyId: 'family-play-duplicate',
        difficulty: 'easy',
      }),
    )
    catalog.stories.유치원.usedWords.push({
      lemma: 'play',
      partOfSpeech: 'verb',
      forms: ['play'],
    })
    const { fetcher } = makeFetcher(catalog)

    const error = await captureLoadError(loadCatalog(fetcher))

    expect(error.code).toBe('CONTENT_INVALID')
    expect(error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DUPLICATE_LEMMA' }),
      ]),
    )
    expect(error.message).toContain(error.issues?.[0]?.code ?? '')
    expect(error.message).toContain(String(error.issues?.length))
  })

  it('rejects a catalog when a story omits a required lemma', async () => {
    const catalog = makeCatalog()
    catalog.stories.기초.usedWords = []
    const { fetcher } = makeFetcher(catalog)

    const error = await captureLoadError(loadCatalog(fetcher))

    expect(error.code).toBe('CONTENT_INVALID')
    expect(error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'STORY_COVERAGE_MISSING',
          path: 'stories.기초.usedWords',
        }),
      ]),
    )
  })

  it('does not log expected loading failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const failedPath = '/data/wordlists/기초.json'
    const { fetcher } = makeFetcher(
      makeCatalog(),
      new Map([[failedPath, () => new Response(null, { status: 503 })]]),
    )

    try {
      await captureLoadError(loadCatalog(fetcher))
      expect(errorSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})
