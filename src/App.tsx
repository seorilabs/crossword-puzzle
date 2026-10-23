import { usageStatistics } from "./adapters/usageStatistics";
import { Top } from "@toss/tds-mobile";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  applyReturnReminderOutcome,
  applyTentativeUpdate,
  buildCellEntries,
  buildReturnReminderPrepromptParams,
  buildReturnReminderPromptParams,
  buildReturnReminderResultParams,
  buildReviewEntries,
  buildShareGrid,
  buildShareText,
  buildStartLabels,
  buildStreakCalendarWeeks,
  buildWeeklyStreakStrip,
  chooseFirstWordGuide,
  restoreFirstWordGuide,
  completeMission,
  computeElapsedMs,
  computeLeaderboardScore,
  computeLongestStreakDays,
  computePersonalStats,
  computeSolveTimeDistribution,
  computeTentativeUpdate,
  confirmLetterTileCell,
  consumeDailyHintCredit,
  createDailyHintWallet,
  createDailyMissionState,
  createLetterTileState,
  createPuzzleSummary,
  DAILY_ATTEMPT_LIMIT,
  emitProgressionScreenView,
  emitStreakMilestoneIfReached,
  findPuzzleSummaryById,
  FIRST_WORD_GUIDE_KEY,
  FIRST_WORD_GUIDE_EVENTS,
  buildFirstWordGuideTelemetryParams,
  LETTER_TILE_CHOOSE_EVENT,
  formatPuzzleAliasLabel,
  formatPuzzleCardSequenceLabel,
  formatReturnReminderPrepromptBody,
  RETURN_REMINDER_PREPROMPT_COPY,
  getAnswerInputLetters,
  getBounds,
  getCellAnswerLetter,
  getCellKey,
  getCompletedEntries,
  getCompletionAchievements,
  getDailyFreePuzzleSummary,
  isPublishedPuzzle,
  getDailyHintBalance,
  getEntryAnswerValue,
  getEntryCellIndex,
  getEntryCellKeyAt,
  getEntryCells,
  getEntryStartCellKey,
  getFirstIncompleteEntry,
  getInitialEntryId,
  getInitialEntryStartCellKey,
  getNewlyReachedProgressMilestones,
  getNextAnswerSlotCellKey,
  getNextFocusEntryAfterCompletion,
  getProgressMilestoneRewardMessage,
  getProgressPercent,
  getPuzzlePackAlias,
  getRemainingAttempts,
  getTextScaleFontMultiplier,
  getTodayDateKey,
  grantDailyHintCredits,
  isCellLocked,
  loadOrMigrateDailyHintWallet,
  mapRewardedAdFailureToAssistResult,
  markReturnReminderPrompted,
  normalizeFirstWordGuide,
  normalizeOptionalPuzzleIdentifier,
  normalizePuzzleIdentifier,
  ONBOARDING_WORD_COMPLETE_MESSAGE,
  pickHintCellIndex,
  recommendLetterEntry,
  resolveStarterCell,
  RETURN_REMINDER_PREPROMPT_EVENT,
  RETURN_REMINDER_PROMPT_EVENT,
  RETURN_REMINDER_RESULT_EVENT,
  REWARDED_HINT_AD_REWARD_EVENT,
  runRewardedHintAdFlow,
  selectLetterEntry,
  shouldCelebrateOnboardingWordCompletion,
  shouldMarkTentative,
  shouldOfferStuckWordReveal,
  shouldPromptReturnReminder,
  shouldRecordBestTime,
  shouldSubmitLeaderboardScore,
  sortPuzzleSummariesByRecency,
  startMissionAttempt,
  STUCK_HINT_PROMPT_ACCEPT_EVENT,
  STUCK_HINT_PROMPT_DISMISS_EVENT,
  STUCK_HINT_PROMPT_EVENT,
  STUCK_HINT_PROMPT_REVEAL_WORD_EVENT,
  TILE_INPUT_POLICY_VERSION,
  togglePauseState,
  trackRewardedHintAdRequest,
  trackRewardedHintAdResult,
  trackRewardedHintAdTrace,
  uniquePuzzleSummaries,
  validatePuzzleSlots,
  type CellLetterChange,
  type DailyHintWallet,
  type DailyMissionState,
  type Direction,
  type FirstWordGuide,
  type GamePuzzleContext,
  type LetterTileProgress,
  type LetterTileState,
  type PersonalStatsRecord,
  type Puzzle,
  type PuzzleEntry,
  type PuzzleManifestItem,
  type PuzzleQualityCheck,
  type PuzzleSlotValidation,
  type ReturnReminderState,
  type ReviewEntry,
  type RewardedAdRetryAttempt,
  type SavedProgress,
  type TextScale,
  type WeeklyStreakStripDay,
} from "../packages/crossword-core/src";
import {
  loadAnswerInputMode,
  saveAnswerInputMode,
  type AnswerInputMode,
} from "./adapters/answerInputModeRepository";
import {
  mapFullScreenAdTraceEvent,
  showRewardedHintAd,
  type FullScreenAdResult,
} from "./adapters/appsInTossAds";
import {
  loadAutocheckEnabled,
  saveAutocheckEnabled,
} from "./adapters/autocheckSettingRepository";
import { emitFeedback } from "./adapters/feedback";
import {
  loadHapticEnabled,
  loadSoundEnabled,
  loadTextScale,
  saveHapticEnabled,
  saveSoundEnabled,
  saveTextScale,
} from "./adapters/feedbackSettingsRepository";
import { loadFirebaseLaunchConfig } from "./adapters/firebaseClient";
import { gameAnalytics } from "./adapters/gameAnalytics";
import {
  defaultLaunchConfig,
  type LaunchConfig,
} from "./adapters/launchConfig";
import { leaderboardAdapter } from "./adapters/leaderboardAdapter";
import { createLocalDailyHintWalletRepository } from "./adapters/localDailyHintWalletRepository";
import {
  createLocalMissionRepository,
  getRecentCompletionDates,
  invalidateStreakCache,
  readConsecutiveStreakDays,
} from "./adapters/localMissionRepository";
import {
  createLocalProgressRepository,
  getAllBestTimePuzzleIds,
  getBestTimeMs,
  saveBestTimeMs,
} from "./adapters/localProgressRepository";
import {
  createLocalPuzzleArchiveRepository,
  type PuzzleArchiveRecord,
  type PuzzleArchiveSaveOptions,
} from "./adapters/localPuzzleAccessRepository";
import {
  requestReturnReminderAgreement,
  RETURN_REMINDER_TEMPLATE_CODE_SOURCE,
} from "./adapters/notificationAgreement";
import {
  loadFirstInputGuideSeen,
  markFirstInputGuideSeen as persistFirstInputGuideSeen,
} from "./adapters/onboardingSeenRepository";
import {
  loadReturnReminderState,
  saveReturnReminderState,
} from "./adapters/returnReminderRepository";
import { initSafeAreaInsets } from "./adapters/safeArea";
import {
  createFallbackPuzzleRepository,
  createOnboardingPuzzleRepository,
  createStaticPuzzleRepository,
} from "./adapters/staticPuzzleRepository";
import { telemetry } from "./adapters/telemetry";
import {
  loadTimerVisible,
  saveTimerVisible,
} from "./adapters/timerVisibilitySettingRepository";
import "./App.css";
import { type CompletionReturnReminderPreprompt } from "./components/CompletionCelebrationDialog";
import { MiniPuzzlePreview } from "./components/MiniPuzzlePreview";
import { PersonalStatsCard } from "./components/PersonalStatsCard";
import { PuzzleBoard } from "./components/PuzzleBoard";
import { SettingsSheet } from "./components/SettingsSheet";
import { StreakHeatmap } from "./components/StreakHeatmap";
import { StuckHintPrompt } from "./components/StuckHintPrompt";
import {
  TilePuzzleScreen,
  type TileInputAction,
} from "./components/TilePuzzleScreen";
import { fallbackPuzzle } from "./data/fallbackPuzzle";
import { onboardingPuzzle } from "./data/onboardingPuzzle";
import { formatElapsedTime, formatLiveTimer, getElapsedSeconds } from "./timer";
import { useLeaderboard } from "./useLeaderboard";
import { useShareResult } from "./useShareResult";
import { useStuckHintPrompt } from "./useStuckHintPrompt";

type AppRoute =
  | "home"
  | "today"
  | "result"
  | "history"
  | "resume"
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
  // 이 카드 미션의 유효 도전 상한(기본 상한 + 충전분). 미션 로드 시 launchConfig의
  // dailyAttemptLimit로 결정되므로, "도전 종료" 판정을 상수 대신 이 값으로 한다(#225).
  maxAttempts: number;
  completedAt?: string;
  hasProgress: boolean;
  hintCount: number;
  // 정답 보기로 단어를 공개했는지. 노힌트 완료 집계에서 제외하기 위해 보존한다.
  revealUsed: boolean;
};

// PuzzleBoard의 checkedCellKeys 기본값. 매 렌더 새 Set 생성을 피한다.
const EMPTY_CELL_KEY_SET: ReadonlySet<string> = new Set();

type DateSelectionProps = {
  dateCardStates: Record<string, DateCardState>;
  loadState: LoadState;
  puzzleSummaries: PuzzleManifestItem[];
  selectedPuzzleId: string;
  selectPuzzle: (puzzleId: string) => Promise<boolean>;
};

type PuzzleSession = {
  nextPuzzle: Puzzle;
  savedMission: DailyMissionState;
  savedProgress: SavedProgress;
};

type RewardedAdStatus = "idle" | "loading";

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
// 결과 공유 텍스트 말미에 붙일 앱 진입 링크(#227). 마켓별 진입 URL 차이를 빌드 주입값
// 으로 흡수한다. 미설정(빈 값)이면 링크 줄을 생략해 기존 공유 텍스트와 동일하게 둔다.
const shareLandingUrl = import.meta.env.VITE_SHARE_LANDING_URL?.trim();
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
const dailyHintWalletRepository = createLocalDailyHintWalletRepository();
const missionRepository = createLocalMissionRepository();
const puzzleArchiveRepository = createLocalPuzzleArchiveRepository();

const directionLabels: Record<Direction, string> = {
  across: "가로",
  down: "세로",
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
    pack_id: normalizeOptionalPuzzleIdentifier(puzzle.packId),
    published_at: puzzle.publishedAt,
    puzzle_alias: normalizePuzzleIdentifier(getPuzzlePackAlias(puzzle)),
    puzzle_id: normalizePuzzleIdentifier(puzzle.puzzleId),
    slot_id: normalizeOptionalPuzzleIdentifier(puzzle.slotId),
    word_count: puzzle.entries.length,
  };
}

