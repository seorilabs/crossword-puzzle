import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  getDailyFreePuzzleSummary,
  getNextStreakMilestoneHint,
  getOpenPuzzleSummariesForDate,
  getPuzzleDailySequenceNumber,
  getPuzzlePackAlias,
  getStreakBadgeLabel,
  getNewlyReachedProgressMilestones,
  getProgressMilestoneRewardMessage,
  getStreakMilestoneProgress,
  isPublishedPuzzle,
  isWrongCellVisible,
  PUZZLE_PROGRESS_MILESTONES,
  resolveInitialActivePuzzleId,
  resolveStarterCell,
  shouldQuickStartActivePuzzle,
  shouldServeOnboardingPuzzle,
  shouldShowFirstInputGuide,
  getStuckHintDelayMs,
  resolveVerticalArrowAction,
  shouldOfferStuckWordReveal,
  shouldCelebrateOnboardingWordCompletion,
} from "./uiPolicy.ts";
import type { Puzzle, PuzzleEntry, PuzzleManifestItem } from "./types.ts";

function createSummary(
  puzzleId: string,
  overrides: Partial<PuzzleManifestItem> = {},
): PuzzleManifestItem {
  return {
    date: "2026-06-12",
    path: `/puzzles/${puzzleId}.json`,
    puzzleId,
    ...overrides,
  };
}

describe("shouldShowFirstInputGuide", () => {
  const baseInput = {
    route: "today",
    hasStarted: true,
    isCompleted: false,
    hasSeenFirstInputGuide: false,
    isBoardEmpty: true,
  };

  it("시작·빈 그리드·미완료·가이드 미열람의 today 진입에서 노출한다", () => {
    assert.equal(shouldShowFirstInputGuide(baseInput), true);
  });

  it("how-to 열람 여부와 무관하게 노출된다(#161 트리거 완화: how-to 전제 제거)", () => {
    // 입력 파라미터 자체에 hasSeenHowToPlay가 없다. 즉 how-to를 보지 않은 신규도
    // 동일 입력으로 노출 대상이 된다(과거에는 hasSeenHowToPlay=true가 필수였다).
    const newcomerWhoSkippedHowTo = { ...baseInput };
    assert.equal(shouldShowFirstInputGuide(newcomerWhoSkippedHowTo), true);
    assert.ok(!("hasSeenHowToPlay" in newcomerWhoSkippedHowTo));
  });

  it("이미 가이드를 본 사용자에게는 노출하지 않는다(중복 노출 방지 가드 유지)", () => {
    assert.equal(
      shouldShowFirstInputGuide({ ...baseInput, hasSeenFirstInputGuide: true }),
      false,
    );
  });

  it("한 글자라도 입력되면(빈 그리드 아님) 노출하지 않는다", () => {
    assert.equal(
      shouldShowFirstInputGuide({ ...baseInput, isBoardEmpty: false }),
      false,
    );
  });

  it("아직 시작하지 않았거나 이미 완료했거나 today가 아니면 노출하지 않는다", () => {
    assert.equal(
      shouldShowFirstInputGuide({ ...baseInput, hasStarted: false }),
      false,
    );
    assert.equal(
      shouldShowFirstInputGuide({ ...baseInput, isCompleted: true }),
      false,
    );
    assert.equal(
      shouldShowFirstInputGuide({ ...baseInput, route: "home" }),
      false,
    );
  });
});

