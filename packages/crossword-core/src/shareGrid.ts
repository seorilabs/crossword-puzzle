import { getBounds, getCellKey } from "./puzzle.ts";
import type { Puzzle } from "./types.ts";

// 완성 칸(정답 글자와 일치): 초록 사각형.
export const SHARE_GRID_CORRECT = "🟩";
// 미완성 칸(빈칸 또는 오답으로 채워진 칸): 흰 사각형.
export const SHARE_GRID_INCOMPLETE = "⬜";
// 단어가 지나지 않는 그리드 공백. 이모지 사각형과 폭을 맞춘 전각 공백(U+3000)으로
// "비워" 채운 영역의 실루엣만 남긴다(정답 글자는 절대 포함하지 않는다).
export const SHARE_GRID_GAP = "　";

// 결과 공유용 이모지 격자를 만든다(Wordle식). 정답 글자는 노출하지 않고 완성/미완성/
// 공백만 색으로 표현한다. 보드가 큰 경우에도 줄이 과도하게 길어지지 않도록 채워진
// 최소 직사각형(getBounds bbox)만 렌더한다. 3마켓(웹/모바일)이 공유하는 순수 함수다.
export function buildShareGrid(
  puzzle: Puzzle,
  cellValues: Record<string, string>,
): string {
  const { grid } = puzzle;
  const { minRow, maxRow, minCol, maxCol } = getBounds(puzzle);

  const rows: string[] = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    let line = "";
    for (let col = minCol; col <= maxCol; col += 1) {
      const answer = grid[row]?.[col] ?? "";
      if (answer === "") {
        line += SHARE_GRID_GAP;
        continue;
      }
      const value = cellValues[getCellKey(row, col)];
      line += value === answer ? SHARE_GRID_CORRECT : SHARE_GRID_INCOMPLETE;
    }
    rows.push(line);
  }

  return rows.join("\n");
}
