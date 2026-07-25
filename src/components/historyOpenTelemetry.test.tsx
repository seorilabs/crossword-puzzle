import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CompletionCelebrationDialog,
  type CompletionCelebrationDialogProps,
} from "./CompletionCelebrationDialog";
import { MissionHistoryCard } from "./MissionHistoryCard";

// AC-3(#300) 검증: telemetry 파사드를 목킹하지 않고, 실제 telemetry.click
// 프로덕션 코드가 도달하는 sink 디스패처(dispatchAnalytics)만 목킹한다.
// "계측을 검증한다면서 계측 모듈 자체를 목킹하는" 순환 없이, 실제 이벤트
// 계약(kind·name·params)이 sink 경계로 흘러가는지를 확인한다.
const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn() }));

vi.mock("../adapters/analyticsSinks", () => ({
  dispatchAnalytics: dispatchMock,
}));

afterEach(() => {
  cleanup();
  dispatchMock.mockReset();
});

function completionDialogProps(): CompletionCelebrationDialogProps {
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

describe("history_open 계측(#300 AC-3) — 실제 telemetry.click → sink 경로", () => {
  it("홈 카드 클릭이 click/history_open/{source:home_card} 이벤트를 sink로 디스패치한다", () => {
    render(
      <MissionHistoryCard
        attemptsUsed={3}
        consecutiveStreak={0}
        fastestBestTimeMs={null}
        onOpen={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /미션 기록/ }));

    // 실제 telemetry.click 이 compactTelemetryParams 를 거쳐 sink 로 넘긴 이벤트.
    expect(dispatchMock).toHaveBeenCalledWith({
      kind: "click",
      name: "history_open",
      params: { source: "home_card" },
    });
  });

  it("완료 다이얼로그 \"내 기록 보기\" 클릭이 click/history_open/{source:completion_dialog} 이벤트를 sink로 디스패치한다", () => {
    render(<CompletionCelebrationDialog {...completionDialogProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "내 기록 보기" }));

    expect(dispatchMock).toHaveBeenCalledWith({
      kind: "click",
      name: "history_open",
      params: { source: "completion_dialog" },
    });
  });
});
