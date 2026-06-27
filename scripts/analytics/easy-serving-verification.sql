-- easy 난이도 실서빙 검증 — attempt_start 난이도 분포·일자별 출현 추적
--
-- 목적: 입문(easy) 티어 퍼즐이 실제로 신규 사용자에게 배정·시작되어
--       attempt_start 텔레메트리에 difficulty=easy 가 적재되는지 검증한다.
--       #93(easy attempt 0건)의 DoD("BQ 데이터에 difficulty=easy attempt_start 출현")를
--       데이터로 직접 확인하고, #122(온보딩 퍼즐 quick-start 라우팅 수정) 배포 반영
--       시점부터 easy 시작이 출현하는지 일자별로 추적하기 위한 측정 전용 쿼리다.
--       (행동 변경 없음.)
--
-- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`
-- 이벤트: attempt_start (src/App.tsx, telemetry.impression). 파라미터:
--   difficulty   : "easy" | "normal" | "hard" (getPuzzleTelemetryParams)
--   puzzle_id    : 입문 온보딩 퍼즐은 항상 "onboarding-easy-01" (src/data/onboardingPuzzle.ts)
--   puzzle_alias : 입문 온보딩 퍼즐은 "입문"
--
-- 구간 변수(from_suffix / to_suffix)는 GA4 export 테이블 접미사(YYYYMMDD)다.
-- 기본값은 최근 28일 롤링이며, 특정 구간으로 고정하려면 아래 두 DECLARE 줄만 바꾼다.
--
-- 주의: 표본이 작으면 비율·건수 모두 노이즈가 크다. 비율과 함께 user 수를 같이 본다.

DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 28 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'));

-- attempt_start 이벤트를 한 번만 스캔해 난이도·퍼즐 식별자를 이벤트 단위로 모은다.
CREATE TEMP TABLE attempt_start_events AS
SELECT
  event_date,
  user_pseudo_id,
  COALESCE(
    (SELECT COALESCE(value.string_value, CAST(value.int_value AS STRING)) FROM UNNEST(event_params) WHERE key = 'difficulty' LIMIT 1),
    '(unknown)'
  ) AS difficulty,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'puzzle_id' LIMIT 1) AS puzzle_id,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'puzzle_alias' LIMIT 1) AS puzzle_alias
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE (
    _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
    OR REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\d{8})$') BETWEEN from_suffix AND to_suffix
  )
  AND event_name = 'attempt_start'
  AND user_pseudo_id IS NOT NULL;

-- 결과 1) 일자별 난이도 분포: easy 시작이 어느 날짜부터 출현하는지 시계열로 본다.
SELECT
  'attempt_start_by_difficulty_daily' AS section,
  event_date,
  difficulty,
  COUNT(*) AS start_events,
  COUNT(DISTINCT user_pseudo_id) AS start_users
FROM attempt_start_events
GROUP BY event_date, difficulty
ORDER BY event_date, difficulty;

-- 결과 2) 난이도별 누적 합계 + easy 비중: 구간 전체에서 easy 출현 여부·점유율을 한 줄로 확인.
SELECT
  'attempt_start_by_difficulty_total' AS section,
  difficulty,
  COUNT(*) AS start_events,
  COUNT(DISTINCT user_pseudo_id) AS start_users,
  MIN(event_date) AS first_seen_date,
  MAX(event_date) AS last_seen_date,
  SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER ()) AS event_share
FROM attempt_start_events
GROUP BY difficulty
ORDER BY start_events DESC;

-- 결과 3) easy 서빙 요약: easy 출현 여부와 입문 온보딩 퍼즐(onboarding-easy-01) 기여를 분리해 본다.
--   easy_first_seen_date 가 NULL 이 아니면 DoD 충족(easy attempt_start 출현).
--   onboarding_* 는 번들 입문 퍼즐이 easy 시작의 실제 원천인지 교차검증한다.
SELECT
  'easy_serving_summary' AS section,
  COUNTIF(difficulty = 'easy') AS easy_start_events,
  COUNT(DISTINCT IF(difficulty = 'easy', user_pseudo_id, NULL)) AS easy_start_users,
  MIN(IF(difficulty = 'easy', event_date, NULL)) AS easy_first_seen_date,
  MAX(IF(difficulty = 'easy', event_date, NULL)) AS easy_last_seen_date,
  COUNTIF(puzzle_id = 'onboarding-easy-01') AS onboarding_start_events,
  COUNT(DISTINCT IF(puzzle_id = 'onboarding-easy-01', user_pseudo_id, NULL)) AS onboarding_start_users
FROM attempt_start_events;
