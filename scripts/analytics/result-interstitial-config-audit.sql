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
-- 대상 이벤트(계약 화이트리스트, 정확히 세 종류만):
--   result_interstitial_ad_request : 결과 전면광고 요청
--   result_interstitial_ad_event   : load/show
--   result_interstitial_ad_result  : 종료/실패(status)
--   (docs/firebase-analytics-remote-config.md 계약. 현재 코드는 모두 emit하지 않음.)
--   계약 외 이름(result_interstitial_ad_show 등)은 stage 오분류로 verdict를 흐리지
--   않도록 WHERE에서 정규식으로 배제한다.
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

-- result_interstitial 계약 이벤트만 한 번 스캔해 stage/status와 cutoff 초과 여부를
-- 정규화한다. cutoff 비교는 양쪽을 명시적으로 DATE로 파싱해 타입 의존을 제거한다
-- (GA4 event_date는 표준상 STRING이나, CAST로 정수 export 변형까지 함께 방어한다).
CREATE TEMP TABLE result_interstitial_events AS
SELECT
  CAST(event_date AS STRING) AS event_date,
  user_pseudo_id,
  CASE
    WHEN ENDS_WITH(event_name, '_ad_request') THEN 'request'
    WHEN ENDS_WITH(event_name, '_ad_result') THEN 'result'
    WHEN ENDS_WITH(event_name, '_ad_event') THEN 'event'
  END AS stage,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'status' LIMIT 1) AS status,
  PARSE_DATE('%Y%m%d', CAST(event_date AS STRING)) > PARSE_DATE('%Y%m%d', compliance_cutoff) AS after_cutoff
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE (
    -- 일일 export 테이블(접미사 YYYYMMDD).
    _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
    -- intraday export 테이블(접미사 intraday_YYYYMMDD): 위 분기는 'intraday_'가
    -- 사전순으로 숫자보다 커서 매칭되지 않으므로 별도 분기로 명시 포함한다.
    OR (
      STARTS_WITH(_TABLE_SUFFIX, 'intraday_')
      AND REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\d{8})$') BETWEEN from_suffix AND to_suffix
    )
  )
  AND REGEXP_CONTAINS(event_name, r'^result_interstitial_ad_(request|event|result)$')
  AND user_pseudo_id IS NOT NULL;

-- 결과 1) 일자별·stage별 건수: 마지막 출현일과 cutoff 이후 잔존 여부를 시계열로 본다.
SELECT
  'result_interstitial_daily' AS section,
  event_date,
  stage,
  COUNT(*) AS event_count,
  COUNT(DISTINCT user_pseudo_id) AS users,
  ANY_VALUE(after_cutoff) AS after_cutoff
FROM result_interstitial_events
-- 방어적 가드: WHERE 화이트리스트가 이미 stage를 세 계약값으로 보장하지만, 향후
-- CASE/WHERE가 desync되어도 stage=NULL(비계약) 행이 집계·verdict에 섞이지 않게 한다.
WHERE stage IS NOT NULL
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
  COUNTIF(after_cutoff) AS events_after_cutoff,
  COUNT(DISTINCT IF(after_cutoff, user_pseudo_id, NULL)) AS users_after_cutoff,
  -- 한눈에 보는 준수 여부 판정.
  IF(COUNTIF(after_cutoff) = 0, 'COMPLIANT', 'VIOLATION') AS verdict
FROM result_interstitial_events
WHERE stage IS NOT NULL;
