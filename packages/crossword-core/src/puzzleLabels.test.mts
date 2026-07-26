import assert from "node:assert/strict";
import { test } from "node:test";

import type { PuzzleManifestItem } from "./types.ts";
import {
  findPuzzleSummaryById,
  formatDifficultyLabel,
  formatDateCardDay,
  formatDateCardWeekday,
  getCompletedPuzzleIds,
} from "./puzzleLabels.ts";

test("formatDifficultyLabel: 세 마켓 공통 한글 난이도 라벨", () => {
  assert.equal(formatDifficultyLabel("easy"), "쉬움");
  assert.equal(formatDifficultyLabel("normal"), "보통");
  assert.equal(formatDifficultyLabel("hard"), "어려움");
  assert.equal(formatDifficultyLabel(undefined), "");
});

const summaries = [
  { puzzleId: "a" },
  { puzzleId: "b" },
] as unknown as PuzzleManifestItem[];

test("findPuzzleSummaryById", () => {
  assert.equal(findPuzzleSummaryById(summaries, "b")?.puzzleId, "b");
  assert.equal(findPuzzleSummaryById(summaries, "z"), undefined);
  assert.equal(findPuzzleSummaryById(summaries, undefined), undefined);
});

test("getCompletedPuzzleIds: completedAt 있는 것만", () => {
  const ids = getCompletedPuzzleIds({
    a: { completedAt: "2026-07-09" },
    b: {},
    c: { completedAt: "2026-07-08" },
  });
  assert.deepEqual([...ids].sort(), ["a", "c"]);
});

test("formatDateCardDay: M.D, 파싱 실패 시 원본", () => {
  assert.equal(formatDateCardDay("2026-07-09"), "7.9");
  assert.equal(formatDateCardDay("bad"), "bad");
});

test("formatDateCardWeekday: 기본 short, 잘못된 날짜는 빈 문자열", () => {
  assert.equal(typeof formatDateCardWeekday("2026-07-09"), "string");
  assert.notEqual(formatDateCardWeekday("2026-07-09"), "");
  assert.equal(formatDateCardWeekday("bad"), "");
});
