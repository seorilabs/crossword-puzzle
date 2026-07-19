import {
  verifyGameContentChecksum,
  type GameContentV1,
} from "../../packages/crossword-core/src/gameContent.ts";
import {
  KO_KR_LAUNCH_CONTENT_CONTRACT,
  LAUNCH_CONTENT_CATALOG_SCHEMA_VERSION,
  validateKoKrLaunchContentCatalogStructureV1,
  type LaunchBoardRouteV1,
} from "../../packages/crossword-core/src/launchContentCatalog.ts";
import { canonicalizeForChecksum } from "../../packages/crossword-core/src/saveV2.ts";
import { sha256Checksum } from "../../packages/crossword-core/src/sha256.ts";

const GENERATION_REPORT_SCHEMA_VERSION =
  "ko-kr-launch-generation-report/8" as const;
const CATALOG_PATH = "/game-content/v1/ko-KR/candidates/catalog.json";
const GENERATION_REPORT_PATH =
  "/game-content/v1/ko-KR/candidates/generation-report.json";
const LOWER_SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GENERATOR_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SAFE_PUZZLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;
const GENERATED_BOARD_COUNT =
  KO_KR_LAUNCH_CONTENT_CONTRACT.totalBoardCount -
  KO_KR_LAUNCH_CONTENT_CONTRACT.routeCounts["first-run"];

export const LAUNCH_REVIEW_PAGE_SIZE = 10;
export const LAUNCH_REVIEW_PAGE_COUNT = GENERATED_BOARD_COUNT / 10;

export type LaunchReviewSelection =
  | Readonly<{ kind: "page"; page: number }>
  | Readonly<{ kind: "puzzle"; puzzleId: string }>;

export type LaunchReviewContentOptions = Readonly<{
  catalogHash: string;
  selection: LaunchReviewSelection;
  fetch?: typeof fetch;
}>;

export type LaunchReviewContent = Readonly<{
  catalogHash: string;
  generatorCommit: string;
  candidate: true;
  activationApproved: false;
  selection: LaunchReviewSelection;
  totalGeneratedBoardCount: number;
  items: readonly Readonly<{
    content: GameContentV1;
    mapNodeId: string;
    cardIds: readonly string[];
  }>[];
}>;

type UnknownRecord = Record<string, unknown>;

type CandidateBoard = Readonly<{
  route: LaunchBoardRouteV1;
  content: GameContentV1;
  artifactPath: string;
}>;

function fail(message: string): never {
  throw new Error(`Launch review candidates rejected: ${message}`);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): UnknownRecord {
  if (!isRecord(value)) fail(`${field} must be an object`);
  return value;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${field} must be a non-empty string`);
  }
  return value;
}

function requireCandidateArtifact(
  value: unknown,
  field: string,
  schemaVersion: string,
): UnknownRecord {
  const document = requireRecord(value, field);
  if (document.schemaVersion !== schemaVersion) {
    fail(`${field}.schemaVersion must be ${schemaVersion}`);
  }
  if (
    document.artifactStatus !== "candidate" ||
    document.activationApproved !== false
  ) {
    fail(`${field} must remain an inactive candidate`);
  }
  return document;
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  try {
    return canonicalizeForChecksum(left) === canonicalizeForChecksum(right);
  } catch {
    return false;
  }
}

export function calculateLaunchReviewCatalogHash(value: unknown): string {
  try {
    return sha256Checksum(canonicalizeForChecksum(value)).slice(
      "sha256:".length,
    );
  } catch {
    return fail("catalog cannot be canonically checksummed");
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
  if (!response.ok) fail(`${field} fetch failed with HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    return fail(`${field} is not valid JSON`);
  }
}

