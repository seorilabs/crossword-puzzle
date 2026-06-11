import { Button, Paragraph, Top } from "@toss/tds-mobile";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  buildCellEntries,
  buildReviewEntries,
  buildStartLabels,
  completeMission,
  createPuzzleSummary,
  createDailyMissionState,
  DAILY_ATTEMPT_LIMIT,
  getBonusPuzzleCandidateSummary,
  getBounds,
  getCellKey,
  getCompletedEntries,
  getDailyFreePuzzleSummaries,
  getDailyFreePuzzleSummary,
  getEntryAnswerValue,
  getEntryCells,
  getInitialEntryId,
  getRemainingAttempts,
  getTodayDateKey,
  sortPuzzleSummariesByRecency,
  startMissionAttempt,
  uniquePuzzleSummaries,
  validatePuzzleSlots,
  type DailyMissionState,
  type Direction,
  type Puzzle,
  type PuzzleCompletionStats,
  type PuzzleEntry,
  type PuzzleManifestItem,
  type PuzzleQualityCheck,
  type PuzzleSlotValidation,
  type ReviewEntry,
  type SavedProgress,
} from "../packages/crossword-core/src";
import { createLocalMissionRepository } from "./adapters/localMissionRepository";
import {
  createLocalBonusPuzzleUnlockRepository,
  createLocalPuzzleArchiveRepository,
  type BonusPuzzleUnlock,
  type PuzzleArchiveRecord,
  type PuzzleArchiveSaveOptions,
} from "./adapters/localPuzzleAccessRepository";
import { createLocalProgressRepository } from "./adapters/localProgressRepository";
import {
  showRewardedBonusPuzzleAd,
  showResultInterstitialAd,
  showRewardedHintAd,
  type FullScreenAdResult,
} from "./adapters/appsInTossAds";
import { loadFirebaseLaunchConfig } from "./adapters/firebaseClient";
import {
  defaultLaunchConfig,
  type LaunchConfig,
} from "./adapters/launchConfig";
import { createPuzzleCompletionStatsRepository } from "./adapters/puzzleCompletionStatsRepository";
import {
  createFallbackPuzzleRepository,
  createStaticPuzzleRepository,
} from "./adapters/staticPuzzleRepository";
import { telemetry } from "./adapters/telemetry";
import { fallbackPuzzle } from "./data/fallbackPuzzle";

type AppRoute =
  | "home"
  | "today"
  | "result"
  | "history"
  | "license"
  | "dev-simulator";

type LoadState = "fallback" | "loading" | "remote";

type PuzzleViewModel = {
  bounds: ReturnType<typeof getBounds>;
  cellEntries: Map<string, PuzzleEntry[]>;
  clueEntries: PuzzleEntry[];
  completedEntries: PuzzleEntry[];
  cols: number[];
  isComplete: boolean;
  reviewEntries: ReviewEntry[];
  rows: number[];
  selectedAnswer: string;
  selectedCells: Set<string>;
  selectedEntry?: PuzzleEntry;
  slotValidation: PuzzleSlotValidation;
  startLabels: Map<string, number>;
};

type DateCardState = {
  attemptsUsed: number;
  completedAt?: string;
  hasProgress: boolean;
  hintCount: number;
};

type CompletionStatsByPuzzleId = Record<string, PuzzleCompletionStats>;

type DateSelectionProps = {
  completionStatsByPuzzleId: CompletionStatsByPuzzleId;
  completionStatsMinDisplayCount: number;
  dateCardStates: Record<string, DateCardState>;
  loadState: LoadState;
  puzzleSummaries: PuzzleManifestItem[];
  selectedPuzzleId: string;
  selectPuzzle: (puzzleId: string) => void;
};

type PuzzleSession = {
  nextPuzzle: Puzzle;
  savedMission: DailyMissionState;
  savedProgress: SavedProgress;
};

type RewardedAdStatus = "idle" | "loading";

type BonusPuzzlePanelState = {
  adsEnabled: boolean;
  candidateSummary?: PuzzleManifestItem;
  isAdBusy: boolean;
  notice: string;
  status: "available" | "loading" | "unlocked" | "used" | "waiting";
  unlockedSummary?: PuzzleManifestItem;
};

type HintBalance = {
  adsEnabled: boolean;
  defaultCredits: number;
  earnedCredits: number;
  isAdBusy: boolean;
  notice: string;
  remaining: number;
  rewardedCredits: number;
  total: number;
  used: number;
};

type FullScreenAdFailureResult = Exclude<
  FullScreenAdResult,
  { status: "rewarded" }
>;

const puzzlePackBaseUrl = import.meta.env.VITE_PUZZLE_PACK_BASE_URL?.trim();
const puzzleManifestUrl = import.meta.env.VITE_PUZZLE_MANIFEST_URL?.trim();
const configuredPuzzleStatsUrl = import.meta.env.VITE_PUZZLE_STATS_URL?.trim();
const puzzleStatsUrl =
  configuredPuzzleStatsUrl != null && configuredPuzzleStatsUrl !== ""
    ? configuredPuzzleStatsUrl
    : puzzlePackBaseUrl != null && puzzlePackBaseUrl !== ""
      ? `${puzzlePackBaseUrl.replace(/\/+$/, "")}/puzzle-stats/completions.json`
      : undefined;
const hasRemotePuzzlePack =
  (puzzlePackBaseUrl != null && puzzlePackBaseUrl !== "") ||
  (puzzleManifestUrl != null && puzzleManifestUrl !== "");
const localPuzzleRepository = createStaticPuzzleRepository();
const remotePuzzleRepository = createStaticPuzzleRepository({
  assetBaseUrl: puzzlePackBaseUrl,
  manifestUrl: puzzleManifestUrl,
});
const puzzleRepository = hasRemotePuzzlePack
  ? createFallbackPuzzleRepository(
      remotePuzzleRepository,
      localPuzzleRepository,
    )
  : localPuzzleRepository;
const progressRepository = createLocalProgressRepository();
const missionRepository = createLocalMissionRepository();
const puzzleArchiveRepository = createLocalPuzzleArchiveRepository();
const bonusPuzzleUnlockRepository = createLocalBonusPuzzleUnlockRepository();
const puzzleCompletionStatsRepository = createPuzzleCompletionStatsRepository({
  statsUrl: puzzleStatsUrl,
});

const directionLabels: Record<Direction, string> = {
  across: "가로",
  down: "세로",
};

const directionOrder: Record<Direction, number> = {
  across: 0,
  down: 1,
};

const qualityLabels: Record<string, string> = {
  maxAutoRunRatio: "자동 단어 비율",
  minBboxDensity: "밀도",
  minCrossRatio: "교차율",
  minMultiCrossRatio: "다중 교차율",
  minWordCount: "단어 수",
};

const contentSourceNotice =
  "일부 힌트는 국립국어원 한국어기초사전 뜻풀이를 바탕으로 구성했습니다.";
const contentSourceLicense =
  "한국어기초사전 자료는 Creative Commons Attribution-ShareAlike 2.0 Korea(CC BY-SA 2.0 KR) 조건으로 제공됩니다.";
const krdictCopyrightUrl =
  "https://krdict.korean.go.kr/kor/kboardPolicy/copyRightTermsInfo";
const ccBySaKrUrl = "https://creativecommons.org/licenses/by-sa/2.0/kr/";

function getPuzzleTelemetryParams(puzzle: Puzzle) {
  return {
    difficulty: puzzle.difficulty,
    grid_size: puzzle.gridSize,
    pack_id: puzzle.packId,
    published_at: puzzle.publishedAt,
    puzzle_id: puzzle.puzzleId,
    slot_id: puzzle.slotId,
    word_count: puzzle.entries.length,
  };
}

function getFullScreenAdResultParams(result: FullScreenAdResult) {
  if (result.status === "timeout") {
    return { reason: result.reason, status: result.status };
  }

  if (result.status === "failed") {
    return {
      reason: result.reason === "failedToShow" ? "failed_to_show" : "error",
      status: result.status,
    };
  }

  return { status: result.status };
}

function getRewardedHintFailureMessage(result: FullScreenAdFailureResult) {
  switch (result.status) {
    case "unsupported":
      return "현재 환경에서는 광고 힌트를 사용할 수 없어요.";
    case "dismissed":
      return "광고 시청이 완료되지 않아 힌트가 추가되지 않았어요.";
    case "timeout":
      return result.reason === "load_timeout"
        ? "광고를 불러오는 데 시간이 오래 걸려 힌트가 추가되지 않았어요. 잠시 후 다시 시도해 주세요."
        : "광고 표시가 시작되지 않아 힌트가 추가되지 않았어요. 잠시 후 다시 시도해 주세요.";
    case "failed":
      return "광고를 표시하지 못해 힌트가 추가되지 않았어요. 잠시 후 다시 시도해 주세요.";
  }
}

function getRewardedBonusPuzzleFailureMessage(
  result: FullScreenAdFailureResult,
) {
  switch (result.status) {
    case "unsupported":
      return "현재 환경에서는 보너스 퍼즐 광고를 사용할 수 없어요.";
    case "dismissed":
      return "광고 시청이 완료되지 않아 퍼즐이 열리지 않았어요.";
    case "timeout":
      return result.reason === "load_timeout"
        ? "광고를 불러오는 데 시간이 오래 걸려 퍼즐이 열리지 않았어요. 잠시 후 다시 시도해 주세요."
        : "광고 표시가 시작되지 않아 퍼즐이 열리지 않았어요. 잠시 후 다시 시도해 주세요.";
    case "failed":
      return "광고를 표시하지 못해 퍼즐이 열리지 않았어요. 잠시 후 다시 시도해 주세요.";
  }
}

function getElapsedSeconds(startedAt?: string, endedAt?: string) {
  if (startedAt == null) {
    return undefined;
  }

  const startTime = new Date(startedAt).getTime();
  const endTime = endedAt == null ? Date.now() : new Date(endedAt).getTime();

  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime < startTime
  ) {
    return undefined;
  }

  return Math.round((endTime - startTime) / 1000);
}

function getRouteFromPathname(pathname: string): AppRoute {
  if (pathname === "/today") {
    return "today";
  }

  if (pathname === "/result") {
    return "result";
  }

  if (pathname === "/history") {
    return "history";
  }

  if (pathname === "/license") {
    return "license";
  }

  if (pathname === "/dev/simulator" && import.meta.env.DEV) {
    return "dev-simulator";
  }

  return "home";
}

function getPathForRoute(route: AppRoute) {
  switch (route) {
    case "today":
      return "/today";
    case "result":
      return "/result";
    case "history":
      return "/history";
    case "license":
      return "/license";
    case "dev-simulator":
      return "/dev/simulator";
    case "home":
      return "/";
  }
}

function formatRatio(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatQualityValue(check: PuzzleQualityCheck) {
  if (
    check.key.toLowerCase().includes("ratio") ||
    check.key.includes("Density")
  ) {
    return `${formatRatio(check.actual)} / ${formatRatio(check.expected)}`;
  }

  return `${check.actual} / ${check.expected}`;
}

function getProgressPercent(completedCount: number, totalCount: number) {
  if (totalCount === 0) {
    return 0;
  }

  return Math.round((completedCount / totalCount) * 100);
}

function isRemotePuzzlePackSummary(summary: PuzzleManifestItem) {
  return (
    summary.packId != null ||
    summary.publishedAt != null ||
    summary.slotId != null
  );
}

function getPuzzlePackLoadState(summaries: PuzzleManifestItem[]): LoadState {
  return summaries.some(isRemotePuzzlePackSummary) ? "remote" : "fallback";
}

function getInitialPuzzleId(
  puzzleSummaries: PuzzleManifestItem[],
  today: string,
) {
  return (
    getDailyFreePuzzleSummary(puzzleSummaries, today)?.puzzleId ??
    fallbackPuzzle.puzzleId
  );
}

function getCompletedPuzzleIds(dateCardStates: Record<string, DateCardState>) {
  return new Set(
    Object.entries(dateCardStates)
      .filter(([, state]) => state.completedAt != null)
      .map(([puzzleId]) => puzzleId),
  );
}

function findPuzzleSummaryById(
  puzzleSummaries: PuzzleManifestItem[],
  puzzleId?: string,
) {
  return puzzleId == null
    ? undefined
    : puzzleSummaries.find((summary) => summary.puzzleId === puzzleId);
}

function getPuzzleSummaryFromArchive(
  records: PuzzleArchiveRecord[],
  puzzleId?: string,
) {
  const record =
    puzzleId == null
      ? undefined
      : records.find((item) => item.puzzleId === puzzleId);

  return record == null ? undefined : createPuzzleSummary(record.puzzle);
}

function createDateCardState(
  mission: DailyMissionState,
  progress: SavedProgress,
): DateCardState {
  return {
    attemptsUsed: mission.attemptsUsed,
    completedAt: mission.completedAt,
    hasProgress:
      mission.attemptsUsed > 0 ||
      progress.hintCount > 0 ||
      Object.keys(progress.cellValues).length > 0,
    hintCount: progress.hintCount,
  };
}

function hasSavedProgress(mission: DailyMissionState, progress: SavedProgress) {
  return (
    mission.attemptsUsed > 0 ||
    progress.earnedHintCredits > 0 ||
    progress.hintCount > 0 ||
    Object.keys(progress.cellValues).length > 0
  );
}

function createInitialMission() {
  return createDailyMissionState(
    fallbackPuzzle.date,
    fallbackPuzzle.puzzleId,
    DAILY_ATTEMPT_LIMIT,
  );
}

function getEntryStartLabel(
  entry: PuzzleEntry,
  startLabels: Map<string, number>,
) {
  return startLabels.get(getCellKey(entry.row, entry.col));
}

function formatEntryReference(
  entry: PuzzleEntry,
  startLabels: Map<string, number>,
) {
  const startLabel = getEntryStartLabel(entry, startLabels);
  const prefix = startLabel == null ? "" : `${startLabel}번 `;

  return `${prefix}${directionLabels[entry.direction]} · ${entry.answer.length}글자`;
}

function getEntryStartCellKey(entry?: PuzzleEntry) {
  return entry == null ? "" : getCellKey(entry.row, entry.col);
}

function getAnswerInputLetters(value: string, maxLength: number) {
  return [...value.replace(/\s/g, "")].slice(0, maxLength);
}

function getPendingAnswerCellValues(
  entry: PuzzleEntry,
  inputValue: string,
  selectedCellKey: string,
) {
  const cells = getEntryCells(entry);
  const selectedIndex = getEntryCellIndex(entry, selectedCellKey);
  const pendingLetters = getAnswerInputLetters(
    inputValue,
    cells.length - selectedIndex,
  );

  return Object.fromEntries(
    pendingLetters
      .map((letter, offset) => {
        const cell = cells[selectedIndex + offset];

        return cell == null
          ? null
          : [getCellKey(cell.row, cell.col), letter] as const;
      })
      .filter((cellEntry): cellEntry is readonly [string, string] => {
        return cellEntry != null;
      }),
  );
}

function isHangulJamoLetter(letter: string) {
  return /^[ㄱ-ㅎㅏ-ㅣ]$/.test(letter);
}

function getAnswerCommitLetters(value: string, maxLength: number) {
  return getAnswerInputLetters(value, maxLength).filter(
    (letter) => !isHangulJamoLetter(letter),
  );
}

function isHangulJamoInput(value: string) {
  const letters = getAnswerInputLetters(value, value.length);

  return (
    letters.length > 0 && letters.every((letter) => isHangulJamoLetter(letter))
  );
}

function getEntryCellIndex(entry: PuzzleEntry, cellKey: string) {
  const cells = getEntryCells(entry);
  const index = cells.findIndex(
    (cell) => getCellKey(cell.row, cell.col) === cellKey,
  );

  return index === -1 ? 0 : index;
}

function getEntryCellKeyAt(entry: PuzzleEntry, index: number) {
  const cells = getEntryCells(entry);
  const safeIndex = Math.max(0, Math.min(cells.length - 1, index));
  const cell = cells[safeIndex];

  return cell == null
    ? getEntryStartCellKey(entry)
    : getCellKey(cell.row, cell.col);
}

function getNextAnswerSlotCellKey(
  entry: PuzzleEntry,
  cellValues: Record<string, string>,
  startIndex: number,
  inputLength: number,
) {
  const cells = getEntryCells(entry);
  const afterInputIndex = Math.min(startIndex + inputLength, cells.length - 1);
  const nextEmptyIndex = cells.findIndex((cell, index) => {
    if (index < afterInputIndex) {
      return false;
    }

    return cellValues[getCellKey(cell.row, cell.col)] == null;
  });

  if (nextEmptyIndex !== -1) {
    return getEntryCellKeyAt(entry, nextEmptyIndex);
  }

  const firstEmptyIndex = cells.findIndex(
    (cell) => cellValues[getCellKey(cell.row, cell.col)] == null,
  );

  return getEntryCellKeyAt(
    entry,
    firstEmptyIndex === -1 ? afterInputIndex : firstEmptyIndex,
  );
}

function getEntryCellDistance(entry: PuzzleEntry, targetEntry: PuzzleEntry) {
  const cells = getEntryCells(entry);
  const targetCells = getEntryCells(targetEntry);
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const cell of cells) {
    for (const targetCell of targetCells) {
      const distance =
        Math.abs(cell.row - targetCell.row) +
        Math.abs(cell.col - targetCell.col);

      if (distance < nearestDistance) {
        nearestDistance = distance;
      }
    }
  }

  return nearestDistance;
}

