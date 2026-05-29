import type {
  Puzzle,
  PuzzleManifest,
  PuzzleManifestItem,
  PuzzleRepository,
} from "../../packages/crossword-core/src";

type Fetcher = typeof fetch;

type StaticPuzzleRepositoryOptions = {
  fetcher?: Fetcher;
  manifestPath?: string;
};

async function fetchJson<T>(fetcher: Fetcher, path: string): Promise<T> {
  const response = await fetcher(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
}

function sortPuzzleSummaries(puzzles: PuzzleManifestItem[]) {
  return [...puzzles].sort((left, right) =>
    right.date.localeCompare(left.date),
  );
}

export function createStaticPuzzleRepository({
  fetcher = fetch.bind(globalThis),
  manifestPath = "/puzzles/manifest.json",
}: StaticPuzzleRepositoryOptions = {}): PuzzleRepository {
  async function loadManifest() {
    return fetchJson<PuzzleManifest>(fetcher, manifestPath);
  }

  return {
    async listPuzzleSummaries() {
      const manifest = await loadManifest();
      return sortPuzzleSummaries(manifest.puzzles);
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

      return fetchJson<Puzzle>(fetcher, selectedPuzzle.path);
    },
  };
}
