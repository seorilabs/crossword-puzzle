import type { GameSnapshot } from "../../packages/crossword-core/src/gameController.ts";
import {
  applyFirstCompletionRewards,
  getOwnedCosmeticIds,
  projectMemoryInkBalance,
  purchaseCosmetic as purchaseCosmeticInSave,
  type CosmeticTier,
  type MemoryInkRewardConfig,
} from "../../packages/crossword-core/src/gameEconomy.ts";
import {
  projectGameMetaUnlocksFromCompletedPuzzleIds,
  type GameMetaUnlocks,
} from "../../packages/crossword-core/src/gameMetaProgression.ts";
import {
  applyCellCommitJournal,
  createCellCommitJournal,
  createEmptySaveV2,
  migrateLegacyProgressToSaveV2,
  sealSaveV2,
  validateSaveV2Namespaces,
  verifySaveV2Checksum,
  type CellCommitJournalV1,
  type JsonPrimitive,
  type SaveChecksumPort,
  type SaveV2CompletionRecord,
  type SaveV2ContentState,
  type SaveV2EconomyRecord,
  type SaveV2Envelope,
  type SaveV2PuzzleSnapshot,
  type SaveV2PuzzlePhase,
} from "../../packages/crossword-core/src/saveV2.ts";
import type { SavedProgress } from "../../packages/crossword-core/src/types.ts";

export const DEFAULT_GAME_SAVE_V2_KEY = "crossword:game-save:v2";
export const DEFAULT_GAME_CELL_JOURNAL_KEY =
  "crossword:game-save:v2:cell-journal";

/**
 * AIT Storage, native AsyncStorage, and test doubles implement this port.
 * Resolving a mutation promise is the host's durable-write acknowledgement.
 */
export interface KeyValueStoragePort {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type GameSaveIdentity = Readonly<{
  contentLocale: string;
  puzzleId: string;
  contentChecksum: string;
}>;

export type LegacySavedProgressInput = Readonly<{
  progress: SavedProgress;
  sourceVersion: string;
  migrationChecksum: string;
  migratedAt?: string;
  currentEntryId?: string | null;
}>;

export type LoadGameSnapshotInput = GameSaveIdentity &
  Readonly<{
    legacy?: LegacySavedProgressInput;
  }>;

export type GameSaveLoadStatus =
  | "restored"
  | "recovered"
  | "migrated"
  | "missing"
  | "identity-mismatch"
  | "invalid-save"
  | "invalid-journal"
  | "journal-rejected";

export type GameSaveLoadResult =
  | Readonly<{
      status: "restored" | "recovered" | "migrated";
      snapshot: SaveV2PuzzleSnapshot;
    }>
  | Readonly<{
      status: Exclude<
        GameSaveLoadStatus,
        "restored" | "recovered" | "migrated"
      >;
      snapshot: null;
    }>;

export type GameSaveProgressMetadata = Readonly<{
  earnedHintCredits?: number;
  hintCount?: number;
  longestIntersectionChain?: number;
  revealUsed?: boolean;
  tentativeCells?: readonly string[];
  completedAt?: string;
}>;

export type GameProgressionSnapshot = Readonly<{
  contentLocale: string;
  completedPuzzleIds: readonly string[];
  mapFragmentCount: number;
  mapNodeIds: readonly string[];
  cardIds: readonly string[];
  memoryInkBalance: number;
  ownedCosmeticIds: readonly string[];
  metaUnlocks: GameMetaUnlocks;
}>;

export type RecordGameCompletionInput = Readonly<{
  snapshot: GameSnapshot;
  entryCount: number;
  mapNodeId: string;
  cardIds?: readonly string[];
  profileScope?: string;
  rewardConfig?: MemoryInkRewardConfig;
  progress?: GameSaveProgressMetadata;
}>;

export type RecordGameCompletionResult = Readonly<{
  status: "granted" | "already-granted";
  memoryInkAwarded: number;
  mapFragmentAwarded: boolean;
  cardIdsAwarded: readonly string[];
  progression: GameProgressionSnapshot;
}>;

export type PurchaseGameCosmeticInput = Readonly<{
  contentLocale: string;
  cosmeticId: string;
  tier: CosmeticTier;
  profileScope?: string;
}>;

export type PurchaseGameCosmeticResult = Readonly<{
  status: "purchased" | "already-owned" | "insufficient-balance";
  price: number;
  progression: GameProgressionSnapshot;
}>;

export type CommitGameCellInput = Readonly<{
  snapshot: GameSnapshot;
  cellKey: string;
  cellValue: string | null;
  progress?: GameSaveProgressMetadata;
}>;

export type CreateGameSaveRepositoryOptions = Readonly<{
  storage: KeyValueStoragePort;
  checksumPort: SaveChecksumPort;
  uiLocale: string;
  inputMode: string;
  settings?: Readonly<Record<string, JsonPrimitive>>;
  accessibility?: Readonly<Record<string, JsonPrimitive>>;
  saveKey?: string;
  journalKey?: string;
  now?: () => string;
  freshSaveSourceVersion?: string;
  freshSaveMigrationChecksum?: string;
}>;

export type GameSaveRepositoryErrorCode =
  | "invalid-save"
  | "invalid-journal"
  | "journal-rejected"
  | "journal-base-missing"
  | "journal-identity-mismatch"
  | "journal-sequence-mismatch"
  | "journal-delta-mismatch"
  | "invalid-projection";

export class GameSaveRepositoryError extends Error {
  readonly code: GameSaveRepositoryErrorCode;

