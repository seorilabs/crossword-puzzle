// getRecentCompletionDates 완료일 스캔 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  getRecentCompletionDates,
} from "./localMissionRepository.ts";
import { getTodayDateKey } from "../../packages/crossword-core/src/puzzle.ts";

// length/key(i) 열거를 지원하는 Web Storage 호환 메모리 저장소.
function createEnumerableStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

// today 기준 deltaDays만큼 이동한 날짜 키(UTC 산술).
function shiftDate(key: string, deltaDays: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + deltaDays)).toISOString().slice(0, 10);
}

const PREFIX = "crossword-puzzle:mission";

describe("getRecentCompletionDates", () => {
  it("completedAt이 있는 최근 완료일만 오름차순으로 반환한다", () => {
    const storage = createEnumerableStorage();
    const today = getTodayDateKey();
    const d3 = shiftDate(today, -3);
    const d10 = shiftDate(today, -10);
    const dOld = shiftDate(today, -200); // lookback(90) 밖
    const dOngoing = shiftDate(today, -1); // 완료 안 함

    storage.setItem(`${PREFIX}:${today}:p1`, JSON.stringify({ completedAt: "t" }));
    storage.setItem(`${PREFIX}:${d3}:p2`, JSON.stringify({ completedAt: "t" }));
    storage.setItem(`${PREFIX}:${d10}:p3`, JSON.stringify({ completedAt: "t" }));
    storage.setItem(`${PREFIX}:${dOld}:p4`, JSON.stringify({ completedAt: "t" }));
    storage.setItem(`${PREFIX}:${dOngoing}:p5`, JSON.stringify({ lastStartedAt: "t" }));

    const dates = getRecentCompletionDates(90, PREFIX, storage);
    assert.deepEqual(dates, [d10, d3, today]);
  });

  it("레거시 키 형식({prefix}:{date})의 완료도 인식한다", () => {
    const storage = createEnumerableStorage();
    const today = getTodayDateKey();
    const d2 = shiftDate(today, -2);
    storage.setItem(`${PREFIX}:${d2}`, JSON.stringify({ completedAt: "t" }));

    const dates = getRecentCompletionDates(90, PREFIX, storage);
    assert.deepEqual(dates, [d2]);
  });

  it("스토리지가 없으면 빈 배열을 반환한다", () => {
    assert.deepEqual(getRecentCompletionDates(90, PREFIX, null), []);
  });
});
