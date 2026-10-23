import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveSingleDailyPublication,
  requiredDailyDifficulties,
} from "./singleDailyPublication.ts";
test("전날 23시 생성은 다음 날짜 자정 공개를 계산하고 h01 식별자를 유지한다", () => {
  const result = resolveSingleDailyPublication({
    now: new Date("2026-10-23T14:00:00Z"),
    timeZone: "Asia/Seoul",
    fromDate: "2026-10-24",
  });
  assert.deepEqual(result, {
    date: "2026-10-24",
    publishedAt: "2026-10-23T15:00:00.000Z",
    alias: "26102401",
    slotId: "2026-10-24-h01",
    fromDate: "2026-10-24",
  });
  assert.equal(
    resolveSingleDailyPublication({
      now: new Date("2026-10-22T14:00:00Z"),
      timeZone: "Asia/Seoul",
      fromDate: "2026-10-24",
    }),
    undefined,
  );
});
test("타임존과 명시적 재실행 날짜를 계산하며 잘못된 공개 시각은 거부한다", () => {
  const result = resolveSingleDailyPublication({
    now: new Date("2026-11-01T23:00:00Z"),
    timeZone: "America/New_York",
    fromDate: "2026-10-24",
  });
  assert.equal(result?.publishedAt, "2026-11-02T05:00:00.000Z");
  assert.throws(() =>
    resolveSingleDailyPublication({
      now: new Date(),
      timeZone: "Asia/Seoul",
      fromDate: "bad-date",
    }),
  );
  assert.throws(() =>
    resolveSingleDailyPublication({
      now: new Date(),
      timeZone: "Asia/Seoul",
      fromDate: "2026-10-24",
      startDate: "2026-10-24",
      publishedAt: "2026-10-24T01:00:00+09:00",
    }),
  );
});
test("전환 날짜 전에는 과거 두 판, 이후에는 hard 한 판만 요구한다", () => {
  assert.deepEqual(requiredDailyDifficulties(undefined, "2026-10-24"), [
    "easy",
    "hard",
  ]);
  const policy = {
    version: 1 as const,
    singleFromDate: "2026-10-24",
    vocabularyPolicy: "familiar-v1" as const,
  };
  assert.deepEqual(requiredDailyDifficulties(policy, "2026-10-23"), [
    "easy",
    "hard",
  ]);
  assert.deepEqual(requiredDailyDifficulties(policy, "2026-10-24"), ["hard"]);
});
