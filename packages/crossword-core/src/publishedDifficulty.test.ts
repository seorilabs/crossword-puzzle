import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO,
  needsManualClueRatio,
} from "./clueCuration.ts";
import { isDifficulty } from "./difficultyProfiles.ts";

type ManifestItem = {
  difficulty?: string | null;
  path: string;
  puzzleId: string;
};

type PublishedPuzzle = {
  difficulty?: string | null;
  entries: { needsManualClue?: boolean }[];
  puzzleId: string;
};

const manifest = JSON.parse(
  readFileSync("public/puzzles/manifest.json", "utf8"),
) as { puzzles: ManifestItem[] };

function readPublishedPuzzle(item: ManifestItem): PublishedPuzzle {
  const filePath = `public/${item.path.replace(/^\//, "")}`;
  return JSON.parse(readFileSync(filePath, "utf8")) as PublishedPuzzle;
}

describe("번들 발행 팩 난이도 계약 (#151)", () => {
  it("manifest 9개 항목의 difficulty가 모두 채워져 있다", () => {
    assert.equal(manifest.puzzles.length, 9);
    assert.equal(
      manifest.puzzles.every((item) => isDifficulty(item.difficulty)),
      true,
    );
  });

  it("번들 발행 팩에 easy와 hard 퍼즐을 각각 1개 포함한다", () => {
    assert.equal(
      manifest.puzzles.filter((item) => item.difficulty === "easy").length,
      1,
    );
    assert.equal(
      manifest.puzzles.filter((item) => item.difficulty === "hard").length,
      1,
    );
  });

  it("validate:puzzles 난이도 일치와 단서 품질 조건을 모든 항목이 충족한다", () => {
    for (const item of manifest.puzzles) {
      const puzzle = readPublishedPuzzle(item);

      assert.equal(
        puzzle.difficulty,
        item.difficulty,
        `${item.puzzleId} manifest와 퍼즐 난이도 불일치`,
      );
      assert.ok(
        needsManualClueRatio(puzzle.entries) <=
          DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO,
        `${item.puzzleId} 미검수 단서 상한 초과`,
      );
    }
  });
});
