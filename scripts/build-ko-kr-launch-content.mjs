#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

import { analyzeRuns, makeWordMap } from "./crossword-generator-prototype.mjs";
import { generateBoardWithRetries } from "../server/batch/puzzle-board-engine.mjs";
import {
  calculateGameContentChecksum,
  validateGameContentV1,
  verifyGameContentChecksum,
} from "../packages/crossword-core/src/gameContent.ts";
import {
  canonicalizeForChecksum,
  compareCanonicalStrings,
} from "../packages/crossword-core/src/saveV2.ts";
import {
  DIFFICULTY_PROFILES,
  selectWordsForProfile,
} from "../packages/crossword-core/src/difficultyProfiles.ts";
import {
  areCluesSimilar,
  normalizeClueForSimilarity,
} from "../packages/crossword-core/src/clueSimilarity.ts";
import {
  DAILY_WEEKDAYS,
  KO_KR_LAUNCH_CONTENT_CONTRACT,
  LAUNCH_CONTENT_CATALOG_SCHEMA_VERSION,
  WORLD_MAP_GRAPH_SCHEMA_VERSION,
  validateKoKrLaunchContentCatalogStructureV1,
  validateWorldMapGraphV1,
} from "../packages/crossword-core/src/launchContentCatalog.ts";
import { loadBundledFirstRunGameContents } from "../src/game-shell/onboardingGameContent.ts";

const execFileAsync = promisify(execFile);

export const LAUNCH_THEME_IDS = Object.freeze([
  "table-kitchen",
  "living-world",
  "home-family",
  "road-places",
  "learning-culture",
  "work-community",
]);

const CONTENT_LOCALE = "ko-KR";
const RELEASE_TIME_ZONE = "Asia/Seoul";
const LANGUAGE_PROFILE = Object.freeze({ id: "ko-KR", version: 1 });
const LICENSE_MANIFEST_ID = "ko-kr-launch-license-manifest-v1";
const GENERATED_PACK_ID = "ko-kr-launch-v1";
const CATALOG_ID = "ko-kr-launch-catalog-v1";
const GRAPH_ID = "ko-kr-world-map-v1";
const ARTIFACT_STATUS = "candidate";
const GENERATED_AT = "2026-07-18T00:00:00.000Z";
const DAILY_START_DATE = "2026-07-20";
const MIN_REVIEWED_WORD_COUNT = 1_100;
const MIN_CLIENT_VERSION = "0.1.0";
const MAX_AUTO_RUN_RATIO = 0.5;
const MIN_MULTI_CROSS_RATIO = 0.65;
const GENERATOR_DEPENDENCY_PATHS = Object.freeze([
  "scripts/build-ko-kr-launch-content.mjs",
  "scripts/crossword-generator-prototype.mjs",
  "server/batch/puzzle-board-engine.mjs",
  "packages/crossword-core/src/clueCuration.ts",
  "packages/crossword-core/src/clueSimilarity.ts",
  "packages/crossword-core/src/difficultyProfiles.ts",
  "packages/crossword-core/src/gameContent.ts",
  "packages/crossword-core/src/gameMetaProgression.ts",
  "packages/crossword-core/src/languageProfile.ts",
  "packages/crossword-core/src/launchContentCatalog.ts",
  "packages/crossword-core/src/puzzle.ts",
  "packages/crossword-core/src/saveV2.ts",
  "packages/crossword-core/src/sha256.ts",
  "packages/crossword-core/src/types.ts",
  "src/data/onboardingPuzzle.ts",
  "src/game-shell/onboardingGameContent.ts",
  "data/game-content/v1/ko-KR/reviewed-launch-wordbank.json",
  "data/game-content/v1/ko-KR/license-manifest.json",
]);
const MIN_DAILY_THEME_ENTRY_RATIO = 0.5;
export const DAILY_CONNECTOR_WORD_LIMIT = 80;
const MAX_GENERATION_WORD_LENGTH = Object.freeze({
  easy: 3,
  normal: 3,
  hard: 3,
});
const DAILY_THEME_DIFFICULTIES = Object.freeze(["normal", "hard"]);

const DEFAULT_OPTIONS = Object.freeze({
  attempts: 30,
  baseSeed: 20260718,
  beamWidth: 16,
  branchLimit: 14,
  candidateWordLimit: 600,
  denseCandidateLimit: 96,
  dryRunCount: 0,
  outputRoot: "public/game-content/v1/ko-KR",
  retries: 6,
  samples: 5,
  startIndex: 0,
  wordBankPath: "data/game-content/v1/ko-KR/reviewed-launch-wordbank.json",
});

function sha256(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value == null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareCanonicalStrings(left, right))
      .map(([key, child]) => [key, stableJson(child)]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(stableJson(value));
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function snapshotOptionalFile(filePath) {
  try {
    return sha256(await readFile(filePath));
  } catch (error) {
    if (error?.code === "ENOENT") return "absent";
    throw error;
  }
}

function requireString(value, field) {
  requireCondition(
    typeof value === "string" && value.trim() !== "",
    `${field} must be a non-empty string`,
  );
  return value.trim();
}

function requireStringArray(value, field, { allowDuplicates = false } = {}) {
  requireCondition(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => typeof item === "string" && item.trim() !== ""),
    `${field} must be a non-empty string array`,
  );
  const normalized = value.map((item) => item.trim());
  if (!allowDuplicates) {
    requireCondition(
      new Set(normalized).size === normalized.length,
      `${field} must not contain duplicates`,
    );
  }
  return normalized;
}