describe("resolveStarterCell", () => {
  function createEntry(overrides: Partial<PuzzleEntry>): PuzzleEntry {
    return {
      id: "entry",
      answer: "가나",
      clue: "단서",
      direction: "across",
      generatedBy: "placed",
      row: 0,
      col: 0,
      ...overrides,
    };
  }

  function createPuzzle(entries: PuzzleEntry[]): Puzzle {
    return {
      date: "2026-06-12",
      difficulty: "easy",
      entries,
      grid: [],
      gridSize: 0,
      metrics: {
        autoRunCount: 0,
        bboxDensity: 0,
        crossCells: 0,
        crossRatio: 0,
        filledCells: 0,
        multiCrossEntries: 0,
        placedWordCount: entries.length,
        wordCount: entries.length,
      },
      puzzleId: "test",
    };
  }

  // a1(가로, len2, 0:0), a2(가로, len2, 0:3), d1(세로, len3, 0:0)
  const a1 = createEntry({ id: "a1", answer: "가나", direction: "across", row: 0, col: 0 });
  const a2 = createEntry({ id: "a2", answer: "다라", direction: "across", row: 0, col: 3 });
  const d1 = createEntry({ id: "d1", answer: "가마바", direction: "down", row: 0, col: 0 });

  it("빈 그리드에서는 가장 짧은 단어의 시작 칸을 시작 칸으로 고른다", () => {
    const starter = resolveStarterCell({
      cellValues: {},
      puzzle: createPuzzle([d1, a1, a2]),
    });

    assert.deepEqual(starter, {
      cellKey: "0:0",
      col: 0,
      entryId: "a1",
      row: 0,
    });
  });

  it("길이가 같으면 읽기 순서(위→아래, 왼→오른쪽)가 앞선 단어를 고른다", () => {
    // a1과 a2는 둘 다 길이 2. 같은 행이면 열이 작은 a1(col 0)이 우선한다.
    const starter = resolveStarterCell({
      cellValues: {},
      puzzle: createPuzzle([a2, a1]),
    });

    assert.equal(starter?.entryId, "a1");
    assert.equal(starter?.cellKey, "0:0");
  });

  it("단어의 시작 칸이 채워져 있으면 그 단어의 첫 '빈' 칸을 가리킨다", () => {
    // a1의 시작 칸(0:0)이 이미 채워졌으므로 다음 빈 칸 0:1을 가리켜야 한다.
    const starter = resolveStarterCell({
      cellValues: { "0:0": "가" },
      puzzle: createPuzzle([a1, a2]),
    });

    assert.equal(starter?.entryId, "a1");
    assert.equal(starter?.cellKey, "0:1");
  });

  it("빈 칸이 하나도 없는 단어는 건너뛰고 빈 칸이 남은 단어를 고른다", () => {
    // a1은 모두 채워짐 → 건너뛰고, 빈 칸이 남은 최단 단어 a2를 고른다.
    const starter = resolveStarterCell({
      cellValues: { "0:0": "가", "0:1": "나" },
      puzzle: createPuzzle([a1, a2, d1]),
    });

    assert.equal(starter?.entryId, "a2");
    assert.equal(starter?.cellKey, "0:3");
  });

  it("모든 칸이 채워졌으면 undefined를 돌려준다", () => {
    const starter = resolveStarterCell({
      cellValues: {
        "0:0": "가",
        "0:1": "나",
        "0:3": "다",
        "0:4": "라",
        "1:0": "마",
        "2:0": "바",
      },
      puzzle: createPuzzle([a1, a2, d1]),
    });

    assert.equal(starter, undefined);
  });
});

describe("getStuckHintDelayMs", () => {
  const params = { wrongCellThreshold: 2, idleMs: 20000, wrongIdleMs: 5000 };

  it("확정 오답이 임계치 이상이면 더 짧은 지연을 쓴다(빠르게 도움 노출)", () => {
    assert.equal(getStuckHintDelayMs({ ...params, wrongCellCount: 2 }), 5000);
    assert.equal(getStuckHintDelayMs({ ...params, wrongCellCount: 3 }), 5000);
  });

  it("오답이 임계치 미만이면 기본 정체 지연을 쓴다", () => {
    assert.equal(getStuckHintDelayMs({ ...params, wrongCellCount: 0 }), 20000);
    assert.equal(getStuckHintDelayMs({ ...params, wrongCellCount: 1 }), 20000);
  });

  // 원격 설정(launchConfig)으로 임계·지연을 조정하면 그 값이 그대로 반영돼야 한다.
  // App.tsx의 막힘 힌트 effect는 이 순수 로직으로 지연을 계산하고, 임계/지연이 바뀌면
  // 타이머를 취소·재스케줄하므로 여기서 config 주입에 따른 지연 선택을 회귀로 고정한다.
  it("원격 조정된 지연·임계 값을 그대로 반영한다", () => {
    const tuned = { wrongCellThreshold: 4, idleMs: 30000, wrongIdleMs: 8000 };
    // 임계(4) 미만이면 조정된 기본 지연(30000)
    assert.equal(getStuckHintDelayMs({ ...tuned, wrongCellCount: 3 }), 30000);
    // 임계(4) 이상이면 조정된 짧은 지연(8000)
    assert.equal(getStuckHintDelayMs({ ...tuned, wrongCellCount: 4 }), 8000);
  });

  it("임계값만 바뀌어도 같은 오답 수에서 선택되는 지연 티어가 달라진다", () => {
    // wrongCellCount=2 고정. 임계 2면 짧은 지연, 임계 3이면 기본 지연으로 전환된다.
    assert.equal(
      getStuckHintDelayMs({ ...params, wrongCellThreshold: 2, wrongCellCount: 2 }),
      5000,
    );
    assert.equal(
      getStuckHintDelayMs({ ...params, wrongCellThreshold: 3, wrongCellCount: 2 }),
      20000,
    );
  });
});

