import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  WORDS,
  analyzeRuns,
  generateBoards,
  makeWordMap,
} from "../../scripts/crossword-generator-prototype.mjs";

const DEFAULT_BATCH_OPTIONS = {
  append: false,
  appendManifestUrl: undefined,
  attempts: 30,
  boardSize: 8,
  beamWidth: 16,
  branchLimit: 14,
  candidateWordLimit: 600,
  days: 1,
  denseCandidateLimit: 96,
  hostingBaseUrl: undefined,
  intervalHours: 2,
  keepPuzzles: 84,
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
  publishedAt: undefined,
  timeZone: "Asia/Seoul",
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
    if (key === "append") {
      options.append =
        rawValue == null || (rawValue !== "0" && rawValue !== "false");
    }
    if (key === "appendManifestUrl" && rawValue) {
      options.appendManifestUrl = rawValue;
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
    if (key === "hostingBaseUrl" && rawValue) {
      options.hostingBaseUrl = rawValue;
    }
    if (key === "intervalHours" && Number.isFinite(numericValue)) {
      options.intervalHours = numericValue;
    }
    if (key === "keep" && Number.isFinite(numericValue)) {
      options.keepPuzzles = numericValue;
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
    if (key === "publishedAt" && rawValue) {
      options.publishedAt = rawValue;
    }
    if (key === "timeZone" && rawValue) {
      options.timeZone = rawValue;
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

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function compactYear(year) {
  return String(year).slice(-2);
}

function normalizeAlias(value) {
  const dateTimeMatch = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})$/);
  if (dateTimeMatch != null) {
    const [, year, month, day, hour] = dateTimeMatch;
    return `${compactYear(year)}${month}${day}${hour}`;
  }

  const dateMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateMatch != null) {
    const [, year, month, day] = dateMatch;
    return `${compactYear(year)}${month}${day}`;
  }

  return value;
}

function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const valueByType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return {
    day: valueByType.day,
    hour: Number(valueByType.hour),
    month: valueByType.month,
    year: valueByType.year,
  };
}

function makeSlotInfo(date, timeZone, intervalHours) {
  const parts = getZonedParts(date, timeZone);
  const slotHour = Math.floor(parts.hour / intervalHours) * intervalHours;
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  const alias = `${compactYear(parts.year)}${parts.month}${parts.day}${pad2(slotHour)}`;
  const slotId = `${dateKey}-h${pad2(slotHour)}`;

  return {
    alias,
    date: dateKey,
    publishedAt: date.toISOString(),
    slotId,
  };
}

function makePackId(slotInfo, seed) {
  const compactPublishedAt = slotInfo.publishedAt
    .replace(/\D/g, "")
    .slice(0, 14);
  return `pack-${compactPublishedAt}-${seed}`;
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
    metrics.wordCount === 0
      ? 0
      : Number((metrics.autoRunCount / metrics.wordCount).toFixed(3));
  const multiCrossRatio =
    metrics.wordCount === 0
      ? 0
      : Number(
          (metrics.multiIntersectionPlacements / metrics.wordCount).toFixed(3),
        );
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
  return quality.checks
    .filter((check) => !check.pass)
    .map((check) => check.key);
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

function serializeBoard(
  board,
  slotInfo,
  packId,
  wordBank,
  wordBankMetadata,
  quality,
) {
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
    alias: slotInfo.alias,
    puzzleId: packId,
    date: slotInfo.date,
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
    packId,
    publishedAt: slotInfo.publishedAt,
    quality,
    slotId: slotInfo.slotId,
    generatedAt: new Date().toISOString(),
  };
}

async function loadConfiguredWordBank(wordBankPath) {
  try {
    const parsed = JSON.parse(
      await readFile(path.resolve(wordBankPath), "utf8"),
    );
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

    console.warn(
      `Wordbank not found at ${wordBankPath}; falling back to sample words.`,
    );
    return {
      metadata: {
        sourceName: "sample",
      },
      rawWordCount: WORDS.length,
      words: WORDS,
    };
  }
}

async function readJsonOptional(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function fetchJsonOptional(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Could not fetch ${url}: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(`Could not fetch ${url}: ${error.message}`);
    return null;
  }
}

function getAssetRoot(outDir) {
  if (path.basename(outDir) === "puzzles") {
    return path.dirname(outDir);
  }

  return outDir;
}

