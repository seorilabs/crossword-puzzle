import { createHash } from "node:crypto";

import { canonicalizeForChecksum } from "../packages/crossword-core/src/saveV2.ts";

export const LAUNCH_BOARD_REVIEW_LEDGER_SCHEMA_VERSION =
  "game-content-launch-board-review-ledger/1";

const CATALOG_SCHEMA_VERSION = "launch-content-catalog/1";
const GENERATION_REPORT_SCHEMA_VERSION = "ko-kr-launch-generation-report/8";
const GENERATOR_CONFIG_SCHEMA_VERSION = "ko-kr-launch-generator-config/11";
const EXPECTED_DAILY_CONNECTOR_RANKING_POLICY = Object.freeze({
  policyId: "ko-kr-launch-daily-connector-theme-coverage-v2",
  coverageScope:
    "greedy-prefix-over-distinct-theme-owner-answers-in-current-route-pool",
  sharedThemeCellDefinition:
    "unique-answer-cell-values-present-in-at-least-one-theme-answer",
  connectorOrder: Object.freeze([
    "max-marginal-uncovered-theme-owner-count",
    "max-distinct-shared-theme-cell-count",
    "max-theme-word-degree",
    "max-answer-cell-count",
    "max-connector-word-degree",
    "min-review-ledger-index",
    "stable-input-order",
  ]),
});
const EXPECTED_LAUNCH_ACCEPTED_CANDIDATE_POLICY = Object.freeze({
  policyId: "ko-kr-launch-future-pool-lookahead-v3",
  defaultRetries: 8,
  acceptedLookaheadRetries: 1,
  edgeDefinition:
    "unique-answer-pairs-sharing-at-least-one-cell-after-next-route-filter-and-rerank",
  multiPositionDefinition:
    "maximum-matching-of-distinct-answer-cell-positions-to-clue-compatible-distinct-partner-answers-at-least-two",
  candidateAnswerOrder: "unique-answers-ascending-js-code-unit",
  dailyOrder: Object.freeze([
    "min-isolated-theme-owners",
    "max-usable-multi-position-theme-owners",
    "max-usable-multi-position-answers",
    "max-theme-connector-edges",
    "max-total-edges",
    "min-cooldown-answer-count",
    "stable-generation-order",
  ]),
  otherOrder: Object.freeze([
    "max-usable-multi-position-answers",
    "max-total-edges",
    "min-cooldown-answer-count",
    "stable-generation-order",
  ]),
});
const EXPECTED_SEARCH_QUALITY_POLICY = Object.freeze({
  policyId: "ko-kr-launch-search-quality-alignment-v3",
  evaluator: "route-quality-plus-connected-components",
  maxConnectedComponents: 1,
  placementIntersectionDefinition: "preexisting-matching-letter-cell-only",
  scoringPolicy: Object.freeze({
    policyId: "launch-quality-aligned-v2",
    denseConnectivityAdmission: "actual-overlap-or-bridging-auto-run",
    placementIntersectionScoreBasis: "actual-overlap",
    qualityBeforeBranchLimit: true,
    qualityBeamRanking: "quality-score",
    weights: Object.freeze({
      boardAutoRunCount: 0,
      boardMultiIntersection: 300,
      denseBridgingAutoRunCount: 0,
      directAutoRunCount: 0,
      autoRunExtraCell: 0,
    }),
  }),
  compactFallback: Object.freeze({
    policyId: "launch-compact-connected-dfs-v3",
    activationScope: "launch-builder-difficulty-aware-after-standard-no-pass",
    activationByDifficulty: Object.freeze({
      easy: "each-retry-after-current-standard-search-has-no-pass",
      normal: "each-retry-after-current-standard-search-has-no-pass",
      hard: "final-retry-of-each-phase-after-all-standard-searches-have-no-pass",
    }),
    initialSymmetry: "each-word-across-at-origin-then-global-candidate-ranking",
    connectivity: "every-placement-after-first-overlaps-an-existing-letter",
    intermediateRunPolicy: "all-maximal-runs-known-unique-and-accepted",
    bboxAreaLimit: "board-size-times-ceiling-half-board-size",
    maxNodeCount: 25_000,
    maxCandidateCount: 1,
    finalAcceptance: "full-route-quality-pass-only",
  }),
});
const EXPECTED_FIRST_RUN_BOARD_COUNT = 3;
const EXPECTED_GENERATED_BOARD_COUNT = 90;
const GENERATED_ROUTE_KINDS = Object.freeze([
  "chapter",
  "daily",
  "bonus",
  "weekly-challenge",
]);
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const REVIEW_CHECK_KEYS = Object.freeze([
  "themeSemantics",
  "clueAnswerUniqueness",
  "toneSafety",
  "difficultyFit",
]);
const LEDGER_KEYS = Object.freeze([
  "schemaVersion",
  "artifactStatus",
  "activationApproved",
  "catalogChecksum",
  "generationReportChecksum",
  "generatorCommit",
  "generatorConfigHash",
  "boards",
]);
const REVIEW_ROW_KEYS = Object.freeze([
  "puzzleId",
  "contentChecksum",
  "artifactPath",
  "themeId",
  "difficulty",
  "sourceEntryIds",
  "reviewerId",
  "reviewedAt",
  "note",
  "decision",
  "checks",
]);

