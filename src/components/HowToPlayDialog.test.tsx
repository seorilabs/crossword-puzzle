// HowToPlayDialog 인터랙티브 첫 실행 튜토리얼 컴포넌트 테스트(#234, vitest + jsdom).
// 스텝 진행·건너뛰기·완료(onClose) 및 접근성 속성 회귀를 고정한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { HowToPlayDialog } from "./HowToPlayDialog";

afterEach(cleanup);

function getPrimaryButton() {
  // 우측 주 액션(다음/시작할게요)
  return (
    screen.queryByRole("button", { name: "다음" }) ??
    screen.getByRole("button", { name: "시작할게요!" })
  );
}

describe("HowToPlayDialog 인터랙티브 튜토리얼(#234)", () => {
  it("대화상자 접근성 속성(role/aria-modal/aria-labelledby)과 첫 스텝을 렌더한다", () => {
    render(<HowToPlayDialog onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("howToPlayTitle");
    expect(screen.getByText("칸을 탭해 단어를 선택해요")).toBeTruthy();
    // 예시 격자는 role=img로 현재 상태를 스크린리더에 전달한다.
    expect(
      screen.getByRole("img", {
        name: "예시 격자에서 가로 단어 ‘토끼’가 선택된 상태",
      }),
    ).toBeTruthy();
  });

  it("진행 표시가 '전체 3단계 중 1단계'로 시작한다", () => {
    render(<HowToPlayDialog onClose={() => {}} />);
    expect(
      screen.getByRole("group", { name: "전체 3단계 중 1단계" }),
    ).toBeTruthy();
  });

  it("'다음'을 누르면 다음 스텝(방향 전환)으로 진행하고 격자 설명이 바뀐다", () => {
    render(<HowToPlayDialog onClose={() => {}} />);
    fireEvent.click(getPrimaryButton());
    expect(screen.getByText("다시 탭하면 방향이 바뀌어요")).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "예시 격자에서 세로 단어 ‘토마토’가 선택된 상태",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "전체 3단계 중 2단계" }),
    ).toBeTruthy();
  });

  it("마지막 스텝에서 주 액션 라벨이 '시작할게요!'가 되고, 누르면 onClose가 호출된다", () => {
    const onClose = vi.fn();
    render(<HowToPlayDialog onClose={onClose} />);
    // 1 -> 2
    fireEvent.click(getPrimaryButton());
    // 2 -> 3 (마지막)
    fireEvent.click(getPrimaryButton());
    expect(screen.getByText("선택한 칸에 글자를 입력해요")).toBeTruthy();
    const start = screen.getByRole("button", { name: "시작할게요!" });
    expect(start).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(start);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("'건너뛰기'는 첫 스텝에서도 즉시 onClose를 호출한다", () => {
    const onClose = vi.fn();
    render(<HowToPlayDialog onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc 키로 즉시 종료(onClose)된다", () => {
    const onClose = vi.fn();
    render(<HowToPlayDialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("마지막 스텝에서는 '다음' 버튼이 없다(회귀: 진행 종료 상태)", () => {
    render(<HowToPlayDialog onClose={() => {}} />);
    fireEvent.click(getPrimaryButton());
    fireEvent.click(getPrimaryButton());
    expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
  });
});