describe("resolveVerticalArrowAction", () => {
  it("세로(down) 단어에서는 ↓가 다음 칸, ↑가 이전 칸으로 이동한다", () => {
    assert.deepEqual(
      resolveVerticalArrowAction({
        key: "ArrowDown",
        selectedDirection: "down",
        hasCrossingDownEntry: true,
      }),
      { type: "move", delta: 1 },
    );
    assert.deepEqual(
      resolveVerticalArrowAction({
        key: "ArrowUp",
        selectedDirection: "down",
        hasCrossingDownEntry: false,
      }),
      { type: "move", delta: -1 },
    );
  });

  it("가로(across) 단어에서 교차 세로 단어가 있으면 세로로 방향을 토글한다", () => {
    assert.deepEqual(
      resolveVerticalArrowAction({
        key: "ArrowDown",
        selectedDirection: "across",
        hasCrossingDownEntry: true,
      }),
      { type: "toggleDown" },
    );
    // ↑도 동일하게 교차 세로 단어로 토글한다(이동 축이 세로이므로).
    assert.deepEqual(
      resolveVerticalArrowAction({
        key: "ArrowUp",
        selectedDirection: "across",
        hasCrossingDownEntry: true,
      }),
      { type: "toggleDown" },
    );
  });

  it("가로 단어에서 교차 세로 단어가 없으면 아무 동작도 하지 않는다", () => {
    assert.deepEqual(
      resolveVerticalArrowAction({
        key: "ArrowDown",
        selectedDirection: "across",
        hasCrossingDownEntry: false,
      }),
      { type: "none" },
    );
  });
});

describe("shouldOfferStuckWordReveal", () => {
  it("선택된 단어가 아직 미완성이면 정답 보기 탈출구를 노출한다", () => {
    assert.equal(
      shouldOfferStuckWordReveal({
        hasSelectedEntry: true,
        isSelectedEntryComplete: false,
      }),
      true,
    );
  });

  it("선택 단어가 없거나 이미 정답이면 노출하지 않는다", () => {
    assert.equal(
      shouldOfferStuckWordReveal({
        hasSelectedEntry: false,
        isSelectedEntryComplete: false,
      }),
      false,
    );
    assert.equal(
      shouldOfferStuckWordReveal({
        hasSelectedEntry: true,
        isSelectedEntryComplete: true,
      }),
      false,
    );
  });
});

describe("shouldCelebrateOnboardingWordCompletion", () => {
  it("온보딩 퍼즐에서 단어를 새로 완성하면(퍼즐 전체 완성 제외) 시각 피드백을 준다", () => {
    assert.equal(
      shouldCelebrateOnboardingWordCompletion({
        isOnboardingPuzzle: true,
        justCompletedWord: true,
        puzzleComplete: false,
      }),
      true,
    );
  });

  it("온보딩이 아니거나, 완성한 단어가 없거나, 퍼즐 전체 완성 순간이면 주지 않는다", () => {
    assert.equal(
      shouldCelebrateOnboardingWordCompletion({
        isOnboardingPuzzle: false,
        justCompletedWord: true,
        puzzleComplete: false,
      }),
      false,
    );
    assert.equal(
      shouldCelebrateOnboardingWordCompletion({
        isOnboardingPuzzle: true,
        justCompletedWord: false,
        puzzleComplete: false,
      }),
      false,
    );
    assert.equal(
      shouldCelebrateOnboardingWordCompletion({
        isOnboardingPuzzle: true,
        justCompletedWord: true,
        puzzleComplete: true,
      }),
      false,
    );
  });
});

