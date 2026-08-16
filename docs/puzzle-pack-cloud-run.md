# Puzzle Pack Cloud Run Job

퍼즐 JSON pack을 로컬과 Cloud Run Job에서 같은 entrypoint로 생성한다.

```mermaid
flowchart LR
  Scheduler["Cloud Scheduler - 매일 자정"] --> Job["Cloud Run Job"]
  Job --> Generator["Easy Normal Hard 생성"]
  Generator --> Validator["slot validator"]
  Validator --> Hosting["Firebase Hosting: /puzzles/*.json"]
  App["AIT WebView"] --> Hosting
```

## 로컬 검증

추적 중인 `public/puzzles`를 건드리지 않으려면 임시 public root 아래에 생성한다.

```bash
rm -rf /tmp/crossword-puzzle-public
npm run batch:puzzles -- \
  --days=1 \
  --start=2026-05-30 \
  --seed=20260530 \
  --outDir=/tmp/crossword-puzzle-public/puzzles

npm run validate:puzzles -- \
  --manifest=/tmp/crossword-puzzle-public/puzzles/manifest.json \
  --assetRoot=/tmp/crossword-puzzle-public
```

Cloud publish 계획만 확인하려면 dry run을 사용한다.

```bash
npm run publish:puzzles -- \
  --dryRun \
  --project=<firebase-project-id> \
  --site=<firebase-hosting-site-id> \
  --publicDir=/tmp/crossword-puzzle-public \
  --manifest=/tmp/crossword-puzzle-public/puzzles/manifest.json
```

Cloud Run Job과 같은 wrapper를 로컬에서 검증하려면 publish만 끈다.

```bash
npm run job:puzzle-pack -- \
  --days=1 \
  --start=2026-05-30 \
  --seed=20260530 \
  --outDir=/tmp/crossword-puzzle-job-public/puzzles \
  --skipPublish
```

## Cloud 구성

사전 조건:

- Google Cloud / Firebase project가 존재해야 한다.
- Firebase Hosting site가 존재해야 한다.
- 로컬에서 `gcloud` 인증과 project 접근 권한이 있어야 한다.

현재 dev 환경:

| 환경 | Firebase project ID      | Hosting site ID          | Hosting URL                              |
| ---- | ------------------------ | ------------------------ | ---------------------------------------- |
| dev  | `crossword-puzzle-79ae0` | `crossword-puzzle-79ae0` | `https://crossword-puzzle-79ae0.web.app` |

설정:

```bash
scripts/setup-puzzle-pack-cloud-run-job.sh \
  --project-id <firebase-project-id> \
  --firebase-hosting-site <firebase-hosting-site-id> \
  --region asia-northeast3 \
  --scheduler-location asia-northeast3 \
  --schedule "5 0 * * *" \
  --time-zone Asia/Seoul \
  --puzzle-days 1 \
  --puzzle-keep 14 \
  --puzzle-interval-hours 1
```

스크립트가 수행하는 일:

- 필요한 API 활성화
- Artifact Registry Docker repository 생성
- Cloud Run Job runtime service account 생성
- runtime service account에 `roles/firebasehosting.admin` 부여
- `Dockerfile.puzzle-pack-job` 이미지 build/push
- Cloud Run Job 생성 또는 업데이트
- Scheduler service account 생성
- Scheduler service account에 Cloud Run Job `roles/run.invoker` 부여
- Cloud Scheduler HTTP job 생성 또는 업데이트

즉시 1회 실행:

```bash
gcloud run jobs execute crossword-puzzle-pack-generator \
  --project <firebase-project-id> \
  --region asia-northeast3 \
  --wait
```

## Runtime env

Cloud Run Job은 다음 환경 변수를 사용한다.

