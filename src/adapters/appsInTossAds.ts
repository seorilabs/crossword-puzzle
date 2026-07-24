import {
  loadFullScreenAd,
  showFullScreenAd,
  type LoadFullScreenAdEvent,
  type ShowFullScreenAdEvent,
} from "@apps-in-toss/web-framework";

export const appsInTossAdGroupIds = {
  rewardedHint: "ait.v2.live.434bcf7cff1d462e",
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
