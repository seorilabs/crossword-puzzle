import type { GameSnapshot } from "../../crossword-core/src/gameController.ts";
import type {
  GameContentEntryV1,
  GameContentV1,
} from "../../crossword-core/src/gameContent.ts";

export type BoardCellPresentation = Readonly<{
  col: number;
  completed: boolean;
  entryIds: readonly string[];
  justResolved: boolean;
  key: string;
  row: number;
  selected: boolean;
  value: string | null;
}>;

export type BoardPathPresentation = Readonly<{
  cellKeys: readonly string[];
  completed: boolean;
  direction: GameContentEntryV1["direction"];
  entryId: string;
  justResolved: boolean;
  selected: boolean;
}>;

export type WorldPresentation = Readonly<{
  progress: number;
  restoredLandmarks: number;
  stage: "dormant" | "restoring" | "restored";
  totalLandmarks: number;
}>;

export type PresentationEffect = Readonly<{
  kind: "none" | "word" | "chain" | "board";
  sequence: number;
  entryIds: readonly string[];
}>;

export type CrosswordPresentation = Readonly<{
  board: Readonly<{
    cells: readonly BoardCellPresentation[];
    cols: number;
    paths: readonly BoardPathPresentation[];
    rows: number;
  }>;
  commandSequence: number;
  contentChecksum: string;
  phase: GameSnapshot["phase"];
  puzzleId: string;
  selectedEntryId: string | null;
  suspended: boolean;
  world: WorldPresentation;
  effect: PresentationEffect;
}>;

function getCellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function getEntryCellKeys(entry: GameContentEntryV1): string[] {
  return entry.answerCells.map((_, index) =>
    getCellKey(
      entry.direction === "across" ? entry.row : entry.row + index,
      entry.direction === "across" ? entry.col + index : entry.col,
    ),
  );
}

function getEffect(snapshot: GameSnapshot): PresentationEffect {
  if (snapshot.phase === "board-resolved") {
    return Object.freeze({
      kind: "board",
      sequence: snapshot.commandSequence,
      entryIds: Object.freeze([...snapshot.lastResolvedEntryIds]),
    });
  }

  if (
    snapshot.phase === "word-resolved" &&
    snapshot.lastResolvedEntryIds.length > 0
  ) {
    return Object.freeze({
      kind: snapshot.lastResolvedEntryIds.length > 1 ? "chain" : "word",
      sequence: snapshot.commandSequence,
      entryIds: Object.freeze([...snapshot.lastResolvedEntryIds]),
    });
  }

  return Object.freeze({
    kind: "none",
    sequence: snapshot.commandSequence,
    entryIds: Object.freeze([]),
  });
}

function getWorldPresentation(
  content: GameContentV1,
  snapshot: GameSnapshot,
): WorldPresentation {
  const completed = new Set(snapshot.completedEntryIds);
  const completedCount = content.entries.reduce(
    (count, entry) => count + (completed.has(entry.id) ? 1 : 0),
    0,
  );
  const progress =
    content.entries.length === 0 ? 0 : completedCount / content.entries.length;
  const totalLandmarks = Math.max(
    3,
    Math.min(6, content.worldTriggerSet.length || content.entries.length),
  );
  const restoredLandmarks =
    progress >= 1
      ? totalLandmarks
      : Math.min(totalLandmarks - 1, Math.floor(progress * totalLandmarks));

  return Object.freeze({
    progress,
    restoredLandmarks,
    stage:
      progress === 0 ? "dormant" : progress >= 1 ? "restored" : "restoring",
    totalLandmarks,
  });
}

export function projectGameSnapshot(
  content: GameContentV1,
  snapshot: GameSnapshot,
): CrosswordPresentation {
  if (
    snapshot.puzzleId !== content.puzzleId ||
    snapshot.contentChecksum !== content.contentChecksum ||
    snapshot.contentLocale !== content.contentLocale ||
    snapshot.languageProfileId !== content.languageProfile.id ||
    snapshot.languageProfileVersion !== content.languageProfile.version
  ) {
    throw new Error("snapshot does not match game content identity");
  }

  const completedEntryIds = new Set(snapshot.completedEntryIds);
  const justResolvedEntryIds = new Set(snapshot.lastResolvedEntryIds);
  const cellEntryIds = new Map<string, string[]>();
  const paths = content.entries.map((entry) => {
    const cellKeys = getEntryCellKeys(entry);
    for (const key of cellKeys) {
      const entryIds = cellEntryIds.get(key) ?? [];
      entryIds.push(entry.id);
      cellEntryIds.set(key, entryIds);
    }

    return Object.freeze({
      cellKeys: Object.freeze(cellKeys),
      completed: completedEntryIds.has(entry.id),
      direction: entry.direction,
      entryId: entry.id,
      justResolved: justResolvedEntryIds.has(entry.id),
      selected: snapshot.selectedEntryId === entry.id,
    });
  });

  const cells: BoardCellPresentation[] = [];
  for (const [row, gridRow] of content.grid.entries()) {
    for (const [col, answerCell] of gridRow.entries()) {
      if (answerCell === "") {
        continue;
      }

      const key = getCellKey(row, col);
      const entryIds = cellEntryIds.get(key) ?? [];
      cells.push(
        Object.freeze({
          col,
          completed: entryIds.some((id) => completedEntryIds.has(id)),
          entryIds: Object.freeze([...entryIds]),
          justResolved: entryIds.some((id) => justResolvedEntryIds.has(id)),
          key,
          row,
          selected:
            snapshot.selectedEntryId != null &&
            entryIds.includes(snapshot.selectedEntryId),
          value: snapshot.cellValues[key] ?? null,
        }),
      );
    }
  }

  return Object.freeze({
    board: Object.freeze({
      cells: Object.freeze(cells),
      cols: Math.max(1, ...content.grid.map((row) => row.length)),
      paths: Object.freeze(paths),
      rows: content.grid.length,
    }),
    commandSequence: snapshot.commandSequence,
    contentChecksum: snapshot.contentChecksum,
    effect: getEffect(snapshot),
    phase: snapshot.phase,
    puzzleId: snapshot.puzzleId,
    selectedEntryId: snapshot.selectedEntryId,
    suspended: snapshot.phase === "suspended",
    world: getWorldPresentation(content, snapshot),
  });
}

export function pickEntryForCell(
  cell: Pick<BoardCellPresentation, "entryIds">,
  selectedEntryId: string | null,
): string | null {
  if (cell.entryIds.length === 0) {
    return null;
  }

  if (selectedEntryId == null) {
    return cell.entryIds[0] ?? null;
  }

  const selectedIndex = cell.entryIds.indexOf(selectedEntryId);
  if (selectedIndex < 0) {
    return cell.entryIds[0] ?? null;
  }

  return cell.entryIds[(selectedIndex + 1) % cell.entryIds.length] ?? null;
}
