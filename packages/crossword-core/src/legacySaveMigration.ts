import {
  canonicalizeForChecksum,
  compareCanonicalStrings,
  createEmptySaveV2,
  normalizeLegacyProgress,
  type JsonPrimitive,
  type SaveV2BonusUnlock,
  type SaveV2CompletionRecord,
  type SaveV2Envelope,
  type SaveV2MissionState,
  type SaveV2PuzzleSnapshot,
} from "./saveV2.ts";
import { encodeUtf8Bytes, sha256Checksum } from "./sha256.ts";
import type { SavedProgress } from "./types.ts";

export const LEGACY_SAVE_SNAPSHOT_VERSION = 1 as const;
export const LEGACY_CONTENT_LOCALE = "ko-KR" as const;
export const LEGACY_PROGRESS_KEY_PREFIX = "crossword-puzzle:progress:";
export const LEGACY_MISSION_KEY_PREFIX = "crossword-puzzle:mission:";
export const LEGACY_ARCHIVE_INDEX_KEY = "crossword-puzzle:archive:index";
export const LEGACY_ARCHIVE_RECORD_KEY_PREFIX =
  "crossword-puzzle:archive:record:";
export const LEGACY_BEST_TIME_KEY_PREFIX = "crossword-puzzle:best-time:";
export const LEGACY_BONUS_UNLOCK_KEY_PREFIX = "crossword-puzzle:bonus-unlock:";
export const LEGACY_EXTRA_ATTEMPT_GRANTS_KEY =
  "crossword-puzzle:extraAttemptGrants";

export const LEGACY_SETTING_KEYS = Object.freeze({
  answerInputMode: "crossword:answer-input-mode",
  autocheckEnabled: "crossword:autocheck-enabled",
  firstInputGuideSeen: "crossword:first-input-guide-seen",
  hapticEnabled: "crossword:haptic-enabled",
  howToPlaySeen: "crossword:how-to-play-seen",
  returnReminder: "crossword:return-reminder",
  soundEnabled: "crossword:sound-enabled",
  textScale: "crossword:text-scale",
  timerVisible: "crossword:timer-visible",
});

const MAX_SNAPSHOT_RECORDS = 2_000;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T/;

export type LegacySaveMarket =
  | "apps-in-toss"
  | "web"
  | "google-play"
  | "app-store";

export type LegacyRawStorageRecord = Readonly<{
  key: string;
  rawValue: string;
}>;

export type LegacyRawSnapshotV1 = Readonly<{
  snapshotVersion: typeof LEGACY_SAVE_SNAPSHOT_VERSION;
  market: LegacySaveMarket;
  sourceVersion: string;
  capturedAt: string;
  records: readonly LegacyRawStorageRecord[];
  sourceChecksum: string;
}>;

export type CreateLegacyRawSnapshotInput = Readonly<{
  market: LegacySaveMarket;
  sourceVersion: string;
  capturedAt: string;
  records: readonly LegacyRawStorageRecord[];
}>;

export type LegacyProjectionWrite = Readonly<{
  key: string;
  value: string;
}>;

export type LegacySaveMigrationResult = Readonly<{
  save: SaveV2Envelope;
  projectionWrites: readonly LegacyProjectionWrite[];
  migratedPuzzleIds: readonly string[];
  completedPuzzleIds: readonly string[];
}>;

export type MigrateLegacyRawSnapshotOptions = Readonly<{
  migratedAt: string;
  uiLocale?: string;
  knownContentChecksums?: Readonly<Record<string, string>>;
}>;

export type LegacySaveMigrationErrorCode =
  | "duplicate-key"
  | "invalid-record"
  | "invalid-snapshot"
  | "malformed-archive"
  | "malformed-bonus-unlock"
  | "malformed-mission"
  | "malformed-progress"
  | "malformed-setting"
  | "source-checksum-mismatch"
  | "unresolved-content-checksum";

export class LegacySaveMigrationError extends Error {
  readonly code: LegacySaveMigrationErrorCode;
  readonly key?: string;

