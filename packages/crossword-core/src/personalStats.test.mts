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
    hasBestTime: false,
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

  it("aggregates total / completed / completion rate / no-hint / best-time counts", () => {
    const records = [
      // 완료 + 노힌트(힌트0·정답보기X) + 최고기록 보유
      record({ completed: true, hasBestTime: true }),
      // 완료(힌트 사용) + 최고기록 보유 → 노힌트 아님
      record({ completed: true, hintCount: 2, hasBestTime: true }),
      // 완료 + 노힌트(최고기록 없음)
      record({ completed: true }),
      // 미완료(진행 중/도전 종료)
      record({ completed: false }),
    ];

    assert.deepEqual(computePersonalStats(records), {
      totalPuzzles: 4,
      completedCount: 3,
      completionRate: 3 / 4,
      noHintCompletedCount: 2,
      bestTimeCount: 2,
    });
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

  it("counts best-time independently of completion", () => {
    // 최고기록 보유는 완료 여부와 무관하게 집계한다(이전 시도에서 세운 기록 등).
    const stats = computePersonalStats([
      record({ completed: false, hasBestTime: true }),
    ]);
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
