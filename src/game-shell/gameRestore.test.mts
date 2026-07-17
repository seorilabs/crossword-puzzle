import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createInitialGameSnapshot } from "../../packages/crossword-core/src/gameController.ts";
import { koKrLanguageProfile } from "../../packages/crossword-core/src/languageProfile.ts";
import { getCellKey, getEntryCells } from "../../packages/crossword-core/src/puzzle.ts";
import type { SaveV2PuzzleSnapshot } from "../../packages/crossword-core/src/saveV2.ts";
import { createRestoredGameSnapshot } from "./gameRestore.ts";
import { loadBundledOnboardingGameContent } from "./onboardingGameContent.ts";

function savedSnapshot(
  phase: SaveV2PuzzleSnapshot["phase"],
  cellValues: Record<string, string>,
): SaveV2PuzzleSnapshot {
  const content = loadBundledOnboardingGameContent();
  return {
    contentLocale: content.contentLocale,
    puzzleId: content.puzzleId,
    contentChecksum: content.contentChecksum,
    currentEntryId: content.entries[0]?.id ?? null,
    cellValues,
    earnedHintCredits: 0,
    hintCount: 0,
    revealUsed: false,
    tentativeCells: [],
    commandSequence: 7,
    phase,
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}

function completedCells(): Record<string, string> {
  const content = loadBundledOnboardingGameContent();
  const cells: Record<string, string> = {};
  for (const entry of content.entries) {
    for (const [index, cell] of getEntryCells(entry).entries()) {
      cells[getCellKey(cell.row, cell.col)] = entry.answerCells[index] ?? "";
    }
  }
  return cells;
}

describe("game snapshot restart recovery", () => {
  test("구버전 active 완료 보드는 result로 복원해 소프트락을 막는다", () => {
    const content = loadBundledOnboardingGameContent();
    const saved = savedSnapshot(undefined, completedCells());
    const restored = createRestoredGameSnapshot(
      content,
      koKrLanguageProfile,
      createInitialGameSnapshot(content),
      saved,
    );
    assert.equal(restored.phase, "result");
  });

  test("완료 보드의 저장된 map 단계는 유지한다", () => {
    const content = loadBundledOnboardingGameContent();
    const restored = createRestoredGameSnapshot(
      content,
      koKrLanguageProfile,
      createInitialGameSnapshot(content),
      savedSnapshot("map", completedCells()),
    );
    assert.equal(restored.phase, "map");
  });

  test("미완료 보드의 result/map 위조 상태는 active로 내린다", () => {
    const content = loadBundledOnboardingGameContent();
    const restored = createRestoredGameSnapshot(
      content,
      koKrLanguageProfile,
      createInitialGameSnapshot(content),
      savedSnapshot("map", {}),
    );
    assert.equal(restored.phase, "active");
  });
});