  constructor(code: LegacySaveMigrationErrorCode, key?: string) {
    super(
      `Legacy save migration rejected: ${code}${key == null ? "" : ` (${key})`}`,
    );
    this.name = "LegacySaveMigrationError";
    this.code = code;
    this.key = key;
  }
}

type LegacyArchive = Readonly<{
  key: string;
  puzzleId: string;
  puzzleDate: string | null;
  puzzle: Record<string, unknown>;
  completedAt?: string;
  hintCount?: number;
  revealUsed?: boolean;
  mobileReaderValid: boolean;
  webReaderValid: boolean;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(
  rawValue: string,
  code: LegacySaveMigrationErrorCode,
  key: string,
) {
  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    throw new LegacySaveMigrationError(code, key);
  }
}

function normalizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function optionalIsoDate(value: unknown): string | undefined {
  return typeof value === "string" && ISO_DATE_PATTERN.test(value)
    ? value
    : undefined;
}

function sourcePayload(
  input: Pick<
    CreateLegacyRawSnapshotInput,
    "market" | "sourceVersion" | "records"
  >,
): string {
  return canonicalizeForChecksum({
    market: input.market,
    sourceVersion: input.sourceVersion,
    records: input.records,
  });
}

export function isLegacyCrosswordStorageKey(key: string): boolean {
  return (
    key !== "" &&
    key.length <= 256 &&
    !key.startsWith("crossword:game-") &&
    (key.startsWith("crossword-puzzle:") || key.startsWith("crossword:"))
  );
}

export function createLegacyRawSnapshot(
  input: CreateLegacyRawSnapshotInput,
): LegacyRawSnapshotV1 {
  if (
    input.sourceVersion.trim() === "" ||
    !ISO_DATE_PATTERN.test(input.capturedAt)
  ) {
    throw new LegacySaveMigrationError("invalid-snapshot");
  }

  const records = input.records
    .filter(({ key }) => isLegacyCrosswordStorageKey(key))
    .map(({ key, rawValue }) => {
      if (typeof rawValue !== "string") {
        throw new LegacySaveMigrationError("invalid-record", key);
      }
      return Object.freeze({ key, rawValue });
    })
    .sort((left, right) => compareCanonicalStrings(left.key, right.key));
  if (records.length > MAX_SNAPSHOT_RECORDS) {
    throw new LegacySaveMigrationError("invalid-snapshot");
  }

  let byteCount = 0;
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.key)) {
      throw new LegacySaveMigrationError("duplicate-key", record.key);
    }
    seen.add(record.key);
    byteCount +=
      encodeUtf8Bytes(record.key).length +
      encodeUtf8Bytes(record.rawValue).length;
  }
  if (byteCount > MAX_SNAPSHOT_BYTES) {
    throw new LegacySaveMigrationError("invalid-snapshot");
  }

  return Object.freeze({
    snapshotVersion: LEGACY_SAVE_SNAPSHOT_VERSION,
    market: input.market,
    sourceVersion: input.sourceVersion,
    capturedAt: input.capturedAt,
    records: Object.freeze(records),
    sourceChecksum: sha256Checksum(
      sourcePayload({
        market: input.market,
        sourceVersion: input.sourceVersion,
        records,
      }),
    ),
  });
}

export function verifyLegacyRawSnapshot(
  snapshot: LegacyRawSnapshotV1,
): boolean {
  if (
    snapshot.snapshotVersion !== LEGACY_SAVE_SNAPSHOT_VERSION ||
    snapshot.sourceVersion.trim() === "" ||
    !ISO_DATE_PATTERN.test(snapshot.capturedAt)
  ) {
    return false;
  }
  try {
    const recreated = createLegacyRawSnapshot(snapshot);
    return recreated.sourceChecksum === snapshot.sourceChecksum;
  } catch {
    return false;
  }
}

