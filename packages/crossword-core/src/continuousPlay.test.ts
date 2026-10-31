import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allAvailablePuzzlesCompleted,
  getEmptyPuzzleMessage,
  selectPlayablePuzzle,
} from "./continuousPlay.ts";
import type { PuzzleManifestItem } from "./types.ts";
const row = (
  id: string,
  date = "2026-10-31",
  dailySequence = 1,
  language: "ko" | "en" = "en",
): PuzzleManifestItem => ({
  puzzleId: id,
  date,
  dailySequence,
  language,
  path: id + ".json",
});
test("offline completion of the last cached board never claims all puzzles are complete", () => {
  const cached = [row("first")];
  assert.equal(
    getEmptyPuzzleMessage(cached, {}, "en", "2026-10-31", {
      offline: true,
      justCompletedId: "first",
    }),
    "오프라인에서 풀 수 있는 판이 없어요.",
  );
  assert.equal(
    getEmptyPuzzleMessage(
      cached,
      { first: { completedAt: "x" } },
      "en",
      "2026-10-31",
      { offline: true },
    ),
    "오프라인에서 풀 수 있는 판이 없어요.",
  );
});
test("online empty results still distinguish completion, exhaustion and unpublished supply", () => {
  assert.equal(
    getEmptyPuzzleMessage([row("last")], {}, "en", "2026-10-31", {
      offline: false,
      justCompletedId: "last",
    }),
    "모든 판을 완성했어요",
  );
  assert.equal(
    getEmptyPuzzleMessage(
      [row("exhausted")],
      { exhausted: { attemptsUsed: 3 } },
      "en",
      "2026-10-31",
      { offline: false },
    ),
    "지금 풀 수 있는 판이 없어요.",
  );
  assert.equal(
    getEmptyPuzzleMessage([], {}, "en", "2026-10-31", { offline: false }),
    "지금 풀 수 있는 판이 없어요.",
  );
});
test("unfinished progress precedes today; date and sequence order are deterministic", () => {
  const rows = [
    row("old2", "2026-10-30", 2),
    row("today2", undefined, 2),
    row("old1", "2026-10-30"),
    row("today1"),
  ];
  assert.equal(
    selectPlayablePuzzle(
      rows,
      { old2: { hasProgress: true, attemptsUsed: 1 } },
      "en",
      "2026-10-31",
    )?.puzzleId,
    "old2",
  );
  assert.equal(
    selectPlayablePuzzle(rows, {}, "en", "2026-10-31")?.puzzleId,
    "today1",
  );
  assert.equal(
    selectPlayablePuzzle(
      rows,
      { today1: { completedAt: "x" }, today2: { completedAt: "x" } },
      "en",
      "2026-10-31",
    )?.puzzleId,
    "old1",
  );
});
test("completed, exhausted, future, other language and explicitly excluded rows cannot be recommended", () => {
  const rows = [
    row("complete"),
    row("exhausted"),
    row("future", "2026-11-01"),
    row("ko", undefined, 1, "ko"),
    row("excluded"),
    row("old", "2026-10-29"),
  ];
  assert.equal(
    selectPlayablePuzzle(
      rows,
      {
        complete: { completedAt: "x" },
        exhausted: { attemptsUsed: 3, maxAttempts: 3 },
      },
      "en",
      "2026-10-31",
      "excluded",
    )?.puzzleId,
    "old",
  );
  assert.equal(
    selectPlayablePuzzle(
      [row("done")],
      { done: { completedAt: "x" } },
      "en",
      "2026-10-31",
    ),
    undefined,
  );
});
test("completion selection is independent of a 30-record archive window", () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    row("done" + i, "2026-10-30", i + 1),
  );
  const states = Object.fromEntries(
    rows.map((x) => [x.puzzleId, { completedAt: "x" }]),
  );
  assert.equal(
    selectPlayablePuzzle(
      [...rows, row("remaining", "2026-10-29")],
      states,
      "en",
      "2026-10-31",
    )?.puzzleId,
    "remaining",
  );
});

test("unavailable and exhausted puzzles are not described as completed", () => {
  const today = "2026-10-31";
  assert.equal(allAvailablePuzzlesCompleted([], {}, "en", today), false);
  assert.equal(
    allAvailablePuzzlesCompleted(
      [row("future", "2026-11-01"), row("ko", undefined, 1, "ko")],
      {},
      "en",
      today,
    ),
    false,
  );
  const rows = [row("today"), row("past", "2026-10-30")];
  assert.equal(
    allAvailablePuzzlesCompleted(
      rows,
      {
        today: { completedAt: "x" },
        past: { attemptsUsed: 3, maxAttempts: 3 },
      },
      "en",
      today,
    ),
    false,
  );
  assert.equal(
    allAvailablePuzzlesCompleted(
      rows,
      { today: { completedAt: "x" }, past: { completedAt: "x" } },
      "en",
      today,
    ),
    true,
  );
  assert.equal(
    allAvailablePuzzlesCompleted(
      rows,
      { past: { completedAt: "x" } },
      "en",
      today,
      "today",
    ),
    true,
  );
});
