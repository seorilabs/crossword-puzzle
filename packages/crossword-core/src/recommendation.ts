// 완료 직후 "다음 퍼즐" 추천 정책.
//
// 완료한 코어 사용자가 한 판 더 풀도록 잇는 동선이 약해, 완료자 1인당 재플레이
// 빈도를 끌어올리기 위한 추천을 한곳(코어)에 둔다. 3개 시장(AIT/Android/iOS)이
// 같은 추천 규칙을 공유한다.
//
// 규칙(우선순위):
//   0) 같은 날짜의 미완료 퍼즐을 일간 사다리(DAILY_PUZZLE_TIERS) 순서로 — 워밍업(easy)
//      을 끝내면 오늘의 퍼즐(hard)로, hard를 먼저 끝냈고 easy가 남았으면 easy로 잇는다.
//      easy만 푸는 사용자는 잔존이 없고 두 판을 모두 푸는 사용자가 잔존하므로, 완료
//      직후 동선은 오늘의 나머지 단계를 최우선으로 가리킨다.
//   1) 한 단계 위 난이도의 미완료 퍼즐(난이도 상승 → 진척감으로 재도전 유도)
//   2) 같은 난이도의 미완료 퍼즐(완주 흐름 유지)
//   3) 그 외 미완료 퍼즐(난이도 불명/하위 포함, 과거 발행분 #347)
//   4) 미완료가 없으면 undefined(완료 퍼즐을 다시 시작시키지 않고 홈/보너스 fallback)
import { DAILY_PUZZLE_TIERS } from "./dailyPuzzleTiers.ts";
import { DIFFICULTY_ORDER, type Difficulty } from "./difficultyProfiles.ts";
import { normalizePuzzleIdentifier } from "./puzzleIdentifiers.ts";
import type { PuzzleManifestItem } from "./types.ts";

export type NextRecommendationContext = {
  puzzleId: string;
  difficulty?: Difficulty;
  // 현재 퍼즐의 발행 날짜. 생략하면 puzzleSummaries에서 puzzleId로 찾는다.
  date?: string;
};

// 온보딩 난이도 램프(#291) 옵션. 켜지면 신규 사용자의 온보딩 easy 완료 직후 추천을
// 완화한다. 옵션 자체는 순수 함수 호출자가 명시하며, 제품 기본값은 launchConfig가
// true로 전달한다. onboardingPuzzleId가 현재 퍼즐과 같을 때만 완화하므로, 온보딩
// 퍼즐이 없는 표면(RN)은 daily easy 완료 후 곧바로 오늘의 hard로 이어진다.
export type NextRecommendationOptions = {
  onboardingRampEnabled?: boolean;
  onboardingPuzzleId?: string;
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
    next_puzzle_id: normalizePuzzleIdentifier(next.puzzleId),
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
  const sameTier = uncompleted.find(
    (summary) => difficultyRank(summary.difficulty) === currentRank,
  );

  // 온보딩 램프(#291): 램프가 켜져 있고 신규 사용자(현재 제외 기완료 ≤ 상한)가
  // 온보딩 easy 퍼즐을 막 끝냈다면, hard 급점프 대신 같은 easy 티어(오늘의 워밍업)
  // 를 배정해 난이도 절벽을 완화한다. 남은 easy가 없으면 CTA를 숨긴다(hard 로 밀지
  // 않는다). 램프 off 이거나 현재 퍼즐이 온보딩 퍼즐이 아니면 아래 규칙을 쓴다.
  const softenOnboarding =
    options?.onboardingRampEnabled === true &&
    options.onboardingPuzzleId != null &&
    current.puzzleId === options.onboardingPuzzleId &&
    current.difficulty === "easy" &&
    countPriorCompleted(completedPuzzleIds, current.puzzleId) <=
      ONBOARDING_RAMP_MAX_COMPLETIONS;
  if (softenOnboarding) {
    return sameTier ?? undefined;
  }

  // 규칙 0: 같은 날짜의 남은 사다리 단계.
  const currentDate =
    current.date ??
    puzzleSummaries.find((summary) => summary.puzzleId === current.puzzleId)
      ?.date;
  if (currentDate != null) {
    for (const tier of DAILY_PUZZLE_TIERS) {
      const sameDateStep = uncompleted.find(
        (summary) =>
          summary.date === currentDate &&
          summary.difficulty === tier.difficulty,
      );
      if (sameDateStep != null) {
        return sameDateStep;
      }
    }
  }

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

    if (sameTier != null) {
      return sameTier;
    }
  }

  return uncompleted[0];
}
