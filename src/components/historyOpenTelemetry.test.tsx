import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CompletionCelebrationDialog,
  type CompletionCelebrationDialogProps,
} from "./CompletionCelebrationDialog";
import { MissionHistoryCard } from "./MissionHistoryCard";

// AC-1·AC-3(#300) 통합 검증. 두 가지를 동시에 관찰 가능하게 만든다.
//  1) 이동/닫힘(AC-1): 호스트가 App.tsx의 배선을 그대로 재현해, 클릭 결과로
//     다이얼로그가 사라지고 라우트가 "history"로 바뀌는 것을 DOM으로 확인한다.
//  2) 계측(AC-3): telemetry 파사드를 목킹하지 않고, 실제 telemetry.click 이
//     도달하는 sink 디스패처(dispatchAnalytics)만 목킹해 이벤트 계약을 확인한다
//     ("계측을 검증한다면서 계측 모듈을 목킹하는" 순환 없음).
const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn() }));

vi.mock("../adapters/analyticsSinks", () => ({
  dispatchAnalytics: dispatchMock,
}));

afterEach(() => {
  cleanup();
  dispatchMock.mockReset();
});

function baseCompletionProps(): CompletionCelebrationDialogProps {
  return {
    attemptsUsed: 1,
    completedCount: 10,
    consecutiveStreak: 2,
    elapsedLabel: "01:20",
    hintCount: 0,
    isNewBestTime: false,
    puzzleId: "26060114",
    revealUsed: false,
    shareGrid: "🟩🟩",
    shareText: "공유 결과",
    totalCount: 10,
    onClose: vi.fn(),
    onGoHome: vi.fn(),
    onSeeHistory: vi.fn(),
    onSeeResult: vi.fn(),
  };
}

// App.tsx의 완료 다이얼로그 배선을 재현한 호스트: onSeeHistory 는 다이얼로그를
// 닫고(navigate 이전 dismissCompletionCelebration) history 라우트로 이동한다.
function CompletionDialogHost() {
  const [open, setOpen] = useState(true);
  const [route, setRoute] = useState("today");
  return (
    <>
      <div data-testid="route">{route}</div>
      {open ? (
        <CompletionCelebrationDialog
          {...baseCompletionProps()}
          onSeeHistory={() => {
            setOpen(false);
            setRoute("history");
          }}
        />
      ) : null}
    </>
  );
}

// App.tsx의 홈 미션 기록 카드 배선을 재현한 호스트: onOpen 은 history 로 이동한다.
function MissionCardHost() {
  const [route, setRoute] = useState("home");
  return (
    <>
      <div data-testid="route">{route}</div>
      <MissionHistoryCard
        attemptsUsed={3}
        consecutiveStreak={0}
        fastestBestTimeMs={null}
        onOpen={() => setRoute("history")}
      />
    </>
  );
}

describe("완료 다이얼로그 기록 진입(#300 AC-1·AC-3 completion_dialog)", () => {
  it("\"내 기록 보기\" 클릭 시 다이얼로그가 닫히고 라우트가 history로 바뀐다(AC-1)", () => {
    render(<CompletionDialogHost />);
    // 보조 버튼이 렌더되고, 다이얼로그가 열려 있다.
    expect(screen.getByRole("dialog")).toBeTruthy();
    const button = screen.getByRole("button", { name: "내 기록 보기" });

    fireEvent.click(button);

    // "다이얼로그 닫고 navigate("history")"의 관찰 가능한 결과.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("route").textContent).toBe("history");
  });

  it("\"내 기록 보기\" 클릭이 실제 telemetry.click을 통해 click/history_open/{source:completion_dialog}을 sink로 발화한다(AC-3)", () => {
    render(<CompletionDialogHost />);

    fireEvent.click(screen.getByRole("button", { name: "내 기록 보기" }));

    expect(dispatchMock).toHaveBeenCalledWith({
      kind: "click",
      name: "history_open",
      params: { source: "completion_dialog" },
    });
  });
});

describe("홈 미션 기록 카드 진입(#300 AC-3 home_card)", () => {
  it("카드 클릭 시 라우트가 history로 바뀐다", () => {
    render(<MissionCardHost />);

    fireEvent.click(screen.getByRole("button", { name: /미션 기록/ }));

    expect(screen.getByTestId("route").textContent).toBe("history");
  });

  it("카드 클릭이 실제 telemetry.click을 통해 click/history_open/{source:home_card}을 sink로 발화한다(AC-3)", () => {
    render(<MissionCardHost />);

    fireEvent.click(screen.getByRole("button", { name: /미션 기록/ }));

    expect(dispatchMock).toHaveBeenCalledWith({
      kind: "click",
      name: "history_open",
      params: { source: "home_card" },
    });
  });
});