export const LAUNCH_BOARD_REVIEW_IDENTITY_KEYS = Object.freeze([
  "puzzleId",
  "contentChecksum",
  "artifactPath",
  "themeId",
  "difficulty",
  "sourceEntryIds",
]);

export const LAUNCH_BOARD_REVIEW_MANUAL_KEYS = Object.freeze([
  "reviewerId",
  "reviewedAt",
  "note",
  "decision",
  "checks",
]);

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
    `${field} keys must exactly match the ledger contract`,
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

function requireIsoTimestamp(value, field) {
  requireCondition(
    typeof value === "string" &&
      ISO_TIMESTAMP_PATTERN.test(value) &&
      !Number.isNaN(Date.parse(value)),
    `${field} must be an ISO timestamp`,
  );
  return value;
}

function requireCandidateArtifact(value, field, schemaVersion) {
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

function requireStringArray(value, field) {
  requireCondition(
    Array.isArray(value) && value.length > 0,
    `${field} must be a non-empty array`,
  );
  for (const [index, item] of value.entries()) {
    requireNonEmptyString(item, `${field}[${index}]`);
  }
  requireUniqueStrings(value, field);
  return value;
}

function requireUniqueStrings(values, field) {
  requireCondition(
    values.length === new Set(values).size,
    `${field} values must be unique`,
  );
}

function requireExact(actual, expected, field) {
  requireCondition(
    canonicalizeForChecksum(actual) === canonicalizeForChecksum(expected),
    `${field} does not exactly match the approved source`,
  );
}

function sourceEntryIdsFromCatalogBoard(board, field) {
  requirePlainObject(board, field);
  requirePlainObject(board.content, `${field}.content`);
  requireCondition(
    Array.isArray(board.content.entries) && board.content.entries.length > 0,
    `${field}.content.entries must be a non-empty array`,
  );
  const sourceEntryIds = board.content.entries.map((entry, index) => {
    requirePlainObject(entry, `${field}.content.entries[${index}]`);
    return requireNonEmptyString(
      entry.sourceEntryId,
      `${field}.content.entries[${index}].sourceEntryId`,
    );
  });
  requireUniqueStrings(sourceEntryIds, `${field}.content sourceEntryId`);
  return sourceEntryIds;
}

function sourceEntryIdsFromReportBoard(board, field) {
  requirePlainObject(board, field);
  requireCondition(
    Array.isArray(board.entryProvenance) && board.entryProvenance.length > 0,
    `${field}.entryProvenance must be a non-empty array`,
  );
  const sourceEntryIds = board.entryProvenance.map((entry, index) => {
    requirePlainObject(entry, `${field}.entryProvenance[${index}]`);
    return requireNonEmptyString(
      entry.sourceEntryId,
      `${field}.entryProvenance[${index}].sourceEntryId`,
    );
  });
  requireUniqueStrings(
    sourceEntryIds,
    `${field}.entryProvenance sourceEntryId`,
  );
  return sourceEntryIds;
}

function validateReportBoardWordPoolEvidence(board, field) {
  const selectedWordPool = requirePlainObject(
    board.wordPool,
    `${field}.wordPool`,
  );
  requireSha256(
    selectedWordPool.answerSetSha256,
    `${field}.wordPool.answerSetSha256`,
  );
  requireCondition(
    Number.isSafeInteger(board.selectedRetryIndex) &&
      board.selectedRetryIndex >= 0,
    `${field}.selectedRetryIndex must be a non-negative safe integer`,
  );
  requireCondition(
    Array.isArray(board.attempts) && board.attempts.length > 0,
    `${field}.attempts must be a non-empty array`,
  );
  for (const [attemptIndex, attempt] of board.attempts.entries()) {
    const attemptWordPool = requirePlainObject(
      requirePlainObject(attempt, `${field}.attempts[${attemptIndex}]`)
        .wordPool,
      `${field}.attempts[${attemptIndex}].wordPool`,
    );
    requireSha256(
      attemptWordPool.answerSetSha256,
      `${field}.attempts[${attemptIndex}].wordPool.answerSetSha256`,
    );
  }
  const selectedAttempt = requirePlainObject(
    board.attempts[board.selectedRetryIndex],
    `${field}.attempts[selectedRetryIndex]`,
  );
  requireExact(
    selectedWordPool,
    selectedAttempt.wordPool,
    `${field}.wordPool/selected attempt wordPool`,
  );
}

function expectedReviewIdentity(catalogBoard, field) {
  const content = catalogBoard.content;
  return {
    puzzleId: requireNonEmptyString(content.puzzleId, `${field}.puzzleId`),
    contentChecksum: requireSha256(
      content.contentChecksum,
      `${field}.contentChecksum`,
    ),
    artifactPath: requireNonEmptyString(
      catalogBoard.artifactPath,
      `${field}.artifactPath`,
    ),
    themeId: requireNonEmptyString(content.themeId, `${field}.themeId`),
    difficulty: requireNonEmptyString(
      content.difficulty,
      `${field}.difficulty`,
    ),
    sourceEntryIds: sourceEntryIdsFromCatalogBoard(catalogBoard, field),
  };
}

function validateReviewMetadata(row, field) {
  requireExactKeys(row, REVIEW_ROW_KEYS, field);
  requireNonEmptyString(row.reviewerId, `${field}.reviewerId`);
  requireIsoTimestamp(row.reviewedAt, `${field}.reviewedAt`);
  requireNonEmptyString(row.note, `${field}.note`);
  requireCondition(
    row.decision === "approve",
    `${field}.decision must be approve`,
  );
  requireExactKeys(row.checks, REVIEW_CHECK_KEYS, `${field}.checks`);
  for (const check of REVIEW_CHECK_KEYS) {
    requireCondition(
      row.checks[check] === true,
      `${field}.checks.${check} must be true`,
    );
  }
}

export function calculateCanonicalDocumentChecksum(value) {
  return `sha256:${createHash("sha256")
    .update(canonicalizeForChecksum(value), "utf8")
    .digest("hex")}`;
}

export function deriveLaunchBoardReviewSource(catalog, generationReport) {
  requireCandidateArtifact(catalog, "catalog", CATALOG_SCHEMA_VERSION);
  requireCandidateArtifact(
    generationReport,
    "generation report",
    GENERATION_REPORT_SCHEMA_VERSION,
  );

  const catalogChecksum = calculateCanonicalDocumentChecksum(catalog);
  const generationReportChecksum =
    calculateCanonicalDocumentChecksum(generationReport);

  const generator = requirePlainObject(
    generationReport.generator,
    "generation report.generator",
  );
  requireCondition(
    typeof generator.commit === "string" &&
      COMMIT_PATTERN.test(generator.commit),
    "generation report generator commit is invalid",
  );
  requireSha256(generator.configHash, "generation report.generator.configHash");
  const generatorConfig = requirePlainObject(
    generator.config,
    "generation report.generator.config",
  );
  requireCondition(
    generatorConfig.schemaVersion === GENERATOR_CONFIG_SCHEMA_VERSION,
    `generation report.generator.config.schemaVersion must be ${GENERATOR_CONFIG_SCHEMA_VERSION}`,
  );
  requireExact(
    generatorConfig.dailyConnectorRanking,
    EXPECTED_DAILY_CONNECTOR_RANKING_POLICY,
    "generation report.generator.config.dailyConnectorRanking",
  );
  requireExact(
    generatorConfig.acceptedCandidateSelection,
    EXPECTED_LAUNCH_ACCEPTED_CANDIDATE_POLICY,
    "generation report.generator.config.acceptedCandidateSelection",
  );
  requireExact(
    generatorConfig.searchQuality,
    EXPECTED_SEARCH_QUALITY_POLICY,
    "generation report.generator.config.searchQuality",
  );
  requireCondition(
    generator.configHash ===
      calculateCanonicalDocumentChecksum(generatorConfig),
    "generation report generator configHash does not match generator.config",
  );
  requireCondition(
    Array.isArray(catalog.boards),
    "catalog.boards must be an array",
  );
  requireCondition(
    catalog.boards.length ===
      EXPECTED_FIRST_RUN_BOARD_COUNT + EXPECTED_GENERATED_BOARD_COUNT,
    "catalog must contain exactly 3 first-run and 90 generated boards",
  );
  for (const [index, board] of catalog.boards.entries()) {
    const route = requirePlainObject(
      board?.route,
      `catalog.boards[${index}].route`,
    );
    const routeAllowed =
      index < EXPECTED_FIRST_RUN_BOARD_COUNT
        ? route.kind === "first-run"
        : GENERATED_ROUTE_KINDS.includes(route.kind);
    requireCondition(
      routeAllowed,
      "catalog first-run boards must be exactly the first three boards and all remaining boards must use a generated route kind",
    );
  }

  const generatedCatalogBoards = catalog.boards.slice(
    EXPECTED_FIRST_RUN_BOARD_COUNT,
  );
  requireCondition(
    Array.isArray(generationReport.boards) &&
      generationReport.boards.length === EXPECTED_GENERATED_BOARD_COUNT,
    "generation report must contain exactly 90 generated boards",
  );
  const allCatalogPuzzleIds = catalog.boards.map(
    (board, index) =>
      requirePlainObject(board?.content, `catalog.boards[${index}].content`)
        .puzzleId,
  );
  for (const [index, puzzleId] of allCatalogPuzzleIds.entries()) {
    requireNonEmptyString(puzzleId, `catalog puzzleId[${index}]`);
  }
  requireUniqueStrings(allCatalogPuzzleIds, "catalog puzzleId");
  const generatedCatalogPuzzleIds = allCatalogPuzzleIds.slice(
    EXPECTED_FIRST_RUN_BOARD_COUNT,
  );
  const reportPuzzleIds = generationReport.boards.map(
    (board) => board?.puzzleId,
  );
  for (const [field, puzzleIds] of [
    ["catalog generated puzzleId", generatedCatalogPuzzleIds],
    ["generation report puzzleId", reportPuzzleIds],
  ]) {
    for (const [index, puzzleId] of puzzleIds.entries()) {
      requireNonEmptyString(puzzleId, `${field}[${index}]`);
    }
    requireUniqueStrings(puzzleIds, field);
  }
  // Report rows follow generation-queue order. Human review rows deliberately
  // follow catalog order, so the report must be joined by its sealed identity.
  const reportByPuzzleId = new Map(
    generationReport.boards.map((board) => [board.puzzleId, board]),
  );
  const boards = [];

  for (let index = 0; index < EXPECTED_GENERATED_BOARD_COUNT; index += 1) {
    const catalogIndex = index + EXPECTED_FIRST_RUN_BOARD_COUNT;
    const catalogBoard = generatedCatalogBoards[index];
    const expected = expectedReviewIdentity(
      catalogBoard,
      `catalog.boards[${catalogIndex}]`,
    );
    const reportBoard = requirePlainObject(
      reportByPuzzleId.get(expected.puzzleId),
      `generation report board ${expected.puzzleId}`,
    );
    const reportSourceEntryIds = sourceEntryIdsFromReportBoard(
      reportBoard,
      `generation report board ${expected.puzzleId}`,
    );
    validateReportBoardWordPoolEvidence(
      reportBoard,
      `generation report board ${expected.puzzleId}`,
    );

    requireExact(
      {
        puzzleId: reportBoard.puzzleId,
        contentChecksum: reportBoard.contentChecksum,
        artifactPath: reportBoard.artifactPath,
        themeId: reportBoard.themeId,
        difficulty: reportBoard.difficulty,
        sourceEntryIds: reportSourceEntryIds,
      },
      expected,
      `generation report/catalog board ${index}`,
    );
    requireCondition(
      reportBoard.generatorCommit === generator.commit &&
        reportBoard.generatorConfigHash === generator.configHash &&
        catalogBoard.content.generatorCommit === generator.commit &&
        catalogBoard.content.generatorConfigHash === generator.configHash,
      `generator identity mismatch at generated board ${index}`,
    );
    boards.push(expected);
  }

  return {
    catalogChecksum,
    generationReportChecksum,
    generatorCommit: generator.commit,
    generatorConfigHash: generator.configHash,
    boards,
  };
}

export function validateLaunchBoardReviewLedger(
  catalog,
  generationReport,
  ledger,
) {
  requireCandidateArtifact(
    ledger,
    "review ledger",
    LAUNCH_BOARD_REVIEW_LEDGER_SCHEMA_VERSION,
  );
  requireExactKeys(ledger, LEDGER_KEYS, "review ledger");

  const source = deriveLaunchBoardReviewSource(catalog, generationReport);
  requireCondition(
    ledger.catalogChecksum === source.catalogChecksum,
    "review ledger catalogChecksum is missing or stale",
  );
  requireCondition(
    ledger.generationReportChecksum === source.generationReportChecksum,
    "review ledger generationReportChecksum is missing or stale",
  );
  requireCondition(
    ledger.generatorCommit === source.generatorCommit &&
      ledger.generatorConfigHash === source.generatorConfigHash,
    "review ledger generator identity is missing or stale",
  );
  requireCondition(
    Array.isArray(ledger.boards) &&
      ledger.boards.length === EXPECTED_GENERATED_BOARD_COUNT,
    "review ledger must contain exactly 90 generated board reviews",
  );

  const ledgerPuzzleIds = ledger.boards.map((board) => board?.puzzleId);
  for (const [index, puzzleId] of ledgerPuzzleIds.entries()) {
    requireNonEmptyString(puzzleId, `review ledger puzzleId[${index}]`);
  }
  requireUniqueStrings(ledgerPuzzleIds, "review ledger puzzleId");

  for (const [index, expected] of source.boards.entries()) {
    const reviewRow = requirePlainObject(
      ledger.boards[index],
      `review ledger.boards[${index}]`,
    );
    validateReviewMetadata(reviewRow, `review ledger.boards[${index}]`);
    requireExact(
      {
        puzzleId: reviewRow.puzzleId,
        contentChecksum: reviewRow.contentChecksum,
        artifactPath: reviewRow.artifactPath,
        themeId: reviewRow.themeId,
        difficulty: reviewRow.difficulty,
        sourceEntryIds: requireStringArray(
          reviewRow.sourceEntryIds,
          `review ledger.boards[${index}].sourceEntryIds`,
        ),
      },
      expected,
      `review ledger catalog-order board ${index}`,
    );
  }

  return true;
}
