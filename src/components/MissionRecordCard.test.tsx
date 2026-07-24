import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MissionRecordCard } from "./MissionRecordCard";

afterEach(cleanup);

describe("MissionRecordCard(#300)", () => {
  it("요약이 없으면 기존 'N번 도전' 문구로 폴백한다(AC-2)", () => {
    render(
      <MissionRecordCard summary={null} attemptsUsed={3} onOpen={vi.fn()} />,
    );

    expect(screen.getByText("3번 도전")).toBeTruthy();
  });

  it("스트릭·최고 기록이 있으면 요약을 노출한다(AC-2)", () => {
    render(
      <MissionRecordCard
        summary={{ streakDays: 4, bestTimeLabel: "01:23" }}
        attemptsUsed={9}
        onOpen={vi.fn()}
      />,
    );

    // 스트릭·최고 기록이 함께 노출되고, 폴백 문구는 나오지 않는다.
    expect(screen.getByText(/🔥 4일 연속/)).toBeTruthy();
    expect(screen.getByText(/⏱ 최고 01:23/)).toBeTruthy();
    expect(screen.queryByText(/번 도전/)).toBeNull();
  });

  it("최고 기록만 있으면 스트릭 없이 최고 기록만 노출한다(AC-2)", () => {
    render(
      <MissionRecordCard
        summary={{ streakDays: null, bestTimeLabel: "00:58" }}
        attemptsUsed={2}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText(/⏱ 최고 00:58/)).toBeTruthy();
    expect(screen.queryByText(/연속/)).toBeNull();
  });

  it("카드 클릭 시 onOpen을 호출한다(AC-3 home_card 진입 경로)", () => {
    const onOpen = vi.fn();
    render(
      <MissionRecordCard summary={null} attemptsUsed={1} onOpen={onOpen} />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
