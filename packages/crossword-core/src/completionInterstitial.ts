export type InterstitialEvent =
  | "ad_requested"
  | "ad_impression"
  | "ad_closed"
  | "ad_failed";
export type InterstitialPort = {
  preload(): void;
  ready(): boolean;
  show(onEvent: (event: InterstitialEvent) => void): Promise<void>;
  dispose(): void;
};
export type TransitionStore = {
  consumed(puzzleId: string): Promise<boolean>;
  consume(puzzleId: string): Promise<void>;
};
// Persist the opportunity before showing so reopening a result never repeats it.
// Only an already loaded ad may show. Loading never schedules a future show.
export function createCompletionTransition(
  ad: InterstitialPort,
  store: TransitionStore,
  track: (event: InterstitialEvent) => void,
) {
  let busy = false;
  const consumed = new Set<string>();
  return {
    async leave(
      puzzleId: string,
      completed: boolean,
      navigate: () => void | Promise<void>,
      saveCompleted: () => Promise<void> = async () => {},
    ) {
      if (busy) return;
      busy = true;
      try {
        if (completed) await saveCompleted();
        if (completed && !consumed.has(puzzleId)) {
          consumed.add(puzzleId);
          let saved = false;
          try {
            if (!(await store.consumed(puzzleId))) {
              await store.consume(puzzleId);
              saved = true;
            }
          } catch {
            track("ad_failed");
          }
          if (saved) {
            track("ad_requested");
            if (ad.ready()) {
              try {
                await ad.show(track);
              } catch {
                track("ad_failed");
              }
            } else track("ad_failed");
          }
        }
        await navigate();
      } finally {
        busy = false;
        ad.preload();
      }
    },
  };
}
