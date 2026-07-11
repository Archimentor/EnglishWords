# Full Content and Story Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static, source-attributed 5,000-word/1,000-phrasal-verb catalog and make every tracked story word open its exact learning details.

**Architecture:** Build data in an offline Node pipeline from pinned CEFR-J, Korean Wiktionary, frequency, pronunciation, and example-sentence source snapshots; commit only the normalized public JSON plus a provenance manifest. Tokenize story text against `usedWords` at render time, turn matched surface forms into accessible buttons, and resolve details from the catalog's existing `WordItem` model.

**Tech Stack:** React 19, TypeScript 6, Vite, Vitest/RTL, Node `tsx`, JSON, Node `zlib`/`crypto`/`fs`.

---

### Task 1: Pin source metadata and add content-source contracts

**Files:**
- Create: `scripts/content/sources.ts`
- Create: `scripts/content/source-types.ts`
- Create: `scripts/content/sources.test.ts`
- Create: `docs/content-sources.md`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing source-contract tests**

```ts
import { describe, expect, test } from 'vitest'
import { CONTENT_SOURCES, parseSha256 } from './sources'

describe('content sources', () => {
  test('pins a https URL, license, attribution, and sha256 for every source', () => {
    expect(CONTENT_SOURCES).toHaveLength(5)
    for (const source of CONTENT_SOURCES) {
      expect(source.url).toMatch(/^https:\/\//)
      expect(source.license).not.toHaveLength(0)
      expect(source.attribution).not.toHaveLength(0)
      expect(parseSha256(source.sha256)).toHaveLength(64)
    }
  })
})
```

- [ ] **Step 2: Run the test and verify it fails because the module is missing**

Run: `npm test -- scripts/content/sources.test.ts`

Expected: FAIL with a module-not-found error for `./sources`.

- [ ] **Step 3: Define the pinned source records and cache boundary**

```ts
export interface ContentSource {
  id: 'cefrj' | 'korean-wiktionary' | 'frequency' | 'tatoeba-english' | 'ipa-dict'
  url: string
  sha256: string
  license: string
  attribution: string
  cacheFile: string
}

export const CONTENT_CACHE_DIR = '.content-cache'

export const CONTENT_SOURCES: readonly ContentSource[] = [
  { id: 'cefrj', url: 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/d4e45b75b38f27b30dfc5c44d8c571aec7e7092f/cefrj-vocabulary-profile-1.5.csv', sha256: 'b0dd3c635f1c9a4fdf1490c7e5b7c48e8bbe55b652ad0c9860a95f98e10ae498', license: 'CEFR-J terms of use', attribution: 'CEFR-J Vocabulary Profile 1.5', cacheFile: 'cefrj-vocabulary-profile-1.5.csv' },
  { id: 'korean-wiktionary', url: 'https://dumps.wikimedia.org/kowiktionary/20260701/kowiktionary-20260701-pages-articles.xml.bz2', sha256: '190f1b94870c5a09f3006f2d61d10da4d4997e5c968f4491186215c2e33b460e', license: 'CC BY-SA 4.0', attribution: 'Korean Wiktionary contributors via Wikimedia Dumps', cacheFile: 'kowiktionary-20260701-pages-articles.xml.bz2' },
  { id: 'frequency', url: 'https://raw.githubusercontent.com/filiph/english_words/4191ae1341c5e3dc640731c20f118746a51e7143/data/word-freq-top5000.csv', sha256: '87a73f5bca66862983dd430ba5d37129706f761291b433d33fcac8de117f66fc', license: 'MIT', attribution: 'filiph/english_words', cacheFile: 'word-freq-top5000.csv' },
  { id: 'tatoeba-english', url: 'https://object.pouta.csc.fi/OPUS-Tatoeba/v2023-04-12/mono/en.txt.gz', sha256: 'a32c5500cd76b9479859764fb78537a4b9b53fab8fa3bdc0fc04dd70f28bf29b', license: 'CC BY 2.0 FR', attribution: 'OPUS Tatoeba v2023-04-12 (Tiedemann 2012; source: Tatoeba Project)', cacheFile: 'opus-tatoeba-v2023-04-12-en.txt.gz' },
  { id: 'ipa-dict', url: 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/43c3570eb3553bdd19fccd2bd0091534889af023/data/en_US.txt', sha256: '2af6f154a5c363275f052d1f85acedef38ed185ca9745aa4314be77f6b70de67', license: 'MIT', attribution: 'open-dict-data/ipa-dict (MIT; third-party credit)', cacheFile: 'ipa-dict-en_US.txt' },
] as const

export function parseSha256(value: string): string {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`Invalid SHA-256: ${value}`)
  return value.toLowerCase()
}
```

