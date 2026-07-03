import type { CSSProperties } from "react";

import type { Puzzle } from "../../packages/crossword-core/src";

type MiniPuzzlePreviewProps = {
  puzzle: Puzzle;
  isLoading?: boolean;
};

// 홈 카드의 미니 미리보기. 보드 전체(모든 행·열)를 실제 보드 폭에 맞춰 렌더한다.
// 열 수는 CSS 변수(--mini-cols)로 실제 폭(puzzle.grid[0].length)을 따르게 해
// 8×8/9×9 퍼즐에서도 마지막 행·열이 잘리지 않고 정사각 비율을 유지한다. 검은칸(빈
// 문자열 셀)은 miniBlock 으로 구분해 퍼즐마다 다른 격자 실루엣이 드러나게 한다.
// 로딩 중에도 같은 보드 크기의 스켈레톤을 보여줘 완료 후 레이아웃이 어긋나지 않는다.
export function MiniPuzzlePreview({ puzzle, isLoading }: MiniPuzzlePreviewProps) {
  const grid = puzzle.grid;
  const columns = grid[0]?.length ?? 0;
  const boardStyle = { "--mini-cols": String(columns) } as CSSProperties;

  if (isLoading) {
    // 스켈레톤도 실제 보드 셀 수만큼 렌더해 고정 7×7(49칸)과 어긋나지 않게 한다.
    const cellCount = grid.reduce((sum, row) => sum + row.length, 0);
    return (
      <div className="miniBoard" style={boardStyle} aria-hidden="true">
        {Array.from({ length: cellCount }, (_, index) => (
          <span key={index} className="miniCell miniCellSkeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="miniBoard" style={boardStyle} aria-hidden="true">
      {grid.flatMap((row, rowIndex) =>
        row.map((cell, colIndex) => (
          <span
            key={`${rowIndex}:${colIndex}`}
            className={cell === "" ? "miniCell miniBlock" : "miniCell"}
          />
        )),
      )}
    </div>
  );
}
