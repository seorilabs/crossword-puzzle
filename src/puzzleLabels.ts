import type { Puzzle } from "../packages/crossword-core/src";

// 난이도(easy/normal/hard)를 한글 라벨로 변환한다. 값이 없으면 빈 문자열.
export function formatDifficultyLabel(difficulty?: Puzzle["difficulty"]) {
  if (difficulty === "easy") return "쉬움";
  if (difficulty === "normal") return "보통";
  if (difficulty === "hard") return "어려움";
  return "";
}

// 기본 4개 테마(음식/동물/자연/신체)에 아이콘을 붙여 칩 가독성을 높인다.
// 알 수 없는 themeTag 는 아이콘 없이 라벨만 노출한다(#248).
const THEME_CHIP_ICONS: Record<string, string> = {
  food: "🍎",
  animal: "🐾",
  nature: "🌿",
  body: "🫀",
};

export function getThemeChipIcon(themeTag?: string): string {
  if (themeTag == null) return "";
  return THEME_CHIP_ICONS[themeTag] ?? "";
}

// 주제 칩에 표시할 라벨(아이콘 + 테마명). themeLabel 이 없으면 null.
export function formatThemeChipLabel(
  themeLabel?: string,
  themeTag?: string,
): string | null {
  const label = themeLabel?.trim();
  if (label == null || label === "") return null;
  const icon = getThemeChipIcon(themeTag);
  return icon === "" ? label : `${icon} ${label}`;
}

// 완료 축하 시트 등에서 쓰는 "오늘의 주제: {라벨}" 한 줄. 라벨이 없으면 null(#248).
export function formatThemeHeadline(themeLabel?: string): string | null {
  const label = themeLabel?.trim();
  if (label == null || label === "") return null;
  return `오늘의 주제: ${label}`;
}
