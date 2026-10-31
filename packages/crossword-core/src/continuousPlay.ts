import { puzzleLanguage, type ContentLanguage } from "./dailyLanguage.ts";
import type { PuzzleManifestItem } from "./types.ts";

export type PlayableState = {
  completedAt?: string;
  attemptsUsed?: number;
  maxAttempts?: number;
  hasProgress?: boolean;
  lastStartedAt?: string;
};

export function allAvailablePuzzlesCompleted(
  rows: readonly PuzzleManifestItem[],
  states: Readonly<Record<string, PlayableState>>,
  language: ContentLanguage,
  today: string,
  justCompletedId?: string,
): boolean {
  const available = rows.filter(
    (row) => puzzleLanguage(row) === language && row.date <= today,
  );
  return (
    available.length > 0 &&
    available.every(
      (row) =>
        !!states[row.puzzleId]?.completedAt || row.puzzleId === justCompletedId,
    )
  );
}

// A manifest is metadata only. This policy never downloads a board.
export function selectPlayablePuzzle(
  rows: readonly PuzzleManifestItem[],
  states: Readonly<Record<string, PlayableState>>,
  language: ContentLanguage,
  today: string,
  excludeId?: string,
): PuzzleManifestItem | undefined {
  const unique = new Map(rows.map((row) => [row.puzzleId, row]));
  const candidates = [...unique.values()].filter((row) => {
    const state = states[row.puzzleId];
    return (
      puzzleLanguage(row) === language &&
      row.date <= today &&
      row.puzzleId !== excludeId &&
      !state?.completedAt &&
      (state?.attemptsUsed ?? 0) < (state?.maxAttempts ?? 3)
    );
  });
  const rank = (row: PuzzleManifestItem) => {
    const state = states[row.puzzleId];
    return state?.hasProgress || (state?.attemptsUsed ?? 0) > 0
      ? 0
      : row.date === today
        ? 1
        : 2;
  };
  return candidates.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 0
        ? (states[b.puzzleId]?.lastStartedAt ?? "").localeCompare(
            states[a.puzzleId]?.lastStartedAt ?? "",
          )
        : 0) ||
      b.date.localeCompare(a.date) ||
      (a.dailySequence ?? 1) - (b.dailySequence ?? 1) ||
      a.puzzleId.localeCompare(b.puzzleId),
  )[0];
}
