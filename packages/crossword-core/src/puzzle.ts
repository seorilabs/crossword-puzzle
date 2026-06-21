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
