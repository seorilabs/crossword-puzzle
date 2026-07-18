#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

import {
  validateKoKrLaunchContentCatalogStructureV1,
  validateWorldMapGraphV1,
} from "../packages/crossword-core/src/launchContentCatalog.ts";
import {
  LAUNCH_CLUE_SIMILARITY_POLICY_ID,
  LAUNCH_CLUE_SIMILARITY_THRESHOLD,
  areCluesSimilar,
  normalizeClueForSimilarity,
} from "../packages/crossword-core/src/clueSimilarity.ts";
import {
  findBoardClueQualityConflicts,
  findKoKrAnswerFragmentExposure,
  isSelfReferentialClue,
} from "../packages/crossword-core/src/clueCuration.ts";
import { DIFFICULTY_PROFILES } from "../packages/crossword-core/src/difficultyProfiles.ts";
import { verifyGameContentChecksum } from "../packages/crossword-core/src/gameContent.ts";
import { canonicalizeForChecksum } from "../packages/crossword-core/src/saveV2.ts";
import { loadBundledFirstRunGameContents } from "../src/game-shell/onboardingGameContent.ts";
import {
  KRDIC_SOURCE_ARTIFACTS,
  KRDIC_SOURCE_COMMIT,
  KRDIC_SOURCE_MIRROR,
} from "./krdict-source-lock.mjs";
import {
  LAUNCH_THEME_SHARD_SPECS,
  deriveLaunchThemeArtifacts,
} from "./build-launch-theme-wordbank.mjs";
import { validateLaunchBoardReviewLedger } from "./launch-board-review-ledger.mjs";
import {
  LAUNCH_ACCEPTED_CANDIDATE_POLICY,
  LAUNCH_THEME_IDS,
  LAUNCH_THEME_OWNER_POLICY,
  buildLaunchRoutePlan,
  filterAvailableWords,
  orderRoutesForGeneration,
  searchOptionsForRetry,
  summarizeFuturePoolConnectivity,
} from "./build-ko-kr-launch-content.mjs";

const execFileAsync = promisify(execFile);

const EXPECTED_REVIEWED_CANDIDATES = 2_400;
const MIN_APPROVED_WORDS = 1_100;
const EXPECTED_GENERATED_BOARDS = 90;
const EXPECTED_TOTAL_BOARDS = 93;
const EXPECTED_MAX_GENERATION_WORD_LENGTH = Object.freeze({
  easy: 3,
  normal: 3,
  hard: 3,
});
const EXPECTED_DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY = Object.freeze({
  normal: 80,
  hard: 120,
});
const CONTENT_LOCALE = "ko-KR";
const LICENSE_MANIFEST_ID = "ko-kr-launch-license-manifest-v1";
const FIRST_RUN_SOURCE_ID = "repo-first-run-content-v1";
const FIRST_RUN_SOURCE_URL_PREFIX =
  "https://github.com/seorilabs/crossword-puzzle/blob/";