function parseProgress(
  rawValue: string,
  key: string,
): Readonly<{ progress: SavedProgress; assistanceKnown: boolean }> {
  const value = parseJson(rawValue, "malformed-progress", key);
  if (!isRecord(value)) {
    throw new LegacySaveMigrationError("malformed-progress", key);
  }
  if (
    value.cellValues !== undefined &&
    (!isRecord(value.cellValues) ||
      Object.values(value.cellValues).some((cell) => typeof cell !== "string"))
  ) {
    throw new LegacySaveMigrationError("malformed-progress", key);
  }
  return {
    progress: normalizeLegacyProgress(value as Partial<SavedProgress>),
    assistanceKnown: typeof value.revealUsed === "boolean",
  };
}

function parseMission(rawValue: string, key: string): SaveV2MissionState {
  const value = parseJson(rawValue, "malformed-mission", key);
  if (!isRecord(value)) {
    throw new LegacySaveMigrationError("malformed-mission", key);
  }
  const suffix = key.slice(LEGACY_MISSION_KEY_PREFIX.length);
  const keyDate = suffix.slice(0, 10);
  const keyPuzzleId = suffix.length > 11 ? suffix.slice(11) : null;
  const date = value.date;
  const puzzleId = value.puzzleId;
  if (
    typeof date !== "string" ||
    typeof puzzleId !== "string" ||
    !DATE_KEY_PATTERN.test(date) ||
    keyDate !== date ||
    puzzleId === "" ||
    (keyPuzzleId != null && keyPuzzleId !== puzzleId)
  ) {
    throw new LegacySaveMigrationError("malformed-mission", key);
  }

  const mission: SaveV2MissionState = {
    sourceKey: key,
    date,
    puzzleId,
    attemptsUsed: normalizeCount(value.attemptsUsed),
    maxAttempts: Math.max(1, normalizeCount(value.maxAttempts) || 3),
  };
  const completedAt = optionalIsoDate(value.completedAt);
  const lastStartedAt = optionalIsoDate(value.lastStartedAt);
  const extraAttemptsGranted = normalizeCount(value.extraAttemptsGranted);
  if (completedAt != null) mission.completedAt = completedAt;
  if (lastStartedAt != null) mission.lastStartedAt = lastStartedAt;
  if (extraAttemptsGranted > 0) {
    mission.extraAttemptsGranted = extraAttemptsGranted;
  }
  return mission;
}

function parseArchive(rawValue: string, key: string): LegacyArchive {
  const value = parseJson(rawValue, "malformed-archive", key);
  if (!isRecord(value) || !isRecord(value.puzzle)) {
    throw new LegacySaveMigrationError("malformed-archive", key);
  }
  const keyPuzzleId = key.slice(LEGACY_ARCHIVE_RECORD_KEY_PREFIX.length);
  const puzzleId =
    typeof value.puzzleId === "string"
      ? value.puzzleId
      : typeof value.puzzle.puzzleId === "string"
        ? value.puzzle.puzzleId
        : null;
  if (
    puzzleId == null ||
    puzzleId === "" ||
    puzzleId !== keyPuzzleId ||
    value.puzzle.puzzleId !== puzzleId
  ) {
    throw new LegacySaveMigrationError("malformed-archive", key);
  }
  const puzzleDate =
    typeof value.puzzle.date === "string" &&
    DATE_KEY_PATTERN.test(value.puzzle.date)
      ? value.puzzle.date
      : null;
  const hintCount =
    typeof value.hintCount === "number" && Number.isFinite(value.hintCount)
      ? Math.max(0, Math.floor(value.hintCount))
      : undefined;
  return {
    key,
    puzzleId,
    puzzleDate,
    puzzle: value.puzzle,
    completedAt: optionalIsoDate(value.completedAt),
    hintCount,
    revealUsed:
      typeof value.revealUsed === "boolean" ? value.revealUsed : undefined,
    mobileReaderValid: isMobileArchivedPuzzle(value.puzzle, puzzleId),
    webReaderValid: typeof value.cachedAt === "string",
  };
}

