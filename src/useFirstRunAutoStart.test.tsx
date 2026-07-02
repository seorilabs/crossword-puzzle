// 첫 실행 자동 진입 오케스트레이션 훅 회귀 테스트 (vitest + jsdom)
// 판정 자체(shouldAutoStartFirstRun)는 코어 테스트가 다루고, 여기서는
// "언제 한 번 발동하는지"(로드·원격 설정 대기, 1회성 소비, 비홈 라우트 no-op)를 고정한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import {
  useFirstRunAutoStart,
  type FirstRunSnapshot,
} from "./useFirstRunAutoStart";

afterEach(cleanup);

const freshSnapshot: FirstRunSnapshot = {
  hasCompletedAnyDaily: false,
  hasDailyProgress: false,
  onboardingStarted: false,
  activePuzzleIsOnboarding: true,
};

type HarnessProps = {
  enabled?: boolean;
  launchConfigResolved?: boolean;
  isLoading?: boolean;
  isHomeRoute?: boolean;
  snapshot?: FirstRunSnapshot | null;
  onAutoStart: () => void;
};

function Harness({
  enabled = true,
  launchConfigResolved = true,
  isLoading = false,
  isHomeRoute = true,
  snapshot = freshSnapshot,
  onAutoStart,
}: HarnessProps) {
  useFirstRunAutoStart({
    enabled,
    launchConfigResolved,
    isLoading,
    isHomeRoute,
    snapshot,
    onAutoStart,
  });
  return null;
}

describe("useFirstRunAutoStart (#205)", () => {
  it("퍼즐 로드·원격 설정 완료 + 신규 입력이면 자동 진입 콜백을 1회 발동한다", () => {
    const onAutoStart = vi.fn();
    render(<Harness onAutoStart={onAutoStart} />);
    expect(onAutoStart).toHaveBeenCalledTimes(1);
  });

  it("딥링크 등 홈이 아닌 라우트면 발동하지 않고, 이후 홈 복귀에도 재발동하지 않는다", () => {
    const onAutoStart = vi.fn();
    const { rerender } = render(
      <Harness isHomeRoute={false} onAutoStart={onAutoStart} />,
    );
    expect(onAutoStart).not.toHaveBeenCalled();

    // 판정 1회가 no-op으로 소비됐으므로 홈으로 이동해도 발동하지 않는다.
    rerender(<Harness isHomeRoute={true} onAutoStart={onAutoStart} />);
    expect(onAutoStart).not.toHaveBeenCalled();
  });

  it("원격 설정 fetch가 끝나기 전(launchConfigResolved=false)에는 발동하지 않는다", () => {
    const onAutoStart = vi.fn();
    const { rerender } = render(
      <Harness launchConfigResolved={false} onAutoStart={onAutoStart} />,
    );
    expect(onAutoStart).not.toHaveBeenCalled();

    // fetch 완료 후 같은 신규 입력이면 그때 1회 발동한다(판정 미소비 유지).
    rerender(<Harness launchConfigResolved={true} onAutoStart={onAutoStart} />);
    expect(onAutoStart).toHaveBeenCalledTimes(1);
  });

  it("퍼즐 팩 로드 전(snapshot=null 또는 isLoading)에는 발동하지 않는다", () => {
    const onAutoStart = vi.fn();
    const { rerender } = render(
      <Harness snapshot={null} onAutoStart={onAutoStart} />,
    );
    expect(onAutoStart).not.toHaveBeenCalled();

    rerender(
      <Harness isLoading={true} snapshot={freshSnapshot} onAutoStart={onAutoStart} />,
    );
    expect(onAutoStart).not.toHaveBeenCalled();
  });

  it("게이트(enabled=false)면 발동하지 않는다 — Remote Config 킬 스위치", () => {
    const onAutoStart = vi.fn();
    render(<Harness enabled={false} onAutoStart={onAutoStart} />);
    expect(onAutoStart).not.toHaveBeenCalled();
  });

  it("도전 이력이 있는 기존 사용자 입력이면 발동하지 않는다", () => {
    const onAutoStart = vi.fn();
    render(
      <Harness
        snapshot={{ ...freshSnapshot, hasCompletedAnyDaily: true }}
        onAutoStart={onAutoStart}
      />,
    );
    expect(onAutoStart).not.toHaveBeenCalled();
  });

  it("발동 후 입력이 다시 바뀌어도 중복 발동하지 않는다(앱 수명당 1회)", () => {
    const onAutoStart = vi.fn();
    const { rerender } = render(<Harness onAutoStart={onAutoStart} />);
    expect(onAutoStart).toHaveBeenCalledTimes(1);

    // effect 재트리거(스냅샷 객체 교체·라우트 변화)에도 doneRef가 중복을 차단한다.
    rerender(
      <Harness
        snapshot={{ ...freshSnapshot }}
        isHomeRoute={false}
        onAutoStart={onAutoStart}
      />,
    );
    rerender(<Harness snapshot={{ ...freshSnapshot }} onAutoStart={onAutoStart} />);
    expect(onAutoStart).toHaveBeenCalledTimes(1);
  });
});
