import {
  LEGACY_ARCHIVE_RECORD_KEY_PREFIX,
  LEGACY_SETTING_KEYS,
  migrateLegacyRawSnapshotToSaveV2,
  projectSaveV2ToLegacyWrites,
  verifyLegacyRawSnapshot,
  type LegacyProjectionWrite,
  type LegacyRawSnapshotV1,
} from "../../packages/crossword-core/src/legacySaveMigration.ts";
import {
  canonicalizeForChecksum,
  compareCanonicalStrings,
  sealSaveV2,
  validateSaveV2Namespaces,
  verifySaveV2Checksum,
  type SaveChecksumPort,
  type SaveV2CompletionRecord,
  type SaveV2ContentState,
  type SaveV2Envelope,
  type SaveV2PuzzleSnapshot,
} from "../../packages/crossword-core/src/saveV2.ts";
import {
  encodeUtf8Bytes,
  sha256Checksum,
} from "../../packages/crossword-core/src/sha256.ts";
import {
  DEFAULT_GAME_SAVE_V2_KEY,
  parseGameSaveV2,
  type GameSaveLegacyProjectionPort,
  type KeyValueStoragePort,
} from "./gameSaveRepository.ts";

export const GAME_SAVE_MIGRATION_BACKUP_KEY_PREFIX =
  "crossword:game-save:migration:backup:v1";
export const GAME_SAVE_MIGRATION_STAGING_KEY =
  "crossword:game-save:migration:staging:v2";
export const GAME_SAVE_ACTIVE_POINTER_KEY =
  "crossword:game-save:active-pointer:v1";
export const GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY =
  "crossword:game-save:legacy-projection-outbox:v1";
export const GAME_SAVE_MIGRATION_RESULT_KEY =
  "crossword:game-save:migration-result:v1";

const POINTER_VERSION = 1 as const;
const BACKUP_VERSION = 1 as const;
const OUTBOX_VERSION = 1 as const;
const RESULT_VERSION = 1 as const;

export type GameSaveActivePointerV1 = Readonly<{
  pointerVersion: typeof POINTER_VERSION;
  activeKey: typeof DEFAULT_GAME_SAVE_V2_KEY;
  saveVersion: 2;
  activationId: string;
  activatedAt: string;
  checksum: string;
}>;

export type GameSaveMigrationStatus =
  | "activated"
  | "already-active"
  | "promoted-direct-v2"
  | "reconciled-legacy";

export type PrepareGameSaveMigrationResult = Readonly<{
  status: GameSaveMigrationStatus;
  pointer: GameSaveActivePointerV1;
  save: SaveV2Envelope;
  migratedPuzzleIds: readonly string[];
  completedPuzzleIds: readonly string[];
}>;

export type PrepareGameSaveMigrationOptions = Readonly<{
  storage: KeyValueStoragePort;
  legacySnapshot: LegacyRawSnapshotV1;
  knownContentChecksums?: Readonly<Record<string, string>>;
  uiLocale?: string;
  now?: () => string;
  checksumPort?: SaveChecksumPort;
}>;

export type GameSaveMigrationErrorCode =
  | "active-pointer-invalid"
  | "backup-write-failed"
  | "existing-save-invalid"
  | "legacy-projection-failed"
  | "migration-transform-failed"
  | "projection-outbox-invalid"
  | "save-activation-failed"
  | "staging-verification-failed";

export class GameSaveMigrationError extends Error {
  readonly code: GameSaveMigrationErrorCode;

