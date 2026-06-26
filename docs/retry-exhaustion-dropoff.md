# 도전 기회(재시도) 소진 구간별 완료·이탈률 모니터링 (remaining_attempts / attempt_number)

## 목적

일일 도전 기회(attempts, 상한 `DAILY_ATTEMPT_LIMIT=3`)의 **소진·재시도가 활성화를 막는지** 측정한다. 시작(`attempt_start`)을 분모로, 같은 시도의 완료(`mission_complete`)·이탈(`puzzle_abandon`)을 분자로 두어 남은 기회(`remaining_attempts`)·시도 회차(`attempt_number`)·시도 종류(first/retry)별 **완료율·이탈률**을 분해한다. 행동 변경 없는 **계측 전용** 작업이다(#107).

- 표준 쿼리: [`scripts/analytics/retry-exhaustion-dropoff.sql`](../scripts/analytics/retry-exhaustion-dropoff.sql)
- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`

## emit 배선 확인 (코드 점검 결과)

분석에 쓰는 세 이벤트는 모두 `attempt_number`·`remaining_attempts`를 **공통으로 싣고 있어 추가 계측 없이 분석 가능**하다(`src/App.tsx`).

| 이벤트 | 역할(분모/분자) | 주요 파라미터 |
| --- | --- | --- |
| `attempt_start` | 분모(시도 수) | `attempt_kind`("first"/"retry"), `attempt_number`, `remaining_attempts`, `puzzle_id` + 공통 퍼즐 파라미터 |
| `mission_complete` | 분자(완료) | `puzzle_id`, `attempt_number`, `remaining_attempts`, `elapsed_seconds`, `difficulty` … |
| `puzzle_abandon` | 분자(이탈, #87) | `puzzle_id`, `attempt_number`, `remaining_attempts`, `last_screen`, `progress_percent` … |

- **`remaining_attempts`**: 해당 시도 시작 직후 남은 기회. 상한 3에서 `attempts_used` 1/2/3 → `remaining` 2/1/0. **`0` = 기회 소진(마지막 시도) 구간**.
- **`attempt_kind`**: `attempt_start`에만 존재한다. 완료/이탈 이벤트에는 없어 쿼리에서 `attempt_number`로 파생한다(`attempt_number=1` → first, `≥2` → retry).

> baseline에 attempt 파라미터는 이미 존재했으나(이슈 본문) 소진 구간 이탈률 분석이 수행되지 않았다. 본 쿼리가 그 분석을 표준화한다. 데이터가 작으면 비율은 노이즈가 크므로 분자/분모를 함께 본다.

## 비율 산출 방식 (시도 단위 join)

세그먼트별 단순 건수 비율은 분자(완료/이탈)와 분모(시작)의 키가 어긋날 수 있고(예: `attempt_number=3` 완료가 `remaining=2` 그룹에 섞임), `attempt_start` 없는 `puzzle_abandon`이 분자에 들어가 `abandon_rate`를 부풀릴 수 있다. 이를 피하려고 먼저 **`(user_pseudo_id, puzzle_id, attempt_number)`를 시도 키**로 삼아 `attempt_start` 1행 = 1시도로 정합 표(`attempt_outcome`)를 만들고, 같은 키의 완료/이탈 존재 여부를 `LEFT JOIN`으로 표시한 뒤 세그먼트별로 집계한다.

- `completion_rate = completed 시도 수 / 전체 시도 수`
- `abandon_rate = abandoned 시도 수 / 전체 시도 수`
- 분자는 항상 시작된 시도(`attempt_start`)에 묶이므로 키 교차·미연결 이탈이 비율을 오염시키지 않는다. `attempt_start` 키와 매칭되지 않는 `puzzle_abandon`은 분율에서 제외하고 진단 SELECT(`unmatched_abandons`)로만 보고한다.
- 한 시도가 완료도 이탈도 아닐 수 있어(세션 유지/판정 전) `completion_rate + abandon_rate < 1` 인 잔여분이 생길 수 있다.

> **시도 키 주의**: `attempt_number`는 `(puzzle_id, 일자)` 미션 기준으로 증가하므로, 같은 `puzzle_id`를 다른 날 다시 풀어 `attempt_number`가 재사용되는 드문 경우 동일 키로 합쳐질 수 있다(일일 퍼즐은 보통 1회 플레이라 영향은 작다). `ga_session_id` 분할은 한 시도가 세션을 걸칠 때 과분할되어 오히려 부정확하므로 쓰지 않는다. `attempt_number`가 없는(키 불성립) 이벤트는 분석에서 제외한다(#124).

## 실행

```bash
bq query \
  --project_id=crossword-puzzle-79ae0 \
  --location=asia-southeast3 \
  --use_legacy_sql=false \
  < scripts/analytics/retry-exhaustion-dropoff.sql
```

기본값은 최근 28일 롤링 구간이며, 구간을 고정하려면 SQL 상단 두 `DECLARE` 줄의 `DEFAULT`만 바꾼다(예: `'20260603'` ~ `'20260624'`). 스크립트는 임시 테이블 1개와 결과 SELECT 3개(`section` 컬럼으로 구분)를 순서대로 반환한다.

## 출력 스키마

### 결과 1: `by_remaining_attempts` — 남은 기회별 완료·이탈률

| 컬럼 | 의미 |
| --- | --- |
| `remaining_attempts` | 시도 시작 직후 남은 기회(2/1/0, `0`=소진) |
| `starts` | 해당 구간 `attempt_start` 건수(분모) |
| `starter_users` | 시작 distinct user 수 |
| `completes` | `mission_complete` 건수 |
| `abandons` | `puzzle_abandon` 건수 |
| `completion_rate` | `completes / starts` |
| `abandon_rate` | `abandons / starts` |

### 결과 2: `by_attempt_number` — 시도 회차·종류별 완료·이탈률

| 컬럼 | 의미 |
| --- | --- |
| `attempt_number` | 시도 회차(1/2/3) |
| `attempt_kind` | `first`(1회차) / `retry`(2회차+), `attempt_number`로 파생 |
| `starts` / `starter_users` | 시작 건수 / distinct user 수(분모) |
| `completes` / `abandons` | 완료 / 이탈 건수 |
| `completion_rate` / `abandon_rate` | 완료율 / 이탈률 |

### 결과 3: `exhaustion_by_difficulty` — 소진(remaining_attempts=0) 구간의 난이도별 분해

| 컬럼 | 의미 |
| --- | --- |
| `difficulty` | 난이도(`easy`/`normal`/`hard`) |
| `starts` / `starter_users` | 마지막 시도 시작 건수 / distinct user 수 |
| `completes` / `abandons` | 완료 / 이탈 건수 |
| `completion_rate` / `abandon_rate` | 완료율 / 이탈률 |

### 진단: `unmatched_abandons` — 시작과 매칭되지 않은 이탈

| 컬럼 | 의미 |
| --- | --- |
| `abandons_without_start` | `attempt_start` 키와 매칭되지 않는 `puzzle_abandon` 건수(분율에서 제외됨) |
| `users` | 해당 distinct user 수 |

> 이 값이 크면 시도 키 정합이 약하다는 신호이므로 위 비율 해석에 주의한다(예: 윈도 경계에서 시작은 구간 밖, 이탈만 구간 안).

## 추이 기록 (정기 갱신)

| 산출일(KST) | 구간(from~to) | remaining=0 starts | remaining=0 완료율 | remaining=0 이탈률 | 비고 |
| ----------- | ------------- | ------------------ | ------------------ | ------------------ | ---- |
| _측정 후 기입_ | 2026-06-03~2026-06-24 | _기입_ | _기입_ | _기입_ | #107 baseline |

> 표본이 작으면 비율과 함께 분자/분모(건수·user 수)를 같이 적는다.

## 후속

- **`remaining_attempts=0`(소진) 구간에서 이탈률이 뚜렷이 높고 완료율이 낮으면** → 재시도 제한이 활성화를 막는 신호이므로, 소진 시 UX(#52)와 연계해 완화/구제(추가 기회·힌트 구제 등) 후속 이슈를 데이터 근거와 함께 연다.
- **재도전(`attempt_number≥2`) 완료율이 첫 시도보다 유의하게 낮으면** → 재시도가 결실로 이어지지 않는다는 의미이므로, 재도전 진입 시 힌트/진행 보조를 강화하는 개선을 검토한다.
- 표본이 작아 비율 노이즈가 크면(현 신규 코호트 소표본) 표본 누적 후 재판정한다.
