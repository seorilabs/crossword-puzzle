import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  TouchEvent as ReactTouchEvent,
} from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Paragraph, Top } from "@toss/tds-mobile";
import "./App.css";
import {
  buildCellEntries,
  buildReviewEntries,
  buildStartLabels,
  completeMission,
  createPuzzleSummary,
  createDailyMissionState,
  DAILY_ATTEMPT_LIMIT,
  formatCompletionStatsLabel,
  formatCompletionStatsMetrics,
  formatEstimatedSolveLabel,
  getBonusPuzzleCandidateSummary,
  getBounds,
  getCellKey,
  getCompletedEntries,
  getCompletionAchievements,
  getDailyFreePuzzleSummaries,
  getDailyFreePuzzleSummary,
  getEntryAnswerValue,
  getEntryCells,
  getInitialEntryId,
  getNewlyReachedProgressMilestones,
  getOpenPuzzleSummariesForDate,
  getProgressMilestoneRewardMessage,
  getPuzzleDailySequenceNumber,
  getPuzzlePackAlias,
  getNextFocusEntryAfterCompletion,
  getRemainingAttempts,
  getTodayDateKey,
  getNextStreakMilestoneHint,
  getStreakBadgeLabel,
  getStreakMilestoneProgress,
  shouldQuickStartActivePuzzle,
  shouldServeOnboardingPuzzle,
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
import {
  computeConsecutiveStreakDays,
  createLocalMissionRepository,
  invalidateStreakCache,
} from "./adapters/localMissionRepository";
import {
  createLocalBonusPuzzleUnlockRepository,
  createLocalPuzzleArchiveRepository,
  type BonusPuzzleUnlock,
  type PuzzleArchiveRecord,
  type PuzzleArchiveSaveOptions,
} from "./adapters/localPuzzleAccessRepository";
import {
  createLocalProgressRepository,
  getBestTimeMs,
  saveBestTimeMs,
} from "./adapters/localProgressRepository";
import {
  showRewardedBonusPuzzleAd,
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
  createOnboardingPuzzleRepository,
  createStaticPuzzleRepository,
} from "./adapters/staticPuzzleRepository";
import { telemetry } from "./adapters/telemetry";
import { fallbackPuzzle } from "./data/fallbackPuzzle";
import { onboardingPuzzle } from "./data/onboardingPuzzle";

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

const DIRECT_INPUT_COMMIT_DELAY_MS = 140;
const COMPOSITION_COMMIT_DELAY_MS = 0;

// Two answer input strategies coexist because per-cell IME handling behaves
// differently across the AIT / Play Store / App Store WebView engines.
// "box": one plain text field per word (stable, IME-safe, default).
// "cell": the hidden native input overlaid on the cells (faster, but fragile).
type AnswerInputMode = "box" | "cell";
const ANSWER_INPUT_MODE_STORAGE_KEY = "crossword:answer-input-mode";

function loadAnswerInputMode(): AnswerInputMode {
  try {
    return localStorage.getItem(ANSWER_INPUT_MODE_STORAGE_KEY) === "cell"
      ? "cell"
      : "box";
  } catch {
    return "box";
  }
}

function persistAnswerInputMode(mode: AnswerInputMode): void {
  try {
    localStorage.setItem(ANSWER_INPUT_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage blocked; the preference applies for this session only.
  }
}

// 상시 오답표시(autocheck) 설정. 기본값은 켜짐(기존 동작 유지)이며, "0"으로
// 저장된 경우에만 끈 것으로 본다.
const AUTOCHECK_STORAGE_KEY = "crossword:autocheck-enabled";

function loadAutocheckEnabled(): boolean {
  try {
    return localStorage.getItem(AUTOCHECK_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function persistAutocheckEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTOCHECK_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Storage blocked; the preference applies for this session only.
  }
}

// "이 단어 확인"으로 강조한 셀을 잠시(원복 전) 표시하는 시간(ms).
const CHECK_HIGHLIGHT_MS = 2500;

// PuzzleBoard의 checkedCellKeys 기본값. 매 렌더 새 Set 생성을 피한다.
const EMPTY_CELL_KEY_SET: ReadonlySet<string> = new Set();

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
  generationIntervalHours: number;
  isAdBusy: boolean;
  nextBonusPublishedAt?: Date;
  notice: string;
  now: Date;
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
const basePuzzleRepository = hasRemotePuzzlePack
  ? createFallbackPuzzleRepository(
      remotePuzzleRepository,
      localPuzzleRepository,
    )
  : localPuzzleRepository;
// 입문(easy) 티어 퍼즐은 회전 팩과 무관하게 항상 번들 상수로 제공한다.
const puzzleRepository = createOnboardingPuzzleRepository(
  basePuzzleRepository,
  onboardingPuzzle,
);
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
}; // ResultScreen 포함 전체 컴포넌트에서 공유하는 방향 레이블

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

// 막혔을 때 힌트 자동 노출: 입력 정체가 이 시간을 넘으면 비침습 힌트 CTA를 띄운다.
const STUCK_HINT_IDLE_MS = 20000;
// 오답이 쌓이면(막힘 신호) 20초를 기다리지 않고 더 빨리 힌트 CTA를 띄운다.
const STUCK_HINT_WRONG_IDLE_MS = 5000;
// 이 개수 이상의 셀이 오답으로 남아 있으면 "막힘"으로 보고 빠른 노출을 적용한다.
const WRONG_CELL_COUNT_FOR_STUCK_HINT = 2;

function getPuzzleTelemetryParams(puzzle: Puzzle) {
  return {
    difficulty: puzzle.difficulty,
    grid_size: puzzle.gridSize,
    pack_id: puzzle.packId,
    published_at: puzzle.publishedAt,
    puzzle_alias: getPuzzlePackAlias(puzzle),
    puzzle_id: puzzle.puzzleId,
    slot_id: puzzle.slotId,
    word_count: puzzle.entries.length,
  };
}

function formatDifficultyLabel(difficulty?: Puzzle["difficulty"]) {
  if (difficulty === "easy") return "쉬움";
  if (difficulty === "normal") return "보통";
  if (difficulty === "hard") return "어려움";
  return "";
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

// 완료 직후 "다음 퍼즐"로 이어줄 추천 퍼즐: 현재 퍼즐을 빼고, 아직 완료하지 않은
// 퍼즐을 우선 추천한다(없으면 현재 외 첫 퍼즐). 연속 플레이 동선을 끊지 않기 위함.
function getNextRecommendedSummary(
  puzzleSummaries: PuzzleManifestItem[],
  dateCardStates: Record<string, DateCardState>,
  currentPuzzleId: string,
): PuzzleManifestItem | undefined {
  const completedIds = getCompletedPuzzleIds(dateCardStates);
  const candidates = puzzleSummaries.filter(
    (summary) => summary.puzzleId !== currentPuzzleId,
  );

  return (
    candidates.find((summary) => !completedIds.has(summary.puzzleId)) ??
    candidates[0]
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

function formatPuzzleAliasLabel(summary: PuzzleManifestItem) {
  return `#${getPuzzlePackAlias(summary)}`;
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
          : ([getCellKey(cell.row, cell.col), letter] as const);
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

function getInitialEntryStartCellKey(puzzle: Puzzle) {
  const initialEntryId = getInitialEntryId(puzzle);
  const initialEntry =
    puzzle.entries.find((entry) => entry.id === initialEntryId) ??
    puzzle.entries[0];

  return getEntryStartCellKey(initialEntry);
}

// 첫 입력을 유도할 "시작 단어"는 가장 짧은(쉬운) 단어로 고른다. 동률이면 퍼즐
// 순서상 앞선 단어를 유지해 "여기부터" 포인트를 안정적으로 한 곳에 모은다.
function getStarterEntry(puzzle: Puzzle): PuzzleEntry | undefined {
  return puzzle.entries.reduce<PuzzleEntry | undefined>((best, entry) => {
    if (best == null) {
      return entry;
    }

    return entry.answer.length < best.answer.length ? entry : best;
  }, undefined);
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
  // 막혔을 때 힌트 자동 노출: 일정 시간 입력 정체 시 비침습 CTA를 띄운다.
  const [isStuckHintPromptVisible, setIsStuckHintPromptVisible] =
    useState(false);
  const [hintToast, setHintToast] = useState<{ id: number; message: string }>({
    id: 0,
    message: "",
  });
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
  const [bonusPuzzleUnlocks, setBonusPuzzleUnlocks] = useState<
    BonusPuzzleUnlock[]
  >([]);
  const [completionStatsByPuzzleId, setCompletionStatsByPuzzleId] =
    useState<CompletionStatsByPuzzleId>({});
  const [completionCelebrationId, setCompletionCelebrationId] = useState<
    string | null
  >(null);
  const [consecutiveStreak, setConsecutiveStreak] = useState(() =>
    computeConsecutiveStreakDays(),
  );
  const [isNewBestTime, setIsNewBestTime] = useState(false);
  // "정답 보기"로 단어를 공개했는지. 노힌트/첫 도전 배지·최고 기록 판정에서
  // 제외하기 위한 플래그로, 진행상태(SavedProgress)에 보존한다.
  const [revealUsed, setRevealUsed] = useState(false);
  // 상시 오답표시(autocheck) on/off 설정.
  const [autocheckEnabled, setAutocheckEnabled] = useState(loadAutocheckEnabled);
  // "이 단어 확인"으로 잠시 강조 중인 셀. 일정 시간 후 비워 원상 복구한다.
  const [checkedCellKeys, setCheckedCellKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const checkHighlightTimerRef = useRef<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [hasSeenHowToPlay, setHasSeenHowToPlay] = useState(() => {
    try {
      return localStorage.getItem("crossword:how-to-play-seen") === "1";
    } catch {
      return false;
    }
  });
  const [answerInputMode, setAnswerInputMode] =
    useState<AnswerInputMode>(loadAnswerInputMode);
  // 첫 진입 1스텝 온보딩: 첫 입력 전 "첫 칸에 입력" 가이드를 최초 1회만 노출한다.
  const [hasSeenFirstInputGuide, setHasSeenFirstInputGuide] = useState(() => {
    try {
      return localStorage.getItem("crossword:first-input-guide-seen") === "1";
    } catch {
      return false;
    }
  });
  const firstAnswerInputKeysRef = useRef<Set<string>>(new Set());
  const firstInputGuideShownRef = useRef(false);
  // 진행 마일스톤(부분 완료) 추적: 동일 퍼즐·시도 안에서 새로 넘어선 마일스톤만
  // 보상 피드백·이벤트로 노출하고, 이어풀기(resume)·재시작 시 이미 도달한 구간은
  // 다시 emit하지 않도록 baseline을 초기화한다.
  const progressMilestoneKeyRef = useRef<string>("");
  const reachedProgressMilestoneRef = useRef<number>(0);
  // 비완료 이탈 계측: 시작했지만 완료하지 않은 채 보드를 떠날 때(인앱 이동/앱 종료)
  // 진행 스냅샷을 puzzle_abandon으로 한 번(시도당) 기록한다. 행동 변경 없음.
  // had_first_input=false인 이탈은 무입력(침묵) 이탈이며, 이때 elapsed_seconds가
  // 첫 입력 없이 머문 시간(TTFI 상한)이 된다. 첫 입력 지연 자체는 first_answer_input의
  // elapsed_seconds로 측정한다.
  const abandonTrackedKeysRef = useRef<Set<string>>(new Set());
  const prevRouteRef = useRef<AppRoute>("home");
  const abandonSnapshotRef = useRef({
    attemptsUsed: 0,
    elapsedStartedAt: undefined as string | undefined,
    hadFirstInput: false,
    hasStarted: false,
    hintCount: 0,
    isCompleted: false,
    progressPercent: 0,
    puzzleId: "",
    remainingAttempts: 0,
    route: "home" as AppRoute,
    telemetryParams: {} as ReturnType<typeof getPuzzleTelemetryParams>,
    totalWords: 0,
    wordsFilled: 0,
  });

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
    if (route === "home") {
      // Recalculate streak whenever the home screen is shown so that a date
      // change at midnight is reflected without requiring an app restart.
      setConsecutiveStreak(computeConsecutiveStreakDays());
    }
  }, [route]);

  useEffect(() => {
    setIsNewBestTime(false);
  }, [puzzle.puzzleId]);

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
      setRevealUsed(session.savedProgress.revealUsed ?? false);
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
        const [nextDateCardStates, nextBonusPuzzleUnlocks, onboardingSession] =
          await Promise.all([
            loadDateCardStates([
              ...nextSummaries,
              ...nextArchiveRecords.map((record) =>
                createPuzzleSummary(record.puzzle),
              ),
            ]),
            bonusPuzzleUnlockRepository.loadUnlocks(today),
            loadPuzzleSession(onboardingPuzzle.puzzleId),
          ]);

        // 신규 사용자(아직 첫 성공 전)면 입문 퍼즐을, 그 외에는 일반 일일 퍼즐을
        // 첫 활성 퍼즐로 둔다. 입문 퍼즐 세션은 위에서 미리 불러와 재사용한다.
        const dateCardValues = Object.values(nextDateCardStates);
        const useOnboarding =
          onboardingSession != null &&
          shouldServeOnboardingPuzzle({
            hasCompletedAnyDaily: dateCardValues.some(
              (state) => state.completedAt != null,
            ),
            hasDailyProgress: dateCardValues.some((state) => state.hasProgress),
            onboardingCompleted:
              onboardingSession.savedMission.completedAt != null,
          });
        const session = useOnboarding
          ? onboardingSession
          : await loadPuzzleSession(getInitialPuzzleId(nextSummaries, today));

        if (!isCancelled) {
          setPuzzleSummaries(nextSummaries);
          setPuzzleArchiveRecords(nextArchiveRecords);
          setBonusPuzzleUnlocks(nextBonusPuzzleUnlocks);
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
          setHintToast((prev) => ({
            id: prev.id + 1,
            message: "선택한 날짜의 퍼즐을 불러오지 못했습니다.",
          }));
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
        setHintToast((prev) => ({
          id: prev.id + 1,
          message: "선택한 날짜의 퍼즐을 불러오지 못했습니다.",
        }));
        telemetry.click("puzzle_select", {
          puzzle_id: puzzleId,
          status: "error",
        });
      }
    },
    [applyPuzzleSession, loadPuzzleSession, loadState],
  );

  useEffect(() => {
    // 모든 값이 기본값이면 저장 스킵: clearProgress가 삭제한 키가 재생성되지 않도록 함
    if (
      Object.keys(cellValues).length === 0 &&
      earnedHintCredits === 0 &&
      hintCount === 0 &&
      !revealUsed
    ) {
      return;
    }
    void progressRepository
      .saveProgress(puzzle.puzzleId, {
        cellValues,
        earnedHintCredits,
        hintCount,
        revealUsed,
      })
      .catch(() => {
        telemetry.impression("progress_save_error", {
          puzzle_id: puzzle.puzzleId,
        });
      });
  }, [cellValues, earnedHintCredits, hintCount, revealUsed, puzzle.puzzleId]);

  // "이 단어 확인" 강조 타이머 정리(언마운트 시).
  useEffect(() => {
    return () => {
      if (checkHighlightTimerRef.current != null) {
        window.clearTimeout(checkHighlightTimerRef.current);
      }
    };
  }, []);

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
  const isAttemptExhaustedUncompleted =
    hasStarted && remainingAttempts <= 0 && !isCompleted;
  // 첫 진입 1스텝 온보딩: how-to를 본 뒤, 시작했지만 아직 한 글자도 입력하지 않은
  // 최초 진입에서만 첫 입력 가이드를 노출한다(입력이 생기면 즉시 사라짐).
  const isFirstInputGuideVisible =
    route === "today" &&
    hasStarted &&
    !isCompleted &&
    hasSeenHowToPlay &&
    !hasSeenFirstInputGuide &&
    Object.keys(cellValues).length === 0;

  // 최신 상태 스냅샷(ref): pagehide/visibilitychange 리스너가 stale closure 없이
  // 이탈 시점의 진행 상태를 읽을 수 있게 매 렌더마다 갱신한다.
  abandonSnapshotRef.current = {
    attemptsUsed: mission.attemptsUsed,
    elapsedStartedAt: mission.lastStartedAt,
    hadFirstInput: firstAnswerInputKeysRef.current.has(
      `${puzzle.puzzleId}:${mission.attemptsUsed}`,
    ),
    hasStarted,
    hintCount,
    isCompleted,
    progressPercent,
    puzzleId: puzzle.puzzleId,
    remainingAttempts,
    route,
    telemetryParams: puzzleTelemetryParams,
    totalWords: puzzle.entries.length,
    wordsFilled: viewModel.completedEntries.length,
  };

  const emitPuzzleAbandon = useCallback((lastScreen: AppRoute) => {
    const snapshot = abandonSnapshotRef.current;

    // 시작했고 아직 완료하지 않은 경우만 이탈로 본다. 시도당 1회만 기록.
    if (!snapshot.hasStarted || snapshot.isCompleted) {
      return;
    }

    const key = `${snapshot.puzzleId}:${snapshot.attemptsUsed}`;
    if (abandonTrackedKeysRef.current.has(key)) {
      return;
    }
    abandonTrackedKeysRef.current.add(key);

    telemetry.impression("puzzle_abandon", {
      ...snapshot.telemetryParams,
      attempt_number: snapshot.attemptsUsed,
      elapsed_seconds: getElapsedSeconds(snapshot.elapsedStartedAt),
      had_first_input: snapshot.hadFirstInput,
      hint_count: snapshot.hintCount,
      last_screen: lastScreen,
      progress_percent: snapshot.progressPercent,
      remaining_attempts: snapshot.remainingAttempts,
      total_words: snapshot.totalWords,
      words_filled: snapshot.wordsFilled,
    });
  }, []);

  // 인앱 이동: 보드(today)를 떠나 다른 화면으로 갈 때 이탈로 기록한다.
  useEffect(() => {
    const previousRoute = prevRouteRef.current;
    if (previousRoute === "today" && route !== "today") {
      emitPuzzleAbandon(previousRoute);
    }
    prevRouteRef.current = route;
  }, [emitPuzzleAbandon, route]);

  // 앱 종료/백그라운드: 보드에 있는 상태로 페이지가 숨겨지면 이탈로 기록한다.
  useEffect(() => {
    const handleHide = () => {
      if (abandonSnapshotRef.current.route === "today") {
        emitPuzzleAbandon("today");
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleHide();
      }
    };

    window.addEventListener("pagehide", handleHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handleHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [emitPuzzleAbandon]);

  const todayKey = getTodayDateKey();
  const completedPuzzleIds = useMemo(
    () => getCompletedPuzzleIds(dateCardStates),
    [dateCardStates],
  );
  const activeBonusPuzzleUnlocks = useMemo(
    () => bonusPuzzleUnlocks.filter((unlock) => unlock.date === todayKey),
    [bonusPuzzleUnlocks, todayKey],
  );
  const unlockedBonusPuzzleIds = useMemo(
    () => new Set(activeBonusPuzzleUnlocks.map((unlock) => unlock.puzzleId)),
    [activeBonusPuzzleUnlocks],
  );
  const completedOrUnlockedPuzzleIds = useMemo(
    () => new Set([...completedPuzzleIds, ...unlockedBonusPuzzleIds]),
    [completedPuzzleIds, unlockedBonusPuzzleIds],
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
  const todayArchivePuzzleSummaries = useMemo(
    () =>
      puzzleArchiveRecords
        .map((record) => createPuzzleSummary(record.puzzle))
        .filter((summary) => summary.date === todayKey),
    [puzzleArchiveRecords, todayKey],
  );
  const unlockedBonusSummaries = useMemo(
    () =>
      uniquePuzzleSummaries(
        activeBonusPuzzleUnlocks
          .map(
            (unlock) =>
              findPuzzleSummaryById(puzzleSummaries, unlock.puzzleId) ??
              getPuzzleSummaryFromArchive(
                puzzleArchiveRecords,
                unlock.puzzleId,
              ),
          )
          .filter((summary): summary is PuzzleManifestItem => summary != null),
      ),
    [activeBonusPuzzleUnlocks, puzzleArchiveRecords, puzzleSummaries],
  );
  const unlockedPlayableBonusSummary = useMemo(
    () =>
      unlockedBonusSummaries.find(
        (summary) => !completedPuzzleIds.has(summary.puzzleId),
      ),
    [completedPuzzleIds, unlockedBonusSummaries],
  );
  const bonusCandidateSummary = useMemo(
    () =>
      getBonusPuzzleCandidateSummary({
        completedPuzzleIds: completedOrUnlockedPuzzleIds,
        dailyFreeSummary,
        puzzleSummaries,
        today: todayKey,
      }),
    [completedOrUnlockedPuzzleIds, dailyFreeSummary, puzzleSummaries, todayKey],
  );
  const bonusPuzzlePanelIsWaiting =
    loadState !== "loading" &&
    unlockedPlayableBonusSummary == null &&
    bonusCandidateSummary == null &&
    unlockedBonusSummaries.length === 0;
  const nextBonusPuzzlePublishedAt = useMemo(() => {
    const nowMs = now.getTime();
    const next = puzzleSummaries.reduce<PuzzleManifestItem | undefined>(
      (min, s) => {
        if (
          s.date !== todayKey ||
          s.puzzleId === dailyFreeSummary?.puzzleId ||
          completedOrUnlockedPuzzleIds.has(s.puzzleId) ||
          s.publishedAt == null
        ) {
          return min;
        }
        const publishedAtMs = new Date(s.publishedAt).getTime();
        if (!Number.isFinite(publishedAtMs) || publishedAtMs < nowMs - 60_000) {
          return min;
        }
        return min == null ||
          publishedAtMs < new Date(min.publishedAt!).getTime()
          ? s
          : min;
      },
      undefined,
    );
    return next?.publishedAt != null ? new Date(next.publishedAt) : undefined;
  }, [
    completedOrUnlockedPuzzleIds,
    dailyFreeSummary,
    now,
    puzzleSummaries,
    todayKey,
  ]);
  const nextBonusPuzzlePublishedAtMs =
    nextBonusPuzzlePublishedAt?.getTime() ?? null;
  useEffect(() => {
    if (nextBonusPuzzlePublishedAtMs == null || !bonusPuzzlePanelIsWaiting)
      return;
    const nowMs = Date.now();
    const msUntilNextMinute = Math.ceil(nowMs / 60_000) * 60_000 - nowMs;
    const msUntilNextAt = Math.max(0, nextBonusPuzzlePublishedAtMs - nowMs);
    const msUntilFirstTick = Math.min(msUntilNextMinute, msUntilNextAt);
    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (msUntilFirstTick === 0) {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60_000);
      return () => {
        if (intervalId != null) clearInterval(intervalId);
      };
    }
    const timeoutId = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60_000);
    }, msUntilFirstTick);
    return () => {
      clearTimeout(timeoutId);
      if (intervalId != null) clearInterval(intervalId);
    };
  }, [bonusPuzzlePanelIsWaiting, nextBonusPuzzlePublishedAtMs]);
  const selectedPuzzleSummary = useMemo(
    () =>
      findPuzzleSummaryById(puzzleSummaries, puzzle.puzzleId) ??
      getPuzzleSummaryFromArchive(puzzleArchiveRecords, puzzle.puzzleId) ??
      createPuzzleSummary(puzzle),
    [puzzle, puzzleArchiveRecords, puzzleSummaries],
  );
  const todayOpenPuzzleSummaries = useMemo(
    () =>
      getOpenPuzzleSummariesForDate({
        archivePuzzleSummaries: todayArchivePuzzleSummaries,
        date: todayKey,
        dailyFreeSummary,
        selectedPuzzleSummary,
        unlockedBonusSummaries,
      }),
    [
      dailyFreeSummary,
      selectedPuzzleSummary,
      todayArchivePuzzleSummaries,
      todayKey,
      unlockedBonusSummaries,
    ],
  );
  const visiblePuzzleSummaries = useMemo(
    () =>
      sortPuzzleSummariesByRecency(
        uniquePuzzleSummaries(
          [
            ...dailyFreeSummaries,
            ...unlockedBonusSummaries,
            selectedPuzzleSummary,
            ...archivePuzzleSummaries,
          ].filter((summary): summary is PuzzleManifestItem => summary != null),
        ),
      ),
    [
      archivePuzzleSummaries,
      dailyFreeSummaries,
      selectedPuzzleSummary,
      unlockedBonusSummaries,
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
    generationIntervalHours: launchConfig.puzzleGenerationIntervalHours,
    isAdBusy: bonusAdStatus === "loading",
    nextBonusPublishedAt: nextBonusPuzzlePublishedAt,
    notice: bonusNotice,
    now,
    status:
      loadState === "loading"
        ? "loading"
        : unlockedPlayableBonusSummary != null
          ? "unlocked"
          : bonusCandidateSummary != null
            ? "available"
            : unlockedBonusSummaries.length > 0
              ? "used"
              : "waiting",
    unlockedSummary:
      unlockedPlayableBonusSummary ?? unlockedBonusSummaries[0] ?? undefined,
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

  // 확정됐지만 정답과 다른("오답"으로 남은) 셀 수. 일정 개수 이상이면 막힘 신호로 본다.
  const wrongCellCount = useMemo(() => {
    let count = 0;
    for (const [key, value] of Object.entries(cellValues)) {
      if (value !== "" && value !== getCellAnswerLetter(puzzle, key)) {
        count += 1;
      }
    }
    return count;
  }, [cellValues, puzzle]);

  // 막혔을 때 힌트 자동 노출: 보드(today)에서 시작·미완료 상태일 때 입력/조작이
  // 일정 시간 정체되면 비침습 힌트 CTA를 띄운다. 입력·단어 선택 등 활동이 있으면
  // 타이머가 리셋되어 다시 정체될 때까지 노출되지 않는다. 오답이 쌓여 막힌 신호가
  // 보이면(미완료자 다수가 힌트 없이 이탈) 더 짧은 지연으로 빠르게 띄운다.
  useEffect(() => {
    if (route !== "today" || !hasStarted || isCompleted) {
      setIsStuckHintPromptVisible(false);
      return;
    }

    const hasWrongStreak = wrongCellCount >= WRONG_CELL_COUNT_FOR_STUCK_HINT;
    const stuckHintDelayMs = hasWrongStreak
      ? STUCK_HINT_WRONG_IDLE_MS
      : STUCK_HINT_IDLE_MS;

    setIsStuckHintPromptVisible(false);
    const timerId = window.setTimeout(() => {
      setIsStuckHintPromptVisible(true);
      telemetry.impression("stuck_hint_prompt", {
        ...puzzleTelemetryParams,
        attempt_number: mission.attemptsUsed,
        hint_count: hintCount,
        idle_seconds: stuckHintDelayMs / 1000,
        progress_percent: progressPercent,
        remaining_hint_credits: remainingHintCredits,
        total_words: puzzle.entries.length,
        trigger: hasWrongStreak ? "wrong_answer" : "idle",
        words_filled: viewModel.completedEntries.length,
        wrong_cell_count: wrongCellCount,
      });
    }, stuckHintDelayMs);

    return () => window.clearTimeout(timerId);
  }, [
    cellValues,
    hasStarted,
    hintCount,
    isCompleted,
    mission.attemptsUsed,
    progressPercent,
    puzzle.entries.length,
    puzzleTelemetryParams,
    remainingHintCredits,
    route,
    selectedEntryId,
    viewModel.completedEntries.length,
    wrongCellCount,
  ]);

  // 첫 입력 가이드 노출 이벤트(최초 1회).
  useEffect(() => {
    if (!isFirstInputGuideVisible || firstInputGuideShownRef.current) {
      return;
    }
    firstInputGuideShownRef.current = true;
    telemetry.impression("onboarding_guide_shown", {
      ...puzzleTelemetryParams,
      attempt_number: mission.attemptsUsed,
    });
  }, [isFirstInputGuideVisible, mission.attemptsUsed, puzzleTelemetryParams]);

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
    const achievements = getCompletionAchievements({
      hintCount,
      attemptsUsed: nextMission.attemptsUsed,
      revealUsed,
    });
    setMission(nextMission);
    void missionRepository.saveMission(nextMission).then(() => {
      invalidateStreakCache();
      setConsecutiveStreak(computeConsecutiveStreakDays());
    });
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
      // 정답 공개로 완료한 미션은 reveal_used=true로 구분해 분석에서 분리한다.
      reveal_used: revealUsed,
      remaining_attempts: getRemainingAttempts(nextMission),
    });

    // 정답 공개(revealUsed)로 완료한 경우 최고 기록 갱신에서 제외한다.
    if (
      achievements.bestTimeEligible &&
      nextMission.lastStartedAt != null &&
      nextMission.completedAt != null
    ) {
      const elapsedMs =
        new Date(nextMission.completedAt).getTime() -
        new Date(nextMission.lastStartedAt).getTime();
      if (elapsedMs > 0) {
        const currentBest = getBestTimeMs(puzzle.puzzleId);
        if (currentBest == null || elapsedMs < currentBest) {
          if (saveBestTimeMs(puzzle.puzzleId, elapsedMs)) {
            setIsNewBestTime(true);
          }
        }
      }
    }

    if (route === "today") {
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
    revealUsed,
    savePuzzleSnapshot,
    route,
    viewModel.completedEntries.length,
    viewModel.isComplete,
  ]);

  useEffect(() => {
    const key = `${puzzle.puzzleId}:${mission.attemptsUsed}`;

    // 새 퍼즐/시도이거나 이어풀기 로드면, 이미 도달한 마일스톤을 baseline으로 잡고
    // 이번 라운드는 보상/이벤트를 내보내지 않는다(resume 시 중복 emit 방지).
    if (progressMilestoneKeyRef.current !== key) {
      progressMilestoneKeyRef.current = key;
      const alreadyReached = getNewlyReachedProgressMilestones(
        0,
        progressPercent,
      );
      reachedProgressMilestoneRef.current =
        alreadyReached[alreadyReached.length - 1] ?? 0;
      return;
    }

    // 완료(100%)는 mission_complete가 별도로 다루므로 마일스톤에서 제외한다.
    if (viewModel.isComplete) {
      return;
    }

    const newlyReached = getNewlyReachedProgressMilestones(
      reachedProgressMilestoneRef.current,
      progressPercent,
    );
    if (newlyReached.length === 0) {
      return;
    }

    const highestMilestone = newlyReached[newlyReached.length - 1];
    reachedProgressMilestoneRef.current = highestMilestone;

    for (const milestone of newlyReached) {
      telemetry.impression("puzzle_progress", {
        ...puzzleTelemetryParams,
        attempt_number: mission.attemptsUsed,
        completed_word_count: viewModel.completedEntries.length,
        word_count: puzzle.entries.length,
        progress_percent: progressPercent,
        milestone,
        elapsed_seconds: getElapsedSeconds(mission.lastStartedAt),
        hint_count: hintCount,
        remaining_attempts: remainingAttempts,
      });
    }

    // 중간 성취 보상 피드백(힌트 토스트 UI 재사용).
    setHintToast((prev) => ({
      id: prev.id + 1,
      message: getProgressMilestoneRewardMessage(highestMilestone),
    }));
  }, [
    hintCount,
    mission.attemptsUsed,
    mission.lastStartedAt,
    progressPercent,
    puzzle,
    puzzleTelemetryParams,
    remainingAttempts,
    viewModel.completedEntries.length,
    viewModel.isComplete,
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

  function markFirstInputGuideSeen() {
    try {
      localStorage.setItem("crossword:first-input-guide-seen", "1");
    } catch {
      // Storage blocked; 가이드는 이번 세션 동안만 숨겨진다.
    }
    setHasSeenFirstInputGuide(true);
  }

  function trackFirstAnswerInput(
    entry: PuzzleEntry,
    inputLength: number,
    source: "debug" | "manual" | "reveal",
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

      // 가이드가 떠 있는 동안(또는 보기 전) 첫 입력에 성공하면 가이드 완료로 본다.
      if (!hasSeenFirstInputGuide) {
        if (firstInputGuideShownRef.current) {
          telemetry.click("onboarding_guide_complete", {
            ...puzzleTelemetryParams,
            attempt_number: mission.attemptsUsed,
            elapsed_seconds: getElapsedSeconds(mission.lastStartedAt),
          });
        }
        markFirstInputGuideSeen();
      }
    }
  }

  function scheduleNextUncompletedEntry(
    currentEntry: PuzzleEntry,
    cellValuesSnapshot: Record<string, string>,
    anchorCellKey: string | null,
  ) {
    setTimeout(() => {
      const nextUncompleted = getNextFocusEntryAfterCompletion(
        puzzle.entries,
        cellValuesSnapshot,
        currentEntry,
        anchorCellKey,
      );

      if (nextUncompleted != null) {
        selectEntry(nextUncompleted);
      }
    }, 150);
  }

  function applyAnswer(
    entry: PuzzleEntry,
    value: string,
    source: "debug" | "manual" | "reveal" = "manual",
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

    if (getEntryAnswerValue(entry, nextValues) === entry.answer) {
      const lastCell = cells[cells.length - 1];
      const anchorCellKey =
        lastCell != null ? getCellKey(lastCell.row, lastCell.col) : null;
      scheduleNextUncompletedEntry(entry, nextValues, anchorCellKey);
    }
  }

  function applyAnswerSegment(
    entry: PuzzleEntry,
    value: string,
    startCellKey = selectedCellKey,
    source: "debug" | "manual" | "reveal" = "manual",
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

    if (getEntryAnswerValue(entry, nextValues) === entry.answer) {
      const lastCell = cells[startIndex + nextLetters.length - 1];
      const anchorCellKey =
        lastCell != null ? getCellKey(lastCell.row, lastCell.col) : null;
      scheduleNextUncompletedEntry(entry, nextValues, anchorCellKey);
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

  function acceptStuckHintPrompt() {
    setIsStuckHintPromptVisible(false);
    telemetry.click("stuck_hint_prompt_accept", {
      ...puzzleTelemetryParams,
      attempt_number: mission.attemptsUsed,
      progress_percent: progressPercent,
      remaining_hint_credits: remainingHintCredits,
    });
    // useHintOrRequestReward와 동일 동작(이름의 use 접두사로 인한 hook 오탐 회피).
    if (remainingHintCredits > 0) {
      revealLetter();
    } else {
      setIsRewardedHintPromptOpen(true);
    }
  }

  function dismissStuckHintPrompt() {
    setIsStuckHintPromptVisible(false);
    telemetry.click("stuck_hint_prompt_dismiss", {
      ...puzzleTelemetryParams,
      attempt_number: mission.attemptsUsed,
      progress_percent: progressPercent,
    });
  }

  function dismissFirstInputGuide() {
    telemetry.click("onboarding_guide_dismiss", {
      ...puzzleTelemetryParams,
      attempt_number: mission.attemptsUsed,
    });
    markFirstInputGuideSeen();
  }

  function dismissHowToPlay() {
    try {
      localStorage.setItem("crossword:how-to-play-seen", "1");
    } catch {
      // Storage blocked; modal dismissed for this session only and will reappear next visit.
    }
    setHasSeenHowToPlay(true);
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

      const nextUnlocks =
        await bonusPuzzleUnlockRepository.saveUnlock(nextUnlock);
      setBonusPuzzleUnlocks(nextUnlocks);
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

  // 일반 플레이 화면용: 사용자가 명시적으로 호출하는 "이 단어 확인". 선택 단어
  // 셀에 정/오를 잠시 강조한 뒤 CHECK_HIGHLIGHT_MS 후 원상 복구한다. autocheck를
  // 꺼둔 상태에서도 이 강조는 동작한다(PuzzleBoard 렌더가 checkedCellKeys를 함께 본다).
  function checkSelectedWord() {
    const selectedEntry = viewModel.selectedEntry;
    if (selectedEntry == null) {
      return;
    }

    const cells = getEntryCells(selectedEntry);
    const answerLetters = [...selectedEntry.answer];
    const keys: string[] = [];
    let filledCount = 0;
    let wrongCount = 0;

    cells.forEach((cell, index) => {
      const key = getCellKey(cell.row, cell.col);
      keys.push(key);
      const value = cellValues[key];
      if (value != null) {
        filledCount += 1;
        if (value !== answerLetters[index]) {
          wrongCount += 1;
        }
      }
    });

    setCheckedCellKeys(new Set(keys));
    if (checkHighlightTimerRef.current != null) {
      window.clearTimeout(checkHighlightTimerRef.current);
    }
    checkHighlightTimerRef.current = window.setTimeout(() => {
      setCheckedCellKeys(new Set());
      checkHighlightTimerRef.current = null;
    }, CHECK_HIGHLIGHT_MS);

    telemetry.click("check_word", {
      puzzle_id: puzzle.puzzleId,
      entry_id: selectedEntry.id,
      filled_count: filledCount,
      wrong_count: wrongCount,
    });
  }

  // 일반 플레이 화면용: 사용자가 명시적으로 호출하는 "이 단어 정답 보기". 선택
  // 단어를 정답으로 채우고 revealUsed를 세워, 노힌트/첫 도전 배지와 최고 기록
  // 판정에서 제외한다(getCompletionAchievements).
  function revealSelectedWord() {
    const selectedEntry = viewModel.selectedEntry;
    if (selectedEntry == null) {
      return;
    }

    if (getEntryAnswerValue(selectedEntry, cellValues) === selectedEntry.answer) {
      setHintNotice("이미 정답이 채워진 단어예요.");
      return;
    }

    setRevealUsed(true);
    applyAnswer(selectedEntry, selectedEntry.answer, "reveal");
    telemetry.click("reveal_word", {
      puzzle_id: puzzle.puzzleId,
      entry_id: selectedEntry.id,
      progress_percent: progressPercent,
    });
  }

  function toggleAutocheck() {
    setAutocheckEnabled((prev) => {
      const next = !prev;
      persistAutocheckEnabled(next);
      telemetry.click("autocheck_toggle", {
        puzzle_id: puzzle.puzzleId,
        enabled: next,
      });
      return next;
    });
  }

  async function clearProgress(preserveEarnedHintCredits?: number) {
    const raw = preserveEarnedHintCredits ?? 0;
    const creditsValue = Number.isFinite(raw) ? Math.max(0, raw) : 0;

    // 저장소 작업 먼저: 실패 시 UI 상태를 건드리지 않아 저장소-UI 일관성 유지
    if (creditsValue > 0) {
      await progressRepository.saveProgress(puzzle.puzzleId, {
        cellValues: {},
        earnedHintCredits: creditsValue,
        hintCount: 0,
        revealUsed: false,
      });
    } else {
      await progressRepository.clearProgress(puzzle.puzzleId);
    }

    setCellValues({});
    setEarnedHintCredits(creditsValue);
    setHintCount(0);
    setRevealUsed(false);
    setHintNotice("");
    setHintToast({ id: 0, message: "" });
    setSelectedDirection("across");
    setSelectedEntryId(getInitialEntryId(puzzle));
    setSelectedCellKey(getInitialEntryStartCellKey(puzzle));
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

    if (isAttemptExhaustedUncompleted) {
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

  // 홈 최상단 "오늘의 퍼즐 바로 시작" 원탭 CTA: 선택 단계를 건너뛰고 오늘의 무료
  // 퍼즐로 바로 진입시킨다. 다른 날짜를 보던 중이면 오늘의 퍼즐 세션을 불러와 시작한다.
  async function startTodayPuzzle() {
    if (loadState === "loading") {
      return;
    }

    const todaysSummary = dailyFreeSummary;

    // 오늘의 퍼즐이 이미 선택돼 있거나, 신규 사용자에게 배정된 입문(easy) 온보딩
    // 퍼즐이 활성 상태면 일반 퍼즐로 전환하지 않고 현재 퍼즐을 그대로 시작한다.
    // 온보딩 퍼즐은 puzzleId가 오늘의 일반 퍼즐과 달라, 이 가드가 없으면 신규의
    // 첫 경험이 easy 대신 normal로 빠진다(#92).
    if (
      shouldQuickStartActivePuzzle({
        activePuzzleId: puzzle.puzzleId,
        onboardingPuzzleId: onboardingPuzzle.puzzleId,
        todayPuzzleId: todaysSummary?.puzzleId,
      })
    ) {
      telemetry.click("home_quick_start", {
        ...puzzleTelemetryParams,
        source:
          puzzle.puzzleId === onboardingPuzzle.puzzleId ? "onboarding" : "today",
      });
      startOrResumeMission();
      return;
    }

    // 다른 날짜 퍼즐을 보던 중이면 오늘의 퍼즐 세션을 불러와 바로 시작한다.
    const session = await loadPuzzleSession(todaysSummary.puzzleId);

    if (session == null) {
      setLoadState("fallback");
      setHintToast((prev) => ({
        id: prev.id + 1,
        message: "오늘의 퍼즐을 불러오지 못했어요.",
      }));
      telemetry.click("home_quick_start", {
        puzzle_id: todaysSummary.puzzleId,
        source: "switched_to_today",
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
    telemetry.click("home_quick_start", {
      ...getPuzzleTelemetryParams(session.nextPuzzle),
      source: "switched_to_today",
      status: "loaded",
    });
  }

  async function restartMissionAttempt() {
    if (remainingAttempts === 0) {
      return;
    }

    const rawCredits = earnedHintCredits;
    const creditsToPreserve = Number.isFinite(rawCredits)
      ? Math.max(0, rawCredits)
      : 0;
    try {
      await clearProgress(creditsToPreserve);
      setIsNewBestTime(false);
      const nextMission = startMissionAttempt(mission);
      setMission(nextMission);
      void missionRepository.saveMission(nextMission).catch(() => {
        telemetry.impression("mission_save_error", {
          puzzle_id: puzzle.puzzleId,
        });
      });
      void savePuzzleSnapshot(puzzle, {
        startedAt: nextMission.lastStartedAt,
      }).catch(() => {
        telemetry.impression("snapshot_save_error", {
          puzzle_id: puzzle.puzzleId,
        });
      });
      trackAttemptStart(nextMission, "retry", {
        earnedHintCredits: creditsToPreserve,
        hintCount: 0,
      });
      navigate("today");
    } catch {
      setHintToast((prev) => ({
        id: prev.id + 1,
        message: "재도전 중 오류가 발생했습니다. 다시 시도해 주세요.",
      }));
    }
  }

  function selectAnswerInputMode(mode: AnswerInputMode) {
    setAnswerInputMode(mode);
    persistAnswerInputMode(mode);
  }

  const commonScreenProps = {
    answerInputMode,
    applyAnswer,
    applyAnswerSegment,
    autocheckEnabled,
    selectAnswerInputMode,
    cellValues,
    checkedCellKeys,
    checkSelectedWord,
    clearAnswerCell,
    clearEntryAnswer,
    clueEntries: viewModel.clueEntries,
    completedEntries: viewModel.completedEntries,
    hintBalance,
    hintCount,
    mission,
    puzzle,
    remainingAttempts,
    requestRewardedHint,
    revealLetter,
    revealSelectedWord,
    revealUsed,
    selectedAnswer: viewModel.selectedAnswer,
    selectedCellKey,
    selectedDirection,
    selectedEntry: viewModel.selectedEntry,
    setSelectedDirection,
    selectCell,
    selectEntry,
    startLabels: viewModel.startLabels,
    toggleAutocheck,
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
        consecutiveStreak={consecutiveStreak}
        hasStarted={hasStarted}
        isCompleted={isCompleted}
        isNewBestTime={isNewBestTime}
        navigate={navigate}
        revealAll={revealAll}
        revealSelected={revealSelected}
        startOrResumeMission={startOrResumeMission}
      />
    );
  }

  return (
    <main
      className={[
        "appShell",
        route === "today" ? "appShellToday" : "",
        isFirstInputGuideVisible ? "firstInputGuideActive" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {route === "today" ? (
        <TodayScreen
          {...commonScreenProps}
          {...dateSelectionProps}
          completionCelebrationId={completionCelebrationId}
          consecutiveStreak={consecutiveStreak}
          dismissCompletionCelebration={() => setCompletionCelebrationId(null)}
          hasStarted={hasStarted}
          isCompleted={isCompleted}
          isFirstInputGuideVisible={isFirstInputGuideVisible}
          isNewBestTime={isNewBestTime}
          navigate={navigate}
          startOrResumeMission={startOrResumeMission}
        />
      ) : route === "result" ? (
        <ResultScreen
          {...dateSelectionProps}
          bonusPuzzlePanelState={bonusPuzzlePanelState}
          completedEntries={viewModel.completedEntries}
          consecutiveStreak={consecutiveStreak}
          hintCount={hintCount}
          isNewBestTime={isNewBestTime}
          mission={mission}
          navigate={navigate}
          progressPercent={progressPercent}
          puzzle={puzzle}
          remainingAttempts={remainingAttempts}
          requestBonusPuzzle={() => void requestBonusPuzzle()}
          restartMissionAttempt={restartMissionAttempt}
          revealUsed={revealUsed}
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
          consecutiveStreak={consecutiveStreak}
          hasStarted={hasStarted}
          hintBalance={hintBalance}
          isCompleted={isCompleted}
          isSelectedDailyFree={puzzle.puzzleId === dailyFreeSummary?.puzzleId}
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
          startTodayPuzzle={() => void startTodayPuzzle()}
          todayPuzzleSummaries={todayOpenPuzzleSummaries}
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
      {hintToast.message !== "" ? (
        <div className="hintToast" role="status">
          {hintToast.message}
        </div>
      ) : null}
      {route === "today" && isStuckHintPromptVisible ? (
        <div className="stuckHintPrompt" role="status">
          <span className="stuckHintPromptText">
            {remainingHintCredits > 0
              ? "막혔나요? 지금 힌트는 무료예요 💡"
              : "막혔나요? 광고를 보면 힌트를 받을 수 있어요"}
          </span>
          <div className="stuckHintPromptActions">
            <button
              type="button"
              className="stuckHintPromptCta"
              onClick={acceptStuckHintPrompt}
            >
              {remainingHintCredits > 0 ? "무료 힌트 보기" : "힌트 보기"}
            </button>
            <button
              type="button"
              className="stuckHintPromptClose"
              aria-label="힌트 안내 닫기"
              onClick={dismissStuckHintPrompt}
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}
      {isFirstInputGuideVisible ? (
        <div className="firstInputGuide" role="status">
          <span className="firstInputGuideText">
            반짝이는 첫 칸을 탭해 글자를 입력하면 시작돼요 ✏️
          </span>
          <button
            type="button"
            className="firstInputGuideClose"
            aria-label="안내 닫기"
            onClick={dismissFirstInputGuide}
          >
            ✕
          </button>
        </div>
      ) : null}
      {route === "today" && !hasSeenHowToPlay ? (
        <HowToPlayDialog onClose={dismissHowToPlay} />
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

function HowToPlayDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="rewardDialogScrim">
      <section
        className="rewardDialog howToPlayDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="howToPlayTitle"
      >
        <div className="rewardDialogText">
          <h2 id="howToPlayTitle">크로스워드 어떻게 풀까요?</h2>
          <ol className="howToPlayList">
            <li>격자의 칸을 탭하면 해당 단어가 선택돼요</li>
            <li>같은 칸을 다시 탭하면 가로↔세로 방향이 바뀌어요</li>
            <li>아래 단서 목록에서 원하는 단어를 바로 선택할 수도 있어요</li>
            <li>힌트 버튼으로 모르는 칸을 채울 수 있어요 (횟수 제한 있음)</li>
          </ol>
        </div>
        <div className="rewardDialogActions howToPlayActions">
          <button
            className="primaryButton"
            type="button"
            onClick={onClose}
            autoFocus
          >
            알겠어요, 시작할게요!
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
  consecutiveStreak: number;
  hasStarted: boolean;
  hintBalance: HintBalance;
  isCompleted: boolean;
  isSelectedDailyFree: boolean;
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
  startTodayPuzzle: () => void;
  todayPuzzleSummaries: PuzzleManifestItem[];
};

function HomeScreen({
  bonusPuzzlePanelState,
  completedEntries,
  consecutiveStreak,
  completionStatsByPuzzleId,
  completionStatsMinDisplayCount,
  dateCardStates,
  hasStarted,
  hintBalance,
  isCompleted,
  isSelectedDailyFree,
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
  startTodayPuzzle,
  todayPuzzleSummaries,
}: HomeScreenProps) {
  const [isPackInfoOpen, setIsPackInfoOpen] = useState(false);
  const isLoadingPuzzlePack = loadState === "loading";
  const isAttemptExhaustedUncompleted =
    hasStarted && remainingAttempts <= 0 && !isCompleted;
  const primaryLabel = isLoadingPuzzlePack
    ? "불러오는 중"
    : isCompleted
      ? "결과 보기"
      : isAttemptExhaustedUncompleted
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
      : isAttemptExhaustedUncompleted
        ? "도전 종료"
        : hasStarted
          ? `${completedEntries.length}/${puzzle.entries.length} 단어 · ${progressPercent}% 진행 중`
          : "도전 준비 완료";
  const completionStatsLabel = formatCompletionStatsLabel(
    completionStatsByPuzzleId[puzzle.puzzleId],
    completionStatsMinDisplayCount,
  );
  const completionStatsMetricsLabel = formatCompletionStatsMetrics(
    completionStatsByPuzzleId[puzzle.puzzleId],
    completionStatsMinDisplayCount,
  );
  const selectedPuzzleSummary =
    findPuzzleSummaryById(puzzleSummaries, selectedPuzzleId) ??
    createPuzzleSummary(puzzle);
  const selectedPuzzleLabel =
    loadState === "remote"
      ? formatPuzzleCardSequenceLabel(selectedPuzzleSummary)
      : formatPuzzleAliasLabel(selectedPuzzleSummary);
  const isPrimaryDisabled =
    isLoadingPuzzlePack ||
    (!isCompleted && !hasStarted && remainingAttempts === 0);
  const missionLeadLabel = isLoadingPuzzlePack
    ? "원격 퍼즐팩"
    : loadState === "remote"
      ? `퍼즐팩 ${selectedPuzzleLabel}`
      : "선택한 미션";
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
  const streakMilestoneHint = !isLoadingPuzzlePack
    ? getStreakMilestoneProgress(consecutiveStreak)
    : null;
  // 홈 최상단 원탭 CTA: 선택 단계 없이 오늘의 퍼즐로 바로 진입시킨다. 라벨은
  // 오늘의 퍼즐이 선택된 경우에만 진행 상태(이어 풀기/결과 보기)를 반영한다.
  const quickStartLabel = isLoadingPuzzlePack
    ? "오늘의 퍼즐 준비 중"
    : isSelectedDailyFree
      ? isCompleted || isAttemptExhaustedUncompleted
        ? "오늘의 퍼즐 결과 보기"
        : hasStarted
          ? "오늘의 퍼즐 이어 풀기"
          : "오늘의 퍼즐 바로 시작"
      : "오늘의 퍼즐 바로 시작";
  const isQuickStartDisabled = isSelectedDailyFree
    ? isPrimaryDisabled
    : isLoadingPuzzlePack;

  return (
    <>
      <Top
        title="가로세로 낱말 퍼즐"
        subtitleBottom={`${
          loadState === "remote"
            ? `${selectedPuzzleLabel} · ${formatGameHeaderDate(mission.date)}`
            : formatMissionDateLabel(mission.date, loadState)
        }${consecutiveStreak > 0 ? ` · 🔥 ${consecutiveStreak}일째 도전 중` : ""}`}
      />

      <button
        type="button"
        className="homeQuickStart"
        disabled={isQuickStartDisabled}
        onClick={startTodayPuzzle}
      >
        <span className="homeQuickStartLabel">{quickStartLabel}</span>
        <span className="homeQuickStartHint">
          한 번 눌러 바로 풀기 시작
        </span>
      </button>

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
          {!isLoadingPuzzlePack && completionStatsMetricsLabel !== "" && (
            <Paragraph typography="t7" color="#8b95a1">
              {completionStatsMetricsLabel}
            </Paragraph>
          )}
          {!isLoadingPuzzlePack && streakMilestoneHint != null && (
            <p className="streakNudge">{streakMilestoneHint}</p>
          )}
        </div>

        <MiniPuzzlePreview puzzle={puzzle} isLoading={isLoadingPuzzlePack} />

        <div
          className="attemptStrip"
          aria-label={isCompleted ? "완료 통계" : "도전 상태"}
        >
          {isCompleted ? (
            <>
              <div>
                <Paragraph typography="t7" color="#6b7684">
                  도전 횟수
                </Paragraph>
                <Paragraph typography="t5" fontWeight="bold">
                  {mission.attemptsUsed}회
                </Paragraph>
              </div>
              <div>
                <Paragraph typography="t7" color="#6b7684">
                  풀이 시간
                </Paragraph>
                <Paragraph typography="t5" fontWeight="bold">
                  {formatElapsedTime(
                    mission.lastStartedAt,
                    mission.completedAt,
                  ) ?? "−"}
                </Paragraph>
              </div>
              <div>
                <Paragraph typography="t7" color="#6b7684">
                  사용 힌트
                </Paragraph>
                <Paragraph typography="t5" fontWeight="bold">
                  {hintBalance.used}회
                </Paragraph>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        <div
          className="progressTrack"
          role="progressbar"
          aria-label="진행률"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      </section>

      <TodayPuzzleNavigator
        dateCardStates={dateCardStates}
        loadState={loadState}
        puzzleSummaries={todayPuzzleSummaries}
        selectedPuzzleId={selectedPuzzleId}
        selectPuzzle={selectPuzzle}
      />

      <button
        className="cluePeek"
        type="button"
        aria-label={`${primaryLabel}: 대표 단서`}
        disabled={isPrimaryDisabled}
        onClick={isCompleted ? () => navigate("result") : startOrResumeMission}
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

type TodayPuzzleNavigatorProps = Pick<
  DateSelectionProps,
  "dateCardStates" | "loadState" | "selectedPuzzleId" | "selectPuzzle"
> & {
  puzzleSummaries: PuzzleManifestItem[];
};

function TodayPuzzleNavigator({
  dateCardStates,
  loadState,
  puzzleSummaries,
  selectedPuzzleId,
  selectPuzzle,
}: TodayPuzzleNavigatorProps) {
  if (loadState === "loading" || puzzleSummaries.length <= 1) {
    return null;
  }

  const isRemotePack = loadState === "remote";

  return (
    <section className="todayPuzzleRail" aria-label="오늘 열린 퍼즐">
      <div className="todayPuzzleRailHeader">
        <strong>오늘 열린 퍼즐</strong>
        <span>{puzzleSummaries.length}개</span>
      </div>
      <div className="todayPuzzleScroller">
        {puzzleSummaries.map((summary) => {
          const state = dateCardStates[summary.puzzleId];
          const isSelected = summary.puzzleId === selectedPuzzleId;
          const statusLabel =
            state?.completedAt != null
              ? "완료"
              : state?.attemptsUsed != null &&
                  state.attemptsUsed >= DAILY_ATTEMPT_LIMIT
                ? "도전 종료"
                : state?.hasProgress
                  ? "진행 중"
                  : "대기";
          const titleLabel = isRemotePack
            ? formatPuzzleCardSequenceLabel(summary)
            : formatPuzzleAliasLabel(summary);

          return (
            <button
              key={summary.puzzleId}
              className={[
                "todayPuzzleChip",
                isSelected ? "todayPuzzleChipSelected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              aria-pressed={isSelected}
              onClick={() => void selectPuzzle(summary.puzzleId)}
            >
              <span>{titleLabel}</span>
              <strong>{statusLabel}</strong>
              <em>
                {[
                  formatDifficultyLabel(summary.difficulty),
                  `${summary.metrics?.wordCount ?? "-"}개 낱말`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </em>
            </button>
          );
        })}
      </div>
    </section>
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

  const aliasLabel = formatPuzzleAliasLabel(summary);
  const slotLabel = formatPuzzleCardSlot(summary);
  const wordCountLabel = `${summary.metrics?.wordCount ?? "-"}개 낱말`;

  return slotLabel === ""
    ? `${aliasLabel} · ${wordCountLabel}`
    : `${aliasLabel} · ${slotLabel} 도착 · ${wordCountLabel}`;
}

function formatWaitingDescription(
  nextAt: Date | undefined,
  intervalHours: number,
  now: Date | undefined,
): string {
  if (nextAt == null) {
    const safeHours = Number.isFinite(intervalHours)
      ? Math.max(1, Math.floor(intervalHours))
      : 2;
    return `약 ${safeHours}시간 후 새 보너스 퍼즐이 발행돼요.`;
  }
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const nextMs = nextAt.getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(nextMs)) {
    return "새 보너스 퍼즐이 곧 발행돼요.";
  }
  const totalMinutes = Math.ceil((nextMs - nowMs) / 60_000);
  if (totalMinutes <= 0) {
    return "새 보너스 퍼즐이 곧 발행돼요.";
  }
  if (totalMinutes < 60) {
    return `${totalMinutes}분 후 새 보너스 퍼즐이 발행돼요.`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0
    ? `${hours}시간 후 새 보너스 퍼즐이 발행돼요.`
    : `${hours}시간 ${minutes}분 후 새 보너스 퍼즐이 발행돼요.`;
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
            : formatWaitingDescription(
                state.nextBonusPublishedAt,
                state.generationIntervalHours,
                state.now,
              );
  const buttonLabel =
    state.status === "available"
      ? state.isAdBusy
        ? "광고 준비 중"
        : "광고 보고 하나 더 풀기"
      : "";
  const canShowAction = state.status === "available";
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
  isLoading?: boolean;
};

function MiniPuzzlePreview({ puzzle, isLoading }: MiniPuzzlePreviewProps) {
  if (isLoading) {
    return (
      <div className="miniBoard" aria-hidden="true">
        {Array.from({ length: 49 }, (_, i) => (
          <span key={i} className="miniCell miniCellSkeleton" />
        ))}
      </div>
    );
  }

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

function formatPuzzleCardSequenceLabel(summary: PuzzleManifestItem) {
  const sequenceNumber = getPuzzleDailySequenceNumber(summary);

  return sequenceNumber == null
    ? "퍼즐 --번"
    : `퍼즐 ${String(sequenceNumber).padStart(2, "0")}번`;
}

function formatPuzzleHistoryLabel(
  summary: PuzzleManifestItem,
  loadState: LoadState,
) {
  const aliasLabel = formatPuzzleAliasLabel(summary);

  return loadState === "remote"
    ? `${formatPuzzleCardSequenceLabel(summary)} · ${aliasLabel}`
    : aliasLabel;
}

function getDateCardStatus(state?: DateCardState) {
  if (state?.completedAt != null) {
    return "완료";
  }

  if (
    state?.attemptsUsed != null &&
    state.attemptsUsed >= DAILY_ATTEMPT_LIMIT
  ) {
    return "도전 종료";
  }

  if (state?.hasProgress) {
    return "진행";
  }

  return "대기";
}

function formatLiveTimer(totalSeconds: number): string {
  const total = Math.floor(totalSeconds);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState(
    () => getElapsedSeconds(startedAt) ?? 0,
  );

  useEffect(() => {
    setSeconds(getElapsedSeconds(startedAt) ?? 0);
    const id = window.setInterval(() => {
      setSeconds(getElapsedSeconds(startedAt) ?? 0);
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return (
    <span
      className="liveTimerDisplay"
      aria-label={`경과 시간 ${formatLiveTimer(seconds)}`}
    >
      {formatLiveTimer(seconds)}
    </span>
  );
}

function formatElapsedTime(
  startedAt: string | undefined,
  completedAt: string | undefined,
): string | null {
  if (startedAt == null || completedAt == null) {
    return null;
  }

  const elapsedMs =
    new Date(completedAt).getTime() - new Date(startedAt).getTime();

  if (Number.isNaN(elapsedMs) || elapsedMs < 0) {
    return null;
  }

  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${totalSeconds}초`;
  }

  return `${minutes}분 ${String(seconds).padStart(2, "0")}초`;
}

function buildShareText({
  puzzleLabel,
  elapsedLabel,
  hintCount,
  attemptsUsed,
  completedCount,
  totalCount,
  consecutiveStreak,
  isComplete,
  revealUsed,
}: {
  puzzleLabel: string;
  elapsedLabel: string | null;
  hintCount: number;
  attemptsUsed: number;
  completedCount: number;
  totalCount: number;
  consecutiveStreak: number;
  isComplete: boolean;
  revealUsed: boolean;
}): string {
  const lines: string[] = [`가로세로 낱말 퍼즐 ${puzzleLabel}`, ""];

  const stats: string[] = [];
  if (elapsedLabel != null) stats.push(`⏱ ${elapsedLabel}`);
  stats.push(`도전 ${attemptsUsed}회`);
  if (hintCount > 0) stats.push(`힌트 ${hintCount}회`);
  lines.push(stats.join(" · "));

  const achievements = getCompletionAchievements({
    hintCount,
    attemptsUsed,
    revealUsed,
  });
  const badges: string[] = [];
  if (isComplete && achievements.noHint) badges.push("🎯 노힌트 클리어");
  if (isComplete && achievements.firstTry) badges.push("💎 첫 도전 성공");
  if (badges.length > 0) lines.push(badges.join(" · "));

  if (consecutiveStreak >= 100) {
    lines.push(`🏆 ${consecutiveStreak}일 연속 달성!`);
  } else if (consecutiveStreak >= 30) {
    lines.push(`🏆 ${consecutiveStreak}일째 — 한 달 연속 도전 중!`);
  } else if (consecutiveStreak >= 7) {
    lines.push(`🔥 ${consecutiveStreak}일째 — 일주일 연속 도전 중!`);
  } else if (consecutiveStreak > 0) {
    lines.push(`🔥 ${consecutiveStreak}일째 도전 중`);
  }

  lines.push(
    isComplete
      ? `낱말 ${completedCount}/${totalCount}개 완성 🎉`
      : `낱말 ${completedCount}/${totalCount}개 도전`,
  );

  return lines.join("\n");
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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastScrolledRef = useRef<{
    key: string;
    scroller: HTMLDivElement;
  } | null>(null);
  const todayKey = getTodayDateKey();

  const puzzleIdsKey = JSON.stringify(
    puzzleSummaries.map((p) => String(p.puzzleId)),
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller == null) return;
    const scrollKey = `${selectedPuzzleId}::${puzzleIdsKey}`;
    const last = lastScrolledRef.current;
    if (last?.key === scrollKey && last?.scroller === scroller) return;
    const allCards =
      scroller.querySelectorAll<HTMLButtonElement>("[data-puzzle-id]");
    const selectedCard = Array.from(allCards).find(
      (el) => el.dataset.puzzleId === String(selectedPuzzleId),
    );
    if (selectedCard == null) return;
    lastScrolledRef.current = { key: scrollKey, scroller };
    const prefersReducedMotion =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : true;
    try {
      selectedCard.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        inline: "nearest",
        block: "nearest",
      });
    } catch {
      selectedCard.scrollIntoView();
    }
  }, [selectedPuzzleId, loadState, puzzleIdsKey]);

  if (loadState === "loading") {
    return (
      <section className="dateRail" aria-label="퍼즐팩 로딩" aria-busy="true">
        <div className="dateScroller">
          {[0, 1, 2].map((i) => (
            <div key={i} className="dateCard dateLoading" aria-hidden="true">
              <span />
              <strong />
              <em />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const isFallbackPack = loadState === "fallback";

  return (
    <section className="dateRail" aria-label="퍼즐 날짜 선택">
      <div className="dateScroller" ref={scrollerRef}>
        {puzzleSummaries.map((summary, index) => {
          const state = dateCardStates[summary.puzzleId];
          const isSelected = summary.puzzleId === selectedPuzzleId;
          const isToday = !isFallbackPack && summary.date === todayKey;
          const sequenceLabel = isFallbackPack
            ? ""
            : formatPuzzleCardSequenceLabel(summary);
          const statusLabel = getDateCardStatus(state);
          const wordCountLabel = `${summary.metrics?.wordCount ?? "-"}개`;
          const completionStatsLabel = formatCompletionStatsLabel(
            completionStatsByPuzzleId[summary.puzzleId],
            completionStatsMinDisplayCount,
            "compact",
          );
          const estimatedSolveLabel = formatEstimatedSolveLabel(
            completionStatsByPuzzleId[summary.puzzleId],
            completionStatsMinDisplayCount,
          );
          const isEasy = !isFallbackPack && summary.difficulty === "easy";
          const eyebrowLabel = isFallbackPack
            ? "기기저장"
            : isToday
              ? "오늘"
              : `${formatDateCardWeekday(summary.date)} ${formatDateCardDay(
                  summary.date,
                )}`;
          const titleLabel = isFallbackPack
            ? formatFallbackCardTitle(index, puzzleSummaries.length)
            : sequenceLabel;
          const difficultyLabel = formatDifficultyLabel(summary.difficulty);
          const metaLabel =
            !isFallbackPack && completionStatsLabel !== ""
              ? completionStatsLabel
              : [statusLabel, wordCountLabel].filter(Boolean).join(" · ");
          const ariaLabel = isFallbackPack
            ? [eyebrowLabel, titleLabel, difficultyLabel, statusLabel]
                .filter(Boolean)
                .join(" ")
            : [
                titleLabel,
                isToday
                  ? `오늘 ${formatGameHeaderDate(summary.date)}`
                  : formatGameHeaderDate(summary.date),
                difficultyLabel,
                estimatedSolveLabel !== ""
                  ? `예상 소요 ${estimatedSolveLabel}`
                  : "",
                statusLabel,
              ]
                .filter(Boolean)
                .join(" ");

          return (
            <button
              key={summary.puzzleId}
              data-puzzle-id={summary.puzzleId}
              className={[
                "dateCard",
                isSelected ? "dateSelected" : "",
                state?.completedAt != null ? "dateCompleted" : "",
                isToday ? "dateToday" : "",
                isEasy ? "dateEasy" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              aria-label={ariaLabel}
              aria-pressed={isSelected}
              onClick={() => void selectPuzzle(summary.puzzleId)}
            >
              <span>{eyebrowLabel}</span>
              <strong>{titleLabel}</strong>
              {difficultyLabel !== "" || estimatedSolveLabel !== "" ? (
                <span className="dateCardValue">
                  {difficultyLabel !== "" ? (
                    <span
                      className={[
                        "dateDifficulty",
                        summary.difficulty
                          ? `difficulty-${summary.difficulty}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {difficultyLabel}
                    </span>
                  ) : null}
                  {estimatedSolveLabel !== "" ? (
                    <span className="dateEstimate">{estimatedSolveLabel}</span>
                  ) : null}
                </span>
              ) : null}
              <em>{metaLabel}</em>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type AppHeaderProps = {
  eyebrow?: ReactNode;
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
  answerInputMode: AnswerInputMode;
  selectAnswerInputMode: (mode: AnswerInputMode) => void;
  applyAnswer: (entry: PuzzleEntry, value: string) => void;
  applyAnswerSegment: (
    entry: PuzzleEntry,
    value: string,
    startCellKey?: string,
  ) => void;
  autocheckEnabled: boolean;
  cellValues: Record<string, string>;
  checkedCellKeys: ReadonlySet<string>;
  checkSelectedWord: () => void;
  clearAnswerCell: (entry: PuzzleEntry, cellKey?: string) => void;
  clearEntryAnswer: (entry: PuzzleEntry) => void;
  consecutiveStreak: number;
  clueEntries: PuzzleEntry[];
  completedEntries: PuzzleEntry[];
  completionCelebrationId: string | null;
  dismissCompletionCelebration: () => void;
  hasStarted: boolean;
  hintBalance: HintBalance;
  hintCount: number;
  isCompleted: boolean;
  isFirstInputGuideVisible: boolean;
  isNewBestTime: boolean;
  mission: DailyMissionState;
  navigate: (route: AppRoute) => void;
  puzzle: Puzzle;
  remainingAttempts: number;
  revealLetter: () => void;
  revealSelectedWord: () => void;
  revealUsed: boolean;
  selectedAnswer: string;
  selectedCellKey: string;
  selectedDirection: Direction;
  selectedEntry?: PuzzleEntry;
  startLabels: Map<string, number>;
  setSelectedDirection: (direction: Direction) => void;
  selectCell: (row: number, col: number) => void;
  selectEntry: (entry: PuzzleEntry, cellKey?: string) => void;
  startOrResumeMission: () => void;
  toggleAutocheck: () => void;
  useHint: () => void;
  viewModel: PuzzleViewModel;
};

function TodayScreen({
  answerInputMode,
  selectAnswerInputMode,
  applyAnswer,
  applyAnswerSegment,
  autocheckEnabled,
  cellValues,
  checkedCellKeys,
  checkSelectedWord,
  clearAnswerCell,
  clearEntryAnswer,
  completedEntries,
  completionCelebrationId,
  completionStatsByPuzzleId,
  completionStatsMinDisplayCount,
  consecutiveStreak,
  dateCardStates,
  dismissCompletionCelebration,
  hasStarted,
  hintBalance,
  hintCount,
  isCompleted,
  isFirstInputGuideVisible,
  isNewBestTime,
  loadState,
  mission,
  navigate,
  puzzle,
  puzzleSummaries,
  remainingAttempts,
  revealSelectedWord,
  revealUsed,
  selectedCellKey,
  selectedPuzzleId,
  selectedEntry,
  selectPuzzle,
  startLabels,
  selectCell,
  selectEntry,
  startOrResumeMission,
  toggleAutocheck,
  useHint,
  viewModel,
}: TodayScreenProps) {
  const [isClueListOpen, setIsClueListOpen] = useState(false);
  const [answerInputResetKey, setAnswerInputResetKey] = useState(0);
  const boardInputRef = useRef<HTMLInputElement>(null);
  const boxInputRef = useRef<HTMLInputElement>(null);
  const starterFocusPuzzleIdRef = useRef<string>("");
  const commitTimerRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);
  const [inputValue, setInputValue] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const compositionStartCellKeyRef = useRef<string | null>(null);
  const compositionEndValueRef = useRef<string | null>(null);
  // A finished puzzle is shown read-only so the saved answers stay intact while
  // the player reviews the completed board.
  const isReviewMode = isCompleted;
  const isAttemptExhaustedUncompleted =
    hasStarted && remainingAttempts <= 0 && !isCompleted;
  const selectedPuzzleSummary =
    findPuzzleSummaryById(puzzleSummaries, selectedPuzzleId) ??
    createPuzzleSummary(puzzle);
  const selectedPuzzleLabel =
    loadState === "remote"
      ? formatPuzzleAliasLabel(selectedPuzzleSummary)
      : formatPuzzleHeaderLabel(puzzle.date, loadState);
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
        : getPendingAnswerCellValues(
            selectedEntry,
            inputValue,
            selectedCellKey,
          ),
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

  const moveBoardInputCaretToEnd = useCallback(
    (input: HTMLInputElement | null = boardInputRef.current) => {
      if (input == null) {
        return;
      }

      const moveCaret = () => {
        if (input == null || !input.isConnected) {
          return;
        }

        const position = input.value.length;
        input.setSelectionRange(position, position);
      };

      moveCaret();
      requestAnimationFrame(moveCaret);
    },
    [],
  );

  const resetBoardInputValue = useCallback(() => {
    setInputValue("");

    if (boardInputRef.current != null) {
      boardInputRef.current.value = "";
      moveBoardInputCaretToEnd(boardInputRef.current);
    }
  }, [moveBoardInputCaretToEnd]);

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
    resetBoardInputValue();
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
    compositionStartCellKeyRef.current = null;
    isComposingRef.current = false;
    resetBoardInputValue();
    setIsComposing(false);
  }, [
    activeCellKey,
    answerInputResetKey,
    clearCommitTimer,
    resetBoardInputValue,
    selectedEntry?.id,
  ]);

  useEffect(() => () => clearCommitTimer(), [clearCommitTimer]);

  // In box mode the word input is uncontrolled, so external cell changes (most
  // notably hint reveals) don't reach it on their own. Mirror the committed
  // letters into it whenever they change — but skip while it's focused so live
  // typing / IME composition isn't clobbered.
  useEffect(() => {
    if (answerInputMode !== "box") {
      return;
    }

    const input = boxInputRef.current;

    if (input == null || document.activeElement === input) {
      return;
    }

    const committed = selectedEntryCellKeys
      .map((key) => cellValues[key] ?? "")
      .join("");

    if (input.value !== committed) {
      input.value = committed;
    }
  }, [answerInputMode, cellValues, selectedEntryCellKeys]);

  // 시작 직후 침묵 이탈(첫 입력 0) 방지: 첫 입력 가이드가 처음 노출될 때 가장 쉬운
  // 단어를 선택해 "여기부터" 하이라이트를 모으고, 입력창에 포커스해 키보드를 띄운다.
  // 키보드 자동 노출은 브라우저/웹뷰 정책상 best-effort이며, 퍼즐당 1회만 실행한다.
  useEffect(() => {
    if (!isFirstInputGuideVisible) {
      return;
    }

    if (starterFocusPuzzleIdRef.current === puzzle.puzzleId) {
      return;
    }
    starterFocusPuzzleIdRef.current = puzzle.puzzleId;

    const starterEntry = getStarterEntry(puzzle);
    if (starterEntry != null) {
      selectEntry(starterEntry);
    }

    requestAnimationFrame(() => {
      if (answerInputMode === "box") {
        boxInputRef.current?.focus({ preventScroll: true });
      } else {
        boardInputRef.current?.focus({ preventScroll: true });
      }
    });
  }, [answerInputMode, isFirstInputGuideVisible, puzzle, selectEntry]);

  function focusPuzzleBoard() {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".puzzleBoard")?.focus({
        preventScroll: true,
      });
    });
  }

  function focusNativeInput() {
    // In box mode the hidden per-cell input is not mounted; route focus to the
    // visible word input instead so all existing call sites keep working.
    if (answerInputMode === "box") {
      boxInputRef.current?.focus({ preventScroll: true });
      return;
    }

    boardInputRef.current?.focus({ preventScroll: true });
  }

  function selectCellAndFocus(row: number, col: number) {
    selectCell(row, col);
    focusNativeInput();
  }

  function getAnswerSlotCellKeyFromPoint(clientX: number, clientY: number) {
    for (const slot of document.querySelectorAll<HTMLElement>(".answerSlot")) {
      const cellKey = slot.dataset.cellKey;

      if (cellKey == null || !selectedEntryCellKeys.includes(cellKey)) {
        continue;
      }

      const rect = slot.getBoundingClientRect();

      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return cellKey;
      }
    }

    return null;
  }

  function selectAnswerSlotFromPoint(clientX: number, clientY: number) {
    if (selectedEntry == null) {
      return;
    }

    const cellKey = getAnswerSlotCellKeyFromPoint(clientX, clientY);

    if (cellKey == null) {
      focusNativeInput();
      return;
    }

    if (isComposingRef.current || isComposing) {
      focusNativeInput();
      return;
    }

    selectEntry(selectedEntry, cellKey);
    focusNativeInput();
  }

  function handleAnswerSlotInputPointerDown(
    event: ReactPointerEvent<HTMLInputElement>,
  ) {
    selectAnswerSlotFromPoint(event.clientX, event.clientY);
  }

  function handleAnswerSlotInputClick(
    event: ReactMouseEvent<HTMLInputElement>,
  ) {
    selectAnswerSlotFromPoint(event.clientX, event.clientY);
  }

  function handleAnswerSlotInputTouchStart(
    event: ReactTouchEvent<HTMLInputElement>,
  ) {
    const touch = event.touches[0] ?? event.changedTouches[0];

    if (touch == null) {
      focusNativeInput();
      return;
    }

    selectAnswerSlotFromPoint(touch.clientX, touch.clientY);
  }

  function commitInputValue(value: string, startCellKey = activeCellKey) {
    if (selectedEntry == null) {
      return;
    }

    clearCommitTimer();
    const remainingCellCount =
      selectedEntryCells.length -
      getEntryCellIndex(selectedEntry, startCellKey);
    const nextLetters = getAnswerCommitLetters(value, remainingCellCount);

    if (nextLetters.length > 0) {
      applyAnswerSegment(selectedEntry, nextLetters.join(""), startCellKey);
    }

    resetBoardInputValue();
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

  function hasCompleteDraft(value: string, startCellKey = activeCellKey) {
    if (selectedEntry == null) {
      return false;
    }

    const remainingCellCount =
      selectedEntryCells.length -
      getEntryCellIndex(selectedEntry, startCellKey);

    return (
      getAnswerCommitLetters(value, remainingCellCount).length >=
      remainingCellCount
    );
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
    delayMs = DIRECT_INPUT_COMMIT_DELAY_MS,
  ) {
    if (selectedEntry == null) {
      return;
    }

    clearCommitTimer();

    if (isHangulJamoInput(value)) {
      return;
    }

    if (!hasCompleteDraft(value, startCellKey)) {
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

    selectEntry(
      selectedEntry,
      selectedEntryCellKeys[nextIndex] ?? activeCellKey,
    );
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

  const solvePercent = Math.round(
    Math.min(
      100,
      Math.max(
        0,
        puzzle.entries.length > 0
          ? (completedEntries.length / puzzle.entries.length) * 100
          : 0,
      ),
    ),
  );
  const answerSlotColumnCount =
    selectedEntryCells.length <= 5 ? selectedEntryCells.length : 4;
  const answerSlotInputStyle = {
    "--answer-slot-width": `${answerSlotColumnCount * 44 + Math.max(0, answerSlotColumnCount - 1) * 7}px`,
  } as CSSProperties;
  // Box mode edits the whole word at once, so seed the field with the letters
  // already committed for the selected entry.
  const selectedEntryCommittedValue = selectedEntryCellKeys
    .map((key) => cellValues[key] ?? "")
    .join("");
  // Box mode edits the whole word at once. Cell mode never overwrites an
  // already-correct (locked) cell because its caret skips them; mirror that
  // here so editing one word can't undo a correct crossing letter.
  function applyBoxValue(entry: PuzzleEntry, value: string) {
    const cells = getEntryCells(entry);
    const letters = getAnswerInputLetters(value, cells.length);
    const merged = selectedEntryCellKeys
      .map((key, index) =>
        isCellLocked(puzzle, cellValues, key)
          ? getCellAnswerLetter(puzzle, key)
          : (letters[index] ?? ""),
      )
      .join("");

    applyAnswer(entry, merged);
  }
  const answerInputElement =
    selectedEntry != null && !isReviewMode ? (
      <div className="answerInputArea">
        {answerInputMode === "cell" ? (
          <div className="answerSlotInput">
            <div
              className="answerSlotGrid"
              style={answerSlotInputStyle}
              role="group"
              aria-label={`${formatEntryReference(selectedEntry, startLabels)} 답 입력`}
            >
              {selectedEntryCellKeys.map((key, index) => {
                const pendingValue = pendingAnswerCellValues[key] ?? "";
                const committedValue = cellValues[key] ?? "";
                const displayValue =
                  pendingValue !== "" ? pendingValue : committedValue;
                const isActive = key === activeCellKey;
                const isLocked = isCellLocked(puzzle, cellValues, key);
                const isWrong =
                  pendingValue === "" &&
                  committedValue !== "" &&
                  committedValue !== getCellAnswerLetter(puzzle, key);

                return (
                  <button
                    key={key}
                    data-cell-key={key}
                    className={[
                      "answerSlot",
                      committedValue !== "" ? "answerSlotFilled" : "",
                      isActive ? "answerSlotActive" : "",
                      pendingValue !== "" ? "answerSlotPending" : "",
                      isLocked ? "answerSlotLocked" : "",
                      isWrong ? "answerSlotWrong" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    type="button"
                    aria-label={`${index + 1}번째 글자 ${
                      displayValue === "" ? "비어 있음" : displayValue
                    }`}
                    aria-pressed={isActive}
                    onClick={() => {
                      selectEntry(selectedEntry, key);
                      focusNativeInput();
                    }}
                  >
                    {displayValue}
                  </button>
                );
              })}
            </div>
            <input
              ref={boardInputRef}
              className="answerSlotNativeInput"
              inputMode="text"
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="next"
              maxLength={selectedRemainingCellCount}
              spellCheck={false}
              aria-label={`${selectedRemainingCellCount}글자 답 입력`}
              onClick={handleAnswerSlotInputClick}
              onPointerDown={handleAnswerSlotInputPointerDown}
              onTouchStart={handleAnswerSlotInputTouchStart}
              onFocus={(event) => moveBoardInputCaretToEnd(event.currentTarget)}
              onCompositionStart={(event) => {
                clearCommitTimer();
                compositionStartCellKeyRef.current = activeCellKey;
                compositionEndValueRef.current = null;
                isComposingRef.current = true;
                setIsComposing(true);
                moveBoardInputCaretToEnd(event.currentTarget);
              }}
              onCompositionUpdate={(event) => {
                setInputValue(event.currentTarget.value || event.data);
                clearCommitTimer();
              }}
              onCompositionEnd={(event) => {
                const nextValue = event.currentTarget.value;
                const startCellKey = compositionStartCellKeyRef.current;

                isComposingRef.current = false;
                compositionStartCellKeyRef.current = null;
                setIsComposing(false);

                if (startCellKey == null) {
                  resetBoardInputValue();
                  return;
                }

                compositionEndValueRef.current = nextValue;
                setInputValue(nextValue);
                moveBoardInputCaretToEnd(event.currentTarget);
                queueCommitInputValue(
                  nextValue,
                  startCellKey,
                  COMPOSITION_COMMIT_DELAY_MS,
                );
              }}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                const nativeEvent = event.nativeEvent as InputEvent;

                if (
                  isComposing ||
                  isComposingRef.current ||
                  nativeEvent.isComposing ||
                  nativeEvent.inputType === "insertCompositionText"
                ) {
                  setInputValue(nextValue);
                  clearCommitTimer();
                  return;
                }

                setInputValue(nextValue);
                if (compositionEndValueRef.current === nextValue) {
                  compositionEndValueRef.current = null;
                  return;
                }

                moveBoardInputCaretToEnd(event.currentTarget);
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
          </div>
        ) : null}
        {answerInputMode === "box" ? (
          <input
            ref={boxInputRef}
            key={`answer-box-${selectedEntry.id}-${answerInputResetKey}-${hintCount}`}
            className="answerBoxInput"
            inputMode="text"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="next"
            spellCheck={false}
            maxLength={selectedEntryCells.length}
            defaultValue={selectedEntryCommittedValue}
            aria-label={`${selectedEntryCells.length}글자 답 입력`}
            placeholder={`${selectedEntryCells.length}글자 입력`}
            onChange={(event) =>
              applyBoxValue(selectedEntry, event.currentTarget.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                goToAdjacentClue(1);
              }
            }}
          />
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <AppHeader
        compact
        backVariant="home"
        title={`${completedEntries.length}/${puzzle.entries.length} 낱말`}
        eyebrow={
          isReviewMode ? (
            `다 푼 퍼즐 · ${selectedPuzzleLabel}`
          ) : isAttemptExhaustedUncompleted ? (
            `도전 종료 · ${selectedPuzzleLabel}`
          ) : mission.lastStartedAt != null ? (
            <>
              {selectedPuzzleLabel} ·{" "}
              <LiveTimer startedAt={mission.lastStartedAt} />
            </>
          ) : (
            selectedPuzzleLabel
          )
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
                    selectedEntry == null
                      ? "힌트 (먼저 단서를 선택하세요)"
                      : hintBalance.isAdBusy
                        ? "광고 준비 중"
                        : hintBalance.remaining > 0
                          ? `힌트 ${hintBalance.remaining}개 남음`
                          : `힌트 얻기. 광고를 보고 ${hintBalance.rewardedCredits}개 받기`
                  }
                  title={
                    selectedEntry == null
                      ? "먼저 단서를 선택하세요"
                      : hintBalance.isAdBusy
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
                        : hintBalance.adsEnabled
                          ? "+"
                          : "0"}
                  </span>
                </button>
                <button
                  className="iconButton"
                  type="button"
                  aria-label={
                    answerInputMode === "box"
                      ? "입력 방식: 입력창 (탭하여 칸별로 전환)"
                      : "입력 방식: 칸별 (탭하여 입력창으로 전환)"
                  }
                  title={
                    answerInputMode === "box"
                      ? "입력창 입력 · 탭하여 칸별 전환"
                      : "칸별 입력 · 탭하여 입력창 전환"
                  }
                  aria-pressed={answerInputMode === "cell"}
                  onClick={() =>
                    selectAnswerInputMode(
                      answerInputMode === "box" ? "cell" : "box",
                    )
                  }
                >
                  <InputModeIcon mode={answerInputMode} />
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

      {!isReviewMode ? (
        <div
          className="solveProgressBar"
          role="progressbar"
          aria-valuenow={solvePercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`퍼즐 완성도 ${solvePercent}%`}
        >
          <span style={{ width: `${solvePercent}%` }} />
        </div>
      ) : null}

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
              aria-label={`${formatEntryReference(
                selectedEntry,
                startLabels,
              )} ${selectedEntry.clue}${isSelectedComplete ? " 완료" : ""}`}
              onClick={() => {
                selectEntry(selectedEntry, activeCellKey);
                focusNativeInput();
              }}
            >
              <strong
                className={[
                  "solveClueText",
                  isSelectedComplete ? "solveClueTextComplete" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {selectedEntry.clue}
              </strong>
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
          {answerInputElement}
        </div>
      ) : null}

      {!isReviewMode ? (
        <div className="solveAssistBar" role="group" aria-label="정답 확인 도구">
          <button
            className="assistButton"
            type="button"
            disabled={selectedEntry == null}
            onClick={checkSelectedWord}
          >
            이 단어 확인
          </button>
          <button
            className="assistButton"
            type="button"
            disabled={selectedEntry == null}
            onClick={revealSelectedWord}
          >
            정답 보기
          </button>
          <button
            className={[
              "assistButton",
              "assistToggle",
              autocheckEnabled ? "assistToggleOn" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            aria-pressed={autocheckEnabled}
            title="입력한 글자의 오답을 빨갛게 표시할지 설정해요"
            onClick={toggleAutocheck}
          >
            오답 표시 {autocheckEnabled ? "켜짐" : "꺼짐"}
          </button>
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
      ) : isAttemptExhaustedUncompleted ? (
        <div
          className="exhaustedBanner"
          role="region"
          aria-label="도전 종료 안내"
        >
          <span>
            오늘 도전 기회를 모두 사용했어요 · 내일 다시 도전해 보세요
          </span>
          <button
            className="exhaustedBannerLink"
            type="button"
            onClick={() => navigate("result")}
          >
            결과 보기
          </button>
        </div>
      ) : null}

      <section className="puzzlePlayArea" aria-label="퍼즐 풀이">
        <PuzzleBoard
          autocheckEnabled={autocheckEnabled}
          cellEntries={viewModel.cellEntries}
          cellValues={cellValues}
          checkedCellKeys={checkedCellKeys}
          cols={viewModel.cols}
          completedEntries={completedEntries}
          pendingCellValues={pendingAnswerCellValues}
          rows={viewModel.rows}
          selectedCells={viewModel.selectedCells}
          selectCell={selectCellAndFocus}
          startLabels={viewModel.startLabels}
          puzzle={puzzle}
        />

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
          attemptsUsed={mission.attemptsUsed}
          completedCount={completedEntries.length}
          consecutiveStreak={consecutiveStreak}
          elapsedLabel={formatElapsedTime(
            mission.lastStartedAt,
            mission.completedAt,
          )}
          hintCount={hintCount}
          isNewBestTime={isNewBestTime}
          revealUsed={revealUsed}
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
  attemptsUsed: number;
  completedCount: number;
  consecutiveStreak: number;
  elapsedLabel: string | null;
  hintCount: number;
  isNewBestTime: boolean;
  revealUsed: boolean;
  totalCount: number;
  onClose: () => void;
  onGoHome: () => void;
  onSeeResult: () => void;
};

function CompletionCelebrationDialog({
  attemptsUsed,
  completedCount,
  consecutiveStreak,
  elapsedLabel,
  hintCount,
  isNewBestTime,
  revealUsed,
  totalCount,
  onClose,
  onGoHome,
  onSeeResult,
}: CompletionCelebrationDialogProps) {
  const streakBadge = getStreakBadgeLabel(consecutiveStreak);
  const nextStreakHint = getNextStreakMilestoneHint(consecutiveStreak);
  const achievements = getCompletionAchievements({
    hintCount,
    attemptsUsed,
    revealUsed,
  });

  const hasAchievements =
    isNewBestTime ||
    achievements.noHint ||
    achievements.firstTry ||
    streakBadge != null;

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
        <div className="confettiContainer" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className={`confettiPiece confettiPiece--${i + 1}`} />
          ))}
        </div>
        <div className="completionDialogBadge" aria-hidden="true">
          🎉
        </div>
        <div className="rewardDialogText">
          <h2 id="completionDialogTitle">퍼즐을 완성했어요!</h2>
          <p id="completionDialogDescription">
            낱말 {completedCount}/{totalCount}개를 모두 맞췄어요
            {hintCount > 0 ? ` · 힌트 ${hintCount}회 사용` : ""}.
          </p>
          {elapsedLabel != null && (
            <p className="celebrationStat">⏱ {elapsedLabel}</p>
          )}
          {hasAchievements && (
            <div className="resultAchievements">
              {isNewBestTime && (
                <span className="resultAchievement resultAchievementBest">
                  🏆 최고 기록 갱신!
                </span>
              )}
              {achievements.noHint && (
                <span className="resultAchievement">🎯 노힌트 클리어</span>
              )}
              {achievements.firstTry && (
                <span className="resultAchievement">💎 첫 도전 성공</span>
              )}
              {streakBadge != null && (
                <span className="resultAchievement">{streakBadge}</span>
              )}
            </div>
          )}
          {nextStreakHint != null && (
            <p className="streakNudge">{nextStreakHint}</p>
          )}
        </div>
        <div className="rewardDialogActions">
          <button className="secondaryButton" type="button" onClick={onGoHome}>
            홈으로
          </button>
          <button
            className="primaryButton"
            type="button"
            onClick={onSeeResult}
            autoFocus
          >
            결과 보기
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

function InputModeIcon({ mode }: { mode: AnswerInputMode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="18"
      height="18"
    >
      {mode === "box" ? (
        // 입력창: 단일 텍스트 필드 + 캐럿
        <>
          <rect
            x="3"
            y="8"
            width="18"
            height="8"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M7 12h6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      ) : (
        // 칸별: 셀 그리드
        <>
          <rect
            x="3"
            y="9"
            width="6"
            height="6"
            rx="1"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <rect
            x="9"
            y="9"
            width="6"
            height="6"
            rx="1"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <rect
            x="15"
            y="9"
            width="6"
            height="6"
            rx="1"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );
}

type ResultScreenProps = DateSelectionProps & {
  bonusPuzzlePanelState: BonusPuzzlePanelState;
  completedEntries: PuzzleEntry[];
  consecutiveStreak: number;
  hintCount: number;
  isNewBestTime: boolean;
  mission: DailyMissionState;
  navigate: (route: AppRoute) => void;
  progressPercent: number;
  puzzle: Puzzle;
  remainingAttempts: number;
  requestBonusPuzzle: () => void;
  restartMissionAttempt: () => void;
  revealUsed: boolean;
};

function ResultScreen({
  bonusPuzzlePanelState,
  completedEntries,
  completionStatsByPuzzleId,
  completionStatsMinDisplayCount,
  consecutiveStreak,
  dateCardStates,
  hintCount,
  isNewBestTime,
  loadState,
  mission,
  navigate,
  progressPercent,
  puzzle,
  puzzleSummaries,
  remainingAttempts,
  requestBonusPuzzle,
  restartMissionAttempt,
  revealUsed,
  selectedPuzzleId,
  selectPuzzle,
}: ResultScreenProps) {
  const isComplete = completedEntries.length === puzzle.entries.length;
  // 완료 시 이어서 풀 다음 추천 퍼즐(미완료 우선). 단발 세션을 줄이기 위한 연속 동선.
  const nextRecommendedSummary = isComplete
    ? getNextRecommendedSummary(puzzleSummaries, dateCardStates, puzzle.puzzleId)
    : undefined;
  const nextRecommendedLabel =
    nextRecommendedSummary == null
      ? ""
      : [
          formatPuzzleAliasLabel(nextRecommendedSummary),
          formatDifficultyLabel(nextRecommendedSummary.difficulty),
        ]
          .filter(Boolean)
          .join(" · ");

  function startNextPuzzle() {
    if (nextRecommendedSummary == null) {
      return;
    }

    telemetry.click("next_puzzle_cta", {
      ...getPuzzleTelemetryParams(puzzle),
      next_difficulty: nextRecommendedSummary.difficulty,
      next_puzzle_id: nextRecommendedSummary.puzzleId,
    });
    selectPuzzle(nextRecommendedSummary.puzzleId);
    navigate("today");
  }

  const selectedPuzzleSummary =
    findPuzzleSummaryById(puzzleSummaries, selectedPuzzleId) ??
    createPuzzleSummary(puzzle);
  const selectedPuzzleLabel =
    loadState === "remote"
      ? formatPuzzleAliasLabel(selectedPuzzleSummary)
      : formatMissionDateLabel(mission.date, loadState);
  const elapsedLabel = isComplete
    ? formatElapsedTime(mission.lastStartedAt, mission.completedAt)
    : null;
  const streakAchievementLabel = isComplete
    ? getStreakBadgeLabel(consecutiveStreak)
    : null;
  const nextStreakHint = isComplete
    ? getNextStreakMilestoneHint(consecutiveStreak)
    : null;
  const resultAchievements = getCompletionAchievements({
    hintCount,
    attemptsUsed: mission?.attemptsUsed ?? 0,
    revealUsed,
  });
  const resultStartLabels = useMemo(
    () => buildStartLabels(puzzle.entries),
    [puzzle.entries],
  );
  const [shareCopied, setShareCopied] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const shareTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (shareTimeoutRef.current != null) {
        window.clearTimeout(shareTimeoutRef.current);
      }
    };
  }, []);

  function handleShare() {
    const text = buildShareText({
      puzzleLabel: selectedPuzzleLabel,
      elapsedLabel,
      hintCount,
      attemptsUsed: mission.attemptsUsed,
      completedCount: completedEntries.length,
      totalCount: puzzle.entries.length,
      consecutiveStreak,
      isComplete,
      revealUsed,
    });

    function copyToClipboard() {
      if (typeof navigator.clipboard?.writeText !== "function") {
        setShareCopied(false);
        setShareFailed(true);
        if (shareTimeoutRef.current != null) {
          window.clearTimeout(shareTimeoutRef.current);
          shareTimeoutRef.current = null;
        }
        return;
      }
      try {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setShareCopied(true);
            setShareFailed(false);
            if (shareTimeoutRef.current != null) {
              window.clearTimeout(shareTimeoutRef.current);
            }
            shareTimeoutRef.current = window.setTimeout(() => {
              setShareCopied(false);
              shareTimeoutRef.current = null;
            }, 2000);
          })
          .catch(() => {
            setShareCopied(false);
            setShareFailed(true);
            if (shareTimeoutRef.current != null) {
              window.clearTimeout(shareTimeoutRef.current);
              shareTimeoutRef.current = null;
            }
          });
      } catch {
        setShareCopied(false);
        setShareFailed(true);
        if (shareTimeoutRef.current != null) {
          window.clearTimeout(shareTimeoutRef.current);
          shareTimeoutRef.current = null;
        }
      }
    }

    if (navigator.share != null) {
      void navigator.share({ text }).catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        copyToClipboard();
      });
    } else {
      copyToClipboard();
    }
  }

  return (
    <>
      <AppHeader
        eyebrow={`${selectedPuzzleLabel} · 도전 ${mission.attemptsUsed}/${mission.maxAttempts}`}
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
        {elapsedLabel != null && (
          <p className="resultElapsedTime">⏱ {elapsedLabel}</p>
        )}
        {isComplete &&
          (isNewBestTime ||
            resultAchievements.noHint ||
            resultAchievements.firstTry ||
            streakAchievementLabel != null) && (
            <div className="resultAchievements">
              {isNewBestTime && (
                <span className="resultAchievement resultAchievementBest">
                  🏆 최고 기록 갱신!
                </span>
              )}
              {resultAchievements.noHint && (
                <span className="resultAchievement">🎯 노힌트 클리어</span>
              )}
              {resultAchievements.firstTry && (
                <span className="resultAchievement">💎 첫 도전 성공</span>
              )}
              {streakAchievementLabel != null && (
                <span className="resultAchievement">
                  {streakAchievementLabel}
                </span>
              )}
            </div>
          )}
        {nextStreakHint != null && (
          <p className="streakNudge">{nextStreakHint}</p>
        )}
        <span>
          {completedEntries.length}/{puzzle.entries.length} 단어 · 힌트{" "}
          {hintCount}회 ·{" "}
          {isComplete || remainingAttempts === 0
            ? `도전 ${mission?.attemptsUsed}회`
            : `남은 도전 ${remainingAttempts}`}
        </span>
        {!isComplete && remainingAttempts === 0 && (
          <p className="resultDayLimitNotice" role="status" aria-live="polite">
            오늘의 도전 기회를 모두 사용했어요.{" "}
            {bonusPuzzlePanelState?.status === "available"
              ? "아래 보너스 퍼즐을 확인해보세요."
              : bonusPuzzlePanelState?.status === "waiting"
                ? formatWaitingDescription(
                    bonusPuzzlePanelState.nextBonusPublishedAt,
                    bonusPuzzlePanelState.generationIntervalHours,
                    bonusPuzzlePanelState.now,
                  )
                : "내일 새로운 퍼즐이 기다려요."}
          </p>
        )}
      </section>

      {completedEntries.length > 0 && (
        <section
          className="resultWordList"
          aria-label={isComplete ? "완성한 단어" : "맞춘 단어"}
        >
          <p className="resultWordListTitle">
            {isComplete
              ? "완성한 단어"
              : `맞춘 단어 ${completedEntries.length}개`}
          </p>
          {(["across", "down"] as Direction[]).map((direction) => {
            const entries = completedEntries.filter(
              (e) => e.direction === direction,
            );
            if (entries.length === 0) return null;
            return (
              <div key={direction} className="resultWordGroup">
                <p className="resultWordGroupLabel">
                  {directionLabels[direction]}
                </p>
                {entries.map((entry) => (
                  <div key={entry.id} className="resultWordItem">
                    <span className="resultWordNumber">
                      {getEntryStartLabel(entry, resultStartLabels) ?? "·"}
                    </span>
                    <strong className="resultWordAnswer">{entry.answer}</strong>
                    <span className="resultWordClue">{entry.clue}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      )}

      <section className="resultActions" aria-label="결과 메뉴">
        {!isComplete && remainingAttempts > 0 ? (
          <>
            <button
              className="primaryButton"
              type="button"
              onClick={() => navigate("today")}
            >
              이어 풀기
            </button>
            <button
              className="secondaryButton"
              type="button"
              onClick={restartMissionAttempt}
            >
              다시 도전
            </button>
            <button
              className="secondaryButton"
              type="button"
              onClick={() => navigate("home")}
            >
              홈으로
            </button>
          </>
        ) : isComplete && nextRecommendedSummary != null ? (
          <>
            <button
              className="primaryButton"
              type="button"
              onClick={startNextPuzzle}
            >
              다음 퍼즐 풀기
            </button>
            {nextRecommendedLabel !== "" && (
              <p className="resultNextHint">추천 {nextRecommendedLabel}</p>
            )}
            <button
              className="secondaryButton"
              type="button"
              onClick={() => navigate("today")}
            >
              퍼즐 다시 보기
            </button>
            <button
              className="secondaryButton"
              type="button"
              onClick={() => navigate("home")}
            >
              홈으로
            </button>
          </>
        ) : (
          <>
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
              {isComplete ? "퍼즐 다시 보기" : "퍼즐 보기"}
            </button>
          </>
        )}
        {(isComplete || remainingAttempts <= 0) &&
          completedEntries.length > 0 && (
            <div className="shareContainer">
              <button
                className="shareButton"
                type="button"
                onClick={handleShare}
              >
                결과 공유하기
              </button>
              {shareCopied && (
                <p className="shareToast" role="status" aria-live="polite">
                  클립보드에 복사됐어요!
                </p>
              )}
              {shareFailed && (
                <p
                  className="shareToast shareToastError"
                  role="alert"
                  aria-live="assertive"
                >
                  클립보드 복사에 실패했어요.
                </p>
              )}
            </div>
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
  const hasStarted = mission.attemptsUsed > 0 || mission.lastStartedAt != null;
  const selectedPuzzleSummary =
    findPuzzleSummaryById(puzzleSummaries, selectedPuzzleId) ??
    createPuzzleSummary(puzzle);
  const selectedPuzzleLabel =
    loadState === "remote"
      ? formatPuzzleAliasLabel(selectedPuzzleSummary)
      : formatMissionDateLabel(mission.date, loadState);

  function openArchiveRecord(record: PuzzleArchiveRecord) {
    const state = dateCardStates[record.puzzleId];
    const isCompleted =
      record.completedAt != null || state?.completedAt != null;
    const isExhausted =
      !isCompleted &&
      state?.attemptsUsed != null &&
      state.attemptsUsed >= DAILY_ATTEMPT_LIMIT;

    void selectPuzzle(record.puzzleId);
    navigate(isCompleted || isExhausted ? "result" : "today");
  }

  return (
    <>
      <AppHeader
        eyebrow={`${selectedPuzzleLabel} · ${isCompleted ? "완료" : `${progressPercent}%`}`}
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
            const isRecordExhausted =
              !isRecordCompleted &&
              state?.attemptsUsed != null &&
              state.attemptsUsed >= DAILY_ATTEMPT_LIMIT;

            return (
              <button
                key={record.puzzleId}
                className="historyItem"
                type="button"
                onClick={() => openArchiveRecord(record)}
              >
                <span>
                  {formatPuzzleHistoryLabel(
                    createPuzzleSummary(record.puzzle),
                    loadState,
                  )}{" "}
                  · 기기 저장 사본
                </span>
                <strong>
                  {isRecordCompleted
                    ? "완료"
                    : isRecordExhausted
                      ? "도전 종료"
                      : "진행 중"}
                </strong>
                <em>
                  {record.puzzle.entries.length}개 단어 ·{" "}
                  {isRecordCompleted
                    ? "다시 보기"
                    : isRecordExhausted
                      ? "결과 보기"
                      : "이어 풀기"}
                </em>
              </button>
            );
          })
        ) : (
          <>
            <p className="historyEmptyNotice">
              아직 기기에 저장된 기록이 없어요. 퍼즐을 완료하거나 도전을 마치면
              여기에 나타납니다.
            </p>
            <button
              className="historyItem"
              type="button"
              onClick={
                isCompleted || (hasStarted && remainingAttempts <= 0)
                  ? () => navigate("result")
                  : startOrResumeMission
              }
            >
              <span>
                {formatPuzzleHistoryLabel(selectedPuzzleSummary, loadState)}
              </span>
              <strong>
                {isCompleted
                  ? "완료"
                  : !hasStarted
                    ? "도전 준비"
                    : remainingAttempts <= 0
                      ? "도전 종료"
                      : "진행 중"}
              </strong>
              <em>
                {completedEntries.length}/{puzzle.entries.length} 단어 · 힌트{" "}
                {hintCount}회 ·{" "}
                {isCompleted || (hasStarted && remainingAttempts <= 0)
                  ? `도전 ${mission?.attemptsUsed ?? 0}회`
                  : `남은 도전 ${remainingAttempts}`}
              </em>
            </button>
          </>
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
              onClick={() => {
                void clearProgress().catch((error) => {
                  console.error("clearProgress 실패:", error);
                });
              }}
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
  // 상시 오답표시 설정. 꺼지면 cellWrong 빨간 표시를 자동 적용하지 않는다.
  // 미지정(개발 시뮬레이터 등)은 기존 동작대로 항상 표시(true)로 본다.
  autocheckEnabled?: boolean;
  cellEntries: Map<string, PuzzleEntry[]>;
  cellValues: Record<string, string>;
  // "이 단어 확인"으로 일시 강조 중인 셀. 이 셀들은 autocheck가 꺼져 있어도
  // 오답을 잠시 표시한다.
  checkedCellKeys?: ReadonlySet<string>;
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
  autocheckEnabled = true,
  cellEntries,
  cellValues,
  checkedCellKeys = EMPTY_CELL_KEY_SET,
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

  const [completionKeyRefCount, setCompletionKeyRefCount] = useState<
    Map<string, number>
  >(new Map());
  const prevPuzzleIdRef = useRef<string>("");
  const prevCompletedIdsRef = useRef<Set<string>>(new Set());
  const animTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (prevPuzzleIdRef.current !== puzzle.puzzleId) {
      prevPuzzleIdRef.current = puzzle.puzzleId;
      prevCompletedIdsRef.current = new Set(completedEntries.map((e) => e.id));
      for (const t of animTimersRef.current) clearTimeout(t);
      animTimersRef.current = [];
      setCompletionKeyRefCount(new Map());
      return;
    }

    const newlyCompleted = completedEntries.filter(
      (e) => !prevCompletedIdsRef.current.has(e.id),
    );
    prevCompletedIdsRef.current = new Set(completedEntries.map((e) => e.id));

    if (newlyCompleted.length === 0) {
      return;
    }

    const animKeys = new Set<string>();

    for (const entry of newlyCompleted) {
      for (const cell of getEntryCells(entry)) {
        animKeys.add(getCellKey(cell.row, cell.col));
      }
    }

    setCompletionKeyRefCount((prev) => {
      const next = new Map(prev);
      for (const key of animKeys) {
        next.set(key, (next.get(key) ?? 0) + 1);
      }
      return next;
    });

    const timer = setTimeout(() => {
      setCompletionKeyRefCount((prev) => {
        const next = new Map(prev);
        for (const key of animKeys) {
          const count = (next.get(key) ?? 1) - 1;
          if (count <= 0) {
            next.delete(key);
          } else {
            next.set(key, count);
          }
        }
        return next;
      });
      animTimersRef.current = animTimersRef.current.filter((t) => t !== timer);
    }, 550);

    animTimersRef.current.push(timer);
  }, [completedEntries, puzzle.puzzleId]);

  useEffect(() => {
    return () => {
      for (const t of animTimersRef.current) clearTimeout(t);
    };
  }, []);

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
            pendingValue !== "" ? pendingValue : (committedValue ?? "");
          const isFilled = committedValue != null;
          const isPending = pendingValue !== "";
          const isComplete = completedCellKeys.has(key);
          const isSelected = selectedCells.has(key);
          const isCross = entries.length > 1;
          // Pending IME text is temporary, so only committed values get
          // right/wrong styling.
          const isCorrect = !isPending && isFilled && committedValue === answer;
          const isWrong = !isPending && isFilled && committedValue !== answer;
          // autocheck가 꺼져 있으면 오답 빨간 표시를 숨긴다. 단, "이 단어 확인"으로
          // 강조 중인 셀(checkedCellKeys)은 일시적으로 오답을 보여준다.
          const showWrong =
            isWrong && (autocheckEnabled || checkedCellKeys.has(key));
          const isJustCompleted = (completionKeyRefCount.get(key) ?? 0) > 0;

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
                isJustCompleted ? "cellJustCompleted" : "",
                showWrong ? "cellWrong" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              onClick={() => selectCell(row, col)}
              aria-label={`${row + 1}행 ${col + 1}열${
                showWrong
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

const TAB_DIRECTIONS: Direction[] = ["across", "down"];

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
  const baseId = useId();

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentDirection: Direction,
  ) {
    const currentIndex = TAB_DIRECTIONS.indexOf(currentDirection);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = (currentIndex + 1) % TAB_DIRECTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex =
        (currentIndex - 1 + TAB_DIRECTIONS.length) % TAB_DIRECTIONS.length;
    } else if (event.key === "Home") {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      nextIndex = TAB_DIRECTIONS.length - 1;
    }
    if (nextIndex !== null) {
      const nextDirection = TAB_DIRECTIONS[nextIndex];
      setSelectedDirection(nextDirection);
      document.getElementById(`${baseId}-tab-${nextDirection}`)?.focus();
    }
  }

  return (
    <section className="clueSection" style={style}>
      <div className="segmentedControl" role="tablist" aria-label="힌트 방향">
        {TAB_DIRECTIONS.map((direction) => (
          <button
            key={direction}
            id={`${baseId}-tab-${direction}`}
            role="tab"
            aria-selected={selectedDirection === direction}
            aria-controls={`${baseId}-panel`}
            tabIndex={selectedDirection === direction ? 0 : -1}
            className={selectedDirection === direction ? "segmentActive" : ""}
            type="button"
            onClick={() => setSelectedDirection(direction)}
            onKeyDown={(e) => handleTabKeyDown(e, direction)}
          >
            {directionLabels[direction]}
          </button>
        ))}
      </div>

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${selectedDirection}`}
        className="clueList"
      >
        {clueEntries.map((entry) => {
          const isComplete = completedEntries.some(
            (completed) => completed.id === entry.id,
          );
          const isSelected = entry.id === selectedEntry?.id;
          return (
            <button
              key={entry.id}
              className={[
                "clueItem",
                isSelected ? "clueSelected" : "",
                isComplete ? "clueComplete" : "",
              ].join(" ")}
              type="button"
              aria-current={isSelected ? "true" : undefined}
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