  constructor(code: GameSaveRepositoryErrorCode) {
    super(`Game save operation rejected: ${code}`);
    this.name = "GameSaveRepositoryError";
    this.code = code;
  }
}

function assertValidSaveProjection(save: SaveV2Envelope): void {
  if (validateSaveV2Namespaces(save).length > 0) {
    throw new GameSaveRepositoryError("invalid-projection");
  }
}

export interface GameSaveRepository {
  loadPuzzleSnapshot(input: LoadGameSnapshotInput): Promise<GameSaveLoadResult>;
  persistSnapshot(
    snapshot: GameSnapshot,
    progress?: GameSaveProgressMetadata,
  ): Promise<SaveV2PuzzleSnapshot>;
  commitCell(input: CommitGameCellInput): Promise<SaveV2PuzzleSnapshot>;
  readProgression(contentLocale: string): Promise<GameProgressionSnapshot>;
  recordPuzzleCompletion(
    input: RecordGameCompletionInput,
  ): Promise<RecordGameCompletionResult>;
  purchaseCosmetic(
    input: PurchaseGameCosmeticInput,
  ): Promise<PurchaseGameCosmeticResult>;
}

type ReadSaveResult =
  | { status: "valid"; save: SaveV2Envelope; recovered: boolean }
  | {
      status:
        | "missing"
        | "invalid-save"
        | "invalid-journal"
        | "journal-rejected";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, child]) => key !== "" && typeof child === "string",
    )
  );
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isPrimitiveRecord(
  value: unknown,
): value is Record<string, JsonPrimitive> {
  return isRecord(value) && Object.values(value).every(isJsonPrimitive);
}

function isPuzzleSnapshot(value: unknown): value is SaveV2PuzzleSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasOnlyKeys(value, [
      "contentLocale",
      "puzzleId",
      "contentChecksum",
      "currentEntryId",
      "cellValues",
      "earnedHintCredits",
      "hintCount",
      "longestIntersectionChain",
      "revealUsed",
      "tentativeCells",
      "commandSequence",
      "phase",
      "updatedAt",
      "completedAt",
    ]) &&
    typeof value.contentLocale === "string" &&
    value.contentLocale !== "" &&
    typeof value.puzzleId === "string" &&
    value.puzzleId !== "" &&
    typeof value.contentChecksum === "string" &&
    value.contentChecksum !== "" &&
    (value.currentEntryId === null ||
      typeof value.currentEntryId === "string") &&
    isStringRecord(value.cellValues) &&
    isNonNegativeInteger(value.earnedHintCredits) &&
    isNonNegativeInteger(value.hintCount) &&
    (value.longestIntersectionChain === undefined ||
      isNonNegativeInteger(value.longestIntersectionChain)) &&
    typeof value.revealUsed === "boolean" &&
    isStringArray(value.tentativeCells) &&
    isNonNegativeInteger(value.commandSequence) &&
    (value.phase === undefined ||
      value.phase === "intro" ||
      value.phase === "active" ||
      value.phase === "word-resolved" ||
      value.phase === "board-resolved" ||
      value.phase === "result" ||
      value.phase === "map") &&
    typeof value.updatedAt === "string" &&
    value.updatedAt !== "" &&
    (value.completedAt === undefined || typeof value.completedAt === "string")
  );
}

