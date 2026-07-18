import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  BUNDLED_FIRST_RUN_CONTENT_IDENTITIES,
  BUNDLED_ONBOARDING_CONTENT_IDENTITY,
  DAILY_WEEKDAYS,
  KO_KR_LAUNCH_CONTENT_CONTRACT,
  LAUNCH_CONTENT_CATALOG_SCHEMA_VERSION,
  WORLD_MAP_GRAPH_SCHEMA_VERSION,
  projectLaunchProgression,
  validateKoKrLaunchContentCatalogStructureV1,
  validateWorldMapGraphV1,
  type KoKrLaunchContentCatalogV1,
  type LaunchBoardRouteV1,
  type LaunchCatalogBoardV1,
  type WorldMapGraphV1,
} from "./launchContentCatalog.ts";
import {
  GAME_CONTENT_SCHEMA_VERSION,
  type GameContentEntryV1,
  type GameContentV1,
} from "./gameContent.ts";

const FIXTURE_CHAPTER_IDS = [
  "fixture-chapter-01",
  "fixture-chapter-02",
  "fixture-chapter-03",
] as const;

function fixtureAttribution(sourceEntryId: string, clue: string) {
  return {
    shortExplanation: clue,
    source: "fixture source",
    sourceEntryId,
    sourceUrl: "https://example.com/fixture-source",
    licenseId: "LicenseRef-Fixture",
    domainTags: ["fixture"],
  };
}

function onboardingGridAndEntries(): Pick<GameContentV1, "grid" | "entries"> {
  const entries: GameContentEntryV1[] = [
    {
      id: "a1",
      answer: "토끼",
      answerCells: ["토", "끼"],
      clue: "귀가 길고 깡충깡충 뛰는 동물",
      ...fixtureAttribution("fixture-onboarding-a1", "토끼 설명"),
      clueSource: "manual",
      direction: "across",
      row: 0,
      col: 0,
      generatedBy: "placed",
      needsManualClue: false,
    },
    {
      id: "a2",
      answer: "토요일",
      answerCells: ["토", "요", "일"],
      clue: "한 주의 여섯째 날로, 주말이 시작되는 날",
      ...fixtureAttribution("fixture-onboarding-a2", "토요일 설명"),
      clueSource: "manual",
      direction: "across",
      row: 2,
      col: 0,
      generatedBy: "placed",
      needsManualClue: false,
    },
    {
      id: "a3",
      answer: "기차",
      answerCells: ["기", "차"],
      clue: "철길 위를 달리는 긴 탈것",
      ...fixtureAttribution("fixture-onboarding-a3", "기차 설명"),
      clueSource: "manual",
      direction: "across",
      row: 3,
      col: 2,
      generatedBy: "placed",
      needsManualClue: false,
    },
    {
      id: "d1",
      answer: "토마토",
      answerCells: ["토", "마", "토"],
      clue: "빨갛고 둥근, 샐러드에 넣는 채소",
      ...fixtureAttribution("fixture-onboarding-d1", "토마토 설명"),
      clueSource: "manual",
      direction: "down",
      row: 0,
      col: 0,
      generatedBy: "placed",
      needsManualClue: false,
    },
    {
      id: "d2",
      answer: "일기",
      answerCells: ["일", "기"],
      clue: "하루 동안 있었던 일을 적는 글",
      ...fixtureAttribution("fixture-onboarding-d2", "일기 설명"),
      clueSource: "manual",
      direction: "down",
      row: 2,
      col: 2,
      generatedBy: "placed",
      needsManualClue: false,
    },
    {
      id: "d3",
      answer: "차표",
      answerCells: ["차", "표"],
      clue: "대중교통을 탈 때 돈을 내고 받는 표",
      ...fixtureAttribution("fixture-onboarding-d3", "차표 설명"),
      clueSource: "manual",
      direction: "down",
      row: 3,
      col: 3,
      generatedBy: "placed",
      needsManualClue: false,
    },
  ];
  return {
    grid: [
      ["토", "끼", "", "", ""],
      ["마", "", "", "", ""],
      ["토", "요", "일", "", ""],
      ["", "", "기", "차", ""],
      ["", "", "", "표", ""],
    ],
    entries,
  };
}

