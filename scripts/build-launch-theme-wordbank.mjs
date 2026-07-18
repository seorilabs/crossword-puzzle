#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CONTENT_LOCALE = "ko-KR";
const WORD_BANK_V1_SCHEMA = "launch-wordbank/1";
const WORD_BANK_V2_SCHEMA = "launch-wordbank/2";
const BASE_LEDGER_SCHEMA = "game-content-editorial-ledger/1";
const TAXONOMY_SCHEMA = "game-content-theme-taxonomy/1";
const THEME_DECISION_SCHEMA = "game-content-theme-editorial-decisions/1";
const THEME_LEDGER_SCHEMA = "game-content-theme-editorial-ledger/1";
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const DIFFICULTIES = Object.freeze(["easy", "normal", "hard"]);
const EDITORIAL_STATUSES = Object.freeze([
  "approved",
  "needs-editorial-fix",
  "not-applicable-rejected",
]);
const EDITORIAL_FIX_REASON_ORDER = Object.freeze([
  "clue-definition-sense-mismatch",
  "theme-sense-ambiguous",
]);

export const LAUNCH_THEME_WORD_BANK_PATHS = Object.freeze({
  baseWordBank: "data/game-content/v1/ko-KR/reviewed-launch-wordbank.json",
  baseEditorialLedger:
    "data/game-content/v1/ko-KR/reviews/editorial-ledger.json",
  taxonomy: "data/game-content/v1/ko-KR/reviews/launch-theme-taxonomy.json",
  outputWordBank: "data/game-content/v1/ko-KR/reviewed-launch-wordbank-v2.json",
  outputThemeLedger:
    "data/game-content/v1/ko-KR/reviews/launch-theme-ledger.json",
});

export const LAUNCH_THEME_SHARD_SPECS = Object.freeze([
  Object.freeze({
    relativePath:
      "data/game-content/v1/ko-KR/reviews/editorial-theme-decisions-0000-0799.json",
    startIndex: 0,
    endIndexInclusive: 799,
  }),
  Object.freeze({
    relativePath:
      "data/game-content/v1/ko-KR/reviews/editorial-theme-decisions-0800-1599.json",
    startIndex: 800,
    endIndexInclusive: 1_599,
  }),
  Object.freeze({
    relativePath:
      "data/game-content/v1/ko-KR/reviews/editorial-theme-decisions-1600-2399.json",
    startIndex: 1_600,
    endIndexInclusive: 2_399,
  }),
]);

export const LAUNCH_THEME_REVIEW_CONTRACT = Object.freeze({
  expectedCandidateCount: 2_400,
  expectedCandidateFileSha256:
    "sha256:b73638293895ee31b0f11c3eea9d31f343c5e936df45faeea308a570ce16a44f",
  expectedBaseWordBankSha256:
    "sha256:0b17e62c567e17c2f992dd1d470b203362e3843f63a4fc9316ec9b83f53012e8",
  expectedBaseEditorialLedgerSha256:
    "sha256:ac98679ead880d0e9dab86fc4a0d6bcd6086578dbc0e6fbdaba0830a84a4d85a",
  expectedTaxonomySha256:
    "sha256:f6719bfad3c4d1b6555e1988633dc712a526dd5025e112e398eab6d6097cbc2d",
  shardSpecs: LAUNCH_THEME_SHARD_SPECS,
});

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireObject(value, field) {
  requireCondition(
    value != null && typeof value === "object" && !Array.isArray(value),
    `${field} must be an object`,
  );
  return value;
}

function requireNonEmptyString(value, field) {
  requireCondition(
    typeof value === "string" && value.trim() !== "",
    `${field} must be a non-empty string`,
  );
  return value;
}

function requireSha256(value, field) {
  requireCondition(
    typeof value === "string" && SHA256_PATTERN.test(value),
    `${field} must be a sha256 checksum`,
  );
  return value;
}

function requireStringArray(value, field, { nonEmpty = false } = {}) {
  requireCondition(Array.isArray(value), `${field} must be an array`);
  requireCondition(!nonEmpty || value.length > 0, `${field} must not be empty`);
  requireCondition(
    value.every((item) => typeof item === "string" && item.trim() !== ""),
    `${field} must contain only non-empty strings`,
  );
  return value;
}

function requireExactStringArray(value, expected, field) {
  requireStringArray(value, field);
  requireCondition(
    value.length === expected.length &&
      value.every((item, index) => item === expected[index]),
    `${field} must equal ${JSON.stringify(expected)}`,
  );
}

