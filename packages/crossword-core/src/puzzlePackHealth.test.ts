import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createEmptyAnswerHistory,
  upsertAnswerHistory,
} from "./answerHistory.ts";
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
  it("AC-1 공개 manifest에 Easy Normal Hard가 정확히 한 판씩 있으면 통과한다", () => {
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
      hard: "puzzle-hard",
    });
  });

  it("AC-1 오늘 Hard 퍼즐이 없으면 missing_difficulty로 실패한다", () => {
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

  it("AC-1 같은 날짜와 난이도 퍼즐이 둘이면 duplicate_difficulty로 실패한다", () => {
    const fixture = createFixture();
    fixture.manifest.puzzles.push({
      ...fixture.manifest.puzzles[0],
      path: "/puzzles/puzzle-easy-duplicate.json",
      puzzleId: "puzzle-easy-duplicate",
    });

    const result = evaluatePublishedPuzzlePackHealth({
      expectedDate: DATE,
      manifest: fixture.manifest,
      puzzlesByPath: fixture.puzzlesByPath,
    });

    assert.equal(result.pass, false);
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code === "duplicate_difficulty" && issue.difficulty === "easy",
      ),
    );
  });

  it("AC-4 당일 두 난이도 정답 교집합이 있으면 shared_answer로 실패한다", () => {
    const fixture = createFixture();
    fixture.puzzles.hard.entries[0].answer =
      fixture.puzzles.easy.entries[0].answer;

    const result = evaluatePublishedPuzzlePackHealth({
      expectedDate: DATE,
      manifest: fixture.manifest,
      puzzlesByPath: fixture.puzzlesByPath,
    });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "shared_answer"));
  });

  it("오늘 정답이 90일 안의 다른 날짜·다른 난이도 퍼즐에 있었으면 repeated_answer로 실패한다", () => {
    const fixture = createFixture();
    // 40일 전 hard 퍼즐이 오늘 easy 정답("가나다")을 이미 썼다 — 난이도 교차·과거 반복.
    const answerHistory = upsertAnswerHistory(
      createEmptyAnswerHistory(90),
      [
        {
          puzzleId: "puzzle-hard-old",
          date: "2026-06-16",
          difficulty: "hard",
          slotId: "2026-06-16-h01",
          answers: ["가나다", "마바사"],
        },
      ],
      { retentionDays: 90, today: DATE },
    );

    const result = evaluatePublishedPuzzlePackHealth({
      expectedDate: DATE,
      manifest: fixture.manifest,
      puzzlesByPath: fixture.puzzlesByPath,
      answerHistory,
      answerHistoryDays: 90,
    });

    assert.equal(result.pass, false);
    const repeated = result.issues.filter(
      (issue) => issue.code === "repeated_answer",
    );
    assert.equal(repeated.length, 1);
    assert.equal(repeated[0].difficulty, "easy");
    assert.match(repeated[0].detail, /"가나다"/);
    assert.match(repeated[0].detail, /puzzle-hard-old/);
    assert.match(repeated[0].detail, /40d/);
  });

  it("이력이 오늘 두 판 자신만 담고 있으면 repeated_answer 없이 통과한다", () => {
    const fixture = createFixture();
    const answerHistory = upsertAnswerHistory(
      createEmptyAnswerHistory(90),
      Object.values(fixture.puzzles).map((puzzle) => ({
        puzzleId: puzzle.puzzleId,
        date: puzzle.date,
        difficulty: puzzle.difficulty,
        answers: puzzle.entries.map((entry) => entry.answer),
      })),
      { retentionDays: 90, today: DATE },
    );

    const result = evaluatePublishedPuzzlePackHealth({
      expectedDate: DATE,
      manifest: fixture.manifest,
      puzzlesByPath: fixture.puzzlesByPath,
      answerHistory,
    });

    assert.equal(result.pass, true, JSON.stringify(result.issues));
  });

  it("이력이 발행되지 않았으면(null) missing_answer_history로 실패하고, 인자를 생략하면 검사하지 않는다", () => {
    const fixture = createFixture();

    const missing = evaluatePublishedPuzzlePackHealth({
      expectedDate: DATE,
      manifest: fixture.manifest,
      puzzlesByPath: fixture.puzzlesByPath,
      answerHistory: null,
    });
    assert.equal(missing.pass, false);
    assert.ok(
      missing.issues.some((issue) => issue.code === "missing_answer_history"),
    );

    const legacy = evaluatePublishedPuzzlePackHealth({
      expectedDate: DATE,
      manifest: fixture.manifest,
      puzzlesByPath: fixture.puzzlesByPath,
    });
    assert.equal(legacy.pass, true);
  });

  it("AC-3 manifest와 puzzle metadata가 다르면 실패한다", () => {
    const fixture = createFixture();
    fixture.puzzles.hard.puzzleId = "unexpected-hard-id";

    const result = evaluatePublishedPuzzlePackHealth({
      expectedDate: DATE,
      manifest: fixture.manifest,
      puzzlesByPath: fixture.puzzlesByPath,
    });

    assert.equal(result.pass, false);
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code === "puzzle_metadata_mismatch" &&
          issue.difficulty === "hard",
      ),
    );
  });

  it("AC-2 Easy는 5x5 Hard는 8x8 규격을 강제한다", () => {
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

// 운영 장애 회귀 가드(2026-08-18). 난이도를 2단계로 줄인 배포에서 generator 이미지만
// 갱신하고 health Job 을 두는 바람에 health 가 옛 코드로 검사해 실패했다. 고친 뒤에도
// PASS 로그에 easy/normal/hard 가 하드코딩돼 있어 normal=undefined 가 찍혔다.
describe("health 검사 운영 계약", () => {
  const healthSource = readFileSync(
    new URL("../../../server/batch/check-puzzle-pack-health.mjs", import.meta.url),
    "utf8",
  );
  const runbook = readFileSync(
    new URL("../../../docs/puzzle-pack-cloud-run.md", import.meta.url),
    "utf8",
  );

  it("PASS 로그가 티어 구성을 하드코딩하지 않는다", () => {
    // 티어가 바뀌면 로그도 따라가야 한다. 출처는 DIFFICULTY_ORDER 하나여야 한다.
    assert.match(healthSource, /DIFFICULTY_ORDER/);
    assert.equal(
      /easy=\$\{|normal=\$\{|hard=\$\{/.test(healthSource),
      false,
      "PASS 로그에 티어 이름을 직접 박아 두면 티어 변경 때 잔재가 남는다",
    );
  });

  it("폐지된 normal 을 로그·검사에서 참조하지 않는다", () => {
    assert.equal(healthSource.includes("puzzleIds.normal"), false);
  });

  it("두 Job 이 같은 이미지를 쓴다는 배포 주의가 런북에 있다", () => {
    assert.match(runbook, /두 Job은 같은 이미지를 쓴다/);
    assert.match(runbook, /crossword-puzzle-pack-health/);
  });

  it("health 는 발행 정답 이력을 읽어 교차·과거 반복을 검사하고 런북이 이를 설명한다", () => {
    assert.match(healthSource, /resolveAnswerHistoryUrl\(baseUrl\)/);
    assert.match(healthSource, /parseAnswerHistory\(/);
    // 항목 일부가 손상된 이력은 missing 으로 취급해 검사가 약해지지 않게 한다.
    assert.match(healthSource, /droppedEntryCount > 0/);
    assert.match(healthSource, /answerHistoryDays/);
    assert.match(runbook, /PUZZLE_ANSWER_HISTORY_DAYS/);
    assert.match(runbook, /answer-history\.json/);
    assert.match(runbook, /repeated_answer/);
    assert.match(runbook, /missing_answer_history/);
    assert.match(runbook, /report:answer-repeats/);
  });
});
