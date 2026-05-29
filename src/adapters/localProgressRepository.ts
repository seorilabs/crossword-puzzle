import {
  createEmptyProgress,
  type ProgressRepository,
  type SavedProgress,
} from "../../packages/crossword-core/src";

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type LocalProgressRepositoryOptions = {
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

function getProgressKey(keyPrefix: string, puzzleId: string) {
  return `${keyPrefix}:${puzzleId}`;
}

function normalizeProgress(progress: Partial<SavedProgress>): SavedProgress {
  return {
    cellValues:
      progress.cellValues != null && typeof progress.cellValues === "object"
        ? progress.cellValues
        : {},
    hintCount: typeof progress.hintCount === "number" ? progress.hintCount : 0,
  };
}

export function createLocalProgressRepository({
  keyPrefix = "crossword-puzzle:progress",
  storage = getDefaultStorage(),
}: LocalProgressRepositoryOptions = {}): ProgressRepository {
  return {
    async loadProgress(puzzleId) {
      if (storage == null) {
        return createEmptyProgress();
      }

      try {
        const raw = storage.getItem(getProgressKey(keyPrefix, puzzleId));
        if (raw == null) {
          return createEmptyProgress();
        }

        return normalizeProgress(JSON.parse(raw) as Partial<SavedProgress>);
      } catch {
        return createEmptyProgress();
      }
    },

    async saveProgress(puzzleId, progress) {
      if (storage == null) {
        return;
      }

      try {
        storage.setItem(
          getProgressKey(keyPrefix, puzzleId),
          JSON.stringify(progress),
        );
      } catch {
        // Local persistence is best effort.
      }
    },

    async clearProgress(puzzleId) {
      if (storage == null) {
        return;
      }

      try {
        storage.removeItem(getProgressKey(keyPrefix, puzzleId));
      } catch {
        // Local persistence is best effort.
      }
    },
  };
}
