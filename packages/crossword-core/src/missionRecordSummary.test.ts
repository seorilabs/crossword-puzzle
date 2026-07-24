import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMissionRecordSummary } from "./missionRecordSummary.ts";

test("스트릭·최고 기록이 모두 있으면 두 값을 요약으로 반환한다", () => {
  const summary = buildMissionRecordSummary({
    consecutiveStreak: 3,
    fastestBestTimeMs: 83_000,
  });
  assert.deepEqual(summary, { streakDays: 3, bestTimeLabel: "01:23" });
});

test("스트릭만 있으면 최고 기록 라벨은 null", () => {
  const summary = buildMissionRecordSummary({
    consecutiveStreak: 5,
    fastestBestTimeMs: null,
  });
  assert.deepEqual(summary, { streakDays: 5, bestTimeLabel: null });
});

test("최고 기록만 있으면 스트릭 일수는 null", () => {
  const summary = buildMissionRecordSummary({
    consecutiveStreak: 0,
    fastestBestTimeMs: 3_723_000,
  });
  // 1시간 이상은 h:mm:ss 로 표기(formatBestTime 계약).
  assert.deepEqual(summary, { streakDays: null, bestTimeLabel: "1:02:03" });
});

test("스트릭·최고 기록 모두 없으면 null 을 반환해 기존 문구로 폴백한다", () => {
  const summary = buildMissionRecordSummary({
    consecutiveStreak: 0,
    fastestBestTimeMs: null,
  });
  assert.equal(summary, null);
});

test("연속 완료일이 음수/0이면 스트릭 일수는 null 로 감춘다", () => {
  const summary = buildMissionRecordSummary({
    consecutiveStreak: -1,
    fastestBestTimeMs: 60_000,
  });
  assert.deepEqual(summary, { streakDays: null, bestTimeLabel: "01:00" });
});
