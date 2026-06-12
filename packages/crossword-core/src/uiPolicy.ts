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
  if (summary.publishedAt == null) {
    return undefined;
  }

  const value = new Date(summary.publishedAt).getTime();

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
