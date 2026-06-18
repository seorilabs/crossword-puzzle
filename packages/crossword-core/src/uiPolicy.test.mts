import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  getDailyFreePuzzleSummary,
  getOpenPuzzleSummariesForDate,
  getPuzzleDailySequenceNumber,
  getPuzzlePackAlias,
  isPublishedPuzzle,
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

  it("uses slotId when publishedAt is missing to exclude future remote slots", () => {
    const currentSlot = createSummary("current-slot", {
      publishedAt: undefined,
      slotId: "2026-06-12-h10",
    });
    const futureSlot = createSummary("future-slot", {
      publishedAt: undefined,
      slotId: "2026-06-12-h12",
    });

    const result = getOpenPuzzleSummariesForDate({
      archivePuzzleSummaries: [],
      date: "2026-06-12",
      dailyFreeSummary: currentSlot,
      now,
      unlockedBonusSummaries: [futureSlot],
    });

    assert.deepEqual(
      result.map((summary) => summary.puzzleId),
      ["current-slot"],
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

describe("isPublishedPuzzle", () => {
  const now = Date.parse("2026-06-12T10:00:00.000Z");

  it("returns true when publishedAt is absent", () => {
    assert.equal(isPublishedPuzzle(createSummary("p1"), now), true);
  });

  it("returns true when publishedAt is in the past", () => {
    assert.equal(
      isPublishedPuzzle(createSummary("p2", { publishedAt: "2026-06-12T09:00:00.000Z" }), now),
      true,
    );
  });

  it("returns false when publishedAt is in the future", () => {
    assert.equal(
      isPublishedPuzzle(createSummary("p3", { publishedAt: "2026-06-12T11:00:00.000Z" }), now),
      false,
    );
  });

  it("falls back to slotId hour when publishedAt is absent", () => {
    // slotId "2026-06-12-h08" → 08:00 KST = 23:00 UTC previous day = before now
    assert.equal(
      isPublishedPuzzle(createSummary("p4", { slotId: "2026-06-12-h08" }), now),
      true,
    );
    // slotId "2026-06-12-h20" → 20:00 KST = 11:00 UTC = after now
    assert.equal(
      isPublishedPuzzle(createSummary("p5", { slotId: "2026-06-12-h20" }), now),
      false,
    );
  });
});

describe("getPuzzlePackAlias", () => {
  it("uses explicit alias when provided", () => {
    assert.equal(getPuzzlePackAlias({ alias: "my-alias" }), "my-alias");
  });

  it("normalizes slotId to compact YYMMDDH2 alias", () => {
    assert.equal(getPuzzlePackAlias({ slotId: "2026-06-12-h10" }), "260612" + "10");
  });

  it("derives alias from publishedAt in Seoul time", () => {
    // 2026-06-12T01:00:00Z = 2026-06-12T10:00:00+09:00
    const alias = getPuzzlePackAlias({ publishedAt: "2026-06-12T01:00:00.000Z" });
    assert.equal(alias, "26061210");
  });

  it("normalizes pack-YYYYMMDDHHMMSS packId", () => {
    assert.equal(getPuzzlePackAlias({ packId: "pack-20260612100000" }), "26061210");
  });

  it("falls back to date-based alias", () => {
    assert.equal(getPuzzlePackAlias({ date: "2026-06-12" }), "260612");
  });
});

describe("getDailyFreePuzzleSummary", () => {
  const today = "2026-06-12";
  const now = Date.parse("2026-06-12T02:00:00.000Z");

  it("returns the earliest published puzzle for today", () => {
    const early = createSummary("early", { date: today, publishedAt: "2026-06-12T00:00:00.000Z", slotId: "2026-06-12-h00" });
    const late = createSummary("late", { date: today, publishedAt: "2026-06-12T01:00:00.000Z", slotId: "2026-06-12-h02" });

    const result = getDailyFreePuzzleSummary([late, early], today, now);
    assert.equal(result?.puzzleId, "early");
  });

  it("falls back to the most recent past date when no today puzzle exists", () => {
    const yesterday = createSummary("yesterday", { date: "2026-06-11", publishedAt: "2026-06-11T00:00:00.000Z" });
    const twoDaysAgo = createSummary("two-days-ago", { date: "2026-06-10", publishedAt: "2026-06-10T00:00:00.000Z" });

    const result = getDailyFreePuzzleSummary([twoDaysAgo, yesterday], today, now);
    assert.equal(result?.puzzleId, "yesterday");
  });

  it("excludes future puzzles even when on today's date", () => {
    const past = createSummary("past", { date: today, publishedAt: "2026-06-12T01:00:00.000Z" });
    const future = createSummary("future", { date: today, publishedAt: "2026-06-12T03:00:00.000Z" });

    const result = getDailyFreePuzzleSummary([past, future], today, now);
    assert.equal(result?.puzzleId, "past");
  });
});
