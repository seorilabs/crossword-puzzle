// ShareGridPreview 문자열→타일 매핑 컴포넌트 테스트 (vitest + jsdom)
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { ShareGridPreview } from "./ShareGridPreview";
import {
  buildShareGrid,
  SHARE_GRID_CORRECT,
  SHARE_GRID_GAP,
  SHARE_GRID_INCOMPLETE,
  type Puzzle,
} from "../../packages/crossword-core/src";

afterEach(cleanup);

function renderGrid(shareGrid: string) {
  const { container } = render(<ShareGridPreview shareGrid={shareGrid} />);
  return container;
}

describe("ShareGridPreview 문자열→타일 매핑", () => {
  it("행·열 구조가 격자 문자열과 1:1로 대응한다(이모지 서로게이트 쌍 안전)", () => {
    const shareGrid = [
      `${SHARE_GRID_CORRECT}${SHARE_GRID_INCOMPLETE}${SHARE_GRID_GAP}`,
      `${SHARE_GRID_GAP}${SHARE_GRID_CORRECT}${SHARE_GRID_CORRECT}`,
    ].join("\n");

    const container = renderGrid(shareGrid);
    const rows = [...container.querySelectorAll(".shareGridPreviewRow")];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.querySelectorAll(".shareGridTile")).toHaveLength(3);
    }

    const firstRowTiles = [...rows[0].querySelectorAll(".shareGridTile")];
    expect(firstRowTiles[0].className).toContain("shareGridTileCorrect");
    expect(firstRowTiles[1].className).toContain("shareGridTileIncomplete");
    expect(firstRowTiles[2].className).toContain("shareGridTileGap");

    const secondRowTiles = [...rows[1].querySelectorAll(".shareGridTile")];
    expect(secondRowTiles[0].className).toContain("shareGridTileGap");
    expect(secondRowTiles[1].className).toContain("shareGridTileCorrect");
    expect(secondRowTiles[2].className).toContain("shareGridTileCorrect");
  });

  it("buildShareGrid 실제 출력과 1:1 대응하고 정답 글자를 노출하지 않는다", () => {
    // 1행 2열(가/나): "가"만 맞힌 상태.
    const puzzle = {
      puzzleId: "share-grid-test",
      grid: [["가", "나"]],
    } as unknown as Puzzle;
    const shareGrid = buildShareGrid(puzzle, { "0:0": "가" });

    const container = renderGrid(shareGrid);
    const tiles = [...container.querySelectorAll(".shareGridTile")];
    expect(tiles).toHaveLength(2);
    expect(tiles[0].className).toContain("shareGridTileCorrect");
    expect(tiles[1].className).toContain("shareGridTileIncomplete");
    expect(container.textContent).not.toContain("가");
    expect(container.textContent).not.toContain("나");
  });

  it("빈 문자열이면 아무것도 렌더하지 않는다", () => {
    const container = renderGrid("");
    expect(container.querySelector(".shareGridPreview")).toBeNull();
  });
});
