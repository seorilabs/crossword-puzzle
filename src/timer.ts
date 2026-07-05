// 풀이 경과 시간 표시용 순수 헬퍼. 일시정지 누적/진행 중 정지 제외 계산은
// 공유 코어(computeElapsedMs/Seconds)에 위임하고, 여기서는 표시 포맷과 얇은
// 어댑터만 둔다. App.tsx에서 분리해 단위 테스트로 회귀를 고정한다.
import {
  computeElapsedMs,
  computeElapsedSeconds,
} from "../packages/crossword-core/src";

export type PauseState = { pausedMs?: number; pausedAt?: string | null };

// 일시정지(누적 pausedMs + 진행 중 pausedAt)를 반영한 경과 초. pause 인자를
// 생략하면 일시정지 0으로 계산돼 기존 동작과 동일하다.
export function getElapsedSeconds(
  startedAt?: string,
  endedAt?: string,
  pause?: PauseState,
) {
  return computeElapsedSeconds({
    startedAt,
    endedAt,
    pausedMs: pause?.pausedMs,
    pausedAt: pause?.pausedAt ?? undefined,
  });
}

// 헤더 라이브 타이머 노출 여부(#233). 미션이 시작됐고(lastStartedAt 존재) 사용자가
// 설정에서 타이머 표시를 켠 경우에만 라이브 타이머를 렌더한다. 표시 여부만 판단하며
// 경과 측정·최고 기록·리더보드 계측에는 영향을 주지 않는다. 헤더 eyebrow 분기를
// 순수 함수로 분리해 헤드리스 단위 테스트로 회귀를 고정한다.
export function shouldShowLiveTimer(
  lastStartedAt: string | null | undefined,
  timerVisible: boolean,
): boolean {
  return lastStartedAt != null && timerVisible;
}

// 라이브 타이머 표시(m:ss).
export function formatLiveTimer(totalSeconds: number): string {
  const total = Math.floor(totalSeconds);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// 결과 화면 경과 라벨. 일시정지 누적(pausedMs)을 제외하고 계산한다.
export function formatElapsedTime(
  startedAt: string | undefined,
  completedAt: string | undefined,
  pausedMs = 0,
): string | null {
  if (startedAt == null || completedAt == null) {
    return null;
  }

  const elapsedMs = computeElapsedMs({
    startedAt,
    endedAt: completedAt,
    pausedMs,
  });

  if (elapsedMs == null) {
    return null;
  }

  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${totalSeconds}초`;
  }

  return `${minutes}분 ${String(seconds).padStart(2, "0")}초`;
}