describe("getNewlyReachedProgressMilestones", () => {
  it("진행률이 마일스톤을 새로 넘으면 해당 마일스톤을 돌려준다", () => {
    assert.deepEqual(getNewlyReachedProgressMilestones(0, 30), [25]);
    assert.deepEqual(getNewlyReachedProgressMilestones(50, 80), [75]);
  });

  it("한 번에 여러 마일스톤을 넘으면 모두 오름차순으로 돌려준다", () => {
    assert.deepEqual(getNewlyReachedProgressMilestones(0, 60), [25, 50]);
    assert.deepEqual(
      getNewlyReachedProgressMilestones(0, 100),
      [...PUZZLE_PROGRESS_MILESTONES],
    );
  });

  it("진행률이 줄거나 그대로면 빈 배열을 돌려준다(중복 emit 방지)", () => {
    assert.deepEqual(getNewlyReachedProgressMilestones(50, 50), []);
    assert.deepEqual(getNewlyReachedProgressMilestones(75, 40), []);
  });

  it("이미 넘어선 마일스톤은 다시 돌려주지 않는다", () => {
    assert.deepEqual(getNewlyReachedProgressMilestones(25, 49), []);
    assert.deepEqual(getNewlyReachedProgressMilestones(25, 50), [50]);
  });
});

describe("getProgressMilestoneRewardMessage", () => {
  it("마일스톤 구간별 보상 메시지를 돌려준다", () => {
    assert.match(getProgressMilestoneRewardMessage(25), /4분의 1/);
    assert.match(getProgressMilestoneRewardMessage(50), /절반/);
    assert.match(getProgressMilestoneRewardMessage(75), /거의/);
  });
});

describe("shouldServeOnboardingPuzzle", () => {
  it("신규 사용자(완료·진행 이력 없음)에게 입문 퍼즐을 제공한다", () => {
    assert.equal(
      shouldServeOnboardingPuzzle({
        hasCompletedAnyDaily: false,
        hasDailyProgress: false,
        onboardingCompleted: false,
      }),
      true,
    );
  });

  it("입문 퍼즐을 이미 완료했으면 제공하지 않는다", () => {
    assert.equal(
      shouldServeOnboardingPuzzle({
        hasCompletedAnyDaily: false,
        hasDailyProgress: false,
        onboardingCompleted: true,
      }),
      false,
    );
  });

  it("일반 퍼즐을 완료한 적이 있으면 제공하지 않는다", () => {
    assert.equal(
      shouldServeOnboardingPuzzle({
        hasCompletedAnyDaily: true,
        hasDailyProgress: false,
        onboardingCompleted: false,
      }),
      false,
    );
  });

  it("일반 퍼즐을 진행 중이면 제공하지 않는다", () => {
    assert.equal(
      shouldServeOnboardingPuzzle({
        hasCompletedAnyDaily: false,
        hasDailyProgress: true,
        onboardingCompleted: false,
      }),
      false,
    );
  });
});

describe("shouldQuickStartActivePuzzle", () => {
  const onboardingPuzzleId = "onboarding-easy-01";
  const todayPuzzleId = "2026-06-26-normal-01";

  it("활성 퍼즐이 오늘의 일반 퍼즐이면 현재 퍼즐을 시작한다", () => {
    assert.equal(
      shouldQuickStartActivePuzzle({
        activePuzzleId: todayPuzzleId,
        onboardingPuzzleId,
        todayPuzzleId,
      }),
      true,
    );
  });

  it("신규 사용자의 입문(easy) 퍼즐이 활성 상태면 일반 퍼즐로 전환하지 않는다", () => {
    assert.equal(
      shouldQuickStartActivePuzzle({
        activePuzzleId: onboardingPuzzleId,
        onboardingPuzzleId,
        todayPuzzleId,
      }),
      true,
    );
  });

  it("다른 날짜의 일반 퍼즐을 보던 중이면 오늘의 퍼즐로 전환한다", () => {
    assert.equal(
      shouldQuickStartActivePuzzle({
        activePuzzleId: "2026-06-20-normal-01",
        onboardingPuzzleId,
        todayPuzzleId,
      }),
      false,
    );
  });

  it("오늘의 퍼즐이 아직 없으면 현재 퍼즐을 시작한다", () => {
    assert.equal(
      shouldQuickStartActivePuzzle({
        activePuzzleId: onboardingPuzzleId,
        onboardingPuzzleId,
        todayPuzzleId: undefined,
      }),
      true,
    );
  });
});