| 변수                             |                   기본값 | 설명                                                                                                                      |
| -------------------------------- | -----------------------: | ------------------------------------------------------------------------------------------------------------------------- |
| `FIREBASE_PROJECT_ID`            |                     필수 | Firebase Hosting project                                                                                                  |
| `FIREBASE_HOSTING_SITE`          |                     필수 | Firebase Hosting site ID                                                                                                  |
| `PUZZLE_DAYS`                    |                      `1` | 한 번에 생성할 퍼즐 슬롯 수                                                                                               |
| `PUZZLE_TIME_ZONE`               |             `Asia/Seoul` | 동적 시작 날짜 계산 timezone                                                                                              |
| `PUZZLE_SEED`                    |                     자동 | 재현용 고정 seed. 지정하지 않으면 `PUZZLE_TIME_ZONE`, 시작 날짜, `PUZZLE_PUBLISHED_AT`을 섞어 실행마다 다른 seed를 만든다 |
| `PUZZLE_OUT_DIR`                 |         `public/puzzles` | 생성 결과 출력 폴더                                                                                                       |
| `PUZZLE_HOSTING_BASE_URL`        | `https://<site>.web.app` | 앱/운영자가 참조할 base URL                                                                                               |
| `PUZZLE_APPEND`                  |                   `true` | 기존 manifest를 불러와 새 퍼즐을 append할지 여부                                                                          |
| `PUZZLE_KEEP`                    |                     `14` | manifest에 유지할 최근 퍼즐 수. 일간 2판 기준 7일치                                                                       |
| `PUZZLE_INTERVAL_HOURS`          |                      `1` | Easy/Hard의 내부 `slotId`를 h00/h01로 분리하는 간격                                                                       |
| `PUZZLE_DIFFICULTY`              |                     비움 | 지정하면 모든 슬롯을 해당 난이도(`easy`/`hard`)로 고정                                                           |
| `PUZZLE_DAILY_TIERS`             |                   `true` | 고정 난이도가 없을 때 매일 Easy 5×5, Hard 8×8을 한 판씩 생성                                                  |
| `PUZZLE_DIFFICULTY_ROTATION`     |                  `false` | `PUZZLE_DAILY_TIERS=false`인 레거시 다회 실행에서만 `easy/hard` 순환                                        |
| `PUZZLE_DIVERSITY_HISTORY`       |                      `7` | 같은 난이도에서 다양성을 비교할 최근 퍼즐 수                                                                              |
| `PUZZLE_MAX_ANSWER_REUSE`        |                    `0.5` | 최근 동일 난이도 한 판과 겹쳐도 되는 후보 정답 비율 상한                                                                  |
| `PUZZLE_MAX_SCAFFOLD_SIMILARITY` |                   `0.75` | 최근 동일 난이도 한 판과 겹쳐도 되는 채운 칸 골격 Jaccard 유사도 상한                                                     |
| `PUZZLE_MAX_SYLLABLE_ANSWERS`    |                      `3` | 한 판에서 같은 음절이 등장해도 되는 최대 정답 수                                                                          |
| `PUZZLE_CORS_ORIGIN`             |                      `*` | AIT WebView에서 JSON을 fetch할 수 있도록 `/puzzles/**` 응답에 넣을 CORS origin                                            |

생성 옵션은 `PUZZLE_ATTEMPTS`, `PUZZLE_BEAM`, `PUZZLE_BRANCH`, `PUZZLE_CANDIDATES`, `PUZZLE_DENSE`, `PUZZLE_DIVERSITY_HISTORY`, `PUZZLE_MAX_ANSWER_REUSE`, `PUZZLE_MAX_SCAFFOLD_SIMILARITY`, `PUZZLE_MAX_SYLLABLE_ANSWERS`, `PUZZLE_MIN_CROSS`, `PUZZLE_MIN_DENSITY`, `PUZZLE_MIN_ENTRIES`, `PUZZLE_MIN_MULTI`, `PUZZLE_MAX_AUTO`, `PUZZLE_RETRIES`, `PUZZLE_SAMPLES`, `PUZZLE_SIZE`, `PUZZLE_WORDS`, `PUZZLE_WORDBANK`, `PUZZLE_PUBLISHED_AT`, `PUZZLE_EXISTING_MANIFEST_URL`로 override할 수 있다. `PUZZLE_SEED`를 지정하면 같은 입력에서 같은 퍼즐이 다시 생성될 수 있으므로, 운영 스케줄에서는 보통 비워 둔다.

## Append manifest

매일 00:05 KST에 한 번 실행해 같은 날짜의 Easy, Hard 두 판을 만든다. Job은 새 퍼즐을 기존 manifest에 append하고, `PUZZLE_KEEP` 개수만 남긴다.

- 기본 스케줄은 `5 0 * * *`이다.
- 기본 유지 개수는 `14`개다. 일간 2판 기준 최근 7일치다.
- 기본 일간 구성은 easy 5×5, hard 8×8 각 1개다. 난이도는 어휘가 아니라 보드 크기와 배치 단어 수(easy 9~10단어 · hard 18~22단어)로 가른다.
- 각 생성물은 `packId`, `puzzleId`, `slotId`, `publishedAt`를 가진다.
- `puzzleId`는 로컬 진행 상태 key로 쓰이므로 같은 날짜에 여러 퍼즐이 있어도 진행 상태가 섞이지 않는다.
- `PUZZLE_SEED`를 고정하지 않으면 기본 seed가 실행 시각을 포함해 날짜마다 바뀐다.
- 같은 날짜의 앞 난이도에서 사용한 정답과, 같은 난이도의 최근 7판에서 사용한 정답은 후보 풀에서 제거한다. 정답 문자열이 같은 단어뿐 아니라 어근(2음절 연속 조각)을 공유하는 단어까지 함께 빼므로, 어제 `대학생`을 썼으면 오늘 `학생`도 후보에 오르지 않는다.
- 한 판 안에서도 어근을 공유하는 정답(`대학생`/`여학생`/`학생`)은 배치 단계에서 막고, 같은 음절이 `PUZZLE_MAX_SYLLABLE_ANSWERS`개를 넘는 정답에 등장하면 후보에서 제외한다. 발행 직전에도 같은 기준으로 다시 검사해 위반이 있으면 슬롯 생성을 실패시킨다.
- 품질 게이트를 통과한 후보 중 최근 같은 난이도와 정답이 50% 초과로 겹치거나 채운 칸 골격 Jaccard 유사도가 75%를 초과하는 후보는 건너뛴다.
- 같은 슬롯을 재실행할 때는 그 슬롯 자체를 다양성 비교에서 제외해 같은 seed의 재현성과 idempotency를 유지한다.
- 기존 remote manifest가 있으면 `PUZZLE_HOSTING_BASE_URL/puzzles/manifest.json`을 먼저 읽고, 유지 대상 puzzle JSON도 다시 받아 현재 publish 디렉터리에 채운다.
- remote manifest가 아직 없으면 로컬 `public/puzzles/manifest.json`을 fallback source로 사용한다.
- `difficulty`가 없는 구버전 manifest 항목은 다중 난이도 전환 시 제거한다. 새 항목은 사전 뜻풀이 구조 검증·난이도·보드 품질 게이트를 통과한 뒤 슬롯마다 다시 누적된다.
- 한국어기초사전 뜻풀이는 기본 사용 가능하며, `needsManualClue`는 발행 차단이 아니라 후속 자체 문장 편집 현황으로 기록한다.

