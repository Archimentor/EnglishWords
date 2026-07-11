# 영단어 5000 마스터

기초부터 중학교까지 단어·구동사·문법을 학습하고, 퀴즈 오답을 다음 학습 순서에 반영하는 정적 React 웹 앱입니다. 현재 저장소에는 전체 제품 흐름을 검증하는 **수직 슬라이스**와 대표 개발 데이터가 들어 있습니다.

> 현재 개발 데이터는 단어 32개, 구동사 8개, 문법 노드 42개, 소설 4개입니다. 앱과 개발 품질 게이트는 완성되어 있지만, 5,000단어·1,000구동사 전체 검수 콘텐츠는 아직 릴리스 준비 상태가 아닙니다.

## 제공 기능

- 기초·유치원·초등학교·중학교 대시보드와 레벨별 소설·단어장
- 일반 단어와 구동사를 함께 찾는 통합 검색
- A1~C1, 총 42개 문법 노드 탐색
- 단어·구동사를 합친 최대 500개 비복원 학습 큐
- 의미와 예문을 함께 여는 플래시카드, 5단계 난이도, TTS 대체 안내
- 4지선다·문장 문맥·받아쓰기·문장 변환을 포함한 6종 퀴즈
- 즉시 채점 후 명시적 `다음문제` 진행
- 1회 오답 +15%, 연속 2회 이상 +30% 가중치와 첫 3슬롯 우선 노출
- 점수·정답률·히트맵·유형별 결과·오답 복습
- `localStorage.wordMasterMainMenuState`를 통한 메뉴·세션·숙련도 복원
- 키보드 내비게이션, 스킵 링크, 라이브 상태 안내, 390px 반응형 UI

## 기술 구성

- React 19, TypeScript 6, Vite 8
- Vitest, React Testing Library, ESLint
- `public/data` 정적 JSON과 런타임 TypeScript 검증
- 서버 계정 없이 브라우저 `localStorage`에 사용자 진행 상태 저장

## 시작하기

Node.js와 npm이 필요합니다. 설치된 도구가 지원하는 Node 범위는 `^20.19.0 || ^22.13.0 || >=24.0.0`이며, 현재 품질 게이트는 Node.js 24와 npm 11에서 검증했습니다. 별도 백엔드나 환경 변수는 필요하지 않습니다.

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

그 뒤 생성된 `dist/index.html`을 더블클릭하면 됩니다. 배포본은 상대 경로의 단일 IIFE 번들과 임베드된 콘텐츠 카탈로그를 사용하므로 `file://` 실행에서도 localhost나 별도 서버가 필요하지 않습니다.

## 명령어

| 명령 | 용도 | 성공 기준 |
| --- | --- | --- |
| `npm run dev` | 개발 서버 실행 | 앱과 `public/data`를 로드 |
| `npm test` | 전체 단위·통합 테스트 1회 실행 | 실패 0개 |
| `npm run test:watch` | 변경 감시 테스트 | 개발 중 반복 실행 |
| `npm run lint` | 정적 코드 검사 | 오류 0개 |
| `npm run validate:data` | 대표 개발 데이터의 구조·참조 검증 | exit code 0 |
| `npm run validate:release` | 최종 콘텐츠 수량까지 포함한 릴리스 검증 | 전체 콘텐츠 완성 전에는 의도적으로 exit code 1 |
| `npm run build` | 타입 검사 후 프로덕션 번들 생성 | `dist/` 생성, exit code 0 |
| `npm run check` | 개발 데이터 검증, lint, 테스트, 빌드를 순서대로 실행 | 모든 단계 성공 |

## 데이터 검증 모드

두 검증 모드는 역할이 다릅니다.

- `development`: JSON 구조, 필수 필드, ID·레벨·워드패밀리·구동사 참조, 대표 소설 커버리지를 검사합니다. 현재 수량 `words=32`, `phrasalVerbs=8`, `grammarNodes=42`, `stories=4`로 통과합니다.
- `release`: 위 검사에 레벨별 정확한 목표 수량을 추가합니다. 단어는 기초 500, 유치원 500, 초등학교 1,500, 중학교 2,500개이며, 구동사는 레벨별 250개씩 총 1,000개여야 합니다.