describe("resolveInitialActivePuzzleId", () => {
  const onboardingPuzzleId = "onboarding-easy-01";
  const dailyPuzzleId = "pack-2026062608-01";

  const newUser = {
    dailyPuzzleId,
    hasCompletedAnyDaily: false,
    hasDailyProgress: false,
    onboardingAvailable: true,
    onboardingCompleted: false,
    onboardingPuzzleId,
  };

  // 신규 사용자의 첫 활성 퍼즐은 부팅·앱 재진입 등 모든 진입 경로에서 입문(easy)
  // 퍼즐로 유지되어야 한다(easy attempt 0건 회귀 방지).
  it("신규 사용자(완료·진행 이력 없음)의 첫 활성 퍼즐은 입문 퍼즐이다", () => {
    assert.equal(resolveInitialActivePuzzleId(newUser), onboardingPuzzleId);
  });

  it("일반 일일 퍼즐(날짜 카드) 후보가 있어도 신규 사용자에게는 입문 퍼즐을 유지한다", () => {
    // 날짜 카드 리스트가 채워져 일반 퍼즐 id가 후보로 주어져도 입문이 우선이다.
    assert.equal(
      resolveInitialActivePuzzleId({
        ...newUser,
        dailyPuzzleId: "pack-2026062608-99",
      }),
      onboardingPuzzleId,
    );
  });

  it("입문 퍼즐 진행 중(미완료)인 재진입 사용자도 입문 퍼즐을 유지한다", () => {
    // 입문을 시작했지만 끝내지 않은 신규 사용자가 앱을 다시 열면 입문이 복원된다.
    assert.equal(
      resolveInitialActivePuzzleId({ ...newUser, onboardingCompleted: false }),
      onboardingPuzzleId,
    );
  });

  it("입문 퍼즐을 이미 완료했으면 일반 일일 퍼즐로 보낸다", () => {
    assert.equal(
      resolveInitialActivePuzzleId({ ...newUser, onboardingCompleted: true }),
      dailyPuzzleId,
    );
  });

  it("일반 퍼즐을 완료한 적이 있는 복귀 사용자는 일반 일일 퍼즐로 보낸다", () => {
    assert.equal(
      resolveInitialActivePuzzleId({
        ...newUser,
        hasCompletedAnyDaily: true,
      }),
      dailyPuzzleId,
    );
  });

  it("일반 퍼즐을 진행 중인 사용자는 일반 일일 퍼즐로 보낸다", () => {
    assert.equal(
      resolveInitialActivePuzzleId({ ...newUser, hasDailyProgress: true }),
      dailyPuzzleId,
    );
  });

  it("입문 세션을 불러올 수 없으면(미가용) 안전하게 일반 일일 퍼즐로 폴백한다", () => {
    assert.equal(
      resolveInitialActivePuzzleId({ ...newUser, onboardingAvailable: false }),
      dailyPuzzleId,
    );
  });
});

