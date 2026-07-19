import { beforeEach, describe, expect, test, vi } from "vitest";

const catalogMocks = vi.hoisted(() => ({
  validate: vi.fn(),
}));

vi.mock(
  "../../packages/crossword-core/src/launchContentCatalog.ts",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../packages/crossword-core/src/launchContentCatalog.ts")
    >()),
    validateKoKrLaunchContentCatalogStructureV1: catalogMocks.validate,
  }),
);

import { calculateGameContentChecksum } from "../../packages/crossword-core/src/gameContent.ts";
import {
  KO_KR_LAUNCH_CONTENT_CONTRACT,
  type KoKrLaunchContentCatalogV1,
  type LaunchBoardRouteV1,
} from "../../packages/crossword-core/src/launchContentCatalog.ts";
import { loadBundledFirstRunGameContents } from "./onboardingGameContent.ts";
import {
  calculateLaunchReviewCatalogHash,
  loadLaunchReviewContent,
} from "./launchReviewContent.ts";

const GENERATOR_COMMIT = "b".repeat(40);
const GENERATOR_CONFIG_HASH = `sha256:${"c".repeat(64)}`;
const GENERATED_AT = "2026-07-19T00:00:00.000Z";

type Fixture = ReturnType<typeof createFixture>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function routeFor(index: number): LaunchBoardRouteV1 {
  if (index < 30) return { kind: "chapter" };
  if (index < 72) {
    const weekdays = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ] as const;
    return { kind: "daily", weekday: weekdays[(index - 30) % 7] };
  }
  if (index < 84) return { kind: "bonus" };
  return { kind: "weekly-challenge" };
}

function createFixture() {
  const firstRunBoards = loadBundledFirstRunGameContents().map((content) => ({
    route: { kind: "first-run" } as const,
    content: clone(content),
    artifactPath: `/game-content/v1/ko-KR/packs/${content.packId}/${content.contentChecksum}.json`,
  }));
  const template = loadBundledFirstRunGameContents()[0];
  const generatedBoards = Array.from({ length: 90 }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    const content = clone(template);
    content.puzzleId = `fixture-generated-${number}`;
    content.packId = "ko-kr-launch-v1";
    content.slotId = `fixture-slot-${number}`;
    content.themeId = `fixture-theme-${(index % 6) + 1}`;
    content.chapterId = `fixture-chapter-${Math.floor(index / 30) + 1}`;
    content.generatorCommit = GENERATOR_COMMIT;
    content.generatorConfigHash = GENERATOR_CONFIG_HASH;
    content.entries = content.entries.map((entry, entryIndex) => ({
      ...entry,
      sourceEntryId: `${content.puzzleId}-source-${entryIndex + 1}`,
    }));
    content.contentChecksum = calculateGameContentChecksum(content);
    const artifactPath = `/game-content/v1/ko-KR/packs/${content.packId}/${content.contentChecksum}.json`;
    return { route: routeFor(index), content, artifactPath };
  });
  const catalog = {
    schemaVersion: "launch-content-catalog/1",
    artifactStatus: "candidate",
    activationApproved: false,
    generatedAt: GENERATED_AT,
    catalogId: "fixture-ko-kr-launch-v1",
    contentLocale: "ko-KR",
    releaseTimeZone: "Asia/Seoul",
    languageProfile: { id: "ko-KR", version: 1 },
    boards: [...firstRunBoards, ...generatedBoards],
  };
  const reportBoards = generatedBoards.map(
    ({ route, content, artifactPath }) => ({
      puzzleId: content.puzzleId,
      packId: content.packId,
      contentChecksum: content.contentChecksum,
      artifactPath,
      generatorCommit: GENERATOR_COMMIT,
      generatorConfigHash: GENERATOR_CONFIG_HASH,
      route: clone(route),
      difficulty: content.difficulty,
      themeId: content.themeId,
      accepted: true,
      quality: { pass: true },
    }),
  );
  const report = {
    schemaVersion: "ko-kr-launch-generation-report/8",
    artifactStatus: "candidate",
    activationApproved: false,
    generatedAt: GENERATED_AT,
    catalogId: catalog.catalogId,
    generator: {
      commit: GENERATOR_COMMIT,
      configHash: GENERATOR_CONFIG_HASH,
    },
    routeCounts: clone(KO_KR_LAUNCH_CONTENT_CONTRACT.routeCounts),
    firstRunBoardCount: 3,
    generatedBoardCount: 90,
    totalBoardCount: 93,
    catalogValidationPass: true,
    worldMapValidationPass: true,
    boards: [...reportBoards.slice(47), ...reportBoards.slice(0, 47)],
  };
  const validatedCatalog: KoKrLaunchContentCatalogV1 = {
    schemaVersion: "launch-content-catalog/1",
    catalogId: catalog.catalogId,
    contentLocale: "ko-KR",
    releaseTimeZone: "Asia/Seoul",
    languageProfile: { id: "ko-KR", version: 1 },
    boards: catalog.boards.map(({ route, content }) => ({ route, content })),
  };
  return { catalog, generatedBoards, report, validatedCatalog };
}

function createFetch(fixture: Fixture) {
  const documents = new Map<string, unknown>([
    ["/game-content/v1/ko-KR/candidates/catalog.json", fixture.catalog],
    [
      "/game-content/v1/ko-KR/candidates/generation-report.json",
      fixture.report,
    ],
  ]);
  return (async (input: RequestInfo | URL) => {
    const value = documents.get(String(input));
    return value == null
      ? ({ ok: false, status: 404, json: async () => null } as Response)
      : ({ ok: true, status: 200, json: async () => clone(value) } as Response);
  }) as typeof fetch;
}

