-- 비완료 이탈 지점 분포 분석 (puzzle_abandon)
--
-- 목적: 시작 후 완료하지 않고 떠난 이탈(puzzle_abandon, #87)의 이탈 지점을
--       last_screen(이탈 직전 화면)·progress_percent(진행률 구간)·had_first_input
--       (#103, 첫 입력 발생 여부)으로 분해해 "어디서·얼마나 풀다가 멈추는지"와
--       "무입력(침묵) 이탈 비중"을 본다. 측정 전용(행동 변경 없음).
--
-- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`
-- emit: src/App.tsx 의 telemetry.impression("puzzle_abandon", {
--         last_screen, progress_percent, words_filled, total_words,
--         elapsed_seconds, had_first_input, attempt_number, hint_count,
--         remaining_attempts, ...puzzleTelemetryParams })
--   트리거: (1) 보드(today)를 떠나 다른 화면으로 인앱 이동할 때,
--           (2) pagehide / visibilitychange=hidden(앱 종료·백그라운드)일 때.
--   가드: 시작했고(hasStarted) 아직 미완료일 때만, 시도당(puzzleId:attemptsUsed) 1회.
--
-- 시작 기준 이벤트: attempt_start(첫 도전·재도전 시작). 이탈률 분모로 쓴다.
--
-- 구간 변수(from_suffix / to_suffix)는 GA4 export 테이블 접미사(YYYYMMDD)다.
-- 기본값은 최근 28일 롤링이며, 특정 구간으로 고정하려면 아래 두 DECLARE 줄만 바꾼다.
--
-- had_first_input 해석: 클라이언트는 boolean으로 emit하지만 GA4 export에서는
-- int_value(1/0) 또는 string_value("true"/"false")로 저장될 수 있어 아래에서 정규화한다.
-- #103 머지 이전 적재분에는 had_first_input이 없어 NULL이 되며, 그 경우
-- words_filled = 0 을 무입력 이탈의 근사 신호로 함께 본다.
--
-- 주의: 표본이 작으면 비율은 노이즈가 크다. 비율과 함께 분자/분모(건수·user 수)를 같이 본다.

DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 28 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'));

-- 시작자·이탈 이벤트를 한 번만 스캔해 임시 테이블로 둔다(결과 SELECT 3개가 공유).
CREATE TEMP TABLE abandon_base AS
SELECT
  user_pseudo_id,
  event_name,
  (
    SELECT COALESCE(value.string_value, CAST(value.int_value AS STRING))
    FROM UNNEST(event_params)
    WHERE key = 'difficulty'
    LIMIT 1
  ) AS difficulty,
  (
    SELECT value.string_value
    FROM UNNEST(event_params)
    WHERE key = 'last_screen'
    LIMIT 1
  ) AS last_screen,
  (
    SELECT COALESCE(value.int_value, CAST(value.double_value AS INT64), SAFE_CAST(value.string_value AS INT64))
    FROM UNNEST(event_params)
    WHERE key = 'progress_percent'
    LIMIT 1
  ) AS progress_percent,
  (
    SELECT COALESCE(value.int_value, CAST(value.double_value AS INT64), SAFE_CAST(value.string_value AS INT64))
    FROM UNNEST(event_params)
    WHERE key = 'words_filled'
    LIMIT 1
  ) AS words_filled,
  (
    SELECT COALESCE(value.int_value, CAST(value.double_value AS INT64), SAFE_CAST(value.string_value AS INT64))
    FROM UNNEST(event_params)
    WHERE key = 'elapsed_seconds'
    LIMIT 1
  ) AS elapsed_seconds,
  (
    SELECT
      CASE
        WHEN LOWER(value.string_value) IN ('true', '1') THEN TRUE
        WHEN LOWER(value.string_value) IN ('false', '0') THEN FALSE
        WHEN value.int_value IS NOT NULL THEN value.int_value != 0
        WHEN value.double_value IS NOT NULL THEN value.double_value != 0
        ELSE NULL
      END
    FROM UNNEST(event_params)
    WHERE key = 'had_first_input'
    LIMIT 1
  ) AS had_first_input
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE (
    _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
    OR REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\d{8})$') BETWEEN from_suffix AND to_suffix
  )
  AND event_name IN ('attempt_start', 'puzzle_abandon')
  AND user_pseudo_id IS NOT NULL;

-- 결과 1) last_screen(이탈 직전 화면)별 이탈 분포. starters = 시작자 분모.
SELECT
  'by_last_screen' AS section,
  COALESCE(last_screen, '(unknown)') AS last_screen,
  COUNT(*) AS abandons,
  COUNT(DISTINCT user_pseudo_id) AS abandon_users,
  ROUND(AVG(elapsed_seconds), 1) AS avg_elapsed_seconds,
  APPROX_QUANTILES(elapsed_seconds, 2)[OFFSET(1)] AS median_elapsed_seconds,
  SAFE_DIVIDE(
    COUNT(*),
    (SELECT COUNT(DISTINCT user_pseudo_id) FROM abandon_base WHERE event_name = 'attempt_start')
  ) AS abandons_per_starter
FROM abandon_base
WHERE event_name = 'puzzle_abandon'
GROUP BY last_screen
ORDER BY abandons DESC;

-- 결과 2) progress_percent 구간별 이탈 분포. 어느 진행 구간에서 멈추는지.
SELECT
  'by_progress_bucket' AS section,
  CASE
    WHEN progress_percent IS NULL THEN '(unknown)'
    WHEN progress_percent = 0 THEN '0% (무진행)'
    WHEN progress_percent < 25 THEN '1-24%'
    WHEN progress_percent < 50 THEN '25-49%'
    WHEN progress_percent < 75 THEN '50-74%'
    ELSE '75-99%'
  END AS progress_bucket,
  COUNT(*) AS abandons,
  COUNT(DISTINCT user_pseudo_id) AS abandon_users,
  ROUND(AVG(elapsed_seconds), 1) AS avg_elapsed_seconds
FROM abandon_base
WHERE event_name = 'puzzle_abandon'
GROUP BY progress_bucket
ORDER BY progress_bucket;

-- 결과 3) 무입력(침묵) 이탈 vs 진행 후 이탈. had_first_input=false 의 elapsed_seconds가
--         첫 입력 없이 머문 시간(TTFI 상한). 레거시(NULL) 행은 words_filled=0 로 근사.
SELECT
  'by_input_state' AS section,
  CASE
    WHEN had_first_input = TRUE THEN 'had_input (진행 후 이탈)'
    WHEN had_first_input = FALSE THEN 'silent (무입력 이탈)'
    WHEN words_filled = 0 THEN 'silent? (레거시, words_filled=0)'
    ELSE 'unknown (레거시)'
  END AS input_state,
  COUNT(*) AS abandons,
  COUNT(DISTINCT user_pseudo_id) AS abandon_users,
  ROUND(AVG(elapsed_seconds), 1) AS avg_elapsed_seconds,
  APPROX_QUANTILES(elapsed_seconds, 2)[OFFSET(1)] AS median_elapsed_seconds,
  COUNTIF(elapsed_seconds <= 8) AS within_8s,
  SAFE_DIVIDE(COUNTIF(elapsed_seconds <= 8), COUNT(*)) AS within_8s_rate
FROM abandon_base
WHERE event_name = 'puzzle_abandon'
GROUP BY input_state
ORDER BY abandons DESC;