function getEntryCenterDistance(entry: PuzzleEntry, targetEntry: PuzzleEntry) {
  const cells = getEntryCells(entry);
  const targetCells = getEntryCells(targetEntry);
  const center = cells.reduce(
    (total, cell) => ({
      row: total.row + cell.row / cells.length,
      col: total.col + cell.col / cells.length,
    }),
    { row: 0, col: 0 },
  );
  const targetCenter = targetCells.reduce(
    (total, cell) => ({
      row: total.row + cell.row / targetCells.length,
      col: total.col + cell.col / targetCells.length,
    }),
    { row: 0, col: 0 },
  );

  return (
    Math.abs(center.row - targetCenter.row) +
    Math.abs(center.col - targetCenter.col)
  );
}

function getNearestUncompletedEntry(
  entries: PuzzleEntry[],
  cellValues: Record<string, string>,
  currentEntry: PuzzleEntry,
) {
  const completedEntryIds = new Set(
    getCompletedEntries(entries, cellValues).map((entry) => entry.id),
  );

  return entries
    .map((entry, index) => ({
      cellDistance: getEntryCellDistance(currentEntry, entry),
      centerDistance: getEntryCenterDistance(currentEntry, entry),
      entry,
      index,
    }))
    .filter(
      ({ entry }) =>
        (!completedEntryIds.has(currentEntry.id) ||
          entry.id !== currentEntry.id) &&
        !completedEntryIds.has(entry.id),
    )
    .sort(
      (a, b) =>
        a.cellDistance - b.cellDistance ||
        a.centerDistance - b.centerDistance ||
        a.index - b.index,
    )[0]?.entry;
}

function isEntryFilled(entry: PuzzleEntry, cellValues: Record<string, string>) {
  return getEntryCells(entry).every(
    (cell) => cellValues[getCellKey(cell.row, cell.col)] != null,
  );
}

function getInitialEntryStartCellKey(puzzle: Puzzle) {
  const initialEntryId = getInitialEntryId(puzzle);
  const initialEntry =
    puzzle.entries.find((entry) => entry.id === initialEntryId) ??
    puzzle.entries[0];

  return getEntryStartCellKey(initialEntry);
}

function getCellAnswerLetter(puzzle: Puzzle, cellKey: string) {
  const [row, col] = cellKey.split(":").map(Number);

  return puzzle.grid[row]?.[col] ?? "";
}

// A committed letter that matches the grid answer is locked: it is correct for
// both crossing words, so erase actions (backspace / clear) skip over it.
function isCellLocked(
  puzzle: Puzzle,
  cellValues: Record<string, string>,
  cellKey: string,
) {
  const value = cellValues[cellKey];

  return value != null && value === getCellAnswerLetter(puzzle, cellKey);
}

