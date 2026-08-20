# 영단어 5000 마스터

기초부터 중학교까지 단어·구동사·문법을 학습하고, 퀴즈 오답을 다음 학습 순서에 반영하는 정적 React 웹 앱입니다. 현재 저장소에는 개발계획의 앱 흐름을 구현한 정적 앱, 목표 수량 카탈로그, 오프라인 단일 파일 배포본이 함께 들어 있습니다.

운영 사이트: [`https://archimentor.github.io/EnglishWords/`](https://archimentor.github.io/EnglishWords/)

> 현재 카탈로그는 단어 5,000개(기초 500·유치원 500·초등학교 1,500·중학교 2,500), 구동사 1,000개(레벨별 250), 문법 노드 42개, 승인 소설 4개입니다. 각 레벨 읽기 패키지는 도입·갈등·전환·결말이 이어지는 본편과 접이식 일반 단어·구동사 확장 장면을 분리하면서, 그 레벨 통합 단어장 전체를 빠짐없이 사용합니다. reviewer·reviewedAt·전체 payload digest가 고정된 승인 정본(`isManual: true`)입니다.

## 제공 기능

- 기초·유치원·초등학교·중학교 대시보드와 레벨별 서사형 소설·일반 단어/구동사 전체 확장 장면·통합 단어장, 완료·미완료 개별 목록
- 품사별 뜻·형태·예문을 보존한 일반 단어와 구동사의 통합 검색 및 종류별 필터
- A1~C1, 총 42개 문법 노드의 진단→연습→수준별 구조화 산출→재진단 흐름과 관련 카탈로그 어휘 연결
- 상단 `학습`→레벨 선택, `퀴즈`→레벨 선택→6종 유형 선택의 명시적 진입 흐름
- 단어·구동사를 합친 최대 500개 비복원 학습 큐
- 의미와 예문을 함께 여는 플래시카드, 5단계 난이도, 학습·소설 TTS 대체 안내
- 4지선다·문장 문맥·받아쓰기·문장 변환을 포함한 6종 적응형 퀴즈
- 즉시 채점·시도/숙련도 저장·유형별 오답 이유와 정답 해설 후 명시적 `다음문제` 진행
- 1회 오답 +15%, 연속 2회 이상 +30% 가중치, 중단한 퀴즈도 잃지 않는 즉시 복습 예약과 최소 간격 뒤 첫 3슬롯 우선 노출
- 점수·정답률·히트맵·유형별 결과·오답 복습, 현재 레벨의 퀴즈 난이도별 시도·정답과 선택 난이도·실제 노출·오답 재노출 분석
- 일별 학습·항목별 ease/다음 복습·문항 반응시간·유형별 정확도/재노출 효율·세션/큐 이력을 함께 보존하는 상태 v7·추적 v2와 대시보드
- 문법 진단·오류·산출 검토 상태에 따른 다음 학습/재진단/선행 복습 추천과 취약 문법 관련 어휘의 학습·퀴즈 재가중
- `localStorage.wordMasterMainMenuState`를 통한 메뉴·세션·숙련도 복원과 손상·이전 저장 원문의 복구 백업
- 키보드 내비게이션, 스킵 링크, 라이브 상태 안내, 390px 반응형 UI

## 기술 구성

- React 19, TypeScript 6, Vite 8
- Vitest, React Testing Library, ESLint
- `public/data` 정적 JSON과 런타임 TypeScript 검증, 학습자 상태 v7·추적 v2 공개 계약
- 서버 계정 없이 브라우저 `localStorage`에 사용자 진행 상태 저장

## 시작하기

사이트를 바로 보려면 저장소 루트의 `index.html`을 더블클릭하면 됩니다. 이 파일 자체에 앱 코드·스타일·학습 콘텐츠가 모두 포함되어 있어, 별도 서버·`dist` 폴더·의존성 설치·인터넷 연결이 필요하지 않습니다.

브라우저가 `file://` 문서의 `localStorage` 접근을 막더라도 사이트는 중단되지 않고 탭 메모리로 동작하며 화면에 경고를 표시합니다. 이 경우 진행 상태는 현재 탭에만 남고 새로고침하면 초기화될 수 있으므로, 진행 상태를 계속 보존하려면 개발 서버나 HTTPS 정적 호스트로 실행합니다.

개발하거나 배포 파일을 다시 만들 때는 Node.js와 npm이 필요합니다. 설치된 도구가 지원하는 Node 범위는 `^20.19.0 || ^22.13.0 || >=24.0.0`이며, 현재 품질 게이트는 Node.js 24와 npm 11에서 검증했습니다. 별도 백엔드나 환경 변수는 필요하지 않습니다.

```powershell
npm ci
npm run dev
```

기본 주소는 `http://localhost:5173`입니다. 포트가 사용 중이면 Vite가 출력한 주소를 사용합니다. 다른 기기에서도 확인하려면 다음과 같이 호스트를 지정할 수 있습니다.

```powershell
npm run dev -- --host 0.0.0.0
```

개발 서버는 코드 변경을 즉시 반영하기 위한 개발 모드입니다. 설치 없이 실행할 배포본은 다음처럼 만듭니다.

```powershell
npm run build
```

빌드는 CSS, IIFE 앱 코드, 콘텐츠 카탈로그를 모두 인라인한 단일 파일을 만들고, 루트 `index.html`과 `dist/index.html`을 바이트 단위로 동일하게 갱신합니다. 어느 파일을 더블클릭해도 `file://`에서 localhost 없이 실행됩니다.

단일 파일의 잠금·승격은 1회성 빌드를 기준으로 직렬화되므로 `vite build --watch`는 의도적으로 거부합니다. 변경 감시 개발에는 `npm run dev`를 사용합니다. 출력 경로도 저장소의 `dist`로 고정되며 임의 `--outDir`은 안전하게 실패합니다.

`npm run build`가 실행되는 동안에는 Vite가 잠금을 획득하기 전에 구성 모듈을 먼저 불러오므로 `vite.config.ts`와 이 파일이 가져오는 로컬 빌드 모듈을 수정하지 않습니다.

## 명령어

| 명령 | 용도 | 성공 기준 |
| --- | --- | --- |
| `npm run dev` | 개발 서버 실행 | 앱과 `public/data`를 로드 |
| `npm test` | 전체 단위·통합 테스트 1회 실행 | 실패 0개 |
| `npm run test:watch` | 변경 감시 테스트 | 개발 중 반복 실행 |
| `npm run lint` | 정적 코드 검사 | 오류 0개 |
| `npm run validate:data` | 현재 카탈로그의 구조·참조 검증 | exit code 0 |
| `npm run validate:release` | 목표 수량과 소설 수동 검수 완료를 포함한 릴리스 검증 | 승인 콘텐츠 기준 exit code 0 |
| `npm run content:build` | 단어·구동사·소설·provenance 전체 세대 재생성 | 승인 입력이 있는 소설은 보존하고 누락 레벨만 자동 초안으로 만든 뒤, 전체 검증을 통과한 디렉터리 세대를 함께 교체 |
| `npm run content:fetch:phrasals` | 구동사 재현 테스트에 필요한 고정 원천 5개만 다운로드 | 각 원천의 고정 URL과 SHA-256이 모두 일치 |
| `npm run content:approve:stories -- --reviewer=<name> --reviewed-at=<UTC ISO> --confirm-user-approved` | 사용자가 명시적으로 승인한 네 자동 초안을 단일 정본 경로에 기록 | 확인 플래그·검수자·정규 UTC 시각이 모두 있을 때만 digest-valid 승인 파일 생성 |
| `npm run content:propose:phrasals` | 후속 전수 감사용 schema-v4 구동사 후보 생성 | `.content-cache/phrasal-gloss-candidates.json`만 작성하고 정본은 변경하지 않음 |
| `npm run build` | 타입 검사 후 프로덕션 번들 생성 | `dist/` 생성, exit code 0 |
| `npm run verify:offline` | 루트·배포 index 동일성, 단일 파일 구조, JSDOM `file://` 렌더 검증 | 외부 자산 없이 초기 대시보드와 학습 화면 렌더 |
| `npm run test:browser` | Playwright 데스크톱·모바일 및 루트 `file://` 핵심 동선 검증 | 브라우저 오류 없이 전 시나리오 통과 |
| `npm run check` | 개발 데이터 검증, lint, 테스트, 빌드, 오프라인 실행 검증 | 모든 단계 성공 |

`npm test`는 Vitest 설정에서 `.worktrees`와 `tests/browser`를 제외하고 현재 checkout의 단위·통합 테스트만 실행합니다. 브라우저 시나리오는 `npm run test:browser`가 별도로 실행하며, 품질 게이트는 문서에 고정한 테스트 개수가 아니라 각 명령의 실패 0개를 기준으로 합니다.

## 데이터 검증 모드

두 검증 모드는 역할이 다릅니다.

- `development`: JSON 구조, 필수 필드, ID·레벨·워드패밀리·구동사 참조, NFKC·공백·대소문자 정규화 기준의 전역 예문 중복, 본편 서사 구조와 본편+일반 단어 장면+구동사 장면의 통합 단어장 전체 커버리지를 검사합니다. 일반 단어 장면은 검증된 카탈로그 예문을 장면 속 기록·대화로 사용하고, 구동사 장면은 해당 레벨 250개 ID·표현·정확한 카탈로그 예문을 각각 한 번 추적합니다. 감사된 예문 바깥의 서사 프레임은 카탈로그에 등록된 모든 품사의 형태를 대상으로 가장 낮은 소유 레벨을 강제하며, 고정 주인공 이름 `Mina`와 그 소유격 외 비카탈로그 토큰을 거부합니다. 현재 수량 `words=5000`, `phrasalVerbs=1000`, `grammarNodes=42`, `stories=4`로 통과합니다.
- `release`: 위 검사에 레벨별 정확한 목표 수량과 소설의 수동 검수 완료 플래그를 추가합니다. 단어는 기초 500, 유치원 500, 초등학교 1,500, 중학교 2,500개이며, 구동사는 레벨별 250개씩 총 1,000개여야 합니다.

목표 수량과 네 소설의 승인 조건은 모두 충족합니다. `scripts/content/manual-stories/<레벨>.approved.json` 정본에는 reviewer·reviewedAt·원문 digest가 기록되어 있고, 현재 `npm run validate:release`는 exit code 0입니다. 승인 뒤 소설 본문을 수정하면 digest 검증이 실패하므로 수정본은 다시 검수·승인해야 합니다.

수동 소설 승인은 `public/data/stories`를 직접 고치는 방식이 아닙니다. 승인 입력에는 reviewer, UTC ISO reviewedAt, 정확한 `storyText` 본편·`vocabularyPracticeText` 일반 단어 장면·`phrasalVerbPracticeText` 구동사 장면·`usedWords`·`usedPhrasalVerbs`를 모두 묶은 SHA-256 source digest가 필수이며, 파일이 없는 레벨은 언제나 `isManual: false` 자동 초안으로 되돌아갑니다. 빌드는 이 메타데이터와 digest, 새 카탈로그에 대한 서사·형태·레벨·통합 커버리지를 검증하고 provenance에 `approved-manual-input` 또는 `automated-draft`를 레벨별로 기록합니다. 형식과 digest 생성 방법은 `scripts/content/manual-stories/README.md`와 `approved-story.example.json`을 따릅니다.

구동사 릴리스 입력은 `scripts/content/phrasal-glosses.json` 한 파일입니다. schema v5 정본은 1,000행 전수 기계 보조 감사, 명시적 영어 정의, 예문별 출처, 미해결 교차참조 0건을 강제하며 사람 편집 승인을 주장하지 않습니다. 모델 출력은 임시 후보일 뿐이고 정본을 덮어쓸 수 없습니다.

| 레벨 | 일반 단어 / 목표 | 구동사 / 목표 | 소설 읽기 패키지 통합 커버리지 |
| --- | ---: | ---: | ---: |
| 기초 | 500 / 500 | 250 / 250 | 750 / 750 |
| 유치원 | 500 / 500 | 250 / 250 | 750 / 750 |
| 초등학교 | 1,500 / 1,500 | 250 / 250 | 1,750 / 1,750 |
| 중학교 | 2,500 / 2,500 | 250 / 250 | 2,750 / 2,750 |
| 합계 | 5,000 / 5,000 | 1,000 / 1,000 | 6,000 / 6,000 |

## 정적 배포

```powershell
npm ci
npm run check
npm run test:browser
npm run validate:release
```

세 품질 명령이 모두 성공한 뒤 생성된 `dist/index.html` 한 파일을 정적 호스트의 사이트 루트에 배포합니다. 로컬 세 명령, 공개 저장소 `Archimentor/EnglishWords`의 원격 `main` 게시, [Pages workflow](https://github.com/Archimentor/EnglishWords/actions), production URL 브라우저 카나리가 모두 성공했습니다.

```powershell
npm run build -- --base=/english-words/
```

앱은 클라이언트 라우터를 사용하지 않아 별도의 SPA fallback 규칙이 필요하지 않습니다. `dist/index.html`은 모든 런타임 자산을 포함해 더블클릭으로도 실행되며, 배포 전 로컬 번들은 `npx vite preview`로도 확인할 수 있습니다. 빌드 뒤 `npm run verify:offline`이 외부 스크립트·스타일 참조가 없는지와 실제 초기 렌더를 검사합니다.

`.github/workflows/pages.yml`은 pull request와 `main` push에서 `npm run check`, Playwright 브라우저 테스트, `npm run validate:release`를 실행하고, `main`에서 모든 게이트가 통과한 경우에만 GitHub Pages artifact를 배포하도록 구성되어 있습니다. 이번 릴리스는 원격 Actions 검증·배포 성공과 production URL smoke test를 각각 확인했습니다.

## 상태와 브라우저 동작

- 현재 상태 스키마는 버전 7, 내부 추적 스키마는 버전 2이며 저장 키는 `localStorage.wordMasterMainMenuState`입니다. 유효한 버전 1~6과 초기 메뉴 전용 형식은 버전 7로 이전합니다. 버전 4의 전역 퀴즈 난이도별 시도·정답 및 학습 분석은 당시 `navigation.level` 버킷으로 보존되고, 버전 5는 빈 추적 상태를 추가해 버전 6을 거칩니다. 버전 6의 문법 산출은 문장 문자열 근거 형식이므로 버전 7의 구조화 근거로 추정 변환하지 않습니다. 대신 누적 산출 시도·재시도·오류 통계는 보존하고, 기존 산출 승인·재진단 결과·연속 오류·완료 게이트만 초기화하여 새 근거로 다시 검수하게 합니다. 버전 7은 A1 4~6문장, A2 6~8문장, B1 8~12문장, B2 네 단락·복합문 근거 3개, C1 동일 내용의 업무/학술 두 레지스터와 최대 2회 자체 교정을 구조화하여 저장합니다. 이전·회복 내역은 `public/data/DEVELOPMENT/migration-history.json`, 계약은 `public/data/schema/learner-state.schema.json`과 `tracker.schema.json`에 고정됩니다.
- 계정과 클라우드 동기화가 없으므로 다른 브라우저나 기기로 진행도가 자동 이동하지 않습니다.
- 앱 시작 시 저장값이 손상되었거나 이전 버전에서 마이그레이션되면 그 원문을 `localStorage.wordMasterMainMenuState:recoveryBackup`에 바이트 그대로 보존하고, 경고에서 원문 확인·내려받기를 제공합니다. 정상 버전 7 값을 갱신할 때마다 백업하는 기능은 아니며, 사이트 데이터 삭제·시크릿 모드 종료·배포 origin 변경까지 보호하는 외부 백업이나 기기 간 동기화도 아닙니다.
- 브라우저 Web Speech API가 없거나 음성 재생이 실패해도 텍스트 의미·예문 학습은 계속됩니다.
- 손상된 저장값, 저장 용량 오류, `localStorage` 접근 실패는 앱을 중단하지 않고 화면 경고로 안내합니다. 저장 중 실패하면 현재 상태를 탭 메모리로 옮겨 학습을 계속합니다.

## 프로젝트 구조

```text
.github/workflows/             검증 및 GitHub Pages 배포 워크플로
public/data/                 정적 학습 콘텐츠·스키마·엔진 규칙
scripts/                     디스크 데이터 로더와 검증 CLI
scripts/content/manual-stories/  사람이 검수한 소설 승인 정본(단일 입력 경로)
src/app/                     앱 셸, 내비게이션, 콘텐츠 로딩·통합
src/components/              공용 상태·진행률 컴포넌트
src/domain/                  콘텐츠·스케줄러·퀴즈·숙련도 순수 로직
src/features/                대시보드·단어장·문법·소설·학습·퀴즈 화면
src/state/                   버전 상태, reducer, 저장·복원
src/styles/                  디자인 토큰과 반응형 스타일
tests/                       실제 JSON 데이터 계약 및 Playwright 브라우저 테스트
docs/superpowers/            승인된 설계와 실행 계획
```

## 콘텐츠를 추가할 때

1. `public/data/wordlists`, `phrasal-verbs`, `grammar`, `stories`의 기존 스키마를 유지합니다. JSON Schema는 편집 계약 참고 자료이고, 실제 앱 로드는 TypeScript 런타임 validator가 차단합니다. `learner-state.schema.json`과 `tracker.schema.json`, `engine/*.json`, `DEVELOPMENT/*.json`은 저장·가중치·이전 계약을 실행 코드와 동기화합니다.
2. 레벨 간 단어 중복과 워드패밀리 원형 중복을 만들지 않습니다.
3. 구동사 전체 목록과 레벨별 참조를 함께 갱신합니다.
4. 소설 본편의 사건 흐름과 본편+일반 단어 장면+구동사 장면의 통합 커버리지 메타데이터·실제 사용 예문을 함께 검수합니다. 모든 일반 단어와 해당 레벨 구동사 250개가 있어야 하며, 감사된 카탈로그 예문 바깥의 서사 프레임은 레벨 소유권을 지켜야 합니다.
5. 사람의 최종 검수가 끝난 읽기 패키지만 `scripts/content/manual-stories/<레벨>.approved.json`에 reviewer·reviewedAt·source digest와 함께 기록합니다. `public/data`의 플래그만 바꾸는 것은 승인이 아닙니다.
6. 원천 캐시가 준비된 경우 개별 산출물을 따로 덮어쓰지 말고 `npm run content:build`로 전체 세대를 검증·교체합니다.
7. `npm run validate:data`와 `npm run check`를 통과시킵니다.
8. 목표 수량과 현재 네 소설 승인은 충족했습니다. 이후 소설을 수정하면 승인 digest도 사람 재검수 뒤 갱신하고, `npm run validate:release` 통과를 콘텐츠 릴리스 조건으로 사용합니다.

완료 범위와 남은 콘텐츠 로드맵은 [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), 제품 원문 요구사항은 `개발계획.md`, `개발(구조).md`, `개발(문법).md`에서 확인할 수 있습니다. 채택된 수직 슬라이스의 상세 기준과 실행 기록은 `docs/superpowers/specs/2026-07-10-wordmaster-vertical-slice-design.md`와 `docs/superpowers/plans/2026-07-10-wordmaster-vertical-slice.md`에 있습니다.
