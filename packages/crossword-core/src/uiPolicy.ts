import { type Difficulty, isDifficulty } from "./difficultyProfiles.ts";
import { getCellKey, getEntryCells } from "./puzzle.ts";
import type {
  Direction,
  Puzzle,
  PuzzleEntry,
  PuzzleManifestItem,
} from "./types";

export const DAILY_ATTEMPT_LIMIT = 3;
export const DEFAULT_HINT_CREDITS = 3;

// 난이도별 기본 힌트 크레딧(#251). easy 는 단어가 적어(9~10개) 3크레딧이면 과다,
// hard 는 많아(19~20개) 부족하므로 완료 난도에 비례해 기본 크레딧을 스케일한다.
// 이 표는 원격 오버라이드(launchConfig)가 없을 때 쓰는 코드 기본값이다.
export const DEFAULT_HINT_CREDITS_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 2,
  hard: 5,
};

// 난이도에 맞는 기본 힌트 크레딧을 돌려준다. 난이도가 없거나 비정상이면
// DEFAULT_HINT_CREDITS 로 폴백한다(레거시 normal 퍼즐 포함).
export function getDefaultHintCreditsForDifficulty(
  difficulty: string | undefined | null,
): number {
  return isDifficulty(difficulty)
    ? DEFAULT_HINT_CREDITS_BY_DIFFICULTY[difficulty]
    : DEFAULT_HINT_CREDITS;
}

export const DEFAULT_VISIBLE_PUZZLE_COUNT = 7;
export const PUZZLE_GENERATION_INTERVAL_HOURS = 1;
// 하루 두 판 × 7일. 난이도 티어 수와 함께 움직인다.
export const PUZZLE_KEEP_COUNT = 14;

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

    return isFourDigitGregorianYear(year)
      ? trimmedValue.slice(2)
      : trimmedValue;
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
    themeTag: puzzle.themeTag,
    themeLabel: puzzle.themeLabel,
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

  const slotMatch = summary.slotId?.match(/^(\d{4})-(\d{2})-(\d{2})-h(\d{2})$/);

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