function isMobileArchivedPuzzle(
  value: Record<string, unknown>,
  puzzleId: string,
): boolean {
  const gridSize = value.gridSize;
  const grid = value.grid;
  const entries = value.entries;
  return (
    value.puzzleId === puzzleId &&
    typeof value.date === "string" &&
    typeof gridSize === "number" &&
    Number.isInteger(gridSize) &&
    gridSize > 0 &&
    Array.isArray(grid) &&
    grid.length === gridSize &&
    grid.every(
      (row) =>
        Array.isArray(row) &&
        row.length === gridSize &&
        row.every((cell) => typeof cell === "string"),
    ) &&
    Array.isArray(entries) &&
    entries.length > 0 &&
    entries.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.id === "string" &&
        typeof entry.answer === "string" &&
        typeof entry.clue === "string" &&
        (entry.direction === "across" || entry.direction === "down") &&
        (entry.generatedBy === "placed" || entry.generatedBy === "auto") &&
        typeof entry.row === "number" &&
        typeof entry.col === "number",
    ) &&
    isRecord(value.metrics)
  );
}

function parseBonusUnlocks(rawValue: string, key: string): SaveV2BonusUnlock[] {
  const value = parseJson(rawValue, "malformed-bonus-unlock", key);
  const date = key.slice(LEGACY_BONUS_UNLOCK_KEY_PREFIX.length);
  const values = Array.isArray(value) ? value : [value];
  const result: SaveV2BonusUnlock[] = [];
  const seen = new Set<string>();
  for (const candidate of values) {
    if (!isRecord(candidate)) {
      throw new LegacySaveMigrationError("malformed-bonus-unlock", key);
    }
    if (
      candidate.date !== date ||
      typeof candidate.puzzleId !== "string" ||
      candidate.puzzleId === "" ||
      typeof candidate.unlockedAt !== "string" ||
      !ISO_DATE_PATTERN.test(candidate.unlockedAt)
    ) {
      throw new LegacySaveMigrationError("malformed-bonus-unlock", key);
    }
    if (!seen.has(candidate.puzzleId)) {
      seen.add(candidate.puzzleId);
      result.push({
        date,
        puzzleId: candidate.puzzleId,
        unlockedAt: candidate.unlockedAt,
      });
    }
  }
  return result;
}

function enabledSetting(rawValue: string | undefined): boolean {
  return rawValue !== "0";
}

function seenSetting(rawValue: string | undefined): boolean {
  return rawValue === "1";
}

function putOptionalPrimitive(
  target: Record<string, JsonPrimitive>,
  key: string,
  value: unknown,
): void {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    target[key] = value;
  }
}

function getContentChecksum(
  puzzleId: string,
  archives: ReadonlyMap<string, LegacyArchive>,
  knownContentChecksums: Readonly<Record<string, string>>,
): string | null {
  const known = knownContentChecksums[puzzleId];
  if (typeof known === "string" && known.trim() !== "") return known;
  const archive = archives.get(puzzleId);
  if (archive == null) return null;
  return `legacy-puzzle-${sha256Checksum(
    canonicalizeForChecksum(archive.puzzle),
  )}`;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareCanonicalStrings);
}

function serializeMission(mission: SaveV2MissionState): string {
  return JSON.stringify({
    date: mission.date,
    puzzleId: mission.puzzleId,
    attemptsUsed: mission.attemptsUsed,
    maxAttempts: mission.maxAttempts,
    ...(mission.completedAt == null
      ? {}
      : { completedAt: mission.completedAt }),
    ...(mission.lastStartedAt == null
      ? {}
      : { lastStartedAt: mission.lastStartedAt }),
    ...(mission.extraAttemptsGranted == null
      ? {}
      : { extraAttemptsGranted: mission.extraAttemptsGranted }),
  });
}

