import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { buildNextPuzzleCtaEvent } from "./recommendation.ts";
import type { PuzzleManifestItem } from "./types.ts";

const nextPuzzle: PuzzleManifestItem = {
  date: "2026-07-21",
  difficulty: "hard",
  puzzleId: "hard1",
};

describe("next_puzzle_cta telemetry 계약 (#274)", () => {
  it("AC-4: result_overlay 이벤트에 source와 다음 퍼즐 메타를 모두 기록한다", () => {
    assert.deepEqual(buildNextPuzzleCtaEvent(nextPuzzle, "result_overlay"), {
      name: "next_puzzle_cta",
      params: {
        next_difficulty: "hard",
        next_puzzle_id: "hard1",
        source: "result_overlay",
      },
    });
  });

  it("기존 결과 화면 CTA는 source=result_screen으로 구분한다", () => {
    assert.equal(
      buildNextPuzzleCtaEvent(nextPuzzle, "result_screen").params.source,
      "result_screen",
    );
  });
});
