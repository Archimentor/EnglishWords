# 영단어 5000 마스터 수직 슬라이스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세 요구 문서의 메뉴·데이터·문법·학습·6종 퀴즈·오답 재노출 규칙을 정적 배포 가능한 실제 웹 앱의 수직 슬라이스로 구현한다.

**Architecture:** React 화면은 내비게이션과 사용자 상호작용만 담당하고, 콘텐츠 검증·스케줄러·진도·퀴즈는 브라우저 API와 분리된 순수 TypeScript 모듈로 구현한다. 정적 JSON 콘텐츠는 `public/data`에서 로드하고 버전이 붙은 학습 상태는 `localStorage.wordMasterMainMenuState`에 저장한다. 개발 검증은 대표 콘텐츠의 구조와 참조 정합성을, 릴리스 검증은 5,000단어·1,000구동사·레벨별 완전 커버리지까지 강제한다.

**Tech Stack:** Node.js 24, npm, React 19.2.7, TypeScript 6.0.3, Vite 8.1.4, Vitest 4.1.10, Testing Library 16.3.2, ESLint 10, CSS

---

## 파일 구조

```text
.
├─ public/data/
│  ├─ wordlists/{기초,유치원,초등학교,중학교}.json
│  ├─ phrasal-verbs/top-1000.json
│  ├─ phrasal-verbs/by-level/{기초,유치원,초등학교,중학교}.json
│  ├─ stories/{기초,유치원,초등학교,중학교}.json
│  ├─ grammar/nodes.json
│  ├─ schema/{wordlist,phrasal,story,grammar-node}.schema.json
│  └─ engine/{difficulty,reprioritize,spacing}-rules.json
├─ scripts/validate-data.ts
├─ src/
│  ├─ app/{App,AppShell,Navigation,ContextNav,KpiStrip}.tsx
│  ├─ components/{ErrorState,LoadingState,ProgressBar}.tsx
│  ├─ features/dashboard/Dashboard.tsx
│  ├─ features/grammar/GrammarView.tsx
│  ├─ features/quiz/{QuizView,QuizQuestion,QuizResults}.tsx
│  ├─ features/story/StoryView.tsx
│  ├─ features/study/{StudyView,Flashcard,DifficultyPicker}.tsx
│  ├─ features/wordbook/Wordbook.tsx
│  ├─ domain/content/{types,validation,normalize,loadCatalog}.ts
│  ├─ domain/progress/{types,mastery}.ts
│  ├─ domain/quiz/{types,generate,grade,results}.ts
│  ├─ domain/scheduler/{difficulty,queue}.ts
│  ├─ state/{appState,persistence,AppStateContext}.tsx
│  ├─ styles/{tokens,global,components}.css
│  ├─ test/{setup,fixtures}.ts
│  └─ main.tsx
├─ tests/data-contract.test.ts
├─ index.html
├─ package.json
├─ tsconfig*.json
├─ vite.config.ts
└─ eslint.config.js
```

각 테스트는 구현 파일 옆의 `*.test.ts(x)`에 둔다. `tests/data-contract.test.ts`만 전체 JSON 파일의 교차 검증을 위해 루트 테스트 폴더에 둔다.

## 확정한 구현 규칙

- 학습 큐는 일반 단어와 해당 레벨 구동사를 합친 뒤 중복 없이 최대 500개를 뽑는다. 후보가 500개보다 적으면 전체 후보를 한 번씩 노출한다.
- `+15%`, `+30%`는 해당 항목의 기본 가중치에 각각 `0.15`, `0.30`을 더한 뒤 전체 후보 안에서 정규화하는 퍼센트포인트 규칙이다.
- 연속 오답 2회 이상인 항목은 다음 큐의 앞 3개 슬롯 안에 한 번 배치한다. 동일 항목을 세 번 복제하지 않는다.
- 단어 완료는 `attempts >= 3`, `correct / attempts >= 0.8`, `wrongStreak === 0`을 모두 만족할 때다.
- 문법 노드 선행관계는 같은 레벨에서 직전 노드를 기본 선행노드로 두고, 각 레벨 첫 노드는 이전 레벨 마지막 노드를 선행노드로 둔다. `A1-G01`만 선행노드가 없다.
- 구동사 개발 데이터는 레벨당 2개, 총 8개다. 릴리스 모드만 레벨당 250개와 총 1,000개를 강제한다.
- 문법은 42개 노드 메타데이터를 한 JSON으로 로드하고, 각 노드에 최소 3개 Can-do, 규칙, 예문, 오류 코드, 통과 기준을 둔다.
- 자동 문제 전환은 사용하지 않는다. 정답 공개 후 `다음문제` 버튼으로만 진행한다.

### Task 1: 프로젝트 도구와 첫 렌더링

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `eslint.config.js`
- Create: `index.html`
- Create: `src/test/setup.ts`
- Test: `src/app/App.test.tsx`
- Create: `src/app/App.tsx`
- Create: `src/main.tsx`

- [ ] **Step 1: 도구 설정을 만든다**

`package.json`에는 아래 스크립트와 정확한 버전을 둔다.

```json
{
  "name": "english-words-master",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "validate:data": "tsx scripts/validate-data.ts --mode=development",
    "validate:release": "tsx scripts/validate-data.ts --mode=release",
    "check": "npm run validate:data && npm run lint && npm test && npm run build"
  },
  "dependencies": {
    "react": "19.2.7",
    "react-dom": "19.2.7"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/node": "26.1.1",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react-swc": "4.3.1",
    "eslint": "10.0.0",
    "eslint-plugin-react-hooks": "7.1.1",
    "eslint-plugin-react-refresh": "0.5.3",
    "globals": "17.7.0",
    "jsdom": "29.1.1",
    "tsx": "4.23.0",
    "typescript": "6.0.3",
    "typescript-eslint": "8.63.0",
    "vite": "8.1.4",
    "vitest": "4.1.10"
  }
}
```

