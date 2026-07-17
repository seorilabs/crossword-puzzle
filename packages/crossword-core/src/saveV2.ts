import type { SavedProgress } from "./types.ts";

export const SAVE_V2_VERSION = 2 as const;
export const CELL_COMMIT_JOURNAL_VERSION = 1 as const;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SaveV2Profile = {
  settings: Record<string, JsonPrimitive>;
  uiLocale: string;
  activeContentLocale: string;
  inputMode: string;
  accessibility: Record<string, JsonPrimitive>;
};

export type SaveV2PuzzlePhase =
  | "intro"
  | "active"
  | "word-resolved"
  | "board-resolved"
  | "result"
  | "map";

export type SaveV2PuzzleSnapshot = {
  contentLocale: string;
  puzzleId: string;
  contentChecksum: string;
  currentEntryId: string | null;
  cellValues: Record<string, string>;
  earnedHintCredits: number;
  hintCount: number;
  // 퍼즐 진행 중 한 입력으로 함께 완성된 단어 수의 최댓값. 기존 Save v2와의
  // 호환을 위해 optional이며, 신규 writer는 항상 0 이상의 정수로 기록한다.
  longestIntersectionChain?: number;
  revealUsed: boolean;
  tentativeCells: string[];
  commandSequence: number;
  phase?: SaveV2PuzzlePhase;
  updatedAt: string;
  completedAt?: string;
};

export type SaveV2CompletionRecord = {
  puzzleId: string;
  contentLocale: string;
  contentChecksum: string;
  completedAt: string;
  hintCount: number;
  revealUsed: boolean;
};

export type SaveV2ContentState = {
  puzzles: Record<string, SaveV2PuzzleSnapshot>;
  completedPuzzleIds: string[];
  mapNodeIds: string[];
  cardIds: string[];
  streakCompletedDates: string[];
  completionRecords: SaveV2CompletionRecord[];
};

export type SaveV2EconomyRecord = {
  transactionId: string;
  kind: "grant" | "currency" | "cosmetic-entitlement";
  contentLocale: string;
  scopeVersion: number;
  occurredAt: string;
  payload: Record<string, JsonPrimitive>;
};

export type SaveV2Migration = {
  sourceVersion: string;
  migratedAt: string;
  checksum: string;
};

export type SaveV2Envelope = {
  saveVersion: typeof SAVE_V2_VERSION;
  checksum: string;
  profile: SaveV2Profile;
  content: Record<string, SaveV2ContentState>;
  economyRecords: SaveV2EconomyRecord[];
  legacy: {
    postcard?: JsonValue;
  };
  migration: SaveV2Migration;
};

export type SaveChecksumPort = {
  digest(canonicalPayload: string): Promise<string> | string;
};

export type CellCommitJournalV1 = {
  journalVersion: typeof CELL_COMMIT_JOURNAL_VERSION;
  contentLocale: string;
  puzzleId: string;
  contentChecksum: string;
  cellKey: string;
  cellValue: string | null;
  commandSequence: number;
  baseSaveChecksum: string;
  createdAt: string;
};

export type ApplyCellCommitJournalResult =
  | { status: "applied"; save: SaveV2Envelope }
  | { status: "already-applied"; save: SaveV2Envelope }
  | {
      status: "rejected";
      reason:
        | "base-checksum-mismatch"
        | "content-checksum-mismatch"
        | "content-locale-mismatch"
        | "invalid-command-sequence"
        | "puzzle-not-found";
      save: SaveV2Envelope;
    };

export type CreateEmptySaveV2Input = {
  uiLocale: string;
  contentLocale: string;
  inputMode: string;
  migratedAt: string;
  sourceVersion: string;
  migrationChecksum: string;
};

export type LegacyProgressMigrationInput = CreateEmptySaveV2Input & {
  progressByPuzzleId: Record<string, SavedProgress>;
  contentChecksumByPuzzleId: Record<string, string>;
  currentEntryIdByPuzzleId?: Record<string, string | null>;
};

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

