import {
  validateGameContentV1,
  verifyGameContentChecksum,
  type GameContentV1,
} from "../../packages/crossword-core/src/gameContent.ts";
import {
  canonicalizeForChecksum,
  compareCanonicalStrings,
} from "../../packages/crossword-core/src/saveV2.ts";
import { sha256Checksum } from "../../packages/crossword-core/src/sha256.ts";

const CHECKPOINT_SCHEMA_VERSION =
  "ko-kr-launch-generation-checkpoint/1" as const;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const LOWER_SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const GENERATOR_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SAFE_PUZZLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;
const RETRIES_PER_PHASE = 8;
const MAX_GLOBAL_RETRY_INDEX = RETRIES_PER_PHASE * 2 - 1;

const LAUNCH_PREVIEW_ROUTES = Object.freeze([
  Object.freeze({
    puzzleId: "ko-kr-daily-2026-07-20",
    slotId: "2026-07-20-h00",
    weekday: "monday",
  }),
  Object.freeze({
    puzzleId: "ko-kr-daily-2026-07-21",
    slotId: "2026-07-21-h00",
    weekday: "tuesday",
  }),
  Object.freeze({
    puzzleId: "ko-kr-daily-2026-07-22",
    slotId: "2026-07-22-h00",
    weekday: "wednesday",
  }),
  Object.freeze({
    puzzleId: "ko-kr-daily-2026-07-23",
    slotId: "2026-07-23-h00",
    weekday: "thursday",
  }),
  Object.freeze({
    puzzleId: "ko-kr-daily-2026-07-24",
    slotId: "2026-07-24-h00",
    weekday: "friday",
  }),
  Object.freeze({
    puzzleId: "ko-kr-daily-2026-07-25",
    slotId: "2026-07-25-h00",
    weekday: "saturday",
  }),
  Object.freeze({
    puzzleId: "ko-kr-daily-2026-07-26",
    slotId: "2026-07-26-h00",
    weekday: "sunday",
  }),
] as const);

type UnknownRecord = Record<string, unknown>;

export type LaunchPreviewContentOptions = Readonly<{
  checkpointHash: string;
  fetch?: typeof fetch;
}>;

export type LaunchPreviewItineraryItem = Readonly<{
  content: GameContentV1;
  mapNodeId: string;
  cardIds: readonly string[];
}>;

export type LaunchPreviewContent = Readonly<{
  checkpointHash: string;
  generatorCommit: string;
  candidate: true;
  activationApproved: false;
  items: readonly LaunchPreviewItineraryItem[];
}>;

function fail(message: string): never {
  throw new Error(`Launch preview checkpoint rejected: ${message}`);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): UnknownRecord {
  if (!isRecord(value)) fail(`${field} must be an object`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    fail(`${field} must be a non-empty string`);
  }
  return value;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  return value;
}

function requireSafeIndex(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(`${field} must be a non-negative safe integer`);
  }
  return value as number;
}

function requireSha256(value: unknown, field: string): string {
  const checksum = requireString(value, field);
  if (!SHA256_PATTERN.test(checksum)) {
    fail(`${field} must be a lowercase SHA-256 checksum`);
  }
  return checksum;
}

function requireSafePuzzleId(value: unknown, field: string): string {
  const puzzleId = requireString(value, field);
  if (!SAFE_PUZZLE_ID_PATTERN.test(puzzleId)) {
    fail(`${field} is not a safe puzzleId`);
  }
  return puzzleId;
}

