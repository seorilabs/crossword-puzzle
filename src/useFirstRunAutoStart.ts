import { useEffect, useRef } from "react";

import { shouldAutoStartFirstRun } from "../packages/crossword-core/src";

export type FirstRunSnapshot = {
  hasCompletedAnyDaily: boolean;
  hasDailyProgress: boolean;
  onboardingStarted: boolean;
  activePuzzleIsOnboarding: boolean;
};

// 신규 첫 실행 온보딩 퍼즐 자동 진입(#205)의 발동 오케스트레이션 훅.
// 판정 자체는 코어 shouldAutoStartFirstRun 순수 함수가 담당하고, 이 훅은
// "언제 한 번 발동할지"만 다룬다:
// - 퍼즐 팩 로드 완료(snapshot != null, loadState !== "loading")와
//   원격 설정 fetch 완료(launchConfigResolved)를 모두 기다린 뒤 판정한다
//   (원격에서 끈 게이트가 fetch 레이스로 무시되는 것을 방지).
// - 조건이 갖춰진 최초 1회만 판정을 소비한다(doneRef). 딥링크 등으로 홈이
//   아닌 라우트에 들어온 경우 그 1회를 no-op으로 소비해 이후 홈 복귀 시에도
//   재발동하지 않는다(첫 실행 시점 한정 개입).
export function useFirstRunAutoStart({
  enabled,
  launchConfigResolved,
  isLoading,
  isHomeRoute,
  snapshot,
  onAutoStart,
}: {
  enabled: boolean;
  launchConfigResolved: boolean;
  isLoading: boolean;
  isHomeRoute: boolean;
  snapshot: FirstRunSnapshot | null;
  onAutoStart: () => void;
}) {
  const doneRef = useRef(false);
  // 콜백은 ref로 최신을 유지해 effect 재실행 없이도 stale closure를 피한다.
  const onAutoStartRef = useRef(onAutoStart);
  useEffect(() => {
    onAutoStartRef.current = onAutoStart;
  }, [onAutoStart]);

  useEffect(() => {
    if (doneRef.current) {
      return;
    }
    if (snapshot == null || !launchConfigResolved || isLoading) {
      return;
    }

    doneRef.current = true;

    if (!isHomeRoute) {
      return;
    }
    if (!shouldAutoStartFirstRun({ enabled, ...snapshot })) {
      return;
    }

    onAutoStartRef.current();
  }, [enabled, isHomeRoute, isLoading, launchConfigResolved, snapshot]);
}