export function createEmptySaveV2(
  input: CreateEmptySaveV2Input,
): SaveV2Envelope {
  return {
    saveVersion: SAVE_V2_VERSION,
    checksum: "",
    profile: {
      settings: {},
      uiLocale: input.uiLocale,
      activeContentLocale: input.contentLocale,
      inputMode: input.inputMode,
      accessibility: {},
    },
    content: {
      [input.contentLocale]: createEmptyContentState(),
    },
    economyRecords: [],
    legacy: {},
    migration: {
      sourceVersion: input.sourceVersion,
      migratedAt: input.migratedAt,
      checksum: input.migrationChecksum,
    },
  };
}

function normalizeLegacyProgress(progress: SavedProgress): SavedProgress {
  return {
    cellValues: Object.fromEntries(
      Object.entries(progress.cellValues).filter(
        ([key, value]) => key !== "" && typeof value === "string",
      ),
    ),
    earnedHintCredits: Number.isFinite(progress.earnedHintCredits)
      ? Math.max(0, Math.floor(progress.earnedHintCredits))
      : 0,
    hintCount: Number.isFinite(progress.hintCount)
      ? Math.max(0, Math.floor(progress.hintCount))
      : 0,
    revealUsed: progress.revealUsed === true,
    tentativeCells: Array.isArray(progress.tentativeCells)
      ? [...new Set(progress.tentativeCells.filter((key) => key !== ""))].sort()
      : [],
  };
}

export function migrateLegacyProgressToSaveV2(
  input: LegacyProgressMigrationInput,
): SaveV2Envelope {
  const save = createEmptySaveV2(input);
  const puzzles = Object.fromEntries(
    Object.entries(input.progressByPuzzleId)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([puzzleId, rawProgress]) => {
        const progress = normalizeLegacyProgress(rawProgress);
        const snapshot: SaveV2PuzzleSnapshot = {
          contentLocale: input.contentLocale,
          puzzleId,
          contentChecksum:
            input.contentChecksumByPuzzleId[puzzleId] ?? "legacy-unknown",
          currentEntryId: input.currentEntryIdByPuzzleId?.[puzzleId] ?? null,
          cellValues: progress.cellValues,
          earnedHintCredits: progress.earnedHintCredits,
          hintCount: progress.hintCount,
          revealUsed: progress.revealUsed === true,
          tentativeCells: progress.tentativeCells ?? [],
          commandSequence: 0,
          updatedAt: input.migratedAt,
        };

        return [puzzleId, snapshot];
      }),
  );

  return {
    ...save,
    content: {
      ...save.content,
      [input.contentLocale]: {
        ...save.content[input.contentLocale],
        puzzles,
      },
    },
  };
}

export function projectLegacyProgress(
  save: SaveV2Envelope,
  contentLocale: string,
  puzzleId: string,
): SavedProgress | null {
  const snapshot = save.content[contentLocale]?.puzzles[puzzleId];
  if (snapshot == null) {
    return null;
  }

  return {
    cellValues: { ...snapshot.cellValues },
    earnedHintCredits: snapshot.earnedHintCredits,
    hintCount: snapshot.hintCount,
    revealUsed: snapshot.revealUsed,
    tentativeCells: [...snapshot.tentativeCells],
  };
}

