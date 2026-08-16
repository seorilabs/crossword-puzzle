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
    onSeeHistory: vi.fn(),
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

describe("CompletionCelebrationDialog 기록 진입 CTA(#300)", () => {
  it("\"내 기록 보기\" 보조 버튼을 렌더하고, 클릭 시 다이얼로그를 닫고 navigate(\"history\")를 합성한 onSeeHistory를 호출한다(AC-1)", () => {
    const props = renderDialog();

    // "보조 버튼 추가": 실제로 렌더된다.
    const button = screen.getByRole("button", { name: "내 기록 보기" });
    expect(button.classList.contains("secondaryButton")).toBe(true);

    fireEvent.click(button);

    // "클릭 시 다이얼로그 닫고 navigate(\"history\") 실행"은 이 콜백에 합성돼
    // 주입된다 — 호출부 배선(src/App.tsx): onSeeHistory={() => {
    //   dismissCompletionCelebration(); navigate("history"); }}.
    // AC-4에서 확인된 onGoHome/onSeeResult 와 동일한 주입 seam이다.
    expect(props.onSeeHistory).toHaveBeenCalledTimes(1);
    // 기록 CTA는 닫기/결과/홈 콜백을 대신 호출하지 않는다.
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onSeeResult).not.toHaveBeenCalled();
    expect(props.onGoHome).not.toHaveBeenCalled();
  });

  it("기록 CTA는 공유·다음 퍼즐 CTA와 독립적으로 동작한다(회귀 없음)", () => {
    const onStartNextPuzzle = vi.fn();
    const props = renderDialog({
      nextPuzzleLabel: "#26060114 · 어려움",
      onStartNextPuzzle,
    });

    // 기록 CTA 클릭이 다른 CTA 콜백을 건드리지 않는다.
    fireEvent.click(screen.getByRole("button", { name: "내 기록 보기" }));
    expect(props.onSeeHistory).toHaveBeenCalledTimes(1);
    expect(onStartNextPuzzle).not.toHaveBeenCalled();
    expect(props.onSeeResult).not.toHaveBeenCalled();
    expect(props.onGoHome).not.toHaveBeenCalled();
  });
});

describe("CompletionCelebrationDialog 공유 CTA 계측(#299)", () => {
  it("완료 다이얼로그 공유 버튼 클릭 시 completion_dialog surface·puzzle_id·difficulty로 share_result_click을 발화한다(AC-1)", async () => {
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
    // 전달 결과도 같은 surface로 이어진다.
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "completion_dialog",
      outcome: "shared",
    });
  });

  it("공유 버튼 클릭 시 telemetry.click을 share_result_click·{surface,puzzle_id,difficulty}로 발화한다(AC-2)", async () => {
    // AC-2 실행 경로: 실제 "결과 공유하기" 버튼 클릭 → useShareResult.share →
    // telemetry.click("share_result_click", { surface, puzzle_id, difficulty }).
    vi.stubGlobal("navigator", { share: vi.fn(() => Promise.resolve()) });
    renderDialog({ puzzleId: "26060114", difficulty: "hard" });

    fireEvent.click(screen.getByRole("button", { name: "결과 공유하기" }));
    await flushShare();

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledWith("share_result_click", {
      surface: "completion_dialog",
      puzzle_id: "26060114",
      difficulty: "hard",
    });
  });

  it("결과 공유하기 버튼 클릭이 outcome 4분기 shared·aborted·copied·failed 각각을 share_result_outcome으로 발화한다(AC-3)", async () => {
    // AC-3 실행 경로: 실제 버튼 클릭 → useShareResult.share → deliverShareText가
    // navigator 상태별로 4개 outcome을 반환 → telemetry.impression("share_result_outcome",
    // { surface, outcome }). 네 분기를 각각 실제 렌더·클릭으로 검증한다.
    const abort = new Error("cancelled");
    abort.name = "AbortError";

    // 분기 1/4: navigator.share 성공 → shared.
    vi.stubGlobal("navigator", { share: vi.fn(() => Promise.resolve()) });
    renderDialog({ puzzleId: "26060114", difficulty: "easy" });
    fireEvent.click(screen.getByRole("button", { name: "결과 공유하기" }));
    await flushShare();
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "completion_dialog",
      outcome: "shared",
    });

    // 분기 2/4: 공유 시트 닫힘(AbortError) → aborted.
    cleanup();
    impressionMock.mockReset();
    vi.stubGlobal("navigator", { share: vi.fn(() => Promise.reject(abort)) });
    renderDialog({ puzzleId: "26060114", difficulty: "easy" });
    fireEvent.click(screen.getByRole("button", { name: "결과 공유하기" }));
    await flushShare();
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "completion_dialog",
      outcome: "aborted",
    });

    // 분기 3/4: 공유 시트 미지원 → 클립보드 복사 성공 → copied.
    cleanup();
    impressionMock.mockReset();
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
    renderDialog({ puzzleId: "26060114", difficulty: "easy" });
    fireEvent.click(screen.getByRole("button", { name: "결과 공유하기" }));
    await flushShare();
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "completion_dialog",
      outcome: "copied",
    });

    // 분기 4/4: 공유·클립보드 모두 미지원 → failed.
    cleanup();
    impressionMock.mockReset();
    vi.stubGlobal("navigator", {});
    renderDialog({ puzzleId: "26060114", difficulty: "easy" });
    fireEvent.click(screen.getByRole("button", { name: "결과 공유하기" }));
    await flushShare();
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "completion_dialog",
      outcome: "failed",
    });
  });

  it("클립보드 폴백 복사 시 복사 토스트를 노출한다(AC-4 회귀 없음)", async () => {
    // 공유 시트 미지원 → 클립보드 복사 성공.
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
    renderDialog({ puzzleId: "26060114", difficulty: "hard" });

    fireEvent.click(screen.getByRole("button", { name: "결과 공유하기" }));
    await flushShare();

    expect(screen.getByText("클립보드에 복사됐어요!")).toBeTruthy();
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "completion_dialog",
      outcome: "copied",
    });
  });
});