function parsePositiveInteger(rawValue, field, { allowZero = false } = {}) {
  const value = Number(rawValue);
  requireCondition(
    Number.isInteger(value) && (allowZero ? value >= 0 : value > 0),
    `${field} must be ${allowZero ? "a non-negative" : "a positive"} integer`,
  );
  return value;
}

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };
  for (const argument of argv) {
    const [key, rawValue] = argument.replace(/^--/, "").split("=");
    if (key === "attempts" && rawValue != null) {
      options.attempts = parsePositiveInteger(rawValue, key);
    }
    if (key === "beam" && rawValue != null) {
      options.beamWidth = parsePositiveInteger(rawValue, key);
    }
    if (key === "branch" && rawValue != null) {
      options.branchLimit = parsePositiveInteger(rawValue, key);
    }
    if (key === "candidates" && rawValue != null) {
      options.candidateWordLimit = parsePositiveInteger(rawValue, key);
    }
    if (key === "dense" && rawValue != null) {
      options.denseCandidateLimit = parsePositiveInteger(rawValue, key);
    }
    if (key === "dry-run") {
      options.dryRunCount =
        rawValue == null ? 1 : parsePositiveInteger(rawValue, key);
    }
    if (key === "out" && rawValue) options.outputRoot = rawValue;
    if (key === "retries" && rawValue != null) {
      options.retries = parsePositiveInteger(rawValue, key);
    }
    if (key === "samples" && rawValue != null) {
      options.samples = parsePositiveInteger(rawValue, key);
    }
    if (key === "seed" && rawValue != null) {
      options.baseSeed = parsePositiveInteger(rawValue, key, {
        allowZero: true,
      });
    }
    if (key === "start-index" && rawValue != null) {
      options.startIndex = parsePositiveInteger(rawValue, key, {
        allowZero: true,
      });
    }
    if (key === "wordbank" && rawValue) options.wordBankPath = rawValue;
  }
  requireCondition(
    options.dryRunCount > 0 || options.startIndex === 0,
    "--start-index is available only with --dry-run",
  );
  return options;
}

function addUtcDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function chapterDifficulty(chapterNumber, boardNumber) {
  if (chapterNumber === 1 && boardNumber <= 2) return "easy";
  if (chapterNumber === 2 && boardNumber === 1) return "easy";
  if (chapterNumber === 3 && boardNumber === 1) return "easy";
  if (boardNumber === 10 || (chapterNumber === 3 && boardNumber === 9)) {
    return "hard";
  }
  return "normal";
}

export function buildLaunchRoutePlan() {
  const routes = [];
  let catalogOrder = 0;

  for (let chapterNumber = 1; chapterNumber <= 3; chapterNumber += 1) {
    const chapterId = `chapter-${String(chapterNumber).padStart(2, "0")}`;
    for (let boardNumber = 1; boardNumber <= 10; boardNumber += 1) {
      const suffix = String(boardNumber).padStart(2, "0");
      routes.push({
        catalogOrder: catalogOrder++,
        route: { kind: "chapter" },
        puzzleId: `ko-kr-${chapterId}-${suffix}`,
        slotId: `${chapterId}-${suffix}`,
        chapterId,
        themeId: `${chapterId}-memory-path`,
        difficulty: chapterDifficulty(chapterNumber, boardNumber),
      });
    }
  }

  for (let weekIndex = 0; weekIndex < LAUNCH_THEME_IDS.length; weekIndex += 1) {
    const themeId = LAUNCH_THEME_IDS[weekIndex];
    for (const [dayIndex, weekday] of DAILY_WEEKDAYS.entries()) {
      const localDate = addUtcDays(
        DAILY_START_DATE,
        weekIndex * DAILY_WEEKDAYS.length + dayIndex,
      );
      routes.push({
        catalogOrder: catalogOrder++,
        route: { kind: "daily", weekday },
        puzzleId: `ko-kr-daily-${localDate}`,
        slotId: `${localDate}-h00`,
        chapterId: `chapter-${String((weekIndex % 3) + 1).padStart(2, "0")}`,
        themeId,
        difficulty: weekday === "friday" ? "hard" : "normal",
      });
    }
  }

  for (let index = 0; index < 12; index += 1) {
    const number = String(index + 1).padStart(2, "0");
    routes.push({
      catalogOrder: catalogOrder++,
      route: { kind: "bonus" },
      puzzleId: `ko-kr-bonus-${number}`,
      slotId: `bonus-${number}`,
      chapterId: `chapter-${String((index % 3) + 1).padStart(2, "0")}`,
      themeId: "bonus-memory-cache",
      difficulty: "normal",
    });
  }

  for (let index = 0; index < 6; index += 1) {
    const number = String(index + 1).padStart(2, "0");
    routes.push({
      catalogOrder: catalogOrder++,
      route: { kind: "weekly-challenge" },
      puzzleId: `ko-kr-weekly-challenge-${number}`,
      slotId: `weekly-challenge-${number}`,
      chapterId: `chapter-${String((index % 3) + 1).padStart(2, "0")}`,
      themeId: "weekly-challenge",
      difficulty: "hard",
    });
  }

  requireCondition(
    routes.length === 90,
    "generated route plan must contain 90 boards",
  );
  return routes;
}

function generationPriority(route) {
  if (route.route.kind === "daily") return 0;
  if (route.route.kind === "weekly-challenge") return 1;
  if (route.route.kind === "chapter") return 2;
  return 3;
}

export function orderRoutesForGeneration(routes) {
  return [...routes].sort(
    (left, right) =>
      generationPriority(left) - generationPriority(right) ||
      left.catalogOrder - right.catalogOrder,
  );
}

export { areCluesSimilar };

export function normalizeClueForCooldown(clue) {
  return normalizeClueForSimilarity(clue);
}

