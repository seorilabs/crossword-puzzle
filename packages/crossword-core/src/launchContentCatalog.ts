import {
  validateGameContentV1,
  type GameContentV1,
  type GameContentValidationOptions,
} from "./gameContent.ts";
import { isSelfReferentialClue } from "./clueCuration.ts";

export const LAUNCH_CONTENT_CATALOG_SCHEMA_VERSION =
  "launch-content-catalog/1" as const;
export const WORLD_MAP_GRAPH_SCHEMA_VERSION = "world-map-graph/1" as const;

export const KO_KR_LAUNCH_CONTENT_CONTRACT = Object.freeze({
  contentLocale: "ko-KR",
  releaseTimeZone: "Asia/Seoul",
  languageProfile: Object.freeze({ id: "ko-KR", version: 1 }),
  totalBoardCount: 93,
  chapterCount: 3,
  dailyThemeCount: 6,
  dailyBoardsPerTheme: 7,
  recentDailyWindowDays: 7,
  routeCounts: Object.freeze({
    "first-run": 3,
    chapter: 30,
    daily: 42,
    bonus: 12,
    "weekly-challenge": 6,
  }),
});

/**
 * 최우선 출시 Gate에서 실제로 연속 플레이하는 첫 실행 3개 보드의 안정 식별자다.
 * 첫 보드 식별자는 기존 저장과의 호환을 위해 바꾸지 않는다. 나머지 90개 생산
 * ID는 승인된 콘텐츠가 생기기 전까지 이 파일에서 만들어 내지 않는다.
 */
export const BUNDLED_FIRST_RUN_CONTENT_IDENTITIES = Object.freeze([
  Object.freeze({
    puzzleId: "onboarding-easy-01",
    packId: "bundled-game-onboarding-v1",
    slotId: "2026-01-01",
    themeId: "memory-garden",
    chapterId: "chapter-01-forgotten-path",
    contentChecksum: "bundled:onboarding-easy-01:ko-KR:v1",
    licenseManifestId: "repo-owned-bundled-content-v1",
  }),
  Object.freeze({
    puzzleId: "onboarding-easy-02",
    packId: "bundled-game-onboarding-v1",
    slotId: "2026-01-02",
    themeId: "friendly-animals",
    chapterId: "chapter-01-forgotten-path",
    contentChecksum: "bundled:onboarding-easy-02:ko-KR:v1",
    licenseManifestId: "repo-owned-bundled-content-v1",
  }),
  Object.freeze({
    puzzleId: "onboarding-easy-03",
    packId: "bundled-game-onboarding-v1",
    slotId: "2026-01-03",
    themeId: "everyday-journey",
    chapterId: "chapter-01-forgotten-path",
    contentChecksum: "bundled:onboarding-easy-03:ko-KR:v1",
    licenseManifestId: "repo-owned-bundled-content-v1",
  }),
] as const);

export const BUNDLED_FIRST_RUN_MAP_NODE_IDS = Object.freeze([
  "chapter-01-forgotten-path:node:onboarding-easy-01",
  "chapter-01-forgotten-path:node:onboarding-easy-02",
  "chapter-01-forgotten-path:node:onboarding-easy-03",
] as const);

export const BUNDLED_ONBOARDING_CONTENT_IDENTITY =
  BUNDLED_FIRST_RUN_CONTENT_IDENTITIES[0];