function parseJsonDocument(text, label) {
  try {
    return requireObject(JSON.parse(text), label);
  } catch (error) {
    if (error?.message?.startsWith(`${label} must be`)) throw error;
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function prettyJson(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function normalizeContract(contract = {}) {
  const normalized = {
    ...LAUNCH_THEME_REVIEW_CONTRACT,
    ...contract,
    shardSpecs: contract.shardSpecs ?? LAUNCH_THEME_REVIEW_CONTRACT.shardSpecs,
  };
  requireCondition(
    Number.isInteger(normalized.expectedCandidateCount) &&
      normalized.expectedCandidateCount > 0,
    "expectedCandidateCount must be a positive integer",
  );
  requireSha256(
    normalized.expectedCandidateFileSha256,
    "expectedCandidateFileSha256",
  );
  requireSha256(
    normalized.expectedBaseWordBankSha256,
    "expectedBaseWordBankSha256",
  );
  requireSha256(
    normalized.expectedBaseEditorialLedgerSha256,
    "expectedBaseEditorialLedgerSha256",
  );
  requireSha256(normalized.expectedTaxonomySha256, "expectedTaxonomySha256");
  validateShardSpecs(normalized.shardSpecs, normalized.expectedCandidateCount);
  return normalized;
}

function validateShardSpecs(shardSpecs, expectedCandidateCount) {
  requireCondition(
    Array.isArray(shardSpecs) && shardSpecs.length > 0,
    "theme shard specs must not be empty",
  );
  for (const [index, spec] of shardSpecs.entries()) {
    requireNonEmptyString(
      spec?.relativePath,
      `shardSpecs[${index}].relativePath`,
    );
    requireCondition(
      Number.isInteger(spec?.startIndex) &&
        Number.isInteger(spec?.endIndexInclusive) &&
        spec.startIndex <= spec.endIndexInclusive,
      `shardSpecs[${index}] coverage is invalid`,
    );
    const expectedStart =
      index === 0 ? 0 : shardSpecs[index - 1].endIndexInclusive + 1;
    requireCondition(
      spec.startIndex === expectedStart,
      `theme shard specs must be contiguous at index ${index}`,
    );
  }
  requireCondition(
    shardSpecs.at(-1).endIndexInclusive === expectedCandidateCount - 1,
    `theme shard specs must end at candidate ${expectedCandidateCount - 1}`,
  );
}

function validateTaxonomy(taxonomyText, contract, taxonomyPath) {
  const taxonomySha256 = sha256(taxonomyText);
  requireCondition(
    taxonomySha256 === contract.expectedTaxonomySha256,
    `${taxonomyPath} checksum does not match the locked taxonomy`,
  );
  const document = parseJsonDocument(taxonomyText, taxonomyPath);
  requireCondition(
    document.schemaVersion === TAXONOMY_SCHEMA,
    `${taxonomyPath} schemaVersion must be ${TAXONOMY_SCHEMA}`,
  );
  requireCondition(
    document.contentLocale === CONTENT_LOCALE,
    `${taxonomyPath} contentLocale must be ${CONTENT_LOCALE}`,
  );
  const taxonomyId = requireNonEmptyString(
    document.taxonomyId,
    `${taxonomyPath}.taxonomyId`,
  );
  requireObject(document.policy, `${taxonomyPath}.policy`);
  requireCondition(
    Array.isArray(document.themes) && document.themes.length > 0,
    `${taxonomyPath}.themes must not be empty`,
  );
  const themeIds = document.themes.map((theme, index) =>
    requireNonEmptyString(theme?.id, `${taxonomyPath}.themes[${index}].id`),
  );
  requireCondition(
    new Set(themeIds).size === themeIds.length,
    `${taxonomyPath}.themes contains duplicate ids`,
  );

  const inventoryGate = requireObject(
    document.inventoryGate,
    `${taxonomyPath}.inventoryGate`,
  );
  for (const field of [
    "dailyBoardsPerTheme",
    "normalBoardsPerTheme",
    "hardBoardsPerTheme",
    "hardFailDistinctOwnerCountPerTheme",
    "productionTargetDistinctOwnerCountPerTheme",
    "hardFailNormalOrHardReservePerTheme",
    "productionTargetNormalOrHardReservePerTheme",
  ]) {
    requireCondition(
      Number.isInteger(inventoryGate[field]) && inventoryGate[field] >= 0,
      `${taxonomyPath}.inventoryGate.${field} must be a non-negative integer`,
    );
  }
  requireCondition(
    inventoryGate.dailyBoardsPerTheme ===
      inventoryGate.normalBoardsPerTheme + inventoryGate.hardBoardsPerTheme,
    `${taxonomyPath}.inventoryGate board counts do not add up`,
  );
  requireCondition(
    typeof inventoryGate.minimumThemeEntryRatio === "number" &&
      inventoryGate.minimumThemeEntryRatio > 0 &&
      inventoryGate.minimumThemeEntryRatio <= 1,
    `${taxonomyPath}.inventoryGate.minimumThemeEntryRatio must be in (0, 1]`,
  );
  requireCondition(
    inventoryGate.productionTargetDistinctOwnerCountPerTheme >=
      inventoryGate.hardFailDistinctOwnerCountPerTheme,
    `${taxonomyPath}.inventoryGate owner target must not be below its hard-fail threshold`,
  );
  requireCondition(
    inventoryGate.productionTargetNormalOrHardReservePerTheme >=
      inventoryGate.hardFailNormalOrHardReservePerTheme,
    `${taxonomyPath}.inventoryGate reserve target must not be below its hard-fail threshold`,
  );
  requireNonEmptyString(
    inventoryGate.ownerRule,
    `${taxonomyPath}.inventoryGate.ownerRule`,
  );

  return { document, inventoryGate, taxonomyId, taxonomySha256, themeIds };
}

function validateBaseEvidence({
  baseWordBankText,
  baseEditorialLedgerText,
  contract,
  paths,
}) {
  const baseWordBankSha256 = sha256(baseWordBankText);
  const baseEditorialLedgerSha256 = sha256(baseEditorialLedgerText);
  requireCondition(
    baseWordBankSha256 === contract.expectedBaseWordBankSha256,
    `${paths.baseWordBank} checksum does not match the locked v1 wordbank`,
  );
  requireCondition(
    baseEditorialLedgerSha256 === contract.expectedBaseEditorialLedgerSha256,
    `${paths.baseEditorialLedger} checksum does not match the locked base editorial ledger`,
  );

  const wordBank = parseJsonDocument(baseWordBankText, paths.baseWordBank);
  const ledger = parseJsonDocument(
    baseEditorialLedgerText,
    paths.baseEditorialLedger,
  );
  requireCondition(
    wordBank.metadata?.schemaVersion === WORD_BANK_V1_SCHEMA,
    `${paths.baseWordBank} schemaVersion must be ${WORD_BANK_V1_SCHEMA}`,
  );
  requireCondition(
    wordBank.metadata?.contentLocale === CONTENT_LOCALE,
    `${paths.baseWordBank} contentLocale must be ${CONTENT_LOCALE}`,
  );
  requireCondition(
    ledger.schemaVersion === BASE_LEDGER_SCHEMA,
    `${paths.baseEditorialLedger} schemaVersion must be ${BASE_LEDGER_SCHEMA}`,
  );
  requireCondition(
    ledger.contentLocale === CONTENT_LOCALE,
    `${paths.baseEditorialLedger} contentLocale must be ${CONTENT_LOCALE}`,
  );
  requireCondition(
    ledger.candidateFileSha256 === contract.expectedCandidateFileSha256,
    `${paths.baseEditorialLedger} candidate checksum does not match`,
  );
  requireCondition(
    wordBank.metadata.sourceCandidateFileSha256 === ledger.candidateFileSha256,
    `${paths.baseWordBank} candidate checksum does not match the base ledger`,
  );
  requireCondition(
    ledger.wordbankFileSha256 === baseWordBankSha256,
    `${paths.baseEditorialLedger} wordbank checksum does not match the v1 wordbank bytes`,
  );
  requireNonEmptyString(
    ledger.editorialCheckSetId,
    `${paths.baseEditorialLedger}.editorialCheckSetId`,
  );
  requireCondition(
    wordBank.metadata.editorialCheckSetId === ledger.editorialCheckSetId,
    `${paths.baseWordBank} editorial check set does not match the base ledger`,
  );
  requireCondition(
    Array.isArray(ledger.decisions) &&
      ledger.decisions.length === contract.expectedCandidateCount,
    `${paths.baseEditorialLedger}.decisions must contain exactly ${contract.expectedCandidateCount} rows`,
  );
  requireCondition(
    Array.isArray(wordBank.words),
    `${paths.baseWordBank}.words must be an array`,
  );

  let baseRejectedCount = 0;
  for (const [candidateIndex, decision] of ledger.decisions.entries()) {
    requireCondition(
      decision?.candidateIndex === candidateIndex,
      `${paths.baseEditorialLedger}.decisions[${candidateIndex}] candidateIndex must be ${candidateIndex}`,
    );
    requireNonEmptyString(
      decision.sourceEntryId,
      `${paths.baseEditorialLedger}.decisions[${candidateIndex}].sourceEntryId`,
    );
    requireNonEmptyString(
      decision.answer,
      `${paths.baseEditorialLedger}.decisions[${candidateIndex}].answer`,
    );
    requireSha256(
      decision.definitionChecksum,
      `${paths.baseEditorialLedger}.decisions[${candidateIndex}].definitionChecksum`,
    );
    requireCondition(
      ["approve", "rewrite", "reject"].includes(decision.decision),
      `${paths.baseEditorialLedger}.decisions[${candidateIndex}].decision is invalid`,
    );
    requireCondition(
      decision.checkSetId === ledger.editorialCheckSetId,
      `${paths.baseEditorialLedger}.decisions[${candidateIndex}].checkSetId does not match`,
    );
    requireStringArray(
      decision.reasonCodes,
      `${paths.baseEditorialLedger}.decisions[${candidateIndex}].reasonCodes`,
      { nonEmpty: true },
    );
    if (decision.decision === "reject") baseRejectedCount += 1;
  }

  const wordByCandidateIndex = new Map();
  let previousCandidateIndex = -1;
  for (const [wordIndex, word] of wordBank.words.entries()) {
    const candidateIndex = word?.reviewLedgerIndex;
    requireCondition(
      Number.isInteger(candidateIndex) &&
        candidateIndex >= 0 &&
        candidateIndex < contract.expectedCandidateCount,
      `${paths.baseWordBank}.words[${wordIndex}].reviewLedgerIndex is invalid`,
    );
    requireCondition(
      candidateIndex > previousCandidateIndex,
      `${paths.baseWordBank}.words must follow base ledger order without duplicates`,
    );
    previousCandidateIndex = candidateIndex;
    const decision = ledger.decisions[candidateIndex];
    requireCondition(
      decision.decision !== "reject" &&
        decision.sourceEntryId === word.sourceEntryId &&
        decision.answer === word.answer &&
        decision.definitionChecksum === word.definitionChecksum &&
        decision.decision === word.reviewDecision,
      `${paths.baseWordBank}.words[${wordIndex}] identity does not match base decision ${candidateIndex}`,
    );
    requireNonEmptyString(
      word.clue,
      `${paths.baseWordBank}.words[${wordIndex}].clue`,
    );
    requireCondition(
      DIFFICULTIES.includes(word.difficulty),
      `${paths.baseWordBank}.words[${wordIndex}].difficulty is invalid`,
    );
    requireCondition(
      Array.isArray(word.themeTags) && Array.isArray(word.domainTags),
      `${paths.baseWordBank}.words[${wordIndex}] tag fields must be arrays`,
    );
    wordByCandidateIndex.set(candidateIndex, word);
  }

  requireCondition(
    wordBank.words.length ===
      contract.expectedCandidateCount - baseRejectedCount,
    `${paths.baseWordBank} must contain every non-rejected base decision exactly once`,
  );
  for (const decision of ledger.decisions) {
    requireCondition(
      wordByCandidateIndex.has(decision.candidateIndex) ===
        (decision.decision !== "reject"),
      `${paths.baseWordBank} approval coverage differs at candidate ${decision.candidateIndex}`,
    );
  }

  return {
    baseEditorialLedgerSha256,
    baseRejectedCount,
    baseWordBankSha256,
    ledger,
    wordBank,
    wordByCandidateIndex,
  };
}

function validateThemeDecisionReason({
  decision,
  baseDecision,
  field,
  themeIds,
  themeOrder,
}) {
  const eligibleThemeIds = requireStringArray(
    decision.eligibleThemeIds,
    `${field}.eligibleThemeIds`,
  );
  const reasonCodes = requireStringArray(
    decision.reasonCodes,
    `${field}.reasonCodes`,
    { nonEmpty: true },
  );
  requireCondition(
    new Set(eligibleThemeIds).size === eligibleThemeIds.length,
    `${field}.eligibleThemeIds contains duplicates`,
  );
  requireCondition(
    eligibleThemeIds.every((themeId) => themeOrder.has(themeId)),
    `${field}.eligibleThemeIds contains an unknown taxonomy id`,
  );
  requireCondition(
    eligibleThemeIds.every(
      (themeId, index) =>
        index === 0 ||
        themeOrder.get(eligibleThemeIds[index - 1]) < themeOrder.get(themeId),
    ),
    `${field}.eligibleThemeIds must follow taxonomy order`,
  );

  if (baseDecision.decision === "reject") {
    requireCondition(
      decision.editorialStatus === "not-applicable-rejected" &&
        decision.senseAlignment === "not-applicable",
      `${field} must be not-applicable-rejected for a rejected base decision`,
    );
    requireExactStringArray(eligibleThemeIds, [], `${field}.eligibleThemeIds`);
    requireExactStringArray(
      reasonCodes,
      ["base-editorial-rejected"],
      `${field}.reasonCodes`,
    );
    return;
  }

  requireCondition(
    decision.editorialStatus !== "not-applicable-rejected",
    `${field} cannot reject a base-approved word`,
  );
  if (decision.editorialStatus === "approved") {
    requireCondition(
      decision.senseAlignment === "same-sense",
      `${field}.senseAlignment must be same-sense when approved`,
    );
    const expectedReasons =
      eligibleThemeIds.length === 0
        ? ["no-direct-theme-fit"]
        : eligibleThemeIds.map((themeId) => `direct-fit:${themeId}`);
    requireExactStringArray(
      reasonCodes,
      expectedReasons,
      `${field}.reasonCodes`,
    );
    return;
  }

  requireCondition(
    decision.editorialStatus === "needs-editorial-fix" &&
      decision.senseAlignment === "needs-editorial-fix",
    `${field} needs-editorial-fix status and senseAlignment must agree`,
  );
  requireExactStringArray(eligibleThemeIds, [], `${field}.eligibleThemeIds`);
  requireCondition(
    new Set(reasonCodes).size === reasonCodes.length &&
      reasonCodes.every((reasonCode) =>
        EDITORIAL_FIX_REASON_ORDER.includes(reasonCode),
      ) &&
      reasonCodes.every(
        (reasonCode, index) =>
          index === 0 ||
          EDITORIAL_FIX_REASON_ORDER.indexOf(reasonCodes[index - 1]) <
            EDITORIAL_FIX_REASON_ORDER.indexOf(reasonCode),
      ),
    `${field}.reasonCodes must use the ordered editorial-fix reason taxonomy`,
  );
  requireCondition(
    themeIds.length > 0,
    `${field} cannot be validated without a theme taxonomy`,
  );
}

function validateThemeShards({
  baseEvidence,
  contract,
  taxonomy,
  themeShardInputs,
}) {
  requireCondition(
    Array.isArray(themeShardInputs) &&
      themeShardInputs.length === contract.shardSpecs.length,
    `exactly ${contract.shardSpecs.length} theme decision shards are required`,
  );
  const themeOrder = new Map(
    taxonomy.themeIds.map((themeId, index) => [themeId, index]),
  );
  const decisions = [];
  const coverage = [];
  const statusCounts = Object.fromEntries(
    EDITORIAL_STATUSES.map((status) => [status, 0]),
  );

  for (const [shardIndex, spec] of contract.shardSpecs.entries()) {
    const input = themeShardInputs[shardIndex];
    requireCondition(
      input?.relativePath === spec.relativePath,
      `theme shard ${shardIndex} path must be ${spec.relativePath}`,
    );
    requireCondition(
      typeof input.text === "string",
      `${spec.relativePath} contents are required`,
    );
    const document = parseJsonDocument(input.text, spec.relativePath);
    requireCondition(
      document.schemaVersion === THEME_DECISION_SCHEMA,
      `${spec.relativePath} schemaVersion must be ${THEME_DECISION_SCHEMA}`,
    );
    requireCondition(
      document.contentLocale === CONTENT_LOCALE,
      `${spec.relativePath} contentLocale must be ${CONTENT_LOCALE}`,
    );
    requireCondition(
      document.candidateFileSha256 === contract.expectedCandidateFileSha256,
      `${spec.relativePath} candidate checksum does not match`,
    );
    requireCondition(
      document.baseEditorialLedgerSha256 ===
        baseEvidence.baseEditorialLedgerSha256,
      `${spec.relativePath} base editorial ledger checksum does not match`,
    );
    requireCondition(
      document.taxonomyId === taxonomy.taxonomyId &&
        document.taxonomySha256 === taxonomy.taxonomySha256,
      `${spec.relativePath} taxonomy lock does not match`,
    );
    const reviewerId = requireNonEmptyString(
      document.reviewerId,
      `${spec.relativePath}.reviewerId`,
    );
    const reviewedAt = requireNonEmptyString(
      document.reviewedAt,
      `${spec.relativePath}.reviewedAt`,
    );
    requireCondition(
      !Number.isNaN(Date.parse(reviewedAt)),
      `${spec.relativePath}.reviewedAt must be a timestamp`,
    );
    requireCondition(
      document.coverage?.startIndex === spec.startIndex &&
        document.coverage?.endIndexInclusive === spec.endIndexInclusive,
      `${spec.relativePath} coverage must be ${spec.startIndex}-${spec.endIndexInclusive}`,
    );
    const expectedDecisionCount = spec.endIndexInclusive - spec.startIndex + 1;
    requireCondition(
      Array.isArray(document.decisions) &&
        document.decisions.length === expectedDecisionCount,
      `${spec.relativePath}.decisions must contain exactly ${expectedDecisionCount} rows`,
    );

    for (const [offset, decision] of document.decisions.entries()) {
      const candidateIndex = spec.startIndex + offset;
      const field = `${spec.relativePath}.decisions[${offset}]`;
      const baseDecision = baseEvidence.ledger.decisions[candidateIndex];
      requireCondition(
        decision?.candidateIndex === candidateIndex,
        `${field}.candidateIndex must be ${candidateIndex}`,
      );
      requireCondition(
        decision.sourceEntryId === baseDecision.sourceEntryId &&
          decision.answer === baseDecision.answer &&
          decision.definitionChecksum === baseDecision.definitionChecksum,
        `${field} identity does not match base editorial decision ${candidateIndex}`,
      );
      requireSha256(
        decision.resolvedClueChecksum,
        `${field}.resolvedClueChecksum`,
      );
      requireCondition(
        EDITORIAL_STATUSES.includes(decision.editorialStatus),
        `${field}.editorialStatus is invalid`,
      );
      const baseWord = baseEvidence.wordByCandidateIndex.get(candidateIndex);
      if (baseWord != null) {
        requireCondition(
          decision.resolvedClueChecksum === sha256(baseWord.clue),
          `${field}.resolvedClueChecksum does not match the v1 reviewed clue`,
        );
      }
      validateThemeDecisionReason({
        decision,
        baseDecision,
        field,
        themeIds: taxonomy.themeIds,
        themeOrder,
      });
      statusCounts[decision.editorialStatus] += 1;
      decisions.push(decision);
    }

    coverage.push({
      reviewerId,
      reviewedAt,
      startIndex: spec.startIndex,
      endIndexInclusive: spec.endIndexInclusive,
      decisionFile: spec.relativePath,
      decisionFileSha256: sha256(input.text),
    });
  }

  requireCondition(
    decisions.length === contract.expectedCandidateCount &&
      decisions.every((decision, index) => decision.candidateIndex === index),
    `theme decisions must cover candidate 0 through ${contract.expectedCandidateCount - 1} exactly once`,
  );
  requireCondition(
    statusCounts["not-applicable-rejected"] === baseEvidence.baseRejectedCount,
    "theme rejection count must match the base editorial ledger",
  );
  return { coverage, decisions, statusCounts };
}

function emptyDifficultyCounts() {
  return { easy: 0, normal: 0, hard: 0 };
}

function summarizeEligibility(words, themeIds) {
  const byDifficulty = emptyDifficultyCounts();
  const withoutEligibleTheme = {
    total: 0,
    difficulty: emptyDifficultyCounts(),
  };
  const byTheme = themeIds.map((themeId) => ({
    themeId,
    total: 0,
    difficulty: emptyDifficultyCounts(),
  }));
  const byThemeId = new Map(byTheme.map((item) => [item.themeId, item]));

  for (const word of words) {
    byDifficulty[word.difficulty] += 1;
    if (word.themeTags.length === 0) {
      withoutEligibleTheme.total += 1;
      withoutEligibleTheme.difficulty[word.difficulty] += 1;
    }
    for (const themeId of word.themeTags) {
      const item = byThemeId.get(themeId);
      item.total += 1;
      item.difficulty[word.difficulty] += 1;
    }
  }
  return {
    eligibleWordCount: words.length,
    byDifficulty,
    withoutEligibleTheme,
    byTheme,
  };
}

export function deriveLaunchThemeArtifacts({
  baseWordBankText,
  baseEditorialLedgerText,
  taxonomyText,
  themeShardInputs,
  contract: contractOverride,
  paths: pathOverrides,
}) {
  const contract = normalizeContract(contractOverride);
  const paths = { ...LAUNCH_THEME_WORD_BANK_PATHS, ...pathOverrides };
  for (const [field, value] of Object.entries(paths)) {
    requireNonEmptyString(value, `paths.${field}`);
  }
  requireCondition(
    paths.outputWordBank !== paths.baseWordBank &&
      paths.outputThemeLedger !== paths.baseEditorialLedger,
    "v2 output paths must never overwrite base evidence paths",
  );
  requireCondition(
    typeof baseWordBankText === "string" &&
      typeof baseEditorialLedgerText === "string" &&
      typeof taxonomyText === "string",
    "base wordbank, base ledger and taxonomy contents are required",
  );

  const taxonomy = validateTaxonomy(taxonomyText, contract, paths.taxonomy);
  const baseEvidence = validateBaseEvidence({
    baseWordBankText,
    baseEditorialLedgerText,
    contract,
    paths,
  });
  const themeReview = validateThemeShards({
    baseEvidence,
    contract,
    taxonomy,
    themeShardInputs,
  });

  const words = [];
  for (const baseWord of baseEvidence.wordBank.words) {
    const candidateIndex = baseWord.reviewLedgerIndex;
    const themeDecision = themeReview.decisions[candidateIndex];
    if (themeDecision.editorialStatus !== "approved") continue;
    words.push({
      ...baseWord,
      themeTags: [...themeDecision.eligibleThemeIds],
      domainTags: ["general"],
      themeDecisionLedgerIndex: candidateIndex,
    });
  }

  const exclusionCounts = {
    baseEditorialRejected: baseEvidence.baseRejectedCount,
    themeNeedsEditorialFix: themeReview.statusCounts["needs-editorial-fix"],
    excludedFromCandidateSet:
      baseEvidence.baseRejectedCount +
      themeReview.statusCounts["needs-editorial-fix"],
    excludedFromBaseWordBank: themeReview.statusCounts["needs-editorial-fix"],
  };
  requireCondition(
    words.length + exclusionCounts.excludedFromCandidateSet ===
      contract.expectedCandidateCount,
    "v2 wordbank eligibility accounting does not add up",
  );

  const themeEligibilitySummary = summarizeEligibility(
    words,
    taxonomy.themeIds,
  );
  const baseEvidenceMetadata = {
    launchWordBankV1: {
      schemaVersion: WORD_BANK_V1_SCHEMA,
      path: paths.baseWordBank,
      sha256: baseEvidence.baseWordBankSha256,
      wordCount: baseEvidence.wordBank.words.length,
    },
    editorialLedger: {
      schemaVersion: BASE_LEDGER_SCHEMA,
      path: paths.baseEditorialLedger,
      sha256: baseEvidence.baseEditorialLedgerSha256,
      candidateFileSha256: contract.expectedCandidateFileSha256,
      decisionCount: baseEvidence.ledger.decisions.length,
    },
  };
  const themeTaxonomyMetadata = {
    taxonomyId: taxonomy.taxonomyId,
    path: paths.taxonomy,
    sha256: taxonomy.taxonomySha256,
    themeIds: [...taxonomy.themeIds],
    inventoryGate: taxonomy.inventoryGate,
  };
  const wordBankDocument = {
    metadata: {
      schemaVersion: WORD_BANK_V2_SCHEMA,
      contentLocale: CONTENT_LOCALE,
      sourceDataset: baseEvidence.wordBank.metadata.sourceDataset,
      sourceCandidateFile: baseEvidence.wordBank.metadata.sourceCandidateFile,
      sourceCandidateFileSha256:
        baseEvidence.wordBank.metadata.sourceCandidateFileSha256,
      editorialCheckSetId: baseEvidence.wordBank.metadata.editorialCheckSetId,
      baseEvidence: baseEvidenceMetadata,
      themeTaxonomy: themeTaxonomyMetadata,
      themeReviewCoverage: themeReview.coverage,
      exclusionCounts,
      themeEligibilitySummary,
    },
    words,
  };
  const wordBankText = prettyJson(wordBankDocument);
  const wordBankSha256 = sha256(wordBankText);

  const themeLedgerDocument = {
    schemaVersion: THEME_LEDGER_SCHEMA,
    contentLocale: CONTENT_LOCALE,
    baseEvidence: baseEvidenceMetadata,
    themeTaxonomy: themeTaxonomyMetadata,
    wordBankV2: {
      schemaVersion: WORD_BANK_V2_SCHEMA,
      path: paths.outputWordBank,
      sha256: wordBankSha256,
      wordCount: words.length,
    },
    coverage: themeReview.coverage,
    summary: {
      decisionCount: themeReview.decisions.length,
      editorialStatus: themeReview.statusCounts,
      exclusionCounts,
      themeEligibilitySummary,
    },
    decisions: themeReview.decisions,
  };
  const themeLedgerText = prettyJson(themeLedgerDocument);

  return {
    themeLedgerDocument,
    themeLedgerText,
    wordBankDocument,
    wordBankSha256,
    wordBankText,
  };
}

async function readRequiredThemeShard(absolutePath, relativePath) {
  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `required theme decision shard is missing: ${relativePath}`,
      );
    }
    throw error;
  }
}

