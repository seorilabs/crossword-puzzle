-- 완료 후 10분 안 다른 판 시작률, 세션당 완료 판 수. 일일 export만 사용해 intraday 중복을 피한다.
DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('UTC'), INTERVAL 28 DAY));
CREATE TEMP TABLE journey AS
SELECT user_pseudo_id, event_name, event_timestamp,
 (SELECT value.int_value FROM UNNEST(event_params) WHERE key='ga_session_id' LIMIT 1) session_id,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='puzzle_id' LIMIT 1) puzzle_id,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='market' LIMIT 1) market,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='release_version' LIMIT 1) version,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='content_language' LIMIT 1) language
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE _TABLE_SUFFIX BETWEEN from_suffix AND FORMAT_DATE('%Y%m%d',CURRENT_DATE('UTC'))
 AND event_name IN ('mission_complete','attempt_start','screen_view') AND user_pseudo_id IS NOT NULL;
CREATE TEMP TABLE completions AS
SELECT user_pseudo_id, session_id, puzzle_id, market, version, language, MIN(event_timestamp) completed_at
FROM journey WHERE event_name='mission_complete' AND session_id IS NOT NULL
GROUP BY user_pseudo_id,session_id,puzzle_id,market,version,language;
WITH conversion AS (
 SELECT c.*, EXISTS(SELECT 1 FROM journey j WHERE j.event_name='attempt_start'
  AND j.user_pseudo_id=c.user_pseudo_id AND j.session_id=c.session_id AND j.puzzle_id!=c.puzzle_id
  AND j.event_timestamp>c.completed_at AND j.event_timestamp<=c.completed_at+600000000) next_started
 FROM completions c
)
SELECT market,version,language,COUNT(*) completed_puzzles,COUNTIF(next_started) next_starts,
 SAFE_DIVIDE(COUNTIF(next_started),COUNT(*)) next_start_rate
FROM conversion GROUP BY market,version,language;
WITH sessions AS (
 SELECT DISTINCT market,version,language,user_pseudo_id,session_id FROM journey WHERE session_id IS NOT NULL
), counts AS (
 SELECT s.*, COUNT(c.puzzle_id) completed_puzzles FROM sessions s LEFT JOIN completions c
 ON s.user_pseudo_id=c.user_pseudo_id AND s.session_id=c.session_id AND s.market IS NOT DISTINCT FROM c.market
 AND s.version IS NOT DISTINCT FROM c.version AND s.language IS NOT DISTINCT FROM c.language
 GROUP BY s.market,s.version,s.language,s.user_pseudo_id,s.session_id
)
SELECT market,version,language,COUNT(*) sessions,COUNTIF(completed_puzzles>0) completing_sessions,AVG(completed_puzzles) puzzles_per_session
FROM counts GROUP BY market,version,language;
