#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { verifyGameContentChecksum } from "../packages/crossword-core/src/gameContent.ts";
import { canonicalizeForChecksum } from "../packages/crossword-core/src/saveV2.ts";
import {
  LAUNCH_BOARD_REVIEW_IDENTITY_KEYS,
  LAUNCH_BOARD_REVIEW_LEDGER_SCHEMA_VERSION,
  LAUNCH_BOARD_REVIEW_MANUAL_KEYS,
  calculateCanonicalDocumentChecksum,
  deriveLaunchBoardReviewSource,
  validateLaunchBoardReviewLedger,
} from "./launch-board-review-ledger.mjs";

export const LAUNCH_BOARD_REVIEW_WORKBOOK_SCHEMA_VERSION =
  "game-content-launch-board-review-workbook/1";
export const LAUNCH_BOARD_REVIEW_SHARD_SCHEMA_VERSION =
  "game-content-launch-board-review-shard/1";

const CHECKPOINT_SCHEMA_VERSION = "ko-kr-launch-generation-checkpoint/1";
const EXPECTED_GENERATED_BOARD_COUNT = 90;
const DEFAULT_SHARD_SIZE = 10;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const PUZZLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const EVIDENCE_ENTRY_KEYS = Object.freeze([
  "answer",
  "clue",
  "domainTags",
  "generatedBy",
  "sourceEntryId",
]);
const EVIDENCE_KEYS = Object.freeze(["entries", "metrics", "quality"]);
const REVIEW_INPUT_ROW_KEYS = Object.freeze([
  ...LAUNCH_BOARD_REVIEW_IDENTITY_KEYS,
  "evidence",
]);
const COMPLETED_REVIEW_ROW_KEYS = Object.freeze([
  ...REVIEW_INPUT_ROW_KEYS,
  ...LAUNCH_BOARD_REVIEW_MANUAL_KEYS,
]);
const WORKBOOK_KEYS = Object.freeze([
  "schemaVersion",
  "artifactStatus",
  "activationApproved",
  "source",
  "boardCount",
  "shardSize",
  "shards",
]);
const SHARD_DESCRIPTOR_KEYS = Object.freeze([
  "shardIndex",
  "path",
  "startIndex",
  "endIndexExclusive",
  "boardCount",
  "reviewInputChecksum",
]);
const SHARD_KEYS = Object.freeze([
  "schemaVersion",
  "artifactStatus",
  "activationApproved",
  "source",
  "shardIndex",
  "startIndex",
  "endIndexExclusive",
  "reviewInputChecksum",
  "boards",
]);
const FULL_SOURCE_KEYS = Object.freeze([
  "mode",
  "catalogChecksum",
  "generationReportChecksum",
  "generatorCommit",
  "generatorConfigHash",
]);
const CHECKPOINT_SOURCE_KEYS = Object.freeze([
  "mode",
  "checkpointChecksum",
  "generatorCommit",
  "generatorConfigHash",
]);
const CHECKPOINT_KEYS = Object.freeze([
  "schemaVersion",
  "generatorCommit",
  "generatorConfigHash",
  "routePuzzleIds",
  "completed",
]);
const CHECKPOINT_COMPLETED_KEYS = Object.freeze([
  "puzzleId",
  "contentSha256",
  "reportSha256",
]);

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requirePlainObject(value, field) {
  requireCondition(
    value != null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
    `${field} must be a plain object`,
  );
  return value;
}

function requireExactKeys(value, expectedKeys, field) {
  const actual = Object.keys(requirePlainObject(value, field)).sort();
  const expected = [...expectedKeys].sort();
  requireCondition(
    canonicalizeForChecksum(actual) === canonicalizeForChecksum(expected),
    `${field} keys must exactly match the review workbook contract`,
  );
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
    `${field} must be a lowercase canonical SHA-256`,
  );
  return value;
}

function requireCommit(value, field) {
  requireCondition(
    typeof value === "string" && COMMIT_PATTERN.test(value),
    `${field} must be a lowercase 40-character Git commit`,
  );
  return value;
}

function requireInteger(value, field, { minimum = 0, maximum } = {}) {
  requireCondition(
    Number.isInteger(value) &&
      value >= minimum &&
      (maximum == null || value <= maximum),
    `${field} must be an integer from ${minimum}${maximum == null ? "" : ` to ${maximum}`}`,
  );
  return value;
}

