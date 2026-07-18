import type { GameDomainEvent } from "./gameController.ts";

export type GameFeedbackCue =
  | "cell-commit"
  | "incorrect"
  | "word-complete"
  | "intersection-chain"
  | "board-complete";

export type GameFeedbackHaptic = "light" | "warning" | "success" | "heavy";

export type GameFeedbackSettings = Readonly<{
  sfxEnabled: boolean;
  hapticEnabled: boolean;
}>;

export type GameFeedbackAction = Readonly<{
  cue: GameFeedbackCue;
  commandSequence: number;
  durationMs: number;
  playSound: boolean;
  haptic: GameFeedbackHaptic | null;
}>;

const FEEDBACK_BUDGETS = Object.freeze({
  "cell-commit": Object.freeze({ durationMs: 80, haptic: null }),
  incorrect: Object.freeze({ durationMs: 180, haptic: "warning" }),
  "word-complete": Object.freeze({ durationMs: 450, haptic: "success" }),
  "intersection-chain": Object.freeze({ durationMs: 700, haptic: "light" }),
  "board-complete": Object.freeze({ durationMs: 2_000, haptic: "heavy" }),
}) satisfies Readonly<
  Record<
    GameFeedbackCue,
    Readonly<{
      durationMs: number;
      haptic: GameFeedbackHaptic | null;
    }>
  >
>;

function actionForCue(
  cue: GameFeedbackCue,
  commandSequence: number,
  settings: GameFeedbackSettings,
): GameFeedbackAction {
  const budget = FEEDBACK_BUDGETS[cue];
  return Object.freeze({
    cue,
    commandSequence,
    durationMs: budget.durationMs,
    playSound: settings.sfxEnabled,
    haptic: settings.hapticEnabled ? budget.haptic : null,
  });
}

/**
 * 한 dispatch에서 의미가 가장 강한 피드백 하나만 고른다. 정답/오답 판정과
 * 함께 발생하는 input committed는 종이 탭을 중복 재생하지 않는다.
 */
export function projectGameFeedbackActions(
  events: readonly GameDomainEvent[],
  settings: GameFeedbackSettings,
): readonly GameFeedbackAction[] {
  if (events.some((event) => event.type === "game.board.resolved")) {
    const event = events.find(
      (candidate) => candidate.type === "game.board.resolved",
    );
    return Object.freeze([
      actionForCue("board-complete", event?.commandSequence ?? 0, settings),
    ]);
  }

  if (events.some((event) => event.type === "game.entry.incorrect")) {
    const event = events.find(
      (candidate) => candidate.type === "game.entry.incorrect",
    );
    return Object.freeze([
      actionForCue("incorrect", event?.commandSequence ?? 0, settings),
    ]);
  }

  const resolved = events.find(
    (
      event,
    ): event is Extract<GameDomainEvent, { type: "game.word.resolved" }> =>
      event.type === "game.word.resolved",
  );
  if (resolved != null) {
    return Object.freeze([
      actionForCue(
        resolved.entryIds.length > 1 ? "intersection-chain" : "word-complete",
        resolved.commandSequence,
        settings,
      ),
    ]);
  }

  if (events.some((event) => event.type === "game.input.committed")) {
    const event = events.find(
      (candidate) => candidate.type === "game.input.committed",
    );
    return Object.freeze([
      actionForCue("cell-commit", event?.commandSequence ?? 0, settings),
    ]);
  }

  return Object.freeze([]);
}
