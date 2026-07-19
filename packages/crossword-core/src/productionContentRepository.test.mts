import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  calculateGameContentChecksum,
  type GameContentV1,
} from "./gameContent.ts";
import {
  BUNDLED_FIRST_RUN_CONTENT_IDENTITIES,
  DAILY_WEEKDAYS,
  KO_KR_LAUNCH_CONTENT_CONTRACT,
  type LaunchBoardRouteV1,
} from "./launchContentCatalog.ts";
import {
  GAME_CONTENT_CURRENT_SCHEMA_VERSION,
  GAME_CONTENT_PACK_INDEX_SCHEMA_VERSION,
  KO_KR_GAME_CONTENT_CURRENT_PATH,
  KO_KR_GAME_CONTENT_LICENSE_MANIFEST_PATH,
  ProductionContentError,
  calculateCanonicalArtifactChecksum,
  createProductionGameContentRepository,
  validateGameContentCurrentPointerV1,
  type GameContentArtifactFetchPort,
} from "./productionContentRepository.ts";
import { loadBundledFirstRunGameContents } from "../../../src/game-shell/onboardingGameContent.ts";

type JsonRecord = Record<string, unknown>;

function regularContent(input: {
  puzzleId: string;
  difficulty: GameContentV1["difficulty"];
  chapterId: string;
  themeId: string;
  slotId: string;
}): GameContentV1 {
  const size = { easy: 7, normal: 8, hard: 9 }[input.difficulty];
  const grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ""),
  );
  grid[0][0] = "가";
  grid[0][1] = "나";
  grid[2][0] = "다";
  grid[2][1] = "라";
  const unsealed: GameContentV1 = {
    schemaVersion: "game-content/1",
    contentLocale: "ko-KR",
    releaseTimeZone: "Asia/Seoul",
    languageProfile: { id: "ko-KR", version: 1 },
    puzzleId: input.puzzleId,
    packId: `pack-${input.puzzleId}`,
    slotId: input.slotId,
    grid,
    entries: [
      {
        id: "a1",
        answer: "가나",
        answerCells: ["가", "나"],
        clue: "첫 번째 생활 낱말",
        clueSource: "manual",
        needsManualClue: false,
        shortExplanation: "첫 번째 설명",
        source: "fixture",
        sourceEntryId: `${input.puzzleId}:a1`,
        sourceUrl: "https://example.com/a1",
        licenseId: "LicenseRef-Fixture",
        domainTags: ["fixture"],
        direction: "across",
        row: 0,
        col: 0,
        generatedBy: "placed",
      },
      {
        id: "a2",
        answer: "다라",
        answerCells: ["다", "라"],
        clue: "두 번째 생활 낱말",
        clueSource: "manual",
        needsManualClue: false,
        shortExplanation: "두 번째 설명",
        source: "fixture",
        sourceEntryId: `${input.puzzleId}:a2`,
        sourceUrl: "https://example.com/a2",
        licenseId: "LicenseRef-Fixture",
        domainTags: ["fixture"],
        direction: "across",
        row: 2,
        col: 0,
        generatedBy: "placed",
      },
    ],
    difficulty: input.difficulty,
    themeId: input.themeId,
    chapterId: input.chapterId,
    worldTriggerSet: [],
    generatorCommit: "fixture-generator",
    generatorConfigHash: `config-${input.puzzleId}`,
    contentChecksum: "sha256:unsealed",
    licenseManifestId:
      BUNDLED_FIRST_RUN_CONTENT_IDENTITIES[0].licenseManifestId,
    licenseManifestChecksum:
      BUNDLED_FIRST_RUN_CONTENT_IDENTITIES[0].licenseManifestChecksum,
    review: {
      reviewerId: "fixture-reviewer",
      reviewedAt: "2026-07-19T00:00:00.000Z",
      manualCoverage: 1,
    },
    minClientVersion: "0.1.0",
  };
  return {
    ...unsealed,
    contentChecksum: calculateGameContentChecksum(unsealed),
  };
}

