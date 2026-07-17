import {
  normalizeAndValidateAnswerCells,
  projectAnswerCells,
  resolveLanguageProfile,
  type LanguageProfile,
  type LanguageProfileReference,
} from "./languageProfile.ts";
import { validatePuzzleSlots } from "./puzzle.ts";
import type { Direction, Puzzle, PuzzleEntry } from "./types.ts";

export const GAME_CONTENT_SCHEMA_VERSION = "game-content/1" as const;

export type GameContentReviewV1 = {
  reviewerId: string;
  reviewedAt: string;
  manualCoverage: number;
};

export type GameContentEntryV1 = Omit<
  PuzzleEntry,
  "answerCells" | "clueSource" | "needsManualClue"
> & {
  answerCells: string[];
  clueSource: string;
  needsManualClue: false;
};

export type GameContentV1 = {
  schemaVersion: typeof GAME_CONTENT_SCHEMA_VERSION;
  contentLocale: string;
  releaseTimeZone: string;
  languageProfile: LanguageProfileReference;
  puzzleId: string;
  packId: string;
  slotId: string;
  grid: string[][];
  entries: GameContentEntryV1[];
  difficulty: Puzzle["difficulty"];
  themeId: string;
  chapterId: string;
  worldTriggerSet: unknown[];
  generatorCommit: string;
  generatorConfigHash: string;
  contentChecksum: string;
  licenseManifestId: string;
  review: GameContentReviewV1;
  minClientVersion: string;
};

export type GameContentValidationIssueCode =
  | "answer_projection_mismatch"
  | "checksum_mismatch"
  | "checksum_verifier_missing"
  | "clue_source_not_allowed"
  | "grid_entry_mismatch"
  | "invalid_answer_cells"
  | "invalid_field"
  | "locale_mismatch"
  | "manual_review_required"
  | "required_field_missing"
  | "unsupported_language_profile";

export type GameContentValidationIssue = {
  code: GameContentValidationIssueCode;
  path: string;
  message: string;
};

export type GameContentValidationOptions = {
  requestedContentLocale?: string;
  allowedClueSources?: readonly string[];
  resolveProfile?: (
    reference: LanguageProfileReference,
    contentLocale: string,
  ) => LanguageProfile | null;
  verifyChecksum?: (content: GameContentV1) => boolean;
};

export type GameContentValidationResult = {
  pass: boolean;
  content: GameContentV1 | null;
  issues: GameContentValidationIssue[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function addIssue(
  issues: GameContentValidationIssue[],
  code: GameContentValidationIssueCode,
  path: string,
  message: string,
) {
  issues.push({ code, path, message });
}

function readString(
  record: UnknownRecord,
  key: string,
  issues: GameContentValidationIssue[],
  path = key,
): string | null {
  const value = record[key];
  if (value == null) {
    addIssue(
      issues,
      "required_field_missing",
      path,
      `${path} is required`,
    );
    return null;
  }

  if (typeof value !== "string" || value.trim() === "") {
    addIssue(issues, "invalid_field", path, `${path} must be a non-empty string`);
    return null;
  }

  return value;
}

function readInteger(
  record: UnknownRecord,
  key: string,
  issues: GameContentValidationIssue[],
  path: string,
): number | null {
  const value = record[key];
  if (value == null) {
    addIssue(
      issues,
      "required_field_missing",
      path,
      `${path} is required`,
    );
    return null;
  }

  if (!Number.isInteger(value) || (value as number) < 0) {
    addIssue(
      issues,
      "invalid_field",
      path,
      `${path} must be a non-negative integer`,
    );
    return null;
  }

  return value as number;
}

function readGrid(
  value: unknown,
  issues: GameContentValidationIssue[],
): string[][] | null {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, "invalid_field", "grid", "grid must be a non-empty array");
    return null;
  }

  const grid: string[][] = [];
  let expectedWidth: number | null = null;

  for (const [rowIndex, row] of value.entries()) {
    if (!Array.isArray(row) || row.length === 0) {
      addIssue(
        issues,
        "invalid_field",
        `grid[${rowIndex}]`,
        "grid rows must be non-empty arrays",
      );
      return null;
    }

    if (!row.every((cell) => typeof cell === "string")) {
      addIssue(
        issues,
        "invalid_field",
        `grid[${rowIndex}]`,
        "every grid cell must be a string",
      );
      return null;
    }

    expectedWidth ??= row.length;
    if (row.length !== expectedWidth) {
      addIssue(
        issues,
        "invalid_field",
        `grid[${rowIndex}]`,
        "grid rows must have equal width",
      );
      return null;
    }

    grid.push([...row] as string[]);
  }

  return grid;
}