function requireStringArray(value, field, { allowEmpty = false } = {}) {
  requireCondition(
    Array.isArray(value) && (allowEmpty || value.length > 0),
    `${field} must be ${allowEmpty ? "an" : "a non-empty"} array`,
  );
  for (const [index, item] of value.entries()) {
    requireNonEmptyString(item, `${field}[${index}]`);
  }
  requireCondition(
    value.length === new Set(value).size,
    `${field} values must be unique`,
  );
  return value;
}

function requireCandidateFlags(value, field, schemaVersion) {
  requirePlainObject(value, field);
  requireCondition(
    value.schemaVersion === schemaVersion,
    `${field}.schemaVersion must be ${schemaVersion}`,
  );
  requireCondition(
    value.artifactStatus === "candidate" && value.activationApproved === false,
    `${field} must remain an inactive candidate`,
  );
}

function requireCanonicalEqual(actual, expected, field) {
  requireCondition(
    canonicalizeForChecksum(actual) === canonicalizeForChecksum(expected),
    `${field} is missing or stale`,
  );
}

async function readJson(filePath, field) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(
      `${field} could not be read at ${filePath}: ${error.message}`,
      { cause: error },
    );
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(
      `${field} is not valid JSON at ${filePath}: ${error.message}`,
      { cause: error },
    );
  }
}

