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

// localStorage 등 표준 Web Storage는 length/key(i)로 키 열거를 지원한다. 추상
// KeyValueStorage에는 없으므로 선택적으로 좁혀 사용한다(없으면 빈 목록 반환).
type EnumerableStorage = KeyValueStorage & {
  readonly length?: number;
  key?(index: number): string | null;
};

// 기기에 보유한 모든 최고 기록(best-time)의 puzzleId를 열거한다. archive 기록이
// 사라졌어도 남아 있는 best-time까지 포함해 '최고 기록 N개'를 정확히 세기 위함이다.
export function getAllBestTimePuzzleIds(
  storage: KeyValueStorage | null = getDefaultStorage(),
): string[] {
  if (storage == null) return [];
  try {
    const enumerable = storage as EnumerableStorage;
    if (
      typeof enumerable.length !== "number" ||
      typeof enumerable.key !== "function"
    ) {
      return [];
    }
    const prefix = `${BEST_TIME_KEY_PREFIX}:`;
    const ids: string[] = [];
    for (let index = 0; index < enumerable.length; index += 1) {
      const key = enumerable.key(index);
      if (key != null && key.startsWith(prefix)) {
        ids.push(key.slice(prefix.length));
      }
    }
    return ids;
  } catch {
    return [];
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
    // 연필(임시) 모드 셀 키 목록. 배열이 아니거나(구버전/오염) 문자열이 아닌
    // 항목은 제외해 표시용 메타데이터의 무결성을 지킨다.
    tentativeCells: Array.isArray(progress.tentativeCells)
      ? progress.tentativeCells.filter(
          (key: unknown): key is string => typeof key === "string",
        )
      : [],
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
