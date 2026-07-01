import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StreakHeatmap } from "./StreakHeatmap";
import { buildStreakCalendarWeeks } from "../../packages/crossword-core/src";

afterEach(cleanup);

describe("StreakHeatmap", () => {
  const today = "2026-07-01"; // 수요일

  it("주 수만큼 열을, 각 열에 7개 요일 셀을 렌더한다", () => {
    const weeks = buildStreakCalendarWeeks([], today, 4);
    const { container } = render(<StreakHeatmap weeks={weeks} />);

    expect(screen.getByLabelText("최근 완료 달력 히트맵")).toBeTruthy();
    expect(container.querySelectorAll(".streakHeatmapWeek")).toHaveLength(4);
    expect(container.querySelectorAll(".streakHeatmapCell")).toHaveLength(28);
  });

  it("완료일 셀에 완료 클래스와 날짜·완료 aria-label을 부여한다", () => {
    const weeks = buildStreakCalendarWeeks(["2026-06-30"], today, 4);
    render(<StreakHeatmap weeks={weeks} />);

    const doneCell = screen.getByLabelText("2026-06-30 완료");
    expect(doneCell.classList.contains("streakHeatmapCellDone")).toBe(true);
  });

  it("오늘 셀은 오늘 라벨·강조 클래스를 가진다", () => {
    const weeks = buildStreakCalendarWeeks([], today, 4);
    render(<StreakHeatmap weeks={weeks} />);

    const todayCell = screen.getByLabelText("2026-07-01 미완료 · 오늘");
    expect(todayCell.classList.contains("streakHeatmapCellToday")).toBe(true);
  });

  it("미완료일은 미완료 라벨을 가진다", () => {
    const weeks = buildStreakCalendarWeeks([], today, 4);
    render(<StreakHeatmap weeks={weeks} />);

    expect(screen.getByLabelText("2026-06-29 미완료")).toBeTruthy();
  });

  it("미래 셀은 aria-hidden이고 완료여부 라벨을 노출하지 않는다", () => {
    // 2026-07-01(수) 기준 이번 주 목·금·토(07-02~04)는 미래.
    const weeks = buildStreakCalendarWeeks([], today, 4);
    const { container } = render(<StreakHeatmap weeks={weeks} />);

    expect(screen.queryByLabelText(/2026-07-02/)).toBeNull();
    const futureCells = container.querySelectorAll(
      ".streakHeatmapCellFuture[aria-hidden='true']",
    );
    expect(futureCells).toHaveLength(3);
  });
});
