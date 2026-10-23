import { record } from "../runtimeState";
export const MaxAdContentRating = { PG: "PG" };
export const TestIds = { REWARDED: "native-qa-rewarded" };
export const AdsConsentPrivacyOptionsRequirementStatus = {
  REQUIRED: "REQUIRED",
};
export const AdsConsent = {
  gatherConsent: async () => ({ canRequestAds: true }),
  getConsentInfo: async () => ({
    canRequestAds: true,
    privacyOptionsRequirementStatus: "NOT_REQUIRED",
  }),
  showPrivacyOptionsForm: async () => {},
};
export default () => ({
  setRequestConfiguration: async () => {},
  initialize: async () => [],
  openAdInspector: async () => {},
});
export const AdEventType = {
  OPENED: "opened",
  CLOSED: "closed",
  ERROR: "error",
};
export const RewardedAdEventType = {
  LOADED: "loaded",
  EARNED_REWARD: "earned_reward",
};
export const RewardedAd = {
  createForAdRequest: () => {
    const listeners = new Map<string, (value?: unknown) => void>();
    const emit = (name: string, value?: unknown) =>
      listeners.get(name)?.(value);
    return {
      addAdEventListener(name: string, callback: (value?: unknown) => void) {
        listeners.set(name, callback);
        return () => listeners.delete(name);
      },
      load() {
        record("ads", "load");
        queueMicrotask(() =>
          window.__crosswordQa.adOutcome === "error"
            ? emit("error", { code: "qa-unavailable" })
            : emit("loaded"),
        );
      },
      async show() {
        record("ads", "show");
        emit("opened");
        if (window.__crosswordQa.adOutcome === "rewarded")
          emit("earned_reward");
        emit("closed");
      },
    };
  },
};
