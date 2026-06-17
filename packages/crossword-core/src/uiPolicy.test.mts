import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  getOpenPuzzleSummariesForDate,
  getPuzzleDailySequenceNumber,
} from "./uiPolicy.ts";
import type { PuzzleManifestItem } from "./types.ts";

function createSummary(
  puzzleId: string,
  overrides: Partial<PuzzleManifestItem> = {},
): PuzzleManifestItem {
  return {
    date: "2026-06-12",
    path: `/puzzles/${puzzleId}.json`,
    puzzleId,
    ...overrides,
  };
}

describe("getOpenPuzzleSummariesForDate", () => {
  const now = Date.parse("2026-06-12T02:00:00.000Z");

  it("excludes unpublished same-day remote slots from the open puzzle rail", () => {
    const dailyFreeSummary = createSummary("published-default", {
      publishedAt: "2026-06-11T15:00:00.000Z",
      slotId: "2026-06-12-h00",
    });
    const futureUnlocked = createSummary("future-bonus", {
      publishedAt: "2026-06-12T13:00:00.000Z",
      slotId: "2026-06-12-h22",
    });
    const futureSelected = createSummary("future-selected", {
      publishedAt: "2026-06-12T11:00:00.000Z",
      slotId: "2026-06-12-h20",
    });

    const result = getOpenPuzzleSummariesForDate({
      archivePuzzleSummaries: [],
      date: "2026-06-12",
      dailyFreeSummary,
      now,
      selectedPuzzleSummary: futureSelected,
      unlockedBonusSummaries: [futureUnlocked],
    });

    assert.deepEqual(
      result.map((summary) => summary.puzzleId),
      ["published-default"],
    );
  });

  it("keeps archived same-day records even when their publishedAt is in the future", () => {
    const archivedFuture = createSummary("archived-future", {
      publishedAt: "2026-06-12T13:00:00.000Z",
      slotId: "2026-06-12-h22",
    });

    const result = getOpenPuzzleSummariesForDate({
      archivePuzzleSummaries: [archivedFuture],
      date: "2026-06-12",
      now,
      unlockedBonusSummaries: [],
    });

    assert.deepEqual(
      result.map((summary) => summary.puzzleId),
      ["archived-future"],
    );
  });

  it("fills missing duplicate metadata without letting lower-priority records overwrite it", () => {
    const selectedSummary = createSummary("same-puzzle", {
      path: "",
    });
    const unlockedSummary = createSummary("same-puzzle", {
      publishedAt: "2026-06-12T01:00:00.000Z",
      slotId: "2026-06-12-h10",
    });
    const archivedSummary = createSummary("same-puzzle", {
      publishedAt: "2026-06-12T13:00:00.000Z",
      slotId: "2026-06-12-h22",
    });

    const result = getOpenPuzzleSummariesForDate({
      archivePuzzleSummaries: [archivedSummary],
      date: "2026-06-12",
      now,
      selectedPuzzleSummary: selectedSummary,
      unlockedBonusSummaries: [unlockedSummary],
    });

    assert.equal(result.length, 1);
    assert.equal(result[0]?.puzzleId, "same-puzzle");
    assert.equal(result[0]?.slotId, "2026-06-12-h10");
    assert.equal(result[0]?.path, "/puzzles/same-puzzle.json");
    assert.equal(getPuzzleDailySequenceNumber(result[0]!), 6);
  });
});
