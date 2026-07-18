import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  LAUNCH_THEME_IDS,
  areCluesSimilar,
  attemptsForRetry,
  buildLaunchRoutePlan,
  buildWorldMap,
  evaluateGeneratedBoardQuality,
  isGenerationWordLengthEligible,
  normalizeClueForCooldown,
  orderRoutesForGeneration,
  searchOptionsForRetry,
} from "./build-ko-kr-launch-content.mjs";

describe("ko-KR launch content builder", () => {
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
