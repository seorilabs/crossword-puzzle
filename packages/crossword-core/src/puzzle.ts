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
