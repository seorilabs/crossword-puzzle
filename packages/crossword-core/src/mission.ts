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
