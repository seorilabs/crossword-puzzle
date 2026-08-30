# 비완료 이탈 지점 분포 모니터링 (puzzle_abandon)

## 목적

시작 후 완료하지 않고 떠난 이탈(`puzzle_abandon`, #87)의 **이탈 지점**을 재측정한다. 이탈 직전 화면(`last_screen`), 진행률 구간(`progress_percent`), 첫 입력 발생 여부(`had_first_input`, #103)로 분해해 "어디서·얼마나 풀다가 멈추는지"와 "무입력(침묵) 이탈 비중"을 본다. 행동 변경 없는 **계측 전용** 작업이다.

- 표준 쿼리: [`scripts/analytics/puzzle-abandon-dropoff.sql`](../scripts/analytics/puzzle-abandon-dropoff.sql)
- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`

## emit 배선 확인 (코드 점검 결과)

`puzzle_abandon`과 `game_puzzle_abandon` emit은 Web(`src/App.tsx`)과 RN(`apps/mobile/App.tsx`, `apps/mobile/gameplayTelemetry.ts`)에 같은 파라미터 계약으로 배선되어 있다.

- **트리거**: 두 표면 모두 보드(`today`)에서 다른 화면으로 이동할 때 기록한다. Web은 `pagehide` / `visibilitychange=hidden`을, RN은 `AppState=background`와 보드에서 다른 퍼즐을 선택하는 경로를 추가로 다룬다.
- **가드**: 시작했고(`hasStarted`) 아직 완료하지 않은 경우만 이탈로 본다. `puzzleId:attemptsUsed` 키로 **시도당 1회만** 기록한다.
- **파라미터**: `last_screen`, `progress_percent`, `words_filled`, `total_words`, `elapsed_seconds`, `had_first_input`, `attempt_number`, `hint_count`, `remaining_attempts` + 공통 퍼즐 파라미터(`puzzle_id`, `slot_id`, `pack_id`, `published_at`, `difficulty`, `grid_size`, `word_count`).
- 최신 진행 상태는 두 표면 모두 매 렌더마다 `abandonSnapshotRef`에 갱신해 lifecycle listener가 stale closure 없이 이탈 시점 값을 읽는다.

따라서 baseline의 `puzzle_abandon` 데이터 0건은 emit 누락이 아니라 **릴리스/데이터 적재 지연**(#87 머지 6/23, 데이터 구간 ~6/24)으로 보인다. 데이터가 쌓이면 아래 쿼리로 재측정한다.

> `had_first_input`은 #103에서 추가됐다. #103 머지 이전 적재분에는 이 파라미터가 없어 `NULL`이며, 그 구간은 `words_filled = 0`을 무입력 이탈의 근사 신호로 함께 본다.

## 실행

```bash
bq query \
  --project_id=crossword-puzzle-79ae0 \
  --location=asia-southeast3 \
  --use_legacy_sql=false \
  < scripts/analytics/puzzle-abandon-dropoff.sql
```

기본값은 최근 28일 롤링 구간이며, 구간을 고정하려면 SQL 상단 두 `DECLARE` 줄의 `DEFAULT`만 바꾼다(예: `'20260603'` ~ `'20260624'`). 스크립트는 임시 테이블 1개와 결과 SELECT 3개(`section` 컬럼으로 구분)를 순서대로 반환한다.

## 출력 스키마

### 결과 1: `by_last_screen` — 이탈 직전 화면별 분포

| 컬럼                     | 의미                                                          |
| ------------------------ | ------------------------------------------------------------- |
| `last_screen`            | 이탈 직전 화면(`today`, 인앱 이동 시 떠난 화면 등)            |
| `abandons`               | 이탈 건수                                                     |
| `abandon_users`          | 이탈 distinct user 수                                         |
| `avg_elapsed_seconds`    | 이탈까지 평균 경과(초)                                        |
| `median_elapsed_seconds` | 이탈까지 중앙값(초)                                           |
| `abandons_per_starter`   | 시작자(`attempt_start` distinct user) 대비 이탈 건수 비율     |

### 결과 2: `by_progress_bucket` — 진행률 구간별 분포

| 컬럼                  | 의미                                                          |
| --------------------- | ------------------------------------------------------------- |
| `progress_bucket`     | 진행률 구간(`0%`, `1-24%`, `25-49%`, `50-74%`, `75-99%`)      |
| `abandons`            | 구간 이탈 건수                                                |
| `abandon_users`       | 구간 이탈 distinct user 수                                    |
| `avg_elapsed_seconds` | 구간 평균 경과(초)                                            |

### 결과 3: `by_input_state` — 무입력(침묵) vs 진행 후 이탈

| 컬럼                     | 의미                                                          |
| ------------------------ | ------------------------------------------------------------- |
| `input_state`            | `silent`(무입력, `had_first_input=false`) / `had_input`(진행 후) / 레거시 근사 |
| `abandons`               | 이탈 건수                                                     |
| `abandon_users`          | 이탈 distinct user 수                                         |
| `avg_elapsed_seconds`    | 평균 경과(초)                                                 |
| `median_elapsed_seconds` | 중앙값(초). `silent`의 경우 첫 입력 없이 머문 시간(TTFI 상한) |
| `within_8s`              | 8초 이내 이탈 건수(침묵 이탈 조기 구간)                       |
| `within_8s_rate`         | 8초 이내 이탈 비율                                            |

## 추이 기록 (정기 갱신)

| 산출일(KST) | 구간(from~to) | 총 이탈 | 무입력 이탈 비중 | 최다 last_screen | 최다 progress 구간 | 비고 |
| ----------- | ------------- | ------- | ---------------- | ---------------- | ------------------ | ---- |
| _측정 후 기입_ | 2026-06-03~2026-06-24 | _기입_ | _기입_ | _기입_ | _기입_ | #87 baseline 재측정 |

> 표본이 작으면 비율과 함께 분자/분모(건수·user 수)를 같이 적는다.

## 후속

- **무입력 이탈 비중이 높고 8초 이내 비율이 크면** → 첫 입력 진입장벽(침묵 이탈)이 주 이탈 원인이므로, 첫 입력 유도(#103 TTFI·온보딩 가이드 #105) 개선의 우선순위를 올린다.
- **특정 `last_screen`/`progress` 구간에 이탈이 집중되면** → 그 구간의 난이도 보조/진행 보상(#86 마일스톤)을 강화하는 후속 개선 이슈를 연다.
