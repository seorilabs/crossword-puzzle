export const USAGE_STATISTICS_KEY = "crossword-puzzle:usage-statistics:v1";

export type UsageStatisticsState = {
  enabled: boolean;
  ready: boolean;
  busy: boolean;
  error: "storage" | "sdk" | null;
};

/** 저장 복원 전과 SDK 적용 전에는 앱의 분석 이벤트를 보내지 않는다. */
export function createUsageStatisticsPreference(adapter: {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  apply(enabled: boolean): Promise<void>;
}) {
  let state: UsageStatisticsState = {
    enabled: false,
    ready: false,
    busy: false,
    error: null,
  };
  let configured = false;
  let initialization: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  function update(next: UsageStatisticsState) {
    state = next;
    listeners.forEach((listener) => listener());
  }
  async function apply(enabled: boolean, error: UsageStatisticsState["error"]) {
    try {
      await adapter.apply(enabled);
      configured = true;
    } catch {
      configured = false;
      error ??= "sdk";
    }
    update({ enabled, ready: true, busy: false, error });
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    canTrack: () => state.ready && !state.busy && configured && state.enabled,
    initialize() {
      initialization ??= (async () => {
        let enabled = false;
        let error: UsageStatisticsState["error"] = null;
        try {
          const stored = await adapter.read();
          enabled = stored === null || stored === "1";
        } catch {
          error = "storage";
        }
        await apply(enabled, error);
      })();
      return initialization;
    },
    async setEnabled(enabled: boolean) {
      if (!state.ready || state.busy) return;
      // 끄기 입력은 비동기 저장을 기다리지 않고 모든 앱 이벤트를 막는다.
      update({ enabled, ready: true, busy: true, error: null });
      let error: UsageStatisticsState["error"] = null;
      try {
        await adapter.write(enabled ? "1" : "0");
      } catch {
        error = "storage";
      }
      await apply(enabled, error);
    },
  };
}
