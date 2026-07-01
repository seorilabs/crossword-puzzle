// 결과 공유용 이모지 격자(Wordle식) 순수 함수 단위 테스트
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  SHARE_GRID_CORRECT as G,
  SHARE_GRID_INCOMPLETE as W,
  SHARE_GRID_GAP as B,
  buildShareGrid,
} from "./shareGrid.ts";
import type { Puzzle } from "./types.ts";

// getBounds/buildShareGrid는 grid만 참조하므로 grid 중심의 최소 Puzzle을 만든다.
function puzzle(grid: string[][]): Puzzle {
  return { grid } as unknown as Puzzle;
}

// 십자(+) 모양: 네 모서리는 그리드 공백, 중앙 5칸에 단어가 지난다.
//   "" 가 ""
//   나 다 라
//   "" 마 ""
const CROSS = puzzle([
  ["", "가", ""],
  ["나", "다", "라"],
  ["", "마", ""],
]);

const CROSS_SOLUTION: Record<string, string> = {
  "0:1": "가",
  "1:0": "나",
  "1:1": "다",
  "1:2": "라",
  "2:1": "마",
};

describe("buildShareGrid", () => {
  it("완성 보드는 채운 칸을 🟩, 공백을 전각 공백으로 매핑한다", () => {
    const grid = buildShareGrid(CROSS, CROSS_SOLUTION);
    assert.equal(grid, [`${B}${G}${B}`, `${G}${G}${G}`, `${B}${G}${B}`].join("\n"));
  });

  it("부분 완성은 정답 칸만 🟩, 빈칸·오답 칸은 ⬜로 구분한다", () => {
    // 중앙(1:1)만 정답, (0:1)은 오답으로 채움, 나머지는 빈칸.
    const partial: Record<string, string> = { "1:1": "다", "0:1": "오" };
    const grid = buildShareGrid(CROSS, partial);
    assert.equal(grid, [`${B}${W}${B}`, `${W}${G}${W}`, `${B}${W}${B}`].join("\n"));
  });

  it("빈 보드는 단어 칸을 모두 ⬜, 공백은 전각 공백으로 남긴다", () => {
    const grid = buildShareGrid(CROSS, {});
    assert.equal(grid, [`${B}${W}${B}`, `${W}${W}${W}`, `${B}${W}${B}`].join("\n"));
  });

  it("정답 글자는 격자에 절대 포함하지 않는다", () => {
    const grid = buildShareGrid(CROSS, CROSS_SOLUTION);
    for (const letter of ["가", "나", "다", "라", "마"]) {
      assert.equal(grid.includes(letter), false, `${letter} 노출됨`);
    }
  });

  it("빈 행·열로 둘러싸여 있어도 bbox 영역만 렌더한다", () => {
    // 십자를 5x5 그리드의 (1,1)~(3,3)에 배치 — 바깥 테두리는 전부 공백.
    const padded = puzzle([
      ["", "", "", "", ""],
      ["", "", "가", "", ""],
      ["", "나", "다", "라", ""],
      ["", "", "마", "", ""],
      ["", "", "", "", ""],
    ]);
    const solution: Record<string, string> = {
      "1:2": "가",
      "2:1": "나",
      "2:2": "다",
      "2:3": "라",
      "3:2": "마",
    };
    const grid = buildShareGrid(padded, solution);
    // 테두리가 잘려 CROSS 완성본과 동일한 3줄이어야 한다.
    assert.equal(grid, [`${B}${G}${B}`, `${G}${G}${G}`, `${B}${G}${B}`].join("\n"));
    assert.equal(grid.split("\n").length, 3);
  });
});