function validateCatalog(catalogValue: unknown): {
  catalog: UnknownRecord;
  generatedBoards: readonly CandidateBoard[];
} {
  const catalogArtifact = requireCandidateArtifact(
    catalogValue,
    "catalog",
    LAUNCH_CONTENT_CATALOG_SCHEMA_VERSION,
  );
  const validation = validateKoKrLaunchContentCatalogStructureV1(catalogValue, {
    verifyContentChecksum: verifyGameContentChecksum,
  });
  if (!validation.pass || validation.catalog == null) {
    const issues = validation.issues
      .map(({ code, path }) => `${code}:${path}`)
      .join(",");
    fail(`catalog structure is invalid (${issues})`);
  }
  const rawBoards = requireArray(catalogArtifact.boards, "catalog.boards");
  const boards = validation.catalog.boards.map(
    (board, index): CandidateBoard => {
      const rawBoard = requireRecord(
        rawBoards[index],
        `catalog.boards[${index}]`,
      );
      const artifactPath = requireString(
        rawBoard.artifactPath,
        `catalog.boards[${index}].artifactPath`,
      );
      const expectedPath = `/game-content/v1/ko-KR/packs/${board.content.packId}/${board.content.contentChecksum}.json`;
      if (artifactPath !== expectedPath) {
        fail(
          `catalog.boards[${index}].artifactPath does not match content identity`,
        );
      }
      return Object.freeze({ ...board, artifactPath });
    },
  );
  const generatedBoards = boards.filter(
    ({ route }) => route.kind !== "first-run",
  );
  if (generatedBoards.length !== GENERATED_BOARD_COUNT) {
    fail(
      `catalog must contain exactly ${GENERATED_BOARD_COUNT} generated boards`,
    );
  }
  return {
    catalog: catalogArtifact,
    generatedBoards: Object.freeze(generatedBoards),
  };
}

function validateReportJoin(
  reportValue: unknown,
  board: CandidateBoard,
  generatorCommit: string,
  generatorConfigHash: string,
  field: string,
) {
  const report = requireRecord(reportValue, field);
  const quality = requireRecord(report.quality, `${field}.quality`);
  if (
    report.puzzleId !== board.content.puzzleId ||
    report.packId !== board.content.packId ||
    report.contentChecksum !== board.content.contentChecksum ||
    report.artifactPath !== board.artifactPath ||
    report.generatorCommit !== generatorCommit ||
    report.generatorConfigHash !== generatorConfigHash ||
    board.content.generatorCommit !== generatorCommit ||
    board.content.generatorConfigHash !== generatorConfigHash ||
    report.themeId !== board.content.themeId ||
    report.difficulty !== board.content.difficulty ||
    report.accepted !== true ||
    quality.pass !== true ||
    !canonicalEqual(report.route, board.route)
  ) {
    fail(`${field} does not exactly join catalog content identity`);
  }
}

function validateGenerationReport(
  reportValue: unknown,
  catalog: UnknownRecord,
  generatedBoards: readonly CandidateBoard[],
): string {
  const report = requireCandidateArtifact(
    reportValue,
    "generationReport",
    GENERATION_REPORT_SCHEMA_VERSION,
  );
  if (
    report.catalogId !== catalog.catalogId ||
    report.generatedAt !== catalog.generatedAt ||
    report.firstRunBoardCount !==
      KO_KR_LAUNCH_CONTENT_CONTRACT.routeCounts["first-run"] ||
    report.generatedBoardCount !== GENERATED_BOARD_COUNT ||
    report.totalBoardCount !== KO_KR_LAUNCH_CONTENT_CONTRACT.totalBoardCount ||
    report.catalogValidationPass !== true ||
    report.worldMapValidationPass !== true ||
    !canonicalEqual(
      report.routeCounts,
      KO_KR_LAUNCH_CONTENT_CONTRACT.routeCounts,
    )
  ) {
    fail("generationReport does not match the catalog launch contract");
  }
  const generator = requireRecord(
    report.generator,
    "generationReport.generator",
  );
  const generatorCommit = requireString(
    generator.commit,
    "generationReport.generator.commit",
  );
  if (!GENERATOR_COMMIT_PATTERN.test(generatorCommit)) {
    fail("generationReport.generator.commit must be a lowercase Git SHA");
  }
  const generatorConfigHash = requireString(
    generator.configHash,
    "generationReport.generator.configHash",
  );
  if (!SHA256_PATTERN.test(generatorConfigHash)) {
    fail("generationReport.generator.configHash must be a lowercase SHA-256");
  }

  const rawReports = requireArray(report.boards, "generationReport.boards");
  if (rawReports.length !== GENERATED_BOARD_COUNT) {
    fail(
      `generationReport.boards must contain exactly ${GENERATED_BOARD_COUNT} boards`,
    );
  }
  const reportsByPuzzleId = new Map<string, unknown>();
  for (const [index, rawReport] of rawReports.entries()) {
    const puzzleId = requireString(
      requireRecord(rawReport, `generationReport.boards[${index}]`).puzzleId,
      `generationReport.boards[${index}].puzzleId`,
    );
    if (
      !SAFE_PUZZLE_ID_PATTERN.test(puzzleId) ||
      reportsByPuzzleId.has(puzzleId)
    ) {
      fail(
        `generationReport.boards[${index}].puzzleId is unsafe or duplicated`,
      );
    }
    reportsByPuzzleId.set(puzzleId, rawReport);
  }
  for (const [index, board] of generatedBoards.entries()) {
    const joined = reportsByPuzzleId.get(board.content.puzzleId);
    if (joined == null)
      fail(`generationReport is missing ${board.content.puzzleId}`);
    validateReportJoin(
      joined,
      board,
      generatorCommit,
      generatorConfigHash,
      `generationReport.join[${index}]`,
    );
  }
  return generatorCommit;
}

