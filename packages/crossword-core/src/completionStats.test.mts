import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  bucketCount,
  formatBucketedCount,
  formatCommunityComparisonLabel,
  formatCompletionStatsLabel,
  formatCompletionStatsMetrics,
  formatEstimatedSolveLabel,
  formatRatePercent,
  formatStatsDuration,
} from "./completionStats.ts";
import type { PuzzleCompletionStats } from "./types.ts";

function createStats(
  overrides: Partial<PuzzleCompletionStats> = {},
): PuzzleCompletionStats {
  return {
    completionCount: 0,
    puzzleId: "puzzle-1",
    ...overrides,
  };
}

describe("bucketCount", () => {
  it("floors to nice buckets without overstating", () => {
    assert.equal(bucketCount(47), 40);
    assert.equal(bucketCount(230), 200);
    assert.equal(bucketCount(1820), 1500);
    assert.equal(bucketCount(10), 10);
    assert.equal(bucketCount(12345), 12000);
  });

  it("returns 0 for non-positive or invalid input", () => {
    assert.equal(bucketCount(0), 0);
    assert.equal(bucketCount(-5), 0);
    assert.equal(bucketCount(Number.NaN), 0);
  });
});

describe("formatBucketedCount / formatRatePercent / formatStatsDuration", () => {
  it("formats bucketed counts with a plus suffix", () => {
    assert.equal(formatBucketedCount(47), "40+");
    assert.equal(formatBucketedCount(1820), "1,500+");
  });

  it("rounds rates to whole percents and clamps to 0~1", () => {
    assert.equal(formatRatePercent(0.413), "41%");
    assert.equal(formatRatePercent(1.4), "100%");
    assert.equal(formatRatePercent(-0.2), "0%");
  });

  it("keeps durations to a single unit", () => {
    assert.equal(formatStatsDuration(45), "45초");
    assert.equal(formatStatsDuration(95), "2분");
    assert.equal(formatStatsDuration(252), "4분");
    assert.equal(formatStatsDuration(0), "");
  });
});

describe("formatCompletionStatsLabel", () => {
  it("suppresses counts below the privacy threshold", () => {
    assert.equal(
      formatCompletionStatsLabel(
        createStats({ participantCount: 4, completionCount: 1 }),
        10,
      ),
      "10명 미만 참여",
    );
    assert.equal(
      formatCompletionStatsLabel(
        createStats({ participantCount: 40, completionCount: 3 }),
        10,
      ),
      "40+명 참여 · 10명 미만 완료",
    );
  });

  it("buckets participant and completion counts in the detail variant", () => {
    assert.equal(
      formatCompletionStatsLabel(
        createStats({
          participantCount: 230,
          completionCount: 95,
          completionRate: 95 / 230,
        }),
        10,
      ),
      "200+명 참여 · 90+명 완료(41%)",
    );
  });

  it("shows only the completion rate in the compact variant", () => {
    assert.equal(
      formatCompletionStatsLabel(
        createStats({
          participantCount: 230,
          completionCount: 95,
          completionRate: 95 / 230,
        }),
        10,
        "compact",
      ),
      "41% 완료",
    );
  });
});

describe("formatCompletionStatsMetrics", () => {
  it("joins available enriched metrics", () => {
    assert.equal(
      formatCompletionStatsMetrics(
        createStats({
          completionCount: 95,
          medianElapsedSeconds: 252,
          noHintCompletionRate: 0.32,
          firstTryCompletionRate: 0.58,
        }),
        10,
      ),
      "평균 4분 · 노힌트 32% · 1트 58%",
    );
  });

  it("returns empty when below threshold or no metrics present", () => {
    assert.equal(
      formatCompletionStatsMetrics(
        createStats({ completionCount: 3, medianElapsedSeconds: 252 }),
        10,
      ),
      "",
    );
    assert.equal(
      formatCompletionStatsMetrics(createStats({ completionCount: 95 }), 10),
      "",
    );
  });
});

