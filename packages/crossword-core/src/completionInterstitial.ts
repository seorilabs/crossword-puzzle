export type InterstitialEvent =
  | "ad_opportunity"
  | "ad_requested"
  | "ad_shown"
  | "ad_impression"
  | "ad_closed"
  | "ad_failed"
  | "ad_skipped_disabled"
  | "ad_skipped_initial_wait"
  | "ad_skipped_interval"
  | "ad_skipped_session_cap"
  | "ad_skipped_daily_cap"
  | "ad_skipped_unready"
  | "ad_skipped_storage";
export type InterstitialPort = {
  preload(): void;
  ready(): boolean;
  show(onEvent: (event: InterstitialEvent) => void): Promise<void>;
  dispose(): void;
};
export type AdHistory = {
  version: 1;
  sessionStartedAt: number;
  lastActivityAt: number;
  activePlayMs: number;
  sessionImpressions: number;
  utcDay: string;
  dailyImpressions: number;
  lastClosedAt?: number;
};
export const AD_HISTORY_KEY = "crossword-completion-ad:history:v1";
export type TransitionStore = {
  consumed(puzzleId: string): Promise<boolean>;
  consume(puzzleId: string): Promise<void>;
  loadHistory(): Promise<AdHistory | null>;
  saveHistory(history: AdHistory): Promise<void>;
};
export type CompletionAdPolicy = {
  enabled: boolean;
  initialWaitMs: number;
  intervalMs: number;
  sessionCap: number;
  dailyCap: number;
};
export const defaultCompletionAdPolicy: CompletionAdPolicy = {
  enabled: true,
  initialWaitMs: 90000,
  intervalMs: 90000,
  sessionCap: 3,
  dailyCap: 10,
};
export function normalizeAdHistory(value: unknown, now: number): AdHistory {
  const day = new Date(now).toISOString().slice(0, 10);
  const v = value as AdHistory | null;
  if (
    !v ||
    v.version !== 1 ||
    ![
      v.sessionStartedAt,
      v.lastActivityAt,
      v.activePlayMs,
      v.sessionImpressions,
      v.dailyImpressions,
    ].every((x) => Number.isFinite(x) && x >= 0) ||
    typeof v.utcDay !== "string"
  ) {
    return {
      version: 1,
      sessionStartedAt: now,
      lastActivityAt: now,
      activePlayMs: 0,
      sessionImpressions: 0,
      utcDay: day,
      dailyImpressions: 0,
    };
  }
  const freshSession = now - v.lastActivityAt >= 30 * 60000;
  return {
    ...v,
    ...(freshSession
      ? { sessionStartedAt: now, activePlayMs: 0, sessionImpressions: 0 }
      : {}),
    ...(v.utcDay !== day ? { utcDay: day, dailyImpressions: 0 } : {}),
  };
}

// Completion is the sole ad opportunity. Visiting/leaving a result never calls this.
export function createCompletionTransition(
  ad: InterstitialPort,
  store: TransitionStore,
  track: (event: InterstitialEvent) => void,
  policy: CompletionAdPolicy = defaultCompletionAdPolicy,
  now: () => number = Date.now,
) {
  let busy = false;
  let previousTick: number | undefined;
  let wasPlaying = false;
  let queue: Promise<unknown> = Promise.resolve();
  const consumed = new Set<string>();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const task = queue.then(work);
    queue = task.catch(() => {});
    return task;
  };
  return {
    // Call at foreground/play/pause transitions as well as the foreground timer.
    activity(playing: boolean, foreground = true) {
      const at = now();
      const delta =
        wasPlaying && previousTick != null ? Math.max(0, at - previousTick) : 0;
      previousTick = at;
      wasPlaying = foreground && playing;
      return serial(async () => {
        const state = normalizeAdHistory(await store.loadHistory(), at);
        // A background callback ends the current active interval; background time never counts.
        state.activePlayMs += delta;
        if (foreground) state.lastActivityAt = at;
        await store.saveHistory(state);
      });
    },
    async complete(
      puzzleId: string,
      saveCompleted: () => Promise<void>,
      isCurrent: () => boolean = () => true,
    ) {
      if (busy || consumed.has(puzzleId)) return;
      busy = true;
      try {
        await saveCompleted();
        consumed.add(puzzleId);
        let state: AdHistory;
        try {
          await queue;
          if (await store.consumed(puzzleId)) return;
          await store.consume(puzzleId);
          state = normalizeAdHistory(await store.loadHistory(), now());
          await store.saveHistory(state);
        } catch {
          track("ad_skipped_storage");
          return;
        }
        if (!isCurrent()) return;
        track("ad_opportunity");
        const skip = !policy.enabled
          ? "ad_skipped_disabled"
          : state.activePlayMs < policy.initialWaitMs
            ? "ad_skipped_initial_wait"
            : state.lastClosedAt != null &&
                now() - state.lastClosedAt < policy.intervalMs
              ? "ad_skipped_interval"
              : state.dailyImpressions >= policy.dailyCap
                ? "ad_skipped_daily_cap"
                : state.sessionImpressions >= policy.sessionCap
                  ? "ad_skipped_session_cap"
                  : !ad.ready()
                    ? "ad_skipped_unready"
                    : undefined;
        if (skip) {
          track(skip);
          return;
        }
        track("ad_requested");
        let shown = false,
          impression = false,
          counted = false,
          closed = false,
          settled = false;
        try {
          await ad.show((event) => {
            if (settled) return;
            if (event === "ad_shown") {
              if (shown) return;
              shown = true;
            }
            if (event === "ad_impression") {
              if (impression) return;
              impression = true;
            }
            if (
              (event === "ad_shown" || event === "ad_impression") &&
              !counted
            ) {
              counted = true;
              // Persist counters before another completion can be considered.
              void serial(async () => {
                const h = normalizeAdHistory(await store.loadHistory(), now());
                h.sessionImpressions++;
                h.dailyImpressions++;
                await store.saveHistory(h);
              }).catch(() => track("ad_skipped_storage"));
            }
            if (event === "ad_closed") {
              if (closed) return;
              closed = true;
              void serial(async () => {
                const h = normalizeAdHistory(await store.loadHistory(), now());
                h.lastClosedAt = now();
                h.lastActivityAt = now();
                await store.saveHistory(h);
              }).catch(() => track("ad_skipped_storage"));
            }
            track(event);
          });
        } catch {
          track("ad_failed");
        } finally {
          settled = true;
          await queue;
        }
      } finally {
        busy = false;
        ad.preload();
      }
    },
  };
}
