import type { PuzzleCompletionStats } from "./types";

// Group thousands with commas without relying on Intl — React Native / Hermes
// Intl support is inconsistent, and this module is shared with apps/mobile.
function groupThousands(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Floor a raw count down to a "nice" bucket so the home cards never expose an
 * exact small number (e.g. "3명") that reads as empty, while never overstating
 * the real figure. Returns 0 for non-positive / invalid input.
 */
export function bucketCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  const count = Math.floor(value);

  if (count < 100) {
    return Math.floor(count / 10) * 10;
  }

  if (count < 1000) {
    return Math.floor(count / 50) * 50;
  }

  if (count < 10000) {
    return Math.floor(count / 500) * 500;
  }

  return Math.floor(count / 1000) * 1000;
}

/** "200+" style bucketed count label (no unit suffix). */
export function formatBucketedCount(value: number): string {
  return `${groupThousands(bucketCount(value))}+`;
}

/** Round a 0~1 ratio to a whole-percent label, e.g. 0.413 → "41%". */
export function formatRatePercent(rate: number): string {
  const clamped = Math.max(0, Math.min(1, rate));
  return `${Math.round(clamped * 100)}%`;
}

/**
 * Compact, human duration for stat lines. Keeps it to a single unit so it never
 * crowds a card: < 90s → "45초", otherwise rounded minutes → "4분".
 */
export function formatStatsDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "";
  }

  const seconds = Math.round(totalSeconds);

  if (seconds < 90) {
    return `${seconds}초`;
  }

  return `${Math.round(seconds / 60)}분`;
}

function getResolvedCompletionRate(
  stats: PuzzleCompletionStats,
): number | null {
  if (stats.completionRate != null) {
    return Math.max(0, Math.min(1, stats.completionRate));
  }

  if (stats.participantCount != null && stats.participantCount > 0) {
    return Math.max(
      0,
      Math.min(1, stats.completionCount / stats.participantCount),
    );
  }

  return null;
}

/**
 * Headline count label for a puzzle card. Counts below `minDisplayCount` stay
 * suppressed for privacy; counts at or above it are bucketed ("200+명").
 */
export function formatCompletionStatsLabel(
  stats: PuzzleCompletionStats | undefined,
  minDisplayCount: number,
  variant: "compact" | "detail" = "detail",
): string {
  if (stats == null) {
    return "";
  }

  const participantCount = stats.participantCount;

  if (participantCount != null) {
    if (participantCount === 0) {
      return "";
    }

    if (participantCount < minDisplayCount) {
      return `${minDisplayCount}명 미만 참여`;
    }

    const participantLabel = `${formatBucketedCount(participantCount)}명 참여`;

    if (stats.completionCount === 0) {
      return variant === "compact"
        ? "완료 전"
        : `${participantLabel} · 완료 전`;
    }

    if (stats.completionCount < minDisplayCount) {
      return variant === "compact"
        ? `${minDisplayCount}명 미만 완료`
        : `${participantLabel} · ${minDisplayCount}명 미만 완료`;
    }

    const completionRate = getResolvedCompletionRate(stats) ?? 0;
    const completionRateLabel = formatRatePercent(completionRate);

    if (variant === "compact") {
      return `${completionRateLabel} 완료`;
    }

    return `${participantLabel} · ${formatBucketedCount(
      stats.completionCount,
    )}명 완료(${completionRateLabel})`;
  }

  if (stats.completionCount === 0) {
    return "";
  }

  if (stats.completionCount < minDisplayCount) {
    return `${minDisplayCount}명 미만 완료`;
  }

  return `${formatBucketedCount(stats.completionCount)}명 완료`;
}

/**
 * Secondary, richer metrics line for the selected-puzzle detail area: median
 * solve time, no-hint clear rate, and first-try clear rate. Each part is only
 * included when the server provided it (absent below the privacy threshold).
 * Returns "" when nothing is available.
 */
export function formatCompletionStatsMetrics(
  stats: PuzzleCompletionStats | undefined,
  minDisplayCount: number,
): string {
  if (stats == null || stats.completionCount < minDisplayCount) {
    return "";
  }

  const parts: string[] = [];

  const medianSeconds =
    stats.medianElapsedSeconds ?? stats.averageElapsedSeconds;
  if (medianSeconds != null) {
    const durationLabel = formatStatsDuration(medianSeconds);
    if (durationLabel !== "") {
      parts.push(`평균 ${durationLabel}`);
    }
  }

  if (stats.noHintCompletionRate != null) {
    parts.push(`노힌트 ${formatRatePercent(stats.noHintCompletionRate)}`);
  }

  if (stats.firstTryCompletionRate != null) {
    parts.push(`1트 ${formatRatePercent(stats.firstTryCompletionRate)}`);
  }

  return parts.join(" · ");
}

/**
 * Short "expected time to solve" preview for the home card value proposition.
 * Uses the median (falling back to average) solve time, gated by the same
 * privacy threshold as the other stat lines. Returns "" when no usable figure
 * is available so callers can omit the preview entirely.
 */
export function formatEstimatedSolveLabel(
  stats: PuzzleCompletionStats | undefined,
  minDisplayCount: number,
): string {
  if (stats == null || stats.completionCount < minDisplayCount) {
    return "";
  }

  const seconds = stats.medianElapsedSeconds ?? stats.averageElapsedSeconds;
  if (seconds == null) {
    return "";
  }

  const durationLabel = formatStatsDuration(seconds);
  return durationLabel === "" ? "" : `약 ${durationLabel}`;
}