export const DAILY_WEEKDAYS = Object.freeze([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const);

export type DailyWeekday = (typeof DAILY_WEEKDAYS)[number];
export type LaunchBoardRouteKind =
  | "first-run"
  | "chapter"
  | "daily"
  | "bonus"
  | "weekly-challenge";

export type LaunchBoardRouteV1 =
  | { kind: "first-run" }
  | { kind: "chapter" }
  | { kind: "daily"; weekday: DailyWeekday }
  | { kind: "bonus" }
  | { kind: "weekly-challenge" };

export type LaunchCatalogBoardV1 = {
  route: LaunchBoardRouteV1;
  content: GameContentV1;
};

export type KoKrLaunchContentCatalogV1 = {
  schemaVersion: typeof LAUNCH_CONTENT_CATALOG_SCHEMA_VERSION;
  catalogId: string;
  contentLocale: typeof KO_KR_LAUNCH_CONTENT_CONTRACT.contentLocale;
  releaseTimeZone: typeof KO_KR_LAUNCH_CONTENT_CONTRACT.releaseTimeZone;
  languageProfile: typeof KO_KR_LAUNCH_CONTENT_CONTRACT.languageProfile;
  boards: LaunchCatalogBoardV1[];
};

export type LaunchDomainValidationIssueCode =
  | "bundled_onboarding_mismatch"
  | "catalog_reference_mismatch"
  | "chapter_count_mismatch"
  | "content_quality_mismatch"
  | "content_pack_invalid"
  | "daily_schedule_mismatch"
  | "difficulty_mismatch"
  | "duplicate_id"
  | "graph_cycle"
  | "graph_edge_invalid"
  | "graph_shape_mismatch"
  | "invalid_field"
  | "invalid_schema_version"
  | "launch_contract_mismatch"
  | "required_field_missing"
  | "root_count_mismatch"
  | "route_count_mismatch";

export type LaunchDomainValidationIssue = {
  code: LaunchDomainValidationIssueCode;
  path: string;
  message: string;
};

export type LaunchCatalogValidationOptions = {
  verifyContentChecksum?: NonNullable<
    GameContentValidationOptions["verifyChecksum"]
  >;
  allowedClueSources?: readonly string[];
};

export type LaunchCatalogValidationResult = {
  pass: boolean;
  catalog: KoKrLaunchContentCatalogV1 | null;
  issues: LaunchDomainValidationIssue[];
};

export type WorldMapNodeV1 = {
  nodeId: string;
  puzzleId: string;
  chapterId: string;
  unlockMode: "all" | "any";
  unlockAfterNodeIds: string[];
};

/**
 * 문서의 "선형 3개 뒤 2개 분기"에서 분기가 시작되는 지점만 명시한다. 문서에
 * 없는 각 분기의 길이, 합류 여부, decision point 수는 추론하지 않는다. 첫 linear
 * node의 선행 조건은 이전 graph 구간과의 연결이므로 자유롭게 선언한다.
 */
export type WorldMapBranchPointV1 = {
  branchPointId: string;
  chapterId: string;
  linearNodeIds: [string, string, string];
  branchEntryNodeIds: [string, string];
};

export type WorldMapGraphV1 = {
  schemaVersion: typeof WORLD_MAP_GRAPH_SCHEMA_VERSION;
  graphId: string;
  catalogId: string;
  contentLocale: typeof KO_KR_LAUNCH_CONTENT_CONTRACT.contentLocale;
  nodes: WorldMapNodeV1[];
  branchPoints: WorldMapBranchPointV1[];
};

export type WorldMapGraphValidationResult = {
  pass: boolean;
  graph: WorldMapGraphV1 | null;
  issues: LaunchDomainValidationIssue[];
};

export type WorldMapNodeStatus = "locked" | "available" | "completed";

export type LaunchProgressionProjection = {
  completedBoardCount: number;
  mapFragmentCount: number;
  mapHomeUnlocked: boolean;
  initialChapterNodeId: string;
  nodes: Array<WorldMapNodeV1 & { status: WorldMapNodeStatus }>;
  availableNodeIds: string[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function addIssue(
  issues: LaunchDomainValidationIssue[],
  code: LaunchDomainValidationIssueCode,
  path: string,
  message: string,
) {
  issues.push({ code, path, message });
}

function readString(
  record: UnknownRecord,
  key: string,
  issues: LaunchDomainValidationIssue[],
  path: string,
): string | null {
  const value = record[key];
  if (value == null) {
    addIssue(issues, "required_field_missing", path, `${path} is required`);
    return null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    addIssue(
      issues,
      "invalid_field",
      path,
      `${path} must be a non-empty string`,
    );
    return null;
  }
  return value;
}

function readStringArray(
  value: unknown,
  issues: LaunchDomainValidationIssue[],
  path: string,
): string[] | null {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string" && item.trim() !== "")
  ) {
    addIssue(issues, "invalid_field", path, `${path} must be a string array`);
    return null;
  }
  return [...value];
}

function readLanguageProfile(
  value: unknown,
  issues: LaunchDomainValidationIssue[],
  path: string,
): KoKrLaunchContentCatalogV1["languageProfile"] | null {
  if (!isRecord(value)) {
    addIssue(
      issues,
      value == null ? "required_field_missing" : "invalid_field",
      path,
      `${path} must contain id and version`,
    );
    return null;
  }

  const id = value.id;
  const version = value.version;
  if (
    id !== KO_KR_LAUNCH_CONTENT_CONTRACT.languageProfile.id ||
    version !== KO_KR_LAUNCH_CONTENT_CONTRACT.languageProfile.version
  ) {
    addIssue(
      issues,
      "launch_contract_mismatch",
      path,
      "launch languageProfile must be ko-KR/v1",
    );
    return null;
  }
  return { id: "ko-KR", version: 1 };
}

function readRoute(
  value: unknown,
  issues: LaunchDomainValidationIssue[],
  path: string,
): LaunchBoardRouteV1 | null {
  if (!isRecord(value)) {
    addIssue(
      issues,
      value == null ? "required_field_missing" : "invalid_field",
      path,
      `${path} must be an object`,
    );
    return null;
  }

  const kind = value.kind;
  if (kind === "daily") {
    const weekday = value.weekday;
    if (!DAILY_WEEKDAYS.includes(weekday as DailyWeekday)) {
      addIssue(
        issues,
        "invalid_field",
        `${path}.weekday`,
        "daily weekday must be monday through sunday",
      );
      return null;
    }
    return { kind, weekday: weekday as DailyWeekday };
  }

  if (
    kind === "first-run" ||
    kind === "chapter" ||
    kind === "bonus" ||
    kind === "weekly-challenge"
  ) {
    return { kind };
  }

  addIssue(
    issues,
    "invalid_field",
    `${path}.kind`,
    "route kind is not supported by the launch contract",
  );
  return null;
}

function validateBoardShape(
  board: LaunchCatalogBoardV1,
  issues: LaunchDomainValidationIssue[],
  path: string,
) {
  const { content, route } = board;
  const height = content.grid.length;
  const square = content.grid.every((row) => row.length === height);

  if (route.kind === "first-run") {
    if (!square || (height !== 5 && height !== 6)) {
      addIssue(
        issues,
        "launch_contract_mismatch",
        `${path}.content.grid`,
        "first-run boards must be square 5x5 or 6x6 boards",
      );
    }
    if (content.entries.length < 4 || content.entries.length > 6) {
      addIssue(
        issues,
        "launch_contract_mismatch",
        `${path}.content.entries`,
        "first-run boards must contain 4 to 6 entries",
      );
    }
    return;
  }

  const sizeByDifficulty = { easy: 7, normal: 8, hard: 9 } as const;
  if (!square || height !== sizeByDifficulty[content.difficulty]) {
    addIssue(
      issues,
      "launch_contract_mismatch",
      `${path}.content.grid`,
      `${content.difficulty} boards must be ${sizeByDifficulty[content.difficulty]}x${sizeByDifficulty[content.difficulty]}`,
    );
  }
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function sameIds(actual: readonly string[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function sameIdSet(actual: readonly string[], expected: readonly string[]) {
  return sameIds([...actual].sort(), [...expected].sort());
}

type ReleaseSlotCalendar = {
  localDate: string;
  weekday: DailyWeekday;
  weekStart: string;
};

function parseReleaseSlotCalendar(slotId: string): ReleaseSlotCalendar | null {
  const match = slotId.match(/^(\d{4})-(\d{2})-(\d{2})-h00$/);
  if (match == null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const mondayFirstIndex = (date.getUTCDay() + 6) % 7;
  const weekday = DAILY_WEEKDAYS[mondayFirstIndex];
  if (weekday == null) return null;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - mondayFirstIndex);
  return {
    localDate: date.toISOString().slice(0, 10),
    weekday,
    weekStart: monday.toISOString().slice(0, 10),
  };
}

/**
 * 출시 카탈로그의 식별자, 수량, route, 날짜, 난이도와 game-content/1 무결성을
 * 검증하는 구조 게이트다. 단서 유사도 30일 cooldown, entry별 해설·분야·출처·
 * license 원장, generator의 minWordCount·crossRatio·bboxDensity 증거는 현재
 * GameContentV1에 없으므로 이 PASS를 콘텐츠 발행 승인으로 해석하면 안 된다.
 */
export function validateKoKrLaunchContentCatalogStructureV1(
  value: unknown,
  options: LaunchCatalogValidationOptions = {},
): LaunchCatalogValidationResult {
  const issues: LaunchDomainValidationIssue[] = [];
  if (!isRecord(value)) {
    addIssue(issues, "invalid_field", "$", "catalog must be an object");
    return { pass: false, catalog: null, issues };
  }

  const schemaVersion = readString(
    value,
    "schemaVersion",
    issues,
    "schemaVersion",
  );
  if (
    schemaVersion != null &&
    schemaVersion !== LAUNCH_CONTENT_CATALOG_SCHEMA_VERSION
  ) {
    addIssue(
      issues,
      "invalid_schema_version",
      "schemaVersion",
      `schemaVersion must be ${LAUNCH_CONTENT_CATALOG_SCHEMA_VERSION}`,
    );
  }
  const catalogId = readString(value, "catalogId", issues, "catalogId");
  const contentLocale = readString(
    value,
    "contentLocale",
    issues,
    "contentLocale",
  );
  const releaseTimeZone = readString(
    value,
    "releaseTimeZone",
    issues,
    "releaseTimeZone",
  );
  const languageProfile = readLanguageProfile(
    value.languageProfile,
    issues,
    "languageProfile",
  );

  if (contentLocale !== KO_KR_LAUNCH_CONTENT_CONTRACT.contentLocale) {
    addIssue(
      issues,
      "launch_contract_mismatch",
      "contentLocale",
      "launch catalog contentLocale must be ko-KR",
    );
  }
  if (releaseTimeZone !== KO_KR_LAUNCH_CONTENT_CONTRACT.releaseTimeZone) {
    addIssue(
      issues,
      "launch_contract_mismatch",
      "releaseTimeZone",
      "launch catalog releaseTimeZone must be Asia/Seoul",
    );
  }

  if (!Array.isArray(value.boards)) {
    addIssue(
      issues,
      value.boards == null ? "required_field_missing" : "invalid_field",
      "boards",
      "boards must be an array",
    );
    return { pass: false, catalog: null, issues };
  }

  const boards: LaunchCatalogBoardV1[] = [];
  for (const [index, rawBoard] of value.boards.entries()) {
    const path = `boards[${index}]`;
    if (!isRecord(rawBoard)) {
      addIssue(issues, "invalid_field", path, "board must be an object");
      continue;
    }

    const route = readRoute(rawBoard.route, issues, `${path}.route`);
    const contentValidation = validateGameContentV1(rawBoard.content, {
      requestedContentLocale: KO_KR_LAUNCH_CONTENT_CONTRACT.contentLocale,
      allowedClueSources: options.allowedClueSources,
      verifyChecksum: options.verifyContentChecksum,
    });
    if (!contentValidation.pass || contentValidation.content == null) {
      for (const issue of contentValidation.issues) {
        addIssue(
          issues,
          "content_pack_invalid",
          `${path}.content.${issue.path}`,
          `${issue.code}: ${issue.message}`,
        );
      }
      continue;
    }

    const content = contentValidation.content;
    if (
      content.contentLocale !== contentLocale ||
      content.releaseTimeZone !== releaseTimeZone ||
      content.languageProfile.id !== languageProfile?.id ||
      content.languageProfile.version !== languageProfile.version
    ) {
      addIssue(
        issues,
        "launch_contract_mismatch",
        `${path}.content`,
        "board locale, timezone, and language profile must match the catalog",
      );
      continue;
    }
    if (route == null) continue;

    const board = { route, content };
    validateBoardShape(board, issues, path);
    for (const [entryIndex, entry] of content.entries.entries()) {
      if (isSelfReferentialClue(entry.answer, entry.clue)) {
        addIssue(
          issues,
          "content_quality_mismatch",
          `${path}.content.entries[${entryIndex}].clue`,
          "launch clues must not contain their answer",
        );
      }
    }
    boards.push(board);
  }

  const routeCounts: Record<LaunchBoardRouteKind, number> = {
    "first-run": 0,
    chapter: 0,
    daily: 0,
    bonus: 0,
    "weekly-challenge": 0,
  };
  for (const board of boards) routeCounts[board.route.kind] += 1;
  for (const [kind, expected] of Object.entries(
    KO_KR_LAUNCH_CONTENT_CONTRACT.routeCounts,
  ) as Array<[LaunchBoardRouteKind, number]>) {
    if (routeCounts[kind] !== expected) {
      addIssue(
        issues,
        "route_count_mismatch",
        "boards",
        `${kind} must contain exactly ${expected} boards`,
      );
    }
  }
  if (boards.length !== KO_KR_LAUNCH_CONTENT_CONTRACT.totalBoardCount) {
    addIssue(
      issues,
      "route_count_mismatch",
      "boards",
      `launch catalog must contain exactly ${KO_KR_LAUNCH_CONTENT_CONTRACT.totalBoardCount} boards`,
    );
  }

  // Save와 첫 완료 원장이 contentLocale:puzzleId를 안정 namespace로 사용하므로
  // puzzleId만 catalog 전역 unique ID로 강제한다. slot/checksum의 전역 scope는
  // 문서에 없으며 daily 날짜 uniqueness는 아래 schedule gate에서 따로 검증한다.
  if (hasDuplicate(boards.map((board) => board.content.puzzleId))) {
    addIssue(
      issues,
      "duplicate_id",
      "boards.*.content.puzzleId",
      "puzzleId must be unique in the launch catalog",
    );
  }

  const chapterIds = new Set(
    boards
      .filter((board) => board.route.kind === "chapter")
      .map((board) => board.content.chapterId),
  );
  if (chapterIds.size !== KO_KR_LAUNCH_CONTENT_CONTRACT.chapterCount) {
    addIssue(
      issues,
      "chapter_count_mismatch",
      "boards",
      "chapter boards must cover exactly three chapter IDs",
    );
  }
  for (const [index, board] of boards.entries()) {
    if (
      board.route.kind === "first-run" &&
      board.content.difficulty !== "easy"
    ) {
      addIssue(
        issues,
        "difficulty_mismatch",
        `boards[${index}].content.difficulty`,
        "all first-run boards must be easy",
      );
    }
    if (
      board.route.kind === "weekly-challenge" &&
      board.content.difficulty !== "hard"
    ) {
      addIssue(
        issues,
        "difficulty_mismatch",
        `boards[${index}].content.difficulty`,
        "all weekly challenges must be hard",
      );
    }
  }

  const dailyBoards = boards.filter(
    (
      board,
    ): board is LaunchCatalogBoardV1 & {
      route: Extract<LaunchBoardRouteV1, { kind: "daily" }>;
    } => board.route.kind === "daily",
  );
  const dailyByTheme = new Map<string, typeof dailyBoards>();
  for (const board of dailyBoards) {
    const themeBoards = dailyByTheme.get(board.content.themeId) ?? [];
    themeBoards.push(board);
    dailyByTheme.set(board.content.themeId, themeBoards);
  }
  if (dailyByTheme.size !== KO_KR_LAUNCH_CONTENT_CONTRACT.dailyThemeCount) {
    addIssue(
      issues,
      "daily_schedule_mismatch",
      "boards",
      "daily runway must contain exactly six weekly theme IDs",
    );
  }

  const allDailyLocalDates: string[] = [];
  const allDailyWeekStarts = new Set<string>();
  for (const [themeId, themeBoards] of dailyByTheme) {
    if (
      themeBoards.length !== KO_KR_LAUNCH_CONTENT_CONTRACT.dailyBoardsPerTheme
    ) {
      addIssue(
        issues,
        "daily_schedule_mismatch",
        `boards.daily.${themeId}`,
        "each weekly theme must contain exactly seven daily boards",
      );
    }
    const weekdays = themeBoards.map((board) => board.route.weekday);
    if (
      hasDuplicate(weekdays) ||
      DAILY_WEEKDAYS.some((weekday) => !weekdays.includes(weekday))
    ) {
      addIssue(
        issues,
        "daily_schedule_mismatch",
        `boards.daily.${themeId}`,
        "each weekly theme must contain every weekday exactly once",
      );
    }
    const themeWeekStarts = new Set<string>();
    for (const board of themeBoards) {
      const calendar = parseReleaseSlotCalendar(board.content.slotId);
      if (calendar == null || calendar.weekday !== board.route.weekday) {
        addIssue(
          issues,
          "daily_schedule_mismatch",
          `boards.daily.${themeId}.${board.content.puzzleId}`,
          "daily slotId must be a valid Seoul local date matching weekday",
        );
      } else {
        allDailyLocalDates.push(calendar.localDate);
        allDailyWeekStarts.add(calendar.weekStart);
        themeWeekStarts.add(calendar.weekStart);
      }
    }
    if (themeWeekStarts.size !== 1) {
      addIssue(
        issues,
        "daily_schedule_mismatch",
        `boards.daily.${themeId}`,
        "all seven boards for a weekly theme must share one calendar week",
      );
    }
    const fridayBoards = themeBoards.filter(
      (board) => board.route.weekday === "friday",
    );
    if (
      fridayBoards.length !== 1 ||
      fridayBoards[0].content.difficulty !== "hard"
    ) {
      addIssue(
        issues,
        "difficulty_mismatch",
        `boards.daily.${themeId}.friday`,
        "each Friday daily board must be hard",
      );
    }
  }
  const sortedWeekStarts = [...allDailyWeekStarts].sort();
  const hasContinuousSixWeekRunway = sortedWeekStarts.every(
    (weekStart, index) =>
      index === 0 ||
      Date.parse(`${weekStart}T00:00:00.000Z`) -
        Date.parse(`${sortedWeekStarts[index - 1]}T00:00:00.000Z`) ===
        7 * 24 * 60 * 60 * 1000,
  );
  if (
    hasDuplicate(allDailyLocalDates) ||
    allDailyWeekStarts.size !== KO_KR_LAUNCH_CONTENT_CONTRACT.dailyThemeCount ||
    !hasContinuousSixWeekRunway
  ) {
    addIssue(
      issues,
      "daily_schedule_mismatch",
      "boards.daily",
      "daily runway must cover six consecutive calendar weeks at KST 00:00 without duplicate local dates",
    );
  }

  const onboarding = boards.find(
    (board) =>
      board.content.puzzleId === BUNDLED_ONBOARDING_CONTENT_IDENTITY.puzzleId,
  );
  const onboardingIdentityMatches =
    onboarding?.route.kind === "first-run" &&
    onboarding.content.difficulty === "easy" &&
    Object.entries(BUNDLED_ONBOARDING_CONTENT_IDENTITY).every(
      ([key, expected]) =>
        onboarding.content[key as keyof GameContentV1] === expected,
    );
  if (!onboardingIdentityMatches) {
    addIssue(
      issues,
      "bundled_onboarding_mismatch",
      "boards",
      "catalog must contain the exact bundled onboarding content identity",
    );
  }

  const canBuild =
    schemaVersion === LAUNCH_CONTENT_CATALOG_SCHEMA_VERSION &&
    catalogId != null &&
    contentLocale === KO_KR_LAUNCH_CONTENT_CONTRACT.contentLocale &&
    releaseTimeZone === KO_KR_LAUNCH_CONTENT_CONTRACT.releaseTimeZone &&
    languageProfile != null;
  if (!canBuild || issues.length > 0) {
    return { pass: false, catalog: null, issues };
  }

  return {
    pass: true,
    catalog: {
      schemaVersion: LAUNCH_CONTENT_CATALOG_SCHEMA_VERSION,
      catalogId,
      contentLocale,
      releaseTimeZone,
      languageProfile,
      boards,
    },
    issues,
  };
}

function readWorldMapNode(
  value: unknown,
  issues: LaunchDomainValidationIssue[],
  path: string,
): WorldMapNodeV1 | null {
  if (!isRecord(value)) {
    addIssue(issues, "invalid_field", path, "node must be an object");
    return null;
  }
  const nodeId = readString(value, "nodeId", issues, `${path}.nodeId`);
  const puzzleId = readString(value, "puzzleId", issues, `${path}.puzzleId`);
  const chapterId = readString(value, "chapterId", issues, `${path}.chapterId`);
  const unlockMode = value.unlockMode;
  if (unlockMode !== "all" && unlockMode !== "any") {
    addIssue(
      issues,
      value.unlockMode == null ? "required_field_missing" : "invalid_field",
      `${path}.unlockMode`,
      "unlockMode must explicitly be all or any",
    );
  }
  const unlockAfterNodeIds = readStringArray(
    value.unlockAfterNodeIds,
    issues,
    `${path}.unlockAfterNodeIds`,
  );
  if (
    nodeId == null ||
    puzzleId == null ||
    chapterId == null ||
    (unlockMode !== "all" && unlockMode !== "any") ||
    unlockAfterNodeIds == null
  ) {
    return null;
  }
  return { nodeId, puzzleId, chapterId, unlockMode, unlockAfterNodeIds };
}

function readBranchPoint(
  value: unknown,
  issues: LaunchDomainValidationIssue[],
  path: string,
): WorldMapBranchPointV1 | null {
  if (!isRecord(value)) {
    addIssue(issues, "invalid_field", path, "branch point must be an object");
    return null;
  }
  const branchPointId = readString(
    value,
    "branchPointId",
    issues,
    `${path}.branchPointId`,
  );
  const chapterId = readString(value, "chapterId", issues, `${path}.chapterId`);
  const linearNodeIds = readStringArray(
    value.linearNodeIds,
    issues,
    `${path}.linearNodeIds`,
  );
  const branchEntryNodeIds = readStringArray(
    value.branchEntryNodeIds,
    issues,
    `${path}.branchEntryNodeIds`,
  );
  if (linearNodeIds != null && linearNodeIds.length !== 3) {
    addIssue(
      issues,
      "graph_shape_mismatch",
      `${path}.linearNodeIds`,
      "a branch point must declare exactly three linear nodes",
    );
  }
  if (branchEntryNodeIds != null && branchEntryNodeIds.length !== 2) {
    addIssue(
      issues,
      "graph_shape_mismatch",
      `${path}.branchEntryNodeIds`,
      "a branch point must declare exactly two branch entry nodes",
    );
  }
  if (
    branchPointId == null ||
    chapterId == null ||
    linearNodeIds?.length !== 3 ||
    branchEntryNodeIds?.length !== 2
  ) {
    return null;
  }
  return {
    branchPointId,
    chapterId,
    linearNodeIds: linearNodeIds as [string, string, string],
    branchEntryNodeIds: branchEntryNodeIds as [string, string],
  };
}

function findCycle(nodes: readonly WorldMapNodeV1[]): string[] | null {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(nodeId: string): string[] | null {
    if (visited.has(nodeId)) return null;
    if (visiting.has(nodeId)) {
      const cycleStart = stack.indexOf(nodeId);
      return [...stack.slice(cycleStart), nodeId];
    }
    const node = byId.get(nodeId);
    if (node == null) return null;

    visiting.add(nodeId);
    stack.push(nodeId);
    for (const prerequisiteId of node.unlockAfterNodeIds) {
      const cycle = visit(prerequisiteId);
      if (cycle != null) return cycle;
    }
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  }

  for (const node of nodes) {
    const cycle = visit(node.nodeId);
    if (cycle != null) return cycle;
  }
  return null;
}

export function validateWorldMapGraphV1(
  value: unknown,
  catalog: KoKrLaunchContentCatalogV1,
): WorldMapGraphValidationResult {
  const issues: LaunchDomainValidationIssue[] = [];
  if (!isRecord(value)) {
    addIssue(issues, "invalid_field", "$", "graph must be an object");
    return { pass: false, graph: null, issues };
  }

  const schemaVersion = readString(
    value,
    "schemaVersion",
    issues,
    "schemaVersion",
  );
  if (
    schemaVersion != null &&
    schemaVersion !== WORLD_MAP_GRAPH_SCHEMA_VERSION
  ) {
    addIssue(
      issues,
      "invalid_schema_version",
      "schemaVersion",
      `schemaVersion must be ${WORLD_MAP_GRAPH_SCHEMA_VERSION}`,
    );
  }
  const graphId = readString(value, "graphId", issues, "graphId");
  const catalogId = readString(value, "catalogId", issues, "catalogId");
  const contentLocale = readString(
    value,
    "contentLocale",
    issues,
    "contentLocale",
  );
  if (catalogId !== catalog.catalogId) {
    addIssue(
      issues,
      "catalog_reference_mismatch",
      "catalogId",
      "world graph must reference the validated launch catalog",
    );
  }
  if (contentLocale !== catalog.contentLocale) {
    addIssue(
      issues,
      "catalog_reference_mismatch",
      "contentLocale",
      "world graph contentLocale must match the launch catalog",
    );
  }

  if (!Array.isArray(value.nodes)) {
    addIssue(issues, "invalid_field", "nodes", "nodes must be an array");
  }
  if (!Array.isArray(value.branchPoints)) {
    addIssue(
      issues,
      "invalid_field",
      "branchPoints",
      "branchPoints must be an array",
    );
  }

  const nodes = Array.isArray(value.nodes)
    ? value.nodes
        .map((node, index) => readWorldMapNode(node, issues, `nodes[${index}]`))
        .filter((node): node is WorldMapNodeV1 => node != null)
    : [];
  const branchPoints = Array.isArray(value.branchPoints)
    ? value.branchPoints
        .map((point, index) =>
          readBranchPoint(point, issues, `branchPoints[${index}]`),
        )
        .filter((point): point is WorldMapBranchPointV1 => point != null)
    : [];

  const chapterBoards = catalog.boards.filter(
    (board) => board.route.kind === "chapter",
  );
  const chapterBoardByPuzzleId = new Map(
    chapterBoards.map((board) => [board.content.puzzleId, board]),
  );
  if (nodes.length !== chapterBoards.length) {
    addIssue(
      issues,
      "catalog_reference_mismatch",
      "nodes",
      "world graph must contain one node for every chapter board",
    );
  }
  if (hasDuplicate(nodes.map((node) => node.nodeId))) {
    addIssue(
      issues,
      "duplicate_id",
      "nodes.*.nodeId",
      "world node IDs must be unique",
    );
  }
  if (hasDuplicate(nodes.map((node) => node.puzzleId))) {
    addIssue(
      issues,
      "duplicate_id",
      "nodes.*.puzzleId",
      "chapter puzzle IDs must map to exactly one world node",
    );
  }

  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
  for (const [index, node] of nodes.entries()) {
    const board = chapterBoardByPuzzleId.get(node.puzzleId);
    if (board == null || board.content.chapterId !== node.chapterId) {
      addIssue(
        issues,
        "catalog_reference_mismatch",
        `nodes[${index}]`,
        "node puzzleId and chapterId must match a chapter catalog board",
      );
    }
    if (hasDuplicate(node.unlockAfterNodeIds)) {
      addIssue(
        issues,
        "graph_edge_invalid",
        `nodes[${index}].unlockAfterNodeIds`,
        "prerequisite node IDs must be unique",
      );
    }
    if (node.unlockAfterNodeIds.length === 0 && node.unlockMode !== "all") {
      addIssue(
        issues,
        "graph_edge_invalid",
        `nodes[${index}].unlockMode`,
        "a root node must use all mode with an empty prerequisite list",
      );
    }
    for (const prerequisiteId of node.unlockAfterNodeIds) {
      if (prerequisiteId === node.nodeId || !nodeById.has(prerequisiteId)) {
        addIssue(
          issues,
          "graph_edge_invalid",
          `nodes[${index}].unlockAfterNodeIds`,
          "prerequisite must reference a different node in this graph",
        );
      }
    }
  }
  for (const board of chapterBoards) {
    if (!nodes.some((node) => node.puzzleId === board.content.puzzleId)) {
      addIssue(
        issues,
        "catalog_reference_mismatch",
        "nodes",
        `chapter puzzle ${board.content.puzzleId} is missing from the graph`,
      );
    }
  }

  if (branchPoints.length === 0) {
    addIssue(
      issues,
      "graph_shape_mismatch",
      "branchPoints",
      "world graph must explicitly declare its linear-three branch point",
    );
  }
  if (hasDuplicate(branchPoints.map((point) => point.branchPointId))) {
    addIssue(
      issues,
      "duplicate_id",
      "branchPoints.*.branchPointId",
      "branch point IDs must be unique",
    );
  }
  const branchPointSignatures = branchPoints.map((point) =>
    JSON.stringify([
      point.chapterId,
      ...point.linearNodeIds,
      ...point.branchEntryNodeIds,
    ]),
  );
  if (
    hasDuplicate(branchPointSignatures) ||
    hasDuplicate(branchPoints.map((point) => point.linearNodeIds[2]))
  ) {
    addIssue(
      issues,
      "graph_shape_mismatch",
      "branchPoints",
      "the same graph decision point must not be annotated more than once",
    );
  }
  for (const [index, point] of branchPoints.entries()) {
    const pointNodeIds = [...point.linearNodeIds, ...point.branchEntryNodeIds];
    if (hasDuplicate(pointNodeIds)) {
      addIssue(
        issues,
        "graph_shape_mismatch",
        `branchPoints[${index}]`,
        "a branch point must contain five different nodes",
      );
      continue;
    }
    const pointNodes = pointNodeIds.map((nodeId) => nodeById.get(nodeId));
    if (
      pointNodes.some(
        (node) => node == null || node.chapterId !== point.chapterId,
      )
    ) {
      addIssue(
        issues,
        "graph_shape_mismatch",
        `branchPoints[${index}]`,
        "all branch point nodes must exist in the declared chapter",
      );
      continue;
    }

    const [, secondId, thirdId] = point.linearNodeIds;
    const [firstId] = point.linearNodeIds;
    const second = nodeById.get(secondId);
    const third = nodeById.get(thirdId);
    const branchEntries = point.branchEntryNodeIds.map((nodeId) =>
      nodeById.get(nodeId),
    );
    if (
      second == null ||
      third == null ||
      branchEntries.some((node) => node == null) ||
      !sameIds(second.unlockAfterNodeIds, [firstId]) ||
      !sameIds(third.unlockAfterNodeIds, [secondId]) ||
      branchEntries.some(
        (node) => node == null || !sameIds(node.unlockAfterNodeIds, [thirdId]),
      )
    ) {
      addIssue(
        issues,
        "graph_shape_mismatch",
        `branchPoints[${index}]`,
        "edges must be linear node 1 -> 2 -> 3, then both branch entries",
      );
    }
  }

  const childIdsByParent = new Map<string, string[]>();
  for (const node of nodes) {
    for (const parentId of node.unlockAfterNodeIds) {
      const childIds = childIdsByParent.get(parentId) ?? [];
      childIds.push(node.nodeId);
      childIdsByParent.set(parentId, childIds);
    }
  }
  const branchPointByDecisionNodeId = new Map(
    branchPoints.map((point) => [point.linearNodeIds[2], point]),
  );
  for (const [parentId, childIds] of childIdsByParent) {
    if (childIds.length <= 1) continue;
    const point = branchPointByDecisionNodeId.get(parentId);
    if (
      childIds.length !== 2 ||
      point == null ||
      !sameIdSet(childIds, point.branchEntryNodeIds)
    ) {
      addIssue(
        issues,
        "graph_shape_mismatch",
        `nodes.${parentId}`,
        "every fan-out must be exactly two children declared by one branch point",
      );
    }
  }

  const roots = nodes.filter((node) => node.unlockAfterNodeIds.length === 0);
  if (roots.length !== 1) {
    addIssue(
      issues,
      "root_count_mismatch",
      "nodes",
      "exactly one chapter node may be initially selectable",
    );
  }
  const cycle = findCycle(nodes);
  if (cycle != null) {
    addIssue(
      issues,
      "graph_cycle",
      "nodes",
      `world graph contains a cycle: ${cycle.join(" -> ")}`,
    );
  }

  const canBuild =
    schemaVersion === WORLD_MAP_GRAPH_SCHEMA_VERSION &&
    graphId != null &&
    catalogId === catalog.catalogId &&
    contentLocale === catalog.contentLocale;
  if (!canBuild || issues.length > 0) {
    return { pass: false, graph: null, issues };
  }
  return {
    pass: true,
    graph: {
      schemaVersion: WORLD_MAP_GRAPH_SCHEMA_VERSION,
      graphId,
      catalogId,
      contentLocale,
      nodes,
      branchPoints,
    },
    issues,
  };
}

/**
 * 완료 ID만으로 재구성 가능한 순수 projection이다. 지도 조각은 첫 완료 1개이며
 * 소비하지 않고, root는 번들 튜토리얼 완료 뒤 열리고 이후 node는 선언된 모든
 * prerequisite가 완료되면 자동으로 열린다. 같은 선행 node를 가진 두 분기는 함께
 * available이 되어 플레이어가 선택할 수 있다.
 */
export function projectLaunchProgression(
  catalog: KoKrLaunchContentCatalogV1,
  graph: WorldMapGraphV1,
  completedPuzzleIds: readonly string[],
): LaunchProgressionProjection {
  const knownPuzzleIds = new Set(
    catalog.boards.map((board) => board.content.puzzleId),
  );
  const completed = new Set(
    completedPuzzleIds.filter((puzzleId) => knownPuzzleIds.has(puzzleId)),
  );
  const onboardingCompleted = completed.has(
    BUNDLED_ONBOARDING_CONTENT_IDENTITY.puzzleId,
  );
  const completedNodeIds = new Set(
    graph.nodes
      .filter((node) => completed.has(node.puzzleId))
      .map((node) => node.nodeId),
  );

  const nodes = graph.nodes.map((node) => {
    let status: WorldMapNodeStatus = "locked";
    if (completed.has(node.puzzleId)) {
      status = "completed";
    } else if (onboardingCompleted) {
      const unlockedByGraph =
        node.unlockMode === "all"
          ? node.unlockAfterNodeIds.every((nodeId) =>
              completedNodeIds.has(nodeId),
            )
          : node.unlockAfterNodeIds.some((nodeId) =>
              completedNodeIds.has(nodeId),
            );
      if (unlockedByGraph) status = "available";
    }
    return {
      ...node,
      unlockAfterNodeIds: [...node.unlockAfterNodeIds],
      status,
    };
  });
  const completedBoardCount = completed.size;
  const root = graph.nodes.find((node) => node.unlockAfterNodeIds.length === 0);
  if (root == null) {
    throw new Error("Validated world graph must have one root node");
  }

  return {
    completedBoardCount,
    mapFragmentCount: completedBoardCount,
    mapHomeUnlocked: onboardingCompleted,
    initialChapterNodeId: root.nodeId,
    nodes,
    availableNodeIds: nodes
      .filter((node) => node.status === "available")
      .map((node) => node.nodeId),
  };
}
