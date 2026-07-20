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
//   4) 미완료가 없으면 undefined(완료 퍼즐을 다시 시작시키지 않고 홈/보너스 fallback)
import { DIFFICULTY_ORDER, type Difficulty } from "./difficultyProfiles.ts";
import type { PuzzleManifestItem } from "./types.ts";

export type NextRecommendationContext = {
  puzzleId: string;
  difficulty?: Difficulty;
};

export const NEXT_PUZZLE_CTA_EVENT = "next_puzzle_cta";
export type NextPuzzleCtaSource = "result_overlay" | "result_screen";

export function buildNextPuzzleCtaParams(
  next: PuzzleManifestItem,
  source: NextPuzzleCtaSource,
): {
  next_difficulty: PuzzleManifestItem["difficulty"];
  next_puzzle_id: string;
  source: NextPuzzleCtaSource;
} {
  return {
    next_difficulty: next.difficulty,
    next_puzzle_id: next.puzzleId,
    source,
  };
}

export function buildNextPuzzleCtaEvent(
  next: PuzzleManifestItem,
  source: NextPuzzleCtaSource,
): {
  name: typeof NEXT_PUZZLE_CTA_EVENT;
  params: ReturnType<typeof buildNextPuzzleCtaParams>;
} {
  return {
    name: NEXT_PUZZLE_CTA_EVENT,
    params: buildNextPuzzleCtaParams(next, source),
  };
}

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

  // 난이도를 알 수 없으면(불명, rank<0) 진척 분기를 건너뛰고 기존 동작(미완료 우선)으로
  // 둔다. 후보 비교는 항상 0 이상의 알려진 티어 rank끼리만 일치하므로, 난이도 불명
  // 후보(rank -1)는 진척/동일 티어 분기에 절대 매칭되지 않는다.
  if (currentRank >= 0) {
    // 최고 티어(hard)에는 한 단계 위가 없으므로 nextTierUp 탐색 자체를 건너뛴다.
    const hasHigherTier = currentRank < DIFFICULTY_ORDER.length - 1;
    const nextTierUp = hasHigherTier
      ? uncompleted.find(
          (summary) => difficultyRank(summary.difficulty) === currentRank + 1,
        )
      : undefined;
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

  return uncompleted[0];
}
