export type DailyMissionState = {
  date: string;
  puzzleId: string;
  attemptsUsed: number;
  maxAttempts: number;
  completedAt?: string;
  lastStartedAt?: string;
};

export type DailyMissionRepository = {
  loadMission(
    date: string,
    puzzleId: string,
    maxAttempts: number,
  ): Promise<DailyMissionState>;
  saveMission(mission: DailyMissionState): Promise<void>;
};

export function createDailyMissionState(
  date: string,
  puzzleId: string,
  maxAttempts: number,
): DailyMissionState {
  return {
    date,
    puzzleId,
    attemptsUsed: 0,
    maxAttempts,
  };
}

export function getRemainingAttempts(mission: DailyMissionState) {
  return Math.max(0, mission.maxAttempts - mission.attemptsUsed);
}

export function startMissionAttempt(
  mission: DailyMissionState,
  now = new Date(),
): DailyMissionState {
  if (getRemainingAttempts(mission) === 0) {
    return mission;
  }

  return {
    ...mission,
    attemptsUsed: mission.attemptsUsed + 1,
    lastStartedAt: now.toISOString(),
  };
}

export function completeMission(
  mission: DailyMissionState,
  now = new Date(),
): DailyMissionState {
  if (mission.completedAt != null) {
    return mission;
  }

  return {
    ...mission,
    completedAt: now.toISOString(),
  };
}

export type CompletionAchievements = {
  // 힌트를 한 번도 쓰지 않고 완료(🎯 노힌트 클리어)
  noHint: boolean;
  // 첫 도전에 완료(💎 첫 도전 성공)
  firstTry: boolean;
  // 최고 기록(best-time) 갱신 후보로 인정할지 여부
  bestTimeEligible: boolean;
};

// 완료 성취 배지/최고 기록 판정을 한곳에서 결정한다. "정답 보기"로 단어를
// 공개(revealUsed)하면 무힌트·첫 도전 배지와 최고 기록 갱신에서 모두 제외해,
// 사용자가 도움 없이 푼 기록과 구분한다. 데일리 스트릭(완료일 연속 카운트)은
// 완료 사실만으로 유지하므로 여기서 다루지 않는다.
export function getCompletionAchievements(input: {
  hintCount: number;
  attemptsUsed: number;
  revealUsed: boolean;
}): CompletionAchievements {
  const unaided = !input.revealUsed;

  return {
    noHint: unaided && input.hintCount === 0,
    firstTry: unaided && input.attemptsUsed === 1,
    bestTimeEligible: unaided,
  };
}
