import type { Puzzle, PuzzleManifest, PuzzleManifestItem } from "./types.ts";

export function normalizePuzzleIdentifier(value: string | number): string {
  return String(value);
}

export function normalizeOptionalPuzzleIdentifier(
  value: string | number | null | undefined,
): string | null | undefined {
  return value == null ? value : normalizePuzzleIdentifier(value);
}

function normalizeOptionalStoredPuzzleIdentifier(
  value: string | number | null | undefined,
): string | undefined {
  return value == null ? undefined : normalizePuzzleIdentifier(value);
}

export function normalizePuzzleIdentifiers(puzzle: Puzzle): Puzzle {
  return {
    ...puzzle,
    alias: normalizeOptionalStoredPuzzleIdentifier(puzzle.alias),
    puzzleId: normalizePuzzleIdentifier(puzzle.puzzleId),
    packId: normalizeOptionalStoredPuzzleIdentifier(puzzle.packId),
    slotId: normalizeOptionalStoredPuzzleIdentifier(puzzle.slotId),
  };
}

export function normalizePuzzleManifestItemIdentifiers(
  item: PuzzleManifestItem,
): PuzzleManifestItem {
  return {
    ...item,
    alias: normalizeOptionalStoredPuzzleIdentifier(item.alias),
    puzzleId: normalizePuzzleIdentifier(item.puzzleId),
    packId: normalizeOptionalStoredPuzzleIdentifier(item.packId),
    slotId: normalizeOptionalStoredPuzzleIdentifier(item.slotId),
  };
}

export function normalizePuzzleManifestIdentifiers(
  manifest: PuzzleManifest,
): PuzzleManifest {
  return {
    ...manifest,
    puzzles: manifest.puzzles.map(normalizePuzzleManifestItemIdentifiers),
  };
}