현재 `npm run validate:release`는 오직 `WORD_COUNT_MISMATCH`와 `PHRASAL_COUNT_MISMATCH`를 보고하며 실패하는 것이 정상입니다. 구조 오류나 이외 코드가 나타나면 콘텐츠 또는 검증 로직의 회귀로 취급합니다.

| 레벨 | 현재 단어 / 목표 | 현재 구동사 / 목표 |
| --- | ---: | ---: |
| 기초 | 8 / 500 | 2 / 250 |
| 유치원 | 8 / 500 | 2 / 250 |
| 초등학교 | 8 / 1,500 | 2 / 250 |
| 중학교 | 8 / 2,500 | 2 / 250 |
| 합계 | 32 / 5,000 | 8 / 1,000 |

## 정적 배포

```powershell
npm ci
npm run check
npm run build
```

생성된 `dist/` 디렉터리 전체를 정적 호스트의 사이트 루트에 배포합니다. 하위 경로에 배포할 때는 Vite base URL을 함께 지정합니다.

```powershell
npm run build -- --base=/english-words/
```

배포본은 상대 경로를 사용하므로 `dist/` 디렉터리 전체를 원하는 정적 경로에 그대로 둘 수 있습니다. 앱은 클라이언트 라우터를 사용하지 않아 별도의 SPA fallback 규칙이 필요하지 않습니다. `dist/index.html`은 더블클릭으로도 실행되며, 배포 전 로컬 번들은 `npx vite preview`로도 확인할 수 있습니다.

## 상태와 브라우저 동작

- 상태 스키마는 버전 1이며 저장 키는 `localStorage.wordMasterMainMenuState`입니다.
- 계정과 클라우드 동기화가 없으므로 다른 브라우저나 기기로 진행도가 자동 이동하지 않습니다.
- 사이트 데이터 삭제, 시크릿 모드 종료, 배포 origin 변경 시 저장 상태가 사라질 수 있으며 현재 내보내기·백업 기능은 없습니다.
- 브라우저 Web Speech API가 없거나 음성 재생이 실패해도 텍스트 의미·예문 학습은 계속됩니다.
- 손상된 저장값과 저장 용량 오류는 앱을 중단하지 않고 화면 경고로 안내합니다.

## 프로젝트 구조

```text
public/data/                 정적 학습 콘텐츠·스키마·엔진 규칙
scripts/                     디스크 데이터 로더와 검증 CLI
src/app/                     앱 셸, 내비게이션, 콘텐츠 로딩·통합
src/components/              공용 상태·진행률 컴포넌트
src/domain/                  콘텐츠·스케줄러·퀴즈·숙련도 순수 로직
src/features/                대시보드·단어장·문법·소설·학습·퀴즈 화면
src/state/                   버전 상태, reducer, 저장·복원
src/styles/                  디자인 토큰과 반응형 스타일
tests/                       실제 JSON 데이터 계약 테스트
docs/superpowers/            승인된 설계와 실행 계획
```

## 콘텐츠를 추가할 때

1. `public/data/wordlists`, `phrasal-verbs`, `grammar`, `stories`의 기존 스키마를 유지합니다. JSON Schema는 편집 계약 참고 자료이고, 실제 앱 로드는 TypeScript 런타임 validator가 차단합니다.
2. 레벨 간 단어 중복과 워드패밀리 원형 중복을 만들지 않습니다.
3. 구동사 전체 목록과 레벨별 참조를 함께 갱신합니다.
4. 소설의 커버리지 메타데이터와 실제 토큰을 함께 검수합니다.
5. `npm run validate:data`와 `npm run check`를 통과시킵니다.
6. 목표 수량을 모두 채운 뒤에만 `npm run validate:release` 통과를 릴리스 조건으로 사용합니다.

완료 범위와 남은 콘텐츠 로드맵은 [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), 제품 원문 요구사항은 `개발계획.md`, `개발(구조).md`, `개발(문법).md`에서 확인할 수 있습니다. 채택된 수직 슬라이스의 상세 기준과 실행 기록은 `docs/superpowers/specs/2026-07-10-wordmaster-vertical-slice-design.md`와 `docs/superpowers/plans/2026-07-10-wordmaster-vertical-slice.md`에 있습니다.
