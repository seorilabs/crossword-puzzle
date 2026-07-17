import type {
  GamePhase,
  GameSnapshot,
} from "../../packages/crossword-core/src/gameController.ts";
import type { GameContentV1 } from "../../packages/crossword-core/src/gameContent.ts";
import type { LanguageProfile } from "../../packages/crossword-core/src/languageProfile.ts";
import { getCellKey, getEntryCells } from "../../packages/crossword-core/src/puzzle.ts";
import type { SaveV2PuzzleSnapshot } from "../../packages/crossword-core/src/saveV2.ts";

function isBoardComplete(
  content: GameContentV1,
  profile: LanguageProfile,
  cellValues: Readonly<Record<string, string>>,
): boolean {
  return (
    content.entries.length > 0 &&
    content.entries.every((entry) =>
      getEntryCells(entry).every((cell, index) => {
        const value = cellValues[getCellKey(cell.row, cell.col)];
        const answerCell = entry.answerCells[index];
        return (
          value != null &&
          answerCell != null &&
          profile.cellsEqual(value, answerCell)
        );
      }),
    )
  );
}

function resolveRestoredPhase(
  saved: SaveV2PuzzleSnapshot,
  boardComplete: boolean,
): GamePhase {
  const phase = saved.phase ?? "active";
  if (boardComplete) {
    return phase === "word-resolved" ||
      phase === "board-resolved" ||
      phase === "result" ||
      phase === "map"
      ? phase
      : "result";
  }

  if (phase === "intro" && Object.keys(saved.cellValues).length === 0) {
    return "intro";
  }
  return "active";
}

export function createRestoredGameSnapshot(
  content: GameContentV1,
  profile: LanguageProfile,
  base: GameSnapshot,
  saved: SaveV2PuzzleSnapshot,
): GameSnapshot {
  return {
    ...base,
    phase: resolveRestoredPhase(
      saved,
      isBoardComplete(content, profile, saved.cellValues),
    ),
    selectedEntryId: saved.currentEntryId,
    cellValues: { ...saved.cellValues },
    commandSequence: saved.commandSequence,
  };
}
