import { record } from "../runtimeState";
export const Analytics = Object.fromEntries(
  ["screen", "click", "impression"].map((kind) => [
    kind,
    (params: Record<string, unknown>) =>
      record("ait", String(params.log_name), params),
  ]),
);
export const SafeAreaInsets = {
  get: () => window.__crosswordQa.safeArea,
  subscribe: () => () => {},
};
type AdHandler = {
  options?: { adGroupId: string };
  onEvent: (event: { type: string }) => void;
  onError: (error: Error) => void;
};
export const loadFullScreenAd = Object.assign(
  ({ onEvent, onError, options }: AdHandler) => {
    const state = window.__crosswordQa;
    record("ait", "interstitial_load", options);
    if (state.interstitialOutcome === "unready") return () => {};
    let active = true;
    const timer = setTimeout(() => {
      if (!active && !state.interstitialLateLoad) return;
      if (state.interstitialOutcome === "error" ||
          (!state.interstitialOutcome && state.adOutcome === "error")) {
        onError(new Error("qa-ad-load-error"));
      } else onEvent({ type: "loaded" });
    }, state.interstitialLoadDelayMs ?? 0);
    return () => {
      active = false;
      if (!state.interstitialLateLoad) clearTimeout(timer);
    };
  },
  { isSupported: () => true },
);
export const showFullScreenAd = Object.assign(
  ({ onEvent, onError, options }: AdHandler) => {
    record("ait", "ad_show");
    record("ait", "interstitial_show", options);
    const state = window.__crosswordQa;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (state.interstitialOutcome === "show-error") {
        onError(new Error("qa-interstitial-show-error"));
        return;
      }
      onEvent({ type: "show" });
      if (!state.interstitialOutcome && state.adOutcome === "rewarded")
        onEvent({ type: "userEarnedReward" });
      const close = () => {
        if (!active) return;
        state.closeInterstitial = undefined;
        record("ait", "interstitial_closed", options);
        onEvent({ type: "dismissed" });
      };
      if (state.interstitialOutcome === "manual") state.closeInterstitial = close;
      else setTimeout(close, state.interstitialCloseDelayMs ?? 0);
    });
    return () => { active = false; };
  },
  { isSupported: () => true },
);
export const share = async () => {
  record("ait", "share");
};
export const getOperationalEnvironment = () => "sandbox";
export const getTossAppVersion = () => "5.221.0";
export const submitGameCenterLeaderBoardScore = async (params: unknown) =>
  record("ait", "leaderboard_submit", params);
export const openGameCenterLeaderboard = async () =>
  record("ait", "leaderboard_open");
export const requestNotificationAgreement = ({
  onEvent,
}: {
  onEvent: (result: { type: string }) => void;
}) => {
  record("ait", "notification_agreement");
  queueMicrotask(() =>
    onEvent({
      type: window.__crosswordQa.notificationPermission
        ? "newAgreement"
        : "agreementRejected",
    }),
  );
  return () => {};
};
export const getSafeAreaInsets = () => window.__crosswordQa.safeArea;

export const getAppsInTossGlobals = () => ({});
