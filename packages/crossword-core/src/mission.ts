export type DailyMissionState = {
  date: string;
  puzzleId: string;
  attemptsUsed: number;
  maxAttempts: number;
  completedAt?: string;
  lastStartedAt?: string;
  // 리워드 광고로 충전받은 추가 도전 횟수(#204). 일일 상한 판정에 쓰이므로
  // 미션 상태에 함께 저장한다. 없으면 0으로 본다.
  extraAttemptsGranted?: number;
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

export type ElapsedInput = {
  /** 풀이 시작 시각(ISO). 없으면 경과를 계산할 수 없다. */
  startedAt?: string;
  /** 종료(완료) 시각(ISO). 없으면 진행 중으로 보고 `now`까지 계산한다. */
  endedAt?: string;
  /** 이미 누적된 일시정지 시간(ms). */
  pausedMs?: number;
  /** 현재 일시정지 중이면 그 시작 시각(ISO). 진행 중이면 생략한다. */
  pausedAt?: string;
  /** 기준 현재 시각(ms). 테스트 주입용. 기본값 Date.now(). */
  now?: number;
};

/**
 * 일시정지 구간을 제외한 순수 경과 시간(ms)을 계산한다.
 * 경과 = (종료 또는 now) - 시작 - 누적 일시정지(pausedMs) - 진행 중 정지 구간.
 * 진행 중 정지 구간은 현재 일시정지 중(`pausedAt` 존재)이고 종료 전일 때만 더한다.
 * 시작 시각이 없거나 값이 비정상(역전 등)이면 undefined를 반환한다.
 */
export function computeElapsedMs(input: ElapsedInput): number | undefined {
  const { startedAt, endedAt, pausedAt } = input;
  if (startedAt == null) {
    return undefined;
  }

  const startTime = new Date(startedAt).getTime();
  const now = input.now ?? Date.now();
  const endTime = endedAt == null ? now : new Date(endedAt).getTime();

  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime < startTime
  ) {
    return undefined;
  }

  let pausedMs =
    typeof input.pausedMs === "number" && Number.isFinite(input.pausedMs)
      ? Math.max(0, input.pausedMs)
      : 0;

  // 종료되지 않은(진행 중) 미션이 현재 일시정지 상태면, 멈춘 순간부터 기준
  // 시각까지의 구간도 경과에서 제외한다(타이머가 멈춰 보이도록).
  if (endedAt == null && pausedAt != null) {
    const pausedAtTime = new Date(pausedAt).getTime();
    if (Number.isFinite(pausedAtTime) && endTime > pausedAtTime) {
      pausedMs += endTime - pausedAtTime;
    }
  }

  const elapsed = endTime - startTime - pausedMs;
  return elapsed > 0 ? elapsed : 0;
}

/** computeElapsedMs를 초 단위로 반올림해 반환한다. */
export function computeElapsedSeconds(input: ElapsedInput): number | undefined {
  const ms = computeElapsedMs(input);
  return ms == null ? undefined : Math.round(ms / 1000);
}

/** 풀이 일시정지 세션 상태(누적 정지 ms + 진행 중 정지 시작 ISO). */
export type PauseSessionState = {
  pausedMs: number;
  pausedAt: string | null;
};

/**
 * 일시정지 상태를 토글한다(순수 함수, 3마켓 공유).
 * - 진행 중(`pausedAt == null`)이면 `now`에 정지를 시작한다(`pausedAt` 설정).
 * - 정지 중이면 멈춰 있던 구간(`now - pausedAt`)을 `pausedMs`에 누적하고 재개한다
 *   (`pausedAt = null`). 시계 역전 등으로 음수/비정상이면 0으로 보정한다.
 */
export function togglePauseState(
  pause: PauseSessionState,
  now: Date,
): PauseSessionState {
  if (pause.pausedAt == null) {
    return { pausedMs: pause.pausedMs, pausedAt: now.toISOString() };
  }
  const pausedForMs = now.getTime() - new Date(pause.pausedAt).getTime();
  const delta = Number.isFinite(pausedForMs) && pausedForMs > 0 ? pausedForMs : 0;
  return { pausedMs: pause.pausedMs + delta, pausedAt: null };
}

/**
 * 리워드 광고 시청 보상으로 추가 도전 기회를 더 부여할 수 있는지 판정한다(#204).
 * 완료한 미션이거나 일일 추가 상한(maxExtraPerDay)에 도달했으면 false.
 *
 * 일일 상한은 달력일 기준 전체 미션의 누계로 강제해야 한다. mission.date는
 * 퍼즐 발행일이라 오늘 다른 퍼즐에서 이미 충전했는지 미션 상태만으로는 알 수
 * 없으므로, 호출자가 오늘(달력일) 부여 누계(grantedToday)를 함께 전달한다.
 * 생략하면 해당 미션의 부여 횟수로 폴백하지만, 하루에 여러 퍼즐을 도는
 * 우회가 가능하므로 UI 게이트는 반드시 일일 누계를 넘겨야 한다.
 */
export function canGrantExtraAttempt(
  mission: DailyMissionState,
  maxExtraPerDay = 1,
  grantedToday: number = mission.extraAttemptsGranted ?? 0,
): boolean {
  const grantedCount = Math.max(
    grantedToday,
    mission.extraAttemptsGranted ?? 0,
  );
  return (
    mission.completedAt == null && grantedCount < Math.max(0, maxExtraPerDay)
  );
}

/**
 * 리워드 광고 보상으로 도전 기회를 1회 충전한다(#204). 순수 함수.
 * maxAttempts를 +1 하고 부여 횟수(extraAttemptsGranted)를 기록한다.
 * 일일 추가 상한(maxExtraPerDay, 기본 1회)을 넘거나 이미 완료한 미션이면
 * 상태를 바꾸지 않고 그대로 반환해 남용을 막는다. 상한 판정 기준은
 * canGrantExtraAttempt와 동일하게 일일 누계(grantedToday)를 우선한다.
 * 추가 기회로 완료해도 attemptsUsed는 그대로 누적되므로 '첫 도전 성공'
 * 배지(getCompletionAchievements.firstTry)는 자동으로 제외된다.
 */
export function grantExtraAttempt(
  mission: DailyMissionState,
  maxExtraPerDay = 1,
  grantedToday: number = mission.extraAttemptsGranted ?? 0,
): DailyMissionState {
  if (!canGrantExtraAttempt(mission, maxExtraPerDay, grantedToday)) {
    return mission;
  }

  return {
    ...mission,
    maxAttempts: mission.maxAttempts + 1,
    extraAttemptsGranted: (mission.extraAttemptsGranted ?? 0) + 1,
  };
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
