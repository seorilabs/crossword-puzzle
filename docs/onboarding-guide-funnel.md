# 온보딩 가이드 퍼널·완료 기여 모니터링 (onboarding_guide_*)

## 목적

첫 진입 1스텝 온보딩 가이드(#89, 6/23 머지)의 **노출→완료/이탈** 전환과, 가이드 **노출군의 첫 입력·완료 전환 기여**를 재측정한다. `onboarding_guide_shown`을 분모로 `complete`/`dismiss`/`first_answer_input`/`mission_complete` 전환을 보고, 노출군 vs 비노출군의 전환 차이를 비교한다. 행동 변경 없는 **계측 전용** 작업이다.

- 표준 쿼리: [`scripts/analytics/onboarding-guide-funnel.sql`](../scripts/analytics/onboarding-guide-funnel.sql)
- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`

## emit 배선 확인 (코드 점검 결과)

온보딩 가이드 이벤트는 현재 코드에 **정상 배선되어 있다**(`src/App.tsx`):

| 단계 | 이벤트 | emit 위치 / 조건 | 파라미터 |
| --- | --- | --- | --- |
| 노출 | `onboarding_guide_shown` | 가이드가 보이고(최초 1회) `firstInputGuideShownRef`로 1회 가드 | `attempt_number` + 공통 퍼즐 |
| 완료 | `onboarding_guide_complete` | 가이드 노출 중/전 첫 수동 입력 성공 시(`trackFirstAnswerInput`) | `attempt_number`, `elapsed_seconds` + 공통 퍼즐 |
| 닫기 | `onboarding_guide_dismiss` | 가이드 X 버튼(`dismissFirstInputGuide`) | `attempt_number` + 공통 퍼즐 |

- 가이드 노출 조건: `hasSeenHowToPlay && !hasSeenFirstInputGuide && 입력 0`(셀 값 없음). 즉 "방법 보기"를 본 뒤 아직 첫 입력 전인 신규에게만 노출된다.
- `complete`는 첫 입력 시점에 가이드가 떠 있던(또는 보기 전) 경우에만 emit되고, 동시에 `crossword:first-input-guide-seen`을 저장해 재노출을 막는다.

따라서 baseline의 `onboarding_guide_*` 데이터 0건은 emit 누락이 아니라 **릴리스/데이터 적재 지연**(#89 머지 6/23, 데이터 구간 ~6/24)으로 보인다. 데이터가 쌓이면 아래 쿼리로 재측정한다.

## 실행

```bash
bq query \
  --project_id=crossword-puzzle-79ae0 \
  --location=asia-southeast3 \
  --use_legacy_sql=false \
  < scripts/analytics/onboarding-guide-funnel.sql
```

기본값은 최근 28일 롤링 구간이며, 구간을 고정하려면 SQL 상단 두 `DECLARE` 줄의 `DEFAULT`만 바꾼다(예: `'20260603'` ~ `'20260624'`). 스크립트는 임시 테이블 1개와 결과 SELECT 3개(`section` 컬럼으로 구분)를 반환한다.

## 출력 스키마

### 결과 1: `guide_funnel` — 노출 분모 기준 전환

| 컬럼                    | 의미                                                          |
| ----------------------- | ------------------------------------------------------------- |
| `shown_users`           | 가이드 노출 user 수(분모)                                     |
| `complete_users`        | 노출 후 `onboarding_guide_complete` 도달 user 수             |
| `dismiss_users`         | 노출 후 `onboarding_guide_dismiss` user 수                   |
| `first_input_users`     | 노출군 중 `first_answer_input` 도달 user 수                  |
| `completed_users`       | 노출군 중 `mission_complete` 도달 user 수                    |
| `complete_rate`         | `complete_users / shown_users`                               |
| `dismiss_rate`          | `dismiss_users / shown_users`                                |
| `first_input_rate`      | 노출군 첫 입력 전환율                                          |
| `mission_complete_rate` | 노출군 완료 전환율                                            |

### 결과 2: `shown_vs_unshown` — 노출군 vs 비노출군(시작자 분모)

| 컬럼                    | 의미                                                          |
| ----------------------- | ------------------------------------------------------------- |
| `cohort`                | `shown`(가이드 노출) / `unshown`(미노출)                      |
| `starters`              | 코호트 시작자(`attempt_start`) 수                            |
| `first_input_users`     | 첫 입력 도달 user 수                                          |
| `completed_users`       | 완료 user 수                                                  |
| `first_input_rate`      | 첫 입력 전환율                                                |
| `mission_complete_rate` | 완료 전환율                                                   |

> 해석 주의: 가이드는 "입력 0"일 때만 노출되므로 **비노출군에는 즉시 입력한 user가 섞인다**. 따라서 단순 비교로 가이드 효과를 인과로 단정하지 말고, 표본 누적 후 추세로 본다.

### 결과 3: `complete_elapsed` — 가이드 완료까지 걸린 시간

| 컬럼                     | 의미                                                          |
| ------------------------ | ------------------------------------------------------------- |
| `complete_events`        | `onboarding_guide_complete` 이벤트 수                        |
| `avg_elapsed_seconds`    | 완료까지 평균 경과(초)                                        |
| `median_elapsed_seconds` | 완료까지 중앙값(초)                                           |
| `within_8s` / `within_8s_rate` | 8초 이내 완료 건수·비율(빠른 첫 입력 구간)             |

## 추이 기록 (정기 갱신)

| 산출일(KST) | 구간(from~to) | shown | complete율 | dismiss율 | 첫입력율 | 완료율(노출군) | 비고 |
| ----------- | ------------- | ----- | ---------- | --------- | -------- | -------------- | ---- |
| _측정 후 기입_ | 2026-06-03~2026-06-24 | _기입_ | _기입_ | _기입_ | _기입_ | _기입_ | #89 baseline 재측정 |

> 표본이 작으면 비율과 함께 분자/분모(user 수)를 같이 적는다.

## 후속

- **노출군의 첫 입력/완료 전환이 비노출군보다 유의미하게 높으면** → 가이드 유지·강화(노출 타이밍·문구 개선) 방향.
- **dismiss율이 높거나 complete율이 낮으면** → 가이드 문구/위치가 첫 입력을 돕지 못한다는 신호이므로, 첫 입력 유도(예: 셀 강조·예시 입력) 개선 이슈를 연다.