function isCompletionRecord(value: unknown): value is SaveV2CompletionRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasOnlyKeys(value, [
      "puzzleId",
      "contentLocale",
      "contentChecksum",
      "completedAt",
      "hintCount",
      "revealUsed",
    ]) &&
    typeof value.puzzleId === "string" &&
    typeof value.contentLocale === "string" &&
    typeof value.contentChecksum === "string" &&
    typeof value.completedAt === "string" &&
    isNonNegativeInteger(value.hintCount) &&
    typeof value.revealUsed === "boolean"
  );
}

function isContentState(value: unknown): value is SaveV2ContentState {
  if (!isRecord(value) || !isRecord(value.puzzles)) {
    return false;
  }

  return (
    hasOnlyKeys(value, [
      "puzzles",
      "completedPuzzleIds",
      "mapNodeIds",
      "cardIds",
      "streakCompletedDates",
      "completionRecords",
    ]) &&
    Object.values(value.puzzles).every(isPuzzleSnapshot) &&
    isStringArray(value.completedPuzzleIds) &&
    isStringArray(value.mapNodeIds) &&
    isStringArray(value.cardIds) &&
    isStringArray(value.streakCompletedDates) &&
    Array.isArray(value.completionRecords) &&
    value.completionRecords.every(isCompletionRecord)
  );
}

function isEconomyRecord(value: unknown): value is SaveV2EconomyRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasOnlyKeys(value, [
      "transactionId",
      "kind",
      "contentLocale",
      "scopeVersion",
      "occurredAt",
      "payload",
    ]) &&
    typeof value.transactionId === "string" &&
    (value.kind === "grant" ||
      value.kind === "currency" ||
      value.kind === "cosmetic-entitlement") &&
    typeof value.contentLocale === "string" &&
    isNonNegativeInteger(value.scopeVersion) &&
    typeof value.occurredAt === "string" &&
    isPrimitiveRecord(value.payload)
  );
}

function isSaveV2Envelope(value: unknown): value is SaveV2Envelope {
  if (!isRecord(value)) {
    return false;
  }

  if (
    !hasOnlyKeys(value, [
      "saveVersion",
      "checksum",
      "profile",
      "content",
      "economyRecords",
      "legacy",
      "migration",
    ]) ||
    value.saveVersion !== 2 ||
    typeof value.checksum !== "string" ||
    !isRecord(value.profile) ||
    !isRecord(value.content) ||
    !Array.isArray(value.economyRecords) ||
    !isRecord(value.legacy) ||
    !isRecord(value.migration)
  ) {
    return false;
  }

  return (
    hasOnlyKeys(value.profile, [
      "settings",
      "uiLocale",
      "activeContentLocale",
      "inputMode",
      "accessibility",
    ]) &&
    isPrimitiveRecord(value.profile.settings) &&
    typeof value.profile.uiLocale === "string" &&
    value.profile.uiLocale !== "" &&
    typeof value.profile.activeContentLocale === "string" &&
    value.profile.activeContentLocale !== "" &&
    typeof value.profile.inputMode === "string" &&
    isPrimitiveRecord(value.profile.accessibility) &&
    Object.values(value.content).every(isContentState) &&
    value.economyRecords.every(isEconomyRecord) &&
    hasOnlyKeys(value.legacy, ["postcard"]) &&
    hasOnlyKeys(value.migration, ["sourceVersion", "migratedAt", "checksum"]) &&
    typeof value.migration.sourceVersion === "string" &&
    typeof value.migration.migratedAt === "string" &&
    typeof value.migration.checksum === "string"
  );
}

function isCellCommitJournal(value: unknown): value is CellCommitJournalV1 {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasOnlyKeys(value, [
      "journalVersion",
      "contentLocale",
      "puzzleId",
      "contentChecksum",
      "cellKey",
      "cellValue",
      "commandSequence",
      "baseSaveChecksum",
      "createdAt",
    ]) &&
    value.journalVersion === 1 &&
    typeof value.contentLocale === "string" &&
    value.contentLocale !== "" &&
    typeof value.puzzleId === "string" &&
    value.puzzleId !== "" &&
    typeof value.contentChecksum === "string" &&
    value.contentChecksum !== "" &&
    typeof value.cellKey === "string" &&
    value.cellKey !== "" &&
    (value.cellValue === null || typeof value.cellValue === "string") &&
    isNonNegativeInteger(value.commandSequence) &&
    value.commandSequence > 0 &&
    typeof value.baseSaveChecksum === "string" &&
    value.baseSaveChecksum !== "" &&
    typeof value.createdAt === "string" &&
    value.createdAt !== ""
  );
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function createEmptyContentState(): SaveV2ContentState {
  return {
    puzzles: {},
    completedPuzzleIds: [],
    mapNodeIds: [],
    cardIds: [],
    streakCompletedDates: [],
    completionRecords: [],
  };
}