function normalizeReviewedWord(rawWord, index) {
  requireCondition(
    rawWord != null && typeof rawWord === "object" && !Array.isArray(rawWord),
    `words[${index}] must be an object`,
  );
  const answer = requireString(
    rawWord.answer,
    `words[${index}].answer`,
  ).normalize("NFC");
  const answerCells = requireStringArray(
    rawWord.answerCells,
    `words[${index}].answerCells`,
    { allowDuplicates: true },
  ).map((cell) => cell.normalize("NFC"));
  requireCondition(
    answerCells.join("") === answer,
    `words[${index}].answerCells must project to answer`,
  );
  const clue = requireString(rawWord.clue, `words[${index}].clue`).normalize(
    "NFC",
  );
  const definition = requireString(
    rawWord.definition,
    `words[${index}].definition`,
  ).normalize("NFC");
  const shortExplanation = requireString(
    rawWord.shortExplanation,
    `words[${index}].shortExplanation`,
  ).normalize("NFC");
  const clueSource = requireString(
    rawWord.clueSource,
    `words[${index}].clueSource`,
  );
  requireCondition(
    ["editorial-reviewed-adaptation", "krdict-definition-reviewed"].includes(
      clueSource,
    ),
    `words[${index}].clueSource is not launch-approved`,
  );
  requireCondition(
    rawWord.needsManualClue === false,
    `words[${index}].needsManualClue must be false`,
  );
  requireCondition(
    ["easy", "normal", "hard"].includes(rawWord.difficulty),
    `words[${index}].difficulty is invalid`,
  );
  requireCondition(
    Number.isInteger(rawWord.reviewLedgerIndex) &&
      rawWord.reviewLedgerIndex >= 0,
    `words[${index}].reviewLedgerIndex must be a non-negative integer`,
  );
  const sourceUrl = requireString(
    rawWord.sourceUrl,
    `words[${index}].sourceUrl`,
  );
  requireCondition(
    new URL(sourceUrl).protocol === "https:",
    `words[${index}].sourceUrl must use HTTPS`,
  );
  const domainTags = requireStringArray(
    rawWord.domainTags ?? rawWord.themeTags ?? ["general"],
    `words[${index}].domainTags`,
  );
  return {
    ...rawWord,
    answer,
    answerCells,
    clue,
    definition,
    shortExplanation,
    clueSource,
    difficulty: rawWord.difficulty,
    source: requireString(rawWord.source, `words[${index}].source`),
    sourceEntryId: requireString(
      rawWord.sourceEntryId,
      `words[${index}].sourceEntryId`,
    ),
    reviewLedgerIndex: rawWord.reviewLedgerIndex,
    definitionChecksum: requireString(
      rawWord.definitionChecksum,
      `words[${index}].definitionChecksum`,
    ),
    sourceUrl,
    licenseId: requireString(rawWord.licenseId, `words[${index}].licenseId`),
    domainTags,
    themeTags: requireStringArray(
      rawWord.themeTags ?? domainTags,
      `words[${index}].themeTags`,
    ),
    needsManualClue: false,
  };
}

export function isGenerationWordLengthEligible(word, difficulty) {
  const maximum = MAX_GENERATION_WORD_LENGTH[difficulty];
  requireCondition(
    Number.isInteger(maximum) && maximum > 0,
    `unsupported generation difficulty: ${difficulty}`,
  );
  return word.answerCells.length <= maximum;
}

function deduplicateReviewedWords(words, firstRunContents) {
  const reservedAnswers = new Set(
    firstRunContents.flatMap((content) =>
      content.entries.map((entry) => entry.answer),
    ),
  );
  const acceptedClues = firstRunContents.flatMap((content) =>
    content.entries.map((entry) => entry.clue),
  );
  const uniqueByAnswer = new Map();
  let answerDuplicates = 0;
  let onboardingAnswerConflicts = 0;
  let clueConflicts = 0;

  for (const word of words) {
    if (reservedAnswers.has(word.answer)) {
      onboardingAnswerConflicts += 1;
      continue;
    }
    if (uniqueByAnswer.has(word.answer)) {
      answerDuplicates += 1;
      continue;
    }
    if (acceptedClues.some((clue) => areCluesSimilar(clue, word.clue))) {
      clueConflicts += 1;
      continue;
    }
    uniqueByAnswer.set(word.answer, word);
    acceptedClues.push(word.clue);
  }

  return {
    words: [...uniqueByAnswer.values()],
    exclusions: {
      answerDuplicates,
      onboardingAnswerConflicts,
      clueConflicts,
    },
  };
}

async function loadReviewedWordBank(
  repositoryRoot,
  wordBankPath,
  firstRunContents,
) {
  const resolvedPath = path.resolve(repositoryRoot, wordBankPath);
  const text = await readFile(resolvedPath, "utf8");
  const document = JSON.parse(text);
  requireCondition(
    document?.metadata?.schemaVersion === "launch-wordbank/1",
    "reviewed wordbank schemaVersion must be launch-wordbank/1",
  );
  requireCondition(
    document.metadata.contentLocale === CONTENT_LOCALE,
    "reviewed wordbank contentLocale must be ko-KR",
  );
  requireCondition(
    Array.isArray(document.words) &&
      document.words.length >= MIN_REVIEWED_WORD_COUNT,
    `reviewed wordbank must contain at least ${MIN_REVIEWED_WORD_COUNT} words`,
  );
  const normalized = document.words.map((word, index) =>
    normalizeReviewedWord(word, index),
  );
  const deduplicated = deduplicateReviewedWords(normalized, firstRunContents);
  requireCondition(
    deduplicated.words.length >= MIN_REVIEWED_WORD_COUNT,
    `cooldown-safe reviewed pool must retain at least ${MIN_REVIEWED_WORD_COUNT} words; retained=${deduplicated.words.length}`,
  );
  const themeInventory = Object.fromEntries(
    LAUNCH_THEME_IDS.map((themeId) => {
      const themeWords = deduplicated.words.filter(
        (word) =>
          DAILY_THEME_DIFFICULTIES.some((difficulty) =>
            isGenerationWordLengthEligible(word, difficulty),
          ) &&
          (word.domainTags.includes(themeId) ||
            word.themeTags.includes(themeId)),
      );
      const hardEligible = selectWordsForProfile(
        themeWords.filter((word) =>
          isGenerationWordLengthEligible(word, "hard"),
        ),
        DIFFICULTY_PROFILES.hard,
      ).words.length;
      requireCondition(
        themeWords.length >= 150 && hardEligible >= 150,
        `${themeId} launch inventory must retain at least 150 total and hard-eligible words; total=${themeWords.length}, hardEligible=${hardEligible}`,
      );
      return [themeId, { total: themeWords.length, hardEligible }];
    }),
  );
  return {
    path: path.relative(repositoryRoot, resolvedPath),
    checksum: sha256(text),
    metadata: document.metadata,
    originalWordCount: normalized.length,
    themeInventory,
    ...deduplicated,
  };
}