// 게임 세부 지표(gameAnalytics)용 퍼즐 컨텍스트. 모든 game_* 이벤트에 콘텐츠 차원
// (난이도/테마/팩)으로 실린다. 계약은 core gameAnalytics.ts의 GamePuzzleContext.
function getGamePuzzleContext(puzzle: Puzzle): GamePuzzleContext {
  return {
    puzzleId: puzzle.puzzleId,
    puzzleAlias: getPuzzlePackAlias(puzzle),
    difficulty: puzzle.difficulty,
    gridSize: puzzle.gridSize,
    wordCount: puzzle.entries.length,
    packId: puzzle.packId,
    slotId: puzzle.slotId,
    themeTag: puzzle.themeTag,
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

  if (pathname === "/resume") {
    return "resume";
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
    case "resume":
      return "/resume";
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
    maxAttempts: mission.maxAttempts,
    completedAt: mission.completedAt,
    hasProgress:
      mission.attemptsUsed > 0 ||
      progress.hintCount > 0 ||
      Object.keys(progress.cellValues).length > 0,
    hintCount: progress.hintCount,
    revealUsed: progress.revealUsed === true,
  };
}

function hasSavedProgress(mission: DailyMissionState, progress: SavedProgress) {
  return (
    mission.attemptsUsed > 0 ||
    progress.hintCount > 0 ||
    Object.keys(progress.cellValues).length > 0
  );
}

function createInitialMission() {
  // launchConfig가 아직 resolve되기 전(첫 렌더)의 폴백 미션. 여기서는 원격값을 아직
  // 알 수 없으므로 3마켓 공유 기본 상수(DAILY_ATTEMPT_LIMIT = launchConfig 기본값)를
  // 쓴다. 원격값이 확정되면 loadPuzzleSession이 launchConfig.dailyAttemptLimit로 다시
  // 로드하므로 회귀가 없다(#225).
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

function App() {
  const usageStatisticsState = useSyncExternalStore(
    usageStatistics.subscribe,
    usageStatistics.getSnapshot,
  );
  useEffect(() => {
    void usageStatistics.initialize();
  }, []);
  const [route, setRoute] = useState<AppRoute>(() =>
    getRouteFromPathname(window.location.pathname),
  );
  const [puzzle, setPuzzle] = useState<Puzzle>(fallbackPuzzle);
  const [cellValues, setCellValues] = useState<Record<string, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tileInput, setTileInput] = useState<LetterTileProgress>();
  const [tileStatus, setTileStatus] =
    useState<LetterTileState["status"]>("idle");
  const completionActionRef = useRef<string | null>(null);
  const tileAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [firstWordGuide, setFirstWordGuide] = useState<
    FirstWordGuide | undefined
  >(() => {
    try {
      return normalizeFirstWordGuide(
        JSON.parse(localStorage.getItem(FIRST_WORD_GUIDE_KEY) ?? "null"),
      );
    } catch {
      return undefined;
    }
  });
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
  const [dailyHintWallet, setDailyHintWallet] = useState<DailyHintWallet>(() =>
    createDailyHintWallet(getTodayDateKey()),
  );
  const earnedHintCredits = dailyHintWallet.earnedCredits;
  const [launchConfig, setLaunchConfig] =
    useState<LaunchConfig>(defaultLaunchConfig);
  const {
    visible: leaderboardVisible,
    submitScore: submitLeaderboardScore,
    openLeaderboard,
  } = useLeaderboard({
    enabled: launchConfig.leaderboardEnabled,
    adapter: leaderboardAdapter,
    telemetry,
  });
  const [rewardedAdStatus, setRewardedAdStatus] =
    useState<RewardedAdStatus>("idle");
  const [isRewardedHintPromptOpen, setIsRewardedHintPromptOpen] =
    useState(false);
  const [hintNotice, setHintNotice] = useState("");
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
  const [completionCelebrationId, setCompletionCelebrationId] = useState<
    string | null
  >(null);
  const [consecutiveStreak, setConsecutiveStreak] = useState(() =>
    readConsecutiveStreakDays(),
  );
  const [isNewBestTime, setIsNewBestTime] = useState(false);
  // 풀이 일시정지 상태. pausedMs는 누적 정지 시간(ms), pausedAt은 현재 정지 시작
  // 시각(없으면 진행 중). 영속 mission과 분리한 세션 한정 상태라 저장 스키마 변경
  // 없이 동작하며, 새 시도 시작·퍼즐 전환 시 초기화한다.
  const [pause, setPause] = useState<{
    pausedMs: number;
    pausedAt: string | null;
  }>({ pausedMs: 0, pausedAt: null });
  const isPaused = pause.pausedAt != null;
  // 백그라운드 전환(visibilitychange hidden)으로 자동 일시정지했는지 여부. 사용자가
  // 직접 누른 수동 일시정지와 구분해, 자동으로 멈춘 경우에만 복귀 시 자동 재개한다.
  // 수동 정지 중 백그라운드→복귀 시 이중 정지/조기 재개를 막는 가드로 쓴다(#232).
  const autoPausedRef = useRef(false);
  // "정답 보기"로 단어를 공개했는지. 노힌트/첫 도전 배지·최고 기록 판정에서
  // 제외하기 위한 플래그로, 진행상태(SavedProgress)에 보존한다.
  const [revealUsed, setRevealUsed] = useState(false);
  // 임시(연필)로 입력된 셀 키 집합. cellValues와 별도로 관리해, 완료 판정은
  // 값(cellValues)만 보고 임시 여부는 표시에만 쓰이게 한다. SavedProgress에
  // 보존되어 재진입 후에도 임시 표시가 유지된다.
  // 연필(임시 입력) 모드. ON이면 사용자가 직접 입력한 글자를 임시(회색)로 표시해
  // 나중에 재검토할 수 있다. 세션 한정 상태로 시작한다(#200) — 재진입 시 모드는
  // 꺼진 채 시작하지만, 임시 표시 자체는 SavedProgress.tentativeCells로 복원된다.
  const [pencilMode, setPencilMode] = useState(false);
  const [tentativeCellKeys, setTentativeCellKeys] = useState<Set<string>>(
    () => new Set(),
  );
  // 상시 오답표시(autocheck) on/off 설정. 첫 렌더는 기본값(true)으로 시작하고
  // 저장값은 마운트 후 useEffect에서 동기화한다(클라이언트 전용 저장소 접근을
  // 초기 렌더에서 분리).
  const [autocheckEnabled, setAutocheckEnabled] = useState(true);
  // 라이브 타이머 표시/숨김 설정(#233). 기본값은 표시(true)이며 저장값은 마운트 후
  // useEffect에서 동기화한다. 표시 여부만 제어하고 경과 측정·최고 기록·리더보드
  // 계측에는 영향을 주지 않는다.
  const [timerVisible, setTimerVisible] = useState(true);
  // 사운드·햅틱 피드백 on/off. autocheck와 같이 기본값(true)으로 시작하고 저장값은
  // 마운트 후 useEffect에서 동기화한다.
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [answerInputMode, setAnswerInputMode] =
    useState<AnswerInputMode>(loadAnswerInputMode);
  // 글자 크기(접근성). 사운드·햅틱처럼 기본값(보통)으로 시작하고 저장값은 마운트
  // 후 useEffect에서 동기화한다(클라이언트 전용 저장소 접근 분리).
  const [textScale, setTextScale] = useState<TextScale>("normal");
  // 첫 진입 1스텝 온보딩: 첫 입력 전 "첫 칸에 입력" 가이드를 최초 1회만 노출한다.
  const [hasSeenFirstInputGuide, setHasSeenFirstInputGuide] = useState(
    loadFirstInputGuideSeen,
  );
  const firstAnswerInputKeysRef = useRef<Set<string>>(new Set());
  // 첫 입력 넛지 수락 때 TodayScreen 내부 native input에 포커스를 재요청한다. 숫자
  // 토큰으로 동일 퍼즐에서도 명시적 사용자 수락마다 effect가 다시 실행되게 한다.
  const [stuckHintFocusRequestId, setStuckHintFocusRequestId] = useState(0);
  // 진행 마일스톤(부분 완료) 추적: 동일 퍼즐·시도 안에서 새로 넘어선 마일스톤만
  // 보상 피드백·이벤트로 노출하고, 이어풀기(resume)·재시작 시 이미 도달한 구간은
  // 다시 emit하지 않도록 baseline을 초기화한다.
  const progressMilestoneKeyRef = useRef<string>("");
  const reachedProgressMilestoneRef = useRef<number>(0);
  // 리더보드 점수는 완료한 퍼즐당 1회만 제출한다. 이미 제출한 puzzleId를 기억해
  // 같은 시도 안에서의 중복 제출(완료 effect 재실행 등)을 막는다.
  const submittedLeaderboardPuzzleIdsRef = useRef<Set<string>>(new Set());
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
    gameContext: {} as GamePuzzleContext,
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

  // AIT 네비게이션 바와 커스텀 헤더(.appHeader)가 겹치지 않도록 SafeAreaInsets를
  // CSS 변수로 노출한다. 비-AIT 환경에서는 no-op이다.
  useEffect(() => initSafeAreaInsets(), []);

  useEffect(() => {
    // The celebration only belongs to the active 풀이 화면; clear it whenever we
    // leave so returning to a finished puzzle (incl. via browser history) does
    // not re-open the dialog over the read-only board.
    if (route !== "today" && route !== "result") {
      setCompletionCelebrationId(null);
    }
    if (route === "home") {
      // Recalculate streak whenever the home screen is shown so that a date
      // change at midnight is reflected without requiring an app restart. The
      // same-day module cache keeps repeat home visits cheap.
      setConsecutiveStreak(readConsecutiveStreakDays());
    }
    if (route === "history") {
      // 기록 화면은 히트맵(getRecentCompletionDates)이 매 렌더 localStorage를 새로
      // 스캔한다. 스트릭 숫자도 같은 최신 완료일 집합을 근거로 삼도록, 같은 날
      // 즉시 반환하는 모듈 캐시를 무효화한 뒤 재계산해 숫자와 히트맵이 어긋나지
      // 않게 한다(scanCompletedDates 공유).
      invalidateStreakCache();
      setConsecutiveStreak(readConsecutiveStreakDays());
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

  const loadPuzzleSession = useCallback(
    async (puzzleId: string) => {
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
          launchConfig.dailyAttemptLimit,
        ),
      ]);

      return {
        nextPuzzle,
        savedMission,
        savedProgress,
      } satisfies PuzzleSession;
    },
    [launchConfig.dailyAttemptLimit],
  );

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
      const restored = createLetterTileState(
        session.nextPuzzle,
        session.savedProgress.cellValues,
        session.savedProgress.tileInput,
      );
      const guideIds = chooseFirstWordGuide(session.nextPuzzle.entries);
      setFirstWordGuide((previous) =>
        restoreFirstWordGuide({
          previous,
          puzzleId: session.nextPuzzle.puzzleId,
          entries: session.nextPuzzle.entries,
          legacySeen: loadFirstInputGuideSeen(),
          hasProgress:
            session.savedMission.attemptsUsed > 0 ||
            Object.keys(session.savedProgress.cellValues).length > 0,
        }),
      );
      if (
        !session.savedProgress.tileInput &&
        Object.keys(restored.cellValues).length === 0 &&
        !loadFirstInputGuideSeen() &&
        guideIds[0]
      ) {
        Object.assign(
          restored,
          selectLetterEntry(session.nextPuzzle, restored, guideIds[0]),
        );
      }
      setCellValues(restored.cellValues);
      setTileInput(restored.progress);
      setTileStatus("idle");
      setHintCount(session.savedProgress.hintCount);
      setRevealUsed(session.savedProgress.revealUsed ?? false);
      setTentativeCellKeys(new Set(session.savedProgress.tentativeCells ?? []));
      setSelectedDirection(
        session.nextPuzzle.entries.find(
          (entry) => entry.id === restored.progress.entryId,
        )?.direction ?? "across",
      );
      setSelectedEntryId(restored.progress.entryId);
      setSelectedCellKey(restored.progress.activeCellKey);
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
              launchConfig.dailyAttemptLimit,
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
    [launchConfig.dailyAttemptLimit],
  );

  const loadDailyHintWalletForDate = useCallback(
    async (date: string, summaries: PuzzleManifestItem[]) => {
      const dateSummaries = uniquePuzzleSummaries(summaries).filter(
        (summary) => summary.date === date,
      );
      return loadOrMigrateDailyHintWallet({
        date,
        loadLegacyProgresses: () =>
          Promise.all(
            dateSummaries.map((summary) =>
              progressRepository.loadProgress(summary.puzzleId),
            ),
          ),
        repository: dailyHintWalletRepository,
      });
    },
    [],
  );

  const persistDailyHintWallet = useCallback((wallet: DailyHintWallet) => {
    setDailyHintWallet(wallet);
    void dailyHintWalletRepository.saveWallet(wallet).catch(() => {
      telemetry.impression("daily_hint_wallet_save_error", {
        date: wallet.date,
      });
    });
  }, []);

  const refreshDailyHintWallet = useCallback(async () => {
    const date = getTodayDateKey();
    if (dailyHintWallet.date === date) {
      return;
    }

    const summaries = [
      ...puzzleSummaries,
      ...puzzleArchiveRecords.map((record) =>
        createPuzzleSummary(record.puzzle),
      ),
    ];
    const wallet = await loadDailyHintWalletForDate(date, summaries);
    setDailyHintWallet(wallet);
  }, [
    dailyHintWallet.date,
    loadDailyHintWalletForDate,
    puzzleArchiveRecords,
    puzzleSummaries,
  ]);

  const refreshPuzzleArchive = useCallback(async () => {
    // 입문(온보딩) 퍼즐은 튜토리얼이므로 이어 풀기·기록·통계 목록에서 숨긴다.
    const nextArchiveRecords = (
      await puzzleArchiveRepository.listPuzzles()
    ).filter((record) => record.puzzleId !== onboardingPuzzle.puzzleId);
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
        // 입문(온보딩) 퍼즐은 튜토리얼이므로 목록·통계에서 숨긴다.
        const nextArchiveRecords = (
          await puzzleArchiveRepository.listPuzzles()
        ).filter((record) => record.puzzleId !== onboardingPuzzle.puzzleId);
        const nextSummaries =
          loadedSummaries.length > 0
            ? loadedSummaries
            : [createPuzzleSummary(fallbackPuzzle)];
        const today = getTodayDateKey();
        const allSummaries = [
          ...nextSummaries,
          ...nextArchiveRecords.map((record) =>
            createPuzzleSummary(record.puzzle),
          ),
        ];
        const [nextDateCardStates, nextDailyHintWallet] = await Promise.all([
          loadDateCardStates([...allSummaries]),
          loadDailyHintWalletForDate(today, allSummaries),
        ]);

        // 신규 사용자(아직 첫 성공 전)면 입문 퍼즐을, 그 외에는 일반 일일 퍼즐을
        // 첫 활성 퍼즐로 둔다. 입문 퍼즐 세션은 위에서 미리 불러와 재사용한다.
        const dailyPuzzleId = getInitialPuzzleId(nextSummaries, today);
        const initialPuzzleId = dailyPuzzleId;
        const session = await loadPuzzleSession(initialPuzzleId);

        if (!isCancelled) {
          setPuzzleSummaries(nextSummaries);
          setPuzzleArchiveRecords(nextArchiveRecords);
          setDateCardStates(nextDateCardStates);
          setDailyHintWallet(nextDailyHintWallet);
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
  }, [
    applyPuzzleSession,
    loadDateCardStates,
    loadDailyHintWalletForDate,
    loadPuzzleSession,
  ]);

  const selectPuzzle = useCallback(
    async (puzzleId: string) => {
      if (loadState === "loading") {
        return false;
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
        return session != null;
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
        return false;
      }
    },
    [applyPuzzleSession, loadPuzzleSession, loadState],
  );

  useEffect(() => {
    // 모든 값이 기본값이면 저장 스킵: clearProgress가 삭제한 키가 재생성되지 않도록 함
    if (
      Object.keys(cellValues).length === 0 &&
      hintCount === 0 &&
      !revealUsed &&
      tileInput == null
    ) {
      return;
    }
    void progressRepository
      .saveProgress(puzzle.puzzleId, {
        cellValues,
        tileInput,
        // 광고 보상은 날짜별 공용 지갑에 저장한다. 필드는 구버전 스키마 호환용이다.
        earnedHintCredits: 0,
        hintCount,
        revealUsed,
        // 값이 없는(지워진) 셀의 임시 표시는 저장하지 않아 stale 키를 정리한다.
        tentativeCells: [...tentativeCellKeys].filter(
          (key) => cellValues[key] != null,
        ),
      })
      .catch(() => {
        showHintToast("진행을 저장하지 못했어요. 저장 공간을 확인해 주세요.");
        telemetry.impression("progress_save_error", {
          puzzle_id: puzzle.puzzleId,
        });
      });
  }, [
    cellValues,
    tileInput,
    hintCount,
    revealUsed,
    tentativeCellKeys,
    puzzle.puzzleId,
  ]);

  // autocheck 저장값은 마운트 후에만 반영한다(첫 렌더 기본값 true와 분리).
  useEffect(() => {
    setAutocheckEnabled(loadAutocheckEnabled());
    setTimerVisible(loadTimerVisible());
  }, []);

  // 사운드·햅틱·글자 크기 저장값도 마운트 후 동기화한다(클라이언트 전용 저장소 접근 분리).
  useEffect(() => {
    setSoundEnabled(loadSoundEnabled());
    setHapticEnabled(loadHapticEnabled());
    setTextScale(loadTextScale());
  }, []);

  useEffect(() => {
    setDateCardStates((prev) => ({
      ...prev,
      [puzzle.puzzleId]: createDateCardState(mission, {
        cellValues,
        earnedHintCredits: 0,
        hintCount,
        revealUsed,
      }),
    }));
  }, [cellValues, hintCount, mission, puzzle.puzzleId, revealUsed]);

  const viewModel = usePuzzleViewModel(
    puzzle,
    selectedEntryId,
    selectedDirection,
    cellValues,
  );
  const tileState = useMemo(
    () => ({
      ...selectLetterEntry(
        puzzle,
        createLetterTileState(puzzle, cellValues, tileInput),
        selectedEntryId,
        selectedCellKey,
      ),
      status: tileStatus,
    }),
    [
      puzzle,
      cellValues,
      tileInput,
      selectedEntryId,
      selectedCellKey,
      tileStatus,
    ],
  );
  const guideActive =
    launchConfig.firstInputGuideEnabled &&
    firstWordGuide?.status === "active" &&
    firstWordGuide.puzzleId === puzzle.puzzleId;
  const guideCompleted = guideActive
    ? firstWordGuide.entryIds.filter((id) =>
        viewModel.completedEntries.some((entry) => entry.id === id),
      ).length
    : 0;
  const guideShownRef = useRef(new Set<string>());
  useEffect(() => {
    if (
      route === "today" &&
      guideActive &&
      !guideShownRef.current.has(puzzle.puzzleId)
    ) {
      guideShownRef.current.add(puzzle.puzzleId);
      telemetry.impression(
        FIRST_WORD_GUIDE_EVENTS.shown,
        buildFirstWordGuideTelemetryParams(
          puzzle.puzzleId,
          firstWordGuide.entryIds.length,
        ),
      );
    }
  }, [route, guideActive, firstWordGuide, puzzle.puzzleId]);
  useEffect(() => {
    if (firstWordGuide == null) return;
    try {
      localStorage.setItem(
        FIRST_WORD_GUIDE_KEY,
        JSON.stringify(firstWordGuide),
      );
    } catch {
      telemetry.impression("first_word_guide_save_error", {});
    }
  }, [firstWordGuide]);
  useEffect(() => {
    if (
      guideActive &&
      firstWordGuide.entryIds.length > 0 &&
      guideCompleted === firstWordGuide.entryIds.length
    ) {
      setFirstWordGuide({ ...firstWordGuide, status: "complete" });
      telemetry.impression(
        FIRST_WORD_GUIDE_EVENTS.complete,
        buildFirstWordGuideTelemetryParams(puzzle.puzzleId, guideCompleted),
      );
    }
  }, [guideActive, guideCompleted, firstWordGuide, puzzle.puzzleId]);
  useEffect(
    () => () => {
      if (tileAdvanceRef.current) clearTimeout(tileAdvanceRef.current);
    },
    [puzzle.puzzleId],
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
    hintCount > 0 ||
    viewModel.completedEntries.length > 0;
  const hasStarted = mission.attemptsUsed > 0 || hasProgress;
  const isCompleted = viewModel.isComplete || mission.completedAt != null;
  const isAttemptExhaustedUncompleted =
    hasStarted && remainingAttempts <= 0 && !isCompleted;
  // 첫 진입 1스텝 온보딩: 시작했지만 아직 한 글자도 입력하지 않은 최초 진입에서만 첫
  // 입력 가이드를 노출한다(입력이 생기면 즉시 사라짐). how-to를 아직 보지 않은 신규에게도
  // 노출되도록 how-to 전제를 제거했다(#161). how-to 다이얼로그는 더 위 레이어로 떠
  // 가이드를 덮으므로 충돌이 없고, 닫으면 가이드가 드러난다.
  const isBoardEmpty = Object.keys(cellValues).length === 0;
  const currentAttemptFirstInputKey = `${puzzle.puzzleId}:${mission.attemptsUsed}`;
  const isFirstInputPending =
    isBoardEmpty &&
    !firstAnswerInputKeysRef.current.has(currentAttemptFirstInputKey);

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
    gameContext: getGamePuzzleContext(puzzle),
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
    // 게임 세부 지표: 완료 퍼널 이탈(마켓 차원 포함).
    gameAnalytics.track("game_puzzle_abandon", snapshot.gameContext, {
      elapsedSec: getElapsedSeconds(snapshot.elapsedStartedAt) ?? 0,
      completedWordCount: snapshot.wordsFilled,
      totalWordCount: snapshot.totalWords,
      progressPercent: snapshot.progressPercent,
      hadFirstInput: snapshot.hadFirstInput,
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

  // 백그라운드 전환 시 타이머 자동 일시정지/재개(#232). 앱을 벗어나거나 화면이
  // 잠긴 동안의 시간이 풀이 시간·최고 기록·리더보드에 누적되지 않도록, today
  // 보드에서 진행 중(시작·미완료·도전 미소진)인 미션의 타이머를 hidden에서 멈추고
  // visible 복귀 시 재개한다. 상태 전이는 공유 코어(togglePauseState)에 위임하고,
  // 정지 구간은 pausedMs에 누적되어 경과 계산에서 제외된다. 사용자가 이미 수동
  // 일시정지 중이면 autoPausedRef 가드로 이중 정지/조기 재개를 피한다.
  useEffect(() => {
    const canAutoPause = () => {
      const snapshot = abandonSnapshotRef.current;
      return (
        snapshot.route === "today" &&
        snapshot.hasStarted &&
        !snapshot.isCompleted &&
        snapshot.remainingAttempts > 0 &&
        snapshot.elapsedStartedAt != null
      );
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (!canAutoPause()) {
          return;
        }
        setPause((prev) => {
          // 이미 정지 상태(수동/자동)면 건드리지 않는다.
          if (prev.pausedAt != null) {
            return prev;
          }
          autoPausedRef.current = true;
          return togglePauseState(prev, new Date());
        });
      } else if (document.visibilityState === "visible") {
        // 자동으로 멈춘 경우에만 재개한다(수동 정지는 그대로 둔다).
        if (!autoPausedRef.current) {
          return;
        }
        setPause((prev) => {
          if (prev.pausedAt == null) {
            autoPausedRef.current = false;
            return prev;
          }
          autoPausedRef.current = false;
          return togglePauseState(prev, new Date());
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // KST 날짜가 바뀐 뒤 화면 이동 또는 백그라운드 복귀 시 새 일일 지갑을 불러온다.
  // 재시도·퍼즐 전환만으로는 날짜가 같으므로 잔액이 초기화되지 않는다.
  useEffect(() => {
    void refreshDailyHintWallet();
  }, [refreshDailyHintWallet, route]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshDailyHintWallet();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshDailyHintWallet]);

  const todayKey = getTodayDateKey();
  // 당일 서빙: 오늘 발행된 퍼즐(easy 5×5 · hard 8×8). 단계 순서·상태·주 CTA 판정은
  // core의 buildDailyLadder가 맡아 워밍업 → 오늘의 퍼즐 한 흐름으로 보여 준다.
  const todayPuzzleSummaries = useMemo(
    () => puzzleSummaries.filter((summary) => summary.date === todayKey),
    [puzzleSummaries, todayKey],
  );
  // 홈 스트립은 최근 7일 완료일을 매 렌더 스캔한다(기록 화면 히트맵과 같은 소스).
  // 완료 직후 dateCardStates가 바뀌면 다시 계산되도록 의존성에 넣는다.
  const weeklyStrip = useMemo(
    () => buildWeeklyStreakStrip(getRecentCompletionDates(7), todayKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- localStorage 스캔 결과는 dateCardStates 변화와 함께 바뀐다
    [dateCardStates, todayKey],
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
            ...todayPuzzleSummaries,
            selectedPuzzleSummary,
            ...archivePuzzleSummaries,
          ].filter((summary): summary is PuzzleManifestItem => summary != null),
        ),
      ),
    [archivePuzzleSummaries, todayPuzzleSummaries, selectedPuzzleSummary],
  );
  const recommendationPuzzleSummaries = useMemo(
    () =>
      uniquePuzzleSummaries([
        ...puzzleSummaries,
        ...puzzleArchiveRecords.map((record) =>
          createPuzzleSummary(record.puzzle),
        ),
      ]),
    [puzzleArchiveRecords, puzzleSummaries],
  );
  // KST 날짜별 공용 지갑. 난이도·재시도·지난 퍼즐을 오가도 같은 잔액을 쓴다.
  const activeDailyHintWallet =
    dailyHintWallet.date === todayKey
      ? dailyHintWallet
      : createDailyHintWallet(todayKey);
  const dailyHintBalance = getDailyHintBalance(
    activeDailyHintWallet,
    launchConfig.dailyFreeHintCredits,
  );
  const totalHintCredits = dailyHintBalance.totalCredits;
  const remainingHintCredits = dailyHintBalance.remainingCredits;
  const hintBalance: HintBalance = {
    adsEnabled: launchConfig.rewardedHintAdsEnabled,
    defaultCredits: dailyHintBalance.dailyCredits,
    earnedCredits: dailyHintBalance.earnedCredits,
    isAdBusy: rewardedAdStatus === "loading",
    notice: hintNotice,
    remaining: remainingHintCredits,
    rewardedCredits: launchConfig.rewardedHintCredits,
    total: totalHintCredits,
    used: hintCount,
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

  // 막혔을 때 힌트 자동 노출: 보드(today)에서 시작·미완료 상태일 때 실제 입력이
  // 일정 시간 정체되면 비침습 힌트 CTA를 띄운다. 오답이 쌓여 막힌 신호가 보이면
  // (미완료자 다수가 힌트 없이 이탈) 더 짧은 지연으로 빠르게 띄운다.
  // 정체 판정은 실제 입력(cellValues 변경)에만 반응한다. 단어 선택 이동(칸 탭)은
  // 진척이 아니라 오히려 막힌 사용자가 이 칸 저 칸 헤매는 신호이므로 selectedEntryId를
  // resetKeys에서 제외한다. 예전엔 선택 변경도 타이머를 리셋해, 막혔지만 입력 없이
  // 탐색만 하는 사용자에게는 CTA가 끝내 뜨지 않았다(#184: stuck_hint_prompt 미발화 완화).
  // 타이머·재스케줄·발화 페이로드 최신화는 useStuckHintPrompt 훅에 캡슐화해 회귀
  // 테스트로 고정한다(임계·지연은 launchConfig 원격 조정, idle_seconds는 실제 지연).
  // 완료 직전 마무리 넛지(#280)에 쓸 잔여 미완성 단어 수.
  const stuckHintWordsRemaining =
    puzzle.entries.length - viewModel.completedEntries.length;
  const {
    isVisible: isStuckHintPromptVisible,
    trigger: stuckHintTrigger,
    nearFinish: isStuckHintNearFinish,
    wordsRemaining: stuckHintShownWordsRemaining,
    hide: hideStuckHintPrompt,
    dismiss: dismissStuckHintPromptCta,
  } = useStuckHintPrompt({
    active:
      launchConfig.stuckHintPromptEnabled &&
      route === "today" &&
      hasStarted &&
      !isCompleted,
    resetKeys: [cellValues],
    firstInputPending: isFirstInputPending,
    firstInputIdleMs: launchConfig.stuckHintFirstInputIdleMs,
    wrongCellCount,
    wrongCellThreshold: launchConfig.stuckHintWrongCellThreshold,
    idleMs: launchConfig.stuckHintIdleMs,
    wrongIdleMs: launchConfig.stuckHintWrongIdleMs,
    // 과다 노출 방어(#254, #265): 같은 퍼즐의 재도전·화면 왕복에도 카운터를 유지하고,
    // 노출/닫기 상한·최소 쿨다운·백오프는 launchConfig 원격 조정값을 따른다.
    puzzleKey: puzzle.puzzleId,
    maxPromptsPerAttempt: launchConfig.stuckHintMaxPromptsPerAttempt,
    maxDismissals: launchConfig.stuckHintMaxDismissals,
    dismissBackoffFactor: launchConfig.stuckHintDismissBackoffFactor,
    minCooldownMs: launchConfig.stuckHintMinCooldownMs,
    // 완료 직전 마무리 넛지 판별 입력(#280). 상한·백오프 카운터는 공유하고 문구·CTA만
    // 마무리형으로 바꾼다(별도 카운터 신설 없음 → #265 취지 유지).
    progressPercent,
    wordsRemaining: stuckHintWordsRemaining,
    finishNudgeProgressThreshold: launchConfig.finishNudgeProgressThreshold,
    finishNudgeWordsRemaining: launchConfig.finishNudgeWordsRemaining,
    onShow: ({
      trigger,
      delayMs,
      promptSeq,
      dismissCount,
      nearFinish,
      wordsRemaining,
    }) => {
      telemetry.impression(STUCK_HINT_PROMPT_EVENT, {
        ...puzzleTelemetryParams,
        attempt_number: mission.attemptsUsed,
        hint_count: hintCount,
        idle_seconds: delayMs / 1000,
        progress_percent: progressPercent,
        remaining_hint_credits: remainingHintCredits,
        total_words: puzzle.entries.length,
        trigger,
        prompt_seq: promptSeq,
        dismiss_count: dismissCount,
        words_filled: viewModel.completedEntries.length,
        wrong_cell_count: wrongCellCount,
        near_finish: nearFinish,
        words_remaining: wordsRemaining,
      });
    },
  });

  useEffect(() => {
    if (!usageStatisticsState.ready || !usageStatistics.canTrack()) return;
    telemetry.screen(route, {
      date: puzzle.date,
      puzzle_id: puzzle.puzzleId,
    });
  }, [
    puzzle.date,
    puzzle.puzzleId,
    route,
    usageStatisticsState.ready,
    usageStatisticsState.enabled,
    usageStatisticsState.busy,
  ]);

  // 퍼즐 완료(고관여 시점)에 "오늘의 퍼즐" 복귀 리마인드 사전 안내 카드를 띄운다.
  // 게이트(원격 설정·종결·3회 예산·같은 날 1회)는 코어(shouldPromptReturnReminder)에
  // 두고, 카드에서 "알림 받기"를 누른 뒤에만 AIT 어댑터(requestReturnReminderAgreement)로
  // 시스템 동의 다이얼로그를 띄운다. 시스템 다이얼로그는 한 번 거부되면 되돌리기
  // 어려워 스트릭 프레이밍으로 가치를 먼저 보여 준다. "괜찮아요"·미응답 닫기는 declined
  // 로 기록해 익일에 다시 안내한다(예산은 소진).
  // 카드 상태는 유도 기록(prompted)과, 완료 직후 확정한 스트릭(streakDays)을 함께
  // 동결한다. shown/accept/decline 세 이벤트와 카드 본문이 같은 스트릭 값을 쓴다.
  const [returnReminderPreprompt, setReturnReminderPreprompt] = useState<{
    prompted: ReturnReminderState;
    streakDays: number;
  } | null>(null);
  const [returnReminderReady, setReturnReminderReady] = useState<{
    puzzleId: string;
    streakDays: number;
  } | null>(null);
  const completionCelebrationIdRef = useRef<string | null>(null);
  completionCelebrationIdRef.current = completionCelebrationId;
  const openReturnReminderPreprompt = useCallback(
    (streakDays: number) => {
      const state = loadReturnReminderState();
      const promptDate = getTodayDateKey();
      if (
        !shouldPromptReturnReminder({
          enabled: launchConfig.returnReminderEnabled,
          promptDate,
          state,
        })
      ) {
        return;
      }

      const prompted = markReturnReminderPrompted(state, promptDate);
      saveReturnReminderState(prompted);
      telemetry.impression(
        RETURN_REMINDER_PREPROMPT_EVENT,
        buildReturnReminderPrepromptParams(
          "shown",
          prompted,
          "ait",
          streakDays,
        ),
      );
      setReturnReminderPreprompt({ prompted, streakDays });
    },
    [launchConfig.returnReminderEnabled],
  );

  const acceptReturnReminder = useCallback(() => {
    if (returnReminderPreprompt == null) {
      return;
    }
    const { prompted, streakDays } = returnReminderPreprompt;
    setReturnReminderPreprompt(null);
    telemetry.impression(
      RETURN_REMINDER_PREPROMPT_EVENT,
      buildReturnReminderPrepromptParams("accept", prompted, "ait", streakDays),
    );
    telemetry.impression(
      RETURN_REMINDER_PROMPT_EVENT,
      buildReturnReminderPromptParams(
        "mission_complete",
        RETURN_REMINDER_TEMPLATE_CODE_SOURCE,
      ),
    );

    void requestReturnReminderAgreement().then(
      ({
        outcome,
        errorReason,
        errorCode,
        errorWrapperCode,
        errorShape,
        failureStage,
      }) => {
        const resolved = applyReturnReminderOutcome(prompted, outcome, {
          errorReason,
          errorCode,
          errorWrapperCode,
          errorShape,
          failureStage,
        });
        saveReturnReminderState(resolved);
        telemetry.impression(
          RETURN_REMINDER_RESULT_EVENT,
          buildReturnReminderResultParams(
            resolved,
            RETURN_REMINDER_TEMPLATE_CODE_SOURCE,
          ),
        );
      },
    );
  }, [returnReminderPreprompt]);

  const declineReturnReminder = useCallback(() => {
    if (returnReminderPreprompt == null) {
      return;
    }
    const { prompted, streakDays } = returnReminderPreprompt;
    setReturnReminderPreprompt(null);
    telemetry.impression(
      RETURN_REMINDER_PREPROMPT_EVENT,
      buildReturnReminderPrepromptParams(
        "decline",
        prompted,
        "ait",
        streakDays,
      ),
    );
    saveReturnReminderState(applyReturnReminderOutcome(prompted, "declined"));
  }, [returnReminderPreprompt]);

  // 저장이 끝나고 완료 화면을 실제로 표시한 뒤 사전 안내를 연다.
  useEffect(() => {
    if (
      route === "result" &&
      returnReminderReady?.puzzleId === puzzle.puzzleId
    ) {
      setReturnReminderReady(null);
      openReturnReminderPreprompt(returnReminderReady.streakDays);
    } else if (route !== "today" && route !== "result") {
      if (returnReminderReady) setReturnReminderReady(null);
      if (returnReminderPreprompt) declineReturnReminder();
    }
  }, [
    route,
    puzzle.puzzleId,
    returnReminderReady,
    returnReminderPreprompt,
    openReturnReminderPreprompt,
    declineReturnReminder,
  ]);

  useEffect(() => {
    if (
      !viewModel.isComplete ||
      mission.completedAt != null ||
      completionActionRef.current !== puzzle.puzzleId
    ) {
      return;
    }
    completionActionRef.current = null;
    if (route === "today") {
      completionCelebrationIdRef.current = puzzle.puzzleId;
      setCompletionCelebrationId(puzzle.puzzleId);
    }

    // 퍼즐 완료 사운드·햅틱(설정에 따름). 완료 effect가 1회만 실행되므로 중복 없음.
    emitFeedback("puzzleComplete", { soundEnabled, hapticEnabled });

    const nextMission = completeMission(mission);
    setMission(nextMission);
    // 데일리 스트릭은 "완료 사실"(completedAt 보유 일자)만으로 산정한다.
    // 정답 보기(revealUsed)로 완료해도 완료는 완료로 인정하므로 스트릭은 끊기지
    // 않는다(노힌트·첫 도전·best-time만 revealUsed로 제외 — getCompletionAchievements).
    // 완료 직전 스트릭. 모듈 캐시가 완료 반영 전(오늘 미완료) 값을 보유하고, 아래
    // saveMission→invalidateStreakCache 이후 재계산한 완료 후 스트릭과 비교해 새
    // 마일스톤 도달을 판정한다. 상태(consecutiveStreak) 대신 여기서 직접 읽어
    // effect 의존성을 늘리지 않는다.
    // 이전 값은 오늘 몫을 더하지 않는 비관 계산으로 읽어야 한다. 낙관(+1) 값과 비교하면
    // 완료 전후가 같은 수가 되어 7/30/100일 달성이 발화하지 않는다.
    const previousStreak = readConsecutiveStreakDays({
      countTodayPending: false,
    });
    void missionRepository.saveMission(nextMission).then(() => {
      invalidateStreakCache();
      const nextStreak = readConsecutiveStreakDays();
      setConsecutiveStreak(nextStreak);
      // 완료로 스트릭이 새 마일스톤(7/30/100일)에 도달하면 달성 이벤트를 1회 보낸다.
      // 발화 조건("이전 < 임계 ≤ 현재") 판정은 core 헬퍼가 담당한다(#292).
      emitStreakMilestoneIfReached(gameAnalytics, previousStreak, nextStreak);
      // 복귀 리마인드 사전 안내는 축하 다이얼로그(오늘 화면 완료)에서만 그릴 수 있다.
      // 다이얼로그가 아직 떠 있을 때만 유도로 기록해 카드 없이 예산이 소진되지 않게
      // 하고, 완료 후 확정된 스트릭을 카드·계측이 함께 쓰도록 넘긴다.
      if (route === "today") {
        setReturnReminderReady({
          puzzleId: puzzle.puzzleId,
          streakDays: nextStreak,
        });
      }
    });
    // 완료 시점의 노힌트 판정 신호(힌트 수·정답 보기 여부)를 archive 기록에 동결해,
    // 진행상태 저장소가 비워져도 히스토리 노힌트 집계가 결과 화면과 일치하게 한다.
    void savePuzzleSnapshot(puzzle, {
      completedAt: nextMission.completedAt,
      hintCount,
      revealUsed,
    });
    telemetry.impression("mission_complete", {
      ...puzzleTelemetryParams,
      attempt_number: nextMission.attemptsUsed,
      completed_word_count: viewModel.completedEntries.length,
      completed_at: nextMission.completedAt,
      elapsed_seconds: getElapsedSeconds(
        nextMission.lastStartedAt,
        nextMission.completedAt,
        { pausedMs: pause.pausedMs },
      ),
      earned_hint_credits: earnedHintCredits,
      hint_count: hintCount,
      // 정답 공개로 완료한 미션은 reveal_used=true로 구분해 분석에서 분리한다.
      reveal_used: revealUsed,
      remaining_attempts: getRemainingAttempts(nextMission),
    });
    // 게임 세부 지표: 완료 퍼널 종점 + 풀이 성과(마켓 차원 포함).
    gameAnalytics.track("game_puzzle_complete", getGamePuzzleContext(puzzle), {
      solveTimeSec:
        getElapsedSeconds(nextMission.lastStartedAt, nextMission.completedAt, {
          pausedMs: pause.pausedMs,
        }) ?? 0,
      hintCount,
      revealUsed,
      attemptNumber: nextMission.attemptsUsed,
      completedWordCount: viewModel.completedEntries.length,
    });

    // 리더보드가 켜져 있고 현재 플랫폼이 지원할 때만, 정답 보기 없이 완료한 퍼즐의
    // 점수를 제출한다. 완료 effect는 시도당 1회 실행되지만, ref로 puzzleId 단위
    // 중복 제출까지 막는다(미완료/revealUsed는 shouldSubmitLeaderboardScore가 제외).
    if (
      leaderboardVisible &&
      shouldSubmitLeaderboardScore({
        completed: true,
        revealUsed,
        alreadySubmitted: submittedLeaderboardPuzzleIdsRef.current.has(
          puzzle.puzzleId,
        ),
      })
    ) {
      submittedLeaderboardPuzzleIdsRef.current.add(puzzle.puzzleId);
      // 동일 단어수/도전/힌트인 완료자끼리는 풀이 시간으로 점수를 변별한다.
      const submissionElapsedSeconds = getElapsedSeconds(
        nextMission.lastStartedAt,
        nextMission.completedAt,
        { pausedMs: pause.pausedMs },
      );
      const leaderboardScore = computeLeaderboardScore(
        {
          completedWordCount: viewModel.completedEntries.length,
          remainingAttempts: getRemainingAttempts(nextMission),
          hintCount,
          elapsedSeconds: submissionElapsedSeconds,
        },
        // 점수 가중치는 Remote Config(launchConfig)로 밸런스 조정 가능(#216).
        {
          completedWord: launchConfig.leaderboardScoreCompletedWord,
          remainingAttempt: launchConfig.leaderboardScoreRemainingAttempt,
          hint: launchConfig.leaderboardScoreHint,
          timeBonusBase: launchConfig.leaderboardScoreTimeBonusBase,
          timeDecayPerSecond: launchConfig.leaderboardScoreTimeDecayPerSecond,
        },
      );
      void submitLeaderboardScore(leaderboardScore, {
        puzzleId: puzzle.puzzleId,
        difficulty: puzzle.difficulty,
        elapsedSeconds: submissionElapsedSeconds,
      });
    }

    // 정답 공개(revealUsed)면 무조건 최고 기록 갱신에서 제외한다(revealUsed를
    // 최우선 가드로 두어 정책 의도를 명시). bestTimeEligible === !revealUsed.
    if (
      !revealUsed &&
      nextMission.lastStartedAt != null &&
      nextMission.completedAt != null
    ) {
      // 최고 기록도 일시정지 누적(pausedMs)을 제외한 순수 풀이 시간으로 판정한다.
      const elapsedMs =
        computeElapsedMs({
          startedAt: nextMission.lastStartedAt,
          endedAt: nextMission.completedAt,
          pausedMs: pause.pausedMs,
        }) ?? 0;
      // 갱신 판정(유효한 시간이고 기존 기록이 없거나 더 빠름)은 core 규칙을 쓴다(RN 동일).
      if (
        shouldRecordBestTime(getBestTimeMs(puzzle.puzzleId), elapsedMs) &&
        saveBestTimeMs(puzzle.puzzleId, elapsedMs)
      ) {
        setIsNewBestTime(true);
      }
    }

    if (route === "today") {
      navigate("result");
    }
  }, [
    earnedHintCredits,
    hapticEnabled,
    hintCount,
    launchConfig,
    openReturnReminderPreprompt,
    mission,
    pause.pausedMs,
    puzzle,
    puzzleTelemetryParams,
    revealUsed,
    savePuzzleSnapshot,
    route,
    soundEnabled,
    leaderboardVisible,
    submitLeaderboardScore,
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
      // 게임 세부 지표: 진행 마일스톤 도달(완료 퍼널 중간 단계).
      gameAnalytics.track("game_progress", getGamePuzzleContext(puzzle), {
        completedWordCount: viewModel.completedEntries.length,
        totalWordCount: puzzle.entries.length,
        progressPercent,
        attemptNumber: mission.attemptsUsed,
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
    // 일시정지 중에는 문제 선택 변경을 막는다.
    if (isPaused) {
      return;
    }
    if (tileAdvanceRef.current) clearTimeout(tileAdvanceRef.current);
    setTileStatus("idle");
    setSelectedEntryId(entry.id);
    setSelectedDirection(entry.direction);
    setSelectedCellKey(cellKey);
  }

  // 새 시도 시작 또는 퍼즐 전환 시 일시정지 상태를 초기화한다.
  useEffect(() => {
    setPause({ pausedMs: 0, pausedAt: null });
    autoPausedRef.current = false;
  }, [mission.lastStartedAt, mission.puzzleId]);

  // 일시정지↔재개 토글. 진행 중(시작·미완료)일 때만 조작을 허용한다. 상태 전이
  // 계산은 공유 코어(togglePauseState)에 위임해 순수하게 유지한다.
  const togglePause = useCallback(() => {
    if (!hasStarted || isCompleted) {
      return;
    }
    setPause((prev) => togglePauseState(prev, new Date()));
  }, [hasStarted, isCompleted]);

  function selectCell(row: number, col: number) {
    // 일시정지 중에는 셀 선택을 막는다.
    if (isPaused) {
      return;
    }
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

  function markCompletionAction(values: Record<string, string>) {
    if (
      !viewModel.isComplete &&
      puzzle.entries.length > 0 &&
      getCompletedEntries(puzzle.entries, values).length ===
        puzzle.entries.length
    )
      completionActionRef.current = puzzle.puzzleId;
  }

  function changeTileState(next: LetterTileState, action: TileInputAction) {
    if (isPaused || (!hasStarted && action !== "select")) return;
    if (tileAdvanceRef.current) clearTimeout(tileAdvanceRef.current);
    const entry = puzzle.entries.find(
      (item) => item.id === next.progress.entryId,
    );
    markCompletionAction(next.cellValues);
    setCellValues(next.cellValues);
    setTileInput(next.progress);
    setTileStatus(next.status);
    setSelectedEntryId(next.progress.entryId);
    setSelectedCellKey(next.progress.activeCellKey);
    if (entry) setSelectedDirection(entry.direction);
    if (action === "choice" && entry) {
      trackFirstAnswerInput(entry, 1, "manual");
      telemetry.click(LETTER_TILE_CHOOSE_EVENT, {
        ...puzzleTelemetryParams,
        entry_id: entry.id,
        input_policy: TILE_INPUT_POLICY_VERSION,
        result: next.status,
      });
      if (next.status === "repair")
        emitFeedback("wrong", { soundEnabled, hapticEnabled });
      if (next.status === "correct")
        emitWordInputFeedback(entry, cellValues, next.cellValues);
    }
    if (next.status === "correct") {
      const id = recommendLetterEntry(
        puzzle,
        next,
        guideActive ? firstWordGuide.entryIds : [],
      );
      if (id)
        tileAdvanceRef.current = setTimeout(
          () => changeTileState(selectLetterEntry(puzzle, next, id), "select"),
          650,
        );
    }
  }

  function markFirstInputGuideSeen() {
    persistFirstInputGuideSeen();
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
        // 게임 세부 지표: 첫 입력(참여 시작). 시작→첫입력 소요로 초반 이탈을 본다.
        gameAnalytics.track("game_first_input", getGamePuzzleContext(puzzle), {
          timeToFirstInputSec: getElapsedSeconds(mission.lastStartedAt) ?? 0,
          attemptNumber: mission.attemptsUsed,
        });
      }

      // 가이드가 떠 있는 동안(또는 보기 전) 첫 입력에 성공하면 가이드 완료로 본다.
      if (!hasSeenFirstInputGuide) {
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

  // 임시(연필) 셀 집합을 한 번의 업데이트로 갱신한다(공유 순수 로직 사용).
  function updateTentativeCells(adds: string[], removes: string[]) {
    if (adds.length === 0 && removes.length === 0) {
      return;
    }
    setTentativeCellKeys((prev) => applyTentativeUpdate(prev, adds, removes));
  }

  // 입력 결과에 따라 사운드·햅틱 피드백을 발생시킨다. 단어가 새로 완성되면 완성음,
  // 그렇지 않고 오답 글자가 새로 들어오면 오답음을 준다. 단, 이 입력이 퍼즐 전체를
  // 완성하면 완성음 대신 퍼즐 완료 피드백(완료 effect)에 맡겨 중복을 막는다.
  function emitWordInputFeedback(
    entry: PuzzleEntry,
    prevValues: Record<string, string>,
    nextValues: Record<string, string>,
  ) {
    const settings = { soundEnabled, hapticEnabled };
    const wasComplete = getEntryAnswerValue(entry, prevValues) === entry.answer;
    const isComplete = getEntryAnswerValue(entry, nextValues) === entry.answer;

    if (!wasComplete && isComplete) {
      const puzzleComplete =
        getCompletedEntries(puzzle.entries, nextValues).length ===
        puzzle.entries.length;
      if (!puzzleComplete) {
        emitFeedback("wordComplete", settings);
        // 입문(easy) 온보딩 퍼즐에서는 단어를 완성할 때마다 즉시 시각 피드백을 더해
        // 첫 성공(활성화) 동기를 강화한다(#163). 사운드·햅틱은 위 wordComplete로 처리.
        if (
          shouldCelebrateOnboardingWordCompletion({
            isOnboardingPuzzle: puzzle.puzzleId === onboardingPuzzle.puzzleId,
            justCompletedWord: true,
            puzzleComplete,
          })
        ) {
          showHintToast(ONBOARDING_WORD_COMPLETE_MESSAGE);
        }
      }
      return;
    }

    if (!isComplete) {
      const answerLetters = [...entry.answer];
      const hasNewWrong = getEntryCells(entry).some((cell, index) => {
        const key = getCellKey(cell.row, cell.col);
        const value = nextValues[key];
        return (
          value != null &&
          value !== answerLetters[index] &&
          prevValues[key] !== value
        );
      });
      if (hasNewWrong) {
        emitFeedback("wrong", settings);
      }
    }
  }

  function applyAnswer(
    entry: PuzzleEntry,
    value: string,
    source: "debug" | "manual" | "reveal" = "manual",
  ) {
    // 일시정지 중에는 수동 글자 입력을 막는다(정답 공개 등 비수동 경로는 허용).
    if (isPaused && source === "manual") {
      return;
    }
    const cells = getEntryCells(entry);
    const nextLetters = getAnswerInputLetters(value, cells.length);
    const nextValues = { ...cellValues };

    trackFirstAnswerInput(entry, nextLetters.length, source);

    const markTentative = shouldMarkTentative(pencilMode, source);
    const tentativeChanges: CellLetterChange[] = [];

    cells.forEach((cell, index) => {
      const key = getCellKey(cell.row, cell.col);
      const nextLetter = nextLetters[index];
      const prevLetter = cellValues[key] ?? null;

      if (nextLetter == null) {
        delete nextValues[key];
        // 값이 실제로 지워진 셀만 임시 셋에서 정리한다.
        if (prevLetter != null) {
          tentativeChanges.push({ key, hasValue: false });
        }
      } else {
        nextValues[key] = nextLetter;
        // 값이 바뀐 셀만 임시/확정 전환한다. 값이 유지된 교차 셀은 기존 임시
        // 상태를 보존해 "어디부터 의심할지" 추적 맥락을 잃지 않는다.
        if (nextLetter !== prevLetter) {
          tentativeChanges.push({ key, hasValue: true });
        }
      }
    });

    markCompletionAction(nextValues);
    setCellValues(nextValues);
    const { adds, removes } = computeTentativeUpdate(
      tentativeChanges,
      markTentative,
    );
    updateTentativeCells(adds, removes);
    emitWordInputFeedback(entry, cellValues, nextValues);

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
    // 일시정지 중에는 수동 글자 입력을 막는다.
    if (isPaused && source === "manual") {
      return;
    }
    const cells = getEntryCells(entry);
    const startIndex = getEntryCellIndex(entry, startCellKey);
    const nextLetters = getAnswerInputLetters(value, cells.length - startIndex);

    if (nextLetters.length === 0) {
      return;
    }

    const nextValues = { ...cellValues };

    trackFirstAnswerInput(entry, nextLetters.length, source);

    const markTentative = shouldMarkTentative(pencilMode, source);
    const tentativeChanges: CellLetterChange[] = [];

    nextLetters.forEach((letter, offset) => {
      const cell = cells[startIndex + offset];

      if (cell != null) {
        const key = getCellKey(cell.row, cell.col);
        nextValues[key] = letter;
        tentativeChanges.push({ key, hasValue: true });
      }
    });

    markCompletionAction(nextValues);
    setCellValues(nextValues);
    const { adds, removes } = computeTentativeUpdate(
      tentativeChanges,
      markTentative,
    );
    updateTentativeCells(adds, removes);
    emitWordInputFeedback(entry, cellValues, nextValues);
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
    markCompletionAction(nextValues);
    setCellValues(nextValues);
    updateTentativeCells([], [targetKey]);
    setSelectedCellKey(targetKey);
  }

  function clearEntryAnswer(entry: PuzzleEntry) {
    const nextValues = { ...cellValues };
    const tentativeRemoves: string[] = [];

    for (const cell of getEntryCells(entry)) {
      const key = getCellKey(cell.row, cell.col);

      // Leave already-correct (locked) letters so a wrong-cell wipe keeps them.
      if (!isCellLocked(puzzle, cellValues, key)) {
        delete nextValues[key];
        tentativeRemoves.push(key);
      }
    }

    markCompletionAction(nextValues);
    setCellValues(nextValues);
    updateTentativeCells([], tentativeRemoves);
    setSelectedCellKey(getEntryStartCellKey(entry));
  }

  function revealLetter() {
    const selectedEntry = viewModel.selectedEntry;
    if (selectedEntry == null) {
      return false;
    }

    if (remainingHintCredits === 0) {
      setHintNotice(
        "오늘의 무료 힌트를 모두 썼어요. 광고를 보면 힌트를 더 받을 수 있어요.",
      );
      return false;
    }

    const cells = getEntryCells(selectedEntry);
    const answerLetters = [...selectedEntry.answer];
    // 앞 칸부터가 아니라 교차 칸을 우선해 공개한다(교차 시 두 단어에 도움).
    const targetIndex = pickHintCellIndex(
      selectedEntry,
      cellValues,
      viewModel.cellEntries,
    );

    if (targetIndex === -1) {
      setHintNotice("선택한 단어는 이미 모두 채워졌어요.");
      return false;
    }

    const targetCell = cells[targetIndex];
    const targetCellKey = getCellKey(targetCell.row, targetCell.col);
    const nextWallet = consumeDailyHintCredit(
      activeDailyHintWallet,
      launchConfig.dailyFreeHintCredits,
    );
    if (nextWallet == null) {
      setHintNotice(
        "오늘의 무료 힌트를 모두 썼어요. 광고를 보면 힌트를 더 받을 수 있어요.",
      );
      return false;
    }
    persistDailyHintWallet(nextWallet);
    setHintCount((prev) => prev + 1);
    const hinted = confirmLetterTileCell(
      puzzle,
      {
        ...tileState,
        cellValues: {
          ...cellValues,
          [targetCellKey]: answerLetters[targetIndex],
        },
      },
      targetCellKey,
    );
    changeTileState(hinted, "select");
    // 힌트로 채운 정답 글자는 임시가 아니므로 확정 처리한다.
    updateTentativeCells([], [targetCellKey]);
    setHintNotice(
      `힌트 1개를 사용했어요. 남은 힌트 ${remainingHintCredits - 1}개`,
    );
    telemetry.click("hint_reveal", {
      hint_remaining_after: remainingHintCredits - 1,
      hint_used: hintCount + 1,
      puzzle_id: puzzle.puzzleId,
    });
    // 게임 세부 지표: 힌트 사용(콘텐츠 난이도 체감 신호).
    gameAnalytics.track("game_hint_use", getGamePuzzleContext(puzzle), {
      hintType: "hint",
      hintRemainingAfter: remainingHintCredits - 1,
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

    setHintNotice("광고를 준비하는 중이에요.");
    // 게임 세부 지표: 리워드 광고 보조 요청(힌트).
    gameAnalytics.track("game_assist_ad", getGamePuzzleContext(puzzle), {
      assistType: "rewarded_hint",
      result: "request",
    });

    await runRewardedHintAdFlow({
      attempt: async (attempt: RewardedAdRetryAttempt) =>
        showRewardedHintAd((event) => {
          trackRewardedHintAdTrace(
            telemetry,
            mapFullScreenAdTraceEvent(event),
            {
              ad_placement: "rewardedHint",
              puzzle_id: puzzle.puzzleId,
              retry: attempt,
            },
          );
        }),
      getStatus: (result) => result.status,
      // [#381] 웹 어댑터(loadAndShowFullScreenAd)는 항상 FullScreenAdResult로
      // 정착하고 예외를 던지지 않는다. 공유 코어 인터페이스가 요구하는 안전망만
      // 채운다 — 실제로 호출될 것으로 기대하지 않으며, 웹 광고 흐름은 바꾸지 않는다.
      mapError: (): FullScreenAdResult => ({
        reason: "exception",
        status: "failed",
      }),
      onAttemptResult: (result, retry) => {
        trackRewardedHintAdResult(
          telemetry,
          {
            ...getFullScreenAdResultParams(result),
            puzzle_id: puzzle.puzzleId,
          },
          retry,
        );
      },
      onAttemptStart: (retry) => {
        trackRewardedHintAdRequest(
          telemetry,
          {
            puzzle_id: puzzle.puzzleId,
            rewarded_hint_credits: launchConfig.rewardedHintCredits,
          },
          retry,
        );
      },
      onFailure: (result) => {
        // onFailure는 실패 결과에만 호출되지만 콜백 타입은 성공("rewarded")까지
        // 포함한 FullScreenAdResult이므로, 실패 전용 메시지 함수에 넘기기 전에
        // 성공 케이스를 좁혀낸다.
        if (result.status === "rewarded") {
          return;
        }
        // 게임 세부 지표: 리워드 광고 보조 실패/취소(힌트). 유저 취소(dismissed)는
        // dismiss, 그 외 실패(failed/timeout/unsupported)는 error로 계측한다(#321).
        gameAnalytics.track("game_assist_ad", getGamePuzzleContext(puzzle), {
          assistType: "rewarded_hint",
          result: mapRewardedAdFailureToAssistResult(result.status),
        });
        const message = getRewardedHintFailureMessage(result);
        setHintNotice(message);
        showHintToast(message);
      },
      onLoadingChange: (isLoading) => {
        setRewardedAdStatus(isLoading ? "loading" : "idle");
      },
      onRetry: () => {
        const message = "광고를 다시 준비하는 중이에요.";
        setHintNotice(message);
        showHintToast(message);
      },
      onReward: (_result, retry) => {
        persistDailyHintWallet(
          grantDailyHintCredits(
            activeDailyHintWallet,
            launchConfig.rewardedHintCredits,
          ),
        );
        const message = `힌트 +${launchConfig.rewardedHintCredits}개가 추가됐어요.`;
        setHintNotice(message);
        showHintToast(message);
        telemetry.impression(REWARDED_HINT_AD_REWARD_EVENT, {
          puzzle_id: puzzle.puzzleId,
          retry,
          rewarded_hint_credits: launchConfig.rewardedHintCredits,
        });
        // 게임 세부 지표: 리워드 광고 보조 보상 지급(힌트).
        gameAnalytics.track("game_assist_ad", getGamePuzzleContext(puzzle), {
          assistType: "rewarded_hint",
          result: "reward",
        });
      },
    });
  }

  function useHintOrRequestReward() {
    if (remainingHintCredits > 0) {
      revealLetter();
      return;
    }

    setIsRewardedHintPromptOpen(true);
  }

  function acceptStuckHintPrompt() {
    hideStuckHintPrompt();
    telemetry.click(STUCK_HINT_PROMPT_ACCEPT_EVENT, {
      ...puzzleTelemetryParams,
      attempt_number: mission.attemptsUsed,
      progress_percent: progressPercent,
      remaining_hint_credits: remainingHintCredits,
      trigger: stuckHintTrigger,
      near_finish: isStuckHintNearFinish,
      words_remaining: stuckHintShownWordsRemaining,
    });
    // useHintOrRequestReward와 동일 동작(이름의 use 접두사로 인한 hook 오탐 회피).
    if (remainingHintCredits > 0) {
      revealLetter();
    } else {
      setIsRewardedHintPromptOpen(true);
    }
  }

  // 첫 입력 전 넛지 수락(#346): 힌트를 소비하지 않고 실제로 입력 가능한 첫 빈 칸을
  // 선택한 뒤 TodayScreen의 현재 입력 모드에 맞는 native input 포커스를 재요청한다.
  function acceptFirstInputNudge() {
    hideStuckHintPrompt();
    telemetry.click(STUCK_HINT_PROMPT_ACCEPT_EVENT, {
      ...puzzleTelemetryParams,
      attempt_number: mission.attemptsUsed,
      progress_percent: progressPercent,
      remaining_hint_credits: remainingHintCredits,
      trigger: "first_input",
      near_finish: false,
      words_remaining: stuckHintShownWordsRemaining,
    });
    const starter = resolveStarterCell({ cellValues, puzzle });
    if (starter != null) {
      const starterEntry = puzzle.entries.find(
        (entry) => entry.id === starter.entryId,
      );
      if (starterEntry != null) {
        selectEntry(starterEntry, starter.cellKey);
      }
    }
    setStuckHintFocusRequestId((requestId) => requestId + 1);
  }

  // 완료 직전 마무리 넛지 수락(#280): 남은 미완성 단어 중 첫 단서를 선택·하이라이트로
  // 이동시켜, 완료 직전에 막힌 사용자가 바로 남은 단어에 손대게 한다. 힌트를 소모하지
  // 않는 안내형 CTA다(기존 한 글자 힌트/단어 공개 CTA는 그대로 유지).
  function acceptNearFinishNudge() {
    hideStuckHintPrompt();
    telemetry.click(STUCK_HINT_PROMPT_ACCEPT_EVENT, {
      ...puzzleTelemetryParams,
      attempt_number: mission.attemptsUsed,
      progress_percent: progressPercent,
      remaining_hint_credits: remainingHintCredits,
      trigger: stuckHintTrigger,
      near_finish: true,
      words_remaining: stuckHintShownWordsRemaining,
    });
    const firstIncomplete = getFirstIncompleteEntry(puzzle.entries, cellValues);
    if (firstIncomplete != null) {
      selectEntry(firstIncomplete);
    }
  }

  // 막힘 안내에서 "이 단어 정답 보기"로 빠져나가기. 선택된 미완성 단어를 즉시
  // 공개해(revealSelectedWord) 막힌 사용자가 완료까지 진행하도록 돕는다(#163).
  function acceptStuckWordReveal() {
    hideStuckHintPrompt();
    telemetry.click(STUCK_HINT_PROMPT_REVEAL_WORD_EVENT, {
      ...puzzleTelemetryParams,
      attempt_number: mission.attemptsUsed,
      progress_percent: progressPercent,
      trigger: stuckHintTrigger,
      near_finish: isStuckHintNearFinish,
      words_remaining: stuckHintShownWordsRemaining,
    });
    revealSelectedWord();
  }

  function dismissStuckHintPrompt() {
    // 닫기 카운터를 올려 백오프·상한을 재평가한다(#254). 단순 숨김(hide)과 구분한다.
    dismissStuckHintPromptCta();
    telemetry.click(STUCK_HINT_PROMPT_DISMISS_EVENT, {
      ...puzzleTelemetryParams,
      attempt_number: mission.attemptsUsed,
      progress_percent: progressPercent,
      trigger: stuckHintTrigger,
      near_finish: isStuckHintNearFinish,
      words_remaining: stuckHintShownWordsRemaining,
    });
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

    markCompletionAction(nextValues);
    setCellValues(nextValues);
    setTentativeCellKeys(new Set());
  }

  // 막힘 안내(acceptStuckWordReveal)에서 호출하는 "이 단어 정답 보기". 선택 단어를
  // 정답으로 채우고 revealUsed를 세워, 노힌트/첫 도전 배지와 최고 기록 판정에서
  // 제외한다(getCompletionAchievements).
  function revealSelectedWord() {
    const selectedEntry = viewModel.selectedEntry;
    if (selectedEntry == null) {
      showHintToast("먼저 단서를 선택하세요.");
      return;
    }

    if (
      getEntryAnswerValue(selectedEntry, cellValues) === selectedEntry.answer
    ) {
      // hintNotice는 노출 채널이 화면마다 달라, 항상 보이는 토스트로 피드백한다.
      showHintToast("이미 정답이 채워진 단어예요.");
      return;
    }

    setRevealUsed(true);
    applyAnswer(selectedEntry, selectedEntry.answer, "reveal");
    telemetry.click("reveal_word", {
      puzzle_id: puzzle.puzzleId,
      entry_id: selectedEntry.id,
      progress_percent: progressPercent,
    });
    // 게임 세부 지표: 단어 정답 보기(강한 보조 사용).
    gameAnalytics.track("game_hint_use", getGamePuzzleContext(puzzle), {
      hintType: "reveal_word",
    });
  }

  function toggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      saveSoundEnabled(next);
      return next;
    });
  }

  function toggleHaptic() {
    setHapticEnabled((prev) => {
      const next = !prev;
      saveHapticEnabled(next);
      return next;
    });
  }

  function toggleAutocheck() {
    setAutocheckEnabled((prev) => {
      const next = !prev;
      saveAutocheckEnabled(next);
      return next;
    });
  }

  function toggleTimerVisible() {
    setTimerVisible((prev) => {
      const next = !prev;
      saveTimerVisible(next);
      return next;
    });
  }

  function selectTextScale(scale: TextScale) {
    setTextScale(scale);
    saveTextScale(scale);
  }

  function togglePencilMode() {
    setPencilMode((prev) => !prev);
  }

  async function clearProgress() {
    // 저장소 작업 먼저: 실패 시 UI 상태를 건드리지 않아 저장소-UI 일관성 유지
    await progressRepository.clearProgress(puzzle.puzzleId);

    setCellValues({});
    setTileInput(undefined);
    setTileStatus("idle");
    setTentativeCellKeys(new Set());
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
    // 게임 세부 지표: 시도 시작(첫 도전/재도전 구분, 마켓 차원 포함).
    gameAnalytics.track("game_puzzle_start", getGamePuzzleContext(puzzle), {
      attemptKind,
      attemptNumber: nextMission.attemptsUsed,
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

  // 특정 퍼즐을 로드해 바로 시작(필요 시 첫 시도)하고 풀이 화면으로 이동한다.
  // 홈 사다리 단계와 완료 후 "다음 퍼즐"이 공유하는 로드+시작 로직이다.
  async function startPuzzleById(
    targetPuzzleId: string,
    source: string,
    extraParams: Record<string, string | number> = {},
  ) {
    if (loadState === "loading") {
      return;
    }

    const session = await loadPuzzleSession(targetPuzzleId);

    if (session == null) {
      setLoadState("fallback");
      setHintToast((prev) => ({
        id: prev.id + 1,
        message: "오늘의 퍼즐을 불러오지 못했어요.",
      }));
      telemetry.click("home_quick_start", {
        puzzle_id: targetPuzzleId,
        ...extraParams,
        source,
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
        earned_hint_credits: earnedHintCredits,
        hint_count: session.savedProgress.hintCount,
        remaining_attempts: getRemainingAttempts(nextMission),
        started_at: nextMission.lastStartedAt,
      });
      telemetry.impression("attempt_start", {
        ...getPuzzleTelemetryParams(session.nextPuzzle),
        attempt_kind: "first",
        attempt_number: nextMission.attemptsUsed,
        earned_hint_credits: earnedHintCredits,
        hint_count: session.savedProgress.hintCount,
        remaining_attempts: getRemainingAttempts(nextMission),
        started_at: nextMission.lastStartedAt,
      });
      // 게임 세부 지표: 시도 시작(완료 퍼널 시작점, 마켓 차원 포함).
      gameAnalytics.track(
        "game_puzzle_start",
        getGamePuzzleContext(session.nextPuzzle),
        { attemptKind: "first", attemptNumber: nextMission.attemptsUsed },
      );
    }

    await savePuzzleSnapshot(session.nextPuzzle, {
      completedAt: nextMission.completedAt,
      startedAt: nextMission.lastStartedAt,
    });
    applyPuzzleSession(session, { mission: nextMission });
    // 완료했거나 도전 기회를 모두 써 더 풀 수 없는 판은 결과 화면으로 보낸다(이전 홈
    // CTA와 동일). 풀이 화면은 읽기 전용이라 결과 동선이 없다.
    const isExhausted =
      nextMission.completedAt == null &&
      alreadyStarted &&
      getRemainingAttempts(nextMission) === 0;
    navigate(
      nextMission.completedAt != null ||
        getCompletedEntries(
          session.nextPuzzle.entries,
          session.savedProgress.cellValues,
        ).length === session.nextPuzzle.entries.length ||
        isExhausted
        ? "result"
        : "today",
    );
    telemetry.click("home_quick_start", {
      ...getPuzzleTelemetryParams(session.nextPuzzle),
      ...extraParams,
      source,
      status: "loaded",
    });
  }

  // 재도전 시작 공통 로직. 결과 화면 '다시 도전'과 소진 구제 충전(#204) 직후
  // 재도전이 같은 진행 초기화·attempt_start(retry) 계약을 공유한다.
  async function startRetryAttempt(baseMission: DailyMissionState) {
    if (getRemainingAttempts(baseMission) === 0) {
      return;
    }

    try {
      await clearProgress();
      setIsNewBestTime(false);
      const nextMission = startMissionAttempt(baseMission);
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
        earnedHintCredits,
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

  async function restartMissionAttempt() {
    await startRetryAttempt(mission);
  }

  function selectAnswerInputMode(mode: AnswerInputMode) {
    setAnswerInputMode(mode);
    saveAnswerInputMode(mode);
  }

  const commonScreenProps = {
    answerInputMode,
    applyAnswer,
    applyAnswerSegment,
    autocheckEnabled,
    selectAnswerInputMode,
    cellValues,
    checkedCellKeys: EMPTY_CELL_KEY_SET,
    clearAnswerCell,
    clearEntryAnswer,
    clueEntries: viewModel.clueEntries,
    completedEntries: viewModel.completedEntries,
    hintBalance,
    hintCount,
    hapticEnabled,
    mission,
    pencilMode,
    puzzle,
    remainingAttempts,
    requestRewardedHint,
    revealLetter,
    revealUsed,
    selectTextScale,
    soundEnabled,
    tentativeCellKeys,
    textScale,
    timerVisible,
    toggleAutocheck,
    toggleHaptic,
    togglePencilMode,
    toggleSound,
    toggleTimerVisible,
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
        onboardingDifficultyRampEnabled={
          launchConfig.onboardingDifficultyRampEnabled
        }
        recommendationPuzzleSummaries={recommendationPuzzleSummaries}
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
        route === "home" || route === "result" ? "appShellTiles" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      // 글자 크기 설정을 보드 셀/단서 글자에 CSS 변수로 반영한다(#217).
      style={
        {
          "--cell-font-scale": getTextScaleFontMultiplier(textScale),
        } as CSSProperties
      }
    >
      {route === "today" ? (
        <TodayScreen
          {...commonScreenProps}
          {...dateSelectionProps}
          onOpenSettings={() => setSettingsOpen(true)}
          tileState={tileState}
          onTileChange={changeTileState}
          tileGuide={
            guideActive
              ? {
                  completed: guideCompleted,
                  total: firstWordGuide.entryIds.length,
                  onSkip: () => {
                    setFirstWordGuide({ ...firstWordGuide, status: "skipped" });
                    telemetry.click(
                      FIRST_WORD_GUIDE_EVENTS.skip,
                      buildFirstWordGuideTelemetryParams(
                        puzzle.puzzleId,
                        guideCompleted,
                      ),
                    );
                  },
                }
              : undefined
          }
          completionCelebrationId={completionCelebrationId}
          consecutiveStreak={consecutiveStreak}
          dismissCompletionCelebration={() => setCompletionCelebrationId(null)}
          returnReminderPreprompt={
            returnReminderPreprompt == null
              ? undefined
              : {
                  body: formatReturnReminderPrepromptBody(
                    returnReminderPreprompt.streakDays,
                  ),
                  onAccept: acceptReturnReminder,
                  onDecline: declineReturnReminder,
                }
          }
          hasStarted={hasStarted}
          isCompleted={isCompleted}
          stuckHintFocusRequestId={stuckHintFocusRequestId}
          isNewBestTime={isNewBestTime}
          isPaused={isPaused}
          navigate={navigate}
          onboardingDifficultyRampEnabled={
            launchConfig.onboardingDifficultyRampEnabled
          }
          recommendationPuzzleSummaries={recommendationPuzzleSummaries}
          pause={pause}
          togglePause={togglePause}
          startOrResumeMission={startOrResumeMission}
        />
      ) : route === "result" ? (
        <ResultScreen
          {...dateSelectionProps}
          returnReminderPreprompt={
            returnReminderPreprompt
              ? {
                  body: formatReturnReminderPrepromptBody(
                    returnReminderPreprompt.streakDays,
                  ),
                  onAccept: acceptReturnReminder,
                  onDecline: declineReturnReminder,
                }
              : undefined
          }
          cellValues={cellValues}
          completedEntries={viewModel.completedEntries}
          consecutiveStreak={consecutiveStreak}
          hintCount={hintCount}
          isNewBestTime={isNewBestTime}
          leaderboardVisible={leaderboardVisible}
          mission={mission}
          navigate={navigate}
          onboardingDifficultyRampEnabled={
            launchConfig.onboardingDifficultyRampEnabled
          }
          recommendationPuzzleSummaries={recommendationPuzzleSummaries}
          onOpenLeaderboard={() => {
            telemetry.click("leaderboard_open", {
              puzzle_id: puzzle.puzzleId,
              difficulty: puzzle.difficulty,
            });
            void openLeaderboard();
          }}
          pause={pause}
          progressPercent={progressPercent}
          puzzle={puzzle}
          remainingAttempts={remainingAttempts}
          restartMissionAttempt={restartMissionAttempt}
          revealUsed={revealUsed}
        />
      ) : route === "history" ? (
        <HistoryScreen
          {...dateSelectionProps}
          archiveRecords={puzzleArchiveRecords}
          completedEntries={viewModel.completedEntries}
          consecutiveStreak={consecutiveStreak}
          hintCount={hintCount}
          isCompleted={isCompleted}
          mission={mission}
          navigate={navigate}
          progressPercent={progressPercent}
          puzzle={puzzle}
          remainingAttempts={remainingAttempts}
          startOrResumeMission={startOrResumeMission}
        />
      ) : route === "resume" ? (
        <ResumeScreen
          archiveRecords={puzzleArchiveRecords}
          dateCardStates={dateCardStates}
          loadState={loadState}
          navigate={navigate}
          selectPuzzle={selectPuzzle}
        />
      ) : route === "license" ? (
        <LicenseScreen navigate={navigate} />
      ) : (
        <HomeScreen
          puzzle={puzzle}
          puzzleSummaries={puzzleSummaries}
          dateCardStates={dateCardStates}
          loadState={loadState}
          navigate={navigate}
          consecutiveStreak={consecutiveStreak}
          weeklyStrip={weeklyStrip}
          onOpenSettings={() => setSettingsOpen(true)}
          startDailyPuzzle={(id) => {
            void startPuzzleById(id, "single_daily").catch(() =>
              showHintToast("퍼즐을 불러오지 못했어요. 다시 눌러주세요."),
            );
          }}
        />
      )}
      {settingsOpen ? (
        <div className="settingsTileLayer">
          <SettingsSheet
            usageStatistics={usageStatisticsState}
            toggleUsageStatistics={() => {
              void usageStatistics.setEnabled(!usageStatisticsState.enabled);
            }}
            hapticEnabled={hapticEnabled}
            soundEnabled={soundEnabled}
            timerVisible={timerVisible}
            textScale={textScale}
            selectTextScale={selectTextScale}
            toggleHaptic={toggleHaptic}
            toggleSound={toggleSound}
            toggleTimerVisible={toggleTimerVisible}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      ) : null}
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
        <StuckHintPrompt
          trigger={stuckHintTrigger}
          nearFinish={isStuckHintNearFinish}
          wordsRemaining={stuckHintShownWordsRemaining}
          hasHintCredits={remainingHintCredits > 0}
          offerWordReveal={shouldOfferStuckWordReveal({
            hasSelectedEntry: viewModel.selectedEntry != null,
            isSelectedEntryComplete:
              viewModel.selectedEntry != null &&
              getEntryAnswerValue(viewModel.selectedEntry, cellValues) ===
                viewModel.selectedEntry.answer,
          })}
          onAcceptFirstInput={acceptFirstInputNudge}
          onAcceptHint={acceptStuckHintPrompt}
          onAcceptNearFinish={acceptNearFinishNudge}
          onRevealWord={acceptStuckWordReveal}
          onDismiss={dismissStuckHintPrompt}
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

type HomeScreenProps = {
  puzzle: Puzzle;
  puzzleSummaries: PuzzleManifestItem[];
  dateCardStates: Record<string, DateCardState>;
  loadState: LoadState;
  navigate: (route: AppRoute) => void;
  consecutiveStreak: number;
  weeklyStrip: WeeklyStreakStripDay[];
  startDailyPuzzle: (id: string) => void;
  onOpenSettings: () => void;
};

function HomeScreen({
  puzzle,
  puzzleSummaries,
  dateCardStates,
  loadState,
  navigate,
  consecutiveStreak,
  weeklyStrip,
  startDailyPuzzle,
  onOpenSettings,
}: HomeScreenProps) {
  const summary = getDailyFreePuzzleSummary(puzzleSummaries, getTodayDateKey());
  const [preview, setPreview] = useState<Puzzle | null>(
    summary?.puzzleId === puzzle.puzzleId ? puzzle : null,
  );
  const [previewError, setPreviewError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setPreviewError(false);
    if (!summary) {
      setPreview(null);
      return;
    }
    void puzzleRepository
      .getPuzzleById(summary.puzzleId)
      .then((next) => {
        if (!cancelled) {
          setPreview(next);
          setPreviewError(next == null);
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [summary, retry]);
  const saved = summary ? dateCardStates[summary.puzzleId] : undefined;
  const finished = saved?.completedAt != null;
  const started = (saved?.attemptsUsed ?? 0) > 0 || saved?.hasProgress;
  const loading = loadState === "loading" || (!preview && !previewError);
  return (
    <section className="tileHome" aria-label="홈">
      <header className="tileHomeNav">
        <span className="tileBrand">
          낱말 한 판<span>DAILY WORD PLAY</span>
        </span>
        <button className="tileIcon" aria-label="설정" onClick={onOpenSettings}>
          ⚙
        </button>
      </header>
      <p className="tileEyebrow">
        {getTodayDateKey().replaceAll("-", ". ")} · 매일 새로운 낱말
      </p>
      <h1>
        생각을 맞추는
        <br />
        오늘의 한 판.
      </h1>
      <p className="tileLead">단서를 읽고, 글자 타일을 골라보세요.</p>
      <article className="tileDailyCard">
        <div className="tileDailyCardHeading">
          <strong>{finished ? "오늘도 한 판 완성!" : "오늘의 퍼즐"}</strong>
          <span>{preview?.entries.length ?? "…"} 단어</span>
        </div>
        <div className="tileHomePreview">
          {preview ? (
            <MiniPuzzlePreview puzzle={preview} isLoading={loading} />
          ) : (
            <span>
              {previewError
                ? "퍼즐을 불러오지 못했어요"
                : "오늘의 퍼즐을 준비하고 있어요"}
            </span>
          )}
        </div>
        <p>
          {preview == null
            ? "오늘의 퍼즐을 준비하고 있어요."
            : loadState === "fallback"
              ? "연결이 어려워 저장된 퍼즐을 보여드려요."
              : finished
                ? "완성한 단어를 다시 만나보세요."
                : started
                  ? "고른 글자는 그대로, 이어서 완성해요."
                  : "서두르지 않아도 괜찮아요. 한 단어씩 채워봐요."}
        </p>
        {previewError ? (
          <button
            className="tilePrimary"
            onClick={() => setRetry((value) => value + 1)}
          >
            다시 불러오기
          </button>
        ) : (
          <button
            className="tilePrimary"
            disabled={loading || !summary}
            onClick={() => summary && startDailyPuzzle(summary.puzzleId)}
          >
            {!summary
              ? "오늘 퍼즐 준비 중"
              : loading
                ? "불러오는 중"
                : finished
                  ? "완성한 판 보기"
                  : started
                    ? "이어서 풀기"
                    : "오늘 한 판 시작"}
            <span aria-hidden="true"> ›</span>
          </button>
        )}
      </article>
      <div className="tileHomeStreak">
        <b>✦ {consecutiveStreak}일의 낱말 습관</b>
        <div>
          {weeklyStrip.map((day) => (
            <span
              key={day.date}
              aria-label={`${day.date}${day.completed ? " 완료" : ""}`}
              className={day.completed ? "done" : ""}
            >
              {day.completed ? "✓" : day.isToday ? "오늘" : "·"}
            </span>
          ))}
        </div>
      </div>
      <nav className="tileHomeLinks">
        <button onClick={() => navigate("resume")}>⌁ 이어 풀기</button>
        <button
          onClick={() => {
            telemetry.click("history_open", { source: "home_card" });
            navigate("history");
          }}
        >
          ▤ 나의 기록
        </button>
        <button onClick={() => navigate("license")}>ⓘ 안내</button>
      </nav>
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

function formatPuzzleHistoryLabel(
  summary: PuzzleManifestItem,
  loadState: LoadState,
) {
  const aliasLabel = formatPuzzleAliasLabel(summary);

  return loadState === "remote"
    ? `${formatPuzzleCardSequenceLabel(summary)} · ${aliasLabel}`
    : aliasLabel;
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
  onOpenSettings: () => void;
  tileState: LetterTileState;
  onTileChange: (state: LetterTileState, action: TileInputAction) => void;
  tileGuide?: { completed: number; total: number; onSkip: () => void };
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
  clearAnswerCell: (entry: PuzzleEntry, cellKey?: string) => void;
  clearEntryAnswer: (entry: PuzzleEntry) => void;
  consecutiveStreak: number;
  clueEntries: PuzzleEntry[];
  completedEntries: PuzzleEntry[];
  completionCelebrationId: string | null;
  dismissCompletionCelebration: () => void;
  returnReminderPreprompt?: CompletionReturnReminderPreprompt;
  hasStarted: boolean;
  hintBalance: HintBalance;
  hintCount: number;
  isCompleted: boolean;
  stuckHintFocusRequestId: number;
  isNewBestTime: boolean;
  isPaused: boolean;
  hapticEnabled: boolean;
  mission: DailyMissionState;
  navigate: (route: AppRoute) => void;
  onboardingDifficultyRampEnabled: boolean;
  recommendationPuzzleSummaries: PuzzleManifestItem[];
  pencilMode: boolean;
  pause: { pausedMs: number; pausedAt: string | null };
  togglePause: () => void;
  puzzle: Puzzle;
  remainingAttempts: number;
  revealLetter: () => void;
  revealUsed: boolean;
  selectTextScale: (scale: TextScale) => void;
  soundEnabled: boolean;
  tentativeCellKeys: ReadonlySet<string>;
  textScale: TextScale;
  timerVisible: boolean;
  toggleAutocheck: () => void;
  toggleHaptic: () => void;
  togglePencilMode: () => void;
  toggleSound: () => void;
  toggleTimerVisible: () => void;
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
  tileState,
  onTileChange,
  tileGuide,
  puzzle,
  hasStarted,
  isPaused,
  hintBalance,
  navigate,
  startOrResumeMission,
  togglePause,
  useHint,
  onOpenSettings,
  timerVisible,
  textScale,
  mission,
  pause,
}: TodayScreenProps) {
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (!timerVisible || isPaused) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [timerVisible, isPaused]);
  const elapsed = computeElapsedMs({
    startedAt: mission.lastStartedAt,
    endedAt: mission.completedAt,
    pausedMs: pause.pausedMs,
    pausedAt: pause.pausedAt ?? undefined,
    now: clock,
  });
  return (
    <TilePuzzleScreen
      puzzle={puzzle}
      state={tileState}
      hints={hintBalance.remaining}
      hasStarted={hasStarted}
      isPaused={isPaused}
      onChange={onTileChange}
      onHint={useHint}
      onBack={() => navigate("home")}
      onStart={startOrResumeMission}
      onResume={togglePause}
      onPause={
        hasStarted && mission.completedAt == null ? togglePause : undefined
      }
      onSettings={onOpenSettings}
      guide={tileGuide}
      timer={
        timerVisible
          ? formatLiveTimer(Math.floor((elapsed ?? 0) / 1000))
          : undefined
      }
      textScale={getTextScaleFontMultiplier(textScale)}
    />
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

type ResultScreenProps = DateSelectionProps & {
  returnReminderPreprompt?: CompletionReturnReminderPreprompt;
  cellValues: Record<string, string>;
  completedEntries: PuzzleEntry[];
  consecutiveStreak: number;
  hintCount: number;
  isNewBestTime: boolean;
  leaderboardVisible: boolean;
  mission: DailyMissionState;
  navigate: (route: AppRoute) => void;
  onboardingDifficultyRampEnabled: boolean;
  recommendationPuzzleSummaries: PuzzleManifestItem[];
  onOpenLeaderboard: () => void;
  pause: { pausedMs: number; pausedAt: string | null };
  progressPercent: number;
  puzzle: Puzzle;
  remainingAttempts: number;
  restartMissionAttempt: () => void;
  revealUsed: boolean;
};

function ResultScreen({
  returnReminderPreprompt,
  puzzle,
  cellValues,
  completedEntries,
  hintCount,
  mission,
  pause,
  navigate,
  isNewBestTime,
  consecutiveStreak,
  revealUsed,
  leaderboardVisible,
  onOpenLeaderboard,
  remainingAttempts,
  restartMissionAttempt,
}: ResultScreenProps) {
  const complete = completedEntries.length === puzzle.entries.length;
  const elapsed = formatElapsedTime(
    mission.lastStartedAt,
    mission.completedAt,
    pause.pausedMs,
  );
  const { shareCopied, shareFailed, share } = useShareResult("result_screen");
  const achievements = getCompletionAchievements({
    hintCount,
    attemptsUsed: mission.attemptsUsed,
    revealUsed,
  });
  return (
    <section className="tileResult" aria-label="퍼즐 결과">
      <header className="tileHomeNav">
        <button
          className="tileIcon"
          aria-label="홈으로"
          onClick={() => navigate("home")}
        >
          ‹
        </button>
        <span>{puzzle.date.replaceAll("-", ". ")}</span>
        <span>✦ {consecutiveStreak}</span>
      </header>
      <div className="tileResultMedal" aria-hidden="true">
        {complete ? "✦" : "⌁"}
      </div>
      <p className="tileEyebrow">
        {complete ? "TODAY’S LITTLE WIN" : "YOUR WORD JOURNEY"}
      </p>
      <h1>{complete ? "한 판, 완성!" : "여기까지 잘했어요"}</h1>
      <p className="tileLead">
        {complete
          ? "차곡차곡 맞춘 단어가 한 판이 되었어요."
          : "고른 글자는 저장돼 있어요."}
      </p>
      <div
        className="tileResultBoard"
        style={{ "--tile-cols": puzzle.gridSize } as CSSProperties}
      >
        {puzzle.grid.flatMap((row, y) =>
          row.map((value, x) => (
            <span key={`${y}:${x}`} className={value ? "" : "block"}>
              {value ? cellValues[getCellKey(y, x)] : ""}
            </span>
          )),
        )}
      </div>
      <div className="tileResultStats">
        <span>
          <b>
            {completedEntries.length}/{puzzle.entries.length}
          </b>
          단어 완성
        </span>
        <span>
          <b>{elapsed ?? "—"}</b>풀이 시간
        </span>
        <span>
          <b>{hintCount}</b>사용한 힌트
        </span>
      </div>
      {complete && (isNewBestTime || achievements.noHint) ? (
        <p className="tileResultBadge">
          {isNewBestTime ? "✧ 나의 최고 기록! " : ""}
          {achievements.noHint ? "힌트 없이 완성" : ""}
        </p>
      ) : null}
      <button className="tilePrimary" onClick={() => navigate("home")}>
        홈으로 돌아가기
      </button>
      <div className="tileResultLinks">
        <button
          onClick={() => {
            telemetry.click("history_open", { source: "result_screen" });
            navigate("history");
          }}
        >
          나의 기록
        </button>
        <button
          onClick={() =>
            share(
              buildShareText({
                puzzleLabel: puzzle.date,
                elapsedLabel: elapsed,
                hintCount,
                attemptsUsed: mission.attemptsUsed,
                completedCount: completedEntries.length,
                totalCount: puzzle.entries.length,
                consecutiveStreak,
                isComplete: complete,
                revealUsed,
                shareGrid: buildShareGrid(puzzle, cellValues),
                shareLandingUrl,
              }),
              { puzzle_id: puzzle.puzzleId },
            )
          }
        >
          결과 공유
        </button>
        {leaderboardVisible && complete ? (
          <button onClick={onOpenLeaderboard}>순위 보기</button>
        ) : null}
      </div>
      {shareCopied ? (
        <p role="status">공유할 결과를 복사했어요.</p>
      ) : shareFailed ? (
        <p role="status">공유하지 못했어요. 다시 눌러주세요.</p>
      ) : null}
      {!complete && remainingAttempts > 0 ? (
        <button className="tileSecondary" onClick={restartMissionAttempt}>
          새로 도전하기
        </button>
      ) : null}
      <button
        className="tileSecondary"
        onClick={() => {
          returnReminderPreprompt?.onDecline();
          navigate("today");
        }}
      >
        {complete ? "완성한 단어 살펴보기" : "이어서 풀기"}
      </button>
      {returnReminderPreprompt ? (
        <div className="tileReminder">
          <p>{returnReminderPreprompt.body}</p>
          <div className="tileResultLinks">
            <button onClick={returnReminderPreprompt.onAccept}>
              {RETURN_REMINDER_PREPROMPT_COPY.accept}
            </button>
            <button onClick={returnReminderPreprompt.onDecline}>
              {RETURN_REMINDER_PREPROMPT_COPY.decline}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type ResumeScreenProps = {
  archiveRecords: PuzzleArchiveRecord[];
  dateCardStates: Record<string, DateCardState>;
  loadState: LoadState;
  navigate: (route: AppRoute) => void;
  selectPuzzle: (puzzleId: string) => Promise<boolean>;
};

// 오늘/과거에 시작했지만 끝내지 못한 퍼즐을 로컬 아카이브(기기 저장 사본)에서
// 모아 보여준다. 서버는 당일 퍼즐만 서빙하므로, 지난 미완료 퍼즐은 이 화면에서만
// 다시 이어 풀 수 있다(서버 재조회 없이 로컬 스냅샷 재생).
function ResumeScreen({
  archiveRecords,
  dateCardStates,
  loadState,
  navigate,
  selectPuzzle,
}: ResumeScreenProps) {
  const incompleteRecords = archiveRecords.filter((record) => {
    const state = dateCardStates[record.puzzleId];
    const isCompleted =
      record.completedAt != null || state?.completedAt != null;
    const hasStarted =
      record.startedAt != null ||
      (state?.attemptsUsed ?? 0) > 0 ||
      state?.hasProgress === true;
    return !isCompleted && hasStarted;
  });

  async function openRecord(record: PuzzleArchiveRecord) {
    const state = dateCardStates[record.puzzleId];
    const isExhausted =
      state?.attemptsUsed != null && state.attemptsUsed >= state.maxAttempts;
    if (await selectPuzzle(record.puzzleId))
      navigate(isExhausted ? "result" : "today");
  }

  return (
    <>
      <AppHeader
        eyebrow={`못 끝낸 퍼즐 ${incompleteRecords.length}개`}
        title="이어 풀기"
        onBack={() => navigate("home")}
      />

      <section className="historyList" aria-label="못 끝낸 퍼즐">
        {incompleteRecords.length > 0 ? (
          incompleteRecords.map((record) => {
            const state = dateCardStates[record.puzzleId];
            const isExhausted =
              state?.attemptsUsed != null &&
              state.attemptsUsed >= state.maxAttempts;

            return (
              <button
                key={record.puzzleId}
                data-testid={`resume-puzzle-${record.puzzleId}`}
                className="historyItem"
                type="button"
                onClick={() => openRecord(record)}
              >
                <span>
                  {formatPuzzleHistoryLabel(
                    createPuzzleSummary(record.puzzle),
                    loadState,
                  )}{" "}
                  · 기기 저장 사본
                </span>
                <strong>{isExhausted ? "도전 종료" : "진행 중"}</strong>
                <em>
                  {record.puzzle.entries.length}개 단어 ·{" "}
                  {isExhausted ? "결과 보기" : "이어 풀기"}
                </em>
              </button>
            );
          })
        ) : (
          <>
            <p className="historyEmptyNotice">
              못 끝낸 퍼즐이 없어요. 오늘의 퍼즐을 풀어보세요.
            </p>
            <button
              className="primaryButton"
              type="button"
              onClick={() => navigate("home")}
            >
              오늘의 퍼즐 보기
            </button>
          </>
        )}
      </section>
    </>
  );
}

type HistoryScreenProps = DateSelectionProps & {
  archiveRecords: PuzzleArchiveRecord[];
  completedEntries: PuzzleEntry[];
  consecutiveStreak: number;
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
  consecutiveStreak,
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

  // 기기에 남은 퍼즐 기록에서 사용자 단위 누적 통계를 집계한다. 노힌트 판정(힌트
  // 0 + 정답 보기 미사용)은 core의 getCompletionAchievements가 단일 규칙으로
  // 수행하므로, 여기서는 원시 신호(hintCount·revealUsed)만 모아 넘긴다. 노힌트 신호는
  // archive 기록에 동결된 값을 우선하고, 없으면(구버전 기록) 진행상태 카드로 폴백한다.
  const personalStats = useMemo(() => {
    const records: PersonalStatsRecord[] = archiveRecords.map((record) => {
      const state = dateCardStates[record.puzzleId];
      return {
        completed: record.completedAt != null || state?.completedAt != null,
        hintCount: record.hintCount ?? state?.hintCount ?? 0,
        revealUsed: record.revealUsed ?? state?.revealUsed === true,
      };
    });
    // 최고기록은 archive 집합과 무관하게 기기에 보유한 전체 best-time 키에서
    // 실제 값(ms)을 읽어 넘긴다. core가 유효 값만으로 개수·최소·평균을 집계한다.
    const bestTimeValuesMs = getAllBestTimePuzzleIds()
      .map((puzzleId) => getBestTimeMs(puzzleId))
      .filter((ms): ms is number => ms != null);
    return {
      stats: computePersonalStats(records, bestTimeValuesMs),
      // 같은 best-time 값으로 풀이 시간 분포도 집계해 요약 카드에 전달한다(#235).
      solveTimeDistribution: computeSolveTimeDistribution(bestTimeValuesMs),
    };
  }, [archiveRecords, dateCardStates]);

  // 최근 12주 완료 여부 캘린더 히트맵. 완료일 집합은 스트릭 숫자와 동일한 스캔
  // (getRecentCompletionDates)에서 얻는다. 기록 화면은 렌더가 잦지 않아 매 렌더
  // 계산해도 부담이 없고, 이렇게 하면 완료 직후에도 항상 최신 완료일을 반영한다.
  const streakWeeks = buildStreakCalendarWeeks(
    getRecentCompletionDates(90),
    getTodayDateKey(),
    12,
  );

  // 통산 최장 스트릭. 현재 스트릭과 같은 완료일 집합(최대 366일 룩백)에서 가장 긴
  // 연속 구간을 구한다. 현재 스트릭은 "어제까지 완료 시 오늘을 낙관적으로 가산"하는
  // 규칙이 있어 완료일 집합만으로 계산한 최장값보다 클 수 있으므로, 현재 스트릭과의
  // 최댓값을 취해 "최장 ≥ 현재" 불변식을 항상 만족시킨다.
  const longestStreak = Math.max(
    computeLongestStreakDays(getRecentCompletionDates(366)),
    consecutiveStreak,
  );

  // 기록(개인 통계) + 스트릭 캘린더 화면 노출을 각각 1회 계측한다(#292). HistoryScreen은
  // route가 history일 때만 마운트되므로, 마운트당 1회 발화가 곧 "화면 노출당 1회"
  // 가드가 된다(렌더 반복 재발화 없음). 값은 노출 시점(마운트)의 집계를 그대로 싣는다.
  useEffect(() => {
    emitProgressionScreenView(gameAnalytics, {
      totalPuzzles: personalStats.stats.totalPuzzles,
      completedCount: personalStats.stats.completedCount,
      currentStreak: consecutiveStreak,
      longestStreak,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openArchiveRecord(record: PuzzleArchiveRecord) {
    const state = dateCardStates[record.puzzleId];
    const isCompleted =
      record.completedAt != null || state?.completedAt != null;
    const isExhausted =
      !isCompleted &&
      state?.attemptsUsed != null &&
      state.attemptsUsed >= state.maxAttempts;

    if (await selectPuzzle(record.puzzleId))
      navigate(isCompleted || isExhausted ? "result" : "today");
  }

  return (
    <>
      <AppHeader
        eyebrow={`${selectedPuzzleLabel} · ${isCompleted ? "완료" : `${progressPercent}%`}`}
        title="기록"
        onBack={() => navigate("home")}
      />

      <PersonalStatsCard
        stats={personalStats.stats}
        solveTimeDistribution={personalStats.solveTimeDistribution}
        consecutiveStreak={consecutiveStreak}
        longestStreak={longestStreak}
      />

      <StreakHeatmap weeks={streakWeeks} />

      <section className="historyList" aria-label="미션 기록">
        {archiveRecords.length > 0 ? (
          archiveRecords.map((record) => {
            const state = dateCardStates[record.puzzleId];
            const isRecordCompleted =
              record.completedAt != null || state?.completedAt != null;
            const isRecordExhausted =
              !isRecordCompleted &&
              state?.attemptsUsed != null &&
              state.attemptsUsed >= state.maxAttempts;

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

      <section className="historyList" aria-label="지난 퍼즐">
        <h2>지난 퍼즐</h2>
        {sortPuzzleSummariesByRecency(puzzleSummaries)
          .filter(
            (summary) =>
              isPublishedPuzzle(summary) &&
              !archiveRecords.some(
                (record) => record.puzzleId === summary.puzzleId,
              ),
          )
          .map((summary) => {
            const state = dateCardStates[summary.puzzleId];
            const finished = state?.completedAt != null;
            const exhausted =
              (state?.attemptsUsed ?? 0) >=
              (state?.maxAttempts ?? DAILY_ATTEMPT_LIMIT);
            return (
              <button
                key={summary.puzzleId}
                className="historyItem"
                type="button"
                onClick={async () => {
                  if (await selectPuzzle(summary.puzzleId))
                    navigate(finished || exhausted ? "result" : "today");
                }}
              >
                <span>{formatPuzzleHistoryLabel(summary, loadState)}</span>
                <strong>
                  {finished
                    ? "완료"
                    : state?.hasProgress
                      ? "진행 중"
                      : "아직 풀지 않은 판"}
                </strong>
                <em>{summary.metrics?.wordCount ?? "—"}개 단어</em>
              </button>
            );
          })}
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
  // dev 시뮬레이터는 완료 축하·리워드 광고·일시정지·입력 가이드 UI를 렌더하지
  // 않으므로 관련 prop을 요구하지 않는다.
  | "onOpenSettings"
  | "tileState"
  | "onTileChange"
  | "completionCelebrationId"
  | "dismissCompletionCelebration"
  | "pause"
  | "isFirstInputGuideVisible"
  | "stuckHintFocusRequestId"
  | "isPaused"
  | "togglePause"
> & {
  clearProgress: () => Promise<void>;
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
  selectedCellKey,
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
                {entry.clueSource === "krdict-definition"
                  ? " · 사전 뜻풀이"
                  : ""}
              </span>
            </button>
          ))}
        </div>
      </section>

      <PuzzleBoard
        activeCellKey={selectedCellKey}
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
