# 활성화 KPI 대시보드·정례 모니터링

## 목적

첫 세션 완료율(baseline 11%) 등 핵심 활성화 KPI를 정기적으로 볼 수단을 표준화한다. **유입→홈→플레이→첫 입력→완료** 펀넬과 **난이도별 완료율**, **리텐션(D1/D7)** 을 표준 쿼리로 산출해 #1~#19 등 활성화 개선의 효과를 baseline→현재로 추적한다. 행동 변경 없는 **계측 전용** 작업이다.

## 표준 쿼리 (모듈)

활성화 KPI는 아래 표준 쿼리로 구성한다. 각 쿼리는 날짜 구간(`from_suffix`/`to_suffix`) 파라미터를 가진다(기본 최근 28일 롤링).

| KPI | 쿼리 | 산출 |
| --- | --- | --- |
| 활성화 펀넬 · 난이도별 완료율 | [`scripts/analytics/activation-kpi.sql`](../scripts/analytics/activation-kpi.sql) | visit→home→play→start→input→complete 단계별 user·전환율, 난이도별 완료율 |
| 리텐션 코호트(D1/D3/D7) | [`scripts/analytics/retention-cohort.sql`](../scripts/analytics/retention-cohort.sql) | 신규 코호트 기준 D1/D3/D7 복귀율 |
| 진행 마일스톤 도달률 | [`scripts/analytics/puzzle-progress-milestones.sql`](../scripts/analytics/puzzle-progress-milestones.sql) | 25/50/75% 도달률·완료 전환 |
| 비완료 이탈 지점 | [`scripts/analytics/puzzle-abandon-dropoff.sql`](../scripts/analytics/puzzle-abandon-dropoff.sql) | last_screen·progress·무입력 이탈 분포 |
| 온보딩 가이드 퍼널 | [`scripts/analytics/onboarding-guide-funnel.sql`](../scripts/analytics/onboarding-guide-funnel.sql) | shown→complete/dismiss·노출군 완료 전환 |

소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`

## 실행

```bash
# 활성화 펀넬 · 난이도별 완료율
bq query \
  --project_id=crossword-puzzle-79ae0 \
  --location=asia-southeast3 \
  --use_legacy_sql=false \
  < scripts/analytics/activation-kpi.sql

# 리텐션(D1/D7)
bq query \
  --project_id=crossword-puzzle-79ae0 \
  --location=asia-southeast3 \
  --use_legacy_sql=false \
  < scripts/analytics/retention-cohort.sql
```

구간을 고정하려면 각 SQL 상단 두 `DECLARE` 줄의 `DEFAULT`만 바꾼다(예: `'20260603'` ~ `'20260624'`).

## 출력 스키마 (activation-kpi.sql)

### 결과 1: `activation_funnel`

| 컬럼 | 의미 |
| --- | --- |
| `visitors` | `first_visit` distinct user(유입, 분모) |
| `home_users` / `play_users` | `screen_view` firebase_screen=`home` / `today` 도달 user |
| `start_users` | `attempt_start` user |
| `first_input_users` | `first_answer_input` user |
| `completed_users` | `mission_complete` user |
| `visit_to_play_rate` … `visit_to_complete_rate` | 유입 분모 누적 전환율 |
| `home_to_play_rate` / `start_to_input_rate` / `input_to_complete_rate` | 단계 간 전환율(병목 식별) |

### 결과 2: `completion_by_difficulty`

| 컬럼 | 의미 |
| --- | --- |
| `difficulty` | 시작 난이도(`attempt_start.difficulty`) |
| `start_users` | 난이도별 시작자 수(분모) |
| `first_input_users` / `completed_users` | 첫 입력·완료 user 수 |
| `first_input_rate` / `complete_rate` | 첫 입력·완료 전환율 |

> `home_to_play_rate`는 #106(홈 카드 가치전달, baseline home→play 63%)의 추적 지표다. `complete_rate`(난이도별)는 #92(신규 easy 강제 배정)·#108(normal 튜닝) 효과를 난이도로 분리해 본다.

## 추이 기록 (정기 갱신)

| 산출일(KST) | 구간(from~to) | visitors | visit→play | visit→complete | normal 완료율 | easy 완료율 | D1 | D7 | 비고 |
| ----------- | ------------- | -------- | ---------- | -------------- | ------------- | ----------- | -- | -- | ---- |
| _측정 후 기입_ | 2026-06-03~2026-06-24 | _기입_ | _기입_ | _기입_ | _기입_ | _기입_ | _기입_ | _기입_ | baseline(첫 완료율 11%) |

> 표본이 작으면 비율과 함께 분자/분모(user 수)를 같이 적는다. 정기(예: 주 1회) 갱신해 추세를 누적한다.

## 후속

- 펀넬에서 전환율이 가장 낮은 단계(병목)를 식별해 해당 단계 개선 이슈의 우선순위를 정한다(예: `home_to_play_rate` 낮으면 #106, `start_to_input_rate` 낮으면 #103/#105, `input_to_complete_rate` 낮으면 #108).
- 추이가 누적되면 baseline 대비 개선 폭을 분기/월 단위로 비교해 활성화 로드맵을 재정렬한다.
