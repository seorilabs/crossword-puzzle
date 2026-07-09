import assert from "node:assert/strict";
import { test } from "node:test";

import type { Puzzle, PuzzleEntry } from "./types.ts";
import {
  getCellAnswerLetter,
  getEntryCellIndex,
  getEntryCellKeyAt,
  getEntryStartCellKey,
  getInitialEntryStartCellKey,
  getNextAnswerSlotCellKey,
  getPendingAnswerCellValues,
  getProgressPercent,
  isCellLocked,
} from "./boardNavigation.ts";

const acrossEntry: PuzzleEntry = {
  id: "a1",
  direction: "across",
  row: 0,
  col: 0,
  answer: "강산",
  clue: "테스트",
  generatedBy: "placed",
};

const puzzle: Puzzle = {
  puzzleId: "p1",
  date: "2026-07-09",
  difficulty: "easy",
  gridSize: 2,
  grid: [["강", "산"]],
  entries: [acrossEntry],
  metrics: {
    autoRunCount: 0,
    bboxDensity: 0,
    crossCells: 0,
    crossRatio: 0,
    filledCells: 2,
    multiCrossEntries: 0,
    placedWordCount: 1,
    wordCount: 1,
  },
};

test("getProgressPercent: 0 나눗셈 방어와 반올림", () => {
  assert.equal(getProgressPercent(0, 0), 0);
  assert.equal(getProgressPercent(1, 3), 33);
  assert.equal(getProgressPercent(2, 2), 100);
});

test("getEntryStartCellKey / getEntryCellIndex / getEntryCellKeyAt", () => {
  assert.equal(getEntryStartCellKey(acrossEntry), "0:0");
  assert.equal(getEntryStartCellKey(undefined), "");
  assert.equal(getEntryCellIndex(acrossEntry, "0:1"), 1);
  assert.equal(getEntryCellIndex(acrossEntry, "9:9"), 0);
  assert.equal(getEntryCellKeyAt(acrossEntry, 1), "0:1");
  assert.equal(getEntryCellKeyAt(acrossEntry, 99), "0:1");
});

test("getNextAnswerSlotCellKey: 다음 빈 칸으로 이동", () => {
  assert.equal(getNextAnswerSlotCellKey(acrossEntry, {}, 0, 1), "0:1");
  assert.equal(
    getNextAnswerSlotCellKey(acrossEntry, { "0:1": "산" }, 0, 1),
    "0:0",
  );
});

test("getInitialEntryStartCellKey", () => {
  assert.equal(getInitialEntryStartCellKey(puzzle), "0:0");
});

test("getCellAnswerLetter / isCellLocked", () => {
  assert.equal(getCellAnswerLetter(puzzle, "0:0"), "강");
  assert.equal(getCellAnswerLetter(puzzle, "5:5"), "");
  assert.equal(isCellLocked(puzzle, { "0:0": "강" }, "0:0"), true);
  assert.equal(isCellLocked(puzzle, { "0:0": "물" }, "0:0"), false);
  assert.equal(isCellLocked(puzzle, {}, "0:0"), false);
});

test("getPendingAnswerCellValues: 선택 셀부터 채운다", () => {
  assert.deepEqual(getPendingAnswerCellValues(acrossEntry, "강산", "0:0"), {
    "0:0": "강",
    "0:1": "산",
  });
  assert.deepEqual(getPendingAnswerCellValues(acrossEntry, "산", "0:1"), {
    "0:1": "산",
  });
});