function readLanguageProfileReference(
  value: unknown,
  issues: GameContentValidationIssue[],
): LanguageProfileReference | null {
  if (!isRecord(value)) {
    addIssue(
      issues,
      value == null ? "required_field_missing" : "invalid_field",
      "languageProfile",
      "languageProfile must contain id and version",
    );
    return null;
  }

  const id = readString(value, "id", issues, "languageProfile.id");
  const version = readInteger(
    value,
    "version",
    issues,
    "languageProfile.version",
  );

  if (id == null || version == null || version === 0) {
    if (version === 0) {
      addIssue(
        issues,
        "invalid_field",
        "languageProfile.version",
        "languageProfile.version must be at least 1",
      );
    }
    return null;
  }

  return { id, version };
}

function readReview(
  value: unknown,
  issues: GameContentValidationIssue[],
): GameContentReviewV1 | null {
  if (!isRecord(value)) {
    addIssue(
      issues,
      value == null ? "required_field_missing" : "invalid_field",
      "review",
      "review metadata is required",
    );
    return null;
  }

  const reviewerId = readString(value, "reviewerId", issues, "review.reviewerId");
  const reviewedAt = readString(value, "reviewedAt", issues, "review.reviewedAt");
  const manualCoverage = value.manualCoverage;

  if (
    typeof manualCoverage !== "number" ||
    !Number.isFinite(manualCoverage) ||
    manualCoverage !== 1
  ) {
    addIssue(
      issues,
      "manual_review_required",
      "review.manualCoverage",
      "manualCoverage must be exactly 1",
    );
  }

  if (reviewedAt != null && Number.isNaN(Date.parse(reviewedAt))) {
    addIssue(
      issues,
      "invalid_field",
      "review.reviewedAt",
      "reviewedAt must be an ISO-compatible timestamp",
    );
  }

  if (
    reviewerId == null ||
    reviewedAt == null ||
    typeof manualCoverage !== "number"
  ) {
    return null;
  }

  return { reviewerId, reviewedAt, manualCoverage };
}

