// localProgressRepository의 저장/복원 로직 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";

import {
  createLocalProgressRepository,
  getAllBestTimePuzzleIds,
  saveBestTimeMs,
} from "./localProgressRepository.ts";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
}

// length/key(i) 열거를 지원하는 Web Storage 호환 메모리 저장소(키 열거 테스트용).
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

  it("재진입(새 세션) 시 저장된 진행 셀이 복원되고 빈 그리드로 리셋되지 않는다(#163)", async () => {
    // 진행 중 여러 셀을 채워 저장한다.
    await repo.saveProgress("puzzle-1", {
      cellValues: { "0,0": "토", "0,1": "끼", "2,0": "토" },
      earnedHintCredits: 0,
      hintCount: 0,
    });

    // 앱을 다시 켠 상황: 같은 저장소를 읽는 새 repository 인스턴스로 복원한다.
    const reopenedRepo = createLocalProgressRepository({ storage });
    const restored = await reopenedRepo.loadProgress("puzzle-1");

    assert.deepEqual(restored.cellValues, {
      "0,0": "토",
      "0,1": "끼",
      "2,0": "토",
    });
    assert.notDeepEqual(restored.cellValues, {});
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

  it("earnedHintCredits가 null(일반 JSON 오염/필드 누락)이면 0으로 정규화된다", async () => {
    storage.setItem(
      "crossword-puzzle:progress:puzzle-null-credits",
      JSON.stringify({ cellValues: {}, earnedHintCredits: null, hintCount: 0 }),
    );
    const loaded = await repo.loadProgress("puzzle-null-credits");
    assert.equal(loaded.earnedHintCredits, 0, "null 크레딧은 0으로 정규화");
  });

  it("earnedHintCredits가 문자열 타입(구 버전 데이터 오염)이면 0으로 정규화된다", async () => {
    storage.setItem(
      "crossword-puzzle:progress:puzzle-string-credits",
      JSON.stringify({ cellValues: {}, earnedHintCredits: "3", hintCount: 0 }),
    );
    const loaded = await repo.loadProgress("puzzle-string-credits");
    assert.equal(loaded.earnedHintCredits, 0, "문자열 크레딧은 0으로 정규화");
  });

  it("hintCount에 음수가 저장되면 0으로 정규화된다", async () => {
    storage.setItem(
      "crossword-puzzle:progress:puzzle-neg-hint",
      JSON.stringify({ cellValues: {}, earnedHintCredits: 0, hintCount: -3 }),
    );
    const loaded = await repo.loadProgress("puzzle-neg-hint");
    assert.equal(loaded.hintCount, 0, "음수 힌트카운트는 0으로 정규화");
  });

  it("hintCount가 null(필드 누락)이면 0으로 정규화된다", async () => {
    storage.setItem(
      "crossword-puzzle:progress:puzzle-null-hint",
      JSON.stringify({ cellValues: {}, earnedHintCredits: 0, hintCount: null }),
    );
    const loaded = await repo.loadProgress("puzzle-null-hint");
    assert.equal(loaded.hintCount, 0, "null 힌트카운트는 0으로 정규화");
  });

  it("hintCount가 소수점이면 내림하여 정수로 정규화된다", async () => {
    storage.setItem(
      "crossword-puzzle:progress:puzzle-float-hint",
      JSON.stringify({ cellValues: {}, earnedHintCredits: 0, hintCount: 1.9 }),
    );
    const loaded = await repo.loadProgress("puzzle-float-hint");
    assert.equal(loaded.hintCount, 1, "소수점 힌트카운트는 내림하여 정수로 정규화");
  });

  it("saveProgress로 저장한 revealUsed는 loadProgress로 복원된다", async () => {
    await repo.saveProgress("puzzle-reveal", {
      cellValues: { "0,0": "가" },
      earnedHintCredits: 0,
      hintCount: 0,
      revealUsed: true,
    });
    const loaded = await repo.loadProgress("puzzle-reveal");
    assert.equal(loaded.revealUsed, true, "정답 공개 여부가 보존되어야 함");
  });

  it("revealUsed 필드가 없는 구버전 데이터는 false로 정규화된다", async () => {
    storage.setItem(
      "crossword-puzzle:progress:puzzle-legacy-reveal",
      JSON.stringify({ cellValues: {}, earnedHintCredits: 0, hintCount: 0 }),
    );
    const loaded = await repo.loadProgress("puzzle-legacy-reveal");
    assert.equal(loaded.revealUsed, false, "필드 누락 시 false");
  });

  it("revealUsed가 boolean이 아니면(오염) false로 정규화된다", async () => {
    storage.setItem(
      "crossword-puzzle:progress:puzzle-bad-reveal",
      JSON.stringify({
        cellValues: {},
        earnedHintCredits: 0,
        hintCount: 0,
        revealUsed: "yes",
      }),
    );
    const loaded = await repo.loadProgress("puzzle-bad-reveal");
    assert.equal(loaded.revealUsed, false, "boolean이 아니면 false");
  });

  it("saveProgress로 저장한 tentativeCells는 loadProgress로 복원된다", async () => {
    await repo.saveProgress("puzzle-tentative", {
      cellValues: { "0,0": "가", "0,1": "나" },
      earnedHintCredits: 0,
      hintCount: 0,
      tentativeCells: ["0,0", "0,1"],
    });
    const loaded = await repo.loadProgress("puzzle-tentative");
    assert.deepEqual(
      loaded.tentativeCells,
      ["0,0", "0,1"],
      "연필(임시) 셀 목록이 보존되어야 함",
    );
  });

  it("tentativeCells 필드가 없는 구버전 데이터는 빈 배열로 정규화된다", async () => {
    storage.setItem(
      "crossword-puzzle:progress:puzzle-legacy-tentative",
      JSON.stringify({ cellValues: {}, earnedHintCredits: 0, hintCount: 0 }),
    );
    const loaded = await repo.loadProgress("puzzle-legacy-tentative");
    assert.deepEqual(loaded.tentativeCells, [], "필드 누락 시 빈 배열");
  });

  it("tentativeCells가 배열이 아니면(오염) 빈 배열로 정규화된다", async () => {
    storage.setItem(
      "crossword-puzzle:progress:puzzle-bad-tentative",
      JSON.stringify({
        cellValues: {},
        earnedHintCredits: 0,
        hintCount: 0,
        tentativeCells: "0,0",
      }),
    );
    const loaded = await repo.loadProgress("puzzle-bad-tentative");
    assert.deepEqual(loaded.tentativeCells, [], "배열이 아니면 빈 배열");
  });

  it("tentativeCells의 문자열이 아닌 항목(오염)은 제외된다", async () => {
    storage.setItem(
      "crossword-puzzle:progress:puzzle-dirty-tentative",
      JSON.stringify({
        cellValues: {},
        earnedHintCredits: 0,
        hintCount: 0,
        tentativeCells: ["0,0", 1, null, "1,2"],
      }),
    );
    const loaded = await repo.loadProgress("puzzle-dirty-tentative");
    assert.deepEqual(
      loaded.tentativeCells,
      ["0,0", "1,2"],
      "문자열 항목만 남아야 함",
    );
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

describe("getAllBestTimePuzzleIds — 전체 최고기록 키 열거", () => {
  it("저장된 best-time 키들의 puzzleId만 추출한다(다른 키는 무시)", () => {
    const storage = createEnumerableStorage();
    saveBestTimeMs("puzzle-a", 1000, storage);
    saveBestTimeMs("puzzle-b", 2000, storage);
    // best-time이 아닌 다른 네임스페이스 키는 집계에서 제외돼야 한다.
    storage.setItem("crossword-puzzle:progress:puzzle-a", "{}");
    storage.setItem("unrelated", "x");

    const ids = getAllBestTimePuzzleIds(storage).sort();
    assert.deepEqual(ids, ["puzzle-a", "puzzle-b"]);
  });

  it("archive와 무관하게 보유한 모든 기록을 센다(archive 소실 케이스)", () => {
    const storage = createEnumerableStorage();
    saveBestTimeMs("kept", 1000, storage);
    saveBestTimeMs("archive-gone", 1500, storage);
    assert.equal(getAllBestTimePuzzleIds(storage).length, 2);
  });

  it("키 열거를 지원하지 않는 저장소는 빈 배열을 반환한다", () => {
    assert.deepEqual(getAllBestTimePuzzleIds(createMemoryStorage()), []);
  });

  it("저장소가 없으면 빈 배열을 반환한다", () => {
    assert.deepEqual(getAllBestTimePuzzleIds(null), []);
  });
});