function retrySeed(baseSeed, route, retryIndex) {
  const digest = createHash("sha256")
    .update(`${baseSeed}:${route.puzzleId}:retry:${retryIndex}`, "utf8")
    .digest();
  return digest.readUInt32BE(0);
}

export function evaluateGeneratedBoardQuality(board, difficulty) {
  const profile = DIFFICULTY_PROFILES[difficulty];
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
  const thresholds = {
    minWordCount: profile.minWordCount,
    minCrossRatio: profile.minCrossRatio,
    minBboxDensity: profile.minBboxDensity,
    minMultiCrossRatio: MIN_MULTI_CROSS_RATIO,
    maxAutoRunRatio: MAX_AUTO_RUN_RATIO,
  };
  const checks = [
    ["minWordCount", metrics.wordCount, thresholds.minWordCount, ">="],
    ["minCrossRatio", metrics.crossRatio, thresholds.minCrossRatio, ">="],
    ["minBboxDensity", metrics.bboxDensity, thresholds.minBboxDensity, ">="],
    [
      "minMultiCrossRatio",
      multiCrossRatio,
      thresholds.minMultiCrossRatio,
      ">=",
    ],
    ["maxAutoRunRatio", autoRunRatio, thresholds.maxAutoRunRatio, "<="],
  ].map(([key, actual, expected, operator]) => ({
    key,
    actual,
    expected,
    operator,
    pass: operator === ">=" ? actual >= expected : actual <= expected,
  }));
  return {
    pass: checks.every((check) => check.pass),
    checks,
    ratios: { autoRunRatio, multiCrossRatio },
    thresholds,
  };
}

export function attemptsForRetry(maxAttempts, retryIndex) {
  const escalation = [3, 5, 8, 12, 20, 30, maxAttempts];
  return Math.min(
    maxAttempts,
    escalation[Math.min(retryIndex, escalation.length - 1)],
  );
}

function escalatedValue(maximum, retryIndex, stages) {
  return Math.min(
    maximum,
    retryIndex < stages.length ? stages[retryIndex] : maximum,
  );
}

export function searchOptionsForRetry(options, retryIndex) {
  return {
    attempts: attemptsForRetry(options.attempts, retryIndex),
    beamWidth: escalatedValue(
      options.beamWidth,
      retryIndex,
      [6, 8, 10, 12, 14, 16],
    ),
    branchLimit: escalatedValue(
      options.branchLimit,
      retryIndex,
      [6, 8, 10, 12, 14, 14],
    ),
    candidateWordLimit: escalatedValue(
      options.candidateWordLimit,
      retryIndex,
      [240, 320, 400, 500, 600, 600],
    ),
    denseCandidateLimit: escalatedValue(
      options.denseCandidateLimit,
      retryIndex,
      [32, 48, 64, 80, 96, 96],
    ),
    samples: escalatedValue(options.samples, retryIndex, [3, 3, 4, 4, 5, 5]),
  };
}

function filterAvailableWords(words, route, usedAnswers) {
  const available = words.filter(
    (word) =>
      !usedAnswers.has(word.answer) &&
      isGenerationWordLengthEligible(word, route.difficulty),
  );
  const profile = DIFFICULTY_PROFILES[route.difficulty];
  if (route.route.kind !== "daily") {
    const selection = selectWordsForProfile(available, profile);
    requireCondition(
      selection.words.length >= 150,
      `${route.puzzleId} has insufficient words after difficulty/cooldown filters: ${selection.words.length}`,
    );
    return selection;
  }

  const hasTheme = (word) =>
    word.domainTags.includes(route.themeId) ||
    word.themeTags.includes(route.themeId);
  const themeSelection = selectWordsForProfile(
    available.filter(hasTheme),
    profile,
  );
  const connectorSelection = selectWordsForProfile(
    available.filter((word) => !hasTheme(word)),
    profile,
  );
  const connectorWords = connectorSelection.words.slice(
    0,
    DAILY_CONNECTOR_WORD_LIMIT,
  );
  const selection = {
    words: [...themeSelection.words, ...connectorWords],
    difficulties: [
      ...new Set([
        ...themeSelection.difficulties,
        ...connectorSelection.difficulties,
      ]),
    ],
    broadened: themeSelection.broadened || connectorSelection.broadened,
    broadenedWith: [
      ...new Set([
        ...themeSelection.broadenedWith,
        ...connectorSelection.broadenedWith,
      ]),
    ],
    themeWordCount: themeSelection.words.length,
    connectorWordCount: connectorWords.length,
  };
  requireCondition(
    selection.words.length >= 150,
    `${route.puzzleId} has insufficient words after theme/difficulty/cooldown filters: ${selection.words.length}`,
  );
  return selection;
}

function evaluateRouteBoardQuality(board, route, wordPool) {
  const base = evaluateGeneratedBoardQuality(board, route.difficulty);
  if (route.route.kind !== "daily") return base;
  const wordMap = makeWordMap(wordPool);
  const runs = analyzeRuns(board, wordMap).runs;
  const themedEntryCount = runs.filter((run) => {
    const word = wordMap.get(run.answer);
    return (
      word?.domainTags.includes(route.themeId) ||
      word?.themeTags.includes(route.themeId)
    );
  }).length;
  const themeEntryRatio =
    runs.length === 0 ? 0 : Number((themedEntryCount / runs.length).toFixed(3));
  const themeCheck = {
    key: "minDailyThemeEntryRatio",
    actual: themeEntryRatio,
    expected: MIN_DAILY_THEME_ENTRY_RATIO,
    operator: ">=",
    pass: themeEntryRatio >= MIN_DAILY_THEME_ENTRY_RATIO,
  };
  return {
    ...base,
    pass: base.pass && themeCheck.pass,
    checks: [...base.checks, themeCheck],
    ratios: {
      ...base.ratios,
      themeEntryRatio,
    },
    thresholds: {
      ...base.thresholds,
      minDailyThemeEntryRatio: MIN_DAILY_THEME_ENTRY_RATIO,
    },
  };
}

