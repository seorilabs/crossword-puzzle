import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  createPuzzleSummary,
  DEFAULT_HINT_CREDITS,
  DEFAULT_HINT_CREDITS_BY_DIFFICULTY,
  getDefaultHintCreditsForDifficulty,
  getDailyFreePuzzleSummary,
  getNewlyReachedStreakMilestone,
  getNextStreakMilestoneHint,
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
  shouldAutoStartFirstRun,
  shouldServeOnboardingPuzzle,
  shouldShowFirstInputGuide,
  getStuckHintDelayMs,
  getStuckHintBackoffDelayMs,
  shouldScheduleStuckHintPrompt,
  isNearFinishNudge,
  getStuckHintPromptText,
  resolveVerticalArrowAction,
  shouldOfferStuckWordReveal,
  shouldCelebrateOnboardingWordCompletion,
} from "./uiPolicy.ts";
import { getFirstIncompleteEntry } from "./puzzle.ts";
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
  const a1 = createEntry({
    id: "a1",
    answer: "가나",
    direction: "across",
    row: 0,
    col: 0,
  });
  const a2 = createEntry({
    id: "a2",
    answer: "다라",
    direction: "across",
    row: 0,
    col: 3,
  });
  const d1 = createEntry({
    id: "d1",
    answer: "가마바",
    direction: "down",
    row: 0,
    col: 0,
  });

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
  const params = {
    firstInputPending: false,
    firstInputIdleMs: 6000,
    wrongCellThreshold: 2,
    idleMs: 20000,
    wrongIdleMs: 5000,
  };

  it("첫 입력 전에는 오답 수와 무관하게 전용 짧은 지연을 최우선으로 쓴다(#346)", () => {
    assert.equal(
      getStuckHintDelayMs({
        ...params,
        firstInputPending: true,
        wrongCellCount: 0,
      }),
      6000,
    );
    assert.equal(
      getStuckHintDelayMs({
        ...params,
        firstInputPending: true,
        wrongCellCount: 2,
      }),
      6000,
    );
  });

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
    const tuned = {
      firstInputPending: false,
      firstInputIdleMs: 7000,
      wrongCellThreshold: 4,
      idleMs: 30000,
      wrongIdleMs: 8000,
    };
    // 임계(4) 미만이면 조정된 기본 지연(30000)
    assert.equal(getStuckHintDelayMs({ ...tuned, wrongCellCount: 3 }), 30000);
    // 임계(4) 이상이면 조정된 짧은 지연(8000)
    assert.equal(getStuckHintDelayMs({ ...tuned, wrongCellCount: 4 }), 8000);
  });

  it("임계값만 바뀌어도 같은 오답 수에서 선택되는 지연 티어가 달라진다", () => {
    // wrongCellCount=2 고정. 임계 2면 짧은 지연, 임계 3이면 기본 지연으로 전환된다.
    assert.equal(
      getStuckHintDelayMs({
        ...params,
        wrongCellThreshold: 2,
        wrongCellCount: 2,
      }),
      5000,
    );
    assert.equal(
      getStuckHintDelayMs({
        ...params,
        wrongCellThreshold: 3,
        wrongCellCount: 2,
      }),
      20000,
    );
  });
});

describe("shouldScheduleStuckHintPrompt (#254)", () => {
  const caps = { maxPromptsPerAttempt: 3, maxDismissals: 2 };

  it("노출/닫기 상한 미만이면 스케줄한다", () => {
    assert.equal(
      shouldScheduleStuckHintPrompt({ promptSeq: 0, dismissCount: 0, ...caps }),
      true,
    );
    assert.equal(
      shouldScheduleStuckHintPrompt({ promptSeq: 2, dismissCount: 1, ...caps }),
      true,
    );
  });

  it("노출 상한(promptSeq>=max)에 도달하면 스케줄하지 않는다", () => {
    assert.equal(
      shouldScheduleStuckHintPrompt({ promptSeq: 3, dismissCount: 0, ...caps }),
      false,
    );
  });

  it("닫기 상한(dismissCount>=max)에 도달하면 스케줄하지 않는다", () => {
    assert.equal(
      shouldScheduleStuckHintPrompt({ promptSeq: 0, dismissCount: 2, ...caps }),
      false,
    );
  });

  it("상한이 0 이하면 그 축은 무제한으로 본다", () => {
    assert.equal(
      shouldScheduleStuckHintPrompt({
        promptSeq: 100,
        dismissCount: 100,
        maxPromptsPerAttempt: 0,
        maxDismissals: 0,
      }),
      true,
    );
  });
});

