import type {
  GameAnalyticsSink,
  GameRuntimeAnalyticsPort,
} from "../../packages/crossword-core/src";

/** AIT/Web adapter: fan out one canonical v2 event without changing payload. */
export function createWebGameRuntimeAnalyticsPort(
  sinks: readonly GameAnalyticsSink[],
): GameRuntimeAnalyticsPort {
  return Object.freeze({
    log(event) {
      for (const sink of sinks) {
        try {
          sink.logGameEvent(event.name, event.params);
        } catch {
          // Analytics is fire-and-forget and must not interrupt the board.
        }
      }
    },
  });
}