`vite.config.ts`의 테스트 환경은 `jsdom`, setup 파일은 `src/test/setup.ts`로 지정한다. ESLint에는 브라우저·Node·Vitest 전역과 React Hooks 권장 규칙을 적용한다. `tsconfig.app.json`은 `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`를 켠다.

- [ ] **Step 2: 의존성을 설치한다**

Run: `npm install`

Expected: `package-lock.json` 생성, audit 종료, 설치 명령 exit code 0.

- [ ] **Step 3: 실패하는 첫 화면 테스트를 작성한다**

```tsx
import { render, screen } from '@testing-library/react'
import { App } from './App'

test('서비스 이름과 초기 레벨을 보여준다', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: '영단어 5000 마스터' })).toBeInTheDocument()
  expect(screen.getByText('기초 학습 대시보드')).toBeInTheDocument()
})
```

- [ ] **Step 4: 실패를 확인한다**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL because `./App` does not exist.

- [ ] **Step 5: 최소 앱과 진입점을 만든다**

```tsx
export function App() {
  return (
    <main>
      <h1>영단어 5000 마스터</h1>
      <p>기초 학습 대시보드</p>
    </main>
  )
}
```

`src/main.tsx`는 `createRoot(document.getElementById('root')!)`에 `<App />`을 렌더링하고, `index.html`은 `lang="ko"`, `#root`, `/src/main.tsx` 모듈 스크립트를 갖는다.

- [ ] **Step 6: 테스트와 빌드를 확인한다**

Run: `npm test -- src/app/App.test.tsx && npm run build`

Expected: 1 test passed, production build exit code 0.

- [ ] **Step 7: 커밋한다**

```powershell
git add package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts eslint.config.js index.html src/test/setup.ts src/app/App.test.tsx src/app/App.tsx src/main.tsx
git commit -m "chore: bootstrap the wordmaster app"
```

### Task 2: 콘텐츠 타입과 검증기

**Files:**
- Create: `src/domain/content/types.ts`
- Create: `src/domain/content/validation.ts`
- Test: `src/domain/content/validation.test.ts`
- Create: `src/test/fixtures.ts`

- [ ] **Step 1: 유효·중복 데이터 검증 테스트를 먼저 작성한다**

```ts
test('레벨을 넘는 lemma 중복을 거부한다', () => {
  const catalog = makeCatalog({ duplicateLemma: 'play' })
  expect(validateCatalog(catalog, 'development')).toContainEqual(
    expect.objectContaining({ code: 'DUPLICATE_LEMMA', path: 'wordlists.유치원[0].lemma' }),
  )
})

test('개발 모드는 대표 데이터 수량을 허용하고 릴리스 모드는 5000개를 요구한다', () => {
  const catalog = makeCatalog()
  expect(validateCatalog(catalog, 'development')).toEqual([])
  expect(validateCatalog(catalog, 'release')).toContainEqual(
    expect.objectContaining({ code: 'WORD_COUNT_MISMATCH' }),
  )
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/domain/content/validation.test.ts`

Expected: FAIL because content types and `validateCatalog` do not exist.

- [ ] **Step 3: 타입과 검증 규칙을 최소 구현한다**

```ts
export const LEVELS = ['기초', '유치원', '초등학교', '중학교'] as const
export const DIFFICULTIES = ['veryEasy', 'easy', 'normal', 'hard', 'veryHard'] as const
export type Level = (typeof LEVELS)[number]
export type Difficulty = (typeof DIFFICULTIES)[number]

export interface WordEntry {
  partOfSpeech: string
  forms: string[] | Record<string, string>
  meanings: string[]
  ipa: string
  examples: string[]
}

export interface WordItem {
  id: string
  word: string
  lemma: string
  level: Level
  familyId: string
  isFamilyHead: boolean
  difficulty: Difficulty
  entries: WordEntry[]
}

export interface PhrasalVerbItem {
  id: string
  baseVerb: string
  particle: string
  phrasalVerb: string
  levelHint: Level
  meaningKo: string[]
  examples: string[]
  partOfSpeech: 'phrasalVerb'
  usageNotes: string
  difficulty: Difficulty
}
```