describe("getOpenPuzzleSummariesForDate", () => {
  const now = Date.parse("2026-06-12T02:00:00.000Z");

  it("excludes unpublished same-day remote slots from the open puzzle rail", () => {
    const dailyFreeSummary = createSummary("published-default", {
      publishedAt: "2026-06-11T15:00:00.000Z",
      slotId: "2026-06-12-h00",
    });
    const futureUnlocked = createSummary("future-bonus", {
      publishedAt: "2026-06-12T13:00:00.000Z",
      slotId: "2026-06-12-h22",
    });
    const futureSelected = createSummary("future-selected", {
      publishedAt: "2026-06-12T11:00:00.000Z",
      slotId: "2026-06-12-h20",
    });

    const result = getOpenPuzzleSummariesForDate({
      archivePuzzleSummaries: [],
      date: "2026-06-12",
      dailyFreeSummary,
      now,
      selectedPuzzleSummary: futureSelected,
      unlockedBonusSummaries: [futureUnlocked],
    });

    assert.deepEqual(
      result.map((summary) => summary.puzzleId),
      ["published-default"],
    );
  });

  it("uses slotId when publishedAt is missing to exclude future remote slots", () => {
    const currentSlot = createSummary("current-slot", {
      publishedAt: undefined,
      slotId: "2026-06-12-h10",
    });
    const futureSlot = createSummary("future-slot", {
      publishedAt: undefined,
      slotId: "2026-06-12-h12",
    });

    const result = getOpenPuzzleSummariesForDate({
      archivePuzzleSummaries: [],
      date: "2026-06-12",
      dailyFreeSummary: currentSlot,
      now,
      unlockedBonusSummaries: [futureSlot],
    });

    assert.deepEqual(
      result.map((summary) => summary.puzzleId),
      ["current-slot"],
    );
  });

  it("keeps archived same-day records even when their publishedAt is in the future", () => {
    const archivedFuture = createSummary("archived-future", {
      publishedAt: "2026-06-12T13:00:00.000Z",
      slotId: "2026-06-12-h22",
    });

    const result = getOpenPuzzleSummariesForDate({
      archivePuzzleSummaries: [archivedFuture],
      date: "2026-06-12",
      now,
      unlockedBonusSummaries: [],
    });

    assert.deepEqual(
      result.map((summary) => summary.puzzleId),
      ["archived-future"],
    );
  });

  it("fills missing duplicate metadata without letting lower-priority records overwrite it", () => {
    const selectedSummary = createSummary("same-puzzle", {
      path: "",
    });
    const unlockedSummary = createSummary("same-puzzle", {
      publishedAt: "2026-06-12T01:00:00.000Z",
      slotId: "2026-06-12-h10",
    });
    const archivedSummary = createSummary("same-puzzle", {
      publishedAt: "2026-06-12T13:00:00.000Z",
      slotId: "2026-06-12-h22",
    });

    const result = getOpenPuzzleSummariesForDate({
      archivePuzzleSummaries: [archivedSummary],
      date: "2026-06-12",
      now,
      selectedPuzzleSummary: selectedSummary,
      unlockedBonusSummaries: [unlockedSummary],
    });

    assert.equal(result.length, 1);
    assert.equal(result[0]?.puzzleId, "same-puzzle");
    assert.equal(result[0]?.slotId, "2026-06-12-h10");
    assert.equal(result[0]?.path, "/puzzles/same-puzzle.json");
    assert.equal(getPuzzleDailySequenceNumber(result[0]!), 6);
  });
});

describe("isPublishedPuzzle", () => {
  const now = Date.parse("2026-06-12T10:00:00.000Z");

  it("returns true when publishedAt is absent", () => {
    assert.equal(isPublishedPuzzle(createSummary("p1"), now), true);
  });

  it("returns true when publishedAt is in the past", () => {
    assert.equal(
      isPublishedPuzzle(createSummary("p2", { publishedAt: "2026-06-12T09:00:00.000Z" }), now),
      true,
    );
  });

  it("returns false when publishedAt is in the future", () => {
    assert.equal(
      isPublishedPuzzle(createSummary("p3", { publishedAt: "2026-06-12T11:00:00.000Z" }), now),
      false,
    );
  });

  it("falls back to slotId hour when publishedAt is absent", () => {
    // slotId "2026-06-12-h08" → 08:00 KST = 23:00 UTC previous day = before now
    assert.equal(
      isPublishedPuzzle(createSummary("p4", { slotId: "2026-06-12-h08" }), now),
      true,
    );
    // slotId "2026-06-12-h20" → 20:00 KST = 11:00 UTC = after now
    assert.equal(
      isPublishedPuzzle(createSummary("p5", { slotId: "2026-06-12-h20" }), now),
      false,
    );
  });
});

describe("getPuzzlePackAlias", () => {
  it("uses explicit alias when provided", () => {
    assert.equal(getPuzzlePackAlias({ alias: "my-alias" }), "my-alias");
  });

  it("normalizes slotId to compact YYMMDDH2 alias", () => {
    assert.equal(getPuzzlePackAlias({ slotId: "2026-06-12-h10" }), "260612" + "10");
  });

  it("derives alias from publishedAt in Seoul time", () => {
    // 2026-06-12T01:00:00Z = 2026-06-12T10:00:00+09:00
    const alias = getPuzzlePackAlias({ publishedAt: "2026-06-12T01:00:00.000Z" });
    assert.equal(alias, "26061210");
  });

  it("normalizes pack-YYYYMMDDHHMMSS packId", () => {
    assert.equal(getPuzzlePackAlias({ packId: "pack-20260612100000" }), "26061210");
  });

  it("falls back to date-based alias", () => {
    assert.equal(getPuzzlePackAlias({ date: "2026-06-12" }), "260612");
  });
});

