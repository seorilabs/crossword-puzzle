import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  LEADERBOARD_SCORE_WEIGHTS,
  computeLeaderboardScore,
  shouldSubmitLeaderboardScore,
} from "./leaderboard.ts";
import type { LeaderboardSubmissionState } from "./leaderboard.ts";

describe("computeLeaderboardScore", () => {
  it("applies the documented formula", () => {
    // 10 단어 완료 + 남은 도전 3 - 힌트 2 = 10*1000 + 3*200 - 2*80 = 10440
    assert.equal(
      computeLeaderboardScore({
        completedWordCount: 10,
        remainingAttempts: 3,
        hintCount: 2,
      }),
      10 * LEADERBOARD_SCORE_WEIGHTS.completedWord +
        3 * LEADERBOARD_SCORE_WEIGHTS.remainingAttempt -
        2 * LEADERBOARD_SCORE_WEIGHTS.hint,
    );
    assert.equal(
      computeLeaderboardScore({
        completedWordCount: 10,
        remainingAttempts: 3,
        hintCount: 2,
      }),
      10440,
    );
  });

  it("clamps a negative result to 0", () => {
    assert.equal(
      computeLeaderboardScore({
        completedWordCount: 0,
        remainingAttempts: 0,
        hintCount: 5,
      }),
      0,
    );
  });

  it("normalizes negative / NaN / fractional inputs to non-negative integers", () => {
    assert.equal(
      computeLeaderboardScore({
        completedWordCount: -4,
        remainingAttempts: Number.NaN,
        hintCount: -2,
      }),
      0,
    );
    assert.equal(
      computeLeaderboardScore({
        completedWordCount: 5.9,
        remainingAttempts: 1.2,
        hintCount: 0,
      }),
      5 * LEADERBOARD_SCORE_WEIGHTS.completedWord +
        1 * LEADERBOARD_SCORE_WEIGHTS.remainingAttempt,
    );
  });
});

describe("shouldSubmitLeaderboardScore", () => {
  function createState(
    overrides: Partial<LeaderboardSubmissionState> = {},
  ): LeaderboardSubmissionState {
    return {
      completed: true,
      revealUsed: false,
      alreadySubmitted: false,
      ...overrides,
    };
  }

  it("submits exactly once for a clean completion", () => {
    assert.equal(shouldSubmitLeaderboardScore(createState()), true);
  });

  it("never submits an incomplete puzzle", () => {
    assert.equal(
      shouldSubmitLeaderboardScore(createState({ completed: false })),
      false,
    );
  });

  it("never submits when reveal was used", () => {
    assert.equal(
      shouldSubmitLeaderboardScore(createState({ revealUsed: true })),
      false,
    );
  });

  it("never submits twice for the same attempt", () => {
    assert.equal(
      shouldSubmitLeaderboardScore(createState({ alreadySubmitted: true })),
      false,
    );
  });
});
