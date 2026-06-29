// 완료 직후 "다음 퍼즐" 추천 정책.
//
// 완료한 코어 사용자가 한 판 더 풀도록 잇는 동선이 약해, 완료자 1인당 재플레이
// 빈도를 끌어올리기 위한 추천을 한곳(코어)에 둔다. 3개 시장(AIT/Android/iOS)이
// 같은 추천 규칙을 공유한다.
//
// 규칙(우선순위):
//   1) 한 단계 위 난이도의 미완료 퍼즐(난이도 상승 → 진척감으로 재도전 유도)
//   2) 같은 난이도의 미완료 퍼즐(완주 흐름 유지)
//   3) 그 외 미완료 퍼즐(난이도 불명/하위 포함)
//   4) 미완료가 없으면 현재 퍼즐을 제외한 첫 후보(끊김 방지)
import { DIFFICULTY_ORDER, type Difficulty } from "./difficultyProfiles.ts";
import type { PuzzleManifestItem } from "./types.ts";

export type NextRecommendationContext = {
  puzzleId: string;
  difficulty?: Difficulty;
};

// DIFFICULTY_ORDER 내 위치(easy=0, normal=1, hard=2). 불명이면 -1.
function difficultyRank(difficulty?: Difficulty): number {
  return difficulty == null ? -1 : DIFFICULTY_ORDER.indexOf(difficulty);
}

export function getNextRecommendedPuzzleSummary(
  puzzleSummaries: PuzzleManifestItem[],
  completedPuzzleIds: ReadonlySet<string>,
  current: NextRecommendationContext,
): PuzzleManifestItem | undefined {
  const candidates = puzzleSummaries.filter(
    (summary) => summary.puzzleId !== current.puzzleId,
  );
  const uncompleted = candidates.filter(
    (summary) => !completedPuzzleIds.has(summary.puzzleId),
  );

  const currentRank = difficultyRank(current.difficulty);

  // 난이도를 알 수 없으면(불명) 진척 분기를 건너뛰고 기존 동작(미완료 우선)으로 둔다.
  if (currentRank >= 0) {
    const nextTierUp = uncompleted.find(
      (summary) => difficultyRank(summary.difficulty) === currentRank + 1,
    );
    if (nextTierUp != null) {
      return nextTierUp;
    }

    const sameTier = uncompleted.find(
      (summary) => difficultyRank(summary.difficulty) === currentRank,
    );
    if (sameTier != null) {
      return sameTier;
    }
  }

  return uncompleted[0] ?? candidates[0];
}
