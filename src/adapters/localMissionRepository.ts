import {
  createDailyMissionState,
  type DailyMissionRepository,
  type DailyMissionState,
} from "../../packages/crossword-core/src/mission.ts";
import { getTodayDateKey } from "../../packages/crossword-core/src/puzzle.ts";

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

// Build the set of dates within the lookback window to avoid parsing old data.
function buildLookbackDates(today: string, maxLookbackDays: number): Set<string> {
  const lookbackDates = new Set<string>();
  let d = today;
  for (let i = 0; i < maxLookbackDays; i++) {
    lookbackDates.add(d);
    d = getPreviousDateKey(d);
  }
  return lookbackDates;
}

// Scan storage for mission keys whose date falls in the lookback window and that
// have a `completedAt` timestamp, returning the set of completed date keys.
// Shared by computeConsecutiveStreakDays and getRecentCompletionDates so both use
// the exact same completion判定(`completedAt` 존재).
function scanCompletedDates(
  storage: IterableStorage,
  keyPrefix: string,
  lookbackDates: Set<string>,
): Set<string> {
  const prefix = `${keyPrefix}:`;
  const completedDates = new Set<string>();

  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key == null || !key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const sepIdx = rest.indexOf(":");
    // Legacy key format: "{prefix}:{date}" (no puzzleId suffix)
    // New key format:    "{prefix}:{date}:{puzzleId}"
    const date = sepIdx < 0 ? rest : rest.slice(0, sepIdx);
    if (!lookbackDates.has(date)) continue;

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

  return completedDates;
}

// Module-level memory cache: avoids re-scanning localStorage on every home
// screen visit within the same calendar day.
let _streakCache: { date: string; value: number } | null = null;

export function invalidateStreakCache(): void {
  _streakCache = null;
}

// 최근 lookbackDays일 이내에 완료(completedAt 존재)한 날짜를 오름차순 정렬해 반환한다.
// computeConsecutiveStreakDays와 동일한 스캔·완료 판정(scanCompletedDates)을 공유하므로
// 캘린더 히트맵과 스트릭 숫자가 같은 완료일 집합을 근거로 삼는다. storage는 테스트에서
// 주입할 수 있고, 기본값은 window.localStorage다.
export function getRecentCompletionDates(
  lookbackDays = 90,
  keyPrefix = "crossword-puzzle:mission",
  storage: IterableStorage | null = getIterableStorage(),
): string[] {
  if (storage == null) return [];
  const today = getTodayDateKey();
  const lookbackDates = buildLookbackDates(today, lookbackDays);
  return [...scanCompletedDates(storage, keyPrefix, lookbackDates)].sort();
}

export function computeConsecutiveStreakDays(
  keyPrefix = "crossword-puzzle:mission",
  maxLookbackDays = 366,
): number {
  const today = getTodayDateKey();

  if (_streakCache != null && _streakCache.date === today) {
    return _streakCache.value;
  }

  const storage = getIterableStorage();
  if (storage == null) return 0;

  const lookbackDates = buildLookbackDates(today, maxLookbackDays);
  const completedDates = scanCompletedDates(storage, keyPrefix, lookbackDates);

  const yesterday = getPreviousDateKey(today);

  // If today is already completed, count from today.
  // If today is not yet completed but yesterday is, count from yesterday and
  // add 1 for today — this preserves the "streak still active" state and
  // motivates the user to complete today's puzzle.
  const startDate = completedDates.has(today) ? today : yesterday;
  if (!completedDates.has(startDate)) {
    _streakCache = { date: today, value: 0 };
    return 0;
  }

  let streak = 0;
  let current = startDate;
  while (completedDates.has(current)) {
    streak++;
    current = getPreviousDateKey(current);
  }

  const result = startDate === yesterday ? streak + 1 : streak;
  _streakCache = { date: today, value: result };
  return result;
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
