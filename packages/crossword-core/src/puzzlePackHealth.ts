import {
  DIFFICULTY_ORDER,
  DIFFICULTY_PROFILES,
  isDifficulty,
  type Difficulty,
} from "./difficultyProfiles.ts";
import type { Puzzle, PuzzleManifest } from "./types.ts";
import {
  DEFAULT_ANSWER_HISTORY_DAYS,
  findAnswerHistoryRepeats,
  makeAnswerHistoryEntry,
  type AnswerHistoryFile,
} from "./answerHistory.ts";

export type PublishedPuzzlePackHealthIssueCode =
  | "duplicate_difficulty"
  | "grid_size_mismatch"
  | "manifest_threshold_mismatch"
  | "missing_answer_history"
  | "missing_difficulty"
  | "missing_puzzle"
  | "puzzle_metadata_mismatch"
  | "repeated_answer"
  | "shared_answer";

export type PublishedPuzzlePackHealthIssue = {
  code: PublishedPuzzlePackHealthIssueCode;
  detail: string;
  difficulty?: Difficulty;
};

export type PublishedPuzzlePackHealthResult = {
  date: string;
  issues: PublishedPuzzlePackHealthIssue[];
  pass: boolean;
  puzzleIds: Partial<Record<Difficulty, string>>;
};

function normalizeAnswers(puzzle: Puzzle): Set<string> {
  return new Set(
    puzzle.entries
      .map((entry) => entry.answer.trim())
      .filter((answer) => answer !== ""),
  );
}

// answerHistory 를 생략(undefined)하면 이력 검사를 건너뛴다(이력 도입 전 호출부
// 호환). null 은 "있어야 할 이력이 없다"는 뜻이라 missing_answer_history 로 실패한다.
export function evaluatePublishedPuzzlePackHealth({
  expectedDate,
  manifest,
  puzzlesByPath,
  answerHistory,
  answerHistoryDays = DEFAULT_ANSWER_HISTORY_DAYS,
}: {
  expectedDate: string;
  manifest: PuzzleManifest;
  puzzlesByPath: Readonly<Record<string, Puzzle>>;
  answerHistory?: AnswerHistoryFile | null;
  answerHistoryDays?: number;
}): PublishedPuzzlePackHealthResult {
  const issues: PublishedPuzzlePackHealthIssue[] = [];
  const puzzleIds: Partial<Record<Difficulty, string>> = {};
  const puzzlesByDifficulty = new Map<Difficulty, Puzzle>();
  const itemsForDate = manifest.puzzles.filter(
    (item) => item.date === expectedDate,
  );

  if (manifest.diversityThresholds?.maxSameDateSharedAnswers !== 0) {
    issues.push({
      code: "manifest_threshold_mismatch",
      detail: "maxSameDateSharedAnswers must be 0",
    });
  }

  for (const difficulty of DIFFICULTY_ORDER) {
    const items = itemsForDate.filter((item) => item.difficulty === difficulty);

    if (items.length === 0) {
      issues.push({
        code: "missing_difficulty",
        difficulty,
        detail: `${expectedDate} ${difficulty} puzzle is missing`,
      });
      continue;
    }

    if (items.length > 1) {
      issues.push({
        code: "duplicate_difficulty",
        difficulty,
        detail: `${expectedDate} ${difficulty} has ${items.length} manifest entries`,
      });
      continue;
    }

    const item = items[0];
    const puzzle = puzzlesByPath[item.path];
    if (puzzle == null) {
      issues.push({
        code: "missing_puzzle",
        difficulty,
        detail: `${item.path} was not fetched`,
      });
      continue;
    }

    puzzleIds[difficulty] = puzzle.puzzleId;
    puzzlesByDifficulty.set(difficulty, puzzle);

    if (
      !isDifficulty(puzzle.difficulty) ||
      puzzle.difficulty !== difficulty ||
      puzzle.date !== expectedDate ||
      puzzle.puzzleId !== item.puzzleId
    ) {
      issues.push({
        code: "puzzle_metadata_mismatch",
        difficulty,
        detail: `${item.path} metadata does not match its manifest entry`,
      });
    }

    const expectedGridSize = DIFFICULTY_PROFILES[difficulty].boardSize;
    const gridShapeMatches =
      puzzle.gridSize === expectedGridSize &&
      puzzle.grid.length === expectedGridSize &&
      puzzle.grid.every((row) => row.length === expectedGridSize);

    if (!gridShapeMatches) {
      issues.push({
        code: "grid_size_mismatch",
        difficulty,
        detail: `${difficulty} must use a ${expectedGridSize}x${expectedGridSize} grid`,
      });
    }
  }

  for (let leftIndex = 0; leftIndex < DIFFICULTY_ORDER.length; leftIndex += 1) {
    const leftDifficulty = DIFFICULTY_ORDER[leftIndex];
    const leftPuzzle = puzzlesByDifficulty.get(leftDifficulty);
    if (leftPuzzle == null) {
      continue;
    }

    const leftAnswers = normalizeAnswers(leftPuzzle);
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < DIFFICULTY_ORDER.length;
      rightIndex += 1
    ) {
      const rightDifficulty = DIFFICULTY_ORDER[rightIndex];
      const rightPuzzle = puzzlesByDifficulty.get(rightDifficulty);
      if (rightPuzzle == null) {
        continue;
      }

      const sharedAnswers = [...normalizeAnswers(rightPuzzle)].filter(
        (answer) => leftAnswers.has(answer),
      );
      if (sharedAnswers.length > 0) {
        issues.push({
          code: "shared_answer",
          detail: `${leftDifficulty}/${rightDifficulty} share ${sharedAnswers.join(", ")}`,
        });
      }
    }
  }

  if (answerHistory === null) {
    issues.push({
      code: "missing_answer_history",
      detail: "answer-history.json was not published",
    });
  } else if (answerHistory !== undefined) {
    // 오늘 두 판의 정답이 지난 answerHistoryDays 일 안의 다른 퍼즐(난이도 무관)에
    // 그대로 있었는지 본다. 같은 날짜 교집합은 위 shared_answer 가 담당한다.
    const todayEntries = [...puzzlesByDifficulty.values()].map((puzzle) =>
      makeAnswerHistoryEntry(puzzle),
    );
    for (const repeat of findAnswerHistoryRepeats(todayEntries, answerHistory, {
      days: answerHistoryDays,
    })) {
      issues.push({
        code: "repeated_answer",
        difficulty: repeat.difficulty,
        detail: `${repeat.difficulty} ${repeat.puzzleId} repeats "${repeat.answer}" from ${repeat.previousPuzzleId} (${repeat.previousDate} ${repeat.previousDifficulty}, ${repeat.gapDays}d)`,
      });
    }
  }

  return {
    date: expectedDate,
    issues,
    pass: issues.length === 0,
    puzzleIds,
  };
}
