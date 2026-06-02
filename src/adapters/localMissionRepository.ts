import {
  createDailyMissionState,
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