function readEntries(
  value: unknown,
  profile: LanguageProfile | null,
  allowedClueSources: ReadonlySet<string>,
  issues: GameContentValidationIssue[],
): GameContentEntryV1[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(
      issues,
      "invalid_field",
      "entries",
      "entries must be a non-empty array",
    );
    return null;
  }

  const entries: GameContentEntryV1[] = [];

  for (const [index, rawEntry] of value.entries()) {
    const basePath = `entries[${index}]`;
    if (!isRecord(rawEntry)) {
      addIssue(issues, "invalid_field", basePath, "entry must be an object");
      continue;
    }

    const id = readString(rawEntry, "id", issues, `${basePath}.id`);
    const answer = readString(rawEntry, "answer", issues, `${basePath}.answer`);
    const clue = readString(rawEntry, "clue", issues, `${basePath}.clue`);
    const clueSource = readString(
      rawEntry,
      "clueSource",
      issues,
      `${basePath}.clueSource`,
    );
    const row = readInteger(rawEntry, "row", issues, `${basePath}.row`);
    const col = readInteger(rawEntry, "col", issues, `${basePath}.col`);
    const direction = rawEntry.direction;
    const generatedBy = rawEntry.generatedBy;
    const rawAnswerCells = rawEntry.answerCells;

    if (direction !== "across" && direction !== "down") {
      addIssue(
        issues,
        "invalid_field",
        `${basePath}.direction`,
        "direction must be across or down",
      );
    }
    if (generatedBy !== "placed" && generatedBy !== "auto") {
      addIssue(
        issues,
        "invalid_field",
        `${basePath}.generatedBy`,
        "generatedBy must be placed or auto",
      );
    }
    if (rawEntry.needsManualClue !== false) {
      addIssue(
        issues,
        "manual_review_required",
        `${basePath}.needsManualClue`,
        "needsManualClue must be explicitly false",
      );
    }
    if (clueSource != null && !allowedClueSources.has(clueSource)) {
      addIssue(
        issues,
        "clue_source_not_allowed",
        `${basePath}.clueSource`,
        `clueSource ${clueSource} is not allowed`,
      );
    }

    let answerCells: string[] | null = null;
    if (
      !Array.isArray(rawAnswerCells) ||
      rawAnswerCells.length === 0 ||
      !rawAnswerCells.every((cell) => typeof cell === "string")
    ) {
      addIssue(
        issues,
        "invalid_answer_cells",
        `${basePath}.answerCells`,
        "answerCells must be a non-empty string array",
      );
    } else if (profile != null) {
      const normalized = normalizeAndValidateAnswerCells(
        profile,
        rawAnswerCells as string[],
      );
      answerCells = normalized.cells;
      if (!normalized.valid) {
        addIssue(
          issues,
          "invalid_answer_cells",
          `${basePath}.answerCells`,
          "answerCells contain a value rejected by the language profile",
        );
      }

      if (answer != null && answer !== projectAnswerCells(answerCells)) {
        addIssue(
          issues,
          "answer_projection_mismatch",
          `${basePath}.answer`,
          "answer must equal the normalized answerCells projection",
        );
      }
    } else {
      answerCells = [...(rawAnswerCells as string[])];
    }

    if (
      id == null ||
      answer == null ||
      answerCells == null ||
      clue == null ||
      clueSource == null ||
      row == null ||
      col == null ||
      (direction !== "across" && direction !== "down") ||
      (generatedBy !== "placed" && generatedBy !== "auto")
    ) {
      continue;
    }

    entries.push({
      id,
      answer,
      answerCells,
      clue,
      clueSource,
      direction: direction as Direction,
      row,
      col,
      generatedBy,
      needsManualClue: false,
    });
  }

  return entries.length === value.length ? entries : null;
}

