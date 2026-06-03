import {
  loadFullScreenAd,
  showFullScreenAd,
  type LoadFullScreenAdEvent,
  type ShowFullScreenAdEvent,
} from "@apps-in-toss/web-framework";

export const appsInTossAdGroupIds = {
  resultInterstitial: "ait.v2.live.a1439d344fa34821",
  rewardedHint: "ait.v2.live.434bcf7cff1d462e",
} as const;

export type FullScreenAdResult =
  | { status: "rewarded" }
  | { status: "dismissed" }
  | { status: "failed"; reason: string }
  | { status: "unsupported" }
  | { status: "timeout" };

export type FullScreenAdTraceEvent =
  | { phase: "load"; type: LoadFullScreenAdEvent["type"] }
  | { phase: "show"; type: ShowFullScreenAdEvent["type"] }
  | { phase: "error"; type: "load_error" | "show_error" | "timeout" };

type FullScreenAdOptions = {
  adGroupId: string;
  onTrace?: (event: FullScreenAdTraceEvent) => void;
  timeoutMs?: number;
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
  onTrace,
  timeoutMs = 45000,
}: FullScreenAdOptions): Promise<FullScreenAdResult> {
  if (!isFullScreenAdSupported()) {
    return Promise.resolve({ status: "unsupported" });
  }

  return new Promise((resolve) => {
    let isResolved = false;
    let didEarnReward = false;
    let unregisterLoad: (() => void) | undefined;
    let unregisterShow: (() => void) | undefined;

    function cleanup() {
      unregisterLoad?.();
      unregisterShow?.();
      window.clearTimeout(timeoutId);
    }

    function resolveOnce(result: FullScreenAdResult) {
      if (isResolved) {
        return;
      }

      isResolved = true;
      cleanup();
      resolve(result);
    }

    const timeoutId = window.setTimeout(() => {
      onTrace?.({ phase: "error", type: "timeout" });
      resolveOnce({ status: "timeout" });
    }, timeoutMs);

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

          unregisterShow = showFullScreenAd({
            options: { adGroupId },
            onEvent: (showEvent) => {
              onTrace?.({ phase: "show", type: showEvent.type });

              if (showEvent.type === "userEarnedReward") {
                didEarnReward = true;
              }

              if (showEvent.type === "dismissed") {
                resolveOnce({
                  status: didEarnReward ? "rewarded" : "dismissed",
                });
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
    onTrace,
  });
}

export function showResultInterstitialAd(
  onTrace?: (event: FullScreenAdTraceEvent) => void,
) {
  return loadAndShowFullScreenAd({
    adGroupId: appsInTossAdGroupIds.resultInterstitial,
    onTrace,
  });
}
