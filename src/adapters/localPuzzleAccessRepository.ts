import type { Puzzle } from "../../packages/crossword-core/src";

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type PuzzleArchiveRecord = {
  cachedAt: string;
  completedAt?: string;
  puzzle: Puzzle;
  puzzleId: string;
  startedAt?: string;
};

export type PuzzleArchiveSaveOptions = {
  completedAt?: string;
  startedAt?: string;
};

export type BonusPuzzleUnlock = {
  date: string;
  puzzleId: string;
  unlockedAt: string;
};

type LocalPuzzleArchiveRepositoryOptions = {
  keyPrefix?: string;
  storage?: KeyValueStorage | null;
};

type LocalBonusPuzzleUnlockRepositoryOptions = {
  keyPrefix?: string;
  storage?: KeyValueStorage | null;
};

function getDefaultStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function getArchiveIndexKey(keyPrefix: string) {
  return `${keyPrefix}:index`;
}

function getArchiveRecordKey(keyPrefix: string, puzzleId: string) {
  return `${keyPrefix}:record:${puzzleId}`;
}

function getBonusUnlockKey(keyPrefix: string, date: string) {
  return `${keyPrefix}:${date}`;
}

function readArchiveIndex(storage: KeyValueStorage, keyPrefix: string) {
  try {
    const raw = storage.getItem(getArchiveIndexKey(keyPrefix));
    const value = raw == null ? [] : (JSON.parse(raw) as unknown);

    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeArchiveIndex(
  storage: KeyValueStorage,
  keyPrefix: string,
  puzzleIds: string[],
) {
  storage.setItem(
    getArchiveIndexKey(keyPrefix),
    JSON.stringify([...new Set(puzzleIds)]),
  );
}

function normalizeArchiveRecord(value: unknown): PuzzleArchiveRecord | null {
  if (value == null || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<PuzzleArchiveRecord>;

  if (
    typeof record.puzzleId !== "string" ||
    typeof record.cachedAt !== "string" ||
    record.puzzle == null ||
    typeof record.puzzle !== "object"
  ) {
    return null;
  }

  return {
    cachedAt: record.cachedAt,
    completedAt:
      typeof record.completedAt === "string" ? record.completedAt : undefined,
    puzzle: record.puzzle as Puzzle,
    puzzleId: record.puzzleId,
    startedAt:
      typeof record.startedAt === "string" ? record.startedAt : undefined,
  };
}

function sortArchiveRecords(records: PuzzleArchiveRecord[]) {
  return [...records].sort((left, right) =>
    (
      right.completedAt ??
      right.startedAt ??
      right.cachedAt
    ).localeCompare(left.completedAt ?? left.startedAt ?? left.cachedAt),
  );
}

export function createLocalPuzzleArchiveRepository({
  keyPrefix = "crossword-puzzle:archive",
  storage = getDefaultStorage(),
}: LocalPuzzleArchiveRepositoryOptions = {}) {
  return {
    async loadPuzzle(puzzleId: string) {
      if (storage == null) {
        return null;
      }

      try {
        const raw = storage.getItem(getArchiveRecordKey(keyPrefix, puzzleId));
        const record = normalizeArchiveRecord(
          raw == null ? null : JSON.parse(raw),
        );

        return record?.puzzle ?? null;
      } catch {
        return null;
      }
    },

    async listPuzzles() {
      if (storage == null) {
        return [];
      }

      const records: PuzzleArchiveRecord[] = [];

      for (const puzzleId of readArchiveIndex(storage, keyPrefix)) {
        try {
          const raw = storage.getItem(getArchiveRecordKey(keyPrefix, puzzleId));
          const record = normalizeArchiveRecord(
            raw == null ? null : JSON.parse(raw),
          );

          if (record != null) {
            records.push(record);
          }
        } catch {
          // Ignore corrupted local records.
        }
      }

      return sortArchiveRecords(records);
    },

    async savePuzzle(puzzle: Puzzle, options: PuzzleArchiveSaveOptions = {}) {
      if (storage == null) {
        return;
      }

      try {
        const recordKey = getArchiveRecordKey(keyPrefix, puzzle.puzzleId);
        const rawPrevious = storage.getItem(recordKey);
        const previous = normalizeArchiveRecord(
          rawPrevious == null ? null : JSON.parse(rawPrevious),
        );
        const now = new Date().toISOString();
        const nextRecord: PuzzleArchiveRecord = {
          cachedAt: now,
          completedAt: options.completedAt ?? previous?.completedAt,
          puzzle,
          puzzleId: puzzle.puzzleId,
          startedAt: previous?.startedAt ?? options.startedAt,
        };
        const nextIndex = [
          puzzle.puzzleId,
          ...readArchiveIndex(storage, keyPrefix).filter(
            (item) => item !== puzzle.puzzleId,
          ),
        ];

        storage.setItem(recordKey, JSON.stringify(nextRecord));
        writeArchiveIndex(storage, keyPrefix, nextIndex);
      } catch {
        // Local persistence is best effort.
      }
    },
  };
}

export function createLocalBonusPuzzleUnlockRepository({
  keyPrefix = "crossword-puzzle:bonus-unlock",
  storage = getDefaultStorage(),
}: LocalBonusPuzzleUnlockRepositoryOptions = {}) {
  return {
    async loadUnlock(date: string) {
      if (storage == null) {
        return null;
      }

      try {
        const raw = storage.getItem(getBonusUnlockKey(keyPrefix, date));
        const value = raw == null ? null : (JSON.parse(raw) as unknown);

        if (value == null || typeof value !== "object") {
          return null;
        }

        const unlock = value as Partial<BonusPuzzleUnlock>;

        return typeof unlock.date === "string" &&
          typeof unlock.puzzleId === "string" &&
          typeof unlock.unlockedAt === "string"
          ? {
              date: unlock.date,
              puzzleId: unlock.puzzleId,
              unlockedAt: unlock.unlockedAt,
            }
          : null;
      } catch {
        return null;
      }
    },

    async saveUnlock(unlock: BonusPuzzleUnlock) {
      if (storage == null) {
        return;
      }

      try {
        storage.setItem(
          getBonusUnlockKey(keyPrefix, unlock.date),
          JSON.stringify(unlock),
        );
      } catch {
        // Local persistence is best effort.
      }
    },
  };
}
