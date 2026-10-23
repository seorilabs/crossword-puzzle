import { record } from "../runtimeState";
export default () => ({
  async setConsent(consent: unknown) {
    record("firebase-config", "consent", consent);
  },
  async setAnalyticsCollectionEnabled(enabled: boolean) {
    record("firebase-config", "collection", { enabled });
  },
  async logEvent(name: string, params: unknown) {
    record("firebase", name, params);
  },
  async logScreenView(params: unknown) {
    record("firebase", "screen_view", params);
  },
});
