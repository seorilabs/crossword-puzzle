#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

import {
  analyzeRuns,
  generateBoards,
  makeWordMap,
} from "./crossword-generator-prototype.mjs";
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
  DIFFICULTY_ORDER,
  DIFFICULTY_PROFILES,
  getWordDifficulty,
  isWordDifficultyWithinProfile,
  selectWordsForProfile,
} from "../packages/crossword-core/src/difficultyProfiles.ts";
import {
  LAUNCH_CLUE_SIMILARITY_POLICY_ID,
  LAUNCH_CLUE_SIMILARITY_THRESHOLD,
  areCluesSimilar,
  normalizeClueForSimilarity,
} from "../packages/crossword-core/src/clueSimilarity.ts";
import {
  findBoardClueQualityConflicts,
  findKoKrAnswerFragmentExposure,
} from "../packages/crossword-core/src/clueCuration.ts";
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
const CHECKPOINT_SCHEMA_VERSION = "ko-kr-launch-generation-checkpoint/1";
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
  "data/game-content/v1/ko-KR/reviewed-launch-wordbank-v2.json",
  "data/game-content/v1/ko-KR/license-manifest.json",
]);
const MIN_DAILY_THEME_ENTRY_RATIO = 0.5;
export const DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY = Object.freeze({
  normal: 80,
  hard: 120,
});
export const LAUNCH_THEME_OWNER_POLICY = Object.freeze({
  policyId: "ko-kr-launch-theme-owner-matching-v1",
  productionTargetDistinctOwnerCountPerTheme: 75,
  productionTargetNormalOrHardReservePerTheme: 16,
  reserveProtection: "before-friday-daily-board",
  connectorPolicy: "unowned-only-during-daily-generation",
});
export const LAUNCH_ACCEPTED_CANDIDATE_POLICY = Object.freeze({
  policyId: "ko-kr-launch-future-pool-lookahead-v1",
  defaultRetries: 8,
  acceptedLookaheadRetries: 1,
  edgeDefinition:
    "unique-answer-pairs-sharing-at-least-one-cell-after-next-route-filter-and-rerank",
  candidateAnswerOrder: "unique-answers-ascending-js-code-unit",
  dailyOrder: [
    "max-theme-connector-edges",
    "min-isolated-theme-owners",
    "max-total-edges",
    "min-cooldown-answer-count",
    "stable-generation-order",
  ],
  otherOrder: [
    "max-total-edges",
    "min-cooldown-answer-count",
    "stable-generation-order",
  ],
});
function repeatedConnectorLimit(limit) {
  return Object.freeze(
    Array.from(
      { length: LAUNCH_ACCEPTED_CANDIDATE_POLICY.defaultRetries },
      () => limit,
    ),
  );
}

function steppedConnectorLimits(firstLimit, secondLimit) {
  const half = LAUNCH_ACCEPTED_CANDIDATE_POLICY.defaultRetries / 2;
  return Object.freeze([
    ...Array.from({ length: half }, () => firstLimit),
    ...Array.from({ length: half }, () => secondLimit),
  ]);
}

export const LAUNCH_RETRY_PHASE_POLICY = Object.freeze({
  policyId: "ko-kr-launch-bounded-connector-fallback-v1",
  transition: "fallback-only-after-base-exhausted-with-no-pass",
  fallbackRouteKind: "daily",
  seedIndex: "global-retry-index",
  searchEscalationIndex: "global-retry-index",
  phases: Object.freeze([
    Object.freeze({
      phaseIndex: 0,
      phaseId: "base",
      globalRetryStart: 0,
      retryCount: LAUNCH_ACCEPTED_CANDIDATE_POLICY.defaultRetries,
      connectorLimitScheduleByDifficulty: Object.freeze({
        normal: repeatedConnectorLimit(
          DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY.normal,
        ),
        hard: repeatedConnectorLimit(
          DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY.hard,
        ),
      }),
    }),
    Object.freeze({
      phaseIndex: 1,
      phaseId: "fallback",
      globalRetryStart: LAUNCH_ACCEPTED_CANDIDATE_POLICY.defaultRetries,
      retryCount: LAUNCH_ACCEPTED_CANDIDATE_POLICY.defaultRetries,
      connectorLimitScheduleByDifficulty: Object.freeze({
        normal: steppedConnectorLimits(120, 160),
        hard: steppedConnectorLimits(160, 200),
      }),
    }),
  ]),
});
export const LAUNCH_SEARCH_QUALITY_POLICY = Object.freeze({
  policyId: "ko-kr-launch-search-quality-alignment-v1",
  evaluator: "route-quality-plus-connected-components",
  maxConnectedComponents: 1,
});
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
  checkpointRoot: "tmp/launch-content-checkpoints",
  denseCandidateLimit: 96,
  dryRunCount: 0,
  maxNewBoards: 0,
  outputRoot: "public/game-content/v1/ko-KR",
  retries: LAUNCH_ACCEPTED_CANDIDATE_POLICY.defaultRetries,
  samples: 5,
  startIndex: 0,
  wordBankPath: "data/game-content/v1/ko-KR/reviewed-launch-wordbank-v2.json",
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