function regularGridAndEntries(
  size: number,
): Pick<GameContentV1, "grid" | "entries"> {
  const grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ""),
  );
  grid[0][0] = "가";
  grid[0][1] = "나";
  grid[2][0] = "다";
  grid[2][1] = "라";
  return {
    grid,
    entries: [
      {
        id: "a1",
        answer: "가나",
        answerCells: ["가", "나"],
        clue: "첫 번째 fixture 단서",
        ...fixtureAttribution("fixture-regular-a1", "첫 번째 설명"),
        clueSource: "manual",
        direction: "across",
        row: 0,
        col: 0,
        generatedBy: "placed",
        needsManualClue: false,
      },
      {
        id: "a2",
        answer: "다라",
        answerCells: ["다", "라"],
        clue: "두 번째 fixture 단서",
        ...fixtureAttribution("fixture-regular-a2", "두 번째 설명"),
        clueSource: "manual",
        direction: "across",
        row: 2,
        col: 0,
        generatedBy: "placed",
        needsManualClue: false,
      },
    ],
  };
}

function createContent(input: {
  puzzleId: string;
  route: LaunchBoardRouteV1;
  difficulty: GameContentV1["difficulty"];
  chapterId: string;
  themeId: string;
  slotId?: string;
  onboarding?: boolean;
}): GameContentV1 {
  const sizeByDifficulty = { easy: 7, normal: 8, hard: 9 } as const;
  const boardData = input.onboarding
    ? onboardingGridAndEntries()
    : regularGridAndEntries(sizeByDifficulty[input.difficulty]);
  const identity = input.onboarding
    ? BUNDLED_ONBOARDING_CONTENT_IDENTITY
    : {
        packId: `fixture-pack:${input.puzzleId}`,
        slotId: input.slotId ?? `fixture-slot:${input.puzzleId}`,
        contentChecksum: `fixture-checksum:${input.puzzleId}`,
        licenseManifestId: `fixture-license:${input.puzzleId}`,
        licenseManifestChecksum:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      };

  return {
    schemaVersion: GAME_CONTENT_SCHEMA_VERSION,
    contentLocale: KO_KR_LAUNCH_CONTENT_CONTRACT.contentLocale,
    releaseTimeZone: KO_KR_LAUNCH_CONTENT_CONTRACT.releaseTimeZone,
    languageProfile: { ...KO_KR_LAUNCH_CONTENT_CONTRACT.languageProfile },
    puzzleId: input.puzzleId,
    packId: identity.packId,
    slotId: identity.slotId,
    ...boardData,
    difficulty: input.difficulty,
    themeId: input.themeId,
    chapterId: input.chapterId,
    worldTriggerSet: [],
    generatorCommit: "fixture-generator-commit",
    generatorConfigHash: `fixture-config:${input.puzzleId}`,
    contentChecksum: identity.contentChecksum,
    licenseManifestId: identity.licenseManifestId,
    licenseManifestChecksum: identity.licenseManifestChecksum,
    review: {
      reviewerId: "fixture-reviewer",
      reviewedAt: "2026-07-17T00:00:00.000Z",
      manualCoverage: 1,
    },
    minClientVersion: "0.1.0",
  };
}

