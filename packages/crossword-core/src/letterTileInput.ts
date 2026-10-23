import { getCellKey, getEntryCells } from "./puzzle.ts";
import type { LetterTileProgress, Puzzle, PuzzleEntry } from "./types.ts";

export const TILE_INPUT_POLICY_VERSION = "syllable-v1";
export type LetterTileState = {
  cellValues: Record<string, string>;
  progress: LetterTileProgress;
  status: "idle" | "repair" | "correct";
};
export type LetterTile = { id: string; letter: string; used: boolean };
const units = (value: string) => [...value.normalize("NFC")];
const keysOf = (entry: PuzzleEntry) =>
  getEntryCells(entry).map((c) => getCellKey(c.row, c.col));
const answerAt = (puzzle: Puzzle, key: string) => {
  const [row, col] = key.split(":").map(Number);
  return puzzle.grid[row]?.[col] ?? "";
};
const complete = (entry: PuzzleEntry, values: Record<string, string>) =>
  keysOf(entry).every((key, i) => values[key] === units(entry.answer)[i]);

export function normalizeLetterTileProgress(
  value: unknown,
): LetterTileProgress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (
    row.version !== 1 ||
    typeof row.entryId !== "string" ||
    typeof row.activeCellKey !== "string" ||
    !Array.isArray(row.confirmedCells) ||
    !row.confirmedCells.every((k) => typeof k === "string") ||
    !Array.isArray(row.selectionHistory) ||
    !row.selectionHistory.every((k) => typeof k === "string")
  )
    return undefined;
  return {
    version: 1,
    confirmedCells: [...new Set(row.confirmedCells)],
    selectionHistory: [...row.selectionHistory],
    entryId: row.entryId,
    activeCellKey: row.activeCellKey,
  };
}

function firstEditable(
  entry: PuzzleEntry,
  values: Record<string, string>,
  locked: ReadonlySet<string>,
) {
  const keys = keysOf(entry);
  return (
    keys.find((key) => !values[key] && !locked.has(key)) ??
    keys.find((key) => !locked.has(key)) ??
    ""
  );
}

export function createLetterTileState(
  puzzle: Puzzle,
  values: Record<string, string> = {},
  metadata?: unknown,
): LetterTileState {
  const saved = normalizeLetterTileProgress(metadata);
  const occupied = new Set(puzzle.entries.flatMap(keysOf));
  // Old clients already treated correct letters as locked. Preserve that state.
  const confirmed = new Set(
    (saved?.confirmedCells ?? Object.keys(values)).filter(
      (key) =>
        occupied.has(key) &&
        values[key] !== undefined &&
        values[key] === answerAt(puzzle, key),
    ),
  );
  for (const entry of puzzle.entries)
    if (complete(entry, values))
      keysOf(entry).forEach((key) => confirmed.add(key));
  const entry =
    puzzle.entries.find((e) => e.id === saved?.entryId) ??
    puzzle.entries.find((e) => !complete(e, values)) ??
    puzzle.entries[0];
  const entryKeys = entry ? keysOf(entry) : [];
  const active =
    saved?.activeCellKey &&
    entryKeys.includes(saved.activeCellKey) &&
    !confirmed.has(saved.activeCellKey)
      ? saved.activeCellKey
      : entry
        ? firstEditable(entry, values, confirmed)
        : "";
  return {
    cellValues: { ...values },
    status: "idle",
    progress: {
      version: 1,
      confirmedCells: [...confirmed],
      entryId: entry?.id ?? "",
      activeCellKey: active,
      selectionHistory: (saved?.selectionHistory ?? []).filter(
        (key) => occupied.has(key) && values[key] && !confirmed.has(key),
      ),
    },
  };
}