const EDITORIAL_CHECK_SET_ID = "ko-kr-launch-editorial-checks-v1";
const PUBLIC_ARTIFACT_PREFIX = "/game-content/v1/ko-KR";
const EXPECTED_GENERATOR_DEPENDENCY_PATHS = Object.freeze([
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
export const KO_KR_LAUNCH_CLUE_QUALITY_POLICY = Object.freeze({
  schemaVersion: "ko-kr-launch-generator-config/5",
  clueSimilarity: Object.freeze({
    policyId: LAUNCH_CLUE_SIMILARITY_POLICY_ID,
    normalization: "NFKC-lowercase-no-space-punctuation-symbol",
    bigramDiceThreshold: LAUNCH_CLUE_SIMILARITY_THRESHOLD,
  }),
  clueQuality: Object.freeze({
    policyId: "ko-kr-launch-clue-quality-v2",
    answerFragmentExposure: Object.freeze({
      minimumLength: 2,
      scope: "launch-selection-and-all-93-board-entries",
      tokenBoundaryPolicy:
        "within-token-or-cross-token-starting-at-token-boundary",
    }),
    sameBoardConflicts: Object.freeze({
      maxAnswerContainmentCount: 0,
      maxCrossAnswerClueLeakCount: 0,
    }),
  }),
});
const DECISION_FILES = Object.freeze([
  Object.freeze({
    path: "data/game-content/v1/ko-KR/reviews/editorial-decisions-0000-0799.json",
    startIndex: 0,
    endIndexInclusive: 799,
  }),
  Object.freeze({
    path: "data/game-content/v1/ko-KR/reviews/editorial-decisions-0800-1599.json",
    startIndex: 800,
    endIndexInclusive: 1_599,
  }),
  Object.freeze({
    path: "data/game-content/v1/ko-KR/reviews/editorial-decisions-1600-2399.json",
    startIndex: 1_600,
    endIndexInclusive: 2_399,
  }),
]);

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonicalJson(value) {
  return canonicalizeForChecksum(value);
}

export function calculateCanonicalDocumentChecksum(value) {
  return sha256(canonicalizeForChecksum(value));
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireNonEmptyString(value, field) {
  requireCondition(
    typeof value === "string" && value.trim() !== "",
    `${field} must be a non-empty string`,
  );
  return value.trim();
}

function requireExact(actual, expected, field) {
  requireCondition(
    canonicalJson(actual) === canonicalJson(expected),
    `${field} does not exactly match its derived source`,
  );
}

export function deriveLaunchWordBankAudit(words, firstRunContents) {
  const reservedAnswers = new Set(
    firstRunContents.flatMap((content) =>
      content.entries.map((entry) => entry.answer),
    ),
  );
  const acceptedClues = firstRunContents.flatMap((content) =>
    content.entries.map((entry) => entry.clue),
  );
  const uniqueByAnswer = new Map();
  const exclusions = {
    answerDuplicates: 0,
    answerFragmentExposure: 0,
    onboardingAnswerConflicts: 0,
    clueConflicts: 0,
  };

  for (const word of words) {
    if (reservedAnswers.has(word.answer)) {
      exclusions.onboardingAnswerConflicts += 1;
      continue;
    }
    if (uniqueByAnswer.has(word.answer)) {
      exclusions.answerDuplicates += 1;
      continue;
    }
    if (findKoKrAnswerFragmentExposure(word.answer, word.clue) != null) {
      exclusions.answerFragmentExposure += 1;
      continue;
    }
    if (acceptedClues.some((clue) => areCluesSimilar(clue, word.clue))) {
      exclusions.clueConflicts += 1;
      continue;
    }
    uniqueByAnswer.set(word.answer, word);
    acceptedClues.push(word.clue);
  }
  return { words: [...uniqueByAnswer.values()], exclusions };
}

function validatorThemeInventoryEligible(word) {
  return ["normal", "hard"].some((difficulty) =>
    validatorGenerationWordLengthEligible(word, difficulty),
  );
}

function validatorThemeHardReserveEligible(word) {
  return (
    ["normal", "hard"].includes(word.difficulty) &&
    validatorGenerationWordLengthEligible(word, "hard")
  );
}

function validatorGenerationWordLengthEligible(word, difficulty) {
  const maximum = EXPECTED_MAX_GENERATION_WORD_LENGTH[difficulty];
  requireCondition(
    Number.isInteger(maximum) && maximum > 0,
    `validator does not support generation difficulty ${difficulty}`,
  );
  return Array.isArray(word.answerCells) && word.answerCells.length <= maximum;
}

/** Generator와 코드를 공유하지 않고 같은 명세에서 owner map을 재계산한다. */
export function independentlyAllocateLaunchThemeOwners(words) {
  const ownerTarget =
    LAUNCH_THEME_OWNER_POLICY.productionTargetDistinctOwnerCountPerTheme;
  const reserveTarget =
    LAUNCH_THEME_OWNER_POLICY.productionTargetNormalOrHardReservePerTheme;
  const slots = [];
  for (const themeId of LAUNCH_THEME_IDS) {
    for (let index = 0; index < reserveTarget; index += 1) {
      slots.push({ themeId, kind: "hard-reserve", index });
    }
    for (let index = 0; index < ownerTarget - reserveTarget; index += 1) {
      slots.push({ themeId, kind: "any", index });
    }
  }
  const candidates = slots.map((slot) => {
    const indexes = [];
    for (const [wordIndex, word] of words.entries()) {
      if (
        validatorThemeInventoryEligible(word) &&
        word.themeTags.includes(slot.themeId) &&
        (slot.kind === "any" || validatorThemeHardReserveEligible(word))
      ) {
        indexes.push(wordIndex);
      }
    }
    return indexes;
  });
  const matchedSlotByWord = new Map();
  const matchedWordBySlot = new Map();
  const tryMatch = (slotIndex, seenWords) => {
    for (const wordIndex of candidates[slotIndex]) {
      if (seenWords.has(wordIndex)) continue;
      seenWords.add(wordIndex);
      const displacedSlot = matchedSlotByWord.get(wordIndex);
      if (displacedSlot == null || tryMatch(displacedSlot, seenWords)) {
        matchedSlotByWord.set(wordIndex, slotIndex);
        matchedWordBySlot.set(slotIndex, wordIndex);
        return true;
      }
    }
    return false;
  };
  for (const slotIndex of slots.keys()) {
    requireCondition(
      tryMatch(slotIndex, new Set()),
      `independent theme owner matching failed at ${slots[slotIndex].themeId}/${slots[slotIndex].kind}/${slots[slotIndex].index}`,
    );
  }

  const ownerByWord = new Map();
  const reservedWords = new Set();
  const loads = Object.fromEntries(
    LAUNCH_THEME_IDS.map((themeId) => [themeId, 0]),
  );
  for (const [slotIndex, wordIndex] of matchedWordBySlot.entries()) {
    const slot = slots[slotIndex];
    ownerByWord.set(wordIndex, slot.themeId);
    loads[slot.themeId] += 1;
    if (slot.kind === "hard-reserve") reservedWords.add(wordIndex);
  }
  for (const [wordIndex, word] of words.entries()) {
    if (
      ownerByWord.has(wordIndex) ||
      !validatorThemeInventoryEligible(word) ||
      word.themeTags.length === 0
    ) {
      continue;
    }
    let owner = word.themeTags[0];
    for (const themeId of word.themeTags.slice(1)) {
      if (
        loads[themeId] < loads[owner] ||
        (loads[themeId] === loads[owner] &&
          LAUNCH_THEME_IDS.indexOf(themeId) < LAUNCH_THEME_IDS.indexOf(owner))
      ) {
        owner = themeId;
      }
    }
    ownerByWord.set(wordIndex, owner);
    loads[owner] += 1;
  }
  const selectedWords = words.map((word, wordIndex) => {
    const themeOwner = ownerByWord.get(wordIndex) ?? null;
    return {
      ...word,
      domainTags: [themeOwner ?? "general"],
      themeOwner,
      themeHardReserve: reservedWords.has(wordIndex),
    };
  });
  const themeInventory = Object.fromEntries(
    LAUNCH_THEME_IDS.map((themeId) => [
      themeId,
      {
        owned: selectedWords.filter((word) => word.themeOwner === themeId)
          .length,
        hardReserve: selectedWords.filter(
          (word) => word.themeOwner === themeId && word.themeHardReserve,
        ).length,
        eligible: words.filter(
          (word) =>
            validatorThemeInventoryEligible(word) &&
            word.themeTags.includes(themeId),
        ).length,
        normalOrHardEligible: words.filter(
          (word) =>
            word.themeTags.includes(themeId) &&
            validatorThemeHardReserveEligible(word),
        ).length,
      },
    ]),
  );
  const assignment = selectedWords.map((word) => ({
    sourceEntryId: word.sourceEntryId,
    themeOwner: word.themeOwner,
    themeHardReserve: word.themeHardReserve,
  }));
  return {
    selectedWords,
    themeInventory,
    themeOwnership: {
      policy: LAUNCH_THEME_OWNER_POLICY,
      assignmentSha256: sha256(canonicalJson(assignment)),
      assignedWordCount: ownerByWord.size,
      unownedWordCount: words.length - ownerByWord.size,
    },
  };
}

function deriveLaunchWordBankReportFromAudit(wordbank, audit) {
  const allocation = independentlyAllocateLaunchThemeOwners(audit.words);
  return {
    originalWordCount: wordbank.words.length,
    cooldownSafeWordCount: audit.words.length,
    exclusions: audit.exclusions,
    themeInventory: allocation.themeInventory,
    themeOwnership: allocation.themeOwnership,
    selectedWords: allocation.selectedWords,
  };
}

export function deriveLaunchWordBankReport(wordbank, firstRunContents) {
  const { selectedWords: _selectedWords, ...report } =
    deriveLaunchWordBankReportFromAudit(
      wordbank,
      deriveLaunchWordBankAudit(wordbank.words, firstRunContents),
    );
  return report;
}

export function validateLaunchWordBankReport(
  reportWordBank,
  wordbank,
  firstRunContents,
  rawSha256,
) {
  const audit = deriveLaunchWordBankAudit(wordbank.words, firstRunContents);
  const derived = deriveLaunchWordBankReportFromAudit(wordbank, audit);
  const { selectedWords, ...reportFields } = derived;
  requireExact(
    reportWordBank,
    {
      path: "data/game-content/v1/ko-KR/reviewed-launch-wordbank-v2.json",
      checksum: rawSha256,
      ...reportFields,
      reviewCoverage: wordbank.metadata.themeReviewCoverage,
    },
    "generation report launch wordbank audit",
  );
  return { ...reportFields, selectedWords };
}

export function validateGeneratorClueQualityPolicy(config) {
  requireCondition(
    config?.schemaVersion === KO_KR_LAUNCH_CLUE_QUALITY_POLICY.schemaVersion,
    "generator clue quality config schema drifted",
  );
  requireExact(
    config.clueSimilarity,
    KO_KR_LAUNCH_CLUE_QUALITY_POLICY.clueSimilarity,
    "generator clue similarity policy",
  );
  requireExact(
    config.clueQuality,
    KO_KR_LAUNCH_CLUE_QUALITY_POLICY.clueQuality,
    "generator clue quality policy",
  );
  return true;
}

export function validateGeneratorThemeInventoryPolicy(config) {
  requireExact(
    config?.maxGenerationWordLength,
    EXPECTED_MAX_GENERATION_WORD_LENGTH,
    "generator maximum word length policy",
  );
  requireExact(
    config?.themeOwnership,
    LAUNCH_THEME_OWNER_POLICY,
    "generator theme ownership policy",
  );
  requireExact(
    config?.dailyConnectorWordLimitByDifficulty,
    EXPECTED_DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY,
    "generator daily connector word limit policy",
  );
  return true;
}

function requireUniqueStrings(values, field) {
  requireCondition(
    values.every((value) => typeof value === "string" && value !== ""),
    `${field} must contain only non-empty strings`,
  );
  requireCondition(
    new Set(values).size === values.length,
    `${field} must be globally unique`,
  );
}

function requirePositiveSafeInteger(value, field, { allowZero = false } = {}) {
  requireCondition(
    Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0),
    `${field} must be a ${allowZero ? "non-negative" : "positive"} safe integer`,
  );
  return value;
}

async function readArtifact(filePath) {
  const buffer = await readFile(filePath);
  const text = buffer.toString("utf8");
  return {
    buffer,
    text,
    document: JSON.parse(text),
    rawSha256: sha256(buffer),
  };
}

function normalizeRepositoryRelativePath(relativePath, field) {
  requireCondition(
    typeof relativePath === "string" &&
      relativePath !== "" &&
      !path.posix.isAbsolute(relativePath) &&
      relativePath === path.posix.normalize(relativePath) &&
      !relativePath.startsWith("../") &&
      !relativePath.includes("\\") &&
      !relativePath.includes("\0"),
    `${field} is not a safe repository-relative path`,
  );
  return relativePath;
}

function resolveRepositoryPath(repositoryRoot, relativePath, field) {
  const normalized = normalizeRepositoryRelativePath(relativePath, field);
  const resolved = path.resolve(repositoryRoot, normalized);
  requireCondition(
    resolved.startsWith(`${repositoryRoot}${path.sep}`),
    `${field} escapes the repository root`,
  );
  return resolved;
}

function expectedArtifactPath(content) {
  return `${PUBLIC_ARTIFACT_PREFIX}/packs/${content.packId}/${content.contentChecksum}.json`;
}

export function resolvePublicArtifactPath(publicRoot, artifactPath) {
  requireCondition(
    typeof artifactPath === "string" &&
      /^\/game-content\/v1\/ko-KR\/packs\/[A-Za-z0-9._-]+\/sha256:[0-9a-f]{64}\.json$/.test(
        artifactPath,
      ) &&
      artifactPath === path.posix.normalize(artifactPath) &&
      !artifactPath.includes("\\") &&
      !artifactPath.includes("\0"),
    `unsafe immutable artifactPath: ${artifactPath}`,
  );
  const relativePath = artifactPath.slice(`${PUBLIC_ARTIFACT_PREFIX}/`.length);
  const resolved = path.resolve(publicRoot, relativePath);
  requireCondition(
    resolved.startsWith(`${publicRoot}${path.sep}`),
    `artifactPath escapes public content root: ${artifactPath}`,
  );
  return resolved;
}

function canonicalCandidateDefinition(candidate, contentLocale) {
  return JSON.stringify({
    contentLocale,
    sourceEntryId: candidate.sourceEntryId,
    answer: candidate.answer,
    definition: candidate.definition,
  });
}

function canonicalSourceRecord(record) {
  return JSON.stringify({
    sourceEntryId: record.sourceEntryId,
    writtenForms: record.writtenForms,
    partOfSpeech: record.partOfSpeech,
    vocabularyLevels: record.vocabularyLevels,
    definitions: record.definitions,
  });
}

function summarizeReviewedWords(words, rejectedCount, rewrittenCount) {
  const difficulty = { easy: 0, normal: 0, hard: 0 };
  const themes = {};
  for (const word of words) {
    requireCondition(
      Object.hasOwn(difficulty, word.difficulty),
      `invalid derived difficulty: ${word.difficulty}`,
    );
    difficulty[word.difficulty] += 1;
    for (const themeId of word.domainTags) {
      themes[themeId] = (themes[themeId] ?? 0) + 1;
    }
  }
  return {
    approved: words.length,
    rejected: rejectedCount,
    rewritten: rewrittenCount,
    difficulty,
    themes,
  };
}

function validateCandidateRows(candidateDocument) {
  requireCondition(
    candidateDocument.schemaVersion === "game-content-review-candidates/1" &&
      candidateDocument.contentLocale === CONTENT_LOCALE,
    "editorial candidate identity mismatch",
  );
  const candidates = candidateDocument.candidates;
  requireCondition(
    Array.isArray(candidates) &&
      candidates.length === EXPECTED_REVIEWED_CANDIDATES,
    `review candidate count must be exactly ${EXPECTED_REVIEWED_CANDIDATES}`,
  );
  requireCondition(
    candidateDocument.summary?.total === EXPECTED_REVIEWED_CANDIDATES,
    "review candidate summary total drifted",
  );
  requireUniqueStrings(
    candidates.map((candidate) => candidate.sourceEntryId),
    "candidate sourceEntryId",
  );
  for (const [index, candidate] of candidates.entries()) {
    requireNonEmptyString(candidate.answer, `candidates[${index}].answer`);
    requireNonEmptyString(
      candidate.definition,
      `candidates[${index}].definition`,
    );
    requireCondition(
      candidate.definitionChecksum ===
        sha256(
          canonicalCandidateDefinition(
            candidate,
            candidateDocument.contentLocale,
          ),
        ),
      `candidate definition checksum mismatch at index ${index}`,
    );
  }
  return candidates;
}

function deriveEditorialArtifacts(
  candidateDocument,
  candidateFileSha256,
  decisionArtifacts,
  wordbankFileSha256,
) {
  const candidates = validateCandidateRows(candidateDocument);
  requireCondition(
    decisionArtifacts.length === DECISION_FILES.length,
    "exactly three editorial decision files are required",
  );

  const coverage = [];
  const decisionsByCandidateIndex = new Map();
  const decidedSourceEntryIds = [];
  for (const [fileIndex, decisionArtifact] of decisionArtifacts.entries()) {
    const expectedFile = DECISION_FILES[fileIndex];
    const decisionDocument = decisionArtifact.document;
    requireCondition(
      decisionArtifact.relativePath === expectedFile.path,
      `editorial decision file order/path mismatch at index ${fileIndex}`,
    );
    requireCondition(
      decisionDocument.schemaVersion === "game-content-editorial-decisions/1" &&
        decisionDocument.contentLocale === CONTENT_LOCALE &&
        decisionDocument.candidateFileSha256 === candidateFileSha256 &&
        decisionDocument.checkSetId === EDITORIAL_CHECK_SET_ID,
      `${expectedFile.path} identity or candidate lock mismatch`,
    );
    requireExact(
      decisionDocument.coverage,
      {
        startIndex: expectedFile.startIndex,
        endIndexInclusive: expectedFile.endIndexInclusive,
      },
      `${expectedFile.path}.coverage`,
    );
    const reviewerId = requireNonEmptyString(
      decisionDocument.reviewerId,
      `${expectedFile.path}.reviewerId`,
    );
    const reviewedAt = requireNonEmptyString(
      decisionDocument.reviewedAt,
      `${expectedFile.path}.reviewedAt`,
    );
    requireCondition(
      !Number.isNaN(Date.parse(reviewedAt)),
      `${expectedFile.path}.reviewedAt must be an ISO timestamp`,
    );
    const decisions = decisionDocument.decisions;
    requireCondition(
      Array.isArray(decisions) && decisions.length === 800,
      `${expectedFile.path} must contain exactly 800 explicit decisions`,
    );
    coverage.push({
      reviewerId,
      reviewedAt,
      startIndex: expectedFile.startIndex,
      endIndexInclusive: expectedFile.endIndexInclusive,
      decisionFile: expectedFile.path,
      decisionFileSha256: decisionArtifact.rawSha256,
    });

    for (const [offset, decision] of decisions.entries()) {
      const candidateIndex = expectedFile.startIndex + offset;
      const candidate = candidates[candidateIndex];
      requireCondition(
        decision.candidateIndex === candidateIndex &&
          decision.sourceEntryId === candidate.sourceEntryId &&
          decision.answer === candidate.answer &&
          decision.definitionChecksum === candidate.definitionChecksum,
        `${expectedFile.path} candidate identity drift at index ${candidateIndex}`,
      );
      requireCondition(
        decision.checkSetId === EDITORIAL_CHECK_SET_ID &&
          ["approve", "reject", "rewrite"].includes(decision.decision),
        `${expectedFile.path} invalid decision at index ${candidateIndex}`,
      );
      requireCondition(
        Array.isArray(decision.reasonCodes) &&
          decision.reasonCodes.length > 0 &&
          decision.reasonCodes.every(
            (reason) => typeof reason === "string" && reason.trim() !== "",
          ),
        `${expectedFile.path} missing reason codes at index ${candidateIndex}`,
      );
      requireCondition(
        !decisionsByCandidateIndex.has(candidateIndex),
        `duplicate editorial decision for candidate ${candidateIndex}`,
      );
      decidedSourceEntryIds.push(decision.sourceEntryId);
      if (decision.decision === "rewrite") {
        const rewrittenClue = requireNonEmptyString(
          decision.clue,
          `${expectedFile.path}.decisions[${offset}].clue`,
        );
        requireCondition(
          rewrittenClue.length >= 5 &&
            rewrittenClue.length <= 54 &&
            !isSelfReferentialClue(candidate.answer, rewrittenClue),
          `${expectedFile.path} invalid rewritten clue at index ${candidateIndex}`,
        );
      }
      if (decision.decision !== "reject") {
        const shortExplanation = requireNonEmptyString(
          decision.shortExplanation,
          `${expectedFile.path}.decisions[${offset}].shortExplanation`,
        );
        requireCondition(
          shortExplanation.length >= 2 &&
            shortExplanation.length <= 80 &&
            !isSelfReferentialClue(candidate.answer, shortExplanation),
          `${expectedFile.path} invalid short explanation at index ${candidateIndex}`,
        );
        requireNonEmptyString(
          decision.explanationReasonCode,
          `${expectedFile.path}.decisions[${offset}].explanationReasonCode`,
        );
      }
      requireCondition(
        candidate.riskFlags.length === 0 ||
          decision.decision === "rewrite" ||
          decision.decision === "reject",
        `${expectedFile.path} approved a risk-flagged candidate without rewrite`,
      );
      decisionsByCandidateIndex.set(candidateIndex, {
        ...decision,
        reviewerId,
        reviewedAt,
      });
    }
  }
  requireCondition(
    decisionsByCandidateIndex.size === EXPECTED_REVIEWED_CANDIDATES,
    "editorial decisions must cover candidate indexes 0 through 2399",
  );
  requireUniqueStrings(decidedSourceEntryIds, "decision sourceEntryId");

  const ledgerDecisions = [];
  const words = [];
  let rejectedCount = 0;
  let rewrittenCount = 0;
  for (const [candidateIndex, candidate] of candidates.entries()) {
    const decision = decisionsByCandidateIndex.get(candidateIndex);
    requireCondition(
      decision != null,
      `candidate ${candidateIndex} has no explicit decision`,
    );
    const reviewCoverage = coverage.find(
      (item) =>
        candidateIndex >= item.startIndex &&
        candidateIndex <= item.endIndexInclusive,
    );
    requireCondition(
      reviewCoverage != null,
      `candidate ${candidateIndex} has no coverage record`,
    );
    ledgerDecisions.push({
      candidateIndex,
      sourceEntryId: candidate.sourceEntryId,
      answer: candidate.answer,
      decision: decision.decision,
      reasonCodes: decision.reasonCodes,
      checkSetId: EDITORIAL_CHECK_SET_ID,
      definitionChecksum: candidate.definitionChecksum,
      reviewerId: reviewCoverage.reviewerId,
      reviewedAt: reviewCoverage.reviewedAt,
      ...(decision.decision === "rewrite"
        ? { rewrittenClue: decision.clue }
        : {}),
      ...(decision.decision !== "reject"
        ? {
            shortExplanation: decision.shortExplanation,
            explanationReasonCode: decision.explanationReasonCode,
          }
        : {}),
    });
    if (decision.decision === "reject") {
      rejectedCount += 1;
      continue;
    }
    if (decision.decision === "rewrite") rewrittenCount += 1;
    const domainTags =
      candidate.domainTags.length > 0 ? candidate.domainTags : ["general"];
    words.push({
      answer: candidate.answer,
      answerCells: [...candidate.answer],
      definition: candidate.definition,
      definitionChecksum: candidate.definitionChecksum,
      length: [...candidate.answer].length,
      level: candidate.level,
      pos: "명사",
      sourceId: candidate.sourceEntryId,
      sourceEntryId: candidate.sourceEntryId,
      sourceUrl: candidateDocument.sourceDataset.sourceUrl,
      licenseId: candidateDocument.sourceDataset.licenseId,
      allowForPuzzle: true,
      clue: decision.decision === "rewrite" ? decision.clue : candidate.clue,
      clueSource:
        decision.decision === "rewrite" || candidate.clueKind === "adapted"
          ? "editorial-reviewed-adaptation"
          : "krdict-definition-reviewed",
      shortExplanation: decision.shortExplanation,
      source: candidateDocument.sourceDataset.sourceName,
      difficulty: candidate.difficulty,
      needsManualClue: false,
      themeTags: domainTags,
      domainTags,
      reviewDecision: decision.decision,
      reviewLedgerIndex: candidateIndex,
    });
  }
  requireCondition(
    words.length >= MIN_APPROVED_WORDS,
    `approved wordbank must contain at least ${MIN_APPROVED_WORDS} entries`,
  );
  requireUniqueStrings(
    words.map((word) => word.sourceEntryId),
    "wordbank sourceEntryId",
  );
  requireUniqueStrings(
    words.map((word) => word.answer),
    "wordbank answer",
  );
  requireUniqueStrings(
    words.map((word) => word.definitionChecksum),
    "wordbank definitionChecksum",
  );
  for (const [index, word] of words.entries()) {
    requireCondition(
      !isSelfReferentialClue(word.answer, word.clue) &&
        !isSelfReferentialClue(word.answer, word.shortExplanation),
      `approved wordbank answer leak at index ${index}/${word.answer}`,
    );
  }
  // reviewed wordbank는 출처/편집 증거 풀이다. 서로 가까운 단서 계열과 복합어
  // 조각 노출은 이 원장을 훼손하지 않고 launch selection에서 결정적으로 제외한다.
  // 최종 93보드에는 아래 generator/report audit와 global inventory gate가 같은
  // v2 정책을 다시 적용한다.
  const summary = summarizeReviewedWords(words, rejectedCount, rewrittenCount);
  const expectedWordbank = {
    metadata: {
      schemaVersion: "launch-wordbank/1",
      contentLocale: CONTENT_LOCALE,
      sourceDataset: candidateDocument.sourceDataset,
      sourceCandidateFile:
        "data/game-content/v1/ko-KR/reviews/editorial-candidates.json",
      sourceCandidateFileSha256: candidateFileSha256,
      editorialCheckSetId: EDITORIAL_CHECK_SET_ID,
      reviewCoverage: coverage,
      summary,
    },
    words,
  };
  const expectedLedger = {
    schemaVersion: "game-content-editorial-ledger/1",
    contentLocale: CONTENT_LOCALE,
    editorialCheckSetId: EDITORIAL_CHECK_SET_ID,
    candidateFileSha256,
    wordbankFileSha256,
    coverage,
    summary,
    decisions: ledgerDecisions,
  };
  return { candidates, coverage, expectedLedger, expectedWordbank, summary };
}

function normalizeMirror(value) {
  return String(value ?? "")
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\/$/, "");
}

function calculateSourceLockChecksum(dataset) {
  return sha256(
    JSON.stringify({
      datasetId: dataset.datasetId,
      sourceMirror: KRDIC_SOURCE_MIRROR,
      sourceMirrorCommit: KRDIC_SOURCE_COMMIT,
      licenseId: dataset.licenseId,
      sourceArtifacts: KRDIC_SOURCE_ARTIFACTS.map(
        ({ file, bytes, rawSha256, gitBlobSha1 }) => ({
          file,
          bytes,
          rawSha256,
          gitBlobSha1,
        }),
      ),
    }),
  );
}

export async function validateFirstRunSourceLock(
  repositoryRoot,
  licenseManifest,
) {
  const matchingSources = licenseManifest.sources?.filter(
    (source) => source.sourceId === FIRST_RUN_SOURCE_ID,
  );
  requireCondition(
    Array.isArray(matchingSources) && matchingSources.length === 1,
    `license manifest must contain exactly one ${FIRST_RUN_SOURCE_ID} source`,
  );
  const [source] = matchingSources;
  requireCondition(
    /^[0-9a-f]{40}$/.test(source.sourceCommit ?? ""),
    "manifest first-run sourceCommit must be a 40-character lowercase hex commit",
  );
  requireCondition(
    /^sha256:[0-9a-f]{64}$/.test(source.sourceFileSha256 ?? ""),
    "manifest first-run sourceFileSha256 must be a lowercase SHA-256 digest",
  );
  const sourceUrlMatch = new RegExp(
    `^${FIRST_RUN_SOURCE_URL_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([0-9a-f]{40})/(.+)$`,
  ).exec(source.sourceUrl ?? "");
  requireCondition(
    sourceUrlMatch != null,
    "manifest first-run sourceUrl must be a pinned crossword-puzzle GitHub blob URL",
  );
  const [, sourceUrlCommit, rawSourcePath] = sourceUrlMatch;
  requireCondition(
    sourceUrlCommit === source.sourceCommit,
    "manifest first-run sourceUrl commit must exactly match sourceCommit",
  );
  const sourcePath = normalizeRepositoryRelativePath(
    rawSourcePath,
    "manifest first-run sourceUrl path",
  );

  let committedSource;
  try {
    ({ stdout: committedSource } = await execFileAsync(
      "git",
      ["show", `${source.sourceCommit}:${sourcePath}`],
      {
        cwd: repositoryRoot,
        encoding: "buffer",
        maxBuffer: 32 * 1024 * 1024,
      },
    ));
  } catch (error) {
    throw new Error(
      `manifest first-run source is not pinned by commit ${source.sourceCommit}: ${sourcePath} (${error.message})`,
    );
  }
  requireCondition(
    source.sourceFileSha256 === sha256(committedSource),
    "manifest first-run sourceFileSha256 does not match the committed source bytes",
  );
  return source;
}

export function validateLicensePolicyAnchors(licenseManifest, firstRunSource) {
  requireExact(
    licenseManifest.licenses,
    [
      {
        licenseId: "LicenseRef-Seorilabs-First-Run-Content",
        name: "Seorilabs first-run content",
        termsUrl: firstRunSource.sourceUrl,
        redistributionAllowed: true,
      },
      {
        licenseId: "CC-BY-SA-2.0-KR",
        name: "Creative Commons Attribution-ShareAlike 2.0 Korea",
        termsUrl: "https://creativecommons.org/licenses/by-sa/2.0/kr/",
        redistributionAllowed: true,
        shareAlikeRequired: true,
      },
    ],
    "license manifest policy anchors",
  );
}

function validateSourceArtifactLocks(
  candidateDocument,
  licenseManifest,
  provenanceIndex,
) {
  const dataset = candidateDocument.sourceDataset;
  requireCondition(
    normalizeMirror(dataset?.sourceMirror) === KRDIC_SOURCE_MIRROR &&
      dataset?.sourceMirrorCommit === KRDIC_SOURCE_COMMIT &&
      dataset?.licenseId === "CC-BY-SA-2.0-KR",
    "candidate source dataset does not match the shared KRDIC lock",
  );
  requireExact(
    dataset.sourceXmlBlobs,
    KRDIC_SOURCE_ARTIFACTS.map(({ file, gitBlobSha1, rawSha256, bytes }) => ({
      file,
      gitBlobSha1,
      rawSha256,
      bytes,
    })),
    "candidate source XML artifact pins",
  );

  const manifestSource = licenseManifest.sources?.find(
    (source) => source.sourceId === "nikl-krdict-text-2019",
  );
  requireCondition(manifestSource != null, "manifest KRDIC source is missing");
  requireCondition(
    normalizeMirror(manifestSource.sourceMirror) === KRDIC_SOURCE_MIRROR &&
      manifestSource.sourceMirrorCommit === KRDIC_SOURCE_COMMIT &&
      manifestSource.licenseId === dataset.licenseId,
    "manifest KRDIC source lock mismatch",
  );
  requireExact(
    manifestSource.sourceArtifacts,
    KRDIC_SOURCE_ARTIFACTS.map(({ file, rawSha256, gitBlobSha1, bytes }) => ({
      file,
      rawSha256,
      gitBlobSha1,
      bytes,
    })),
    "manifest source artifact pins",
  );

  const sourceLockSha256 = calculateSourceLockChecksum(dataset);
  requireExact(
    provenanceIndex.sourceDataset,
    {
      datasetId: dataset.datasetId,
      sourceMirror: KRDIC_SOURCE_MIRROR,
      sourceMirrorCommit: KRDIC_SOURCE_COMMIT,
      licenseId: dataset.licenseId,
      sourceLockSha256,
      sourceArtifacts: KRDIC_SOURCE_ARTIFACTS,
    },
    "source provenance dataset lock",
  );
}

function validateProvenanceIndex(
  provenanceIndex,
  candidateDocument,
  candidateFileSha256,
) {
  requireCondition(
    provenanceIndex.schemaVersion === "krdict-launch-source-provenance/1" &&
      provenanceIndex.contentLocale === CONTENT_LOCALE,
    "source provenance index identity mismatch",
  );
  requireExact(
    provenanceIndex.candidateFile,
    {
      path: "data/game-content/v1/ko-KR/reviews/editorial-candidates.json",
      sha256: candidateFileSha256,
    },
    "source provenance candidate lock",
  );
  requireCondition(
    Array.isArray(provenanceIndex.entries) &&
      provenanceIndex.entries.length === EXPECTED_REVIEWED_CANDIDATES,
    "source provenance must contain exactly 2,400 records",
  );
  requireUniqueStrings(
    provenanceIndex.entries.map((entry) => entry.sourceEntryId),
    "source provenance sourceEntryId",
  );
  const candidateBySourceEntryId = new Map(
    candidateDocument.candidates.map((candidate) => [
      candidate.sourceEntryId,
      candidate,
    ]),
  );
  const pinnedByFile = new Map(
    KRDIC_SOURCE_ARTIFACTS.map((artifact) => [artifact.file, artifact]),
  );
  for (const [index, entry] of provenanceIndex.entries.entries()) {
    const candidate = candidateBySourceEntryId.get(entry.sourceEntryId);
    requireCondition(
      candidate != null &&
        entry.answer === candidate.answer &&
        entry.definitionChecksum === candidate.definitionChecksum,
      `source provenance candidate join mismatch at index ${index}`,
    );
    const expectedRecord = {
      sourceEntryId: entry.sourceEntryId,
      writtenForms: entry.sourceRecord?.writtenForms,
      partOfSpeech: entry.sourceRecord?.partOfSpeech,
      vocabularyLevels: entry.sourceRecord?.vocabularyLevels,
      definitions: entry.sourceRecord?.definitions,
    };
    requireExact(
      entry.sourceRecord,
      expectedRecord,
      `source provenance record ${entry.sourceEntryId}`,
    );
    requireCondition(
      entry.sourceRecordSha256 ===
        sha256(canonicalSourceRecord(expectedRecord)) &&
        expectedRecord.sourceEntryId === candidate.sourceEntryId &&
        expectedRecord.writtenForms.includes(candidate.answer) &&
        expectedRecord.definitions.includes(candidate.definition),
      `source provenance source record mismatch: ${entry.sourceEntryId}`,
    );
    const pinned = pinnedByFile.get(entry.sourceArtifact?.file);
    requireCondition(
      pinned != null &&
        entry.sourceArtifact.rawSha256 === pinned.rawSha256 &&
        entry.sourceArtifact.gitBlobSha1 === pinned.gitBlobSha1,
      `source provenance artifact mismatch: ${entry.sourceEntryId}`,
    );
  }
  const expectedOrder = [...provenanceIndex.entries]
    .sort((left, right) => {
      const numericDifference =
        Number(left.sourceEntryId) - Number(right.sourceEntryId);
      return (
        numericDifference || left.answer.localeCompare(right.answer, "ko-KR")
      );
    })
    .map((entry) => entry.sourceEntryId);
  requireExact(
    provenanceIndex.entries.map((entry) => entry.sourceEntryId),
    expectedOrder,
    "source provenance deterministic order",
  );
  requireExact(
    provenanceIndex.summary,
    {
      candidateCount: EXPECTED_REVIEWED_CANDIDATES,
      sourceRecordCount: EXPECTED_REVIEWED_CANDIDATES,
      sourceArtifactCount: KRDIC_SOURCE_ARTIFACTS.length,
    },
    "source provenance summary",
  );
}

async function validateInputAndReviewLocks(
  repositoryRoot,
  candidateArtifact,
  decisionArtifacts,
  baseWordbankArtifact,
  baseLedgerArtifact,
  taxonomyArtifact,
  themeDecisionArtifacts,
  wordbankArtifact,
  themeLedgerArtifact,
  licenseManifestArtifact,
  provenanceArtifact,
) {
  const candidateDocument = candidateArtifact.document;
  const wordbank = wordbankArtifact.document;
  const baseWordbank = baseWordbankArtifact.document;
  const baseLedger = baseLedgerArtifact.document;
  const licenseManifest = licenseManifestArtifact.document;
  const provenanceIndex = provenanceArtifact.document;
  const derived = deriveEditorialArtifacts(
    candidateDocument,
    candidateArtifact.rawSha256,
    decisionArtifacts,
    baseWordbankArtifact.rawSha256,
  );
  requireExact(
    baseWordbank,
    derived.expectedWordbank,
    "base reviewed wordbank",
  );
  requireExact(baseLedger, derived.expectedLedger, "base editorial ledger");
  const themeDerived = deriveLaunchThemeArtifacts({
    baseWordBankText: baseWordbankArtifact.text,
    baseEditorialLedgerText: baseLedgerArtifact.text,
    taxonomyText: taxonomyArtifact.text,
    themeShardInputs: themeDecisionArtifacts.map((artifact) => ({
      relativePath: artifact.relativePath,
      text: artifact.text,
    })),
  });
  requireExact(
    wordbank,
    themeDerived.wordBankDocument,
    "theme reviewed wordbank v2",
  );
  requireExact(
    themeLedgerArtifact.document,
    themeDerived.themeLedgerDocument,
    "theme editorial ledger",
  );
  requireCondition(
    wordbankArtifact.rawSha256 === themeDerived.wordBankSha256,
    "theme reviewed wordbank raw checksum mismatch",
  );

  requireCondition(
    licenseManifest.schemaVersion === "game-content-license-manifest/1" &&
      licenseManifest.manifestId === LICENSE_MANIFEST_ID &&
      licenseManifest.contentLocale === CONTENT_LOCALE,
    "license manifest identity mismatch",
  );
  requireCandidateFlags(licenseManifest, "license manifest");
  const firstRunSource = await validateFirstRunSourceLock(
    repositoryRoot,
    licenseManifest,
  );
  validateLicensePolicyAnchors(licenseManifest, firstRunSource);
  const expectedDecisionPaths = DECISION_FILES.map((item) => item.path);
  const expectedDecisionHashes = decisionArtifacts.map(
    (artifact) => artifact.rawSha256,
  );
  requireExact(
    licenseManifest.reviewEvidence,
    {
      candidateFile:
        "data/game-content/v1/ko-KR/reviews/editorial-candidates.json",
      candidateFileSha256: candidateArtifact.rawSha256,
      decisionFiles: expectedDecisionPaths,
      decisionFileSha256: expectedDecisionHashes,
      baseWordbankFile:
        "data/game-content/v1/ko-KR/reviewed-launch-wordbank.json",
      baseWordbankFileSha256: baseWordbankArtifact.rawSha256,
      baseLedgerFile:
        "data/game-content/v1/ko-KR/reviews/editorial-ledger.json",
      baseLedgerFileSha256: baseLedgerArtifact.rawSha256,
      themeTaxonomyFile:
        "data/game-content/v1/ko-KR/reviews/launch-theme-taxonomy.json",
      themeTaxonomyFileSha256: taxonomyArtifact.rawSha256,
      themeDecisionFiles: themeDecisionArtifacts.map(
        (artifact) => artifact.relativePath,
      ),
      themeDecisionFileSha256: themeDecisionArtifacts.map(
        (artifact) => artifact.rawSha256,
      ),
      wordbankFile:
        "data/game-content/v1/ko-KR/reviewed-launch-wordbank-v2.json",
      wordbankFileSha256: wordbankArtifact.rawSha256,
      ledgerFile: "data/game-content/v1/ko-KR/reviews/launch-theme-ledger.json",
      ledgerFileSha256: themeLedgerArtifact.rawSha256,
    },
    "license manifest review evidence",
  );

  const curatedInput = candidateDocument.sourceDataset?.curatedInput;
  const sourceInputLock = licenseManifest.sourceInputLock;
  requireCondition(
    curatedInput != null && sourceInputLock != null,
    "candidate/manifest curated source input locks are required",
  );
  const curatedWordbankPath = resolveRepositoryPath(
    repositoryRoot,
    curatedInput.wordbankPath,
    "candidate curated wordbank path",
  );
  const themeFilterPath = resolveRepositoryPath(
    repositoryRoot,
    curatedInput.themeFilterPath,
    "candidate theme filter path",
  );
  const [curatedWordbankBuffer, themeFilterBuffer] = await Promise.all([
    readFile(curatedWordbankPath),
    readFile(themeFilterPath),
  ]);
  const actualInputLock = {
    wordbankPath: curatedInput.wordbankPath,
    wordbankSha256: sha256(curatedWordbankBuffer),
    themeFilterPath: curatedInput.themeFilterPath,
    themeFilterSha256: sha256(themeFilterBuffer),
  };
  requireExact(curatedInput, actualInputLock, "candidate curated input lock");
  requireExact(
    sourceInputLock,
    {
      curatedWordbankPath: actualInputLock.wordbankPath,
      curatedWordbankSha256: actualInputLock.wordbankSha256,
      themeFilterPath: actualInputLock.themeFilterPath,
      themeFilterSha256: actualInputLock.themeFilterSha256,
    },
    "manifest source input lock",
  );
  requireExact(
    wordbank.metadata.sourceDataset,
    candidateDocument.sourceDataset,
    "wordbank candidate source lock",
  );
  validateSourceArtifactLocks(
    candidateDocument,
    licenseManifest,
    provenanceIndex,
  );
  requireExact(
    licenseManifest.sourceProvenanceIndex,
    {
      path: "data/game-content/v1/ko-KR/source-provenance-index.json",
      sha256: provenanceArtifact.rawSha256,
      sourceLockSha256: provenanceIndex.sourceDataset.sourceLockSha256,
      candidateCount: EXPECTED_REVIEWED_CANDIDATES,
    },
    "manifest source provenance index pointer",
  );
  validateProvenanceIndex(
    provenanceIndex,
    candidateDocument,
    candidateArtifact.rawSha256,
  );

  const licenseIds = new Set(
    licenseManifest.licenses?.map((license) => license.licenseId),
  );
  requireCondition(
    licenseIds.has("LicenseRef-Seorilabs-First-Run-Content") &&
      licenseIds.has("CC-BY-SA-2.0-KR"),
    "license manifest must resolve first-run and KRDIC licenses",
  );
  return {
    candidateDocument,
    derived,
    licenseIds,
    licenseManifest,
    manifestCanonicalSha256:
      calculateCanonicalDocumentChecksum(licenseManifest),
    wordbank,
  };
}

function requireCandidateFlags(document, field) {
  requireCondition(
    document?.artifactStatus === "candidate" &&
      document?.activationApproved === false,
    `${field} must remain an inactive candidate`,
  );
}

export function validateGeneratedEntryAgainstReviewedWord(
  entry,
  reviewedWord,
  field = "generated entry",
) {
  requireCondition(reviewedWord != null, `${field} has no reviewed word join`);
  const expected = {
    answer: reviewedWord.answer,
    answerCells: reviewedWord.answerCells,
    clue: reviewedWord.clue,
    clueSource: reviewedWord.clueSource,
    needsManualClue: false,
    shortExplanation: reviewedWord.shortExplanation,
    source: reviewedWord.source,
    sourceEntryId: reviewedWord.sourceEntryId,
    sourceUrl: reviewedWord.sourceUrl,
    licenseId: reviewedWord.licenseId,
    domainTags: reviewedWord.domainTags,
  };
  const actual = Object.fromEntries(
    Object.keys(expected).map((key) => [key, entry?.[key]]),
  );
  requireExact(actual, expected, field);
}

function validateFirstRunEntry(entry, firstRunSource, field) {
  requireCondition(
    entry.clueSource === "repo-authored-reviewed" &&
      entry.needsManualClue === false &&
      entry.source === firstRunSource.sourceName &&
      entry.sourceUrl === firstRunSource.sourceUrl &&
      entry.licenseId === firstRunSource.licenseId &&
      entry.sourceEntryId.startsWith(firstRunSource.entryIdPrefix),
    `${field} does not resolve to the manifest first-run source`,
  );
}

export function validateBundledFirstRunCatalog(rawCatalog, bundledContents) {
  requireCondition(
    Array.isArray(bundledContents) && bundledContents.length === 3,
    "bundled first-run source must contain exactly three boards",
  );
  const firstRunIndexes = rawCatalog.boards
    .map((board, index) => (board.route?.kind === "first-run" ? index : -1))
    .filter((index) => index >= 0);
  requireExact(firstRunIndexes, [0, 1, 2], "first-run catalog order");
  for (const [index, bundledContent] of bundledContents.entries()) {
    const catalogBoard = rawCatalog.boards[index];
    requireExact(
      catalogBoard.route,
      { kind: "first-run" },
      `first-run route ${index}`,
    );
    requireExact(
      catalogBoard.content,
      bundledContent,
      `first-run bundled content ${index}/${bundledContent.puzzleId ?? "unknown"}`,
    );
  }
}

function validateCatalogEntryProvenance(
  rawCatalog,
  report,
  wordbank,
  licenseManifest,
  licenseIds,
) {
  const reviewedBySourceEntryId = new Map(
    wordbank.words.map((word) => [word.sourceEntryId, word]),
  );
  requireCondition(
    reviewedBySourceEntryId.size === wordbank.words.length,
    "wordbank sourceEntryId values are not unique",
  );
  const ledgerByIndex = new Map(
    wordbank.words.map((word) => [word.reviewLedgerIndex, word]),
  );
  const firstRunSource = licenseManifest.sources?.find(
    (source) => source.sourceId === "repo-first-run-content-v1",
  );
  requireCondition(
    firstRunSource != null &&
      typeof firstRunSource.entryIdPrefix === "string" &&
      firstRunSource.entryIdPrefix !== "",
    "manifest first-run source/prefix is missing",
  );
  const reportByPuzzleId = new Map(
    report.boards.map((board) => [board.puzzleId, board]),
  );
  requireCondition(
    reportByPuzzleId.size === EXPECTED_GENERATED_BOARDS,
    "generation report puzzleId values must be unique",
  );
  const catalogSourceEntryIds = [];

  for (const [boardIndex, board] of rawCatalog.boards.entries()) {
    const content = board.content;
    requireCondition(
      content.licenseManifestId === LICENSE_MANIFEST_ID,
      `${content.puzzleId} references a different license manifest`,
    );
    const reportBoard = reportByPuzzleId.get(content.puzzleId);
    if (board.route.kind === "first-run") {
      requireCondition(
        reportBoard == null,
        `${content.puzzleId} first-run board must not appear in generated report`,
      );
      for (const [entryIndex, entry] of content.entries.entries()) {
        validateFirstRunEntry(
          entry,
          firstRunSource,
          `catalog.boards[${boardIndex}].content.entries[${entryIndex}]`,
        );
      }
    } else {
      requireCondition(
        reportBoard != null,
        `${content.puzzleId} is missing from the generation report`,
      );
      const provenanceByEntryId = new Map(
        reportBoard.entryProvenance?.map((item) => [item.entryId, item]),
      );
      requireCondition(
        provenanceByEntryId.size === content.entries.length,
        `${content.puzzleId} report provenance count mismatch`,
      );
      for (const [entryIndex, entry] of content.entries.entries()) {
        const reviewedWord = reviewedBySourceEntryId.get(entry.sourceEntryId);
        validateGeneratedEntryAgainstReviewedWord(
          entry,
          reviewedWord,
          `${content.puzzleId}.entries[${entryIndex}]`,
        );
        if (board.route.kind === "daily") {
          requireCondition(
            reviewedWord.themeOwner == null ||
              reviewedWord.themeOwner === content.themeId,
            `${content.puzzleId}/${entry.id} consumes another theme owner`,
          );
          if (
            ["monday", "tuesday", "wednesday", "thursday"].includes(
              board.route.weekday,
            )
          ) {
            requireCondition(
              reviewedWord.themeHardReserve !== true,
              `${content.puzzleId}/${entry.id} consumes the Friday hard reserve early`,
            );
          }
        }
        const provenance = provenanceByEntryId.get(entry.id);
        requireCondition(
          provenance != null,
          `${content.puzzleId}/${entry.id} has no report provenance`,
        );
        const ledgerWord = ledgerByIndex.get(provenance.reviewLedgerIndex);
        requireCondition(
          ledgerWord === reviewedWord,
          `${content.puzzleId}/${entry.id} report ledger index mismatch`,
        );
        requireExact(
          provenance,
          {
            entryId: entry.id,
            answer: entry.answer,
            sourceEntryId: entry.sourceEntryId,
            reviewLedgerIndex: reviewedWord.reviewLedgerIndex,
            definitionChecksum: reviewedWord.definitionChecksum,
            clueSource: entry.clueSource,
            generatedBy: entry.generatedBy,
          },
          `${content.puzzleId}/${entry.id} report provenance join`,
        );
      }
    }
    for (const entry of content.entries) {
      requireCondition(
        licenseIds.has(entry.licenseId),
        `${content.puzzleId}/${entry.id} has an unresolved license`,
      );
      catalogSourceEntryIds.push(entry.sourceEntryId);
    }
  }
  requireUniqueStrings(catalogSourceEntryIds, "catalog sourceEntryId");
}

export function validateCatalogLaunchSelection(rawCatalog, selectedWords) {
  const selectedSourceEntryIds = new Set(
    selectedWords.map((word) => word.sourceEntryId),
  );
  requireCondition(
    selectedSourceEntryIds.size === selectedWords.length,
    "derived launch selection sourceEntryId values are not unique",
  );
  for (const board of rawCatalog.boards) {
    if (board.route.kind === "first-run") continue;
    for (const entry of board.content.entries) {
      requireCondition(
        selectedSourceEntryIds.has(entry.sourceEntryId),
        `${board.content.puzzleId}/${entry.id} is outside the independently derived launch selection`,
      );
    }
  }
  return true;
}

function entryCellKeys(entry) {
  const rowDelta = entry.direction === "down" ? 1 : 0;
  const columnDelta = entry.direction === "across" ? 1 : 0;
  return entry.answerCells.map(
    (_cell, index) =>
      `${entry.row + rowDelta * index},${entry.col + columnDelta * index}`,
  );
}

function runSignature(direction, row, col, cells) {
  return `${direction}:${row}:${col}:${cells.join("")}`;
}

function extractGridRunSignatures(grid) {
  const signatures = [];
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const isFilled = (row, col) =>
    row >= 0 &&
    row < height &&
    col >= 0 &&
    col < width &&
    typeof grid[row][col] === "string" &&
    grid[row][col] !== "";

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isFilled(row, col)) continue;
      if (!isFilled(row, col - 1)) {
        const cells = [];
        for (let cursor = col; isFilled(row, cursor); cursor += 1) {
          cells.push(grid[row][cursor]);
        }
        if (cells.length >= 2) {
          signatures.push(runSignature("across", row, col, cells));
        }
      }
      if (!isFilled(row - 1, col)) {
        const cells = [];
        for (let cursor = row; isFilled(cursor, col); cursor += 1) {
          cells.push(grid[cursor][col]);
        }
        if (cells.length >= 2) {
          signatures.push(runSignature("down", row, col, cells));
        }
      }
    }
  }
  return signatures.sort();
}

