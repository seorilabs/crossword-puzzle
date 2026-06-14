import {
  createDailyMissionState,
  getTodayDateKey,
  type DailyMissionRepository,
  type DailyMissionState,
} from "../../packages/crossword-core/src";

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type LocalMissionRepositoryOptions = {
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

function getMissionKey(keyPrefix: string, date: string, puzzleId: string) {
  return `${keyPrefix}:${date}:${puzzleId}`;
}

function getLegacyMissionKey(keyPrefix: string, date: string) {
  return `${keyPrefix}:${date}`;
}

function normalizeMission(
  value: Partial<DailyMissionState>,
  date: string,
  puzzleId: string,
  maxAttempts: number,
): DailyMissionState {
  if (value.date !== date || value.puzzleId !== puzzleId) {
    return createDailyMissionState(date, puzzleId, maxAttempts);
  }

  return {
    date,
    puzzleId,
    attemptsUsed:
      typeof value.attemptsUsed === "number"
        ? Math.min(Math.max(0, value.attemptsUsed), maxAttempts)
        : 0,
    maxAttempts,
    completedAt:
      typeof value.completedAt === "string" ? value.completedAt : undefined,
    lastStartedAt:
      typeof value.lastStartedAt === "string" ? value.lastStartedAt : undefined,
  };
}

type IterableStorage = KeyValueStorage & {
  readonly length: number;
  key(index: number): string | null;
};

function getIterableStorage(): IterableStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function getPreviousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return prev.toISOString().slice(0, 10);
}

export function computeConsecutiveStreakDays(
  keyPrefix = "crossword-puzzle:mission",
): number {
  const storage = getIterableStorage();
  if (storage == null) return 0;

  const prefix = `${keyPrefix}:`;
  const completedDates = new Set<string>();

  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key == null || !key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const sepIdx = rest.indexOf(":");
    if (sepIdx < 0) continue;
    const date = rest.slice(0, sepIdx);

    try {
      const raw = storage.getItem(key);
      if (raw == null) continue;
      const parsed = JSON.parse(raw) as { completedAt?: string };
      if (typeof parsed.completedAt === "string") {
        completedDates.add(date);
      }
    } catch {
      continue;
    }
  }

  let streak = 0;
  let current = getTodayDateKey();
  while (completedDates.has(current)) {
    streak++;
    current = getPreviousDateKey(current);
  }

  return streak;
}

export function createLocalMissionRepository({
  keyPrefix = "crossword-puzzle:mission",
  storage = getDefaultStorage(),
}: LocalMissionRepositoryOptions = {}): DailyMissionRepository {
  return {
    async loadMission(date, puzzleId, maxAttempts) {
      if (storage == null) {
        return createDailyMissionState(date, puzzleId, maxAttempts);
      }

      try {
        const raw =
          storage.getItem(getMissionKey(keyPrefix, date, puzzleId)) ??
          storage.getItem(getLegacyMissionKey(keyPrefix, date));
        if (raw == null) {
          return createDailyMissionState(date, puzzleId, maxAttempts);
        }

        return normalizeMission(
          JSON.parse(raw) as Partial<DailyMissionState>,
          date,
          puzzleId,
          maxAttempts,
        );
      } catch {
        return createDailyMissionState(date, puzzleId, maxAttempts);
      }
    },

    async saveMission(mission) {
      if (storage == null) {
        return;
      }

      try {
        storage.setItem(
          getMissionKey(keyPrefix, mission.date, mission.puzzleId),
          JSON.stringify(mission),
        );
      } catch {
        // Local persistence is best effort.
      }
    },
  };
}
