# 가로세로 낱말 퍼즐

Apps in Toss 프로젝트입니다.

## 기획 문서

Obsidian Vault 기준 source of truth:

```text
프로젝트/가로세로낱말퍼즐
```

- 기획서: `프로젝트/가로세로낱말퍼즐/01 기획서.md`
- 알고리즘 설계: `프로젝트/가로세로낱말퍼즐/02 알고리즘 설계.md`

## 시작하기

```bash
npm run dev
```

## 명령어

모든 명령은 repo 루트에서 실행합니다.

| 명령                              | 용도                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`                     | 로컬 개발 서버 실행                                                               |
| `npm run lint`                    | ESLint 검사                                                                       |
| `npm run build`                   | AppsInToss `.ait` 빌드                                                            |
| `npm run deploy`                  | AppsInToss 배포                                                                   |
| `npm run mobile:install`          | `apps/mobile` RN 의존성 설치                                                      |
| `npm run check:mobile`            | `apps/mobile` lint/test                                                           |
| `npm run build:android`           | Google Play용 Android App Bundle 빌드. 제출용 키가 없으면 로컬 fallback 키로 서명 |
| `npm run wordbank:krdict`         | 한국어기초사전 XML에서 퍼즐용 단어장 생성                                         |
| `npm run release:next-tag`        | 다음 semver 릴리즈 태그 계산                                                      |
| `npm run release:resolve-version` | 릴리즈 태그에서 앱 빌드 버전 계산                                                 |
| `npm run prototype:crossword`     | 콘솔에서 퍼즐판 생성 알고리즘 샘플 출력                                           |
| `npm run batch:puzzles`           | 날짜별 puzzle JSON pack 생성                                                      |
| `npm run job:puzzle-pack`         | 생성/검증/publish를 묶은 배치잡 entrypoint                                        |
| `npm run publish:puzzles`         | Firebase Hosting publish                                                          |
| `npm run validate:puzzles`        | 격자 슬롯과 entry/clue 매칭 검증                                                  |

## 구조

현재 1차 론칭 목표는 AppsInToss WebView입니다. Google Play / App Store 확장은 AIT 출시 이후 React Native `apps/mobile` 타깃으로 이어갑니다.

공통 퍼즐 타입, 순수 helper, repository 계약은 `packages/crossword-core`에 둡니다. 현재 WebView 앱은 `src/adapters`의 `fetch` / `localStorage` 어댑터로 이 계약을 구현합니다. `apps/mobile`은 Android/iOS 네이티브 프로젝트가 포함된 RN skeleton이며, 실제 퍼즐 UI 포팅은 core contract와 market adapter를 연결한 뒤 진행합니다.

사용자 기본 동선은 홈(`/`) -> 오늘 풀기(`/today`) -> 결과(`/result`) / 기록(`/history`)입니다. 생성 보드 검수용 시뮬레이터는 개발 환경에서만 `/dev/simulator`로 접근합니다.

자세한 경계와 Supabase 전환 순서는 `docs/architecture.md`를 참고합니다.

## 퍼즐판 생성

퍼즐판 생성은 `단어장 생성 -> 단일 후보 확인 -> 날짜별 pack 생성 -> 앱에서 확인` 순서로 진행합니다.

### 1. 단어장 생성

한국어기초사전 XML을 내려받아 퍼즐용 단어장 JSON을 만듭니다.

```bash
npm run wordbank:krdict
```

기본 출력:

```text
data/lexicon/krdict-puzzle-wordbank.json
```

주요 옵션:

| 옵션                 |                                     기본값 | 설명                            |
| -------------------- | -----------------------------------------: | ------------------------------- |
| `--out=...`          | `data/lexicon/krdict-puzzle-wordbank.json` | 출력 파일                       |
| `--filter=...`       |     `data/lexicon/puzzle-word-filter.json` | 수동 차단/난이도/태그 규칙 파일 |
| `--limit=25000`      |                                    `25000` | 최대 단어 수                    |
| `--minLength=2`      |                                        `2` | 최소 글자 수                    |
| `--maxLength=5`      |                                        `5` | 최대 글자 수                    |
| `--maxClueLength=54` |                                       `54` | 힌트로 쓸 뜻풀이 최대 길이      |

예시:

```bash
npm run wordbank:krdict -- --limit=5000 --maxLength=6 --out=tmp/wordbank.json
```

단어장 항목에는 batch와 검수에 필요한 정제 필드가 포함됩니다.

| 필드              | 설명                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `difficulty`      | `easy`, `normal`, `hard` 중 하나                                       |
| `themeTags`       | 주제 태그 배열(예: `["food"]`). 필터의 `themeCategories` 규칙으로 부여 |
| `allowForPuzzle`  | 퍼즐 생성 후보로 사용할 수 있는지                                      |
| `blockedReason`   | 제외 사유. 허용 단어는 `null`                                          |
| `definition`      | 한국어기초사전 뜻풀이 원문                                             |
| `clue`            | 앱에서 보여줄 힌트. 수동 힌트가 없으면 임시로 뜻풀이를 사용            |
| `clueSource`      | `manual` 또는 `krdict-definition`                                      |
| `needsManualClue` | 출시 전 자체 힌트 재작성이 필요한지                                    |

수동 차단이나 태깅은 `data/lexicon/puzzle-word-filter.json`에서 관리합니다.
출시용 힌트는 `cluesByAnswer`에 직접 작성합니다.

주제(테마) 태그는 같은 필터의 `themeCategories`(카테고리별 키워드 규칙)로 부여합니다.
규칙 매칭은 공유 코어 `assignThemeTags`가 담당하며, 네트워크 없이 커밋된 단어장에
규칙을 재적용하려면 다음을 실행합니다(전체 `wordbank:krdict` 재빌드도 같은 규칙을
적용합니다).

```bash
npm run wordbank:themes          # themeTags 재적용(idempotent)
npm run wordbank:themes -- --dry # 커버리지만 출력, 파일 미기록
```

주제 퍼즐 팩은 생성기에 `--theme=<id>`(선택 `--themeLabel=<라벨>`)를 넘겨 해당 태그
단어로만 후보를 제약해 만들며, 매니페스트·퍼즐 항목에 `themeTag`/`themeLabel`이
기록됩니다. 주제 풀은 일반 풀보다 작아 `--difficulty=easy` 등 작은 보드에서 안정적으로
생성됩니다.

```bash
node server/batch/generate-puzzle-pack.mjs --theme=food --themeLabel="음식 특집" \
  --difficulty=easy --days=1 --outDir=tmp/theme/puzzles