function catalogHash(fixture: Fixture): string {
  return calculateLaunchReviewCatalogHash(fixture.catalog);
}

beforeEach(() => {
  catalogMocks.validate.mockReset();
  catalogMocks.validate.mockImplementation((value: unknown) => {
    const fixture = activeFixture;
    return value != null && fixture != null
      ? { pass: true, catalog: fixture.validatedCatalog, issues: [] }
      : { pass: false, catalog: null, issues: [] };
  });
});

let activeFixture: Fixture | null = null;

describe("full launch review candidate loader", () => {
  test("report 순서와 무관하게 catalog 순서의 10판 page를 반환한다", async () => {
    const fixture = createFixture();
    activeFixture = fixture;
    const result = await loadLaunchReviewContent({
      catalogHash: catalogHash(fixture),
      selection: { kind: "page", page: 3 },
      fetch: createFetch(fixture),
    });

    expect(result).toMatchObject({
      generatorCommit: GENERATOR_COMMIT,
      candidate: true,
      activationApproved: false,
      selection: { kind: "page", page: 3 },
      totalGeneratedBoardCount: 90,
    });
    expect(result.items.map(({ content }) => content.puzzleId)).toEqual(
      fixture.generatedBoards
        .slice(20, 30)
        .map(({ content }) => content.puzzleId),
    );
    expect(result.items.every(({ cardIds }) => cardIds.length === 0)).toBe(
      true,
    );
  });

  test("9번째 page와 단일 puzzleId를 선택한다", async () => {
    const fixture = createFixture();
    activeFixture = fixture;
    const hash = catalogHash(fixture);
    const page = await loadLaunchReviewContent({
      catalogHash: hash,
      selection: { kind: "page", page: 9 },
      fetch: createFetch(fixture),
    });
    expect(page.items).toHaveLength(10);
    expect(page.items[0].content.puzzleId).toBe(
      fixture.generatedBoards[80].content.puzzleId,
    );

    const puzzleId = fixture.generatedBoards[73].content.puzzleId;
    const single = await loadLaunchReviewContent({
      catalogHash: hash,
      selection: { kind: "puzzle", puzzleId },
      fetch: createFetch(fixture),
    });
    expect(single.items.map(({ content }) => content.puzzleId)).toEqual([
      puzzleId,
    ]);
  });

  test("query hash와 selector를 fetch 전에 fail-closed한다", async () => {
    const fixture = createFixture();
    activeFixture = fixture;
    const fetch = vi.fn(createFetch(fixture));
    for (const options of [
      { catalogHash: "A".repeat(64), selection: { kind: "page", page: 1 } },
      { catalogHash: "a".repeat(63), selection: { kind: "page", page: 1 } },
      { catalogHash: "a".repeat(64), selection: { kind: "page", page: 0 } },
      {
        catalogHash: "a".repeat(64),
        selection: { kind: "puzzle", puzzleId: "../catalog" },
      },
    ] as const) {
      await expect(
        loadLaunchReviewContent({ ...options, fetch }),
      ).rejects.toThrow(/Launch review candidates rejected/);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  test("catalog hash, candidate flag, core validator 실패를 거부한다", async () => {
    const fixture = createFixture();
    activeFixture = fixture;
    await expect(
      loadLaunchReviewContent({
        catalogHash: "d".repeat(64),
        selection: { kind: "page", page: 1 },
        fetch: createFetch(fixture),
      }),
    ).rejects.toThrow(/canonical hash/);

    fixture.catalog.activationApproved = true;
    await expect(
      loadLaunchReviewContent({
        catalogHash: catalogHash(fixture),
        selection: { kind: "page", page: 1 },
        fetch: createFetch(fixture),
      }),
    ).rejects.toThrow(/inactive candidate/);

    fixture.catalog.activationApproved = false;
    catalogMocks.validate.mockReturnValueOnce({
      pass: false,
      catalog: null,
      issues: [{ code: "duplicate_id", path: "boards" }],
    });
    await expect(
      loadLaunchReviewContent({
        catalogHash: catalogHash(fixture),
        selection: { kind: "page", page: 1 },
        fetch: createFetch(fixture),
      }),
    ).rejects.toThrow(/catalog structure is invalid/);
  });

  test("report 누락, 중복, identity drift를 거부한다", async () => {
    const fixture = createFixture();
    activeFixture = fixture;
    const hash = catalogHash(fixture);
    fixture.report.boards[0].contentChecksum = `sha256:${"f".repeat(64)}`;
    await expect(
      loadLaunchReviewContent({
        catalogHash: hash,
        selection: { kind: "page", page: 1 },
        fetch: createFetch(fixture),
      }),
    ).rejects.toThrow(/does not exactly join/);

    const duplicateFixture = createFixture();
    activeFixture = duplicateFixture;
    duplicateFixture.report.boards[1].puzzleId =
      duplicateFixture.report.boards[0].puzzleId;
    await expect(
      loadLaunchReviewContent({
        catalogHash: catalogHash(duplicateFixture),
        selection: { kind: "page", page: 1 },
        fetch: createFetch(duplicateFixture),
      }),
    ).rejects.toThrow(/unsafe or duplicated/);
  });
});