export function projectSaveV2ToLegacyWrites(
  save: SaveV2Envelope,
  contentLocale = LEGACY_CONTENT_LOCALE,
): LegacyProjectionWrite[] {
  const state = save.content[contentLocale];
  if (state == null) return [];
  const writes = new Map<string, string>();

  for (const [puzzleId, snapshot] of Object.entries(state.puzzles)) {
    writes.set(
      `${LEGACY_PROGRESS_KEY_PREFIX}${puzzleId}`,
      JSON.stringify({
        cellValues: snapshot.cellValues,
        earnedHintCredits: snapshot.earnedHintCredits,
        hintCount: snapshot.hintCount,
        revealUsed: snapshot.revealUsed,
        tentativeCells: snapshot.tentativeCells,
      } satisfies SavedProgress),
    );
  }
  for (const mission of Object.values(state.missions ?? {})) {
    writes.set(mission.sourceKey, serializeMission(mission));
  }
  if (state.dailyExtraAttemptGrants != null) {
    writes.set(
      LEGACY_EXTRA_ATTEMPT_GRANTS_KEY,
      JSON.stringify(state.dailyExtraAttemptGrants),
    );
  }
  for (const [puzzleId, bestTimeMs] of Object.entries(
    state.personalBestMsByPuzzleId ?? {},
  )) {
    writes.set(`${LEGACY_BEST_TIME_KEY_PREFIX}${puzzleId}`, String(bestTimeMs));
  }
  const bonusByDate = new Map<string, SaveV2BonusUnlock[]>();
  for (const unlock of state.bonusUnlocks ?? []) {
    bonusByDate.set(unlock.date, [
      ...(bonusByDate.get(unlock.date) ?? []),
      unlock,
    ]);
  }
  for (const [date, unlocks] of bonusByDate) {
    writes.set(
      `${LEGACY_BONUS_UNLOCK_KEY_PREFIX}${date}`,
      JSON.stringify(unlocks),
    );
  }

  const settings = save.profile.settings;
  writes.set(
    LEGACY_SETTING_KEYS.answerInputMode,
    save.profile.inputMode === "cell" ? "cell" : "box",
  );
  for (const [legacyKey, settingKey] of [
    [LEGACY_SETTING_KEYS.autocheckEnabled, "autocheckEnabled"],
    [LEGACY_SETTING_KEYS.hapticEnabled, "hapticEnabled"],
    [LEGACY_SETTING_KEYS.soundEnabled, "soundEnabled"],
    [LEGACY_SETTING_KEYS.timerVisible, "timerVisible"],
  ] as const) {
    writes.set(legacyKey, settings[settingKey] === false ? "0" : "1");
  }
  writes.set(
    LEGACY_SETTING_KEYS.howToPlaySeen,
    settings.howToPlaySeen === true ? "1" : "0",
  );
  writes.set(
    LEGACY_SETTING_KEYS.firstInputGuideSeen,
    settings.firstInputGuideSeen === true ? "1" : "0",
  );
  writes.set(
    LEGACY_SETTING_KEYS.textScale,
    save.profile.accessibility.textScale === "large" ? "large" : "normal",
  );

  if (typeof settings.returnReminderPromptCount === "number") {
    const reminder: Record<string, JsonPrimitive> = {
      promptCount: settings.returnReminderPromptCount,
    };
    putOptionalPrimitive(
      reminder,
      "lastPromptDate",
      settings.returnReminderLastPromptDate,
    );
    putOptionalPrimitive(reminder, "outcome", settings.returnReminderOutcome);
    putOptionalPrimitive(
      reminder,
      "errorReason",
      settings.returnReminderErrorReason,
    );
    writes.set(LEGACY_SETTING_KEYS.returnReminder, JSON.stringify(reminder));
  }

  return [...writes.entries()]
    .sort(([left], [right]) => compareCanonicalStrings(left, right))
    .map(([key, value]) => Object.freeze({ key, value }));
}

