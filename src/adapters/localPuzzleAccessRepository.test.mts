// localPuzzleAccessRepository: archive 기록의 노힌트 판정 신호(hintCount·revealUsed)
// 동결/복원 단위 테스트. Node.js built-in test runner + --experimental-strip-types.
import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";

import { createLocalPuzzleArchiveRepository } from "./localPuzzleAccessRepository.ts";
import type { Puzzle } from "../../packages/crossword-core/src";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
}

// 테스트용 최소 퍼즐(스키마 세부는 archive 저장/복원에 영향 없음).
const samplePuzzle = {
  puzzleId: "puzzle-1",
  date: "2026-05-25",
  difficulty: null,
  entries: [],
} as unknown as Puzzle;

describe("localPuzzleAccessRepository — 노힌트 판정 신호 동결", () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  let repo: ReturnType<typeof createLocalPuzzleArchiveRepository>;

  beforeEach(() => {
    storage = createMemoryStorage();
    repo = createLocalPuzzleArchiveRepository({ storage });
  });

  it("완료 저장 시 hintCount·revealUsed를 기록에 동결하고 복원한다", async () => {
    await repo.savePuzzle(samplePuzzle, {
      completedAt: "2026-05-25T10:00:00Z",
      hintCount: 0,
      revealUsed: true,
    });
    const [record] = await repo.listPuzzles();
    assert.equal(record.hintCount, 0);
    assert.equal(record.revealUsed, true);
  });

  it("이후 메타 저장(필드 미지정)에서도 동결된 값을 보존한다", async () => {
    await repo.savePuzzle(samplePuzzle, {
      completedAt: "2026-05-25T10:00:00Z",
      hintCount: 2,
      revealUsed: false,
    });
    // 완료 후 재방문 등으로 필드 없이 다시 저장해도 이전 값이 유지돼야 한다.
    await repo.savePuzzle(samplePuzzle, { completedAt: "2026-05-25T10:00:00Z" });

    const [record] = await repo.listPuzzles();
    assert.equal(record.hintCount, 2);
    assert.equal(record.revealUsed, false);
  });

  it("필드가 없는 구버전 기록은 undefined로 복원된다(폴백 대상)", () => {
    storage.setItem("crossword-puzzle:archive:index", JSON.stringify(["legacy"]));
    storage.setItem(
      "crossword-puzzle:archive:record:legacy",
      JSON.stringify({
        cachedAt: "2026-05-25T10:00:00Z",
        completedAt: "2026-05-25T10:00:00Z",
        puzzle: { ...samplePuzzle, puzzleId: "legacy" },
        puzzleId: "legacy",
      }),
    );

    return repo.listPuzzles().then(([record]) => {
      assert.equal(record.hintCount, undefined);
      assert.equal(record.revealUsed, undefined);
    });
  });

  it("revealUsed가 boolean이 아닌 오염 값이면 undefined로 정규화된다", () => {
    storage.setItem("crossword-puzzle:archive:index", JSON.stringify(["dirty"]));
    storage.setItem(
      "crossword-puzzle:archive:record:dirty",
      JSON.stringify({
        cachedAt: "2026-05-25T10:00:00Z",
        completedAt: "2026-05-25T10:00:00Z",
        puzzle: { ...samplePuzzle, puzzleId: "dirty" },
        puzzleId: "dirty",
        hintCount: -3,
        revealUsed: "yes",
      }),
    );

    return repo.listPuzzles().then(([record]) => {
      // 음수 hintCount는 0으로 정규화, 오염 revealUsed는 undefined.
      assert.equal(record.hintCount, 0);
      assert.equal(record.revealUsed, undefined);
    });
  });
});