function createLaunchCatalogCandidate(): KoKrLaunchContentCatalogV1 {
  const boards: LaunchCatalogBoardV1[] = [];
  for (const identity of BUNDLED_FIRST_RUN_CONTENT_IDENTITIES) {
    boards.push({
      route: { kind: "first-run" },
      content: {
        ...createContent({
          puzzleId: identity.puzzleId,
          route: { kind: "first-run" },
          difficulty: "easy",
          chapterId: identity.chapterId,
          themeId: identity.themeId,
          onboarding: true,
        }),
        ...identity,
      },
    });
  }

  for (let index = 0; index < 30; index += 1) {
    const puzzleId = `fixture-chapter-${String(index + 1).padStart(2, "0")}`;
    const difficulty = (["easy", "normal", "hard"] as const)[index % 3];
    const chapterIndex = index < 5 ? 0 : index < 12 ? 1 : 2;
    boards.push({
      route: { kind: "chapter" },
      content: createContent({
        puzzleId,
        route: { kind: "chapter" },
        difficulty,
        chapterId: FIXTURE_CHAPTER_IDS[chapterIndex],
        themeId: `fixture-chapter-theme-${chapterIndex + 1}`,
      }),
    });
  }

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    for (const [dayIndex, weekday] of DAILY_WEEKDAYS.entries()) {
      const puzzleId = `fixture-daily-${weekIndex + 1}-${dayIndex + 1}`;
      const difficulty = weekday === "friday" ? "hard" : "normal";
      const localDate = new Date(
        Date.UTC(2026, 6, 20 + weekIndex * 7 + dayIndex),
      )
        .toISOString()
        .slice(0, 10);
      boards.push({
        route: {
          kind: "daily",
          weekday,
        },
        content: createContent({
          puzzleId,
          route: {
            kind: "daily",
            weekday,
          },
          difficulty,
          chapterId: FIXTURE_CHAPTER_IDS[weekIndex % 3],
          themeId: `fixture-daily-theme-${weekIndex + 1}`,
          slotId: `${localDate}-h00`,
        }),
      });
    }
  }

  for (let index = 0; index < 12; index += 1) {
    const puzzleId = `fixture-bonus-${String(index + 1).padStart(2, "0")}`;
    boards.push({
      route: { kind: "bonus" },
      content: createContent({
        puzzleId,
        route: { kind: "bonus" },
        difficulty: "normal",
        chapterId: FIXTURE_CHAPTER_IDS[index % 3],
        themeId: "fixture-bonus-theme",
      }),
    });
  }

  for (let index = 0; index < 6; index += 1) {
    const puzzleId = `fixture-weekly-${String(index + 1).padStart(2, "0")}`;
    boards.push({
      route: { kind: "weekly-challenge" },
      content: createContent({
        puzzleId,
        route: { kind: "weekly-challenge" },
        difficulty: "hard",
        chapterId: FIXTURE_CHAPTER_IDS[index % 3],
        themeId: "fixture-weekly-theme",
      }),
    });
  }

  return {
    schemaVersion: LAUNCH_CONTENT_CATALOG_SCHEMA_VERSION,
    catalogId: "fixture-ko-kr-launch-catalog",
    contentLocale: KO_KR_LAUNCH_CONTENT_CONTRACT.contentLocale,
    releaseTimeZone: KO_KR_LAUNCH_CONTENT_CONTRACT.releaseTimeZone,
    languageProfile: { ...KO_KR_LAUNCH_CONTENT_CONTRACT.languageProfile },
    boards,
  };
}

function verifyFixtureChecksum(content: GameContentV1): boolean {
  return (
    BUNDLED_FIRST_RUN_CONTENT_IDENTITIES.some(
      (identity) => identity.contentChecksum === content.contentChecksum,
    ) || content.contentChecksum === `fixture-checksum:${content.puzzleId}`
  );
}

function validateCatalog(
  value: unknown,
): ReturnType<typeof validateKoKrLaunchContentCatalogStructureV1> {
  return validateKoKrLaunchContentCatalogStructureV1(value, {
    verifyContentChecksum: verifyFixtureChecksum,
  });
}

function requireCatalog(): KoKrLaunchContentCatalogV1 {
  const result = validateCatalog(createLaunchCatalogCandidate());
  assert.equal(result.pass, true, JSON.stringify(result.issues, null, 2));
  assert.ok(result.catalog != null);
  return result.catalog;
}

function createWorldMapGraphCandidate(
  catalog: KoKrLaunchContentCatalogV1,
): WorldMapGraphV1 {
  const chapterBoards = catalog.boards.filter(
    (board) => board.route.kind === "chapter",
  );
  const nodeIds = chapterBoards.map(
    (_, index) => `fixture-node-${String(index + 1).padStart(2, "0")}`,
  );
  const nodes = chapterBoards.map((board, index) => {
    const unlockAfterNodeIds =
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
                : [nodeIds[index - 1]];
    return {
      nodeId: nodeIds[index],
      puzzleId: board.content.puzzleId,
      chapterId: board.content.chapterId,
      unlockMode: index === 5 ? ("any" as const) : ("all" as const),
      unlockAfterNodeIds,
    };
  });
  const branchPoints: WorldMapGraphV1["branchPoints"] = [
    {
      branchPointId: "fixture-branch-point-1",
      chapterId: chapterBoards[0].content.chapterId,
      linearNodeIds: [nodeIds[0], nodeIds[1], nodeIds[2]],
      branchEntryNodeIds: [nodeIds[3], nodeIds[4]],
    },
  ];

  return {
    schemaVersion: WORLD_MAP_GRAPH_SCHEMA_VERSION,
    graphId: "fixture-ko-kr-world-map",
    catalogId: catalog.catalogId,
    contentLocale: catalog.contentLocale,
    nodes,
    branchPoints,
  };
}