function seed(value: string) {
  let result = 2166136261;
  for (const letter of value)
    result = Math.imul(result ^ letter.codePointAt(0)!, 16777619);
  return result >>> 0;
}
function shuffle<T>(items: T[], initial: number): T[] {
  const result = [...items];
  let n = initial || 1;
  for (let i = result.length - 1; i > 0; i--) {
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    const j = (n >>> 0) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getLetterTiles(
  puzzle: Puzzle,
  state: LetterTileState,
  entryId = state.progress.entryId,
): LetterTile[] {
  const entry = puzzle.entries.find((e) => e.id === entryId);
  if (!entry) return [];
  const letters = units(entry.answer);
  const fallback = /^[A-Za-z]+$/.test(entry.answer)
    ? [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
    : [..."가나다라마바사아자차카타파하"];
  const extras = shuffle(
    [
      ...new Set([
        ...puzzle.entries.flatMap((e) => units(e.answer)),
        ...fallback,
      ]),
    ].filter((letter) => !letters.includes(letter)),
    seed(entry.id + "extras"),
  ).slice(0, 2);
  const pieces = shuffle(
    [
      ...letters.map((letter, i) => ({
        id: `answer-${i}`,
        letter,
        used: false,
      })),
      ...extras.map((letter, i) => ({ id: `extra-${i}`, letter, used: false })),
    ],
    seed(puzzle.puzzleId + ":" + entry.id),
  );
  for (const key of keysOf(entry)) {
    const piece = pieces.find(
      (t) => !t.used && t.letter === state.cellValues[key],
    );
    if (piece) piece.used = true;
  }
  return pieces;
}

function finishEdit(puzzle: Puzzle, state: LetterTileState): LetterTileState {
  const entry = puzzle.entries.find((e) => e.id === state.progress.entryId);
  if (!entry) return state;
  const keys = keysOf(entry),
    locked = new Set(state.progress.confirmedCells);
  const values = { ...state.cellValues };
  const full = keys.every((key) => values[key]);
  let status: LetterTileState["status"] = "idle";
  if (full) {
    status = complete(entry, values) ? "correct" : "repair";
    keys.forEach((key, i) => {
      if (values[key] === units(entry.answer)[i]) locked.add(key);
      else delete values[key];
    });
  }
  const progress = {
    ...state.progress,
    confirmedCells: [...locked],
    selectionHistory: full
      ? state.progress.selectionHistory.filter((key) => !keys.includes(key))
      : state.progress.selectionHistory,
  };
  const next = createLetterTileState(puzzle, values, progress);
  next.progress.activeCellKey = firstEditable(
    entry,
    values,
    new Set(next.progress.confirmedCells),
  );
  return { ...next, status };
}

export function chooseLetterTile(
  puzzle: Puzzle,
  state: LetterTileState,
  tileId: string,
): LetterTileState {
  const entry = puzzle.entries.find((e) => e.id === state.progress.entryId);
  const tile = getLetterTiles(puzzle, state).find(
    (t) => t.id === tileId && !t.used,
  );
  if (!entry || !tile || complete(entry, state.cellValues)) return state;
  const locked = new Set(state.progress.confirmedCells),
    keys = keysOf(entry);
  const key =
    keys.includes(state.progress.activeCellKey) &&
    !locked.has(state.progress.activeCellKey)
      ? state.progress.activeCellKey
      : firstEditable(entry, state.cellValues, locked);
  if (!key) return state;
  return finishEdit(puzzle, {
    ...state,
    cellValues: { ...state.cellValues, [key]: tile.letter },
    progress: {
      ...state.progress,
      selectionHistory: [...state.progress.selectionHistory, key],
    },
  });
}

export function clearLetterTile(
  puzzle: Puzzle,
  state: LetterTileState,
  cellKey?: string,
): LetterTileState {
  const entry = puzzle.entries.find((e) => e.id === state.progress.entryId);
  if (!entry) return state;
  const locked = new Set(state.progress.confirmedCells),
    keys = keysOf(entry);
  const editable = (key: string) => keys.includes(key) && !locked.has(key);
  const key =
    cellKey !== undefined
      ? editable(cellKey)
        ? cellKey
        : undefined
      : ([...state.progress.selectionHistory]
          .reverse()
          .find((k) => editable(k) && state.cellValues[k]) ??
        [...keys].reverse().find((k) => editable(k) && state.cellValues[k]));
  if (!key) return state;
  const values = { ...state.cellValues };
  delete values[key];
  return {
    cellValues: values,
    status: "idle",
    progress: {
      ...state.progress,
      activeCellKey: key,
      selectionHistory: state.progress.selectionHistory.filter(
        (k) => k !== key,
      ),
    },
  };
}

export function confirmLetterTileCell(
  puzzle: Puzzle,
  state: LetterTileState,
  cellKey: string,
): LetterTileState {
  if (
    !state.cellValues[cellKey] ||
    state.cellValues[cellKey] !== answerAt(puzzle, cellKey)
  )
    return state;
  return finishEdit(puzzle, {
    ...state,
    progress: {
      ...state.progress,
      confirmedCells: [...new Set([...state.progress.confirmedCells, cellKey])],
    },
  });
}

export function recommendLetterEntry(
  puzzle: Puzzle,
  state: LetterTileState,
  preferredEntryIds: readonly string[] = [],
): string | undefined {
  const remaining = puzzle.entries.filter(
    (entry) => !complete(entry, state.cellValues),
  );
  const preferred = preferredEntryIds.find((id) =>
    remaining.some((entry) => entry.id === id),
  );
  if (preferred) return preferred;
  const locked = new Set(state.progress.confirmedCells);
  const ratio = (entry: PuzzleEntry) =>
    keysOf(entry).filter((key) => locked.has(key)).length /
    units(entry.answer).length;
  return [...remaining].sort(
    (a, b) =>
      ratio(b) - ratio(a) || units(a.answer).length - units(b.answer).length,
  )[0]?.id;
}
