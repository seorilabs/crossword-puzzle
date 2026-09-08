// 홈 "오늘의 사다리" 정책.
//
// 같은 날짜의 두 난이도(easy 5×5, hard 8×8)를 병렬 선택지가 아니라 한 흐름의
// 두 단계로 보여준다. easy만 푸는 사용자는 평균 1.1일, easy와 hard를 모두 푸는
// 사용자는 평균 4.5일 플레이하고, easy를 끝낸 날의 69%가 같은 날 hard도 시작한다.
// 즉 easy는 진입 계단이고 hard가 잔존을 만드는 본 퍼즐이라, 홈의 주 CTA는 항상
// "다음 미완료 단계" 하나를 가리킨다. 단계를 직접 눌러 hard로 바로 가는 것은
// 막지 않는다(숙련자 경로). 3마켓(AIT/Android/iOS)이 같은 정책을 공유한다.
import { DAILY_PUZZLE_TIERS } from "./dailyPuzzleTiers.ts";
import { DIFFICULTY_PROFILES, type Difficulty } from "./difficultyProfiles.ts";
import type { PuzzleManifestItem } from "./types.ts";

export type DailyLadderStepStatus = "new" | "in_progress" | "exhausted" | "done";

export type DailyLadderStep = {
  // 1부터 시작하는 단계 번호(DAILY_PUZZLE_TIERS 순서).
  step: number;
  difficulty: Difficulty;
  puzzleId: string;
  summary: PuzzleManifestItem;
  // 단계 제목("워밍업" | "오늘의 퍼즐"). telemetry의 difficulty 값과는 별개다.
  title: string;
  // 제목 + 보드 크기("워밍업 · 5×5").
  label: string;
  status: DailyLadderStepStatus;
  statusLabel: string;
};

export type DailyLadderCtaSource = `ladder_step_${number}`;

export type DailyLadderCta =
  | {
      kind: "start" | "resume";
      step: DailyLadderStep;
      label: string;
      source: DailyLadderCtaSource;
    }
  | { kind: "all_done"; label: string }
  | { kind: "unavailable"; label: string };

export type DailyLadder = {
  steps: DailyLadderStep[];
  cta: DailyLadderCta;
  completedCount: number;
};

// 각 표면의 카드 상태(DateCardState)에서 사다리가 읽는 최소 필드.
export type DailyLadderCardState = {
  attemptsUsed?: number;
  completedAt?: string | null;
  hasProgress?: boolean;
};

export const DAILY_LADDER_STEP_TITLES: Record<Difficulty, string> = {
  easy: "워밍업",
  hard: "오늘의 퍼즐",
};

export const DAILY_LADDER_ALL_DONE_LABEL = "내일 다시";
export const DAILY_LADDER_UNAVAILABLE_LABEL = "오늘의 퍼즐 준비 중";
export const HOME_QUICK_START_EVENT = "home_quick_start";

const STATUS_LABELS: Record<DailyLadderStepStatus, string> = {
  new: "새 퍼즐",
  in_progress: "이어 풀기",
  exhausted: "도전 종료",
  done: "완료",
};

export function formatDailyLadderStepLabel(difficulty: Difficulty): string {
  const size = DIFFICULTY_PROFILES[difficulty].boardSize;
  return `${DAILY_LADDER_STEP_TITLES[difficulty]} · ${size}×${size}`;
}

function resolveStepStatus(
  state: DailyLadderCardState | undefined,
  dailyAttemptLimit: number,
): DailyLadderStepStatus {
  if (state?.completedAt != null) {
    return "done";
  }
  if (
    (state?.attemptsUsed ?? 0) >= Math.max(1, dailyAttemptLimit) &&
    state?.hasProgress === true
  ) {
    return "exhausted";
  }
  if (state?.hasProgress === true) {
    return "in_progress";
  }
  return "new";
}

// 오늘 발행된 퍼즐 요약을 DAILY_PUZZLE_TIERS 순서의 단계로 배치한다. 난이도당 한
// 판만 쓰고(중복은 첫 항목), 티어에 없는 난이도(레거시 normal)는 무시한다.
export function buildDailyLadder(
  todaySummaries: readonly PuzzleManifestItem[],
  cardStates: Readonly<Record<string, DailyLadderCardState | undefined>>,
  options: { dailyAttemptLimit: number },
): DailyLadder {
  const steps: DailyLadderStep[] = [];

  for (const tier of DAILY_PUZZLE_TIERS) {
    const summary = todaySummaries.find(
      (candidate) => candidate.difficulty === tier.difficulty,
    );
    if (summary == null) {
      continue;
    }
    const status = resolveStepStatus(
      cardStates[summary.puzzleId],
      options.dailyAttemptLimit,
    );
    steps.push({
      step: steps.length + 1,
      difficulty: tier.difficulty,
      puzzleId: summary.puzzleId,
      summary,
      title: DAILY_LADDER_STEP_TITLES[tier.difficulty],
      label: formatDailyLadderStepLabel(tier.difficulty),
      status,
      statusLabel: STATUS_LABELS[status],
    });
  }

  const completedCount = steps.filter((step) => step.status === "done").length;
  const nextStep = steps.find(
    (step) => step.status === "new" || step.status === "in_progress",
  );

  let cta: DailyLadderCta;
  if (nextStep != null) {
    const kind = nextStep.status === "in_progress" ? "resume" : "start";
    cta = {
      kind,
      step: nextStep,
      label: `${nextStep.title} ${kind === "resume" ? "이어 풀기" : "시작"}`,
      source: getDailyLadderCtaSource(nextStep),
    };
  } else if (steps.length > 0) {
    cta = { kind: "all_done", label: DAILY_LADDER_ALL_DONE_LABEL };
  } else {
    cta = { kind: "unavailable", label: DAILY_LADDER_UNAVAILABLE_LABEL };
  }

  return { steps, cta, completedCount };
}

export function getDailyLadderCtaSource(
  step: Pick<DailyLadderStep, "step">,
): DailyLadderCtaSource {
  return `ladder_step_${step.step}`;
}

// home_quick_start 이벤트에 싣는 사다리 파라미터. source는 기존 값(onboarding/
// today/switched_to_today)과 구분되도록 ladder_step_N을 쓴다.
export function buildDailyLadderCtaParams(step: DailyLadderStep): {
  source: DailyLadderCtaSource;
  difficulty: Difficulty;
  ladder_step: number;
  step_status: DailyLadderStepStatus;
} {
  return {
    source: getDailyLadderCtaSource(step),
    difficulty: step.difficulty,
    ladder_step: step.step,
    step_status: step.status,
  };
}

// 완료 직후 "다음 퍼즐" 버튼 문구. 사다리의 다음 단계면 단계 이름으로 잇고,
// 사다리 밖(과거 미완료 등)이면 기존 일반 문구를 유지한다.
export function formatDailyLadderNextLabel(
  next: Pick<PuzzleManifestItem, "difficulty" | "date">,
  currentDate?: string,
): string {
  if (currentDate != null && next.date !== currentDate) {
    return "다음 퍼즐 풀기";
  }
  if (next.difficulty === "hard") {
    return "오늘의 퍼즐 이어서 풀기";
  }
  if (next.difficulty === "easy") {
    return "워밍업 퍼즐 풀기";
  }
  return "다음 퍼즐 풀기";
}