function countEntryComponents(entries, cellToEntryIndexes) {
  if (entries.length === 0) return 0;
  const graph = entries.map(() => new Set());
  for (const entryIndexes of cellToEntryIndexes.values()) {
    for (const leftIndex of entryIndexes) {
      for (const rightIndex of entryIndexes) {
        if (leftIndex !== rightIndex) graph[leftIndex].add(rightIndex);
      }
    }
  }
  const visited = new Set();
  let components = 0;
  for (let index = 0; index < graph.length; index += 1) {
    if (visited.has(index)) continue;
    components += 1;
    const pending = [index];
    while (pending.length > 0) {
      const current = pending.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of graph[current]) pending.push(neighbor);
    }
  }
  return components;
}

export function calculateContentQualityEvidence(content, route, config) {
  const profile = DIFFICULTY_PROFILES[content.difficulty];
  requireCondition(profile != null, "quality evidence difficulty is invalid");
  const filledCellKeys = [];
  for (const [row, cells] of content.grid.entries()) {
    for (const [col, cell] of cells.entries()) {
      if (cell !== "") filledCellKeys.push(`${row},${col}`);
    }
  }
  const cellToEntryIndexes = new Map();
  const cellDirections = new Map();
  for (const [entryIndex, entry] of content.entries.entries()) {
    for (const cellKey of entryCellKeys(entry)) {
      const entryIndexes = cellToEntryIndexes.get(cellKey) ?? [];
      entryIndexes.push(entryIndex);
      cellToEntryIndexes.set(cellKey, entryIndexes);
      const directions = cellDirections.get(cellKey) ?? new Set();
      directions.add(entry.direction);
      cellDirections.set(cellKey, directions);
    }
  }
  requireExact(
    [...cellToEntryIndexes.keys()].sort(),
    [...filledCellKeys].sort(),
    `${content.puzzleId} quality grid/entry occupied cells`,
  );
  const entryRunSignatures = content.entries
    .map((entry) =>
      runSignature(entry.direction, entry.row, entry.col, entry.answerCells),
    )
    .sort();
  const gridRunSignatures = extractGridRunSignatures(content.grid);
  requireExact(
    entryRunSignatures,
    gridRunSignatures,
    `${content.puzzleId} generated run inventory`,
  );

  const crossCellKeys = [...cellDirections.entries()]
    .filter(([, directions]) => directions.size > 1)
    .map(([cellKey]) => cellKey);
  const crossCellKeySet = new Set(crossCellKeys);
  const filledCells = filledCellKeys.length;
  const crossRatio =
    filledCells === 0
      ? 0
      : Number((crossCellKeys.length / filledCells).toFixed(3));
  const multiIntersectionPlacements = content.entries.filter(
    (entry) =>
      entryCellKeys(entry).filter((cellKey) => crossCellKeySet.has(cellKey))
        .length >= 2,
  ).length;
  const occupiedCoordinates = filledCellKeys.map((cellKey) =>
    cellKey.split(",").map(Number),
  );
  const bboxArea =
    occupiedCoordinates.length === 0
      ? 0
      : (Math.max(...occupiedCoordinates.map(([row]) => row)) -
          Math.min(...occupiedCoordinates.map(([row]) => row)) +
          1) *
        (Math.max(...occupiedCoordinates.map(([, col]) => col)) -
          Math.min(...occupiedCoordinates.map(([, col]) => col)) +
          1);
  const bboxDensity =
    bboxArea === 0 ? 0 : Number((filledCells / bboxArea).toFixed(3));
  const wordCount = content.entries.length;
  const autoRunCount = content.entries.filter(
    (entry) => entry.generatedBy === "auto",
  ).length;
  const autoRunRatio =
    wordCount === 0 ? 0 : Number((autoRunCount / wordCount).toFixed(3));
  const multiCrossRatio =
    wordCount === 0
      ? 0
      : Number((multiIntersectionPlacements / wordCount).toFixed(3));
  const clueConflicts = findBoardClueQualityConflicts(content.entries);
  const crossAnswerClueLeakCount = clueConflicts.filter(
    (conflict) => conflict.type === "clue_contains_other_answer",
  ).length;
  const answerContainmentCount = clueConflicts.filter(
    (conflict) => conflict.type === "answer_contains_answer",
  ).length;
  const thresholds = {
    minWordCount: profile.minWordCount,
    minCrossRatio: profile.minCrossRatio,
    minBboxDensity: profile.minBboxDensity,
    minMultiCrossRatio: config.minMultiCrossRatio,
    maxAutoRunRatio: config.maxAutoRunRatio,
    maxCrossAnswerClueLeakCount:
      config.clueQuality.sameBoardConflicts.maxCrossAnswerClueLeakCount,
    maxAnswerContainmentCount:
      config.clueQuality.sameBoardConflicts.maxAnswerContainmentCount,
  };
  const checks = [
    ["minWordCount", wordCount, thresholds.minWordCount, ">="],
    ["minCrossRatio", crossRatio, thresholds.minCrossRatio, ">="],
    ["minBboxDensity", bboxDensity, thresholds.minBboxDensity, ">="],
    [
      "minMultiCrossRatio",
      multiCrossRatio,
      thresholds.minMultiCrossRatio,
      ">=",
    ],
    ["maxAutoRunRatio", autoRunRatio, thresholds.maxAutoRunRatio, "<="],
    [
      "maxCrossAnswerClueLeakCount",
      crossAnswerClueLeakCount,
      thresholds.maxCrossAnswerClueLeakCount,
      "<=",
    ],
    [
      "maxAnswerContainmentCount",
      answerContainmentCount,
      thresholds.maxAnswerContainmentCount,
      "<=",
    ],
  ].map(([key, actual, expected, operator]) => ({
    key,
    actual,
    expected,
    operator,
    pass: operator === ">=" ? actual >= expected : actual <= expected,
  }));
  let quality = {
    pass: checks.every((check) => check.pass),
    checks,
    ratios: { autoRunRatio, multiCrossRatio },
    thresholds,
    clueConflicts: {
      crossAnswerClueLeakCount,
      answerContainmentCount,
    },
  };
  if (route.kind === "daily") {
    const themedEntryCount = content.entries.filter((entry) =>
      entry.domainTags.includes(content.themeId),
    ).length;
    const themeEntryRatio =
      wordCount === 0 ? 0 : Number((themedEntryCount / wordCount).toFixed(3));
    const themeCheck = {
      key: "minDailyThemeEntryRatio",
      actual: themeEntryRatio,
      expected: config.minDailyThemeEntryRatio,
      operator: ">=",
      pass: themeEntryRatio >= config.minDailyThemeEntryRatio,
    };
    quality = {
      ...quality,
      pass: quality.pass && themeCheck.pass,
      checks: [...quality.checks, themeCheck],
      ratios: { ...quality.ratios, themeEntryRatio },
      thresholds: {
        ...quality.thresholds,
        minDailyThemeEntryRatio: config.minDailyThemeEntryRatio,
      },
    };
  }
  return {
    metrics: {
      wordCount,
      autoRunCount,
      crossRatio,
      bboxDensity,
      multiIntersectionPlacements,
      connectedComponents: countEntryComponents(
        content.entries,
        cellToEntryIndexes,
      ),
      accidentalRunCount: 0,
      crossAnswerClueLeakCount,
      answerContainmentCount,
    },
    quality,
  };
}

