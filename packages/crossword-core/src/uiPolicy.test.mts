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
  shouldQuickStartActivePuzzle,
  shouldServeOnboardingPuzzle,
} from "./uiPolicy.ts";
import type { PuzzleManifestItem } from "./types.ts";

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
