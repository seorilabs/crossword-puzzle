import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PersonalStatsCard } from "./PersonalStatsCard";
import type { PersonalStats } from "../../packages/crossword-core/src";

afterEach(cleanup);

function stats(overrides: Partial<PersonalStats> = {}): PersonalStats {
  return {
    totalPuzzles: 0,
    completedCount: 0,
    completionRate: 0,
    noHintCompletedCount: 0,
    bestTimeCount: 0,
    fastestBestTimeMs: null,
    averageBestTimeMs: null,
    ...overrides,
  };
}

describe("PersonalStatsCard", () => {
  it("완료 0건이면 빈 상태 안내만 보이고 5지표 dl은 렌더하지 않는다", () => {
    const { container } = render(
      <PersonalStatsCard stats={stats()} consecutiveStreak={0} />,
    );

    expect(screen.getByLabelText("내 기록 요약")).toBeTruthy();
    expect(container.querySelector(".personalStatsEmpty")).toBeTruthy();
    expect(container.querySelector(".personalStatsGrid")).toBeNull();
    expect(container.querySelectorAll(".personalStat")).toHaveLength(0);
  });

  it("빈 상태에서 스트릭이 있으면 격려 문구를 함께 보여준다", () => {
    const { container } = render(
      <PersonalStatsCard stats={stats()} consecutiveStreak={3} />,
    );

    const empty = container.querySelector(".personalStatsEmpty");
    expect(empty?.textContent).toContain("3일째 도전 중");
  });

  it("스트릭이 0이면 빈 상태에 격려 문구를 붙이지 않는다", () => {
    const { container } = render(
      <PersonalStatsCard stats={stats()} consecutiveStreak={0} />,
    );

    const empty = container.querySelector(".personalStatsEmpty");
    expect(empty?.textContent).not.toContain("도전 중");
  });

  it("보유 최고 기록이 있으면 6개 지표를 값과 함께 렌더한다(최고·평균은 실제 시간)", () => {
    const { container } = render(
      <PersonalStatsCard
        stats={stats({
          totalPuzzles: 8,
          completedCount: 6,
          completionRate: 6 / 8,
          noHintCompletedCount: 2,
          bestTimeCount: 4,
          fastestBestTimeMs: 65_000, // 01:05
          averageBestTimeMs: 90_000, // 01:30
        })}
        consecutiveStreak={5}
      />,
    );

    expect(container.querySelector(".personalStatsEmpty")).toBeNull();
    const items = container.querySelectorAll(".personalStat");
    expect(items).toHaveLength(6);

    // 완료율은 Math.round(completionRate*100) = 75%
    const text = container.querySelector(".personalStatsGrid")?.textContent ?? "";
    expect(text).toContain("6판"); // 총 완료
    expect(text).toContain("75%"); // 완료율
    expect(text).toContain("5일"); // 현재 스트릭
    expect(text).toContain("2판"); // 노힌트 완료
    expect(text).toContain("최고 기록");
    expect(text).toContain("01:05"); // 최고 기록(실제 시간)
    expect(text).toContain("평균 기록");
    expect(text).toContain("01:30"); // 평균 기록(실제 시간)
    // '개수' 표기(N개)는 더 이상 노출하지 않는다.
    expect(text).not.toContain("4개");
  });

  it("완료는 있으나 보유 최고 기록이 없으면 시간 항목을 숨기고 4개 지표만 렌더한다", () => {
    const { container } = render(
      <PersonalStatsCard
        stats={stats({
          totalPuzzles: 3,
          completedCount: 2,
          completionRate: 2 / 3,
          noHintCompletedCount: 1,
          bestTimeCount: 0,
          fastestBestTimeMs: null,
          averageBestTimeMs: null,
        })}
        consecutiveStreak={0}
      />,
    );

    const items = container.querySelectorAll(".personalStat");
    expect(items).toHaveLength(4);
    const text = container.querySelector(".personalStatsGrid")?.textContent ?? "";
    expect(text).not.toContain("최고 기록");
    expect(text).not.toContain("평균 기록");
    // NaN·00:00 이 노출되지 않는다.
    expect(text).not.toContain("00:00");
    expect(text).not.toContain("NaN");
  });

  it("완료율을 정수 퍼센트로 반올림한다", () => {
    const { container } = render(
      <PersonalStatsCard
        stats={stats({
          totalPuzzles: 3,
          completedCount: 1,
          completionRate: 1 / 3,
          noHintCompletedCount: 0,
          bestTimeCount: 0,
        })}
        consecutiveStreak={0}
      />,
    );

    const grid = container.querySelector(".personalStatsGrid");
    // 1/3 → 33%
    expect(within(grid as HTMLElement).getByText("33%")).toBeTruthy();
  });
});
