# easy 실서빙 검증 — attempt_start 난이도 출현 추적

## 목적

입문(easy) 티어 퍼즐이 실제로 신규 사용자에게 배정·시작되어 `attempt_start` 텔레메트리에 `difficulty=easy` 로 적재되는지 데이터로 검증한다. [#93](https://github.com/seorilabs/crossword-puzzle/issues/93)의 baseline은 "데이터에 easy attempt 0건"이었고, 코드 측 원인(홈 "오늘의 퍼즐 바로 시작" CTA가 활성 온보딩 easy 퍼즐을 무시하고 normal로 전환하던 버그)은 [#122](https://github.com/seorilabs/crossword-puzzle/pull/122)에서 수정됐다. 본 쿼리는 #122 배포 반영 이후 **easy 시작이 어느 날짜부터 출현하는지** 를 일자별로 추적해 DoD("BQ 데이터에 `difficulty=easy attempt_start` 출현")를 확인하기 위한 **계측 전용** 수단이다. 행동 변경은 없다.

## 배경 (easy 서빙 설계)

- (작성 당시) easy 퍼즐은 발행 퍼즐팩에 들어가지 않았고 입문 티어는 **번들 상수**(`src/data/onboardingPuzzle.ts`, `ONBOARDING_PUZZLE_ID = "onboarding-easy-01"`, `difficulty: "easy"`)로만 제공되며 날짜가 아니라 **신규 여부**로 라우팅됐다. 지금은 일간 팩이 매일 easy 5×5 와 hard 8×8 을 함께 발행하므로(`DAILY_PUZZLE_TIERS`), 아래 쿼리의 `difficulty=easy`에는 온보딩 퍼즐과 일간 easy 가 섞인다. 온보딩만 보려면 `puzzle_id = "onboarding-easy-01"`로 나눈다.
- 따라서 easy `attempt_start` 의 정상 원천은 `puzzle_id = "onboarding-easy-01"`(`puzzle_alias = "입문"`) 한 종류다. 쿼리는 난이도 분포와 별도로 이 온보딩 퍼즐 기여를 분리해 교차검증한다.

## 표준 쿼리

| 항목 | 쿼리 | 산출 |
| --- | --- | --- |
| easy 실서빙 검증 | [`scripts/analytics/easy-serving-verification.sql`](../scripts/analytics/easy-serving-verification.sql) | 일자별 `attempt_start` 난이도 분포, 난이도별 누적·점유율, easy 출현 요약 |

소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`

이벤트: `attempt_start`(`src/App.tsx`, `telemetry.impression`). 파라미터는 `getPuzzleTelemetryParams` 계약의 `difficulty` / `puzzle_id` / `puzzle_alias` 를 그대로 쓴다(번역 없는 영문 원문 키).

## 실행

```bash
bq query \
  --project_id=crossword-puzzle-79ae0 \
  --location=asia-southeast3 \
  --use_legacy_sql=false \
  < scripts/analytics/easy-serving-verification.sql
```

구간을 고정하려면 SQL 상단 두 `DECLARE` 줄의 `DEFAULT`만 바꾼다(예: #122 배포일 전후 비교를 위해 `'20260626'` ~ 오늘).

## 출력 스키마

### 결과 1: `attempt_start_by_difficulty_daily`

| 컬럼 | 의미 |
| --- | --- |
| `event_date` | GA4 이벤트 날짜(YYYYMMDD) |
| `difficulty` | 시작 난이도(`attempt_start.difficulty`, 없으면 `(unknown)`) |
| `start_events` | 해당 일자·난이도 `attempt_start` 이벤트 수 |
| `start_users` | 해당 일자·난이도 distinct user 수 |

### 결과 2: `attempt_start_by_difficulty_total`

| 컬럼 | 의미 |
| --- | --- |
| `difficulty` | 시작 난이도 |
| `start_events` / `start_users` | 구간 전체 이벤트 수 / distinct user 수 |
| `first_seen_date` / `last_seen_date` | 해당 난이도 최초/최종 출현 일자 |
| `event_share` | 전체 `attempt_start` 중 해당 난이도 이벤트 점유율 |

### 결과 3: `easy_serving_summary`

| 컬럼 | 의미 |
| --- | --- |
| `easy_start_events` / `easy_start_users` | easy `attempt_start` 이벤트 수 / user 수 |
| `easy_first_seen_date` / `easy_last_seen_date` | easy 최초/최종 출현 일자(**NULL 이 아니면 DoD 충족**) |
| `onboarding_start_events` / `onboarding_start_users` | 입문 온보딩 퍼즐(`onboarding-easy-01`) 시작 이벤트 / user 수 |

## 판정 가이드

- **DoD 충족**: `easy_serving_summary.easy_first_seen_date` 가 NULL 이 아니다(= easy `attempt_start` 출현). 정상 설계상 그 대부분은 `onboarding_start_*` 와 일치해야 한다.
- **여전히 0건**: easy 가 끝내 출현하지 않으면 #122 배포가 아직 AIT/스토어에 반영되지 않았거나, 신규 코호트 유입이 없었을 가능성을 먼저 본다(소표본 주의). 배포 반영·유입이 확인되는데도 0건이면 서빙/계측 회귀로 재오픈한다.
- **점유율 해석**: 입문 퍼즐은 신규 첫 1회에만 노출되므로 easy `event_share` 는 normal 대비 낮게 나오는 것이 정상이다. 절대 출현 여부가 1차 판정 기준이다.
