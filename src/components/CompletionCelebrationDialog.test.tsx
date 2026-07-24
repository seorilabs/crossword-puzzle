import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CompletionCelebrationDialog,
  type CompletionCelebrationDialogProps,
} from "./CompletionCelebrationDialog";
import { openHistory } from "../useHistoryOpen";

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

// 완료 축하 다이얼로그에 앱 배선(dismiss + navigate("history"))을 그대로 재현한
// 하네스. 실제 "내 기록 보기" 클릭이 다이얼로그를 닫고 history 화면으로 전환하며
// history_open 을 발화하는 최종 결과를 DOM으로 검증한다(#300, AC-1 통합).
function CompletionHistoryHarness(
  overrides: Partial<CompletionCelebrationDialogProps> = {},
) {
  const [open, setOpen] = useState(true);
  const [route, setRoute] = useState<"today" | "history">("today");
  return (
    <div>
      <div data-testid="route">{route}</div>
      {open ? (
        <CompletionCelebrationDialog
          attemptsUsed={1}
          completedCount={10}
          consecutiveStreak={2}
          elapsedLabel="01:20"
          hintCount={0}
          isNewBestTime={false}
          puzzleId="26060114"
          revealUsed={false}
          shareGrid="🟩🟩"
          shareText="공유 결과"
          totalCount={10}
          onClose={vi.fn()}
          onGoHome={vi.fn()}
          onSeeResult={vi.fn()}
          onSeeHistory={() => {
            // App.tsx 완료 다이얼로그 배선과 동일: 다이얼로그를 닫고 openHistory로
            // 계측·전환을 수행한다.
            setOpen(false);
            openHistory("completion_dialog", (next) => setRoute(next));
          }}
          {...overrides}
        />
      ) : null}
    </div>
  );
}

describe("CompletionCelebrationDialog 기록 진입 CTA(#300)", () => {
  it("onSeeHistory가 없으면 '내 기록 보기' 버튼을 렌더하지 않는다", () => {
    renderDialog();
    expect(screen.queryByRole("button", { name: "내 기록 보기" })).toBeNull();
  });

  it("'내 기록 보기' 버튼이 존재하고 클릭 시 onSeeHistory만 호출한다(AC-1 버튼·콜백)", () => {
    const onSeeHistory = vi.fn();
    const props = renderDialog({ onSeeHistory });

    const button = screen.getByRole("button", { name: "내 기록 보기" });
    fireEvent.click(button);

    expect(onSeeHistory).toHaveBeenCalledTimes(1);
    // 기록 진입 버튼은 다른 CTA 콜백을 트리거하지 않는다.
    expect(props.onGoHome).not.toHaveBeenCalled();
    expect(props.onSeeResult).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("'내 기록 보기' 클릭이 다이얼로그를 닫고 history 화면으로 전환한다(AC-1 통합)", () => {
    render(<CompletionHistoryHarness />);

    // 클릭 전: 다이얼로그 노출 + 라우트 today.
    expect(screen.getByRole("button", { name: "내 기록 보기" })).toBeTruthy();
    expect(screen.getByTestId("route").textContent).toBe("today");

    fireEvent.click(screen.getByRole("button", { name: "내 기록 보기" }));

    // 클릭 후: 다이얼로그 닫힘 + history 전환(navigate 결과)을 DOM으로 단언.
    expect(screen.queryByRole("button", { name: "내 기록 보기" })).toBeNull();
    expect(screen.getByTestId("route").textContent).toBe("history");
  });

  it("'내 기록 보기' 클릭 시 history_open을 source=completion_dialog로 1회 발화한다(AC-3)", () => {
    render(<CompletionHistoryHarness />);

    fireEvent.click(screen.getByRole("button", { name: "내 기록 보기" }));

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledWith("history_open", {
      source: "completion_dialog",
    });
  });

  it("기록 진입 CTA는 기존 공유·다음 퍼즐·홈·결과 보기 CTA와 공존한다(AC-4 회귀 없음)", () => {
    renderDialog({
      nextPuzzleLabel: "#26060114 · 어려움",
      onStartNextPuzzle: vi.fn(),
      onSeeHistory: vi.fn(),
    });

    expect(screen.getByRole("button", { name: "결과 공유하기" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "다음 퍼즐 풀기 · #26060114 · 어려움" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "홈으로" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "결과 보기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "내 기록 보기" })).toBeTruthy();
  });
});