export function validateReportedQualityEvidence(
  content,
  route,
  reportBoard,
  config,
) {
  const evidence = calculateContentQualityEvidence(content, route, config);
  requireExact(
    reportBoard.metrics,
    evidence.metrics,
    `${content.puzzleId} independently derived metrics`,
  );
  requireExact(
    reportBoard.quality,
    evidence.quality,
    `${content.puzzleId} independently derived quality checks`,
  );
  requireCondition(
    evidence.metrics.connectedComponents === 1 && evidence.quality.pass,
    `${content.puzzleId} independently derived quality gate failed`,
  );
  return evidence;
}

export function calculateLaunchRetrySeed(baseSeed, puzzleId, retryIndex) {
  requirePositiveSafeInteger(baseSeed, "generator baseSeed", {
    allowZero: true,
  });
  requireNonEmptyString(puzzleId, "generator puzzleId");
  requirePositiveSafeInteger(retryIndex, "generator retryIndex", {
    allowZero: true,
  });
  return createHash("sha256")
    .update(`${baseSeed}:${puzzleId}:retry:${retryIndex}`, "utf8")
    .digest()
    .readUInt32BE(0);
}

function generatorSearchOptions(config) {
  const options = {
    attempts: requirePositiveSafeInteger(
      config.attempts,
      "generator config attempts",
    ),
    beamWidth: requirePositiveSafeInteger(
      config.beamWidth,
      "generator config beamWidth",
    ),
    branchLimit: requirePositiveSafeInteger(
      config.branchLimit,
      "generator config branchLimit",
    ),
    candidateWordLimit: requirePositiveSafeInteger(
      config.candidateWordLimit,
      "generator config candidateWordLimit",
    ),
    denseCandidateLimit: requirePositiveSafeInteger(
      config.denseCandidateLimit,
      "generator config denseCandidateLimit",
    ),
    samples: requirePositiveSafeInteger(
      config.samples,
      "generator config samples",
    ),
  };
  const retries = requirePositiveSafeInteger(
    config.retries,
    "generator config retries",
  );
  return {
    options,
    retries,
    escalation: Array.from({ length: retries }, (_, retryIndex) =>
      searchOptionsForRetry(options, retryIndex),
    ),
  };
}