describe("formatEstimatedSolveLabel", () => {
  it("previews the median solve time with a 약 prefix", () => {
    assert.equal(
      formatEstimatedSolveLabel(
        createStats({ completionCount: 95, medianElapsedSeconds: 252 }),
        10,
      ),
      "약 4분",
    );
  });

  it("falls back to the average when no median is present", () => {
    assert.equal(
      formatEstimatedSolveLabel(
        createStats({ completionCount: 95, averageElapsedSeconds: 75 }),
        10,
      ),
      "약 75초",
    );
  });

  it("returns empty below the privacy threshold or without a figure", () => {
    assert.equal(
      formatEstimatedSolveLabel(
        createStats({ completionCount: 3, medianElapsedSeconds: 252 }),
        10,
      ),
      "",
    );
    assert.equal(
      formatEstimatedSolveLabel(createStats({ completionCount: 95 }), 10),
      "",
    );
    assert.equal(formatEstimatedSolveLabel(undefined, 10), "");
  });
});

describe("formatCommunityComparisonLabel (#218)", () => {
  // 완료 100건 + 중앙값 120초 → 임계(10) 충족, 비교 가능.
  function communityStats(
    overrides: Partial<PuzzleCompletionStats> = {},
  ): PuzzleCompletionStats {
    return createStats({
      completionCount: 100,
      medianElapsedSeconds: 120,
      ...overrides,
    });
  }

  it("내가 더 빠르면 '빨라요'와 차이를 노출한다", () => {
    // 90초 완료 vs 중앙값 120초 → 30초 빠름.
    assert.equal(
      formatCommunityComparisonLabel(90, communityStats(), 10),
      "커뮤니티 중앙값 2분 · 내 기록이 30초 빨라요",
    );
  });

  it("내가 더 느리면 '느려요'와 차이를 노출한다", () => {
    // 200초 완료 vs 중앙값 120초 → 80초 느림(formatStatsDuration: <90s는 '초').
    assert.equal(
      formatCommunityComparisonLabel(200, communityStats(), 10),
      "커뮤니티 중앙값 2분 · 내 기록이 80초 느려요",
    );
    // 130초 느린 경우는 분 단위(2분)로 표기된다.
    assert.equal(
      formatCommunityComparisonLabel(250, communityStats(), 10),
      "커뮤니티 중앙값 2분 · 내 기록이 2분 느려요",
    );
  });

  it("반올림 초가 같으면 '비슷해요'로 표기한다(0초 빨라요/느려요 방지)", () => {
    assert.equal(
      formatCommunityComparisonLabel(120, communityStats(), 10),
      "커뮤니티 중앙값 2분 · 커뮤니티 평균과 비슷해요",
    );
    // 0.4초 차이도 반올림하면 0 → 비슷.
    assert.equal(
      formatCommunityComparisonLabel(120.4, communityStats(), 10),
      "커뮤니티 중앙값 2분 · 커뮤니티 평균과 비슷해요",
    );
  });

  it("완료 수가 임계 미만이면 프라이버시 게이트로 숨긴다", () => {
    assert.equal(
      formatCommunityComparisonLabel(
        90,
        communityStats({ completionCount: 9 }),
        10,
      ),
      "",
    );
  });

  it("통계 없음/중앙값 없음이면 숨긴다", () => {
    assert.equal(formatCommunityComparisonLabel(90, undefined, 10), "");
    assert.equal(
      formatCommunityComparisonLabel(
        90,
        communityStats({ medianElapsedSeconds: undefined }),
        10,
      ),
      "",
    );
  });

  it("중앙값이 없으면 평균(averageElapsedSeconds)으로 폴백한다", () => {
    assert.equal(
      formatCommunityComparisonLabel(
        90,
        communityStats({
          medianElapsedSeconds: undefined,
          averageElapsedSeconds: 120,
        }),
        10,
      ),
      "커뮤니티 중앙값 2분 · 내 기록이 30초 빨라요",
    );
  });

  it("내 기록이 유효하지 않으면(NaN/음수) 비교하지 않는다", () => {
    assert.equal(
      formatCommunityComparisonLabel(Number.NaN, communityStats(), 10),
      "",
    );
    assert.equal(
      formatCommunityComparisonLabel(-5, communityStats(), 10),
      "",
    );
  });
});