describe("isNearFinishNudge (#280)", () => {
  const thresholds = { progressThreshold: 90, wordsRemainingThreshold: 2 };

  it("잔여 단어가 임계 이하면 near-finish다(진행률 낮아도)", () => {
    assert.equal(
      isNearFinishNudge({
        progressPercent: 40,
        wordsRemaining: 2,
        ...thresholds,
      }),
      true,
    );
    assert.equal(
      isNearFinishNudge({
        progressPercent: 40,
        wordsRemaining: 1,
        ...thresholds,
      }),
      true,
    );
  });

  it("진행률이 임계 이상이면 near-finish다(잔여 단어 많아도)", () => {
    assert.equal(
      isNearFinishNudge({
        progressPercent: 90,
        wordsRemaining: 5,
        ...thresholds,
      }),
      true,
    );
  });

  it("두 임계 모두 밖이면 near-finish가 아니다", () => {
    assert.equal(
      isNearFinishNudge({
        progressPercent: 89,
        wordsRemaining: 3,
        ...thresholds,
      }),
      false,
    );
  });

  it("잔여 단어가 0(완료)이면 임계와 무관하게 near-finish가 아니다", () => {
    assert.equal(
      isNearFinishNudge({
        progressPercent: 100,
        wordsRemaining: 0,
        ...thresholds,
      }),
      false,
    );
  });
});

describe("getStuckHintPromptText (#280)", () => {
  it("첫 입력 전에는 힌트 소비 대신 입력 개시 문구를 돌려준다(#346)", () => {
    assert.equal(
      getStuckHintPromptText({
        trigger: "first_input",
        nearFinish: true,
        wordsRemaining: 1,
        hasHintCredits: true,
      }),
      "반짝이는 칸을 탭해 글자를 입력해 보세요 ✏️",
    );
  });
  it("near-finish면 잔여 단어 수를 포함한 마무리 문구를 돌려준다", () => {
    assert.equal(
      getStuckHintPromptText({
        nearFinish: true,
        wordsRemaining: 2,
        hasHintCredits: true,
      }),
      "거의 다 왔어요! 남은 단어 2개 ✨",
    );
    // near-finish 문구는 힌트 보유 여부와 무관하다.
    assert.equal(
      getStuckHintPromptText({
        nearFinish: true,
        wordsRemaining: 1,
        hasHintCredits: false,
      }),
      "거의 다 왔어요! 남은 단어 1개 ✨",
    );
  });

  it("near-finish가 아니면 힌트 보유 여부에 따른 기존 막힘 문구를 돌려준다", () => {
    assert.equal(
      getStuckHintPromptText({
        nearFinish: false,
        wordsRemaining: 5,
        hasHintCredits: true,
      }),
      "막혔나요? 지금 힌트는 무료예요 💡",
    );
    assert.equal(
      getStuckHintPromptText({
        nearFinish: false,
        wordsRemaining: 5,
        hasHintCredits: false,
      }),
      "막혔나요? 광고를 보면 힌트를 받을 수 있어요",
    );
  });

  it("near-finish 문구가 잔여 단어 수를 포함하고 수락 CTA가 첫 미완성 단어로 이동한다(#280 · AC-3)", () => {
    // 문구: 잔여 단어 수를 포함한 마무리 문구. (App이 이 함수를 stuckHintPromptText에 사용.)
    const a1 = {
      id: "a1",
      answer: "가나다",
      direction: "across" as const,
      row: 0,
      col: 0,
      clue: "",
      generatedBy: "placed" as const,
    };
    const d1 = {
      id: "d1",
      answer: "다라",
      direction: "down" as const,
      row: 0,
      col: 2,
      clue: "",
      generatedBy: "placed" as const,
    };
    const cellValues = { "0:0": "가", "0:1": "나", "0:2": "다" }; // a1 완성, d1 미완성
    const wordsRemaining = [a1, d1].filter(
      (entry) => getFirstIncompleteEntry([entry], cellValues) != null,
    ).length;
    assert.equal(
      getStuckHintPromptText({
        nearFinish: true,
        wordsRemaining,
        hasHintCredits: true,
      }),
      `거의 다 왔어요! 남은 단어 ${wordsRemaining}개 ✨`,
    );
    // 수락 CTA 이동 대상: 남은 미완성 단어 중 첫 단서(App acceptNearFinishNudge → selectEntry).
    assert.equal(getFirstIncompleteEntry([a1, d1], cellValues)?.id, "d1");
  });
});

