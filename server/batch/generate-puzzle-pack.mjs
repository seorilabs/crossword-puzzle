import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  WORDS,
  analyzeRuns,
  generateBoards,
  makeWordMap,
} from "../../scripts/crossword-generator-prototype.mjs";
import {
  isDifficulty,
  resolveDifficultyProfile,
  selectWordsForProfile,
  summarizeWordDifficulties,
} from "../../packages/crossword-core/src/difficultyProfiles.ts";
import {
  buildThemeMeta,
  filterWordsByTheme,
} from "../../packages/crossword-core/src/themeTags.ts";
import {
  DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO,
  needsManualClueRatio,
} from "../../packages/crossword-core/src/clueCuration.ts";
import {
  DEFAULT_DIVERSITY_HISTORY_LIMIT,
  DEFAULT_MAX_SCAFFOLD_SIMILARITY,
  DEFAULT_MAX_SHARED_ANSWER_RATIO,
  evaluatePuzzleDiversity,
  selectComparableDiversityHistory,
} from "../../packages/crossword-core/src/puzzleDiversity.ts";
import {
  DEFAULT_MAX_ANSWERS_PER_SYLLABLE,
  DEFAULT_SHARED_FRAGMENT_LENGTH,
  evaluateAnswerVariety,
  excludeAnswersSharingFragments,
} from "../../packages/crossword-core/src/answerVariety.ts";

const DEFAULT_BATCH_OPTIONS = {
  append: false,
  appendManifestUrl: undefined,
  attempts: 30,
  boardSize: 8,
  diversityHistoryLimit: DEFAULT_DIVERSITY_HISTORY_LIMIT,
  difficulty: "normal",
  beamWidth: 16,
  branchLimit: 14,
  candidateWordLimit: 600,
  days: 1,
  denseCandidateLimit: 96,
  hostingBaseUrl: undefined,
  intervalHours: 1,
  keepPuzzles: 21,
  // maxWords/minWordCount/boardSize 는 parseArgs 에서 난이도 프로파일(기본 normal)이
  // 먼저 덮어쓰고, 이후 개별 CLI 플래그(--words/--minEntries/--size)로 다시 덮어쓸 수
  // 있다. 여기 기본값은 normal 프로파일과 동일하게 맞춰 둔다(완료 시간 단축 튜닝 반영).
  maxWords: 10,
  maxAnswersPerSyllable: DEFAULT_MAX_ANSWERS_PER_SYLLABLE,
  maxAutoRunRatio: 0.5,
  maxScaffoldSimilarity: DEFAULT_MAX_SCAFFOLD_SIMILARITY,
  maxSharedAnswerRatio: DEFAULT_MAX_SHARED_ANSWER_RATIO,
  minBboxDensity: 0.5,
  minCrossRatio: 0.55,
  minMultiCrossRatio: 0.65,
  minWordLength: 2,
  minWordCount: 10,
  outDir: "public/puzzles",
  retries: 8,
  samples: 5,
  seed: 20260525,
  startDate: "2026-05-25",
  publishedAt: undefined,
  timeZone: "Asia/Seoul",
  wordBankPath: "data/lexicon/krdict-puzzle-wordbank.json",
  // 주제(테마) 퍼즐 옵션(#236). theme 가 지정되면 해당 themeTag 를 가진 단어로만
  // 후보 풀을 제약하고, 매니페스트·퍼즐에 themeTag/themeLabel 을 기록한다.
  theme: undefined,
  themeLabel: undefined,
  themeFilterPath: "data/lexicon/puzzle-word-filter.json",
};

