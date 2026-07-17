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
  // 신규 game-content/1에서는 gameplay 권위값이다. 기존 unversioned puzzle은
  // answer만 가지므로 ko-KR/v1 profile로 projection해 하위 호환한다.
  answerCells?: string[];
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
  alias?: string;
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
  // 주제(테마) 퍼즐일 때만 채워지는 주제 식별값·라벨(#236). 일반 퍼즐은 생략.
  themeTag?: string;
  themeLabel?: string;
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
  alias?: string;
  date: string;
  difficulty?: Puzzle["difficulty"];
  metrics?: PuzzleMetrics;
  packId?: string;
  path: string;
  publishedAt?: string;
  puzzleId: string;
  quality?: PuzzleQuality;
  slotId?: string;
  // 주제(테마) 퍼즐 식별값·라벨(#236). 일반 퍼즐 항목은 생략.
  themeTag?: string;
  themeLabel?: string;
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
  earnedHintCredits: number;
  hintCount: number;
  // 사용자가 "정답 보기"로 단어를 공개했는지 여부. 노힌트/첫 도전 배지와
  // 최고 기록 판정에서 제외하기 위해 진행상태에 보존한다. 구버전 저장 데이터에는
  // 없으므로 optional이며, 로드 시 false로 정규화한다.
  revealUsed?: boolean;
  // 연필(임시) 모드로 입력한 셀 키 목록(`"row,col"`). 확신 없는 글자를 회색으로
  // 구분 렌더하기 위한 표시용 메타데이터이며, 정오/완료 판정에는 영향을 주지
  // 않는다(판정은 cellValues 값만 본다). 구버전 저장 데이터에는 없으므로
  // optional이며, 로드 시 빈 배열로 정규화한다.
  tentativeCells?: string[];
};

export type ReviewEntry = PuzzleEntry & {
  crossPoints: string[];
};