function requireGraph(catalog: KoKrLaunchContentCatalogV1): WorldMapGraphV1 {
  const result = validateWorldMapGraphV1(
    createWorldMapGraphCandidate(catalog),
    catalog,
  );
  assert.equal(result.pass, true, JSON.stringify(result.issues, null, 2));
  assert.ok(result.graph != null);
  return result.graph;
}

describe("ko-KR launch content catalog contract", () => {
  test("출시 재고 수치는 문서 계약을 그대로 고정한다", () => {
    assert.deepEqual(KO_KR_LAUNCH_CONTENT_CONTRACT.routeCounts, {
      "first-run": 3,
      chapter: 30,
      daily: 42,
      bonus: 12,
      "weekly-challenge": 6,
    });
    assert.equal(KO_KR_LAUNCH_CONTENT_CONTRACT.totalBoardCount, 93);
    assert.equal(KO_KR_LAUNCH_CONTENT_CONTRACT.dailyThemeCount, 6);
    assert.equal(KO_KR_LAUNCH_CONTENT_CONTRACT.dailyBoardsPerTheme, 7);
    assert.equal(KO_KR_LAUNCH_CONTENT_CONTRACT.recentDailyWindowDays, 7);
  });

  test("현재 번들 첫 보드 ID를 바꾸지 않고 93개 pack 구조를 검증한다", () => {
    const result = validateCatalog(createLaunchCatalogCandidate());
    assert.equal(result.pass, true, JSON.stringify(result.issues, null, 2));
    assert.equal(result.catalog?.boards.length, 93);
    assert.equal(
      result.catalog?.boards[0].content.puzzleId,
      "onboarding-easy-01",
    );

    const noChecksumVerifier = validateKoKrLaunchContentCatalogStructureV1(
      createLaunchCatalogCandidate(),
    );
    assert.equal(noChecksumVerifier.pass, false);
    assert.ok(
      noChecksumVerifier.issues.some(
        (issue) =>
          issue.code === "content_pack_invalid" &&
          issue.message.includes("checksum_verifier_missing"),
      ),
    );
  });

  test("묶음 수량과 번들 onboarding identity가 다르면 fail closed한다", () => {
    const missing = createLaunchCatalogCandidate();
    missing.boards.pop();
    const missingResult = validateCatalog(missing);
    assert.equal(missingResult.pass, false);
    assert.ok(
      missingResult.issues.some(
        (issue) => issue.code === "route_count_mismatch",
      ),
    );

    const changedOnboarding = createLaunchCatalogCandidate();
    changedOnboarding.boards[0].content.packId = "invented-pack-id";
    const onboardingResult = validateCatalog(changedOnboarding);
    assert.equal(onboardingResult.pass, false);
    assert.ok(
      onboardingResult.issues.some(
        (issue) => issue.code === "bundled_onboarding_mismatch",
      ),
    );
  });

  test("첫 실행 3개 route 순서와 board2·3 identity를 exact 검증한다", () => {
    const reordered = createLaunchCatalogCandidate();
    [reordered.boards[1], reordered.boards[2]] = [
      reordered.boards[2],
      reordered.boards[1],
    ];
    const reorderedResult = validateCatalog(reordered);
    assert.equal(reorderedResult.pass, false);
    assert.ok(
      reorderedResult.issues.some(
        (issue) =>
          issue.code === "bundled_onboarding_mismatch" &&
          issue.path === "boards[1]",
      ),
    );
    assert.ok(
      reorderedResult.issues.some(
        (issue) =>
          issue.code === "bundled_onboarding_mismatch" &&
          issue.path === "boards[2]",
      ),
    );

    const identityFields = [
      "puzzleId",
      "packId",
      "slotId",
      "themeId",
      "chapterId",
      "contentChecksum",
      "licenseManifestId",
      "licenseManifestChecksum",
    ] as const satisfies readonly (keyof GameContentV1)[];
    for (const boardIndex of [1, 2] as const) {
      for (const field of identityFields) {
        const changed = createLaunchCatalogCandidate();
        const content = changed.boards[boardIndex].content;
        if (field === "contentChecksum") {
          content.contentChecksum =
            BUNDLED_FIRST_RUN_CONTENT_IDENTITIES[
              boardIndex === 1 ? 2 : 1
            ].contentChecksum;
        } else if (field === "licenseManifestChecksum") {
          content.licenseManifestChecksum =
            "sha256:0000000000000000000000000000000000000000000000000000000000000000";
        } else {
          (content[field] as string) += "-tampered";
        }
        const result = validateCatalog(changed);
        assert.equal(
          result.pass,
          false,
          `board ${boardIndex + 1} ${field} tampering must fail`,
        );
        assert.ok(
          result.issues.some(
            (issue) =>
              issue.code === "bundled_onboarding_mismatch" &&
              issue.path === `boards[${boardIndex}]`,
          ),
          `board ${boardIndex + 1} ${field} must report bundled identity mismatch`,
        );
        assert.equal(
          result.issues.some((issue) => issue.code === "content_pack_invalid"),
          false,
          `board ${boardIndex + 1} ${field} must reach the exact identity gate`,
        );
      }
    }
  });

  test("catalog과 모든 pack의 locale, timezone, profile이 다르면 거부한다", () => {
    const candidate = createLaunchCatalogCandidate() as unknown as Record<
      string,
      unknown
    >;
    candidate.releaseTimeZone = "UTC";
    const result = validateCatalog(candidate);
    assert.equal(result.pass, false);
    assert.ok(
      result.issues.some((issue) => issue.code === "launch_contract_mismatch"),
    );

    const packMismatch = createLaunchCatalogCandidate();
    packMismatch.boards[10].content.contentLocale = "future-X";
    const packResult = validateCatalog(packMismatch);
    assert.equal(packResult.pass, false);
    assert.ok(
      packResult.issues.some((issue) => issue.code === "content_pack_invalid"),
    );
  });

  test("6개 주간 테마×7일과 금요일 hard 규칙을 강제한다", () => {
    const candidate = createLaunchCatalogCandidate();
    const friday = candidate.boards.find(
      (board) =>
        board.route.kind === "daily" && board.route.weekday === "friday",
    );
    assert.ok(friday != null);
    friday.content.difficulty = "normal";
    friday.content.grid = regularGridAndEntries(8).grid;
    friday.content.entries = regularGridAndEntries(8).entries;
    const result = validateCatalog(candidate);
    assert.equal(result.pass, false);
    assert.ok(
      result.issues.some((issue) => issue.code === "difficulty_mismatch"),
    );

    const duplicateTheme = createLaunchCatalogCandidate();
    const dailyWeekSix = duplicateTheme.boards.filter(
      (board) =>
        board.route.kind === "daily" &&
        board.content.themeId === "fixture-daily-theme-6",
    );
    for (const board of dailyWeekSix) {
      board.content.themeId = "fixture-daily-theme-1";
    }
    const themeResult = validateCatalog(duplicateTheme);
    assert.equal(themeResult.pass, false);
    assert.ok(
      themeResult.issues.some(
        (issue) => issue.code === "daily_schedule_mismatch",
      ),
    );

    const mislabeledSlot = createLaunchCatalogCandidate();
    const dailyMonday = mislabeledSlot.boards.find(
      (board) =>
        board.route.kind === "daily" && board.route.weekday === "monday",
    );
    assert.ok(dailyMonday != null);
    dailyMonday.content.slotId = "2026-07-21-h00";
    const slotResult = validateCatalog(mislabeledSlot);
    assert.equal(slotResult.pass, false);
    assert.ok(
      slotResult.issues.some(
        (issue) => issue.code === "daily_schedule_mismatch",
      ),
    );

    const wrongReleaseHour = createLaunchCatalogCandidate();
    const firstDaily = wrongReleaseHour.boards.find(
      (board) => board.route.kind === "daily",
    );
    assert.ok(firstDaily != null);
    firstDaily.content.slotId = firstDaily.content.slotId.replace(
      "-h00",
      "-h02",
    );
    const hourResult = validateCatalog(wrongReleaseHour);
    assert.equal(hourResult.pass, false);
    assert.ok(
      hourResult.issues.some(
        (issue) => issue.code === "daily_schedule_mismatch",
      ),
    );

    const runwayGap = createLaunchCatalogCandidate();
    const finalTheme = runwayGap.boards.filter(
      (board) => board.content.themeId === "fixture-daily-theme-6",
    );
    for (const board of finalTheme) {
      const date = new Date(
        `${board.content.slotId.slice(0, 10)}T00:00:00.000Z`,
      );
      date.setUTCDate(date.getUTCDate() + 7);
      board.content.slotId = `${date.toISOString().slice(0, 10)}-h00`;
    }
    const gapResult = validateCatalog(runwayGap);
    assert.equal(gapResult.pass, false);
    assert.ok(
      gapResult.issues.some(
        (issue) => issue.code === "daily_schedule_mismatch",
      ),
    );
  });

  test("첫 실행과 주간 도전 난이도, 보드 크기 계약을 강제한다", () => {
    const firstRun = createLaunchCatalogCandidate();
    firstRun.boards[1].content.difficulty = "normal";
    const firstRunResult = validateCatalog(firstRun);
    assert.equal(firstRunResult.pass, false);
    assert.ok(
      firstRunResult.issues.some(
        (issue) => issue.code === "difficulty_mismatch",
      ),
    );

    const weekly = createLaunchCatalogCandidate();
    const weeklyBoard = weekly.boards.find(
      (board) => board.route.kind === "weekly-challenge",
    );
    assert.ok(weeklyBoard != null);
    weeklyBoard.content.grid = regularGridAndEntries(8).grid;
    weeklyBoard.content.entries = regularGridAndEntries(8).entries;
    const weeklyResult = validateCatalog(weekly);
    assert.equal(weeklyResult.pass, false);
    assert.ok(
      weeklyResult.issues.some(
        (issue) => issue.code === "launch_contract_mismatch",
      ),
    );

    const selfReferential = createLaunchCatalogCandidate();
    selfReferential.boards[3].content.entries[0].clue =
      "정답 가나를 그대로 포함한 fixture";
    const clueResult = validateCatalog(selfReferential);
    assert.equal(clueResult.pass, false);
    assert.ok(
      clueResult.issues.some(
        (issue) => issue.code === "content_quality_mismatch",
      ),
    );

    const fragmentExposure = createLaunchCatalogCandidate();
    fragmentExposure.boards[0].content.entries[1].clue =
      "일주일에서 주말에 해당하는 요일";
    const fragmentResult = validateCatalog(fragmentExposure);
    assert.equal(fragmentResult.pass, false);
    assert.ok(
      fragmentResult.issues.some(
        (issue) =>
          issue.code === "content_quality_mismatch" &&
          issue.message.includes("fragment"),
      ),
    );

    const otherAnswerLeak = createLaunchCatalogCandidate();
    otherAnswerLeak.boards[3].content.entries[0].clue =
      "두 번째 답 다라를 그대로 알려 주는 단서";
    const otherAnswerResult = validateCatalog(otherAnswerLeak);
    assert.equal(otherAnswerResult.pass, false);
    assert.ok(
      otherAnswerResult.issues.some(
        (issue) =>
          issue.code === "content_quality_mismatch" &&
          issue.message.includes("another board answer"),
      ),
    );

    const answerContainment = createLaunchCatalogCandidate();
    answerContainment.boards[3].content.entries[0].answer = "가나다라";
    answerContainment.boards[3].content.entries[0].answerCells = [
      "가",
      "나",
      "다",
      "라",
    ];
    answerContainment.boards[3].content.grid[0][2] = "다";
    answerContainment.boards[3].content.grid[0][3] = "라";
    const containmentResult = validateCatalog(answerContainment);
    assert.equal(containmentResult.pass, false);
    assert.ok(
      containmentResult.issues.some(
        (issue) =>
          issue.code === "content_quality_mismatch" &&
          issue.message.includes("contain one another"),
      ),
    );
  });
});