function parseArgs(argv) {
  const options = { ...DEFAULT_BATCH_OPTIONS };

  // 난이도 프로파일을 먼저 적용한 뒤 개별 CLI 플래그가 이를 덮어쓰도록 한다.
  const difficultyArg = argv.find((arg) => arg.startsWith("--difficulty="));
  const difficultyValue = difficultyArg?.split("=")[1];
  const profile = resolveDifficultyProfile(difficultyValue);
  options.difficulty = profile.difficulty;
  options.boardSize = profile.boardSize;
  options.maxWords = profile.maxWords;
  options.minWordLength = profile.minWordLength;
  options.minWordCount = profile.minWordCount;
  options.minCrossRatio = profile.minCrossRatio;
  options.minBboxDensity = profile.minBboxDensity;
  options.wordDifficulties = profile.wordDifficulties;

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
    if (key === "diversityHistory" && Number.isFinite(numericValue)) {
      options.diversityHistoryLimit = numericValue;
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
    if (key === "maxAnswerReuse" && Number.isFinite(numericValue)) {
      options.maxSharedAnswerRatio = numericValue;
    }
    if (key === "maxSyllableAnswers" && Number.isFinite(numericValue)) {
      options.maxAnswersPerSyllable = numericValue;
    }
    if (key === "maxScaffoldSimilarity" && Number.isFinite(numericValue)) {
      options.maxScaffoldSimilarity = numericValue;
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
    if (key === "theme" && rawValue) {
      options.theme = rawValue;
    }
    if (key === "themeLabel" && rawValue) {
      options.themeLabel = rawValue;
    }
    if (key === "themeFilter" && rawValue) {
      options.themeFilterPath = rawValue;
    }
  }

  return options;
}

// 주제 라벨 해석: --themeLabel 우선, 없으면 필터의 themeCategories 에서 id 로 조회,
// 그래도 없으면 id 를 라벨로 쓴다(#236).
async function resolveThemeLabel(options) {
  if (options.theme == null) {
    return undefined;
  }
  if (options.themeLabel != null) {
    return options.themeLabel;
  }
  const filter = await readJsonOptional(path.resolve(options.themeFilterPath));
  const categories = filter?.themeCategories ?? [];
  const match = categories.find((category) => category.id === options.theme);
  return match?.label ?? options.theme;
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

function compactDateTimeAlias(year, month, day, hour) {
  return `${compactYear(year)}${month}${day}${hour}`;
}

function isFourDigitGregorianYear(value) {
  const year = Number(value);

  return Number.isInteger(year) && year >= 1900 && year <= 2099;
}

function normalizeAlias(value) {
  const trimmedValue = value.trim();
  const packDateTimeMatch = trimmedValue.match(
    /^pack-(\d{4})(\d{2})(\d{2})(\d{2})/,
  );
  if (packDateTimeMatch != null) {
    const [, year, month, day, hour] = packDateTimeMatch;
    return compactDateTimeAlias(year, month, day, hour);
  }

  const dateTimeMatch = trimmedValue.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(?:\d{2}){0,2}$/,
  );
  if (dateTimeMatch != null) {
    const [, year, month, day, hour] = dateTimeMatch;
    return compactDateTimeAlias(year, month, day, hour);
  }

  if (/^\d{8}$/.test(trimmedValue)) {
    const year = trimmedValue.slice(0, 4);

    return isFourDigitGregorianYear(year)
      ? trimmedValue.slice(2)
      : trimmedValue;
  }

  const dateMatch = trimmedValue.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateMatch != null) {
    const [, year, month, day] = dateMatch;
    return `${compactYear(year)}${month}${day}`;
  }

  return trimmedValue;
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

function clampRatio(value, fallback) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function makeDiversityThresholds(options) {
  return {
    maxSharedAnswerRatio: clampRatio(
      options.maxSharedAnswerRatio,
      DEFAULT_MAX_SHARED_ANSWER_RATIO,
    ),
    maxScaffoldSimilarity: clampRatio(
      options.maxScaffoldSimilarity,
      DEFAULT_MAX_SCAFFOLD_SIMILARITY,
    ),
  };
}

// 어휘 군집 게이트 임계값. 정답 문자열이 달라도 어근을 공유하면 같은 단어의
// 반복으로 읽히므로, 한 판 안의 공유 조각과 음절 과다 사용을 함께 막는다.
function makeAnswerVarietyThresholds(options) {
  return {
    sharedFragmentLength: DEFAULT_SHARED_FRAGMENT_LENGTH,
    maxAnswersPerSyllable: Number.isFinite(options.maxAnswersPerSyllable)
      ? Math.max(1, Math.floor(options.maxAnswersPerSyllable))
      : DEFAULT_MAX_ANSWERS_PER_SYLLABLE,
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
  difficulty,
  theme = {},
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
    puzzleId: slotInfo.alias,
    date: slotInfo.date,
    difficulty,
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
    // 주제 퍼즐일 때만 themeTag/themeLabel 을 기록한다(일반 퍼즐은 생략, #236).
    ...buildThemeMeta(theme.themeTag, theme.themeLabel),
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
    return normalizeAlias(item.packId ?? packIdMatch[1]);
  }

  const puzzleIdAlias =
    typeof item.puzzleId === "string"
      ? normalizeAlias(item.puzzleId)
      : undefined;
  if (
    puzzleIdAlias != null &&
    (puzzleIdAlias !== item.puzzleId || /^\d{8}$/.test(puzzleIdAlias))
  ) {
    return puzzleIdAlias;
  }

  const dateMatch =
    typeof item.date === "string"
      ? item.date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      : null;
  if (dateMatch != null) {
    const [, year, month, day] = dateMatch;
    return `${compactYear(year)}${month}${day}`;
  }

  return puzzleIdAlias ?? item.puzzleId;
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

async function hydrateManifestPuzzles(items, options, assetRoot, outDir) {
  const hydratedItems = [];

  for (const item of items) {
    const outputPath = resolvePuzzleOutputPath(assetRoot, outDir, item.path);
    let puzzle = await readJsonOptional(outputPath);

    if (puzzle == null) {
      const remoteUrl = resolveRemotePuzzleUrl(item, options);

      if (remoteUrl == null) {
        throw new Error(
          `Could not hydrate ${item.puzzleId}: no local file or remote URL`,
        );
      }

      puzzle = await fetchJsonOptional(remoteUrl);

      if (puzzle == null) {
        throw new Error(`Could not hydrate ${item.puzzleId}: ${remoteUrl}`);
      }

      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(puzzle, null, 2)}\n`);
      console.log(
        `Hydrated existing puzzle ${item.puzzleId} from ${remoteUrl}`,
      );
    }

    if (!isDifficulty(puzzle.difficulty)) {
      throw new Error(
        `Puzzle ${item.puzzleId} has invalid difficulty: ${String(puzzle.difficulty)}`,
      );
    }
    if (
      isDifficulty(item.difficulty) &&
      item.difficulty !== puzzle.difficulty
    ) {
      throw new Error(
        `Puzzle ${item.puzzleId} difficulty mismatch: manifest=${item.difficulty} puzzle=${puzzle.difficulty}`,
      );
    }

    hydratedItems.push({ ...item, difficulty: puzzle.difficulty });
  }

  return hydratedItems;
}

function getOccupiedCellKeys(grid) {
  return grid.flatMap((row, rowIndex) =>
    row.flatMap((cell, colIndex) =>
      cell == null || cell === "" ? [] : [`${rowIndex}:${colIndex}`],
    ),
  );
}

function makeDiversitySnapshot(puzzle) {
  return {
    answers: puzzle.entries.map((entry) => entry.answer),
    occupiedCellKeys: getOccupiedCellKeys(puzzle.grid),
    puzzleId: puzzle.puzzleId,
    slotId: puzzle.slotId,
  };
}

async function loadDiversityHistory(
  items,
  assetRoot,
  outDir,
  difficulty,
  limit,
) {
  const safeLimit = Math.max(0, Math.floor(limit));
  const recentItems = items
    .filter((item) => item.difficulty === difficulty)
    .sort((left, right) =>
      getManifestSortKey(right).localeCompare(getManifestSortKey(left)),
    )
    // 같은 슬롯 재실행 시 현재 슬롯을 제외하고도 limit개를 유지할 수 있게 한 건 더
    // 읽는다. 실제 비교 대상 선택은 slotId가 정해진 뒤 순수 helper에서 수행한다.
    .slice(0, safeLimit + 1);
  const snapshots = [];

  for (const item of recentItems) {
    const puzzle = await readJsonOptional(
      resolvePuzzleOutputPath(assetRoot, outDir, item.path),
    );

    if (puzzle != null) {
      snapshots.push(makeDiversitySnapshot(puzzle));
    }
  }

  return snapshots;
}

async function loadSameDateAnswerHistory(
  items,
  assetRoot,
  outDir,
  date,
  currentSlotId,
  currentPuzzleId,
) {
  const answers = new Set();
  let puzzleCount = 0;

  for (const item of items) {
    const isCurrentPuzzle =
      item.slotId === currentSlotId || item.puzzleId === currentPuzzleId;

    if (item.date !== date || isCurrentPuzzle) {
      continue;
    }

    const puzzle = await readJsonOptional(
      resolvePuzzleOutputPath(assetRoot, outDir, item.path),
    );

    if (puzzle == null) {
      continue;
    }

    puzzleCount += 1;
    for (const entry of puzzle.entries ?? []) {
      if (typeof entry.answer === "string" && entry.answer.trim() !== "") {
        answers.add(entry.answer.trim());
      }
    }
  }

  return { answers, puzzleCount };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(options.outDir);
  const assetRoot = getAssetRoot(outDir);
  const puzzles = [];
  const generationReport = [];
  const wordBank = await loadConfiguredWordBank(options.wordBankPath);
  const profile = resolveDifficultyProfile(options.difficulty);
  const wordSelection = selectWordsForProfile(wordBank.words, profile);
  // 주제 퍼즐이면 난이도 필터 결과를 해당 themeTag 단어로 다시 제약한다(#236).
  const themeLabel = await resolveThemeLabel(options);
  const difficultyFilteredWords =
    options.theme == null
      ? wordSelection.words
      : filterWordsByTheme(wordSelection.words, options.theme);
  // 한국어기초사전 뜻풀이는 기본 사용 가능하다. 여기서 앞쪽 600개로 자르면
  // 워드뱅크 정렬 순서에 따라 쉬운 단어만 고정될 수 있으므로 전체 난이도 풀을
  // 생성기에 넘긴다. generateBoards가 seed별로 섞은 뒤 candidateWordLimit만큼
  // 추출해 날짜마다 폭넓은 후보를 사용한다.
  const generationWords = difficultyFilteredWords;
  const wordBankDifficultyCounts = summarizeWordDifficulties(
    difficultyFilteredWords,
  );

  if (difficultyFilteredWords.length === 0) {
    throw new Error(
      options.theme == null
        ? `No words match difficulty profile ${profile.difficulty} (allowed=${profile.wordDifficulties.join(",")})`
        : `No words match theme "${options.theme}" within difficulty profile ${profile.difficulty}. Run "npm run wordbank:themes" and check themeCategories.`,
    );
  }

  if (generationWords.length < profile.minWordCount) {
    throw new Error(
      `Not enough usable words for ${profile.difficulty}: candidates=${generationWords.length} minEntries=${profile.minWordCount}`,
    );
  }

  if (options.theme != null) {
    console.log(
      `Theme constraint theme=${options.theme} label=${themeLabel} words=${difficultyFilteredWords.length}`,
    );
  }

  if (wordSelection.broadened) {
    console.warn(
      `Difficulty profile ${profile.difficulty} pool below ${profile.wordDifficulties.join(",")} threshold; broadened with [${wordSelection.broadenedWith.join(",")}] -> ${difficultyFilteredWords.length} words`,
    );
  }

  const qualityThresholds = makeQualityThresholds(options);
  const diversityThresholds = makeDiversityThresholds(options);
  const answerVarietyThresholds = makeAnswerVarietyThresholds(options);
  const existingManifest = await loadExistingManifest(options, outDir);
  const existingPuzzles = (existingManifest?.puzzles ?? []).filter((puzzle) => {
    const keep = isDifficulty(puzzle.difficulty);

    if (!keep) {
      console.warn(
        `Dropping legacy manifest item without difficulty: ${puzzle.puzzleId}`,
      );
    }

    return keep;
  });
  const basePublishedAt =
    options.publishedAt == null ? new Date() : new Date(options.publishedAt);

  if (Number.isNaN(basePublishedAt.getTime())) {
    throw new Error(`Invalid publishedAt: ${options.publishedAt}`);
  }

  await mkdir(outDir, { recursive: true });
  const hydratedExistingPuzzles =
    options.append && existingPuzzles.length > 0
      ? await hydrateManifestPuzzles(
          existingPuzzles,
          options,
          assetRoot,
          outDir,
        )
      : existingPuzzles;
  const diversityHistory = await loadDiversityHistory(
    hydratedExistingPuzzles,
    assetRoot,
    outDir,
    profile.difficulty,
    options.diversityHistoryLimit,
  );
  console.log(
    `Generating puzzle pack count=${options.days} start=${options.startDate} seed=${options.seed} outDir=${outDir}`,
  );
  console.log(
    `Generator options append=${options.append} keep=${options.keepPuzzles} intervalHours=${options.intervalHours} attempts=${options.attempts} retries=${options.retries} samples=${options.samples} beam=${options.beamWidth} branch=${options.branchLimit} candidates=${options.candidateWordLimit}`,
  );
  console.log(
    `Difficulty profile=${profile.difficulty} boardSize=${options.boardSize} maxWords=${options.maxWords} minWordLength=${options.minWordLength} minWordCount=${options.minWordCount} wordBank allowed=[${wordSelection.difficulties.join(",")}] words=${difficultyFilteredWords.length}/${wordBank.words.length} generationCandidates=${generationWords.length} candidateNeedsManualClueRatio=${needsManualClueRatio(generationWords).toFixed(3)} byDifficulty=${JSON.stringify(wordBankDifficultyCounts)}`,
  );
  console.log(
    `Diversity gate history=${diversityHistory.length}/${Math.max(0, Math.floor(options.diversityHistoryLimit))} maxAnswerReuse=${diversityThresholds.maxSharedAnswerRatio} maxScaffoldSimilarity=${diversityThresholds.maxScaffoldSimilarity}`,
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
    let selectedDiversity = null;
    const attempts = [];
    const dayStartTime = Date.now();
    const slotDiversityHistory = selectComparableDiversityHistory(
      diversityHistory,
      slotInfo.slotId,
      options.diversityHistoryLimit,
    );
    const sameDateAnswerHistory = await loadSameDateAnswerHistory(
      [...hydratedExistingPuzzles, ...puzzles],
      assetRoot,
      outDir,
      slotInfo.date,
      slotInfo.slotId,
      slotInfo.alias,
    );
    // 같은 날 다른 난이도가 쓴 정답과, 같은 난이도의 최근 발행 정답을 함께 배제한다.
    // 문자열이 같은 정답만 빼면 어제 "대학생"을 쓰고 오늘 "학생"이 나오는 반복을
    // 막지 못하므로, 어근(2음절 조각)을 공유하는 후보까지 후보 풀에서 제외한다.
    const recentAnswers = [
      ...sameDateAnswerHistory.answers,
      ...slotDiversityHistory.flatMap((snapshot) => snapshot.answers),
    ];
    const slotGenerationWords = excludeAnswersSharingFragments(
      generationWords,
      recentAnswers,
      answerVarietyThresholds.sharedFragmentLength,
    );
    const slotGenerationWordMap = makeWordMap(slotGenerationWords);

    if (slotGenerationWords.length < profile.minWordCount) {
      throw new Error(
        `Not enough unused recent answers for ${profile.difficulty}: candidates=${slotGenerationWords.length} minEntries=${profile.minWordCount}`,
      );
    }

    console.log(
      `[${slotInfo.slotId}] generation started (${dayIndex + 1}/${options.days}) packId=${packId}`,
    );
    console.log(
      `[${slotInfo.slotId}] recent answer gate sameDatePuzzles=${sameDateAnswerHistory.puzzleCount} sameDateAnswers=${sameDateAnswerHistory.answers.size} recentPuzzles=${slotDiversityHistory.length} excludedAnswers=${recentAnswers.length} candidates=${slotGenerationWords.length}/${generationWords.length}`,
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
        maxAnswersPerSyllable: answerVarietyThresholds.maxAnswersPerSyllable,
        maxWords: options.maxWords,
        minWordLength: options.minWordLength,
        samples: options.samples,
        seed,
        wordBank: slotGenerationWords,
      });
      const retryElapsedSeconds = (
        (Date.now() - retryStartTime) /
        1000
      ).toFixed(1);

      const candidates = boards.map((candidate, candidateIndex) => {
        const quality = evaluateQuality(candidate, qualityThresholds);
        const candidateEntries = analyzeRuns(candidate, slotGenerationWordMap)
          .runs.map((run) => slotGenerationWordMap.get(run.answer))
          .filter((entry) => entry != null);
        const manualClueRatio = needsManualClueRatio(candidateEntries);
        const manualClueGatePass =
          manualClueRatio <= DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO;
        const diversity = evaluatePuzzleDiversity(
          {
            answers: candidateEntries.map((entry) => entry.answer),
            occupiedCellKeys: getOccupiedCellKeys(candidate.grid),
          },
          slotDiversityHistory,
          diversityThresholds,
        );
        // 생성기가 배치 단계에서 이미 군집을 거르지만, 발행 직전 최종 검증으로 한 번
        // 더 확인해 어떤 사유로 후보가 탈락했는지 리포트에 남긴다.
        const variety = evaluateAnswerVariety(
          candidateEntries.map((entry) => entry.answer),
          answerVarietyThresholds,
        );
        return {
          candidateIndex,
          failureReasons: [
            ...summarizeFailureReasons(quality),
            ...(manualClueGatePass ? [] : ["maxNeedsManualClueRatio"]),
            ...(variety.sharedFragments.length === 0
              ? []
              : ["sharedAnswerFragment"]),
            ...(variety.overusedSyllables.length === 0
              ? []
              : ["maxAnswersPerSyllable"]),
            ...(diversity.maxSharedAnswerRatio <=
            diversityThresholds.maxSharedAnswerRatio
              ? []
              : ["maxSharedAnswerRatio"]),
            ...(diversity.maxScaffoldSimilarity <=
            diversityThresholds.maxScaffoldSimilarity
              ? []
              : ["maxScaffoldSimilarity"]),
          ],
          diversity: {
            comparedPuzzleCount: diversity.comparisons.length,
            maxScaffoldSimilarity: Number(
              diversity.maxScaffoldSimilarity.toFixed(3),
            ),
            maxSharedAnswerRatio: Number(
              diversity.maxSharedAnswerRatio.toFixed(3),
            ),
            sameDateComparedPuzzleCount: sameDateAnswerHistory.puzzleCount,
            sameDateExcludedAnswerCount: sameDateAnswerHistory.answers.size,
            sameDateSharedAnswerCount: 0,
            sharedAnswerFragments: variety.sharedFragments.map(
              (entry) => entry.fragment,
            ),
            overusedSyllables: variety.overusedSyllables.map(
              (entry) => entry.syllable,
            ),
          },
          metrics: {
            autoRunCount: candidate.metrics.autoRunCount,
            bboxDensity: candidate.metrics.bboxDensity,
            crossRatio: candidate.metrics.crossRatio,
            manualClueRatio,
            multiCrossEntries: candidate.metrics.multiIntersectionPlacements,
            wordCount: candidate.metrics.wordCount,
          },
          pass:
            quality.pass &&
            manualClueGatePass &&
            diversity.pass &&
            variety.pass,
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
        selectedDiversity = candidates[acceptedIndex].diversity;
        console.log(
          `[${slotInfo.slotId}] accepted candidate=${acceptedIndex} entries=${board.metrics.wordCount} cross=${board.metrics.crossRatio} bbox=${board.metrics.bboxDensity} answerReuse=${selectedDiversity.maxSharedAnswerRatio} scaffold=${selectedDiversity.maxScaffoldSimilarity} elapsed=${retryElapsedSeconds}s`,
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
      difficultyFilteredWords,
      wordBank.metadata,
      selectedQuality,
      options.difficulty,
      { themeTag: options.theme, themeLabel },
    );
    const sameDateSharedAnswers = [
      ...new Set(
        puzzle.entries
          .map((entry) => entry.answer)
          .filter((answer) => sameDateAnswerHistory.answers.has(answer)),
      ),
    ];

    if (sameDateSharedAnswers.length > 0) {
      throw new Error(
        `Same-date answers leaked into ${slotInfo.slotId}: ${sameDateSharedAnswers.join(",")}`,
      );
    }

    const publishedVariety = evaluateAnswerVariety(
      puzzle.entries.map((entry) => entry.answer),
      answerVarietyThresholds,
    );

    if (!publishedVariety.pass) {
      throw new Error(
        `Answer variety violated in ${slotInfo.slotId}: fragments=[${publishedVariety.sharedFragments
          .map((entry) => `${entry.fragment}:${entry.answers.join("/")}`)
          .join(",")}] syllables=[${publishedVariety.overusedSyllables
          .map((entry) => `${entry.syllable}:${entry.answers.join("/")}`)
          .join(",")}]`,
      );
    }
    const filename = `${puzzle.puzzleId}.json`;
    const filePath = path.join(outDir, filename);

    await writeFile(filePath, `${JSON.stringify(puzzle, null, 2)}\n`);
    console.log(
      `[${slotInfo.slotId}] wrote ${filename} dayElapsed=${((Date.now() - dayStartTime) / 1000).toFixed(1)}s`,
    );
    puzzles.push({
      alias: puzzle.alias,
      date: slotInfo.date,
      difficulty: puzzle.difficulty,
      packId,
      publishedAt: slotInfo.publishedAt,
      puzzleId: puzzle.puzzleId,
      path: `/puzzles/${filename}`,
      quality: puzzle.quality,
      metrics: puzzle.metrics,
      slotId: slotInfo.slotId,
      ...buildThemeMeta(puzzle.themeTag, puzzle.themeLabel),
    });

    // needsManualClue는 발행 차단이 아니라 자체 문장 큐레이션 현황이다. 사전
    // 뜻풀이도 기본 허용하되 비율을 리포트에 남겨 후속 편집 대상을 추적한다.
    const manualClueRatio = needsManualClueRatio(puzzle.entries);
    console.log(
      `[${slotInfo.slotId}] dictionary clue ratio ${(manualClueRatio * 100).toFixed(1)}% ` +
        `(accepted by default clue policy)`,
    );
    generationReport.push({
      alias: puzzle.alias,
      date: slotInfo.date,
      difficulty: puzzle.difficulty,
      packId,
      publishedAt: slotInfo.publishedAt,
      slotId: slotInfo.slotId,
      accepted: true,
      failureReasonCounts: countReasons(attempts),
      selected: {
        puzzleId: puzzle.puzzleId,
        difficulty: puzzle.difficulty,
        quality: puzzle.quality,
        metrics: puzzle.metrics,
        diversity: selectedDiversity,
      },
      attempts,
    });
  }
  const mergedManifestPuzzles = options.append
    ? mergeManifestPuzzles(
        hydratedExistingPuzzles,
        puzzles,
        options.keepPuzzles,
      )
    : puzzles;

  const manifestPuzzles = await hydrateManifestPuzzles(
    mergedManifestPuzzles,
    options,
    assetRoot,
    outDir,
  );
  const manifestDifficulties = [
    ...new Set(manifestPuzzles.map((puzzle) => puzzle.difficulty)),
  ];

  const manifest = {
    generatedAt: new Date().toISOString(),
    startDate: options.startDate,
    days: manifestPuzzles.length,
    keep: options.keepPuzzles,
    difficulty:
      manifestDifficulties.length === 1 ? manifestDifficulties[0] : "mixed",
    difficultyProfile: {
      difficulty: profile.difficulty,
      boardSize: options.boardSize,
      maxWords: options.maxWords,
      minWordLength: options.minWordLength,
      minWordCount: options.minWordCount,
      wordDifficulties: profile.wordDifficulties,
      effectiveWordDifficulties: wordSelection.difficulties,
      broadened: wordSelection.broadened,
    },
    wordBank: {
      path: options.wordBankPath,
      sourceName: wordBank.metadata?.sourceName ?? "sample",
      sourceUrl: wordBank.metadata?.sourceUrl,
      license: wordBank.metadata?.license,
      rawWordCount: wordBank.rawWordCount,
      wordCount: wordBank.words.length,
      difficultyWordCount: difficultyFilteredWords.length,
      byDifficulty: wordBankDifficultyCounts,
    },
    qualityThresholds,
    diversityThresholds: {
      historyLimit: Math.max(0, Math.floor(options.diversityHistoryLimit)),
      maxSameDateSharedAnswers: 0,
      ...diversityThresholds,
      ...answerVarietyThresholds,
    },
    puzzles: manifestPuzzles,
  };

  await writeFile(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    path.join(outDir, "generation-report.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        diversityThresholds: manifest.diversityThresholds,
        report: generationReport,
      },
      null,
      2,
    )}\n`,
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