function documentChecksum(value: unknown): string {
  try {
    return sha256Checksum(canonicalizeForChecksum(value));
  } catch {
    return fail("checkpoint document cannot be canonically checksummed");
  }
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  field: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    return fail(`${field} could not be fetched`);
  }
  if (!response.ok) {
    fail(`${field} fetch failed with HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    return fail(`${field} is not valid JSON`);
  }
}

function validateSelectedCandidate(
  report: UnknownRecord,
  content: GameContentV1,
  field: string,
) {
  const selectedRetryIndex = requireSafeIndex(
    report.selectedRetryIndex,
    `${field}.selectedRetryIndex`,
  );
  const attempts = requireArray(report.attempts, `${field}.attempts`);
  const selectedAttempt = requireRecord(
    attempts[selectedRetryIndex],
    `${field}.attempts[${selectedRetryIndex}]`,
  );
  const localRetryIndex = requireSafeIndex(
    selectedAttempt.retryIndex,
    `${field}.selectedAttempt.retryIndex`,
  );
  if (selectedAttempt.globalRetryIndex == null) {
    if (
      selectedRetryIndex >= RETRIES_PER_PHASE ||
      localRetryIndex !== selectedRetryIndex
    ) {
      fail(`${field} legacy selected retry identity does not match`);
    }
  } else {
    const globalRetryIndex = requireSafeIndex(
      selectedAttempt.globalRetryIndex,
      `${field}.selectedAttempt.globalRetryIndex`,
    );
    if (globalRetryIndex > MAX_GLOBAL_RETRY_INDEX) {
      fail(`${field} selected global retry exceeds bounded retry phases`);
    }
    const expectedLocalRetryIndex =
      globalRetryIndex < RETRIES_PER_PHASE
        ? globalRetryIndex
        : globalRetryIndex - RETRIES_PER_PHASE;
    if (
      globalRetryIndex !== selectedRetryIndex ||
      localRetryIndex !== expectedLocalRetryIndex
    ) {
      fail(`${field} selected retry identity does not match its phase index`);
    }
  }
  const selectedSeed = requireSafeIndex(
    report.selectedSeed,
    `${field}.selectedSeed`,
  );
  const attemptSeed = requireSafeIndex(
    selectedAttempt.seed,
    `${field}.selectedAttempt.seed`,
  );
  if (selectedSeed !== attemptSeed) {
    fail(`${field} selected seed does not match the selected attempt`);
  }

  const selectedCandidateIndex = requireSafeIndex(
    report.selectedCandidateIndex,
    `${field}.selectedCandidateIndex`,
  );
  const candidates = requireArray(
    selectedAttempt.candidates,
    `${field}.selectedAttempt.candidates`,
  );
  const selectedCandidate = requireRecord(
    candidates[selectedCandidateIndex],
    `${field}.selectedCandidate`,
  );
  if (
    selectedCandidate.candidateIndex !== selectedCandidateIndex ||
    selectedCandidate.pass !== true
  ) {
    fail(`${field} selected candidate identity is invalid`);
  }
  const candidateMetrics = requireRecord(
    selectedCandidate.metrics,
    `${field}.selectedCandidate.metrics`,
  );
  const reportMetrics = requireRecord(report.metrics, `${field}.metrics`);
  if (
    canonicalizeForChecksum(candidateMetrics) !==
    canonicalizeForChecksum(reportMetrics)
  ) {
    fail(`${field} selected candidate metrics do not match the report`);
  }

  const selectedAnswers = requireArray(
    selectedCandidate.answers,
    `${field}.selectedCandidate.answers`,
  );
  if (!selectedAnswers.every((answer) => typeof answer === "string")) {
    fail(`${field} selected candidate answers must be strings`);
  }
  const contentAnswers = [
    ...new Set(content.entries.map(({ answer }) => answer)),
  ].sort(compareCanonicalStrings);
  if (
    canonicalizeForChecksum(selectedAnswers) !==
    canonicalizeForChecksum(contentAnswers)
  ) {
    fail(`${field} selected candidate answers do not match the content`);
  }
}

function validateReportJoin(
  reportValue: unknown,
  content: GameContentV1,
  generatorCommit: string,
  generatorConfigHash: string,
  route: (typeof LAUNCH_PREVIEW_ROUTES)[number],
  field: string,
) {
  const report = requireRecord(reportValue, field);
  const routeValue = requireRecord(report.route, `${field}.route`);
  if (
    report.accepted !== true ||
    report.puzzleId !== content.puzzleId ||
    report.packId !== content.packId ||
    report.contentChecksum !== content.contentChecksum ||
    report.generatorCommit !== generatorCommit ||
    report.generatorConfigHash !== generatorConfigHash ||
    report.difficulty !== content.difficulty ||
    report.themeId !== content.themeId ||
    routeValue.kind !== "daily" ||
    routeValue.weekday !== route.weekday
  ) {
    fail(`${field} does not exactly join the selected content identity`);
  }
  validateSelectedCandidate(report, content, field);
}

/**
 * Vite가 정적으로 제공하는 tmp checkpoint에서 첫 주 7개 candidate만 읽는다.
 * 호출부가 DEV/query 활성화를 책임지며 이 경로는 production activation을 승인하지 않는다.
 */
export async function loadLaunchPreviewContent(
  options: LaunchPreviewContentOptions,
): Promise<LaunchPreviewContent> {
  if (!LOWER_SHA256_HEX_PATTERN.test(options.checkpointHash)) {
    fail("checkpointHash must be exactly 64 lowercase hexadecimal characters");
  }
  const checkpointHash = options.checkpointHash;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    fail("fetch is unavailable");
  }
  const checkpointRoot = `/tmp/launch-content-checkpoints/${checkpointHash}`;
  const metadataValue = await fetchJson(
    fetchImpl,
    `${checkpointRoot}/checkpoint.json`,
    "checkpoint.json",
  );
  const metadata = requireRecord(metadataValue, "checkpoint");
  if (metadata.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
    fail(`checkpoint.schemaVersion must be ${CHECKPOINT_SCHEMA_VERSION}`);
  }
  const generatorCommit = requireString(
    metadata.generatorCommit,
    "checkpoint.generatorCommit",
  );
  if (!GENERATOR_COMMIT_PATTERN.test(generatorCommit)) {
    fail("checkpoint.generatorCommit must be a lowercase 40-character Git SHA");
  }
  const generatorConfigHash = requireSha256(
    metadata.generatorConfigHash,
    "checkpoint.generatorConfigHash",
  );
  if (generatorConfigHash !== `sha256:${checkpointHash}`) {
    fail("checkpoint.generatorConfigHash does not match checkpointHash");
  }

  const routePuzzleIds = requireArray(
    metadata.routePuzzleIds,
    "checkpoint.routePuzzleIds",
  );
  const completed = requireArray(metadata.completed, "checkpoint.completed");
  if (
    routePuzzleIds.length < LAUNCH_PREVIEW_ROUTES.length ||
    completed.length < LAUNCH_PREVIEW_ROUTES.length
  ) {
    fail("checkpoint must contain at least seven completed launch routes");
  }

  const selected = LAUNCH_PREVIEW_ROUTES.map((route, index) => {
    const completedItem = requireRecord(
      completed[index],
      `checkpoint.completed[${index}]`,
    );
    const completedPuzzleId = requireSafePuzzleId(
      completedItem.puzzleId,
      `checkpoint.completed[${index}].puzzleId`,
    );
    const routePuzzleId = requireSafePuzzleId(
      routePuzzleIds[index],
      `checkpoint.routePuzzleIds[${index}]`,
    );
    if (
      routePuzzleId !== route.puzzleId ||
      completedPuzzleId !== route.puzzleId
    ) {
      fail(`checkpoint first seven routes drifted at index ${index}`);
    }
    return {
      route,
      contentSha256: requireSha256(
        completedItem.contentSha256,
        `checkpoint.completed[${index}].contentSha256`,
      ),
      reportSha256: requireSha256(
        completedItem.reportSha256,
        `checkpoint.completed[${index}].reportSha256`,
      ),
    };
  });

  const items = await Promise.all(
    selected.map(async ({ route, contentSha256, reportSha256 }, index) => {
      const puzzleId = route.puzzleId;
      const encodedPuzzleId = encodeURIComponent(puzzleId);
      const [contentValue, reportValue] = await Promise.all([
        fetchJson(
          fetchImpl,
          `${checkpointRoot}/boards/${encodedPuzzleId}.json`,
          `boards[${index}]`,
        ),
        fetchJson(
          fetchImpl,
          `${checkpointRoot}/reports/${encodedPuzzleId}.json`,
          `reports[${index}]`,
        ),
      ]);
      if (documentChecksum(contentValue) !== contentSha256) {
        fail(`${puzzleId} board SHA does not match checkpoint metadata`);
      }
      if (documentChecksum(reportValue) !== reportSha256) {
        fail(`${puzzleId} report SHA does not match checkpoint metadata`);
      }

      const contentValidation = validateGameContentV1(contentValue, {
        requestedContentLocale: "ko-KR",
        verifyChecksum: verifyGameContentChecksum,
      });
      if (!contentValidation.pass || contentValidation.content == null) {
        const issues = contentValidation.issues
          .map(({ code, path }) => `${code}:${path}`)
          .join(",");
        fail(`${puzzleId} GameContentV1 is invalid (${issues})`);
      }
      const content = contentValidation.content;
      if (
        content.puzzleId !== puzzleId ||
        content.slotId !== route.slotId ||
        content.generatorCommit !== generatorCommit ||
        content.generatorConfigHash !== generatorConfigHash
      ) {
        fail(`${puzzleId} content identity does not match the checkpoint`);
      }
      validateReportJoin(
        reportValue,
        content,
        generatorCommit,
        generatorConfigHash,
        route,
        `reports[${index}]`,
      );
      return Object.freeze({
        content,
        mapNodeId: `dev-preview:${checkpointHash}:${puzzleId}`,
        cardIds: Object.freeze([]),
      });
    }),
  );

  return Object.freeze({
    checkpointHash,
    generatorCommit,
    candidate: true,
    activationApproved: false,
    items: Object.freeze(items),
  });
}