function summarizeCandidateBoard(board, quality, candidateIndex) {
  return {
    candidateIndex,
    pass: quality.pass,
    failedChecks: quality.checks
      .filter((check) => !check.pass)
      .map((check) => check.key),
    metrics: {
      wordCount: board.metrics.wordCount,
      autoRunCount: board.metrics.autoRunCount,
      crossRatio: board.metrics.crossRatio,
      bboxDensity: board.metrics.bboxDensity,
      multiIntersectionPlacements: board.metrics.multiIntersectionPlacements,
      connectedComponents: board.metrics.connectedComponents,
      accidentalRunCount: board.metrics.accidentalRuns.length,
    },
    ratios: quality.ratios,
  };
}

function serializeGeneratedContent(
  board,
  route,
  wordPool,
  generatorIdentity,
  reviewIdentity,
  licenseManifestChecksum,
) {
  const wordMap = makeWordMap(wordPool);
  const analysis = analyzeRuns(board, wordMap);
  requireCondition(
    analysis.invalidRuns.length === 0,
    `${route.puzzleId} contains an untracked auto-run`,
  );
  const entries = analysis.runs.map((run, index) => {
    const word = wordMap.get(run.answer);
    requireCondition(
      word != null,
      `${route.puzzleId} is missing metadata for ${run.answer}`,
    );
    return {
      id: `${run.direction === "across" ? "a" : "d"}${index + 1}`,
      answer: word.answer,
      answerCells: [...word.answerCells],
      clue: word.clue,
      clueSource: word.clueSource,
      needsManualClue: false,
      shortExplanation: word.shortExplanation,
      source: word.source,
      sourceEntryId: word.sourceEntryId,
      sourceUrl: word.sourceUrl,
      licenseId: word.licenseId,
      domainTags: [...word.domainTags],
      direction: run.direction,
      row: run.row,
      col: run.col,
      generatedBy: run.isPlaced ? "placed" : "auto",
    };
  });
  const unsealed = {
    schemaVersion: "game-content/1",
    contentLocale: CONTENT_LOCALE,
    releaseTimeZone: RELEASE_TIME_ZONE,
    languageProfile: { ...LANGUAGE_PROFILE },
    puzzleId: route.puzzleId,
    packId: GENERATED_PACK_ID,
    slotId: route.slotId,
    grid: board.grid.map((row) => row.map((cell) => cell ?? "")),
    entries,
    difficulty: route.difficulty,
    themeId: route.themeId,
    chapterId: route.chapterId,
    worldTriggerSet: [],
    generatorCommit: generatorIdentity.commit,
    generatorConfigHash: generatorIdentity.configHash,
    contentChecksum: "sha256:unsealed",
    licenseManifestId: LICENSE_MANIFEST_ID,
    licenseManifestChecksum,
    review: {
      reviewerId: reviewIdentity.reviewerId,
      reviewedAt: reviewIdentity.reviewedAt,
      manualCoverage: 1,
    },
    minClientVersion: MIN_CLIENT_VERSION,
  };
  const content = {
    ...unsealed,
    contentChecksum: calculateGameContentChecksum(unsealed),
  };
  const validation = validateGameContentV1(content, {
    requestedContentLocale: CONTENT_LOCALE,
    verifyChecksum: verifyGameContentChecksum,
  });
  requireCondition(
    validation.pass && validation.content != null,
    `${route.puzzleId} failed GameContentV1 validation: ${validation.issues
      .map((issue) => `${issue.code}:${issue.path}`)
      .join(",")}`,
  );
  return validation.content;
}

async function generateRouteContent(
  route,
  reviewedWords,
  usedAnswers,
  options,
  generatorIdentity,
  reviewIdentity,
  licenseManifestChecksum,
) {
  const selection = filterAvailableWords(reviewedWords, route, usedAnswers);
  const generation = generateBoardWithRetries({
    retries: options.retries,
    seedForRetry: (retryIndex) =>
      retrySeed(options.baseSeed, route, retryIndex),
    searchOptionsForRetry: (retryIndex) =>
      searchOptionsForRetry(options, retryIndex),
    buildGeneratorOptions: ({ searchOptions, seed }) => ({
      allowAdjacent: true,
      ...searchOptions,
      boardSize: DIFFICULTY_PROFILES[route.difficulty].boardSize,
      maxWords: DIFFICULTY_PROFILES[route.difficulty].maxWords,
      minWordLength: DIFFICULTY_PROFILES[route.difficulty].minWordLength,
      seed,
      wordBank: selection.words,
    }),
    evaluateCandidate: (board) =>
      evaluateRouteBoardQuality(board, route, selection.words),
    summarizeCandidate: summarizeCandidateBoard,
  });

  if (generation.accepted) {
    const content = serializeGeneratedContent(
      generation.board,
      route,
      selection.words,
      generatorIdentity,
      reviewIdentity,
      licenseManifestChecksum,
    );
    for (const entry of content.entries) {
      requireCondition(
        !usedAnswers.has(entry.answer),
        `${route.puzzleId} reused answer ${entry.answer}`,
      );
    }
    const selectedWordMap = makeWordMap(selection.words);
    const selectedReport =
      generation.attempts[generation.selectedRetryIndex].candidates[
        generation.selectedCandidateIndex
      ];
    return {
      content,
      report: {
        puzzleId: route.puzzleId,
        packId: content.packId,
        contentChecksum: content.contentChecksum,
        artifactPath: artifactRelativePath(content),
        generatorCommit: content.generatorCommit,
        generatorConfigHash: content.generatorConfigHash,
        route: route.route,
        difficulty: route.difficulty,
        themeId: route.themeId,
        accepted: true,
        selectedRetryIndex: generation.selectedRetryIndex,
        selectedSeed: generation.selectedSeed,
        effectiveWordDifficulties: selection.difficulties,
        broadenedDifficultyPool: selection.broadened,
        wordPool: {
          total: selection.words.length,
          theme: selection.themeWordCount ?? null,
          connectors: selection.connectorWordCount ?? null,
        },
        quality: generation.quality,
        metrics: selectedReport.metrics,
        entryProvenance: content.entries.map((entry) => {
          const word = selectedWordMap.get(entry.answer);
          requireCondition(
            word != null,
            `${route.puzzleId} provenance is missing ${entry.answer}`,
          );
          return {
            entryId: entry.id,
            answer: entry.answer,
            sourceEntryId: entry.sourceEntryId,
            reviewLedgerIndex: word.reviewLedgerIndex,
            definitionChecksum: word.definitionChecksum,
            clueSource: entry.clueSource,
            generatedBy: entry.generatedBy,
          };
        }),
        attempts: generation.attempts,
      },
    };
  }
  throw new Error(
    `${route.puzzleId} failed quality gates after ${options.retries} deterministic retries: ${JSON.stringify(
      generation.attempts.map((attempt) => ({
        seed: attempt.seed,
        candidates: attempt.candidates,
      })),
    )}`,
  );
}

