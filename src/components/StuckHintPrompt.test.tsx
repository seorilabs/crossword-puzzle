import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StuckHintPrompt, type StuckHintPromptProps } from "./StuckHintPrompt";

afterEach(cleanup);

function renderPrompt(overrides: Partial<StuckHintPromptProps> = {}) {
  const props: StuckHintPromptProps = {
    trigger: "idle",
    nearFinish: false,
    wordsRemaining: 5,
    hasHintCredits: true,
    offerWordReveal: true,
    onAcceptFirstInput: vi.fn(),
    onAcceptHint: vi.fn(),
    onAcceptNearFinish: vi.fn(),
    onRevealWord: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<StuckHintPrompt {...props} />);
  return props;
}

describe("StuckHintPrompt 첫 입력 넛지(#346)", () => {
  it("입력 개시 문구와 단일 CTA만 렌더하고 힌트 소비 동작을 노출하지 않는다", () => {
    const props = renderPrompt({ trigger: "first_input", nearFinish: true });

    expect(
      screen.getByText("반짝이는 칸을 탭해 글자를 입력해 보세요 ✏️"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /힌트 보기/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "이 단어 정답 보기" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "남은 단어 마저 풀기" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "입력 시작하기" }));
    expect(props.onAcceptFirstInput).toHaveBeenCalledTimes(1);
    expect(props.onAcceptHint).not.toHaveBeenCalled();
  });

  it("첫 입력 이후에는 기존 힌트·단어 공개 CTA를 유지한다", () => {
    const props = renderPrompt();

    fireEvent.click(screen.getByRole("button", { name: "무료 힌트 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "이 단어 정답 보기" }));
    expect(props.onAcceptHint).toHaveBeenCalledTimes(1);
    expect(props.onRevealWord).toHaveBeenCalledTimes(1);
  });
});
