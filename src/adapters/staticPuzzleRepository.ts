import type {
  Puzzle,
  PuzzleManifest,
  PuzzleManifestItem,
  PuzzleRepository,
} from "../../packages/crossword-core/src";

type Fetcher = typeof fetch;

const DEFAULT_MANIFEST_PATH = "/puzzles/manifest.json";

type StaticPuzzleRepositoryOptions = {
  assetBaseUrl?: string;
  fetcher?: Fetcher;
  manifestPath?: string;
  manifestUrl?: string;
};

async function fetchJson<T>(fetcher: Fetcher, path: string): Promise<T> {
  const response = await fetcher(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
}

function sortPuzzleSummaries(puzzles: PuzzleManifestItem[]) {
  return dedupePuzzleSummaries(
    [...puzzles].sort((left, right) =>
      getPuzzleSortKey(right).localeCompare(getPuzzleSortKey(left)),
    ),
  );
}

function getPuzzleSortKey(puzzle: PuzzleManifestItem) {
  return puzzle.publishedAt ?? puzzle.slotId ?? puzzle.date ?? puzzle.puzzleId;
}

function isGeneratedPackPuzzle(puzzle: PuzzleManifestItem) {
  return (
    puzzle.packId != null || puzzle.publishedAt != null || puzzle.slotId != null
  );
}

function dedupePuzzleSummaries(puzzles: PuzzleManifestItem[]) {
  const hasGeneratedPack = puzzles.some(isGeneratedPackPuzzle);
  const visiblePuzzles = hasGeneratedPack
    ? puzzles.filter(isGeneratedPackPuzzle)
    : puzzles;
  const seenKeys = new Set<string>();
  const result: PuzzleManifestItem[] = [];

  for (const puzzle of visiblePuzzles) {
    const key = puzzle.slotId ?? puzzle.puzzleId;

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    result.push(puzzle);
  }

  return result;
}

function getOptionalUrl(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed === "" ? undefined : trimmed;
}

function isAbsoluteUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function resolveManifestUrl({
  assetBaseUrl,
  manifestPath = DEFAULT_MANIFEST_PATH,
  manifestUrl,
}: Pick<
  StaticPuzzleRepositoryOptions,
  "assetBaseUrl" | "manifestPath" | "manifestUrl"
>) {
  const nextManifestUrl = getOptionalUrl(manifestUrl);

  if (nextManifestUrl != null) {
    return nextManifestUrl;
  }

  const nextAssetBaseUrl = getOptionalUrl(assetBaseUrl);

  if (nextAssetBaseUrl != null) {
    return new URL(DEFAULT_MANIFEST_PATH, nextAssetBaseUrl).toString();
  }

  return manifestPath;
}

function resolvePuzzleUrl({
  assetBaseUrl,
  manifestUrl,
  puzzlePath,
}: {
  assetBaseUrl?: string;
  manifestUrl: string;
  puzzlePath: string;
}) {
  if (isAbsoluteUrl(puzzlePath)) {
    return puzzlePath;
  }

  const nextAssetBaseUrl = getOptionalUrl(assetBaseUrl);

  if (nextAssetBaseUrl != null) {
    return new URL(puzzlePath, nextAssetBaseUrl).toString();
  }

  if (isAbsoluteUrl(manifestUrl)) {
    return new URL(puzzlePath, manifestUrl).toString();
  }

  return puzzlePath;
}

export function createStaticPuzzleRepository({
  assetBaseUrl,
  fetcher = fetch.bind(globalThis),
  manifestPath = DEFAULT_MANIFEST_PATH,
  manifestUrl,
}: StaticPuzzleRepositoryOptions = {}): PuzzleRepository {
  const resolvedManifestUrl = resolveManifestUrl({
    assetBaseUrl,
    manifestPath,
    manifestUrl,
  });

  async function loadManifest() {
    return fetchJson<PuzzleManifest>(fetcher, resolvedManifestUrl);
  }

  return {
    async listPuzzleSummaries() {
      const manifest = await loadManifest();
      return sortPuzzleSummaries(manifest.puzzles);
    },

    async getPuzzleById(puzzleId) {
      const manifest = await loadManifest();
      const selectedPuzzle = manifest.puzzles.find(
        (item) => item.puzzleId === puzzleId,
      );

      if (selectedPuzzle == null) {
        return null;
      }

      return fetchJson<Puzzle>(
        fetcher,
        resolvePuzzleUrl({
          assetBaseUrl,
          manifestUrl: resolvedManifestUrl,
          puzzlePath: selectedPuzzle.path,
        }),
      );
    },

    async getPuzzleForDate(date) {
      const manifest = await loadManifest();
      const sortedPuzzles = sortPuzzleSummaries(manifest.puzzles);
      const selectedPuzzle =
        sortedPuzzles.find((item) => item.date === date) ??
        sortedPuzzles.find((item) => item.date <= date) ??
        sortedPuzzles[0];

      if (selectedPuzzle == null) {
        return null;
      }

      return fetchJson<Puzzle>(
        fetcher,
        resolvePuzzleUrl({
          assetBaseUrl,
          manifestUrl: resolvedManifestUrl,
          puzzlePath: selectedPuzzle.path,
        }),
      );
    },
  };
}

export function createFallbackPuzzleRepository(
  primaryRepository: PuzzleRepository,
  fallbackRepository: PuzzleRepository,
): PuzzleRepository {
  return {
    async listPuzzleSummaries() {
      try {
        const summaries = await primaryRepository.listPuzzleSummaries();

        if (summaries.length > 0) {
          return summaries;
        }
      } catch {
        // Fall back to bundled puzzle assets.
      }

      return fallbackRepository.listPuzzleSummaries();
    },

    async getPuzzleById(puzzleId) {
      try {
        const puzzle = await primaryRepository.getPuzzleById(puzzleId);

        if (puzzle != null) {
          return puzzle;
        }
      } catch {
        // Fall back to bundled puzzle assets.
      }

      return fallbackRepository.getPuzzleById(puzzleId);
    },

    async getPuzzleForDate(date) {
      try {
        const puzzle = await primaryRepository.getPuzzleForDate(date);

        if (puzzle != null) {
          return puzzle;
        }
      } catch {
        // Fall back to bundled puzzle assets.
      }

      return fallbackRepository.getPuzzleForDate(date);
    },
  };
}
