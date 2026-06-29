// mission 완료 성취/최고 기록 판정 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  computeElapsedMs,
  computeElapsedSeconds,
  getCompletionAchievements,
} from "./mission.ts";

describe("getCompletionAchievements", () => {
  it("힌트 0·첫 도전·정답 미공개면 노힌트·첫 도전·최고기록 모두 인정", () => {
    const result = getCompletionAchievements({
      hintCount: 0,
      attemptsUsed: 1,
      revealUsed: false,
    });
    assert.equal(result.noHint, true);
    assert.equal(result.firstTry, true);
    assert.equal(result.bestTimeEligible, true);
  });

  it("힌트를 쓰면 노힌트 배지만 무효(첫 도전·최고기록은 유지)", () => {
    const result = getCompletionAchievements({
      hintCount: 2,
      attemptsUsed: 1,
      revealUsed: false,
    });
    assert.equal(result.noHint, false);
    assert.equal(result.firstTry, true);
    assert.equal(result.bestTimeEligible, true);
  });

  it("두 번째 이상 도전이면 첫 도전 배지만 무효", () => {
    const result = getCompletionAchievements({
      hintCount: 0,
      attemptsUsed: 2,
      revealUsed: false,
    });
    assert.equal(result.noHint, true);
    assert.equal(result.firstTry, false);
    assert.equal(result.bestTimeEligible, true);
  });

  it("정답 보기로 단어를 공개하면 노힌트·첫 도전·최고기록 판정이 모두 무효", () => {
    const result = getCompletionAchievements({
      hintCount: 0,
      attemptsUsed: 1,
      revealUsed: true,
    });
    assert.equal(result.noHint, false);
    assert.equal(result.firstTry, false);
    assert.equal(result.bestTimeEligible, false);
  });

  it("정답 공개는 힌트·도전 수와 무관하게 항상 best-time 후보에서 제외", () => {
    const result = getCompletionAchievements({
      hintCount: 5,
      attemptsUsed: 3,
      revealUsed: true,
    });
    assert.equal(result.noHint, false);
    assert.equal(result.firstTry, false);
    assert.equal(result.bestTimeEligible, false);
  });
});

describe("computeElapsedMs / computeElapsedSeconds (일시정지 반영)", () => {
  const startedAt = "2026-06-29T00:00:00.000Z";

  it("일시정지가 없으면 단순 경과(now - start)를 반환한다", () => {
    const now = new Date("2026-06-29T00:01:40.000Z").getTime(); // +100s
    assert.equal(computeElapsedMs({ startedAt, now }), 100_000);
    assert.equal(computeElapsedSeconds({ startedAt, now }), 100);
  });

  it("누적 일시정지(pausedMs)를 경과에서 제외한다", () => {
    const now = new Date("2026-06-29T00:01:40.000Z").getTime(); // +100s
    assert.equal(
      computeElapsedMs({ startedAt, pausedMs: 30_000, now }),
      70_000,
    );
    assert.equal(
      computeElapsedSeconds({ startedAt, pausedMs: 30_000, now }),
      70,
    );
  });

  it("진행 중 일시정지(pausedAt)면 멈춘 순간 이후 시간은 늘지 않는다", () => {
    const pausedAt = "2026-06-29T00:01:00.000Z"; // +60s에 정지
    // 정지 후 시간이 흘러도(now=+100s) 경과는 60s로 고정된다.
    const now = new Date("2026-06-29T00:01:40.000Z").getTime();
    assert.equal(computeElapsedSeconds({ startedAt, pausedAt, now }), 60);
    const later = new Date("2026-06-29T00:05:00.000Z").getTime();
    assert.equal(
      computeElapsedSeconds({ startedAt, pausedAt, now: later }),
      60,
    );
  });

  it("누적 + 진행 중 정지를 함께 제외한다", () => {
    const now = new Date("2026-06-29T00:03:00.000Z").getTime(); // +180s
    const pausedAt = "2026-06-29T00:02:00.000Z"; // +120s부터 정지
    // 180 - 20(누적) - 60(진행 중 정지: 180-120) = 100
    assert.equal(
      computeElapsedSeconds({ startedAt, pausedMs: 20_000, pausedAt, now }),
      100,
    );
  });

  it("종료(endedAt)가 있으면 진행 중 정지는 더하지 않고 누적만 제외한다", () => {
    const endedAt = "2026-06-29T00:02:00.000Z"; // 완료 +120s
    // 완료 시점에는 진행 중 정지가 없다고 보고 누적(40s)만 제외 → 80s
    assert.equal(
      computeElapsedSeconds({ startedAt, endedAt, pausedMs: 40_000 }),
      80,
    );
  });

  it("정지 시간이 경과를 초과해도 0 미만으로 내려가지 않는다", () => {
    const now = new Date("2026-06-29T00:00:10.000Z").getTime(); // +10s
    assert.equal(computeElapsedMs({ startedAt, pausedMs: 99_000, now }), 0);
  });

  it("시작 시각이 없으면 undefined", () => {
    assert.equal(computeElapsedMs({ now: 1 }), undefined);
    assert.equal(computeElapsedSeconds({}), undefined);
  });
});
