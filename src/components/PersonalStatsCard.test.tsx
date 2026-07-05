import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PersonalStatsCard } from "./PersonalStatsCard";
import {
  computeSolveTimeDistribution,
  type PersonalStats,
  type SolveTimeDistribution,
} from "../../packages/crossword-core/src";

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

// 실제 코어 헬퍼로 분포를 만들어 카드에 넘긴다(빈 배열이면 total 0 → 차트 미노출).
function dist(valuesMs: number[] = []): SolveTimeDistribution {
  return computeSolveTimeDistribution(valuesMs);
}

describe("PersonalStatsCard", () => {
  it("완료 0건이면 빈 상태 안내만 보이고 지표 dl은 렌더하지 않는다", () => {
    const { container } = render(
      <PersonalStatsCard
        stats={stats()}
        solveTimeDistribution={dist()}
        consecutiveStreak={0}
        longestStreak={0}
      />,
    );

    expect(screen.getByLabelText("내 기록 요약")).toBeTruthy();
    expect(container.querySelector(".personalStatsEmpty")).toBeTruthy();
    expect(container.querySelector(".personalStatsGrid")).toBeNull();
    expect(container.querySelectorAll(".personalStat")).toHaveLength(0);
    // 빈 상태에서는 최장 스트릭 지표도 노출하지 않는다.
    expect(container.textContent).not.toContain("최장 스트릭");
  });

  it("빈 상태에서 스트릭이 있으면 격려 문구를 함께 보여준다", () => {
    const { container } = render(
      <PersonalStatsCard
        stats={stats()}
        solveTimeDistribution={dist()}
        consecutiveStreak={3}
        longestStreak={5}
      />,
    );

    const empty = container.querySelector(".personalStatsEmpty");
    expect(empty?.textContent).toContain("3일째 도전 중");
  });

  it("스트릭이 0이면 빈 상태에 격려 문구를 붙이지 않는다", () => {
    const { container } = render(
      <PersonalStatsCard
        stats={stats()}
        solveTimeDistribution={dist()}
        consecutiveStreak={0}
        longestStreak={0}
      />,
    );

    const empty = container.querySelector(".personalStatsEmpty");
    expect(empty?.textContent).not.toContain("도전 중");
  });

  it("보유 최고 기록이 있으면 7개 지표를 값과 함께 렌더한다(최고·평균은 실제 시간)", () => {
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
        solveTimeDistribution={dist()}
        consecutiveStreak={5}
        longestStreak={12}
      />,
    );

    expect(container.querySelector(".personalStatsEmpty")).toBeNull();
    const items = container.querySelectorAll(".personalStat");
    expect(items).toHaveLength(7);

    // 완료율은 Math.round(completionRate*100) = 75%
    const text = container.querySelector(".personalStatsGrid")?.textContent ?? "";
    expect(text).toContain("6판"); // 총 완료
    expect(text).toContain("75%"); // 완료율
    expect(text).toContain("현재 스트릭");
    expect(text).toContain("5일"); // 현재 스트릭
    expect(text).toContain("최장 스트릭");
    expect(text).toContain("12일"); // 최장 스트릭
    expect(text).toContain("2판"); // 노힌트 완료
    expect(text).toContain("최고 기록");
    expect(text).toContain("01:05"); // 최고 기록(실제 시간)
    expect(text).toContain("평균 기록");
    expect(text).toContain("01:30"); // 평균 기록(실제 시간)
    // '개수' 표기(N개)는 더 이상 노출하지 않는다.
    expect(text).not.toContain("4개");
  });

  it("완료는 있으나 보유 최고 기록이 없으면 시간 항목을 숨기고 5개 지표만 렌더한다", () => {
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
        solveTimeDistribution={dist()}
        consecutiveStreak={0}
        longestStreak={4}
      />,
    );

    const items = container.querySelectorAll(".personalStat");
    expect(items).toHaveLength(5);
    const text = container.querySelector(".personalStatsGrid")?.textContent ?? "";
    // 현재 스트릭이 0이어도 최장 스트릭은 통산 기록으로 노출된다.
    expect(text).toContain("최장 스트릭");
    expect(text).toContain("4일");
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
        solveTimeDistribution={dist()}
        consecutiveStreak={0}
        longestStreak={1}
      />,
    );

    const grid = container.querySelector(".personalStatsGrid");
    // 1/3 → 33%
    expect(within(grid as HTMLElement).getByText("33%")).toBeTruthy();
  });
});

describe("PersonalStatsCard 풀이 시간 분포 차트(#235)", () => {
  it("보유 기록이 0건이면 분포 차트를 렌더하지 않는다(빈 상태 유지)", () => {
    const { container } = render(
      <PersonalStatsCard
        stats={stats({ completedCount: 0 })}
        solveTimeDistribution={dist([])}
        consecutiveStreak={0}
        longestStreak={0}
      />,
    );
    expect(container.querySelector(".solveTimeDistribution")).toBeNull();
  });

  it("보유 기록이 있으면 5개 구간 막대와 접근성 요약을 렌더한다", () => {
    const { container } = render(
      <PersonalStatsCard
        stats={stats({
          totalPuzzles: 5,
          completedCount: 5,
          completionRate: 1,
          bestTimeCount: 4,
          fastestBestTimeMs: 30_000,
          averageBestTimeMs: 90_000,
        })}
        // 30초·90초·100초·600초 → [1분미만 1, 1–2분 2, 3–5분 0, 5분+ 1]
        solveTimeDistribution={dist([30_000, 90_000, 100_000, 600_000])}
        consecutiveStreak={0}
        longestStreak={1}
      />,
    );

    const figure = container.querySelector(".solveTimeDistribution");
    expect(figure).not.toBeNull();
    // 고정 5구간 막대 행.
    expect(
      container.querySelectorAll(".solveTimeDistributionRow"),
    ).toHaveLength(5);
    // 접근성 요약(aria-label)에 총 판수와 비어 있지 않은 구간이 담긴다.
    const label = figure!.getAttribute("aria-label") ?? "";
    expect(label).toContain("총 4판");
    expect(label).toContain("1분 미만 1판");
    expect(label).toContain("1–2분 2판");
    expect(label).toContain("5분+ 1판");
    // 비어 있는 구간(2–3분)은 요약에서 제외된다.
    expect(label).not.toContain("2–3분");
  });

  it("완료는 있으나 유효 기록이 없으면 차트를 숨긴다", () => {
    const { container } = render(
      <PersonalStatsCard
        stats={stats({
          totalPuzzles: 2,
          completedCount: 2,
          completionRate: 1,
          bestTimeCount: 0,
        })}
        solveTimeDistribution={dist([])}
        consecutiveStreak={0}
        longestStreak={0}
      />,
    );
    expect(container.querySelector(".solveTimeDistribution")).toBeNull();
  });
});