const CANDIDATE_METRIC_KEYS = Object.freeze([
  "accidentalRunCount",
  "answerContainmentCount",
  "autoRunCount",
  "bboxDensity",
  "connectedComponents",
  "crossAnswerClueLeakCount",
  "crossRatio",
  "multiIntersectionPlacements",
  "wordCount",
]);
const CANDIDATE_SELECTION_SCORE_KEYS = Object.freeze([
  "cooldownAnswerCount",
  "isolatedThemeOwnerCount",
  "themeConnectorSharedCellEdges",
  "totalSharedCellEdges",
]);

function roundedRatio(numerator, denominator) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(3));
}

function requireUnitRatio(value, field) {
  requireCondition(
    Number.isFinite(value) && value >= 0 && value <= 1,
    `${field} must be a finite ratio`,
  );
  return value;
}

function validateCandidateSelectionScore(candidate, field) {
  requireCondition(
    candidate.selectionScore != null &&
      typeof candidate.selectionScore === "object" &&
      !Array.isArray(candidate.selectionScore),
    `${field}.selectionScore must be an object`,
  );
  requireExact(
    Object.keys(candidate.selectionScore).sort(),
    CANDIDATE_SELECTION_SCORE_KEYS,
    `${field}.selectionScore keys`,
  );
  const selectionScore = Object.fromEntries(
    CANDIDATE_SELECTION_SCORE_KEYS.map((key) => [
      key,
      requirePositiveSafeInteger(
        candidate.selectionScore[key],
        `${field}.selectionScore.${key}`,
        { allowZero: true },
      ),
    ]),
  );
  requireCondition(
    selectionScore.cooldownAnswerCount === candidate.answers.length,
    `${field}.selectionScore.cooldownAnswerCount must match candidate answers`,
  );
  return selectionScore;
}