function requireStringArray(
  value,
  field,
  { allowDuplicates = false, allowEmpty = false } = {},
) {
  requireCondition(
    Array.isArray(value) &&
      (allowEmpty || value.length > 0) &&
      value.every((item) => typeof item === "string" && item.trim() !== ""),
    `${field} must be ${allowEmpty ? "a" : "a non-empty"} string array`,
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
    if (key === "checkpoint" && rawValue) {
      options.checkpointRoot = rawValue;
    }
    if (key === "dense" && rawValue != null) {
      options.denseCandidateLimit = parsePositiveInteger(rawValue, key);
    }
    if (key === "dry-run") {
      options.dryRunCount =
        rawValue == null ? 1 : parsePositiveInteger(rawValue, key);
    }
    if (key === "max-new-boards" && rawValue != null) {
      options.maxNewBoards = parsePositiveInteger(rawValue, key);
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
  requireCondition(
    options.dryRunCount === 0 || options.maxNewBoards === 0,
    "--max-new-boards is available only for checkpointed full generation",
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

export function generationProgressPosition(completedAtStart, localIndex) {
  return completedAtStart + localIndex + 1;
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
    rawWord.domainTags ?? ["general"],
    `words[${index}].domainTags`,
  );
  const themeTags = requireStringArray(
    rawWord.themeTags ?? [],
    `words[${index}].themeTags`,
    { allowEmpty: true },
  );
  requireCondition(
    themeTags.every((themeId) => LAUNCH_THEME_IDS.includes(themeId)),
    `words[${index}].themeTags contains a non-launch theme`,
  );
  requireCondition(
    themeTags.every(
      (themeId, themeIndex) =>
        themeIndex === 0 ||
        LAUNCH_THEME_IDS.indexOf(themeTags[themeIndex - 1]) <
          LAUNCH_THEME_IDS.indexOf(themeId),
    ),
    `words[${index}].themeTags must follow launch taxonomy order`,
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
    themeTags,
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

export function deduplicateReviewedWords(words, firstRunContents) {
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
  let answerFragmentExposure = 0;
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
    if (findKoKrAnswerFragmentExposure(word.answer, word.clue) != null) {
      answerFragmentExposure += 1;
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
      answerFragmentExposure,
      onboardingAnswerConflicts,
      clueConflicts,
    },
  };
}

function isThemeInventoryEligible(word) {
  return DAILY_THEME_DIFFICULTIES.some((difficulty) =>
    isGenerationWordLengthEligible(word, difficulty),
  );
}

function isThemeHardReserveEligible(word) {
  return (
    ["normal", "hard"].includes(word.difficulty) &&
    isGenerationWordLengthEligible(word, "hard")
  );
}

/**
 * Explicit sense tags are eligibility only. This deterministic maximum matching
 * gives every launch theme a disjoint production reserve before generation,
 * then assigns remaining eligible words to the least-loaded eligible theme.
 */
export function allocateLaunchThemeOwners(words) {
  const target =
    LAUNCH_THEME_OWNER_POLICY.productionTargetDistinctOwnerCountPerTheme;
  const hardTarget =
    LAUNCH_THEME_OWNER_POLICY.productionTargetNormalOrHardReservePerTheme;
  const slots = LAUNCH_THEME_IDS.flatMap((themeId) => [
    ...Array.from({ length: hardTarget }, (_, slotIndex) => ({
      themeId,
      slotIndex,
      kind: "hard-reserve",
    })),
    ...Array.from({ length: target - hardTarget }, (_, slotIndex) => ({
      themeId,
      slotIndex,
      kind: "any",
    })),
  ]);
  const candidateIndexesBySlot = slots.map((slot) =>
    words
      .map((word, wordIndex) => ({ word, wordIndex }))
      .filter(
        ({ word }) =>
          isThemeInventoryEligible(word) &&
          word.themeTags.includes(slot.themeId) &&
          (slot.kind !== "hard-reserve" || isThemeHardReserveEligible(word)),
      )
      .map(({ wordIndex }) => wordIndex),
  );
  const wordToSlot = new Map();
  const slotToWord = new Map();

  function augment(slotIndex, visitedWordIndexes) {
    for (const wordIndex of candidateIndexesBySlot[slotIndex]) {
      if (visitedWordIndexes.has(wordIndex)) continue;
      visitedWordIndexes.add(wordIndex);
      const previousSlotIndex = wordToSlot.get(wordIndex);
      if (
        previousSlotIndex == null ||
        augment(previousSlotIndex, visitedWordIndexes)
      ) {
        wordToSlot.set(wordIndex, slotIndex);
        slotToWord.set(slotIndex, wordIndex);
        return true;
      }
    }
    return false;
  }

  for (const slotIndex of slots.keys()) {
    requireCondition(
      augment(slotIndex, new Set()),
      `theme owner production matching failed at ${slots[slotIndex].themeId}/${slots[slotIndex].kind}/${slots[slotIndex].slotIndex}`,
    );
  }

  const ownerByWordIndex = new Map();
  const hardReserveWordIndexes = new Set();
  const loads = Object.fromEntries(
    LAUNCH_THEME_IDS.map((themeId) => [themeId, 0]),
  );
  for (const [slotIndex, wordIndex] of slotToWord.entries()) {
    const slot = slots[slotIndex];
    ownerByWordIndex.set(wordIndex, slot.themeId);
    loads[slot.themeId] += 1;
    if (slot.kind === "hard-reserve") hardReserveWordIndexes.add(wordIndex);
  }

  for (const [wordIndex, word] of words.entries()) {
    if (
      ownerByWordIndex.has(wordIndex) ||
      !isThemeInventoryEligible(word) ||
      word.themeTags.length === 0
    ) {
      continue;
    }
    const owner = [...word.themeTags].sort(
      (left, right) =>
        loads[left] - loads[right] ||
        LAUNCH_THEME_IDS.indexOf(left) - LAUNCH_THEME_IDS.indexOf(right),
    )[0];
    ownerByWordIndex.set(wordIndex, owner);
    loads[owner] += 1;
  }

  const assignedWords = words.map((word, wordIndex) => {
    const themeOwner = ownerByWordIndex.get(wordIndex) ?? null;
    return {
      ...word,
      domainTags: [themeOwner ?? "general"],
      themeOwner,
      themeHardReserve: hardReserveWordIndexes.has(wordIndex),
    };
  });
  const inventory = Object.fromEntries(
    LAUNCH_THEME_IDS.map((themeId) => {
      const owned = assignedWords.filter((word) => word.themeOwner === themeId);
      const hardReserve = owned.filter((word) => word.themeHardReserve);
      requireCondition(
        owned.length >= target && hardReserve.length === hardTarget,
        `${themeId} owner inventory is below the production target`,
      );
      return [
        themeId,
        {
          owned: owned.length,
          hardReserve: hardReserve.length,
          eligible: words.filter(
            (word) =>
              isThemeInventoryEligible(word) &&
              word.themeTags.includes(themeId),
          ).length,
          normalOrHardEligible: words.filter(
            (word) =>
              word.themeTags.includes(themeId) &&
              isThemeHardReserveEligible(word),
          ).length,
        },
      ];
    }),
  );
  const assignment = assignedWords.map((word) => ({
    sourceEntryId: word.sourceEntryId,
    themeOwner: word.themeOwner,
    themeHardReserve: word.themeHardReserve,
  }));
  return {
    words: assignedWords,
    inventory,
    assignmentSha256: sha256(canonicalJson(assignment)),
    assignedWordCount: ownerByWordIndex.size,
    unownedWordCount: words.length - ownerByWordIndex.size,
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
    document?.metadata?.schemaVersion === "launch-wordbank/2",
    "reviewed wordbank schemaVersion must be launch-wordbank/2",
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
  requireCondition(
    canonicalJson(document.metadata.themeTaxonomy?.themeIds) ===
      canonicalJson(LAUNCH_THEME_IDS),
    "reviewed wordbank theme taxonomy order drifted",
  );
  const gate = document.metadata.themeTaxonomy?.inventoryGate;
  requireCondition(
    gate?.productionTargetDistinctOwnerCountPerTheme ===
      LAUNCH_THEME_OWNER_POLICY.productionTargetDistinctOwnerCountPerTheme &&
      gate?.productionTargetNormalOrHardReservePerTheme ===
        LAUNCH_THEME_OWNER_POLICY.productionTargetNormalOrHardReservePerTheme,
    "reviewed wordbank theme inventory policy drifted",
  );
  const allocation = allocateLaunchThemeOwners(deduplicated.words);
  return {
    path: path.relative(repositoryRoot, resolvedPath),
    checksum: sha256(text),
    metadata: document.metadata,
    originalWordCount: normalized.length,
    themeInventory: allocation.inventory,
    themeOwnership: {
      policy: LAUNCH_THEME_OWNER_POLICY,
      assignmentSha256: allocation.assignmentSha256,
      assignedWordCount: allocation.assignedWordCount,
      unownedWordCount: allocation.unownedWordCount,
    },
    exclusions: deduplicated.exclusions,
    words: allocation.words,
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

export function validateWordSelectionDifficultyPolicy(
  selection,
  profile,
  field = "word selection",
) {
  requireCondition(
    Array.isArray(selection?.words) &&
      Array.isArray(selection.difficulties) &&
      Array.isArray(selection.broadenedWith) &&
      typeof selection.broadened === "boolean",
    `${field} difficulty evidence is invalid`,
  );
  const effectiveSet = new Set(selection.difficulties);
  requireCondition(
    effectiveSet.size === selection.difficulties.length &&
      canonicalJson(selection.difficulties) ===
        canonicalJson(
          DIFFICULTY_ORDER.filter((difficulty) => effectiveSet.has(difficulty)),
        ),
    `${field} effective difficulties are not canonical`,
  );
  requireCondition(
    profile.wordDifficulties.every((difficulty) =>
      effectiveSet.has(difficulty),
    ),
    `${field} omits a profile difficulty`,
  );
  requireCondition(
    selection.difficulties.every((difficulty) =>
      isWordDifficultyWithinProfile(difficulty, profile),
    ) &&
      selection.words.every((word) => {
        const difficulty = getWordDifficulty(word);
        return (
          effectiveSet.has(difficulty) &&
          isWordDifficultyWithinProfile(difficulty, profile)
        );
      }),
    `${field} exceeds ${profile.wordDifficultyCeiling} difficulty ceiling`,
  );
  const expectedBroadenedWith = selection.difficulties.filter(
    (difficulty) => !profile.wordDifficulties.includes(difficulty),
  );
  requireCondition(
    canonicalJson(selection.broadenedWith) ===
      canonicalJson(expectedBroadenedWith),
    `${field} broadenedWith does not match effective difficulties`,
  );
  requireCondition(
    selection.broadened === expectedBroadenedWith.length > 0,
    `${field} broadened flag does not match effective difficulties`,
  );
  return true;
}

export function filterAvailableWords(
  words,
  route,
  usedAnswers,
  { connectorWordLimit: connectorWordLimitOverride } = {},
) {
  const available = words.filter(
    (word) =>
      !usedAnswers.has(word.answer) &&
      isGenerationWordLengthEligible(word, route.difficulty),
  );
  const profile = DIFFICULTY_PROFILES[route.difficulty];
  if (route.route.kind !== "daily") {
    const selection = selectWordsForProfile(available, profile);
    validateWordSelectionDifficultyPolicy(
      selection,
      profile,
      `${route.puzzleId} word selection`,
    );
    requireCondition(
      selection.words.length >= 150,
      `${route.puzzleId} has insufficient words after difficulty/cooldown filters: ${selection.words.length}`,
    );
    return selection;
  }

  const hasTheme = (word) => word.themeOwner === route.themeId;
  const protectHardReserve = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
  ].includes(route.route.weekday);
  const themeSelection = selectWordsForProfile(
    available.filter(
      (word) =>
        hasTheme(word) && !(protectHardReserve && word.themeHardReserve),
    ),
    profile,
    LAUNCH_THEME_OWNER_POLICY.productionTargetNormalOrHardReservePerTheme,
  );
  const connectorSelection = selectWordsForProfile(
    available.filter((word) => word.themeOwner == null),
    profile,
  );
  const connectorWordLimit =
    connectorWordLimitOverride ??
    DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY[route.difficulty];
  requireCondition(
    Number.isInteger(connectorWordLimit) && connectorWordLimit > 0,
    `${route.puzzleId} has no daily connector limit for ${route.difficulty}`,
  );
  const connectorWords = rankDailyConnectorWordsByConnectivity(
    themeSelection.words,
    connectorSelection.words,
  ).slice(0, connectorWordLimit);
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
  validateWordSelectionDifficultyPolicy(
    selection,
    profile,
    `${route.puzzleId} daily word selection`,
  );
  requireCondition(
    selection.words.length >= 96 && themeSelection.words.length >= 16,
    `${route.puzzleId} has insufficient words after theme/difficulty/cooldown filters: ${selection.words.length}`,
  );
  return selection;
}

function answerCellsOf(word) {
  return Array.isArray(word.answerCells) ? word.answerCells : [...word.answer];
}

function sharesAnswerCell(left, right) {
  const rightCells = new Set(answerCellsOf(right));
  return answerCellsOf(left).some((cell) => rightCells.has(cell));
}

export function summarizeFuturePoolConnectivity(words, nextRoute) {
  let totalSharedCellEdges = 0;
  let themeConnectorSharedCellEdges = 0;
  const themeOwnersConnectedToConnector = new Set();
  const isDaily = nextRoute?.route.kind === "daily";

  for (let leftIndex = 0; leftIndex < words.length; leftIndex += 1) {
    const left = words[leftIndex];
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < words.length;
      rightIndex += 1
    ) {
      const right = words[rightIndex];
      if (!sharesAnswerCell(left, right)) continue;
      totalSharedCellEdges += 1;
      if (!isDaily) continue;

      const leftIsTheme = left.themeOwner === nextRoute.themeId;
      const rightIsTheme = right.themeOwner === nextRoute.themeId;
      const leftIsConnector = left.themeOwner == null;
      const rightIsConnector = right.themeOwner == null;
      if (
        (leftIsTheme && rightIsConnector) ||
        (rightIsTheme && leftIsConnector)
      ) {
        themeConnectorSharedCellEdges += 1;
        themeOwnersConnectedToConnector.add(
          leftIsTheme ? left.answer : right.answer,
        );
      }
    }
  }

  const isolatedThemeOwnerCount = isDaily
    ? words.filter(
        (word) =>
          word.themeOwner === nextRoute.themeId &&
          !themeOwnersConnectedToConnector.has(word.answer),
      ).length
    : 0;
  return {
    totalSharedCellEdges,
    themeConnectorSharedCellEdges,
    isolatedThemeOwnerCount,
  };
}

export function compareLaunchAcceptedCandidateScores(left, right, nextRoute) {
  if (nextRoute?.route.kind === "daily") {
    return (
      right.themeConnectorSharedCellEdges -
        left.themeConnectorSharedCellEdges ||
      left.isolatedThemeOwnerCount - right.isolatedThemeOwnerCount ||
      right.totalSharedCellEdges - left.totalSharedCellEdges ||
      left.cooldownAnswerCount - right.cooldownAnswerCount
    );
  }
  return (
    right.totalSharedCellEdges - left.totalSharedCellEdges ||
    left.cooldownAnswerCount - right.cooldownAnswerCount
  );
}

export function makeLaunchAcceptedCandidateSelection({
  currentWordPool,
  nextRoute,
  reviewedWords,
  usedAnswers,
}) {
  const currentWordMap = makeWordMap(currentWordPool);
  const usedAnswersAtStart = new Set(usedAnswers);
  const answerCache = new WeakMap();
  const scoreCache = new WeakMap();

  function answersForBoard(board) {
    const cached = answerCache.get(board);
    if (cached != null) return cached;
    const answers = [
      ...new Set(
        analyzeRuns(board, currentWordMap).runs.map((run) => run.answer),
      ),
    ].sort();
    answerCache.set(board, answers);
    return answers;
  }

  function selectionScoreForBoard(board) {
    const cached = scoreCache.get(board);
    if (cached != null) return cached;
    const answers = answersForBoard(board);
    const futureUsedAnswers = new Set(usedAnswersAtStart);
    for (const answer of answers) futureUsedAnswers.add(answer);
    const connectivity =
      nextRoute == null
        ? {
            totalSharedCellEdges: 0,
            themeConnectorSharedCellEdges: 0,
            isolatedThemeOwnerCount: 0,
          }
        : summarizeFuturePoolConnectivity(
            filterAvailableWords(reviewedWords, nextRoute, futureUsedAnswers)
              .words,
            nextRoute,
          );
    const result = {
      ...connectivity,
      cooldownAnswerCount: answers.length,
    };
    scoreCache.set(board, result);
    return result;
  }

  return {
    compareAcceptedCandidates: (left, right) =>
      compareLaunchAcceptedCandidateScores(
        selectionScoreForBoard(left.board),
        selectionScoreForBoard(right.board),
        nextRoute,
      ),
    answersForBoard,
    selectionScoreForBoard,
  };
}

export function makeLaunchAcceptedCandidateComparator(options) {
  return makeLaunchAcceptedCandidateSelection(options)
    .compareAcceptedCandidates;
}

/**
 * 일일 테마 단어와 실제로 교차 가능한 연결어를 먼저 공급한다. 동일 연결성에서는
 * 긴 단어, 남은 연결어 풀과의 연결성, 검수 ledger 순으로 결정적으로 정렬한다.
 */
export function rankDailyConnectorWordsByConnectivity(
  themeWords,
  connectorWords,
) {
  return connectorWords
    .map((word, originalIndex) => ({
      word,
      originalIndex,
      themeDegree: themeWords.filter((themeWord) =>
        sharesAnswerCell(word, themeWord),
      ).length,
      connectorDegree: connectorWords.filter(
        (other) => other !== word && sharesAnswerCell(word, other),
      ).length,
    }))
    .sort(
      (left, right) =>
        right.themeDegree - left.themeDegree ||
        answerCellsOf(right.word).length - answerCellsOf(left.word).length ||
        right.connectorDegree - left.connectorDegree ||
        (left.word.reviewLedgerIndex ?? Number.POSITIVE_INFINITY) -
          (right.word.reviewLedgerIndex ?? Number.POSITIVE_INFINITY) ||
        left.originalIndex - right.originalIndex,
    )
    .map(({ word }) => word);
}

function evaluateRouteBoardQuality(board, route, wordPool) {
  const base = evaluateGeneratedBoardQuality(board, route.difficulty);
  const wordMap = makeWordMap(wordPool);
  const runs = analyzeRuns(board, wordMap).runs;
  const clueQuality = evaluateBoardClueQualityEntries(
    runs.map((run) => {
      const word = wordMap.get(run.answer);
      requireCondition(word != null, `missing clue metadata for ${run.answer}`);
      return { answer: word.answer, clue: word.clue };
    }),
  );
  let quality = {
    ...base,
    pass: base.pass && clueQuality.pass,
    checks: [...base.checks, ...clueQuality.checks],
    thresholds: { ...base.thresholds, ...clueQuality.thresholds },
    clueConflicts: clueQuality.counts,
  };
  if (route.route.kind !== "daily") return quality;
  const themedEntryCount = runs.filter((run) => {
    const word = wordMap.get(run.answer);
    return word?.themeOwner === route.themeId;
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
  quality = {
    ...quality,
    pass: quality.pass && themeCheck.pass,
    checks: [...quality.checks, themeCheck],
    ratios: {
      ...quality.ratios,
      themeEntryRatio,
    },
    thresholds: {
      ...quality.thresholds,
      minDailyThemeEntryRatio: MIN_DAILY_THEME_ENTRY_RATIO,
    },
  };
  return quality;
}

export function evaluateLaunchSearchBoardQuality(board, route, wordPool) {
  const routeQuality = evaluateRouteBoardQuality(board, route, wordPool);
  const connectedComponentsCheck = {
    key: "maxConnectedComponents",
    actual: board.metrics.connectedComponents,
    expected: LAUNCH_SEARCH_QUALITY_POLICY.maxConnectedComponents,
    operator: "<=",
    pass:
      board.metrics.connectedComponents <=
      LAUNCH_SEARCH_QUALITY_POLICY.maxConnectedComponents,
  };
  return {
    ...routeQuality,
    pass: routeQuality.pass && connectedComponentsCheck.pass,
    checks: [...routeQuality.checks, connectedComponentsCheck],
    thresholds: {
      ...routeQuality.thresholds,
      maxConnectedComponents:
        LAUNCH_SEARCH_QUALITY_POLICY.maxConnectedComponents,
    },
  };
}

export function evaluateBoardClueQualityEntries(entries) {
  const conflicts = findBoardClueQualityConflicts(entries);
  const counts = {
    crossAnswerClueLeakCount: conflicts.filter(
      (conflict) => conflict.type === "clue_contains_other_answer",
    ).length,
    answerContainmentCount: conflicts.filter(
      (conflict) => conflict.type === "answer_contains_answer",
    ).length,
  };
  const thresholds = {
    maxCrossAnswerClueLeakCount: 0,
    maxAnswerContainmentCount: 0,
  };
  const checks = [
    {
      key: "maxCrossAnswerClueLeakCount",
      actual: counts.crossAnswerClueLeakCount,
      expected: thresholds.maxCrossAnswerClueLeakCount,
      operator: "<=",
      pass:
        counts.crossAnswerClueLeakCount <=
        thresholds.maxCrossAnswerClueLeakCount,
    },
    {
      key: "maxAnswerContainmentCount",
      actual: counts.answerContainmentCount,
      expected: thresholds.maxAnswerContainmentCount,
      operator: "<=",
      pass:
        counts.answerContainmentCount <= thresholds.maxAnswerContainmentCount,
    },
  ];
  return {
    pass: checks.every((check) => check.pass),
    checks,
    counts,
    thresholds,
  };
}

export function buildBoardClueConflictIndex(entries) {
  const index = new Map(entries.map((entry) => [entry.answer, new Set()]));
  for (const conflict of findBoardClueQualityConflicts(entries)) {
    index.get(conflict.answer)?.add(conflict.otherAnswer);
    index.get(conflict.otherAnswer)?.add(conflict.answer);
  }
  return index;
}

export function hasIndexedBoardClueConflict(runs, conflictIndex) {
  const answers = new Set(runs.map((run) => run.answer));
  for (const answer of answers) {
    for (const otherAnswer of conflictIndex.get(answer) ?? []) {
      if (answers.has(otherAnswer)) return true;
    }
  }
  return false;
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
      crossAnswerClueLeakCount: quality.clueConflicts.crossAnswerClueLeakCount,
      answerContainmentCount: quality.clueConflicts.answerContainmentCount,
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

function summarizeSelectionWordPool(selection) {
  return {
    total: selection.words.length,
    theme: selection.themeWordCount ?? null,
    connectors: selection.connectorWordCount ?? null,
  };
}

function attemptHasPassingCandidate(attempt) {
  return attempt.candidates.some((candidate) => candidate.pass);
}

export function runLaunchRetryPhases({
  phasePolicy = LAUNCH_RETRY_PHASE_POLICY,
  routeKind,
  runPhase,
}) {
  requireCondition(
    typeof runPhase === "function",
    "runPhase must be a function",
  );
  const attempts = [];
  const activePhases =
    routeKind === phasePolicy.fallbackRouteKind
      ? phasePolicy.phases
      : phasePolicy.phases.slice(0, 1);

  for (const [phaseIndex, phaseSpec] of activePhases.entries()) {
    requireCondition(
      phaseSpec.phaseIndex === phaseIndex,
      `${phaseSpec.phaseId} phase index is invalid`,
    );
    requireCondition(
      phaseSpec.globalRetryStart === attempts.length,
      `${phaseSpec.phaseId} phase global retry boundary is invalid`,
    );
    if (phaseIndex > 0) {
      requireCondition(
        attempts.length === phaseSpec.globalRetryStart &&
          attempts.every((attempt) => !attemptHasPassingCandidate(attempt)),
        `${phaseSpec.phaseId} phase requires an exhausted non-passing prefix`,
      );
    }

    const phaseResult = runPhase(phaseSpec);
    const generation = phaseResult?.generation;
    requireCondition(
      generation != null && Array.isArray(generation.attempts),
      `${phaseSpec.phaseId} phase generation result is invalid`,
    );
    requireCondition(
      Array.isArray(phaseResult.attemptEvidence) &&
        phaseResult.attemptEvidence.length === generation.attempts.length,
      `${phaseSpec.phaseId} phase attempt evidence is incomplete`,
    );
    requireCondition(
      generation.attempts.length > 0 &&
        generation.attempts.length <= phaseSpec.retryCount,
      `${phaseSpec.phaseId} phase attempt count is out of bounds`,
    );
    requireCondition(
      generation.accepted ||
        generation.attempts.length === phaseSpec.retryCount,
      `${phaseSpec.phaseId} phase must exhaust every retry before fallback`,
    );

    const attemptOffset = attempts.length;
    const phaseAttempts = generation.attempts.map(
      (attempt, localRetryIndex) => {
        const globalRetryIndex = phaseSpec.globalRetryStart + localRetryIndex;
        const evidence = phaseResult.attemptEvidence[localRetryIndex];
        requireCondition(
          attempt.retryIndex === localRetryIndex,
          `${phaseSpec.phaseId} phase retryIndex must be local and sequential`,
        );
        return {
          ...attempt,
          phase: phaseSpec.phaseId,
          phaseIndex,
          phaseId: phaseSpec.phaseId,
          globalRetryIndex,
          connectorLimit: evidence.connectorLimit,
          wordPool: evidence.wordPool,
        };
      },
    );
    attempts.push(...phaseAttempts);

    if (!generation.accepted) {
      requireCondition(
        phaseAttempts.every((attempt) => !attemptHasPassingCandidate(attempt)),
        `${phaseSpec.phaseId} phase rejected a passing candidate`,
      );
      continue;
    }

    requireCondition(
      generation.selectedRetryIndex >= 0 &&
        generation.selectedRetryIndex < phaseAttempts.length,
      `${phaseSpec.phaseId} phase selected retry is invalid`,
    );
    requireCondition(
      attemptHasPassingCandidate(phaseAttempts[generation.selectedRetryIndex]),
      `${phaseSpec.phaseId} phase selected retry has no passing candidate`,
    );
    const {
      attemptEvidence: _attemptEvidence,
      generation: _generation,
      ...context
    } = phaseResult;
    return {
      ...context,
      selectedPhase: phaseSpec.phaseId,
      generation: {
        ...generation,
        attempts,
        selectedRetryIndex: attemptOffset + generation.selectedRetryIndex,
      },
    };
  }

  return {
    selectedPhase: null,
    generation: { accepted: false, attempts },
  };
}

async function generateRouteContent(
  route,
  nextRoute,
  reviewedWords,
  usedAnswers,
  options,
  generatorIdentity,
  reviewIdentity,
  licenseManifestChecksum,
) {
  requireCondition(
    options.retries === LAUNCH_ACCEPTED_CANDIDATE_POLICY.defaultRetries,
    `launch retry phases require ${LAUNCH_ACCEPTED_CANDIDATE_POLICY.defaultRetries} retries per phase`,
  );
  const profile = DIFFICULTY_PROFILES[route.difficulty];
  const phaseResult = runLaunchRetryPhases({
    routeKind: route.route.kind,
    runPhase: (phaseSpec) => {
      const contextByConnectorLimit = new Map();
      const contextByBoard = new WeakMap();
      let activeContext = null;

      function contextForRetry(localRetryIndex) {
        const connectorLimit =
          route.route.kind === "daily"
            ? phaseSpec.connectorLimitScheduleByDifficulty[route.difficulty]?.[
                localRetryIndex
              ]
            : null;
        requireCondition(
          route.route.kind !== "daily" ||
            (Number.isInteger(connectorLimit) && connectorLimit > 0),
          `${route.puzzleId} ${phaseSpec.phaseId} retry ${localRetryIndex} has no connector limit`,
        );
        const cacheKey = connectorLimit ?? "not-daily";
        const cached = contextByConnectorLimit.get(cacheKey);
        if (cached != null) return cached;
        const selection = filterAvailableWords(
          reviewedWords,
          route,
          usedAnswers,
          { connectorWordLimit: connectorLimit },
        );
        const wordMap = makeWordMap(selection.words);
        const context = {
          connectorLimit,
          selection,
          wordMap,
          clueConflictIndex: buildBoardClueConflictIndex(selection.words),
          acceptedCandidateSelection: makeLaunchAcceptedCandidateSelection({
            currentWordPool: selection.words,
            nextRoute,
            reviewedWords,
            usedAnswers,
          }),
        };
        contextByConnectorLimit.set(cacheKey, context);
        return context;
      }

      const generation = generateBoardWithRetries({
        acceptedLookaheadRetries:
          LAUNCH_ACCEPTED_CANDIDATE_POLICY.acceptedLookaheadRetries,
        compareAcceptedCandidates: (left, right) => {
          const leftContext = contextByBoard.get(left.board);
          const rightContext = contextByBoard.get(right.board);
          requireCondition(
            leftContext != null && rightContext != null,
            `${route.puzzleId} candidate pool context is missing`,
          );
          return compareLaunchAcceptedCandidateScores(
            leftContext.acceptedCandidateSelection.selectionScoreForBoard(
              left.board,
            ),
            rightContext.acceptedCandidateSelection.selectionScoreForBoard(
              right.board,
            ),
            nextRoute,
          );
        },
        retries: phaseSpec.retryCount,
        seedForRetry: (localRetryIndex) =>
          retrySeed(
            options.baseSeed,
            route,
            phaseSpec.globalRetryStart + localRetryIndex,
          ),
        searchOptionsForRetry: (localRetryIndex) =>
          searchOptionsForRetry(
            options,
            phaseSpec.globalRetryStart + localRetryIndex,
          ),
        buildGeneratorOptions: ({ retryIndex, searchOptions, seed }) => {
          activeContext = contextForRetry(retryIndex);
          return {
            allowAdjacent: true,
            ...searchOptions,
            acceptRuns: (runs) =>
              !hasIndexedBoardClueConflict(
                runs,
                activeContext.clueConflictIndex,
              ),
            boardSize: profile.boardSize,
            evaluateBoardQuality: (board) =>
              evaluateLaunchSearchBoardQuality(
                board,
                route,
                activeContext.selection.words,
              ),
            isPreferredRun:
              route.route.kind === "daily"
                ? (run) =>
                    activeContext.wordMap.get(run.answer)?.themeOwner ===
                    route.themeId
                : undefined,
            maxWords: profile.maxWords,
            minPreferredRunRatio:
              route.route.kind === "daily" ? MIN_DAILY_THEME_ENTRY_RATIO : 0,
            minWordLength: profile.minWordLength,
            seed,
            wordBank: activeContext.selection.words,
          };
        },
        generateCandidates: generateBoards,
        evaluateCandidate: (board) => {
          requireCondition(
            activeContext != null,
            `${route.puzzleId} active candidate pool is missing`,
          );
          contextByBoard.set(board, activeContext);
          return evaluateRouteBoardQuality(
            board,
            route,
            activeContext.selection.words,
          );
        },
        summarizeCandidate: (board, quality, candidateIndex) => {
          const context = contextByBoard.get(board);
          requireCondition(
            context != null,
            `${route.puzzleId} candidate ${candidateIndex} pool is missing`,
          );
          const summary = summarizeCandidateBoard(
            board,
            quality,
            candidateIndex,
          );
          const answers =
            context.acceptedCandidateSelection.answersForBoard(board);
          requireCondition(
            answers.length === summary.metrics.wordCount,
            `${route.puzzleId} candidate ${candidateIndex} answer trace does not match wordCount`,
          );
          return {
            ...summary,
            themeEntryCount:
              route.route.kind === "daily"
                ? answers.filter(
                    (answer) =>
                      context.wordMap.get(answer)?.themeOwner === route.themeId,
                  ).length
                : null,
            answers,
            selectionScore:
              context.acceptedCandidateSelection.selectionScoreForBoard(board),
          };
        },
      });
      const selectedContext = generation.accepted
        ? contextByBoard.get(generation.board)
        : null;
      requireCondition(
        !generation.accepted || selectedContext != null,
        `${route.puzzleId} selected candidate pool is missing`,
      );
      return {
        generation,
        attemptEvidence: generation.attempts.map((_, localRetryIndex) => {
          const context = contextForRetry(localRetryIndex);
          return {
            connectorLimit: context.connectorLimit,
            wordPool: summarizeSelectionWordPool(context.selection),
          };
        }),
        selection: selectedContext?.selection,
        selectedWordMap: selectedContext?.wordMap,
      };
    },
  });
  const { generation, selection, selectedWordMap } = phaseResult;

  if (generation.accepted) {
    requireCondition(
      selection != null && selectedWordMap != null,
      `${route.puzzleId} selected phase context is missing`,
    );
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
        selectedCandidateIndex: generation.selectedCandidateIndex,
        selectedRetryIndex: generation.selectedRetryIndex,
        selectedSeed: generation.selectedSeed,
        effectiveWordDifficulties: selection.difficulties,
        broadenedDifficultyPool: selection.broadened,
        wordPool: summarizeSelectionWordPool(selection),
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
    `${route.puzzleId} failed quality gates after ${generation.attempts.length} deterministic retries: ${JSON.stringify(
      generation.attempts.map((attempt) => ({
        phase: attempt.phase,
        globalRetryIndex: attempt.globalRetryIndex,
        connectorLimit: attempt.connectorLimit,
        wordPool: attempt.wordPool,
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
    policyId: "launch-global-unique-answer-and-clue-family-v2",
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

async function readJsonOptional(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomically(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function checkpointPaths(checkpointRoot, puzzleId) {
  return {
    content: path.join(checkpointRoot, "boards", `${puzzleId}.json`),
    report: path.join(checkpointRoot, "reports", `${puzzleId}.json`),
  };
}

function checkpointMetadata({ generatorIdentity, generationQueue, completed }) {
  return {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    generatorCommit: generatorIdentity.commit,
    generatorConfigHash: generatorIdentity.configHash,
    routePuzzleIds: generationQueue.map((route) => route.puzzleId),
    completed: completed.map(({ content, report }) => ({
      puzzleId: content.puzzleId,
      contentSha256: sha256(canonicalJson(content)),
      reportSha256: sha256(canonicalJson(report)),
    })),
  };
}

async function loadGenerationCheckpoint(
  repositoryRoot,
  options,
  generatorIdentity,
  generationQueue,
) {
  const checkpointRoot = path.resolve(
    repositoryRoot,
    options.checkpointRoot,
    generatorIdentity.configHash.replace(/^sha256:/, ""),
  );
  const metadataPath = path.join(checkpointRoot, "checkpoint.json");
  const metadata = await readJsonOptional(metadataPath);
  if (metadata == null) {
    return { checkpointRoot, metadataPath, completed: [] };
  }

  requireCondition(
    metadata.schemaVersion === CHECKPOINT_SCHEMA_VERSION &&
      metadata.generatorCommit === generatorIdentity.commit &&
      metadata.generatorConfigHash === generatorIdentity.configHash,
    "launch checkpoint generator identity mismatch",
  );
  requireCondition(
    canonicalJson(metadata.routePuzzleIds) ===
      canonicalJson(generationQueue.map((route) => route.puzzleId)),
    "launch checkpoint route plan mismatch",
  );
  requireCondition(
    Array.isArray(metadata.completed) &&
      metadata.completed.length <= generationQueue.length,
    "launch checkpoint completed inventory is invalid",
  );

  const completed = [];
  const usedAnswers = new Set();
  for (const [index, item] of metadata.completed.entries()) {
    const route = generationQueue[index];
    requireCondition(
      item?.puzzleId === route.puzzleId,
      "launch checkpoint must be a generation-order prefix",
    );
    const paths = checkpointPaths(checkpointRoot, route.puzzleId);
    const content = await readJsonOptional(paths.content);
    const report = await readJsonOptional(paths.report);
    requireCondition(
      content != null && report != null,
      `${route.puzzleId} checkpoint files are incomplete`,
    );
    requireCondition(
      item.contentSha256 === sha256(canonicalJson(content)) &&
        item.reportSha256 === sha256(canonicalJson(report)),
      `${route.puzzleId} checkpoint checksum mismatch`,
    );
    const validation = validateGameContentV1(content, {
      requestedContentLocale: CONTENT_LOCALE,
      verifyChecksum: verifyGameContentChecksum,
    });
    requireCondition(
      validation.pass && validation.content != null,
      `${route.puzzleId} checkpoint content is invalid`,
    );
    requireCondition(
      content.puzzleId === route.puzzleId &&
        content.slotId === route.slotId &&
        content.difficulty === route.difficulty &&
        content.themeId === route.themeId &&
        content.chapterId === route.chapterId &&
        content.generatorCommit === generatorIdentity.commit &&
        content.generatorConfigHash === generatorIdentity.configHash &&
        report.puzzleId === route.puzzleId &&
        report.contentChecksum === content.contentChecksum &&
        canonicalJson(report.route) === canonicalJson(route.route),
      `${route.puzzleId} checkpoint route or generator identity mismatch`,
    );
    for (const entry of content.entries) {
      requireCondition(
        !usedAnswers.has(entry.answer),
        `${route.puzzleId} checkpoint answer cooldown violation: ${entry.answer}`,
      );
      usedAnswers.add(entry.answer);
    }
    completed.push({ content: validation.content, report });
  }
  return { checkpointRoot, metadataPath, completed };
}

async function saveGenerationCheckpoint(
  checkpoint,
  generatorIdentity,
  generationQueue,
  completed,
) {
  const latest = completed.at(-1);
  requireCondition(latest != null, "checkpoint requires generated content");
  const paths = checkpointPaths(
    checkpoint.checkpointRoot,
    latest.content.puzzleId,
  );
  await writeJsonAtomically(paths.content, latest.content);
  await writeJsonAtomically(paths.report, latest.report);
  await writeJsonAtomically(
    checkpoint.metadataPath,
    checkpointMetadata({ generatorIdentity, generationQueue, completed }),
  );
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
  const launchRetryScheduleLength = LAUNCH_RETRY_PHASE_POLICY.phases.reduce(
    (count, phase) => count + phase.retryCount,
    0,
  );
  const config = {
    schemaVersion: "ko-kr-launch-generator-config/8",
    baseSeed: options.baseSeed,
    attempts: options.attempts,
    searchEscalation: Array.from(
      { length: launchRetryScheduleLength },
      (_, index) => searchOptionsForRetry(options, index),
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
    dailyConnectorWordLimitByDifficulty:
      DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY,
    retryPhasePolicy: LAUNCH_RETRY_PHASE_POLICY,
    acceptedCandidateSelection: LAUNCH_ACCEPTED_CANDIDATE_POLICY,
    searchQuality: LAUNCH_SEARCH_QUALITY_POLICY,
    themeOwnership: LAUNCH_THEME_OWNER_POLICY,
    maxGenerationWordLength: MAX_GENERATION_WORD_LENGTH,
    clueSimilarity: {
      policyId: LAUNCH_CLUE_SIMILARITY_POLICY_ID,
      normalization: "NFKC-lowercase-no-space-punctuation-symbol",
      bigramDiceThreshold: LAUNCH_CLUE_SIMILARITY_THRESHOLD,
    },
    clueQuality: {
      policyId: "ko-kr-launch-clue-quality-v2",
      answerFragmentExposure: {
        minimumLength: 2,
        scope: "launch-selection-and-all-93-board-entries",
        tokenBoundaryPolicy:
          "within-token-or-cross-token-starting-at-token-boundary",
      },
      sameBoardConflicts: {
        maxAnswerContainmentCount: 0,
        maxCrossAnswerClueLeakCount: 0,
      },
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
  const coverage = wordBank.metadata.themeReviewCoverage;
  requireCondition(
    Array.isArray(coverage) && coverage.length > 0,
    "reviewed wordbank must include themeReviewCoverage",
  );
  const latestReviewedAt = coverage
    .map((item, index) =>
      requireString(
        item.reviewedAt,
        `metadata.themeReviewCoverage[${index}].reviewedAt`,
      ),
    )
    .sort()
    .at(-1);
  requireCondition(
    !Number.isNaN(Date.parse(latestReviewedAt)),
    "themeReviewCoverage reviewedAt must be an ISO timestamp",
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

  const checkpoint =
    options.dryRunCount > 0
      ? null
      : await loadGenerationCheckpoint(
          repositoryRoot,
          options,
          generatorIdentity,
          generationQueue,
        );
  const completed = checkpoint?.completed ?? [];
  const completedAtStart = completed.length;
  const remainingRoutes =
    checkpoint == null
      ? selectedRoutes
      : selectedRoutes.slice(completedAtStart);
  const routesToGenerate =
    options.maxNewBoards > 0
      ? remainingRoutes.slice(0, options.maxNewBoards)
      : remainingRoutes;
  const generationQueueIndexByPuzzleId = new Map(
    generationQueue.map((route, index) => [route.puzzleId, index]),
  );

  const usedAnswers = new Set(
    firstRunContents.flatMap((content) =>
      content.entries.map((entry) => entry.answer),
    ),
  );
  const generatedByPuzzleId = new Map();
  const generationReport = [];
  for (const cached of completed) {
    for (const entry of cached.content.entries) {
      requireCondition(
        !usedAnswers.has(entry.answer),
        `${cached.content.puzzleId} checkpoint reused answer ${entry.answer}`,
      );
      usedAnswers.add(entry.answer);
    }
    generatedByPuzzleId.set(cached.content.puzzleId, cached.content);
    generationReport.push(cached.report);
  }
  if (completedAtStart > 0) {
    console.log(
      `Resuming launch generation from ${completedAtStart}/${selectedRoutes.length} verified checkpoint boards.`,
    );
  }

  for (const [localIndex, route] of routesToGenerate.entries()) {
    const position = generationProgressPosition(completedAtStart, localIndex);
    const generationQueueIndex = generationQueueIndexByPuzzleId.get(
      route.puzzleId,
    );
    requireCondition(
      generationQueueIndex != null,
      `${route.puzzleId} is missing from the generation queue`,
    );
    const nextRoute = generationQueue[generationQueueIndex + 1] ?? null;
    console.log(
      `[${position}/${selectedRoutes.length}] ${route.puzzleId} ${route.difficulty} ${route.themeId}`,
    );
    const generated = await generateRouteContent(
      route,
      nextRoute,
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
    if (checkpoint != null) {
      completed.push(generated);
      await saveGenerationCheckpoint(
        checkpoint,
        generatorIdentity,
        generationQueue,
        completed,
      );
    }
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

  if (generationReport.length < selectedRoutes.length) {
    console.log(
      `Checkpointed ${generationReport.length}/${selectedRoutes.length} boards under ${checkpoint.checkpointRoot}. Rerun the same command to continue.`,
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
    schemaVersion: "ko-kr-launch-generation-report/5",
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
      themeOwnership: wordBank.themeOwnership,
      reviewCoverage: wordBank.metadata.themeReviewCoverage,
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