Use the exact URLs and SHA-256 values above. Add `.content-cache/` to `.gitignore` and document source licenses and citations in `docs/content-sources.md`.

- [ ] **Step 4: Run the source-contract test**

Run: `npm test -- scripts/content/sources.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the source contract**

```powershell
git add .gitignore scripts/content docs/content-sources.md
git commit -m "feat(content): pin vocabulary source metadata"
```

### Task 2: Fetch, hash, and parse reproducible source snapshots

**Files:**
- Create: `scripts/content/fetchSources.ts`
- Create: `scripts/content/fetchSources.test.ts`
- Create: `scripts/content/reportSources.ts`
- Modify: `scripts/content/sources.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing hash-verification test**

```ts
test('rejects a cached file whose digest differs from the pinned source', async () => {
  await expect(verifySourceBuffer(CONTENT_SOURCES[0], Buffer.from('tampered')))
    .rejects.toThrow('SHA-256 mismatch')
})
```

- [ ] **Step 2: Run the test and verify the missing export failure**

Run: `npm test -- scripts/content/fetchSources.test.ts`

Expected: FAIL because `verifySourceBuffer` is not exported.

- [ ] **Step 3: Implement source fetching without accepting an unverified response**

```ts
export async function verifySourceBuffer(source: ContentSource, body: Buffer): Promise<void> {
  const actual = createHash('sha256').update(body).digest('hex')
  if (actual !== parseSha256(source.sha256)) {
    throw new Error(`SHA-256 mismatch for ${source.id}: expected ${source.sha256}, got ${actual}`)
  }
}

export async function fetchContentSources(fetcher = fetch): Promise<void> {
  await mkdir(CONTENT_CACHE_DIR, { recursive: true })
  for (const source of CONTENT_SOURCES) {
    const response = await fetcher(source.url)
    if (!response.ok) throw new Error(`Download failed for ${source.id}: HTTP ${response.status}`)
    const body = Buffer.from(await response.arrayBuffer())
    await verifySourceBuffer(source, body)
    await writeFile(join(CONTENT_CACHE_DIR, source.cacheFile), body)
  }
}
```

Add functional package scripts in this task: `content:fetch` must download and
verify every pinned snapshot, while `content:report` must print each source's
pinned metadata and whether its cache file is present and SHA-256 verified. Do
not add placeholder commands.

- [ ] **Step 4: Run the source-fetch tests**

Run: `npm test -- scripts/content/fetchSources.test.ts`

Expected: PASS.

- [ ] **Step 5: Fetch snapshots and write their final hashes**

Run: `npm run content:fetch`

Expected: five verified files under ignored `.content-cache/`; all five source records contain final 64-character hashes.

Run: `npm run content:report`

Expected: every pinned source is listed with its URL, license, attribution,
expected digest, cache presence, and verification status.

- [ ] **Step 6: Commit the fetcher and final source metadata**

```powershell
git add package.json scripts/content docs/content-sources.md
git commit -m "feat(content): verify source snapshot downloads"
```

### Task 3: Normalize complete word and phrasal-verb records