function clonePuzzleSnapshot(
  snapshot: SaveV2PuzzleSnapshot,
): SaveV2PuzzleSnapshot {
  return {
    ...snapshot,
    cellValues: { ...snapshot.cellValues },
    tentativeCells: [...snapshot.tentativeCells],
  };
}

function snapshotMatchesIdentity(
  save: SaveV2Envelope,
  identity: GameSaveIdentity,
): SaveV2PuzzleSnapshot | null {
  if (save.profile.activeContentLocale !== identity.contentLocale) {
    return null;
  }

  const snapshot =
    save.content[identity.contentLocale]?.puzzles[identity.puzzleId];
  if (
    snapshot == null ||
    snapshot.contentLocale !== identity.contentLocale ||
    snapshot.puzzleId !== identity.puzzleId ||
    snapshot.contentChecksum !== identity.contentChecksum
  ) {
    return null;
  }

  return clonePuzzleSnapshot(snapshot);
}

function normalizeCount(value: number | undefined, fallback: number): number {
  return value === undefined
    ? fallback
    : Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : fallback;
}

function getPersistedPhase(snapshot: GameSnapshot): SaveV2PuzzlePhase {
  const phase =
    snapshot.phase === "suspended"
      ? snapshot.suspendedFrom
      : snapshot.phase === "composing"
        ? "active"
        : snapshot.phase;
  return phase === "intro" ||
    phase === "word-resolved" ||
    phase === "board-resolved" ||
    phase === "result" ||
    phase === "map"
    ? phase
    : "active";
}

function projectGameSnapshot(
  snapshot: GameSnapshot,
  previous: SaveV2PuzzleSnapshot | undefined,
  progress: GameSaveProgressMetadata | undefined,
  updatedAt: string,
): SaveV2PuzzleSnapshot {
  const completedAt = progress?.completedAt ?? previous?.completedAt;
  const projected: SaveV2PuzzleSnapshot = {
    contentLocale: snapshot.contentLocale,
    puzzleId: snapshot.puzzleId,
    contentChecksum: snapshot.contentChecksum,
    currentEntryId: snapshot.selectedEntryId,
    cellValues: { ...snapshot.cellValues },
    earnedHintCredits: normalizeCount(
      progress?.earnedHintCredits,
      previous?.earnedHintCredits ?? 0,
    ),
    hintCount: normalizeCount(progress?.hintCount, previous?.hintCount ?? 0),
    longestIntersectionChain: Math.max(
      normalizeCount(
        progress?.longestIntersectionChain,
        previous?.longestIntersectionChain ?? 0,
      ),
      previous?.longestIntersectionChain ?? 0,
    ),
    revealUsed: progress?.revealUsed ?? previous?.revealUsed ?? false,
    tentativeCells: [
      ...new Set(
        (progress?.tentativeCells ?? previous?.tentativeCells ?? []).filter(
          (cellKey) => cellKey !== "",
        ),
      ),
    ].sort(),
    commandSequence: snapshot.commandSequence,
    phase: getPersistedPhase(snapshot),
    updatedAt,
  };

  if (completedAt !== undefined) {
    projected.completedAt = completedAt;
  }

  return projected;
}

function replacePuzzleSnapshot(
  save: SaveV2Envelope,
  snapshot: SaveV2PuzzleSnapshot,
): SaveV2Envelope {
  const contentState =
    save.content[snapshot.contentLocale] ?? createEmptyContentState();

  return {
    ...save,
    checksum: "",
    profile: {
      ...save.profile,
      activeContentLocale: snapshot.contentLocale,
    },
    content: {
      ...save.content,
      [snapshot.contentLocale]: {
        ...contentState,
        puzzles: {
          ...contentState.puzzles,
          [snapshot.puzzleId]: snapshot,
        },
      },
    },
  };
}

