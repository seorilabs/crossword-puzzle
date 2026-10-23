import { record } from "../runtimeState";
export default () => ({
  async logEvent(name: string, params: unknown) {
    record("firebase", name, params);
  },
  async logScreenView(params: unknown) {
    record("firebase", "screen_view", params);
  },
});
