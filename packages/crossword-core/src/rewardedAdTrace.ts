import type { TelemetryClient, TelemetryParams } from "./platformContracts.ts";
import type { RewardedAdRetryAttempt } from "./rewardedAdRetry.ts";

// 힌트 리워드 광고 진행 단계마다 SDK 콜백에서 남기는 세부 추적 이벤트(#385).
// rewarded_hint_ad_request/rewarded_hint_ad_result(요청 1회·최종 결과 1회만
// 발화)와 달리, 이 이벤트는 요청 한 번 안에서 SDK 콜백 수만큼 여러 번 발화한다.
//
// 웹(AppsInToss SDK)은 `phase`("load"|"show"|"error") + `type`(SDK 원본
// 문자열)을, RN(AdMob SDK)은 `ad_event`(원본 문자열) + `ad_error_code`를 각각
// 썼다. 어느 한쪽 어휘로 집계하면 다른 쪽 표면 전량이 조용히 빠졌다(28일 실측:
// WEB 711건이 ad_event 기준에서, ANDROID 190건이 phase/type 기준에서 전부
// NULL). 아래 두 축(ad_stage·ad_result)으로 통일한다.
//
// 원본 → 통일 어휘 대응표는 각 플랫폼 매핑 함수에 있다:
//   웹: src/adapters/appsInTossAds.ts의 mapFullScreenAdTraceEvent
//   RN: apps/mobile/mobileAds.ts의 mapMobileAdTraceEvent
export const REWARDED_HINT_AD_EVENT = "rewarded_hint_ad_event";

export type RewardedAdTraceStage = "request" | "load" | "show" | "error";

// 두 표면의 원본 이벤트가 매핑될 수 있는 전체 어휘. 이 목록 밖의 값은 매핑
// 함수가 만들어낼 수 없다(각 함수의 반환 타입이 이 유니온으로 제한된다).
export const REWARDED_AD_TRACE_RESULTS = [
  "requested",
  "loaded",
  "shown",
  "clicked",
  "rewarded",
  "dismissed",
  "failed_to_show",
  "load_error",
  "show_error",
  "load_timeout",
  "show_timeout",
  "unavailable",
] as const;

export type RewardedAdTraceResult = (typeof REWARDED_AD_TRACE_RESULTS)[number];

export type RewardedAdTraceEvent = {
  ad_error_code?: string;
  ad_result: RewardedAdTraceResult;
  ad_stage: RewardedAdTraceStage;
};

// 웹·RN 어댑터가 반드시 이 함수 하나로만 rewarded_hint_ad_event 를 발화한다.
// context 에는 호출부가 채우는 공통 값(ad_placement, puzzle_id, retry 등)을 담는다.
export function trackRewardedHintAdTrace(
  telemetry: Pick<TelemetryClient, "impression">,
  event: RewardedAdTraceEvent,
  context: TelemetryParams & { retry: RewardedAdRetryAttempt },
): void {
  telemetry.impression(REWARDED_HINT_AD_EVENT, {
    ...context,
    ad_error_code: event.ad_error_code,
    ad_result: event.ad_result,
    ad_stage: event.ad_stage,
  });
}
