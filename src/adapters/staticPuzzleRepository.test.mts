// createOnboardingPuzzleRepository 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type {
  Puzzle,
  PuzzleRepository,
} from "../../packages/crossword-core/src/index.ts";
import {
  createOnboardingPuzzleRepository,
  createStaticPuzzleRepository,
} from "./staticPuzzleRepository.ts";

const onboardingPuzzle = {
  puzzleId: "onboarding-easy-01",
  difficulty: "easy",
} as unknown as Puzzle;

const dailyPuzzle = {
  puzzleId: "2026-05-25-normal-01",
  difficulty: "normal",
} as unknown as Puzzle;

function createBaseRepository(): PuzzleRepository & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    async listPuzzleSummaries() {
      calls.push("listPuzzleSummaries");
      return [];
    },
    async getPuzzleById(puzzleId) {
      calls.push(`getPuzzleById:${puzzleId}`);
      return puzzleId === dailyPuzzle.puzzleId ? dailyPuzzle : null;
    },
    async getPuzzleForDate() {
      calls.push("getPuzzleForDate");
      return dailyPuzzle;
    },
  };
}

describe("createOnboardingPuzzleRepository", () => {
  it("입문 퍼즐 id는 위임 없이 번들 상수를 돌려준다", async () => {
    const base = createBaseRepository();
    const repo = createOnboardingPuzzleRepository(base, onboardingPuzzle);

    const result = await repo.getPuzzleById("onboarding-easy-01");

    assert.equal(result, onboardingPuzzle);
    assert.deepEqual(base.calls, []);
  });

  it("그 외 id는 base 레포지토리에 위임한다", async () => {
    const base = createBaseRepository();
    const repo = createOnboardingPuzzleRepository(base, onboardingPuzzle);

    const result = await repo.getPuzzleById(dailyPuzzle.puzzleId);

    assert.equal(result, dailyPuzzle);
    assert.deepEqual(base.calls, [`getPuzzleById:${dailyPuzzle.puzzleId}`]);
  });

  it("목록에는 입문 퍼즐을 노출하지 않는다(위임 결과 그대로)", async () => {
    const base = createBaseRepository();
    const repo = createOnboardingPuzzleRepository(base, onboardingPuzzle);

    const summaries = await repo.listPuzzleSummaries();

    assert.deepEqual(summaries, []);
    assert.deepEqual(base.calls, ["listPuzzleSummaries"]);
  });
});

describe("createStaticPuzzleRepository 식별자 정규화 (#351)", () => {
  it("원격 manifest와 puzzle JSON의 숫자 ID를 문자열로 반환한다", async () => {
    const manifest = {
      puzzles: [
        {
          alias: 26082100,
          date: "2026-08-21",
          packId: 260821,
          path: "/26082100.json",
          puzzleId: 26082100,
          slotId: 26082102,
        },
      ],
    };
    const puzzle = {
      alias: 26082100,
      date: "2026-08-21",
      packId: 260821,
      puzzleId: 26082100,
      slotId: 26082102,
    };
    const fetcher = (async (input: string | URL | Request) => {
      const body = String(input).endsWith("manifest.json") ? manifest : puzzle;
      return new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }) as typeof fetch;
    const repository = createStaticPuzzleRepository({
      fetcher,
      manifestPath: "/puzzles/manifest.json",
    });

    const summaries = await repository.listPuzzleSummaries();
    assert.equal(summaries[0]?.puzzleId, "26082100");
    assert.equal(summaries[0]?.alias, "26082100");
    assert.equal(summaries[0]?.packId, "260821");
    assert.equal(summaries[0]?.slotId, "26082102");

    const loaded = await repository.getPuzzleById("26082100");
    assert.equal(loaded?.puzzleId, "26082100");
    assert.equal(loaded?.alias, "26082100");
    assert.equal(loaded?.packId, "260821");
    assert.equal(loaded?.slotId, "26082102");
  });
});
