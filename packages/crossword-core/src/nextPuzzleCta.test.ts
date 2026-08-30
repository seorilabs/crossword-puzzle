import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { buildNextPuzzleCtaEvent } from "./recommendation.ts";
import type { PuzzleManifestItem } from "./types.ts";

const nextPuzzle: PuzzleManifestItem = {
  date: "2026-07-21",
  difficulty: "hard",
  puzzleId: "hard1",
  path: "packs/hard1.json",
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

  it("숫자형 next_puzzle_id도 문자열로 정규화한다 (#351)", () => {
    const numeric = {
      ...nextPuzzle,
      puzzleId: 26082100,
    } as unknown as PuzzleManifestItem;

    assert.equal(
      buildNextPuzzleCtaEvent(numeric, "result_overlay").params.next_puzzle_id,
      "26082100",
    );
  });
});