## AIT 앱 연결

AIT WebView 앱은 퍼즐 데이터를 읽을 때 Firebase SDK를 사용하지 않고 공개 Hosting JSON을 `fetch`한다. Firebase Auth, Firestore, Storage를 쓰는 단계는 아니며, 현재 `firebase` Web SDK는 Analytics와 Remote Config에만 선택적으로 사용한다.

운영 빌드에서 Firebase Hosting pack을 읽게 하려면 앱 빌드 환경에 base URL을 넣는다.

```bash
VITE_PUZZLE_PACK_BASE_URL=https://crossword-puzzle-79ae0.web.app npm run build
```

`.env.production.local`을 쓴다면 다음 한 줄만 둔다.

```bash
VITE_PUZZLE_PACK_BASE_URL=https://crossword-puzzle-79ae0.web.app
```

GitHub Actions의 AppsInToss 배포 workflow는 `vars.PUZZLE_PACK_BASE_URL`이 있으면 그 값을 쓰고, 없으면 현재 dev Hosting URL인 `https://crossword-puzzle-79ae0.web.app`를 쓴다.

동작 방식:

- `VITE_PUZZLE_PACK_BASE_URL`이 있으면 `<base>/puzzles/manifest.json`을 읽고, manifest의 `/puzzles/*.json` 경로도 같은 base URL로 해석한다.
- `VITE_PUZZLE_MANIFEST_URL`을 넣으면 manifest 위치만 직접 override한다.
- 원격 로딩이 실패하면 번들에 포함된 `/puzzles/manifest.json`으로 fallback한다.
- 두 환경 변수가 없으면 기존처럼 번들에 포함된 `/puzzles/manifest.json`만 읽는다.

Firebase Hosting을 AIT 앱 origin과 다른 도메인에서 읽기 때문에 CORS가 필요하다. `npm run publish:puzzles`는 `/puzzles/**` 응답에 `Access-Control-Allow-Origin`을 기본 `*`로 배포한다. 퍼즐 pack은 공개 읽기 전용 정적 데이터라 이 설정을 기본으로 둔다.

## 운영 health check와 알림

생성 Job과 별도로 매일 `00:30 KST`에 공개 Firebase Hosting 결과를 다시 읽는
`crossword-puzzle-pack-health` Job을 실행한다.

- 오늘 날짜에 Easy, Hard가 정확히 한 판씩 있는지 확인한다.
- Easy는 5×5, Normal과 Hard는 8×8인지 확인한다.
- manifest와 puzzle metadata, 격자 slot과 entry를 다시 검증한다.
- 당일 두 난이도 정답 교집합이 0개인지 확인한다.
- 실패하면 stderr와 non-zero exit를 남겨 Cloud Run Job을 실패 처리한다.

로컬 또는 운영 공개본을 직접 확인할 수 있다.

```bash
npm run health:puzzles -- \
  --baseUrl=https://crossword-puzzle-79ae0.web.app \
  --date=2026-07-26
```

Cloud Monitoring notification channel을 준비한 뒤 health Job, Scheduler, 로그
기반 metric, alert policy를 함께 생성한다.

```bash
scripts/setup-puzzle-pack-monitoring.sh \
  --project-id crossword-puzzle-79ae0 \
  --hosting-base-url https://crossword-puzzle-79ae0.web.app \
  --notification-channel projects/crossword-puzzle-79ae0/notificationChannels/<id>
```

알림 대상은 generator와 health Job의 `severity>=ERROR` 로그다. health Job이
오늘 퍼즐 누락, 난이도 누락, 중복 정답, 공개 JSON 구조 오류를 같은 경로로
오류 로그에 기록하므로 하나의 정책으로 생성 장애와 발행 결과 장애를 감시한다.
