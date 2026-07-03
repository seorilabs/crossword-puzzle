import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MiniPuzzlePreview } from "./MiniPuzzlePreview";
import type { Puzzle } from "../../packages/crossword-core/src";

afterEach(cleanup);

// 컴포넌트는 puzzle.grid 만 읽으므로, 테스트에서는 grid 를 지정한 최소 Puzzle 을
// 만든다(나머지 필드는 렌더에 관여하지 않아 캐스팅으로 채운다).
function makePuzzle(grid: string[][]): Puzzle {
  return { grid } as unknown as Puzzle;
}

// n×n 보드를 만든다. 대각선(r===c)만 검은칸("")으로 두어 블록/비블록을 구분한다.
function squareGrid(size: number): string[][] {
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => (r === c ? "" : "A")),
  );
}

describe("MiniPuzzlePreview", () => {
  it("8×8 보드의 64칸을 모두 렌더하고 마지막 행·열을 자르지 않는다", () => {
    const { container } = render(
      <MiniPuzzlePreview puzzle={makePuzzle(squareGrid(8))} />,
    );

    const cells = container.querySelectorAll(".miniCell");
    expect(cells).toHaveLength(64);
  });

  it("9×9 보드의 81칸을 모두 렌더한다(hard 보드도 잘리지 않음)", () => {
    const { container } = render(
      <MiniPuzzlePreview puzzle={makePuzzle(squareGrid(9))} />,
    );

    expect(container.querySelectorAll(".miniCell")).toHaveLength(81);
  });

  it("열 수를 실제 보드 폭에 맞춰 --mini-cols CSS 변수로 설정한다", () => {
    const { container } = render(
      <MiniPuzzlePreview puzzle={makePuzzle(squareGrid(9))} />,
    );

    const board = container.querySelector(".miniBoard") as HTMLElement;
    expect(board.style.getPropertyValue("--mini-cols")).toBe("9");
  });

  it("빈 문자열 셀만 검은칸(miniBlock)으로 구분한다", () => {
    const { container } = render(
      // 대각선 8칸이 검은칸.
      <MiniPuzzlePreview puzzle={makePuzzle(squareGrid(8))} />,
    );

    expect(container.querySelectorAll(".miniBlock")).toHaveLength(8);
  });

  it("로딩 중에는 보드 크기와 동일한 셀 수의 스켈레톤을 렌더한다(고정 49칸 아님)", () => {
    const { container } = render(
      <MiniPuzzlePreview puzzle={makePuzzle(squareGrid(8))} isLoading />,
    );

    const cells = container.querySelectorAll(".miniCell");
    // 8×8 = 64칸 스켈레톤, 고정 49칸이 아니다.
    expect(cells).toHaveLength(64);
    expect(container.querySelectorAll(".miniCellSkeleton")).toHaveLength(64);
    const board = container.querySelector(".miniBoard") as HTMLElement;
    expect(board.style.getPropertyValue("--mini-cols")).toBe("8");
  });
});
