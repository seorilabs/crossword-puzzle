export type CrosswordQaState = {
  events: Array<{ source: string; name: string; params?: unknown }>;
  adOutcome: "rewarded" | "dismissed" | "error";
  authFailure: boolean;
  remoteConfigFailure: boolean;
  remoteConfigValues?: Record<string, boolean | number>;
  updateGate: { kind: string; message?: string };
  notificationPermission: number;
  storageFailure: boolean;
  safeArea: { top: number; bottom: number; left: number; right: number };
};
declare global {
  interface Window {
    __crosswordQa: CrosswordQaState;
  }
}
window.__crosswordQa ??= {
  events: [],
  adOutcome: "rewarded",
  authFailure: false,
  remoteConfigFailure: false,
  updateGate: { kind: "ok" },
  notificationPermission: 1,
  storageFailure: false,
  safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
};
export const record = (source: string, name: string, params?: unknown) =>
  window.__crosswordQa.events.push({ source, name, params });
