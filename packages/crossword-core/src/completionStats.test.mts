import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  bucketCount,
  formatBucketedCount,
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
