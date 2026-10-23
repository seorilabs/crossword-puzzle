-- 첫 세 단어 안내와 전체 완주를 구분한다. 새 타일 입력 이벤트만 분석한다.
-- 분모는 고유 user_pseudo_id + puzzle_id다. 화면 재진입 노출은 한 건으로 묶는다.
-- 옛 onboarding_guide_*는 한 번 입력하는 안내이므로 새 3단어 안내와 합치지 않는다.
-- mission_complete만 전체 완주로 센다. game_puzzle_complete를 더하지 않는다.
-- 노출군의 관찰값이며 안내의 인과 효과나 실제 체감 난이도를 뜻하지 않는다.

DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 28 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'));

CREATE TEMP TABLE guide_events AS
SELECT
  user_pseudo_id, event_name, event_timestamp,
  (SELECT COALESCE(value.string_value, CAST(value.int_value AS STRING))
   FROM UNNEST(event_params) WHERE key = 'puzzle_id' LIMIT 1) AS puzzle_id,
  (SELECT value.string_value FROM UNNEST(event_params)
   WHERE key = 'input_policy' LIMIT 1) AS input_policy,
  (SELECT COALESCE(value.int_value, SAFE_CAST(value.string_value AS INT64))
   FROM UNNEST(event_params) WHERE key = 'word_count' LIMIT 1) AS word_count
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE (
    _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
    OR REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\d{8})$') BETWEEN from_suffix AND to_suffix
  )
  AND event_name IN (
    'first_three_words_shown', 'first_three_words_complete', 'first_three_words_skip',
    'first_answer_input', 'mission_complete'
  )
  AND user_pseudo_id IS NOT NULL;

CREATE TEMP TABLE guide_per_puzzle AS
SELECT
  user_pseudo_id, puzzle_id,
  MIN(IF(event_name = 'first_three_words_shown' AND input_policy = 'syllable-v1', event_timestamp, NULL)) AS shown_at,
  MIN(IF(event_name = 'first_three_words_complete' AND input_policy = 'syllable-v1', event_timestamp, NULL)) AS guide_complete_at,
  MAX(IF(event_name = 'first_three_words_skip' AND input_policy = 'syllable-v1', 1, 0)) AS guide_skipped,
  MIN(IF(event_name = 'first_answer_input', event_timestamp, NULL)) AS first_input_at,
  MIN(IF(event_name = 'mission_complete', event_timestamp, NULL)) AS mission_complete_at
FROM guide_events
WHERE puzzle_id IS NOT NULL
GROUP BY user_pseudo_id, puzzle_id;

-- 결과 1: 안내 노출에서 첫 입력, 세 단어와 한 판 완주로 이어진 비율.
SELECT
  'guide_funnel' AS section,
  COUNT(*) AS shown_user_puzzles,
  COUNTIF(first_input_at >= shown_at) AS first_input_user_puzzles,
  COUNTIF(guide_complete_at >= shown_at) AS guide_complete_user_puzzles,
  COUNTIF(guide_skipped = 1) AS skipped_user_puzzles,
  COUNTIF(mission_complete_at >= shown_at) AS mission_complete_user_puzzles,
  SAFE_DIVIDE(COUNTIF(first_input_at >= shown_at), COUNT(*)) AS first_input_rate,
  SAFE_DIVIDE(COUNTIF(guide_complete_at >= shown_at), COUNT(*)) AS guide_complete_rate,
  SAFE_DIVIDE(COUNTIF(guide_skipped = 1), COUNT(*)) AS skip_rate,
  SAFE_DIVIDE(COUNTIF(mission_complete_at >= shown_at), COUNT(*)) AS mission_complete_rate
FROM guide_per_puzzle
WHERE shown_at IS NOT NULL;

-- 결과 2: 세 단어를 실제로 마친 표본의 관찰 시간. 재노출도 첫 노출부터 계산한다.
SELECT
  'guide_complete_elapsed' AS section,
  COUNT(*) AS completed_user_puzzles,
  ROUND(AVG((guide_complete_at - shown_at) / 1000000.0), 1) AS avg_seconds,
  APPROX_QUANTILES((guide_complete_at - shown_at) / 1000000.0, 2)[OFFSET(1)] AS median_seconds
FROM guide_per_puzzle
WHERE shown_at IS NOT NULL AND guide_complete_at >= shown_at;

-- 결과 3: 전송 계약 누락을 별도 표시한다. 이 결과는 사용자 수가 아닌 원시 이벤트 수다.
SELECT
  event_name, input_policy, word_count,
  COUNT(*) AS raw_events,
  COUNTIF(puzzle_id IS NULL OR puzzle_id = '') AS missing_puzzle_id_events
FROM guide_events
WHERE event_name IN ('first_three_words_shown', 'first_three_words_complete', 'first_three_words_skip')
GROUP BY event_name, input_policy, word_count
ORDER BY event_name, input_policy, word_count;