**Files:**
- Create: `scripts/content/normalize.ts`
- Create: `scripts/content/normalize.test.ts`
- Create: `scripts/content/buildCatalog.ts`
- Create: `scripts/content/buildCatalog.test.ts`
- Modify: `public/data/wordlists/기초.json`
- Modify: `public/data/wordlists/유치원.json`
- Modify: `public/data/wordlists/초등학교.json`
- Modify: `public/data/wordlists/중학교.json`
- Modify: `public/data/phrasal-verbs/top-1000.json`
- Modify: `public/data/phrasal-verbs/by-level/기초.json`
- Modify: `public/data/phrasal-verbs/by-level/유치원.json`
- Modify: `public/data/phrasal-verbs/by-level/초등학교.json`
- Modify: `public/data/phrasal-verbs/by-level/중학교.json`

- [ ] **Step 1: Write failing selection tests with small fixtures**

```ts
test('selects exact per-level quotas without duplicate lemmas', () => {
  const catalog = selectWords(fixtureCandidates, { 기초: 2, 유치원: 2, 초등학교: 3, 중학교: 3 })
  expect(Object.fromEntries(Object.entries(catalog).map(([level, words]) => [level, words.length])))
    .toEqual({ 기초: 2, 유치원: 2, 초등학교: 3, 중학교: 3 })
  expect(new Set(Object.values(catalog).flat().map((word) => word.lemma)).size).toBe(10)
})

test('rejects an entry missing Korean gloss, IPA, forms, or two examples', () => {
  expect(() => normalizeWord({ word: 'plain', meanings: [], ipa: '', examples: ['one'] }))
    .toThrow('plain is incomplete')
})
```

- [ ] **Step 2: Run the tests and verify the missing-function failures**

Run: `npm test -- scripts/content/normalize.test.ts scripts/content/buildCatalog.test.ts`

Expected: FAIL because `selectWords` and `normalizeWord` do not exist.

- [ ] **Step 3: Implement deterministic normalization and allocation**

```ts
export const WORD_QUOTAS = { 기초: 500, 유치원: 500, 초등학교: 1500, 중학교: 2500 } as const
export const PHRASAL_QUOTA = 250

export function selectWords(candidates: readonly CandidateWord[], quotas = WORD_QUOTAS): Record<Level, WordItem[]> {
  const selected = new Set<string>()
  return Object.fromEntries(LEVELS.map((level) => {
    const words = candidates
      .filter((candidate) => candidate.levelBucket === level && !selected.has(candidate.lemma))
      .slice(0, quotas[level])
      .map((candidate) => {
        selected.add(candidate.lemma)
        return normalizeWord(candidate, level)
      })
    if (words.length !== quotas[level]) throw new Error(`Insufficient verified words for ${level}`)
    return [level, words]
  })) as Record<Level, WordItem[]>
}
```

Map CEFR A1 to 기초/유치원, A2/B1 to 초등학교, B1/B2 to 중학교 in rank order. Parse the pinned, dated Korean Wiktionary XML dump directly to extract Korean glosses and lexical forms; do not depend on a rolling Kaikki JSONL download. Resolve IPA only from the pinned `ipa-dict` source. The five known frequency candidates without that source's IPA—`n't`, `ie`, `mm-hmm`, `and/or`, and `self-esteem`—must be deterministically replaced by the next ranked candidate that satisfies every quality contract; never synthesize undocumented IPA. Preserve existing hand-authored entries when their normalized source identity matches. Generate two sentence examples only from verified source sentences containing the selected surface form; reject candidates without two distinct examples. Select phrasal verbs only when they have a Korean gloss, IPA or verified pronunciation, two distinct source examples, and a valid `verb + particle` decomposition.

- [ ] **Step 4: Run normalization and build tests**

Run: `npm test -- scripts/content/normalize.test.ts scripts/content/buildCatalog.test.ts`

Expected: PASS.

- [ ] **Step 5: Build the public catalog and inspect its report**

Run: `npm run content:build`

Expected: exactly `500/500/1500/2500` word records, `1000` top phrasals, `250` phrasals per level, and a machine-readable report with no rejected selected item.

- [ ] **Step 6: Commit the complete static catalog**

```powershell
git add public/data scripts/content
git commit -m "feat(content): add complete vocabulary catalog"
```

### Task 4: Build full-coverage level stories and validate linked surface forms

**Files:**
- Create: `scripts/content/buildStories.ts`
- Create: `scripts/content/buildStories.test.ts`
- Modify: `public/data/stories/기초.json`
- Modify: `public/data/stories/유치원.json`
- Modify: `public/data/stories/초등학교.json`
- Modify: `public/data/stories/중학교.json`
- Modify: `src/domain/content/validators/stories.ts`
- Modify: `tests/phrasal-story-data.test.ts`

- [ ] **Step 1: Write failing coverage and surface-form tests**

```ts
test('rejects a used word whose recorded form is absent from the story text', () => {
  const issues = validateStoryCoverage({ ...catalog, stories: { ...catalog.stories, 기초: { ...catalog.stories.기초, storyText: 'A different story.' } } })
  expect(issues).toContainEqual(expect.objectContaining({ code: 'STORY_FORM_MISSING' }))
})

