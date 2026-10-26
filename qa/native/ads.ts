import { record } from "../runtimeState";
export const MaxAdContentRating = { PG: "PG" };
export const TestIds = {
  REWARDED: "native-qa-rewarded",
  INTERSTITIAL: "native-qa-interstitial",
};
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
  LOADED: "loaded",
  OPENED: "opened",
  CLOSED: "closed",
  ERROR: "error",
};
export const InterstitialAd = {
  createForAdRequest: (adUnitId: string) => {
    const listeners = new Map<string, (value?: unknown) => void>();
    const emit = (name: string, value?: unknown) => listeners.get(name)?.(value);
    return {
      addAdEventListener(name: string, callback: (value?: unknown) => void) {
        listeners.set(name, callback);
        return () => {
          if (!window.__crosswordQa.interstitialLateLoad) listeners.delete(name);
        };
      },
      load() {
        record("ads", "interstitial_load", { adUnitId });
        const state = window.__crosswordQa;
        if (state.interstitialOutcome === "unready") return;
        setTimeout(() => {
          if (state.interstitialOutcome === "error") {
            emit("error", { code: "qa-interstitial-load-error" });
          } else {
            emit("loaded");
          }
        }, state.interstitialLoadDelayMs ?? 0);
      },
      async show() {
        record("ads", "interstitial_show", { adUnitId });
        const state = window.__crosswordQa;
        if (state.interstitialOutcome === "show-error") {
          throw new Error("qa-interstitial-show-error");
        }
        emit("opened");
        const close = () => {
          state.closeInterstitial = undefined;
          record("ads", "interstitial_closed", { adUnitId });
          emit("closed");
        };
        if (state.interstitialOutcome === "manual") state.closeInterstitial = close;
        else setTimeout(close, state.interstitialCloseDelayMs ?? 0);
      },
    };
  },
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
