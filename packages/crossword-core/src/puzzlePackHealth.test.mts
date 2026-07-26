import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluatePublishedPuzzlePackHealth } from "./puzzlePackHealth.ts";
import type { Puzzle, PuzzleManifest, PuzzleManifestItem } from "./types.ts";

const DATE = "2026-07-26";

function createPuzzle(
  difficulty: Puzzle["difficulty"],
  answer: string,
): Puzzle {
  const gridSize = difficulty === "easy" ? 5 : 8;

  return {
    puzzleId: `puzzle-${difficulty}`,
    date: DATE,
    difficulty,
    gridSize,
    grid: Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => ""),
    ),
    entries: [
      {
        id: `${difficulty}-1`,
        answer,
        clue: `${difficulty} clue`,
        direction: "across",
        row: 0,
        col: 0,
        generatedBy: "placed",
      },
    ],
    metrics: {
      autoRunCount: 0,
      bboxDensity: 0.5,
      crossCells: 0,
      crossRatio: 0.5,
      filledCells: answer.length,
      multiCrossEntries: 0,
      placedWordCount: 1,
      wordCount: 1,
    },
  };
}

function createFixture() {
  const puzzles = {
    easy: createPuzzle("easy", "가나다"),
    normal: createPuzzle("normal", "라마바"),
    hard: createPuzzle("hard", "사아자"),
  };
  const items = Object.values(puzzles).map<PuzzleManifestItem>((puzzle) => ({
    date: puzzle.date,
    difficulty: puzzle.difficulty,
    path: `/puzzles/${puzzle.puzzleId}.json`,
    puzzleId: puzzle.puzzleId,
  }));
  const manifest: PuzzleManifest = {
    diversityThresholds: {
      historyLimit: 7,
      maxSameDateSharedAnswers: 0,
      maxScaffoldSimilarity: 0.75,
      maxSharedAnswerRatio: 0.5,
    },
    puzzles: items,
  };
  const puzzlesByPath = Object.fromEntries(
    items.map((item) => [
      item.path,
      puzzles[item.difficulty as Puzzle["difficulty"]],
    ]),
  );

  return { manifest, puzzles, puzzlesByPath };
}

describe("evaluatePublishedPuzzlePackHealth", () => {
  it("passes a complete easy normal hard pack with no shared answers", () => {
    const fixture = createFixture();

    const result = evaluatePublishedPuzzlePackHealth({
      expectedDate: DATE,
      manifest: fixture.manifest,
      puzzlesByPath: fixture.puzzlesByPath,
    });

    assert.equal(result.pass, true);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.puzzleIds, {
      easy: "puzzle-easy",
      normal: "puzzle-normal",
      hard: "puzzle-hard",
    });
  });

  it("fails when today's hard puzzle is missing", () => {
    const fixture = createFixture();
    fixture.manifest.puzzles = fixture.manifest.puzzles.filter(
      (item) => item.difficulty !== "hard",
    );

    const result = evaluatePublishedPuzzlePackHealth({
      expectedDate: DATE,
      manifest: fixture.manifest,
      puzzlesByPath: fixture.puzzlesByPath,
    });

    assert.equal(result.pass, false);
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code === "missing_difficulty" && issue.difficulty === "hard",
      ),
    );
  });

  it("fails when two difficulty tiers share an answer", () => {
    const fixture = createFixture();
    fixture.puzzles.normal.entries[0].answer =
      fixture.puzzles.easy.entries[0].answer;

    const result = evaluatePublishedPuzzlePackHealth({
      expectedDate: DATE,
      manifest: fixture.manifest,
      puzzlesByPath: fixture.puzzlesByPath,
    });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "shared_answer"));
  });

  it("fails when the published grid size or diversity threshold drifts", () => {
    const fixture = createFixture();
    fixture.puzzles.hard.gridSize = 7;
    fixture.manifest.diversityThresholds = {
      ...fixture.manifest.diversityThresholds!,
      maxSameDateSharedAnswers: 1,
    };

    const result = evaluatePublishedPuzzlePackHealth({
      expectedDate: DATE,
      manifest: fixture.manifest,
      puzzlesByPath: fixture.puzzlesByPath,
    });

    assert.equal(result.pass, false);
    assert.ok(
      result.issues.some((issue) => issue.code === "grid_size_mismatch"),
    );
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "manifest_threshold_mismatch",
      ),
    );
  });
});
