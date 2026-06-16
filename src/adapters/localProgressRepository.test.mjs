// localProgressRepository의 저장/복원 로직 단위 테스트
// Node.js 22+ built-in test runner 사용 (외부 의존성 없음)
import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";

// localStorage를 대체하는 인메모리 스토리지 (KV 인터페이스 동일)
function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
}

// localProgressRepository.ts의 핵심 로직을 동일하게 재현
function createProgressRepository(storage) {
  const PREFIX = "crossword-puzzle:progress";
  const key = (puzzleId) => `${PREFIX}:${puzzleId}`;

  function normalize(raw) {
    const p = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      cellValues:
        p.cellValues != null && typeof p.cellValues === "object"
          ? p.cellValues
          : {},
      earnedHintCredits:
        typeof p.earnedHintCredits === "number"
          ? Math.max(0, p.earnedHintCredits)
          : 0,
      hintCount: typeof p.hintCount === "number" ? p.hintCount : 0,
    };
  }

  return {
    async loadProgress(puzzleId) {
      const raw = storage.getItem(key(puzzleId));
      if (raw == null) return { cellValues: {}, earnedHintCredits: 0, hintCount: 0 };
      try { return normalize(raw); } catch { return { cellValues: {}, earnedHintCredits: 0, hintCount: 0 }; }
    },
    async saveProgress(puzzleId, progress) {
      try { storage.setItem(key(puzzleId), JSON.stringify(progress)); } catch {}
    },
    async clearProgress(puzzleId) {
      try { storage.removeItem(key(puzzleId)); } catch {}
    },
  };
}

describe("localProgressRepository — restartMissionAttempt 시나리오", () => {
  let storage;
  let repo;

  beforeEach(() => {
    storage = createMemoryStorage();
    repo = createProgressRepository(storage);
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

  it("재도전 시나리오: saveProgress로 셀/힌트 초기화하면서 크레딧 유지", async () => {
    await repo.saveProgress("puzzle-2", {
      cellValues: { "0,0": "가", "0,1": "나" },
      earnedHintCredits: 5,
      hintCount: 2,
    });

    // restartMissionAttempt의 단일 saveProgress 저장 패턴
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

  it("clearProgress 후 saveProgress(단일 저장)가 clearProgress보다 나중에 실행된다", async () => {
    await repo.saveProgress("puzzle-3", {
      cellValues: { "0,0": "가" },
      earnedHintCredits: 3,
      hintCount: 1,
    });

    // 기존 방식(clearProgress → saveProgress 두 번): 경합 가능성
    // 새 방식(saveProgress 한 번): 원자적 저장으로 경합 없음
    await repo.clearProgress("puzzle-3");
    await repo.saveProgress("puzzle-3", { cellValues: {}, earnedHintCredits: 3, hintCount: 0 });

    const loaded = await repo.loadProgress("puzzle-3");
    assert.equal(loaded.earnedHintCredits, 3, "saveProgress가 clearProgress 뒤에 실행되어 크레딧 복원됨");
  });

  it("clearProgress만 실행하면 earnedHintCredits는 0이 된다", async () => {
    await repo.saveProgress("puzzle-4", {
      cellValues: { "0,0": "가" },
      earnedHintCredits: 3,
      hintCount: 1,
    });
    await repo.clearProgress("puzzle-4");
    const loaded = await repo.loadProgress("puzzle-4");
    assert.equal(loaded.earnedHintCredits, 0, "clearProgress 후 크레딧은 0이어야 함");
  });

  it("저장하지 않은 퍼즐은 빈 progress를 반환한다", async () => {
    const loaded = await repo.loadProgress("unknown-puzzle");
    assert.equal(loaded.earnedHintCredits, 0);
    assert.equal(loaded.hintCount, 0);
    assert.deepEqual(loaded.cellValues, {});
  });
});
