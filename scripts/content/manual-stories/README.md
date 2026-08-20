# 승인된 수동 소설 입력

이 디렉터리는 `npm run content:build`가 읽는 유일한 수동 소설 정본 경로입니다. 실제 승인본은 다음 네 이름 중 해당 레벨 파일로만 추가합니다.

- `기초.approved.json`
- `유치원.approved.json`
- `초등학교.approved.json`
- `중학교.approved.json`

파일이 없는 레벨은 빌드가 `isManual: false` 자동 초안을 새로 만듭니다. 자동 초안이나 `public/data/stories`의 플래그를 바꿔도 승인본으로 승격되지 않습니다. `approved-story.example.json`은 입력 형태만 보여 주며 빌드가 읽지 않습니다.

각 승인 파일은 예시와 같은 세 필드를 정확히 가져야 합니다.

- `schemaVersion`: 현재 `1.0.0`
- `story`: 사람이 서사형 `storyText` 본편, 별도 `vocabularyPracticeText` 일반 단어 장면과 `phrasalVerbPracticeText` 구동사 장면, `usedWords`·`usedPhrasalVerbs` 통합 커버리지를 모두 읽고 수정한 `StoryContent`. 승인 시점에 이미 `isManual: true`여야 합니다.
- `approval`: 공백 없는 `reviewer`, `new Date().toISOString()` 형식의 `reviewedAt`, 정확한 `story` payload를 묶는 `sourceDigest`

`sourceDigest`는 `scripts/content/catalogDigest.ts`의 `manualStorySourceDigest(story)` 결과입니다. 본편·두 확장 장면·제목·커버리지·사용 일반 단어·구동사 중 하나라도 바뀌면 다시 사람 검수한 뒤 reviewer, reviewedAt, digest를 함께 갱신해야 합니다. 예를 들어 입력 파일을 만든 뒤 아래처럼 새 digest를 확인할 수 있습니다.

```powershell
npx tsx -e "import { readFile } from 'node:fs/promises'; import { manualStorySourceDigest } from './scripts/content/catalogDigest.ts'; void (async()=>{ const input=JSON.parse(await readFile(process.argv[1],'utf8')); console.log(JSON.stringify(manualStorySourceDigest(input.story),null,2)) })()" scripts/content/manual-stories/기초.approved.json
```

사용자가 자동 초안 네 편을 명시적으로 승인한 경우에는 `npm run content:approve:stories -- --reviewer=<name> --reviewed-at=<UTC ISO> --confirm-user-approved`로 같은 형식의 네 정본을 만들 수 있습니다. 확인 플래그가 없으면 스크립트는 승인을 거부합니다.

그다음 `npm run content:build`를 실행합니다. 빌드는 승인 메타데이터와 digest를 먼저 검증하고, 새 통합 단어장에 대한 본편 서사 구조·일반 단어 형태·레벨별 구동사 ID/표현/정확한 예문·전체 읽기 패키지 커버리지 검증까지 통과한 경우에만 `public/data` 세대를 교체합니다. provenance에는 각 레벨의 일반 단어 수와 구동사 수, `approved-manual-input` 또는 `automated-draft` 출처가 기록됩니다.

이 메타데이터는 저장소 코드 리뷰를 통한 사람 승인의 감사 흔적입니다. 암호화 서명은 아니므로 reviewer 신원과 실제 검수 사실은 변경 리뷰에서 확인해야 합니다.