test('each released story covers every wordlist lemma', () => {
  for (const level of LEVELS) {
    expect(new Set(stories[level].usedWords.map((word) => word.lemma)))
      .toEqual(new Set(wordlists[level].map((word) => word.lemma)))
  }
})
```

- [ ] **Step 2: Run the tests and verify the new `STORY_FORM_MISSING` behavior fails**

Run: `npm test -- scripts/content/buildStories.test.ts tests/phrasal-story-data.test.ts`

Expected: FAIL because missing text forms are currently not reported.

- [ ] **Step 3: Implement strict story form validation and source-based reader construction**

```ts
function formOccurs(text: string, form: string): boolean {
  return new RegExp(`(^|[^A-Za-z])${escapeRegExp(form)}(?=$|[^A-Za-z])`, 'i').test(text)
}

export function validateStoryCoverage(catalog: ContentCatalog): ValidationIssue[] {
  // retain current lemma/POS coverage checks
  // add STORY_FORM_MISSING when no usedWord.form occurs in storyText
}
```

Write each level document as titled reading sections assembled from reviewed source sentences and connective prose. For every `usedWords` record, store the exact surface form that appears in the text. Do not set `isManual` to true until the assembled prose has passed an editorial read-through; the release build rejects a false flag.

- [ ] **Step 4: Run story tests**

Run: `npm test -- scripts/content/buildStories.test.ts tests/phrasal-story-data.test.ts`

Expected: PASS with four full-coverage stories and no missing surface forms.

- [ ] **Step 5: Commit stories and validation**

```powershell
git add public/data/stories scripts/content src/domain/content/validators/stories.ts tests/phrasal-story-data.test.ts
git commit -m "feat(content): add full-coverage level stories"
```

### Task 5: Tokenize story text and show exact word details on selection

**Files:**
- Create: `src/features/story/storyTokens.ts`
- Create: `src/features/story/storyTokens.test.ts`
- Create: `src/features/story/StoryWordDetail.tsx`
- Modify: `src/features/story/StoryView.tsx`
- Modify: `src/features/story/StoryView.test.tsx`
- Modify: `src/styles/components.css`

- [ ] **Step 1: Write failing tokenization and interaction tests**

```tsx
test('clicking a story surface form shows its exact word entry', async () => {
  const user = userEvent.setup()
  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
  await user.click(screen.getByRole('button', { name: 'story word: played' }))
  expect(screen.getByRole('heading', { name: 'play 단어 상세' })).toBeInTheDocument()
  expect(screen.getByText('품사: verb')).toBeInTheDocument()
  expect(screen.getByText('/pleɪ/')).toBeInTheDocument()
  expect(screen.getByText('놀다')).toBeInTheDocument()
})

