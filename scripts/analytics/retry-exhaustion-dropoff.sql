-- 도전 기회(재시도) 소진 구간별 완료·이탈률 분석 (remaining_attempts / attempt_number)
--
-- 목적: 일일 도전 기회(attempts, 상한 DAILY_ATTEMPT_LIMIT=3) 소진/재시도가 활성화를
--       막는지 본다. 시작(attempt_start)을 분모로, 같은 시도의 완료(mission_complete)·
--       이탈(puzzle_abandon)을 분자로 두어 남은 기회(remaining_attempts)·시도 회차
--       (attempt_number)·시도 종류(first/retry)별 완료율·이탈률을 분해한다. 측정
--       전용(행동 변경 없음, #107).
--
-- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`
-- emit (src/App.tsx): 세 이벤트 모두 puzzle_id·attempt_number·remaining_attempts를
--   공통으로 싣는다.
--   - attempt_start    : 첫 도전·재도전 시작. 분모(시도 수). attempt_kind("first"/"retry"),
--                        attempt_number, remaining_attempts, puzzle_id, difficulty …
--   - mission_complete : 완료. attempt_number, remaining_attempts, puzzle_id …
--   - puzzle_abandon   : 시작 후 미완료 이탈(#87). attempt_number, remaining_attempts, puzzle_id …
--
-- 핵심 정의:
--   - remaining_attempts = 해당 시도 시작 직후 남은 기회. 0 = "기회 소진(마지막 시도)" 구간.
--     상한 3에서 attempts_used 1/2/3 → remaining 2/1/0.
--   - attempt_kind: attempt_start에만 존재. 완료/이탈 이벤트에는 없어 attempt_number로
--     파생한다(attempt_number=1 → first, ≥2 → retry).
--
-- 비율 산출 방식(시도 단위 join): 세그먼트별 단순 건수 비율은 분자(완료/이탈)와 분모(시작)의
--   키가 어긋날 수 있고(예: attempt_number=3 완료가 remaining=2 그룹에 섞임), attempt_start
--   없는 puzzle_abandon이 분자에 들어가 abandon_rate를 부풀릴 수 있다. 이를 피하려고 먼저
--   (user_pseudo_id, puzzle_id, attempt_number)를 시도 키로 삼아 attempt_start 1행 = 1시도로
--   정합 표(attempt_outcome)를 만들고, 같은 키의 완료/이탈 존재 여부를 LEFT JOIN으로 표시한다.
--   그 뒤 세그먼트별로 집계하므로 분자는 항상 시작된 시도에 묶이고, 미연결 abandon은 분율에서
--   제외되어 별도 진단 SELECT로만 보고된다.
--   completion_rate = completed 시도 / 전체 시도, abandon_rate = abandoned 시도 / 전체 시도.
--   (한 시도가 완료도 이탈도 아닐 수 있어 두 비율의 합 < 1 인 잔여분 = 미완료·미이탈.)
--
-- 시도 키 주의: attempt_number는 (puzzle_id, 일자) 미션 기준으로 증가하므로, 같은 puzzle_id를
--   다른 날 다시 풀어 attempt_number가 재사용되는 드문 경우 동일 키로 합쳐질 수 있다(일일 퍼즐은
--   보통 1회 플레이라 영향은 작다). ga_session_id 분할은 한 시도가 세션을 걸칠 때 과분할되어
--   오히려 부정확하므로 쓰지 않는다.
--
-- 구간 변수(from_suffix / to_suffix)는 GA4 export 테이블 접미사(YYYYMMDD)다. 기본값은 최근
--   28일 롤링이며, 특정 구간으로 고정하려면 아래 두 DECLARE 줄의 DEFAULT만 바꾼다.
--
-- 주의: 표본이 작으면 비율은 노이즈가 크다. 비율과 함께 분자/분모(건수·user 수)를 같이 본다.

DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 28 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'));

-- 세 이벤트를 한 번만 스캔해 임시 테이블로 둔다.
CREATE TEMP TABLE attempt_event AS
SELECT
  user_pseudo_id,
  event_name,
  (
    SELECT value.string_value
    FROM UNNEST(event_params)
    WHERE key = 'puzzle_id'
    LIMIT 1
  ) AS puzzle_id,
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
    SELECT COALESCE(value.string_value, CAST(value.int_value AS STRING))
    FROM UNNEST(event_params)
    WHERE key = 'difficulty'
    LIMIT 1
  ) AS difficulty
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
  AND event_name IN ('attempt_start', 'mission_complete', 'puzzle_abandon');

-- 시도 단위 정합 표: attempt_start 1행 = 1시도(분모). 같은 (user, puzzle_id, attempt_number)
-- 키의 완료/이탈 존재 여부를 LEFT JOIN으로 표시한다. attempt_number가 없는(키 불성립) 행은
-- 제외한다(#124).
CREATE TEMP TABLE attempt_outcome AS
WITH starts AS (
  SELECT
    user_pseudo_id,
    puzzle_id,
    attempt_number,
    ANY_VALUE(remaining_attempts) AS remaining_attempts,
    ANY_VALUE(difficulty) AS difficulty
  FROM attempt_event
  WHERE event_name = 'attempt_start' AND attempt_number IS NOT NULL
  GROUP BY user_pseudo_id, puzzle_id, attempt_number
),
completes AS (
  SELECT DISTINCT user_pseudo_id, puzzle_id, attempt_number, TRUE AS is_complete
  FROM attempt_event
  WHERE event_name = 'mission_complete' AND attempt_number IS NOT NULL
),
abandons AS (
  SELECT DISTINCT user_pseudo_id, puzzle_id, attempt_number, TRUE AS is_abandon
  FROM attempt_event
  WHERE event_name = 'puzzle_abandon' AND attempt_number IS NOT NULL
)
SELECT
  s.user_pseudo_id,
  s.puzzle_id,
  s.attempt_number,
  s.remaining_attempts,
  s.difficulty,
  COALESCE(c.is_complete, FALSE) AS completed,
  COALESCE(a.is_abandon, FALSE) AS abandoned
FROM starts s
LEFT JOIN completes c
  ON s.user_pseudo_id = c.user_pseudo_id
  AND s.puzzle_id = c.puzzle_id
  AND s.attempt_number = c.attempt_number
LEFT JOIN abandons a
  ON s.user_pseudo_id = a.user_pseudo_id
  AND s.puzzle_id = a.puzzle_id
  AND s.attempt_number = a.attempt_number;

-- 결과 1) 남은 기회(remaining_attempts)별 완료·이탈률. 0(소진/마지막 시도) 구간에서
--         이탈률이 오르고 완료율이 떨어지면 재시도 제한이 활성화를 막는다는 신호.
SELECT
  'by_remaining_attempts' AS section,
  remaining_attempts,
  COUNT(*) AS starts,
  COUNT(DISTINCT user_pseudo_id) AS starter_users,
  COUNTIF(completed) AS completes,
  COUNTIF(abandoned) AS abandons,
  SAFE_DIVIDE(COUNTIF(completed), COUNT(*)) AS completion_rate,
  SAFE_DIVIDE(COUNTIF(abandoned), COUNT(*)) AS abandon_rate
FROM attempt_outcome
GROUP BY remaining_attempts
ORDER BY remaining_attempts DESC;

-- 결과 2) 시도 회차(attempt_number)·종류(first/retry)별 완료·이탈률. 재도전(2회차+)으로
--         갈수록 완료율이 어떻게 변하는지, 재시도가 결실로 이어지는지 본다.
SELECT
  'by_attempt_number' AS section,
  attempt_number,
  IF(attempt_number = 1, 'first', 'retry') AS attempt_kind,
  COUNT(*) AS starts,
  COUNT(DISTINCT user_pseudo_id) AS starter_users,
  COUNTIF(completed) AS completes,
  COUNTIF(abandoned) AS abandons,
  SAFE_DIVIDE(COUNTIF(completed), COUNT(*)) AS completion_rate,
  SAFE_DIVIDE(COUNTIF(abandoned), COUNT(*)) AS abandon_rate
FROM attempt_outcome
GROUP BY attempt_number
ORDER BY attempt_number;

-- 결과 3) 기회 소진(remaining_attempts=0) 구간을 난이도별로 분해. 마지막 시도에서
--         난이도별 완료/이탈이 어떻게 갈리는지(소진 UX #52와 이탈 상관 확인용).
SELECT
  'exhaustion_by_difficulty' AS section,
  COALESCE(difficulty, '(unknown)') AS difficulty,
  COUNT(*) AS starts,
  COUNT(DISTINCT user_pseudo_id) AS starter_users,
  COUNTIF(completed) AS completes,
  COUNTIF(abandoned) AS abandons,
  SAFE_DIVIDE(COUNTIF(completed), COUNT(*)) AS completion_rate,
  SAFE_DIVIDE(COUNTIF(abandoned), COUNT(*)) AS abandon_rate
FROM attempt_outcome
WHERE remaining_attempts = 0
GROUP BY difficulty
ORDER BY starts DESC;

-- 진단) attempt_start와 키가 매칭되지 않는 puzzle_abandon(분율에서 제외된 미연결 이탈).
--       이 값이 크면 시도 키 정합이 약하다는 신호이므로 위 비율 해석에 주의한다.
SELECT
  'unmatched_abandons' AS section,
  COUNT(*) AS abandons_without_start,
  COUNT(DISTINCT ab.user_pseudo_id) AS users
FROM (
  SELECT DISTINCT user_pseudo_id, puzzle_id, attempt_number
  FROM attempt_event
  WHERE event_name = 'puzzle_abandon' AND attempt_number IS NOT NULL
) ab
LEFT JOIN (
  SELECT DISTINCT user_pseudo_id, puzzle_id, attempt_number
  FROM attempt_event
  WHERE event_name = 'attempt_start' AND attempt_number IS NOT NULL
) st
  ON ab.user_pseudo_id = st.user_pseudo_id
  AND ab.puzzle_id = st.puzzle_id
  AND ab.attempt_number = st.attempt_number
WHERE st.user_pseudo_id IS NULL;
