-- result_interstitial 설정·실노출 정합 감사 (config=false 준수 확인)
--
-- 목적: 결과 전면광고(result_interstitial)가 Remote Config
--       `result_interstitial_ads_enabled`(기본 false)를 따라 **실제로 노출/계측되지
--       않는지** 를 데이터로 감사한다. #98 baseline은 config=false인데 데이터에
--       result_interstitial 이벤트 6명·83건(last_day 20260617)이 관측된 불일치였다.
--       코드 점검 결과 현재 빌드에는 호출부가 없고(parity 게이트로 차단) 이벤트 emit도
--       없어, 83건은 호출부 제거 이전 **구버전 잔존 빌드의 이력**으로 판단된다.
--       본 쿼리는 그 가설을 데이터로 확정하고(= cutoff 이후 0건) 향후 재발 시
--       즉시 가시화하는 **상시 정합 감사** 수단이다. 측정 전용(행동 변경 없음).
--
-- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`
-- 대상 이벤트(prefix `result_interstitial_ad`):
--   result_interstitial_ad_request : 결과 전면광고 요청
--   result_interstitial_ad_event   : load/show
--   result_interstitial_ad_result  : 종료/실패(status)
--   (docs/firebase-analytics-remote-config.md 계약. 현재 코드는 모두 emit하지 않음.)
--
-- 구간 변수(from_suffix / to_suffix)는 GA4 export 테이블 접미사(YYYYMMDD)다.
-- 기본값은 최근 90일 롤링(구버전 잔존 이력까지 폭넓게 포착)이며, 특정 구간으로
-- 고정하려면 아래 두 DECLARE 줄만 바꾼다.
--
-- compliance_cutoff: 이 날짜(YYYYMMDD)를 **초과한** result_interstitial 이벤트가 1건이라도
--   있으면 config=false 준수 위반(활성 경로 존재 의심)으로 본다. 기본값은 baseline의
--   마지막 관측일(20260617). 구버전 잔존 빌드가 완전히 빠진 시점을 알면 그 날짜로 올린다.

DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 90 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'));
DECLARE compliance_cutoff STRING DEFAULT '20260617';

-- result_interstitial 이벤트만 한 번 스캔해 stage/status로 정규화한다.
CREATE TEMP TABLE result_interstitial_events AS
SELECT
  event_date,
  user_pseudo_id,
  CASE
    WHEN ENDS_WITH(event_name, '_ad_request') THEN 'request'
    WHEN ENDS_WITH(event_name, '_ad_result') THEN 'result'
    WHEN ENDS_WITH(event_name, '_ad_event') THEN 'event'
    ELSE '(other)'
  END AS stage,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'status' LIMIT 1) AS status
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE (
    _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
    OR REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\d{8})$') BETWEEN from_suffix AND to_suffix
  )
  AND STARTS_WITH(event_name, 'result_interstitial_ad')
  AND user_pseudo_id IS NOT NULL;

-- 결과 1) 일자별·stage별 건수: 마지막 출현일과 cutoff 이후 잔존 여부를 시계열로 본다.
SELECT
  'result_interstitial_daily' AS section,
  event_date,
  stage,
  COUNT(*) AS event_count,
  COUNT(DISTINCT user_pseudo_id) AS users,
  event_date > compliance_cutoff AS after_cutoff
FROM result_interstitial_events
GROUP BY event_date, stage
ORDER BY event_date, stage;

-- 결과 2) 정합 감사 요약: cutoff 이후 잔존 건수가 0이면 config=false 준수(DoD 충족).
SELECT
  'config_compliance_summary' AS section,
  compliance_cutoff AS compliance_cutoff_date,
  COUNT(*) AS total_events,
  COUNT(DISTINCT user_pseudo_id) AS total_users,
  MIN(event_date) AS first_seen_date,
  MAX(event_date) AS last_seen_date,
  -- cutoff 이후(>) 잔존 이벤트/유저. 0이면 준수, 1+ 이면 활성 경로 의심으로 재오픈.
  COUNTIF(event_date > compliance_cutoff) AS events_after_cutoff,
  COUNT(DISTINCT IF(event_date > compliance_cutoff, user_pseudo_id, NULL)) AS users_after_cutoff,
  -- 한눈에 보는 준수 여부 판정.
  IF(COUNTIF(event_date > compliance_cutoff) = 0, 'COMPLIANT', 'VIOLATION') AS verdict
FROM result_interstitial_events;