`validateCatalog(catalog, mode)`은 ID/lemma 유일성, family head 1개, 항목당 의미 1개 이상, 예문 2개 이상, IPA 비어 있지 않음, 구동사 top/by-level 집합 일치, 42개 문법 노드 ID를 검사한다. 릴리스 모드에서는 레벨별 `500/500/1500/2500`, 구동사 `250/250/250/250`도 검사한다.

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npm test -- src/domain/content/validation.test.ts`

Expected: all validation tests passed.

- [ ] **Step 5: 커밋한다**

```powershell
git add src/domain/content src/test/fixtures.ts
git commit -m "feat(content): define and validate learning data"
```

### Task 3: 대표 콘텐츠와 데이터 계약

**Files:**
- Create: `public/data/wordlists/*.json`
- Create: `public/data/phrasal-verbs/**/*.json`
- Create: `public/data/stories/*.json`
- Create: `public/data/grammar/nodes.json`
- Create: `public/data/schema/*.schema.json`
- Create: `public/data/engine/*.json`
- Create: `scripts/validate-data.ts`
- Test: `tests/data-contract.test.ts`

- [ ] **Step 1: 실제 파일을 요구하는 실패 테스트를 작성한다**

```ts
test('정적 콘텐츠 전체가 개발 계약을 만족한다', async () => {
  const catalog = await readCatalogFromDisk('public/data')
  expect(validateCatalog(catalog, 'development')).toEqual([])
})

test('대표 소설은 해당 레벨 대표 lemma를 모두 사용한다', async () => {
  const catalog = await readCatalogFromDisk('public/data')
  expect(validateStoryCoverage(catalog)).toEqual([])
})
```

- [ ] **Step 2: 파일 부재 실패를 확인한다**

Run: `npm test -- tests/data-contract.test.ts`

Expected: FAIL with `ENOENT` for `public/data/wordlists/기초.json`.

- [ ] **Step 3: 정확한 대표 어휘를 작성한다**

각 레벨 JSON에 아래 8개 lemma를 넣고, 모든 항목에 한국어 의미, IPA, 품사, 예문 2개를 완전하게 작성한다.

```text
기초: baby, ball, bird, cat, dog, eat, happy, play
유치원: book, chair, draw, friend, green, jump, school, teacher
초등학교: answer, because, careful, decide, different, explore, improve, question
중학교: achieve, although, compare, evidence, influence, maintain, require, respond
```

구동사 기준 집합과 레벨 파일에는 아래 8개를 동일 ID로 둔다.

```text
기초: wake up, sit down
유치원: stand up, put on
초등학교: look for, find out
중학교: carry on, deal with
```

소설 본문은 아래 문장을 기반으로 자연스럽게 완성하고 `usedWords`에 8개 lemma를 모두 기록한다.

```text
기초: A happy baby sees a bird, a cat, and a dog. They eat, play with a ball, and rest together.
유치원: At school, a teacher puts a green book on a chair. I draw with my friend, then we jump outside.
초등학교: A careful student reads each question because she wants the right answer. She will decide, explore different ideas, and improve her work.
중학교: To achieve a goal, compare each claim with evidence. Although opinions influence us, good work may require us to maintain focus and respond clearly.
```

- [ ] **Step 4: 42개 문법 노드와 엔진 규칙을 작성한다**

`개발(문법).md`의 정확한 42개 ID와 제목을 사용한다. 각 노드 객체는 아래 완전한 형태를 따르고, 같은 레벨의 직전 노드 또는 이전 레벨 마지막 노드를 `prerequisite`로 연결한다.

```json
{
  "id": "A1-G01",
  "level": "A1",
  "title": "문장뼈대(SVC/SVO)",
  "prerequisite": null,
  "difficultyTag": "core",
  "canDo": [
    "주어와 동사를 구분한다",
    "SVC와 SVO 문장을 만든다",
    "주어-동사 일치를 점검한다"
  ],
  "summary": "영어 기본 문장의 주어-동사-보어 또는 목적어 구조를 익힌다.",
  "patterns": ["S + V + C", "S + V + O"],
  "examples": ["The child is happy.", "The child plays a game."],
  "errorCodes": ["WO-01", "SV-01"],
  "masteryRule": {
    "quizAccuracy": 0.8,
    "productionPass": true,
    "errorTolerance": 0.2
  }
}
```

`difficulty-rules.json`에는 문서의 5×5 확률 행렬을 소수로, `reprioritize-rules.json`에는 `singleWrongBoost: 0.15`, `streakWrongBoost: 0.30`, `priorityWindow: 3`, `lowAccuracyThreshold: 0.60`, `groupBoost: 0.10`을 둔다. `spacing-rules.json`에는 동일 항목의 바로 다음 중복을 금지하는 `minimumGap: 1`을 둔다.

- [ ] **Step 5: 스키마와 CLI를 작성한다**

네 JSON Schema는 `schemaVersion`, 필수 필드, enum, 최소 예문 수를 표현한다. `scripts/validate-data.ts`는 `--mode=development|release`를 파싱하고 오류를 `CODE path: message` 형식으로 출력한 뒤 오류가 있으면 `process.exitCode = 1`로 설정한다.

- [ ] **Step 6: 개발 계약을 통과시키고 릴리스 계약이 수량 부족으로 실패함을 확인한다**

Run: `npm run validate:data && npm test -- tests/data-contract.test.ts`

Expected: development validation and data-contract tests pass.

Run: `npm run validate:release`

Expected: exit code 1 with exact `WORD_COUNT_MISMATCH` and `PHRASAL_COUNT_MISMATCH`; structural errors must be absent.

- [ ] **Step 7: 커밋한다**

```powershell
git add public/data scripts/validate-data.ts tests/data-contract.test.ts
git commit -m "feat(content): add validated learning catalog"
```

### Task 4: 버전 상태와 안전한 복원

**Files:**
- Create: `src/state/appState.ts`
- Create: `src/state/persistence.ts`
- Test: `src/state/persistence.test.ts`

- [ ] **Step 1: 정상 복원·손상 복구·구버전 이전 테스트를 작성한다**

```ts
test('손상된 저장값은 기본 상태와 경고로 복구한다', () => {
  const storage = memoryStorage({ wordMasterMainMenuState: '{bad json' })
  const result = loadAppState(storage)
  expect(result.state).toEqual(createInitialState())
  expect(result.warning).toMatch(/저장된 학습 상태/)
})

test('문서형 구버전 메뉴 상태를 version 1로 이전한다', () => {
  const storage = memoryStorage({
    wordMasterMainMenuState: JSON.stringify({ level: '초등학교', section: '학습', studyDifficulty: 'hard' }),
  })
  expect(loadAppState(storage).state.navigation.level).toBe('초등학교')
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/state/persistence.test.ts`

Expected: FAIL because persistence API is missing.

- [ ] **Step 3: 상태와 저장 API를 구현한다**

```ts
export const STORAGE_KEY = 'wordMasterMainMenuState'

export interface AppState {
  schemaVersion: 1
  navigation: NavigationState
  mastery: Record<string, WordMastery>
  mistakes: Record<string, MistakeRecord>
  studySessions: Partial<Record<Level, StudySessionSnapshot>>
  difficultyStats: Record<Difficulty, DifficultyStats>
  quizHistory: QuizSessionSummary[]
}

export function loadAppState(storage: Pick<Storage, 'getItem'>): LoadResult
export function saveAppState(storage: Pick<Storage, 'setItem'>, state: AppState): SaveResult
export function createInitialState(): AppState
```

로드 시 enum과 객체 형태를 검증한다. 원문 JSON이 손상되면 기본 상태와 경고를 반환하며 예외를 외부로 던지지 않는다. 저장 실패는 `{ ok: false, message }`로 반환한다.

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npm test -- src/state/persistence.test.ts`

Expected: all persistence tests passed.

- [ ] **Step 5: 커밋한다**

```powershell
git add src/state/appState.ts src/state/persistence.ts src/state/persistence.test.ts
git commit -m "feat(state): persist and recover learner progress"
```

### Task 5: 숙련도와 가중 학습 큐

**Files:**
- Create: `src/domain/progress/types.ts`
- Create: `src/domain/progress/mastery.ts`
- Test: `src/domain/progress/mastery.test.ts`
- Create: `src/domain/scheduler/difficulty.ts`
- Create: `src/domain/scheduler/queue.ts`
- Test: `src/domain/scheduler/queue.test.ts`

- [ ] **Step 1: 숙련도와 오답 보정 테스트를 작성한다**

```ts
test('정답 3회와 80% 이상이면 완료한다', () => {
  const mastery = [{ correct: true }, { correct: true }, { correct: true }].reduce(recordAttempt, emptyMastery())
  expect(isMastered(mastery)).toBe(true)
})

test('연속 오답 항목은 다음 큐 첫 3슬롯에 둔다', () => {
  const queue = buildStudyQueue(makeStudyItems(20), {
    selectedDifficulty: 'normal',
    mistakes: { w_0010: { wrongCount: 2, wrongStreak: 2, priorityRemaining: 3 } },
    limit: 20,
    random: seededRandom(7),
  })
  expect(queue.slice(0, 3).map((item) => item.id)).toContain('w_0010')
  expect(new Set(queue.map((item) => item.id)).size).toBe(queue.length)
})

test('정답률 60% 미만 난이도 그룹은 다음 세션 가중치에 0.10을 더한다', () => {
  expect(difficultyAccuracyBoost({ attempts: 5, correct: 2 })).toBe(0.1)
  expect(difficultyAccuracyBoost({ attempts: 5, correct: 3 })).toBe(0)
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/domain/progress/mastery.test.ts src/domain/scheduler/queue.test.ts`

Expected: FAIL because mastery and queue functions are missing.

- [ ] **Step 3: 최소 구현을 작성한다**

```ts
export function mistakeBoost(record?: MistakeRecord): number {
  if (!record) return 0
  if (record.wrongStreak >= 2) return 0.3
  return record.wrongCount >= 1 ? 0.15 : 0
}

export function difficultyAccuracyBoost(stats?: DifficultyStats): number {
  if (!stats || stats.attempts === 0) return 0
  return stats.correct / stats.attempts < 0.6 ? 0.1 : 0
}

export function isMastered(value: WordMastery): boolean {
  return value.attempts >= 3 && value.correct / value.attempts >= 0.8 && value.wrongStreak === 0
}
```

`buildStudyQueue`는 우선 항목을 한 번 앞에 놓고, 나머지를 `random() ** (1 / weight)` 키로 정렬하는 가중 비복원 샘플링을 사용한다. 항목 가중치는 선택 난이도 행렬 + 오답 boost + 해당 난이도 그룹의 정답률 boost로 계산한다. 500개 제한, 같은 ID 중복 금지, 최소 간격 1을 보장한다.

- [ ] **Step 4: 500개 경계와 결정론을 추가 검증한다**

```ts
test('600개 후보에서 정확히 500개를 중복 없이 반환한다', () => {
  const queue = buildStudyQueue(makeStudyItems(600), defaultQueueOptions({ random: seededRandom(11) }))
  expect(queue).toHaveLength(500)
  expect(new Set(queue.map(({ id }) => id)).size).toBe(500)
})
```

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `npm test -- src/domain/progress src/domain/scheduler`

Expected: all progress and scheduler tests passed.

- [ ] **Step 6: 커밋한다**

```powershell
git add src/domain/progress src/domain/scheduler
git commit -m "feat(study): schedule weighted review sessions"
```

### Task 6: 6종 퀴즈 엔진과 결과 집계

**Files:**
- Create: `src/domain/quiz/types.ts`
- Create: `src/domain/quiz/generate.ts`
- Create: `src/domain/quiz/grade.ts`
- Create: `src/domain/quiz/results.ts`
- Test: `src/domain/quiz/generate.test.ts`
- Test: `src/domain/quiz/grade.test.ts`
- Test: `src/domain/quiz/results.test.ts`

- [ ] **Step 1: 여섯 유형 생성 테스트를 먼저 작성한다**

```ts
test.each([
  'en-ko',
  'ko-en',
  'sentence-meaning',
  'sentence-blank',
  'dictation',
  'sentence-transform',
] as const)('%s 문항을 정답과 함께 만든다', (type) => {
  const [question] = generateQuiz(makeStudyItems(8), type, { count: 1, random: seededRandom(3) })
  expect(question.type).toBe(type)
  expect(question.correctAnswer).not.toBe('')
  expect(question.sourceItemId).toBeTruthy()
})
```

4지선다 유형은 보기 4개가 중복 없이 있어야 하고, 입력형은 대소문자·앞뒤 공백을 무시해야 한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/domain/quiz`

Expected: FAIL because quiz modules do not exist.

- [ ] **Step 3: 생성·채점·집계를 구현한다**

```ts
export type QuizType =
  | 'en-ko'
  | 'ko-en'
  | 'sentence-meaning'
  | 'sentence-blank'
  | 'dictation'
  | 'sentence-transform'

export function gradeAnswer(question: QuizQuestion, answer: string): GradedAnswer {
  const normalize = (value: string) => value.trim().toLocaleLowerCase('en-US').replace(/[.!?]+$/u, '')
  const isCorrect = normalize(answer) === normalize(question.correctAnswer)
  return { questionId: question.id, sourceItemId: question.sourceItemId, answer, isCorrect }
}
```

객관식 세 유형과 문장 빈칸 유형에는 4개 보기를 만들고, 받아쓰기·문장 변환은 직접 입력형으로 만든다. 결과 집계는 점수, 정답률, 유형별 맞음/틀림, 틀린 항목 ID를 반환한다.

- [ ] **Step 4: 오류 경로를 검증한다**

후보가 4개보다 적으면 `QuizGenerationError('QUIZ_POOL_TOO_SMALL')`를 던지는 테스트와, 동일 의미 때문에 보기가 부족한 경우 중복 보기를 만들지 않는 테스트를 추가한다.

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `npm test -- src/domain/quiz`

Expected: all six quiz types, grading, and result tests passed.

- [ ] **Step 6: 커밋한다**

```powershell
git add src/domain/quiz
git commit -m "feat(quiz): generate and grade six quiz modes"
```

### Task 7: 콘텐츠 로더와 정규화

**Files:**
- Create: `src/domain/content/normalize.ts`
- Create: `src/domain/content/loadCatalog.ts`
- Test: `src/domain/content/loadCatalog.test.ts`

- [ ] **Step 1: 성공·네트워크 실패·검증 실패 테스트를 작성한다**

```ts
test('일반 단어와 구동사를 하나의 학습 항목 목록으로 정규화한다', async () => {
  const result = await loadCatalog(fakeFetch(validResponses()))
  expect(result.itemsByLevel.기초.map(({ term }) => term)).toEqual(expect.arrayContaining(['baby', 'wake up']))
})

test('필수 파일 로드 실패를 사용자용 오류로 바꾼다', async () => {
  await expect(loadCatalog(fakeFetch({ '/data/wordlists/기초.json': 500 }))).rejects.toMatchObject({
    code: 'CONTENT_LOAD_FAILED',
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/domain/content/loadCatalog.test.ts`

Expected: FAIL because loader does not exist.

- [ ] **Step 3: 병렬 로더와 정규화를 구현한다**

```ts
export async function loadCatalog(fetcher: typeof fetch = fetch): Promise<RuntimeCatalog>
export function normalizeWord(item: WordItem): StudyItem[]
export function normalizePhrasalVerb(item: PhrasalVerbItem): StudyItem
```

모든 필수 URL은 `Promise.all`로 읽되, 실패 URL을 `ContentLoadError.path`에 보존한다. 런타임 검증 오류가 있으면 첫 오류와 전체 오류 수를 함께 제공한다. 단어의 품사별 entry는 검색에는 모두 유지하고 학습 항목은 단어 ID 기준으로 하나로 합친다.

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npm test -- src/domain/content/loadCatalog.test.ts`

Expected: loader tests passed without console warnings.

- [ ] **Step 5: 커밋한다**

```powershell
git add src/domain/content/normalize.ts src/domain/content/loadCatalog.ts src/domain/content/loadCatalog.test.ts
git commit -m "feat(content): load and normalize static learning data"
```

### Task 8: 앱 상태 컨텍스트와 메뉴 전이

**Files:**
- Create: `src/state/AppStateContext.tsx`
- Test: `src/state/AppStateContext.test.tsx`
- Create: `src/app/AppShell.tsx`
- Create: `src/app/Navigation.tsx`
- Create: `src/app/ContextNav.tsx`
- Create: `src/app/KpiStrip.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

- [ ] **Step 1: 메뉴 전이와 복원 테스트를 작성한다**

```tsx
test('학습을 누르면 레벨 메뉴를 열고 레벨 선택 즉시 학습으로 진입한다', async () => {
  render(<App />)
  await user.click(screen.getByRole('button', { name: '학습' }))
  await user.click(screen.getByRole('button', { name: '초등학교' }))
  expect(screen.getByRole('heading', { name: '초등학교 플래시카드 학습' })).toBeInTheDocument()
})

test('레벨 메뉴의 단어장은 최상위 메뉴가 아니라 컨텍스트 메뉴다', () => {
  render(<App />)
  expect(screen.getByRole('navigation', { name: '주 메뉴' })).not.toHaveTextContent('단어장')
  expect(screen.getByRole('navigation', { name: '레벨 메뉴' })).toHaveTextContent('단어장')
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/app/App.test.tsx src/state/AppStateContext.test.tsx`

Expected: FAIL because navigation components and reducer are absent.

- [ ] **Step 3: reducer와 의미론적 메뉴를 구현한다**

액션은 `SELECT_LEVEL`, `SELECT_PRIMARY`, `SELECT_CONTEXT`, `SELECT_GRAMMAR_LEVEL`, `SELECT_GRAMMAR_NODE`, `SET_DIFFICULTY`, `SET_QUIZ_TYPE`, `SAVE_STUDY_SESSION`, `RECORD_STUDY`, `RECORD_QUIZ`로 고정한다. 각 전이 후 `saveAppState`를 실행한다. `RECORD_QUIZ`는 난이도 통계와 최근 7회 오답 패턴을 함께 갱신하고, 더 오래된 세부 응답은 세션 요약만 남긴다. 메뉴는 `aria-current="page"`, 실제 `<button>`, 고유한 navigation label을 사용한다.

- [ ] **Step 4: KPI를 상태에서 계산한다**

`KpiStrip`은 현재 화면, 현재 레벨의 대표/목표 항목 수(`8 / 목표 500` 형식), 완료율을 보여준다. 개발 데이터 수량을 100% 콘텐츠로 표시하지 않는다.

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `npm test -- src/app src/state`

Expected: menu, restore, and reducer tests passed.

- [ ] **Step 6: 커밋한다**

```powershell
git add src/app src/state
git commit -m "feat(app): add persistent menu navigation"
```

### Task 9: 대시보드·단어장·문법·소설 화면

**Files:**
- Create: `src/features/dashboard/Dashboard.tsx`
- Create: `src/features/wordbook/Wordbook.tsx`
- Create: `src/features/grammar/GrammarView.tsx`
- Create: `src/features/story/StoryView.tsx`
- Create: `src/components/ProgressBar.tsx`
- Test: `src/features/dashboard/Dashboard.test.tsx`
- Test: `src/features/wordbook/Wordbook.test.tsx`
- Test: `src/features/grammar/GrammarView.test.tsx`
- Test: `src/features/story/StoryView.test.tsx`

- [ ] **Step 1: 네 화면의 사용자 행동 테스트를 작성한다**

```tsx
test('단어와 구동사를 같은 검색 결과에 표시한다', async () => {
  render(<Wordbook level="기초" catalog={catalog} />)
  await user.type(screen.getByRole('searchbox'), 'up')
  expect(screen.getByText('wake up')).toBeInTheDocument()
})

test('문법 레벨과 노드를 선택해 상세를 바꾼다', async () => {
  render(<GrammarView nodes={grammarNodes} />)
  await user.click(screen.getByRole('button', { name: 'A2' }))
  await user.click(screen.getByRole('button', { name: /A2-G01/ }))
  expect(screen.getByRole('heading', { name: /미래/ })).toBeInTheDocument()
})
```

대시보드는 완료·미완료·오답 수와 실제 오답 단어 목록을 검증한다. 오답 항목의 `다시 학습`과 `오답 퀴즈` 버튼은 해당 ID 집합을 각각 학습·퀴즈 후보로 전달한다. 소설은 본문과 대표 데이터 커버리지 100%를 검증한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/features/dashboard src/features/wordbook src/features/grammar src/features/story`

Expected: FAIL because feature views do not exist.

- [ ] **Step 3: 필터링과 상세 화면을 구현한다**

검색은 단어·lemma·한국어 의미·구동사에 대해 대소문자와 앞뒤 공백을 무시한다. 대시보드는 진행률과 완료·미완료 분류, 오답 노트 목록, 오답만 재학습/재퀴즈하는 동작을 제공한다. 문법 상세는 Can-do 3개, 패턴, 예문, 오류 코드, 통과 기준, 이전/다음 이동을 표시한다. 소설은 `isManual`, `coverageRate`, 사용 단어 목록을 표시한다.

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npm test -- src/features/dashboard src/features/wordbook src/features/grammar src/features/story`

Expected: all content-view tests passed.

- [ ] **Step 5: 커밋한다**

```powershell
git add src/features/dashboard src/features/wordbook src/features/grammar src/features/story src/components/ProgressBar.tsx
git commit -m "feat(content): add learning reference views"
```

### Task 10: 플래시카드 학습 화면과 TTS

**Files:**
- Create: `src/features/study/Flashcard.tsx`
- Create: `src/features/study/DifficultyPicker.tsx`
- Create: `src/features/study/StudyView.tsx`
- Test: `src/features/study/StudyView.test.tsx`

- [ ] **Step 1: 카드 뒤집기·평가·TTS 실패 테스트를 작성한다**

```tsx
test('카드를 뒤집으면 의미와 예문을 함께 보여준다', async () => {
  render(<StudyView items={items} state={state} dispatch={dispatch} speech={speech} />)
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  expect(screen.getByText('아기')).toBeInTheDocument()
  expect(screen.getByText('The baby is happy.')).toBeInTheDocument()
})

test('난이도 선택은 숙련도를 저장하고 다음 카드로 이동한다', async () => {
  render(<StudyView items={items} state={state} dispatch={dispatch} speech={speech} />)
  await user.click(screen.getByRole('button', { name: '어려움' }))
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'RECORD_STUDY' }))
})

test('세션 중 난이도를 바꾸고 레벨을 왕복해도 카드 위치를 복원한다', async () => {
  render(<StudyView items={items} state={stateWithSavedIndex(4)} dispatch={dispatch} speech={speech} />)
  expect(screen.getByText('5 / 10')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '아주어려움' }))
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_DIFFICULTY', difficulty: 'veryHard' }))
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SAVE_STUDY_SESSION' }))
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/features/study/StudyView.test.tsx`

Expected: FAIL because study components do not exist.

- [ ] **Step 3: 학습 화면을 구현한다**

`StudyView`는 레벨별 `studySessions`에 저장된 큐 ID와 현재 인덱스를 우선 복원하고, 없을 때만 `buildStudyQueue(..., limit: 500)`로 새 큐를 만든다. 카드 평가·난이도 전환·화면 이탈 때 `SAVE_STUDY_SESSION`을 dispatch한다. 카드 앞면은 영어·IPA, 뒷면은 모든 대표 의미와 예문을 함께 표시한다. 카드 전체가 하나의 키보드 조작 가능한 버튼이며 뒤집힌 상태를 `aria-pressed`로 표시한다.

TTS는 `speechSynthesis.speak(new SpeechSynthesisUtterance(term))`을 얇은 `SpeechPort` 인터페이스 뒤에서 호출한다. 미지원 또는 예외 시 `발음 재생을 지원하지 않는 브라우저입니다.`를 화면에 표시하되 학습은 계속한다.

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npm test -- src/features/study/StudyView.test.tsx`

Expected: flashcard, rating, progress, and TTS fallback tests passed.

- [ ] **Step 5: 커밋한다**

```powershell
git add src/features/study
git commit -m "feat(study): add accessible flashcard sessions"
```

### Task 11: 퀴즈 화면·즉시 피드백·학습 연동

**Files:**
- Create: `src/features/quiz/QuizQuestion.tsx`
- Create: `src/features/quiz/QuizResults.tsx`
- Create: `src/features/quiz/QuizView.tsx`
- Test: `src/features/quiz/QuizView.test.tsx`
- Test: `src/features/quiz/quiz-study.integration.test.tsx`

- [ ] **Step 1: 수동 진행과 즉시 피드백 테스트를 작성한다**

```tsx
test('답을 고르면 즉시 공개하지만 다음문제 전에는 이동하지 않는다', async () => {
  render(<QuizView items={items} quizType="en-ko" dispatch={dispatch} />)
  const prompt = screen.getByTestId('quiz-prompt').textContent
  await user.click(screen.getByRole('button', { name: '틀린 보기' }))
  expect(screen.getByRole('status')).toHaveTextContent(/정답/)
  expect(screen.getByTestId('quiz-prompt')).toHaveTextContent(prompt ?? '')
  await user.click(screen.getByRole('button', { name: '다음문제' }))
  expect(screen.getByTestId('quiz-prompt')).not.toHaveTextContent(prompt ?? '')
})
```

- [ ] **Step 2: 퀴즈 오답→학습 큐 통합 테스트를 작성한다**

오답을 `RECORD_QUIZ`로 저장한 뒤 같은 상태로 `buildStudyQueue`를 호출해 해당 ID가 첫 3슬롯에 들어가는지 검증한다. 한 번 오답은 boost 0.15, 연속 두 번은 boost 0.30과 `priorityRemaining: 3`을 검증한다.

- [ ] **Step 3: 실패를 확인한다**

Run: `npm test -- src/features/quiz`

Expected: FAIL because quiz UI is absent.

- [ ] **Step 4: 유형 선택·문항·결과를 구현한다**

6개 유형 버튼은 한국어 전체 이름을 표시한다. 객관식은 답 선택 후 모든 보기를 잠그고 정답/오답 이유를 알린다. 입력형은 제출 후 입력을 잠근다. `다음문제`는 채점 전 비활성, 마지막 문제에서는 `결과 보기`로 바뀐다. 결과에는 점수, 정답률, 문항별 히트맵, 틀린 단어, 유형별 오답 수를 표시한다.

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `npm test -- src/features/quiz`

Expected: six render modes, manual next, results, and study-link integration tests passed.

- [ ] **Step 6: 커밋한다**

```powershell
git add src/features/quiz src/domain/progress src/state
git commit -m "feat(quiz): connect quiz mistakes to study review"
```

### Task 12: 전체 앱 연결과 오류 화면

**Files:**
- Create: `src/components/LoadingState.tsx`
- Create: `src/components/ErrorState.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.integration.test.tsx`

- [ ] **Step 1: 로딩·오류·핵심 동선 통합 테스트를 작성한다**

```tsx
test('콘텐츠 로딩 실패 시 경로와 재시도 버튼을 보여준다', async () => {
  render(<App loadCatalog={() => Promise.reject(new ContentLoadError('/data/wordlists/기초.json'))} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('학습 콘텐츠를 불러오지 못했습니다')
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
})

test('레벨 대시보드에서 단어장과 학습, 퀴즈까지 이동한다', async () => {
  render(<App loadCatalog={resolvedCatalog} />)
  await screen.findByText('기초 학습 대시보드')
  await user.click(screen.getByRole('button', { name: '단어장' }))
  expect(screen.getByRole('searchbox')).toBeInTheDocument()
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/app/App.integration.test.tsx`

Expected: FAIL because async app composition is not complete.

- [ ] **Step 3: 모든 화면을 상태 기반으로 연결한다**

`App`은 콘텐츠 로딩 상태를 `loading/error/ready`로 구분한다. `section`과 컨텍스트에 따라 대시보드·소설·단어장·문법·학습·퀴즈를 한 번에 하나만 렌더링한다. 재시도는 새 로드 Promise를 만들고, 손상 상태 경고와 저장 실패 경고는 닫을 수 있는 status 메시지로 표시한다.

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npm test -- src/app`

Expected: smoke, navigation, async error, and full-flow tests passed.

- [ ] **Step 5: 커밋한다**

```powershell
git add src/app src/components
git commit -m "feat(app): connect the complete learning flow"
```

### Task 13: 시각 디자인·반응형·접근성

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/styles/components.css`
- Modify: `src/main.tsx`
- Modify: all `src/app/*.tsx` and `src/features/**/*.tsx` only where class names or accessibility attributes are needed
- Test: affected `*.test.tsx`

- [ ] **Step 1: 접근성 상태 테스트를 먼저 추가한다**

```tsx
test('활성 메뉴와 카드 상태를 보조기기에 노출한다', async () => {
  render(<App loadCatalog={resolvedCatalog} />)
  expect(await screen.findByRole('button', { name: '기초' })).toHaveAttribute('aria-current', 'page')
  await user.click(screen.getByRole('button', { name: /카드 뒤집기/ }))
  expect(screen.getByRole('button', { name: /카드 뒤집기/ })).toHaveAttribute('aria-pressed', 'true')
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/app src/features`

Expected: new accessibility assertions fail before markup updates.

- [ ] **Step 3: 토큰과 레이아웃을 구현한다**

시각 방향은 어린이용 장난감 UI가 아니라 오래 학습해도 피로가 적은 `editorial study desk`로 고정한다. 따뜻한 종이색 배경, 잉크색 본문, 청록 포인트, 오답용 적갈색을 사용한다. 제목은 개성 있는 serif 계열 시스템 fallback, 본문은 Pretendard/Noto Sans KR/system sans를 사용한다. 카드 경계, 충분한 여백, 선명한 키보드 focus ring, 44px 이상 터치 대상을 둔다.

`min-width: 900px`에서 2열, 그 아래에서 1열로 바꾸고, 520px 아래에서는 메뉴를 가로 스크롤 가능한 칩 행으로 만든다. `prefers-reduced-motion`에서는 카드 전환을 제거한다. 색상만으로 정오답이나 활성 상태를 구분하지 않는다.

- [ ] **Step 4: 테스트와 빌드를 확인한다**

Run: `npm test && npm run lint && npm run build`

Expected: all tests pass, lint has 0 errors, build exits 0.

- [ ] **Step 5: 커밋한다**

```powershell
git add src/styles src/main.tsx src/app src/features
git commit -m "feat(ui): polish the responsive learning experience"
```

### Task 14: 문서화와 최종 품질 게이트

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `DEVELOPMENT_PLAN.md`
- Modify: `docs/superpowers/specs/2026-07-10-wordmaster-vertical-slice-design.md` only to update status if every acceptance criterion passes

- [ ] **Step 1: 운영 문서를 작성한다**

`README.md`에는 설치, 개발 서버, 테스트, 데이터 검증, 빌드, 정적 배포, 개발 데이터 수량과 릴리스 수량의 차이를 기록한다. `DEVELOPMENT_PLAN.md`에는 완료된 수직 슬라이스와 남은 검수 콘텐츠를 구분한다. `.gitignore`에는 `node_modules/`, `dist/`, `coverage/`, `.vite/`, `*.log`, `.env*`를 포함하고 `.env.example`은 예외로 둔다.

- [ ] **Step 2: 요구사항 추적 검사를 한다**

아래 항목을 실제 테스트 이름과 화면으로 대조한다.

```text
메뉴/컨텍스트 상태 전이
새로고침 복원
단어+구동사 검색
42개 문법 노드 탐색
500개 비복원 학습 큐
카드 의미+예문 동시 노출
5단계 난이도
TTS 실패 대체
6종 퀴즈
즉시 채점+수동 다음
+15%/+30% 오답 보정
결과 점수/정답률/히트맵/오답 유형
개발/릴리스 데이터 검증 분리
```

- [ ] **Step 3: 전체 검증을 새로 실행한다**

Run: `npm run check`

Expected: development validation passes, lint 0 errors, all tests 0 failures, production build exit code 0.

Run: `npm run validate:release`

Expected: 수량 부족 코드만으로 exit code 1. 이 명령은 전체 5,000단어·1,000구동사 콘텐츠가 검수되기 전까지 의도적으로 실패한다.

- [ ] **Step 4: 브라우저 핵심 동선을 검증한다**

Run: `npm run dev -- --host 127.0.0.1`

브라우저에서 데스크톱과 390px 모바일 폭으로 다음을 실행한다: 기초 대시보드 → 단어장 검색 `wake up` → 학습 카드 뒤집기 및 난이도 기록 → 퀴즈 오답 → 다음문제 → 결과 → 학습 재진입 시 우선 노출 → 새로고침 상태 유지. 콘솔 오류와 잘린 UI가 없어야 한다.

- [ ] **Step 5: 최근 변경을 자체 리뷰한다**

Run: `git diff main...HEAD --check`

Expected: whitespace errors 0. 이어서 diff를 요구사항별로 읽고, 테스트 없이 추가된 행동이나 범위 밖 리팩터링을 제거한다.

- [ ] **Step 6: 커밋한다**

```powershell
git add .gitignore README.md DEVELOPMENT_PLAN.md docs/superpowers/specs/2026-07-10-wordmaster-vertical-slice-design.md
git commit -m "docs: explain development and content release gates"
```

## 완료 판단

수직 슬라이스는 `npm run check`와 브라우저 핵심 동선이 모두 통과할 때 완료다. `npm run validate:release`의 목표 수량 실패는 숨기지 않고 별도 잔여 콘텐츠 작업으로 보고한다. 5,000단어·1,000구동사·42개 장문 문법·4개 완전 소설은 검수 콘텐츠 프로젝트이며, 이 계획의 완료와 제품 전체 콘텐츠 완료를 동일하게 표현하지 않는다.