describe("world map graph and progression policy", () => {
  test("30개 챕터 보드를 참조하고 명시된 선형 3개 뒤 분기 2개 edge를 검증한다", () => {
    const catalog = requireCatalog();
    const result = validateWorldMapGraphV1(
      createWorldMapGraphCandidate(catalog),
      catalog,
    );
    assert.equal(result.pass, true, JSON.stringify(result.issues, null, 2));
    assert.equal(result.graph?.nodes.length, 30);
    assert.equal(result.graph?.branchPoints.length, 1);
  });

  test("누락 board, 잘못된 edge, cycle은 각각 fail closed한다", () => {
    const catalog = requireCatalog();
    const missing = createWorldMapGraphCandidate(catalog);
    missing.nodes.pop();
    const missingResult = validateWorldMapGraphV1(missing, catalog);
    assert.equal(missingResult.pass, false);
    assert.ok(
      missingResult.issues.some(
        (issue) => issue.code === "catalog_reference_mismatch",
      ),
    );

    const wrongEdge = createWorldMapGraphCandidate(catalog);
    wrongEdge.nodes[1].unlockAfterNodeIds = [];
    const edgeResult = validateWorldMapGraphV1(wrongEdge, catalog);
    assert.equal(edgeResult.pass, false);
    assert.ok(
      edgeResult.issues.some((issue) => issue.code === "graph_shape_mismatch"),
    );

    const duplicateAnnotation = createWorldMapGraphCandidate(catalog);
    duplicateAnnotation.branchPoints.push({
      ...duplicateAnnotation.branchPoints[0],
      branchPointId: "fixture-duplicate-branch-point",
    });
    const duplicateResult = validateWorldMapGraphV1(
      duplicateAnnotation,
      catalog,
    );
    assert.equal(duplicateResult.pass, false);
    assert.ok(
      duplicateResult.issues.some(
        (issue) => issue.code === "graph_shape_mismatch",
      ),
    );

    const unannotatedFanOut = createWorldMapGraphCandidate(catalog);
    unannotatedFanOut.nodes[6].unlockAfterNodeIds = [
      unannotatedFanOut.nodes[3].nodeId,
    ];
    const fanOutResult = validateWorldMapGraphV1(unannotatedFanOut, catalog);
    assert.equal(fanOutResult.pass, false);
    assert.ok(
      fanOutResult.issues.some(
        (issue) => issue.code === "graph_shape_mismatch",
      ),
    );

    const cycle = createWorldMapGraphCandidate(catalog);
    cycle.nodes[0].unlockAfterNodeIds = [cycle.nodes[4].nodeId];
    const cycleResult = validateWorldMapGraphV1(cycle, catalog);
    assert.equal(cycleResult.pass, false);
    assert.ok(cycleResult.issues.some((issue) => issue.code === "graph_cycle"));
  });

  test("튜토리얼 완료 전 root를 잠그고 완료 뒤 첫 챕터 node를 연다", () => {
    const catalog = requireCatalog();
    const graph = requireGraph(catalog);

    const before = projectLaunchProgression(catalog, graph, []);
    assert.equal(before.mapHomeUnlocked, false);
    assert.deepEqual(before.availableNodeIds, []);
    assert.equal(before.nodes[0].status, "locked");

    const after = projectLaunchProgression(catalog, graph, [
      BUNDLED_ONBOARDING_CONTENT_IDENTITY.puzzleId,
      BUNDLED_ONBOARDING_CONTENT_IDENTITY.puzzleId,
      "unknown-puzzle",
    ]);
    assert.equal(after.completedBoardCount, 1);
    assert.equal(after.mapFragmentCount, 1);
    assert.equal(after.mapHomeUnlocked, true);
    assert.deepEqual(after.availableNodeIds, [graph.nodes[0].nodeId]);
  });

  test("세 번째 선형 node 완료 후 두 분기를 동시에 연다", () => {
    const catalog = requireCatalog();
    const graph = requireGraph(catalog);
    const completed = [
      BUNDLED_ONBOARDING_CONTENT_IDENTITY.puzzleId,
      graph.nodes[0].puzzleId,
      graph.nodes[1].puzzleId,
      graph.nodes[2].puzzleId,
    ];
    const branches = projectLaunchProgression(catalog, graph, completed);
    assert.deepEqual(branches.availableNodeIds, [
      graph.nodes[3].nodeId,
      graph.nodes[4].nodeId,
    ]);
  });

  test("분기 합류 규칙은 추정하지 않고 node가 명시한 all 또는 any를 따른다", () => {
    const catalog = requireCatalog();
    const graphCandidate = createWorldMapGraphCandidate(catalog);
    graphCandidate.nodes[5].unlockMode = "any";
    const validation = validateWorldMapGraphV1(graphCandidate, catalog);
    assert.equal(validation.pass, true, JSON.stringify(validation.issues));
    assert.ok(validation.graph != null);

    const projected = projectLaunchProgression(catalog, validation.graph, [
      BUNDLED_ONBOARDING_CONTENT_IDENTITY.puzzleId,
      graphCandidate.nodes[0].puzzleId,
      graphCandidate.nodes[1].puzzleId,
      graphCandidate.nodes[2].puzzleId,
      graphCandidate.nodes[3].puzzleId,
    ]);
    assert.ok(
      projected.availableNodeIds.includes(graphCandidate.nodes[5].nodeId),
    );
  });
});
