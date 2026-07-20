import type { Difficulty } from "./difficultyProfiles";

// 2시간 슬롯 네 개를 한 주기로 묶어 normal 비중을 50%로 유지하면서
// easy/hard를 각각 25% 공급한다. AIT/Web과 Android/iOS가 같은 manifest를
// 읽으므로 발행 난이도 정책도 core에서 단일 출처로 관리한다.
export const PUBLISHED_DIFFICULTY_ROTATION: readonly Difficulty[] = [
  "normal",
  "easy",
  "normal",
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
