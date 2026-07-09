// 보드/엔트리 셀 내비게이션 순수 함수. AIT WebView(src)와 RN(apps/mobile)이
// 동일하게 사용하므로 core에 단일 정의한다. React/RN/SDK 의존 금지.

import type { Puzzle, PuzzleEntry } from "./types.ts";
import { getCellKey, getEntryCells, getInitialEntryId } from "./puzzle.ts";
import { getAnswerInputLetters } from "./answerInput.ts";

export function getProgressPercent(
  completedCount: number,
  totalCount: number,
): number {
  if (totalCount === 0) {
    return 0;
  }

  return Math.round((completedCount / totalCount) * 100);
}

export function getEntryStartCellKey(entry?: PuzzleEntry): string {
  return entry == null ? "" : getCellKey(entry.row, entry.col);
}

export function getEntryCellIndex(entry: PuzzleEntry, cellKey: string): number {
  const cells = getEntryCells(entry);
  const index = cells.findIndex(
    (cell) => getCellKey(cell.row, cell.col) === cellKey,
  );

  return index === -1 ? 0 : index;
}

export function getEntryCellKeyAt(entry: PuzzleEntry, index: number): string {
  const cells = getEntryCells(entry);
  const safeIndex = Math.max(0, Math.min(cells.length - 1, index));
  const cell = cells[safeIndex];

  return cell == null
    ? getEntryStartCellKey(entry)
    : getCellKey(cell.row, cell.col);
}

// 입력 후 커서가 이동할 다음 빈 칸의 cellKey. 뒤쪽에 빈 칸이 없으면 앞쪽 첫
// 빈 칸으로 되돌아가고, 그것도 없으면 입력 종료 위치에 머문다.
export function getNextAnswerSlotCellKey(
  entry: PuzzleEntry,
  cellValues: Record<string, string>,
  startIndex: number,
  inputLength: number,
): string {
  const cells = getEntryCells(entry);
  const afterInputIndex = Math.min(startIndex + inputLength, cells.length - 1);
  const nextEmptyIndex = cells.findIndex((cell, index) => {
    if (index < afterInputIndex) {
      return false;
    }

    return cellValues[getCellKey(cell.row, cell.col)] == null;
  });

  if (nextEmptyIndex !== -1) {
    return getEntryCellKeyAt(entry, nextEmptyIndex);
  }

  const firstEmptyIndex = cells.findIndex(
    (cell) => cellValues[getCellKey(cell.row, cell.col)] == null,
  );

  return getEntryCellKeyAt(
    entry,
    firstEmptyIndex === -1 ? afterInputIndex : firstEmptyIndex,
  );
}

export function getInitialEntryStartCellKey(puzzle: Puzzle): string {
  const initialEntryId = getInitialEntryId(puzzle);
  const initialEntry =
    puzzle.entries.find((entry) => entry.id === initialEntryId) ??
    puzzle.entries[0];

  return getEntryStartCellKey(initialEntry);
}

export function getCellAnswerLetter(puzzle: Puzzle, cellKey: string): string {
  const [row, col] = cellKey.split(":").map(Number);

  return puzzle.grid[row]?.[col] ?? "";
}

// 커밋된 글자가 정답 그리드와 일치하면 잠금 상태로 본다: 교차 단어 양쪽에서
// 옳은 글자이므로 지우기(backspace/clear)가 건너뛴다.
export function isCellLocked(
  puzzle: Puzzle,
  cellValues: Record<string, string>,
  cellKey: string,
): boolean {
  const value = cellValues[cellKey];

  return value != null && value === getCellAnswerLetter(puzzle, cellKey);
}

// 선택 셀부터 입력값을 채웠을 때 각 셀에 놓일 (cellKey → letter) 맵.
export function getPendingAnswerCellValues(
  entry: PuzzleEntry,
  inputValue: string,
  selectedCellKey: string,
): Record<string, string> {
  const cells = getEntryCells(entry);
  const selectedIndex = getEntryCellIndex(entry, selectedCellKey);
  const pendingLetters = getAnswerInputLetters(
    inputValue,
    cells.length - selectedIndex,
  );

  return Object.fromEntries(
    pendingLetters
      .map((letter, offset) => {
        const cell = cells[selectedIndex + offset];

        return cell == null
          ? null
          : ([getCellKey(cell.row, cell.col), letter] as const);
      })
      .filter((cellEntry): cellEntry is readonly [string, string] => {
        return cellEntry != null;
      }),
  );
}