describe("getStuckHintBackoffDelayMs (#254)", () => {
  it("닫은 적 없으면 기본 지연 그대로다", () => {
    assert.equal(
      getStuckHintBackoffDelayMs({
        baseDelayMs: 5000,
        dismissCount: 0,
        backoffFactor: 2,
      }),
      5000,
    );
  });

  it("닫을 때마다 지연이 배수로 증가한다(지수 백오프)", () => {
    assert.equal(
      getStuckHintBackoffDelayMs({
        baseDelayMs: 5000,
        dismissCount: 1,
        backoffFactor: 2,
      }),
      10000,
    );
    assert.equal(
      getStuckHintBackoffDelayMs({
        baseDelayMs: 5000,
        dismissCount: 2,
        backoffFactor: 2,
      }),
      20000,
    );
  });

  it("배수 1 이하면 백오프가 없다", () => {
    assert.equal(
      getStuckHintBackoffDelayMs({
        baseDelayMs: 5000,
        dismissCount: 3,
        backoffFactor: 1,
      }),
      5000,
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
    assert.deepEqual(getNewlyReachedProgressMilestones(0, 100), [
      ...PUZZLE_PROGRESS_MILESTONES,
    ]);
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

describe("shouldAutoStartFirstRun (#205)", () => {
  // 도전 이력이 전혀 없는 신규 + 게이트 ON + 온보딩 활성 배정의 기준 입력.
  const freshFirstRun = {
    enabled: true,
    hasCompletedAnyDaily: false,
    hasDailyProgress: false,
    onboardingStarted: false,
    activePuzzleIsOnboarding: true,
  };

  it("도전 이력이 전혀 없는 신규 첫 실행이면 자동 진입한다", () => {
    assert.equal(shouldAutoStartFirstRun(freshFirstRun), true);
  });

  it("원격 설정 게이트가 꺼져 있으면 신규여도 자동 진입하지 않는다", () => {
    assert.equal(
      shouldAutoStartFirstRun({ ...freshFirstRun, enabled: false }),
      false,
    );
  });

  it("일일 퍼즐 완료 이력이 있는 기존 사용자는 홈으로 진입한다", () => {
    assert.equal(
      shouldAutoStartFirstRun({ ...freshFirstRun, hasCompletedAnyDaily: true }),
      false,
    );
  });

  it("일일 퍼즐 진행(시도) 이력이 있으면 자동 진입하지 않는다", () => {
    assert.equal(
      shouldAutoStartFirstRun({ ...freshFirstRun, hasDailyProgress: true }),
      false,
    );
  });

  it("온보딩 퍼즐 시도 이력이 있으면 자동 진입하지 않는다", () => {
    assert.equal(
      shouldAutoStartFirstRun({ ...freshFirstRun, onboardingStarted: true }),
      false,
    );
  });

  it("온보딩 퍼즐이 첫 활성 퍼즐로 배정되지 않았으면(세션 로드 실패 포함) 자동 진입하지 않는다", () => {
    assert.equal(
      shouldAutoStartFirstRun({
        ...freshFirstRun,
        activePuzzleIsOnboarding: false,
      }),
      false,
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

describe("isPublishedPuzzle", () => {
  const now = Date.parse("2026-06-12T10:00:00.000Z");

  it("returns true when publishedAt is absent", () => {
    assert.equal(isPublishedPuzzle(createSummary("p1"), now), true);
  });

  it("returns true when publishedAt is in the past", () => {
    assert.equal(
      isPublishedPuzzle(
        createSummary("p2", { publishedAt: "2026-06-12T09:00:00.000Z" }),
        now,
      ),
      true,
    );
  });

  it("returns false when publishedAt is in the future", () => {
    assert.equal(
      isPublishedPuzzle(
        createSummary("p3", { publishedAt: "2026-06-12T11:00:00.000Z" }),
        now,
      ),
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
    assert.equal(
      getPuzzlePackAlias({ slotId: "2026-06-12-h10" }),
      "260612" + "10",
    );
  });

  it("derives alias from publishedAt in Seoul time", () => {
    // 2026-06-12T01:00:00Z = 2026-06-12T10:00:00+09:00
    const alias = getPuzzlePackAlias({
      publishedAt: "2026-06-12T01:00:00.000Z",
    });
    assert.equal(alias, "26061210");
  });

  it("normalizes pack-YYYYMMDDHHMMSS packId", () => {
    assert.equal(
      getPuzzlePackAlias({ packId: "pack-20260612100000" }),
      "26061210",
    );
  });

  it("falls back to date-based alias", () => {
    assert.equal(getPuzzlePackAlias({ date: "2026-06-12" }), "260612");
  });
});

describe("createPuzzleSummary", () => {
  function createPuzzle(overrides: Partial<Puzzle> = {}): Puzzle {
    return {
      puzzleId: "2026-06-12-normal-01",
      date: "2026-06-12",
      difficulty: "hard",
      gridSize: 8,
      grid: [],
      entries: [],
      metrics: { wordCount: 12 } as Puzzle["metrics"],
      ...overrides,
    };
  }

  it("carries difficulty into the summary", () => {
    const summary = createPuzzleSummary(createPuzzle({ difficulty: "hard" }));
    assert.equal(summary.difficulty, "hard");
  });

  it("passes themeTag and themeLabel through for themed puzzles (#248)", () => {
    const summary = createPuzzleSummary(
      createPuzzle({ themeTag: "food", themeLabel: "음식" }),
    );
    assert.equal(summary.themeTag, "food");
    assert.equal(summary.themeLabel, "음식");
  });

  it("leaves theme fields undefined for non-themed puzzles (#248)", () => {
    const summary = createPuzzleSummary(createPuzzle());
    assert.equal(summary.themeTag, undefined);
    assert.equal(summary.themeLabel, undefined);
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
    assert.equal(
      getNextStreakMilestoneHint(4),
      "3일만 더하면 일주일 연속이에요!",
    );
    assert.equal(
      getNextStreakMilestoneHint(5),
      "2일만 더하면 일주일 연속이에요!",
    );
    assert.equal(getNextStreakMilestoneHint(6), "내일 풀면 일주일 연속이에요!");
  });

  it("returns null once milestone is reached", () => {
    assert.equal(getNextStreakMilestoneHint(7), null);
    assert.equal(getNextStreakMilestoneHint(30), null);
    assert.equal(getNextStreakMilestoneHint(100), null);
  });

  it("returns hint for 3 days before 30-day milestone", () => {
    assert.equal(
      getNextStreakMilestoneHint(27),
      "3일만 더하면 한 달 연속이에요!",
    );
    assert.equal(getNextStreakMilestoneHint(29), "내일 풀면 한 달 연속이에요!");
  });

  it("returns hint for 3 days before 100-day milestone", () => {
    assert.equal(
      getNextStreakMilestoneHint(97),
      "3일만 더하면 100일 연속이에요!",
    );
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
    assert.equal(
      getStreakMilestoneProgress(1.9),
      "일주일 연속까지 6일 남았어요",
    );
    assert.equal(
      getStreakMilestoneProgress(6.5),
      "내일 풀면 일주일 연속이에요!",
    );
  });

  it("returns progress text for streak far from next milestone", () => {
    assert.equal(getStreakMilestoneProgress(1), "일주일 연속까지 6일 남았어요");
    assert.equal(getStreakMilestoneProgress(3), "일주일 연속까지 4일 남았어요");
    assert.equal(getStreakMilestoneProgress(7), "한 달 연속까지 23일 남았어요");
    assert.equal(
      getStreakMilestoneProgress(10),
      "한 달 연속까지 20일 남았어요",
    );
    assert.equal(
      getStreakMilestoneProgress(30),
      "100일 연속까지 70일 남았어요",
    );
  });

  it("returns urgent hint for streak within 3 days of 7-day milestone", () => {
    assert.equal(
      getStreakMilestoneProgress(4),
      "3일만 더하면 일주일 연속이에요!",
    );
    assert.equal(
      getStreakMilestoneProgress(5),
      "2일만 더하면 일주일 연속이에요!",
    );
    assert.equal(getStreakMilestoneProgress(6), "내일 풀면 일주일 연속이에요!");
  });

  it("returns urgent hint for streak within 3 days of 30-day milestone", () => {
    assert.equal(
      getStreakMilestoneProgress(27),
      "3일만 더하면 한 달 연속이에요!",
    );
    assert.equal(getStreakMilestoneProgress(29), "내일 풀면 한 달 연속이에요!");
  });

  it("returns urgent hint for streak within 3 days of 100-day milestone", () => {
    assert.equal(
      getStreakMilestoneProgress(97),
      "3일만 더하면 100일 연속이에요!",
    );
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
    const early = createSummary("early", {
      date: today,
      publishedAt: "2026-06-12T00:00:00.000Z",
      slotId: "2026-06-12-h00",
    });
    const late = createSummary("late", {
      date: today,
      publishedAt: "2026-06-12T01:00:00.000Z",
      slotId: "2026-06-12-h02",
    });

    const result = getDailyFreePuzzleSummary([late, early], today, now);
    assert.equal(result?.puzzleId, "early");
  });

  it("falls back to the most recent past date when no today puzzle exists", () => {
    const yesterday = createSummary("yesterday", {
      date: "2026-06-11",
      publishedAt: "2026-06-11T00:00:00.000Z",
    });
    const twoDaysAgo = createSummary("two-days-ago", {
      date: "2026-06-10",
      publishedAt: "2026-06-10T00:00:00.000Z",
    });

    const result = getDailyFreePuzzleSummary(
      [twoDaysAgo, yesterday],
      today,
      now,
    );
    assert.equal(result?.puzzleId, "yesterday");
  });

  it("excludes future puzzles even when on today's date", () => {
    const past = createSummary("past", {
      date: today,
      publishedAt: "2026-06-12T01:00:00.000Z",
    });
    const future = createSummary("future", {
      date: today,
      publishedAt: "2026-06-12T03:00:00.000Z",
    });

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

describe("uiPolicy: 난이도별 기본 힌트 크레딧(#251)", () => {
  it("난이도 매핑은 easy<hard 로 단조 증가한다", () => {
    assert.equal(DEFAULT_HINT_CREDITS_BY_DIFFICULTY.easy, 2);
    assert.equal(DEFAULT_HINT_CREDITS_BY_DIFFICULTY.hard, 5);
    assert.ok(
      DEFAULT_HINT_CREDITS_BY_DIFFICULTY.easy <
        DEFAULT_HINT_CREDITS_BY_DIFFICULTY.hard,
    );
  });

  it("난이도가 없거나 폐지된 normal 이면 DEFAULT_HINT_CREDITS(=3)로 폴백한다", () => {
    assert.equal(getDefaultHintCreditsForDifficulty("normal"), 3);
    assert.equal(getDefaultHintCreditsForDifficulty(undefined), 3);
    assert.equal(
      getDefaultHintCreditsForDifficulty("normal"),
      DEFAULT_HINT_CREDITS,
    );
  });

  it("easy 는 2, hard 는 5를 돌려준다", () => {
    assert.equal(getDefaultHintCreditsForDifficulty("easy"), 2);
    assert.equal(getDefaultHintCreditsForDifficulty("hard"), 5);
  });

  it("난이도가 없거나 비정상이면 normal(=3)로 폴백한다", () => {
    assert.equal(getDefaultHintCreditsForDifficulty(undefined), 3);
    assert.equal(getDefaultHintCreditsForDifficulty(null), 3);
    assert.equal(getDefaultHintCreditsForDifficulty("legendary"), 3);
  });
});

describe("getNewlyReachedStreakMilestone (#292)", () => {
  it("AC-5: 이전 < 임계 ≤ 현재로 넘긴 마일스톤만 발화 조건으로 반환한다 (#292)", () => {
    assert.equal(getNewlyReachedStreakMilestone(6, 7), 7);
    assert.equal(getNewlyReachedStreakMilestone(29, 30), 30);
    assert.equal(getNewlyReachedStreakMilestone(99, 100), 100);
  });

  it("AC-5: 마일스톤을 넘기지 않은 증가는 null을 반환해 발화하지 않는다 (#292)", () => {
    assert.equal(getNewlyReachedStreakMilestone(7, 8), null);
    assert.equal(getNewlyReachedStreakMilestone(0, 1), null);
    assert.equal(getNewlyReachedStreakMilestone(30, 31), null);
  });

  it("AC-5: 이미 넘긴 마일스톤은 다시 세지 않는다 — 경계 재발화 방지 (#292)", () => {
    // 현재=임계이지만 이전에 이미 도달(이전 ≥ 임계)했으면 발화하지 않는다.
    assert.equal(getNewlyReachedStreakMilestone(7, 7), null);
    assert.equal(getNewlyReachedStreakMilestone(8, 8), null);
  });

  it("AC-5: 여러 마일스톤을 한 번에 점프하면 가장 높은 것 하나만 인정한다 (#292)", () => {
    assert.equal(getNewlyReachedStreakMilestone(5, 40), 30);
    assert.equal(getNewlyReachedStreakMilestone(0, 100), 100);
  });
});