function auditCatalogCooldown(boards) {
  const answerOwner = new Map();
  const entries = [];
  for (const board of boards) {
    for (const entry of board.content.entries) {
      const previous = answerOwner.get(entry.answer);
      requireCondition(
        previous == null,
        `catalog answer cooldown violation: ${entry.answer} in ${previous} and ${board.content.puzzleId}`,
      );
      answerOwner.set(entry.answer, board.content.puzzleId);
      entries.push({
        puzzleId: board.content.puzzleId,
        entry,
      });
    }
  }
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < entries.length;
      rightIndex += 1
    ) {
      const left = entries[leftIndex];
      const right = entries[rightIndex];
      requireCondition(
        !areCluesSimilar(left.entry.clue, right.entry.clue),
        `catalog clue cooldown violation: ${left.puzzleId}/${left.entry.answer} and ${right.puzzleId}/${right.entry.answer}`,
      );
    }
  }
  return {
    policyId: "launch-global-unique-answer-and-clue-family-v1",
    enforcedScope: "all-93-launch-boards-global",
    uniqueAnswerCount: answerOwner.size,
    uniqueNormalizedClueFamilyCount: entries.length,
    pass: true,
  };
}

export function buildWorldMap(catalog) {
  const chapterBoards = catalog.boards.filter(
    (board) => board.route.kind === "chapter",
  );
  requireCondition(
    chapterBoards.length === 30,
    "world map requires 30 chapter boards",
  );
  const nodes = [];
  const branchPoints = [];
  let previousChapterTail = null;

  for (let chapterIndex = 0; chapterIndex < 3; chapterIndex += 1) {
    const chapterSlice = chapterBoards.slice(
      chapterIndex * 10,
      chapterIndex * 10 + 10,
    );
    const nodeIds = chapterSlice.map(
      (board, index) =>
        `${board.content.chapterId}:node-${String(index + 1).padStart(2, "0")}`,
    );
    for (const [index, board] of chapterSlice.entries()) {
      let unlockAfterNodeIds;
      let unlockMode = "all";
      if (index === 0) {
        unlockAfterNodeIds =
          previousChapterTail == null ? [] : [previousChapterTail];
      } else if (index === 3 || index === 4) {
        unlockAfterNodeIds = [nodeIds[2]];
      } else if (index === 5) {
        unlockAfterNodeIds = [nodeIds[3], nodeIds[4]];
        unlockMode = "any";
      } else {
        unlockAfterNodeIds = [nodeIds[index - 1]];
      }
      nodes.push({
        nodeId: nodeIds[index],
        puzzleId: board.content.puzzleId,
        chapterId: board.content.chapterId,
        unlockMode,
        unlockAfterNodeIds,
      });
    }
    branchPoints.push({
      branchPointId: `${chapterSlice[0].content.chapterId}:branch-01`,
      chapterId: chapterSlice[0].content.chapterId,
      linearNodeIds: [nodeIds[0], nodeIds[1], nodeIds[2]],
      branchEntryNodeIds: [nodeIds[3], nodeIds[4]],
    });
    previousChapterTail = nodeIds[9];
  }

  return {
    schemaVersion: WORLD_MAP_GRAPH_SCHEMA_VERSION,
    artifactStatus: ARTIFACT_STATUS,
    activationApproved: false,
    graphId: GRAPH_ID,
    catalogId: catalog.catalogId,
    contentLocale: CONTENT_LOCALE,
    nodes,
    branchPoints,
  };
}