export function migrateLegacyRawSnapshotToSaveV2(
  snapshot: LegacyRawSnapshotV1,
  options: MigrateLegacyRawSnapshotOptions,
): LegacySaveMigrationResult {
  if (!verifyLegacyRawSnapshot(snapshot)) {
    throw new LegacySaveMigrationError("source-checksum-mismatch");
  }

  const rawByKey = new Map(
    snapshot.records.map(({ key, rawValue }) => [key, rawValue]),
  );
  const progressByPuzzleId = new Map<
    string,
    Readonly<{ progress: SavedProgress; assistanceKnown: boolean }>
  >();
  const missions = new Map<string, SaveV2MissionState>();
  const archives = new Map<string, LegacyArchive>();
  const archiveIndexPuzzleIds: string[] = [];
  const bestTimes = new Map<string, number>();
  const bonusUnlocks: SaveV2BonusUnlock[] = [];

  for (const { key, rawValue } of snapshot.records) {
    if (key.startsWith(LEGACY_PROGRESS_KEY_PREFIX)) {
      const puzzleId = key.slice(LEGACY_PROGRESS_KEY_PREFIX.length);
      if (puzzleId === "") {
        throw new LegacySaveMigrationError("malformed-progress", key);
      }
      progressByPuzzleId.set(puzzleId, parseProgress(rawValue, key));
    } else if (key.startsWith(LEGACY_MISSION_KEY_PREFIX)) {
      missions.set(key, parseMission(rawValue, key));
    } else if (key.startsWith(LEGACY_ARCHIVE_RECORD_KEY_PREFIX)) {
      const archive = parseArchive(rawValue, key);
      archives.set(archive.puzzleId, archive);
    } else if (key === LEGACY_ARCHIVE_INDEX_KEY) {
      const value = parseJson(rawValue, "malformed-archive", key);
      if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== "string")
      ) {
        throw new LegacySaveMigrationError("malformed-archive", key);
      }
      archiveIndexPuzzleIds.push(...value);
    } else if (key.startsWith(LEGACY_BEST_TIME_KEY_PREFIX)) {
      const puzzleId = key.slice(LEGACY_BEST_TIME_KEY_PREFIX.length);
      const value = Number(rawValue);
      if (puzzleId === "" || !Number.isFinite(value) || value <= 0) {
        throw new LegacySaveMigrationError("invalid-record", key);
      }
      bestTimes.set(puzzleId, Math.round(value));
    } else if (key.startsWith(LEGACY_BONUS_UNLOCK_KEY_PREFIX)) {
      bonusUnlocks.push(...parseBonusUnlocks(rawValue, key));
    }
  }

  const knownChecksums = options.knownContentChecksums ?? {};
  const completedPuzzleIds = new Set<string>();
  const streakDates = new Set<string>();
  const completedAtByPuzzleId = new Map<string, string>();
  for (const mission of missions.values()) {
    if (mission.completedAt != null) {
      completedPuzzleIds.add(mission.puzzleId);
      streakDates.add(mission.date);
      completedAtByPuzzleId.set(mission.puzzleId, mission.completedAt);
    }
  }
  const readableArchiveIds = new Set(
    snapshot.market === "google-play" || snapshot.market === "app-store"
      ? archiveIndexPuzzleIds.slice(0, 30)
      : archiveIndexPuzzleIds,
  );
  const eligibleArchives = [...archives.values()].filter(
    (archive) =>
      readableArchiveIds.has(archive.puzzleId) &&
      (snapshot.market === "apps-in-toss" || snapshot.market === "web"
        ? archive.webReaderValid
        : archive.mobileReaderValid),
  );
  const eligibleArchivesByPuzzleId = new Map(
    eligibleArchives.map((archive) => [archive.puzzleId, archive]),
  );
  for (const archive of eligibleArchives) {
    if (archive.completedAt != null) {
      completedPuzzleIds.add(archive.puzzleId);
      completedAtByPuzzleId.set(archive.puzzleId, archive.completedAt);
      if (archive.puzzleDate != null) streakDates.add(archive.puzzleDate);
    }
  }

  const requiredChecksumIds = new Set([
    ...progressByPuzzleId.keys(),
    ...completedPuzzleIds,
  ]);
  const checksumByPuzzleId = new Map<string, string>();
  for (const puzzleId of requiredChecksumIds) {
    const checksum = getContentChecksum(
      puzzleId,
      eligibleArchivesByPuzzleId,
      knownChecksums,
    );
    if (checksum == null) {
      throw new LegacySaveMigrationError(
        "unresolved-content-checksum",
        puzzleId,
      );
    }
    checksumByPuzzleId.set(puzzleId, checksum);
  }

  const inputModeRaw = rawByKey.get(LEGACY_SETTING_KEYS.answerInputMode);
  if (
    inputModeRaw !== undefined &&
    inputModeRaw !== "box" &&
    inputModeRaw !== "cell"
  ) {
    throw new LegacySaveMigrationError(
      "malformed-setting",
      LEGACY_SETTING_KEYS.answerInputMode,
    );
  }
  const save = createEmptySaveV2({
    uiLocale: options.uiLocale ?? LEGACY_CONTENT_LOCALE,
    contentLocale: LEGACY_CONTENT_LOCALE,
    inputMode: inputModeRaw === "cell" ? "cell" : "word-strip",
    migratedAt: options.migratedAt,
    sourceVersion: snapshot.sourceVersion,
    migrationChecksum: snapshot.sourceChecksum,
  });
  const content = save.content[LEGACY_CONTENT_LOCALE];
  const puzzleSnapshots: Record<string, SaveV2PuzzleSnapshot> = {};
  for (const [puzzleId, parsedProgress] of [
    ...progressByPuzzleId.entries(),
  ].sort(([left], [right]) => compareCanonicalStrings(left, right))) {
    const progress = parsedProgress.progress;
    const completedAt = completedAtByPuzzleId.get(puzzleId);
    puzzleSnapshots[puzzleId] = {
      contentLocale: LEGACY_CONTENT_LOCALE,
      puzzleId,
      contentChecksum: checksumByPuzzleId.get(puzzleId) as string,
      currentEntryId: null,
      cellValues: { ...progress.cellValues },
      earnedHintCredits: progress.earnedHintCredits,
      hintCount: progress.hintCount,
      revealUsed: progress.revealUsed === true,
      tentativeCells: [...(progress.tentativeCells ?? [])],
      commandSequence: 0,
      phase: completedAt == null ? "active" : "result",
      updatedAt: options.migratedAt,
      ...(completedAt == null ? {} : { completedAt }),
    };
  }

  const completionRecords: SaveV2CompletionRecord[] = [];
  for (const puzzleId of uniqueSorted(completedPuzzleIds)) {
    const archive = archives.get(puzzleId);
    const parsedProgress = progressByPuzzleId.get(puzzleId);
    const progress = parsedProgress?.progress;
    completionRecords.push({
      puzzleId,
      contentLocale: LEGACY_CONTENT_LOCALE,
      contentChecksum: checksumByPuzzleId.get(puzzleId) as string,
      completedAt: completedAtByPuzzleId.get(puzzleId) as string,
      hintCount: archive?.hintCount ?? progress?.hintCount ?? 0,
      revealUsed: archive?.revealUsed ?? progress?.revealUsed === true,
      assistanceKnown:
        archive?.revealUsed !== undefined ||
        parsedProgress?.assistanceKnown === true,
    });
  }

  const settings: Record<string, JsonPrimitive> = {
    autocheckEnabled: enabledSetting(
      rawByKey.get(LEGACY_SETTING_KEYS.autocheckEnabled),
    ),
    firstInputGuideSeen: seenSetting(
      rawByKey.get(LEGACY_SETTING_KEYS.firstInputGuideSeen),
    ),
    hapticEnabled: enabledSetting(
      rawByKey.get(LEGACY_SETTING_KEYS.hapticEnabled),
    ),
    howToPlaySeen: seenSetting(rawByKey.get(LEGACY_SETTING_KEYS.howToPlaySeen)),
    soundEnabled: enabledSetting(
      rawByKey.get(LEGACY_SETTING_KEYS.soundEnabled),
    ),
    timerVisible: enabledSetting(
      rawByKey.get(LEGACY_SETTING_KEYS.timerVisible),
    ),
  };
  const reminderRaw = rawByKey.get(LEGACY_SETTING_KEYS.returnReminder);
  if (reminderRaw != null) {
    const reminder = parseJson(
      reminderRaw,
      "malformed-setting",
      LEGACY_SETTING_KEYS.returnReminder,
    );
    if (!isRecord(reminder)) {
      throw new LegacySaveMigrationError(
        "malformed-setting",
        LEGACY_SETTING_KEYS.returnReminder,
      );
    }
    settings.returnReminderPromptCount = normalizeCount(reminder.promptCount);
    putOptionalPrimitive(
      settings,
      "returnReminderLastPromptDate",
      reminder.lastPromptDate,
    );
    putOptionalPrimitive(settings, "returnReminderOutcome", reminder.outcome);
    putOptionalPrimitive(
      settings,
      "returnReminderErrorReason",
      reminder.errorReason,
    );
  }
  const extraAttemptsRaw = rawByKey.get(LEGACY_EXTRA_ATTEMPT_GRANTS_KEY);
  let dailyExtraAttemptGrants: { date: string; count: number } | undefined;
  if (extraAttemptsRaw != null) {
    const value = parseJson(
      extraAttemptsRaw,
      "invalid-record",
      LEGACY_EXTRA_ATTEMPT_GRANTS_KEY,
    );
    if (
      !isRecord(value) ||
      typeof value.date !== "string" ||
      !DATE_KEY_PATTERN.test(value.date)
    ) {
      throw new LegacySaveMigrationError(
        "invalid-record",
        LEGACY_EXTRA_ATTEMPT_GRANTS_KEY,
      );
    }
    dailyExtraAttemptGrants = {
      date: value.date,
      count: normalizeCount(value.count),
    };
  }

  const migratedSave: SaveV2Envelope = {
    ...save,
    profile: {
      ...save.profile,
      settings,
      accessibility: {
        textScale:
          rawByKey.get(LEGACY_SETTING_KEYS.textScale) === "large"
            ? "large"
            : "normal",
      },
    },
    content: {
      [LEGACY_CONTENT_LOCALE]: {
        ...content,
        puzzles: puzzleSnapshots,
        completedPuzzleIds: uniqueSorted(completedPuzzleIds),
        streakCompletedDates: uniqueSorted(streakDates),
        completionRecords,
        missions: Object.fromEntries(
          [...missions.entries()].sort(([left], [right]) =>
            compareCanonicalStrings(left, right),
          ),
        ),
        ...(dailyExtraAttemptGrants == null ? {} : { dailyExtraAttemptGrants }),
        bonusUnlocks: [...bonusUnlocks].sort((left, right) =>
          compareCanonicalStrings(
            `${left.date}:${left.puzzleId}`,
            `${right.date}:${right.puzzleId}`,
          ),
        ),
        personalBestMsByPuzzleId: Object.fromEntries(
          [...bestTimes.entries()].sort(([left], [right]) =>
            compareCanonicalStrings(left, right),
          ),
        ),
      },
    },
    legacy: {
      postcard: {
        schemaVersion: 1,
        completedPuzzleCount: completedPuzzleIds.size,
        migratedAt: options.migratedAt,
      },
    },
  };

  const projection = new Map(
    snapshot.records.map(({ key, rawValue }) => [key, rawValue]),
  );
  for (const write of projectSaveV2ToLegacyWrites(migratedSave)) {
    projection.set(write.key, write.value);
  }

  return Object.freeze({
    save: migratedSave,
    projectionWrites: Object.freeze(
      [...projection.entries()]
        .sort(([left], [right]) => compareCanonicalStrings(left, right))
        .map(([key, value]) => Object.freeze({ key, value })),
    ),
    migratedPuzzleIds: Object.freeze(uniqueSorted(progressByPuzzleId.keys())),
    completedPuzzleIds: Object.freeze(uniqueSorted(completedPuzzleIds)),
  });
}