describe("getStreakBadgeLabel", () => {
  it("returns null for streak 0", () => {
    assert.equal(getStreakBadgeLabel(0), null);
  });

  it("returns N일 연속 for streak 1-6", () => {
    assert.equal(getStreakBadgeLabel(1), "🔥 1일 연속");
    assert.equal(getStreakBadgeLabel(6), "🔥 6일 연속");
  });

  it("returns 일주일 연속 for streak 7-29", () => {
    assert.equal(getStreakBadgeLabel(7), "🔥 일주일 연속 (7일)");
    assert.equal(getStreakBadgeLabel(29), "🔥 일주일 연속 (29일)");
  });

  it("returns 한 달 연속 for streak 30-99", () => {
    assert.equal(getStreakBadgeLabel(30), "🏆 한 달 연속 (30일)");
    assert.equal(getStreakBadgeLabel(99), "🏆 한 달 연속 (99일)");
  });

  it("returns N일 연속 trophy for streak >= 100", () => {
    assert.equal(getStreakBadgeLabel(100), "🏆 100일 연속");
    assert.equal(getStreakBadgeLabel(365), "🏆 365일 연속");
  });
});

describe("getNextStreakMilestoneHint", () => {
  it("returns null for streak 0", () => {
    assert.equal(getNextStreakMilestoneHint(0), null);
  });

  it("returns null when streak is far from next milestone", () => {
    assert.equal(getNextStreakMilestoneHint(1), null);
    assert.equal(getNextStreakMilestoneHint(3), null);
  });

  it("returns 3-day hint for 3 days before 7-day milestone", () => {
    assert.equal(getNextStreakMilestoneHint(4), "3일만 더하면 일주일 연속이에요!");
    assert.equal(getNextStreakMilestoneHint(5), "2일만 더하면 일주일 연속이에요!");
    assert.equal(getNextStreakMilestoneHint(6), "내일 풀면 일주일 연속이에요!");
  });

  it("returns null once milestone is reached", () => {
    assert.equal(getNextStreakMilestoneHint(7), null);
    assert.equal(getNextStreakMilestoneHint(30), null);
    assert.equal(getNextStreakMilestoneHint(100), null);
  });

  it("returns hint for 3 days before 30-day milestone", () => {
    assert.equal(getNextStreakMilestoneHint(27), "3일만 더하면 한 달 연속이에요!");
    assert.equal(getNextStreakMilestoneHint(29), "내일 풀면 한 달 연속이에요!");
  });

  it("returns hint for 3 days before 100-day milestone", () => {
    assert.equal(getNextStreakMilestoneHint(97), "3일만 더하면 100일 연속이에요!");
    assert.equal(getNextStreakMilestoneHint(99), "내일 풀면 100일 연속이에요!");
  });
});

