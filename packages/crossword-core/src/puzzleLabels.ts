// 퍼즐/날짜 카드 표시 라벨·조회 순수 함수. AIT WebView(src)와 RN(apps/mobile)이
// 동일하게 사용하므로 core에 단일 정의한다. React/RN/SDK 의존 금지.

import type { PuzzleManifestItem } from "./types.ts";
import {
  getPuzzleDailySequenceNumber,
  getPuzzlePackAlias,
} from "./uiPolicy.ts";
import type { Puzzle } from "./types.ts";

// AIT WebView와 Android/iOS React Native가 같은 한글 난이도 라벨을 노출한다.
// 난이도는 쉬움/어려움 두 단계지만, 2단계 전환 전에 발행된 퍼즐이 기기에 남아
// 있을 수 있으므로 레거시 "normal" 도 계속 라벨링한다.
export function formatDifficultyLabel(
  difficulty?: Puzzle["difficulty"] | "normal",
): string {
  if (difficulty === "easy") return "쉬움";
  if (difficulty === "normal") return "보통";
  if (difficulty === "hard") return "어려움";
  return "";
}

export function findPuzzleSummaryById(
  puzzleSummaries: PuzzleManifestItem[],
  puzzleId?: string,
): PuzzleManifestItem | undefined {
  return puzzleId == null
    ? undefined
    : puzzleSummaries.find((summary) => summary.puzzleId === puzzleId);
}

// 완료 표시가 있는 퍼즐 id 집합. DateCardState의 전체 형태에 의존하지 않도록
// 필요한 필드(completedAt)만 구조적으로 받는다(web/mobile 카드 상태 형태 상이).
export function getCompletedPuzzleIds(
  dateCardStates: Record<string, { completedAt?: string }>,
): Set<string> {
  return new Set(
    Object.entries(dateCardStates)
      .filter(([, state]) => state.completedAt != null)
      .map(([puzzleId]) => puzzleId),
  );
}

export function formatPuzzleAliasLabel(summary: PuzzleManifestItem): string {
  return `#${getPuzzlePackAlias(summary)}`;
}

export function formatPuzzleCardSequenceLabel(
  summary: PuzzleManifestItem,
): string {
  const sequenceNumber = getPuzzleDailySequenceNumber(summary);

  return sequenceNumber == null
    ? "퍼즐 --번"
    : `퍼즐 ${String(sequenceNumber).padStart(2, "0")}번`;
}

export function formatDateCardDay(date: string): string {
  const [, month, day] = date.split("-");
  if (month == null || day == null) {
    return date;
  }

  return `${Number(month)}.${Number(day)}`;
}

// variant 기본값은 "short"(기존 AIT 동작 유지). RN은 "long"/"short"를 명시 전달.
export function formatDateCardWeekday(
  date: string,
  variant: "long" | "short" = "short",
): string {
  const value = new Date(`${date}T00:00:00`);
  if (Number.isNaN(value.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", { weekday: variant }).format(value);
}
