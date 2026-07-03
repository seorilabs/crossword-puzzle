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

  it("exposes time-bonus weights", () => {
    assert.equal(typeof LEADERBOARD_SCORE_WEIGHTS.timeBonusBase, "number");
    assert.equal(typeof LEADERBOARD_SCORE_WEIGHTS.timeDecayPerSecond, "number");
    assert.ok(LEADERBOARD_SCORE_WEIGHTS.timeBonusBase > 0);
    assert.ok(LEADERBOARD_SCORE_WEIGHTS.timeDecayPerSecond > 0);
  });

  it("stays backward compatible when elapsedSeconds is omitted", () => {
    const base = {
      completedWordCount: 10,
      remainingAttempts: 3,
      hintCount: 2,
    };
    // elapsedSeconds 미제공 ⇒ 기존 산식과 동일(시간 보너스 0)
    assert.equal(computeLeaderboardScore(base), 10440);
    assert.equal(
      computeLeaderboardScore({ ...base, elapsedSeconds: undefined }),
      computeLeaderboardScore(base),
    );
  });

  it("rewards a faster completion with a higher score", () => {
    const base = {
      completedWordCount: 10,
      remainingAttempts: 3,
      hintCount: 2,
    };
    const fast = computeLeaderboardScore({ ...base, elapsedSeconds: 30 });
    const slow = computeLeaderboardScore({ ...base, elapsedSeconds: 120 });
    assert.ok(
      fast > slow,
      `더 짧은 시간이 더 높은 점수여야 한다 (fast=${fast}, slow=${slow})`,
    );
    // 동일 단어/도전/힌트라면 시간만으로 동점이 갈린다(변별력 확보).
    assert.notEqual(fast, slow);
    // 빠른 완료는 elapsed 미제공(보너스 0)보다 높다.
    assert.ok(fast > computeLeaderboardScore(base));
  });

  it("computes the time bonus as max(0, base - elapsed*decay)", () => {
    const base = {
      completedWordCount: 10,
      remainingAttempts: 3,
      hintCount: 2,
    };
    const elapsedSeconds = 100;
    const expectedBonus = Math.max(
      0,
      LEADERBOARD_SCORE_WEIGHTS.timeBonusBase -
        elapsedSeconds * LEADERBOARD_SCORE_WEIGHTS.timeDecayPerSecond,
    );
    assert.equal(
      computeLeaderboardScore({ ...base, elapsedSeconds }),
      10440 + expectedBonus,
    );
    // elapsed 0초 ⇒ 보너스 최댓값(base) 부여
    assert.equal(
      computeLeaderboardScore({ ...base, elapsedSeconds: 0 }),
      10440 + LEADERBOARD_SCORE_WEIGHTS.timeBonusBase,
    );
  });

  it("never lets the time bonus go negative for slow completions", () => {
    const base = {
      completedWordCount: 10,
      remainingAttempts: 3,
      hintCount: 2,
    };
    // 보너스 소진 임계를 한참 넘긴 풀이 시간 ⇒ 감점 없이 기존 점수 그대로.
    const slowElapsed =
      LEADERBOARD_SCORE_WEIGHTS.timeBonusBase /
        LEADERBOARD_SCORE_WEIGHTS.timeDecayPerSecond +
      10_000;
    assert.equal(
      computeLeaderboardScore({ ...base, elapsedSeconds: slowElapsed }),
      10440,
    );
  });

  it("treats invalid elapsedSeconds as no bonus (not max bonus)", () => {
    const base = {
      completedWordCount: 10,
      remainingAttempts: 3,
      hintCount: 2,
    };
    for (const elapsedSeconds of [Number.NaN, -5, Number.POSITIVE_INFINITY]) {
      assert.equal(
        computeLeaderboardScore({ ...base, elapsedSeconds }),
        10440,
        `유효하지 않은 elapsed(${elapsedSeconds})는 보너스 0이어야 한다`,
      );
    }
  });
});

describe("computeLeaderboardScore: 가중치 주입(#216)", () => {
  const base = {
    completedWordCount: 10,
    remainingAttempts: 3,
    hintCount: 2,
    elapsedSeconds: 30,
  };

  it("가중치 미지정 시 기존 상수와 동일한 점수를 낸다(회귀 없음)", () => {
    // 미지정 = 기본 상수 전체 주입과 동일해야 한다(하위호환).
    assert.equal(
      computeLeaderboardScore(base),
      computeLeaderboardScore(base, LEADERBOARD_SCORE_WEIGHTS),
    );
    assert.equal(computeLeaderboardScore(base, {}), computeLeaderboardScore(base));
  });

  it("전체 가중치를 주입하면 그 값으로 계산한다", () => {
    // 완료 10*1 + 남은 3*2 - 힌트 2*1 + 보너스 max(0, 10 - 30*0)=10 = 10+6-2+10 = 24
    const score = computeLeaderboardScore(
      { completedWordCount: 10, remainingAttempts: 3, hintCount: 2, elapsedSeconds: 30 },
      {
        completedWord: 1,
        remainingAttempt: 2,
        hint: 1,
        timeBonusBase: 10,
        timeDecayPerSecond: 0,
      },
    );
    assert.equal(score, 24);
  });

  it("부분 주입 시 지정한 키만 바뀌고 나머지는 기본 상수를 쓴다", () => {
    // completedWord 만 500으로 바꾸면 완료 항만 달라진다.
    const expected =
      10 * 500 +
      3 * LEADERBOARD_SCORE_WEIGHTS.remainingAttempt -
      2 * LEADERBOARD_SCORE_WEIGHTS.hint +
      Math.max(
        0,
        LEADERBOARD_SCORE_WEIGHTS.timeBonusBase -
          30 * LEADERBOARD_SCORE_WEIGHTS.timeDecayPerSecond,
      );
    assert.equal(
      computeLeaderboardScore(base, { completedWord: 500 }),
      expected,
    );
  });

  it("시간 보너스 가중치 주입이 감쇠 계산에도 반영된다", () => {
    // decay 를 2로 올리면 같은 30초에서 보너스가 더 빨리 감쇠한다.
    const slower = computeLeaderboardScore(base, { timeDecayPerSecond: 1 });
    const faster = computeLeaderboardScore(base, { timeDecayPerSecond: 5 });
    assert.ok(faster < slower);
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
