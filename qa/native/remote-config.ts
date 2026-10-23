import "../runtimeState";
const values: Record<string, unknown> = {};
export default () => ({
  async setConfigSettings() {},
  async setDefaults(defaults: Record<string, unknown>) {
    Object.assign(values, defaults);
  },
  async fetchAndActivate() {
    if (window.__crosswordQa.remoteConfigFailure)
      throw new Error("qa-remote-config-unavailable");
    return true;
  },
  getValue(key: string) {
    return {
      asNumber: () =>
        Number(window.__crosswordQa.remoteConfigValues?.[key] ?? values[key]),
      asBoolean: () =>
        Boolean(window.__crosswordQa.remoteConfigValues?.[key] ?? values[key]),
      asString: () =>
        String(
          window.__crosswordQa.remoteConfigValues?.[key] ?? values[key] ?? "",
        ),
    };
  },
});
