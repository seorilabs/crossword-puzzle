import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getNextRecommendedPuzzleSummary } from "./recommendation.ts";
import type { PuzzleManifestItem } from "./types.ts";
import { uniquePuzzleSummaries } from "./uiPolicy.ts";

function summary(
  puzzleId: string,
  date: string,
  difficulty: PuzzleManifestItem["difficulty"] = "hard",
): PuzzleManifestItem {
  return {
    date,
    difficulty,
    path: `/puzzles/${puzzleId}.json`,
    puzzleId,
  };
}

describe("Web·RN 다음 퍼즐 추천 표면 parity (#347)", () => {
  it("같은 manifest·완료 목록·현재 퍼즐이면 과거 미완료 추천 결과가 같다", () => {
    const manifest = [
      summary("today-1", "2026-08-30"),
      summary("today-2", "2026-08-30"),
      summary("older-1", "2026-08-29"),
    ];
    const completed = new Set(["today-1", "today-2"]);
    const current = {
      difficulty: "hard" as const,
      puzzleId: "today-1",
    };

    const webResult = getNextRecommendedPuzzleSummary(
      manifest,
      completed,
      current,
    );
    const rnCandidates = uniquePuzzleSummaries([
      ...manifest,
      summary("local-only-completed", "2026-08-28"),
    ]);
    const rnResult = getNextRecommendedPuzzleSummary(
      rnCandidates,
      new Set([...completed, "local-only-completed"]),
      current,
    );

    assert.equal(webResult?.puzzleId, "older-1");
    assert.equal(rnResult?.puzzleId, webResult?.puzzleId);
  });
});
