import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DAILY_CONNECTOR_WORD_LIMIT,
  LAUNCH_THEME_OWNER_POLICY,
  LAUNCH_THEME_IDS,
  allocateLaunchThemeOwners,
  areCluesSimilar,
  attemptsForRetry,
  buildBoardClueConflictIndex,
  buildLaunchRoutePlan,
  buildWorldMap,
  deduplicateReviewedWords,
  evaluateBoardClueQualityEntries,
  evaluateGeneratedBoardQuality,
  filterAvailableWords,
  hasIndexedBoardClueConflict,
  isGenerationWordLengthEligible,
  normalizeClueForCooldown,
  orderRoutesForGeneration,
  rankDailyConnectorWordsByConnectivity,
  searchOptionsForRetry,
} from "./build-ko-kr-launch-content.mjs";
import {
  compareGeneratedBoardCandidates,
  generateBoards,
  selectDiverseGenerationCandidates,
} from "./crossword-generator-prototype.mjs";

describe("ko-KR launch content builder", () => {
  test("일일 테마 보드는 비테마 연결어 풀을 제한한다", () => {
    assert.equal(DAILY_CONNECTOR_WORD_LIMIT, 80);
  });

  test("sense 테마를 75개 owner와 16개 hard 예약분으로 서로 겹치지 않게 배정한다", () => {
    const words = LAUNCH_THEME_IDS.flatMap((themeId, themeIndex) =>
      Array.from({ length: 75 }, (_, wordIndex) => ({
        answerCells: ["가", "나"],
        difficulty: wordIndex < 16 ? "normal" : "easy",
        sourceEntryId: `${themeIndex}-${wordIndex}`,
        themeTags: [themeId],
      })),
    );
    words.push({
      answerCells: ["다", "라"],
      difficulty: "easy",
      sourceEntryId: "multi-extra",
      themeTags: [LAUNCH_THEME_IDS[0], LAUNCH_THEME_IDS[1]],
    });

    const result = allocateLaunchThemeOwners(words);
    assert.equal(
      result.inventory[LAUNCH_THEME_IDS[0]].owned,
      LAUNCH_THEME_OWNER_POLICY.productionTargetDistinctOwnerCountPerTheme + 1,
    );
    assert.equal(result.inventory[LAUNCH_THEME_IDS[1]].owned, 75);
    assert.ok(
      Object.values(result.inventory).every(
        (inventory) => inventory.hardReserve === 16,
      ),
    );
    assert.equal(
      result.words.find((word) => word.sourceEntryId === "multi-extra")
        .themeOwner,
      LAUNCH_THEME_IDS[0],
    );
    assert.equal(
      new Set(result.words.map((word) => word.sourceEntryId)).size,
      451,
    );
  });

  test("한 테마라도 disjoint production owner 75개를 확보하지 못하면 fail closed한다", () => {
    const words = LAUNCH_THEME_IDS.flatMap((themeId, themeIndex) =>
      Array.from({ length: themeIndex === 0 ? 74 : 75 }, (_, wordIndex) => ({
        answerCells: ["가", "나"],
        difficulty: wordIndex < 16 ? "normal" : "easy",
        sourceEntryId: `${themeIndex}-${wordIndex}`,
        themeTags: [themeId],
      })),
    );
    assert.throws(
      () => allocateLaunchThemeOwners(words),
      /theme owner production matching failed/,
    );
  });

  test("월~목은 금요일 hard 예약어를 보호하고 daily connector는 owner 없는 단어만 쓴다", () => {
    const themed = LAUNCH_THEME_IDS.flatMap((themeId, themeIndex) =>
      Array.from({ length: 75 }, (_, wordIndex) => ({
        answer: `테마-${themeIndex}-${wordIndex}`,
        answerCells: ["가", "나"],
        clue: `단서-${themeIndex}-${wordIndex}`,
        difficulty: wordIndex < 16 ? "normal" : "easy",
        sourceEntryId: `theme-${themeIndex}-${wordIndex}`,
        themeTags: [themeId],
      })),
    );
    const allocated = allocateLaunchThemeOwners(themed).words;
    const connectors = Array.from({ length: 160 }, (_, index) => ({
      answer: `연결-${index}`,
      answerCells: ["다", "라"],
      clue: `연결 단서-${index}`,
      difficulty: "normal",
      sourceEntryId: `connector-${index}`,
      themeTags: [],
      themeOwner: null,
      themeHardReserve: false,
    }));
    const baseRoute = {
      puzzleId: "daily-fixture",
      themeId: LAUNCH_THEME_IDS[0],
    };
    const monday = filterAvailableWords(
      [...allocated, ...connectors],
      {
        ...baseRoute,
        difficulty: "normal",
        route: { kind: "daily", weekday: "monday" },
      },
      new Set(),
    );
    assert.equal(
      monday.words.some((word) => word.themeHardReserve),
      false,
    );
    assert.ok(
      monday.words.every(
        (word) =>
          word.themeOwner == null || word.themeOwner === LAUNCH_THEME_IDS[0],
      ),
    );

    const friday = filterAvailableWords(
      [...allocated, ...connectors],
      {
        ...baseRoute,
        difficulty: "hard",
        route: { kind: "daily", weekday: "friday" },
      },
      new Set(),
    );
    assert.equal(
      friday.words.filter((word) => word.themeHardReserve).length,
      16,
    );
    assert.equal(friday.connectorWordCount, DAILY_CONNECTOR_WORD_LIMIT);
  });

  test("daily connector를 테마 연결성, 길이, connector 연결성, ledger 순으로 고른다", () => {
    const word = (answerCells, reviewLedgerIndex) => ({
      answer: answerCells.join(""),
      answerCells,
      reviewLedgerIndex,
    });

    assert.deepEqual(
      rankDailyConnectorWordsByConnectivity(
        [word(["가"], 0), word(["나"], 1)],
        [word(["가", "다"], 1), word(["가", "나"], 2)],
      ).map((entry) => entry.answer),
      ["가나", "가다"],
    );
    assert.deepEqual(
      rankDailyConnectorWordsByConnectivity(
        [word(["가"], 0)],
        [word(["가", "나"], 1), word(["가", "다", "라"], 2)],
      ).map((entry) => entry.answer),
      ["가다라", "가나"],
    );
    assert.deepEqual(
      rankDailyConnectorWordsByConnectivity(
        [word(["가"], 0), word(["다"], 1)],
        [
          word(["가", "나"], 30),
          word(["다", "라"], 10),
          word(["나", "마"], 20),
        ],
      ).map((entry) => entry.answer),
      ["가나", "다라", "나마"],
    );
    assert.deepEqual(
      rankDailyConnectorWordsByConnectivity(
        [word(["가"], 0), word(["다"], 1)],
        [word(["가", "나"], 30), word(["다", "라"], 10)],
      ).map((entry) => entry.answer),
      ["다라", "가나"],
    );
  });
  test("90개 생성 경로와 6주 일일 일정을 결정론적으로 고정한다", () => {
    const routes = buildLaunchRoutePlan();
    const counts = routes.reduce((result, route) => {
      result[route.route.kind] = (result[route.route.kind] ?? 0) + 1;
      return result;
    }, {});

    assert.equal(routes.length, 90);
    assert.deepEqual(counts, {
      chapter: 30,
      daily: 42,
      bonus: 12,
      "weekly-challenge": 6,
    });

    const daily = routes.filter((route) => route.route.kind === "daily");
    assert.equal(daily[0].slotId, "2026-07-20-h00");
    assert.equal(daily.at(-1).slotId, "2026-08-30-h00");
    assert.deepEqual(
      [...new Set(daily.map((route) => route.themeId))],
      [...LAUNCH_THEME_IDS],
    );
    assert.equal(
      daily.filter(
        (route) =>
          route.route.weekday === "friday" && route.difficulty === "hard",
      ).length,
      6,
    );
    assert.ok(
      daily
        .filter((route) => route.route.weekday !== "friday")
        .every((route) => route.difficulty === "normal"),
    );
    assert.ok(
      routes
        .filter((route) => route.route.kind === "weekly-challenge")
        .every((route) => route.difficulty === "hard"),
    );
  });

  test("테마 일일 보드를 생성 큐의 앞에 두고 catalogOrder는 보존한다", () => {
    const ordered = orderRoutesForGeneration(buildLaunchRoutePlan());
    assert.equal(ordered[0].route.kind, "daily");
    assert.equal(ordered[41].route.kind, "daily");
    assert.equal(ordered[42].route.kind, "weekly-challenge");
    assert.equal(ordered[48].route.kind, "chapter");
    assert.equal(ordered.at(-1).route.kind, "bonus");
    assert.deepEqual(
      [...ordered].sort(
        (left, right) => left.catalogOrder - right.catalogOrder,
      ),
      buildLaunchRoutePlan(),
    );
  });

  test("구두점·공백·Unicode 차이와 높은 유사도의 단서를 cooldown 충돌로 본다", () => {
    assert.equal(
      normalizeClueForCooldown("  물건을 넣어, 들고 다니는 것! "),
      "물건을넣어들고다니는것",
    );
    assert.equal(
      areCluesSimilar(
        "물건을 넣어 들고 다니는 작은 가방",
        "물건을 넣어 들고 다니는 작은 가방.",
      ),
      true,
    );
    assert.equal(
      areCluesSimilar(
        "동네에서 여러 물건을 파는 작은 상점",
        "철로 위를 빠르게 달리는 여러 칸의 탈것",
      ),
      false,
    );
  });

  test("출시 선택에서 정답 조각 노출을 제외하고 0.88 단서 계열을 안정적으로 dedup한다", () => {
    const result = deduplicateReviewedWords(
      [
        {
          answer: "주재료",
          clue: "어떤 것을 만드는 데 가장 중심이 되는 재료",
        },
        {
          answer: "농작물",
          clue: "논밭에 심어 가꾸는 곡식이나 채소",
        },
        {
          answer: "작물",
          clue: "논밭에서 심어 가꾸는 곡식이나 채소",
        },
      ],
      [{ entries: [] }],
    );
    assert.deepEqual(
      result.words.map((word) => word.answer),
      ["농작물"],
    );
    assert.deepEqual(result.exclusions, {
      answerDuplicates: 0,
      answerFragmentExposure: 1,
      onboardingAnswerConflicts: 0,
      clueConflicts: 1,
    });
  });

  test("같은 보드의 다른 정답 노출과 정답 포함관계는 geometry PASS와 별개로 차단한다", () => {
    const result = evaluateBoardClueQualityEntries([
      { answer: "방앗간", clue: "곡식을 찧거나 빻는 가게" },
      { answer: "가게", clue: "물건을 파는 작은 상점" },
      { answer: "주원료", clue: "가장 중심이 되는 기본 재료" },
      { answer: "원료", clue: "물건을 만드는 데 들어가는 재료" },
    ]);
    assert.equal(result.pass, false);
    assert.deepEqual(result.counts, {
      crossAnswerClueLeakCount: 1,
      answerContainmentCount: 1,
    });
    assert.deepEqual(
      result.checks.filter((check) => !check.pass).map((check) => check.key),
      ["maxCrossAnswerClueLeakCount", "maxAnswerContainmentCount"],
    );

    assert.equal(
      evaluateBoardClueQualityEntries([
        { answer: "토끼", clue: "귀가 길고 깡충깡충 뛰는 동물" },
        { answer: "기차", clue: "철길 위를 달리는 긴 탈것" },
      ]).pass,
      true,
    );
  });

  test("같은 보드 단서 충돌 index를 생성 탐색 중 hard mask로 사용할 수 있다", () => {
    const index = buildBoardClueConflictIndex([
      { answer: "방앗간", clue: "곡식을 찧거나 빻는 가게" },
      { answer: "가게", clue: "물건을 파는 작은 상점" },
      { answer: "토끼", clue: "귀가 길고 깡충깡충 뛰는 동물" },
    ]);
    assert.equal(
      hasIndexedBoardClueConflict(
        [{ answer: "방앗간" }, { answer: "가게" }],
        index,
      ),
      true,
    );
    assert.equal(
      hasIndexedBoardClueConflict(
        [{ answer: "방앗간" }, { answer: "토끼" }],
        index,
      ),
      false,
    );
  });

  test("생성기는 run hard mask를 배치 단계부터 적용한다", () => {
    let inspectedRunCount = 0;
    const boards = generateBoards({
      acceptRuns: (runs) => {
        inspectedRunCount += runs.length;
        return false;
      },
      attempts: 1,
      beamWidth: 1,
      branchLimit: 1,
      denseCandidateLimit: 1,
      samples: 1,
      topCandidates: 1,
    });
    assert.ok(inspectedRunCount > 0);
    assert.deepEqual(boards, []);
  });

  test("theme 우선 후보와 기존 score 우선 후보를 절반씩 보존한다", () => {
    const candidates = [
      { id: "theme-a", preferredRunRatio: 1, score: 20 },
      { id: "theme-b", preferredRunRatio: 0.5, score: 10 },
      { id: "score-a", preferredRunRatio: 0, score: 1_000 },
      { id: "score-b", preferredRunRatio: 0, score: 900 },
    ];
    assert.deepEqual(
      selectDiverseGenerationCandidates(candidates, 4, {
        isPreferredRun: () => true,
        minPreferredRunRatio: 0.5,
      }).map((candidate) => candidate.id),
      ["theme-a", "score-a", "theme-b", "score-b"],
    );
  });

  test("final beam에서는 geometry gate PASS를 기존 score보다 먼저 선택한다", () => {
    assert.ok(
      compareGeneratedBoardCandidates(
        { board: { metrics: { score: 1 } }, quality: { pass: true } },
        { board: { metrics: { score: 100_000 } }, quality: { pass: false } },
      ) < 0,
    );
  });

  test("난이도 profile과 기존 생성 품질 임계치를 모두 강제한다", () => {
    const passingBoard = {
      metrics: {
        wordCount: 18,
        autoRunCount: 4,
        crossRatio: 0.55,
        bboxDensity: 0.5,
        multiIntersectionPlacements: 12,
      },
    };
    assert.equal(
      evaluateGeneratedBoardQuality(passingBoard, "normal").pass,
      true,
    );

    const failingBoard = {
      metrics: {
        ...passingBoard.metrics,
        wordCount: 9,
        crossRatio: 0.54,
      },
    };
    const result = evaluateGeneratedBoardQuality(failingBoard, "normal");
    assert.equal(result.pass, false);
    assert.deepEqual(
      result.checks.filter((check) => !check.pass).map((check) => check.key),
      ["minWordCount", "minCrossRatio"],
    );
  });

  test("테마 inventory 길이 gate는 난이도별 숫자 상한을 사용한다", () => {
    assert.equal(
      isGenerationWordLengthEligible(
        { answerCells: ["가", "나", "다"] },
        "hard",
      ),
      true,
    );
    assert.equal(
      isGenerationWordLengthEligible(
        { answerCells: ["가", "나", "다", "라"] },
        "hard",
      ),
      false,
    );
    assert.throws(
      () =>
        isGenerationWordLengthEligible(
          { answerCells: ["가", "나"] },
          "unknown",
        ),
      /unsupported generation difficulty/,
    );
  });

  test("품질 임계치는 유지하고 탐색 폭과 횟수만 단계적으로 확장한다", () => {
    assert.deepEqual(
      Array.from({ length: 6 }, (_, index) => attemptsForRetry(30, index)),
      [3, 5, 8, 12, 20, 30],
    );
    assert.deepEqual(
      Array.from({ length: 4 }, (_, index) => attemptsForRetry(12, index)),
      [3, 5, 8, 12],
    );
    assert.deepEqual(
      Array.from({ length: 8 }, (_, index) => attemptsForRetry(80, index)),
      [3, 5, 8, 12, 20, 30, 80, 80],
    );
    assert.deepEqual(
      searchOptionsForRetry(
        {
          attempts: 30,
          beamWidth: 16,
          branchLimit: 14,
          candidateWordLimit: 600,
          denseCandidateLimit: 96,
          samples: 5,
        },
        0,
      ),
      {
        attempts: 3,
        beamWidth: 6,
        branchLimit: 6,
        candidateWordLimit: 240,
        denseCandidateLimit: 32,
        samples: 3,
      },
    );
    assert.deepEqual(
      searchOptionsForRetry(
        {
          attempts: 80,
          beamWidth: 24,
          branchLimit: 20,
          candidateWordLimit: 1000,
          denseCandidateLimit: 160,
          samples: 8,
        },
        6,
      ),
      {
        attempts: 80,
        beamWidth: 24,
        branchLimit: 20,
        candidateWordLimit: 1000,
        denseCandidateLimit: 160,
        samples: 8,
      },
    );
    assert.deepEqual(
      searchOptionsForRetry(
        {
          attempts: 80,
          beamWidth: 24,
          branchLimit: 20,
          candidateWordLimit: 1000,
          denseCandidateLimit: 160,
          samples: 8,
        },
        5,
      ),
      {
        attempts: 30,
        beamWidth: 16,
        branchLimit: 14,
        candidateWordLimit: 600,
        denseCandidateLimit: 96,
        samples: 5,
      },
    );
  });

  test("각 챕터의 선형 3개 뒤 2개 분기 구조와 단일 root를 만든다", () => {
    const chapterRoutes = buildLaunchRoutePlan().filter(
      (route) => route.route.kind === "chapter",
    );
    const catalog = {
      catalogId: "fixture-catalog",
      boards: chapterRoutes.map((route) => ({
        route: route.route,
        content: {
          puzzleId: route.puzzleId,
          chapterId: route.chapterId,
        },
      })),
    };
    const graph = buildWorldMap(catalog);

    assert.equal(graph.artifactStatus, "candidate");
    assert.equal(graph.activationApproved, false);
    assert.equal(graph.nodes.length, 30);
    assert.equal(graph.branchPoints.length, 3);
    assert.equal(
      graph.nodes.filter((node) => node.unlockAfterNodeIds.length === 0).length,
      1,
    );
    for (const point of graph.branchPoints) {
      const decisionNode = point.linearNodeIds[2];
      assert.deepEqual(
        graph.nodes
          .filter((node) => node.unlockAfterNodeIds.includes(decisionNode))
          .map((node) => node.nodeId),
        point.branchEntryNodeIds,
      );
    }
  });
});
