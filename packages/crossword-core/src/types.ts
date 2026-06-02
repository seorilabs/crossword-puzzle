export type Direction = "across" | "down";

export type CellCoordinate = {
  row: number;
  col: number;
};

export type Bounds = {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
};

export type PuzzleEntry = {
  id: string;
  answer: string;
  clue: string;
  clueSource?: string;
  direction: Direction;
  row: number;
  col: number;
  generatedBy: "placed" | "auto";
  needsManualClue?: boolean;
};

export type PuzzleQualityCheck = {
  key: string;
  pass: boolean;
  actual: number;
  expected: number;
};

export type PuzzleQuality = {
  pass: boolean;
  checks: PuzzleQualityCheck[];
  ratios: {
    autoRunRatio: number;
    multiCrossRatio: number;
  };
  thresholds: Record<string, number>;
};

export type PuzzleMetrics = {
  autoRunCount: number;
  bboxDensity: number;
  crossCells: number;
  crossRatio: number;
  filledCells: number;
  multiCrossEntries: number;
  placedWordCount: number;
  wordCount: number;
};

export type Puzzle = {
  puzzleId: string;
  date: string;
  difficulty: "easy" | "normal" | "hard";
  gridSize: number;
  grid: string[][];
  entries: PuzzleEntry[];
  metrics: PuzzleMetrics;
  packId?: string;
  publishedAt?: string;
  quality?: PuzzleQuality;
  slotId?: string;
};

export type PuzzleSlot = {
  answer: string;
  cells: CellCoordinate[];
  col: number;
  direction: Direction;
  row: number;
};

export type PuzzleEntryReference = Pick<
  PuzzleEntry,
  "answer" | "col" | "direction" | "id" | "row"
>;

export type PuzzleSlotValidation = {
  answerMismatches: Array<{
    entry: PuzzleEntryReference;
    slot: PuzzleSlot;
  }>;
  duplicateEntries: Array<{
    col: number;
    direction: Direction;
    entries: PuzzleEntryReference[];
    row: number;
  }>;
  entryWithoutSlots: PuzzleEntryReference[];
  missingEntries: PuzzleSlot[];
  pass: boolean;
  slots: PuzzleSlot[];
};

export type PuzzleManifestItem = {
  date: string;
  difficulty?: Puzzle["difficulty"];
  metrics?: PuzzleMetrics;
  packId?: string;
  path: string;
  publishedAt?: string;
  puzzleId: string;
  quality?: PuzzleQuality;
  slotId?: string;
};

export type PuzzleManifest = {
  days?: number;
  generatedAt?: string;
  keep?: number;
  qualityThresholds?: Record<string, number>;
  puzzles: PuzzleManifestItem[];
  startDate?: string;
  wordBank?: {
    license?: {
      name: string;
      spdx: string;
      url: string;
    };
    path: string;
    rawWordCount?: number;
    sourceName?: string;
    sourceUrl?: string;
    wordCount?: number;
  };
};

export type SavedProgress = {
  cellValues: Record<string, string>;
  hintCount: number;
};

export type ReviewEntry = PuzzleEntry & {
  crossPoints: string[];
};
