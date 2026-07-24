import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMissionRecordSummary } from "./missionRecordSummary.ts";

test("스트릭·최고 기록이 모두 있으면 두 요약을 모두 만든다(AC-2)", () => {
  const summary = buildMissionRecordSummary({
    consecutiveStreak: 3,
    bestTimeMs: 95_000,
  });
  assert.deepEqual(summary, {
    streakLabel: "연속 3일",
    bestTimeLabel: "최고 01:35",
  });
});

test("스트릭만 있으면 스트릭 요약만, 최고 기록은 null(AC-2)", () => {
  const summary = buildMissionRecordSummary({
    consecutiveStreak: 5,
    bestTimeMs: null,
  });
  assert.deepEqual(summary, { streakLabel: "연속 5일", bestTimeLabel: null });
});

test("최고 기록만 있으면 최고 기록 요약만, 스트릭은 null(AC-2)", () => {
  const summary = buildMissionRecordSummary({
    consecutiveStreak: 0,
    bestTimeMs: 3_723_000,
  });
  assert.deepEqual(summary, {
    streakLabel: null,
    bestTimeLabel: "최고 1:02:03",
  });
});

test("스트릭 0 + 유효 최고 기록 없음이면 null 을 돌려 'N번 도전' 폴백(AC-2)", () => {
  assert.equal(
    buildMissionRecordSummary({ consecutiveStreak: 0, bestTimeMs: null }),
    null,
  );
});

test("최고 기록이 0/음수/비정상 값이면 요약에서 제외한다(AC-2)", () => {
  assert.equal(
    buildMissionRecordSummary({ consecutiveStreak: 0, bestTimeMs: 0 }),
    null,
  );
  assert.equal(
    buildMissionRecordSummary({ consecutiveStreak: 0, bestTimeMs: -1 }),
    null,
  );
  assert.equal(
    buildMissionRecordSummary({
      consecutiveStreak: 0,
      bestTimeMs: Number.NaN,
    }),
    null,
  );
  // 스트릭이 있으면 잘못된 best-time 은 무시하되 스트릭 요약은 유지한다.
  assert.deepEqual(
    buildMissionRecordSummary({
      consecutiveStreak: 2,
      bestTimeMs: Number.POSITIVE_INFINITY,
    }),
    { streakLabel: "연속 2일", bestTimeLabel: null },
  );
});
