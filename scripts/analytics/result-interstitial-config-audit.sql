-- 완료 구간 중복 표시 감사. 표시 이벤트는 수익 노출과 구분한다.
DECLARE since_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('UTC'), INTERVAL 7 DAY));
SELECT user_pseudo_id,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='puzzle_id' LIMIT 1) puzzle_id,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='market' LIMIT 1) market,
 (SELECT value.string_value FROM UNNEST(event_params) WHERE key='release_version' LIMIT 1) version,
 COUNT(*) shown_count, MIN(TIMESTAMP_MICROS(event_timestamp)) first_shown, MAX(TIMESTAMP_MICROS(event_timestamp)) last_shown
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE _TABLE_SUFFIX BETWEEN since_suffix AND FORMAT_DATE('%Y%m%d',CURRENT_DATE('UTC'))
 AND event_name='ad_shown'
GROUP BY user_pseudo_id,puzzle_id,market,version HAVING COUNT(*)>1;
