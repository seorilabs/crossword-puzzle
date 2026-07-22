import type {
  Bounds,
  CellCoordinate,
  Direction,
  Puzzle,
  PuzzleEntryReference,
  PuzzleEntry,
  PuzzleSlot,
  PuzzleSlotValidation,
  ReviewEntry,
} from "./types";

export function getCellKey(row: number, col: number) {
  return `${row}:${col}`;
}

export function getTodayDateKey(timeZone = "Asia/Seoul", date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone });
}

export function getEntryCells(entry: PuzzleEntry): CellCoordinate[] {
  return [...entry.answer].map((_, index) => ({
    row: entry.direction === "across" ? entry.row : entry.row + index,
    col: entry.direction === "across" ? entry.col + index : entry.col,
  }));
}

function getDirectionDelta(direction: Direction) {
  return direction === "across" ? [0, 1] : [1, 0];
}

function isFilledCell(cell: string | undefined) {
  return cell != null && cell !== "";
}

function isInGrid(grid: string[][], row: number, col: number) {
  return row >= 0 && row < grid.length && col >= 0 && col < grid[row].length;
}

function getSlotKey(slot: Pick<PuzzleSlot, "col" | "direction" | "row">) {
  return `${slot.direction}:${slot.row}:${slot.col}`;
}

function getEntryReference(entry: PuzzleEntry): PuzzleEntryReference {
  return {
    answer: entry.answer,
    col: entry.col,
    direction: entry.direction,
    id: entry.id,
    row: entry.row,
  };
}

export function scanPuzzleSlots(grid: string[][]): PuzzleSlot[] {
  const slots: PuzzleSlot[] = [];

  for (const direction of ["across", "down"] as Direction[]) {
    const [rowDelta, colDelta] = getDirectionDelta(direction);

    for (let row = 0; row < grid.length; row += 1) {
      for (let col = 0; col < grid[row].length; col += 1) {
        if (!isFilledCell(grid[row][col])) {
          continue;
        }

        const beforeRow = row - rowDelta;
        const beforeCol = col - colDelta;

        if (
          isInGrid(grid, beforeRow, beforeCol) &&
          isFilledCell(grid[beforeRow][beforeCol])
        ) {
          continue;
        }

        const cells: CellCoordinate[] = [];
        let currentRow = row;
        let currentCol = col;

        while (
          isInGrid(grid, currentRow, currentCol) &&
          isFilledCell(grid[currentRow][currentCol])
        ) {
          cells.push({ row: currentRow, col: currentCol });
          currentRow += rowDelta;
          currentCol += colDelta;
        }

        if (cells.length >= 2) {
          slots.push({
            answer: cells.map((cell) => grid[cell.row][cell.col]).join(""),
            cells,
            col,
            direction,
            row,
          });
        }
      }
    }
  }

  return slots;
}

export function validatePuzzleSlots(puzzle: Puzzle): PuzzleSlotValidation {
  const slots = scanPuzzleSlots(puzzle.grid);
  const slotsByKey = new Map(slots.map((slot) => [getSlotKey(slot), slot]));
  const entriesByKey = new Map<string, PuzzleEntry[]>();

  for (const entry of puzzle.entries) {
    const key = getSlotKey(entry);
    entriesByKey.set(key, [...(entriesByKey.get(key) ?? []), entry]);
  }

  const missingEntries = slots.filter(
    (slot) => (entriesByKey.get(getSlotKey(slot))?.length ?? 0) === 0,
  );
  const duplicateEntries = Array.from(entriesByKey.entries())
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => {
      const [direction, row, col] = key.split(":");
      return {
        col: Number(col),
        direction: direction as Direction,
        entries: entries.map(getEntryReference),
        row: Number(row),
      };
    });
  const entryWithoutSlots = puzzle.entries
    .filter((entry) => !slotsByKey.has(getSlotKey(entry)))
    .map(getEntryReference);
  const answerMismatches = puzzle.entries.flatMap((entry) => {
    const slot = slotsByKey.get(getSlotKey(entry));

    if (slot == null || slot.answer === entry.answer) {
      return [];
    }

    return [{ entry: getEntryReference(entry), slot }];
  });

  return {
    answerMismatches,
    duplicateEntries,
    entryWithoutSlots,
    missingEntries,
    pass:
      missingEntries.length === 0 &&
      duplicateEntries.length === 0 &&
      entryWithoutSlots.length === 0 &&
      answerMismatches.length === 0,
    slots,
  };
}

export function getBounds(puzzle: Puzzle): Bounds {
  const occupiedCells = puzzle.grid.flatMap((row, rowIndex) =>
    row.flatMap((cell, colIndex) =>
      cell === "" ? [] : [{ row: rowIndex, col: colIndex }],
    ),
  );

  if (occupiedCells.length === 0) {
    return { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 };
  }

  return {
    minRow: Math.min(...occupiedCells.map((cell) => cell.row)),
    maxRow: Math.max(...occupiedCells.map((cell) => cell.row)),
    minCol: Math.min(...occupiedCells.map((cell) => cell.col)),
    maxCol: Math.max(...occupiedCells.map((cell) => cell.col)),
  };
}

