import type { Difficulty } from "./difficultyProfiles.ts";

export type DailyPuzzleTier = {
  difficulty: Difficulty;
  slotHour: number;
};

// 자정 배치 한 번으로 같은 날짜의 3개 난이도를 발행한다. slotHour는 퍼즐 ID와
// manifest identity를 안정적으로 분리하기 위한 내부 슬롯이며 실제 공개 시각이 아니다.
export const DAILY_PUZZLE_TIERS: readonly DailyPuzzleTier[] = [
  { difficulty: "easy", slotHour: 0 },
  { difficulty: "normal", slotHour: 1 },
  { difficulty: "hard", slotHour: 2 },
];
