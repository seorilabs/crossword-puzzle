-- 광고 라이프사이클 퍼널 표준 집계 (rewarded ads)
--
-- 목적: 광고 노출→보상 완주 퍼널을 placement(광고 위치)별로 표준 산출한다.
--       요청(request) → 결과(result, status) → 보상(reward) 단계와 fill(노출 성공)·
--       완주(reward)·실패/취소 분포를 한 번에 본다. 측정 전용(행동 변경 없음).
--
-- 소스: GA4 → BigQuery export `crossword-puzzle-79ae0.analytics_539639687.events_*`
--
-- placement는 현재 이벤트명 prefix로 구분된다(별도 placement 파라미터는 없음):
--   rewarded_hint_ad_*          → placement = 'rewarded_hint'
--   result_interstitial_ad_*    → 현재 호출부 없음(parity로 차단). 데이터에 나오면
--                                  구버전 잔존이므로 함께 집계해 가시화한다.
--
-- 단계 이벤트(src/App.tsx):
--   *_ad_request  : 광고 요청(click)
--   *_ad_result   : 광고 종료/실패(impression). status = rewarded/dismissed/failed/timeout/unsupported
--                   (getFullScreenAdResultParams). reason은 failed/timeout일 때만.
--   *_ad_reward   : 보상 지급(impression) = 완주
--
-- 표준 정의:
--   fill(노출 성공) = result.status IN ('rewarded','dismissed')  (광고가 실제 표시됨)
--   완주(reward)    = result.status = 'rewarded'
--   no_fill/실패    = status IN ('failed','timeout','unsupported')
--
-- 크로스마켓 택소노미 game_assist_ad.result 매핑(#321) — 위 레거시 status와의 정합 대조용:
--   request  ← rewarded_hint_ad_request
--   reward   ← result.status = 'rewarded' (= *_ad_reward)
--   dismiss  ← 유저 취소: 웹 result.status='dismissed' / 모바일 'closed' / rewarded_hint_ad_cancel
--   error    ← 그 외 실패: status IN ('failed','timeout','unsupported')
--   (#321에서 dismiss/error 경로를 웹·모바일 onFailure에 배선. 배포 후
--    game_assist_ad.result 분포가 레거시 status 분포와 정합하는지 BQ로 대조한다.)
--
-- 구간 변수(from_suffix / to_suffix)는 GA4 export 테이블 접미사(YYYYMMDD)다.
-- 기본값은 최근 28일 롤링이며, 특정 구간으로 고정하려면 아래 두 DECLARE 줄만 바꾼다.
--
-- 주의: 표본이 작으면 비율은 노이즈가 크다. 비율과 함께 분자/분모(건수)를 같이 본다.

DECLARE from_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 28 DAY));
DECLARE to_suffix STRING DEFAULT FORMAT_DATE('%Y%m%d', CURRENT_DATE('Asia/Seoul'));

-- 광고 라이프사이클 이벤트를 한 번만 스캔해 placement/stage/status로 정규화한다.
CREATE TEMP TABLE ad_events AS
SELECT
  user_pseudo_id,
  event_name,
  CASE
    WHEN STARTS_WITH(event_name, 'rewarded_hint_ad') THEN 'rewarded_hint'
    WHEN STARTS_WITH(event_name, 'result_interstitial_ad') THEN 'result_interstitial'
    ELSE '(other)'
  END AS placement,
  CASE
    WHEN ENDS_WITH(event_name, '_ad_request') THEN 'request'
    WHEN ENDS_WITH(event_name, '_ad_result') THEN 'result'
    WHEN ENDS_WITH(event_name, '_ad_reward') THEN 'reward'
    WHEN ENDS_WITH(event_name, '_ad_cancel') THEN 'cancel'
    WHEN ENDS_WITH(event_name, '_ad_disabled') THEN 'disabled'
    WHEN ENDS_WITH(event_name, '_ad_event') THEN 'event'
    ELSE '(other)'
  END AS stage,
  (
    SELECT value.string_value
    FROM UNNEST(event_params)
    WHERE key = 'status'
    LIMIT 1
  ) AS status
FROM `crossword-puzzle-79ae0.analytics_539639687.events_*`
WHERE (
    _TABLE_SUFFIX BETWEEN from_suffix AND to_suffix
    OR REGEXP_EXTRACT(_TABLE_SUFFIX, r'^intraday_(\d{8})$') BETWEEN from_suffix AND to_suffix
  )
  AND REGEXP_CONTAINS(event_name, r'_ad_(request|result|reward|cancel|disabled|event)$')
  AND (
    STARTS_WITH(event_name, 'rewarded_hint_ad')
    OR STARTS_WITH(event_name, 'result_interstitial_ad')
  )
  AND user_pseudo_id IS NOT NULL;

-- 결과 1) placement별 퍼널: 요청→fill(노출)→완주(reward) 단계 건수와 fill/완주율.
SELECT
  'ad_funnel' AS section,
  placement,
  COUNTIF(stage = 'request') AS requests,
  COUNTIF(stage = 'result') AS results,
  COUNTIF(stage = 'result' AND status IN ('rewarded', 'dismissed')) AS filled,
  COUNTIF(stage = 'reward') AS rewards,
  COUNTIF(stage = 'result' AND status = 'rewarded') AS rewarded_results,
  COUNTIF(stage = 'cancel') AS cancels,
  COUNT(DISTINCT user_pseudo_id) AS users,
  -- fill rate = 노출 성공(rewarded+dismissed) / 요청.
  SAFE_DIVIDE(
    COUNTIF(stage = 'result' AND status IN ('rewarded', 'dismissed')),
    COUNTIF(stage = 'request')
  ) AS fill_rate,
  -- 완주율 = 보상(rewarded) / 요청.
  SAFE_DIVIDE(COUNTIF(stage = 'reward'), COUNTIF(stage = 'request')) AS reward_rate,
  -- 노출 대비 완주율 = rewarded / fill(노출).
  SAFE_DIVIDE(
    COUNTIF(stage = 'result' AND status = 'rewarded'),
    COUNTIF(stage = 'result' AND status IN ('rewarded', 'dismissed'))
  ) AS reward_given_fill
FROM ad_events
WHERE placement != '(other)'
GROUP BY placement
ORDER BY requests DESC;

-- 결과 2) placement × result status 분포(실패/취소 원인 가시화).
SELECT
  'result_status' AS section,
  placement,
  COALESCE(status, '(none)') AS status,
  COUNT(*) AS result_count,
  SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER (PARTITION BY placement)) AS status_share
FROM ad_events
WHERE stage = 'result' AND placement != '(other)'
GROUP BY placement, status
ORDER BY placement, result_count DESC;
