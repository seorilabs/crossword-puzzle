import type { Puzzle, PuzzleManifestItem } from "./types";

export const DAILY_ATTEMPT_LIMIT = 3;
export const DEFAULT_HINT_CREDITS = 3;
export const DEFAULT_VISIBLE_PUZZLE_COUNT = 7;
export const PUZZLE_GENERATION_INTERVAL_HOURS = 2;
export const PUZZLE_KEEP_COUNT = 84;

type PuzzleAliasSource = {
  alias?: string;
  date?: string;
  packId?: string;
  publishedAt?: string;
  puzzleId?: string;
  slotId?: string;
};

function getPublishedAtAlias(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(date);
  const valueByType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  if (
    valueByType.year == null ||
    valueByType.month == null ||
    valueByType.day == null ||
    valueByType.hour == null
  ) {
    return undefined;
  }

  return `${valueByType.year.slice(-2)}${valueByType.month}${valueByType.day}${valueByType.hour}`;
}

function getPublishedAtHour(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const hour = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;
  const hourValue = hour == null ? NaN : Number(hour);

  return Number.isInteger(hourValue) ? hourValue % 24 : undefined;
}

function getPuzzleSlotHour(
  source: Pick<PuzzleAliasSource, "publishedAt" | "slotId">,
) {
  const slotMatch = source.slotId?.match(/^(\d{4})-(\d{2})-(\d{2})-h(\d{2})$/);

  if (slotMatch != null) {
    const hour = Number(slotMatch[4]);

    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
      return hour;
    }
  }

  return source.publishedAt == null
    ? undefined
    : getPublishedAtHour(source.publishedAt);
}

export function getPuzzleDailySequenceNumber(
  source: Pick<PuzzleAliasSource, "publishedAt" | "slotId">,
  intervalHours = PUZZLE_GENERATION_INTERVAL_HOURS,
) {
  const hour = getPuzzleSlotHour(source);
  const safeInterval = Math.max(1, Math.floor(intervalHours));

  if (hour == null || !Number.isFinite(safeInterval)) {
    return undefined;
  }

  const maxSequence = Math.ceil(24 / safeInterval);

  return Math.min(maxSequence, Math.floor(hour / safeInterval) + 1);
}

function getCompactDateTimeAlias(
  year: string,
  month: string,
  day: string,
  hour: string,
) {
  return `${year.slice(-2)}${month}${day}${hour}`;
}

function isFourDigitGregorianYear(value: string) {
  const year = Number(value);

  return Number.isInteger(year) && year >= 1900 && year <= 2099;
}

function normalizePuzzleAlias(value: string) {
  const trimmedValue = value.trim();
  const packDateTimeMatch = trimmedValue.match(
    /^pack-(\d{4})(\d{2})(\d{2})(\d{2})/,
  );
  if (packDateTimeMatch != null) {
    const [, year, month, day, hour] = packDateTimeMatch;
    return getCompactDateTimeAlias(year, month, day, hour);
  }

  const dateTimeMatch = trimmedValue.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(?:\d{2}){0,2}$/,
  );
  if (dateTimeMatch != null) {
    const [, year, month, day, hour] = dateTimeMatch;
    return getCompactDateTimeAlias(year, month, day, hour);
  }

  if (/^\d{8}$/.test(trimmedValue)) {
    const year = trimmedValue.slice(0, 4);

    return isFourDigitGregorianYear(year) ? trimmedValue.slice(2) : trimmedValue;
  }

  const dateMatch = trimmedValue.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateMatch != null) {
    const [, year, month, day] = dateMatch;
    return `${year.slice(-2)}${month}${day}`;
  }

  return trimmedValue;
}

export function getPuzzlePackAlias(source: PuzzleAliasSource) {
  const explicitAlias = source.alias?.trim();

  if (explicitAlias != null && explicitAlias.length > 0) {
    return normalizePuzzleAlias(explicitAlias);
  }

  const slotMatch = source.slotId?.match(/^(\d{4})-(\d{2})-(\d{2})-h(\d{2})$/);
  if (slotMatch != null) {
    const [, year, month, day, hour] = slotMatch;
    return `${year.slice(-2)}${month}${day}${hour}`;
  }

  if (source.publishedAt != null) {
    const publishedAlias = getPublishedAtAlias(source.publishedAt);

    if (publishedAlias != null) {
      return publishedAlias;
    }
  }

  const packIdMatch = source.packId?.match(/^pack-(\d{10})/);
  if (packIdMatch != null) {
    return normalizePuzzleAlias(source.packId ?? packIdMatch[1]);
  }

  const puzzleId = source.puzzleId?.trim();
  const puzzleIdAlias =
    puzzleId == null || puzzleId.length === 0
      ? undefined
      : normalizePuzzleAlias(puzzleId);
  if (
    puzzleIdAlias != null &&
    (puzzleIdAlias !== puzzleId || /^\d{8}$/.test(puzzleIdAlias))
  ) {
    return puzzleIdAlias;
  }

  const dateMatch = source.date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch != null) {
    const [, year, month, day] = dateMatch;
    return `${year.slice(-2)}${month}${day}`;
  }

  return puzzleIdAlias ?? "unknown";
}

