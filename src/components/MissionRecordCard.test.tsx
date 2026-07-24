// 홈 미션 기록 카드(#300) 요약 노출·폴백·진입 계측 테스트.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MissionRecordCard } from "./MissionRecordCard";
import { openHistory } from "../useHistoryOpen";

const { clickMock } = vi.hoisted(() => ({ clickMock: vi.fn() }));

vi.mock("../adapters/telemetry", () => ({
  telemetry: {
    screen: vi.fn(),
    click: clickMock,
    impression: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  clickMock.mockReset();
});

describe("MissionRecordCard(#300)", () => {
  it("스트릭·최고 기록 요약이 있으면 요약을 노출한다(AC-2)", () => {
    render(
      <MissionRecordCard
        summary={{ streakLabel: "연속 3일", bestTimeLabel: "최고 01:35" }}
        attemptsUsed={7}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText("연속 3일 · 최고 01:35")).toBeTruthy();
    // 요약이 있으면 "N번 도전" 폴백 문구는 노출하지 않는다.
    expect(screen.queryByText("7번 도전")).toBeNull();
  });

  it("스트릭만 있으면 스트릭 요약만 노출한다(AC-2)", () => {
    render(
      <MissionRecordCard
        summary={{ streakLabel: "연속 5일", bestTimeLabel: null }}
        attemptsUsed={2}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("연속 5일")).toBeTruthy();
  });

  it("요약이 없으면 기존 'N번 도전' 문구로 폴백한다(AC-2)", () => {
    render(
      <MissionRecordCard summary={null} attemptsUsed={4} onOpen={vi.fn()} />,
    );
    expect(screen.getByText("4번 도전")).toBeTruthy();
  });

  it("카드 클릭 시 onOpen을 1회 호출한다", () => {
    const onOpen = vi.fn();
    render(
      <MissionRecordCard summary={null} attemptsUsed={1} onOpen={onOpen} />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("카드 클릭이 openHistory 배선을 통과해 history_open을 source=home_card로 1회 발화하고 navigate(history)한다(AC-3)", () => {
    // App.tsx 홈 카드 배선과 동일: onOpen={() => openHistory("home_card", navigate)}.
    const navigate = vi.fn();
    render(
      <MissionRecordCard
        summary={{ streakLabel: "연속 3일", bestTimeLabel: null }}
        attemptsUsed={1}
        onOpen={() => openHistory("home_card", navigate)}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledWith("history_open", {
      source: "home_card",
    });
    expect(navigate).toHaveBeenCalledWith("history");
  });
});