function buildCatalogBoards() {
  const boards: Array<{ route: LaunchBoardRouteV1; content: GameContentV1 }> =
    loadBundledFirstRunGameContents().map((content) => ({
      route: { kind: "first-run" },
      content,
    }));
  const chapterIds = ["chapter-01", "chapter-02", "chapter-03"];
  for (let index = 0; index < 30; index += 1) {
    const difficulty = (["easy", "normal", "hard"] as const)[index % 3];
    boards.push({
      route: { kind: "chapter" },
      content: regularContent({
        puzzleId: `chapter-${index + 1}`,
        difficulty,
        chapterId: chapterIds[index < 5 ? 0 : index < 12 ? 1 : 2],
        themeId: `chapter-theme-${(index % 3) + 1}`,
        slotId: `chapter-slot-${index + 1}`,
      }),
    });
  }
  for (let week = 0; week < 6; week += 1) {
    for (const [day, weekday] of DAILY_WEEKDAYS.entries()) {
      const date = new Date(Date.UTC(2026, 6, 20 + week * 7 + day))
        .toISOString()
        .slice(0, 10);
      boards.push({
        route: { kind: "daily", weekday },
        content: regularContent({
          puzzleId: `daily-${week + 1}-${day + 1}`,
          difficulty: weekday === "friday" ? "hard" : "normal",
          chapterId: chapterIds[week % 3],
          themeId: `daily-theme-${week + 1}`,
          slotId: `${date}-h00`,
        }),
      });
    }
  }
  for (let index = 0; index < 12; index += 1) {
    boards.push({
      route: { kind: "bonus" },
      content: regularContent({
        puzzleId: `bonus-${index + 1}`,
        difficulty: "normal",
        chapterId: chapterIds[index % 3],
        themeId: "bonus-theme",
        slotId: `bonus-${index + 1}`,
      }),
    });
  }
  for (let index = 0; index < 6; index += 1) {
    boards.push({
      route: { kind: "weekly-challenge" },
      content: regularContent({
        puzzleId: `weekly-${index + 1}`,
        difficulty: "hard",
        chapterId: chapterIds[index % 3],
        themeId: "weekly-theme",
        slotId: `weekly-${index + 1}`,
      }),
    });
  }
  assert.equal(boards.length, KO_KR_LAUNCH_CONTENT_CONTRACT.totalBoardCount);
  return boards;
}

function packPath(content: GameContentV1) {
  return `/game-content/v1/ko-KR/packs/${content.packId}/${content.contentChecksum}.json`;
}

