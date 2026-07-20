import { it } from "node:test";
import { strict as assert } from "node:assert";

import { getNextRecommendedPuzzleSummary } from "./recommendation.ts";

it("발행 팩의 normal 완료 후 실제 hard 후보를 추천한다 (#151)", () => {
  const summaries = [
    {
      puzzleId: "26060110",
      date: "2026-06-01",
      path: "/puzzles/26060110.json",
      difficulty: "easy" as const,
    },
    {
      puzzleId: "2026-05-31-normal-07",
      date: "2026-05-31",
      path: "/puzzles/2026-05-31-normal-07.json",
      difficulty: "normal" as const,
    },
    {
      puzzleId: "26060114",
      date: "2026-06-01",
      path: "/puzzles/26060114.json",
      difficulty: "hard" as const,
    },
  ];

  const next = getNextRecommendedPuzzleSummary(summaries, new Set(), {
    puzzleId: "2026-05-31-normal-07",
    difficulty: "normal",
  });

  assert.equal(next?.puzzleId, "26060114");
  assert.equal(next?.difficulty, "hard");
});