export function createPuzzleSummary(puzzle: Puzzle): PuzzleManifestItem {
  return {
    alias: puzzle.alias ?? getPuzzlePackAlias(puzzle),
    date: puzzle.date,
    difficulty: puzzle.difficulty,
    metrics: puzzle.metrics,
    packId: puzzle.packId,
    path: "",
    publishedAt: puzzle.publishedAt,
    puzzleId: puzzle.puzzleId,
    quality: puzzle.quality,
    slotId: puzzle.slotId,
  };
}

export function getPuzzleStableSortKey(summary: PuzzleManifestItem) {
  return (
    summary.publishedAt ?? summary.slotId ?? summary.date ?? summary.puzzleId
  );
}

export function getPuzzlePublishedTime(summary: PuzzleManifestItem) {
  if (summary.publishedAt != null) {
    const value = new Date(summary.publishedAt).getTime();

    if (Number.isFinite(value)) {
      return value;
    }
  }

  const slotMatch = summary.slotId?.match(
    /^(\d{4})-(\d{2})-(\d{2})-h(\d{2})$/,
  );

  if (slotMatch == null) {
    return undefined;
  }

  const [, year, month, day, hour] = slotMatch;
  const value = new Date(
    `${year}-${month}-${day}T${hour}:00:00+09:00`,
  ).getTime();

  return Number.isFinite(value) ? value : undefined;
}

export function isPublishedPuzzle(
  summary: PuzzleManifestItem,
  now = Date.now(),
) {
  const publishedTime = getPuzzlePublishedTime(summary);

  return publishedTime == null || publishedTime <= now;
}

export function sortPuzzleSummariesAscending(
  left: PuzzleManifestItem,
  right: PuzzleManifestItem,
) {
  return getPuzzleStableSortKey(left).localeCompare(
    getPuzzleStableSortKey(right),
  );
}

export function sortPuzzleSummariesByRecency(summaries: PuzzleManifestItem[]) {
  return [...summaries].sort((left, right) =>
    getPuzzleStableSortKey(right).localeCompare(getPuzzleStableSortKey(left)),
  );
}

// 신규 사용자에게 입문(easy) 티어 퍼즐을 먼저 제공할지 결정한다. 첫 성공(활성화)
// 도달 전 사용자만 대상으로 하며, 일반 퍼즐을 한 번이라도 완료했거나 진행 중이면
// 일반 일일 퍼즐 흐름으로 돌려보낸다. 입문 퍼즐을 이미 끝낸 사용자도 제외한다.
export function shouldServeOnboardingPuzzle({
  hasCompletedAnyDaily,
  hasDailyProgress,
  onboardingCompleted,
}: {
  hasCompletedAnyDaily: boolean;
  hasDailyProgress: boolean;
  onboardingCompleted: boolean;
}): boolean {
  if (onboardingCompleted) {
    return false;
  }

  return !hasCompletedAnyDaily && !hasDailyProgress;
}

// 홈 상단 "오늘의 퍼즐 바로 시작" 원탭 CTA가 현재 활성 퍼즐을 그대로 시작해야
// 하는지 판단한다. 신규 사용자에게는 입문(easy) 온보딩 퍼즐이 첫 활성 퍼즐로
// 배정되는데, 이 퍼즐의 puzzleId는 오늘의 일반 퍼즐과 다르므로 단순 비교만으로는
// CTA가 일반 퍼즐로 전환해 버려 첫 경험이 normal로 빠진다(easy attempt 0건의 원인).
// 활성 퍼즐이 온보딩 퍼즐이면 일반 퍼즐로 전환하지 않고 현재 퍼즐을 시작해 첫
// 경험을 easy로 유지한다. 오늘의 퍼즐이 아직 없으면(undefined) 현재 퍼즐을 시작한다.
export function shouldQuickStartActivePuzzle({
  activePuzzleId,
  onboardingPuzzleId,
  todayPuzzleId,
}: {
  activePuzzleId: string;
  onboardingPuzzleId: string;
  todayPuzzleId?: string;
}): boolean {
  if (todayPuzzleId == null) {
    return true;
  }

  return (
    activePuzzleId === todayPuzzleId || activePuzzleId === onboardingPuzzleId
  );
}

