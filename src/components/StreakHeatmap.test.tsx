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

  it("좌측 요일 축에 일/수/금 라벨을 렌더하고 축은 aria-hidden이다", () => {
    const weeks = buildStreakCalendarWeeks([], today, 4);
    const { container } = render(<StreakHeatmap weeks={weeks} />);

    const days = container.querySelector(".streakHeatmapDays");
    expect(days?.getAttribute("aria-hidden")).toBe("true");
    // 7행 중 격행(일/수/금)만 텍스트가 있다.
    const dayCells = container.querySelectorAll(".streakHeatmapDay");
    expect(dayCells).toHaveLength(7);
    const dayText = Array.from(dayCells).map((el) => el.textContent);
    expect(dayText).toEqual(["일", "", "", "수", "", "금", ""]);
  });

  it("상단 월 축은 월이 바뀌는 열에만 라벨을 렌더하고 aria-hidden이다", () => {
    // 8주 렌더: 5월 4주 뒤 6월 4주 → '5월'과 '6월' 라벨만 노출.
    const weeks = buildStreakCalendarWeeks([], today, 8);
    const { container } = render(<StreakHeatmap weeks={weeks} />);

    const months = container.querySelector(".streakHeatmapMonths");
    expect(months?.getAttribute("aria-hidden")).toBe("true");
    const monthCells = container.querySelectorAll(".streakHeatmapMonth");
    expect(monthCells).toHaveLength(8);
    const monthText = Array.from(monthCells)
      .map((el) => el.textContent)
      .filter((text) => text !== "");
    expect(monthText).toEqual(["5월", "6월"]);
  });

  it("격자가 스크롤 컨테이너(.streakHeatmapScroll) 안에 중첩돼 가로 스크롤이 컨테이너로 한정된다", () => {
    // 실제 computed overflow(본문 가로 스크롤 방지)는 layout이 없는 jsdom에서
    // 검증할 수 없어 시각 리뷰에 위임한다. 여기서는 그 전제가 되는 DOM 구조 —
    // 축·격자가 페이지 본문이 아니라 overflow-x 스크롤 래퍼 안에 들어 있는지 —
    // 를 회귀 가드로 고정한다(래퍼 제거·격자 이탈 시 실패).
    const weeks = buildStreakCalendarWeeks([], today, 12);
    const { container } = render(<StreakHeatmap weeks={weeks} />);

    const scroll = container.querySelector(".streakHeatmapScroll");
    expect(scroll).not.toBeNull();
    // 월 축·요일 축·격자가 모두 스크롤 래퍼 내부에 있어 함께 스크롤된다.
    expect(scroll?.querySelector(".streakHeatmapGrid")).not.toBeNull();
    expect(scroll?.querySelector(".streakHeatmapMonths")).not.toBeNull();
    // 격자는 섹션의 직접 자식이 아니라 스크롤 래퍼를 거쳐야 한다(본문 오버플로 방지).
    const section = container.querySelector(".streakHeatmap");
    expect(section?.querySelector(":scope > .streakHeatmapGrid")).toBeNull();
    // 범례는 스크롤 래퍼 밖(항상 보이는 하단)에 둔다.
    expect(scroll?.querySelector(".streakHeatmapLegend")).toBeNull();
  });

  it("하단에 미완료·완료 범례를 aria-hidden으로 렌더한다", () => {
    const weeks = buildStreakCalendarWeeks([], today, 4);
    const { container } = render(<StreakHeatmap weeks={weeks} />);

    const legend = container.querySelector(".streakHeatmapLegend");
    expect(legend?.getAttribute("aria-hidden")).toBe("true");
    const legendLabels = Array.from(
      container.querySelectorAll(".streakHeatmapLegendLabel"),
    ).map((el) => el.textContent);
    expect(legendLabels).toEqual(["미완료", "완료"]);
    // 색 스와치 2개(미완료·완료)와 완료 스와치 변형이 있다.
    expect(
      container.querySelectorAll(".streakHeatmapLegendSwatch"),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll(".streakHeatmapLegendSwatchDone"),
    ).toHaveLength(1);
  });
});