function artifactRelativePath(content) {
  return path.posix.join(
    "/game-content/v1/ko-KR/packs",
    content.packId,
    `${content.contentChecksum}.json`,
  );
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function resolveGeneratorIdentity(repositoryRoot, options, wordBank) {
  const { stdout: dependencyStatus } = await execFileAsync(
    "git",
    [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      ...GENERATOR_DEPENDENCY_PATHS,
    ],
    { cwd: repositoryRoot },
  );
  requireCondition(
    dependencyStatus.trim() === "",
    `generator dependencies must be committed before content generation:\n${dependencyStatus.trim()}`,
  );
  const dependencies = await Promise.all(
    GENERATOR_DEPENDENCY_PATHS.map(async (relativePath) => ({
      path: relativePath,
      sha256: sha256(
        await readFile(path.join(repositoryRoot, relativePath), "utf8"),
      ),
    })),
  );
  const dependencyTreeSha256 = sha256(canonicalJson(dependencies));
  const scriptPath = fileURLToPath(import.meta.url);
  const scriptText = await readFile(scriptPath, "utf8");
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
  });
  const config = {
    schemaVersion: "ko-kr-launch-generator-config/1",
    baseSeed: options.baseSeed,
    attempts: options.attempts,
    searchEscalation: Array.from({ length: options.retries }, (_, index) =>
      searchOptionsForRetry(options, index),
    ),
    retries: options.retries,
    samples: options.samples,
    beamWidth: options.beamWidth,
    branchLimit: options.branchLimit,
    candidateWordLimit: options.candidateWordLimit,
    denseCandidateLimit: options.denseCandidateLimit,
    difficultyProfiles: DIFFICULTY_PROFILES,
    maxAutoRunRatio: MAX_AUTO_RUN_RATIO,
    minMultiCrossRatio: MIN_MULTI_CROSS_RATIO,
    minDailyThemeEntryRatio: MIN_DAILY_THEME_ENTRY_RATIO,
    dailyConnectorWordLimit: DAILY_CONNECTOR_WORD_LIMIT,
    maxGenerationWordLength: MAX_GENERATION_WORD_LENGTH,
    clueSimilarity: {
      policyId: "ko-kr-launch-bigram-dice-v1",
      normalization: "NFKC-lowercase-no-space-punctuation-symbol",
      bigramDiceThreshold: 0.9,
    },
    dependencies,
    dependencyTreeSha256,
    routePlan: buildLaunchRoutePlan(),
    scriptSha256: sha256(scriptText),
    wordBankSha256: wordBank.checksum,
  };
  return {
    commit: stdout.trim(),
    config,
    configHash: sha256(canonicalJson(config)),
  };
}

async function loadLicenseManifest(repositoryRoot) {
  const relativePath = "data/game-content/v1/ko-KR/license-manifest.json";
  const text = await readFile(path.join(repositoryRoot, relativePath), "utf8");
  const document = JSON.parse(text);
  requireCondition(
    document.schemaVersion === "game-content-license-manifest/1",
    "license manifest schemaVersion is invalid",
  );
  requireCondition(
    document.manifestId === LICENSE_MANIFEST_ID,
    `license manifestId must be ${LICENSE_MANIFEST_ID}`,
  );
  requireCondition(
    document.contentLocale === CONTENT_LOCALE,
    "license manifest contentLocale must be ko-KR",
  );
  requireCondition(
    document.artifactStatus === ARTIFACT_STATUS &&
      document.activationApproved === false,
    "license manifest must remain an inactive candidate",
  );
  return {
    document,
    path: relativePath,
    checksum: sha256(canonicalizeForChecksum(document)),
  };
}

function resolveReviewIdentity(wordBank) {
  const coverage = wordBank.metadata.reviewCoverage;
  requireCondition(
    Array.isArray(coverage) && coverage.length > 0,
    "reviewed wordbank must include reviewCoverage",
  );
  const latestReviewedAt = coverage
    .map((item, index) =>
      requireString(
        item.reviewedAt,
        `metadata.reviewCoverage[${index}].reviewedAt`,
      ),
    )
    .sort()
    .at(-1);
  requireCondition(
    !Number.isNaN(Date.parse(latestReviewedAt)),
    "reviewCoverage reviewedAt must be an ISO timestamp",
  );
  return {
    reviewerId: "ko-kr-launch-editorial-ledger-v1",
    reviewedAt: latestReviewedAt,
  };
}

function routeCounts(boards) {
  return boards.reduce(
    (counts, board) => {
      counts[board.route.kind] += 1;
      return counts;
    },
    {
      "first-run": 0,
      chapter: 0,
      daily: 0,
      bonus: 0,
      "weekly-challenge": 0,
    },
  );
}

