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
  onEvent: (event: { type: string }) => void;
  onError: (error: Error) => void;
};
export const loadFullScreenAd = Object.assign(
  ({ onEvent, onError }: AdHandler) => {
    queueMicrotask(() =>
      window.__crosswordQa.adOutcome === "error"
        ? onError(new Error("qa-ad-load-error"))
        : onEvent({ type: "loaded" }),
    );
    return () => {};
  },
  { isSupported: () => true },
);
export const showFullScreenAd = Object.assign(
  ({ onEvent }: AdHandler) => {
    record("ait", "ad_show");
    queueMicrotask(() => {
      onEvent({ type: "show" });
      if (window.__crosswordQa.adOutcome === "rewarded")
        onEvent({ type: "userEarnedReward" });
      onEvent({ type: "dismissed" });
    });
    return () => {};
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
