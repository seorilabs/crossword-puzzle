import AsyncStorage from '@react-native-async-storage/async-storage';

import { shouldRecordBestTime } from '../../packages/crossword-core/src';

type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type BestTimes = Record<string, number>;

export type MobileBestTimeRepository = {
  loadBestTimes(): Promise<BestTimes>;
  recordBestTime(
    puzzleId: string,
    elapsedMs: number,
  ): Promise<{ isNewBest: boolean; bestTimes: BestTimes }>;
};

export const BEST_TIMES_KEY = 'crossword-puzzle:best-times';

function normalizeBestTimes(value: unknown): BestTimes {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: BestTimes = {};
  for (const [puzzleId, ms] of Object.entries(value as Record<string, unknown>)) {
    if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) {
      result[puzzleId] = ms;
    }
  }
  return result;
}

// 퍼즐별 최고 기록(ms)을 한 키의 JSON 으로 보관한다. 웹은 퍼즐별 localStorage 키를
// 쓰지만 RN 은 키 열거 없이 한 번 읽어 통계에 넘길 수 있게 단일 문서로 둔다. 갱신 판정
// (shouldRecordBestTime)은 core 규칙을 쓴다.
export function createMobileBestTimeRepository({
  storage = AsyncStorage,
  key = BEST_TIMES_KEY,
}: { storage?: AsyncKeyValueStorage; key?: string } = {}): MobileBestTimeRepository {
  async function loadBestTimes(): Promise<BestTimes> {
    try {
      const raw = await storage.getItem(key);
      return raw == null ? {} : normalizeBestTimes(JSON.parse(raw));
    } catch {
      return {};
    }
  }

  return {
    loadBestTimes,
    async recordBestTime(puzzleId, elapsedMs) {
      const bestTimes = await loadBestTimes();
      if (!shouldRecordBestTime(bestTimes[puzzleId], elapsedMs)) {
        return { isNewBest: false, bestTimes };
      }
      const next = { ...bestTimes, [puzzleId]: elapsedMs };
      try {
        await storage.setItem(key, JSON.stringify(next));
      } catch {
        // 저장에 실패하면 갱신으로 보고하지 않는다. 웹도 saveBestTimeMs 가 성공했을 때만
        // 배지를 켜므로, 다음 실행에서 사라질 값을 배지·통계에 쓰지 않는다.
        return { isNewBest: false, bestTimes };
      }
      return { isNewBest: true, bestTimes: next };
    },
  };
}

export function getAllBestTimeValuesMs(bestTimes: BestTimes): number[] {
  return Object.values(bestTimes);
}

export function getOverallBestTimeMs(bestTimes: BestTimes): number | null {
  const values = getAllBestTimeValuesMs(bestTimes);
  return values.length === 0 ? null : Math.min(...values);
}

export const mobileBestTimeRepository = createMobileBestTimeRepository();