test('Escape closes the detail and restores focus to the selected word', async () => {
  const user = userEvent.setup()
  render(<StoryView story={story} levelWords={[word]} targetWordCount={500} />)
  const trigger = screen.getByRole('button', { name: 'story word: played' })
  await user.click(trigger)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('heading', { name: 'play 단어 상세' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
```

- [ ] **Step 2: Run the tests and verify they fail because story words are plain text**

Run: `npm test -- src/features/story/StoryView.test.tsx src/features/story/storyTokens.test.ts`

Expected: FAIL because no `story word: played` button exists.

- [ ] **Step 3: Implement pure longest-match tokenization**

```ts
export interface StoryToken {
  type: 'text' | 'word'
  value: string
  word?: WordItem
  entry?: WordEntry
}

export function tokenizeStory(storyText: string, usedWords: StoryContent['usedWords'], levelWords: readonly WordItem[]): StoryToken[] {
  // map every recorded form to its WordItem/WordEntry by lemma + partOfSpeech
  // sort forms by descending length; split case-insensitively on whole-word boundaries
  // throw in development if a usedWord cannot resolve or its form is absent
}
```

Render `text` tokens verbatim and `word` tokens as buttons with `aria-label={`story word: ${token.value}`}`. Keep the selected token in local state only.

- [ ] **Step 4: Implement `StoryWordDetail`**

```tsx
export function StoryWordDetail({ word, entry, onClose }: StoryWordDetailProps) {
  return <aside id="story-word-detail" className="story-word-detail" aria-labelledby="story-word-detail-title">
    <button type="button" onClick={onClose}>닫기</button>
    <h3 id="story-word-detail-title">{`${word.word} 단어 상세`}</h3>
    <p>{`품사: ${entry.partOfSpeech}`}</p>
    <p>{entry.ipa}</p>
    <ul>{entry.meanings.map((meaning) => <li key={meaning}>{meaning}</li>)}</ul>
    <p>{formatForms(entry.forms)}</p>
    <ul>{entry.examples.map((example) => <li key={example}>{example}</li>)}</ul>
  </aside>
}
```

Handle Escape in `StoryView`, return focus to the trigger, and add visible focus, selected, desktop, and 390px styles.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/features/story/StoryView.test.tsx src/features/story/storyTokens.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the story lookup UI**

```powershell
git add src/features/story src/styles/components.css
git commit -m "feat(story): reveal word details from reading text"
```

### Task 6: Enforce release completion and document the delivered catalog

**Files:**
- Modify: `tests/data-contract.test.ts`
- Modify: `README.md`
- Modify: `DEVELOPMENT_PLAN.md`
- Modify: `docs/superpowers/specs/2026-07-11-full-content-and-story-lookup-design.md`

- [ ] **Step 1: Write a failing release-completion regression test**

```ts
test('the checked-in catalog passes release validation without count exceptions', async () => {
  const result = await validateData(DEFAULT_DATA_ROOT, 'release')
  expect(result.issues).toEqual([])
})
```

- [ ] **Step 2: Run the test and verify it fails on the old representative catalog**

Run: `npm test -- tests/data-contract.test.ts`

Expected: FAIL with the existing word and phrasal count mismatches before Tasks 3 and 4 have generated full data.

- [ ] **Step 3: Update acceptance documentation after the catalog passes**

Replace every statement that calls the data a representative vertical slice with exact checked-in totals, provenance links, the story word-detail behavior, and the final source licenses. Mark the specification complete only after the commands below succeed.

- [ ] **Step 4: Run all final gates**

Run: `npm run validate:release`

Expected: `Validation succeeded (release).`

Run: `npm run check`

Expected: validation, lint, every test, and production build succeed.

Run: `git diff main...HEAD --check`

Expected: no output.

- [ ] **Step 5: Run browser acceptance checks**

At 1280×900 and 390×844: open each level's story, click a verb inflection and a noun, verify exact details and keyboard Escape behavior, then run wordbook search, study, quiz, and reload persistence. Confirm no console errors and no page-level horizontal overflow.

- [ ] **Step 6: Commit release-gate documentation**

```powershell
git add tests/data-contract.test.ts README.md DEVELOPMENT_PLAN.md docs/superpowers/specs/2026-07-11-full-content-and-story-lookup-design.md docs/content-sources.md
git commit -m "docs: mark complete vocabulary release gates"
```