```

주의: 현재 단어장은 한국어기초사전 뜻풀이를 힌트로 사용합니다. 출시 전에는 `CC-BY-SA-2.0-KR` 출처 표시와 동일조건변경허락 의무를 검토하거나, 힌트를 자체 문장으로 재작성해야 합니다.

### 2. 단일 퍼즐판 후보 확인

콘솔에서 알고리즘이 만든 판과 지표를 바로 확인합니다.

```bash
npm run prototype:crossword -- \
  --wordbank=data/lexicon/krdict-puzzle-wordbank.json \
  --samples=1 \
  --attempts=8 \
  --size=8 \
  --words=12 \
  --beam=10 \
  --branch=10 \
  --dense=96 \
  --candidates=600 \
  --seed=20260525
```

주요 옵션:

| 옵션               | 설명                            |
| ------------------ | ------------------------------- |
| `--wordbank=...`   | 사용할 단어장 JSON              |
| `--samples=1`      | 출력할 최종 후보 수             |
| `--attempts=8`     | 생성 시도 횟수                  |
| `--size=8`         | 퍼즐판 한 변 크기               |
| `--words=12`       | 직접 배치할 최대 단어 수        |
| `--beam=10`        | 유지할 중간 후보 판 수          |
| `--branch=10`      | 후보 판 하나에서 확장할 배치 수 |
| `--dense=96`       | 조밀 배치 후보 탐색 수          |
| `--candidates=600` | seed별 탐색 후보 단어 수        |
| `--seed=20260525`  | 재현 가능한 난수 seed           |

출력에서 먼저 볼 지표:

| 지표                | 의미                                 |
| ------------------- | ------------------------------------ |
| `entries`           | 최종 가로/세로 단어 수               |
| `auto`              | 인접 배치로 자동 생성된 유효 단어 수 |
| `crossRatio`        | 채워진 칸 중 교차 칸 비율            |
| `bboxDensity`       | 글자가 들어간 최소 직사각형의 밀도   |
| `multiCrossEntries` | 2개 이상 교차하는 단어 수            |

### 3. 날짜별 puzzle pack 생성

앱이 읽는 `public/puzzles` JSON을 생성합니다.

```bash
npm run batch:puzzles -- \
  --days=3 \
  --start=2026-05-25 \
  --seed=20260525 \
  --size=8 \
  --words=12 \
  --attempts=12 \
  --beam=12 \
  --branch=12 \
  --dense=96 \
  --candidates=600 \
  --samples=5 \
  --retries=10