function changedCellKeys(
  previous: Readonly<Record<string, string>>,
  next: Readonly<Record<string, string>>,
): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...keys]
    .filter((key) => (previous[key] ?? null) !== (next[key] ?? null))
    .sort();
}

function projectProgression(
  save: SaveV2Envelope | null,
  contentLocale: string,
): GameProgressionSnapshot {
  const contentState = save?.content[contentLocale];
  const completedPuzzleIds = [...(contentState?.completedPuzzleIds ?? [])];
  return {
    contentLocale,
    completedPuzzleIds,
    mapFragmentCount:
      save?.economyRecords.filter(
        (record) =>
          record.kind === "grant" &&
          record.contentLocale === contentLocale &&
          record.payload.rewardType === "map_fragment" &&
          record.payload.amount === 1,
      ).length ?? 0,
    mapNodeIds: [...(contentState?.mapNodeIds ?? [])],
    cardIds: [...(contentState?.cardIds ?? [])],
    memoryInkBalance:
      save == null ? 0 : projectMemoryInkBalance(save, contentLocale),
    ownedCosmeticIds:
      save == null ? [] : getOwnedCosmeticIds(save, contentLocale),
    metaUnlocks:
      projectGameMetaUnlocksFromCompletedPuzzleIds(completedPuzzleIds),
  };
}

