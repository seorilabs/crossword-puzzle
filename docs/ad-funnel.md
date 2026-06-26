# 광고 라이프사이클 퍼널 표준 모니터링 (rewarded ads)

## 목적

광고 노출→보상 완주 퍼널을 **placement(광고 위치)별로 표준 산출**한다. 요청(`request`) → 결과(`result`, status) → 보상(`reward`) 단계와 **fill(노출 성공)·완주율·실패/취소 분포**를 한 번에 본다. 표본이 작아 단계 정의가 분산돼 있던 문제를 표준 쿼리로 정리한다. 행동 변경 없는 **계측 전용** 작업이다.

- 표준 쿼리: [`scripts/analytics/ad-funnel.sql`](../scripts/analytics/ad-funnel.sql)
- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`

## placement·단계 계약 (코드 점검 결과)

현재 광고 이벤트는 **placement 파라미터 없이 이벤트명 prefix로 위치를 구분**한다(`src/App.tsx`). 표준 쿼리는 이를 placement로 정규화한다:

| placement | 이벤트 prefix | 활성 여부 |
| --- | --- | --- |
| `rewarded_hint` | `rewarded_hint_ad_*` | ✅ 활성(힌트 보상형) |
| `rewarded_bonus_puzzle` | `rewarded_bonus_puzzle_ad_*` | ✅ 활성(보너스 퍼즐 보상형) |
| `result_interstitial` | `result_interstitial_ad_*` | ❌ 비활성 — 호출부 없음(parity로 차단, #98). 데이터에 나오면 구버전 잔존 |

단계(stage) 이벤트와 파라미터:

| stage | 이벤트 | 파라미터 |
| --- | --- | --- |
| `request` | `*_ad_request` | `puzzle_id` (+ rewarded_hint: `rewarded_hint_credits`) |
| `event` | `*_ad_event` | `phase`, `type`, `puzzle_id` (load/show 추적) |
| `result` | `*_ad_result` | `status`(rewarded/dismissed/failed/timeout/unsupported), `reason`(failed/timeout 시) |
| `reward` | `*_ad_reward` | `puzzle_id` (= 완주) |
| `cancel` | `rewarded_hint_ad_cancel` | 프롬프트 취소 |
| `disabled` | `*_ad_disabled` | Remote Config off |

### 표준 정의

- **fill(노출 성공)** = `result.status IN ('rewarded','dismissed')` — 광고가 실제 표시됨.
- **완주(reward)** = `result.status = 'rewarded'` (또는 `*_ad_reward` 이벤트).
- **no_fill/실패** = `status IN ('failed','timeout','unsupported')`.

> placement를 emit-side 파라미터로 통일(예: 모든 광고 이벤트에 `placement` 추가)하는 것은 web/mobile 양쪽 emit을 함께 바꿔야 하는 parity-민감 변경이라, 본 작업은 **분석 레이어에서 prefix→placement 정규화**로 표준화했다. 이벤트 종류가 늘어 prefix 규칙이 불충분해지면 그때 emit-side `placement` 도입을 별도 PR로 검토한다.

## 실행

```bash
bq query \
  --project_id=crossword-puzzle-79ae0 \
  --location=asia-southeast3 \
  --use_legacy_sql=false \
  < scripts/analytics/ad-funnel.sql
```

기본값은 최근 28일 롤링 구간이며, 구간을 고정하려면 SQL 상단 두 `DECLARE` 줄의 `DEFAULT`만 바꾼다.

## 출력 스키마

### 결과 1: `ad_funnel` — placement별 퍼널

| 컬럼 | 의미 |
| --- | --- |
| `placement` | 광고 위치(`rewarded_hint`/`rewarded_bonus_puzzle`/`result_interstitial`) |
| `requests` | `*_ad_request` 건수(분모) |
| `results` | `*_ad_result` 건수 |
| `filled` | 노출 성공(status rewarded+dismissed) 건수 |
| `rewards` | `*_ad_reward` 건수(완주) |
| `rewarded_results` | result status=rewarded 건수(reward 이벤트와 교차검증) |
| `cancels` | 프롬프트 취소 건수 |
| `users` | 관련 광고 이벤트 distinct user |
| `fill_rate` | `filled / requests` |
| `reward_rate` | `rewards / requests` (완주율) |
| `reward_given_fill` | `rewarded / filled` (노출 대비 완주율) |

### 결과 2: `result_status` — placement × status 분포

| 컬럼 | 의미 |
| --- | --- |
| `placement` | 광고 위치 |
| `status` | result status(rewarded/dismissed/failed/timeout/unsupported) |
| `result_count` | 건수 |
| `status_share` | placement 내 status 비중 |

## 추이 기록 (정기 갱신)

| 산출일(KST) | 구간(from~to) | placement | requests | fill_rate | reward_rate | 비고 |
| ----------- | ------------- | --------- | -------- | --------- | ----------- | ---- |
| _측정 후 기입_ | 2026-06-03~2026-06-24 | rewarded_hint | _기입_ | _기입_ | _기입_ | request 8→reward 7 baseline |

> 표본이 작으면 비율과 함께 분자/분모(건수)를 같이 적는다.

## 후속

- 표본이 누적되면 placement별 **fill rate·완주율**을 안정 산출해, fill이 낮은 placement(노출 실패)·완주율이 낮은 placement(취소/이탈)를 식별하는 후속 개선 이슈를 연다.
- `rewarded_hint`의 과노출/피로는 #99(노출당 완주율·과노출 코호트)와 함께 본다.
- `result_interstitial`에 이벤트가 계속 관측되면(구버전 잔존이 아니라 활성 경로 존재) #98로 게이팅을 재점검한다.
