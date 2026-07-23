import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CompletionCelebrationDialog,
  type CompletionCelebrationDialogProps,
} from "./CompletionCelebrationDialog";

afterEach(cleanup);

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
