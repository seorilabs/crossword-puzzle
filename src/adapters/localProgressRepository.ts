import {
  createEmptyProgress,
  type ProgressRepository,
  type SavedProgress,
} from "../../packages/crossword-core/src/repositories.ts";

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

const BEST_TIME_KEY_PREFIX = "crossword-puzzle:best-time";

function getBestTimeStorageKey(puzzleId: string) {
  return `${BEST_TIME_KEY_PREFIX}:${puzzleId}`;
}

export function getBestTimeMs(
  puzzleId: string,
  storage: KeyValueStorage | null = getDefaultStorage(),
): number | null {
  if (storage == null) return null;
  try {
    const raw = storage.getItem(getBestTimeStorageKey(puzzleId));
    if (raw == null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveBestTimeMs(
  puzzleId: string,
  elapsedMs: number,
  storage: KeyValueStorage | null = getDefaultStorage(),
): boolean {
  if (storage == null) return false;
  try {
    storage.setItem(
      getBestTimeStorageKey(puzzleId),
      String(Math.round(elapsedMs)),
    );
    return true;
  } catch {
    return false;
  }
}

function normalizeProgress(progress: Partial<SavedProgress>): SavedProgress {
  return {
    cellValues:
      progress.cellValues != null && typeof progress.cellValues === "object"
        ? progress.cellValues
        : {},
    earnedHintCredits:
      typeof progress.earnedHintCredits === "number" &&
      Number.isFinite(progress.earnedHintCredits)
        ? Math.max(0, progress.earnedHintCredits)
        : 0,
    hintCount:
      typeof progress.hintCount === "number" &&
      Number.isFinite(progress.hintCount)
        ? Math.max(0, Math.floor(progress.hintCount))
        : 0,
    // 구버전 저장 데이터(필드 누락)나 오염된 값은 false로 정규화한다.
    revealUsed: progress.revealUsed === true,
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

      storage.setItem(
        getProgressKey(keyPrefix, puzzleId),
        JSON.stringify(progress),
      );
    },

    async clearProgress(puzzleId) {
      if (storage == null) {
        return;
      }

      storage.removeItem(getProgressKey(keyPrefix, puzzleId));
    },
  };
}
