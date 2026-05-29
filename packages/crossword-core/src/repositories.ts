import type { Puzzle, PuzzleManifestItem, SavedProgress } from "./types";

export type PuzzleRepository = {
  listPuzzleSummaries(): Promise<PuzzleManifestItem[]>;
  getPuzzleForDate(date: string): Promise<Puzzle | null>;
};

export type ProgressRepository = {
  loadProgress(puzzleId: string): Promise<SavedProgress>;
  saveProgress(puzzleId: string, progress: SavedProgress): Promise<void>;
  clearProgress(puzzleId: string): Promise<void>;
};

export function createEmptyProgress(): SavedProgress {
  return { cellValues: {}, hintCount: 0 };
}
