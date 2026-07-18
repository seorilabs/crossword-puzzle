import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DAILY_CONNECTOR_RANKING_POLICY,
  DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY,
  LAUNCH_ACCEPTED_CANDIDATE_POLICY,
  LAUNCH_RETRY_PHASE_POLICY,
  LAUNCH_SEARCH_QUALITY_POLICY,
  LAUNCH_THEME_OWNER_POLICY,
  LAUNCH_THEME_IDS,
  allocateLaunchThemeOwners,
  areCluesSimilar,
  attemptsForRetry,
  buildBoardClueConflictIndex,
  buildLaunchRoutePlan,
  calculateLaunchWordPoolAnswerSetSha256,
  buildWorldMap,
  compareLaunchAcceptedCandidateScores,
  deduplicateReviewedWords,
  evaluateBoardClueQualityEntries,
  evaluateGeneratedBoardQuality,
  evaluateLaunchSearchBoardQuality,
  filterAvailableWords,
  generationProgressPosition,
  hasIndexedBoardClueConflict,
  isGenerationWordLengthEligible,
  isLaunchCompactFallbackRetry,
  normalizeClueForCooldown,
  orderRoutesForGeneration,
  rankDailyConnectorWordsByConnectivity,
  runLaunchRetryPhases,
  searchOptionsForRetry,
  summarizeFuturePoolConnectivity,
  validateWordSelectionDifficultyPolicy,
} from "./build-ko-kr-launch-content.mjs";
import { DIFFICULTY_PROFILES } from "../packages/crossword-core/src/difficultyProfiles.ts";
import {
  LAUNCH_QUALITY_SCORING_POLICY,
  compareGenerationCandidatesByGeometryQuality,
  compareGeneratedBoardCandidates,
  generateBoards,
  selectDiverseGenerationCandidates,
} from "./crossword-generator-prototype.mjs";
import { LAUNCH_COMPACT_FALLBACK_POLICY } from "./compact-crossword-generator.mjs";

