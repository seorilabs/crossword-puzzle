import { it } from "node:test";
import { strict as assert } from "node:assert";

import { getNextRecommendedPuzzleSummary } from "./recommendation.ts";

// 퍼즐 ID에 normal 이 남아 있는 것은 2단계 전환 전 발행분(현재는 hard 로 분류)이다.
it("레거시 ID 퍼즐(hard) 완료 후 실제 hard 후보를 추천한다 (#151)", () => {
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
      difficulty: "hard" as const,
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
    difficulty: "hard",
  });

  assert.equal(next?.puzzleId, "26060114");
  assert.equal(next?.difficulty, "hard");
});