function canonicalize(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Non-finite numbers cannot be checksummed");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  if (typeof value === "object" && value != null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`)
      .join(",")}}`;
  }

  throw new TypeError(`Unsupported checksum value: ${typeof value}`);
}

export function getCanonicalSavePayload(save: SaveV2Envelope): string {
  return canonicalize({ ...save, checksum: undefined });
}

export async function sealSaveV2(
  save: SaveV2Envelope,
  checksumPort: SaveChecksumPort,
): Promise<SaveV2Envelope> {
  const checksum = await checksumPort.digest(getCanonicalSavePayload(save));
  if (checksum.trim() === "") {
    throw new Error("Save checksum must not be empty");
  }

  return { ...save, checksum };
}

export async function verifySaveV2Checksum(
  save: SaveV2Envelope,
  checksumPort: SaveChecksumPort,
): Promise<boolean> {
  if (save.checksum === "") {
    return false;
  }

  return (
    (await checksumPort.digest(getCanonicalSavePayload(save))) === save.checksum
  );
}

export function createCellCommitJournal(
  input: Omit<CellCommitJournalV1, "journalVersion">,
): CellCommitJournalV1 {
  return {
    journalVersion: CELL_COMMIT_JOURNAL_VERSION,
    ...input,
  };
}

export async function applyCellCommitJournal(
  save: SaveV2Envelope,
  journal: CellCommitJournalV1,
  checksumPort: SaveChecksumPort,
): Promise<ApplyCellCommitJournalResult> {
  const content = save.content[journal.contentLocale];
  if (content == null) {
    return {
      status: "rejected",
      reason: "content-locale-mismatch",
      save,
    };
  }

  const snapshot = content.puzzles[journal.puzzleId];
  if (snapshot == null) {
    return { status: "rejected", reason: "puzzle-not-found", save };
  }

  if (snapshot.contentLocale !== journal.contentLocale) {
    return {
      status: "rejected",
      reason: "content-locale-mismatch",
      save,
    };
  }

  if (snapshot.contentChecksum !== journal.contentChecksum) {
    return {
      status: "rejected",
      reason: "content-checksum-mismatch",
      save,
    };
  }

  // A replay is idempotent only inside the same locale/content namespace.
  // Check those identities before accepting a coincidentally equal cell value
  // and sequence from another content revision.
  const existingValue = snapshot.cellValues[journal.cellKey] ?? null;
  if (
    snapshot.commandSequence === journal.commandSequence &&
    existingValue === journal.cellValue
  ) {
    return { status: "already-applied", save };
  }

  if (save.checksum !== journal.baseSaveChecksum) {
    return {
      status: "rejected",
      reason: "base-checksum-mismatch",
      save,
    };
  }

  if (journal.commandSequence !== snapshot.commandSequence + 1) {
    return {
      status: "rejected",
      reason: "invalid-command-sequence",
      save,
    };
  }

  const cellValues = { ...snapshot.cellValues };
  if (journal.cellValue == null) {
    delete cellValues[journal.cellKey];
  } else {
    cellValues[journal.cellKey] = journal.cellValue;
  }

  const nextSave = await sealSaveV2(
    {
      ...save,
      checksum: "",
      content: {
        ...save.content,
        [journal.contentLocale]: {
          ...content,
          puzzles: {
            ...content.puzzles,
            [journal.puzzleId]: {
              ...snapshot,
              cellValues,
              commandSequence: journal.commandSequence,
              updatedAt: journal.createdAt,
            },
          },
        },
      },
    },
    checksumPort,
  );

  return { status: "applied", save: nextSave };
}

export function validateSaveV2Namespaces(save: SaveV2Envelope): string[] {
  const violations: string[] = [];

  if (save.saveVersion !== SAVE_V2_VERSION) {
    violations.push("saveVersion");
  }
  if (save.content[save.profile.activeContentLocale] == null) {
    violations.push("profile.activeContentLocale");
  }

  for (const [contentLocale, state] of Object.entries(save.content)) {
    for (const [puzzleId, snapshot] of Object.entries(state.puzzles)) {
      if (snapshot.contentLocale !== contentLocale) {
        violations.push(
          `content.${contentLocale}.puzzles.${puzzleId}.contentLocale`,
        );
      }
      if (snapshot.puzzleId !== puzzleId) {
        violations.push(
          `content.${contentLocale}.puzzles.${puzzleId}.puzzleId`,
        );
      }
      if (
        snapshot.longestIntersectionChain !== undefined &&
        (!Number.isInteger(snapshot.longestIntersectionChain) ||
          snapshot.longestIntersectionChain < 0)
      ) {
        violations.push(
          `content.${contentLocale}.puzzles.${puzzleId}.longestIntersectionChain`,
        );
      }
    }

    for (const record of state.completionRecords) {
      if (record.contentLocale !== contentLocale) {
        violations.push(
          `content.${contentLocale}.completionRecords.${record.puzzleId}`,
        );
      }
    }
  }

  const transactionIds = new Set<string>();
  for (const record of save.economyRecords) {
    if (save.content[record.contentLocale] == null) {
      violations.push(`economyRecords.${record.transactionId}.contentLocale`);
    }
    if (transactionIds.has(record.transactionId)) {
      violations.push(`economyRecords.${record.transactionId}.duplicate`);
    }
    transactionIds.add(record.transactionId);
  }

  return violations;
}
