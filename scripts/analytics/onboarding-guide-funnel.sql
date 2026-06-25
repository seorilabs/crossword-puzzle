-- 온보딩 가이드 퍼널·완료 기여 분석 (onboarding_guide_*)
--
-- 목적: 첫 진입 1스텝 온보딩 가이드(#89)의 노출→완료/이탈 전환과, 가이드 노출군의
--       첫 입력·완료 전환 기여를 재측정한다. shown을 분모로 complete/dismiss/
--       first_answer_input/mission_complete 전환을 보고, 노출군 vs 비노출군의
--       전환 차이를 비교한다. 측정 전용(행동 변경 없음).
--
-- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`
-- emit (src/App.tsx):
--   onboarding_guide_shown    : 첫 입력 가이드 노출(최초 1회).      params: ...puzzle, attempt_number
--   onboarding_guide_complete : 가이드 노출 중/전 첫 입력 성공.     params: ...puzzle, attempt_number, elapsed_seconds
--   onboarding_guide_dismiss  : 가이드 닫기(X).                     params: ...puzzle, attempt_number
--   (가이드는 hasSeenHowToPlay && !hasSeenFirstInputGuide && 입력 0 일 때만 노출)
--
-- 구간 변수(from_suffix / to_suffix)는 GA4 export 테이블 접미사(YYYYMMDD)다.
-- 기본값은 최근 28일 롤링이며, 특정 구간으로 고정하려면 아래 두 DECLARE 줄만 바꾼다.
--
-- 주의: 표본이 작으면 비율은 노이즈가 크다. 비율과 함께 분자/분모(user 수)를 같이 본다.

DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 28 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'));

-- 관련 이벤트를 한 번만 스캔해 user 단위로 각 단계 도달 여부를 모은다.
CREATE TEMP TABLE guide_per_user AS
SELECT
  user_pseudo_id,
  MAX(IF(event_name = 'attempt_start', 1, 0)) AS started,
  MAX(IF(event_name = 'onboarding_guide_shown', 1, 0)) AS guide_shown,
  MAX(IF(event_name = 'onboarding_guide_complete', 1, 0)) AS guide_complete,
  MAX(IF(event_name = 'onboarding_guide_dismiss', 1, 0)) AS guide_dismiss,
  MAX(IF(event_name = 'first_answer_input', 1, 0)) AS first_input,
  MAX(IF(event_name = 'mission_complete', 1, 0)) AS completed
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE (
    _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
    OR REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\d{8})$') BETWEEN from_suffix AND to_suffix
  )
  AND event_name IN (
    'attempt_start', 'onboarding_guide_shown', 'onboarding_guide_complete',
    'onboarding_guide_dismiss', 'first_answer_input', 'mission_complete'
  )
  AND user_pseudo_id IS NOT NULL
GROUP BY user_pseudo_id;

-- 결과 1) 가이드 노출(shown) 분모 기준 전환 퍼널.
--   complete/dismiss는 상호배타가 아닐 수 있다(가이드 완료 후 별도 dismiss는 없지만,
--   레거시/경합 케이스 방어). first_input·mission_complete는 노출군의 첫 입력·완료 전환.
SELECT
  'guide_funnel' AS section,
  COUNTIF(guide_shown = 1) AS shown_users,
  COUNTIF(guide_shown = 1 AND guide_complete = 1) AS complete_users,
  COUNTIF(guide_shown = 1 AND guide_dismiss = 1) AS dismiss_users,
  COUNTIF(guide_shown = 1 AND first_input = 1) AS first_input_users,
  COUNTIF(guide_shown = 1 AND completed = 1) AS completed_users,
  SAFE_DIVIDE(COUNTIF(guide_shown = 1 AND guide_complete = 1), COUNTIF(guide_shown = 1)) AS complete_rate,
  SAFE_DIVIDE(COUNTIF(guide_shown = 1 AND guide_dismiss = 1), COUNTIF(guide_shown = 1)) AS dismiss_rate,
  SAFE_DIVIDE(COUNTIF(guide_shown = 1 AND first_input = 1), COUNTIF(guide_shown = 1)) AS first_input_rate,
  SAFE_DIVIDE(COUNTIF(guide_shown = 1 AND completed = 1), COUNTIF(guide_shown = 1)) AS mission_complete_rate
FROM guide_per_user;

-- 결과 2) 노출군 vs 비노출군(시작자 분모) 첫 입력·완료 전환 비교.
--   온보딩 가이드 노출이 첫 입력/완료 전환을 끌어올리는지 본다. 단, 가이드는
--   "입력 0"일 때만 노출되므로 비노출군에는 즉시 입력한 user가 섞인다(해석 주의).
SELECT
  'shown_vs_unshown' AS section,
  IF(guide_shown = 1, 'shown (가이드 노출)', 'unshown (미노출)') AS cohort,
  COUNT(*) AS starters,
  COUNTIF(first_input = 1) AS first_input_users,
  COUNTIF(completed = 1) AS completed_users,
  SAFE_DIVIDE(COUNTIF(first_input = 1), COUNT(*)) AS first_input_rate,
  SAFE_DIVIDE(COUNTIF(completed = 1), COUNT(*)) AS mission_complete_rate
FROM guide_per_user
WHERE started = 1
GROUP BY cohort
ORDER BY cohort DESC;

-- 결과 3) 가이드 완료까지 걸린 시간(onboarding_guide_complete.elapsed_seconds) 분포.
SELECT
  'complete_elapsed' AS section,
  COUNT(*) AS complete_events,
  ROUND(AVG(elapsed_seconds), 1) AS avg_elapsed_seconds,
  APPROX_QUANTILES(elapsed_seconds, 2)[OFFSET(1)] AS median_elapsed_seconds,
  COUNTIF(elapsed_seconds <= 8) AS within_8s,
  SAFE_DIVIDE(COUNTIF(elapsed_seconds <= 8), COUNT(*)) AS within_8s_rate
FROM (
  SELECT
    (
      SELECT COALESCE(value.int_value, CAST(value.double_value AS INT64), SAFE_CAST(value.string_value AS INT64))
      FROM UNNEST(event_params)
      WHERE key = 'elapsed_seconds'
      LIMIT 1
    ) AS elapsed_seconds
  FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
  WHERE (
      _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
      OR REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\d{8})$') BETWEEN from_suffix AND to_suffix
    )
    AND event_name = 'onboarding_guide_complete'
    AND user_pseudo_id IS NOT NULL
);
