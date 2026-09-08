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

  it("오늘의 워밍업(easy)을 끝내면 두 표면 모두 오늘의 퍼즐(hard)을 추천한다", () => {
    const manifest = [
      summary("today-easy", "2026-08-30", "easy"),
      summary("today-hard", "2026-08-30"),
      summary("older-1", "2026-08-29"),
    ];
    const current = { difficulty: "easy" as const, puzzleId: "today-easy" };
    const completed = new Set(["today-easy"]);

    // Web 은 온보딩 퍼즐 ID 를 넘기고, RN 은 온보딩 퍼즐이 없어 넘기지 않는다.
    const webResult = getNextRecommendedPuzzleSummary(manifest, completed, current, {
      onboardingRampEnabled: true,
      onboardingPuzzleId: "onboarding-easy-01",
    });
    const rnResult = getNextRecommendedPuzzleSummary(manifest, completed, current, {
      onboardingRampEnabled: true,
    });

    assert.equal(webResult?.puzzleId, "today-hard");
    assert.equal(rnResult?.puzzleId, webResult?.puzzleId);
  });
});