function validateSelection(selection: LaunchReviewSelection) {
  if (selection.kind === "page") {
    if (
      !Number.isSafeInteger(selection.page) ||
      selection.page < 1 ||
      selection.page > LAUNCH_REVIEW_PAGE_COUNT
    ) {
      fail(`selection.page must be from 1 to ${LAUNCH_REVIEW_PAGE_COUNT}`);
    }
  } else if (!SAFE_PUZZLE_ID_PATTERN.test(selection.puzzleId)) {
    fail("selection.puzzleId is unsafe");
  }
}

/** DEV web에서 고정 candidate 90개를 10개 page 또는 puzzleId 하나로 읽는다. */
export async function loadLaunchReviewContent(
  options: LaunchReviewContentOptions,
): Promise<LaunchReviewContent> {
  if (!LOWER_SHA256_HEX_PATTERN.test(options.catalogHash)) {
    fail("catalogHash must be exactly 64 lowercase hexadecimal characters");
  }
  validateSelection(options.selection);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("fetch is unavailable");
  const [catalogValue, reportValue] = await Promise.all([
    fetchJson(fetchImpl, CATALOG_PATH, "catalog"),
    fetchJson(fetchImpl, GENERATION_REPORT_PATH, "generationReport"),
  ]);
  if (calculateLaunchReviewCatalogHash(catalogValue) !== options.catalogHash) {
    fail("catalog canonical hash does not match launchReview query");
  }
  const { catalog, generatedBoards } = validateCatalog(catalogValue);
  const generatorCommit = validateGenerationReport(
    reportValue,
    catalog,
    generatedBoards,
  );
  const selection = options.selection;
  const selectedBoards =
    selection.kind === "page"
      ? generatedBoards.slice(
          (selection.page - 1) * LAUNCH_REVIEW_PAGE_SIZE,
          selection.page * LAUNCH_REVIEW_PAGE_SIZE,
        )
      : generatedBoards.filter(
          ({ content }) => content.puzzleId === selection.puzzleId,
        );
  const expectedCount = selection.kind === "page" ? LAUNCH_REVIEW_PAGE_SIZE : 1;
  if (selectedBoards.length !== expectedCount) {
    fail("selected candidate board does not exist");
  }
  return Object.freeze({
    catalogHash: options.catalogHash,
    generatorCommit,
    candidate: true,
    activationApproved: false,
    selection: Object.freeze({ ...selection }),
    totalGeneratedBoardCount: generatedBoards.length,
    items: Object.freeze(
      selectedBoards.map(({ content }) =>
        Object.freeze({
          content,
          mapNodeId: `dev-launch-review:${options.catalogHash}:${content.puzzleId}`,
          cardIds: Object.freeze([]) as readonly string[],
        }),
      ),
    ),
  });
}