export function createGameSaveRepository(
  options: CreateGameSaveRepositoryOptions,
): GameSaveRepository {
  const saveKey = options.saveKey ?? DEFAULT_GAME_SAVE_V2_KEY;
  const journalKey = options.journalKey ?? DEFAULT_GAME_CELL_JOURNAL_KEY;
  const now = options.now ?? (() => new Date().toISOString());
  let operationTail: Promise<void> = Promise.resolve();

  const serialized = <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const readValidatedSave = async (): Promise<ReadSaveResult> => {
    const [rawSave, rawJournal] = await Promise.all([
      options.storage.getItem(saveKey),
      options.storage.getItem(journalKey),
    ]);

    if (rawSave === null) {
      return rawJournal === null
        ? { status: "missing" }
        : { status: "journal-rejected" };
    }

    const saveCandidate = parseJson(rawSave);
    if (!isSaveV2Envelope(saveCandidate)) {
      return { status: "invalid-save" };
    }

    try {
      if (
        validateSaveV2Namespaces(saveCandidate).length > 0 ||
        !(await verifySaveV2Checksum(saveCandidate, options.checksumPort))
      ) {
        return { status: "invalid-save" };
      }
    } catch {
      return { status: "invalid-save" };
    }

    if (rawJournal === null) {
      return { status: "valid", save: saveCandidate, recovered: false };
    }

    const journalCandidate = parseJson(rawJournal);
    if (!isCellCommitJournal(journalCandidate)) {
      return { status: "invalid-journal" };
    }

    const recovery = await applyCellCommitJournal(
      saveCandidate,
      journalCandidate,
      options.checksumPort,
    );
    if (recovery.status === "rejected") {
      return { status: "journal-rejected" };
    }

    if (recovery.status === "applied") {
      await options.storage.setItem(saveKey, JSON.stringify(recovery.save));
    }
    await options.storage.removeItem(journalKey);

    return { status: "valid", save: recovery.save, recovered: true };
  };

  const requireValidSave = async (): Promise<SaveV2Envelope | null> => {
    const result = await readValidatedSave();
    if (result.status === "valid") {
      return result.save;
    }
    if (result.status === "missing") {
      return null;
    }
    throw new GameSaveRepositoryError(result.status);
  };

  const createFreshSave = (contentLocale: string, createdAt: string) => {
    const fresh = createEmptySaveV2({
      uiLocale: options.uiLocale,
      contentLocale,
      inputMode: options.inputMode,
      migratedAt: createdAt,
      sourceVersion: options.freshSaveSourceVersion ?? "game-shell-v2",
      migrationChecksum:
        options.freshSaveMigrationChecksum ?? "new-install-no-legacy-source",
    });

    return {
      ...fresh,
      profile: {
        ...fresh.profile,
        settings: { ...(options.settings ?? {}) },
        accessibility: { ...(options.accessibility ?? {}) },
      },
    };
  };

  const persistSnapshotInternal = async (
    snapshot: GameSnapshot,
    progress?: GameSaveProgressMetadata,
  ): Promise<SaveV2PuzzleSnapshot> => {
    const timestamp = now();
    const existing = await requireValidSave();
    const base = existing ?? createFreshSave(snapshot.contentLocale, timestamp);
    const previous =
      base.content[snapshot.contentLocale]?.puzzles[snapshot.puzzleId];
    const projected = projectGameSnapshot(
      snapshot,
      previous,
      progress,
      timestamp,
    );
    const sealed = await sealSaveV2(
      replacePuzzleSnapshot(base, projected),
      options.checksumPort,
    );
    await options.storage.setItem(saveKey, JSON.stringify(sealed));
    return clonePuzzleSnapshot(projected);
  };

  const loadPuzzleSnapshot = (
    input: LoadGameSnapshotInput,
  ): Promise<GameSaveLoadResult> =>
    serialized(async () => {
      const readResult = await readValidatedSave();
      if (readResult.status !== "missing" && readResult.status !== "valid") {
        return { status: readResult.status, snapshot: null };
      }

      if (readResult.status === "valid") {
        const restored = snapshotMatchesIdentity(readResult.save, input);
        if (restored === null) {
          return { status: "identity-mismatch", snapshot: null };
        }
        return {
          status: readResult.recovered ? "recovered" : "restored",
          snapshot: restored,
        };
      }

      if (input.legacy === undefined) {
        return { status: "missing", snapshot: null };
      }

      const migratedAt = input.legacy.migratedAt ?? now();
      const migrated = migrateLegacyProgressToSaveV2({
        uiLocale: options.uiLocale,
        contentLocale: input.contentLocale,
        inputMode: options.inputMode,
        migratedAt,
        sourceVersion: input.legacy.sourceVersion,
        migrationChecksum: input.legacy.migrationChecksum,
        progressByPuzzleId: { [input.puzzleId]: input.legacy.progress },
        contentChecksumByPuzzleId: {
          [input.puzzleId]: input.contentChecksum,
        },
        currentEntryIdByPuzzleId: {
          [input.puzzleId]: input.legacy.currentEntryId ?? null,
        },
      });
      const configuredMigration: SaveV2Envelope = {
        ...migrated,
        profile: {
          ...migrated.profile,
          settings: { ...(options.settings ?? {}) },
          accessibility: { ...(options.accessibility ?? {}) },
        },
      };
      const sealed = await sealSaveV2(
        configuredMigration,
        options.checksumPort,
      );
      await options.storage.setItem(saveKey, JSON.stringify(sealed));
      const restored = snapshotMatchesIdentity(sealed, input);
      if (restored === null) {
        return { status: "identity-mismatch", snapshot: null };
      }
      return { status: "migrated", snapshot: restored };
    });

  const persistSnapshot = (
    snapshot: GameSnapshot,
    progress?: GameSaveProgressMetadata,
  ): Promise<SaveV2PuzzleSnapshot> =>
    serialized(() => persistSnapshotInternal(snapshot, progress));

  const commitCell = (input: CommitGameCellInput) =>
    serialized(async (): Promise<SaveV2PuzzleSnapshot> => {
      const base = await requireValidSave();
      if (base === null) {
        throw new GameSaveRepositoryError("journal-base-missing");
      }

      const previous =
        base.content[input.snapshot.contentLocale]?.puzzles[
          input.snapshot.puzzleId
        ];
      if (previous == null) {
        throw new GameSaveRepositoryError("journal-base-missing");
      }
      if (
        previous.contentLocale !== input.snapshot.contentLocale ||
        previous.puzzleId !== input.snapshot.puzzleId ||
        previous.contentChecksum !== input.snapshot.contentChecksum
      ) {
        throw new GameSaveRepositoryError("journal-identity-mismatch");
      }
      if (input.snapshot.commandSequence !== previous.commandSequence + 1) {
        throw new GameSaveRepositoryError("journal-sequence-mismatch");
      }

      const expectedValue = input.snapshot.cellValues[input.cellKey] ?? null;
      const changedKeys = changedCellKeys(
        previous.cellValues,
        input.snapshot.cellValues,
      );
      if (
        input.cellKey === "" ||
        expectedValue !== input.cellValue ||
        changedKeys.length !== 1 ||
        changedKeys[0] !== input.cellKey
      ) {
        throw new GameSaveRepositoryError("journal-delta-mismatch");
      }

      const timestamp = now();
      const journal = createCellCommitJournal({
        contentLocale: input.snapshot.contentLocale,
        puzzleId: input.snapshot.puzzleId,
        contentChecksum: input.snapshot.contentChecksum,
        cellKey: input.cellKey,
        cellValue: input.cellValue,
        commandSequence: input.snapshot.commandSequence,
        baseSaveChecksum: base.checksum,
        createdAt: timestamp,
      });

      // Ordering is part of the product contract: durable compact journal,
      // canonical sealed save, then journal removal acknowledgement.
      await options.storage.setItem(journalKey, JSON.stringify(journal));

      const projected = projectGameSnapshot(
        input.snapshot,
        previous,
        input.progress,
        timestamp,
      );
      const sealed = await sealSaveV2(
        replacePuzzleSnapshot(base, projected),
        options.checksumPort,
      );
      await options.storage.setItem(saveKey, JSON.stringify(sealed));
      await options.storage.removeItem(journalKey);

      return clonePuzzleSnapshot(projected);
    });

  const readProgression = (
    contentLocale: string,
  ): Promise<GameProgressionSnapshot> =>
    serialized(async () => {
      const save = await requireValidSave();
      return projectProgression(save, contentLocale);
    });

  const recordPuzzleCompletion = (
    input: RecordGameCompletionInput,
  ): Promise<RecordGameCompletionResult> =>
    serialized(async () => {
      const timestamp = now();
      const existing = await requireValidSave();
      const base =
        existing ?? createFreshSave(input.snapshot.contentLocale, timestamp);
      const previous =
        base.content[input.snapshot.contentLocale]?.puzzles[
          input.snapshot.puzzleId
        ];
      const projected = projectGameSnapshot(
        input.snapshot,
        previous,
        {
          ...input.progress,
          completedAt: input.progress?.completedAt ?? timestamp,
          longestIntersectionChain: Math.max(
            input.progress?.longestIntersectionChain ?? 0,
            input.snapshot.lastResolvedEntryIds.length,
          ),
        },
        timestamp,
      );
      const completion = applyFirstCompletionRewards(
        replacePuzzleSnapshot(base, projected),
        {
          profileScope: input.profileScope ?? "local-profile-v1",
          contentLocale: projected.contentLocale,
          puzzleId: projected.puzzleId,
          contentChecksum: projected.contentChecksum,
          completedAt: projected.completedAt ?? timestamp,
          entryCount: input.entryCount,
          longestIntersectionChain: projected.longestIntersectionChain ?? 0,
          hintCount: projected.hintCount,
          revealUsed: projected.revealUsed,
          mapNodeId: input.mapNodeId,
          cardIds: input.cardIds,
        },
        input.rewardConfig,
      );
      assertValidSaveProjection(completion.save);
      const sealed = await sealSaveV2(completion.save, options.checksumPort);
      await options.storage.setItem(saveKey, JSON.stringify(sealed));

      return {
        status: completion.status,
        memoryInkAwarded: completion.memoryInkAwarded,
        mapFragmentAwarded: completion.mapFragmentAwarded,
        cardIdsAwarded: [...completion.cardIdsAwarded],
        progression: projectProgression(sealed, projected.contentLocale),
      };
    });

  const purchaseCosmetic = (
    input: PurchaseGameCosmeticInput,
  ): Promise<PurchaseGameCosmeticResult> =>
    serialized(async () => {
      const timestamp = now();
      const existing = await requireValidSave();
      const base = existing ?? createFreshSave(input.contentLocale, timestamp);
      const purchase = purchaseCosmeticInSave(base, {
        profileScope: input.profileScope ?? "local-profile-v1",
        contentLocale: input.contentLocale,
        cosmeticId: input.cosmeticId,
        tier: input.tier,
        occurredAt: timestamp,
      });
      if (purchase.status === "purchased") {
        assertValidSaveProjection(purchase.save);
        const sealed = await sealSaveV2(purchase.save, options.checksumPort);
        await options.storage.setItem(saveKey, JSON.stringify(sealed));
        return {
          status: purchase.status,
          price: purchase.price,
          progression: projectProgression(sealed, input.contentLocale),
        };
      }

      return {
        status: purchase.status,
        price: purchase.price,
        progression: projectProgression(purchase.save, input.contentLocale),
      };
    });

  return {
    loadPuzzleSnapshot,
    persistSnapshot,
    commitCell,
    readProgression,
    recordPuzzleCompletion,
    purchaseCosmetic,
  };
}
