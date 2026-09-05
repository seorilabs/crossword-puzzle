import {
  loadFullScreenAd,
  showFullScreenAd,
  type LoadFullScreenAdEvent,
  type ShowFullScreenAdEvent,
} from "@apps-in-toss/web-framework";

import type { RewardedAdTraceEvent } from "../../packages/crossword-core/src/rewardedAdTrace.ts";

export const appsInTossAdGroupIds = {
  rewardedHint: "ait.v2.live.bf12924f4bf84b74",
} as const;

export type FullScreenAdResult =
  | { status: "rewarded" }
  | { status: "dismissed" }
  | { status: "failed"; reason: string }
  | { status: "unsupported" }
  | { status: "timeout"; reason: "load_timeout" | "show_timeout" };

export type FullScreenAdTraceEvent =
  | { phase: "load"; type: LoadFullScreenAdEvent["type"] }
  | { phase: "show"; type: ShowFullScreenAdEvent["type"] }
  | {
      phase: "error";
      type: "load_error" | "show_error" | "load_timeout" | "show_timeout";
    };

type FullScreenAdOptions = {
  adGroupId: string;
  dismissalDelayMs?: number;
  loadTimeoutMs?: number;
  onTrace?: (event: FullScreenAdTraceEvent) => void;
  showStartTimeoutMs?: number;
};

function isFullScreenAdSupported() {
  try {
    return loadFullScreenAd.isSupported() && showFullScreenAd.isSupported();
  } catch {
    return false;
  }
}

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function loadAndShowFullScreenAd({
  adGroupId,
  dismissalDelayMs = 0,
  loadTimeoutMs = 45000,
  onTrace,
  showStartTimeoutMs = 45000,
}: FullScreenAdOptions): Promise<FullScreenAdResult> {
  if (!isFullScreenAdSupported()) {
    return Promise.resolve({ status: "unsupported" });
  }

  return new Promise((resolve) => {
    let isResolved = false;
    let unregisterLoad: (() => void) | undefined;
    let unregisterShow: (() => void) | undefined;
    let dismissalTimerId: number | undefined;
    let timeoutTimerId: number | undefined;
    let timeoutGeneration = 0;

    function clearTimeoutTimer() {
      timeoutGeneration += 1;

      if (timeoutTimerId != null) {
        window.clearTimeout(timeoutTimerId);
        timeoutTimerId = undefined;
      }
    }

    function scheduleTimeout(
      type: "load_timeout" | "show_timeout",
      durationMs: number,
    ) {
      clearTimeoutTimer();

      if (durationMs <= 0) {
        return;
      }

      const scheduledGeneration = timeoutGeneration + 1;
      timeoutGeneration = scheduledGeneration;
      timeoutTimerId = window.setTimeout(() => {
        if (scheduledGeneration !== timeoutGeneration) {
          return;
        }

        timeoutTimerId = undefined;
        onTrace?.({ phase: "error", type });
        resolveOnce({ status: "timeout", reason: type });
      }, durationMs);
    }

    function cleanup() {
      unregisterLoad?.();
      unregisterShow?.();
      if (dismissalTimerId != null) {
        window.clearTimeout(dismissalTimerId);
      }
      clearTimeoutTimer();
    }

    function resolveOnce(result: FullScreenAdResult) {
      if (isResolved) {
        return;
      }

      isResolved = true;
      cleanup();
      resolve(result);
    }

    scheduleTimeout("load_timeout", loadTimeoutMs);

    try {
      unregisterLoad = loadFullScreenAd({
        options: { adGroupId },
        onEvent: (event) => {
          onTrace?.({ phase: "load", type: event.type });

          if (event.type !== "loaded") {
            return;
          }

          unregisterLoad?.();
          unregisterLoad = undefined;
          scheduleTimeout("show_timeout", showStartTimeoutMs);

          unregisterShow = showFullScreenAd({
            options: { adGroupId },
            onEvent: (showEvent) => {
              onTrace?.({ phase: "show", type: showEvent.type });

              if (
                showEvent.type === "show" ||
                showEvent.type === "impression" ||
                showEvent.type === "clicked"
              ) {
                clearTimeoutTimer();
              }

              if (showEvent.type === "userEarnedReward") {
                resolveOnce({ status: "rewarded" });
              }

              if (showEvent.type === "dismissed") {
                clearTimeoutTimer();

                if (dismissalDelayMs <= 0) {
                  resolveOnce({ status: "dismissed" });
                  return;
                }

                if (dismissalTimerId != null) {
                  window.clearTimeout(dismissalTimerId);
                }

                dismissalTimerId = window.setTimeout(() => {
                  resolveOnce({ status: "dismissed" });
                }, dismissalDelayMs);
              }

              if (showEvent.type === "failedToShow") {
                resolveOnce({ status: "failed", reason: "failedToShow" });
              }
            },
            onError: (error) => {
              onTrace?.({ phase: "error", type: "show_error" });
              resolveOnce({
                status: "failed",
                reason: asErrorMessage(error),
              });
            },
          });
        },
        onError: (error) => {
          onTrace?.({ phase: "error", type: "load_error" });
          resolveOnce({
            status: "failed",
            reason: asErrorMessage(error),
          });
        },
      });
    } catch (error) {
      resolveOnce({ status: "failed", reason: asErrorMessage(error) });
    }
  });
}

export function showRewardedHintAd(
  onTrace?: (event: FullScreenAdTraceEvent) => void,
) {
  return loadAndShowFullScreenAd({
    adGroupId: appsInTossAdGroupIds.rewardedHint,
    dismissalDelayMs: 3000,
    onTrace,
  });
}

// AppsInToss SDK 원본 이벤트 → 통일 어휘 대응표(#385). show 단계의 "requested"는
// SDK가 실제 노출 직전에 보내는 별도 신호이고, RN의 초기 "request"(광고 요청
// 자체를 시작하는 시점)와는 발생 시점이 다르지만 같은 request 단계로 묶는다.
export function mapFullScreenAdTraceEvent(
  event: FullScreenAdTraceEvent,
): RewardedAdTraceEvent {
  if (event.phase === "load") {
    return { ad_result: "loaded", ad_stage: "load" };
  }

  if (event.phase === "error") {
    return { ad_result: event.type, ad_stage: "error" };
  }

  switch (event.type) {
    case "requested":
      return { ad_result: "requested", ad_stage: "request" };
    case "clicked":
      return { ad_result: "clicked", ad_stage: "show" };
    case "userEarnedReward":
      return { ad_result: "rewarded", ad_stage: "show" };
    case "dismissed":
      return { ad_result: "dismissed", ad_stage: "show" };
    case "failedToShow":
      return { ad_result: "failed_to_show", ad_stage: "show" };
    case "show":
    case "impression":
      return { ad_result: "shown", ad_stage: "show" };
  }
}
