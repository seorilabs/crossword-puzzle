import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  computePersonalStats,
  computeSolveTimeDistribution,
  formatBestTime,
} from "./personalStats.ts";
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
      fastestBestTimeMs: null,
      averageBestTimeMs: null,
    });
  });

  it("aggregates total / completed / completion rate / no-hint counts and best-time min/mean/count", () => {
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

    // best-time 값(ms)은 archive 집합과 무관한 전체 보유분을 호출자가 직접 넘긴다.
    assert.deepEqual(computePersonalStats(records, [90_000, 60_000, 120_000]), {
      totalPuzzles: 4,
      completedCount: 3,
      completionRate: 3 / 4,
      noHintCompletedCount: 2,
      bestTimeCount: 3,
      fastestBestTimeMs: 60_000,
      averageBestTimeMs: 90_000,
    });
  });

  it("counts only valid best-time values and defaults to empty when omitted", () => {
    // 값을 생략하면 보유 0건 → 개수 0, 최소/평균 null.
    const empty = computePersonalStats([]);
    assert.equal(empty.bestTimeCount, 0);
    assert.equal(empty.fastestBestTimeMs, null);
    assert.equal(empty.averageBestTimeMs, null);

    // 오염 값(0/음수/NaN)은 개수·최소·평균에서 모두 제외한다.
    const dirty = computePersonalStats([], [0, -5, Number.NaN, 30_000, 50_000]);
    assert.equal(dirty.bestTimeCount, 2);
    assert.equal(dirty.fastestBestTimeMs, 30_000);
    assert.equal(dirty.averageBestTimeMs, 40_000);
  });

  it("rounds the average best-time to the nearest millisecond", () => {
    // (10_000 + 10_001 + 10_001) / 3 = 10000.67 → 반올림 10_001
    const stats = computePersonalStats([], [10_000, 10_001, 10_001]);
    assert.equal(stats.averageBestTimeMs, 10_001);
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

  it("reports best-time metrics independently of completion", () => {
    // 최고기록은 완료 여부와 무관한 전체 보유분(호출자 입력)이다.
    const stats = computePersonalStats([record({ completed: false })], [45_000]);
    assert.equal(stats.bestTimeCount, 1);
    assert.equal(stats.fastestBestTimeMs, 45_000);
    assert.equal(stats.averageBestTimeMs, 45_000);
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

describe("formatBestTime", () => {
  it("formats milliseconds as zero-padded mm:ss", () => {
    assert.equal(formatBestTime(0), "00:00");
    assert.equal(formatBestTime(5_000), "00:05");
    assert.equal(formatBestTime(65_000), "01:05");
    assert.equal(formatBestTime(600_000), "10:00");
    // 초 단위 미만은 버린다(내림).
    assert.equal(formatBestTime(59_999), "00:59");
  });

  it("rolls over to h:mm:ss for one hour or longer (no minute-width overflow)", () => {
    // 정확히 1시간 → 1:00:00 (mm:ss 로 두면 60:00 이 되어 폭이 붕괴).
    assert.equal(formatBestTime(3_600_000), "1:00:00");
    // 1시간 15분 30초 → 1:15:30 (mm:ss 로 두면 75:30).
    assert.equal(formatBestTime(4_530_000), "1:15:30");
    // 59분 59초는 여전히 mm:ss.
    assert.equal(formatBestTime(3_599_000), "59:59");
  });

  it("returns 00:00 for invalid inputs (0 / negative / NaN)", () => {
    assert.equal(formatBestTime(-1), "00:00");
    assert.equal(formatBestTime(Number.NaN), "00:00");
    assert.equal(formatBestTime(Number.POSITIVE_INFINITY), "00:00");
  });
});

describe("computeSolveTimeDistribution", () => {
  it("완료/보유 0건이면 모든 구간이 0이고 total·maxCount 가 0이다(빈 상태)", () => {
    const dist = computeSolveTimeDistribution([]);
    assert.equal(dist.total, 0);
    assert.equal(dist.maxCount, 0);
    assert.equal(dist.buckets.length, 5);
    assert.deepEqual(
      dist.buckets.map((b) => b.count),
      [0, 0, 0, 0, 0],
    );
    // 구간 라벨/순서 고정.
    assert.deepEqual(
      dist.buckets.map((b) => b.label),
      ["1분 미만", "1–2분", "2–3분", "3–5분", "5분+"],
    );
  });

  it("기록 1건이면 해당 구간만 1, total·maxCount 가 1이다", () => {
    // 45초 → "1분 미만"
    const dist = computeSolveTimeDistribution([45_000]);
    assert.equal(dist.total, 1);
    assert.equal(dist.maxCount, 1);
    assert.deepEqual(
      dist.buckets.map((b) => b.count),
      [1, 0, 0, 0, 0],
    );
  });

  it("경계값은 '미만' 규칙으로 다음 구간에 들어간다", () => {
    // 정확히 60초는 "1분 미만"이 아니라 "1–2분"에 속한다.
    const boundary = computeSolveTimeDistribution([60_000]);
    assert.deepEqual(
      boundary.buckets.map((b) => b.count),
      [0, 1, 0, 0, 0],
    );
    // 59.999초는 "1분 미만".
    const justUnder = computeSolveTimeDistribution([59_999]);
    assert.deepEqual(
      justUnder.buckets.map((b) => b.count),
      [1, 0, 0, 0, 0],
    );
  });

  it("여러 건을 각 구간으로 분류하고 maxCount 를 최빈 구간으로 잡는다", () => {
    const dist = computeSolveTimeDistribution([
      30_000, // 1분 미만
      90_000, // 1–2분
      100_000, // 1–2분
      200_000, // 3–5분
      600_000, // 5분+
    ]);
    assert.equal(dist.total, 5);
    assert.deepEqual(
      dist.buckets.map((b) => b.count),
      [1, 2, 0, 1, 1],
    );
    assert.equal(dist.maxCount, 2);
  });

  it("오염 값(0/음수/NaN/Infinity)은 제외해 total 이 유효 기록 수와 일치한다", () => {
    const dist = computeSolveTimeDistribution([
      45_000,
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      130_000,
    ]);
    assert.equal(dist.total, 2);
    assert.deepEqual(
      dist.buckets.map((b) => b.count),
      [1, 0, 1, 0, 0],
    );
  });
});
