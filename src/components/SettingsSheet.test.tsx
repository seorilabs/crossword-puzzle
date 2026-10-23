// SettingsSheet 오답 자동 표시(autocheck) 토글 노출·동작 컴포넌트 테스트 (vitest + jsdom)
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SettingsSheet, type SettingsSheetProps } from "./SettingsSheet";

afterEach(cleanup);

function renderSheet(overrides: Partial<SettingsSheetProps> = {}) {
  const props: SettingsSheetProps = {
    hapticEnabled: true,
    onClose: () => {},
    selectTextScale: () => {},
    soundEnabled: true,
    textScale: "normal",
    timerVisible: true,
    toggleHaptic: () => {},
    toggleSound: () => {},
    toggleTimerVisible: () => {},
    ...overrides,
  };

  return render(<SettingsSheet {...props} />);
}

it("타일 입력에서 사용하지 않는 키보드와 즉시 오답 설정은 노출하지 않는다", () => {
  renderSheet();
  expect(screen.queryByText("입력 방식")).toBeNull();
  expect(screen.queryByText("오답 자동 표시")).toBeNull();
  expect(screen.getByText("사운드, 햅틱, 타이머와 글자 크기")).toBeTruthy();
});

function getTimerVisibleToggle() {
  const label = screen.getByText("타이머 표시");
  const row = label.closest(".settingsRow");
  expect(row).not.toBeNull();
  const toggle = row!.querySelector("button.assistToggle");
  expect(toggle).not.toBeNull();
  return toggle as HTMLButtonElement;
}

describe("SettingsSheet 타이머 표시 토글(#233)", () => {
  it("켜짐 상태에서 aria-pressed=true 와 '켜짐' 라벨로 렌더된다", () => {
    renderSheet({ timerVisible: true });
    const toggle = getTimerVisibleToggle();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.textContent).toBe("켜짐");
    expect(toggle.className).toContain("assistToggleOn");
    expect(screen.getByText("풀이 화면에 경과 시간을 표시해요")).toBeTruthy();
  });

  it("꺼짐 상태에서 aria-pressed=false 와 계측 유지 안내 문구를 보여준다", () => {
    renderSheet({ timerVisible: false });
    const toggle = getTimerVisibleToggle();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.textContent).toBe("꺼짐");
    expect(toggle.className).not.toContain("assistToggleOn");
    expect(
      screen.getByText("타이머를 숨겨요. 기록·리더보드는 그대로 계측돼요"),
    ).toBeTruthy();
  });

  it("토글을 누르면 toggleTimerVisible 가 호출된다(다른 토글은 미호출)", () => {
    const toggleTimerVisible = vi.fn();
    const toggleSound = vi.fn();
    renderSheet({ toggleTimerVisible, toggleSound });

    getTimerVisibleToggle().click();

    expect(toggleTimerVisible).toHaveBeenCalledTimes(1);
    expect(toggleSound).not.toHaveBeenCalled();
  });
});

function getTextScaleGroup() {
  const group = screen.getByRole("group", { name: "글자 크기" });
  expect(group).not.toBeNull();
  const buttons = group.querySelectorAll("button");
  // [보통, 크게]
  return { normal: buttons[0], large: buttons[1] };
}

describe("SettingsSheet 글자 크기 세그먼트 컨트롤(#217)", () => {
  it("role=group과 aria-pressed 접근성 속성으로 렌더된다", () => {
    renderSheet({ textScale: "normal" });
    const { normal, large } = getTextScaleGroup();
    expect(normal.getAttribute("aria-pressed")).toBe("true");
    expect(normal.className).toContain("assistToggleOn");
    expect(large.getAttribute("aria-pressed")).toBe("false");
    expect(large.className).not.toContain("assistToggleOn");
    expect(normal.textContent).toBe("보통");
    expect(large.textContent).toBe("크게");
  });

  it("large 선택 상태에서는 '크게'가 눌린 상태로 반영된다", () => {
    renderSheet({ textScale: "large" });
    const { normal, large } = getTextScaleGroup();
    expect(large.getAttribute("aria-pressed")).toBe("true");
    expect(large.className).toContain("assistToggleOn");
    expect(normal.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("보드 글자·단서를 크게 보여줘요")).toBeTruthy();
  });

  it("'크게'를 누르면 selectTextScale('large')가 호출된다(다른 설정 미호출)", () => {
    const selectTextScale = vi.fn();
    const toggleSound = vi.fn();
    renderSheet({ textScale: "normal", selectTextScale, toggleSound });

    getTextScaleGroup().large.click();

    expect(selectTextScale).toHaveBeenCalledTimes(1);
    expect(selectTextScale).toHaveBeenCalledWith("large");
    expect(toggleSound).not.toHaveBeenCalled();
  });

  it("'보통'을 누르면 selectTextScale('normal')가 호출된다", () => {
    const selectTextScale = vi.fn();
    renderSheet({ textScale: "large", selectTextScale });

    getTextScaleGroup().normal.click();

    expect(selectTextScale).toHaveBeenCalledTimes(1);
    expect(selectTextScale).toHaveBeenCalledWith("normal");
  });
});