```

생성되는 파일:

```text
public/puzzles/manifest.json
public/puzzles/pack-YYYYMMDDHHMMSS-seed.json
public/puzzles/generation-report.json
```

배치 옵션:

| 옵션                 |                                     기본값 | 설명                                    |
| -------------------- | -----------------------------------------: | --------------------------------------- |
| `--days=1`           |                                        `1` | 한 번에 생성할 퍼즐 슬롯 수             |
| `--append`           |                                      false | 기존 manifest에 새 퍼즐을 append        |
| `--keep=21`          |                                       `21` | append 시 유지할 최근 퍼즐 수           |
| `--intervalHours=1`  |                                        `1` | 난이도별 내부 `slotId` 간격             |
| `--start=2026-05-25` |                               `2026-05-25` | 시작 날짜                               |
| `--seed=20260525`    |                                 `20260525` | 시작 seed                               |
| `--publishedAt=...`  |                                  현재 시각 | 발행 시각 override                      |
| `--size=8`           |                                        `8` | 퍼즐판 한 변 크기                       |
| `--words=10`         |                                       `10` | 직접 배치할 최대 단어 수                |
| `--attempts=30`      |                                       `30` | 날짜별 생성 시도 수                     |
| `--samples=5`        |                                        `5` | retry마다 품질 게이트에 올릴 후보 판 수 |
| `--retries=8`        |                                        `8` | 실패 시 seed를 바꿔 재시도하는 횟수     |
| `--wordbank=...`     | `data/lexicon/krdict-puzzle-wordbank.json` | 사용할 단어장                           |
| `--outDir=...`       |                           `public/puzzles` | 출력 폴더                               |

품질 게이트 옵션:

| 옵션                           | 기본값 | 설명                                    |
| ------------------------------ | -----: | --------------------------------------- |
| `--minEntries=10`              |   `10` | 최소 최종 단어 수                       |
| `--minCross=0.55`              | `0.55` | 최소 교차율                             |
| `--minDensity=0.5`             |  `0.5` | 최소 bbox 밀도                          |
| `--minMulti=0.65`              | `0.65` | 최소 다중 교차 단어 비율                |
| `--maxAuto=0.5`                |  `0.5` | 최대 자동 단어 비율                     |
| `--maxAnswerReuse=0.5`         |  `0.5` | 최근 동일 난이도 정답 재사용 비율 상한  |
| `--maxScaffoldSimilarity=0.75` | `0.75` | 최근 동일 난이도 보드 골격 Jaccard 상한 |
| `--diversityHistory=7`         |    `7` | 비교할 최근 동일 난이도 퍼즐 수         |

`generation-report.json`에는 날짜별 retry, 후보별 실패 사유, 최종 채택된 판의 품질 게이트 결과가 기록됩니다.

운영 배치는 매일 한 번 Easy 5×5, Normal 8×8, Hard 8×8 세 판을 만들고 `--append --keep=21`로 최근 7일치를 유지합니다. 각 퍼즐은 `packId`, `puzzleId`, `slotId`, `publishedAt`를 가지며, 앱의 로컬 진행 상태는 `puzzleId` 기준으로 저장됩니다.

Cloud Run Job wrapper는 `PUZZLE_SEED`를 지정하지 않으면 실행 시각까지 포함해 기본 seed를 만들기 때문에 날짜마다 다른 후보를 생성합니다. 같은 퍼즐을 재현해야 할 때만 `--seed` 또는 `PUZZLE_SEED`를 고정합니다.

생성 후 `npm run dev`를 켜고 앱에서 `manifest.json`과 오늘 날짜 puzzle JSON을 확인합니다.

임시 폴더에서 생성 결과를 검증할 때는 manifest의 `/puzzles/...` 경로를 해석할 public root를 넘깁니다.

```bash
npm run validate:puzzles -- \
  --manifest=/tmp/crossword-puzzle-public/puzzles/manifest.json \
  --assetRoot=/tmp/crossword-puzzle-public