// 앱 부팅(초기 세션 라우팅)·앱 재진입 시 어떤 퍼즐을 "첫 활성 퍼즐"로 둘지 정한다.
// 신규 사용자(첫 성공 전·입문 미완료)이고 입문 퍼즐을 제공할 수 있으면 입문(easy)
// 퍼즐 id를, 그 외에는 일반 일일 퍼즐 id를 돌려준다. 일반 일일 퍼즐 후보(날짜 카드
// 리스트)가 존재하더라도 신규 사용자에게는 입문 퍼즐이 첫 활성 퍼즐로 유지된다.
// onboardingAvailable=false(입문 세션 로드 실패)면 안전하게 일반 퍼즐로 폴백한다.
export function resolveInitialActivePuzzleId({
  dailyPuzzleId,
  hasCompletedAnyDaily,
  hasDailyProgress,
  onboardingAvailable,
  onboardingCompleted,
  onboardingPuzzleId,
}: {
  dailyPuzzleId: string;
  hasCompletedAnyDaily: boolean;
  hasDailyProgress: boolean;
  onboardingAvailable: boolean;
  onboardingCompleted: boolean;
  onboardingPuzzleId: string;
}): string {
  if (
    onboardingAvailable &&
    shouldServeOnboardingPuzzle({
      hasCompletedAnyDaily,
      hasDailyProgress,
      onboardingCompleted,
    })
  ) {
    return onboardingPuzzleId;
  }

  return dailyPuzzleId;
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

// 신규 사용자의 첫 실행에서 홈을 건너뛰고 온보딩(easy) 퍼즐 풀이 화면으로 자동
// 진입할지 판정한다(#205). 신규 37%가 홈에서 퍼즐 미진입 이탈하는 문제 대응으로,
// 도전 이력이 전혀 없고(일일 완료·진행 없음, 온보딩 시도 이력 없음) 온보딩 퍼즐이
// 첫 활성 퍼즐로 배정된 경우에만 true다. 원격 설정 게이트(enabled=first_run_auto_
// start_enabled)가 꺼져 있으면 항상 false로, 회귀 시 즉시 끌 수 있다.
export function shouldAutoStartFirstRun({
  enabled,
  hasCompletedAnyDaily,
  hasDailyProgress,
  onboardingStarted,
  activePuzzleIsOnboarding,
}: {
  // Remote Config `first_run_auto_start_enabled` 게이트 값.
  enabled: boolean;
  // 일일 퍼즐 완료 이력(어느 날짜든 completedAt 존재).
  hasCompletedAnyDaily: boolean;
  // 일일 퍼즐 진행 이력(시도·힌트·입력 중 하나라도 존재).
  hasDailyProgress: boolean;
  // 온보딩 퍼즐 시도/진행 이력. 일일 쪽(hasDailyProgress)과 같은 의미로,
  // 온보딩 미션 시도·힌트·입력이 하나라도 있으면 true로 채운다(완료 포함).
  onboardingStarted: boolean;
  // 부팅 세션 라우팅(resolveInitialActivePuzzleId) 결과가 온보딩 퍼즐인지.
  // 온보딩 세션 로드 실패 등으로 일반 퍼즐로 폴백한 경우 false가 되어 자동
  // 진입하지 않는다 — 자동 진입 대상 화면(온보딩 easy)이 준비된 경우에만
  // 개입하는 의도된 안전 가드다.
  activePuzzleIsOnboarding: boolean;
}): boolean {
  return (
    enabled &&
    !hasCompletedAnyDaily &&
    !hasDailyProgress &&
    !onboardingStarted &&
    activePuzzleIsOnboarding
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
      existing == null
        ? summary
        : mergePuzzleSummaryMetadata(existing, summary),
    );
  };

  addSummary(
    dailyFreeSummary != null && isPublishedPuzzle(dailyFreeSummary, now)
      ? dailyFreeSummary
      : undefined,
  );
  addSummary(
    selectedPuzzleSummary != null &&
      isPublishedPuzzle(selectedPuzzleSummary, now)
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

// 스트릭 마일스톤 임계값(일). 배지·넛지·달성 이벤트가 공유하는 단일 출처라 세 곳의
// 임계값이 어긋나지 않는다.
export const STREAK_MILESTONE_DAYS = [7, 30, 100] as const;

/**
 * 스트릭이 previousStreak에서 currentStreak로 오르며 "새로" 넘어선 마일스톤을 반환한다
 * (없으면 null). game_* 진행 마일스톤(getNewlyReachedProgressMilestones)과 동일한
 * "이전 < 임계 ≤ 현재" 규칙을 스트릭 축에 적용한다. 완료로 스트릭이 여러 칸 점프해도
 * 그 구간에서 가장 높은 마일스톤 하나만 인정한다(중복 발화 방지). 이미 넘긴 마일스톤은
 * 다시 세지 않으므로 달성 이벤트가 정확히 1회만 발화한다.
 */
export function getNewlyReachedStreakMilestone(
  previousStreak: number,
  currentStreak: number,
  milestones: readonly number[] = STREAK_MILESTONE_DAYS,
): number | null {
  let reached: number | null = null;
  for (const milestone of milestones) {
    if (previousStreak < milestone && currentStreak >= milestone) {
      reached = milestone;
    }
  }
  return reached;
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
  const milestones = STREAK_MILESTONE_DAYS;
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

// 첫 진입 1스텝 온보딩 가이드("첫 칸에 입력")를 노출할지 결정한다. 시작했지만 아직
// 한 글자도 입력하지 않은(빈 그리드) 최초 진입에서만, 가이드를 아직 보지 않은
// 사용자에게 노출한다(입력이 생기면 즉시 사라짐). 과거에는 how-to 다이얼로그를 먼저
// 본 사용자(hasSeenHowToPlay 전제)에게만 노출돼 attempt_start 진입자 대비 노출률이
// 매우 낮았다(#161). how-to 전제를 제거해 how-to를 아직 보지 않은/건너뛴 신규에게도
// 가이드가 노출되도록 트리거를 완화한다. how-to 다이얼로그는 더 높은 레이어로 떠
// 가이드를 덮으므로 동시 표시 충돌은 없고, 다이얼로그를 닫으면 가이드가 드러난다.
// hasSeenFirstInputGuide(중복 노출 방지) 가드는 유지한다.
export function shouldShowFirstInputGuide(input: {
  route: string;
  hasStarted: boolean;
  isCompleted: boolean;
  hasSeenFirstInputGuide: boolean;
  isBoardEmpty: boolean;
}): boolean {
  return (
    input.route === "today" &&
    input.hasStarted &&
    !input.isCompleted &&
    !input.hasSeenFirstInputGuide &&
    input.isBoardEmpty
  );
}

// 첫 입력 유도용 "시작 칸"을 정한다. 첫 입력 가이드가 실제로 비어 있는 첫 칸을
// 하이라이트·포커스해 입력 위치를 시각적으로 드러내기 위해(#183), 아직 빈 칸이
// 남은 단어 중 가장 짧은 단어(첫 성공을 쉽게)를 고르고, 길이가 같으면 읽기
// 순서(위→아래, 그다음 왼→오른쪽)로 시작 칸이 앞선 단어를 고른다. 선택된 단어에서
// 읽기 순서로 첫 번째 빈 칸의 좌표·키를 돌려준다. 채울 빈 칸이 하나도 없으면
// undefined(모든 칸이 채워진 상태).
export function resolveStarterCell(input: {
  puzzle: Puzzle;
  cellValues: Record<string, string>;
}): { entryId: string; cellKey: string; row: number; col: number } | undefined {
  const isEmptyCell = (cellKey: string) => {
    const value = input.cellValues[cellKey];

    return value == null || value === "";
  };

  let best:
    | {
        entry: PuzzleEntry;
        cellKey: string;
        row: number;
        col: number;
      }
    | undefined;

  for (const entry of input.puzzle.entries) {
    const firstEmpty = getEntryCells(entry)
      .map((cell) => ({ ...cell, cellKey: getCellKey(cell.row, cell.col) }))
      .find((cell) => isEmptyCell(cell.cellKey));

    if (firstEmpty == null) {
      continue;
    }

    if (
      best == null ||
      entry.answer.length < best.entry.answer.length ||
      (entry.answer.length === best.entry.answer.length &&
        (entry.row < best.entry.row ||
          (entry.row === best.entry.row && entry.col < best.entry.col)))
    ) {
      best = {
        cellKey: firstEmpty.cellKey,
        col: firstEmpty.col,
        entry,
        row: firstEmpty.row,
      };
    }
  }

  if (best == null) {
    return undefined;
  }

  return {
    cellKey: best.cellKey,
    col: best.col,
    entryId: best.entry.id,
    row: best.row,
  };
}

export type StuckHintTrigger = "first_input" | "idle" | "wrong_answer";

// 막힘(stuck) 프롬프트를 띄우기까지의 정체 지연(ms)을 정한다. 첫 입력 전에는 입력
// 개시 안내용 짧은 지연을 최우선으로 쓰고(#346), 입력 뒤에는 기존 오답/일반 정체
// 분기를 그대로 유지한다.
export function getStuckHintDelayMs(input: {
  firstInputPending: boolean;
  firstInputIdleMs: number;
  wrongCellCount: number;
  wrongCellThreshold: number;
  idleMs: number;
  wrongIdleMs: number;
}): number {
  if (input.firstInputPending) {
    return input.firstInputIdleMs;
  }
  return input.wrongCellCount >= input.wrongCellThreshold
    ? input.wrongIdleMs
    : input.idleMs;
}

// 막힘 힌트 CTA를 이번 attempt 에서 더 노출해도 되는지 결정한다(#254). 노출 상한
// (maxPromptsPerAttempt) 또는 닫기 상한(maxDismissals)에 도달하면 false. 상한이
// 0 이하면 그 축은 무제한으로 본다. 닫아도 계속 재노출되던 폭주(1인 최대 187회)를
// dismiss 를 존중하는 노출 정책으로 막는다.
export function shouldScheduleStuckHintPrompt(input: {
  promptSeq: number;
  dismissCount: number;
  maxPromptsPerAttempt: number;
  maxDismissals: number;
}): boolean {
  if (
    input.maxPromptsPerAttempt > 0 &&
    input.promptSeq >= input.maxPromptsPerAttempt
  ) {
    return false;
  }
  if (input.maxDismissals > 0 && input.dismissCount >= input.maxDismissals) {
    return false;
  }
  return true;
}

// 완료 직전(near-finish) 마무리 넛지 판별(#280). 진행 중 상태에서 잔여 미완성 단어가
// 임계 이하이거나 진행률이 임계 이상이면 마무리 넛지 모드로 본다. 잔여 단어가 없으면
// (=완료) 넛지하지 않는다. 이 판별은 기존 stall 발화 조건을 대체하지 않고, stall 발화가
// 결정된 뒤 프롬프트 문구·CTA를 마무리형으로 바꾸는 데만 쓴다.
export function isNearFinishNudge(input: {
  progressPercent: number;
  wordsRemaining: number;
  progressThreshold: number;
  wordsRemainingThreshold: number;
}): boolean {
  if (input.wordsRemaining <= 0) {
    return false;
  }
  return (
    input.wordsRemaining <= input.wordsRemainingThreshold ||
    input.progressPercent >= input.progressThreshold
  );
}

// 막힘 프롬프트 본문 문구를 정한다. near-finish 발화면 잔여 단어 수를 포함한 마무리
// 문구를, 아니면 힌트 보유 여부에 따라 기존 막힘 안내 문구를 돌려준다(#280).
export function getStuckHintPromptText(input: {
  trigger?: StuckHintTrigger;
  nearFinish: boolean;
  wordsRemaining: number;
  hasHintCredits: boolean;
}): string {
  if (input.trigger === "first_input") {
    return "반짝이는 칸을 탭해 글자를 입력해 보세요 ✏️";
  }
  if (input.nearFinish) {
    return `거의 다 왔어요! 남은 단어 ${input.wordsRemaining}개 ✨`;
  }
  return input.hasHintCredits
    ? "막혔나요? 지금 힌트는 무료예요 💡"
    : "막혔나요? 광고를 보면 힌트를 받을 수 있어요";
}

// 닫기 횟수에 따라 다음 노출 지연을 지수 백오프로 늘린다(#254).
// delay = baseDelayMs * backoffFactor^dismissCount. backoffFactor 1 이하나
// dismissCount 0 이면 baseDelayMs 그대로다.
export function getStuckHintBackoffDelayMs(input: {
  baseDelayMs: number;
  dismissCount: number;
  backoffFactor: number;
}): number {
  const factor = Math.max(1, input.backoffFactor);
  const dismissals = Math.max(0, Math.trunc(input.dismissCount));
  return Math.round(input.baseDelayMs * Math.pow(factor, dismissals));
}

// 물리 키보드 세로 화살표(↑/↓)로 보드에서 세로 이동·방향 토글을 수행할지 결정한다(#175).
// 현재 방향이 세로(down)면 세로 화살표는 단어 내 인접 셀로 이동한다(↑=이전 칸, ↓=다음 칸).
// 현재 방향이 가로(across)면 세로 축과 직교하므로, 활성 셀을 지나는 세로 단어가 있으면
// 그 세로 단어로 방향을 토글한다(Tab/교차 셀 탭 토글과 일관). 교차 세로 단어가 없으면
// 아무 동작도 하지 않는다(캐럿 점프만 preventDefault로 막고 상태는 유지). IME 조합 중
// 무시 처리는 호출부(onKeyDown)의 조합 가드가 담당한다.
export type VerticalArrowAction =
  | { type: "move"; delta: -1 | 1 }
  | { type: "toggleDown" }
  | { type: "none" };

export function resolveVerticalArrowAction(input: {
  key: "ArrowUp" | "ArrowDown";
  selectedDirection: Direction;
  hasCrossingDownEntry: boolean;
}): VerticalArrowAction {
  const delta: -1 | 1 = input.key === "ArrowUp" ? -1 : 1;
  if (input.selectedDirection === "down") {
    return { type: "move", delta };
  }
  return input.hasCrossingDownEntry ? { type: "toggleDown" } : { type: "none" };
}

// 막힘 안내(stuck prompt)에서 "이 단어 정답 보기" 보조 동작을 함께 노출할지 정한다.
// 선택된 단어가 아직 미완성일 때만, 막힌 사용자가 그 단어를 즉시 공개해 빠져나갈
// 탈출구를 제공한다(#163). 선택 단어가 없거나 이미 정답이면 노출하지 않는다.
export function shouldOfferStuckWordReveal(input: {
  hasSelectedEntry: boolean;
  isSelectedEntryComplete: boolean;
}): boolean {
  return input.hasSelectedEntry && !input.isSelectedEntryComplete;
}

// 입문(easy) 온보딩 퍼즐에서 단어 1개를 새로 완성했을 때(퍼즐 전체 완성 순간은
// 제외) 즉시 긍정 피드백(시각 토스트)을 줄지 결정한다. 사운드·햅틱에 더해 시각
// 피드백으로 첫 성공(활성화) 동기를 강화한다(#163).
export function shouldCelebrateOnboardingWordCompletion(input: {
  isOnboardingPuzzle: boolean;
  justCompletedWord: boolean;
  puzzleComplete: boolean;
}): boolean {
  return (
    input.isOnboardingPuzzle && input.justCompletedWord && !input.puzzleComplete
  );
}

export const ONBOARDING_WORD_COMPLETE_MESSAGE = "좋아요! 한 단어 완성했어요 🎉";

export function getStreakMilestoneProgress(streak: number): string | null {
  if (!Number.isFinite(streak) || streak <= 0) return null;
  const safeStreak = Math.floor(streak);
  if (safeStreak <= 0) return null;
  const milestones = STREAK_MILESTONE_DAYS;
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