export function getInitialEntryId(puzzle: Puzzle) {
  return puzzle.entries[0]?.id ?? "";
}

export function buildCellEntries(entries: PuzzleEntry[]) {
  const entriesByCell = new Map<string, PuzzleEntry[]>();

  for (const entry of entries) {
    for (const cell of getEntryCells(entry)) {
      const key = getCellKey(cell.row, cell.col);
      entriesByCell.set(key, [...(entriesByCell.get(key) ?? []), entry]);
    }
  }

  return entriesByCell;
}

// 한 글자 힌트로 공개할 칸의 인덱스를 고른다(선택 단어의 셀 배열 기준).
// 미충족(빈칸 또는 오답) 칸만 후보로 하고, 교차 칸(해당 셀을 지나는 entry가 2개
// 이상)을 우선한다. 교차 칸을 공개하면 세로·가로 두 단어에 모두 도움이 되어 힌트
// 1개의 체감 가치와 연쇄 해금 기대값이 커진다. 교차 후보가 여럿이면 위치가 앞선
// 칸을, 교차 후보가 없으면 기존대로 앞선 미충족 칸을 고른다. 미충족 칸이 없으면 -1.
export function pickHintCellIndex(
  entry: PuzzleEntry,
  cellValues: Record<string, string>,
  cellEntries: Map<string, PuzzleEntry[]>,
): number {
  const cells = getEntryCells(entry);
  const answerLetters = [...entry.answer];

  let firstUnmetIndex = -1;
  for (let index = 0; index < cells.length; index += 1) {
    const key = getCellKey(cells[index].row, cells[index].col);
    if (cellValues[key] === answerLetters[index]) {
      continue; // 이미 정답인 칸은 건너뛴다.
    }
    if (firstUnmetIndex === -1) {
      firstUnmetIndex = index;
    }
    if ((cellEntries.get(key)?.length ?? 0) >= 2) {
      // 앞선 교차 미충족 칸을 찾으면 즉시 채택한다(위치 우선).
      return index;
    }
  }

  return firstUnmetIndex;
}

export function buildStartLabels(entries: PuzzleEntry[]) {
  const labels = new Map<string, number>();
  const startCells = Array.from(
    new Map(
      entries.map((entry) => [
        getCellKey(entry.row, entry.col),
        { row: entry.row, col: entry.col },
      ]),
    ).values(),
  ).sort((left, right) => left.row - right.row || left.col - right.col);

  startCells.forEach((cell, index) => {
    labels.set(getCellKey(cell.row, cell.col), index + 1);
  });

  return labels;
}

export function getCompletedEntries(
  entries: PuzzleEntry[],
  cellValues: Record<string, string>,
) {
  return entries.filter((entry) =>
    getEntryCells(entry).every((cell, index) => {
      const answerLetter = [...entry.answer][index];
      return cellValues[getCellKey(cell.row, cell.col)] === answerLetter;
    }),
  );
}

export function getEntryAnswerValue(
  entry: PuzzleEntry,
  cellValues: Record<string, string>,
) {
  return getEntryCells(entry)
    .map((cell) => cellValues[getCellKey(cell.row, cell.col)] ?? "")
    .join("");
}

// 남은 미완성 단어 중 entries 순서상 첫 단서를 돌려준다(#280). 완료 직전 마무리
// 넛지 수락 시 이 단어로 선택·하이라이트를 이동시킨다. 모두 완성됐으면 undefined.
export function getFirstIncompleteEntry(
  entries: readonly PuzzleEntry[],
  cellValues: Record<string, string>,
): PuzzleEntry | undefined {
  return entries.find(
    (entry) => getEntryAnswerValue(entry, cellValues) !== entry.answer,
  );
}

export type WordCheckResult = {
  // 단어를 이루는 모든 셀 키(강조 대상)
  cellKeys: string[];
  // 글자가 입력된 셀 수
  filledCount: number;
  // 입력된 글자 중 정답과 다른 셀 수
  wrongCount: number;
};

// "이 단어 확인"의 순수 계산부: 선택 단어의 강조 대상 셀 키와 입력/오답 수를
// 돌려준다(타이머·렌더 같은 부수효과는 호출부에서 처리).
export function getWordCheckResult(
  entry: PuzzleEntry,
  cellValues: Record<string, string>,
): WordCheckResult {
  const answerLetters = [...entry.answer];
  const cellKeys: string[] = [];
  let filledCount = 0;
  let wrongCount = 0;

  getEntryCells(entry).forEach((cell, index) => {
    const key = getCellKey(cell.row, cell.col);
    cellKeys.push(key);
    const value = cellValues[key];
    if (value != null) {
      filledCount += 1;
      if (value !== answerLetters[index]) {
        wrongCount += 1;
      }
    }
  });

  return { cellKeys, filledCount, wrongCount };
}