async function readOptionalJson(filePath, field) {
  try {
    return await readJson(filePath, field);
  } catch (error) {
    if (error.cause?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeJsonAtomically(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function identityFromRow(row, field) {
  requirePlainObject(row, field);
  const sourceEntryIds = requireStringArray(
    row.sourceEntryIds,
    `${field}.sourceEntryIds`,
  );
  return {
    puzzleId: requireNonEmptyString(row.puzzleId, `${field}.puzzleId`),
    contentChecksum: requireSha256(
      row.contentChecksum,
      `${field}.contentChecksum`,
    ),
    artifactPath: requireNonEmptyString(
      row.artifactPath,
      `${field}.artifactPath`,
    ),
    themeId: requireNonEmptyString(row.themeId, `${field}.themeId`),
    difficulty: requireNonEmptyString(row.difficulty, `${field}.difficulty`),
    sourceEntryIds: [...sourceEntryIds],
  };
}

function evidenceFromBoard(content, report, field) {
  requirePlainObject(content, `${field}.content`);
  requireCondition(
    verifyGameContentChecksum(content),
    `${field}.content contentChecksum is invalid`,
  );
  requireCondition(
    Array.isArray(content.entries) && content.entries.length > 0,
    `${field}.content.entries must be a non-empty array`,
  );
  const entries = content.entries.map((entry, index) => {
    const entryField = `${field}.content.entries[${index}]`;
    requirePlainObject(entry, entryField);
    const domainTags = requireStringArray(
      entry.domainTags,
      `${entryField}.domainTags`,
      { allowEmpty: true },
    );
    return {
      answer: requireNonEmptyString(entry.answer, `${entryField}.answer`),
      clue: requireNonEmptyString(entry.clue, `${entryField}.clue`),
      domainTags: [...domainTags],
      generatedBy: requireNonEmptyString(
        entry.generatedBy,
        `${entryField}.generatedBy`,
      ),
      sourceEntryId: requireNonEmptyString(
        entry.sourceEntryId,
        `${entryField}.sourceEntryId`,
      ),
    };
  });
  const reportObject = requirePlainObject(report, `${field}.report`);
  const metrics = requirePlainObject(
    reportObject.metrics,
    `${field}.report.metrics`,
  );
  const quality = requirePlainObject(
    reportObject.quality,
    `${field}.report.quality`,
  );
  requireCondition(
    quality.pass === true,
    `${field}.report.quality.pass must be true before human review`,
  );
  return {
    entries,
    metrics: structuredClone(metrics),
    quality: structuredClone(quality),
  };
}

function validateEvidence(value, field) {
  requireExactKeys(value, EVIDENCE_KEYS, field);
  requireCondition(
    Array.isArray(value.entries) && value.entries.length > 0,
    `${field}.entries must be a non-empty array`,
  );
  for (const [index, entry] of value.entries.entries()) {
    const entryField = `${field}.entries[${index}]`;
    requireExactKeys(entry, EVIDENCE_ENTRY_KEYS, entryField);
    requireNonEmptyString(entry.answer, `${entryField}.answer`);
    requireNonEmptyString(entry.clue, `${entryField}.clue`);
    requireStringArray(entry.domainTags, `${entryField}.domainTags`, {
      allowEmpty: true,
    });
    requireNonEmptyString(entry.generatedBy, `${entryField}.generatedBy`);
    requireNonEmptyString(entry.sourceEntryId, `${entryField}.sourceEntryId`);
  }
  requirePlainObject(value.metrics, `${field}.metrics`);
  requirePlainObject(value.quality, `${field}.quality`);
  requireCondition(
    value.quality.pass === true,
    `${field}.quality.pass must be true`,
  );
  return value;
}

function reviewInputFromRow(row, field) {
  return {
    ...identityFromRow(row, field),
    evidence: structuredClone(
      validateEvidence(row.evidence, `${field}.evidence`),
    ),
  };
}

function reviewInputChecksum(rows) {
  return calculateCanonicalDocumentChecksum(
    rows.map((row, index) => reviewInputFromRow(row, `review input[${index}]`)),
  );
}

function manualFieldsFromRow(row) {
  const manualFields = {};
  for (const key of LAUNCH_BOARD_REVIEW_MANUAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      manualFields[key] = structuredClone(row[key]);
    }
  }
  return manualFields;
}

export function preserveManualReviewFields(nextRow, previousRow) {
  const pendingRow = Object.fromEntries(
    REVIEW_INPUT_ROW_KEYS.map((key) => [key, structuredClone(nextRow[key])]),
  );
  if (previousRow == null) return pendingRow;
  const previousReviewInput = reviewInputFromRow(
    previousRow,
    "previous review row",
  );
  const nextReviewInput = reviewInputFromRow(pendingRow, "next review row");
  if (
    canonicalizeForChecksum(previousReviewInput) !==
    canonicalizeForChecksum(nextReviewInput)
  ) {
    return pendingRow;
  }
  return { ...pendingRow, ...manualFieldsFromRow(previousRow) };
}

function fullSourceDescriptor(source) {
  return {
    mode: "catalog-report",
    catalogChecksum: source.catalogChecksum,
    generationReportChecksum: source.generationReportChecksum,
    generatorCommit: source.generatorCommit,
    generatorConfigHash: source.generatorConfigHash,
  };
}

export function createCatalogReportReviewInput(catalog, generationReport) {
  const source = deriveLaunchBoardReviewSource(catalog, generationReport);
  const reportByPuzzleId = new Map(
    generationReport.boards.map((board) => [board.puzzleId, board]),
  );
  const rows = source.boards.map((identity, index) => {
    const catalogBoard = requirePlainObject(
      catalog.boards[index + 3],
      `catalog generated board ${index}`,
    );
    const reportBoard = requirePlainObject(
      reportByPuzzleId.get(identity.puzzleId),
      `generation report board ${identity.puzzleId}`,
    );
    return {
      ...identity,
      evidence: evidenceFromBoard(
        catalogBoard.content,
        reportBoard,
        `generated board ${identity.puzzleId}`,
      ),
    };
  });
  requireCondition(
    rows.length === EXPECTED_GENERATED_BOARD_COUNT,
    `full review input must contain exactly ${EXPECTED_GENERATED_BOARD_COUNT} boards`,
  );
  return { source: fullSourceDescriptor(source), rows };
}

function checkpointIdentity(content, report, checkpoint, field) {
  requirePlainObject(content, `${field}.content`);
  requirePlainObject(report, `${field}.report`);
  requireCondition(
    content.puzzleId === report.puzzleId,
    `${field} content/report puzzleId mismatch`,
  );
  requireCondition(
    content.contentChecksum === report.contentChecksum,
    `${field} content/report contentChecksum mismatch`,
  );
  requireCondition(
    content.themeId === report.themeId &&
      content.difficulty === report.difficulty,
    `${field} content/report theme or difficulty mismatch`,
  );
  requireCondition(
    content.generatorCommit === checkpoint.generatorCommit &&
      report.generatorCommit === checkpoint.generatorCommit &&
      content.generatorConfigHash === checkpoint.generatorConfigHash &&
      report.generatorConfigHash === checkpoint.generatorConfigHash,
    `${field} generator identity is missing or stale`,
  );
  const contentSourceEntryIds = requireStringArray(
    content.entries?.map((entry) => entry?.sourceEntryId),
    `${field}.content sourceEntryIds`,
  );
  const reportSourceEntryIds = requireStringArray(
    report.entryProvenance?.map((entry) => entry?.sourceEntryId),
    `${field}.report sourceEntryIds`,
  );
  requireCanonicalEqual(
    reportSourceEntryIds,
    contentSourceEntryIds,
    `${field} content/report sourceEntryIds`,
  );
  return {
    puzzleId: requireNonEmptyString(content.puzzleId, `${field}.puzzleId`),
    contentChecksum: requireSha256(
      content.contentChecksum,
      `${field}.contentChecksum`,
    ),
    artifactPath: requireNonEmptyString(
      report.artifactPath,
      `${field}.artifactPath`,
    ),
    themeId: requireNonEmptyString(content.themeId, `${field}.themeId`),
    difficulty: requireNonEmptyString(
      content.difficulty,
      `${field}.difficulty`,
    ),
    sourceEntryIds: contentSourceEntryIds,
  };
}

export async function createCheckpointReviewInput(checkpointRoot) {
  const checkpointPath = path.join(checkpointRoot, "checkpoint.json");
  const checkpoint = await readJson(checkpointPath, "generation checkpoint");
  requireExactKeys(checkpoint, CHECKPOINT_KEYS, "generation checkpoint");
  requireCondition(
    checkpoint.schemaVersion === CHECKPOINT_SCHEMA_VERSION,
    `generation checkpoint.schemaVersion must be ${CHECKPOINT_SCHEMA_VERSION}`,
  );
  requireCommit(
    checkpoint.generatorCommit,
    "generation checkpoint.generatorCommit",
  );
  requireSha256(
    checkpoint.generatorConfigHash,
    "generation checkpoint.generatorConfigHash",
  );
  requireCondition(
    path.basename(path.resolve(checkpointRoot)) ===
      checkpoint.generatorConfigHash.slice("sha256:".length),
    "generation checkpoint directory must match generatorConfigHash",
  );
  const routePuzzleIds = requireStringArray(
    checkpoint.routePuzzleIds,
    "generation checkpoint.routePuzzleIds",
  );
  requireCondition(
    routePuzzleIds.length === EXPECTED_GENERATED_BOARD_COUNT,
    `generation checkpoint must seal exactly ${EXPECTED_GENERATED_BOARD_COUNT} route puzzle IDs`,
  );
  requireCondition(
    Array.isArray(checkpoint.completed) &&
      checkpoint.completed.length <= EXPECTED_GENERATED_BOARD_COUNT,
    "generation checkpoint.completed must be a bounded array",
  );
  const rows = [];
  for (const [index, completed] of checkpoint.completed.entries()) {
    const field = `generation checkpoint.completed[${index}]`;
    requireExactKeys(completed, CHECKPOINT_COMPLETED_KEYS, field);
    requireCondition(
      completed.puzzleId === routePuzzleIds[index],
      `${field} must be the exact verified route prefix`,
    );
    requireCondition(
      PUZZLE_ID_PATTERN.test(completed.puzzleId),
      `${field}.puzzleId is unsafe for checkpoint file lookup`,
    );
    requireSha256(completed.contentSha256, `${field}.contentSha256`);
    requireSha256(completed.reportSha256, `${field}.reportSha256`);
    const content = await readJson(
      path.join(checkpointRoot, "boards", `${completed.puzzleId}.json`),
      `${field} board`,
    );
    const report = await readJson(
      path.join(checkpointRoot, "reports", `${completed.puzzleId}.json`),
      `${field} report`,
    );
    requireCondition(
      calculateCanonicalDocumentChecksum(content) === completed.contentSha256,
      `${field} board SHA-256 is missing or stale`,
    );
    requireCondition(
      calculateCanonicalDocumentChecksum(report) === completed.reportSha256,
      `${field} report SHA-256 is missing or stale`,
    );
    const identity = checkpointIdentity(content, report, checkpoint, field);
    rows.push({
      ...identity,
      evidence: evidenceFromBoard(content, report, field),
    });
  }
  const rereadCheckpoint = await readJson(
    checkpointPath,
    "generation checkpoint stability check",
  );
  requireCanonicalEqual(
    rereadCheckpoint,
    checkpoint,
    "generation checkpoint changed while preparing review input",
  );
  return {
    source: {
      mode: "checkpoint",
      checkpointChecksum: calculateCanonicalDocumentChecksum(checkpoint),
      generatorCommit: checkpoint.generatorCommit,
      generatorConfigHash: checkpoint.generatorConfigHash,
    },
    rows,
  };
}

function validateSourceDescriptor(source, field, { requireFull = false } = {}) {
  requirePlainObject(source, field);
  if (source.mode === "catalog-report") {
    requireExactKeys(source, FULL_SOURCE_KEYS, field);
    requireSha256(source.catalogChecksum, `${field}.catalogChecksum`);
    requireSha256(
      source.generationReportChecksum,
      `${field}.generationReportChecksum`,
    );
  } else {
    requireCondition(
      !requireFull && source.mode === "checkpoint",
      `${field}.mode must be catalog-report${requireFull ? " for final assembly" : " or checkpoint"}`,
    );
    requireExactKeys(source, CHECKPOINT_SOURCE_KEYS, field);
    requireSha256(source.checkpointChecksum, `${field}.checkpointChecksum`);
  }
  requireCommit(source.generatorCommit, `${field}.generatorCommit`);
  requireSha256(source.generatorConfigHash, `${field}.generatorConfigHash`);
  return source;
}

function shardRelativePath(startIndex, endIndexExclusive) {
  const start = String(startIndex + 1).padStart(3, "0");
  const end = String(endIndexExclusive).padStart(3, "0");
  return `shards/boards-${start}-${end}.json`;
}

function validateShardDescriptor(descriptor, field, boardCount) {
  requireExactKeys(descriptor, SHARD_DESCRIPTOR_KEYS, field);
  requireInteger(descriptor.shardIndex, `${field}.shardIndex`, {
    maximum: EXPECTED_GENERATED_BOARD_COUNT,
  });
  requireInteger(descriptor.startIndex, `${field}.startIndex`, {
    maximum: boardCount,
  });
  requireInteger(descriptor.endIndexExclusive, `${field}.endIndexExclusive`, {
    maximum: boardCount,
  });
  requireCondition(
    descriptor.endIndexExclusive > descriptor.startIndex,
    `${field} must cover at least one board`,
  );
  requireCondition(
    descriptor.boardCount ===
      descriptor.endIndexExclusive - descriptor.startIndex,
    `${field}.boardCount does not match its range`,
  );
  requireCondition(
    descriptor.path ===
      shardRelativePath(descriptor.startIndex, descriptor.endIndexExclusive),
    `${field}.path is not the canonical contained shard path`,
  );
  requireSha256(descriptor.reviewInputChecksum, `${field}.reviewInputChecksum`);
}

function validateWorkbook(workbook, { requireFull = false } = {}) {
  requireCandidateFlags(
    workbook,
    "review workbook",
    LAUNCH_BOARD_REVIEW_WORKBOOK_SCHEMA_VERSION,
  );
  requireExactKeys(workbook, WORKBOOK_KEYS, "review workbook");
  validateSourceDescriptor(workbook.source, "review workbook.source", {
    requireFull,
  });
  requireInteger(workbook.boardCount, "review workbook.boardCount", {
    maximum: EXPECTED_GENERATED_BOARD_COUNT,
  });
  requireInteger(workbook.shardSize, "review workbook.shardSize", {
    minimum: 1,
    maximum: EXPECTED_GENERATED_BOARD_COUNT,
  });
  requireCondition(
    Array.isArray(workbook.shards),
    "review workbook.shards must be an array",
  );
  let nextStartIndex = 0;
  for (const [index, descriptor] of workbook.shards.entries()) {
    const field = `review workbook.shards[${index}]`;
    validateShardDescriptor(descriptor, field, workbook.boardCount);
    requireCondition(
      descriptor.shardIndex === index &&
        descriptor.startIndex === nextStartIndex,
      `${field} must be an ordered contiguous shard`,
    );
    requireCondition(
      descriptor.boardCount <= workbook.shardSize,
      `${field} exceeds review workbook.shardSize`,
    );
    nextStartIndex = descriptor.endIndexExclusive;
  }
  requireCondition(
    nextStartIndex === workbook.boardCount,
    "review workbook shards do not exactly cover boardCount",
  );
  return workbook;
}

async function loadExistingRows(workbookRoot) {
  const workbookPath = path.join(workbookRoot, "workbook.json");
  const workbook = await readOptionalJson(
    workbookPath,
    "existing review workbook",
  );
  if (workbook == null) return new Map();
  validateWorkbook(workbook);
  const rowsByPuzzleId = new Map();
  for (const [index, descriptor] of workbook.shards.entries()) {
    const field = `existing review shard ${index}`;
    const shard = await readJson(
      path.join(workbookRoot, descriptor.path),
      field,
    );
    requireCandidateFlags(
      shard,
      field,
      LAUNCH_BOARD_REVIEW_SHARD_SCHEMA_VERSION,
    );
    requireExactKeys(shard, SHARD_KEYS, field);
    requireCanonicalEqual(shard.source, workbook.source, `${field}.source`);
    for (const key of ["shardIndex", "startIndex", "endIndexExclusive"]) {
      requireCondition(
        shard[key] === descriptor[key],
        `${field}.${key} does not match workbook.json`,
      );
    }
    requireCondition(
      Array.isArray(shard.boards) &&
        shard.boards.length === descriptor.boardCount,
      `${field}.boards does not match workbook.json`,
    );
    const reviewInputs = [];
    for (const [rowIndex, row] of shard.boards.entries()) {
      const rowField = `${field}.boards[${rowIndex}]`;
      requirePlainObject(row, rowField);
      const allowedKeys = new Set(COMPLETED_REVIEW_ROW_KEYS);
      requireCondition(
        Object.keys(row).every((key) => allowedKeys.has(key)),
        `${rowField} contains an unknown key; refusing to discard possible human input`,
      );
      const reviewInput = reviewInputFromRow(row, rowField);
      reviewInputs.push(reviewInput);
      const puzzleId = reviewInput.puzzleId;
      requireCondition(
        !rowsByPuzzleId.has(puzzleId),
        `existing review workbook has duplicate puzzleId ${puzzleId}`,
      );
      rowsByPuzzleId.set(puzzleId, row);
    }
    const actualReviewInputChecksum = reviewInputChecksum(reviewInputs);
    requireCondition(
      shard.reviewInputChecksum === actualReviewInputChecksum &&
        descriptor.reviewInputChecksum === actualReviewInputChecksum,
      `${field} reviewInputChecksum is missing or stale`,
    );
  }
  return rowsByPuzzleId;
}

export async function prepareLaunchBoardReviewWorkbook({
  catalogPath,
  generationReportPath,
  checkpointRoot,
  workbookRoot,
  shardSize = DEFAULT_SHARD_SIZE,
}) {
  requireInteger(shardSize, "shardSize", {
    minimum: 1,
    maximum: EXPECTED_GENERATED_BOARD_COUNT,
  });
  requireCondition(
    (checkpointRoot == null) !==
      (catalogPath == null || generationReportPath == null),
    "prepare requires either --checkpoint or both catalog and generation report",
  );
  const reviewInput =
    checkpointRoot == null
      ? createCatalogReportReviewInput(
          await readJson(catalogPath, "launch catalog"),
          await readJson(generationReportPath, "launch generation report"),
        )
      : await createCheckpointReviewInput(checkpointRoot);
  const existingRows = await loadExistingRows(workbookRoot);
  const rows = reviewInput.rows.map((row) =>
    preserveManualReviewFields(row, existingRows.get(row.puzzleId)),
  );
  const shards = [];
  for (let startIndex = 0; startIndex < rows.length; startIndex += shardSize) {
    const endIndexExclusive = Math.min(startIndex + shardSize, rows.length);
    const shardRows = rows.slice(startIndex, endIndexExclusive);
    const relativePath = shardRelativePath(startIndex, endIndexExclusive);
    const checksum = reviewInputChecksum(shardRows);
    const shardIndex = shards.length;
    await writeJsonAtomically(path.join(workbookRoot, relativePath), {
      schemaVersion: LAUNCH_BOARD_REVIEW_SHARD_SCHEMA_VERSION,
      artifactStatus: "candidate",
      activationApproved: false,
      source: reviewInput.source,
      shardIndex,
      startIndex,
      endIndexExclusive,
      reviewInputChecksum: checksum,
      boards: shardRows,
    });
    shards.push({
      shardIndex,
      path: relativePath,
      startIndex,
      endIndexExclusive,
      boardCount: shardRows.length,
      reviewInputChecksum: checksum,
    });
  }
  const workbook = {
    schemaVersion: LAUNCH_BOARD_REVIEW_WORKBOOK_SCHEMA_VERSION,
    artifactStatus: "candidate",
    activationApproved: false,
    source: reviewInput.source,
    boardCount: rows.length,
    shardSize,
    shards,
  };
  validateWorkbook(workbook);
  await writeJsonAtomically(path.join(workbookRoot, "workbook.json"), workbook);
  return { workbook, rows };
}

async function loadCompletedWorkbookRows(workbookRoot, expectedReviewInput) {
  const workbook = validateWorkbook(
    await readJson(path.join(workbookRoot, "workbook.json"), "review workbook"),
    { requireFull: true },
  );
  requireCanonicalEqual(
    workbook.source,
    expectedReviewInput.source,
    "review workbook source identity",
  );
  requireCondition(
    workbook.boardCount === EXPECTED_GENERATED_BOARD_COUNT,
    `final assembly requires exactly ${EXPECTED_GENERATED_BOARD_COUNT} review rows`,
  );
  const completedRows = [];
  for (const [index, descriptor] of workbook.shards.entries()) {
    const field = `review shard ${index}`;
    const shard = await readJson(
      path.join(workbookRoot, descriptor.path),
      field,
    );
    requireCandidateFlags(
      shard,
      field,
      LAUNCH_BOARD_REVIEW_SHARD_SCHEMA_VERSION,
    );
    requireExactKeys(shard, SHARD_KEYS, field);
    requireCanonicalEqual(shard.source, workbook.source, `${field}.source`);
    for (const key of ["shardIndex", "startIndex", "endIndexExclusive"]) {
      requireCondition(
        shard[key] === descriptor[key],
        `${field}.${key} does not match workbook.json`,
      );
    }
    requireCondition(
      Array.isArray(shard.boards) &&
        shard.boards.length === descriptor.boardCount,
      `${field}.boards does not match workbook.json`,
    );
    const expectedRows = expectedReviewInput.rows.slice(
      descriptor.startIndex,
      descriptor.endIndexExclusive,
    );
    const actualReviewInputs = shard.boards.map((row, rowIndex) => {
      requireExactKeys(
        row,
        COMPLETED_REVIEW_ROW_KEYS,
        `${field}.boards[${rowIndex}]`,
      );
      return reviewInputFromRow(row, `${field}.boards[${rowIndex}]`);
    });
    const actualChecksum = reviewInputChecksum(actualReviewInputs);
    requireCondition(
      descriptor.reviewInputChecksum === actualChecksum &&
        shard.reviewInputChecksum === actualChecksum,
      `${field} reviewInputChecksum is missing or stale`,
    );
    requireCanonicalEqual(
      actualReviewInputs,
      expectedRows,
      `${field} catalog/report review evidence`,
    );
    completedRows.push(...shard.boards);
  }
  return completedRows;
}

function finalLedgerRow(row) {
  const result = {};
  for (const key of [
    ...LAUNCH_BOARD_REVIEW_IDENTITY_KEYS,
    ...LAUNCH_BOARD_REVIEW_MANUAL_KEYS,
  ]) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      result[key] = structuredClone(row[key]);
    }
  }
  return result;
}

export async function assembleLaunchBoardReviewLedger({
  catalogPath,
  generationReportPath,
  workbookRoot,
  outputPath,
}) {
  const catalog = await readJson(catalogPath, "launch catalog");
  const generationReport = await readJson(
    generationReportPath,
    "launch generation report",
  );
  const reviewInput = createCatalogReportReviewInput(catalog, generationReport);
  const completedRows = await loadCompletedWorkbookRows(
    workbookRoot,
    reviewInput,
  );
  const ledger = {
    schemaVersion: LAUNCH_BOARD_REVIEW_LEDGER_SCHEMA_VERSION,
    artifactStatus: "candidate",
    activationApproved: false,
    catalogChecksum: reviewInput.source.catalogChecksum,
    generationReportChecksum: reviewInput.source.generationReportChecksum,
    generatorCommit: reviewInput.source.generatorCommit,
    generatorConfigHash: reviewInput.source.generatorConfigHash,
    boards: completedRows.map(finalLedgerRow),
  };
  validateLaunchBoardReviewLedger(catalog, generationReport, ledger);

  const stableCatalog = await readJson(catalogPath, "stable launch catalog");
  const stableGenerationReport = await readJson(
    generationReportPath,
    "stable launch generation report",
  );
  const stableReviewInput = createCatalogReportReviewInput(
    stableCatalog,
    stableGenerationReport,
  );
  requireCanonicalEqual(
    stableReviewInput.source,
    reviewInput.source,
    "catalog/report changed during final review assembly",
  );
  validateLaunchBoardReviewLedger(
    stableCatalog,
    stableGenerationReport,
    ledger,
  );
  await writeJsonAtomically(outputPath, ledger);
  return ledger;
}

function parseCli(argv) {
  const [command, ...rawArguments] = argv;
  requireCondition(
    command === "prepare" || command === "assemble",
    "usage: launch-board-review-workbook.mjs <prepare|assemble> [--name=value]",
  );
  const options = {};
  for (const rawArgument of rawArguments) {
    const match = /^--([a-z-]+)=(.+)$/.exec(rawArgument);
    requireCondition(match != null, `invalid argument ${rawArgument}`);
    const [, key, value] = match;
    requireCondition(options[key] == null, `duplicate argument --${key}`);
    options[key] = value;
  }
  const allowed = new Set([
    "catalog",
    "report",
    "checkpoint",
    "workbook",
    "output",
    "shard-size",
  ]);
  for (const key of Object.keys(options)) {
    requireCondition(allowed.has(key), `unknown argument --${key}`);
  }
  requireCondition(
    !(
      options.checkpoint != null &&
      (options.catalog != null || options.report != null)
    ),
    "--checkpoint cannot be combined with --catalog or --report",
  );
  requireCondition(
    command === "assemble" || options.output == null,
    "--output is only valid for assemble",
  );
  requireCondition(
    command === "prepare" || options.checkpoint == null,
    "assemble does not accept --checkpoint; prepare again from final catalog/report",
  );
  const resolveOption = (value, fallback) =>
    path.resolve(repositoryRoot, value ?? fallback);
  const common = {
    catalogPath: resolveOption(
      options.catalog,
      "public/game-content/v1/ko-KR/candidates/catalog.json",
    ),
    generationReportPath: resolveOption(
      options.report,
      "public/game-content/v1/ko-KR/candidates/generation-report.json",
    ),
    workbookRoot: resolveOption(
      options.workbook,
      "tmp/launch-board-review-workbook",
    ),
  };
  if (command === "prepare") {
    const shardSize =
      options["shard-size"] == null
        ? DEFAULT_SHARD_SIZE
        : Number(options["shard-size"]);
    return {
      command,
      arguments: {
        ...common,
        catalogPath: options.checkpoint == null ? common.catalogPath : null,
        generationReportPath:
          options.checkpoint == null ? common.generationReportPath : null,
        checkpointRoot:
          options.checkpoint == null
            ? null
            : resolveOption(options.checkpoint, ""),
        shardSize,
      },
    };
  }
  return {
    command,
    arguments: {
      ...common,
      outputPath: resolveOption(
        options.output,
        "data/game-content/v1/ko-KR/reviews/launch-board-review-ledger.json",
      ),
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseCli(argv);
  if (parsed.command === "prepare") {
    const result = await prepareLaunchBoardReviewWorkbook(parsed.arguments);
    console.log(
      `Prepared ${result.workbook.boardCount} pending review rows in ${result.workbook.shards.length} shards (${result.workbook.source.mode}).`,
    );
    return;
  }
  const ledger = await assembleLaunchBoardReviewLedger(parsed.arguments);
  console.log(
    `Assembled ${ledger.boards.length} approved human reviews without activating content.`,
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
