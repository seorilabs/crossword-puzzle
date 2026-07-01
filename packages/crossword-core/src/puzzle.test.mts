import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildCellEntries,
  getNearestUncompletedEntry,
  getNextFocusEntryAfterCompletion,
  getWordCheckResult,
  pickHintCellIndex,
} from "./puzzle.ts";
import type { PuzzleEntry } from "./types.ts";

function entry(partial: Partial<PuzzleEntry> & Pick<PuzzleEntry, "id" | "answer" | "direction" | "row" | "col">): PuzzleEntry {
  return { clue: "", generatedBy: "placed", ...partial };
}

describe("pickHintCellIndex", () => {
  // a1 "가나다"(가로, (0,0)~(0,2))와 d1 "다라"(세로, (0,2)~(1,2))가 (0,2)에서 교차.
  const a1 = entry({ id: "a1", answer: "가나다", direction: "across", row: 0, col: 0 });
  const d1 = entry({ id: "d1", answer: "다라", direction: "down", row: 0, col: 2 });
  const cellEntries = buildCellEntries([a1, d1]);

  it("교차 칸이 앞 칸보다 뒤에 있어도 교차 칸을 먼저 공개한다", () => {
    // 전부 비어 있음 → 앞 미충족은 index 0(0,0), 교차 미충족은 index 2(0,2).
    const index = pickHintCellIndex(a1, {}, cellEntries);
    assert.equal(index, 2);
  });

  it("교차 후보가 없으면 앞선 미충족 칸을 고른다", () => {
    // a1만 있는 격자(교차 없음) → 앞 칸(index 0).
    const soloEntries = buildCellEntries([a1]);
    const index = pickHintCellIndex(a1, {}, soloEntries);
    assert.equal(index, 0);
  });

  it("이미 정답인 칸은 건너뛴다", () => {
    // 교차 칸(0,2)이 이미 정답이면 남은 미충족(0,0)을 고른다(교차 후보 소진).
    const values = { "0:2": "다" };
    const index = pickHintCellIndex(a1, values, cellEntries);
    assert.equal(index, 0);
  });

  it("모든 칸이 정답이면 -1", () => {
    const values = { "0:0": "가", "0:1": "나", "0:2": "다" };
    assert.equal(pickHintCellIndex(a1, values, cellEntries), -1);
  });

  it("오답으로 채워진 칸도 미충족으로 보고 후보에 포함한다", () => {
    // (0,0) 오답, 교차 칸(0,2)은 정답 → 교차 소진, 앞 미충족(0,0) 선택.
    const values = { "0:0": "오", "0:2": "다" };
    assert.equal(pickHintCellIndex(a1, values, cellEntries), 0);
  });
});

describe("getNearestUncompletedEntry", () => {
  // a1(가로) 완성 후 다음 포커스를 고르는 상황.
  // a1과 (0,0)에서 교차하는 d1(세로)은 셀 거리 0, 멀리 떨어진 a2는 셀 거리 7.
  const a1 = entry({ id: "a1", answer: "가나", direction: "across", row: 0, col: 0 });
  const d1 = entry({ id: "d1", answer: "가다", direction: "down", row: 0, col: 0 });
  const a2 = entry({ id: "a2", answer: "마바", direction: "across", row: 4, col: 4 });
  // 배열 순서상 a2가 d1보다 앞 — 단순 "첫 미완성" 선택이면 a2가 뽑힌다.
  const entries = [a1, a2, d1];

  it("배열 순서가 아니라 교차(가장 가까운) 미완성 단어를 우선한다", () => {
    const cellValues = { "0:0": "가", "0:1": "나" }; // a1 완성, d1·a2 미완성
    const next = getNearestUncompletedEntry(entries, cellValues, a1);
    assert.equal(next?.id, "d1");
  });

  it("교차 단어가 없으면 가장 가까운 미완성 단어를 고른다", () => {
    // d1도 완성시켜 후보에서 제외 → 남은 미완성은 멀리 있는 a2뿐
    const cellValues = { "0:0": "가", "0:1": "나", "1:0": "다" };
    const next = getNearestUncompletedEntry(entries, cellValues, a1);
    assert.equal(next?.id, "a2");
  });

  it("미완성 단어가 없으면 undefined를 반환한다", () => {
    const cellValues = { "0:0": "가", "0:1": "나", "1:0": "다", "4:4": "마", "4:5": "바" };
    const next = getNearestUncompletedEntry(entries, cellValues, a1);
    assert.equal(next, undefined);
  });
});