function validateCandidateTraceQuality(candidate, route, config, field) {
  requireCondition(
    candidate.metrics != null &&
      typeof candidate.metrics === "object" &&
      !Array.isArray(candidate.metrics),
    `${field}.metrics must be an object`,
  );
  requireExact(
    Object.keys(candidate.metrics).sort(),
    CANDIDATE_METRIC_KEYS,
    `${field}.metrics keys`,
  );
  const metrics = candidate.metrics;
  for (const key of [
    "wordCount",
    "autoRunCount",
    "multiIntersectionPlacements",
    "connectedComponents",
    "accidentalRunCount",
    "crossAnswerClueLeakCount",
    "answerContainmentCount",
  ]) {
    requirePositiveSafeInteger(metrics[key], `${field}.metrics.${key}`, {
      allowZero: true,
    });
  }
  requireUnitRatio(metrics.crossRatio, `${field}.metrics.crossRatio`);
  requireUnitRatio(metrics.bboxDensity, `${field}.metrics.bboxDensity`);
  requireCondition(
    metrics.connectedComponents === 1 && metrics.accidentalRunCount === 0,
    `${field}.metrics does not satisfy generator candidate admission`,
  );
  requireCondition(
    Array.isArray(candidate.answers),
    `${field}.answers must be an array`,
  );
  requireUniqueStrings(candidate.answers, `${field}.answers`);
  requireExact(
    candidate.answers,
    [...candidate.answers].sort(),
    `${field}.answers canonical order`,
  );
  requireCondition(
    candidate.answers.length === metrics.wordCount,
    `${field}.answers length must match metrics.wordCount`,
  );

  const profile = DIFFICULTY_PROFILES[route.difficulty];
  requireCondition(profile != null, `${field} difficulty is invalid`);
  const expectedRatios = {
    autoRunRatio: roundedRatio(metrics.autoRunCount, metrics.wordCount),
    multiCrossRatio: roundedRatio(
      metrics.multiIntersectionPlacements,
      metrics.wordCount,
    ),
  };
  const checks = [
    ["minWordCount", metrics.wordCount, profile.minWordCount, ">="],
    ["minCrossRatio", metrics.crossRatio, profile.minCrossRatio, ">="],
    ["minBboxDensity", metrics.bboxDensity, profile.minBboxDensity, ">="],
    [
      "minMultiCrossRatio",
      expectedRatios.multiCrossRatio,
      config.minMultiCrossRatio,
      ">=",
    ],
    [
      "maxAutoRunRatio",
      expectedRatios.autoRunRatio,
      config.maxAutoRunRatio,
      "<=",
    ],
    [
      "maxCrossAnswerClueLeakCount",
      metrics.crossAnswerClueLeakCount,
      config.clueQuality.sameBoardConflicts.maxCrossAnswerClueLeakCount,
      "<=",
    ],
    [
      "maxAnswerContainmentCount",
      metrics.answerContainmentCount,
      config.clueQuality.sameBoardConflicts.maxAnswerContainmentCount,
      "<=",
    ],
  ];
  if (route.route.kind === "daily") {
    const themeEntryCount = requirePositiveSafeInteger(
      candidate.themeEntryCount,
      `${field}.themeEntryCount`,
      { allowZero: true },
    );
    requireCondition(
      themeEntryCount <= candidate.answers.length,
      `${field}.themeEntryCount exceeds candidate answers`,
    );
    expectedRatios.themeEntryRatio = roundedRatio(
      themeEntryCount,
      candidate.answers.length,
    );
    checks.push([
      "minDailyThemeEntryRatio",
      expectedRatios.themeEntryRatio,
      config.minDailyThemeEntryRatio,
      ">=",
    ]);
  } else {
    requireCondition(
      candidate.themeEntryCount === null,
      `${field}.themeEntryCount must be null outside daily routes`,
    );
  }
  requireExact(candidate.ratios, expectedRatios, `${field}.ratios`);
  const expectedFailedChecks = checks
    .filter(([, actual, expected, operator]) =>
      operator === ">=" ? actual < expected : actual > expected,
    )
    .map(([key]) => key);
  requireExact(
    candidate.failedChecks,
    expectedFailedChecks,
    `${field}.failedChecks`,
  );
  requireCondition(
    candidate.pass === (expectedFailedChecks.length === 0),
    `${field}.pass does not match independently derived quality`,
  );
  return validateCandidateSelectionScore(candidate, field);
}

