-- 도전 기회(재시도) 소진 구간별 완료·이탈률 분석 (remaining_attempts / attempt_number)
--
-- 목적: 일일 도전 기회(attempts, 상한 DAILY_ATTEMPT_LIMIT=3) 소진/재시도가 활성화를
--       막는지 본다. 시작(attempt_start)을 분모로, 같은 시도의 완료(mission_complete)·
--       이탈(puzzle_abandon)을 분자로 두어 남은 기회(remaining_attempts)·시도 회차
--       (attempt_number)·시도 종류(first/retry)별 완료율·이탈률을 분해한다. 측정
--       전용(행동 변경 없음, #107).
--
-- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`
-- emit (src/App.tsx): 세 이벤트 모두 attempt_number·remaining_attempts를 공통으로 싣는다.
--   - attempt_start    : 첫 도전·재도전 시작. 분모(시도 수). attempt_kind("first"/"retry"),
--                        attempt_number, remaining_attempts, ...puzzleTelemetryParams.
--   - mission_complete : 완료. attempt_number, remaining_attempts, elapsed_seconds, ...
--   - puzzle_abandon   : 시작 후 미완료 이탈(#87). attempt_number, remaining_attempts, ...
--
-- 핵심 정의:
--   - remaining_attempts = 해당 시도 시작 직후 남은 기회. 0 = "기회 소진(마지막 시도)" 구간.
--     상한 3에서 attempts_used 1/2/3 → remaining 2/1/0.
--   - attempt_kind: attempt_start에만 존재. 완료/이탈 이벤트에는 없어 attempt_number로
--     파생한다(attempt_number=1 → first, ≥2 → retry).
--
-- 비율 산출 방식: 시도별 join 대신 세그먼트별 이벤트 건수 비율을 쓴다(기존 dropoff 쿼리와
--   동일한 스타일). completion_rate = completes/starts, abandon_rate = abandons/starts.
--   같은 세그먼트(remaining_attempts/attempt_number) 안에서 세 이벤트가 동일 키를 싣기 때문에
--   건수 비율이 그 구간의 완료/이탈 경향을 근사한다. (한 시도가 완료도 이탈도 아닐 수 있어
--   completion_rate + abandon_rate < 1 인 잔여분은 "미완료·미이탈"(세션 유지/판정 전)로 본다.)
--
-- 구간 변수(from_suffix / to_suffix)는 GA4 export 테이블 접미사(YYYYMMDD)다. 기본값은 최근
--   28일 롤링이며, 특정 구간으로 고정하려면 아래 두 DECLARE 줄의 DEFAULT만 바꾼다.
--
-- 주의: 표본이 작으면 비율은 노이즈가 크다. 비율과 함께 분자/분모(건수·user 수)를 같이 본다.

DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 28 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'));

-- 세 이벤트를 한 번만 스캔해 임시 테이블로 둔다(결과 SELECT 3개가 공유).
CREATE TEMP TABLE attempt_base AS
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
    SELECT COALESCE(value.int_value, CAST(value.double_value AS INT64), SAFE_CAST(value.string_value AS INT64))
    FROM UNNEST(event_params)
    WHERE key = 'attempt_number'
    LIMIT 1
  ) AS attempt_number,
  (
    SELECT COALESCE(value.int_value, CAST(value.double_value AS INT64), SAFE_CAST(value.string_value AS INT64))
    FROM UNNEST(event_params)
    WHERE key = 'remaining_attempts'
    LIMIT 1
  ) AS remaining_attempts,
  (
    SELECT value.string_value
    FROM UNNEST(event_params)
    WHERE key = 'attempt_kind'
    LIMIT 1
  ) AS attempt_kind,
  (
    SELECT COALESCE(value.int_value, CAST(value.double_value AS INT64), SAFE_CAST(value.string_value AS INT64))
    FROM UNNEST(event_params)
    WHERE key = 'elapsed_seconds'
    LIMIT 1
  ) AS elapsed_seconds
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
  AND event_name IN ('attempt_start', 'mission_complete', 'puzzle_abandon');

-- 결과 1) 남은 기회(remaining_attempts)별 완료·이탈률. 0(소진/마지막 시도) 구간에서
--         이탈률이 오르고 완료율이 떨어지면 재시도 제한이 활성화를 막는다는 신호.
SELECT
  'by_remaining_attempts' AS section,
  remaining_attempts,
  COUNTIF(event_name = 'attempt_start') AS starts,
  COUNT(DISTINCT IF(event_name = 'attempt_start', user_pseudo_id, NULL)) AS starter_users,
  COUNTIF(event_name = 'mission_complete') AS completes,
  COUNTIF(event_name = 'puzzle_abandon') AS abandons,
  SAFE_DIVIDE(COUNTIF(event_name = 'mission_complete'), COUNTIF(event_name = 'attempt_start')) AS completion_rate,
  SAFE_DIVIDE(COUNTIF(event_name = 'puzzle_abandon'), COUNTIF(event_name = 'attempt_start')) AS abandon_rate
FROM attempt_base
GROUP BY remaining_attempts
ORDER BY remaining_attempts DESC;

-- 결과 2) 시도 회차(attempt_number)·종류(first/retry)별 완료·이탈률. 재도전(2회차+)으로
--         갈수록 완료율이 어떻게 변하는지, 재시도가 결실로 이어지는지 본다.
SELECT
  'by_attempt_number' AS section,
  attempt_number,
  IF(attempt_number = 1, 'first', 'retry') AS attempt_kind,
  COUNTIF(event_name = 'attempt_start') AS starts,
  COUNT(DISTINCT IF(event_name = 'attempt_start', user_pseudo_id, NULL)) AS starter_users,
  COUNTIF(event_name = 'mission_complete') AS completes,
  COUNTIF(event_name = 'puzzle_abandon') AS abandons,
  SAFE_DIVIDE(COUNTIF(event_name = 'mission_complete'), COUNTIF(event_name = 'attempt_start')) AS completion_rate,
  SAFE_DIVIDE(COUNTIF(event_name = 'puzzle_abandon'), COUNTIF(event_name = 'attempt_start')) AS abandon_rate
FROM attempt_base
GROUP BY attempt_number
ORDER BY attempt_number;

-- 결과 3) 기회 소진(remaining_attempts=0) 구간을 난이도별로 분해. 마지막 시도에서
--         난이도별 완료/이탈이 어떻게 갈리는지(소진 UX #52와 이탈 상관 확인용).
SELECT
  'exhaustion_by_difficulty' AS section,
  COALESCE(difficulty, '(unknown)') AS difficulty,
  COUNTIF(event_name = 'attempt_start') AS starts,
  COUNT(DISTINCT IF(event_name = 'attempt_start', user_pseudo_id, NULL)) AS starter_users,
  COUNTIF(event_name = 'mission_complete') AS completes,
  COUNTIF(event_name = 'puzzle_abandon') AS abandons,
  SAFE_DIVIDE(COUNTIF(event_name = 'mission_complete'), COUNTIF(event_name = 'attempt_start')) AS completion_rate,
  SAFE_DIVIDE(COUNTIF(event_name = 'puzzle_abandon'), COUNTIF(event_name = 'attempt_start')) AS abandon_rate
FROM attempt_base
WHERE remaining_attempts = 0
GROUP BY difficulty
ORDER BY starts DESC;