export function validateGameContentV1(
  value: unknown,
  options: GameContentValidationOptions = {},
): GameContentValidationResult {
  const issues: GameContentValidationIssue[] = [];
  if (!isRecord(value)) {
    addIssue(issues, "invalid_field", "$", "content must be an object");
    return { pass: false, content: null, issues };
  }

  const schemaVersion = readString(value, "schemaVersion", issues);
  if (
    schemaVersion != null &&
    schemaVersion !== GAME_CONTENT_SCHEMA_VERSION
  ) {
    addIssue(
      issues,
      "invalid_field",
      "schemaVersion",
      `schemaVersion must be ${GAME_CONTENT_SCHEMA_VERSION}`,
    );
  }

  const contentLocale = readString(value, "contentLocale", issues);
  const releaseTimeZone = readString(value, "releaseTimeZone", issues);
  const languageProfile = readLanguageProfileReference(
    value.languageProfile,
    issues,
  );
  const puzzleId = readString(value, "puzzleId", issues);
  const packId = readString(value, "packId", issues);
  const slotId = readString(value, "slotId", issues);
  const grid = readGrid(value.grid, issues);
  const difficulty = value.difficulty;
  const themeId = readString(value, "themeId", issues);
  const chapterId = readString(value, "chapterId", issues);
  const generatorCommit = readString(value, "generatorCommit", issues);
  const generatorConfigHash = readString(
    value,
    "generatorConfigHash",
    issues,
  );
  const contentChecksum = readString(value, "contentChecksum", issues);
  const licenseManifestId = readString(value, "licenseManifestId", issues);
  const minClientVersion = readString(value, "minClientVersion", issues);
  const review = readReview(value.review, issues);

  if (difficulty !== "easy" && difficulty !== "normal" && difficulty !== "hard") {
    addIssue(
      issues,
      "invalid_field",
      "difficulty",
      "difficulty must be easy, normal, or hard",
    );
  }

  const worldTriggerSet = value.worldTriggerSet;
  if (!Array.isArray(worldTriggerSet)) {
    addIssue(
      issues,
      value.worldTriggerSet == null
        ? "required_field_missing"
        : "invalid_field",
      "worldTriggerSet",
      "worldTriggerSet must be an array",
    );
  }

  if (
    contentLocale != null &&
    options.requestedContentLocale != null &&
    contentLocale !== options.requestedContentLocale
  ) {
    addIssue(
      issues,
      "locale_mismatch",
      "contentLocale",
      "requested and payload content locales differ",
    );
  }

  const profile =
    contentLocale == null || languageProfile == null
      ? null
      : (options.resolveProfile ?? resolveLanguageProfile)(
          languageProfile,
          contentLocale,
        );
  if (contentLocale != null && languageProfile != null && profile == null) {
    addIssue(
      issues,
      "unsupported_language_profile",
      "languageProfile",
      "language profile is not registered for this content locale",
    );
  }

  const entries = readEntries(
    value.entries,
    profile,
    new Set(options.allowedClueSources ?? ["manual"]),
    issues,
  );

  const canBuild =
    schemaVersion === GAME_CONTENT_SCHEMA_VERSION &&
    contentLocale != null &&
    releaseTimeZone != null &&
    languageProfile != null &&
    puzzleId != null &&
    packId != null &&
    slotId != null &&
    grid != null &&
    entries != null &&
    (difficulty === "easy" || difficulty === "normal" || difficulty === "hard") &&
    themeId != null &&
    chapterId != null &&
    Array.isArray(worldTriggerSet) &&
    generatorCommit != null &&
    generatorConfigHash != null &&
    contentChecksum != null &&
    licenseManifestId != null &&
    review != null &&
    minClientVersion != null;

  if (!canBuild) {
    return { pass: false, content: null, issues };
  }

  const content: GameContentV1 = {
    schemaVersion: GAME_CONTENT_SCHEMA_VERSION,
    contentLocale,
    releaseTimeZone,
    languageProfile,
    puzzleId,
    packId,
    slotId,
    grid,
    entries,
    difficulty,
    themeId,
    chapterId,
    worldTriggerSet: [...worldTriggerSet],
    generatorCommit,
    generatorConfigHash,
    contentChecksum,
    licenseManifestId,
    review,
    minClientVersion,
  };

  const slotValidation = validatePuzzleSlots({
    puzzleId: content.puzzleId,
    date: content.slotId,
    difficulty: content.difficulty,
    gridSize: content.grid.length,
    grid: content.grid,
    entries: content.entries,
    metrics: {
      autoRunCount: 0,
      bboxDensity: 0,
      crossCells: 0,
      crossRatio: 0,
      filledCells: 0,
      multiCrossEntries: 0,
      placedWordCount: 0,
      wordCount: content.entries.length,
    },
  });
  if (!slotValidation.pass) {
    addIssue(
      issues,
      "grid_entry_mismatch",
      "entries",
      "grid slots and entries must match exactly",
    );
  }

  if (options.verifyChecksum == null) {
    addIssue(
      issues,
      "checksum_verifier_missing",
      "contentChecksum",
      "a checksum verifier is required for fail-closed validation",
    );
  } else if (!options.verifyChecksum(content)) {
    addIssue(
      issues,
      "checksum_mismatch",
      "contentChecksum",
      "content checksum verification failed",
    );
  }

  return {
    pass: issues.length === 0,
    content: issues.length === 0 ? content : null,
    issues,
  };
}
