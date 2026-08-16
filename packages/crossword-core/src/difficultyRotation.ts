import type { Difficulty } from "./difficultyProfiles";

// 슬롯을 번갈아 easy/hard로 채운다. 일간 티어(DAILY_PUZZLE_TIERS)를 끄고 여러 번
// 실행하는 레거시 경로에서만 쓰이며, AIT/Web과 Android/iOS가 같은 manifest를
// 읽으므로 발행 난이도 정책도 core에서 단일 출처로 관리한다.
export const PUBLISHED_DIFFICULTY_ROTATION: readonly Difficulty[] = [
  "easy",
  "hard",
];

export type ScheduledDifficultyInput = {
  slotHour: number;
  intervalHours?: number;
};

export function resolveScheduledDifficulty({
  slotHour,
  intervalHours = 2,
}: ScheduledDifficultyInput): Difficulty {
  const normalizedHour =
    ((Math.floor(Number.isFinite(slotHour) ? slotHour : 0) % 24) + 24) % 24;
  const normalizedInterval =
    Number.isFinite(intervalHours) && intervalHours > 0
      ? Math.floor(intervalHours)
      : 2;
  const slotIndex = Math.floor(normalizedHour / normalizedInterval);

  return PUBLISHED_DIFFICULTY_ROTATION[
    slotIndex % PUBLISHED_DIFFICULTY_ROTATION.length
  ];
}