function App() {
  const [route, setRoute] = useState<AppRoute>(() =>
    getRouteFromPathname(window.location.pathname),
  );
  const [puzzle, setPuzzle] = useState<Puzzle>(fallbackPuzzle);
  const [cellValues, setCellValues] = useState<Record<string, string>>({});
  const [selectedDirection, setSelectedDirection] =
    useState<Direction>("across");
  const [selectedEntryId, setSelectedEntryId] = useState(
    getInitialEntryId(fallbackPuzzle),
  );
  const [selectedCellKey, setSelectedCellKey] = useState(() =>
    getInitialEntryStartCellKey(fallbackPuzzle),
  );
  const [loadState, setLoadState] = useState<LoadState>(
    hasRemotePuzzlePack ? "loading" : "fallback",
  );
  const [hintCount, setHintCount] = useState(0);
  const [earnedHintCredits, setEarnedHintCredits] = useState(0);
  const [launchConfig, setLaunchConfig] =
    useState<LaunchConfig>(defaultLaunchConfig);
  const [rewardedAdStatus, setRewardedAdStatus] =
    useState<RewardedAdStatus>("idle");
  const [bonusAdStatus, setBonusAdStatus] = useState<RewardedAdStatus>("idle");
  const [isRewardedHintPromptOpen, setIsRewardedHintPromptOpen] =
    useState(false);
  const [bonusNotice, setBonusNotice] = useState("");
  const [hintNotice, setHintNotice] = useState("");
  const [hintToast, setHintToast] = useState({ id: 0, message: "" });
  const [mission, setMission] =
    useState<DailyMissionState>(createInitialMission);
  const [puzzleSummaries, setPuzzleSummaries] = useState<PuzzleManifestItem[]>(
    () => [createPuzzleSummary(fallbackPuzzle)],
  );
  const [dateCardStates, setDateCardStates] = useState<
    Record<string, DateCardState>
  >({});
  const [puzzleArchiveRecords, setPuzzleArchiveRecords] = useState<
    PuzzleArchiveRecord[]
  >([]);
  const [bonusPuzzleUnlock, setBonusPuzzleUnlock] =
    useState<BonusPuzzleUnlock | null>(null);
  const [completionStatsByPuzzleId, setCompletionStatsByPuzzleId] =
    useState<CompletionStatsByPuzzleId>({});
  const [completionCelebrationId, setCompletionCelebrationId] = useState<
    string | null
  >(null);
  const shownResultInterstitialRef = useRef<string | null>(null);
  const justCompletedPuzzleIdRef = useRef<string | null>(null);
  const firstAnswerInputKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    function syncRoute() {
      setRoute(getRouteFromPathname(window.location.pathname));
    }

    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    // The celebration only belongs to the active 풀이 화면; clear it whenever we
    // leave so returning to a finished puzzle (incl. via browser history) does
    // not re-open the dialog over the read-only board.
    if (route !== "today") {
      setCompletionCelebrationId(null);
    }
  }, [route]);

  useEffect(() => {
    let isCancelled = false;

    loadFirebaseLaunchConfig()
      .then((nextConfig) => {
        if (!isCancelled) {
          setLaunchConfig(nextConfig);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLaunchConfig(defaultLaunchConfig);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const loadPuzzleSession = useCallback(async (puzzleId: string) => {
    const nextPuzzle =
      (await puzzleRepository.getPuzzleById(puzzleId)) ??
      (await puzzleArchiveRepository.loadPuzzle(puzzleId));

    if (nextPuzzle == null) {
      return null;
    }

    const [savedProgress, savedMission] = await Promise.all([
      progressRepository.loadProgress(nextPuzzle.puzzleId),
      missionRepository.loadMission(
        nextPuzzle.date,
        nextPuzzle.puzzleId,
        DAILY_ATTEMPT_LIMIT,
      ),
    ]);

    return {
      nextPuzzle,
      savedMission,
      savedProgress,
    } satisfies PuzzleSession;
  }, []);

  const applyPuzzleSession = useCallback(
    (
      session: PuzzleSession | null,
      options: { mission?: DailyMissionState } = {},
    ) => {
      if (session == null) {
        return;
      }

      const nextMission = options.mission ?? session.savedMission;

      setPuzzle(session.nextPuzzle);
      setCellValues(session.savedProgress.cellValues);
      setEarnedHintCredits(session.savedProgress.earnedHintCredits);
      setHintCount(session.savedProgress.hintCount);
      setSelectedDirection("across");
      setSelectedEntryId(getInitialEntryId(session.nextPuzzle));
      setSelectedCellKey(getInitialEntryStartCellKey(session.nextPuzzle));
      setMission(nextMission);
      setDateCardStates((prev) => ({
        ...prev,
        [session.nextPuzzle.puzzleId]: createDateCardState(
          nextMission,
          session.savedProgress,
        ),
      }));
    },
    [],
  );

  const loadDateCardStates = useCallback(
    async (
      summaries: PuzzleManifestItem[],
    ): Promise<Record<string, DateCardState>> => {
      const states = await Promise.all(
        summaries.map(async (summary) => {
          const [savedProgress, savedMission] = await Promise.all([
            progressRepository.loadProgress(summary.puzzleId),
            missionRepository.loadMission(
              summary.date,
              summary.puzzleId,
              DAILY_ATTEMPT_LIMIT,
            ),
          ]);

          return [
            summary.puzzleId,
            createDateCardState(savedMission, savedProgress),
          ] as const;
        }),
      );

      return Object.fromEntries(states);
    },
    [],
  );

  const refreshPuzzleArchive = useCallback(async () => {
    const nextArchiveRecords = await puzzleArchiveRepository.listPuzzles();
    const archiveStates = await loadDateCardStates(
      nextArchiveRecords.map((record) => createPuzzleSummary(record.puzzle)),
    );

    setPuzzleArchiveRecords(nextArchiveRecords);
    setDateCardStates((prev) => ({ ...prev, ...archiveStates }));
  }, [loadDateCardStates]);

  const savePuzzleSnapshot = useCallback(
    async (nextPuzzle: Puzzle, options: PuzzleArchiveSaveOptions = {}) => {
      await puzzleArchiveRepository.savePuzzle(nextPuzzle, options);
      await refreshPuzzleArchive();
    },
    [refreshPuzzleArchive],
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadPuzzlePack() {
      try {
        const loadedSummaries = await puzzleRepository.listPuzzleSummaries();
        const nextArchiveRecords = await puzzleArchiveRepository.listPuzzles();
        const nextSummaries =
          loadedSummaries.length > 0
            ? loadedSummaries
            : [createPuzzleSummary(fallbackPuzzle)];
        const today = getTodayDateKey();
        const initialPuzzleId = getInitialPuzzleId(nextSummaries, today);
        const [nextDateCardStates, session, nextBonusUnlock] =
          await Promise.all([
            loadDateCardStates([
              ...nextSummaries,
              ...nextArchiveRecords.map((record) =>
                createPuzzleSummary(record.puzzle),
              ),
            ]),
            loadPuzzleSession(initialPuzzleId),
            bonusPuzzleUnlockRepository.loadUnlock(today),
          ]);

        if (!isCancelled) {
          setPuzzleSummaries(nextSummaries);
          setPuzzleArchiveRecords(nextArchiveRecords);
          setBonusPuzzleUnlock(nextBonusUnlock);
          setDateCardStates(nextDateCardStates);
          applyPuzzleSession(session);
          setLoadState(getPuzzlePackLoadState(nextSummaries));
        }
      } catch {
        if (!isCancelled) {
          setLoadState("fallback");
        }
      }
    }

    loadPuzzlePack();

    return () => {
      isCancelled = true;
    };
  }, [applyPuzzleSession, loadDateCardStates, loadPuzzleSession]);

  const selectPuzzle = useCallback(
    async (puzzleId: string) => {
      if (loadState === "loading") {
        return;
      }

      try {
        const session = await loadPuzzleSession(puzzleId);
        applyPuzzleSession(session);
        if (session == null) {
          setLoadState("fallback");
        }
        telemetry.click("puzzle_select", {
          ...(session == null
            ? { puzzle_id: puzzleId, status: "missing" }
            : {
                ...getPuzzleTelemetryParams(session.nextPuzzle),
                status: "loaded",
              }),
        });
      } catch {
        setLoadState("fallback");
        telemetry.click("puzzle_select", {
          puzzle_id: puzzleId,
          status: "error",
        });
      }
    },
    [applyPuzzleSession, loadPuzzleSession, loadState],
  );

  useEffect(() => {
    void progressRepository.saveProgress(puzzle.puzzleId, {
      cellValues,
      earnedHintCredits,
      hintCount,
    });
  }, [cellValues, earnedHintCredits, hintCount, puzzle.puzzleId]);

  useEffect(() => {
    setDateCardStates((prev) => ({
      ...prev,
      [puzzle.puzzleId]: createDateCardState(mission, {
        cellValues,
        earnedHintCredits,
        hintCount,
      }),
    }));
  }, [cellValues, earnedHintCredits, hintCount, mission, puzzle.puzzleId]);

  const viewModel = usePuzzleViewModel(
    puzzle,
    selectedEntryId,
    selectedDirection,
    cellValues,
  );
  const progressPercent = getProgressPercent(
    viewModel.completedEntries.length,
    puzzle.entries.length,
  );
  const puzzleTelemetryParams = useMemo(
    () => getPuzzleTelemetryParams(puzzle),
    [puzzle],
  );
  const remainingAttempts = getRemainingAttempts(mission);
  const hasProgress =
    Object.keys(cellValues).length > 0 ||
    earnedHintCredits > 0 ||
    hintCount > 0 ||
    viewModel.completedEntries.length > 0;
  const hasStarted = mission.attemptsUsed > 0 || hasProgress;
  const isCompleted = viewModel.isComplete || mission.completedAt != null;
  const todayKey = getTodayDateKey();
  const completedPuzzleIds = useMemo(
    () => getCompletedPuzzleIds(dateCardStates),
    [dateCardStates],
  );
  const dailyFreeSummary = useMemo(
    () => getDailyFreePuzzleSummary(puzzleSummaries, todayKey),
    [puzzleSummaries, todayKey],
  );
  const dailyFreeSummaries = useMemo(
    () =>
      getDailyFreePuzzleSummaries(
        puzzleSummaries,
        todayKey,
        launchConfig.visiblePuzzleCount,
      ),
    [launchConfig.visiblePuzzleCount, puzzleSummaries, todayKey],
  );
  const archivePuzzleSummaries = useMemo(
    () =>
      // The local archive grows unbounded, so only surface the most recent
      // records on the shared carousel; the full list stays in 기록 화면.
      // listPuzzles() already returns records newest-first.
      puzzleArchiveRecords
        .slice(0, launchConfig.visiblePuzzleCount)
        .map((record) => createPuzzleSummary(record.puzzle)),
    [launchConfig.visiblePuzzleCount, puzzleArchiveRecords],
  );
  const activeBonusUnlock =
    bonusPuzzleUnlock?.date === todayKey ? bonusPuzzleUnlock : null;
  const unlockedBonusSummary =
    findPuzzleSummaryById(puzzleSummaries, activeBonusUnlock?.puzzleId) ??
    getPuzzleSummaryFromArchive(
      puzzleArchiveRecords,
      activeBonusUnlock?.puzzleId,
    );
  const bonusCandidateSummary = useMemo(
    () =>
      activeBonusUnlock == null
        ? getBonusPuzzleCandidateSummary({
            completedPuzzleIds,
            dailyFreeSummary,
            puzzleSummaries,
            today: todayKey,
          })
        : undefined,
    [
      activeBonusUnlock,
      completedPuzzleIds,
      dailyFreeSummary,
      puzzleSummaries,
      todayKey,
    ],
  );
  const selectedPuzzleSummary = useMemo(
    () =>
      findPuzzleSummaryById(puzzleSummaries, puzzle.puzzleId) ??
      getPuzzleSummaryFromArchive(puzzleArchiveRecords, puzzle.puzzleId) ??
      createPuzzleSummary(puzzle),
    [puzzle, puzzleArchiveRecords, puzzleSummaries],
  );
  const visiblePuzzleSummaries = useMemo(
    () =>
      sortPuzzleSummariesByRecency(
        uniquePuzzleSummaries(
          [
            ...dailyFreeSummaries,
            unlockedBonusSummary,
            selectedPuzzleSummary,
            ...archivePuzzleSummaries,
          ].filter((summary): summary is PuzzleManifestItem => summary != null),
        ),
      ),
    [
      archivePuzzleSummaries,
      dailyFreeSummaries,
      selectedPuzzleSummary,
      unlockedBonusSummary,
    ],
  );
  useEffect(() => {
    if (!launchConfig.completionStatsEnabled) {
      setCompletionStatsByPuzzleId({});
      return;
    }

    let isCancelled = false;
    const puzzleIds = visiblePuzzleSummaries.map((summary) => summary.puzzleId);

    puzzleCompletionStatsRepository
      .loadStats(puzzleIds)
      .then((nextStats) => {
        if (!isCancelled) {
          setCompletionStatsByPuzzleId(nextStats);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setCompletionStatsByPuzzleId({});
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [launchConfig.completionStatsEnabled, visiblePuzzleSummaries]);

  const totalHintCredits = Math.max(
    0,
    launchConfig.defaultHintCredits + earnedHintCredits,
  );
  const remainingHintCredits = Math.max(0, totalHintCredits - hintCount);
  const hintBalance: HintBalance = {
    adsEnabled: launchConfig.rewardedHintAdsEnabled,
    defaultCredits: launchConfig.defaultHintCredits,
    earnedCredits: earnedHintCredits,
    isAdBusy: rewardedAdStatus === "loading",
    notice: hintNotice,
    remaining: remainingHintCredits,
    rewardedCredits: launchConfig.rewardedHintCredits,
    total: totalHintCredits,
    used: hintCount,
  };
  const bonusPuzzlePanelState: BonusPuzzlePanelState = {
    adsEnabled: launchConfig.rewardedBonusPuzzleAdsEnabled,
    candidateSummary: bonusCandidateSummary,
    isAdBusy: bonusAdStatus === "loading",
    notice: bonusNotice,
    status:
      loadState === "loading"
        ? "loading"
        : activeBonusUnlock != null && unlockedBonusSummary != null
          ? completedPuzzleIds.has(activeBonusUnlock.puzzleId)
            ? "used"
            : "unlocked"
          : bonusCandidateSummary != null
            ? "available"
            : "waiting",
    unlockedSummary: unlockedBonusSummary,
  };

  useEffect(() => {
    if (hintToast.message === "") {
      return;
    }

    const toastId = hintToast.id;
    const timerId = window.setTimeout(() => {
      setHintToast((prev) =>
        prev.id === toastId ? { id: prev.id, message: "" } : prev,
      );
    }, 2200);

    return () => window.clearTimeout(timerId);
  }, [hintToast]);

  useEffect(() => {
    telemetry.screen(route, {
      date: puzzle.date,
      puzzle_id: puzzle.puzzleId,
    });
  }, [puzzle.date, puzzle.puzzleId, route]);

  useEffect(() => {
    if (!viewModel.isComplete || mission.completedAt != null) {
      return;
    }

    const nextMission = completeMission(mission);
    setMission(nextMission);
    void missionRepository.saveMission(nextMission);
    void savePuzzleSnapshot(puzzle, { completedAt: nextMission.completedAt });
    telemetry.impression("mission_complete", {
      ...puzzleTelemetryParams,
      attempt_number: nextMission.attemptsUsed,
      completed_word_count: viewModel.completedEntries.length,
      completed_at: nextMission.completedAt,
      elapsed_seconds: getElapsedSeconds(
        nextMission.lastStartedAt,
        nextMission.completedAt,
      ),
      earned_hint_credits: earnedHintCredits,
      hint_count: hintCount,
      remaining_attempts: getRemainingAttempts(nextMission),
    });

    if (route === "today") {
      // Mark this as a genuine just-completed run so the result screen can
      // show the interstitial only here, not when re-opening past records.
      justCompletedPuzzleIdRef.current = puzzle.puzzleId;
      // Stay on the board and celebrate instead of jumping straight to the
      // result screen, letting the player choose when to leave.
      setCompletionCelebrationId(puzzle.puzzleId);
    }
  }, [
    earnedHintCredits,
    hintCount,
    mission,
    puzzle,
    puzzleTelemetryParams,
    savePuzzleSnapshot,
    route,
    viewModel.completedEntries.length,
    viewModel.isComplete,
  ]);

  useEffect(() => {
    if (
      route !== "result" ||
      !isCompleted ||
      !launchConfig.resultInterstitialAdsEnabled ||
      // Only after a genuine completion in this session; re-opening a finished
      // puzzle from 기록/홈 must not trigger a meaningless interstitial.
      justCompletedPuzzleIdRef.current !== puzzle.puzzleId ||
      shownResultInterstitialRef.current === puzzle.puzzleId
    ) {
      return;
    }

    shownResultInterstitialRef.current = puzzle.puzzleId;
    const timerId = window.setTimeout(() => {
      void showResultInterstitialAd((event) => {
        telemetry.impression("result_interstitial_ad_event", {
          phase: event.phase,
          puzzle_id: puzzle.puzzleId,
          type: event.type,
        });
      }).then((result) => {
        telemetry.impression("result_interstitial_ad_result", {
          puzzle_id: puzzle.puzzleId,
          status: result.status,
        });
      });
    }, 800);

    return () => window.clearTimeout(timerId);
  }, [
    isCompleted,
    launchConfig.resultInterstitialAdsEnabled,
    puzzle.puzzleId,
    route,
  ]);

  function navigate(nextRoute: AppRoute, options: { replace?: boolean } = {}) {
    const path = getPathForRoute(nextRoute);
    if (window.location.pathname !== path) {
      if (options.replace) {
        window.history.replaceState(null, "", path);
      } else {
        window.history.pushState(null, "", path);
      }
    }

    setRoute(nextRoute);
  }

  function selectEntry(
    entry: PuzzleEntry,
    cellKey = getEntryStartCellKey(entry),
  ) {
    setSelectedEntryId(entry.id);
    setSelectedDirection(entry.direction);
    setSelectedCellKey(cellKey);
  }

  function selectCell(row: number, col: number) {
    const key = getCellKey(row, col);
    const entries = viewModel.cellEntries.get(key) ?? [];

    if (entries.length === 0) {
      return;
    }

    const currentEntry = entries.find(
      (entry) => entry.id === viewModel.selectedEntry?.id,
    );

    // Tapping the already-selected crossing cell toggles 가로/세로 so users can
    // switch directions at an intersection without hunting for the clue list.
    if (key === selectedCellKey && currentEntry != null && entries.length > 1) {
      const toggledEntry =
        entries.find((entry) => entry.id !== currentEntry.id) ?? currentEntry;
      selectEntry(toggledEntry, key);
      return;
    }

    const nextEntry =
      currentEntry ??
      entries.find((entry) => entry.direction === selectedDirection) ??
      entries[0];

    selectEntry(nextEntry, key);
  }

  function trackFirstAnswerInput(
    entry: PuzzleEntry,
    inputLength: number,
    source: "debug" | "manual",
  ) {
    if (source === "manual" && inputLength > 0) {
      const firstInputKey = `${puzzle.puzzleId}:${mission.attemptsUsed}`;

      if (!firstAnswerInputKeysRef.current.has(firstInputKey)) {
        firstAnswerInputKeysRef.current.add(firstInputKey);
        telemetry.impression("first_answer_input", {
          ...puzzleTelemetryParams,
          answer_length: entry.answer.length,
          attempt_number: mission.attemptsUsed,
          elapsed_seconds: getElapsedSeconds(mission.lastStartedAt),
          entry_direction: entry.direction,
          entry_id: entry.id,
          hint_count: hintCount,
          remaining_attempts: remainingAttempts,
        });
      }
    }
  }

  function scheduleNextUncompletedEntry(
    currentEntry: PuzzleEntry,
    cellValuesSnapshot: Record<string, string>,
  ) {
    setTimeout(() => {
      const nextUncompleted = getNearestUncompletedEntry(
        puzzle.entries,
        cellValuesSnapshot,
        currentEntry,
      );

      if (nextUncompleted != null) {
        selectEntry(nextUncompleted);
      }
    }, 150);
  }

  function applyAnswer(
    entry: PuzzleEntry,
    value: string,
    source: "debug" | "manual" = "manual",
  ) {
    const cells = getEntryCells(entry);
    const nextLetters = getAnswerInputLetters(value, cells.length);
    const nextValues = { ...cellValues };

    trackFirstAnswerInput(entry, nextLetters.length, source);

    cells.forEach((cell, index) => {
      const key = getCellKey(cell.row, cell.col);
      const nextLetter = nextLetters[index];

      if (nextLetter == null) {
        delete nextValues[key];
      } else {
        nextValues[key] = nextLetter;
      }
    });

    setCellValues(nextValues);

    if (nextLetters.length === cells.length) {
      scheduleNextUncompletedEntry(entry, nextValues);
    }
  }

  function applyAnswerSegment(
    entry: PuzzleEntry,
    value: string,
    startCellKey = selectedCellKey,
    source: "debug" | "manual" = "manual",
  ) {
    const cells = getEntryCells(entry);
    const startIndex = getEntryCellIndex(entry, startCellKey);
    const nextLetters = getAnswerInputLetters(value, cells.length - startIndex);

    if (nextLetters.length === 0) {
      return;
    }

    const nextValues = { ...cellValues };

    trackFirstAnswerInput(entry, nextLetters.length, source);

    nextLetters.forEach((letter, offset) => {
      const cell = cells[startIndex + offset];

      if (cell != null) {
        nextValues[getCellKey(cell.row, cell.col)] = letter;
      }
    });

    setCellValues(nextValues);
    setSelectedCellKey(
      getNextAnswerSlotCellKey(
        entry,
        nextValues,
        startIndex,
        nextLetters.length,
      ),
    );

    if (isEntryFilled(entry, nextValues)) {
      scheduleNextUncompletedEntry(entry, nextValues);
    }
  }

  function clearAnswerCell(entry: PuzzleEntry, cellKey = selectedCellKey) {
    const cells = getEntryCells(entry);
    const selectedIndex = getEntryCellIndex(entry, cellKey);
    const isDeletable = (index: number) => {
      const cell = cells[index];
      if (cell == null) {
        return false;
      }
      const key = getCellKey(cell.row, cell.col);
      return cellValues[key] != null && !isCellLocked(puzzle, cellValues, key);
    };
    // Delete the caret cell if it holds an editable letter; otherwise step back
    // to the nearest editable filled cell, skipping locked (correct) letters so
    // the caret is never trapped on one.
    let targetIndex = isDeletable(selectedIndex) ? selectedIndex : -1;
    if (targetIndex === -1) {
      for (let index = selectedIndex - 1; index >= 0; index -= 1) {
        if (isDeletable(index)) {
          targetIndex = index;
          break;
        }
      }
    }

    if (targetIndex === -1) {
      // Nothing editable to delete before the caret; leave it where it is.
      setSelectedCellKey(getEntryCellKeyAt(entry, selectedIndex));
      return;
    }

    const targetKey = getEntryCellKeyAt(entry, targetIndex);
    const nextValues = { ...cellValues };

    delete nextValues[targetKey];
    setCellValues(nextValues);
    setSelectedCellKey(targetKey);
  }

  function clearEntryAnswer(entry: PuzzleEntry) {
    const nextValues = { ...cellValues };

    for (const cell of getEntryCells(entry)) {
      const key = getCellKey(cell.row, cell.col);

      // Leave already-correct (locked) letters so a wrong-cell wipe keeps them.
      if (!isCellLocked(puzzle, cellValues, key)) {
        delete nextValues[key];
      }
    }

    setCellValues(nextValues);
    setSelectedCellKey(getEntryStartCellKey(entry));
  }

  function revealLetter() {
    const selectedEntry = viewModel.selectedEntry;
    if (selectedEntry == null) {
      return false;
    }

    if (remainingHintCredits === 0) {
      setHintNotice(
        "무료 힌트를 모두 썼어요. 광고를 보면 힌트를 더 받을 수 있어요.",
      );
      return false;
    }

    const cells = getEntryCells(selectedEntry);
    const answerLetters = [...selectedEntry.answer];
    const targetIndex = cells.findIndex(
      (cell, index) =>
        cellValues[getCellKey(cell.row, cell.col)] !== answerLetters[index],
    );

    if (targetIndex === -1) {
      setHintNotice("선택한 단어는 이미 모두 채워졌어요.");
      return false;
    }

    const targetCell = cells[targetIndex];
    setHintCount((prev) => prev + 1);
    setCellValues((prev) => ({
      ...prev,
      [getCellKey(targetCell.row, targetCell.col)]: answerLetters[targetIndex],
    }));
    setHintNotice(
      `힌트 1개를 사용했어요. 남은 힌트 ${remainingHintCredits - 1}개`,
    );
    telemetry.click("hint_reveal", {
      hint_remaining_after: remainingHintCredits - 1,
      hint_used: hintCount + 1,
      puzzle_id: puzzle.puzzleId,
    });
    return true;
  }

  function showHintToast(message: string) {
    setHintToast((prev) => ({ id: prev.id + 1, message }));
  }

  async function requestRewardedHint() {
    if (!launchConfig.rewardedHintAdsEnabled) {
      const message = "지금은 광고 힌트를 사용할 수 없어요.";
      setHintNotice(message);
      showHintToast(message);
      telemetry.click("rewarded_hint_ad_disabled", {
        puzzle_id: puzzle.puzzleId,
      });
      return;
    }

    if (rewardedAdStatus === "loading") {
      return;
    }

    setRewardedAdStatus("loading");
    setHintNotice("광고를 준비하는 중이에요.");
    telemetry.click("rewarded_hint_ad_request", {
      puzzle_id: puzzle.puzzleId,
      rewarded_hint_credits: launchConfig.rewardedHintCredits,
    });

    const result = await showRewardedHintAd((event) => {
      telemetry.impression("rewarded_hint_ad_event", {
        phase: event.phase,
        puzzle_id: puzzle.puzzleId,
        type: event.type,
      });
    });
    telemetry.impression("rewarded_hint_ad_result", {
      ...getFullScreenAdResultParams(result),
      puzzle_id: puzzle.puzzleId,
    });

    if (result.status === "rewarded") {
      setEarnedHintCredits((prev) => prev + launchConfig.rewardedHintCredits);
      const message = `힌트 +${launchConfig.rewardedHintCredits}개가 추가됐어요.`;
      setHintNotice(message);
      showHintToast(message);
      telemetry.impression("rewarded_hint_ad_reward", {
        puzzle_id: puzzle.puzzleId,
        rewarded_hint_credits: launchConfig.rewardedHintCredits,
      });
    } else {
      const message = getRewardedHintFailureMessage(result);
      setHintNotice(message);
      showHintToast(message);
    }

    setRewardedAdStatus("idle");
  }

  function useHintOrRequestReward() {
    if (remainingHintCredits > 0) {
      revealLetter();
      return;
    }

    setIsRewardedHintPromptOpen(true);
  }

  function cancelRewardedHintPrompt() {
    setIsRewardedHintPromptOpen(false);
    telemetry.click("rewarded_hint_ad_cancel", {
      puzzle_id: puzzle.puzzleId,
    });
  }

  function confirmRewardedHintPrompt() {
    setIsRewardedHintPromptOpen(false);
    void requestRewardedHint();
  }

  async function openBonusPuzzle(summary: PuzzleManifestItem) {
    const session = await loadPuzzleSession(summary.puzzleId);

    if (session == null) {
      setBonusNotice("보너스 퍼즐을 불러오지 못했어요.");
      telemetry.click("bonus_puzzle_open", {
        puzzle_id: summary.puzzleId,
        status: "missing",
      });
      return;
    }

    const alreadyStarted = hasSavedProgress(
      session.savedMission,
      session.savedProgress,
    );
    let nextMission = session.savedMission;

    if (
      !alreadyStarted &&
      nextMission.completedAt == null &&
      getRemainingAttempts(nextMission) > 0
    ) {
      nextMission = startMissionAttempt(nextMission);
      void missionRepository.saveMission(nextMission);
      telemetry.impression("mission_start", {
        ...getPuzzleTelemetryParams(session.nextPuzzle),
        attempt_number: nextMission.attemptsUsed,
        earned_hint_credits: session.savedProgress.earnedHintCredits,
        hint_count: session.savedProgress.hintCount,
        remaining_attempts: getRemainingAttempts(nextMission),
        started_at: nextMission.lastStartedAt,
      });
      telemetry.impression("attempt_start", {
        ...getPuzzleTelemetryParams(session.nextPuzzle),
        attempt_kind: "first",
        attempt_number: nextMission.attemptsUsed,
        earned_hint_credits: session.savedProgress.earnedHintCredits,
        hint_count: session.savedProgress.hintCount,
        remaining_attempts: getRemainingAttempts(nextMission),
        started_at: nextMission.lastStartedAt,
      });
    }

    await savePuzzleSnapshot(session.nextPuzzle, {
      completedAt: nextMission.completedAt,
      startedAt: nextMission.lastStartedAt,
    });
    applyPuzzleSession(session, { mission: nextMission });
    navigate(nextMission.completedAt == null ? "today" : "result");
    telemetry.click("bonus_puzzle_open", {
      ...getPuzzleTelemetryParams(session.nextPuzzle),
      status: "loaded",
    });
  }

  async function requestBonusPuzzle() {
    const unlockedSummary = bonusPuzzlePanelState.unlockedSummary;

    if (
      bonusPuzzlePanelState.status === "unlocked" ||
      bonusPuzzlePanelState.status === "used"
    ) {
      if (unlockedSummary != null) {
        await openBonusPuzzle(unlockedSummary);
      }
      return;
    }

    const candidateSummary = bonusPuzzlePanelState.candidateSummary;

    if (
      candidateSummary == null ||
      bonusPuzzlePanelState.status !== "available"
    ) {
      setBonusNotice("다음 보너스 퍼즐을 준비 중이에요.");
      return;
    }

    if (!launchConfig.rewardedBonusPuzzleAdsEnabled) {
      setBonusNotice("지금은 보너스 퍼즐 광고를 사용할 수 없어요.");
      telemetry.click("rewarded_bonus_puzzle_ad_disabled", {
        puzzle_id: candidateSummary.puzzleId,
      });
      return;
    }

    if (bonusAdStatus === "loading") {
      return;
    }

    setBonusAdStatus("loading");
    setBonusNotice("광고를 준비하는 중이에요.");
    telemetry.click("rewarded_bonus_puzzle_ad_request", {
      puzzle_id: candidateSummary.puzzleId,
    });

    const result = await showRewardedBonusPuzzleAd((event) => {
      telemetry.impression("rewarded_bonus_puzzle_ad_event", {
        phase: event.phase,
        puzzle_id: candidateSummary.puzzleId,
        type: event.type,
      });
    });
    telemetry.impression("rewarded_bonus_puzzle_ad_result", {
      ...getFullScreenAdResultParams(result),
      puzzle_id: candidateSummary.puzzleId,
    });

    if (result.status === "rewarded") {
      const nextUnlock = {
        date: todayKey,
        puzzleId: candidateSummary.puzzleId,
        unlockedAt: new Date().toISOString(),
      };

      await bonusPuzzleUnlockRepository.saveUnlock(nextUnlock);
      setBonusPuzzleUnlock(nextUnlock);
      setBonusNotice("보너스 퍼즐이 열렸어요.");
      telemetry.impression("rewarded_bonus_puzzle_ad_reward", {
        puzzle_id: candidateSummary.puzzleId,
      });
      await openBonusPuzzle(candidateSummary);
    } else {
      setBonusNotice(getRewardedBonusPuzzleFailureMessage(result));
    }

    setBonusAdStatus("idle");
  }

  function revealSelected() {
    if (viewModel.selectedEntry != null) {
      applyAnswer(
        viewModel.selectedEntry,
        viewModel.selectedEntry.answer,
        "debug",
      );
    }
  }

  function revealAll() {
    const nextValues: Record<string, string> = {};

    for (const entry of puzzle.entries) {
      getEntryCells(entry).forEach((cell, index) => {
        nextValues[getCellKey(cell.row, cell.col)] = [...entry.answer][index];
      });
    }

    setCellValues(nextValues);
  }

  function clearProgress() {
    setCellValues({});
    setEarnedHintCredits(0);
    setHintCount(0);
    setHintNotice("");
    setHintToast({ id: 0, message: "" });
    setSelectedDirection("across");
    setSelectedEntryId(getInitialEntryId(puzzle));
    setSelectedCellKey(getInitialEntryStartCellKey(puzzle));
    void progressRepository.clearProgress(puzzle.puzzleId);
  }

  function trackMissionStart(nextMission: DailyMissionState) {
    telemetry.impression("mission_start", {
      ...puzzleTelemetryParams,
      attempt_number: nextMission.attemptsUsed,
      earned_hint_credits: earnedHintCredits,
      hint_count: hintCount,
      remaining_attempts: getRemainingAttempts(nextMission),
      started_at: nextMission.lastStartedAt,
    });
  }

  function trackAttemptStart(
    nextMission: DailyMissionState,
    attemptKind: "first" | "retry",
    progressSnapshot = {
      earnedHintCredits,
      hintCount,
    },
  ) {
    telemetry.impression("attempt_start", {
      ...puzzleTelemetryParams,
      attempt_kind: attemptKind,
      attempt_number: nextMission.attemptsUsed,
      earned_hint_credits: progressSnapshot.earnedHintCredits,
      hint_count: progressSnapshot.hintCount,
      remaining_attempts: getRemainingAttempts(nextMission),
      started_at: nextMission.lastStartedAt,
    });
  }

  function startOrResumeMission() {
    if (loadState === "loading") {
      return;
    }

    if (isCompleted) {
      void savePuzzleSnapshot(puzzle, { completedAt: mission.completedAt });
      navigate("result");
      return;
    }

    if (!hasStarted) {
      if (remainingAttempts === 0) {
        return;
      }

      const nextMission = startMissionAttempt(mission);
      setMission(nextMission);
      void missionRepository.saveMission(nextMission);
      void savePuzzleSnapshot(puzzle, { startedAt: nextMission.lastStartedAt });
      trackMissionStart(nextMission);
      trackAttemptStart(nextMission, "first");
    }

    navigate("today");
  }

  function restartMissionAttempt() {
    if (remainingAttempts === 0) {
      return;
    }

    clearProgress();
    const nextMission = startMissionAttempt(mission);
    setMission(nextMission);
    void missionRepository.saveMission(nextMission);
    void savePuzzleSnapshot(puzzle, { startedAt: nextMission.lastStartedAt });
    trackAttemptStart(nextMission, "retry", {
      earnedHintCredits: 0,
      hintCount: 0,
    });
    navigate("today");
  }

  const commonScreenProps = {
    applyAnswer,
    applyAnswerSegment,
    cellValues,
    clearAnswerCell,
    clearEntryAnswer,
    clueEntries: viewModel.clueEntries,
    completedEntries: viewModel.completedEntries,
    hintBalance,
    hintCount,
    hintToastMessage: hintToast.message,
    mission,
    puzzle,
    remainingAttempts,
    requestRewardedHint,
    revealLetter,
    selectedAnswer: viewModel.selectedAnswer,
    selectedCellKey,
    selectedDirection,
    selectedEntry: viewModel.selectedEntry,
    setSelectedDirection,
    selectCell,
    selectEntry,
    startLabels: viewModel.startLabels,
    useHint: useHintOrRequestReward,
    viewModel,
  };
  const dateSelectionProps = {
    completionStatsByPuzzleId,
    completionStatsMinDisplayCount: launchConfig.completionStatsMinDisplayCount,
    dateCardStates,
    loadState,
    puzzleSummaries: visiblePuzzleSummaries,
    selectedPuzzleId: puzzle.puzzleId,
    selectPuzzle,
  };

  if (route === "dev-simulator") {
    return (
      <DevSimulatorScreen
        {...commonScreenProps}
        {...dateSelectionProps}
        clearProgress={clearProgress}
        hasStarted={hasStarted}
        isCompleted={isCompleted}
        navigate={navigate}
        revealAll={revealAll}
        revealSelected={revealSelected}
        startOrResumeMission={startOrResumeMission}
      />
    );
  }

  return (
    <main
      className={["appShell", route === "today" ? "appShellToday" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {route === "today" ? (
        <TodayScreen
          {...commonScreenProps}
          {...dateSelectionProps}
          completionCelebrationId={completionCelebrationId}
          dismissCompletionCelebration={() => setCompletionCelebrationId(null)}
          hasStarted={hasStarted}
          isCompleted={isCompleted}
          navigate={navigate}
          startOrResumeMission={startOrResumeMission}
        />
      ) : route === "result" ? (
        <ResultScreen
          {...dateSelectionProps}
          bonusPuzzlePanelState={bonusPuzzlePanelState}
          hintCount={hintCount}
          mission={mission}
          navigate={navigate}
          progressPercent={progressPercent}
          puzzle={puzzle}
          remainingAttempts={remainingAttempts}
          requestBonusPuzzle={() => void requestBonusPuzzle()}
          restartMissionAttempt={restartMissionAttempt}
          completedEntries={viewModel.completedEntries}
        />
      ) : route === "history" ? (
        <HistoryScreen
          {...dateSelectionProps}
          archiveRecords={puzzleArchiveRecords}
          completedEntries={viewModel.completedEntries}
          hintCount={hintCount}
          isCompleted={isCompleted}
          mission={mission}
          navigate={navigate}
          progressPercent={progressPercent}
          puzzle={puzzle}
          remainingAttempts={remainingAttempts}
          startOrResumeMission={startOrResumeMission}
        />
      ) : route === "license" ? (
        <LicenseScreen navigate={navigate} />
      ) : (
        <HomeScreen
          {...dateSelectionProps}
          bonusPuzzlePanelState={bonusPuzzlePanelState}
          completedEntries={viewModel.completedEntries}
          hasStarted={hasStarted}
          hintBalance={hintBalance}
          isCompleted={isCompleted}
          launchConfig={launchConfig}
          mission={mission}
          navigate={navigate}
          progressPercent={progressPercent}
          puzzle={puzzle}
          remainingAttempts={remainingAttempts}
          requestBonusPuzzle={() => void requestBonusPuzzle()}
          requestRewardedHint={requestRewardedHint}
          selectedEntry={viewModel.selectedEntry}
          startLabels={viewModel.startLabels}
          startOrResumeMission={startOrResumeMission}
        />
      )}
      {isRewardedHintPromptOpen ? (
        <RewardedHintConfirmDialog
          credits={launchConfig.rewardedHintCredits}
          isLoading={rewardedAdStatus === "loading"}
          onCancel={cancelRewardedHintPrompt}
          onConfirm={confirmRewardedHintPrompt}
        />
      ) : null}
    </main>
  );
}

type RewardedHintConfirmDialogProps = {
  credits: number;
  isLoading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function RewardedHintConfirmDialog({
  credits,
  isLoading,
  onCancel,
  onConfirm,
}: RewardedHintConfirmDialogProps) {
  return (
    <div className="rewardDialogScrim" onClick={onCancel}>
      <section
        className="rewardDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rewardDialogTitle"
        aria-describedby="rewardDialogDescription"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rewardDialogText">
          <h2 id="rewardDialogTitle">힌트를 받을까요?</h2>
          <p id="rewardDialogDescription">
            광고 시청을 완료하면 힌트 +{credits}개가 추가돼요.
          </p>
        </div>
        <div className="rewardDialogActions">
          <button className="secondaryButton" type="button" onClick={onCancel}>
            취소
          </button>
          <button
            className="primaryButton"
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            autoFocus
          >
            {isLoading ? "준비 중" : "광고 보기"}
          </button>
        </div>
      </section>
    </div>
  );
}

function usePuzzleViewModel(
  puzzle: Puzzle,
  selectedEntryId: string,
  selectedDirection: Direction,
  cellValues: Record<string, string>,
): PuzzleViewModel {
  const bounds = useMemo(() => getBounds(puzzle), [puzzle]);
  const selectedEntry = useMemo(
    () =>
      puzzle.entries.find((entry) => entry.id === selectedEntryId) ??
      puzzle.entries[0],
    [puzzle.entries, selectedEntryId],
  );
  const selectedCells = useMemo(
    () =>
      selectedEntry == null
        ? new Set<string>()
        : new Set(
            getEntryCells(selectedEntry).map((cell) =>
              getCellKey(cell.row, cell.col),
            ),
          ),
    [selectedEntry],
  );
  const cellEntries = useMemo(
    () => buildCellEntries(puzzle.entries),
    [puzzle.entries],
  );
  const startLabels = useMemo(
    () => buildStartLabels(puzzle.entries),
    [puzzle.entries],
  );
  const slotValidation = useMemo(() => validatePuzzleSlots(puzzle), [puzzle]);
  const completedEntries = useMemo(
    () => getCompletedEntries(puzzle.entries, cellValues),
    [cellValues, puzzle.entries],
  );
  const reviewEntries = useMemo(
    () => buildReviewEntries(puzzle.entries, cellEntries),
    [cellEntries, puzzle.entries],
  );
  const selectedAnswer = useMemo(() => {
    if (selectedEntry == null) {
      return "";
    }

    return getEntryAnswerValue(selectedEntry, cellValues);
  }, [cellValues, selectedEntry]);
  const rows = useMemo(
    () =>
      Array.from(
        { length: bounds.maxRow - bounds.minRow + 1 },
        (_, index) => bounds.minRow + index,
      ),
    [bounds.maxRow, bounds.minRow],
  );
  const cols = useMemo(
    () =>
      Array.from(
        { length: bounds.maxCol - bounds.minCol + 1 },
        (_, index) => bounds.minCol + index,
      ),
    [bounds.maxCol, bounds.minCol],
  );
  const clueEntries = useMemo(
    () =>
      puzzle.entries.filter((entry) => entry.direction === selectedDirection),
    [puzzle.entries, selectedDirection],
  );

  return {
    bounds,
    cellEntries,
    clueEntries,
    completedEntries,
    cols,
    isComplete: completedEntries.length === puzzle.entries.length,
    reviewEntries,
    rows,
    selectedAnswer,
    selectedCells,
    selectedEntry,
    slotValidation,
    startLabels,
  };
}

type HomeScreenProps = DateSelectionProps & {
  bonusPuzzlePanelState: BonusPuzzlePanelState;
  completedEntries: PuzzleEntry[];
  hasStarted: boolean;
  hintBalance: HintBalance;
  isCompleted: boolean;
  launchConfig: LaunchConfig;
  mission: DailyMissionState;
  navigate: (route: AppRoute) => void;
  progressPercent: number;
  puzzle: Puzzle;
  remainingAttempts: number;
  requestBonusPuzzle: () => void;
  requestRewardedHint: () => void;
  selectedEntry?: PuzzleEntry;
  startLabels: Map<string, number>;
  startOrResumeMission: () => void;
};

function HomeScreen({
  bonusPuzzlePanelState,
  completedEntries,
  completionStatsByPuzzleId,
  completionStatsMinDisplayCount,
  dateCardStates,
  hasStarted,
  hintBalance,
  isCompleted,
  launchConfig,
  loadState,
  mission,
  navigate,
  progressPercent,
  puzzle,
  puzzleSummaries,
  remainingAttempts,
  requestBonusPuzzle,
  requestRewardedHint,
  selectedEntry,
  selectedPuzzleId,
  selectPuzzle,
  startLabels,
  startOrResumeMission,
}: HomeScreenProps) {
  const [isPackInfoOpen, setIsPackInfoOpen] = useState(false);
  const isLoadingPuzzlePack = loadState === "loading";
  const primaryLabel = isLoadingPuzzlePack
    ? "불러오는 중"
    : isCompleted
      ? "결과 보기"
      : hasStarted
        ? "이어 풀기"
        : remainingAttempts > 0
          ? "미션 시작"
          : "내일 다시";
  const missionStatusLabel = isLoadingPuzzlePack
    ? "퍼즐팩을 확인하고 있어요"
    : isCompleted
      ? "완료"
      : hasStarted
        ? `${progressPercent}% 진행 중`
        : "도전 준비 완료";
  const completionStatsLabel = formatCompletionStatsLabel(
    completionStatsByPuzzleId[puzzle.puzzleId],
    completionStatsMinDisplayCount,
  );
  const isPrimaryDisabled =
    isLoadingPuzzlePack ||
    (!isCompleted && !hasStarted && remainingAttempts === 0);
  const missionLeadLabel = isLoadingPuzzlePack ? "원격 퍼즐팩" : "선택한 미션";
  const missionHeadline = isLoadingPuzzlePack
    ? "불러오는 중"
    : `${puzzle.entries.length}개 낱말`;
  const missionDescription = isLoadingPuzzlePack
    ? "최신 퍼즐 목록을 가져오는 중이에요"
    : missionStatusLabel;
  const packInfoPanelTitle =
    loadState === "remote"
      ? "하루 1개 기본 공개"
      : loadState === "loading"
        ? "원격 퍼즐팩 확인 중"
        : "기기저장 기본 퍼즐";
  const packInfoPanelDescription =
    loadState === "remote"
      ? `${launchConfig.puzzleGenerationIntervalHours}시간마다 생성된 퍼즐은 최근 ${launchConfig.puzzleKeepCount}개까지 유지해요. 홈에는 하루 1개씩 최근 ${launchConfig.visiblePuzzleCount}일치 무료 퍼즐과 해금된 보너스, 기기에 저장된 기록을 함께 보여줘요.`
      : loadState === "loading"
        ? "원격 퍼즐팩이 준비되면 최신 퍼즐 목록으로 바뀝니다."
        : "원격 퍼즐팩을 사용할 수 없을 때 기기에 포함된 기본 퍼즐을 보여줘요.";

  return (
    <>
      <Top
        title="가로세로 낱말 퍼즐"
        subtitleBottom={`${formatMissionDateLabel(mission.date, loadState)} · 🔥 5일째 도전 중`}
      />

      <DateCarousel
        completionStatsByPuzzleId={completionStatsByPuzzleId}
        completionStatsMinDisplayCount={completionStatsMinDisplayCount}
        dateCardStates={dateCardStates}
        loadState={loadState}
        puzzleSummaries={puzzleSummaries}
        selectedPuzzleId={selectedPuzzleId}
        selectPuzzle={selectPuzzle}
      />

      <div className="packInfoRow">
        <span>{formatPackInfoLabel(loadState, puzzleSummaries.length)}</span>
        <button
          className="infoButton"
          type="button"
          aria-expanded={isPackInfoOpen}
          aria-label="퍼즐 생성 주기 안내"
          onClick={() => setIsPackInfoOpen((prev) => !prev)}
        >
          i
        </button>
      </div>

      {isPackInfoOpen ? (
        <section className="packInfoPanel" aria-label="퍼즐 생성 주기">
          <strong>{packInfoPanelTitle}</strong>
          <span>{packInfoPanelDescription}</span>
        </section>
      ) : null}

      <section className="todayMission" aria-label="선택한 미션">
        <div className="missionLead">
          <Paragraph typography="t5" color="#00866f" fontWeight="bold">
            {missionLeadLabel}
          </Paragraph>
          <Paragraph typography="t2" fontWeight="bold">
            {missionHeadline}
          </Paragraph>
          <Paragraph typography="t6" color="#4e5968">
            {missionDescription}
            {isLoadingPuzzlePack || completionStatsLabel === ""
              ? ""
              : ` · ${completionStatsLabel}`}
          </Paragraph>
        </div>

        <MiniPuzzlePreview puzzle={puzzle} />

        <div className="attemptStrip" aria-label="도전 상태">
          <div>
            <Paragraph typography="t7" color="#6b7684">
              남은 도전
            </Paragraph>
            <Paragraph typography="t5" fontWeight="bold">
              {remainingAttempts}/{mission.maxAttempts}
            </Paragraph>
          </div>
          <div>
            <Paragraph typography="t7" color="#6b7684">
              완료
            </Paragraph>
            <Paragraph typography="t5" fontWeight="bold">
              {completedEntries.length}/{puzzle.entries.length}
            </Paragraph>
          </div>
          <div>
            <Paragraph typography="t7" color="#6b7684">
              힌트 남음
            </Paragraph>
            <Paragraph typography="t5" fontWeight="bold">
              {hintBalance.remaining}/{hintBalance.total}
            </Paragraph>
          </div>
        </div>

        <div
          className="progressTrack"
          aria-label={`진행률 ${progressPercent}%`}
        >
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      </section>

      <button
        className="cluePeek"
        type="button"
        onClick={startOrResumeMission}
        disabled={isPrimaryDisabled}
      >
        <span>
          {isLoadingPuzzlePack
            ? "원격 퍼즐팩"
            : selectedEntry == null
              ? "대표 단서"
              : formatEntryReference(selectedEntry, startLabels)}
        </span>
        <strong>
          {isLoadingPuzzlePack
            ? "불러오는 중"
            : (selectedEntry?.clue ?? "단서 준비 중")}
        </strong>
      </button>

      <HintRewardPanel
        hintBalance={hintBalance}
        requestRewardedHint={requestRewardedHint}
      />

      <BonusPuzzlePanel
        state={bonusPuzzlePanelState}
        onAction={requestBonusPuzzle}
      />

      <section className="homeList" aria-label="진행 정보">
        <button
          type="button"
          onClick={() => navigate(isCompleted ? "result" : "today")}
        >
          <div>
            <strong>{isCompleted ? "미션 결과" : "퍼즐 풀이"}</strong>
            <span>
              {isCompleted ? "완료됨" : hasStarted ? "이어가기" : "시작 전"}
            </span>
          </div>
          <em>{isCompleted ? "보기" : "열기"}</em>
        </button>
        <button type="button" onClick={() => navigate("history")}>
          <div>
            <strong>미션 기록</strong>
            <span>{mission.attemptsUsed}번 도전</span>
          </div>
          <em>보기</em>
        </button>
      </section>

      <section className="sourceNotice" aria-label="힌트 출처 안내">
        <span>{contentSourceNotice}</span>
        <button type="button" onClick={() => navigate("license")}>
          출처/라이선스
        </button>
      </section>

      <div className="fixedBottom homeBottomAction">
        <Button
          size="large"
          display="full"
          type="button"
          disabled={isPrimaryDisabled}
          onClick={
            isCompleted ? () => navigate("result") : startOrResumeMission
          }
        >
          {primaryLabel}
        </Button>
      </div>
    </>
  );
}

type LicenseScreenProps = {
  navigate: (route: AppRoute) => void;
};

function LicenseScreen({ navigate }: LicenseScreenProps) {
  return (
    <>
      <AppHeader
        eyebrow="콘텐츠 출처"
        title="출처/라이선스"
        onBack={() => navigate("home")}
      />

      <section className="licensePanel" aria-label="힌트 출처 및 라이선스">
        <div>
          <span>힌트 출처</span>
          <p>{contentSourceNotice}</p>
        </div>
        <div>
          <span>라이선스</span>
          <p>{contentSourceLicense}</p>
        </div>
        <div>
          <span>퍼즐 구성</span>
          <p>
            퍼즐 격자와 날짜별 미션 구성은 앱에서 자체 생성하며, 기존 퍼즐
            문제나 격자를 복제하지 않습니다.
          </p>
        </div>
      </section>

      <section className="licenseLinks" aria-label="라이선스 링크">
        <a href={krdictCopyrightUrl} target="_blank" rel="noreferrer">
          한국어기초사전 저작권 정책
        </a>
        <a href={ccBySaKrUrl} target="_blank" rel="noreferrer">
          CC BY-SA 2.0 KR
        </a>
      </section>
    </>
  );
}

type HintRewardPanelProps = {
  compact?: boolean;
  hintBalance: HintBalance;
  requestRewardedHint: () => void;
  useHint?: () => void;
};

function HintRewardPanel({
  compact = false,
  hintBalance,
  requestRewardedHint,
  useHint,
}: HintRewardPanelProps) {
  const adButtonLabel = hintBalance.isAdBusy
    ? "광고 준비 중"
    : `광고 보고 +${hintBalance.rewardedCredits}`;

  return (
    <section
      className={["hintRewardPanel", compact ? "hintRewardPanelCompact" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label="힌트 보유량"
    >
      <div>
        <span>힌트 보유</span>
        <strong>
          {hintBalance.remaining}/{hintBalance.total}개
        </strong>
        <em>
          기본 {hintBalance.defaultCredits}개
          {hintBalance.earnedCredits > 0
            ? ` · 광고 보상 ${hintBalance.earnedCredits}개`
            : ""}
        </em>
      </div>
      <div className="hintRewardActions">
        {useHint == null ? null : (
          <button
            className="secondaryButton"
            type="button"
            disabled={hintBalance.remaining === 0}
            onClick={useHint}
          >
            힌트 쓰기
          </button>
        )}
        <button
          className="primaryButton"
          type="button"
          disabled={!hintBalance.adsEnabled || hintBalance.isAdBusy}
          onClick={requestRewardedHint}
        >
          {adButtonLabel}
        </button>
      </div>
      {hintBalance.notice === "" ? null : <p>{hintBalance.notice}</p>}
    </section>
  );
}

type BonusPuzzlePanelProps = {
  onAction: () => void;
  state: BonusPuzzlePanelState;
};

function getBonusPuzzleMeta(summary?: PuzzleManifestItem) {
  if (summary == null) {
    return "";
  }

  const slotLabel = formatPuzzleCardSlot(summary);
  const wordCountLabel = `${summary.metrics?.wordCount ?? "-"}개 낱말`;

  return slotLabel === ""
    ? wordCountLabel
    : `${slotLabel} 도착 · ${wordCountLabel}`;
}

function BonusPuzzlePanel({ onAction, state }: BonusPuzzlePanelProps) {
  const summary = state.unlockedSummary ?? state.candidateSummary;
  const title =
    state.status === "available"
      ? "새 퍼즐이 도착했어요"
      : state.status === "unlocked"
        ? "보너스 퍼즐이 열려 있어요"
        : state.status === "used"
          ? "오늘의 보너스 퍼즐을 풀었어요"
          : state.status === "loading"
            ? "보너스 퍼즐 확인 중"
            : "다음 보너스 퍼즐을 준비 중이에요";
  const description =
    state.status === "available"
      ? `${getBonusPuzzleMeta(summary)} · 광고를 보면 하나 더 풀 수 있어요.`
      : state.status === "unlocked"
        ? `${getBonusPuzzleMeta(summary)} · 광고 없이 이어서 풀 수 있어요.`
        : state.status === "used"
          ? `${getBonusPuzzleMeta(summary)} · 기록에서 다시 볼 수 있어요.`
          : state.status === "loading"
            ? "원격 퍼즐팩을 확인하고 있어요."
            : "2시간 배치가 새 퍼즐을 발행하면 열 수 있어요.";
  const buttonLabel =
    state.status === "available"
      ? state.isAdBusy
        ? "광고 준비 중"
        : "광고 보고 하나 더 풀기"
      : state.status === "unlocked"
        ? "보너스 퍼즐 풀기"
        : state.status === "used"
          ? "결과 보기"
          : "";
  const canShowAction =
    state.status === "available" ||
    state.status === "unlocked" ||
    state.status === "used";
  const isActionDisabled =
    state.isAdBusy ||
    (state.status === "available" && !state.adsEnabled) ||
    summary == null;

  return (
    <section
      className={[
        "bonusPuzzlePanel",
        state.status === "available" ? "bonusPuzzlePanelAvailable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="보너스 퍼즐"
    >
      <div>
        <span>하나 더 풀기</span>
        <strong>{title}</strong>
        <em>{description}</em>
        {state.notice === "" ? null : <p>{state.notice}</p>}
      </div>
      {canShowAction ? (
        <button
          className="primaryButton"
          type="button"
          disabled={isActionDisabled}
          onClick={onAction}
        >
          {buttonLabel}
        </button>
      ) : null}
    </section>
  );
}

type MiniPuzzlePreviewProps = {
  puzzle: Puzzle;
};

function MiniPuzzlePreview({ puzzle }: MiniPuzzlePreviewProps) {
  const previewRows = puzzle.grid.slice(0, 7);

  return (
    <div className="miniBoard" aria-hidden="true">
      {previewRows.flatMap((row, rowIndex) =>
        row
          .slice(0, 7)
          .map((cell, colIndex) => (
            <span
              key={`${rowIndex}:${colIndex}`}
              className={cell === "" ? "miniCell miniBlock" : "miniCell"}
            />
          )),
      )}
    </div>
  );
}

function formatDateCardDay(date: string) {
  const [, month, day] = date.split("-");
  if (month == null || day == null) {
    return date;
  }

  return `${Number(month)}.${Number(day)}`;
}

function formatDateCardWeekday(date: string) {
  const value = new Date(`${date}T00:00:00`);
  if (Number.isNaN(value.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(value);
}

function formatGameHeaderDate(date: string) {
  const dayLabel = formatDateCardDay(date);
  const value = new Date(`${date}T00:00:00`);

  if (Number.isNaN(value.getTime())) {
    return dayLabel;
  }

  const weekday = new Intl.DateTimeFormat("ko-KR", {
    weekday: "long",
  }).format(value);

  return `${dayLabel} ${weekday}`;
}

function formatPuzzleSourceLabel(loadState: LoadState) {
  switch (loadState) {
    case "remote":
      return "원격 퍼즐팩";
    case "loading":
      return "원격 퍼즐팩 확인 중";
    case "fallback":
      return "기기저장 기본 퍼즐";
  }
}

function formatMissionDateLabel(date: string, loadState: LoadState) {
  switch (loadState) {
    case "remote":
      return date;
    case "loading":
      return "불러오는 중";
    case "fallback":
      return "기기저장";
  }
}

function formatPuzzleHeaderLabel(date: string, loadState: LoadState) {
  switch (loadState) {
    case "remote":
      return formatGameHeaderDate(date);
    case "loading":
      return "불러오는 중";
    case "fallback":
      return "기기저장 퍼즐";
  }
}

function formatPackInfoLabel(loadState: LoadState, puzzleCount: number) {
  switch (loadState) {
    case "remote":
      return puzzleCount > 1
        ? `최근 퍼즐 ${puzzleCount}개`
        : "오늘의 무료 퍼즐";
    case "loading":
      return "원격 퍼즐팩 불러오는 중";
    case "fallback":
      return `기기저장 기본 퍼즐 ${puzzleCount}개`;
  }
}

function formatFallbackCardTitle(index: number, puzzleCount: number) {
  return puzzleCount > 1 ? `기본 ${index + 1}` : "기본";
}

function formatPuzzleCardSlot(summary: PuzzleManifestItem) {
  if (summary.publishedAt == null) {
    return "";
  }

  const value = new Date(summary.publishedAt);
  if (Number.isNaN(value.getTime())) {
    return "";
  }

  const hour = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
    .formatToParts(value)
    .find((part) => part.type === "hour")?.value;

  return hour == null ? "" : `${Number(hour) % 24}시`;
}

function getDateCardStatus(state?: DateCardState) {
  if (state?.completedAt != null) {
    return "완료";
  }

  if (state?.hasProgress) {
    return "진행";
  }

  return "대기";
}

function formatCompletionStatsLabel(
  stats: PuzzleCompletionStats | undefined,
  minDisplayCount: number,
  variant: "compact" | "detail" = "detail",
) {
  if (stats == null) {
    return "";
  }

  const numberFormatter = new Intl.NumberFormat("ko-KR");
  const participantCount = stats.participantCount;

  if (participantCount != null) {
    if (participantCount === 0) {
      return "";
    }

    if (participantCount < minDisplayCount) {
      return `${minDisplayCount}명 미만 참여`;
    }

    if (stats.completionCount === 0) {
      return variant === "compact"
        ? "완료 전"
        : `${numberFormatter.format(participantCount)}명 참여 · 완료 전`;
    }

    if (stats.completionCount < minDisplayCount) {
      return variant === "compact"
        ? `${minDisplayCount}명 미만 완료`
        : `${numberFormatter.format(participantCount)}명 참여 · ${minDisplayCount}명 미만 완료`;
    }

    const completionRate =
      stats.completionRate ??
      Math.max(0, Math.min(1, stats.completionCount / participantCount));
    const completionRateLabel = `${Math.round(completionRate * 100)}%`;

    if (variant === "compact") {
      return `${completionRateLabel} 완료`;
    }

    return `${numberFormatter.format(participantCount)}명 참여 · ${numberFormatter.format(
      stats.completionCount,
    )}명 완료(${completionRateLabel})`;
  }

  if (stats.completionCount === 0) {
    return "";
  }

  if (stats.completionCount < minDisplayCount) {
    return `${minDisplayCount}명 미만 완료`;
  }

  return `${numberFormatter.format(stats.completionCount)}명 완료`;
}

function DateCarousel({
  completionStatsByPuzzleId,
  completionStatsMinDisplayCount,
  dateCardStates,
  loadState,
  puzzleSummaries,
  selectedPuzzleId,
  selectPuzzle,
}: DateSelectionProps) {
  if (loadState === "loading") {
    return (
      <section className="dateRail" aria-label="퍼즐팩 로딩" aria-busy="true">
        <div className="dateScroller">
          {["원격", "퍼즐팩", "확인"].map((label) => (
            <div key={label} className="dateCard dateLoading">
              <span>{label}</span>
              <strong>불러오는 중</strong>
              <em>잠시만요</em>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const isFallbackPack = loadState === "fallback";

  return (
    <section className="dateRail" aria-label="퍼즐 날짜 선택">
      <div className="dateScroller">
        {puzzleSummaries.map((summary, index) => {
          const state = dateCardStates[summary.puzzleId];
          const isSelected = summary.puzzleId === selectedPuzzleId;
          const slotLabel = isFallbackPack ? "" : formatPuzzleCardSlot(summary);
          const statusLabel = getDateCardStatus(state);
          const wordCountLabel = `${summary.metrics?.wordCount ?? "-"}개`;
          const completionStatsLabel = formatCompletionStatsLabel(
            completionStatsByPuzzleId[summary.puzzleId],
            completionStatsMinDisplayCount,
            "compact",
          );
          const eyebrowLabel = isFallbackPack
            ? "기기저장"
            : formatDateCardWeekday(summary.date);
          const titleLabel = isFallbackPack
            ? formatFallbackCardTitle(index, puzzleSummaries.length)
            : formatDateCardDay(summary.date);
          const metaLabel =
            !isFallbackPack && completionStatsLabel !== ""
              ? slotLabel === ""
                ? completionStatsLabel
                : `${slotLabel} · ${completionStatsLabel}`
              : slotLabel === ""
                ? `${statusLabel} · ${wordCountLabel}`
                : `${slotLabel} · ${wordCountLabel}`;

          return (
            <button
              key={summary.puzzleId}
              className={[
                "dateCard",
                isSelected ? "dateSelected" : "",
                state?.completedAt != null ? "dateCompleted" : "",
              ].join(" ")}
              type="button"
              aria-label={
                isFallbackPack
                  ? `${eyebrowLabel} ${titleLabel} ${statusLabel}`
                  : `${formatGameHeaderDate(summary.date)} ${slotLabel} ${statusLabel}`
              }
              aria-pressed={isSelected}
              onClick={() => void selectPuzzle(summary.puzzleId)}
            >
              <span>{eyebrowLabel}</span>
              <strong>{titleLabel}</strong>
              <em>{metaLabel}</em>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type AppHeaderProps = {
  eyebrow?: string;
  title: string;
  onBack?: () => void;
  backVariant?: "back" | "home";
  action?: {
    label: string;
    onClick: () => void;
  };
  right?: ReactNode;
  compact?: boolean;
};

function AppHeader({
  action,
  backVariant = "back",
  compact = false,
  eyebrow,
  onBack,
  right,
  title,
}: AppHeaderProps) {
  return (
    <header
      className={["appHeader", "screenHeader", compact ? "compactHeader" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {onBack == null ? null : backVariant === "home" ? (
        <button
          className="homeButton"
          type="button"
          onClick={onBack}
          aria-label="홈으로"
        >
          <HomeIcon />
          <span>홈</span>
        </button>
      ) : (
        <button
          className="backButton"
          type="button"
          onClick={onBack}
          aria-label="뒤로"
        >
          ‹
        </button>
      )}
      <div>
        {eyebrow == null ? null : <span>{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      {right ??
        (action == null ? null : (
          <button
            className="ghostButton"
            type="button"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
    </header>
  );
}

type TodayScreenProps = DateSelectionProps & {
  applyAnswer: (entry: PuzzleEntry, value: string) => void;
  applyAnswerSegment: (
    entry: PuzzleEntry,
    value: string,
    startCellKey?: string,
  ) => void;
  cellValues: Record<string, string>;
  clearAnswerCell: (entry: PuzzleEntry, cellKey?: string) => void;
  clearEntryAnswer: (entry: PuzzleEntry) => void;
  clueEntries: PuzzleEntry[];
  completedEntries: PuzzleEntry[];
  completionCelebrationId: string | null;
  dismissCompletionCelebration: () => void;
  hasStarted: boolean;
  hintBalance: HintBalance;
  hintCount: number;
  hintToastMessage: string;
  isCompleted: boolean;
  mission: DailyMissionState;
  navigate: (route: AppRoute) => void;
  puzzle: Puzzle;
  remainingAttempts: number;
  revealLetter: () => void;
  selectedAnswer: string;
  selectedCellKey: string;
  selectedDirection: Direction;
  selectedEntry?: PuzzleEntry;
  startLabels: Map<string, number>;
  setSelectedDirection: (direction: Direction) => void;
  selectCell: (row: number, col: number) => void;
  selectEntry: (entry: PuzzleEntry, cellKey?: string) => void;
  startOrResumeMission: () => void;
  useHint: () => void;
  viewModel: PuzzleViewModel;
};

function TodayScreen({
  applyAnswerSegment,
  cellValues,
  clearAnswerCell,
  clearEntryAnswer,
  completedEntries,
  completionCelebrationId,
  completionStatsByPuzzleId,
  completionStatsMinDisplayCount,
  dateCardStates,
  dismissCompletionCelebration,
  hasStarted,
  hintBalance,
  hintCount,
  hintToastMessage,
  isCompleted,
  loadState,
  mission,
  navigate,
  puzzle,
  puzzleSummaries,
  remainingAttempts,
  selectedCellKey,
  selectedPuzzleId,
  selectedEntry,
  selectPuzzle,
  startLabels,
  selectCell,
  selectEntry,
  startOrResumeMission,
  useHint,
  viewModel,
}: TodayScreenProps) {
  const [isClueListOpen, setIsClueListOpen] = useState(false);
  const [answerInputResetKey, setAnswerInputResetKey] = useState(0);
  const boardInputRef = useRef<HTMLInputElement>(null);
  const commitTimerRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);
  const [inputValue, setInputValue] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const compositionEndValueRef = useRef<string | null>(null);
  // A finished puzzle is shown read-only so the saved answers stay intact while
  // the player reviews the completed board.
  const isReviewMode = isCompleted;
  const showCompletionCelebration = completionCelebrationId === puzzle.puzzleId;
  const selectedEntryCells = useMemo(
    () => (selectedEntry == null ? [] : getEntryCells(selectedEntry)),
    [selectedEntry],
  );
  const selectedEntryCellKeys = useMemo(
    () => selectedEntryCells.map((cell) => getCellKey(cell.row, cell.col)),
    [selectedEntryCells],
  );
  const selectedIndex = Math.max(
    0,
    selectedEntryCellKeys.indexOf(selectedCellKey),
  );
  const activeCellKey =
    selectedEntryCellKeys[selectedIndex] ?? getEntryStartCellKey(selectedEntry);
  const selectedRemainingCellCount = Math.max(
    1,
    selectedEntryCells.length - selectedIndex,
  );
  const pendingAnswerCellValues = useMemo(
    () =>
      selectedEntry == null
        ? {}
        : getPendingAnswerCellValues(selectedEntry, inputValue, selectedCellKey),
    [inputValue, selectedCellKey, selectedEntry],
  );
  const selectedCellEntries = useMemo(() => {
    const entries =
      selectedCellKey === ""
        ? []
        : (viewModel.cellEntries.get(selectedCellKey) ?? []);
    const entriesWithSelected =
      selectedEntry == null ||
      entries.some((entry) => entry.id === selectedEntry.id)
        ? entries
        : [...entries, selectedEntry];

    return [...entriesWithSelected].sort(
      (a, b) => directionOrder[a.direction] - directionOrder[b.direction],
    );
  }, [selectedCellKey, selectedEntry, viewModel.cellEntries]);

  // Per-character state for the sticky top bar so the question and the answer
  // being typed stay visible above the on-screen keyboard.
  const answerSlots = useMemo(() => {
    if (selectedEntry == null) {
      return [];
    }

    return selectedEntryCellKeys.map((key) => {
      const pending = pendingAnswerCellValues[key];
      const committed = cellValues[key];
      const answerLetter = getCellAnswerLetter(puzzle, key);

      return {
        isActive: key === activeCellKey,
        isLocked: isCellLocked(puzzle, cellValues, key),
        isPending: pending != null,
        isWrong: pending == null && committed != null && committed !== answerLetter,
        key,
        value: pending ?? committed ?? "",
      };
    });
  }, [
    activeCellKey,
    cellValues,
    pendingAnswerCellValues,
    puzzle,
    selectedEntry,
    selectedEntryCellKeys,
  ]);

  const isSelectedComplete =
    selectedEntry != null &&
    completedEntries.some((entry) => entry.id === selectedEntry.id);

  const orderedEntries = useMemo(
    () =>
      [...puzzle.entries].sort((a, b) => {
        const labelA = startLabels.get(getCellKey(a.row, a.col)) ?? 0;
        const labelB = startLabels.get(getCellKey(b.row, b.col)) ?? 0;

        return (
          labelA - labelB ||
          directionOrder[a.direction] - directionOrder[b.direction]
        );
      }),
    [puzzle.entries, startLabels],
  );

  function goToAdjacentClue(delta: number) {
    if (selectedEntry == null || orderedEntries.length === 0) {
      return;
    }

    const index = orderedEntries.findIndex(
      (entry) => entry.id === selectedEntry.id,
    );

    if (index === -1) {
      return;
    }

    const nextEntry =
      orderedEntries[
        (index + delta + orderedEntries.length) % orderedEntries.length
      ];

    if (nextEntry != null) {
      selectEntry(nextEntry);
      focusNativeInput();
    }
  }

  function selectClueAndClose(entry: PuzzleEntry) {
    selectEntry(entry);
    setIsClueListOpen(false);
    focusNativeInput();
  }

  function clearSelectedAnswer() {
    if (selectedEntry == null) {
      return;
    }

    setAnswerInputResetKey((prev) => prev + 1);
    setInputValue("");
    clearEntryAnswer(selectedEntry);
  }

  const clearCommitTimer = useCallback(() => {
    if (commitTimerRef.current != null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearCommitTimer();
    compositionEndValueRef.current = null;
    isComposingRef.current = false;
    setInputValue("");
    setIsComposing(false);
  }, [
    activeCellKey,
    answerInputResetKey,
    clearCommitTimer,
    selectedEntry?.id,
  ]);

  useEffect(() => () => clearCommitTimer(), [clearCommitTimer]);

  function focusPuzzleBoard() {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".puzzleBoard")?.focus({
        preventScroll: true,
      });
    });
  }

  function focusNativeInput() {
    boardInputRef.current?.focus({ preventScroll: true });
  }

  function selectCellAndFocus(row: number, col: number) {
    selectCell(row, col);
    focusNativeInput();
  }

  function commitInputValue(value: string, startCellKey = activeCellKey) {
    if (selectedEntry == null) {
      return;
    }

    clearCommitTimer();
    const remainingCellCount =
      selectedEntryCells.length -
      getEntryCellIndex(selectedEntry, startCellKey);
    const nextLetters = getAnswerCommitLetters(
      value,
      remainingCellCount,
    );

    if (nextLetters.length > 0) {
      applyAnswerSegment(selectedEntry, nextLetters.join(""), startCellKey);
    }

    setInputValue("");
  }

  function getDraftLetters(value: string, startCellKey = activeCellKey) {
    if (selectedEntry == null) {
      return [];
    }

    const remainingCellCount =
      selectedEntryCells.length -
      getEntryCellIndex(selectedEntry, startCellKey);

    return getAnswerInputLetters(value, remainingCellCount);
  }

  function hasCommittableDraft(value: string, startCellKey = activeCellKey) {
    const draftLetters = getDraftLetters(value, startCellKey);

    return getAnswerCommitLetters(value, draftLetters.length).length > 0;
  }

  function handleAdvanceInput() {
    const draftLetters = getDraftLetters(inputValue, activeCellKey);

    if (hasCommittableDraft(inputValue, activeCellKey)) {
      commitInputValue(inputValue, activeCellKey);
      focusNativeInput();
      return;
    }

    if (draftLetters.length > 0) {
      focusNativeInput();
      return;
    }

    boardInputRef.current?.blur();
    focusPuzzleBoard();
  }

  function preserveInputOnBlur(value: string) {
    if (isComposingRef.current) {
      clearCommitTimer();
      // Blur can interrupt IME composition without reliably firing compositionend.
      // Reset composing flags so subsequent input is not ignored.
      isComposingRef.current = false;
      setIsComposing(false);
      setInputValue(value);
      return;
    }

    const draftLetters = getDraftLetters(value, activeCellKey);

    if (hasCommittableDraft(value, activeCellKey)) {
      commitInputValue(value, activeCellKey);
      return;
    }

    if (draftLetters.length > 0) {
      clearCommitTimer();
    }
  }

  function queueCommitInputValue(
    value: string,
    startCellKey = activeCellKey,
    delayMs = 320,
  ) {
    if (selectedEntry == null) {
      return;
    }

    clearCommitTimer();

    if (isHangulJamoInput(value)) {
      return;
    }

    if (
      getAnswerCommitLetters(
        value,
        selectedEntryCells.length -
          getEntryCellIndex(selectedEntry, startCellKey),
      ).length === 0
    ) {
      return;
    }

    commitTimerRef.current = window.setTimeout(() => {
      commitInputValue(value, startCellKey);
    }, delayMs);
  }

  function selectRelativeCell(delta: number) {
    if (selectedEntry == null) {
      return;
    }

    const nextIndex = Math.max(
      0,
      Math.min(selectedEntryCellKeys.length - 1, selectedIndex + delta),
    );

    selectEntry(selectedEntry, selectedEntryCellKeys[nextIndex] ?? activeCellKey);
    focusNativeInput();
  }

  if (!hasStarted && !isCompleted) {
    return (
      <>
        <AppHeader
          eyebrow={`남은 도전 ${remainingAttempts}/${mission.maxAttempts}`}
          title="퍼즐 풀기"
          onBack={() => navigate("home")}
        />
        <DateCarousel
          completionStatsByPuzzleId={completionStatsByPuzzleId}
          completionStatsMinDisplayCount={completionStatsMinDisplayCount}
          dateCardStates={dateCardStates}
          loadState={loadState}
          puzzleSummaries={puzzleSummaries}
          selectedPuzzleId={selectedPuzzleId}
          selectPuzzle={selectPuzzle}
        />
        <section className="startPanel" aria-label="미션 시작">
          <Paragraph typography="t2" fontWeight="bold">
            도전 {mission.attemptsUsed + 1}
          </Paragraph>
          <Paragraph typography="t6" color="#6b7684">
            {puzzle.entries.length}개 단어 · 교차율{" "}
            {formatRatio(puzzle.metrics.crossRatio)}
          </Paragraph>
          <Button
            size="large"
            display="full"
            type="button"
            disabled={loadState === "loading" || remainingAttempts === 0}
            onClick={startOrResumeMission}
          >
            {loadState === "loading" ? "불러오는 중" : "시작"}
          </Button>
        </section>
      </>
    );
  }

  return (
    <>
      <AppHeader
        compact
        backVariant="home"
        title={`${completedEntries.length}/${puzzle.entries.length} 낱말`}
        eyebrow={
          isReviewMode
            ? "다 푼 퍼즐"
            : formatPuzzleHeaderLabel(puzzle.date, loadState)
        }
        onBack={() => navigate("home")}
        right={
          <div className="headerActions">
            {isReviewMode ? null : (
              <>
                <button
                  className={[
                    "hintIconButton",
                    hintBalance.remaining === 0 ? "hintIconButtonEmpty" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  aria-label={
                    hintBalance.isAdBusy
                      ? "광고 준비 중"
                      : hintBalance.remaining > 0
                        ? `힌트 ${hintBalance.remaining}개 남음`
                        : `힌트 얻기. 광고를 보고 ${hintBalance.rewardedCredits}개 받기`
                  }
                  title={
                    hintBalance.isAdBusy
                      ? "광고 준비 중"
                      : hintBalance.remaining > 0
                        ? `힌트 ${hintBalance.remaining}개 남음`
                        : `힌트 얻기. 광고를 보고 ${hintBalance.rewardedCredits}개 받기`
                  }
                  disabled={
                    selectedEntry == null ||
                    hintBalance.isAdBusy ||
                    (hintBalance.remaining === 0 && !hintBalance.adsEnabled)
                  }
                  onClick={useHint}
                >
                  <HintIcon />
                  <span className="iconButtonBadge">
                    {hintBalance.isAdBusy
                      ? "…"
                      : hintBalance.remaining > 0
                        ? hintBalance.remaining
                        : "+"}
                  </span>
                </button>
                <button
                  className="iconButton"
                  type="button"
                  aria-label="지우기"
                  title="지우기"
                  disabled={selectedEntry == null}
                  onClick={clearSelectedAnswer}
                >
                  <EraserIcon />
                </button>
              </>
            )}
            <button
              className="iconButton"
              type="button"
              aria-label="전체 문제 보기"
              title="전체 문제"
              onClick={() => setIsClueListOpen(true)}
            >
              <ListIcon />
            </button>
          </div>
        }
      />

      {selectedEntry != null ? (
        <div className="solveClueBar">
          <div className="solveClueRow">
            <button
              className="clueNavButton"
              type="button"
              aria-label="이전 문제"
              disabled={orderedEntries.length < 2}
              onClick={() => goToAdjacentClue(-1)}
            >
              ‹
            </button>
            <button
              className="solveClueInfo"
              type="button"
              onClick={() => {
                selectEntry(selectedEntry, activeCellKey);
                focusNativeInput();
              }}
            >
              <span className="solveClueRef">
                {formatEntryReference(selectedEntry, startLabels)}
                {isSelectedComplete ? " · 완료" : ""}
              </span>
              <strong className="solveClueText">{selectedEntry.clue}</strong>
            </button>
            <button
              className="clueNavButton"
              type="button"
              aria-label="다음 문제"
              disabled={orderedEntries.length < 2}
              onClick={() => goToAdjacentClue(1)}
            >
              ›
            </button>
          </div>
          <div className="answerSlots" role="group" aria-label="입력 중인 답">
            {answerSlots.map((slot, index) => (
              <button
                key={slot.key}
                className={[
                  "answerSlot",
                  slot.isActive ? "answerSlotActive" : "",
                  slot.isLocked ? "answerSlotLocked" : "",
                  slot.isPending ? "answerSlotPending" : "",
                  slot.isWrong ? "answerSlotWrong" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="button"
                aria-label={`${index + 1}/${answerSlots.length}번째 칸${
                  slot.value === ""
                    ? ", 빈 칸"
                    : `, ${slot.value}${slot.isLocked ? " 정답 잠금" : slot.isWrong ? " 오답" : ""}`
                }`}
                onClick={() => {
                  selectEntry(selectedEntry, slot.key);
                  focusNativeInput();
                }}
              >
                {slot.value}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isReviewMode ? (
        <div
          className="reviewBanner"
          role="region"
          aria-label="완료한 퍼즐 안내"
        >
          <span>완료한 퍼즐이에요 · 읽기 전용으로 답을 확인할 수 있어요</span>
          <button
            className="reviewBannerLink"
            type="button"
            onClick={() => navigate("result")}
          >
            결과 보기
          </button>
        </div>
      ) : null}

      {hintToastMessage === "" ? null : (
        <div className="hintToast" role="status">
          {hintToastMessage}
        </div>
      )}

      <section className="puzzlePlayArea" aria-label="퍼즐 풀이">
        <PuzzleBoard
          cellEntries={viewModel.cellEntries}
          cellValues={cellValues}
          cols={viewModel.cols}
          completedEntries={completedEntries}
          pendingCellValues={pendingAnswerCellValues}
          rows={viewModel.rows}
          selectedCells={viewModel.selectedCells}
          selectCell={selectCellAndFocus}
          startLabels={viewModel.startLabels}
          puzzle={puzzle}
        />

        {selectedEntry != null && !isReviewMode ? (
          <input
            ref={boardInputRef}
            className="boardNativeInput"
            inputMode="text"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="next"
            maxLength={selectedRemainingCellCount}
            spellCheck={false}
            value={inputValue}
            aria-label={`${selectedRemainingCellCount}글자 답 입력`}
            tabIndex={-1}
            onCompositionStart={() => {
              clearCommitTimer();
              isComposingRef.current = true;
              setIsComposing(true);
            }}
            onCompositionEnd={(event) => {
              const nextValue = event.currentTarget.value;
              isComposingRef.current = false;
              setIsComposing(false);
              compositionEndValueRef.current = nextValue;
              setInputValue(nextValue);
              queueCommitInputValue(nextValue, activeCellKey, 120);
            }}
            onChange={(event) => {
              const nextValue = event.target.value;
              const nativeEvent = event.nativeEvent as InputEvent;
              setInputValue(nextValue);

              if (
                isComposing ||
                isComposingRef.current ||
                nativeEvent.isComposing ||
                nativeEvent.inputType === "insertCompositionText"
              ) {
                clearCommitTimer();
                return;
              }

              if (compositionEndValueRef.current === nextValue) {
                compositionEndValueRef.current = null;
                return;
              }

              queueCommitInputValue(nextValue);
            }}
            onKeyDown={(event) => {
              const nativeEvent = event.nativeEvent as KeyboardEvent;

              if (isComposing || nativeEvent.isComposing) {
                return;
              }

              if (
                event.key === "Backspace" &&
                inputValue === "" &&
                selectedEntry != null
              ) {
                event.preventDefault();
                clearAnswerCell(selectedEntry, activeCellKey);
                return;
              }

              if (event.key === "ArrowLeft") {
                event.preventDefault();
                selectRelativeCell(-1);
                return;
              }

              if (event.key === "ArrowRight") {
                event.preventDefault();
                selectRelativeCell(1);
                return;
              }

              if (
                event.key === "Enter" ||
                event.key === " " ||
                event.code === "Space"
              ) {
                event.preventDefault();
                handleAdvanceInput();
              }
            }}
            onBlur={(event) => preserveInputOnBlur(event.currentTarget.value)}
          />
        ) : null}

        {selectedEntry != null ? (
          <div className="selectedClueList" aria-label="선택한 문제">
            {selectedCellEntries.map((entry) => (
              <button
                key={entry.id}
                className={[
                  "selectedClue",
                  entry.id === selectedEntry.id ? "selectedClueActive" : "",
                ].join(" ")}
                type="button"
                aria-pressed={entry.id === selectedEntry.id}
                onClick={() => {
                  selectEntry(
                    entry,
                    selectedCellKey || getEntryStartCellKey(entry),
                  );
                  focusNativeInput();
                }}
              >
                <span>{formatEntryReference(entry, startLabels)}</span>
                <strong>{entry.clue}</strong>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {isClueListOpen ? (
        <AllCluesOverlay
          completedEntries={completedEntries}
          entries={puzzle.entries}
          onClose={() => setIsClueListOpen(false)}
          onSelect={selectClueAndClose}
          puzzle={puzzle}
          selectedEntry={selectedEntry}
          startLabels={startLabels}
        />
      ) : null}

      {showCompletionCelebration ? (
        <CompletionCelebrationDialog
          completedCount={completedEntries.length}
          hintCount={hintCount}
          totalCount={puzzle.entries.length}
          onClose={dismissCompletionCelebration}
          onGoHome={() => {
            dismissCompletionCelebration();
            navigate("home");
          }}
          onSeeResult={() => {
            dismissCompletionCelebration();
            navigate("result");
          }}
        />
      ) : null}
    </>
  );
}

type CompletionCelebrationDialogProps = {
  completedCount: number;
  hintCount: number;
  totalCount: number;
  onClose: () => void;
  onGoHome: () => void;
  onSeeResult: () => void;
};

function CompletionCelebrationDialog({
  completedCount,
  hintCount,
  totalCount,
  onClose,
  onGoHome,
  onSeeResult,
}: CompletionCelebrationDialogProps) {
  return (
    <div className="rewardDialogScrim" onClick={onClose}>
      <section
        className="rewardDialog completionDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="completionDialogTitle"
        aria-describedby="completionDialogDescription"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="completionDialogBadge" aria-hidden="true">
          🎉
        </div>
        <div className="rewardDialogText">
          <h2 id="completionDialogTitle">퍼즐을 완성했어요!</h2>
          <p id="completionDialogDescription">
            낱말 {completedCount}/{totalCount}개를 모두 맞췄어요
            {hintCount > 0 ? ` · 힌트 ${hintCount}회 사용` : ""}.
          </p>
        </div>
        <div className="rewardDialogActions">
          <button
            className="secondaryButton"
            type="button"
            onClick={onSeeResult}
          >
            결과 보기
          </button>
          <button
            className="primaryButton"
            type="button"
            onClick={onGoHome}
            autoFocus
          >
            홈으로
          </button>
        </div>
        <button
          className="completionDialogReview"
          type="button"
          onClick={onClose}
        >
          퍼즐 다시 보기
        </button>
      </section>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="16"
      height="16"
    >
      <path
        d="M4 11.5 12 5l8 6.5M6 10.5V19h12v-8.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="18"
      height="18"
    >
      <path
        d="M7 17l-3-3 8.5-8.5a2.1 2.1 0 0 1 3 0l3 3a2.1 2.1 0 0 1 0 3L13 17H7z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M10 8l6 6M5 19h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function HintIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="18"
      height="18"
    >
      <path
        d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1.3 1.4 1.5 2.5h5c.2-1.1.7-1.7 1.5-2.5A6 6 0 0 0 12 3z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="18"
      height="18"
    >
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

type ResultScreenProps = DateSelectionProps & {
  bonusPuzzlePanelState: BonusPuzzlePanelState;
  completedEntries: PuzzleEntry[];
  hintCount: number;
  mission: DailyMissionState;
  navigate: (route: AppRoute) => void;
  progressPercent: number;
  puzzle: Puzzle;
  remainingAttempts: number;
  requestBonusPuzzle: () => void;
  restartMissionAttempt: () => void;
};

function ResultScreen({
  bonusPuzzlePanelState,
  completedEntries,
  completionStatsByPuzzleId,
  completionStatsMinDisplayCount,
  dateCardStates,
  hintCount,
  loadState,
  mission,
  navigate,
  progressPercent,
  puzzle,
  puzzleSummaries,
  remainingAttempts,
  requestBonusPuzzle,
  restartMissionAttempt,
  selectedPuzzleId,
  selectPuzzle,
}: ResultScreenProps) {
  const isComplete = completedEntries.length === puzzle.entries.length;

  return (
    <>
      <AppHeader
        eyebrow={`${formatMissionDateLabel(mission.date, loadState)} · 도전 ${mission.attemptsUsed}/${mission.maxAttempts}`}
        title="미션 결과"
        onBack={() => navigate("home")}
      />

      <DateCarousel
        completionStatsByPuzzleId={completionStatsByPuzzleId}
        completionStatsMinDisplayCount={completionStatsMinDisplayCount}
        dateCardStates={dateCardStates}
        loadState={loadState}
        puzzleSummaries={puzzleSummaries}
        selectedPuzzleId={selectedPuzzleId}
        selectPuzzle={selectPuzzle}
      />

      <section className="resultPanel" aria-label="미션 결과">
        <strong>{isComplete ? "완료" : `${progressPercent}% 진행`}</strong>
        <span>
          {completedEntries.length}/{puzzle.entries.length} 단어 · 힌트{" "}
          {hintCount}회 · 남은 도전 {remainingAttempts}
        </span>
      </section>

      <section className="resultActions" aria-label="결과 메뉴">
        <button
          className="primaryButton"
          type="button"
          onClick={() => navigate("home")}
        >
          홈으로
        </button>
        <button
          className="secondaryButton"
          type="button"
          onClick={() => navigate("today")}
        >
          {isComplete ? "퍼즐 다시 보기" : "이어 풀기"}
        </button>
        {isComplete ? null : (
          <button
            className="secondaryButton"
            type="button"
            disabled={remainingAttempts === 0}
            onClick={restartMissionAttempt}
          >
            다시 도전
          </button>
        )}
      </section>

      <BonusPuzzlePanel
        state={bonusPuzzlePanelState}
        onAction={requestBonusPuzzle}
      />
    </>
  );
}

type HistoryScreenProps = DateSelectionProps & {
  archiveRecords: PuzzleArchiveRecord[];
  completedEntries: PuzzleEntry[];
  hintCount: number;
  isCompleted: boolean;
  mission: DailyMissionState;
  navigate: (route: AppRoute) => void;
  progressPercent: number;
  puzzle: Puzzle;
  remainingAttempts: number;
  startOrResumeMission: () => void;
};

function HistoryScreen({
  archiveRecords,
  completedEntries,
  completionStatsByPuzzleId,
  completionStatsMinDisplayCount,
  dateCardStates,
  hintCount,
  isCompleted,
  loadState,
  mission,
  navigate,
  progressPercent,
  puzzle,
  puzzleSummaries,
  remainingAttempts,
  selectedPuzzleId,
  selectPuzzle,
  startOrResumeMission,
}: HistoryScreenProps) {
  function openArchiveRecord(record: PuzzleArchiveRecord) {
    const state = dateCardStates[record.puzzleId];

    void selectPuzzle(record.puzzleId);
    navigate(state?.completedAt != null ? "result" : "today");
  }

  return (
    <>
      <AppHeader
        eyebrow={`${formatMissionDateLabel(mission.date, loadState)} · ${isCompleted ? "완료" : `${progressPercent}%`}`}
        title="기록"
        onBack={() => navigate("home")}
      />

      <DateCarousel
        completionStatsByPuzzleId={completionStatsByPuzzleId}
        completionStatsMinDisplayCount={completionStatsMinDisplayCount}
        dateCardStates={dateCardStates}
        loadState={loadState}
        puzzleSummaries={puzzleSummaries}
        selectedPuzzleId={selectedPuzzleId}
        selectPuzzle={selectPuzzle}
      />

      <section className="historyList" aria-label="미션 기록">
        {archiveRecords.length > 0 ? (
          archiveRecords.map((record) => {
            const state = dateCardStates[record.puzzleId];
            const isRecordCompleted =
              record.completedAt != null || state?.completedAt != null;

            return (
              <button
                key={record.puzzleId}
                className="historyItem"
                type="button"
                onClick={() => openArchiveRecord(record)}
              >
                <span>{record.puzzle.date} · 기기 저장 사본</span>
                <strong>{isRecordCompleted ? "완료" : "진행 중"}</strong>
                <em>
                  {record.puzzle.entries.length}개 단어 ·{" "}
                  {isRecordCompleted ? "다시 보기" : "이어 풀기"}
                </em>
              </button>
            );
          })
        ) : (
          <button
            className="historyItem"
            type="button"
            onClick={
              isCompleted ? () => navigate("result") : startOrResumeMission
            }
          >
            <span>{formatMissionDateLabel(mission.date, loadState)}</span>
            <strong>{isCompleted ? "완료" : "진행 중"}</strong>
            <em>
              {completedEntries.length}/{puzzle.entries.length} 단어 · 힌트{" "}
              {hintCount}회 · 남은 도전 {remainingAttempts}
            </em>
          </button>
        )}
      </section>

      <section className="historyNotice" aria-label="기기 저장 안내">
        내가 푼 퍼즐은 이 기기에 저장돼요. 앱 데이터 삭제, 기기 변경, 저장공간
        정리 시 사라질 수 있어요.
      </section>
    </>
  );
}

type DevSimulatorScreenProps = Omit<
  TodayScreenProps,
  "completionCelebrationId" | "dismissCompletionCelebration"
> & {
  clearProgress: () => void;
  revealAll: () => void;
  revealSelected: () => void;
};

function DevSimulatorScreen({
  applyAnswer,
  cellValues,
  clearProgress,
  clueEntries,
  completedEntries,
  hintCount,
  loadState,
  puzzle,
  revealAll,
  revealLetter,
  revealSelected,
  selectedAnswer,
  selectedDirection,
  selectedEntry,
  startLabels,
  setSelectedDirection,
  selectCell,
  selectEntry,
  viewModel,
}: DevSimulatorScreenProps) {
  const devPuzzleSourceLabel =
    loadState === "remote"
      ? `${puzzle.date} · ${formatPuzzleSourceLabel(loadState)}`
      : formatPuzzleSourceLabel(loadState);

  return (
    <main className="appShell">
      <Top
        title={
          <Top.TitleParagraph size={22}>개발 시뮬레이터</Top.TitleParagraph>
        }
        subtitleBottom={
          <Top.SubtitleParagraph size={15}>
            {devPuzzleSourceLabel} · 교차율{" "}
            {Math.round(puzzle.metrics.crossRatio * 100)}%
          </Top.SubtitleParagraph>
        }
      />

      <section className="metricsBar" aria-label="퍼즐 품질 지표">
        <div>
          <strong>{puzzle.metrics.wordCount}</strong>
          <span>단어</span>
        </div>
        <div>
          <strong>{puzzle.metrics.autoRunCount}</strong>
          <span>자동</span>
        </div>
        <div>
          <strong>{Math.round(puzzle.metrics.bboxDensity * 100)}%</strong>
          <span>밀도</span>
        </div>
        <div>
          <strong>
            {completedEntries.length}/{puzzle.entries.length}
          </strong>
          <span>완료</span>
        </div>
      </section>

      <section className="reviewPanel" aria-label="퍼즐 검수">
        <div className="qualitySummary">
          <strong>
            {puzzle.quality?.pass ? "품질 통과" : "품질 확인 필요"}
          </strong>
          <span>
            다중 교차 {puzzle.metrics.multiCrossEntries}/
            {puzzle.metrics.wordCount} · 자동 {puzzle.metrics.autoRunCount}/
            {puzzle.metrics.wordCount} · 힌트 {hintCount}회
          </span>
        </div>

        {puzzle.quality != null ? (
          <div className="qualityGrid">
            {puzzle.quality.checks.map((check) => (
              <div key={check.key} className="qualityItem">
                <span>{qualityLabels[check.key] ?? check.key}</span>
                <strong className={check.pass ? "qualityPass" : "qualityFail"}>
                  {check.pass ? "통과" : "미달"}
                </strong>
                <em>{formatQualityValue(check)}</em>
              </div>
            ))}
          </div>
        ) : (
          <p className="reviewNote">
            fallback puzzle에는 batch 품질 게이트 결과가 없습니다.
          </p>
        )}

        <SlotValidationSummary validation={viewModel.slotValidation} />

        <div className="reviewList">
          {viewModel.reviewEntries.map((entry, index) => (
            <button
              key={entry.id}
              className={[
                "reviewItem",
                entry.id === selectedEntry?.id ? "reviewSelected" : "",
              ].join(" ")}
              type="button"
              onClick={() => selectEntry(entry)}
            >
              <span className="reviewIndex">
                {getEntryStartLabel(entry, startLabels) ?? index + 1}
              </span>
              <span className="reviewWord">{entry.answer}</span>
              <span className="reviewMeta">
                {directionLabels[entry.direction]} ·{" "}
                {entry.generatedBy === "auto" ? "자동" : "배치"} · 교차{" "}
                {entry.crossPoints.length}
              </span>
              <span className="reviewCoords">
                {entry.crossPoints.length === 0
                  ? "-"
                  : entry.crossPoints.join(" ")}
                {entry.needsManualClue ? " · 힌트 재작성 필요" : ""}
              </span>
            </button>
          ))}
        </div>
      </section>

      <PuzzleBoard
        cellEntries={viewModel.cellEntries}
        cellValues={cellValues}
        cols={viewModel.cols}
        completedEntries={completedEntries}
        pendingCellValues={{}}
        rows={viewModel.rows}
        selectedCells={viewModel.selectedCells}
        selectCell={selectCell}
        startLabels={viewModel.startLabels}
        puzzle={puzzle}
      />

      {selectedEntry != null ? (
        <section className="answerPanel">
          <div className="selectedClue">
            <span>{formatEntryReference(selectedEntry, startLabels)}</span>
            <strong>{selectedEntry.clue}</strong>
          </div>
          <input
            className="answerInput"
            inputMode="text"
            maxLength={selectedEntry.answer.length}
            placeholder={`${selectedEntry.answer.length}글자 입력`}
            value={selectedAnswer}
            onChange={(event) => applyAnswer(selectedEntry, event.target.value)}
          />
          <div className="actionRow">
            <button className="toolButton" type="button" onClick={revealLetter}>
              힌트 글자
            </button>
            <button
              className="toolButton"
              type="button"
              onClick={revealSelected}
            >
              선택 정답
            </button>
            <button
              className="toolButton"
              type="button"
              onClick={clearProgress}
            >
              초기화
            </button>
          </div>
        </section>
      ) : null}

      <ClueSection
        clueEntries={clueEntries}
        completedEntries={completedEntries}
        puzzle={puzzle}
        selectedDirection={selectedDirection}
        selectedEntry={selectedEntry}
        startLabels={startLabels}
        setSelectedDirection={setSelectedDirection}
        selectEntry={selectEntry}
      />

      <div className="bottomAction">
        <button className="primaryButton" type="button" onClick={revealAll}>
          전체 정답 보기
        </button>
      </div>
    </main>
  );
}

type SlotValidationSummaryProps = {
  validation: PuzzleSlotValidation;
};

function SlotValidationSummary({ validation }: SlotValidationSummaryProps) {
  const issueCount =
    validation.missingEntries.length +
    validation.entryWithoutSlots.length +
    validation.answerMismatches.length +
    validation.duplicateEntries.length;

  return (
    <div
      className={[
        "slotValidation",
        validation.pass ? "slotValidationPass" : "slotValidationFail",
      ].join(" ")}
    >
      <strong>{validation.pass ? "슬롯 검증 통과" : "슬롯 검증 필요"}</strong>
      <span>
        전체 {validation.slots.length}개 · 미등록{" "}
        {validation.missingEntries.length} · 불일치{" "}
        {validation.answerMismatches.length} · 초과{" "}
        {validation.entryWithoutSlots.length} · 중복{" "}
        {validation.duplicateEntries.length}
      </span>

      {issueCount === 0 ? null : (
        <div className="slotIssueList">
          {validation.missingEntries.slice(0, 3).map((slot) => (
            <em key={`missing:${slot.direction}:${slot.row}:${slot.col}`}>
              미등록 {directionLabels[slot.direction]} {slot.answer}
            </em>
          ))}
          {validation.answerMismatches.slice(0, 3).map(({ entry, slot }) => (
            <em key={`mismatch:${entry.id}`}>
              불일치 {entry.id}: {entry.answer} / 격자 {slot.answer}
            </em>
          ))}
        </div>
      )}
    </div>
  );
}

type PuzzleBoardProps = {
  cellEntries: Map<string, PuzzleEntry[]>;
  cellValues: Record<string, string>;
  cols: number[];
  completedEntries: PuzzleEntry[];
  pendingCellValues: Record<string, string>;
  puzzle: Puzzle;
  rows: number[];
  selectedCells: Set<string>;
  selectCell: (row: number, col: number) => void;
  startLabels: Map<string, number>;
};

function PuzzleBoard({
  cellEntries,
  cellValues,
  cols,
  completedEntries,
  pendingCellValues,
  puzzle,
  rows,
  selectedCells,
  selectCell,
  startLabels,
}: PuzzleBoardProps) {
  const completedCellKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const entry of completedEntries) {
      getEntryCells(entry).forEach((cell) => {
        keys.add(getCellKey(cell.row, cell.col));
      });
    }

    return keys;
  }, [completedEntries]);

  return (
    <section
      className="puzzleBoard"
      style={{ "--board-cols": cols.length } as CSSProperties}
      tabIndex={-1}
      aria-label="가로세로 퍼즐판"
    >
      {rows.flatMap((row) =>
        cols.map((col) => {
          const answer = puzzle.grid[row]?.[col] ?? "";
          const key = getCellKey(row, col);
          const entries = cellEntries.get(key) ?? [];
          const committedValue = cellValues[key];
          const pendingValue = pendingCellValues[key] ?? "";
          const displayValue =
            pendingValue !== "" ? pendingValue : committedValue ?? "";
          const isFilled = committedValue != null;
          const isPending = pendingValue !== "";
          const isComplete = completedCellKeys.has(key);
          const isSelected = selectedCells.has(key);
          const isCross = entries.length > 1;
          // Pending IME text is temporary, so only committed values get
          // right/wrong styling.
          const isCorrect = !isPending && isFilled && committedValue === answer;
          const isWrong = !isPending && isFilled && committedValue !== answer;

          if (answer === "") {
            return <div key={key} className="cell cellBlock" />;
          }

          return (
            <button
              key={key}
              className={[
                "cell",
                isSelected ? "cellSelected" : "",
                isCross ? "cellCross" : "",
                isFilled ? "cellFilled" : "",
                isPending ? "cellPending" : "",
                isCorrect ? "cellCorrect" : "",
                isComplete ? "cellComplete" : "",
                isWrong ? "cellWrong" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              onClick={() => selectCell(row, col)}
              aria-label={`${row + 1}행 ${col + 1}열${
                isWrong
                  ? " 오답"
                  : isComplete
                    ? " 정답 완료"
                    : isCorrect
                      ? " 정답 잠금"
                      : ""
              }`}
            >
              <span className="cellNumber">{startLabels.get(key) ?? ""}</span>
              <span className="cellLetter">{displayValue}</span>
              {isCorrect && !isComplete ? (
                <span className="cellLockMark" aria-hidden="true" />
              ) : null}
            </button>
          );
        }),
      )}
    </section>
  );
}

type AllCluesOverlayProps = {
  completedEntries: PuzzleEntry[];
  entries: PuzzleEntry[];
  onClose: () => void;
  onSelect: (entry: PuzzleEntry) => void;
  puzzle: Puzzle;
  selectedEntry?: PuzzleEntry;
  startLabels: Map<string, number>;
};

function AllCluesOverlay({
  completedEntries,
  entries,
  onClose,
  onSelect,
  puzzle,
  selectedEntry,
  startLabels,
}: AllCluesOverlayProps) {
  const completedIds = new Set(completedEntries.map((entry) => entry.id));

  return (
    <div className="clueOverlay" role="dialog" aria-modal="true">
      <div className="clueOverlayHeader">
        <div>
          <Paragraph typography="t7" color="#6b7684">
            전체 문제
          </Paragraph>
          <Paragraph typography="t4" fontWeight="bold">
            {entries.length}개 단서
          </Paragraph>
        </div>
        <button className="ghostButton" type="button" onClick={onClose}>
          닫기
        </button>
      </div>

      <div className="clueOverlayList">
        {(["across", "down"] as Direction[]).map((direction) => (
          <section key={direction} className="clueGroup">
            <h2>{directionLabels[direction]}</h2>
            {entries
              .filter((entry) => entry.direction === direction)
              .map((entry) => {
                const isComplete = completedIds.has(entry.id);
                return (
                  <button
                    key={entry.id}
                    className={[
                      "clueItem",
                      entry.id === selectedEntry?.id ? "clueSelected" : "",
                      isComplete ? "clueComplete" : "",
                    ].join(" ")}
                    type="button"
                    aria-label={`${formatEntryReference(entry, startLabels)} ${entry.clue} ${entry.answer.length}자${isComplete ? " 완료" : ""}`}
                    onClick={() => onSelect(entry)}
                  >
                    <span className="clueIndex">
                      {getEntryStartLabel(entry, startLabels) ??
                        puzzle.entries.findIndex(
                          (candidate) => candidate.id === entry.id,
                        ) + 1}
                    </span>
                    <span className="clueText">{entry.clue}</span>
                    <span className="clueMeta">
                      <span>{entry.answer.length}자</span>
                      {isComplete ? (
                        <span className="clueDoneBadge">완료</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
          </section>
        ))}
      </div>
    </div>
  );
}

type ClueSectionProps = {
  clueEntries: PuzzleEntry[];
  completedEntries: PuzzleEntry[];
  puzzle: Puzzle;
  selectedDirection: Direction;
  selectedEntry?: PuzzleEntry;
  startLabels: Map<string, number>;
  style?: CSSProperties;
  setSelectedDirection: (direction: Direction) => void;
  selectEntry: (entry: PuzzleEntry) => void;
};

function ClueSection({
  clueEntries,
  completedEntries,
  puzzle,
  selectedDirection,
  selectedEntry,
  startLabels,
  style,
  setSelectedDirection,
  selectEntry,
}: ClueSectionProps) {
  return (
    <section className="clueSection" style={style}>
      <div className="segmentedControl" role="tablist" aria-label="힌트 방향">
        {(["across", "down"] as Direction[]).map((direction) => (
          <button
            key={direction}
            className={selectedDirection === direction ? "segmentActive" : ""}
            type="button"
            onClick={() => setSelectedDirection(direction)}
          >
            {directionLabels[direction]}
          </button>
        ))}
      </div>

      <div className="clueList">
        {clueEntries.map((entry) => {
          const isComplete = completedEntries.some(
            (completed) => completed.id === entry.id,
          );
          return (
            <button
              key={entry.id}
              className={[
                "clueItem",
                entry.id === selectedEntry?.id ? "clueSelected" : "",
                isComplete ? "clueComplete" : "",
              ].join(" ")}
              type="button"
              onClick={() => selectEntry(entry)}
            >
              <span className="clueIndex">
                {getEntryStartLabel(entry, startLabels) ??
                  puzzle.entries.findIndex(
                    (candidate) => candidate.id === entry.id,
                  ) + 1}
              </span>
              <span className="clueText">{entry.clue}</span>
              <span className="clueMeta">
                <span>{entry.answer.length}자</span>
                {isComplete ? (
                  <span className="clueDoneBadge">완료</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default App;
