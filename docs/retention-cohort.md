# 코호트 리텐션 표준 모니터링 (D1/D3/D7)

## 목적

재방문/잔존율을 사람마다 즉석 쿼리로 보지 않고, **일별 신규 코호트 × day_n 복귀**를 표준 쿼리 하나로 산출해 D1/D3/D7 추이를 정기적으로 기록한다. 행동 변경 없는 **계측 전용** 작업이다.

- 표준 쿼리: [`scripts/analytics/retention-cohort.sql`](../scripts/analytics/retention-cohort.sql)
- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`
- 거리 기준 타임존: `Asia/Seoul` (앱 일일 퍼즐/완료 집계와 동일)

> ⚠️ **소표본 주의.** 현재 일 코호트는 명 단위라 D1/D7은 노이즈가 크다(1~2명에 출렁임). 단일 코호트 수치로 행동 변경을 결정하지 말고, 신뢰구간·여러 코호트 합산과 함께 해석한다(`docs/metric-backlog.md`의 H5 INSUFFICIENT-DATA 판정 참고).

## 코호트 정의

- 코호트일 `cohort_date` = `user_first_touch_timestamp`(첫 유입)의 Asia/Seoul 날짜
- 복귀 = 코호트일 이후 `day_n`일에 해당 사용자의 이벤트가 1건 이상 존재(이벤트 종류 무관, 하루 1회로 dedupe)
- `day_n = DATE_DIFF(activity_date, cohort_date, DAY)`, `D1 = day_n 1`, `D3 = day_n 3`, `D7 = day_n 7`
- 관측 구간 **이전**에 유입된 사용자는 코호트에서 제외(구간 내 신규만)

### 우편향(right-censoring) 가드

코호트일 + n 이 관측 구간의 마지막 날(`max_observed_date`)을 넘으면 그 `day_n` 복귀는 **아직 관측할 수 없다**(미관측이 0으로 보임). 쿼리는 코호트별로 `d1_mature`/`d3_mature`/`d7_mature` 플래그를 함께 내려준다. **추이 기록 시 해당 플래그가 `true`인 코호트만** 사용한다(예: D7 추이는 `d7_mature = true`만).

## 실행

### 1) 기본(최근 35일 롤링, 인자 없이 실행)

```bash
bq query \
  --project_id=crossword-puzzle-79ae0 \
  --location=asia-southeast3 \
  --use_legacy_sql=false \
  < scripts/analytics/retention-cohort.sql
```

구간을 고정하려면 SQL 상단 두 `DECLARE` 줄의 `DEFAULT`만 바꾼다(예: `'20260603'` ~ `'20260624'`).

### 2) named-parameter 변형(구간을 CLI로 주입)

SQL 상단 `DECLARE from_suffix ... ; DECLARE to_suffix ... ;` 두 줄을 지우고 본문의 `from_suffix`/`to_suffix`를 `@from_suffix`/`@to_suffix`로 바꾼 뒤:

```bash
bq query \
  --project_id=crossword-puzzle-79ae0 \
  --location=asia-southeast3 \
  --use_legacy_sql=false \
  --parameter='from_suffix:STRING:20260603' \
  --parameter='to_suffix:STRING:20260624' \
  < scripts/analytics/retention-cohort.sql
```

### 3) 정기 실행(스케줄링)

추이를 자동 적재하려면 BigQuery **Scheduled Query**(예: 매일 1회, `asia-southeast3`)로 위 쿼리를 결과 테이블에 누적하거나, 완료 통계와 같은 Cloud Run Job 패턴(`scripts/setup-completion-stats-cloud-run-job.sh`, `docs/puzzle-completion-stats.md`)으로 감싼다. 스케줄러/적재 테이블 프로비저닝 자체는 인프라 변경이라 본 문서 범위 밖이며, 별도 운영 작업으로 분리한다.

## 출력 스키마

| 컬럼            | 의미                                               |
| --------------- | -------------------------------------------------- |
| `cohort_date`   | 코호트일(첫 유입, Asia/Seoul)                      |
| `cohort_size`   | 해당일 신규 사용자 수(day_n 0 distinct)            |
| `d1_returned`   | D1 복귀자 수                                       |
| `d3_returned`   | D3 복귀자 수                                       |
| `d7_returned`   | D7 복귀자 수                                       |
| `d1_retention`  | D1 복귀율(0~1) = `d1_returned / cohort_size`       |
| `d3_retention`  | D3 복귀율(0~1)                                     |
| `d7_retention`  | D7 복귀율(0~1)                                     |
| `d1_mature`     | D1이 관측 구간 안에서 완전 관측됐는지(boolean)     |
| `d3_mature`     | D3 관측 완료 여부                                  |
| `d7_mature`     | D7 관측 완료 여부                                  |

### 구간 합산(weighted) 추이용 변형

여러 코호트를 묶어 신뢰도 있게 보려면 `mature` 코호트만 분모/분자로 합산한다:

```sql
-- 위 SQL의 최종 SELECT를 아래로 교체하면 구간 전체 가중 평균이 나온다.
SELECT
  SUM(IF(d1_mature, cohort_size, 0)) AS d1_base,  SUM(d1_returned) AS d1_returned,
  SUM(IF(d3_mature, cohort_size, 0)) AS d3_base,  SUM(d3_returned) AS d3_returned,
  SUM(IF(d7_mature, cohort_size, 0)) AS d7_base,  SUM(d7_returned) AS d7_returned,
  SAFE_DIVIDE(SUM(d1_returned), SUM(IF(d1_mature, cohort_size, 0))) AS d1_retention,
  SAFE_DIVIDE(SUM(d3_returned), SUM(IF(d3_mature, cohort_size, 0))) AS d3_retention,
  SAFE_DIVIDE(SUM(d7_returned), SUM(IF(d7_mature, cohort_size, 0))) AS d7_retention
FROM per_cohort;  -- per_cohort = 위 표준 쿼리 결과 CTE
```

## 추이 기록 (정기 갱신)

정기 실행 결과를 아래 표에 누적해 baseline → 현재 추세를 추적한다. 분모는 **mature 코호트 합산**(`d*_base`)을 쓴다. 표본이 작으면 비율과 함께 `n/base`도 적는다.

| 산출일(KST) | 구간(from~to) | mature 코호트 수 | D1 (n/base) | D3 (n/base) | D7 (n/base) | 비고 |
| ----------- | ------------- | ---------------- | ----------- | ----------- | ----------- | ---- |
| 2026-06-25  | 2026-06-03~2026-06-24 | _측정 후 기입_ | _측정 후 기입_ | _측정 후 기입_ | _측정 후 기입_ | baseline (metric-backlog: D1 ~8.8%, D7 1명) |

> 기준선(baseline): `docs/metric-backlog.md` 기록상 코호트 80 중 D1 7명(8.8%), D7 1명. 본 표준 쿼리로 동일 구간을 재산출해 첫 행을 채우고, 이후 정기 실행마다 한 행씩 추가한다.

## 후속

표본이 충분히 쌓이면(코호트당 수십 명 이상) D1/D7을 **신뢰구간과 함께 재판정**하는 후속 이슈를 연다. 그 전까지 잔존율 수치 하나로 행동 변경을 결정하지 않는다(획득 부족과 제품 매력 부족을 분리).
