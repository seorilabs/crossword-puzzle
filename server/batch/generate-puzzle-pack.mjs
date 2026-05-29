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
  maxAutoRunRatio: 0.5,
  minBboxDensity: 0.5,
  minCrossRatio: 0.55,
  minMultiCrossRatio: 0.65,
  minWordLength: 2,
  minWordCount: 12,
  outDir: "public/puzzles",
  retries: 8,
  samples: 5,
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
    if (key === "maxAuto" && Number.isFinite(numericValue)) {
      options.maxAutoRunRatio = numericValue;
    }
    if (key === "minCross" && Number.isFinite(numericValue)) {
      options.minCrossRatio = numericValue;
    }
    if (key === "minDensity" && Number.isFinite(numericValue)) {
      options.minBboxDensity = numericValue;
    }
    if (key === "minEntries" && Number.isFinite(numericValue)) {
      options.minWordCount = numericValue;
    }
    if (key === "minMulti" && Number.isFinite(numericValue)) {
      options.minMultiCrossRatio = numericValue;
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
    if (key === "samples" && Number.isFinite(numericValue)) {
      options.samples = numericValue;
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

function makeQualityThresholds(options) {
  return {
    maxAutoRunRatio: options.maxAutoRunRatio,
    minBboxDensity: options.minBboxDensity,
    minCrossRatio: options.minCrossRatio,
    minMultiCrossRatio: options.minMultiCrossRatio,
    minWordCount: options.minWordCount,
  };
}

function evaluateQuality(board, thresholds) {
  const metrics = board.metrics;
  const autoRunRatio =
    metrics.wordCount === 0 ? 0 : Number((metrics.autoRunCount / metrics.wordCount).toFixed(3));
  const multiCrossRatio =
    metrics.wordCount === 0
      ? 0
      : Number((metrics.multiIntersectionPlacements / metrics.wordCount).toFixed(3));
  const checks = [
    {
      key: "minWordCount",
      pass: metrics.wordCount >= thresholds.minWordCount,
      actual: metrics.wordCount,
      expected: thresholds.minWordCount,
    },
    {
      key: "minCrossRatio",
      pass: metrics.crossRatio >= thresholds.minCrossRatio,
      actual: metrics.crossRatio,
      expected: thresholds.minCrossRatio,
    },
    {
      key: "minBboxDensity",
      pass: metrics.bboxDensity >= thresholds.minBboxDensity,
      actual: metrics.bboxDensity,
      expected: thresholds.minBboxDensity,
    },
    {
      key: "minMultiCrossRatio",
      pass: multiCrossRatio >= thresholds.minMultiCrossRatio,
      actual: multiCrossRatio,
      expected: thresholds.minMultiCrossRatio,
    },
    {
      key: "maxAutoRunRatio",
      pass: autoRunRatio <= thresholds.maxAutoRunRatio,
      actual: autoRunRatio,
      expected: thresholds.maxAutoRunRatio,
    },
  ];

  return {
    pass: checks.every((check) => check.pass),
    checks,
    ratios: {
      autoRunRatio,
      multiCrossRatio,
    },
    thresholds,
  };
}

function summarizeFailureReasons(quality) {
  return quality.checks.filter((check) => !check.pass).map((check) => check.key);
}

function countReasons(attempts) {
  const counts = {};

  for (const attempt of attempts) {
    for (const candidate of attempt.candidates) {
      for (const reason of candidate.failureReasons) {
        counts[reason] = (counts[reason] ?? 0) + 1;
      }
    }
  }

  return counts;
}

function serializeBoard(board, date, index, wordBank, wordBankMetadata, quality) {
  const wordMap = makeWordMap(wordBank);
  const runAnalysis = analyzeRuns(board, wordMap);
  const entries = runAnalysis.runs.map((run, runIndex) => {
    const sourceWord = wordMap.get(run.answer);

    return {
      id: `${run.direction === "across" ? "a" : "d"}${runIndex + 1}`,
      answer: run.answer,
      clue: sourceWord?.clue ?? `${run.answer}에 대한 힌트 확정 필요`,
      clueSource: sourceWord?.clueSource ?? "unknown",
      direction: run.direction,
      row: run.row,
      col: run.col,
      generatedBy: run.isPlaced ? "placed" : "auto",
      needsManualClue: sourceWord?.needsManualClue ?? true,
    };
  });

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
    quality,
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
      rawWordCount: words.length,
      words: words.filter((word) => word.allowForPuzzle !== false),
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
      rawWordCount: WORDS.length,
      words: WORDS,
    };
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(options.outDir);
  const puzzles = [];
  const generationReport = [];
  const wordBank = await loadConfiguredWordBank(options.wordBankPath);
  const qualityThresholds = makeQualityThresholds(options);

  await mkdir(outDir, { recursive: true });

  for (let dayIndex = 0; dayIndex < options.days; dayIndex += 1) {
    const date = addDays(options.startDate, dayIndex);
    let board = null;
    let selectedQuality = null;
    const attempts = [];

    for (let retryIndex = 0; retryIndex < options.retries; retryIndex += 1) {
      const seed = options.seed + dayIndex * 100 + retryIndex;
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
        samples: options.samples,
        seed,
        wordBank: wordBank.words,
      });

      const candidates = boards.map((candidate, candidateIndex) => {
        const quality = evaluateQuality(candidate, qualityThresholds);
        return {
          candidateIndex,
          failureReasons: summarizeFailureReasons(quality),
          metrics: {
            autoRunCount: candidate.metrics.autoRunCount,
            bboxDensity: candidate.metrics.bboxDensity,
            crossRatio: candidate.metrics.crossRatio,
            multiCrossEntries: candidate.metrics.multiIntersectionPlacements,
            wordCount: candidate.metrics.wordCount,
          },
          pass: quality.pass,
          ratios: quality.ratios,
        };
      });
      attempts.push({
        retryIndex,
        seed,
        candidateCount: boards.length,
        candidates,
      });

      const acceptedIndex = candidates.findIndex((candidate) => candidate.pass);
      if (acceptedIndex !== -1) {
        board = boards[acceptedIndex];
        selectedQuality = evaluateQuality(board, qualityThresholds);
        break;
      }
    }

    if (board == null) {
      const failedReport = {
        date,
        accepted: false,
        failureReasonCounts: countReasons(attempts),
        attempts,
      };
      generationReport.push(failedReport);
      await writeFile(
        path.join(outDir, "generation-report.json"),
        `${JSON.stringify({ generatedAt: new Date().toISOString(), report: generationReport }, null, 2)}\n`
      );
      throw new Error(`No board generated for ${date}`);
    }

    const puzzle = serializeBoard(
      board,
      date,
      dayIndex,
      wordBank.words,
      wordBank.metadata,
      selectedQuality
    );
    const filename = `${puzzle.puzzleId}.json`;
    const filePath = path.join(outDir, filename);

    await writeFile(filePath, `${JSON.stringify(puzzle, null, 2)}\n`);
    puzzles.push({
      date,
      puzzleId: puzzle.puzzleId,
      path: `/puzzles/${filename}`,
      quality: puzzle.quality,
      metrics: puzzle.metrics,
    });
    generationReport.push({
      date,
      accepted: true,
      failureReasonCounts: countReasons(attempts),
      selected: {
        puzzleId: puzzle.puzzleId,
        quality: puzzle.quality,
        metrics: puzzle.metrics,
      },
      attempts,
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
      rawWordCount: wordBank.rawWordCount,
      wordCount: wordBank.words.length,
    },
    qualityThresholds,
    puzzles,
  };

  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(outDir, "generation-report.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), report: generationReport }, null, 2)}\n`
  );

  console.log(`Generated ${puzzles.length} puzzle pack(s) in ${outDir}`);
  for (const puzzle of puzzles) {
    console.log(
      `${puzzle.date} ${puzzle.puzzleId} entries=${puzzle.metrics.wordCount} auto=${puzzle.metrics.autoRunCount} bbox=${puzzle.metrics.bboxDensity} cross=${puzzle.metrics.crossRatio}`
    );
  }
  console.log(`Wrote generation report to ${path.join(outDir, "generation-report.json")}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
