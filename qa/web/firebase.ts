import { record } from "../runtimeState";
const app = { name: "qa" };
export const getApps = () => [app];
export const initializeApp = () => app;
export const isSupported = async () => true;
export const getAnalytics = () => ({});
export const logEvent = (_analytics: unknown, name: string, params: unknown) =>
  record("firebase", name, params);
export const getRemoteConfig = () => ({
  settings: {},
  defaultConfig: {} as Record<string, unknown>,
});
export const fetchAndActivate = async () => {
  if (window.__crosswordQa.remoteConfigFailure)
    throw new Error("qa-config-unavailable");
  return true;
};
export const getBoolean = (
  config: { defaultConfig: Record<string, unknown> },
  key: string,
) =>
  Boolean(
    window.__crosswordQa.remoteConfigValues?.[key] ?? config.defaultConfig[key],
  );
export const getNumber = (
  config: { defaultConfig: Record<string, unknown> },
  key: string,
) =>
  Number(
    window.__crosswordQa.remoteConfigValues?.[key] ?? config.defaultConfig[key],
  );
const user = {
  uid: "native-qa-user",
  getIdToken: async () => "qa-fixture-id-token",
};
export const getAuth = () => ({
  currentUser: user,
  authStateReady: async () => {},
});
export const signInWithCustomToken = async () => {
  if (window.__crosswordQa.authFailure) throw new Error("qa-auth-unavailable");
  return { user };
};