// 부분 완료(중간 성취) 구간. 완료가 all-or-nothing이라 "거의 다 풀었지만 못 끝낸"
// 사용자가 보상 없이 이탈하는 문제를 줄이기 위해, 진행률이 마일스톤을 새로 넘을 때
// 중간 보상 피드백과 진행 마일스톤 이벤트를 노출한다.
export const PUZZLE_PROGRESS_MILESTONES = [25, 50, 75] as const;

// 이전에 도달한 진행률(previousPercent)과 현재 진행률(currentPercent) 사이에서
// 새로 넘어선 마일스톤만 오름차순으로 돌려준다. 진행률이 줄거나 그대로면 빈 배열.
export function getNewlyReachedProgressMilestones(
  previousPercent: number,
  currentPercent: number,
  milestones: readonly number[] = PUZZLE_PROGRESS_MILESTONES,
): number[] {
  if (currentPercent <= previousPercent) {
    return [];
  }

  return milestones.filter(
    (milestone) => previousPercent < milestone && currentPercent >= milestone,
  );
}

export function getProgressMilestoneRewardMessage(milestone: number): string {
  if (milestone >= 75) {
    return "거의 다 왔어요! 조금만 더 🔥";
  }
  if (milestone >= 50) {
    return "절반 넘었어요! 잘하고 있어요 💪";
  }
  return "좋아요! 벌써 4분의 1을 채웠어요 🎉";
}

export function getDailyFreePuzzleSummary(
  puzzleSummaries: PuzzleManifestItem[],
  today: string,
  now = Date.now(),
) {
  const publishedSummaries = puzzleSummaries.filter((summary) =>
    isPublishedPuzzle(summary, now),
  );
  const todaySummaries = publishedSummaries
    .filter((summary) => summary.date === today)
    .sort(sortPuzzleSummariesAscending);

  if (todaySummaries[0] != null) {
    return todaySummaries[0];
  }

  const pastDates = publishedSummaries
    .filter((summary) => summary.date <= today)
    .map((summary) => summary.date)
    .sort();
  const latestPastDate = pastDates[pastDates.length - 1];

  if (latestPastDate != null) {
    return publishedSummaries
      .filter((summary) => summary.date === latestPastDate)
      .sort(sortPuzzleSummariesAscending)[0];
  }

  return (
    publishedSummaries.sort(sortPuzzleSummariesAscending)[0] ??
    puzzleSummaries[0]
  );
}

export function getDailyFreePuzzleSummaries(
  puzzleSummaries: PuzzleManifestItem[],
  today: string,
  limit: number,
  now = Date.now(),
) {
  const maxDays = Math.max(1, limit);
  const publishedSummaries = puzzleSummaries.filter((summary) =>
    isPublishedPuzzle(summary, now),
  );
  const freeSummaryByDate = new Map<string, PuzzleManifestItem>();

  for (const summary of publishedSummaries) {
    if (summary.date > today) {
      continue;
    }

    const existing = freeSummaryByDate.get(summary.date);

    if (
      existing == null ||
      sortPuzzleSummariesAscending(summary, existing) < 0
    ) {
      freeSummaryByDate.set(summary.date, summary);
    }
  }

  const dailySummaries = sortPuzzleSummariesByRecency([
    ...freeSummaryByDate.values(),
  ]);

  if (dailySummaries.length > 0) {
    return dailySummaries.slice(0, maxDays);
  }

  const fallbackSummary = getDailyFreePuzzleSummary(
    puzzleSummaries,
    today,
    now,
  );

  return fallbackSummary == null ? [] : [fallbackSummary];
}

export function getBonusPuzzleCandidateSummary({
  completedPuzzleIds,
  dailyFreeSummary,
  puzzleSummaries,
  today,
}: {
  completedPuzzleIds: Set<string>;
  dailyFreeSummary?: PuzzleManifestItem;
  puzzleSummaries: PuzzleManifestItem[];
  today: string;
}) {
  if (dailyFreeSummary?.date !== today) {
    return undefined;
  }

  return sortPuzzleSummariesByRecency(
    puzzleSummaries.filter(
      (summary) =>
        summary.date === today &&
        summary.puzzleId !== dailyFreeSummary.puzzleId &&
        !completedPuzzleIds.has(summary.puzzleId) &&
        isPublishedPuzzle(summary),
    ),
  )[0];
}