  constructor(code: GameSaveMigrationErrorCode, cause?: unknown) {
    super(`Game save migration rejected: ${code}`);
    this.name = "GameSaveMigrationError";
    this.code = code;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

type MigrationBackupV1 = Readonly<{
  backupVersion: typeof BACKUP_VERSION;
  snapshot: LegacyRawSnapshotV1;
  checksum: string;
}>;

type ProjectionOutboxRecord = Readonly<{
  key: string;
  value: string;
  previousValue: string | null;
}>;

type ProjectionOutboxV1 = Readonly<{
  outboxVersion: typeof OUTBOX_VERSION;
  mode: "activation" | "ongoing";
  activationId: string;
  canonicalSaveKey: string;
  targetSaveChecksum: string;
  records: readonly ProjectionOutboxRecord[];
  checksum: string;
}>;

type MigrationResultV1 = Readonly<{
  resultVersion: typeof RESULT_VERSION;
  status: "succeeded" | "failed";
  activationId: string;
  occurredAt: string;
  errorCode?: GameSaveMigrationErrorCode;
}>;

const portableChecksumPort: SaveChecksumPort = {
  digest: sha256Checksum,
};

const legacyFNV1aChecksumPort: SaveChecksumPort = {
  digest(payload) {
    let hash = 2_166_136_261;
    for (const byte of encodeUtf8Bytes(payload)) {
      hash ^= byte;
      hash = Math.imul(hash, 16_777_619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function checksumWithoutField(
  value: Readonly<Record<string, unknown>>,
): string {
  return sha256Checksum(
    canonicalizeForChecksum({ ...value, checksum: undefined }),
  );
}

function createPointer(
  activationId: string,
  activatedAt: string,
): GameSaveActivePointerV1 {
  const value = {
    pointerVersion: POINTER_VERSION,
    activeKey: DEFAULT_GAME_SAVE_V2_KEY as typeof DEFAULT_GAME_SAVE_V2_KEY,
    saveVersion: 2 as const,
    activationId,
    activatedAt,
  };
  return Object.freeze({ ...value, checksum: checksumWithoutField(value) });
}

function parsePointer(raw: string): GameSaveActivePointerV1 | null {
  const value = parseJson(raw);
  if (
    !isRecord(value) ||
    value.pointerVersion !== POINTER_VERSION ||
    value.activeKey !== DEFAULT_GAME_SAVE_V2_KEY ||
    value.saveVersion !== 2 ||
    typeof value.activationId !== "string" ||
    value.activationId === "" ||
    typeof value.activatedAt !== "string" ||
    typeof value.checksum !== "string"
  ) {
    return null;
  }
  const pointer = value as GameSaveActivePointerV1;
  return checksumWithoutField(pointer) === pointer.checksum ? pointer : null;
}

function createBackup(snapshot: LegacyRawSnapshotV1): MigrationBackupV1 {
  const value = { backupVersion: BACKUP_VERSION, snapshot };
  return Object.freeze({ ...value, checksum: checksumWithoutField(value) });
}

function parseBackup(raw: string): MigrationBackupV1 | null {
  const value = parseJson(raw);
  if (
    !isRecord(value) ||
    value.backupVersion !== BACKUP_VERSION ||
    !isRecord(value.snapshot) ||
    typeof value.checksum !== "string"
  ) {
    return null;
  }
  const backup = value as MigrationBackupV1;
  return checksumWithoutField(backup) === backup.checksum &&
    verifyLegacyRawSnapshot(backup.snapshot)
    ? backup
    : null;
}

function createOutbox(
  mode: ProjectionOutboxV1["mode"],
  activationId: string,
  canonicalSaveKey: string,
  targetSaveChecksum: string,
  records: readonly ProjectionOutboxRecord[],
): ProjectionOutboxV1 {
  const value = {
    outboxVersion: OUTBOX_VERSION,
    mode,
    activationId,
    canonicalSaveKey,
    targetSaveChecksum,
    records,
  };
  return Object.freeze({ ...value, checksum: checksumWithoutField(value) });
}

function parseOutbox(raw: string): ProjectionOutboxV1 | null {
  const value = parseJson(raw);
  if (
    !isRecord(value) ||
    value.outboxVersion !== OUTBOX_VERSION ||
    (value.mode !== "activation" && value.mode !== "ongoing") ||
    typeof value.activationId !== "string" ||
    typeof value.canonicalSaveKey !== "string" ||
    value.canonicalSaveKey === "" ||
    typeof value.targetSaveChecksum !== "string" ||
    !Array.isArray(value.records) ||
    typeof value.checksum !== "string"
  ) {
    return null;
  }
  for (const record of value.records) {
    if (
      !isRecord(record) ||
      typeof record.key !== "string" ||
      typeof record.value !== "string" ||
      (record.previousValue !== null &&
        typeof record.previousValue !== "string")
    ) {
      return null;
    }
  }
  const outbox = value as ProjectionOutboxV1;
  return checksumWithoutField(outbox) === outbox.checksum ? outbox : null;
}

async function writeWithReadback(
  storage: KeyValueStoragePort,
  key: string,
  value: string,
): Promise<void> {
  await storage.setItem(key, value);
  if ((await storage.getItem(key)) !== value) {
    throw new Error(`durable read-back failed for ${key}`);
  }
}

async function writeResult(
  storage: KeyValueStoragePort,
  result: MigrationResultV1,
): Promise<void> {
  try {
    await writeWithReadback(
      storage,
      GAME_SAVE_MIGRATION_RESULT_KEY,
      JSON.stringify(result),
    );
  } catch {
    // Diagnostic persistence must not turn a successful pointer switch into a
    // failed migration or hide the original failure.
  }
}

async function verifySerializedSave(
  raw: string,
  checksumPort: SaveChecksumPort,
): Promise<SaveV2Envelope | null> {
  const save = parseGameSaveV2(raw);
  if (save == null || validateSaveV2Namespaces(save).length > 0) return null;
  try {
    const verificationPort = save.checksum.startsWith("fnv1a32:")
      ? legacyFNV1aChecksumPort
      : checksumPort;
    return (await verifySaveV2Checksum(save, verificationPort)) ? save : null;
  } catch {
    return null;
  }
}

async function captureProjectionOutbox(
  storage: KeyValueStoragePort,
  mode: ProjectionOutboxV1["mode"],
  activationId: string,
  canonicalSaveKey: string,
  targetSaveChecksum: string,
  writes: readonly LegacyProjectionWrite[],
): Promise<ProjectionOutboxV1> {
  const records: ProjectionOutboxRecord[] = [];
  for (const write of writes) {
    records.push({
      key: write.key,
      value: write.value,
      previousValue: await storage.getItem(write.key),
    });
  }
  const outbox = createOutbox(
    mode,
    activationId,
    canonicalSaveKey,
    targetSaveChecksum,
    records,
  );
  await writeWithReadback(
    storage,
    GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY,
    JSON.stringify(outbox),
  );
  return outbox;
}

async function applyProjectionRecords(
  storage: KeyValueStoragePort,
  records: readonly ProjectionOutboxRecord[],
): Promise<void> {
  for (const record of records) {
    await writeWithReadback(storage, record.key, record.value);
  }
}

async function restoreProjectionPreimages(
  storage: KeyValueStoragePort,
  records: readonly ProjectionOutboxRecord[],
): Promise<void> {
  for (const record of [...records].reverse()) {
    if (record.previousValue == null) {
      await storage.removeItem(record.key);
      if ((await storage.getItem(record.key)) != null) {
        throw new Error(`legacy rollback delete failed for ${record.key}`);
      }
    } else {
      await writeWithReadback(storage, record.key, record.previousValue);
    }
  }
}

function canonicalValueEquals(left: unknown, right: unknown): boolean {
  return canonicalizeForChecksum(left) === canonicalizeForChecksum(right);
}

function mergePuzzleSnapshots(
  active: Readonly<Record<string, SaveV2PuzzleSnapshot>>,
  legacy: Readonly<Record<string, SaveV2PuzzleSnapshot>>,
  mergedAt: string,
): Record<string, SaveV2PuzzleSnapshot> {
  const puzzles = { ...active };
  for (const [puzzleId, incoming] of Object.entries(legacy)) {
    const current = puzzles[puzzleId];
    if (current == null) {
      puzzles[puzzleId] = incoming;
      continue;
    }
    if (
      current.contentLocale !== incoming.contentLocale ||
      current.contentChecksum !== incoming.contentChecksum
    ) {
      throw new GameSaveMigrationError("migration-transform-failed");
    }
    const representable = {
      cellValues: incoming.cellValues,
      earnedHintCredits: incoming.earnedHintCredits,
      hintCount: incoming.hintCount,
      revealUsed: incoming.revealUsed,
      tentativeCells: incoming.tentativeCells,
      completedAt: incoming.completedAt,
      phase: incoming.phase,
    };
    const currentRepresentable = {
      cellValues: current.cellValues,
      earnedHintCredits: current.earnedHintCredits,
      hintCount: current.hintCount,
      revealUsed: current.revealUsed,
      tentativeCells: current.tentativeCells,
      completedAt: current.completedAt,
      phase: current.phase,
    };
    if (canonicalValueEquals(representable, currentRepresentable)) continue;
    puzzles[puzzleId] = {
      ...current,
      ...representable,
      currentEntryId: current.currentEntryId,
      commandSequence: current.commandSequence + 1,
      updatedAt: mergedAt,
    };
  }
  return puzzles;
}

function mergeCompletionRecords(
  active: readonly SaveV2CompletionRecord[],
  legacy: readonly SaveV2CompletionRecord[],
): SaveV2CompletionRecord[] {
  const records = new Map(
    active.map((record) => [
      `${record.contentLocale}:${record.puzzleId}:${record.contentChecksum}`,
      record,
    ]),
  );
  for (const record of legacy) {
    const key = `${record.contentLocale}:${record.puzzleId}:${record.contentChecksum}`;
    if (!records.has(key)) records.set(key, record);
  }
  return [...records.entries()]
    .sort(([left], [right]) => compareCanonicalStrings(left, right))
    .map(([, record]) => record);
}

function mergeContentState(
  active: SaveV2ContentState | undefined,
  legacy: SaveV2ContentState,
  mergedAt: string,
): SaveV2ContentState {
  if (active == null) return legacy;
  const bonusUnlocks = new Map(
    (active.bonusUnlocks ?? []).map((unlock) => [
      `${unlock.date}:${unlock.puzzleId}`,
      unlock,
    ]),
  );
  for (const unlock of legacy.bonusUnlocks ?? []) {
    bonusUnlocks.set(`${unlock.date}:${unlock.puzzleId}`, unlock);
  }
  return {
    ...active,
    puzzles: mergePuzzleSnapshots(active.puzzles, legacy.puzzles, mergedAt),
    completedPuzzleIds: [
      ...new Set([...active.completedPuzzleIds, ...legacy.completedPuzzleIds]),
    ].sort(compareCanonicalStrings),
    streakCompletedDates: [
      ...new Set([
        ...active.streakCompletedDates,
        ...legacy.streakCompletedDates,
      ]),
    ].sort(compareCanonicalStrings),
    completionRecords: mergeCompletionRecords(
      active.completionRecords,
      legacy.completionRecords,
    ),
    missions: { ...(active.missions ?? {}), ...(legacy.missions ?? {}) },
    ...(legacy.dailyExtraAttemptGrants == null
      ? active.dailyExtraAttemptGrants == null
        ? {}
        : { dailyExtraAttemptGrants: active.dailyExtraAttemptGrants }
      : { dailyExtraAttemptGrants: legacy.dailyExtraAttemptGrants }),
    bonusUnlocks: [...bonusUnlocks.entries()]
      .sort(([left], [right]) => compareCanonicalStrings(left, right))
      .map(([, unlock]) => unlock),
    personalBestMsByPuzzleId: {
      ...(active.personalBestMsByPuzzleId ?? {}),
      ...(legacy.personalBestMsByPuzzleId ?? {}),
    },
  };
}

function mergeLegacySaveIntoActive(
  active: SaveV2Envelope,
  legacy: SaveV2Envelope,
  snapshot: LegacyRawSnapshotV1,
  mergedAt: string,
  projectedBaselineExists: boolean,
): SaveV2Envelope {
  const rawKeys = new Set(snapshot.records.map(({ key }) => key));
  const settings = { ...active.profile.settings };
  for (const [storageKey, settingKey] of [
    [LEGACY_SETTING_KEYS.autocheckEnabled, "autocheckEnabled"],
    [LEGACY_SETTING_KEYS.firstInputGuideSeen, "firstInputGuideSeen"],
    [LEGACY_SETTING_KEYS.hapticEnabled, "hapticEnabled"],
    [LEGACY_SETTING_KEYS.howToPlaySeen, "howToPlaySeen"],
    [LEGACY_SETTING_KEYS.soundEnabled, "soundEnabled"],
    [LEGACY_SETTING_KEYS.timerVisible, "timerVisible"],
  ] as const) {
    if (projectedBaselineExists || rawKeys.has(storageKey)) {
      const value = legacy.profile.settings[settingKey];
      if (value !== undefined) settings[settingKey] = value;
    }
  }
  for (const key of [
    "returnReminderPromptCount",
    "returnReminderLastPromptDate",
    "returnReminderOutcome",
    "returnReminderErrorReason",
  ] as const) {
    if (
      (projectedBaselineExists ||
        rawKeys.has(LEGACY_SETTING_KEYS.returnReminder)) &&
      legacy.profile.settings[key] !== undefined
    ) {
      settings[key] = legacy.profile.settings[key];
    }
  }
  const content = { ...active.content };
  for (const [contentLocale, legacyState] of Object.entries(legacy.content)) {
    content[contentLocale] = mergeContentState(
      content[contentLocale],
      legacyState,
      mergedAt,
    );
  }
  return {
    ...active,
    checksum: "",
    profile: {
      ...active.profile,
      settings,
      inputMode:
        projectedBaselineExists ||
        rawKeys.has(LEGACY_SETTING_KEYS.answerInputMode)
          ? legacy.profile.inputMode
          : active.profile.inputMode,
      accessibility:
        projectedBaselineExists || rawKeys.has(LEGACY_SETTING_KEYS.textScale)
          ? {
              ...active.profile.accessibility,
              ...legacy.profile.accessibility,
            }
          : active.profile.accessibility,
    },
    content,
  };
}

function savePayloadEquals(
  left: SaveV2Envelope,
  right: SaveV2Envelope,
): boolean {
  return canonicalValueEquals(
    { ...left, checksum: undefined },
    { ...right, checksum: undefined },
  );
}

export async function recoverLegacyProjectionOutbox(
  storage: KeyValueStoragePort,
): Promise<"none" | "rolled-back" | "rolled-forward"> {
  const raw = await storage.getItem(GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY);
  if (raw == null) return "none";
  const outbox = parseOutbox(raw);
  if (outbox == null) {
    throw new GameSaveMigrationError("projection-outbox-invalid");
  }
  const rawPointer = await storage.getItem(GAME_SAVE_ACTIVE_POINTER_KEY);
  const pointer = rawPointer == null ? null : parsePointer(rawPointer);
  let shouldRollForward =
    outbox.mode === "activation" &&
    pointer?.activationId === outbox.activationId;
  if (outbox.mode === "ongoing" && pointer != null) {
    const rawSave = await storage.getItem(outbox.canonicalSaveKey);
    const activeSave =
      rawSave == null
        ? null
        : await verifySerializedSave(rawSave, portableChecksumPort);
    shouldRollForward = activeSave?.checksum === outbox.targetSaveChecksum;
  }
  if (shouldRollForward) {
    await applyProjectionRecords(storage, outbox.records);
    await storage.removeItem(GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY);
    return "rolled-forward";
  }
  await restoreProjectionPreimages(storage, outbox.records);
  await storage.removeItem(GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY);
  return "rolled-back";
}

async function activate(
  options: PrepareGameSaveMigrationOptions,
  save: SaveV2Envelope,
  projectionWrites: readonly LegacyProjectionWrite[],
  status: Extract<GameSaveMigrationStatus, "activated" | "promoted-direct-v2">,
  migratedPuzzleIds: readonly string[],
  completedPuzzleIds: readonly string[],
): Promise<PrepareGameSaveMigrationResult> {
  const checksumPort = options.checksumPort ?? portableChecksumPort;
  const now = options.now?.() ?? new Date().toISOString();
  const activationId = options.legacySnapshot.sourceChecksum;
  const serializedSave = JSON.stringify(save);
  let pointerWritten = false;
  let outbox: ProjectionOutboxV1 | null = null;

  try {
    await writeWithReadback(
      options.storage,
      GAME_SAVE_MIGRATION_STAGING_KEY,
      serializedSave,
    );
    const stagedRaw = await options.storage.getItem(
      GAME_SAVE_MIGRATION_STAGING_KEY,
    );
    if (
      stagedRaw == null ||
      (await verifySerializedSave(stagedRaw, checksumPort)) == null
    ) {
      throw new GameSaveMigrationError("staging-verification-failed");
    }

    outbox = await captureProjectionOutbox(
      options.storage,
      "activation",
      activationId,
      DEFAULT_GAME_SAVE_V2_KEY,
      save.checksum,
      projectionWrites,
    );
    await applyProjectionRecords(options.storage, outbox.records);
    await writeWithReadback(
      options.storage,
      DEFAULT_GAME_SAVE_V2_KEY,
      serializedSave,
    );
    const activeRaw = await options.storage.getItem(DEFAULT_GAME_SAVE_V2_KEY);
    if (
      activeRaw == null ||
      (await verifySerializedSave(activeRaw, checksumPort)) == null
    ) {
      throw new GameSaveMigrationError("save-activation-failed");
    }
    const pointer = createPointer(activationId, now);
    await writeWithReadback(
      options.storage,
      GAME_SAVE_ACTIVE_POINTER_KEY,
      JSON.stringify(pointer),
    );
    pointerWritten = true;
    await writeResult(options.storage, {
      resultVersion: RESULT_VERSION,
      status: "succeeded",
      activationId,
      occurredAt: now,
    });
    try {
      await options.storage.removeItem(GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY);
      await options.storage.removeItem(GAME_SAVE_MIGRATION_STAGING_KEY);
    } catch {
      // Pointer is already durable. A remaining outbox is rolled forward on
      // the next boot; staging is harmless forensic evidence.
    }
    return {
      status,
      pointer,
      save,
      migratedPuzzleIds,
      completedPuzzleIds,
    };
  } catch (cause) {
    const error =
      cause instanceof GameSaveMigrationError
        ? cause
        : new GameSaveMigrationError(
            outbox == null
              ? "staging-verification-failed"
              : "legacy-projection-failed",
            cause,
          );
    if (!pointerWritten && outbox != null) {
      try {
        await restoreProjectionPreimages(options.storage, outbox.records);
        await options.storage.removeItem(
          GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY,
        );
      } catch {
        // Keep the outbox so the next boot can finish the rollback.
      }
    }
    await writeResult(options.storage, {
      resultVersion: RESULT_VERSION,
      status: "failed",
      activationId,
      occurredAt: now,
      errorCode: error.code,
    });
    throw error;
  }
}

async function ensureMigrationBackup(
  options: PrepareGameSaveMigrationOptions,
): Promise<void> {
  const backup = createBackup(options.legacySnapshot);
  const backupKey = `${GAME_SAVE_MIGRATION_BACKUP_KEY_PREFIX}:${options.legacySnapshot.sourceChecksum}`;
  const serializedBackup = JSON.stringify(backup);
  try {
    const existingBackup = await options.storage.getItem(backupKey);
    if (existingBackup == null) {
      await writeWithReadback(options.storage, backupKey, serializedBackup);
    } else if (
      parseBackup(existingBackup)?.snapshot.sourceChecksum !==
      options.legacySnapshot.sourceChecksum
    ) {
      throw new Error("immutable migration backup mismatch");
    }
  } catch (cause) {
    throw new GameSaveMigrationError("backup-write-failed", cause);
  }
}

function knownChecksumsFromSave(
  save: SaveV2Envelope | null,
): Readonly<Record<string, string>> {
  if (save == null) return {};
  const values: Record<string, string> = {};
  for (const state of Object.values(save.content)) {
    for (const [puzzleId, puzzle] of Object.entries(state.puzzles)) {
      values[puzzleId] = puzzle.contentChecksum;
    }
    for (const completion of state.completionRecords) {
      values[completion.puzzleId] = completion.contentChecksum;
    }
  }
  return values;
}

function migrateSnapshot(
  options: PrepareGameSaveMigrationOptions,
  migratedAt: string,
  existingSave: SaveV2Envelope | null,
) {
  try {
    return migrateLegacyRawSnapshotToSaveV2(options.legacySnapshot, {
      migratedAt,
      uiLocale: options.uiLocale,
      knownContentChecksums: {
        ...knownChecksumsFromSave(existingSave),
        ...(options.knownContentChecksums ?? {}),
      },
    });
  } catch (cause) {
    throw new GameSaveMigrationError("migration-transform-failed", cause);
  }
}

async function persistReconciledSave(
  options: PrepareGameSaveMigrationOptions,
  pointer: GameSaveActivePointerV1,
  save: SaveV2Envelope,
  migratedPuzzleIds: readonly string[],
  completedPuzzleIds: readonly string[],
): Promise<PrepareGameSaveMigrationResult> {
  const projection = createGameSaveLegacyProjectionPort(options.storage);
  try {
    await projection.prepareCanonicalWrite(save);
    await writeWithReadback(
      options.storage,
      DEFAULT_GAME_SAVE_V2_KEY,
      JSON.stringify(save),
    );
    await projection.commitCanonicalWrite(save);
    await writeResult(options.storage, {
      resultVersion: RESULT_VERSION,
      status: "succeeded",
      activationId: pointer.activationId,
      occurredAt: options.now?.() ?? new Date().toISOString(),
    });
  } catch (cause) {
    try {
      await recoverLegacyProjectionOutbox(options.storage);
    } catch {
      // Keep the durable outbox for the next host boot if immediate recovery
      // cannot finish.
    }
    const error =
      cause instanceof GameSaveMigrationError
        ? cause
        : new GameSaveMigrationError("legacy-projection-failed", cause);
    await writeResult(options.storage, {
      resultVersion: RESULT_VERSION,
      status: "failed",
      activationId: pointer.activationId,
      occurredAt: options.now?.() ?? new Date().toISOString(),
      errorCode: error.code,
    });
    throw error;
  }
  return {
    status: "reconciled-legacy",
    pointer,
    save,
    migratedPuzzleIds,
    completedPuzzleIds,
  };
}

export async function prepareGameSaveMigration(
  options: PrepareGameSaveMigrationOptions,
): Promise<PrepareGameSaveMigrationResult> {
  const checksumPort = options.checksumPort ?? portableChecksumPort;
  const now = options.now?.() ?? new Date().toISOString();
  await recoverLegacyProjectionOutbox(options.storage);

  const rawPointer = await options.storage.getItem(
    GAME_SAVE_ACTIVE_POINTER_KEY,
  );
  const rawSave = await options.storage.getItem(DEFAULT_GAME_SAVE_V2_KEY);
  if (rawPointer != null) {
    const pointer = parsePointer(rawPointer);
    if (pointer == null || rawSave == null) {
      throw new GameSaveMigrationError("active-pointer-invalid");
    }
    const activeSave = await verifySerializedSave(rawSave, checksumPort);
    if (activeSave == null) {
      throw new GameSaveMigrationError("existing-save-invalid");
    }
    const migration = migrateSnapshot(options, now, activeSave);
    const merged = mergeLegacySaveIntoActive(
      activeSave,
      migration.save,
      options.legacySnapshot,
      now,
      true,
    );
    const requiresPortableReseal = activeSave.checksum.startsWith("fnv1a32:");
    if (!requiresPortableReseal && savePayloadEquals(activeSave, merged)) {
      return {
        status: "already-active",
        pointer,
        save: activeSave,
        migratedPuzzleIds: Object.freeze([]),
        completedPuzzleIds: Object.freeze([
          ...(activeSave.content["ko-KR"]?.completedPuzzleIds ?? []),
        ]),
      };
    }
    const sealed = await sealSaveV2(merged, checksumPort);
    if (validateSaveV2Namespaces(sealed).length > 0) {
      throw new GameSaveMigrationError("migration-transform-failed");
    }
    await ensureMigrationBackup(options);
    return persistReconciledSave(
      options,
      pointer,
      sealed,
      migration.migratedPuzzleIds,
      migration.completedPuzzleIds,
    );
  }

  if (rawSave != null) {
    const directSave = await verifySerializedSave(rawSave, checksumPort);
    if (directSave == null) {
      throw new GameSaveMigrationError("existing-save-invalid");
    }
    const migration = migrateSnapshot(options, now, directSave);
    const merged = mergeLegacySaveIntoActive(
      directSave,
      migration.save,
      options.legacySnapshot,
      now,
      false,
    );
    const sealed = await sealSaveV2(merged, checksumPort);
    if (validateSaveV2Namespaces(sealed).length > 0) {
      throw new GameSaveMigrationError("migration-transform-failed");
    }
    await ensureMigrationBackup(options);
    return activate(
      options,
      sealed,
      projectSaveV2ToLegacyWrites(sealed),
      "promoted-direct-v2",
      Object.keys(sealed.content["ko-KR"]?.puzzles ?? {}).sort(
        compareCanonicalStrings,
      ),
      [...(sealed.content["ko-KR"]?.completedPuzzleIds ?? [])],
    );
  }

  const migration = migrateSnapshot(options, now, null);
  const sealed = await sealSaveV2(migration.save, checksumPort);
  if (validateSaveV2Namespaces(sealed).length > 0) {
    throw new GameSaveMigrationError("migration-transform-failed");
  }
  await ensureMigrationBackup(options);
  return activate(
    options,
    sealed,
    migration.projectionWrites,
    "activated",
    migration.migratedPuzzleIds,
    migration.completedPuzzleIds,
  );
}

export function createGameSaveLegacyProjectionPort(
  storage: KeyValueStoragePort,
  canonicalSaveKey = DEFAULT_GAME_SAVE_V2_KEY,
): GameSaveLegacyProjectionPort {
  const acknowledgedValues = new Map<string, string>();
  let preparedTargetChecksum: string | null = null;

  const collectWrites = async (
    save: SaveV2Envelope,
  ): Promise<LegacyProjectionWrite[]> => {
    const writes = new Map(
      projectSaveV2ToLegacyWrites(save).map(({ key, value }) => [key, value]),
    );
    const state = save.content["ko-KR"];
    await Promise.all(
      (state?.completionRecords ?? []).map(async (completion) => {
        const key = `${LEGACY_ARCHIVE_RECORD_KEY_PREFIX}${completion.puzzleId}`;
        const raw = await storage.getItem(key);
        if (raw == null) return;
        const candidate = parseJson(raw);
        if (
          !isRecord(candidate) ||
          (candidate.puzzleId !== undefined &&
            candidate.puzzleId !== completion.puzzleId)
        ) {
          throw new GameSaveMigrationError("legacy-projection-failed");
        }
        writes.set(
          key,
          JSON.stringify({
            ...candidate,
            completedAt: completion.completedAt,
            hintCount: completion.hintCount,
            revealUsed: completion.revealUsed,
          }),
        );
      }),
    );
    const candidates = [...writes.entries()].sort(([left], [right]) =>
      compareCanonicalStrings(left, right),
    );
    const changed = await Promise.all(
      candidates.map(async ([key, value]) => {
        if (
          acknowledgedValues.get(key) === value ||
          (await storage.getItem(key)) === value
        ) {
          acknowledgedValues.set(key, value);
          return null;
        }
        return { key, value } satisfies LegacyProjectionWrite;
      }),
    );
    return changed.filter(
      (write): write is LegacyProjectionWrite => write != null,
    );
  };

  const prepareCanonicalWrite = async (save: SaveV2Envelope) => {
    const recovered = await recoverLegacyProjectionOutbox(storage);
    if (recovered !== "none") acknowledgedValues.clear();
    const writes = await collectWrites(save);
    if (writes.length > 0) {
      await captureProjectionOutbox(
        storage,
        "ongoing",
        `ongoing:${save.checksum}`,
        canonicalSaveKey,
        save.checksum,
        writes,
      );
    }
    preparedTargetChecksum = save.checksum;
  };

  const commitCanonicalWrite = async (save: SaveV2Envelope) => {
    if (preparedTargetChecksum !== save.checksum) {
      throw new GameSaveMigrationError("legacy-projection-failed");
    }
    const rawOutbox = await storage.getItem(
      GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY,
    );
    if (rawOutbox == null) {
      preparedTargetChecksum = null;
      return;
    }
    const outbox = parseOutbox(rawOutbox);
    if (
      outbox == null ||
      outbox.mode !== "ongoing" ||
      outbox.canonicalSaveKey !== canonicalSaveKey ||
      outbox.targetSaveChecksum !== save.checksum
    ) {
      throw new GameSaveMigrationError("projection-outbox-invalid");
    }
    const rawSave = await storage.getItem(canonicalSaveKey);
    const durableSave =
      rawSave == null
        ? null
        : await verifySerializedSave(rawSave, portableChecksumPort);
    if (durableSave?.checksum !== save.checksum) {
      throw new GameSaveMigrationError("legacy-projection-failed");
    }
    await applyProjectionRecords(storage, outbox.records);
    await storage.removeItem(GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY);
    for (const record of outbox.records) {
      acknowledgedValues.set(record.key, record.value);
    }
    preparedTargetChecksum = null;
  };

  return {
    prepareCanonicalWrite,
    commitCanonicalWrite,
    async synchronize(save) {
      await prepareCanonicalWrite(save);
      await commitCanonicalWrite(save);
    },
  };
}

export const portableGameSaveChecksumPort = portableChecksumPort;
