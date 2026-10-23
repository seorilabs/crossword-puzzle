import type { PuzzleEntry } from "./types.ts";
export const FIRST_WORD_GUIDE_KEY = "crossword-puzzle:first-three-words:v1";
export type FirstWordGuide = {
  version: 1;
  puzzleId: string;
  entryIds: string[];
  status: "active" | "complete" | "skipped";
};
export function normalizeFirstWordGuide(
  value: unknown,
): FirstWordGuide | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (
    row.version !== 1 ||
    typeof row.puzzleId !== "string" ||
    !Array.isArray(row.entryIds) ||
    !row.entryIds.every((id) => typeof id === "string") ||
    !["active", "complete", "skipped"].includes(String(row.status))
  )
    return undefined;
  return {
    version: 1,
    puzzleId: row.puzzleId,
    entryIds: [...new Set(row.entryIds as string[])].slice(0, 3),
    status: row.status as FirstWordGuide["status"],
  };
}
export function chooseFirstWordGuide(
  entries: readonly PuzzleEntry[],
): string[] {
  const rank = (entry: PuzzleEntry) =>
    entry.vocabularyLevel === "초급"
      ? 0
      : entry.vocabularyLevel === "중급"
        ? 1
        : entry.vocabularyLevel === "고급"
          ? 3
          : 2;
  return [...entries]
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(b.clueSource === "manual") - Number(a.clueSource === "manual") ||
        [...a.answer].length - [...b.answer].length ||
        a.clue.length - b.clue.length,
    )
    .slice(0, 3)
    .map((entry) => entry.id);
}

export function restoreFirstWordGuide({
  previous,
  puzzleId,
  entries,
  legacySeen,
  hasProgress,
}: {
  previous?: FirstWordGuide;
  puzzleId: string;
  entries: readonly PuzzleEntry[];
  legacySeen: boolean;
  hasProgress: boolean;
}): FirstWordGuide | undefined {
  if (
    previous?.puzzleId === puzzleId ||
    previous?.status === "complete" ||
    previous?.status === "skipped"
  )
    return previous;
  // 기록을 열기만 해도 새 안내의 완료 이벤트가 생기지 않도록 한다.
  if (hasProgress || (!previous && legacySeen)) return previous;
  return {
    version: 1,
    puzzleId,
    entryIds: chooseFirstWordGuide(entries),
    status: "active",
  };
}