async function writeCandidateArtifacts(repositoryRoot, options, result) {
  const outputRoot = path.resolve(repositoryRoot, options.outputRoot);
  const candidateRoot = path.join(outputRoot, "candidates");
  requireCondition(
    !outputRoot.endsWith(`${path.sep}current`) &&
      !candidateRoot.endsWith(`${path.sep}current.json`),
    "candidate builder must never target current.json",
  );

  const packIndex = [];
  for (const board of result.catalog.boards) {
    const relativePath = artifactRelativePath(board.content);
    const filePath = path.join(
      outputRoot,
      relativePath.replace(/^\/game-content\/v1\/ko-KR\//, ""),
    );
    await writeJson(filePath, board.content);
    packIndex.push({
      puzzleId: board.content.puzzleId,
      packId: board.content.packId,
      contentChecksum: board.content.contentChecksum,
      path: relativePath,
    });
  }

  await writeJson(
    path.join(candidateRoot, "catalog.json"),
    result.catalogArtifact,
  );
  await writeJson(
    path.join(candidateRoot, "world-map.json"),
    result.worldMapArtifact,
  );
  await writeJson(
    path.join(candidateRoot, "generation-report.json"),
    result.report,
  );
  await writeJson(
    path.join(outputRoot, "license-manifest.json"),
    result.licenseManifest.document,
  );
  await writeJson(path.join(candidateRoot, "pack-index.json"), {
    schemaVersion: "game-content-candidate-pack-index/1",
    artifactStatus: ARTIFACT_STATUS,
    activationApproved: false,
    generatedAt: GENERATED_AT,
    catalogId: CATALOG_ID,
    packs: packIndex,
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const currentPointerPath = path.join(
    repositoryRoot,
    "public/game-content/v1/ko-KR/current.json",
  );
  const currentPointerBefore = await snapshotOptionalFile(currentPointerPath);
  const firstRunContents = [...loadBundledFirstRunGameContents()];
  const wordBank = await loadReviewedWordBank(
    repositoryRoot,
    options.wordBankPath,
    firstRunContents,
  );
  const generatorIdentity = await resolveGeneratorIdentity(
    repositoryRoot,
    options,
    wordBank,
  );
  const licenseManifest = await loadLicenseManifest(repositoryRoot);
  const reviewIdentity = resolveReviewIdentity(wordBank);
  const allRoutes = buildLaunchRoutePlan();
  const generationQueue = orderRoutesForGeneration(allRoutes);
  const selectedRoutes =
    options.dryRunCount > 0
      ? generationQueue.slice(
          options.startIndex,
          options.startIndex + options.dryRunCount,
        )
      : generationQueue;
  requireCondition(
    selectedRoutes.length ===
      (options.dryRunCount > 0 ? options.dryRunCount : 90),
    "requested dry-run range exceeds the 90-board generation queue",
  );

  const usedAnswers = new Set(
    firstRunContents.flatMap((content) =>
      content.entries.map((entry) => entry.answer),
    ),
  );
  const generatedByPuzzleId = new Map();
  const generationReport = [];
  for (const [index, route] of selectedRoutes.entries()) {
    console.log(
      `[${index + 1}/${selectedRoutes.length}] ${route.puzzleId} ${route.difficulty} ${route.themeId}`,
    );
    const generated = await generateRouteContent(
      route,
      wordBank.words,
      usedAnswers,
      options,
      generatorIdentity,
      reviewIdentity,
      licenseManifest.checksum,
    );
    for (const entry of generated.content.entries)
      usedAnswers.add(entry.answer);
    generatedByPuzzleId.set(route.puzzleId, generated.content);
    generationReport.push(generated.report);
    console.log(
      `  accepted entries=${generated.content.entries.length} checksum=${generated.content.contentChecksum}`,
    );
  }

  if (options.dryRunCount > 0) {
    console.log(
      JSON.stringify(
        {
          artifactStatus: ARTIFACT_STATUS,
          activationApproved: false,
          dryRun: true,
          generatedBoardCount: generatedByPuzzleId.size,
          routes: generationReport.map((item) => ({
            puzzleId: item.puzzleId,
            difficulty: item.difficulty,
            themeId: item.themeId,
            metrics: item.metrics,
            qualityPass: item.quality.pass,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  const catalogBoards = [
    ...firstRunContents.map((content) => ({
      route: { kind: "first-run" },
      content,
    })),
    ...[...allRoutes]
      .sort((left, right) => left.catalogOrder - right.catalogOrder)
      .map((route) => ({
        route: route.route,
        content: generatedByPuzzleId.get(route.puzzleId),
      })),
  ];
  requireCondition(
    catalogBoards.every((board) => board.content != null),
    "catalog assembly is missing generated content",
  );
  const cooldownAudit = auditCatalogCooldown(catalogBoards);
  const catalogArtifact = {
    schemaVersion: LAUNCH_CONTENT_CATALOG_SCHEMA_VERSION,
    artifactStatus: ARTIFACT_STATUS,
    activationApproved: false,
    generatedAt: GENERATED_AT,
    catalogId: CATALOG_ID,
    contentLocale: CONTENT_LOCALE,
    releaseTimeZone: RELEASE_TIME_ZONE,
    languageProfile: { ...LANGUAGE_PROFILE },
    boards: catalogBoards.map((board) => ({
      ...board,
      artifactPath: artifactRelativePath(board.content),
    })),
  };
  const catalogValidation = validateKoKrLaunchContentCatalogStructureV1(
    catalogArtifact,
    { verifyContentChecksum: verifyGameContentChecksum },
  );
  requireCondition(
    catalogValidation.pass && catalogValidation.catalog != null,
    `launch catalog validation failed: ${catalogValidation.issues
      .map((issue) => `${issue.code}:${issue.path}`)
      .join(",")}`,
  );
  const catalog = catalogValidation.catalog;
  const worldMapArtifact = buildWorldMap(catalog);
  const worldMapValidation = validateWorldMapGraphV1(worldMapArtifact, catalog);
  requireCondition(
    worldMapValidation.pass && worldMapValidation.graph != null,
    `world map validation failed: ${worldMapValidation.issues
      .map((issue) => `${issue.code}:${issue.path}`)
      .join(",")}`,
  );
  const report = {
    schemaVersion: "ko-kr-launch-generation-report/1",
    artifactStatus: ARTIFACT_STATUS,
    activationApproved: false,
    generatedAt: GENERATED_AT,
    catalogId: CATALOG_ID,
    generator: {
      commit: generatorIdentity.commit,
      configHash: generatorIdentity.configHash,
      config: generatorIdentity.config,
    },
    wordBank: {
      path: wordBank.path,
      checksum: wordBank.checksum,
      originalWordCount: wordBank.originalWordCount,
      cooldownSafeWordCount: wordBank.words.length,
      exclusions: wordBank.exclusions,
      themeInventory: wordBank.themeInventory,
      reviewCoverage: wordBank.metadata.reviewCoverage,
    },
    licenseManifest: {
      sourcePath: licenseManifest.path,
      publishedCandidatePath: "/game-content/v1/ko-KR/license-manifest.json",
      manifestId: licenseManifest.document.manifestId,
      checksum: licenseManifest.checksum,
    },
    currentPointer: {
      path: "/game-content/v1/ko-KR/current.json",
      beforeSha256: currentPointerBefore,
      afterSha256: currentPointerBefore,
      unchanged: true,
    },
    routeCounts: routeCounts(catalog.boards),
    cooldownAudit,
    firstRunBoardCount: firstRunContents.length,
    generatedBoardCount: generationReport.length,
    totalBoardCount: catalog.boards.length,
    catalogValidationPass: true,
    worldMapValidationPass: true,
    boards: generationReport,
  };
  requireCondition(
    canonicalJson(routeCounts(catalog.boards)) ===
      canonicalJson(KO_KR_LAUNCH_CONTENT_CONTRACT.routeCounts),
    "catalog route counts do not match the launch contract",
  );
  await writeCandidateArtifacts(repositoryRoot, options, {
    catalog,
    catalogArtifact,
    worldMapArtifact,
    report,
    licenseManifest,
  });
  const currentPointerAfter = await snapshotOptionalFile(currentPointerPath);
  requireCondition(
    currentPointerAfter === currentPointerBefore,
    "candidate build must not create or modify current.json",
  );
  console.log(
    `Wrote ${catalog.boards.length} candidate boards under ${options.outputRoot}; current.json was not touched.`,
  );
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