function compareReportedSelectionScores(left, right, nextRoute) {
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

export function validateGeneratorReportTrace(
  config,
  reportBoards,
  { reviewedWords = null, initialUsedAnswers = [] } = {},
) {
  requireCondition(
    config != null && typeof config === "object" && !Array.isArray(config),
    "generator config is required for report trace validation",
  );
  requireCondition(
    config.schemaVersion === "ko-kr-launch-generator-config/5",
    "generator report trace config schema must be ko-kr-launch-generator-config/5",
  );
  requireCondition(
    Array.isArray(reportBoards),
    "generator report boards must be an array",
  );
  const expectedRoutePlan = buildLaunchRoutePlan();
  const generationQueue = orderRoutesForGeneration(expectedRoutePlan);
  const generationIndexByPuzzleId = new Map(
    generationQueue.map((route, index) => [route.puzzleId, index]),
  );
  const shouldRecalculateSelectionScores = reviewedWords != null;
  if (shouldRecalculateSelectionScores) {
    requireCondition(
      Array.isArray(reviewedWords),
      "reviewedWords must be an array for candidate score validation",
    );
    requireCondition(
      Array.isArray(initialUsedAnswers),
      "initialUsedAnswers must be an array for candidate score validation",
    );
    requireUniqueStrings(initialUsedAnswers, "initialUsedAnswers");
    requireExact(
      reportBoards.map((board) => board.puzzleId),
      generationQueue.map((route) => route.puzzleId),
      "generator report board generation order",
    );
  }
  const usedAnswers = new Set(initialUsedAnswers);
  requireExact(
    config.acceptedCandidateSelection,
    LAUNCH_ACCEPTED_CANDIDATE_POLICY,
    "generator config acceptedCandidateSelection",
  );
  const acceptedLookaheadRetries = requirePositiveSafeInteger(
    config.acceptedCandidateSelection.acceptedLookaheadRetries,
    "generator config acceptedLookaheadRetries",
    { allowZero: true },
  );
  requireExact(
    config.routePlan,
    expectedRoutePlan,
    "generator config routePlan",
  );
  const { options, retries, escalation } = generatorSearchOptions(config);
  requireCondition(
    retries === LAUNCH_ACCEPTED_CANDIDATE_POLICY.defaultRetries,
    "generator config retries must match the launch candidate policy default",
  );
  requireExact(
    config.searchEscalation,
    escalation,
    "generator config searchEscalation",
  );
  const routeByPuzzleId = new Map(
    expectedRoutePlan.map((route) => [route.puzzleId, route]),
  );
  const baseSeed = requirePositiveSafeInteger(
    config.baseSeed,
    "generator config baseSeed",
    { allowZero: true },
  );

  for (const [boardIndex, reportBoard] of reportBoards.entries()) {
    const field = `generator report board ${boardIndex}/${reportBoard?.puzzleId ?? "unknown"}`;
    const plannedRoute = routeByPuzzleId.get(reportBoard?.puzzleId);
    requireCondition(plannedRoute != null, `${field} is not in routePlan`);
    const generationIndex = generationIndexByPuzzleId.get(
      plannedRoute.puzzleId,
    );
    requireCondition(
      generationIndex != null,
      `${field} is not in the generation queue`,
    );
    const nextRoute = generationQueue[generationIndex + 1] ?? null;
    requireCondition(
      canonicalJson(reportBoard.route) === canonicalJson(plannedRoute.route) &&
        reportBoard.difficulty === plannedRoute.difficulty &&
        reportBoard.themeId === plannedRoute.themeId,
      `${field} route identity does not match routePlan`,
    );
    const selectedRetryIndex = requirePositiveSafeInteger(
      reportBoard.selectedRetryIndex,
      `${field}.selectedRetryIndex`,
      { allowZero: true },
    );
    requireCondition(
      selectedRetryIndex < retries,
      `${field}.selectedRetryIndex exceeds configured retries`,
    );
    requireCondition(
      Array.isArray(reportBoard.attempts) &&
        reportBoard.attempts.length > 0 &&
        reportBoard.attempts.length <= retries,
      `${field}.attempts length is invalid`,
    );

    const currentSelection = shouldRecalculateSelectionScores
      ? filterAvailableWords(reviewedWords, plannedRoute, usedAnswers)
      : null;
    const currentAvailableWordByAnswer =
      currentSelection == null
        ? null
        : new Map(currentSelection.words.map((word) => [word.answer, word]));
    if (currentSelection != null) {
      requireExact(
        reportBoard.wordPool,
        {
          total: currentSelection.words.length,
          theme: currentSelection.themeWordCount ?? null,
          connectors: currentSelection.connectorWordCount ?? null,
        },
        `${field}.wordPool independently recalculated`,
      );
    }
    let firstPassRetryIndex = null;
    let policyWinner = null;
    for (const [retryIndex, attempt] of reportBoard.attempts.entries()) {
      requireCondition(
        attempt?.retryIndex === retryIndex,
        `${field}.attempts retryIndex must be sequential`,
      );
      const expectedSearchOptions = searchOptionsForRetry(options, retryIndex);
      requireExact(
        attempt.searchOptions,
        expectedSearchOptions,
        `${field}.attempts[${retryIndex}].searchOptions`,
      );
      const expectedSeed = calculateLaunchRetrySeed(
        baseSeed,
        reportBoard.puzzleId,
        retryIndex,
      );
      requireCondition(
        attempt.seed === expectedSeed,
        `${field}.attempts[${retryIndex}].seed mismatch`,
      );
      requireCondition(
        Array.isArray(attempt.candidates) &&
          attempt.candidateCount === attempt.candidates.length,
        `${field}.attempts[${retryIndex}].candidateCount mismatch`,
      );
      requireCondition(
        attempt.candidates.every(
          (candidate, candidateIndex) =>
            candidate?.candidateIndex === candidateIndex &&
            typeof candidate.pass === "boolean",
        ),
        `${field}.attempts[${retryIndex}] candidate indexes/pass flags are invalid`,
      );
      for (const [candidateIndex, candidate] of attempt.candidates.entries()) {
        const candidateField = `${field}.attempts[${retryIndex}].candidates[${candidateIndex}]`;
        const selectionScore = validateCandidateTraceQuality(
          candidate,
          plannedRoute,
          config,
          candidateField,
        );
        if (shouldRecalculateSelectionScores) {
          requireCondition(
            candidate.answers.every((answer) =>
              currentAvailableWordByAnswer.has(answer),
            ),
            `${candidateField}.answers contain a word outside the current route pool`,
          );
          if (plannedRoute.route.kind === "daily") {
            const expectedThemeEntryCount = candidate.answers.filter(
              (answer) =>
                currentAvailableWordByAnswer.get(answer)?.themeOwner ===
                plannedRoute.themeId,
            ).length;
            requireCondition(
              candidate.themeEntryCount === expectedThemeEntryCount,
              `${candidateField}.themeEntryCount does not match current route ownership`,
            );
          }
        }
        if (shouldRecalculateSelectionScores && candidate.pass) {
          const futureUsedAnswers = new Set(usedAnswers);
          for (const answer of candidate.answers) {
            futureUsedAnswers.add(answer);
          }
          const connectivity =
            nextRoute == null
              ? {
                  totalSharedCellEdges: 0,
                  themeConnectorSharedCellEdges: 0,
                  isolatedThemeOwnerCount: 0,
                }
              : summarizeFuturePoolConnectivity(
                  filterAvailableWords(
                    reviewedWords,
                    nextRoute,
                    futureUsedAnswers,
                  ).words,
                  nextRoute,
                );
          requireExact(
            candidate.selectionScore,
            {
              ...connectivity,
              cooldownAnswerCount: candidate.answers.length,
            },
            `${candidateField}.selectionScore independently recalculated`,
          );
        }
        if (
          candidate.pass &&
          (policyWinner == null ||
            compareReportedSelectionScores(
              selectionScore,
              policyWinner.selectionScore,
              nextRoute,
            ) < 0)
        ) {
          policyWinner = {
            retryIndex,
            candidateIndex,
            candidate,
            selectionScore,
          };
        }
      }
      if (
        firstPassRetryIndex == null &&
        attempt.candidates.some((candidate) => candidate.pass)
      ) {
        firstPassRetryIndex = retryIndex;
      }
    }

    requireCondition(
      firstPassRetryIndex != null,
      `${field}.attempts contain no passing candidate`,
    );
    requireCondition(
      policyWinner != null,
      `${field}.attempts contain no policy candidate`,
    );
    const expectedAttemptCount = Math.min(
      firstPassRetryIndex + acceptedLookaheadRetries + 1,
      retries,
    );
    requireCondition(
      reportBoard.attempts.length === expectedAttemptCount,
      `${field}.attempts must end after the configured PASS lookahead`,
    );
    requireCondition(
      selectedRetryIndex >= firstPassRetryIndex &&
        selectedRetryIndex < reportBoard.attempts.length,
      `${field}.selectedRetryIndex is outside the accepted candidate window`,
    );

    const selectedAttempt = reportBoard.attempts[selectedRetryIndex];
    const selectedCandidateIndex = requirePositiveSafeInteger(
      reportBoard.selectedCandidateIndex,
      `${field}.selectedCandidateIndex`,
      { allowZero: true },
    );
    const selectedCandidate =
      selectedAttempt.candidates[selectedCandidateIndex];
    requireCondition(
      selectedCandidate?.candidateIndex === selectedCandidateIndex &&
        selectedCandidate.pass === true,
      `${field} selected candidate is not a passing trace candidate`,
    );
    requireCondition(
      policyWinner.retryIndex === selectedRetryIndex &&
        policyWinner.candidateIndex === selectedCandidateIndex,
      `${field} selected candidate is not the policy winner`,
    );
    requireExact(
      selectedCandidate.metrics,
      reportBoard.metrics,
      `${field} selected candidate metrics`,
    );
    requireExact(
      selectedCandidate.ratios,
      reportBoard.quality?.ratios,
      `${field} selected candidate ratios`,
    );
    const expectedSelectedSeed = calculateLaunchRetrySeed(
      baseSeed,
      reportBoard.puzzleId,
      selectedRetryIndex,
    );
    requireCondition(
      reportBoard.selectedSeed === expectedSelectedSeed &&
        reportBoard.selectedSeed === selectedAttempt.seed,
      `${field}.selectedSeed mismatch`,
    );
    if (shouldRecalculateSelectionScores) {
      for (const answer of selectedCandidate.answers) usedAnswers.add(answer);
    }
  }

  return { routePlan: expectedRoutePlan, searchEscalation: escalation };
}

function validateReportCatalogJoin(rawCatalog, report) {
  requireCandidateFlags(report, "generation report");
  requireCondition(
    report.schemaVersion === "ko-kr-launch-generation-report/4" &&
      report.catalogId === rawCatalog.catalogId &&
      report.generatedAt === rawCatalog.generatedAt &&
      Array.isArray(report.boards) &&
      report.boards.length === EXPECTED_GENERATED_BOARDS,
    `generation report must contain ${EXPECTED_GENERATED_BOARDS} boards`,
  );
  requireUniqueStrings(
    report.boards.map((board) => board.puzzleId),
    "generation report puzzleId",
  );
  const generatedCatalogBoards = rawCatalog.boards.filter(
    (board) => board.route.kind !== "first-run",
  );
  const catalogByPuzzleId = new Map(
    generatedCatalogBoards.map((board) => [board.content.puzzleId, board]),
  );
  requireCondition(
    generatedCatalogBoards.length === EXPECTED_GENERATED_BOARDS &&
      catalogByPuzzleId.size === EXPECTED_GENERATED_BOARDS,
    "catalog generated board set mismatch",
  );
  for (const [index, reportBoard] of report.boards.entries()) {
    const catalogBoard = catalogByPuzzleId.get(reportBoard.puzzleId);
    requireCondition(
      catalogBoard != null,
      `report board ${reportBoard.puzzleId} is not in the catalog`,
    );
    const content = catalogBoard.content;
    const selectedCandidate =
      reportBoard.attempts?.[reportBoard.selectedRetryIndex]?.candidates?.[
        reportBoard.selectedCandidateIndex
      ];
    requireCondition(
      selectedCandidate != null,
      `report selected candidate is missing for board ${index}/${content.puzzleId}`,
    );
    requireExact(
      selectedCandidate.answers,
      content.entries.map((entry) => entry.answer).sort(),
      `${content.puzzleId} selected candidate/content answers`,
    );
    const artifactPath = expectedArtifactPath(content);
    requireCondition(
      reportBoard.packId === content.packId &&
        reportBoard.contentChecksum === content.contentChecksum &&
        reportBoard.artifactPath === artifactPath &&
        reportBoard.generatorCommit === content.generatorCommit &&
        reportBoard.generatorConfigHash === content.generatorConfigHash &&
        reportBoard.generatorCommit === report.generator?.commit &&
        reportBoard.generatorConfigHash === report.generator?.configHash &&
        canonicalJson(reportBoard.route) ===
          canonicalJson(catalogBoard.route) &&
        reportBoard.difficulty === content.difficulty &&
        reportBoard.themeId === content.themeId &&
        reportBoard.accepted === true &&
        reportBoard.quality?.pass === true,
      `report/catalog join mismatch for board ${index}/${content.puzzleId}`,
    );
    validateReportedQualityEvidence(
      content,
      catalogBoard.route,
      reportBoard,
      report.generator.config,
    );
  }
  requireCondition(
    report.firstRunBoardCount === 3 &&
      report.generatedBoardCount === EXPECTED_GENERATED_BOARDS &&
      report.totalBoardCount === EXPECTED_TOTAL_BOARDS &&
      report.catalogValidationPass === true &&
      report.worldMapValidationPass === true,
    "generation report aggregate counts/gates mismatch",
  );
}

async function validateGeneratorIdentity(
  repositoryRoot,
  report,
  wordbankArtifact,
) {
  const generator = report.generator;
  requireCondition(
    /^[0-9a-f]{40}$/.test(generator?.commit ?? "") &&
      /^sha256:[0-9a-f]{64}$/.test(generator?.configHash ?? "") &&
      generator.config != null,
    "generation report generator identity is invalid",
  );
  requireCondition(
    generator.configHash === sha256(canonicalJson(generator.config)),
    "generator configHash mismatch",
  );
  requireExact(
    generator.config.difficultyProfiles,
    DIFFICULTY_PROFILES,
    "generator difficulty profiles",
  );
  validateGeneratorThemeInventoryPolicy(generator.config);
  validateGeneratorClueQualityPolicy(generator.config);
  requireCondition(
    generator.config.maxAutoRunRatio === 0.5 &&
      generator.config.minMultiCrossRatio === 0.65 &&
      generator.config.minDailyThemeEntryRatio === 0.5,
    "generator quality threshold policy drifted",
  );
  const dependencies = generator.config.dependencies;
  requireCondition(
    Array.isArray(dependencies) && dependencies.length > 0,
    "generator dependency lock is missing",
  );
  requireUniqueStrings(
    dependencies.map((dependency) => dependency.path),
    "generator dependency path",
  );
  requireExact(
    dependencies.map((dependency) => dependency.path),
    EXPECTED_GENERATOR_DEPENDENCY_PATHS,
    "generator dependency path set/order",
  );
  requireCondition(
    generator.config.dependencyTreeSha256 ===
      sha256(canonicalJson(dependencies)),
    "generator dependency tree hash mismatch",
  );
  for (const dependency of dependencies) {
    const absolutePath = resolveRepositoryPath(
      repositoryRoot,
      dependency.path,
      "generator dependency path",
    );
    const currentBuffer = await readFile(absolutePath);
    requireCondition(
      dependency.sha256 === sha256(currentBuffer),
      `generator dependency drifted in worktree: ${dependency.path}`,
    );
    let committedText;
    try {
      ({ stdout: committedText } = await execFileAsync(
        "git",
        ["show", `${generator.commit}:${dependency.path}`],
        {
          cwd: repositoryRoot,
          encoding: "buffer",
          maxBuffer: 32 * 1024 * 1024,
        },
      ));
    } catch (error) {
      throw new Error(
        `generator dependency is not pinned by commit ${generator.commit}: ${dependency.path} (${error.message})`,
      );
    }
    requireCondition(
      dependency.sha256 === sha256(committedText),
      `generator dependency differs from generator commit: ${dependency.path}`,
    );
  }
  const generatorScriptDependency = dependencies.find(
    (dependency) =>
      dependency.path === "scripts/build-ko-kr-launch-content.mjs",
  );
  requireCondition(
    generatorScriptDependency?.sha256 === generator.config.scriptSha256,
    "generator script hash does not match dependency lock",
  );
  requireCondition(
    generator.config.wordBankSha256 === wordbankArtifact.rawSha256,
    "generator wordbank lock mismatch",
  );
  const derivedWordBank = validateLaunchWordBankReport(
    report.wordBank,
    wordbankArtifact.document,
    [...loadBundledFirstRunGameContents()],
    wordbankArtifact.rawSha256,
  );
  requireCondition(
    Object.values(derivedWordBank.themeInventory).every(
      (inventory) =>
        inventory.owned >=
          LAUNCH_THEME_OWNER_POLICY.productionTargetDistinctOwnerCountPerTheme &&
        inventory.hardReserve ===
          LAUNCH_THEME_OWNER_POLICY.productionTargetNormalOrHardReservePerTheme,
    ),
    "derived launch wordbank theme inventory is insufficient",
  );
  validateGeneratorReportTrace(generator.config, report.boards, {
    reviewedWords: derivedWordBank.selectedWords,
    initialUsedAnswers: loadBundledFirstRunGameContents().flatMap((content) =>
      content.entries.map((entry) => entry.answer),
    ),
  });
  requireExact(
    [...generator.config.routePlan.map((route) => route.puzzleId)].sort(),
    [...report.boards.map((board) => board.puzzleId)].sort(),
    "generator route plan/report board set",
  );
  return derivedWordBank.selectedWords;
}

function validateLicensePublication(
  dataManifest,
  publicManifest,
  report,
  rawCatalog,
  packIndex,
) {
  requireExact(
    publicManifest,
    dataManifest,
    "public/data license manifest canonical content",
  );
  const manifestChecksum = calculateCanonicalDocumentChecksum(dataManifest);
  requireExact(
    report.licenseManifest,
    {
      sourcePath: "data/game-content/v1/ko-KR/license-manifest.json",
      publishedCandidatePath: "/game-content/v1/ko-KR/license-manifest.json",
      manifestId: LICENSE_MANIFEST_ID,
      checksum: manifestChecksum,
    },
    "generation report license manifest checksum",
  );
  for (const board of rawCatalog.boards) {
    requireCondition(
      board.content.licenseManifestChecksum === manifestChecksum,
      `content ${board.content.puzzleId} licenseManifestChecksum mismatch`,
    );
  }
  const optionalChecksumOwners = [
    [rawCatalog, "catalog"],
    [report, "generation report"],
    [packIndex, "pack index"],
  ];
  for (const [owner, field] of optionalChecksumOwners) {
    if (Object.hasOwn(owner, "licenseManifestChecksum")) {
      requireCondition(
        owner.licenseManifestChecksum === manifestChecksum,
        `${field} licenseManifestChecksum mismatch`,
      );
    }
  }
  return manifestChecksum;
}

async function listPackArtifactPaths(publicRoot) {
  const packsRoot = path.join(publicRoot, "packs");
  const paths = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else {
        requireCondition(
          entry.isFile() && entry.name.endsWith(".json"),
          `immutable pack tree contains a non-JSON file or link: ${absolutePath}`,
        );
        const relativePath = path
          .relative(publicRoot, absolutePath)
          .split(path.sep)
          .join("/");
        paths.push(`${PUBLIC_ARTIFACT_PREFIX}/${relativePath}`);
      }
    }
  }
  await walk(packsRoot);
  return paths.sort();
}

