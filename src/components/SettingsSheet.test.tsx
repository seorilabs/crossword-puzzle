// SettingsSheet 오답 자동 표시(autocheck) 토글 노출·동작 컴포넌트 테스트 (vitest + jsdom)
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SettingsSheet, type SettingsSheetProps } from "./SettingsSheet";

afterEach(cleanup);

function renderSheet(overrides: Partial<SettingsSheetProps> = {}) {
  const props: SettingsSheetProps = {
    answerInputMode: "box",
    autocheckEnabled: true,
    hapticEnabled: true,
    onClose: () => {},
    selectAnswerInputMode: () => {},
    selectTextScale: () => {},
    soundEnabled: true,
    textScale: "normal",
    timerVisible: true,
    toggleAutocheck: () => {},
    toggleHaptic: () => {},
    toggleSound: () => {},
    toggleTimerVisible: () => {},
    ...overrides,
  };

  return render(<SettingsSheet {...props} />);
}

function getAutocheckToggle() {
  // '오답 자동 표시' 행의 토글 버튼(assistToggle)을 행 텍스트 기준으로 찾는다.
  const label = screen.getByText("오답 자동 표시");
  const row = label.closest(".settingsRow");
  expect(row).not.toBeNull();
  const toggle = row!.querySelector("button.assistToggle");
  expect(toggle).not.toBeNull();
  return toggle as HTMLButtonElement;
}

describe("SettingsSheet 오답 자동 표시 토글", () => {
  it("켜짐 상태에서 aria-pressed=true 와 '켜짐' 라벨로 렌더된다", () => {
    renderSheet({ autocheckEnabled: true });
    const toggle = getAutocheckToggle();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.textContent).toBe("켜짐");
    expect(toggle.className).toContain("assistToggleOn");
  });

  it("꺼짐 상태에서 aria-pressed=false 와 '이 단어 확인' 안내 문구를 보여준다", () => {
    renderSheet({ autocheckEnabled: false });
    const toggle = getAutocheckToggle();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.textContent).toBe("꺼짐");
    expect(toggle.className).not.toContain("assistToggleOn");
    expect(
      screen.getByText(
        "오답을 표시하지 않아요. '이 단어 확인'으로 직접 확인할 수 있어요",
      ),
    ).toBeTruthy();
  });

  it("토글을 누르면 toggleAutocheck 가 호출된다(다른 토글은 미호출)", () => {
    const toggleAutocheck = vi.fn();
    const toggleSound = vi.fn();
    const toggleHaptic = vi.fn();
    renderSheet({ toggleAutocheck, toggleSound, toggleHaptic });

    getAutocheckToggle().click();

    expect(toggleAutocheck).toHaveBeenCalledTimes(1);
    expect(toggleSound).not.toHaveBeenCalled();
    expect(toggleHaptic).not.toHaveBeenCalled();
  });

  it("시트 제목에 글자 크기 항목이 포함된다", () => {
    renderSheet();
    expect(
      screen.getByText("입력 방식 · 오답 표시 · 사운드 · 햅틱 · 타이머 · 글자 크기"),
    ).toBeTruthy();
  });

  it("기존 사운드·햅틱 토글도 그대로 렌더된다(회귀 없음)", () => {
    const toggleSound = vi.fn();
    renderSheet({ toggleSound, soundEnabled: false });

    const label = screen.getByText("사운드");
    const row = label.closest(".settingsRow");
    const soundToggle = row!.querySelector(
      "button.assistToggle",
    ) as HTMLButtonElement;
    expect(soundToggle.getAttribute("aria-pressed")).toBe("false");
    soundToggle.click();
    expect(toggleSound).toHaveBeenCalledTimes(1);
  });
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
    expect(
      screen.getByText("풀이 화면에 경과 시간을 표시해요"),
    ).toBeTruthy();
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
    const toggleAutocheck = vi.fn();
    const toggleSound = vi.fn();
    renderSheet({ toggleTimerVisible, toggleAutocheck, toggleSound });

    getTimerVisibleToggle().click();

    expect(toggleTimerVisible).toHaveBeenCalledTimes(1);
    expect(toggleAutocheck).not.toHaveBeenCalled();
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
    expect(
      screen.getByText("보드 글자·단서를 크게 보여줘요"),
    ).toBeTruthy();
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