async function atomicWriteFile(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${createHash("sha256")
    .update(`${filePath}:${contents.length}`, "utf8")
    .digest("hex")
    .slice(0, 12)}`;
  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

async function requireCurrentOutput(filePath, relativePath, expectedContents) {
  let actualBytes;
  try {
    actualBytes = await readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `generated theme review artifact is missing: ${relativePath}; run npm run content:theme-review`,
      );
    }
    throw error;
  }

  const expectedBytes = Buffer.from(expectedContents, "utf8");
  requireCondition(
    actualBytes.equals(expectedBytes),
    `generated theme review artifact is stale: ${relativePath} (expected ${sha256(expectedBytes)}, got ${sha256(actualBytes)}); run npm run content:theme-review`,
  );
}

export async function buildLaunchThemeWordBank({
  repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  ),
  contract: contractOverride,
  paths: pathOverrides,
  check = false,
} = {}) {
  requireCondition(typeof check === "boolean", "check must be a boolean");
  const contract = normalizeContract(contractOverride);
  const paths = { ...LAUNCH_THEME_WORD_BANK_PATHS, ...pathOverrides };
  const absolutePaths = Object.fromEntries(
    Object.entries(paths).map(([key, relativePath]) => [
      key,
      path.resolve(repositoryRoot, relativePath),
    ]),
  );
  requireCondition(
    absolutePaths.outputWordBank !== absolutePaths.baseWordBank &&
      absolutePaths.outputThemeLedger !== absolutePaths.baseEditorialLedger,
    "v2 output paths must never overwrite base evidence paths",
  );

  const [baseWordBankBytes, baseEditorialLedgerBytes, taxonomyBytes] =
    await Promise.all([
      readFile(absolutePaths.baseWordBank),
      readFile(absolutePaths.baseEditorialLedger),
      readFile(absolutePaths.taxonomy),
    ]);
  const themeShardInputs = [];
  for (const spec of contract.shardSpecs) {
    themeShardInputs.push({
      relativePath: spec.relativePath,
      text: await readRequiredThemeShard(
        path.resolve(repositoryRoot, spec.relativePath),
        spec.relativePath,
      ),
    });
  }

  const artifacts = deriveLaunchThemeArtifacts({
    baseWordBankText: baseWordBankBytes.toString("utf8"),
    baseEditorialLedgerText: baseEditorialLedgerBytes.toString("utf8"),
    taxonomyText: taxonomyBytes.toString("utf8"),
    themeShardInputs,
    contract,
    paths,
  });

  if (check) {
    await Promise.all([
      requireCurrentOutput(
        absolutePaths.outputWordBank,
        paths.outputWordBank,
        artifacts.wordBankText,
      ),
      requireCurrentOutput(
        absolutePaths.outputThemeLedger,
        paths.outputThemeLedger,
        artifacts.themeLedgerText,
      ),
    ]);
  } else {
    const [wordBankBeforeWrite, ledgerBeforeWrite] = await Promise.all([
      readFile(absolutePaths.baseWordBank),
      readFile(absolutePaths.baseEditorialLedger),
    ]);
    requireCondition(
      baseWordBankBytes.equals(wordBankBeforeWrite) &&
        baseEditorialLedgerBytes.equals(ledgerBeforeWrite),
      "base evidence changed while deriving v2 artifacts; outputs were not written",
    );

    await atomicWriteFile(absolutePaths.outputWordBank, artifacts.wordBankText);
    await atomicWriteFile(
      absolutePaths.outputThemeLedger,
      artifacts.themeLedgerText,
    );

    const [wordBankAfterWrite, ledgerAfterWrite] = await Promise.all([
      readFile(absolutePaths.baseWordBank),
      readFile(absolutePaths.baseEditorialLedger),
    ]);
    requireCondition(
      baseWordBankBytes.equals(wordBankAfterWrite) &&
        baseEditorialLedgerBytes.equals(ledgerAfterWrite),
      "base evidence bytes changed while writing v2 artifacts",
    );
  }

  return {
    checked: check,
    outputThemeLedgerPath: paths.outputThemeLedger,
    outputWordBankPath: paths.outputWordBank,
    themeDecisionCount: artifacts.themeLedgerDocument.decisions.length,
    themeLedgerSha256: sha256(artifacts.themeLedgerText),
    wordBankSha256: artifacts.wordBankSha256,
    wordCount: artifacts.wordBankDocument.words.length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  requireCondition(
    args.length <= 1 && args.every((argument) => argument === "--check"),
    "usage: build-launch-theme-wordbank.mjs [--check]",
  );
  const result = await buildLaunchThemeWordBank({
    check: args[0] === "--check",
  });
  const verb = result.checked ? "checked" : "built";
  console.log(
    `${verb} ${result.outputWordBankPath}: ${result.wordCount} words (${result.wordBankSha256})`,
  );
  console.log(
    `${verb} ${result.outputThemeLedgerPath}: ${result.themeDecisionCount} decisions (${result.themeLedgerSha256})`,
  );
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