describe("getNextFocusEntryAfterCompletion", () => {
  // 실제 제보 케이스(#26062100): 식단(1번 가로) → 단검(2번 세로) 완성.
  //   a1 "식단"  : (0,0)=식 (0,1)=단      가로
  //   d2 "단검"  : (0,1)=단 (1,1)=검      세로  ← 방금 완성, 마지막 입력 칸 (1,1)=검
  //   d3 "라면"  : (0,3) (1,3)            세로  ← 배열상 d2 다음(첫 미완성)
  //   a5 "검문소": (1,1)=검 (1,2) (1,3)   가로  ← (1,1)에서 d2와 교차
  const a1 = entry({ id: "a1", answer: "식단", direction: "across", row: 0, col: 0 });
  const d2 = entry({ id: "d2", answer: "단검", direction: "down", row: 0, col: 1 });
  const d3 = entry({ id: "d3", answer: "라면", direction: "down", row: 0, col: 3 });
  const a5 = entry({ id: "a5", answer: "검문소", direction: "across", row: 1, col: 1 });
  // 배열 순서: d3가 a5보다 앞 — "첫 미완성"이면 d3(3번 세로)가 잘못 뽑힌다.
  const entries = [a1, d2, d3, a5];

  it("마지막 입력 칸을 지나는 교차 미완성 단어로 이동한다 (식단→단검→5번 가로)", () => {
    const cellValues = { "0:0": "식", "0:1": "단", "1:1": "검" }; // a1·d2 완성
    const next = getNextFocusEntryAfterCompletion(entries, cellValues, d2, "1:1");
    assert.equal(next?.id, "a5"); // 3번 세로(d3)가 아니라 5번 가로(a5)
  });

  it("앵커가 없으면 단어 끝 칸 기준으로 교차 단어를 찾는다", () => {
    const cellValues = { "0:0": "식", "0:1": "단", "1:1": "검" };
    const next = getNextFocusEntryAfterCompletion(entries, cellValues, d2, null);
    assert.equal(next?.id, "a5");
  });

  it("교차 미완성 단어가 없으면 거리 기반으로 폴백한다", () => {
    // a5만 완성으로 채워 교차 후보에서 제외 → d3(거리 기반)로 폴백
    const cellValues = {
      "0:0": "식", "0:1": "단", "1:1": "검", "1:2": "문", "1:3": "소",
    };
    const next = getNextFocusEntryAfterCompletion(entries, cellValues, d2, "1:1");
    assert.equal(next?.id, "d3");
  });
});

describe("getWordCheckResult", () => {
  const word = entry({
    id: "a1",
    answer: "가나다",
    direction: "across",
    row: 0,
    col: 0,
  });
  // 셀 키 형식은 getCellKey와 동일한 "row:col".

  it("모든 셀 키를 단어 순서대로 돌려준다", () => {
    const result = getWordCheckResult(word, {});
    assert.deepEqual(result.cellKeys, ["0:0", "0:1", "0:2"]);
    assert.equal(result.filledCount, 0);
    assert.equal(result.wrongCount, 0);
  });

  it("입력된 셀만 세고, 정답과 다른 글자를 오답으로 센다", () => {
    const result = getWordCheckResult(word, { "0:0": "가", "0:1": "X" });
    assert.equal(result.filledCount, 2);
    assert.equal(result.wrongCount, 1);
  });

  it("모두 정답이면 오답 0", () => {
    const result = getWordCheckResult(word, {
      "0:0": "가",
      "0:1": "나",
      "0:2": "다",
    });
    assert.equal(result.filledCount, 3);
    assert.equal(result.wrongCount, 0);
  });
});
