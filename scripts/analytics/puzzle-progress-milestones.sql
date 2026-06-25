-- 진행 마일스톤 도달률·완료 기여 분석 (puzzle_progress)
--
-- 목적: 부분 완료 보상/진행 가시화(#86)의 효과를 재측정한다. 진행 마일스톤
--       (25/50/75%) 도달률과 마일스톤 → 완료(mission_complete, 100%) 전환을
--       난이도별로 산출해 "어디까지 채우고 멈추는지"를 본다. 측정 전용.
--
-- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`
-- 마일스톤 정의: packages/crossword-core/src/uiPolicy.ts
--   PUZZLE_PROGRESS_MILESTONES = [25, 50, 75]  (100%는 mission_complete가 별도 집계)
-- emit: src/App.tsx 의 telemetry.impression("puzzle_progress", { milestone, ... })
--
-- 시작 기준 이벤트: attempt_start(첫 도전·재도전 시작). 마일스톤/완료는 시작자
-- (attempt_start 보유 user) 분모로 도달률을 계산한다. difficulty 파라미터로 분할.
--
-- 구간 변수(from_suffix / to_suffix)는 GA4 export 테이블 접미사(YYYYMMDD)다.
-- 기본값은 최근 28일 롤링이며, 특정 구간으로 고정하려면 아래 두 DECLARE 줄만 바꾼다.
--
-- 주의: 표본이 작으면 도달률·전환은 노이즈가 크다. 비율과 함께 분자/분모(user 수)를
-- 같이 본다. mission_complete가 별도 100% 마일스톤 역할을 하므로 puzzle_progress에
-- milestone=100 은 emit되지 않는다(중복 방지).

DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 28 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'));

WITH base AS (
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
      WHERE key = 'milestone'
      LIMIT 1
    ) AS milestone
  FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
  WHERE (
      _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
      OR REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\d{8})$') BETWEEN from_suffix AND to_suffix
    )
    AND event_name IN ('attempt_start', 'puzzle_progress', 'mission_complete')
    AND user_pseudo_id IS NOT NULL
),
-- 사용자 × 난이도 단위로 각 단계 도달 여부를 모은다(하루 여러 번이어도 1회로 dedupe).
per_user AS (
  SELECT
    user_pseudo_id,
    COALESCE(difficulty, '(unknown)') AS difficulty,
    MAX(IF(event_name = 'attempt_start', 1, 0)) AS started,
    MAX(IF(event_name = 'puzzle_progress' AND milestone = 25, 1, 0)) AS reached_25,
    MAX(IF(event_name = 'puzzle_progress' AND milestone = 50, 1, 0)) AS reached_50,
    MAX(IF(event_name = 'puzzle_progress' AND milestone = 75, 1, 0)) AS reached_75,
    MAX(IF(event_name = 'mission_complete', 1, 0)) AS completed
  FROM base
  GROUP BY user_pseudo_id, difficulty
)
SELECT
  difficulty,
  COUNTIF(started = 1) AS starters,
  COUNTIF(reached_25 = 1) AS reached_25_users,
  COUNTIF(reached_50 = 1) AS reached_50_users,
  COUNTIF(reached_75 = 1) AS reached_75_users,
  COUNTIF(completed = 1) AS completed_users,
  -- 시작자 분모 도달률(누적 funnel).
  SAFE_DIVIDE(COUNTIF(reached_25 = 1), COUNTIF(started = 1)) AS reach_25_rate,
  SAFE_DIVIDE(COUNTIF(reached_50 = 1), COUNTIF(started = 1)) AS reach_50_rate,
  SAFE_DIVIDE(COUNTIF(reached_75 = 1), COUNTIF(started = 1)) AS reach_75_rate,
  SAFE_DIVIDE(COUNTIF(completed = 1), COUNTIF(started = 1)) AS complete_rate,
  -- 마일스톤 도달 → 완료 전환(완료 기여): 75% 도달자가 끝까지 가는 비율 등.
  SAFE_DIVIDE(COUNTIF(reached_75 = 1 AND completed = 1), COUNTIF(reached_75 = 1)) AS complete_given_75,
  SAFE_DIVIDE(COUNTIF(reached_50 = 1 AND completed = 1), COUNTIF(reached_50 = 1)) AS complete_given_50,
  SAFE_DIVIDE(COUNTIF(reached_25 = 1 AND completed = 1), COUNTIF(reached_25 = 1)) AS complete_given_25
FROM per_user
GROUP BY difficulty
ORDER BY starters DESC;