describe("getStreakMilestoneProgress", () => {
  it("returns null for streak 0 or non-finite inputs", () => {
    assert.equal(getStreakMilestoneProgress(0), null);
    assert.equal(getStreakMilestoneProgress(-1), null);
    assert.equal(getStreakMilestoneProgress(NaN), null);
    assert.equal(getStreakMilestoneProgress(Infinity), null);
    assert.equal(getStreakMilestoneProgress(-Infinity), null);
    assert.equal(getStreakMilestoneProgress(0.9), null);
  });

  it("floors non-integer streak values", () => {
    assert.equal(getStreakMilestoneProgress(1.9), "일주일 연속까지 6일 남았어요");
    assert.equal(getStreakMilestoneProgress(6.5), "내일 풀면 일주일 연속이에요!");
  });

  it("returns progress text for streak far from next milestone", () => {
    assert.equal(getStreakMilestoneProgress(1), "일주일 연속까지 6일 남았어요");
    assert.equal(getStreakMilestoneProgress(3), "일주일 연속까지 4일 남았어요");
    assert.equal(getStreakMilestoneProgress(7), "한 달 연속까지 23일 남았어요");
    assert.equal(getStreakMilestoneProgress(10), "한 달 연속까지 20일 남았어요");
    assert.equal(getStreakMilestoneProgress(30), "100일 연속까지 70일 남았어요");
  });

  it("returns urgent hint for streak within 3 days of 7-day milestone", () => {
    assert.equal(getStreakMilestoneProgress(4), "3일만 더하면 일주일 연속이에요!");
    assert.equal(getStreakMilestoneProgress(5), "2일만 더하면 일주일 연속이에요!");
    assert.equal(getStreakMilestoneProgress(6), "내일 풀면 일주일 연속이에요!");
  });

  it("returns urgent hint for streak within 3 days of 30-day milestone", () => {
    assert.equal(getStreakMilestoneProgress(27), "3일만 더하면 한 달 연속이에요!");
    assert.equal(getStreakMilestoneProgress(29), "내일 풀면 한 달 연속이에요!");
  });

  it("returns urgent hint for streak within 3 days of 100-day milestone", () => {
    assert.equal(getStreakMilestoneProgress(97), "3일만 더하면 100일 연속이에요!");
    assert.equal(getStreakMilestoneProgress(99), "내일 풀면 100일 연속이에요!");
  });

  it("returns null once 100-day milestone is reached", () => {
    assert.equal(getStreakMilestoneProgress(100), null);
    assert.equal(getStreakMilestoneProgress(365), null);
  });
});

describe("getDailyFreePuzzleSummary", () => {
  const today = "2026-06-12";
  const now = Date.parse("2026-06-12T02:00:00.000Z");

  it("returns the earliest published puzzle for today", () => {
    const early = createSummary("early", { date: today, publishedAt: "2026-06-12T00:00:00.000Z", slotId: "2026-06-12-h00" });
    const late = createSummary("late", { date: today, publishedAt: "2026-06-12T01:00:00.000Z", slotId: "2026-06-12-h02" });

    const result = getDailyFreePuzzleSummary([late, early], today, now);
    assert.equal(result?.puzzleId, "early");
  });

  it("falls back to the most recent past date when no today puzzle exists", () => {
    const yesterday = createSummary("yesterday", { date: "2026-06-11", publishedAt: "2026-06-11T00:00:00.000Z" });
    const twoDaysAgo = createSummary("two-days-ago", { date: "2026-06-10", publishedAt: "2026-06-10T00:00:00.000Z" });

    const result = getDailyFreePuzzleSummary([twoDaysAgo, yesterday], today, now);
    assert.equal(result?.puzzleId, "yesterday");
  });

  it("excludes future puzzles even when on today's date", () => {
    const past = createSummary("past", { date: today, publishedAt: "2026-06-12T01:00:00.000Z" });
    const future = createSummary("future", { date: today, publishedAt: "2026-06-12T03:00:00.000Z" });

    const result = getDailyFreePuzzleSummary([past, future], today, now);
    assert.equal(result?.puzzleId, "past");
  });
});

describe("isWrongCellVisible", () => {
  it("정답/미입력 셀(isWrong=false)은 autocheck·강조와 무관하게 표시하지 않는다", () => {
    assert.equal(
      isWrongCellVisible({
        isWrong: false,
        autocheckEnabled: true,
        isChecked: true,
      }),
      false,
    );
  });

  it("autocheck 켜짐이면 오답 셀을 표시한다", () => {
    assert.equal(
      isWrongCellVisible({
        isWrong: true,
        autocheckEnabled: true,
        isChecked: false,
      }),
      true,
    );
  });

  it("autocheck 꺼짐 + 미강조면 오답 셀을 표시하지 않는다", () => {
    assert.equal(
      isWrongCellVisible({
        isWrong: true,
        autocheckEnabled: false,
        isChecked: false,
      }),
      false,
    );
  });

  it("autocheck 꺼짐이어도 '이 단어 확인'으로 강조 중이면 오답을 일시 표시한다", () => {
    assert.equal(
      isWrongCellVisible({
        isWrong: true,
        autocheckEnabled: false,
        isChecked: true,
      }),
      true,
    );
  });
});