function resolvePuzzleOutputPath(assetRoot, outDir, puzzlePath) {
  if (puzzlePath.startsWith("/")) {
    return path.resolve(assetRoot, puzzlePath.replace(/^\//, ""));
  }

  return path.resolve(outDir, puzzlePath);
}

function resolveRemotePuzzleUrl(item, options) {
  if (/^https?:\/\//.test(item.path)) {
    return item.path;
  }

  if (options.hostingBaseUrl != null) {
    return new URL(item.path, options.hostingBaseUrl).toString();
  }

  if (options.appendManifestUrl != null) {
    return new URL(item.path, options.appendManifestUrl).toString();
  }

  return null;
}

async function loadExistingManifest(options, outDir) {
  if (!options.append) {
    return null;
  }

  if (options.appendManifestUrl != null) {
    const remoteManifest = await fetchJsonOptional(options.appendManifestUrl);

    if (remoteManifest != null) {
      console.log(
        `Loaded existing remote manifest ${options.appendManifestUrl} puzzles=${remoteManifest.puzzles?.length ?? 0}`,
      );
      return remoteManifest;
    }
  }

  const localManifestPath = path.join(outDir, "manifest.json");
  const localManifest = await readJsonOptional(localManifestPath);

  if (localManifest != null) {
    console.log(
      `Loaded existing local manifest ${localManifestPath} puzzles=${localManifest.puzzles?.length ?? 0}`,
    );
  }

  return localManifest;
}

function getManifestSortKey(item) {
  return item.publishedAt ?? item.slotId ?? item.date ?? item.puzzleId;
}

function getManifestIdentityKey(item) {
  return item.slotId ?? item.puzzleId;
}

function getPublishedAtAlias(publishedAt) {
  if (typeof publishedAt !== "string") {
    return undefined;
  }

  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const parts = getZonedParts(date, "Asia/Seoul");
  return `${compactYear(parts.year)}${parts.month}${parts.day}${pad2(parts.hour)}`;
}

function getManifestAlias(item) {
  const explicitAlias =
    typeof item.alias === "string" ? item.alias.trim() : undefined;

  if (explicitAlias != null && explicitAlias.length > 0) {
    return normalizeAlias(explicitAlias);
  }

  const slotMatch =
    typeof item.slotId === "string"
      ? item.slotId.match(/^(\d{4})-(\d{2})-(\d{2})-h(\d{2})$/)
      : null;
  if (slotMatch != null) {
    const [, year, month, day, hour] = slotMatch;
    return `${compactYear(year)}${month}${day}${hour}`;
  }

  const publishedAtAlias = getPublishedAtAlias(item.publishedAt);
  if (publishedAtAlias != null) {
    return publishedAtAlias;
  }

  const packIdMatch =
    typeof item.packId === "string"
      ? item.packId.match(/^pack-(\d{10})/)
      : null;
  if (packIdMatch != null) {
    return normalizeAlias(packIdMatch[1]);
  }

  const dateMatch =
    typeof item.date === "string"
      ? item.date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      : null;
  if (dateMatch != null) {
    const [, year, month, day] = dateMatch;
    return `${compactYear(year)}${month}${day}`;
  }

  return item.puzzleId;
}

function withManifestAlias(item) {
  return { ...item, alias: getManifestAlias(item) };
}

function mergeManifestPuzzles(existingPuzzles, newPuzzles, keepPuzzles) {
  const byIdentity = new Map();
  const sortedExistingPuzzles = [...existingPuzzles].sort((left, right) =>
    getManifestSortKey(right).localeCompare(getManifestSortKey(left)),
  );

  for (const item of sortedExistingPuzzles) {
    const key = getManifestIdentityKey(item);

    if (!byIdentity.has(key)) {
      byIdentity.set(key, withManifestAlias(item));
    }
  }

  for (const item of newPuzzles) {
    byIdentity.set(getManifestIdentityKey(item), withManifestAlias(item));
  }

  return [...byIdentity.values()]
    .sort((left, right) =>
      getManifestSortKey(right).localeCompare(getManifestSortKey(left)),
    )
    .slice(0, keepPuzzles);
}

async function hydrateExistingPuzzleFiles(
  items,
  generatedPuzzleIds,
  options,
  assetRoot,
  outDir,
) {
  for (const item of items) {
    if (generatedPuzzleIds.has(item.puzzleId)) {
      continue;
    }

    const outputPath = resolvePuzzleOutputPath(assetRoot, outDir, item.path);
    const existingFile = await readJsonOptional(outputPath);

    if (existingFile != null) {
      continue;
    }

    const remoteUrl = resolveRemotePuzzleUrl(item, options);

    if (remoteUrl == null) {
      console.warn(`Could not hydrate ${item.puzzleId}: no remote URL`);
      continue;
    }

    const puzzle = await fetchJsonOptional(remoteUrl);

    if (puzzle == null) {
      console.warn(`Could not hydrate ${item.puzzleId}: ${remoteUrl}`);
      continue;
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(puzzle, null, 2)}\n`);
    console.log(`Hydrated existing puzzle ${item.puzzleId} from ${remoteUrl}`);
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(options.outDir);
  const assetRoot = getAssetRoot(outDir);
  const puzzles = [];
  const generationReport = [];
  const wordBank = await loadConfiguredWordBank(options.wordBankPath);
  const qualityThresholds = makeQualityThresholds(options);
  const existingManifest = await loadExistingManifest(options, outDir);
  const existingPuzzles = existingManifest?.puzzles ?? [];
  const basePublishedAt =
    options.publishedAt == null ? new Date() : new Date(options.publishedAt);

  if (Number.isNaN(basePublishedAt.getTime())) {
    throw new Error(`Invalid publishedAt: ${options.publishedAt}`);
  }

  await mkdir(outDir, { recursive: true });
  console.log(
    `Generating puzzle pack count=${options.days} start=${options.startDate} seed=${options.seed} outDir=${outDir}`,
  );
  console.log(
    `Generator options append=${options.append} keep=${options.keepPuzzles} intervalHours=${options.intervalHours} attempts=${options.attempts} retries=${options.retries} samples=${options.samples} beam=${options.beamWidth} branch=${options.branchLimit} candidates=${options.candidateWordLimit}`,
  );

  for (let dayIndex = 0; dayIndex < options.days; dayIndex += 1) {
    const slotInfo = makeSlotInfo(
      addHours(basePublishedAt, dayIndex * options.intervalHours),
      options.timeZone,
      options.intervalHours,
    );
    const packId = makePackId(slotInfo, options.seed + dayIndex);
    let board = null;
    let selectedQuality = null;
    const attempts = [];
    const dayStartTime = Date.now();

    console.log(
      `[${slotInfo.slotId}] generation started (${dayIndex + 1}/${options.days}) packId=${packId}`,
    );

    for (let retryIndex = 0; retryIndex < options.retries; retryIndex += 1) {
      const seed = options.seed + dayIndex * 100 + retryIndex;
      const retryStartTime = Date.now();

      console.log(
        `[${slotInfo.slotId}] retry ${retryIndex + 1}/${options.retries} seed=${seed}`,
      );
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
      const retryElapsedSeconds = (
        (Date.now() - retryStartTime) /
        1000
      ).toFixed(1);

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
        console.log(
          `[${slotInfo.slotId}] accepted candidate=${acceptedIndex} entries=${board.metrics.wordCount} cross=${board.metrics.crossRatio} bbox=${board.metrics.bboxDensity} elapsed=${retryElapsedSeconds}s`,
        );
        break;
      }

      console.log(
        `[${slotInfo.slotId}] retry ${retryIndex + 1} rejected candidates=${boards.length} elapsed=${retryElapsedSeconds}s reasons=${JSON.stringify(
          countReasons([{ candidates }]),
        )}`,
      );
    }

    if (board == null) {
      const failedReport = {
        alias: slotInfo.alias,
        date: slotInfo.date,
        packId,
        slotId: slotInfo.slotId,
        accepted: false,
        failureReasonCounts: countReasons(attempts),
        attempts,
      };
      generationReport.push(failedReport);
      await writeFile(
        path.join(outDir, "generation-report.json"),
        `${JSON.stringify({ generatedAt: new Date().toISOString(), report: generationReport }, null, 2)}\n`,
      );
      throw new Error(`No board generated for ${slotInfo.slotId}`);
    }

    const puzzle = serializeBoard(
      board,
      slotInfo,
      packId,
      wordBank.words,
      wordBank.metadata,
      selectedQuality,
    );
    const filename = `${puzzle.puzzleId}.json`;
    const filePath = path.join(outDir, filename);

    await writeFile(filePath, `${JSON.stringify(puzzle, null, 2)}\n`);
    console.log(
      `[${slotInfo.slotId}] wrote ${filename} dayElapsed=${((Date.now() - dayStartTime) / 1000).toFixed(1)}s`,
    );
    puzzles.push({
      alias: puzzle.alias,
      date: slotInfo.date,
      packId,
      publishedAt: slotInfo.publishedAt,
      puzzleId: puzzle.puzzleId,
      path: `/puzzles/${filename}`,
      quality: puzzle.quality,
      metrics: puzzle.metrics,
      slotId: slotInfo.slotId,
    });
    generationReport.push({
      alias: puzzle.alias,
      date: slotInfo.date,
      packId,
      publishedAt: slotInfo.publishedAt,
      slotId: slotInfo.slotId,
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
  const generatedPuzzleIds = new Set(puzzles.map((puzzle) => puzzle.puzzleId));
  const manifestPuzzles = options.append
    ? mergeManifestPuzzles(existingPuzzles, puzzles, options.keepPuzzles)
    : puzzles;

  await hydrateExistingPuzzleFiles(
    manifestPuzzles,
    generatedPuzzleIds,
    options,
    assetRoot,
    outDir,
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    startDate: options.startDate,
    days: manifestPuzzles.length,
    keep: options.keepPuzzles,
    wordBank: {
      path: options.wordBankPath,
      sourceName: wordBank.metadata?.sourceName ?? "sample",
      sourceUrl: wordBank.metadata?.sourceUrl,
      license: wordBank.metadata?.license,
      rawWordCount: wordBank.rawWordCount,
      wordCount: wordBank.words.length,
    },
    qualityThresholds,
    puzzles: manifestPuzzles,
  };

  await writeFile(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    path.join(outDir, "generation-report.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), report: generationReport }, null, 2)}\n`,
  );

  console.log(`Generated ${puzzles.length} puzzle pack(s) in ${outDir}`);
  for (const puzzle of puzzles) {
    console.log(
      `${puzzle.date} ${puzzle.puzzleId} entries=${puzzle.metrics.wordCount} auto=${puzzle.metrics.autoRunCount} bbox=${puzzle.metrics.bboxDensity} cross=${puzzle.metrics.crossRatio}`,
    );
  }
  console.log(
    `Wrote generation report to ${path.join(outDir, "generation-report.json")}`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
