import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  getEasiestEntryId,
  getNearestUncompletedEntry,
  getNextFocusEntryAfterCompletion,
} from "./puzzle.ts";
import type { Puzzle, PuzzleEntry } from "./types.ts";

function entry(partial: Partial<PuzzleEntry> & Pick<PuzzleEntry, "id" | "answer" | "direction" | "row" | "col">): PuzzleEntry {
  return { clue: "", generatedBy: "placed", ...partial };
}

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

describe("getEasiestEntryId", () => {
  const puzzle = (entries: PuzzleEntry[]) => ({ entries }) as Puzzle;

  it("글자 수가 적은(채우기 쉬운) 단어를 우선한다", () => {
    const long = entry({ id: "long", answer: "가나다", direction: "across", row: 0, col: 0 });
    const short = entry({ id: "short", answer: "마바", direction: "down", row: 3, col: 3 });
    assert.equal(getEasiestEntryId(puzzle([long, short])), "short");
  });

  it("글자 수가 같으면 교차가 많은 단어를 우선한다", () => {
    // 모두 2글자. a1은 (0,0)·(0,1) 두 칸 모두 교차, d2는 한 칸만 교차, a3은 고립.
    const a1 = entry({ id: "a1", answer: "가나", direction: "across", row: 0, col: 0 });
    const d1 = entry({ id: "d1", answer: "가다", direction: "down", row: 0, col: 0 });
    const d2 = entry({ id: "d2", answer: "나마", direction: "down", row: 0, col: 1 });
    const a3 = entry({ id: "a3", answer: "바사", direction: "across", row: 5, col: 5 });
    assert.equal(getEasiestEntryId(puzzle([a3, d2, a1, d1])), "a1");
  });

  it("excludeEntryIds로 완성된 단어는 후보에서 제외한다", () => {
    const long = entry({ id: "long", answer: "가나다", direction: "across", row: 0, col: 0 });
    const short = entry({ id: "short", answer: "마바", direction: "down", row: 3, col: 3 });
    // 가장 쉬운 short를 제외하면 그다음(long)을 고른다.
    assert.equal(
      getEasiestEntryId(puzzle([long, short]), {
        excludeEntryIds: new Set(["short"]),
      }),
      "long",
    );
  });

  it("모든 단어가 제외되면 전체에서 고른다", () => {
    const long = entry({ id: "long", answer: "가나다", direction: "across", row: 0, col: 0 });
    const short = entry({ id: "short", answer: "마바", direction: "down", row: 3, col: 3 });
    assert.equal(
      getEasiestEntryId(puzzle([long, short]), {
        excludeEntryIds: new Set(["short", "long"]),
      }),
      "short",
    );
  });

  it("단어가 없으면 빈 문자열을 반환한다", () => {
    assert.equal(getEasiestEntryId(puzzle([])), "");
  });
});
