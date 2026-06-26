-- 활성화 KPI 펀넬·난이도별 완료율 (정례 모니터링)
--
-- 목적: 첫 세션 활성화 KPI를 정기적으로 산출한다. 유입(first_visit) → 홈 →
--       플레이 → 첫 입력 → 완료 펀넬과 난이도별 완료율을 한 번에 본다.
--       리텐션(D1/D7)은 scripts/analytics/retention-cohort.sql로 별도 산출한다.
--       측정 전용(행동 변경 없음).
--
-- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`
-- 단계 정의:
--   visit  : first_visit (신규 유입 distinct user)
--   home   : screen_view, firebase_screen = 'home'
--   play   : screen_view, firebase_screen = 'today' (풀이 보드 진입)
--   start  : attempt_start (실제 도전 시작)
--   input  : first_answer_input (첫 수동 입력)
--   complete: mission_complete (완료)
--   (route 이름은 src/App.tsx AppRoute: home/today/result/history/...)
--
-- 구간 변수(from_suffix / to_suffix)는 GA4 export 테이블 접미사(YYYYMMDD)다.
-- 기본값은 최근 28일 롤링이며, 특정 구간으로 고정하려면 아래 두 DECLARE 줄만 바꾼다.
--
-- 주의: 표본이 작으면 비율은 노이즈가 크다. 비율과 함께 분자/분모(user 수)를 같이 본다.

DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 28 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'));

-- 관련 이벤트를 한 번만 스캔해 user 단위로 각 단계 도달 여부와 난이도를 모은다.
CREATE TEMP TABLE kpi_per_user AS
SELECT
  user_pseudo_id,
  MAX(IF(event_name = 'first_visit', 1, 0)) AS visited,
  MAX(IF(event_name = 'screen_view'
      AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'firebase_screen' LIMIT 1) = 'home', 1, 0)) AS viewed_home,
  MAX(IF(event_name = 'screen_view'
      AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'firebase_screen' LIMIT 1) = 'today', 1, 0)) AS viewed_play,
  MAX(IF(event_name = 'attempt_start', 1, 0)) AS started,
  MAX(IF(event_name = 'first_answer_input', 1, 0)) AS first_input,
  MAX(IF(event_name = 'mission_complete', 1, 0)) AS completed,
  -- 난이도: attempt_start에 실린 difficulty(첫 시작 기준). 여러 난이도면 우선 normal/easy 구분용으로 ANY_VALUE.
  ANY_VALUE(IF(event_name = 'attempt_start',
    (SELECT COALESCE(value.string_value, CAST(value.int_value AS STRING)) FROM UNNEST(event_params) WHERE key = 'difficulty' LIMIT 1),
    NULL)) AS start_difficulty
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE (
    _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
    OR REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\d{8})$') BETWEEN from_suffix AND to_suffix
  )
  AND event_name IN (
    'first_visit', 'screen_view', 'attempt_start', 'first_answer_input', 'mission_complete'
  )
  AND user_pseudo_id IS NOT NULL
GROUP BY user_pseudo_id;

-- 결과 1) 활성화 펀넬: 단계별 도달 user 수와 유입(visit) 분모 누적 전환율.
SELECT
  'activation_funnel' AS section,
  COUNTIF(visited = 1) AS visitors,
  COUNTIF(viewed_home = 1) AS home_users,
  COUNTIF(viewed_play = 1) AS play_users,
  COUNTIF(started = 1) AS start_users,
  COUNTIF(first_input = 1) AS first_input_users,
  COUNTIF(completed = 1) AS completed_users,
  -- 유입 분모 누적 전환율.
  SAFE_DIVIDE(COUNTIF(viewed_play = 1), COUNTIF(visited = 1)) AS visit_to_play_rate,
  SAFE_DIVIDE(COUNTIF(started = 1), COUNTIF(visited = 1)) AS visit_to_start_rate,
  SAFE_DIVIDE(COUNTIF(first_input = 1), COUNTIF(visited = 1)) AS visit_to_input_rate,
  SAFE_DIVIDE(COUNTIF(completed = 1), COUNTIF(visited = 1)) AS visit_to_complete_rate,
  -- 단계 간 전환율(병목 식별).
  SAFE_DIVIDE(COUNTIF(viewed_play = 1), COUNTIF(viewed_home = 1)) AS home_to_play_rate,
  SAFE_DIVIDE(COUNTIF(first_input = 1), COUNTIF(started = 1)) AS start_to_input_rate,
  SAFE_DIVIDE(COUNTIF(completed = 1), COUNTIF(first_input = 1)) AS input_to_complete_rate
FROM kpi_per_user;

-- 결과 2) 난이도별 완료율: 시작자(attempt_start) 분모 대비 완료.
SELECT
  'completion_by_difficulty' AS section,
  COALESCE(start_difficulty, '(unknown)') AS difficulty,
  COUNTIF(started = 1) AS start_users,
  COUNTIF(started = 1 AND first_input = 1) AS first_input_users,
  COUNTIF(started = 1 AND completed = 1) AS completed_users,
  SAFE_DIVIDE(COUNTIF(started = 1 AND first_input = 1), COUNTIF(started = 1)) AS first_input_rate,
  SAFE_DIVIDE(COUNTIF(started = 1 AND completed = 1), COUNTIF(started = 1)) AS complete_rate
FROM kpi_per_user
WHERE started = 1
GROUP BY difficulty
ORDER BY start_users DESC;
