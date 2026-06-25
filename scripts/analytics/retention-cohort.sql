-- 코호트 리텐션 표준 쿼리 (D1/D3/D7 추이)
--
-- 목적: 일별 신규 사용자 코호트(가입일 = user_first_touch) × day_n 복귀율을
--       표준화해 D1/D3/D7 추이를 정기적으로 산출한다. 행동 변경 없음, 측정 전용.
--
-- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`
-- 거리 기준 타임존: Asia/Seoul (앱 일일 퍼즐/집계와 동일 기준)
-- 실행/스케줄: docs/retention-cohort.md 참고 (bq CLI · BigQuery Scheduled Query)
--
-- 구간 변수(from_suffix / to_suffix)는 GA4 export 테이블 접미사(YYYYMMDD)다.
-- 기본값은 최근 35일 롤링 구간이며, 특정 구간으로 고정하려면 아래 두 DECLARE
-- 줄만 바꾼다(예: DEFAULT '20260603'). named-parameter 변형은 docs/retention-cohort.md 참고.
--
-- 주의(우편향/right-censoring): 코호트일 + n 이 관측 구간 끝(max_observed_date)을
-- 넘으면 해당 day_n 복귀는 아직 관측 불가다. `d1_mature`/`d3_mature`/`d7_mature`
-- 플래그가 false인 코호트는 추이에서 제외한다. 표본이 작아(코호트 수 명 단위)
-- D1/D7은 노이즈가 크므로 신뢰구간과 함께 해석한다(docs/metric-backlog.md 참고).

DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 35 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'));

WITH events AS (
  SELECT
    user_pseudo_id,
    DATE(TIMESTAMP_MICROS(user_first_touch_timestamp), 'Asia/Seoul') AS cohort_date,
    DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul') AS activity_date
  FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
  WHERE (
      _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
      OR REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\d{8})$') BETWEEN from_suffix AND to_suffix
    )
    AND user_pseudo_id IS NOT NULL
    AND user_first_touch_timestamp IS NOT NULL
),
-- 관측 구간 안에서 처음 유입된 코호트만 대상으로 한다(구간 이전 유입자는 제외).
windowed AS (
  SELECT
    user_pseudo_id,
    cohort_date,
    activity_date,
    DATE_DIFF(activity_date, cohort_date, DAY) AS day_n
  FROM events
  WHERE cohort_date BETWEEN PARSE_DATE('%Y%m%d', from_suffix) AND PARSE_DATE('%Y%m%d', to_suffix)
    AND activity_date >= cohort_date
),
-- 사용자 × day_n 중복 제거(하루 여러 이벤트를 1회 복귀로 집계).
user_days AS (
  SELECT DISTINCT user_pseudo_id, cohort_date, day_n
  FROM windowed
),
max_observed AS (
  SELECT MAX(activity_date) AS max_observed_date FROM windowed
),
cohort_sizes AS (
  SELECT cohort_date, COUNT(DISTINCT user_pseudo_id) AS cohort_size
  FROM user_days
  WHERE day_n = 0
  GROUP BY cohort_date
)
SELECT
  c.cohort_date,
  c.cohort_size,
  COUNTIF(u.day_n = 1) AS d1_returned,
  COUNTIF(u.day_n = 3) AS d3_returned,
  COUNTIF(u.day_n = 7) AS d7_returned,
  SAFE_DIVIDE(COUNTIF(u.day_n = 1), c.cohort_size) AS d1_retention,
  SAFE_DIVIDE(COUNTIF(u.day_n = 3), c.cohort_size) AS d3_retention,
  SAFE_DIVIDE(COUNTIF(u.day_n = 7), c.cohort_size) AS d7_retention,
  -- 코호트일 + n 이 관측 구간 끝까지 도달했는지(미관측 day_n은 0으로 보이므로 가드).
  DATE_ADD(c.cohort_date, INTERVAL 1 DAY) <= m.max_observed_date AS d1_mature,
  DATE_ADD(c.cohort_date, INTERVAL 3 DAY) <= m.max_observed_date AS d3_mature,
  DATE_ADD(c.cohort_date, INTERVAL 7 DAY) <= m.max_observed_date AS d7_mature
FROM cohort_sizes c
LEFT JOIN user_days u USING (cohort_date)
CROSS JOIN max_observed m
GROUP BY c.cohort_date, c.cohort_size, m.max_observed_date
ORDER BY c.cohort_date;
