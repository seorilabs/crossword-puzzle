import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { GameFeedbackCue } from "../../packages/crossword-core/src/gameFeedback.ts";
import { getGameFeedbackTonePlan } from "./gameFeedbackRuntime.ts";

const BUDGETS: Readonly<Record<GameFeedbackCue, number>> = Object.freeze({
  "cell-commit": 80,
  incorrect: 180,
  "word-complete": 450,
  "intersection-chain": 700,
  "board-complete": 2_000,
});

describe("procedural game feedback tone plans", () => {
  it("모든 cue가 문서 시간 예산 안에서 끝난다", () => {
    for (const [cue, budget] of Object.entries(BUDGETS) as [
      GameFeedbackCue,
      number,
    ][]) {
      const plan = getGameFeedbackTonePlan(cue);
      assert.ok(plan.length > 0);
      const end = Math.max(
        ...plan.map((step) => step.offsetMs + step.durationMs),
      );
      assert.ok(end <= budget, `${cue} ${end}ms > ${budget}ms`);
    }
  });

  it("오답은 낮은 단음, 단어·연쇄·보드는 상승 동기를 사용한다", () => {
    assert.equal(getGameFeedbackTonePlan("incorrect").length, 1);
    for (const cue of [
      "word-complete",
      "intersection-chain",
      "board-complete",
    ] as const) {
      const frequencies = getGameFeedbackTonePlan(cue).map(
        (step) => step.frequencyHz,
      );
      assert.ok(frequencies.length >= 3);
      assert.ok(
        frequencies.every(
          (frequency, index) =>
            index === 0 || frequency > frequencies[index - 1],
        ),
      );
    }
  });
});
