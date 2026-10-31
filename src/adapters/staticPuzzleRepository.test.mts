// createOnboardingPuzzleRepository 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type {
  Puzzle,
  PuzzleRepository,
} from "../../packages/crossword-core/src/index.ts";
import {
  createFallbackPuzzleRepository,
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

it("보조 목록이 처음 오프라인이어도 저장된 원격 원본을 복원한다", async () => {
  const cache = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => cache.set(key, value),
    },
  });
  let offline = false;
  const calls: string[] = [];
  const manifest = {
    puzzles: [
      {
        puzzleId: "ko-saved",
        date: "2026-10-31",
        path: "/boards/ko-saved.json",
      },
    ],
  };
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (offline) return new Response(null, { status: 503 });
    return new Response(
      JSON.stringify(
        url.endsWith("manifest.json")
          ? manifest
          : { ...dailyPuzzle, puzzleId: "ko-saved" },
      ),
    );
  }) as typeof fetch;
  const reopen = () =>
    createFallbackPuzzleRepository(
      createStaticPuzzleRepository({
        fetcher,
        manifestUrl: "https://example.com/puzzles/ko/manifest.json",
      }),
      createStaticPuzzleRepository({
        fetcher,
        manifestPath: "/puzzles/ko/manifest.json",
      }),
    );
  try {
    const online = reopen();
    await online.listPuzzleSummaries();
    await online.getPuzzleById("ko-saved");
    assert.equal(calls.includes("/puzzles/ko/manifest.json"), false);
    offline = true;
    const restored = reopen();
    assert.equal(
      (await restored.listPuzzleSummaries())[0]?.puzzleId,
      "ko-saved",
    );
    assert.equal(restored.isOffline?.(), true);
    assert.deepEqual(await restored.cachedPuzzleIds?.(), ["ko-saved"]);
    assert.equal(
      (await restored.getPuzzleById("ko-saved"))?.puzzleId,
      "ko-saved",
    );
    assert.equal(
      calls.filter((url) => url.endsWith("ko-saved.json")).length,
      1,
    );
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

it("캐시 목록 실패는 각 공급자에 한정하고 둘 다 실패하면 빈 목록을 돌려준다", async () => {
  const failing = {
    ...createBaseRepository(),
    cachedPuzzleIds: async () => {
      throw Error("unavailable");
    },
  };
  const saved = {
    ...createBaseRepository(),
    cachedPuzzleIds: async () => ["fallback-saved"],
  };
  assert.deepEqual(
    await createFallbackPuzzleRepository(failing, saved).cachedPuzzleIds?.(),
    ["fallback-saved"],
  );
  assert.deepEqual(
    await createFallbackPuzzleRepository(failing, failing).cachedPuzzleIds?.(),
    [],
  );
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

it("목록을 재사용하고 선택한 원본만 읽으며 재실행과 오프라인에서 캐시를 우선한다", async () => {
  const cache = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => cache.set(key, value),
    },
  });
  const calls: string[] = [];
  let offline = false;
  const manifest = {
    puzzles: [
      { puzzleId: "ko-test", date: "2026-10-31", path: "/boards/ko-test.json" },
    ],
  };
  const fetcher = async (url: string | URL | Request) => {
    calls.push(String(url));
    if (offline) throw Error("offline");
    return new Response(
      JSON.stringify(
        String(url).endsWith("manifest.json")
          ? manifest
          : { ...onboardingPuzzle, puzzleId: "ko-test" },
      ),
    );
  };
  try {
    const repo = createStaticPuzzleRepository({
      fetcher: fetcher as typeof fetch,
    });
    await repo.listPuzzleSummaries();
    await Promise.all([
      repo.getPuzzleById("ko-test"),
      repo.getPuzzleById("ko-test"),
    ]);
    assert.deepEqual(calls, ["/puzzles/manifest.json", "/boards/ko-test.json"]);
    offline = true;
    const reopened = createStaticPuzzleRepository({
      fetcher: fetcher as typeof fetch,
    });
    await reopened.listPuzzleSummaries();
    assert.equal(reopened.isOffline?.(), true);
    assert.deepEqual(await reopened.cachedPuzzleIds?.(), ["ko-test"]);
    assert.equal(
      (await reopened.getPuzzleById("ko-test"))?.puzzleId,
      "ko-test",
    );
    assert.equal(calls.filter((x) => x === "/boards/ko-test.json").length, 1);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