```

Cloud Run Job / Firebase Hosting 구성은 `docs/puzzle-pack-cloud-run.md`를 참고합니다.

AIT 빌드가 Firebase Hosting의 puzzle pack을 읽게 하려면 빌드 환경에 base URL을 지정합니다. 지정하지 않으면 기존처럼 번들에 포함된 `public/puzzles`를 읽습니다.

```bash
VITE_PUZZLE_PACK_BASE_URL=https://crossword-puzzle-79ae0.web.app npm run build
```

GitHub Actions 배포에서는 repository variable `PUZZLE_PACK_BASE_URL`로 운영 Hosting URL을 바꿀 수 있습니다.

### 복귀 리마인더 템플릿 코드

"오늘의 퍼즐" 복귀 리마인드(스마트발송) 알림 동의는 `requestNotificationAgreement`에 `templateCode`를 넘겨 요청합니다. 이 코드는 개발자가 임의로 정한 슬러그가 아니라, **앱인토스 콘솔에서 알림 동의문·기능성 캠페인을 만들고 문구 검수 승인을 받으면 발급되는 실제 템플릿 코드**입니다. 콘솔 발급 코드와 다르거나 캠페인이 미승인 상태면 SDK `onError`가 전건 발화해 동의 요청이 무력화됩니다(#288).

기본값은 `crossword-daily-reminder`이며, 빌드 환경변수 `VITE_RETURN_REMINDER_TEMPLATE_CODE`로 실제 발급 코드를 주입해 덮어씁니다.

```bash
VITE_RETURN_REMINDER_TEMPLATE_CODE=<콘솔 발급 코드> npm run build
```

콘솔 발급 코드 확인·반영 절차:

1. [앱인토스 콘솔](https://apps-in-toss.toss.im/) > 미니앱 > 스마트 발송에서 "오늘의 퍼즐" 복귀 리마인드용 알림 동의문과 기능성 캠페인을 확인합니다.
2. 문구 검수가 **승인** 상태인지, 발급된 `templateCode`가 무엇인지 확인합니다.
3. 확인된 코드를 배포 환경의 `VITE_RETURN_REMINDER_TEMPLATE_CODE`(GitHub Actions는 repository variable/secret)에 반영합니다.
4. 배포 후 GA4 `return_reminder_result`의 `outcome`·`error_code` 분포를 모니터링해 최초의 `agreed`/`declined`가 관측되는지 확인합니다.

## 배포하기

- 앱인토스 배포 API 키는 [앱인토스 콘솔](https://apps-in-toss.toss.im/) > 워크스페이스 > API 키 > 콘솔 API 키 에서 발급받을 수 있어요.
- `main` push 후 `CI`가 성공하면 `Release Tag` workflow가 patch semver 태그를 만들고, 해당 태그로 AppsInToss 빌드/배포 workflow를 실행합니다.
- 버저닝 정책과 수동 minor/major 태그 생성은 `docs/release-versioning.md`를 참고합니다.

```bash
npm run build
npm run deploy
```

## 유용한 링크

- [앱인토스 콘솔](https://apps-in-toss.toss.im/)
- [앱인토스 개발자센터](https://developers-apps-in-toss.toss.im/)
- [앱인토스 개발자 커뮤니티](https://techchat-apps-in-toss.toss.im/)

AI를 사용하시는 경우 [여기](https://developers-apps-in-toss.toss.im/development/llms.html)를 확인해보세요.
