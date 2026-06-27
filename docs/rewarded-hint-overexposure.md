# rewarded_hint 광고 과노출·피로 분석

## 목적

보상형 힌트 광고가 소수 코어에 과도하게 집중되는지([#99](https://github.com/seorilabs/crossword-puzzle/issues/99) baseline: 8명·1인당 16.5건)와, 반복 노출이 완주율을 떨어뜨리는 **광고 피로**가 있는지를 데이터로 점검한다. placement 단위 퍼널(요청→fill→완주)은 [`ad-funnel.sql`](../scripts/analytics/ad-funnel.sql)로 별도 산출하며, 본 쿼리는 ad-funnel이 다루지 않는 **user별 노출 집중도**와 **반복 노출 회차별 완주율 감쇠**에 초점을 둔다. 행동 변경 없는 **계측 전용** 작업이다.

## 배경 (퍼널은 이미 완전 계측됨)

`src/App.tsx`의 `requestRewardedHint`에서 rewarded hint 광고 라이프사이클이 단계별로 emit되고 있어, 노출→완주/취소/실패는 코드 변경 없이 BigQuery로 산출 가능하다.

| 단계 | 이벤트 |
| --- | --- |
| 비활성(config off) | `rewarded_hint_ad_disabled` |
| 요청 | `rewarded_hint_ad_request` |
| load/show 추적 | `rewarded_hint_ad_event` |
| 결과 | `rewarded_hint_ad_result` (`status` = rewarded/dismissed/failed/timeout/unsupported) |
| 보상 지급(완주) | `rewarded_hint_ad_reward` |
| 프롬프트 취소 | `rewarded_hint_ad_cancel` |

과노출 가드(쿨다운/일일 상한)는 상한 값이 수익·UX 트레이드오프가 큰 **product 결정**이고 "목표는 측정 후 확정"이라, 본 측정으로 완주율 하락 임계가 확인되면 `Remote Config` 키(예: `rewarded_hint_daily_cap`)로 도입하는 후속 이슈로 분리한다. 본 PR은 그 **측정 선행** 수단이다.

## 표준 쿼리

| 항목 | 쿼리 | 산출 |
| --- | --- | --- |
| rewarded_hint 과노출·피로 | [`scripts/analytics/rewarded-hint-overexposure.sql`](../scripts/analytics/rewarded-hint-overexposure.sql) | 요청 횟수 구간별 분포·완주율, 과노출 요약(평균/p90/헤비 코호트), 반복 회차별 완주율 감쇠 |

소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`

## 실행

```bash
bq query \
  --project_id=crossword-puzzle-79ae0 \
  --location=asia-southeast3 \
  --use_legacy_sql=false \
  < scripts/analytics/rewarded-hint-overexposure.sql
```

구간을 고정하려면 SQL 상단 두 `DECLARE` 줄의 `DEFAULT`만 바꾼다(예: `'20260603'` ~ `'20260624'`).

## 출력 스키마

### 결과 1: `exposure_by_user_bucket`

| 컬럼 | 의미 |
| --- | --- |
| `request_bucket` | 요청 횟수 구간(`01`/`02-05`/`06-10`/`11-20`/`21+`) |
| `users` / `total_requests` | 구간 user 수 / 요청 합계 |
| `request_share` | 전체 요청 중 구간 비중(과노출 집중도) |
| `reward_rate` / `cancel_rate` / `fail_rate` | 노출당 완주율 / 취소율 / 실패율(요청 분모) |

### 결과 2: `exposure_summary`

| 컬럼 | 의미 |
| --- | --- |
| `request_users` / `total_requests` | 요청 user 수 / 요청 합계 |
| `mean_requests_per_user` | 1인당 평균 요청(= baseline 16.5 비교) |
| `p50_requests` / `p90_requests` / `max_requests` | 1인당 요청 중앙/ p90 / 최대 |
| `heavy_users_10plus` / `heavy_request_share` | 10회+ 헤비 코호트 user 수 / 이들이 차지하는 요청 비중 |
| `overall_reward_rate` / `overall_cancel_rate` / `overall_fail_rate` | 전체 노출당 완주/취소/실패율 |

### 결과 3: `fatigue_by_attempt`

| 컬럼 | 의미 |
| --- | --- |
| `attempt_bucket` | user별 광고 결과 회차 구간(`01`/`02-03`/`04-06`/`07-10`/`11+`) |
| `results` / `rewarded` / `filled` / `failed` | 회차 구간 결과 수 / 완주 / 노출성공 / 실패 |
| `reward_rate` / `fail_rate` | 회차 구간 노출 대비 완주율 / 실패율 |

## 판정 가이드

- **과노출 집중도**: `exposure_summary.heavy_request_share`가 높고 `mean_requests_per_user`가 p50보다 크게 높으면(소수 헤비 유저가 요청을 독점) baseline의 "8명·16.5회/인" 집중이 재확인된다.
- **광고 피로 신호**: `fatigue_by_attempt.reward_rate`가 회차(`attempt_bucket`)가 올라갈수록 단조 하락하거나, `exposure_by_user_bucket`에서 요청 횟수가 많은 구간일수록 `reward_rate`가 낮고 `cancel_rate`/`fail_rate`가 높으면 반복 노출이 완주를 떨어뜨리는 피로로 해석한다.
- **가드 도입 기준**: 완주율이 유의하게 꺾이는 회차/요청 임계가 보이면 그 값을 근거로 `rewarded_hint_daily_cap`/쿨다운을 product 합의 후 별도 PR로 도입한다. 임계가 없으면 상한 도입을 보류한다.
- **소표본 주의**: 코호트가 작아 회차·구간별 비율은 노이즈가 크다. 비율과 함께 분모(건수·user 수)를 같이 본다.