function createPinnedLicenseManifest() {
  const manifest = JSON.parse(
    readFileSync(
      new URL(
        "../../../data/game-content/v1/ko-KR/license-manifest.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as JsonRecord;
  const evidence = manifest.reviewEvidence as JsonRecord;
  evidence.decisionFileSha256 = [
    "sha256:7bbd77cb72870e9abae0ead4267d5f695cb4626c7dc9fe5ed44e47f88097d08c",
    "sha256:f2236283e85bc1b6d0e24996f2f4a2ed0e2a770ac0dbc654264da26ed82c5fe6",
    "sha256:a8dd1d2f2fc4e83bd8ee86e0728546aba0590b143c70c27af7f5ade3a7ca7a88",
  ];
  evidence.baseWordbankFileSha256 =
    "sha256:c08638a2704599509299ec929d5d85d4b3489c01e3a710c7fff400e0b668ffdd";
  evidence.baseLedgerFileSha256 =
    "sha256:3bb61a4652491a64362368479f4840ccbb113d89ac9a29872b8e8fd0761af813";
  evidence.themeDecisionFileSha256 = [
    "sha256:577e197cbac67bd52fe56db0f56cd9d3387ddd8cf966f50a602cb0d05051813d",
    "sha256:c16f1378fb6a6fb5e4c6c23da68520aed0401a1cb4f0171a6f5d3b16940a10eb",
    "sha256:bf02338765a7a42dba979cc5653f119c8fcb2e4b9436f522c5aaffcc1010626f",
  ];
  evidence.wordbankFileSha256 =
    "sha256:568c464dcb84e1f0a0300742173784b70b5c4daf990bc09c7b167748522f4886";
  evidence.ledgerFileSha256 =
    "sha256:28cb95260340e4cbe0f439e19945abcda0d43cf7b92d896939dc9e6ceb0f4053";
  assert.equal(
    calculateCanonicalArtifactChecksum(manifest),
    BUNDLED_FIRST_RUN_CONTENT_IDENTITIES[0].licenseManifestChecksum,
  );
  return manifest;
}

function createFixture() {
  const boards = buildCatalogBoards();
  const catalog = {
    schemaVersion: "launch-content-catalog/1",
    artifactStatus: "approved",
    activationApproved: true,
    generatedAt: "2026-07-19T00:00:00.000Z",
    catalogId: "ko-kr-release-001",
    contentLocale: "ko-KR",
    releaseTimeZone: "Asia/Seoul",
    languageProfile: { id: "ko-KR", version: 1 },
    boards: boards.map((board) => ({
      ...board,
      artifactPath: packPath(board.content),
    })),
  };
  const chapterBoards = boards.filter(
    (board) => board.route.kind === "chapter",
  );
  const nodeIds = chapterBoards.map((_, index) => `node-${index + 1}`);
  const worldMap = {
    schemaVersion: "world-map-graph/1",
    artifactStatus: "approved",
    activationApproved: true,
    graphId: "world-map-001",
    catalogId: catalog.catalogId,
    contentLocale: "ko-KR",
    nodes: chapterBoards.map((board, index) => ({
      nodeId: nodeIds[index],
      puzzleId: board.content.puzzleId,
      chapterId: board.content.chapterId,
      unlockMode: index === 5 ? "any" : "all",
      unlockAfterNodeIds:
        index === 0
          ? []
          : index === 1
            ? [nodeIds[0]]
            : index === 2
              ? [nodeIds[1]]
              : index === 3 || index === 4
                ? [nodeIds[2]]
                : index === 5
                  ? [nodeIds[3], nodeIds[4]]
                  : [nodeIds[index - 1]],
    })),
    branchPoints: [
      {
        branchPointId: "branch-001",
        chapterId: chapterBoards[0].content.chapterId,
        linearNodeIds: [nodeIds[0], nodeIds[1], nodeIds[2]],
        branchEntryNodeIds: [nodeIds[3], nodeIds[4]],
      },
    ],
  };
  const packIndex = {
    schemaVersion: GAME_CONTENT_PACK_INDEX_SCHEMA_VERSION,
    artifactStatus: "approved",
    activationApproved: true,
    contentLocale: "ko-KR",
    catalogId: catalog.catalogId,
    packs: boards.map(({ content }) => ({
      puzzleId: content.puzzleId,
      packId: content.packId,
      contentChecksum: content.contentChecksum,
      path: packPath(content),
    })),
  };
  const license = createPinnedLicenseManifest();
  const releaseRoot = "/game-content/v1/ko-KR/releases/release-001";
  const references = {
    catalog: `${releaseRoot}/catalog.json`,
    worldMap: `${releaseRoot}/world-map.json`,
    packIndex: `${releaseRoot}/pack-index.json`,
    license: KO_KR_GAME_CONTENT_LICENSE_MANIFEST_PATH,
  };
  const pointer = {
    schemaVersion: GAME_CONTENT_CURRENT_SCHEMA_VERSION,
    artifactStatus: "approved",
    activationApproved: true,
    contentLocale: "ko-KR",
    catalog: {
      path: references.catalog,
      sha256: calculateCanonicalArtifactChecksum(catalog),
    },
    worldMap: {
      path: references.worldMap,
      sha256: calculateCanonicalArtifactChecksum(worldMap),
    },
    packIndex: {
      path: references.packIndex,
      sha256: calculateCanonicalArtifactChecksum(packIndex),
    },
    license: {
      path: references.license,
      sha256: calculateCanonicalArtifactChecksum(license),
    },
  };
  const documents = new Map<string, unknown>([
    [KO_KR_GAME_CONTENT_CURRENT_PATH, pointer],
    [references.catalog, catalog],
    [references.worldMap, worldMap],
    [references.packIndex, packIndex],
    [references.license, license],
    ...boards.map(({ content }) => [packPath(content), content] as const),
  ]);
  return {
    boards,
    catalog,
    worldMap,
    packIndex,
    license,
    pointer,
    references,
    documents,
  };
}

function createPort(documents: Map<string, unknown>, calls: string[]) {
  return {
    async fetch(path: string) {
      calls.push(path);
      if (!documents.has(path)) throw new Error("not found");
      const value = documents.get(path);
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  } satisfies GameContentArtifactFetchPort;
}

async function expectCode(
  promise: Promise<unknown>,
  code: ProductionContentError["code"],
) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ProductionContentError);
    assert.equal(error.code, code);
    return true;
  });
}

