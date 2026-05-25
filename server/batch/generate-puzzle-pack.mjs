import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  WORDS,
  analyzeRuns,
  generateBoards,
  makeWordMap,
} from "../../scripts/crossword-generator-prototype.mjs";

const DEFAULT_BATCH_OPTIONS = {
  attempts: 30,
  boardSize: 8,
  beamWidth: 16,
  branchLimit: 14,
  candidateWordLimit: 600,
  days: 7,
  denseCandidateLimit: 96,
  maxWords: 12,
  minWordLength: 2,
  outDir: "public/puzzles",
  retries: 8,
  seed: 20260525,
  startDate: "2026-05-25",
  wordBankPath: "data/lexicon/krdict-puzzle-wordbank.json",
};

function parseArgs(argv) {
  const options = { ...DEFAULT_BATCH_OPTIONS };

  for (const arg of argv) {
    const [key, rawValue] = arg.replace(/^--/, "").split("=");
    const numericValue = Number(rawValue);

    if (key === "attempts" && Number.isFinite(numericValue)) {
      options.attempts = numericValue;
    }
    if (key === "beam" && Number.isFinite(numericValue)) {
      options.beamWidth = numericValue;
    }
    if (key === "branch" && Number.isFinite(numericValue)) {
      options.branchLimit = numericValue;
    }
    if (key === "candidates" && Number.isFinite(numericValue)) {
      options.candidateWordLimit = numericValue;
    }
    if (key === "days" && Number.isFinite(numericValue)) {
      options.days = numericValue;
    }
    if (key === "dense" && Number.isFinite(numericValue)) {
      options.denseCandidateLimit = numericValue;
    }
    if (key === "outDir" && rawValue) {
      options.outDir = rawValue;
    }
    if (key === "seed" && Number.isFinite(numericValue)) {
      options.seed = numericValue;
    }
    if (key === "retries" && Number.isFinite(numericValue)) {
      options.retries = numericValue;
    }
    if (key === "size" && Number.isFinite(numericValue)) {
      options.boardSize = numericValue;
    }
    if (key === "start" && rawValue) {
      options.startDate = rawValue;
    }
    if (key === "words" && Number.isFinite(numericValue)) {
      options.maxWords = numericValue;
    }
    if (key === "wordbank" && rawValue) {
      options.wordBankPath = rawValue;
    }
  }

  return options;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function makePuzzleId(date, index) {
  return `${date}-normal-${String(index + 1).padStart(2, "0")}`;
}

function serializeBoard(board, date, index, wordBank, wordBankMetadata) {
  const wordMap = makeWordMap(wordBank);
  const runAnalysis = analyzeRuns(board, wordMap);
  const entries = runAnalysis.runs.map((run, runIndex) => ({
    id: `${run.direction === "across" ? "a" : "d"}${runIndex + 1}`,
    answer: run.answer,
    clue: run.clue ?? `${run.answer}에 대한 힌트 확정 필요`,
    direction: run.direction,
    row: run.row,
    col: run.col,
    generatedBy: run.isPlaced ? "placed" : "auto",
  }));

  return {
    puzzleId: makePuzzleId(date, index),
    date,
    difficulty: "normal",
    gridSize: board.grid.length,
    grid: board.grid.map((row) => row.map((cell) => cell ?? "")),
    entries,
    metrics: {
      autoRunCount: board.metrics.autoRunCount,
      bboxDensity: board.metrics.bboxDensity,
      crossCells: board.metrics.crossCells,
      crossRatio: board.metrics.crossRatio,
      filledCells: board.metrics.filledCells,
      multiCrossEntries: board.metrics.multiIntersectionPlacements,
      placedWordCount: board.metrics.placedWordCount,
      wordCount: board.metrics.wordCount,
    },
    wordBank: {
      sourceName: wordBankMetadata?.sourceName ?? "sample",
      sourceUrl: wordBankMetadata?.sourceUrl,
      license: wordBankMetadata?.license,
      wordCount: wordBank.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

async function loadConfiguredWordBank(wordBankPath) {
  try {
    const parsed = JSON.parse(await readFile(path.resolve(wordBankPath), "utf8"));
    const words = Array.isArray(parsed) ? parsed : parsed.words;

    if (!Array.isArray(words)) {
      throw new Error(`Invalid wordbank format: ${wordBankPath}`);
    }

    return {
      metadata: Array.isArray(parsed) ? null : parsed.metadata,
      words,
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    console.warn(`Wordbank not found at ${wordBankPath}; falling back to sample words.`);
    return {
      metadata: {
        sourceName: "sample",
      },
      words: WORDS,
    };
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(options.outDir);
  const puzzles = [];
  const wordBank = await loadConfiguredWordBank(options.wordBankPath);

  await mkdir(outDir, { recursive: true });

  for (let dayIndex = 0; dayIndex < options.days; dayIndex += 1) {
    const date = addDays(options.startDate, dayIndex);
    let board = null;

    for (let retryIndex = 0; retryIndex < options.retries; retryIndex += 1) {
      const boards = generateBoards({
        allowAdjacent: true,
        attempts: options.attempts,
        beamWidth: options.beamWidth,
        boardSize: options.boardSize,
        branchLimit: options.branchLimit,
        candidateWordLimit: options.candidateWordLimit,
        denseCandidateLimit: options.denseCandidateLimit,
        maxWords: options.maxWords,
        minWordLength: options.minWordLength,
        samples: 1,
        seed: options.seed + dayIndex * 100 + retryIndex,
        wordBank: wordBank.words,
      });

      if (boards[0] != null) {
        board = boards[0];
        break;
      }
    }

    if (board == null) {
      throw new Error(`No board generated for ${date}`);
    }

    const puzzle = serializeBoard(
      board,
      date,
      dayIndex,
      wordBank.words,
      wordBank.metadata
    );
    const filename = `${puzzle.puzzleId}.json`;
    const filePath = path.join(outDir, filename);

    await writeFile(filePath, `${JSON.stringify(puzzle, null, 2)}\n`);
    puzzles.push({
      date,
      puzzleId: puzzle.puzzleId,
      path: `/puzzles/${filename}`,
      metrics: puzzle.metrics,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    startDate: options.startDate,
    days: options.days,
    wordBank: {
      path: options.wordBankPath,
      sourceName: wordBank.metadata?.sourceName ?? "sample",
      sourceUrl: wordBank.metadata?.sourceUrl,
      license: wordBank.metadata?.license,
      wordCount: wordBank.words.length,
    },
    puzzles,
  };

  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Generated ${puzzles.length} puzzle pack(s) in ${outDir}`);
  for (const puzzle of puzzles) {
    console.log(
      `${puzzle.date} ${puzzle.puzzleId} entries=${puzzle.metrics.wordCount} auto=${puzzle.metrics.autoRunCount} bbox=${puzzle.metrics.bboxDensity} cross=${puzzle.metrics.crossRatio}`
    );
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