export function getEntryCellDistance(
  entry: PuzzleEntry,
  targetEntry: PuzzleEntry,
) {
  const cells = getEntryCells(entry);
  const targetCells = getEntryCells(targetEntry);
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const cell of cells) {
    for (const targetCell of targetCells) {
      const distance =
        Math.abs(cell.row - targetCell.row) +
        Math.abs(cell.col - targetCell.col);

      if (distance < nearestDistance) {
        nearestDistance = distance;
      }
    }
  }

  return nearestDistance;
}

export function getEntryCenterDistance(
  entry: PuzzleEntry,
  targetEntry: PuzzleEntry,
) {
  const cells = getEntryCells(entry);
  const targetCells = getEntryCells(targetEntry);
  const center = cells.reduce(
    (total, cell) => ({
      row: total.row + cell.row / cells.length,
      col: total.col + cell.col / cells.length,
    }),
    { row: 0, col: 0 },
  );
  const targetCenter = targetCells.reduce(
    (total, cell) => ({
      row: total.row + cell.row / targetCells.length,
      col: total.col + cell.col / targetCells.length,
    }),
    { row: 0, col: 0 },
  );

  return (
    Math.abs(center.row - targetCenter.row) +
    Math.abs(center.col - targetCenter.col)
  );
}

// 한 단어 완성 후 다음 포커스 대상 결정: 방금 완성한 단어(currentEntry)와
// 셀 거리가 가장 가까운 미완성 단어를 고른다. 교차(셀 공유) 단어는 거리 0이라
// 항상 1순위가 되고, 동률이면 중심 거리 → 배열 순서로 정렬한다.
export function getNearestUncompletedEntry(
  entries: PuzzleEntry[],
  cellValues: Record<string, string>,
  currentEntry: PuzzleEntry,
) {
  const completedEntryIds = new Set(
    getCompletedEntries(entries, cellValues).map((entry) => entry.id),
  );

  return entries
    .map((entry, index) => ({
      cellDistance: getEntryCellDistance(currentEntry, entry),
      centerDistance: getEntryCenterDistance(currentEntry, entry),
      entry,
      index,
    }))
    .filter(
      ({ entry }) =>
        (!completedEntryIds.has(currentEntry.id) ||
          entry.id !== currentEntry.id) &&
        !completedEntryIds.has(entry.id),
    )
    .sort(
      (a, b) =>
        a.cellDistance - b.cellDistance ||
        a.centerDistance - b.centerDistance ||
        a.index - b.index,
    )[0]?.entry;
}

// 한 단어 완성 후 다음 포커스: "마지막으로 입력한 칸(anchorCellKey)"을 지나는
// 교차(수직) 미완성 단어를 우선한다. anchor 칸부터 단어 시작 쪽으로 역순 훑고,
// 이어서 anchor 뒤쪽 칸을 훑어 첫 교차 미완성 단어를 고른다. 완성 단어를 지나는
// 교차 미완성 단어가 하나도 없으면 거리 기반(getNearestUncompletedEntry)으로 폴백한다.
export function getNextFocusEntryAfterCompletion(
  entries: PuzzleEntry[],
  cellValues: Record<string, string>,
  completedEntry: PuzzleEntry,
  anchorCellKey: string | null,
) {
  const completedEntryIds = new Set(
    getCompletedEntries(entries, cellValues).map((entry) => entry.id),
  );
  const cellKeys = getEntryCells(completedEntry).map((cell) =>
    getCellKey(cell.row, cell.col),
  );

  let anchorIndex =
    anchorCellKey != null ? cellKeys.indexOf(anchorCellKey) : -1;
  if (anchorIndex < 0) {
    anchorIndex = cellKeys.length - 1;
  }

  // anchor → 단어 시작 방향(역순), 그다음 anchor 뒤쪽 칸 순서로 방문한다.
  const visitOrder = [
    ...cellKeys.slice(0, anchorIndex + 1).reverse(),
    ...cellKeys.slice(anchorIndex + 1),
  ];

  for (const key of visitOrder) {
    const crossing = entries.find(
      (entry) =>
        entry.id !== completedEntry.id &&
        entry.direction !== completedEntry.direction &&
        !completedEntryIds.has(entry.id) &&
        getEntryCells(entry).some(
          (cell) => getCellKey(cell.row, cell.col) === key,
        ),
    );

    if (crossing != null) {
      return crossing;
    }
  }

  return getNearestUncompletedEntry(entries, cellValues, completedEntry);
}

export function buildReviewEntries(
  entries: PuzzleEntry[],
  entriesByCell: Map<string, PuzzleEntry[]>,
): ReviewEntry[] {
  return entries.map((entry) => {
    const crossPoints = getEntryCells(entry)
      .filter(
        (cell) =>
          (entriesByCell.get(getCellKey(cell.row, cell.col))?.length ?? 0) > 1,
      )
      .map((cell) => `${cell.row + 1},${cell.col + 1}`);

    return {
      ...entry,
      crossPoints,
    };
  });
}
