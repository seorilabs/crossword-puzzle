import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MissionHistoryCard,
  type MissionHistoryCardProps,
} from "./MissionHistoryCard";

// home_card 진입 계측(#300) 검증을 위해 telemetry 파사드를 목킹한다.
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

function renderCard(overrides: Partial<MissionHistoryCardProps> = {}) {
  const props: MissionHistoryCardProps = {
    attemptsUsed: 7,
    consecutiveStreak: 0,
    fastestBestTimeMs: null,
    onOpen: vi.fn(),
    ...overrides,
  };
  render(<MissionHistoryCard {...props} />);
  return props;
}

describe("MissionHistoryCard 요약 표기(#300 AC-2)", () => {
  it("스트릭·최고 기록이 있으면 두 요약을 노출한다", () => {
    renderCard({ consecutiveStreak: 3, fastestBestTimeMs: 75_000 });
    expect(screen.getByText("🔥 3일 연속 · ⏱ 최고 01:15")).toBeTruthy();
  });

  it("스트릭만 있으면 스트릭 요약만 노출한다", () => {
    renderCard({ consecutiveStreak: 5, fastestBestTimeMs: null });
    expect(screen.getByText("🔥 5일 연속")).toBeTruthy();
  });

  it("표시할 데이터가 없으면 기존 \"N번 도전\" 문구를 유지한다", () => {
    renderCard({ attemptsUsed: 7, consecutiveStreak: 0, fastestBestTimeMs: null });
    expect(screen.getByText("7번 도전")).toBeTruthy();
  });
});

describe("MissionHistoryCard 진입 계측(#300 AC-3 home_card)", () => {
  it("카드 클릭 시 history_open·{source:home_card} 계측 후 onOpen을 호출한다", () => {
    const onOpen = vi.fn();
    renderCard({ onOpen });

    fireEvent.click(screen.getByRole("button", { name: /미션 기록/ }));

    // 계측이 먼저, 이동 위임(onOpen)이 그다음.
    expect(clickMock).toHaveBeenCalledWith("history_open", {
      source: "home_card",
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
