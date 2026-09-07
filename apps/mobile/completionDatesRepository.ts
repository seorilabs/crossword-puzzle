import AsyncStorage from '@react-native-async-storage/async-storage';

import { collectCompletedDates } from '../../packages/crossword-core/src';

type AsyncKeyValueStorage = {
  getAllKeys?(): Promise<readonly string[]>;
  getItem(key: string): Promise<string | null>;
  multiGet?(
    keys: readonly string[],
  ): Promise<readonly (readonly [string, string | null])[]>;
  setItem(key: string, value: string): Promise<void>;
};

export type MobileCompletionDatesRepository = {
  loadCompletionDates(): Promise<string[]>;
  addCompletionDate(date: string): Promise<string[]>;
  migrateCompletionDatesIfNeeded(input: {
    archiveRecords: ReadonlyArray<{
      completedAt: string | undefined;
      puzzle: { date: string };
    }>;
  }): Promise<string[]>;
};

export const COMPLETION_DATES_KEY = 'crossword-puzzle:completion-dates';
export const COMPLETION_DATES_MIGRATED_KEY = `${COMPLETION_DATES_KEY}:migrated`;
const MISSION_KEY_PREFIX = 'crossword-puzzle:mission:';

function normalizeDates(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...collectCompletedDates(
      value
        .filter((item): item is string => typeof item === 'string')
        .map(date => ({ date, completedAt: '1970-01-01T00:00:00.000Z' })),
    ),
  ].sort();
}

// 완료일(YYYY-MM-DD) 목록을 한 키에 보관한다. RN 아카이브는 30건 상한이라 12주 히트맵과
// 최장 스트릭을 만들 수 없으므로, 완료일만 따로 무한 누적한다. 첫 실행에서 아카이브
// 완료 레코드와 미션 키(`crossword-puzzle:mission:{date}:{puzzleId}`)를 한 번 스캔해
// 백필하고 마커를 남긴다. 스캔 실패는 아카이브만으로 폴백한다.
export function createMobileCompletionDatesRepository({
  storage = AsyncStorage,
  key = COMPLETION_DATES_KEY,
  migratedKey = COMPLETION_DATES_MIGRATED_KEY,
}: {
  storage?: AsyncKeyValueStorage;
  key?: string;
  migratedKey?: string;
} = {}): MobileCompletionDatesRepository {
  async function loadCompletionDates(): Promise<string[]> {
    try {
      const raw = await storage.getItem(key);
      return raw == null ? [] : normalizeDates(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  async function saveCompletionDates(dates: readonly string[]) {
    const normalized = normalizeDates([...dates]);
    try {
      await storage.setItem(key, JSON.stringify(normalized));
    } catch {
      // Local persistence is best effort.
    }
    return normalized;
  }

  async function scanMissionCompletionDates(): Promise<string[]> {
    if (storage.getAllKeys == null || storage.multiGet == null) {
      return [];
    }
    try {
      const keys = (await storage.getAllKeys()).filter(candidate =>
        candidate.startsWith(MISSION_KEY_PREFIX),
      );
      const rows = await storage.multiGet(keys);
      const dates: string[] = [];
      for (const [missionKey, raw] of rows) {
        if (raw == null) {
          continue;
        }
        try {
          const parsed = JSON.parse(raw) as { completedAt?: unknown };
          if (typeof parsed.completedAt !== 'string') {
            continue;
          }
          const date = missionKey.slice(MISSION_KEY_PREFIX.length).split(':')[0];
          dates.push(date);
        } catch {
          // 손상된 항목은 건너뛴다.
        }
      }
      return dates;
    } catch {
      return [];
    }
  }

  return {
    loadCompletionDates,
    async addCompletionDate(date) {
      const current = await loadCompletionDates();
      if (current.includes(date)) {
        return current;
      }
      return saveCompletionDates([...current, date]);
    },
    async migrateCompletionDatesIfNeeded({ archiveRecords }) {
      let migrated: string | null = null;
      try {
        migrated = await storage.getItem(migratedKey);
      } catch {
        migrated = null;
      }
      const current = await loadCompletionDates();
      if (migrated === '1') {
        return current;
      }

      const archiveDates = [...collectCompletedDates(
        archiveRecords.map(record => ({
          date: record.puzzle.date,
          completedAt: record.completedAt,
        })),
      )];
      const missionDates = await scanMissionCompletionDates();
      const merged = await saveCompletionDates([
        ...current,
        ...archiveDates,
        ...missionDates,
      ]);
      try {
        await storage.setItem(migratedKey, '1');
      } catch {
        // 마커 저장 실패 시 다음 실행에서 다시 스캔한다(idempotent).
      }
      return merged;
    },
  };
}

export const mobileCompletionDatesRepository =
  createMobileCompletionDatesRepository();
