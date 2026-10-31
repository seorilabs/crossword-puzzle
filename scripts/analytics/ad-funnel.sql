-- 완료 일반 전면광고. 구버전 힌트 보상 이벤트와 합산하지 않는다.
DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('UTC'), INTERVAL 28 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('UTC'));
WITH events AS (
 SELECT event_name, user_pseudo_id,
  COALESCE((SELECT value.string_value FROM UNNEST(event_params) WHERE key='app_market' LIMIT 1),platform) market,
  COALESCE((SELECT value.string_value FROM UNNEST(event_params) WHERE key='release_version' LIMIT 1),app_info.version) version,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key='content_language' LIMIT 1) language
 FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
 WHERE _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
 AND (event_name IN ('ad_opportunity','ad_requested','ad_shown','ad_impression','ad_closed','ad_failed') OR STARTS_WITH(event_name,'ad_skipped_'))
)
SELECT market, version, language,
 COUNTIF(event_name='ad_opportunity') opportunities,
 COUNTIF(event_name='ad_requested') requests,
 COUNTIF(event_name='ad_shown') shown,
 COUNTIF(event_name='ad_impression') sdk_impressions,
 COUNTIF(event_name='ad_closed') closed,
 COUNTIF(event_name='ad_failed') failed,
 COUNTIF(STARTS_WITH(event_name,'ad_skipped_')) skipped,
 COUNT(DISTINCT user_pseudo_id) users,
 SAFE_DIVIDE(COUNTIF(event_name='ad_shown'),COUNTIF(event_name='ad_requested')) shown_per_request,
 SAFE_DIVIDE(COUNTIF(event_name='ad_failed'),COUNTIF(event_name='ad_requested')) failure_rate
FROM events GROUP BY market,version,language;
