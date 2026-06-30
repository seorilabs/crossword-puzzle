// PuzzleBoard 임시(연필) 셀 렌더 가드 컴포넌트 테스트 (vitest + jsdom)
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { PuzzleBoard, type PuzzleBoardProps } from "./PuzzleBoard";
import type { Puzzle } from "../../packages/crossword-core/src";

afterEach(cleanup);

// 1행 2열(가/나) 최소 퍼즐. PuzzleBoard 렌더는 grid·puzzleId만 사용한다.
const puzzle = {
  puzzleId: "test-puzzle",
  grid: [["가", "나"]],
} as unknown as Puzzle;

function renderBoard(overrides: Partial<PuzzleBoardProps> = {}) {
  const props: PuzzleBoardProps = {
    cellEntries: new Map(),
    cellValues: {},
    cols: [0, 1],
    completedEntries: [],
    pendingCellValues: {},
    puzzle,
    rows: [0],
    selectedCells: new Set(),
    selectCell: () => {},
    startLabels: new Map(),
    ...overrides,
  };

  const { container } = render(<PuzzleBoard {...props} />);
  // 렌더 순서: index 0 = "0:0"(가), index 1 = "0:1"(나)
  return [...container.querySelectorAll("button.cell")] as HTMLButtonElement[];
}

describe("PuzzleBoard 임시(연필) 셀 렌더", () => {
  it("연필로 입력한 미정답 셀은 cellTentative로 렌더된다(autocheck OFF)", () => {
    const [cell] = renderBoard({
      autocheckEnabled: false,
      cellValues: { "0:0": "X" }, // 정답 "가"와 불일치
      tentativeCellKeys: new Set(["0:0"]),
    });
    expect(cell.classList.contains("cellTentative")).toBe(true);
    expect(cell.classList.contains("cellWrong")).toBe(false);
    expect(cell.classList.contains("cellCorrect")).toBe(false);
  });

  it("정답으로 잠긴 셀은 임시 셋에 있어도 cellTentative가 적용되지 않는다", () => {
    const cells = renderBoard({
      autocheckEnabled: false,
      cellValues: { "0:1": "나" }, // 정답 일치 → 잠금
      tentativeCellKeys: new Set(["0:1"]),
    });
    const correctCell = cells[1];
    expect(correctCell.classList.contains("cellCorrect")).toBe(true);
    expect(correctCell.classList.contains("cellTentative")).toBe(false);
  });

  it("autocheck ON 오답 셀에서도 cellWrong와 cellTentative가 함께 붙는다", () => {
    // 회귀 가드: autocheck 기본 ON에서 임시 표시가 사라지지 않아야 한다.
    const [cell] = renderBoard({
      autocheckEnabled: true,
      cellValues: { "0:0": "X" },
      tentativeCellKeys: new Set(["0:0"]),
    });
    expect(cell.classList.contains("cellWrong")).toBe(true);
    expect(cell.classList.contains("cellTentative")).toBe(true);
  });

  it("임시 셋에 없는 일반 입력 셀은 cellTentative가 없다", () => {
    const [cell] = renderBoard({
      autocheckEnabled: false,
      cellValues: { "0:0": "X" },
      tentativeCellKeys: new Set(),
    });
    expect(cell.classList.contains("cellTentative")).toBe(false);
  });
});

describe("PuzzleBoard 활성(커서) 셀 강조", () => {
  it("activeCellKey 셀에만 cellActive가 붙는다", () => {
    const [first, second] = renderBoard({
      selectedCells: new Set(["0:0", "0:1"]),
      activeCellKey: "0:0",
    });
    expect(first.classList.contains("cellActive")).toBe(true);
    expect(second.classList.contains("cellActive")).toBe(false);
    // 활성 셀도 선택 단어의 일부이므로 cellSelected는 함께 유지된다.
    expect(first.classList.contains("cellSelected")).toBe(true);
  });

  it("활성 셀에 aria-current='true'가 부여된다", () => {
    const [first, second] = renderBoard({
      selectedCells: new Set(["0:0", "0:1"]),
      activeCellKey: "0:0",
    });
    expect(first.getAttribute("aria-current")).toBe("true");
    expect(second.getAttribute("aria-current")).toBe(null);
  });

  it("activeCellKey 미지정이면 어떤 셀에도 cellActive가 없다(하위호환)", () => {
    const cells = renderBoard({
      selectedCells: new Set(["0:0", "0:1"]),
    });
    for (const cell of cells) {
      expect(cell.classList.contains("cellActive")).toBe(false);
      expect(cell.getAttribute("aria-current")).toBe(null);
    }
  });
});