export function getOpenPuzzleSummariesForDate({
  archivePuzzleSummaries,
  date,
  dailyFreeSummary,
  now = Date.now(),
  selectedPuzzleSummary,
  unlockedBonusSummaries,
}: {
  archivePuzzleSummaries: PuzzleManifestItem[];
  date: string;
  dailyFreeSummary?: PuzzleManifestItem;
  now?: number;
  selectedPuzzleSummary?: PuzzleManifestItem;
  unlockedBonusSummaries: PuzzleManifestItem[];
}) {
  const summaryByPuzzleId = new Map<string, PuzzleManifestItem>();
  const addSummary = (summary: PuzzleManifestItem | undefined) => {
    if (summary == null || summary.date !== date) {
      return;
    }

    const existing = summaryByPuzzleId.get(summary.puzzleId);
    summaryByPuzzleId.set(
      summary.puzzleId,
      existing == null ? summary : mergePuzzleSummaryMetadata(existing, summary),
    );
  };

  addSummary(
    dailyFreeSummary != null && isPublishedPuzzle(dailyFreeSummary, now)
      ? dailyFreeSummary
      : undefined,
  );
  addSummary(
    selectedPuzzleSummary != null && isPublishedPuzzle(selectedPuzzleSummary, now)
      ? selectedPuzzleSummary
      : undefined,
  );
  unlockedBonusSummaries.forEach((summary) => {
    addSummary(isPublishedPuzzle(summary, now) ? summary : undefined);
  });
  archivePuzzleSummaries.forEach(addSummary);

  return sortPuzzleSummariesByRecency([...summaryByPuzzleId.values()]);
}

function mergePuzzleSummaryMetadata(
  primary: PuzzleManifestItem,
  fallback: PuzzleManifestItem,
): PuzzleManifestItem {
  return {
    ...fallback,
    ...primary,
    alias: primary.alias ?? fallback.alias,
    metrics: primary.metrics ?? fallback.metrics,
    packId: primary.packId ?? fallback.packId,
    path: primary.path !== "" ? primary.path : fallback.path,
    publishedAt: primary.publishedAt ?? fallback.publishedAt,
    quality: primary.quality ?? fallback.quality,
    slotId: primary.slotId ?? fallback.slotId,
  };
}

export function uniquePuzzleSummaries(summaries: PuzzleManifestItem[]) {
  const seen = new Set<string>();
  const result: PuzzleManifestItem[] = [];

  for (const summary of summaries) {
    if (seen.has(summary.puzzleId)) {
      continue;
    }

    seen.add(summary.puzzleId);
    result.push(summary);
  }

  return result;
}

export function getStreakBadgeLabel(streak: number): string | null {
  if (streak <= 0) return null;
  if (streak >= 100) return `🏆 ${streak}일 연속`;
  if (streak >= 30) return `🏆 한 달 연속 (${streak}일)`;
  if (streak >= 7) return `🔥 일주일 연속 (${streak}일)`;
  return `🔥 ${streak}일 연속`;
}

export function getNextStreakMilestoneHint(streak: number): string | null {
  if (streak <= 0) return null;
  const milestones = [7, 30, 100] as const;
  for (const milestone of milestones) {
    if (streak >= milestone) continue;
    const daysLeft = milestone - streak;
    if (daysLeft > 3) return null;
    const label =
      milestone === 7 ? "일주일" : milestone === 30 ? "한 달" : "100일";
    return daysLeft === 1
      ? `내일 풀면 ${label} 연속이에요!`
      : `${daysLeft}일만 더하면 ${label} 연속이에요!`;
  }
  return null;
}

// 셀에 오답 빨간 표시(cellWrong)를 보여줄지 결정한다. 상시 오답표시(autocheck)가
// 켜져 있거나, "이 단어 확인"으로 일시 강조(isChecked) 중인 셀만 오답을 노출한다.
// 정답이거나 미입력 셀(isWrong=false)은 항상 표시하지 않는다.
export function isWrongCellVisible(input: {
  isWrong: boolean;
  autocheckEnabled: boolean;
  isChecked: boolean;
}): boolean {
  if (!input.isWrong) {
    return false;
  }
  return input.autocheckEnabled || input.isChecked;
}

export function getStreakMilestoneProgress(streak: number): string | null {
  if (!Number.isFinite(streak) || streak <= 0) return null;
  const safeStreak = Math.floor(streak);
  if (safeStreak <= 0) return null;
  const milestones = [7, 30, 100] as const;
  for (const milestone of milestones) {
    if (safeStreak >= milestone) continue;
    const daysLeft = milestone - safeStreak;
    const label =
      milestone === 7 ? "일주일" : milestone === 30 ? "한 달" : "100일";
    if (daysLeft === 1) return `내일 풀면 ${label} 연속이에요!`;
    if (daysLeft <= 3) return `${daysLeft}일만 더하면 ${label} 연속이에요!`;
    return `${label} 연속까지 ${daysLeft}일 남았어요`;
  }
  return null;
}
