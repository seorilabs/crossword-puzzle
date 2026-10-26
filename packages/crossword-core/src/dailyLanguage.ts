import type { PuzzleManifestItem } from "./types.ts";
export type ContentLanguage = "ko" | "en";
export const DAILY_PUZZLE_COUNT = 5;
export const ANSWER_REPEAT_DAYS = 14;
export const LANGUAGE_STORAGE_KEY = "crossword-language-v1";
export function defaultLanguage(locale: string): ContentLanguage {
  return locale.toLowerCase().startsWith("ko") ? "ko" : "en";
}
export function puzzleLanguage(value: {
  language?: ContentLanguage;
}): ContentLanguage {
  return value.language ?? "ko";
}
export function languagePolicy(language: ContentLanguage) {
  return {
    words: language === "ko" ? ([18, 22] as const) : ([12, 18] as const),
    hangulVariety: language === "ko",
    minCrossRatio: 0.55,
    minMultiCrossRatio: 0.65,
    dailyCount: DAILY_PUZZLE_COUNT,
    repeatDays: ANSWER_REPEAT_DAYS,
  };
}
export function normalizeEnglishAnswer(value: string): string {
  const answer = value.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(answer)) throw new Error("English answers require A-Z");
  return answer;
}
export function contentDate(
  language: ContentLanguage,
  now = new Date(),
  localTimeZone?: string,
): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(language === "ko"
      ? { timeZone: "Asia/Seoul" }
      : localTimeZone
        ? { timeZone: localTimeZone }
        : {}),
  };
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", options)
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
export function contentDateRefreshDelay(
  language: ContentLanguage,
  now = new Date(),
): number {
  if (language === "ko") {
    const dayMs = 86400000;
    return dayMs - ((((now.getTime() + 9 * 3600000) % dayMs) + dayMs) % dayMs);
  }
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}
export function dailyPuzzles(
  rows: readonly PuzzleManifestItem[],
  language: ContentLanguage,
  date: string,
): PuzzleManifestItem[] {
  const candidates = rows.filter(
    (row) => puzzleLanguage(row) === language && row.date === date,
  );
  const modern = candidates.filter(
    (row) =>
      Number.isInteger(row.dailySequence) &&
      row.dailySequence! >= 1 &&
      row.dailySequence! <= DAILY_PUZZLE_COUNT,
  );
  const unique = new Map<number, PuzzleManifestItem>();
  for (const row of modern.length ? modern : candidates) {
    const sequence = row.dailySequence ?? 1;
    const previous = unique.get(sequence);
    if (!previous) unique.set(sequence, row);
    else if (modern.length && previous.puzzleId !== row.puzzleId)
      throw new Error("Conflicting daily puzzle slots");
  }
  return [...unique.values()].sort(
    (a, b) => (a.dailySequence ?? 1) - (b.dailySequence ?? 1),
  );
}
export function dailyCompletionDates(
  rows: readonly { date: string; language?: ContentLanguage }[],
  language: ContentLanguage,
): string[] {
  return [
    ...new Set(
      rows.filter((x) => puzzleLanguage(x) === language).map((x) => x.date),
    ),
  ].sort();
}
export function languageTelemetry(
  puzzle: { language?: ContentLanguage; dailySequence?: number },
  uiLanguage: ContentLanguage,
) {
  return {
    content_language: puzzleLanguage(puzzle),
    ui_language: uiLanguage,
    daily_sequence: puzzle.dailySequence ?? 1,
  };
}
