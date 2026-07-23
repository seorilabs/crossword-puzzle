import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CompletionCelebrationDialog,
  type CompletionCelebrationDialogProps,
} from "./CompletionCelebrationDialog";

// 공유 CTA 계측(#299) 검증을 위해 telemetry 파사드를 목킹한다.
const { clickMock, impressionMock } = vi.hoisted(() => ({
  clickMock: vi.fn(),
  impressionMock: vi.fn(),
}));

vi.mock("../adapters/telemetry", () => ({
  telemetry: {
    screen: vi.fn(),
    click: clickMock,
    impression: impressionMock,
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clickMock.mockReset();
  impressionMock.mockReset();
});

// share()가 예약한 deliverShareText 프라미스 체인이 끝나도록 태스크 큐를 비운다.
async function flushShare() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderDialog(
  overrides: Partial<CompletionCelebrationDialogProps> = {},
) {
  const props: CompletionCelebrationDialogProps = {
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
    onSeeResult: vi.fn(),
    ...overrides,
  };

  render(<CompletionCelebrationDialog {...props} />);
  return props;
}

describe("CompletionCelebrationDialog 다음 퍼즐 CTA(#274)", () => {
  it("미해결 추천이 있으면 난이도·제목을 포함한 primary CTA를 최상단에 노출한다", () => {
    const onStartNextPuzzle = vi.fn();
    renderDialog({
      nextPuzzleLabel: "#26060114 · 어려움",
      onStartNextPuzzle,
    });

    const cta = screen.getByRole("button", {
      name: "다음 퍼즐 풀기 · #26060114 · 어려움",
    });
    expect(cta.classList.contains("primaryButton")).toBe(true);
    expect(cta.classList.contains("completionNextPuzzleButton")).toBe(true);

    fireEvent.click(cta);
    expect(onStartNextPuzzle).toHaveBeenCalledTimes(1);
  });

  it("추천할 미해결 퍼즐이 없으면 다음 CTA 없이 결과·홈 fallback을 유지한다", () => {
    const props = renderDialog();

    expect(screen.queryByRole("button", { name: /다음 퍼즐 풀기/ })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "결과 보기" })
        .classList.contains("primaryButton"),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "홈으로" }));
    expect(props.onGoHome).toHaveBeenCalledTimes(1);
  });
});

describe("CompletionCelebrationDialog 공유 CTA 계측(#299)", () => {
  it("공유 버튼 클릭 시 completion_dialog surface·puzzle_id·difficulty로 share_result_click을 발화한다(AC-1·AC-2)", async () => {
    // 공유 시트 성공 경로.
    vi.stubGlobal("navigator", { share: vi.fn(() => Promise.resolve()) });
    renderDialog({ puzzleId: "26060114", difficulty: "hard" });

    fireEvent.click(screen.getByRole("button", { name: "결과 공유하기" }));
    await flushShare();

    // 호출부(CompletionCelebrationDialog)가 surface·컨텍스트를 정확히 실어 발화한다.
    expect(clickMock).toHaveBeenCalledWith("share_result_click", {
      surface: "completion_dialog",
      puzzle_id: "26060114",
      difficulty: "hard",
    });
    // 전달 결과도 같은 surface로 이어진다(AC-3).
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "completion_dialog",
      outcome: "shared",
    });
  });

  it("클립보드 폴백 복사 시 복사 토스트를 노출한다(AC-4 회귀 없음)", async () => {
    // 공유 시트 미지원 → 클립보드 복사 성공.
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
    renderDialog({ puzzleId: "26060114", difficulty: "normal" });

    fireEvent.click(screen.getByRole("button", { name: "결과 공유하기" }));
    await flushShare();

    expect(screen.getByText("클립보드에 복사됐어요!")).toBeTruthy();
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "completion_dialog",
      outcome: "copied",
    });
  });
});
