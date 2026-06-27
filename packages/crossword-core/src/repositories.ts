import type { Puzzle, PuzzleManifestItem, SavedProgress } from "./types";

export type PuzzleRepository = {
  listPuzzleSummaries(): Promise<PuzzleManifestItem[]>;
  getPuzzleById(puzzleId: string): Promise<Puzzle | null>;
  getPuzzleForDate(date: string): Promise<Puzzle | null>;
};

export type ProgressRepository = {
  loadProgress(puzzleId: string): Promise<SavedProgress>;
  saveProgress(puzzleId: string, progress: SavedProgress): Promise<void>;
  clearProgress(puzzleId: string): Promise<void>;
};

export function createEmptyProgress(): SavedProgress {
  return { cellValues: {}, earnedHintCredits: 0, hintCount: 0, revealUsed: false };
}
