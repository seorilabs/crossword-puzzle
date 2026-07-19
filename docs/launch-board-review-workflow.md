# 90판 사람 검수 워크플로

최종 `launch-board-review-ledger.json`은 90개 생성 보드를 사람이 모두 검수한 뒤에만 조립한다. prepare 명령은 identity와 검수 증거만 만들며 `reviewerId`, `reviewedAt`, `note`, `decision`, `checks`를 채우지 않는다.

## 생성 중 provisional packet

```bash
npm run content:board-review:prepare -- \
  --checkpoint=tmp/launch-content-checkpoints/<config-hash>
```

검증된 checkpoint prefix만 `tmp/launch-board-review-workbook/`에 준비한다. 생성이 진행된 뒤 같은 명령을 다시 실행하면 identity와 evidence가 모두 같은 행의 사람 입력만 보존한다.

## 90판 생성 완료 후 full packet

```bash
npm run content:board-review:prepare
```

기본 입력은 다음 두 candidate artifact다.

- `public/game-content/v1/ko-KR/candidates/catalog.json`
- `public/game-content/v1/ko-KR/candidates/generation-report.json`

### 실제 runtime에서 90판 순회

고정 candidate가 생성된 뒤 catalog canonical hash를 구하고 개발 서버를 연다.

```bash
review_catalog_hash=$(node --experimental-strip-types --input-type=module -e 'import { readFile } from "node:fs/promises"; import { calculateLaunchReviewCatalogHash } from "./src/game-shell/launchReviewContent.ts"; const value = JSON.parse(await readFile("public/game-content/v1/ko-KR/candidates/catalog.json", "utf8")); process.stdout.write(calculateLaunchReviewCatalogHash(value));')
npm run dev
```

- 10판씩 순회: `http://localhost:5173/?gameRuntime=1&launchReview=<review_catalog_hash>&reviewPage=1` (`1`~`9`)
- 한 판 재검수: `http://localhost:5173/?gameRuntime=1&launchReview=<review_catalog_hash>&reviewPuzzleId=<puzzleId>`

이 경로는 DEV web에서만 열린다. catalog의 93판 구조를 기존 core validator로 확인한 뒤 first-run 3판을 제외한 생성 후보 90판을 `puzzleId`로 report와 조인한다. catalog가 다시 생성되면 이전 hash URL은 실패하고, 저장은 catalog hash 및 page/puzzle 선택별 namespace에 격리된다. 이 미리보기는 검수 입력, ledger, 콘텐츠 활성화 승인을 만들지 않는다.

```bash
npm run test:launch-review-preview
```

각 `shards/*.json` 행에는 수정하면 안 되는 identity와 evidence가 들어 있다. evidence는 실제 `answer`, `clue`, `domainTags`, `generatedBy`, `sourceEntryId` 및 report의 `metrics`, `quality`를 포함한다. 검수자는 각 행에 아래 사람 입력을 직접 추가한다.

```json
{
  "reviewerId": "검수자 식별자",
  "reviewedAt": "2026-07-19T03:00:00.000Z",
  "note": "실제 보드에서 확인한 구체적인 검수 메모",
  "decision": "approve",
  "checks": {
    "themeSemantics": true,
    "clueAnswerUniqueness": true,
    "toneSafety": true,
    "difficultyFit": true
  }
}
```

문제가 있거나 검수가 끝나지 않은 행은 승인값을 만들지 않는다. `reject`, `false`, 누락값은 workbook에 남길 수 있지만 final assemble은 실패한다. 콘텐츠를 다시 생성한 경우 identity나 evidence가 달라진 행의 사람 입력은 prepare 재실행 시 제거되어 다시 pending이 된다.

## 최종 ledger 조립

```bash
npm run content:board-review:assemble
```

assemble은 다음을 모두 재검증한 뒤에만 `data/game-content/v1/ko-KR/reviews/launch-board-review-ledger.json`을 원자적으로 쓴다.

- catalog/report canonical checksum과 generator commit/config hash
- catalog 순서의 정확한 90개 identity
- shard의 read-only evidence checksum
- 90개 행의 사람 입력과 네 항목 `true`
- 기존 `scripts/launch-board-review-ledger.mjs` 최종 schema

checkpoint mode workbook은 final 조립에 사용할 수 없다. 이 ledger는 계속 `artifactStatus: candidate`, `activationApproved: false`이며 콘텐츠 활성화나 스토어 배포 승인을 대신하지 않는다.
