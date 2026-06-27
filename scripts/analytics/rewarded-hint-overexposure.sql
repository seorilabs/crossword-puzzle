-- rewarded_hint 광고 과노출·피로 분석 (노출당 완주율·반복 노출 감쇠)
--
-- 목적: 보상형 힌트 광고가 소수 코어에 과도하게 집중되는지(#99 baseline: 8명, 1인당
--       16.5건)와, 반복 노출이 완주율을 떨어뜨리는 '광고 피로'가 있는지를 데이터로
--       점검한다. placement 단위 퍼널은 `ad-funnel.sql`로 별도 산출하고, 본 쿼리는
--       rewarded_hint 의 **user별 노출 집중도**와 **반복 노출 회차별 완주율 감쇠**에
--       초점을 둔다. 측정 전용(행동 변경 없음).
--
-- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`
-- 대상 이벤트(계약 화이트리스트, src/App.tsx requestRewardedHint):
--   rewarded_hint_ad_request  : 광고 요청(click)
--   rewarded_hint_ad_event    : load/show 추적(impression)
--   rewarded_hint_ad_result   : 종료/실패(impression). status=rewarded/dismissed/failed/timeout/unsupported
--   rewarded_hint_ad_reward   : 보상 지급(impression) = 완주
--   rewarded_hint_ad_cancel   : 프롬프트 취소(click)
--   rewarded_hint_ad_disabled : config off로 비활성(click)
--
-- 표준 정의(ad-funnel.sql과 동일):
--   fill(노출 성공) = result.status IN ('rewarded','dismissed')
--   완주(reward)    = result.status = 'rewarded'  (또는 reward 이벤트)
--   실패            = result.status IN ('failed','timeout','unsupported')
--
-- 구간 변수(from_suffix / to_suffix)는 GA4 export 테이블 접미사(YYYYMMDD)다.
-- 기본값은 최근 28일 롤링이며, 특정 구간으로 고정하려면 아래 두 DECLARE 줄만 바꾼다.
--
-- 주의: 표본이 작으면 비율은 노이즈가 크다. 비율과 함께 분자/분모(건수·user 수)를 같이 본다.

DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 28 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'));

-- rewarded_hint 계약 이벤트만 한 번 스캔해 stage/status/timestamp로 정규화한다.
CREATE TEMP TABLE rewarded_hint_events AS
SELECT
  user_pseudo_id,
  event_timestamp,
  CASE
    WHEN ENDS_WITH(event_name, '_ad_request') THEN 'request'
    WHEN ENDS_WITH(event_name, '_ad_result') THEN 'result'
    WHEN ENDS_WITH(event_name, '_ad_reward') THEN 'reward'
    WHEN ENDS_WITH(event_name, '_ad_cancel') THEN 'cancel'
    WHEN ENDS_WITH(event_name, '_ad_disabled') THEN 'disabled'
    WHEN ENDS_WITH(event_name, '_ad_event') THEN 'event'
  END AS stage,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'status' LIMIT 1) AS status
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE (
    -- 일일 export 테이블(접미사 YYYYMMDD).
    _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
    -- intraday export 테이블(접미사 intraday_YYYYMMDD): 위 분기는 사전순으로 매칭되지
    -- 않으므로 별도 분기로 명시 포함한다.
    OR (
      STARTS_WITH(_TABLE_SUFFIX, 'intraday_')
      AND REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\d{8})$') BETWEEN from_suffix AND to_suffix
    )
  )
  AND REGEXP_CONTAINS(event_name, r'^rewarded_hint_ad_(request|result|reward|cancel|disabled|event)$')
  AND user_pseudo_id IS NOT NULL;

-- user별 요청/보상/취소/결과 집계(과노출 집중도 산출용).
CREATE TEMP TABLE rewarded_hint_per_user AS
SELECT
  user_pseudo_id,
  COUNTIF(stage = 'request') AS requests,
  COUNTIF(stage = 'reward') AS rewards,
  COUNTIF(stage = 'cancel') AS cancels,
  COUNTIF(stage = 'result' AND status IN ('rewarded', 'dismissed')) AS fills,
  COUNTIF(stage = 'result' AND status = 'rewarded') AS rewarded_results,
  COUNTIF(stage = 'result' AND status IN ('failed', 'timeout', 'unsupported')) AS failed_results
FROM rewarded_hint_events
GROUP BY user_pseudo_id
HAVING requests > 0;

-- result 이벤트를 user별 시간순으로 줄세워 '몇 번째 광고 시도인지'(회차)를 매긴다(피로 분석용).
CREATE TEMP TABLE rewarded_hint_result_ordinal AS
SELECT
  user_pseudo_id,
  status,
  ROW_NUMBER() OVER (PARTITION BY user_pseudo_id ORDER BY event_timestamp) AS attempt_ordinal
FROM rewarded_hint_events
WHERE stage = 'result';

-- 결과 1) 요청 횟수 구간별 user 분포·완주/취소율: 과노출 코호트가 완주율이 낮은지 본다.
SELECT
  'exposure_by_user_bucket' AS section,
  CASE
    WHEN requests = 1 THEN '01'
    WHEN requests BETWEEN 2 AND 5 THEN '02-05'
    WHEN requests BETWEEN 6 AND 10 THEN '06-10'
    WHEN requests BETWEEN 11 AND 20 THEN '11-20'
    ELSE '21+'
  END AS request_bucket,
  COUNT(*) AS users,
  SUM(requests) AS total_requests,
  -- 전체 요청 중 이 구간이 차지하는 비중(과노출 집중도).
  SAFE_DIVIDE(SUM(requests), SUM(SUM(requests)) OVER ()) AS request_share,
  -- 노출당 완주율 = 보상 / 요청.
  SAFE_DIVIDE(SUM(rewards), SUM(requests)) AS reward_rate,
  -- 취소율 = 취소 / 요청.
  SAFE_DIVIDE(SUM(cancels), SUM(requests)) AS cancel_rate,
  -- 실패율 = 실패 결과 / 요청.
  SAFE_DIVIDE(SUM(failed_results), SUM(requests)) AS fail_rate
FROM rewarded_hint_per_user
GROUP BY request_bucket
ORDER BY request_bucket;

-- 결과 2) 과노출 요약: 1인당 요청 분포(평균·중앙·p90·최대)와 헤비 코호트(10회+) 집중도.
SELECT
  'exposure_summary' AS section,
  COUNT(*) AS request_users,
  SUM(requests) AS total_requests,
  SAFE_DIVIDE(SUM(requests), COUNT(*)) AS mean_requests_per_user,
  APPROX_QUANTILES(requests, 100)[OFFSET(50)] AS p50_requests,
  APPROX_QUANTILES(requests, 100)[OFFSET(90)] AS p90_requests,
  MAX(requests) AS max_requests,
  COUNTIF(requests >= 10) AS heavy_users_10plus,
  -- 헤비 코호트(10회+)가 전체 요청에서 차지하는 비중.
  SAFE_DIVIDE(SUM(IF(requests >= 10, requests, 0)), SUM(requests)) AS heavy_request_share,
  -- 전체 노출당 완주율·취소·실패율.
  SAFE_DIVIDE(SUM(rewards), SUM(requests)) AS overall_reward_rate,
  SAFE_DIVIDE(SUM(cancels), SUM(requests)) AS overall_cancel_rate,
  SAFE_DIVIDE(SUM(failed_results), SUM(requests)) AS overall_fail_rate
FROM rewarded_hint_per_user;

-- 결과 3) 반복 노출 회차별 완주율(광고 피로): 회차가 올라갈수록 완주율이 떨어지는지 본다.
SELECT
  'fatigue_by_attempt' AS section,
  CASE
    WHEN attempt_ordinal = 1 THEN '01'
    WHEN attempt_ordinal BETWEEN 2 AND 3 THEN '02-03'
    WHEN attempt_ordinal BETWEEN 4 AND 6 THEN '04-06'
    WHEN attempt_ordinal BETWEEN 7 AND 10 THEN '07-10'
    ELSE '11+'
  END AS attempt_bucket,
  COUNT(*) AS results,
  COUNTIF(status = 'rewarded') AS rewarded,
  COUNTIF(status IN ('rewarded', 'dismissed')) AS filled,
  COUNTIF(status IN ('failed', 'timeout', 'unsupported')) AS failed,
  -- 회차 구간별 노출 대비 완주율(rewarded / 전체 result).
  SAFE_DIVIDE(COUNTIF(status = 'rewarded'), COUNT(*)) AS reward_rate,
  -- 회차 구간별 실패율.
  SAFE_DIVIDE(COUNTIF(status IN ('failed', 'timeout', 'unsupported')), COUNT(*)) AS fail_rate
FROM rewarded_hint_result_ordinal
GROUP BY attempt_bucket
ORDER BY attempt_bucket;
