import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { computePersonalStats } from "./personalStats.ts";
import type { PersonalStatsRecord } from "./personalStats.ts";

function record(
  overrides: Partial<PersonalStatsRecord> = {},
): PersonalStatsRecord {
  return {
    completed: false,
    hintCount: 0,
    revealUsed: false,
    ...overrides,
  };
}

describe("computePersonalStats", () => {
  it("returns a zeroed summary for an empty record list", () => {
    assert.deepEqual(computePersonalStats([]), {
      totalPuzzles: 0,
      completedCount: 0,
      completionRate: 0,
      noHintCompletedCount: 0,
      bestTimeCount: 0,
    });
  });

  it("aggregates total / completed / completion rate / no-hint counts and passes through best-time count", () => {
    const records = [
      // 완료 + 노힌트(힌트0·정답보기X)
      record({ completed: true }),
      // 완료(힌트 사용) → 노힌트 아님
      record({ completed: true, hintCount: 2 }),
      // 완료 + 노힌트
      record({ completed: true }),
      // 미완료(진행 중/도전 종료)
      record({ completed: false }),
    ];

    // bestTimeCount는 archive 집합과 무관한 전체 보유 수로 호출자가 직접 넘긴다.
    assert.deepEqual(computePersonalStats(records, 5), {
      totalPuzzles: 4,
      completedCount: 3,
      completionRate: 3 / 4,
      noHintCompletedCount: 2,
      bestTimeCount: 5,
    });
  });

  it("normalizes best-time count and defaults to 0 when omitted", () => {
    assert.equal(computePersonalStats([]).bestTimeCount, 0);
    assert.equal(computePersonalStats([], 3.9).bestTimeCount, 3);
    assert.equal(computePersonalStats([], -2).bestTimeCount, 0);
    assert.equal(computePersonalStats([], Number.NaN).bestTimeCount, 0);
  });

  it("excludes a reveal-used completion from the no-hint count (matches getCompletionAchievements)", () => {
    // 과거 완료 기록이라도 정답 보기를 썼으면 노힌트로 세지 않는다 — 결과 화면
    // 배지 규칙(getCompletionAchievements)과 동일하게 unaided가 아니기 때문.
    const stats = computePersonalStats([
      record({ completed: true, hintCount: 0, revealUsed: true }),
    ]);
    assert.equal(stats.completedCount, 1);
    assert.equal(stats.noHintCompletedCount, 0);
  });

  it("excludes a hint-used completion from the no-hint count", () => {
    const stats = computePersonalStats([
      record({ completed: true, hintCount: 1, revealUsed: false }),
    ]);
    assert.equal(stats.completedCount, 1);
    assert.equal(stats.noHintCompletedCount, 0);
  });

  it("never counts no-hint on an incomplete record", () => {
    // 완료가 아니면 힌트0·정답보기X여도 노힌트 완료로 세지 않는다.
    const stats = computePersonalStats([
      record({ completed: false, hintCount: 0, revealUsed: false }),
    ]);
    assert.equal(stats.completedCount, 0);
    assert.equal(stats.noHintCompletedCount, 0);
  });

  it("reports best-time count independently of completion", () => {
    // 최고기록 수는 완료 여부와 무관한 전체 보유 수(호출자 입력)다.
    const stats = computePersonalStats([record({ completed: false })], 1);
    assert.equal(stats.bestTimeCount, 1);
    assert.equal(stats.completedCount, 0);
  });

  it("keeps completion rate in [0,1] and avoids NaN", () => {
    const allDone = computePersonalStats([
      record({ completed: true }),
      record({ completed: true }),
    ]);
    assert.equal(allDone.completionRate, 1);

    const noneDone = computePersonalStats([record(), record()]);
    assert.equal(noneDone.completionRate, 0);
    assert.ok(!Number.isNaN(computePersonalStats([]).completionRate));
  });
});
