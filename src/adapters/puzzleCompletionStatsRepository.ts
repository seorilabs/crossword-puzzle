import type {
  PuzzleCompletionStats,
  PuzzleCompletionStatsPayload,
} from "../../packages/crossword-core/src";

type PuzzleCompletionStatsById = Record<string, PuzzleCompletionStats>;

type PuzzleCompletionStatsRepositoryOptions = {
  statsUrl?: string;
};

type RawStatsRecord = Record<string, unknown>;

function getConfiguredStatsUrl(value?: string) {
  const trimmed = value?.trim();
  return trimmed == null || trimmed === "" ? null : trimmed;
}

function isRecord(value: unknown): value is RawStatsRecord {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function getNonNegativeInteger(value: unknown) {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return Math.max(0, Math.round(numberValue));
}

function getOptionalRatio(value: unknown) {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  const normalizedValue = numberValue > 1 ? numberValue / 100 : numberValue;
  return Math.max(0, Math.min(1, normalizedValue));
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function normalizeStatsEntry(
  value: unknown,
  fallbackPuzzleId?: string,
): PuzzleCompletionStats | null {
  if (!isRecord(value)) {
    return null;
  }

  const puzzleId = getOptionalString(value.puzzleId) ?? fallbackPuzzleId;
  const completionCount = getNonNegativeInteger(value.completionCount);
  const participantCount = getNonNegativeInteger(value.participantCount);

  if (puzzleId == null || completionCount == null) {
    return null;
  }

  const completionRate =
    getOptionalRatio(value.completionRate) ??
    (participantCount == null || participantCount === 0
      ? undefined
      : Math.max(0, Math.min(1, completionCount / participantCount)));

  return {
    completionCount,
    completionRate,
    lastAggregatedAt: getOptionalString(value.lastAggregatedAt),
    participantCount,
    puzzleId,
  };
}

function normalizeStatsPayload(
  value: unknown,
  puzzleIds: string[],
): PuzzleCompletionStatsById {
  if (!isRecord(value)) {
    return {};
  }

  const allowedPuzzleIds = new Set(puzzleIds);
  const rawStats = value.stats;
  const entries = Array.isArray(rawStats)
    ? rawStats.map((entry) => normalizeStatsEntry(entry))
    : isRecord(rawStats)
      ? Object.entries(rawStats).map(([puzzleId, entry]) =>
          normalizeStatsEntry(entry, puzzleId),
        )
      : [];

  return Object.fromEntries(
    entries
      .filter((entry): entry is PuzzleCompletionStats => entry != null)
      .filter((entry) => allowedPuzzleIds.has(entry.puzzleId))
      .map((entry) => [entry.puzzleId, entry]),
  );
}

export function createPuzzleCompletionStatsRepository({
  statsUrl,
}: PuzzleCompletionStatsRepositoryOptions = {}) {
  const configuredStatsUrl = getConfiguredStatsUrl(statsUrl);

  return {
    async loadStats(puzzleIds: string[]): Promise<PuzzleCompletionStatsById> {
      if (configuredStatsUrl == null || puzzleIds.length === 0) {
        return {};
      }

      try {
        const response = await fetch(configuredStatsUrl, {
          cache: "no-store",
        });

        if (!response.ok) {
          return {};
        }

        const payload = (await response.json()) as PuzzleCompletionStatsPayload;
        return normalizeStatsPayload(payload, puzzleIds);
      } catch {
        return {};
      }
    },
  };
}