describe("approved production content repository", () => {
  test("승인 metadata 4종 뒤 요청한 pack 하나만 지연 로딩한다", async () => {
    const fixture = createFixture();
    const calls: string[] = [];
    const repository = createProductionGameContentRepository(
      createPort(fixture.documents, calls),
    );
    const metadata = await repository.loadMetadata();
    assert.equal(metadata.catalog.boards.length, 93);
    assert.equal(calls.length, 5);
    assert.equal(
      calls.some((path) => path.includes("/packs/")),
      false,
    );

    const target = fixture.boards[42].content;
    const loaded = await repository.loadPack(metadata, target.puzzleId);
    assert.deepEqual(loaded, target);
    assert.deepEqual(calls.slice(5), [packPath(target)]);

    const beforeUnknown = calls.length;
    assert.equal(await repository.loadPack(metadata, "unknown"), null);
    assert.equal(calls.length, beforeUnknown);
  });

  test("pointer는 exact key, approved, ko-KR, 안전한 고유 경로만 받는다", () => {
    const { pointer } = createFixture();
    assert.deepEqual(validateGameContentCurrentPointerV1(pointer), pointer);
    const mutations: Array<(value: JsonRecord) => void> = [
      (value) => {
        value.artifactStatus = "candidate";
      },
      (value) => {
        value.activationApproved = false;
      },
      (value) => {
        value.contentLocale = "en-US";
      },
      (value) => {
        value.extra = true;
      },
      (value) => {
        (value.catalog as JsonRecord).extra = true;
      },
      (value) => {
        (value.catalog as JsonRecord).path =
          "/game-content/v1/ko-KR/candidates/catalog.json";
      },
      (value) => {
        (value.catalog as JsonRecord).path =
          "/game-content/v1/ko-KR/releases/../catalog.json";
      },
      (value) => {
        (value.catalog as JsonRecord).path =
          "/game-content/v1/ko-KR/releases/%2e%2e/catalog.json";
      },
      (value) => {
        (value.catalog as JsonRecord).sha256 = "bad";
      },
      (value) => {
        (value.license as JsonRecord).path =
          "/game-content/v1/ko-KR/releases/release-001/license.json";
      },
      (value) => {
        (value.catalog as JsonRecord).path = (
          value.worldMap as JsonRecord
        ).path;
      },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(pointer) as unknown as JsonRecord;
      mutate(changed);
      assert.throws(
        () => validateGameContentCurrentPointerV1(changed),
        ProductionContentError,
      );
    }
  });

  test("원문 JSON의 중복 key와 escaped 동등 key를 JSON.parse 전에 차단한다", async () => {
    const fixture = createFixture();
    for (const duplicate of [
      `{"schemaVersion":"game-content-current/1","schemaVersion":"game-content-current/1"}`,
      `{"schemaVersion":"game-content-current/1","schema\\u0056ersion":"game-content-current/1"}`,
    ]) {
      const documents = new Map(fixture.documents);
      documents.set(KO_KR_GAME_CONTENT_CURRENT_PATH, duplicate);
      await expectCode(
        createProductionGameContentRepository(
          createPort(documents, []),
        ).loadMetadata(),
        "duplicate_json_key",
      );
    }
  });

  test("canonical checksum 불일치를 문서 구조 검증보다 먼저 차단한다", async () => {
    const fixture = createFixture();
    (fixture.catalog as JsonRecord).generatedAt = "tampered";
    await expectCode(
      createProductionGameContentRepository(
        createPort(fixture.documents, []),
      ).loadMetadata(),
      "checksum_mismatch",
    );
  });

  test("catalog, world-map, pack-index의 candidate 상태를 거부한다", async () => {
    for (const key of ["catalog", "worldMap", "packIndex"] as const) {
      const fixture = createFixture();
      const document = fixture[key] as JsonRecord;
      document.artifactStatus = "candidate";
      document.activationApproved = false;
      const reference = (fixture.pointer as JsonRecord)[key] as JsonRecord;
      reference.sha256 = calculateCanonicalArtifactChecksum(document);
      await expectCode(
        createProductionGameContentRepository(
          createPort(fixture.documents, []),
        ).loadMetadata(),
        "invalid_artifact",
      );
    }
  });

  test("license manifest는 원 identity인 candidate/false만 받고 approved 변환을 거부한다", async () => {
    const fixture = createFixture();
    (fixture.license as JsonRecord).artifactStatus = "approved";
    (fixture.license as JsonRecord).activationApproved = true;
    (fixture.pointer.license as JsonRecord).sha256 =
      calculateCanonicalArtifactChecksum(fixture.license);
    await expectCode(
      createProductionGameContentRepository(
        createPort(fixture.documents, []),
      ).loadMetadata(),
      "invalid_artifact",
    );
  });

  test("license provenance 내부는 최종 validator에 맡기되 top-level extra key는 거부한다", async () => {
    const fixture = createFixture();
    (fixture.license as JsonRecord).unexpected = true;
    (fixture.pointer.license as JsonRecord).sha256 =
      calculateCanonicalArtifactChecksum(fixture.license);
    await expectCode(
      createProductionGameContentRepository(
        createPort(fixture.documents, []),
      ).loadMetadata(),
      "invalid_artifact",
    );
  });

  test("catalog board의 license checksum/id가 pin된 manifest와 다르면 재봉인 pack도 거부한다", async () => {
    const fixture = createFixture();
    const boardIndex = 4;
    const rawBoard = fixture.catalog.boards[boardIndex];
    const changed = structuredClone(rawBoard.content);
    changed.licenseManifestChecksum = `sha256:${"f".repeat(64)}`;
    changed.contentChecksum = calculateGameContentChecksum(changed);
    rawBoard.content = changed;
    rawBoard.artifactPath = packPath(changed);
    fixture.packIndex.packs[boardIndex] = {
      puzzleId: changed.puzzleId,
      packId: changed.packId,
      contentChecksum: changed.contentChecksum,
      path: packPath(changed),
    };
    (fixture.pointer.catalog as JsonRecord).sha256 =
      calculateCanonicalArtifactChecksum(fixture.catalog);
    (fixture.pointer.packIndex as JsonRecord).sha256 =
      calculateCanonicalArtifactChecksum(fixture.packIndex);
    await expectCode(
      createProductionGameContentRepository(
        createPort(fixture.documents, []),
      ).loadMetadata(),
      "invalid_artifact",
    );
  });

  test("candidate pack-index schema, extra key, catalog join drift를 모두 거부한다", async () => {
    const mutations: Array<
      (fixture: ReturnType<typeof createFixture>) => void
    > = [
      (fixture) => {
        (fixture.packIndex as JsonRecord).schemaVersion =
          "game-content-candidate-pack-index/1";
      },
      (fixture) => {
        (fixture.packIndex as JsonRecord).generatedAt = "unexpected";
      },
      (fixture) => {
        ((fixture.packIndex.packs as unknown[])[4] as JsonRecord).puzzleId =
          "drifted";
      },
      (fixture) => {
        ((fixture.packIndex.packs as unknown[])[4] as JsonRecord).path =
          "/game-content/v1/ko-KR/packs/../escape.json";
      },
    ];
    for (const mutate of mutations) {
      const fixture = createFixture();
      mutate(fixture);
      (fixture.pointer.packIndex as JsonRecord).sha256 =
        calculateCanonicalArtifactChecksum(fixture.packIndex);
      await expectCode(
        createProductionGameContentRepository(
          createPort(fixture.documents, []),
        ).loadMetadata(),
        (fixture.packIndex as JsonRecord).packs == null
          ? "invalid_artifact"
          : (
                (
                  (fixture.packIndex.packs as unknown[])[4] as
                    | JsonRecord
                    | undefined
                )?.path as string | undefined
              )?.includes("..")
            ? "invalid_path"
            : "invalid_artifact",
      );
    }
  });

  test("단일 pack의 locale, checksum, catalog exact join drift를 차단한다", async () => {
    for (const field of [
      "contentLocale",
      "contentChecksum",
      "themeId",
    ] as const) {
      const fixture = createFixture();
      const repository = createProductionGameContentRepository(
        createPort(fixture.documents, []),
      );
      const metadata = await repository.loadMetadata();
      const target = fixture.boards[20].content;
      const changed = structuredClone(target);
      if (field === "contentLocale") changed.contentLocale = "en-US";
      if (field === "contentChecksum")
        changed.contentChecksum = `sha256:${"f".repeat(64)}`;
      if (field === "themeId") {
        changed.themeId = "drifted";
        changed.contentChecksum = calculateGameContentChecksum(changed);
      }
      fixture.documents.set(packPath(target), changed);
      await expectCode(
        repository.loadPack(metadata, target.puzzleId),
        "invalid_artifact",
      );
    }
  });

  test("fetch port의 UTF-8 byte payload도 같은 계약으로 읽는다", async () => {
    const fixture = createFixture();
    const calls: string[] = [];
    const port: GameContentArtifactFetchPort = {
      async fetch(path) {
        calls.push(path);
        const value = fixture.documents.get(path);
        if (value == null) throw new Error("missing");
        return new TextEncoder().encode(JSON.stringify(value));
      },
    };
    const metadata =
      await createProductionGameContentRepository(port).loadMetadata();
    assert.equal(metadata.pointer.contentLocale, "ko-KR");
    assert.equal(calls.length, 5);
  });
});
