// localProgressRepository의 저장/복원 로직 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";

import { createLocalProgressRepository } from "./localProgressRepository.ts";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
}

describe("localProgressRepository — restartMissionAttempt 시나리오", () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  let repo: ReturnType<typeof createLocalProgressRepository>;

  beforeEach(() => {
    storage = createMemoryStorage();
    repo = createLocalProgressRepository({ storage });
  });

  it("saveProgress로 저장한 earnedHintCredits는 loadProgress로 복원된다", async () => {
    await repo.saveProgress("puzzle-1", {
      cellValues: { "0,0": "가" },
      earnedHintCredits: 3,
      hintCount: 1,
    });
    const loaded = await repo.loadProgress("puzzle-1");
    assert.equal(loaded.earnedHintCredits, 3);
    assert.equal(loaded.hintCount, 1);
    assert.deepEqual(loaded.cellValues, { "0,0": "가" });
  });

  it("재도전 시나리오(크레딧 > 0): saveProgress로 셀/힌트 초기화하면서 크레딧 유지", async () => {
    await repo.saveProgress("puzzle-2", {
      cellValues: { "0,0": "가", "0,1": "나" },
      earnedHintCredits: 5,
      hintCount: 2,
    });

    // clearProgress(preserveEarnedHintCredits > 0) 경로: saveProgress로 원자적 저장
    const creditsToPreserve = 5;
    await repo.saveProgress("puzzle-2", {
      cellValues: {},
      earnedHintCredits: creditsToPreserve,
      hintCount: 0,
    });

    const loaded = await repo.loadProgress("puzzle-2");
    assert.equal(loaded.earnedHintCredits, 5, "광고 획득 크레딧이 유지되어야 함");
    assert.equal(loaded.hintCount, 0, "힌트 사용 횟수는 초기화되어야 함");
    assert.deepEqual(loaded.cellValues, {}, "셀 값은 초기화되어야 함");
  });

  it("재도전 시나리오(크레딧 = 0): clearProgress 경로로 키가 삭제된다", async () => {
    await repo.saveProgress("puzzle-5", {
      cellValues: { "0,0": "가" },
      earnedHintCredits: 0,
      hintCount: 1,
    });

    // clearProgress(0)이거나 일반 clearProgress() 경로: removeItem
    await repo.clearProgress("puzzle-5");
    const loaded = await repo.loadProgress("puzzle-5");
    assert.equal(loaded.earnedHintCredits, 0);
    assert.equal(loaded.hintCount, 0);
    assert.deepEqual(loaded.cellValues, {});
  });

  it("clearProgress 후 데이터가 없으면 기본값을 반환한다", async () => {
    await repo.saveProgress("puzzle-3", {
      cellValues: { "0,0": "가" },
      earnedHintCredits: 3,
      hintCount: 1,
    });
    await repo.clearProgress("puzzle-3");
    const loaded = await repo.loadProgress("puzzle-3");
    assert.equal(loaded.earnedHintCredits, 0, "clearProgress 후 크레딧은 0이어야 함");
    assert.equal(loaded.hintCount, 0);
    assert.deepEqual(loaded.cellValues, {});
  });

  it("저장하지 않은 퍼즐은 빈 progress를 반환한다", async () => {
    const loaded = await repo.loadProgress("unknown-puzzle");
    assert.equal(loaded.earnedHintCredits, 0);
    assert.equal(loaded.hintCount, 0);
    assert.deepEqual(loaded.cellValues, {});
  });

  it("earnedHintCredits에 음수가 저장되면 0으로 정규화된다", async () => {
    await repo.saveProgress("puzzle-4", {
      cellValues: {},
      earnedHintCredits: -1,
      hintCount: 0,
    });
    const loaded = await repo.loadProgress("puzzle-4");
    assert.equal(loaded.earnedHintCredits, 0, "음수 크레딧은 0으로 정규화");
  });

  it("saveProgress가 실패하면 예외를 전파한다", async () => {
    const failStorage = {
      getItem: () => null,
      setItem: (_key: string, _value: string): void => {
        throw new Error("QuotaExceededError");
      },
      removeItem: (_key: string): void => {},
    };
    const failRepo = createLocalProgressRepository({ storage: failStorage });
    await assert.rejects(() =>
      failRepo.saveProgress("puzzle-fail", {
        cellValues: {},
        earnedHintCredits: 3,
        hintCount: 0,
      })
    );
  });

  it("clearProgress가 실패하면 예외를 전파한다", async () => {
    const failStorage = {
      getItem: () => null,
      setItem: (_key: string, _value: string): void => {},
      removeItem: (_key: string): void => {
        throw new Error("StorageError");
      },
    };
    const failRepo = createLocalProgressRepository({ storage: failStorage });
    await assert.rejects(() => failRepo.clearProgress("puzzle-fail"));
  });
});