describe("ko-KR launch content builder", () => {
  test("word pool evidence는 정렬된 unique answer set SHA로 봉인한다", () => {
    const left = calculateLaunchWordPoolAnswerSetSha256([
      { answer: "나무" },
      { answer: "가방" },
    ]);
    const right = calculateLaunchWordPoolAnswerSetSha256([
      { answer: "가방" },
      { answer: "나무" },
    ]);
    assert.equal(left, right);
    assert.match(left, /^sha256:[0-9a-f]{64}$/);
    assert.throws(
      () =>
        calculateLaunchWordPoolAnswerSetSha256([
          { answer: "가방" },
          { answer: "가방" },
        ]),
      /answers must be unique/,
    );
  });

  test("일일 테마 보드는 난이도별 비테마 연결어 풀을 제한한다", () => {
    assert.deepEqual(DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY, {
      normal: 80,
      hard: 120,
    });
  });

  test("일일 연결어 순위는 marginal owner coverage 뒤 공유 음절 다양성을 우선한다", () => {
    assert.equal(
      DAILY_CONNECTOR_RANKING_POLICY.coverageScope,
      "greedy-prefix-over-distinct-theme-owner-answers-in-current-route-pool",
    );
    assert.deepEqual(DAILY_CONNECTOR_RANKING_POLICY.connectorOrder, [
      "max-marginal-uncovered-theme-owner-count",
      "max-distinct-shared-theme-cell-count",
      "max-theme-word-degree",
      "max-answer-cell-count",
      "max-connector-word-degree",
      "min-review-ledger-index",
      "stable-input-order",
    ]);
    const word = (answerCells, reviewLedgerIndex) => ({
      answer: answerCells.join(""),
      answerCells,
      reviewLedgerIndex,
    });
    const ranked = rankDailyConnectorWordsByConnectivity(
      [
        word(["가", "바"], 0),
        word(["가", "사"], 1),
        word(["나", "카"], 2),
        word(["라", "타"], 3),
      ],
      [word(["가", "다"], 4), word(["나", "라"], 5)],
    );

    assert.deepEqual(
      ranked.map((entry) => entry.answer),
      ["나라", "가다"],
    );
  });

  test("일일 연결어 greedy prefix는 이미 덮은 owner의 중복 edge를 뒤로 보낸다", () => {
    const word = (answerCells, reviewLedgerIndex) => ({
      answer: answerCells.join(""),
      answerCells,
      reviewLedgerIndex,
    });
    const ranked = rankDailyConnectorWordsByConnectivity(
      [word(["가", "바"], 0), word(["가", "사"], 1), word(["나", "카"], 2)],
      [word(["가", "다"], 3), word(["가", "라"], 4), word(["나", "요"], 5)],
    );

    assert.deepEqual(
      ranked.map((entry) => entry.answer),
      ["가다", "나요", "가라"],
    );
  });

  test("launch PASS lookahead와 미래 pool 선택 순서를 generator config 정책으로 고정한다", () => {
    assert.equal(LAUNCH_ACCEPTED_CANDIDATE_POLICY.defaultRetries, 8);
    assert.equal(LAUNCH_ACCEPTED_CANDIDATE_POLICY.acceptedLookaheadRetries, 1);
    assert.equal(
      LAUNCH_ACCEPTED_CANDIDATE_POLICY.candidateAnswerOrder,
      "unique-answers-ascending-js-code-unit",
    );
    assert.equal(
      LAUNCH_ACCEPTED_CANDIDATE_POLICY.multiPositionDefinition,
      "maximum-matching-of-distinct-answer-cell-positions-to-clue-compatible-distinct-partner-answers-at-least-two",
    );
    assert.deepEqual(LAUNCH_ACCEPTED_CANDIDATE_POLICY.dailyOrder, [
      "min-isolated-theme-owners",
      "max-usable-multi-position-theme-owners",
      "max-usable-multi-position-answers",
      "max-theme-connector-edges",
      "max-total-edges",
      "min-cooldown-answer-count",
      "stable-generation-order",
    ]);
    assert.deepEqual(LAUNCH_ACCEPTED_CANDIDATE_POLICY.otherOrder, [
      "max-usable-multi-position-answers",
      "max-total-edges",
      "min-cooldown-answer-count",
      "stable-generation-order",
    ]);
  });

  test("base와 bounded fallback의 retry별 connector schedule을 고정한다", () => {
    assert.equal(
      LAUNCH_RETRY_PHASE_POLICY.transition,
      "fallback-only-after-base-exhausted-with-no-pass",
    );
    assert.equal(LAUNCH_RETRY_PHASE_POLICY.fallbackRouteKind, "daily");
    assert.deepEqual(
      LAUNCH_RETRY_PHASE_POLICY.phases.map((phase) => ({
        phaseIndex: phase.phaseIndex,
        phaseId: phase.phaseId,
        globalRetryStart: phase.globalRetryStart,
        retryCount: phase.retryCount,
        normal: phase.connectorLimitScheduleByDifficulty.normal,
        hard: phase.connectorLimitScheduleByDifficulty.hard,
      })),
      [
        {
          phaseIndex: 0,
          phaseId: "base",
          globalRetryStart: 0,
          retryCount: 8,
          normal: Array(8).fill(80),
          hard: Array(8).fill(120),
        },
        {
          phaseIndex: 1,
          phaseId: "fallback",
          globalRetryStart: 8,
          retryCount: 8,
          normal: [120, 120, 120, 120, 160, 160, 160, 160],
          hard: [160, 160, 160, 160, 200, 200, 200, 200],
        },
      ],
    );
  });

  test("compact fallback은 easy·normal은 즉시, hard는 phase 마지막에만 실행한다", () => {
    assert.equal(
      LAUNCH_COMPACT_FALLBACK_POLICY.policyId,
      "launch-compact-connected-dfs-v3",
    );
    assert.equal(
      LAUNCH_COMPACT_FALLBACK_POLICY.activationScope,
      "launch-builder-difficulty-aware-after-standard-no-pass",
    );
    assert.deepEqual(LAUNCH_COMPACT_FALLBACK_POLICY.activationByDifficulty, {
      easy: "each-retry-after-current-standard-search-has-no-pass",
      normal: "each-retry-after-current-standard-search-has-no-pass",
      hard: "final-retry-of-each-phase-after-all-standard-searches-have-no-pass",
    });
    for (const difficulty of ["easy", "normal"]) {
      assert.deepEqual(
        Array.from({ length: 8 }, (_, retryIndex) =>
          isLaunchCompactFallbackRetry(retryIndex, 8, false, difficulty),
        ),
        Array(8).fill(true),
      );
    }
    assert.deepEqual(
      Array.from({ length: 8 }, (_, retryIndex) =>
        isLaunchCompactFallbackRetry(retryIndex, 8, false, "hard"),
      ),
      [false, false, false, false, false, false, false, true],
    );
    assert.equal(isLaunchCompactFallbackRetry(7, 8, true, "hard"), false);
  });

  test("base PASS는 fallback을 호출하지 않고 기존 선택 결과를 즉시 반환한다", () => {
    const selectedBoard = { id: "base-board" };
    let phaseCallCount = 0;
    const result = runLaunchRetryPhases({
      routeKind: "daily",
      runPhase: (phaseSpec) => {
        phaseCallCount += 1;
        assert.equal(phaseSpec.phaseId, "base");
        return {
          tag: "base-context",
          generation: {
            accepted: true,
            board: selectedBoard,
            quality: { pass: true },
            selectedCandidateIndex: 0,
            selectedRetryIndex: 0,
            selectedSeed: 101,
            attempts: [
              {
                retryIndex: 0,
                candidates: [{ candidateIndex: 0, pass: true }],
              },
            ],
          },
          attemptEvidence: [
            {
              connectorLimit: 80,
              wordPool: { total: 180, theme: 100, connectors: 80 },
            },
          ],
        };
      },
    });

    assert.equal(phaseCallCount, 1);
    assert.strictEqual(result.generation.board, selectedBoard);
    assert.equal(result.generation.selectedRetryIndex, 0);
    assert.equal(result.selectedPhase, "base");
    assert.equal(result.tag, "base-context");
    assert.deepEqual(result.generation.attempts[0], {
      retryIndex: 0,
      phase: "base",
      phaseIndex: 0,
      phaseId: "base",
      globalRetryIndex: 0,
      connectorLimit: 80,
      wordPool: { total: 180, theme: 100, connectors: 80 },
      candidates: [{ candidateIndex: 0, pass: true }],
    });
  });

  test("base 8회가 모두 실패한 뒤 fallback selected index를 전체 trace로 변환한다", () => {
    const calls = [];
    const result = runLaunchRetryPhases({
      routeKind: "daily",
      runPhase: (phaseSpec) => {
        calls.push(phaseSpec.phaseId);
        const attemptCount = phaseSpec.phaseId === "base" ? 8 : 6;
        const attempts = Array.from({ length: attemptCount }, (_, index) => ({
          retryIndex: index,
          candidates: [
            {
              candidateIndex: 0,
              pass: phaseSpec.phaseId === "fallback" && index >= 4,
            },
          ],
        }));
        return {
          generation:
            phaseSpec.phaseId === "base"
              ? { accepted: false, attempts }
              : {
                  accepted: true,
                  board: { id: "fallback-board" },
                  quality: { pass: true },
                  selectedCandidateIndex: 0,
                  selectedRetryIndex: 5,
                  selectedSeed: 113,
                  attempts,
                },
          attemptEvidence: attempts.map((_, index) => {
            const connectorLimit =
              phaseSpec.connectorLimitScheduleByDifficulty.normal[index];
            return {
              connectorLimit,
              wordPool: {
                total: 100 + connectorLimit,
                theme: 100,
                connectors: connectorLimit,
              },
            };
          }),
        };
      },
    });

    assert.deepEqual(calls, ["base", "fallback"]);
    assert.equal(result.selectedPhase, "fallback");
    assert.equal(result.generation.attempts.length, 14);
    assert.equal(result.generation.selectedRetryIndex, 13);
    assert.deepEqual(
      result.generation.attempts
        .slice(8)
        .map((attempt) => attempt.connectorLimit),
      [120, 120, 120, 120, 160, 160],
    );
    assert.deepEqual(
      result.generation.attempts.map((attempt) => [
        attempt.phase,
        attempt.retryIndex,
        attempt.globalRetryIndex,
      ]),
      [
        ...Array.from({ length: 8 }, (_, index) => ["base", index, index]),
        ...Array.from({ length: 6 }, (_, index) => [
          "fallback",
          index,
          index + 8,
        ]),
      ],
    );
  });

  test("chapter·bonus·weekly route는 base 8회 실패 뒤 fallback을 실행하지 않는다", () => {
    for (const routeKind of ["chapter", "bonus", "weekly-challenge"]) {
      const calls = [];
      const attempts = Array.from({ length: 8 }, (_, retryIndex) => ({
        retryIndex,
        candidates: [{ candidateIndex: 0, pass: false }],
      }));
      const result = runLaunchRetryPhases({
        routeKind,
        runPhase: (phaseSpec) => {
          calls.push(phaseSpec.phaseId);
          return {
            generation: { accepted: false, attempts },
            attemptEvidence: attempts.map(() => ({
              connectorLimit: null,
              wordPool: { total: 200, theme: null, connectors: null },
            })),
          };
        },
      });

      assert.deepEqual(calls, ["base"]);
      assert.equal(result.selectedPhase, null);
      assert.equal(result.generation.accepted, false);
      assert.equal(result.generation.attempts.length, 8);
    }
  });

  test("launch 탐색 품질은 전체 route gate와 연결성 admission을 함께 강제한다", () => {
    assert.deepEqual(LAUNCH_SEARCH_QUALITY_POLICY, {
      policyId: "ko-kr-launch-search-quality-alignment-v3",
      evaluator: "route-quality-plus-connected-components",
      maxConnectedComponents: 1,
      placementIntersectionDefinition: "preexisting-matching-letter-cell-only",
      scoringPolicy: LAUNCH_QUALITY_SCORING_POLICY,
      compactFallback: LAUNCH_COMPACT_FALLBACK_POLICY,
    });
    const connectedBoard = {
      grid: [
        ["가", "나", null, null, null, null, null, null],
        [null, "다", null, null, null, null, null, null],
        ...Array.from({ length: 6 }, () => Array(8).fill(null)),
      ],
      placements: [],
      metrics: {
        wordCount: 10,
        autoRunCount: 0,
        crossRatio: 0.6,
        bboxDensity: 0.5,
        multiIntersectionPlacements: 7,
        connectedComponents: 1,
      },
    };
    const route = {
      difficulty: "normal",
      route: { kind: "chapter" },
      themeId: "chapter-fixture",
    };
    const wordPool = [
      { answer: "가나", clue: "첫 번째 검수용 단서" },
      { answer: "나다", clue: "두 번째 검수용 단서" },
    ];

    const connected = evaluateLaunchSearchBoardQuality(
      connectedBoard,
      route,
      wordPool,
    );
    assert.equal(connected.pass, true);
    assert.equal(connected.thresholds.maxConnectedComponents, 1);

    const disconnected = evaluateLaunchSearchBoardQuality(
      {
        ...connectedBoard,
        metrics: { ...connectedBoard.metrics, connectedComponents: 2 },
      },
      route,
      wordPool,
    );
    assert.equal(disconnected.pass, false);
    assert.deepEqual(
      disconnected.checks
        .filter((check) => !check.pass)
        .map((check) => check.key),
      ["maxConnectedComponents"],
    );
  });

  test("next daily rerank pool은 고립 theme owner를 raw edge보다 먼저 줄인다", () => {
    const nextDaily = {
      themeId: "table-kitchen",
      route: { kind: "daily" },
    };
    const connectivity = summarizeFuturePoolConnectivity(
      [
        {
          answer: "테마가",
          answerCells: ["가", "나"],
          clue: "첫 번째 테마 단서",
          themeOwner: "table-kitchen",
        },
        {
          answer: "테마다",
          answerCells: ["다"],
          clue: "두 번째 테마 단서",
          themeOwner: "table-kitchen",
        },
        {
          answer: "연결가",
          answerCells: ["가", "라"],
          clue: "첫 번째 연결 단서",
          themeOwner: null,
        },
        {
          answer: "연결라",
          answerCells: ["라"],
          clue: "두 번째 연결 단서",
          themeOwner: null,
        },
      ],
      nextDaily,
    );
    assert.deepEqual(connectivity, {
      totalSharedCellEdges: 2,
      themeConnectorSharedCellEdges: 1,
      isolatedThemeOwnerCount: 1,
      usableMultiPositionThemeOwnerCount: 0,
      usableMultiPositionAnswerCount: 1,
    });

    const score = (overrides) => ({
      totalSharedCellEdges: 10,
      themeConnectorSharedCellEdges: 5,
      isolatedThemeOwnerCount: 1,
      usableMultiPositionThemeOwnerCount: 3,
      usableMultiPositionAnswerCount: 8,
      cooldownAnswerCount: 12,
      ...overrides,
    });
    assert.ok(
      compareLaunchAcceptedCandidateScores(
        score({ usableMultiPositionThemeOwnerCount: 4 }),
        score({ themeConnectorSharedCellEdges: 100 }),
        nextDaily,
      ) < 0,
    );
    assert.ok(
      compareLaunchAcceptedCandidateScores(
        score({ usableMultiPositionAnswerCount: 9 }),
        score({ themeConnectorSharedCellEdges: 100 }),
        nextDaily,
      ) < 0,
    );
    assert.ok(
      compareLaunchAcceptedCandidateScores(
        score({ themeConnectorSharedCellEdges: 6 }),
        score({ isolatedThemeOwnerCount: 0, totalSharedCellEdges: 100 }),
        nextDaily,
      ) > 0,
    );
    assert.ok(
      compareLaunchAcceptedCandidateScores(
        score({ isolatedThemeOwnerCount: 0 }),
        score({ totalSharedCellEdges: 100 }),
        nextDaily,
      ) < 0,
    );
    assert.ok(
      compareLaunchAcceptedCandidateScores(
        score({ themeConnectorSharedCellEdges: 6 }),
        score({ themeConnectorSharedCellEdges: 5 }),
        nextDaily,
      ) < 0,
    );
    assert.ok(
      compareLaunchAcceptedCandidateScores(
        score({ totalSharedCellEdges: 11 }),
        score({ cooldownAnswerCount: 1 }),
        nextDaily,
      ) < 0,
    );
    assert.ok(
      compareLaunchAcceptedCandidateScores(
        score({ cooldownAnswerCount: 11 }),
        score({ cooldownAnswerCount: 12 }),
        { route: { kind: "chapter" } },
      ) < 0,
    );
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
    assert.equal(
      monday.connectorWordCount,
      DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY.normal,
    );
    const expandedMonday = filterAvailableWords(
      [...allocated, ...connectors],
      {
        ...baseRoute,
        difficulty: "normal",
        route: { kind: "daily", weekday: "monday" },
      },
      new Set(),
      { connectorWordLimit: 120 },
    );
    assert.equal(expandedMonday.connectorWordCount, 120);
    assert.deepEqual(
      expandedMonday.words.slice(0, monday.words.length),
      monday.words,
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
    assert.equal(
      friday.connectorWordCount,
      DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY.hard,
    );
  });

  test("normal 후보 풀은 150개 미만이어도 hard 어휘로 자동 보강하지 않는다", () => {
    const route = {
      puzzleId: "normal-ceiling-fixture",
      themeId: LAUNCH_THEME_IDS[0],
      difficulty: "normal",
      route: { kind: "daily", weekday: "monday" },
    };
    const reviewedWords = [
      ...Array.from({ length: 16 }, (_, index) => ({
        answer: `테마-${index}`,
        answerCells: ["가", "나"],
        difficulty: "normal",
        themeOwner: route.themeId,
        themeHardReserve: false,
        reviewLedgerIndex: index,
      })),
      ...Array.from({ length: 149 }, (_, index) => ({
        answer: `연결-${index}`,
        answerCells: ["나", "다"],
        difficulty: "normal",
        themeOwner: null,
        themeHardReserve: false,
        reviewLedgerIndex: index + 16,
      })),
      ...Array.from({ length: 100 }, (_, index) => ({
        answer: `고급-${index}`,
        answerCells: ["다", "라"],
        difficulty: "hard",
        themeOwner: null,
        themeHardReserve: false,
        reviewLedgerIndex: index + 165,
      })),
    ];
    const selection = filterAvailableWords(reviewedWords, route, new Set());
    assert.deepEqual(selection.difficulties, ["easy", "normal"]);
    assert.equal(selection.broadened, false);
    assert.deepEqual(selection.broadenedWith, []);
    assert.equal(
      selection.words.some((word) => word.difficulty === "hard"),
      false,
    );
  });

  test("generator selection evidence가 normal hard 상한을 넘으면 fail closed한다", () => {
    assert.throws(
      () =>
        validateWordSelectionDifficultyPolicy(
          {
            words: [{ difficulty: "hard" }],
            difficulties: ["easy", "normal", "hard"],
            broadened: true,
            broadenedWith: ["hard"],
          },
          DIFFICULTY_PROFILES.normal,
          "fixture",
        ),
      /exceeds normal difficulty ceiling/,
    );
  });

  test("daily connector를 공유 음절 다양성, 테마 연결성, 길이, connector 연결성, ledger 순으로 고른다", () => {
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

  test("checkpoint 저장 중 completed가 늘어도 progress position은 시작 offset을 유지한다", () => {
    const completed = [{ puzzleId: "cached" }];
    const completedAtStart = completed.length;
    completed.push({ puzzleId: "generated-1" });
    assert.equal(generationProgressPosition(completedAtStart, 1), 3);
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

  test("beam에서 theme, geometry 근접도, 기존 score 후보를 3-way로 보존한다", () => {
    const check = (actual, expected) => ({
      actual,
      expected,
      operator: ">=",
      pass: actual >= expected,
    });
    const candidates = [
      {
        id: "theme-a",
        preferredRunRatio: 1,
        quality: { checks: [check(0.1, 0.5)] },
        score: 20,
      },
      {
        id: "theme-b",
        preferredRunRatio: 0.5,
        quality: { checks: [check(0.1, 0.5)] },
        score: 10,
      },
      {
        id: "geometry-a",
        preferredRunRatio: 0,
        quality: { checks: [check(0.5, 0.5)] },
        score: 8,
      },
      {
        id: "geometry-b",
        preferredRunRatio: 0,
        quality: { checks: [check(0.49, 0.5)] },
        score: 7,
      },
      {
        id: "score-a",
        preferredRunRatio: 0,
        quality: { checks: [check(0, 0.5)] },
        score: 1_000,
      },
      {
        id: "score-b",
        preferredRunRatio: 0,
        quality: { checks: [check(0, 0.5)] },
        score: 900,
      },
    ];
    assert.ok(
      compareGenerationCandidatesByGeometryQuality(
        candidates[2],
        candidates[4],
      ) < 0,
    );
    assert.deepEqual(
      selectDiverseGenerationCandidates(candidates, 6, {
        isPreferredRun: () => true,
        minPreferredRunRatio: 0.5,
      }).map((candidate) => candidate.id),
      ["theme-a", "geometry-a", "score-a", "theme-b", "geometry-b", "score-b"],
    );
    assert.deepEqual(
      selectDiverseGenerationCandidates(candidates.slice(2), 4, {}).map(
        (candidate) => candidate.id,
      ),
      ["geometry-a", "score-a", "geometry-b", "score-b"],
    );
  });

  test("launch 품질 beam은 geometry와 score 후보를 절반씩 보존한다", () => {
    const check = (actual, expected) => ({
      actual,
      expected,
      operator: ">=",
      pass: actual >= expected,
    });
    const candidates = [
      {
        id: "theme-score",
        preferredRunRatio: 1,
        quality: { checks: [check(0, 0.5)] },
        score: 1_000,
      },
      {
        id: "geometry-a",
        preferredRunRatio: 0,
        quality: { checks: [check(0.5, 0.5)] },
        score: 10,
      },
      {
        id: "geometry-b",
        preferredRunRatio: 0,
        quality: { checks: [check(0.49, 0.5)] },
        score: 9,
      },
      {
        id: "score-b",
        preferredRunRatio: 0,
        quality: { checks: [check(0, 0.5)] },
        score: 900,
      },
    ];

    assert.deepEqual(
      selectDiverseGenerationCandidates(candidates, 4, {
        isPreferredRun: () => true,
        minPreferredRunRatio: 0.5,
        scoringPolicyId: LAUNCH_QUALITY_SCORING_POLICY.policyId,
      }).map((candidate) => candidate.id),
      ["geometry-a", "theme-score", "geometry-b", "score-b"],
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
