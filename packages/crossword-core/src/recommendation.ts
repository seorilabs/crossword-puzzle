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

// 온보딩 난이도 램프(#291) 옵션. 켜지면 신규 사용자의 easy(온보딩) 완료 직후 추천을
// 완화한다. 기본(옵션 미전달/false)은 기존 동작과 완전히 동일하다.
export type NextRecommendationOptions = {
  onboardingRampEnabled?: boolean;
};

// 램프를 적용할 "신규 사용자" 상한(현재 퍼즐을 제외한 기완료 퍼즐 수). 0 이면 첫 완료
// (온보딩 easy)에서만 완화하고, 두 번째 완료부터는 기존 난이도 상승 규칙으로 돌아간다.
// → 진행 곡선은 easy(온보딩) → easy → normal 로 첫 급점프만 한 단계 늦춘다.
export const ONBOARDING_RAMP_MAX_COMPLETIONS = 0;

// 현재 퍼즐을 제외한 기완료 퍼즐 수. 완료 집합에는 방금 완료한 현재 퍼즐이 포함될 수
// 있어(렌더 타이밍 의존) 이를 배제해 "이전에 몇 판 완료했는지"를 안정적으로 센다.
function countPriorCompleted(
  completedPuzzleIds: ReadonlySet<string>,
  currentPuzzleId: string,
): number {
  return (
    completedPuzzleIds.size - (completedPuzzleIds.has(currentPuzzleId) ? 1 : 0)
  );
}

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
  options?: NextRecommendationOptions,
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
    const sameTier = uncompleted.find(
      (summary) => difficultyRank(summary.difficulty) === currentRank,
    );

    // 온보딩 램프(#291): 램프가 켜져 있고 신규 사용자(현재 제외 기완료 ≤ 상한)가
    // easy(온보딩)를 막 끝냈다면, normal 급점프 대신 같은 easy 티어를 한 단계 더
    // 배정해 easy→normal 난이도 절벽을 완화한다. 남은 easy 후보가 없으면 아래 기존
    // 상승 규칙으로 자연 폴백한다. 램프 off 시 이 분기는 건너뛰어 동작이 불변이다.
    const softenOnboarding =
      options?.onboardingRampEnabled === true &&
      current.difficulty === "easy" &&
      countPriorCompleted(completedPuzzleIds, current.puzzleId) <=
        ONBOARDING_RAMP_MAX_COMPLETIONS;
    if (softenOnboarding && sameTier != null) {
      return sameTier;
    }

    if (nextTierUp != null) {
      return nextTierUp;
    }

    if (sameTier != null) {
      return sameTier;
    }
  }

  return uncompleted[0];
}
