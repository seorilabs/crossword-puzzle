// getRecentCompletionDates 완료일 스캔 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  createLocalMissionRepository,
  getRecentCompletionDates,
  loadDailyExtraAttemptGrantCount,
  saveDailyExtraAttemptGrantCount,
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

// 리워드 광고 도전 충전(#204) 상태 영속 테스트. 저장된 extraAttemptsGranted를
// 보존하고 유효 maxAttempts(기본 한도 + 충전분)를 복원해, 앱 재실행 후에도
// 충전된 기회가 사라지거나 attemptsUsed가 잘못 클램프되지 않음을 고정한다.
describe("createLocalMissionRepository: extraAttemptsGranted 영속(#204)", () => {
  const createStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    };
  };

  it("충전된 미션을 저장·재로드하면 충전분이 유지된다(라운드트립)", async () => {
    const storage = createStorage();
    const repository = createLocalMissionRepository({ storage });
    await repository.saveMission({
      date: "2026-07-02",
      puzzleId: "p1",
      attemptsUsed: 4,
      maxAttempts: 4,
      extraAttemptsGranted: 1,
    });

    const loaded = await repository.loadMission("2026-07-02", "p1", 3);
    assert.equal(loaded.extraAttemptsGranted, 1);
    assert.equal(loaded.maxAttempts, 4); // 기본 3 + 충전 1
    assert.equal(loaded.attemptsUsed, 4); // 충전분 반영 한도로 클램프
  });

  it("충전 기록이 없으면 기존과 동일하게 기본 한도로 클램프한다(회귀 없음)", async () => {
    const storage = createStorage();
    const repository = createLocalMissionRepository({ storage });
    await repository.saveMission({
      date: "2026-07-02",
      puzzleId: "p1",
      attemptsUsed: 4,
      maxAttempts: 4,
    });

    const loaded = await repository.loadMission("2026-07-02", "p1", 3);
    assert.equal(loaded.extraAttemptsGranted, undefined);
    assert.equal(loaded.maxAttempts, 3);
    assert.equal(loaded.attemptsUsed, 3);
  });

  it("비정상 extraAttemptsGranted 값(음수/NaN)은 0으로 본다", async () => {
    const storage = createStorage();
    storage.setItem(
      "crossword-puzzle:mission:2026-07-02:p1",
      JSON.stringify({
        date: "2026-07-02",
        puzzleId: "p1",
        attemptsUsed: 2,
        maxAttempts: 3,
        extraAttemptsGranted: -2,
      }),
    );
    const repository = createLocalMissionRepository({ storage });
    const loaded = await repository.loadMission("2026-07-02", "p1", 3);
    assert.equal(loaded.extraAttemptsGranted, undefined);
    assert.equal(loaded.maxAttempts, 3);
  });
});

// 일일 충전 누계 저장(#204, High 리뷰 대응). 달력일 키 하나로 오늘 누계를
// 보존하고, 날짜가 바뀌면 0으로 리셋됨을 고정한다. 이 누계가
// canGrantExtraAttempt의 일일 상한 판정 입력이 된다.
describe("load/saveDailyExtraAttemptGrantCount(#204)", () => {
  const createStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    };
  };

  it("저장한 날짜의 누계를 그대로 복원한다(라운드트립)", () => {
    const storage = createStorage();
    saveDailyExtraAttemptGrantCount("2026-07-02", 2, storage);
    assert.equal(loadDailyExtraAttemptGrantCount("2026-07-02", storage), 2);
  });

  it("저장된 날짜와 조회 날짜가 다르면 0으로 리셋한다(자정 롤오버)", () => {
    const storage = createStorage();
    saveDailyExtraAttemptGrantCount("2026-07-01", 1, storage);
    assert.equal(loadDailyExtraAttemptGrantCount("2026-07-02", storage), 0);
  });

  it("기록이 없거나 값이 비정상이면 0으로 본다", () => {
    const storage = createStorage();
    assert.equal(loadDailyExtraAttemptGrantCount("2026-07-02", storage), 0);
    storage.setItem(
      "crossword-puzzle:extraAttemptGrants",
      JSON.stringify({ date: "2026-07-02", count: -3 }),
    );
    assert.equal(loadDailyExtraAttemptGrantCount("2026-07-02", storage), 0);
    storage.setItem("crossword-puzzle:extraAttemptGrants", "not-json");
    assert.equal(loadDailyExtraAttemptGrantCount("2026-07-02", storage), 0);
  });

  it("음수/소수 저장은 0 이상 정수로 보정한다", () => {
    const storage = createStorage();
    saveDailyExtraAttemptGrantCount("2026-07-02", 1.9, storage);
    assert.equal(loadDailyExtraAttemptGrantCount("2026-07-02", storage), 1);
    saveDailyExtraAttemptGrantCount("2026-07-02", -1, storage);
    assert.equal(loadDailyExtraAttemptGrantCount("2026-07-02", storage), 0);
  });
});