async function validateImmutablePacks(publicRoot, rawCatalog, packIndex) {
  requireCandidateFlags(packIndex, "candidate pack index");
  requireCondition(
    packIndex.schemaVersion === "game-content-candidate-pack-index/1" &&
      packIndex.catalogId === rawCatalog.catalogId &&
      packIndex.generatedAt === rawCatalog.generatedAt &&
      Array.isArray(packIndex.packs) &&
      packIndex.packs.length === EXPECTED_TOTAL_BOARDS,
    "candidate pack index identity/count mismatch",
  );
  const expectedIndex = rawCatalog.boards.map((board, index) => {
    const content = board.content;
    const artifactPath = expectedArtifactPath(content);
    requireCondition(
      board.artifactPath === artifactPath,
      `catalog raw artifactPath mismatch at board ${index}/${content.puzzleId}`,
    );
    return {
      puzzleId: content.puzzleId,
      packId: content.packId,
      contentChecksum: content.contentChecksum,
      path: artifactPath,
    };
  });
  requireExact(packIndex.packs, expectedIndex, "candidate pack index rows");
  requireUniqueStrings(
    packIndex.packs.map((item) => item.path),
    "candidate pack index path",
  );

  const expectedPaths = expectedIndex.map((item) => item.path).sort();
  const actualPaths = await listPackArtifactPaths(publicRoot);
  requireCondition(
    actualPaths.length === EXPECTED_TOTAL_BOARDS,
    `immutable pack tree must contain exactly ${EXPECTED_TOTAL_BOARDS} JSON files`,
  );
  requireExact(actualPaths, expectedPaths, "immutable pack file set");

  for (const [index, board] of rawCatalog.boards.entries()) {
    const immutablePath = resolvePublicArtifactPath(
      publicRoot,
      board.artifactPath,
    );
    const immutableArtifact = await readArtifact(immutablePath);
    requireExact(
      immutableArtifact.document,
      board.content,
      `immutable pack/catalog content ${index}/${board.content.puzzleId}`,
    );
    requireCondition(
      verifyGameContentChecksum(immutableArtifact.document),
      `immutable pack checksum invalid: ${board.content.puzzleId}`,
    );
  }
}

export function validateGlobalInventory(rawCatalog, report) {
  const answerOwner = new Map();
  const entries = [];
  for (const board of rawCatalog.boards) {
    for (const entry of board.content.entries) {
      const previousOwner = answerOwner.get(entry.answer);
      requireCondition(
        previousOwner == null,
        `launch inventory reuses answer ${entry.answer}: ${previousOwner} and ${board.content.puzzleId}`,
      );
      answerOwner.set(entry.answer, board.content.puzzleId);
      requireCondition(
        normalizeClueForSimilarity(entry.clue) !== "",
        `${board.content.puzzleId}/${entry.id} has an empty clue family`,
      );
      const exposedFragment = findKoKrAnswerFragmentExposure(
        entry.answer,
        entry.clue,
      );
      requireCondition(
        exposedFragment == null,
        `${board.content.puzzleId}/${entry.answer} exposes answer fragment ${exposedFragment}`,
      );
      entries.push({ puzzleId: board.content.puzzleId, entry });
    }
    const boardConflicts = findBoardClueQualityConflicts(board.content.entries);
    requireCondition(
      boardConflicts.length === 0,
      `${board.content.puzzleId} has same-board clue conflicts: ${boardConflicts
        .map(
          (conflict) =>
            `${conflict.type}:${conflict.answer}/${conflict.otherAnswer}`,
        )
        .join(",")}`,
    );
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
        `launch clue family collision: ${left.puzzleId}/${left.entry.answer} and ${right.puzzleId}/${right.entry.answer}`,
      );
    }
  }
  const inventory = {
    uniqueAnswerCount: answerOwner.size,
    clueCount: entries.length,
  };
  requireCondition(
    report.cooldownAudit?.policyId ===
      "launch-global-unique-answer-and-clue-family-v2" &&
      report.cooldownAudit?.enforcedScope === "all-93-launch-boards-global" &&
      report.cooldownAudit?.uniqueAnswerCount === inventory.uniqueAnswerCount &&
      report.cooldownAudit?.uniqueNormalizedClueFamilyCount ===
        inventory.clueCount &&
      report.cooldownAudit?.pass === true,
    "generation report cooldown audit does not match the catalog inventory",
  );
  return inventory;
}

function routeCounts(rawCatalog) {
  return rawCatalog.boards.reduce(
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

async function snapshotOptionalFile(filePath) {
  try {
    return sha256(await readFile(filePath));
  } catch (error) {
    if (error?.code === "ENOENT") return "absent";
    throw error;
  }
}

export async function snapshotCommittedCurrentPointer(repositoryRoot, commit) {
  requireCondition(
    /^[0-9a-f]{40}$/.test(commit ?? ""),
    "current pointer baseline commit must be a 40-character Git SHA",
  );
  try {
    await execFileAsync("git", ["cat-file", "-e", `${commit}^{commit}`], {
      cwd: repositoryRoot,
    });
  } catch (error) {
    throw new Error(
      `current pointer baseline commit is unavailable: ${commit} (${error.message})`,
    );
  }
  const relativePath = "public/game-content/v1/ko-KR/current.json";
  const objectName = `${commit}:${relativePath}`;
  try {
    await execFileAsync("git", ["cat-file", "-e", objectName], {
      cwd: repositoryRoot,
    });
  } catch {
    return "absent";
  }
  let committedBuffer;
  try {
    ({ stdout: committedBuffer } = await execFileAsync(
      "git",
      ["cat-file", "blob", objectName],
      {
        cwd: repositoryRoot,
        encoding: "buffer",
        maxBuffer: 4 * 1024 * 1024,
      },
    ));
  } catch (error) {
    throw new Error(
      `committed current pointer is not a readable blob: ${objectName} (${error.message})`,
    );
  }
  return sha256(committedBuffer);
}

export async function validateCurrentPointer(
  repositoryRoot,
  publicRoot,
  report,
) {
  const pointer = report.currentPointer;
  requireCondition(
    pointer?.path === "/game-content/v1/ko-KR/current.json" &&
      pointer.beforeSha256 === pointer.afterSha256 &&
      pointer.unchanged === true &&
      (pointer.afterSha256 === "absent" ||
        /^sha256:[0-9a-f]{64}$/.test(pointer.afterSha256)),
    "generation report current pointer before/after evidence is invalid",
  );
  const committedBaseline = await snapshotCommittedCurrentPointer(
    repositoryRoot,
    report.generator?.commit,
  );
  requireCondition(
    pointer.beforeSha256 === committedBaseline,
    "generation report current pointer before state differs from generator commit",
  );
  const liveState = await snapshotOptionalFile(
    path.join(publicRoot, "current.json"),
  );
  requireCondition(
    liveState === pointer.afterSha256,
    "live current.json state differs from the candidate generation report",
  );
}

async function main() {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const dataRoot = path.join(repositoryRoot, "data/game-content/v1/ko-KR");
  const publicRoot = path.join(repositoryRoot, "public/game-content/v1/ko-KR");
  const candidatesRoot = path.join(publicRoot, "candidates");
  const candidatePath = path.join(
    dataRoot,
    "reviews/editorial-candidates.json",
  );
  const baseWordbankPath = path.join(dataRoot, "reviewed-launch-wordbank.json");
  const baseLedgerPath = path.join(dataRoot, "reviews/editorial-ledger.json");
  const taxonomyPath = path.join(
    dataRoot,
    "reviews/launch-theme-taxonomy.json",
  );
  const wordbankPath = path.join(dataRoot, "reviewed-launch-wordbank-v2.json");
  const themeLedgerPath = path.join(
    dataRoot,
    "reviews/launch-theme-ledger.json",
  );
  const boardReviewLedgerPath = path.join(
    dataRoot,
    "reviews/launch-board-review-ledger.json",
  );
  const manifestPath = path.join(dataRoot, "license-manifest.json");
  const provenancePath = path.join(dataRoot, "source-provenance-index.json");

  const decisionArtifacts = await Promise.all(
    DECISION_FILES.map(async (item) => ({
      relativePath: item.path,
      ...(await readArtifact(
        resolveRepositoryPath(repositoryRoot, item.path, "decision path"),
      )),
    })),
  );
  const themeDecisionArtifacts = await Promise.all(
    LAUNCH_THEME_SHARD_SPECS.map(async (item) => ({
      relativePath: item.relativePath,
      ...(await readArtifact(
        resolveRepositoryPath(
          repositoryRoot,
          item.relativePath,
          "theme decision path",
        ),
      )),
    })),
  );
  const [
    candidateArtifact,
    baseWordbankArtifact,
    baseLedgerArtifact,
    taxonomyArtifact,
    wordbankArtifact,
    themeLedgerArtifact,
    boardReviewLedgerArtifact,
    licenseManifestArtifact,
    provenanceArtifact,
    publicManifestArtifact,
    catalogArtifact,
    worldMapArtifact,
    reportArtifact,
    packIndexArtifact,
  ] = await Promise.all([
    readArtifact(candidatePath),
    readArtifact(baseWordbankPath),
    readArtifact(baseLedgerPath),
    readArtifact(taxonomyPath),
    readArtifact(wordbankPath),
    readArtifact(themeLedgerPath),
    readArtifact(boardReviewLedgerPath),
    readArtifact(manifestPath),
    readArtifact(provenancePath),
    readArtifact(path.join(publicRoot, "license-manifest.json")),
    readArtifact(path.join(candidatesRoot, "catalog.json")),
    readArtifact(path.join(candidatesRoot, "world-map.json")),
    readArtifact(path.join(candidatesRoot, "generation-report.json")),
    readArtifact(path.join(candidatesRoot, "pack-index.json")),
  ]);
  const rawCatalog = catalogArtifact.document;
  const worldMap = worldMapArtifact.document;
  const report = reportArtifact.document;
  const packIndex = packIndexArtifact.document;

  const reviewContext = await validateInputAndReviewLocks(
    repositoryRoot,
    candidateArtifact,
    decisionArtifacts,
    baseWordbankArtifact,
    baseLedgerArtifact,
    taxonomyArtifact,
    themeDecisionArtifacts,
    wordbankArtifact,
    themeLedgerArtifact,
    licenseManifestArtifact,
    provenanceArtifact,
  );

  requireCandidateFlags(rawCatalog, "catalog");
  requireCandidateFlags(worldMap, "world map");
  requireCandidateFlags(report, "generation report");
  requireCandidateFlags(packIndex, "candidate pack index");
  requireCondition(
    rawCatalog.boards?.length === EXPECTED_TOTAL_BOARDS,
    `catalog must contain exactly ${EXPECTED_TOTAL_BOARDS} boards`,
  );
  const catalogValidation = validateKoKrLaunchContentCatalogStructureV1(
    rawCatalog,
    { verifyContentChecksum: verifyGameContentChecksum },
  );
  requireCondition(
    catalogValidation.pass && catalogValidation.catalog != null,
    `catalog validation failed: ${catalogValidation.issues
      .map((issue) => `${issue.code}:${issue.path}`)
      .join(",")}`,
  );
  const graphValidation = validateWorldMapGraphV1(
    worldMap,
    catalogValidation.catalog,
  );
  requireCondition(
    graphValidation.pass,
    `world-map validation failed: ${graphValidation.issues
      .map((issue) => `${issue.code}:${issue.path}`)
      .join(",")}`,
  );
  requireCondition(
    worldMap.catalogId === rawCatalog.catalogId,
    "world-map catalogId mismatch",
  );
  validateBundledFirstRunCatalog(rawCatalog, loadBundledFirstRunGameContents());

  validateReportCatalogJoin(rawCatalog, report);
  validateLaunchBoardReviewLedger(
    rawCatalog,
    report,
    boardReviewLedgerArtifact.document,
  );
  requireExact(
    report.routeCounts,
    routeCounts(rawCatalog),
    "report routeCounts",
  );
  const selectedWords = await validateGeneratorIdentity(
    repositoryRoot,
    report,
    wordbankArtifact,
  );
  validateCatalogEntryProvenance(
    rawCatalog,
    report,
    { words: selectedWords },
    reviewContext.licenseManifest,
    reviewContext.licenseIds,
  );
  validateCatalogLaunchSelection(rawCatalog, selectedWords);
  validateLicensePublication(
    reviewContext.licenseManifest,
    publicManifestArtifact.document,
    report,
    rawCatalog,
    packIndex,
  );
  await validateImmutablePacks(publicRoot, rawCatalog, packIndex);
  const inventory = validateGlobalInventory(rawCatalog, report);
  await validateCurrentPointer(repositoryRoot, publicRoot, report);

  console.log(
    JSON.stringify(
      {
        pass: true,
        contentLocale: CONTENT_LOCALE,
        boards: rawCatalog.boards.length,
        generatedBoards: report.boards.length,
        reviewedCandidates: EXPECTED_REVIEWED_CANDIDATES,
        approvedWordbankEntries: reviewContext.wordbank.words.length,
        sourceProvenanceRecords: provenanceArtifact.document.entries.length,
        ...inventory,
        activationApproved: false,
      },
      null,
      2,
    ),
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
