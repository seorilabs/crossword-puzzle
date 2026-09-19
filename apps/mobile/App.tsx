import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  buildCellEntries,
  buildNextPuzzleCtaEvent,
  buildStartLabels,
  completeMission,
  computeLeaderboardScore,
  computeElapsedSeconds,
  consumeDailyHintCredit,
  createDailyMissionState,
  createDailyHintWallet,
  createEmptyProgress,
  createPuzzleSummary,
  DAILY_ATTEMPT_LIMIT,
  defaultLaunchConfig,
  getAnswerCommitLetters,
  getAnswerInputLetters,
  getBounds,
  getCellAnswerLetter,
  getCellKey,
  getCompletedEntries,
  getDailyFreePuzzleSummary,
  getDailyHintBalance,
  findPuzzleSummaryById,
  formatDateCardDay,
  formatDateCardWeekday,
  formatDifficultyLabel,
  formatPuzzleAliasLabel,
  formatPuzzleCardSequenceLabel,
  getCompletedPuzzleIds,
  getEntryAnswerValue,
  getEntryCellIndex,
  getEntryCellKeyAt,
  getEntryCells,
  getEntryStartCellKey,
  getFirstIncompleteEntry,
  getInitialEntryId,
  getInitialEntryStartCellKey,
  getNextAnswerSlotCellKey,
  getNextFocusEntryAfterCompletion,
  getNextRecommendedPuzzleSummary,
  buildDailyLadder,
  buildDailyLadderCtaParams,
  buildWeeklyStreakStrip,
  computeConsecutiveStreakDays,
  formatDailyLadderNextLabel,
  formatDailyLadderStepLabel,
  formatStreakStripHeadline,
  getStreakMilestoneProgress,
  HOME_QUICK_START_EVENT,
  type DailyLadderStep,
  getPendingAnswerCellValues,
  getProgressPercent,
  getStuckHintPromptText,
  isCellLocked,
  isHangulJamoInput,
  getNextStreakMilestoneHint,
  getPuzzlePackAlias,
  getRemainingAttempts,
  getStreakBadgeLabel,
  buildShareGrid,
  buildStreakCalendarWeeks,
  computeElapsedMs,
  computeLongestStreakDays,
  computePersonalStats,
  computeSolveTimeDistribution,
  emitProgressionScreenView,
  emitStreakMilestoneIfReached,
  formatMissionHistoryCardSummary,
  getCompletionAchievements,
  getProgressMilestoneRewardMessage,
  type PersonalStatsRecord,
  getTodayDateKey,
  grantDailyHintCredits,
  loadOrMigrateDailyHintWallet,
  normalizeOptionalPuzzleIdentifier,
  normalizePuzzleIdentifier,
  normalizePuzzleIdentifiers,
  normalizePuzzleManifestIdentifiers,
  pickHintCellIndex,
  runRewardedHintAdFlow,
  resolveStarterCell,
  trackRewardedHintAdRequest,
  trackRewardedHintAdResult,
  trackRewardedHintAdTrace,
  sortPuzzleSummariesByRecency,
  startMissionAttempt,
  shouldSubmitLeaderboardScore,
  shouldShowFirstInputGuide,
  togglePauseState,
  uniquePuzzleSummaries,
  validatePuzzleSlots,
  REWARDED_HINT_AD_REWARD_EVENT,
  RETURN_REMINDER_OPENED_EVENT,
  RETURN_REMINDER_PREPROMPT_COPY,
  formatReturnReminderPrepromptBody,
  type ReturnReminderState,
  STUCK_HINT_PROMPT_ACCEPT_EVENT,
  STUCK_HINT_PROMPT_DISMISS_EVENT,
  STUCK_HINT_PROMPT_EVENT,
  type Bounds,
  type DailyMissionState,
  type DailyHintWallet,
  type Direction,
  type GamePuzzleContext,
  type PauseSessionState,
  mapRewardedAdFailureToAssistResult,
  type Puzzle,
  type PuzzleEntry,
  type PuzzleManifest,
  type PuzzleManifestItem,
  type SavedProgress,
  type LaunchConfig,
  type NextPuzzleCtaSource,
  type RewardedAdRetryAttempt,
  HOW_TO_PLAY_SHOWN_EVENT,
  buildHowToPlayParams,
  getHowToPlayOutcomeEvent,
  type HowToPlayOutcome,
} from '../../packages/crossword-core/src';

import {
  listArchivedPuzzles,
  loadArchivedPuzzle,
  saveArchivedPuzzle,
  type PuzzleArchiveRecord,
  type PuzzleArchiveSaveOptions,
} from './puzzleArchive';
import { loadFirebaseLaunchConfig } from './firebaseClient';
import { createMobileDailyHintWalletRepository } from './dailyHintWalletRepository';
import {
  initializeMobileAds,
  getMobileRewardedAdRetryStatus,
  mapMobileAdTraceEvent,
  mapRewardedAdRetryError,
  openMobileAdsInspector,
  showMobileAdsPrivacyOptions,
  showRewardedAd,
  type MobileAdUnitMode,
  type MobileAdEvent,
  type RewardedAdPlacement,
} from './mobileAds';
import { telemetry } from './telemetry';
import { gameAnalytics } from './gameAnalytics';
import {
  getAllBestTimeValuesMs,
  getOverallBestTimeMs,
  mobileBestTimeRepository,
  type BestTimes,
} from './bestTimeRepository';
import { mobileCompletionDatesRepository } from './completionDatesRepository';
import {
  PersonalStatsCard,
  ShareGridPreview,
  StreakHeatmap,
} from './recordsComponents';
import { buildMobileShareText, shareResultText } from './shareResult';
import {
  createMobileGameplayAttemptTracker,
  type MobilePuzzleAbandonSnapshot,
} from './gameplayTelemetry';
import { leaderboardAdapter } from './leaderboardAdapter';
import { useLeaderboard } from './useLeaderboard';
import { useStuckHintPrompt } from './useStuckHintPrompt';
import {
  loadFirstInputGuideSeen,
  markFirstInputGuideSeen,
} from './firstInputGuideRepository';
import {
  cancelStaleMobileReturnReminder,
  confirmMobileReturnReminder,
  declineMobileReturnReminder,
  prepareMobileReturnReminderPreprompt,
  refreshMobileReturnReminderSchedule,
} from './mobileReturnReminder';
import {
  consumeInitialReturnReminderOpen,
  consumePendingReturnReminderOpen,
  subscribeToReturnReminderOpened,
  type ReturnReminderOpen,
} from './returnReminderNotifications';
import manifestData from '../../public/puzzles/manifest.json';
import puzzle20260525 from '../../public/puzzles/2026-05-25-normal-01.json';
import puzzle20260526 from '../../public/puzzles/2026-05-26-normal-02.json';
import puzzle20260527 from '../../public/puzzles/2026-05-27-normal-03.json';
import puzzle20260528 from '../../public/puzzles/2026-05-28-normal-04.json';
import puzzle20260529 from '../../public/puzzles/2026-05-29-normal-05.json';
import puzzle20260530 from '../../public/puzzles/2026-05-30-normal-06.json';
import puzzle20260531 from '../../public/puzzles/2026-05-31-normal-07.json';

export type AppRoute =
  | 'home'
  | 'today'
  | 'result'
  | 'history'
  | 'resume'
  | 'license';

const APP_ROUTE_GRAPH: Record<AppRoute, { backTarget: AppRoute | null }> = {
  history: { backTarget: 'home' },
  home: { backTarget: null },
  license: { backTarget: 'history' },
  result: { backTarget: 'home' },
  resume: { backTarget: 'home' },
  today: { backTarget: 'home' },
};

export function getBackTargetRoute(route: AppRoute) {
  return APP_ROUTE_GRAPH[route].backTarget;
}

export function shouldUseSystemBack(route: AppRoute) {
  return getBackTargetRoute(route) == null;
}

type DateCardState = {
  attemptsUsed: number;
  completedAt?: string;
  hasProgress: boolean;
  hintCount: number;
};

// 모바일 미션 상태. 공유 코어 DailyMissionState에 일시정지 누적(pausedMs)과 진행
// 중 정지 시작 시각(pausedAt)을 더한다. 웹은 이 정지 상태를 별도 useState로 두지만
// 모바일은 AppState 전환마다 저장해야 해 미션과 함께 영속화한다.
export type MissionState = DailyMissionState & PauseSessionState;

type PuzzleSession = {
  nextPuzzle: Puzzle;
  savedMission: MissionState;
  savedProgress: SavedProgress;
};

type PuzzlePackSource = 'remote' | 'bundled';

type PuzzlePack = {
  assetBaseUrl?: string;
  generatedAt?: string;
  source: PuzzlePackSource;
  summaries: PuzzleManifestItem[];
};

type PuzzleViewModel = {
  bounds: ReturnType<typeof getBounds>;
  cellEntries: Map<string, PuzzleEntry[]>;
  clueEntries: PuzzleEntry[];
  cols: number[];
  completedEntries: PuzzleEntry[];
  isComplete: boolean;
  rows: number[];
  selectedCells: Set<string>;
  selectedEntry?: PuzzleEntry;
  startLabels: Map<string, number>;
  slotValidationPass: boolean;
};

type AdDiagnosticState = {
  isRunning: boolean;
  message: string;
};

const REMOTE_PUZZLE_PACK_BASE_URL = 'https://crossword-puzzle-79ae0.web.app';
const HOME_HEADER_TITLE = '가로세로 낱말 퍼즐';
const PROGRESS_KEY_PREFIX = 'crossword-puzzle:progress';
const MISSION_KEY_PREFIX = 'crossword-puzzle:mission';

// Answer entry mode, mirrored from the web app for market parity.
// "box": one TextInput for the whole word (IME-safe, default).
// "cell": hidden per-cell TextInput overlaid on the active cell.
type AnswerInputMode = 'box' | 'cell';
const ANSWER_INPUT_MODE_KEY = 'crossword:answer-input-mode';
export const BOARD_TEXT_INPUT_REFOCUS_DELAY_MS = 32;
export const ANDROID_TEXT_INPUT_REFOCUS_DELAY_MS =
  BOARD_TEXT_INPUT_REFOCUS_DELAY_MS;
const BOARD_BORDER_WIDTH = 2;
const PLAY_SCREEN_CONTENT_PADDING = 16;
const BOARD_FOCUS_ROWS_ABOVE = 2;

type BoardNativeInput = Pick<
  React.ElementRef<typeof TextInput>,
  'blur' | 'focus' | 'isFocused'
>;

type ScheduleBoardNativeInputFocusOptions = {
  getInput: () => BoardNativeInput | null;
  keyboardVisible: boolean;
  onFocusTimerSettled: () => void;
  platformOS: typeof Platform.OS;
};

export function scheduleBoardNativeInputFocus({
  getInput,
  keyboardVisible,
  onFocusTimerSettled,
}: ScheduleBoardNativeInputFocusOptions): ReturnType<typeof setTimeout> {
  const input = getInput();
  const needsNativeRefocus = !keyboardVisible && input?.isFocused();

  if (needsNativeRefocus) {
    input?.blur();
  }

  // Native TextInput can stay focused after the IME is hidden; wait briefly
  // after blur so the next focus request attaches a fresh input connection.
  return setTimeout(
    () => {
      onFocusTimerSettled();
      getInput()?.focus();
    },
    needsNativeRefocus ? BOARD_TEXT_INPUT_REFOCUS_DELAY_MS : 0,
  );
}

const directionLabels: Record<Direction, string> = {
  across: '가로',
  down: '세로',
};

const bundledPuzzles = [
  puzzle20260525,
  puzzle20260526,
  puzzle20260527,
  puzzle20260528,
  puzzle20260529,
  puzzle20260530,
  puzzle20260531,
] as Puzzle[];
const bundledPuzzlesById = new Map(
  bundledPuzzles.map(puzzle => [puzzle.puzzleId, puzzle]),
);
const bundledManifest = manifestData as PuzzleManifest;
const bundledPuzzleSummaries = sortPuzzleSummaries(
  bundledManifest.puzzles,
).filter(summary => bundledPuzzlesById.has(summary.puzzleId));
const fallbackPuzzle = bundledPuzzles[0] as Puzzle;
const bundledPuzzlePack: PuzzlePack = {
  generatedAt: bundledManifest.generatedAt,
  source: 'bundled',
  summaries: bundledPuzzleSummaries,
};
const initialPuzzle =
  bundledPuzzlesById.get(getInitialPuzzleId(bundledPuzzleSummaries)) ??
  fallbackPuzzle;
const dailyHintWalletRepository = createMobileDailyHintWalletRepository();

function sortPuzzleSummaries(puzzles: PuzzleManifestItem[]) {
  return dedupePuzzleSummaries(sortPuzzleSummariesByRecency(puzzles));
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

function getInitialPuzzleId(puzzles: PuzzleManifestItem[]) {
  const today = getTodayDateKey();
  return (
    getDailyFreePuzzleSummary(puzzles, today)?.puzzleId ??
    puzzles[0]?.puzzleId ??
    fallbackPuzzle.puzzleId
  );
}

function getPuzzleTelemetryParams(
  puzzle: Puzzle,
  summary?: PuzzleManifestItem,
) {
  const aliasSource = summary ?? puzzle;

  return {
    difficulty: summary?.difficulty ?? puzzle.difficulty,
    grid_size: puzzle.gridSize,
    pack_id: normalizeOptionalPuzzleIdentifier(
      summary?.packId ?? puzzle.packId,
    ),
    published_at: summary?.publishedAt ?? puzzle.publishedAt,
    puzzle_alias: normalizePuzzleIdentifier(getPuzzlePackAlias(aliasSource)),
    puzzle_id: normalizePuzzleIdentifier(puzzle.puzzleId),
    slot_id: normalizeOptionalPuzzleIdentifier(
      summary?.slotId ?? puzzle.slotId,
    ),
    word_count: summary?.metrics?.wordCount ?? puzzle.metrics.wordCount,
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

// 게임 세부 지표·리더보드용 경과 초. 백그라운드 자동 일시정지 구간(pause)을
// 제외한 순수 풀이 시간을 계산은 공유 코어(computeElapsedSeconds)에 위임한다
// (초 단위 통일, 웹과 동일 규칙).
export function getElapsedSeconds(
  startedAt: string | undefined,
  endedAt: string | undefined,
  pause?: Partial<PauseSessionState>,
) {
  return (
    computeElapsedSeconds({
      startedAt,
      endedAt,
      pausedMs: pause?.pausedMs,
      pausedAt: pause?.pausedAt ?? undefined,
    }) ?? 0
  );
}

export function formatPuzzleHomeSubtitle(
  summary: PuzzleManifestItem,
  source: PuzzlePackSource,
) {
  if (source !== 'remote') {
    return summary.date;
  }

  const weekday = formatDateCardWeekday(summary.date, 'long');
  const dayLabel = formatDateCardDay(summary.date);

  return weekday === '' ? dayLabel : `${dayLabel} ${weekday}`;
}

export function formatPuzzleCardTitle(
  summary: PuzzleManifestItem,
  source: PuzzlePackSource,
) {
  if (source !== 'remote') {
    return summary.date;
  }

  const weekday = formatDateCardWeekday(summary.date, 'short');
  const dayLabel = formatDateCardDay(summary.date);

  return weekday === '' ? dayLabel : `${dayLabel} ${weekday}`;
}

// Chooses which cell `clearAnswerCell` should erase: the caret cell if it holds
// an editable letter, otherwise the nearest earlier editable cell, skipping
// locked (correct) letters so the caret is never trapped on one. Returns -1 when
// there is nothing editable to delete before the caret.
export function getClearAnswerTargetIndex(
  puzzle: Puzzle,
  entry: PuzzleEntry,
  cellValues: Record<string, string>,
  selectedIndex: number,
): number {
  const cells = getEntryCells(entry);
  const isDeletable = (index: number) => {
    const cell = cells[index];
    if (cell == null) {
      return false;
    }
    const key = getCellKey(cell.row, cell.col);
    return cellValues[key] != null && !isCellLocked(puzzle, cellValues, key);
  };

  if (isDeletable(selectedIndex)) {
    return selectedIndex;
  }

  for (let index = selectedIndex - 1; index >= 0; index -= 1) {
    if (isDeletable(index)) {
      return index;
    }
  }

  return -1;
}

function formatEntryReference(
  entry: PuzzleEntry,
  startLabels: Map<string, number>,
) {
  const startLabel = startLabels.get(getCellKey(entry.row, entry.col));
  const prefix = startLabel == null ? '' : `${startLabel}번 `;

  return `${prefix}${directionLabels[entry.direction]} · ${entry.answer.length}글자`;
}

export function formatElapsedTime(
  startedAt: string | undefined,
  completedAt: string | undefined,
  pausedMs = 0,
): string | null {
  if (startedAt == null) return null;
  const startMs = new Date(startedAt).getTime();
  const endMs =
    completedAt == null ? Date.now() : new Date(completedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  const totalSeconds = Math.max(
    0,
    Math.floor((endMs - startMs - pausedMs) / 1000),
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}


export function formatPuzzleHistoryTitle(
  summary: PuzzleManifestItem,
  source: PuzzlePackSource,
) {
  const aliasLabel = formatPuzzleAliasLabel(summary);

  return source === 'remote'
    ? `${formatPuzzleCardSequenceLabel(summary)} · ${aliasLabel}`
    : aliasLabel;
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
      Object.keys(progress.cellValues).length > 0 ||
      progress.hintCount > 0,
    hintCount: progress.hintCount,
  };
}

function getProgressKey(puzzleId: string) {
  return `${PROGRESS_KEY_PREFIX}:${puzzleId}`;
}

function getMissionKey(date: string, puzzleId: string) {
  return `${MISSION_KEY_PREFIX}:${date}:${puzzleId}`;
}

function normalizeProgress(
  value: Partial<SavedProgress> | null,
): SavedProgress {
  if (value == null) {
    return createEmptyProgress();
  }

  const cellValues =
    value.cellValues != null && typeof value.cellValues === 'object'
      ? Object.fromEntries(
          Object.entries(value.cellValues).filter(
            ([, letter]) => typeof letter === 'string',
          ),
        )
      : {};

  return {
    cellValues,
    earnedHintCredits:
      typeof value.earnedHintCredits === 'number'
        ? Math.max(0, value.earnedHintCredits)
        : 0,
    hintCount:
      typeof value.hintCount === 'number' ? Math.max(0, value.hintCount) : 0,
  };
}

async function loadStoredProgress(puzzleId: string) {
  try {
    const raw = await AsyncStorage.getItem(getProgressKey(puzzleId));
    return normalizeProgress(
      raw == null ? null : (JSON.parse(raw) as Partial<SavedProgress>),
    );
  } catch {
    return createEmptyProgress();
  }
}

async function saveStoredProgress(puzzleId: string, progress: SavedProgress) {
  try {
    await AsyncStorage.setItem(
      getProgressKey(puzzleId),
      JSON.stringify(progress),
    );
  } catch {
    // Local persistence is best effort.
  }
}

async function clearStoredProgress(puzzleId: string) {
  try {
    await AsyncStorage.removeItem(getProgressKey(puzzleId));
  } catch {
    // Local persistence is best effort.
  }
}

async function loadDailyHintWalletForDate(
  date: string,
  summaries: PuzzleManifestItem[],
) {
  const dateSummaries = uniquePuzzleSummaries(summaries).filter(
    summary => summary.date === date,
  );
  return loadOrMigrateDailyHintWallet({
    date,
    loadLegacyProgresses: () =>
      Promise.all(
        dateSummaries.map(summary => loadStoredProgress(summary.puzzleId)),
      ),
    repository: dailyHintWalletRepository,
  });
}

function createMissionState(
  date: string,
  puzzleId: string,
  maxAttempts: number,
): MissionState {
  return {
    ...createDailyMissionState(date, puzzleId, maxAttempts),
    pausedMs: 0,
    pausedAt: null,
  };
}

// 저장된 미션을 복원한다. pausedAt이 정지 중 상태로 저장돼 있으면(예: 배경 상태에서
// 앱이 강제 종료됨) 지금(복원 시각)까지를 정지 구간으로 접어 pausedMs에 누적하고
// pausedAt은 null로 되돌린다 — 복원 자체가 곧 재개이기 때문이다.
export function normalizeMission(
  value: Partial<MissionState> | null,
  date: string,
  puzzleId: string,
): MissionState {
  if (value == null || value.date !== date || value.puzzleId !== puzzleId) {
    return createMissionState(date, puzzleId, DAILY_ATTEMPT_LIMIT);
  }

  const storedPause: PauseSessionState = {
    pausedMs:
      typeof value.pausedMs === 'number' && Number.isFinite(value.pausedMs)
        ? Math.max(0, value.pausedMs)
        : 0,
    pausedAt: typeof value.pausedAt === 'string' ? value.pausedAt : null,
  };
  const pause =
    storedPause.pausedAt == null
      ? storedPause
      : togglePauseState(storedPause, new Date());

  return {
    date,
    puzzleId,
    attemptsUsed:
      typeof value.attemptsUsed === 'number'
        ? Math.min(Math.max(0, value.attemptsUsed), DAILY_ATTEMPT_LIMIT)
        : 0,
    maxAttempts: DAILY_ATTEMPT_LIMIT,
    completedAt:
      typeof value.completedAt === 'string' ? value.completedAt : undefined,
    lastStartedAt:
      typeof value.lastStartedAt === 'string' ? value.lastStartedAt : undefined,
    ...pause,
  };
}

async function loadStoredMission(date: string, puzzleId: string) {
  try {
    const raw = await AsyncStorage.getItem(getMissionKey(date, puzzleId));
    return normalizeMission(
      raw == null ? null : (JSON.parse(raw) as Partial<MissionState>),
      date,
      puzzleId,
    );
  } catch {
    return createMissionState(date, puzzleId, DAILY_ATTEMPT_LIMIT);
  }
}

// AppState 전환에 따른 미션 일시정지 상태 갱신(순수 함수). background 전환에서는
// canAutoPause(오늘 화면에서 시작·미완료 진행 중)일 때만 정지를 시작하고, active
// 복귀에서는 정지 중이었으면 재개한다. 변경이 없으면 null을 반환해 호출부가
// setMission/saveStoredMission을 건너뛸 수 있게 한다.
export function applyAppStateTransition(
  state: AppStateStatus,
  mission: MissionState,
  canAutoPause: boolean,
  now: Date,
): MissionState | null {
  if (state === 'active') {
    if (mission.pausedAt == null) {
      return null;
    }
    return { ...mission, ...togglePauseState(mission, now) };
  }

  if (state === 'background') {
    if (!canAutoPause || mission.pausedAt != null) {
      return null;
    }
    return { ...mission, ...togglePauseState(mission, now) };
  }

  return null;
}

async function saveStoredMission(mission: MissionState) {
  try {
    await AsyncStorage.setItem(
      getMissionKey(mission.date, mission.puzzleId),
      JSON.stringify(mission),
    );
  } catch {
    // Local persistence is best effort.
  }
}

function resolveRemotePuzzleUrl(pack: PuzzlePack, puzzlePath: string) {
  if (puzzlePath.startsWith('http://') || puzzlePath.startsWith('https://')) {
    return puzzlePath;
  }

  if (pack.assetBaseUrl == null) {
    return puzzlePath;
  }

  return `${pack.assetBaseUrl.replace(/\/+$/, '')}/${puzzlePath.replace(
    /^\/+/,
    '',
  )}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function loadRemotePuzzlePack(): Promise<PuzzlePack> {
  const assetBaseUrl = REMOTE_PUZZLE_PACK_BASE_URL;
  const manifest = normalizePuzzleManifestIdentifiers(
    await fetchJson<PuzzleManifest>(
      `${assetBaseUrl.replace(/\/+$/, '')}/puzzles/manifest.json`,
    ),
  );

  return {
    assetBaseUrl,
    generatedAt: manifest.generatedAt,
    source: 'remote',
    summaries: sortPuzzleSummaries(manifest.puzzles),
  };
}

async function loadPuzzleFromPack(puzzleId: string, pack: PuzzlePack) {
  const bundledPuzzle = bundledPuzzlesById.get(puzzleId);

  if (pack.source === 'bundled') {
    return bundledPuzzle ?? null;
  }

  const summary = pack.summaries.find(item => item.puzzleId === puzzleId);

  if (summary == null) {
    return bundledPuzzle ?? null;
  }

  try {
    return normalizePuzzleIdentifiers(
      await fetchJson<Puzzle>(resolveRemotePuzzleUrl(pack, summary.path)),
    );
  } catch {
    return bundledPuzzle ?? null;
  }
}

export async function loadPuzzleSession(
  puzzleId: string,
  pack: PuzzlePack,
): Promise<PuzzleSession | null> {
  const nextPuzzle =
    (await loadPuzzleFromPack(puzzleId, pack)) ??
    (await loadArchivedPuzzle(puzzleId))?.puzzle;

  if (nextPuzzle == null) {
    return null;
  }

  const [savedProgress, savedMission] = await Promise.all([
    loadStoredProgress(nextPuzzle.puzzleId),
    loadStoredMission(nextPuzzle.date, nextPuzzle.puzzleId),
  ]);

  return {
    nextPuzzle,
    savedMission,
    savedProgress,
  };
}

async function loadDateCardStates(summaries: PuzzleManifestItem[]) {
  const uniqueSummaries = uniquePuzzleSummaries(summaries);
  const entries = await Promise.all(
    uniqueSummaries.map(async summary => {
      const [savedProgress, savedMission] = await Promise.all([
        loadStoredProgress(summary.puzzleId),
        loadStoredMission(summary.date, summary.puzzleId),
      ]);

      return [
        summary.puzzleId,
        createDateCardState(savedMission, savedProgress),
      ] as const;
    }),
  );

  return Object.fromEntries(entries);
}

function parseCellKey(cellKey: string) {
  const [rowText, colText] = cellKey.split(':');
  const row = Number(rowText);
  const col = Number(colText);

  return Number.isFinite(row) && Number.isFinite(col) ? { col, row } : null;
}

export function getBoardNativeInputPosition(
  cellKey: string,
  bounds: Bounds,
  cellSize: number,
) {
  const cell = parseCellKey(cellKey);

  if (cell == null) {
    return { left: BOARD_BORDER_WIDTH, top: BOARD_BORDER_WIDTH };
  }

  return {
    left: Math.max(0, cell.col - bounds.minCol) * cellSize + BOARD_BORDER_WIDTH,
    top: Math.max(0, cell.row - bounds.minRow) * cellSize + BOARD_BORDER_WIDTH,
  };
}

export function getBoardCellFocusScrollY(cellTop: number, cellSize: number) {
  return Math.max(
    0,
    PLAY_SCREEN_CONTENT_PADDING + cellTop - cellSize * BOARD_FOCUS_ROWS_ABOVE,
  );
}

function hasHangulSyllableInput(value: string) {
  return /[가-힣]/.test(value);
}

function getAnswerCommitDelayMs(value: string) {
  return hasHangulSyllableInput(value) ? 800 : 100;
}

function formatMobileAdEvent(event: MobileAdEvent) {
  const parts: string[] = [event.type];

  if (event.adUnitMode != null) {
    parts.push(event.adUnitMode);
  }

  if (event.errorCode != null) {
    parts.push(event.errorCode);
  }

  return parts.join(':');
}

function formatMobileAdEventSequence(events: MobileAdEvent[]) {
  return events.map(formatMobileAdEvent).join(' -> ');
}

function getMobileAdFailureCode(events: MobileAdEvent[]) {
  const eventWithCode = events.find(event => event.errorCode != null);

  if (eventWithCode?.errorCode != null) {
    return eventWithCode.errorCode;
  }

  return events.at(-1)?.type;
}

function getEntryCellKeys(entry: PuzzleEntry) {
  return getEntryCells(entry).map(cell => getCellKey(cell.row, cell.col));
}

function AppContent() {
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const [route, setRoute] = useState<AppRoute>('home');
  const [isLoading, setIsLoading] = useState(true);
  const [puzzle, setPuzzle] = useState(initialPuzzle);
  const [dateCardStates, setDateCardStates] = useState<
    Record<string, DateCardState>
  >({});
  const [puzzlePack, setPuzzlePack] = useState<PuzzlePack>(bundledPuzzlePack);
  const [puzzleArchiveRecords, setPuzzleArchiveRecords] = useState<
    PuzzleArchiveRecord[]
  >([]);
  const [cellValues, setCellValues] = useState<Record<string, string>>({});
  const [dailyHintWallet, setDailyHintWallet] = useState<DailyHintWallet>(() =>
    createDailyHintWallet(getTodayDateKey()),
  );
  const [hintCount, setHintCount] = useState(0);
  const [mission, setMission] = useState<MissionState>(() =>
    createMissionState(
      initialPuzzle.date,
      initialPuzzle.puzzleId,
      DAILY_ATTEMPT_LIMIT,
    ),
  );
  const [selectedDirection, setSelectedDirection] =
    useState<Direction>('across');
  const [selectedEntryId, setSelectedEntryId] = useState(
    getInitialEntryId(initialPuzzle),
  );
  const [selectedCellKey, setSelectedCellKey] = useState(
    getInitialEntryStartCellKey(initialPuzzle),
  );
  const [notice, setNotice] = useState(
    '날짜를 고르고 오늘의 낱말 퍼즐을 시작하세요.',
  );
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
  // 완료 모달 안 복귀 알림 사전 안내 상태. null 이면 카드를 그리지 않는다. 카드에
  // 답하지 않고 모달이 닫히면(홈·결과·다음 퍼즐 이동) 보류로 정리한다(아래 effect).
  // 기록 패리티 상태(웹과 동일 계약). 최고 기록은 퍼즐별 ms, 완료일은 무한 누적 목록.
  const [bestTimes, setBestTimes] = useState<BestTimes>({});
  const [completionDates, setCompletionDates] = useState<string[]>([]);
  const completionDatesRef = useRef<string[]>([]);
  const [isNewBestTime, setIsNewBestTime] = useState(false);
  // 진행 마일스톤(25/50/75%) 보상 토스트. 2.5초 뒤 자동으로 사라진다.
  const [progressToast, setProgressToast] = useState<{
    id: number;
    message: string;
  }>({ id: 0, message: '' });
  const [returnReminderPreprompt, setReturnReminderPreprompt] = useState<{
    prompted: ReturnReminderState;
    streakDays: number;
  } | null>(null);
  const [completionCelebrationPuzzleId, setCompletionCelebrationPuzzleId] =
    useState<string | null>(null);
  const [rewardedAdPlacement, setRewardedAdPlacement] =
    useState<RewardedAdPlacement | null>(null);
  const [, setAdDiagnosticsTapCount] = useState(0);
  const [isAdDiagnosticsOpen, setIsAdDiagnosticsOpen] = useState(false);
  const [adDiagnosticState, setAdDiagnosticState] = useState<AdDiagnosticState>(
    {
      isRunning: false,
      message: '대기 중',
    },
  );
  const submittedLeaderboardPuzzleIdsRef = useRef(new Set<string>());
  const returnReminderPromptedPuzzleIdsRef = useRef(new Set<string>());
  const returnReminderPrepromptRef = useRef<{
    prompted: ReturnReminderState;
    streakDays: number;
  } | null>(null);
  returnReminderPrepromptRef.current = returnReminderPreprompt;
  const completionCelebrationPuzzleIdRef = useRef<string | null>(null);
  completionCelebrationPuzzleIdRef.current = completionCelebrationPuzzleId;
  const playScreenScrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const boardInputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const answerCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const boardFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardVisibleRef = useRef(false);
  const [answerInputValue, setAnswerInputValue] = useState('');
  // Box (single word input) vs cell (per-cell hidden input) answer entry, kept
  // at parity with the web app. Default to box; persisted in AsyncStorage.
  const boxInputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const [answerInputMode, setAnswerInputMode] =
    useState<AnswerInputMode>('box');
  const [answerBoxResetKey, setAnswerBoxResetKey] = useState(0);
  const [isClueListOpen, setIsClueListOpen] = useState(false);
  const [hasSeenHowToPlay, setHasSeenHowToPlay] = useState(true);
  const howToPlayDismissedRef = useRef(false);
  // 플레이 방법 안내: 노출 1회 보장과 체류 시간 측정용.
  const howToPlayShownRef = useRef(false);
  const howToPlayShownAtRef = useRef<number | null>(null);
  const [hasSeenFirstInputGuide, setHasSeenFirstInputGuide] = useState(true);
  const firstInputGuideHydratedRef = useRef(false);
  const firstInputGuideDismissedRef = useRef(false);
  const firstInputGuideShownRef = useRef(false);
  // RN 퍼즐 진행·이탈 계측은 시도별 중복 방지와 resume baseline을 한 tracker에서
  // 관리한다. 실제 lifecycle/화면 전환은 App에서 전달하고 이벤트 계약은 Web과 맞춘다.
  const gameplayAttemptTrackerRef = useRef(
    createMobileGameplayAttemptTracker(),
  );
  const previousRouteRef = useRef<AppRoute>('home');
  const abandonSnapshotRef = useRef<MobilePuzzleAbandonSnapshot>({
    attemptsUsed: 0,
    elapsedSeconds: 0,
    gameContext: getGamePuzzleContext(initialPuzzle),
    hadFirstInput: false,
    hasStarted: false,
    hintCount: 0,
    isCompleted: false,
    progressPercent: 0,
    puzzleId: initialPuzzle.puzzleId,
    remainingAttempts: DAILY_ATTEMPT_LIMIT,
    route: 'home',
    telemetryParams: getPuzzleTelemetryParams(initialPuzzle),
    totalWords: initialPuzzle.entries.length,
    wordsFilled: 0,
  });
  // AppState 리스너가 stale closure 없이 최신 미션(일시정지 상태 포함)을 읽도록
  // 매 렌더 갱신하는 스냅샷.
  const missionRef = useRef(mission);
  missionRef.current = mission;

  const persistDailyHintWallet = useCallback((wallet: DailyHintWallet) => {
    setDailyHintWallet(wallet);
    dailyHintWalletRepository.saveWallet(wallet).catch(() => {});
  }, []);

  const navigateTo = useCallback((nextRoute: AppRoute) => {
    setRoute(nextRoute);
  }, []);

  const handleReturnReminderOpen = useCallback(
    ({ reminderDate }: ReturnReminderOpen) => {
      telemetry.impression(RETURN_REMINDER_OPENED_EVENT, {
        channel: 'local',
        notification_kind: 'daily_puzzle',
        reminder_date: reminderDate,
      });
      navigateTo('today');
    },
    [navigateTo],
  );

  useEffect(() => {
    const unsubscribe = subscribeToReturnReminderOpened(
      handleReturnReminderOpen,
    );
    consumeInitialReturnReminderOpen()
      .then(open => {
        if (open != null) {
          handleReturnReminderOpen(open);
        }
      })
      .catch(() => {});
    return unsubscribe;
  }, [handleReturnReminderOpen]);

  const goBackWithinSceneGraph = useCallback(() => {
    if (keyboardVisibleRef.current) {
      Keyboard.dismiss();
      keyboardVisibleRef.current = false;
      return true;
    }

    if (isClueListOpen) {
      setIsClueListOpen(false);
      return true;
    }

    if (completionCelebrationPuzzleId != null) {
      setCompletionCelebrationPuzzleId(null);
      return true;
    }

    const backTarget = getBackTargetRoute(route);

    if (backTarget == null) {
      return false;
    }

    navigateTo(backTarget);
    return true;
  }, [completionCelebrationPuzzleId, isClueListOpen, navigateTo, route]);

  const viewModel = usePuzzleViewModel(
    puzzle,
    selectedEntryId,
    selectedDirection,
    cellValues,
  );
  const selectedEntry = viewModel.selectedEntry;
  const selectedEntryCells = useMemo(
    () => (selectedEntry == null ? [] : getEntryCells(selectedEntry)),
    [selectedEntry],
  );
  const selectedEntryCellKeys = useMemo(
    () => selectedEntryCells.map(cell => getCellKey(cell.row, cell.col)),
    [selectedEntryCells],
  );
  const selectedEntryIndex = Math.max(
    0,
    selectedEntryCellKeys.indexOf(selectedCellKey),
  );
  const activeAnswerCellKey =
    selectedEntryCellKeys[selectedEntryIndex] ??
    getEntryStartCellKey(selectedEntry);
  const pendingAnswerCellValues = useMemo(
    () =>
      selectedEntry == null
        ? {}
        : getPendingAnswerCellValues(
            selectedEntry,
            answerInputValue,
            selectedCellKey,
          ),
    [answerInputValue, selectedCellKey, selectedEntry],
  );
  const completedCellKeys = useMemo(
    () =>
      new Set(
        viewModel.completedEntries.flatMap(entry => getEntryCellKeys(entry)),
      ),
    [viewModel.completedEntries],
  );
  // Per-character state for the sticky clue bar so the question and the answer
  // being typed stay visible above the on-screen keyboard.
  const answerSlots = useMemo(() => {
    if (selectedEntry == null) {
      return [];
    }

    return selectedEntryCellKeys.map(key => {
      const pending = pendingAnswerCellValues[key];
      const committed = cellValues[key];
      const answerLetter = getCellAnswerLetter(puzzle, key);

      return {
        isActive: key === activeAnswerCellKey,
        isLocked: isCellLocked(puzzle, cellValues, key),
        isPending: pending != null,
        isWrong:
          pending == null && committed != null && committed !== answerLetter,
        key,
        value: pending ?? committed ?? '',
      };
    });
  }, [
    activeAnswerCellKey,
    cellValues,
    pendingAnswerCellValues,
    puzzle,
    selectedEntry,
    selectedEntryCellKeys,
  ]);
  const isSelectedComplete =
    selectedEntry != null &&
    viewModel.completedEntries.some(entry => entry.id === selectedEntry.id);
  const orderedEntries = useMemo(
    () =>
      [...puzzle.entries].sort((left, right) => {
        const labelLeft =
          viewModel.startLabels.get(getCellKey(left.row, left.col)) ?? 0;
        const labelRight =
          viewModel.startLabels.get(getCellKey(right.row, right.col)) ?? 0;

        return (
          labelLeft - labelRight ||
          (left.direction === 'across' ? 0 : 1) -
            (right.direction === 'across' ? 0 : 1)
        );
      }),
    [puzzle.entries, viewModel.startLabels],
  );
  const progressPercent = getProgressPercent(
    viewModel.completedEntries.length,
    puzzle.entries.length,
  );
  const remainingAttempts = getRemainingAttempts(mission);
  const todayKey = getTodayDateKey();
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
  const hasProgress =
    Object.keys(cellValues).length > 0 ||
    hintCount > 0 ||
    viewModel.completedEntries.length > 0;
  const hasStarted = mission.attemptsUsed > 0 || hasProgress;
  const isCompleted = viewModel.isComplete || mission.completedAt != null;
  const isAttemptExhaustedUncompleted =
    !isCompleted && mission.attemptsUsed >= DAILY_ATTEMPT_LIMIT;
  const isReviewMode = isCompleted || isAttemptExhaustedUncompleted;
  const completedPuzzleIds = useMemo(
    () => getCompletedPuzzleIds(dateCardStates),
    [dateCardStates],
  );
  // 당일 서빙: 오늘 발행된 퍼즐(easy 5×5 · hard 8×8). 단계 순서·상태·주 CTA 판정은
  // core의 buildDailyLadder가 맡아 워밍업 → 오늘의 퍼즐 한 흐름으로 보여 준다(웹과 동일).
  const todayPuzzleSummaries = useMemo(
    () => puzzlePack.summaries.filter(summary => summary.date === todayKey),
    [puzzlePack.summaries, todayKey],
  );
  const dailyLadder = useMemo(
    () =>
      buildDailyLadder(todayPuzzleSummaries, dateCardStates, {
        dailyAttemptLimit: DAILY_ATTEMPT_LIMIT,
      }),
    [dateCardStates, todayPuzzleSummaries],
  );
  // 완료일 집합은 아카이브 레코드에서 만든다(웹은 localStorage 미션 레코드). 스트릭
  // 숫자와 7일 스트립이 같은 집합을 근거로 삼도록 한 곳에서 계산한다.
  // 완료일은 아카이브(30건 상한)가 아니라 누적 저장소(completionDates)에서 읽는다.
  // 첫 실행에 아카이브·미션 키로 백필하므로 기존 기기의 스트릭이 줄지 않는다.
  const completedDates = useMemo(
    () => new Set(completionDates),
    [completionDates],
  );
  // 스트릭은 완료일 집합에서 파생한다(별도 상태 없음). 초기 hydrate 로 아카이브가
  // 로드되는 즉시 헤드라인·넛지·배지가 같은 값을 쓴다(웹과 동일 규칙).
  const consecutiveStreak = useMemo(
    () => computeConsecutiveStreakDays(completedDates, todayKey),
    [completedDates, todayKey],
  );
  const weeklyStrip = useMemo(
    () => buildWeeklyStreakStrip(completedDates, todayKey),
    [completedDates, todayKey],
  );
  const todayCompleted = weeklyStrip.some(day => day.isToday && day.completed);
  // 기록 화면 통계. 노힌트 신호는 아카이브에 동결된 값을 우선하고 없으면(구버전) 카드
  // 상태로 폴백한다(웹과 동일). 최고 기록은 저장소의 전체 값으로 집계한다.
  const historyStats = useMemo(() => {
    const records: PersonalStatsRecord[] = puzzleArchiveRecords.map(record => {
      const state = dateCardStates[record.puzzleId];
      return {
        completed: record.completedAt != null || state?.completedAt != null,
        hintCount: record.hintCount ?? state?.hintCount ?? 0,
        revealUsed: record.revealUsed ?? false,
      };
    });
    const bestTimeValuesMs = getAllBestTimeValuesMs(bestTimes);
    return {
      stats: computePersonalStats(records, bestTimeValuesMs),
      solveTimeDistribution: computeSolveTimeDistribution(bestTimeValuesMs),
      streakWeeks: buildStreakCalendarWeeks(completionDates, todayKey, 12),
      longestStreak: Math.max(
        computeLongestStreakDays(completionDates),
        consecutiveStreak,
      ),
    };
  }, [
    bestTimes,
    completionDates,
    consecutiveStreak,
    dateCardStates,
    puzzleArchiveRecords,
    todayKey,
  ]);
  const historyViewRef = useRef({
    totalPuzzles: 0,
    completedCount: 0,
    currentStreak: 0,
    longestStreak: 0,
  });
  historyViewRef.current = {
    totalPuzzles: historyStats.stats.totalPuzzles,
    completedCount: historyStats.stats.completedCount,
    currentStreak: consecutiveStreak,
    longestStreak: historyStats.longestStreak,
  };
  // 기록 화면 진입마다 1회 계측(웹 HistoryScreen 마운트 1회와 동일).
  useEffect(() => {
    if (isLoading || route !== 'history') {
      return;
    }
    emitProgressionScreenView(gameAnalytics, historyViewRef.current);
  }, [isLoading, route]);
  const archivePuzzleSummaries = useMemo(
    () =>
      puzzleArchiveRecords
        .slice(0, launchConfig.visiblePuzzleCount)
        .map(record => createPuzzleSummary(record.puzzle)),
    [launchConfig.visiblePuzzleCount, puzzleArchiveRecords],
  );
  const selectedPuzzleSummary = useMemo(
    () =>
      findPuzzleSummaryById(puzzlePack.summaries, puzzle.puzzleId) ??
      findPuzzleSummaryById(archivePuzzleSummaries, puzzle.puzzleId) ??
      createPuzzleSummary(puzzle),
    [archivePuzzleSummaries, puzzle, puzzlePack.summaries],
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
  // 추천 후보는 화면 rail의 노출 제한과 분리한다. Web과 같이 원격 manifest 전체를
  // 먼저 넘겨 오늘 팩 소진 뒤에도 과거 미완료 퍼즐을 이어서 추천한다.
  const recommendationPuzzleSummaries = useMemo(
    () =>
      uniquePuzzleSummaries([
        ...puzzlePack.summaries,
        ...archivePuzzleSummaries,
      ]),
    [archivePuzzleSummaries, puzzlePack.summaries],
  );
  const nextRecommendedSummary = useMemo(
    () =>
      isCompleted
        ? getNextRecommendedPuzzleSummary(
            recommendationPuzzleSummaries,
            completedPuzzleIds,
            {
              puzzleId: puzzle.puzzleId,
              difficulty: puzzle.difficulty,
              date: puzzle.date,
            },
            {
              onboardingRampEnabled:
                launchConfig.onboardingDifficultyRampEnabled,
            },
          )
        : undefined,
    [
      completedPuzzleIds,
      isCompleted,
      launchConfig.onboardingDifficultyRampEnabled,
      puzzle.date,
      puzzle.difficulty,
      puzzle.puzzleId,
      recommendationPuzzleSummaries,
    ],
  );
  // 완료 직후 CTA 문구. 오늘 사다리의 다음 단계면 "오늘의 퍼즐 이어서 풀기"처럼
  // 단계 이름으로 잇는다(웹과 같은 core 문구).
  const nextRecommendedButtonLabel =
    nextRecommendedSummary == null
      ? undefined
      : formatDailyLadderNextLabel(nextRecommendedSummary, puzzle.date);

  const isBoardEmpty = Object.keys(cellValues).length === 0;
  const currentAttemptFirstInputKey = `${puzzle.puzzleId}:${mission.attemptsUsed}`;
  const isFirstInputPending =
    isBoardEmpty &&
    !gameplayAttemptTrackerRef.current.hasFirstInput(
      currentAttemptFirstInputKey,
    );
  const isFirstInputGuideVisible =
    launchConfig.firstInputGuideEnabled &&
    shouldShowFirstInputGuide({
      route,
      hasStarted,
      isCompleted,
      hasSeenFirstInputGuide,
      isBoardEmpty,
    });
  const wrongCellCount = useMemo(
    () =>
      Object.entries(cellValues).filter(
        ([key, value]) =>
          value !== '' && value !== getCellAnswerLetter(puzzle, key),
      ).length,
    [cellValues, puzzle],
  );
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
      route === 'today' &&
      hasStarted &&
      !isCompleted,
    resetKeys: [cellValues],
    firstInputPending: isFirstInputPending,
    firstInputIdleMs: launchConfig.stuckHintFirstInputIdleMs,
    wrongCellCount,
    wrongCellThreshold: launchConfig.stuckHintWrongCellThreshold,
    idleMs: launchConfig.stuckHintIdleMs,
    wrongIdleMs: launchConfig.stuckHintWrongIdleMs,
    puzzleKey: puzzle.puzzleId,
    maxPromptsPerAttempt: launchConfig.stuckHintMaxPromptsPerAttempt,
    maxDismissals: launchConfig.stuckHintMaxDismissals,
    dismissBackoffFactor: launchConfig.stuckHintDismissBackoffFactor,
    minCooldownMs: launchConfig.stuckHintMinCooldownMs,
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
        ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
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

  // AppState와 route listener가 stale closure 없이 이탈 직전 상태를 사용하도록
  // 최신 진행 스냅샷을 매 렌더 갱신한다.
  abandonSnapshotRef.current = {
    attemptsUsed: mission.attemptsUsed,
    elapsedSeconds: getElapsedSeconds(
      mission.lastStartedAt,
      undefined,
      mission,
    ),
    gameContext: getGamePuzzleContext(puzzle),
    hadFirstInput: gameplayAttemptTrackerRef.current.hasFirstInput(
      `${puzzle.puzzleId}:${mission.attemptsUsed}`,
    ),
    hasStarted,
    hintCount,
    isCompleted,
    progressPercent,
    puzzleId: puzzle.puzzleId,
    remainingAttempts,
    route,
    telemetryParams: getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
    totalWords: puzzle.entries.length,
    wordsFilled: viewModel.completedEntries.length,
  };

  const emitPuzzleAbandon = useCallback((lastScreen: AppRoute) => {
    gameplayAttemptTrackerRef.current.emitPuzzleAbandon(
      abandonSnapshotRef.current,
      lastScreen,
      { telemetry, gameAnalytics },
    );
  }, []);

  // 보드에서 다른 화면으로 이동하는 경우 시도당 한 번만 이탈 스냅샷을 남긴다.
  useEffect(() => {
    const previousRoute = previousRouteRef.current;
    if (previousRoute === 'today' && route !== 'today') {
      emitPuzzleAbandon(previousRoute);
    }
    previousRouteRef.current = route;
  }, [emitPuzzleAbandon, route]);

  const boardCellSize = Math.max(
    32,
    Math.min(
      // The 풀이 화면 is a single column now; size cells from the real content
      // padding (playScreenScrollContent: 16 each side) and let wide screens
      // grow the board instead of reserving a phantom side pane.
      isWide ? 64 : 48,
      Math.floor((width - 32) / viewModel.cols.length),
    ),
  );
  const boardNativeInputPosition = useMemo(
    () =>
      getBoardNativeInputPosition(
        activeAnswerCellKey,
        viewModel.bounds,
        boardCellSize,
      ),
    [activeAnswerCellKey, boardCellSize, viewModel.bounds],
  );

  const refreshPuzzleArchive = useCallback(async () => {
    const nextArchiveRecords = await listArchivedPuzzles();
    const archiveStates = await loadDateCardStates(
      nextArchiveRecords.map(record => createPuzzleSummary(record.puzzle)),
    );

    setPuzzleArchiveRecords(nextArchiveRecords);
    setDateCardStates(previous => ({ ...previous, ...archiveStates }));
  }, []);

  const savePuzzleSnapshot = useCallback(
    async (nextPuzzle: Puzzle, options: PuzzleArchiveSaveOptions = {}) => {
      await saveArchivedPuzzle(nextPuzzle, options);
      await refreshPuzzleArchive();
    },
    [refreshPuzzleArchive],
  );

  useEffect(() => {
    let isCancelled = false;

    loadFirebaseLaunchConfig()
      .then(nextLaunchConfig => {
        if (!isCancelled) {
          setLaunchConfig(nextLaunchConfig);
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

  useEffect(() => {
    initializeMobileAds().then(isInitialized => {
      telemetry.impression('mobile_ads_initialize', {
        status: isInitialized ? 'ready' : 'unavailable',
      });
    });
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function hydrateInitialSession() {
      cancelStaleMobileReturnReminder(getTodayDateKey()).catch(() => {});
      let nextPuzzlePack = bundledPuzzlePack;

      try {
        nextPuzzlePack = await loadRemotePuzzlePack();
      } catch {
        nextPuzzlePack = bundledPuzzlePack;
      }

      const nextSummaries = nextPuzzlePack.summaries;
      const nextArchiveRecords = await listArchivedPuzzles();
      const [nextCompletionDates, nextBestTimes] = await Promise.all([
        mobileCompletionDatesRepository.migrateCompletionDatesIfNeeded({
          archiveRecords: nextArchiveRecords,
        }),
        mobileBestTimeRepository.loadBestTimes(),
      ]);
      const hydratedSummaries = uniquePuzzleSummaries([
        ...nextSummaries,
        ...nextArchiveRecords.map(record => createPuzzleSummary(record.puzzle)),
      ]);
      const initialPuzzleId = getInitialPuzzleId(nextSummaries);
      const [states, session, nextDailyHintWallet] = await Promise.all([
        loadDateCardStates(hydratedSummaries),
        loadPuzzleSession(initialPuzzleId, nextPuzzlePack),
        loadDailyHintWalletForDate(getTodayDateKey(), hydratedSummaries),
      ]);

      if (isCancelled) {
        return;
      }

      setPuzzlePack(nextPuzzlePack);
      setPuzzleArchiveRecords(nextArchiveRecords);
      completionDatesRef.current = nextCompletionDates;
      setCompletionDates(nextCompletionDates);
      setBestTimes(nextBestTimes);
      setDateCardStates(states);
      setDailyHintWallet(nextDailyHintWallet);
      applyPuzzleSession(session);
      setNotice(
        nextPuzzlePack.source === 'remote'
          ? `${session?.nextPuzzle.date ?? '원격'} 퍼즐팩을 불러왔습니다.`
          : `${session?.nextPuzzle.date ?? '기본'} 퍼즐팩을 불러왔습니다.`,
      );
      setIsLoading(false);
    }

    hydrateInitialSession().catch(() => {
      if (!isCancelled) {
        setIsLoading(false);
        setNotice('퍼즐 데이터를 불러오지 못했습니다.');
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  const refreshDailyHintWallet = useCallback(async () => {
    const date = getTodayDateKey();
    if (dailyHintWallet.date === date) {
      return;
    }

    const summaries = uniquePuzzleSummaries([
      ...puzzlePack.summaries,
      ...puzzleArchiveRecords.map(record => createPuzzleSummary(record.puzzle)),
    ]);
    const wallet = await loadDailyHintWalletForDate(date, summaries);
    setDailyHintWallet(wallet);
  }, [dailyHintWallet.date, puzzleArchiveRecords, puzzlePack.summaries]);

  // 백그라운드 전환 시 풀이 타이머 자동 일시정지/재개(#384, 웹 #232와 동일 규칙).
  // "오늘" 화면에서 시작·미완료·시도 소진 전 진행 중일 때만 정지하고, active 복귀에서
  // 정지 중이었으면 재개한다. 정지 구간은 pausedMs에 누적돼 완료·이탈·리더보드
  // 계측과 완료 화면 경과 표시에서 제외된다.
  useEffect(() => {
    setIsNewBestTime(false);
  }, [puzzle.puzzleId]);

  useEffect(() => {
    if (progressToast.message === '') {
      return;
    }
    const timer = setTimeout(() => {
      setProgressToast(prev =>
        prev.id === progressToast.id ? { ...prev, message: '' } : prev,
      );
    }, 2500);
    return () => clearTimeout(timer);
  }, [progressToast]);

  useEffect(() => {
    const pending = returnReminderPrepromptRef.current;
    if (completionCelebrationPuzzleId != null || pending == null) {
      return;
    }
    setReturnReminderPreprompt(null);
    declineMobileReturnReminder(pending.prompted, {
      streakDays: pending.streakDays,
      telemetry,
    }).catch(() => {});
  }, [completionCelebrationPuzzleId]);

  useEffect(() => {
    refreshDailyHintWallet().catch(() => {});
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        const nextMission = applyAppStateTransition(
          state,
          missionRef.current,
          false,
          new Date(),
        );
        if (nextMission != null) {
          setMission(nextMission);
          saveStoredMission(nextMission);
        }
        refreshDailyHintWallet().catch(() => {});
        // 알림 시각 전에 이미 돌아왔으면 오늘자 예약은 소음이라 취소한다.
        cancelStaleMobileReturnReminder(getTodayDateKey()).catch(() => {});
        consumePendingReturnReminderOpen()
          .then(open => {
            if (open != null) {
              handleReturnReminderOpen(open);
            }
          })
          .catch(() => {});
      } else if (state === 'background') {
        const canAutoPause =
          abandonSnapshotRef.current.route === 'today' &&
          abandonSnapshotRef.current.hasStarted &&
          !abandonSnapshotRef.current.isCompleted;
        const nextMission = applyAppStateTransition(
          state,
          missionRef.current,
          canAutoPause,
          new Date(),
        );
        if (nextMission != null) {
          setMission(nextMission);
          saveStoredMission(nextMission);
        }
        if (abandonSnapshotRef.current.route === 'today') {
          emitPuzzleAbandon('today');
        }
      }
    });

    return () => subscription.remove();
  }, [emitPuzzleAbandon, handleReturnReminderOpen, refreshDailyHintWallet]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    telemetry.screen(route, {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      puzzle_pack_source: puzzlePack.source,
    });
  }, [isLoading, puzzle, puzzlePack.source, route, selectedPuzzleSummary]);

  useEffect(() => {
    if (route !== 'today') {
      setCompletionCelebrationPuzzleId(null);
    }
  }, [route]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    saveStoredProgress(puzzle.puzzleId, {
      cellValues,
      // 광고 보상은 날짜별 공용 지갑에 저장한다. 필드는 구버전 스키마 호환용이다.
      earnedHintCredits: 0,
      hintCount,
    });
  }, [cellValues, hintCount, isLoading, puzzle.puzzleId]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    setDateCardStates(previous => ({
      ...previous,
      [puzzle.puzzleId]: createDateCardState(mission, {
        cellValues,
        earnedHintCredits: 0,
        hintCount,
      }),
    }));
  }, [cellValues, hintCount, isLoading, mission, puzzle.puzzleId]);

  const getMobileAdTelemetryParams = useCallback(
    (
      placement: string,
      nextPuzzle = puzzle,
      summary = selectedPuzzleSummary,
    ) => ({
      ...getPuzzleTelemetryParams(nextPuzzle, summary),
      ad_placement: placement,
      ad_provider: 'admob',
    }),
    [puzzle, selectedPuzzleSummary],
  );

  const openAdDiagnostics = useCallback(() => {
    setIsAdDiagnosticsOpen(true);
    setAdDiagnosticState({
      isRunning: false,
      message: '대기 중',
    });
  }, []);

  const handleAdDiagnosticsUnlockTap = useCallback(() => {
    setAdDiagnosticsTapCount(previous => {
      const next = previous + 1;

      if (next >= 7) {
        openAdDiagnostics();
        return 0;
      }

      return next;
    });
  }, [openAdDiagnostics]);

  const runRewardedAdDiagnostic = useCallback(
    async (placement: RewardedAdPlacement, adUnitMode: MobileAdUnitMode) => {
      setAdDiagnosticState({
        isRunning: true,
        message: `${placement} ${adUnitMode} 요청 중`,
      });

      const result = await showRewardedAd(placement, { adUnitMode });
      const eventSequence = formatMobileAdEventSequence(result.events);
      const failureCode = getMobileAdFailureCode(result.events);
      const message = `${placement} ${adUnitMode}: ${result.status}${
        failureCode == null ? '' : ` (${failureCode})`
      }\n${eventSequence}`;

      telemetry.impression('mobile_ad_diagnostic_result', {
        ad_mode: adUnitMode,
        ad_placement: placement,
        ad_provider: 'admob',
        ad_status: result.status,
        ad_summary: eventSequence,
      });
      setAdDiagnosticState({
        isRunning: false,
        message,
      });
    },
    [],
  );

  const openAdInspector = useCallback(async () => {
    setAdDiagnosticState({
      isRunning: true,
      message: 'Ad Inspector 여는 중',
    });

    const result = await openMobileAdsInspector();

    telemetry.impression('mobile_ad_inspector_open', {
      ad_error_code: result.errorCode,
      ad_provider: 'admob',
      ad_status: result.status,
    });
    setAdDiagnosticState({
      isRunning: false,
      message:
        result.status === 'opened'
          ? 'Ad Inspector를 닫았습니다.'
          : `Ad Inspector 실패 (${result.errorCode ?? 'unknown'})`,
    });
  }, []);

  const openAdPrivacySettings = useCallback(async () => {
    const result = await showMobileAdsPrivacyOptions();
    setNotice(
      result.status === 'shown'
        ? '광고 개인정보 선택을 반영했습니다.'
        : result.status === 'not_required'
          ? '현재 지역에서는 별도의 광고 개인정보 선택이 필요하지 않습니다.'
          : '광고 개인정보 설정을 열지 못했습니다. 네트워크 연결 후 다시 시도해 주세요.',
    );
  }, []);

  useEffect(() => {
    if (isLoading || !viewModel.isComplete || mission.completedAt != null) {
      return;
    }

    // 완료 시점에 진행 중 정지 구간이 남아 있으면(방어적 처리) 접어 마무리한 뒤
    // completeMission에 넘긴다. pausedMs는 계측·리더보드가 그대로 쓰도록 보존한다.
    const resolvedMission =
      mission.pausedAt == null
        ? mission
        : { ...mission, ...togglePauseState(mission, new Date()) };
    const nextMission: MissionState = {
      ...completeMission(resolvedMission),
      pausedMs: resolvedMission.pausedMs,
      pausedAt: resolvedMission.pausedAt,
    };
    setMission(nextMission);
    saveStoredMission(nextMission);
    // 완료 시점의 노힌트 판정 신호를 아카이브에 동결한다(웹과 동일). RN 은 정답 보기가
    // 없어 revealUsed 는 항상 false 지만 규칙은 core getCompletionAchievements 하나다.
    savePuzzleSnapshot(puzzle, {
      completedAt: nextMission.completedAt,
      hintCount,
      revealUsed: false,
    });
    const elapsedMs =
      computeElapsedMs({
        startedAt: nextMission.lastStartedAt,
        endedAt: nextMission.completedAt,
        pausedMs: nextMission.pausedMs,
      }) ?? 0;
    if (
      getCompletionAchievements({
        hintCount,
        attemptsUsed: nextMission.attemptsUsed,
        revealUsed: false,
      }).bestTimeEligible
    ) {
      mobileBestTimeRepository
        .recordBestTime(puzzle.puzzleId, elapsedMs)
        .then(({ isNewBest, bestTimes: nextBestTimes }) => {
          setBestTimes(nextBestTimes);
          if (isNewBest) {
            setIsNewBestTime(true);
          }
        })
        .catch(() => {});
    }
    // 완료일을 누적하고 스트릭 마일스톤(7/30/100)을 1회 계측한다. 이전 값은 오늘 몫을
    // 더하지 않는 비관 계산으로 읽어야 완료 전후가 갈린다(웹과 동일 규칙).
    const completionToday = getTodayDateKey();
    const previousStreak = computeConsecutiveStreakDays(
      completionDatesRef.current,
      completionToday,
      { countTodayPending: false },
    );
    mobileCompletionDatesRepository
      .addCompletionDate(nextMission.date)
      .then(nextDates => {
        completionDatesRef.current = nextDates;
        setCompletionDates(nextDates);
        emitStreakMilestoneIfReached(
          gameAnalytics,
          previousStreak,
          computeConsecutiveStreakDays(nextDates, completionToday),
        );
      })
      .catch(() => {});
    telemetry.impression('mission_complete', {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      attempt_number: mission.attemptsUsed,
      completed_word_count: viewModel.completedEntries.length,
      hint_count: hintCount,
      remaining_attempts: remainingAttempts,
    });
    // 게임 세부 지표: 완료 퍼널 종점 + 풀이 성과(마켓 차원 포함).
    gameAnalytics.track('game_puzzle_complete', getGamePuzzleContext(puzzle), {
      solveTimeSec: getElapsedSeconds(
        nextMission.lastStartedAt,
        nextMission.completedAt,
        nextMission,
      ),
      hintCount,
      revealUsed: false,
      attemptNumber: mission.attemptsUsed,
      completedWordCount: viewModel.completedEntries.length,
    });

    if (!returnReminderPromptedPuzzleIdsRef.current.has(puzzle.puzzleId)) {
      returnReminderPromptedPuzzleIdsRef.current.add(puzzle.puzzleId);
      const promptDate = getTodayDateKey();
      // 완료 후 스트릭(오늘 포함)을 미리 확정해 카드 본문과 shown/accept/decline 계측이
      // 같은 값을 쓴다. 아카이브 갱신은 비동기라 consecutiveStreak 는 아직 완료 전 값이다.
      const streakDays = computeConsecutiveStreakDays(
        [...completedDates, promptDate],
        promptDate,
      );
      // 이미 동의한 사용자는 매 완료마다 D+1 알림을 다시 예약하고, 아직 동의 전이면
      // 사전 안내 카드를 띄운다(시스템 권한 요청은 카드 수락 뒤에만). 카드는 오늘 화면의
      // 완료 모달에서만 그릴 수 있으므로 모달이 떠 있을 때만 유도로 기록하고, 비동기
      // 처리 중 모달이 닫혔으면 보류로 정리한다.
      refreshMobileReturnReminderSchedule(promptDate, { telemetry })
        .then(() => {
          if (completionCelebrationPuzzleIdRef.current !== puzzle.puzzleId) {
            return null;
          }
          return prepareMobileReturnReminderPreprompt({
            enabled: launchConfig.returnReminderEnabled,
            promptDate,
            streakDays,
            telemetry,
          });
        })
        .then(prompted => {
          if (prompted == null) {
            return;
          }
          if (completionCelebrationPuzzleIdRef.current !== puzzle.puzzleId) {
            declineMobileReturnReminder(prompted, {
              streakDays,
              telemetry,
            }).catch(() => {});
            return;
          }
          setReturnReminderPreprompt({ prompted, streakDays });
        })
        .catch(() => {});
    }

    if (
      leaderboardVisible &&
      shouldSubmitLeaderboardScore({
        completed: true,
        revealUsed: false,
        alreadySubmitted: submittedLeaderboardPuzzleIdsRef.current.has(
          puzzle.puzzleId,
        ),
      })
    ) {
      submittedLeaderboardPuzzleIdsRef.current.add(puzzle.puzzleId);
      const elapsedSeconds = getElapsedSeconds(
        nextMission.lastStartedAt,
        nextMission.completedAt,
        nextMission,
      );
      const score = computeLeaderboardScore(
        {
          completedWordCount: viewModel.completedEntries.length,
          remainingAttempts: getRemainingAttempts(nextMission),
          hintCount,
          elapsedSeconds,
        },
        {
          completedWord: launchConfig.leaderboardScoreCompletedWord,
          remainingAttempt: launchConfig.leaderboardScoreRemainingAttempt,
          hint: launchConfig.leaderboardScoreHint,
          timeBonusBase: launchConfig.leaderboardScoreTimeBonusBase,
          timeDecayPerSecond: launchConfig.leaderboardScoreTimeDecayPerSecond,
        },
      );

      submitLeaderboardScore(score, {
        puzzleId: puzzle.puzzleId,
        difficulty: puzzle.difficulty,
        elapsedSeconds,
      }).catch(() => undefined);
    }
    Keyboard.dismiss();
    setNotice('퍼즐을 완료했습니다. 정답판을 확인한 뒤 결과를 볼 수 있습니다.');
    if (route === 'today') {
      setCompletionCelebrationPuzzleId(puzzle.puzzleId);
    }
  }, [
    completedDates,
    consecutiveStreak,
    hintCount,
    isLoading,
    launchConfig.leaderboardScoreCompletedWord,
    launchConfig.leaderboardScoreHint,
    launchConfig.leaderboardScoreRemainingAttempt,
    launchConfig.leaderboardScoreTimeBonusBase,
    launchConfig.leaderboardScoreTimeDecayPerSecond,
    launchConfig.returnReminderEnabled,
    leaderboardVisible,
    mission,
    puzzle,
    remainingAttempts,
    route,
    savePuzzleSnapshot,
    selectedPuzzleSummary,
    submitLeaderboardScore,
    viewModel.completedEntries.length,
    viewModel.isComplete,
  ]);

  useEffect(() => {
    const milestones =
      gameplayAttemptTrackerRef.current.getNewProgressMilestones({
        attemptKey: `${puzzle.puzzleId}:${mission.attemptsUsed}`,
        isCompleted: viewModel.isComplete,
        progressPercent,
      });

    for (const milestone of milestones) {
      telemetry.impression('puzzle_progress', {
        ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
        attempt_number: mission.attemptsUsed,
        completed_word_count: viewModel.completedEntries.length,
        word_count: puzzle.entries.length,
        progress_percent: progressPercent,
        milestone,
        elapsed_seconds: getElapsedSeconds(mission.lastStartedAt, undefined, {
          pausedMs: mission.pausedMs,
          pausedAt: mission.pausedAt,
        }),
        hint_count: hintCount,
        remaining_attempts: remainingAttempts,
      });
      gameAnalytics.track('game_progress', getGamePuzzleContext(puzzle), {
        completedWordCount: viewModel.completedEntries.length,
        totalWordCount: puzzle.entries.length,
        progressPercent,
        attemptNumber: mission.attemptsUsed,
      });
    }
    if (milestones.length > 0) {
      // 가장 높은 마일스톤 하나만 토스트로 보여 준다(웹과 동일 문구).
      const message = getProgressMilestoneRewardMessage(
        milestones[milestones.length - 1],
      );
      setProgressToast(prev => ({ id: prev.id + 1, message }));
    }
  }, [
    hintCount,
    mission.attemptsUsed,
    mission.lastStartedAt,
    mission.pausedAt,
    mission.pausedMs,
    progressPercent,
    puzzle,
    remainingAttempts,
    selectedPuzzleSummary,
    viewModel.completedEntries.length,
    viewModel.isComplete,
  ]);

  const clearAnswerCommitTimer = useCallback(() => {
    if (answerCommitTimerRef.current != null) {
      clearTimeout(answerCommitTimerRef.current);
      answerCommitTimerRef.current = null;
    }
  }, []);

  const clearBoardFocusTimer = useCallback(() => {
    if (boardFocusTimerRef.current != null) {
      clearTimeout(boardFocusTimerRef.current);
      boardFocusTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearAnswerCommitTimer();
    setAnswerInputValue('');
  }, [activeAnswerCellKey, clearAnswerCommitTimer, selectedEntry?.id]);

  useEffect(
    () => () => {
      clearAnswerCommitTimer();
      clearBoardFocusTimer();
    },
    [clearAnswerCommitTimer, clearBoardFocusTimer],
  );

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisibleRef.current = true;
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisibleRef.current = false;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      goBackWithinSceneGraph,
    );

    return () => {
      subscription.remove();
    };
  }, [goBackWithinSceneGraph]);

  const scrollBoardCellIntoView = useCallback(
    (cellKey = activeAnswerCellKey) => {
      const position = getBoardNativeInputPosition(
        cellKey,
        viewModel.bounds,
        boardCellSize,
      );

      playScreenScrollRef.current?.scrollTo({
        animated: true,
        y: getBoardCellFocusScrollY(position.top, boardCellSize),
      });
    },
    [activeAnswerCellKey, boardCellSize, viewModel.bounds],
  );

  const focusBoardInput = useCallback(
    (cellKey?: string) => {
      // Box mode types into a single visible TextInput; just focus it. The
      // hidden per-cell input only exists in cell mode.
      if (answerInputMode === 'box') {
        boxInputRef.current?.focus();
        return;
      }

      scrollBoardCellIntoView(cellKey);
      clearBoardFocusTimer();
      boardFocusTimerRef.current = scheduleBoardNativeInputFocus({
        getInput: () => boardInputRef.current,
        keyboardVisible: keyboardVisibleRef.current,
        onFocusTimerSettled: () => {
          boardFocusTimerRef.current = null;
        },
        platformOS: Platform.OS,
      });
    },
    [answerInputMode, clearBoardFocusTimer, scrollBoardCellIntoView],
  );

  useEffect(() => {
    if (route === 'today') {
      scrollBoardCellIntoView(activeAnswerCellKey);
    }
  }, [activeAnswerCellKey, route, scrollBoardCellIntoView]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem('crossword:how-to-play-seen')
      .then(value => {
        if (!cancelled && !howToPlayDismissedRef.current) {
          setHasSeenHowToPlay(value === '1');
        }
      })
      .catch(() => {
        if (!cancelled && !howToPlayDismissedRef.current) {
          // Read failed: default to showing the modal so first-time requirement is met.
          setHasSeenHowToPlay(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadFirstInputGuideSeen()
      .then(value => {
        if (cancelled) {
          return;
        }
        firstInputGuideHydratedRef.current = true;
        if (!firstInputGuideDismissedRef.current) {
          setHasSeenFirstInputGuide(value);
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        firstInputGuideHydratedRef.current = true;
        if (!firstInputGuideDismissedRef.current) {
          setHasSeenFirstInputGuide(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 안내를 어떻게 떠났는지 남긴다. RN 은 단일 화면 안내라 stepCount 는 1이다.
  useEffect(() => {
    if (route !== 'today' || hasSeenHowToPlay || howToPlayShownRef.current) {
      return;
    }
    howToPlayShownRef.current = true;
    howToPlayShownAtRef.current = Date.now();
    telemetry.impression(HOW_TO_PLAY_SHOWN_EVENT, {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      ...buildHowToPlayParams({ stepIndex: 0, stepCount: 1 }),
    });
  }, [hasSeenHowToPlay, puzzle, route, selectedPuzzleSummary]);

  useEffect(() => {
    if (!isFirstInputGuideVisible || firstInputGuideShownRef.current) {
      return;
    }
    firstInputGuideShownRef.current = true;
    telemetry.impression('onboarding_guide_shown', {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      attempt_number: mission.attemptsUsed,
    });
  }, [
    isFirstInputGuideVisible,
    mission.attemptsUsed,
    puzzle,
    selectedPuzzleSummary,
  ]);

  function dismissHowToPlay(outcome: HowToPlayOutcome = 'dismiss') {
    const shownAt = howToPlayShownAtRef.current;
    telemetry.click(getHowToPlayOutcomeEvent(outcome), {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      ...buildHowToPlayParams({
        stepIndex: 0,
        stepCount: 1,
        elapsedSeconds:
          shownAt == null ? undefined : (Date.now() - shownAt) / 1000,
      }),
    });
    howToPlayDismissedRef.current = true;
    setHasSeenHowToPlay(true);
    // Fire-and-forget: write failure means session-only dismissal; modal may reappear on next launch.
    AsyncStorage.setItem('crossword:how-to-play-seen', '1').catch(() => {});
  }

  function persistFirstInputGuideCompletion() {
    firstInputGuideDismissedRef.current = true;
    setHasSeenFirstInputGuide(true);
    markFirstInputGuideSeen().catch(() => {});
  }

  function completeFirstInputGuide() {
    if (hasSeenFirstInputGuide && firstInputGuideHydratedRef.current) {
      return;
    }
    if (firstInputGuideShownRef.current) {
      telemetry.click('onboarding_guide_complete', {
        ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
        attempt_number: mission.attemptsUsed,
        elapsed_seconds: getElapsedSeconds(
          mission.lastStartedAt,
          undefined,
          mission,
        ),
      });
    }
    persistFirstInputGuideCompletion();
  }

  function dismissFirstInputGuide() {
    telemetry.click('onboarding_guide_dismiss', {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      attempt_number: mission.attemptsUsed,
    });
    persistFirstInputGuideCompletion();
  }

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ANSWER_INPUT_MODE_KEY)
      .then(value => {
        if (!cancelled && (value === 'box' || value === 'cell')) {
          setAnswerInputMode(value);
        }
      })
      .catch(() => {
        // Read failed: keep the default box mode for this session.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function selectAnswerInputMode(mode: AnswerInputMode) {
    setAnswerInputMode(mode);
    // Fire-and-forget: write failure means the preference applies this session only.
    AsyncStorage.setItem(ANSWER_INPUT_MODE_KEY, mode).catch(() => {});
  }

  async function requestRewardedHintCredits() {
    if (!launchConfig.rewardedHintAdsEnabled) {
      setNotice('운영 설정에서 힌트 광고가 꺼져 있습니다.');
      return;
    }

    if (rewardedAdPlacement != null) {
      setNotice('광고를 불러오는 중입니다.');
      return;
    }

    // 게임 세부 지표: 리워드 광고 보조 요청(힌트).
    gameAnalytics.track('game_assist_ad', getGamePuzzleContext(puzzle), {
      assistType: 'rewarded_hint',
      result: 'request',
    });

    await runRewardedHintAdFlow({
      attempt: async (attempt: RewardedAdRetryAttempt) => {
        const result = await showRewardedAd('rewardedHint');
        result.events.forEach(event => {
          trackRewardedHintAdTrace(telemetry, mapMobileAdTraceEvent(event), {
            ...getMobileAdTelemetryParams('rewardedHint'),
            retry: attempt,
          });
        });
        return result;
      },
      getStatus: getMobileRewardedAdRetryStatus,
      mapError: mapRewardedAdRetryError,
      onAttemptResult: (result, retry) => {
        trackRewardedHintAdResult(
          telemetry,
          {
            ...getMobileAdTelemetryParams('rewardedHint'),
            ad_status: result.status,
          },
          retry,
        );
      },
      onAttemptStart: retry => {
        trackRewardedHintAdRequest(
          telemetry,
          {
            ...getMobileAdTelemetryParams('rewardedHint'),
            rewarded_hint_credits: launchConfig.rewardedHintCredits,
          },
          retry,
        );
      },
      onFailure: result => {
        // 게임 세부 지표: 리워드 광고 보조 실패/취소(힌트). 유저 취소(closed)는
        // dismiss, 그 외 실패(failed 등)는 error로 계측한다(#321).
        gameAnalytics.track('game_assist_ad', getGamePuzzleContext(puzzle), {
          assistType: 'rewarded_hint',
          result: mapRewardedAdFailureToAssistResult(result.status),
        });
        if (result.status === 'closed') {
          setNotice('광고를 끝까지 보지 않아 힌트가 지급되지 않았습니다.');
        } else {
          setNotice(
            `광고를 불러오지 못했습니다. (${getMobileAdFailureCode(
              result.events,
            )})`,
          );
        }
      },
      onLoadingChange: loading => {
        setRewardedAdPlacement(loading ? 'rewardedHint' : null);
      },
      onRetry: () => {
        setNotice('광고를 다시 준비하는 중입니다.');
      },
      onReward: (_result, retry) => {
        persistDailyHintWallet(
          grantDailyHintCredits(
            activeDailyHintWallet,
            launchConfig.rewardedHintCredits,
          ),
        );
        telemetry.impression(REWARDED_HINT_AD_REWARD_EVENT, {
          ...getMobileAdTelemetryParams('rewardedHint'),
          retry,
          rewarded_hint_credits: launchConfig.rewardedHintCredits,
        });
        // 게임 세부 지표: 리워드 광고 보조 보상 지급(힌트).
        gameAnalytics.track('game_assist_ad', getGamePuzzleContext(puzzle), {
          assistType: 'rewarded_hint',
          result: 'reward',
        });
        setNotice(
          `광고 보상으로 힌트 ${launchConfig.rewardedHintCredits}개를 받았습니다.`,
        );
      },
    });
  }

  function openCompletedResult() {
    setCompletionCelebrationPuzzleId(null);
    navigateTo('result');
  }

  function openCompletedBoard() {
    setCompletionCelebrationPuzzleId(null);
    navigateTo('today');
  }

  function applyPuzzleSession(session: PuzzleSession | null) {
    if (session == null) {
      return;
    }

    setCompletionCelebrationPuzzleId(null);
    setPuzzle(session.nextPuzzle);
    setCellValues(session.savedProgress.cellValues);
    setHintCount(session.savedProgress.hintCount);
    setMission(session.savedMission);
    setSelectedDirection('across');
    setSelectedEntryId(getInitialEntryId(session.nextPuzzle));
    setSelectedCellKey(getInitialEntryStartCellKey(session.nextPuzzle));
    setNotice(`${session.nextPuzzle.date} 퍼즐을 불러왔습니다.`);
  }

  async function selectPuzzle(
    puzzleId: string,
    destination: AppRoute = 'home',
  ) {
    if (isLoading) {
      return;
    }

    if (
      abandonSnapshotRef.current.route === 'today' &&
      abandonSnapshotRef.current.puzzleId !== puzzleId
    ) {
      emitPuzzleAbandon('today');
    }

    setIsLoading(true);
    const session = await loadPuzzleSession(puzzleId, puzzlePack);
    applyPuzzleSession(session);
    setIsLoading(false);
    navigateTo(destination);

    if (session == null) {
      setNotice('퍼즐 데이터를 찾을 수 없습니다.');
      return;
    }

    telemetry.click('puzzle_select', {
      ...getPuzzleTelemetryParams(
        session.nextPuzzle,
        findPuzzleSummaryById(
          puzzlePack.summaries,
          session.nextPuzzle.puzzleId,
        ),
      ),
      puzzle_pack_source: puzzlePack.source,
    });
  }

  // 사전 안내 카드 응답. 수락 시에만 OS 권한 요청·D+1 예약(confirm), 보류는 declined
  // 로 기록해 익일 재안내 대상으로 남긴다.
  async function acceptReturnReminder() {
    if (returnReminderPreprompt == null) {
      return;
    }
    const { prompted, streakDays } = returnReminderPreprompt;
    setReturnReminderPreprompt(null);
    await confirmMobileReturnReminder(prompted, {
      promptDate: getTodayDateKey(),
      streakDays,
      telemetry,
    }).catch(() => {});
  }

  async function declineReturnReminder() {
    if (returnReminderPreprompt == null) {
      return;
    }
    const { prompted, streakDays } = returnReminderPreprompt;
    setReturnReminderPreprompt(null);
    await declineMobileReturnReminder(prompted, {
      streakDays,
      telemetry,
    }).catch(() => {});
  }

  async function startNextRecommendedPuzzle(source: NextPuzzleCtaSource) {
    if (nextRecommendedSummary == null) {
      return;
    }

    const nextPuzzleCtaEvent = buildNextPuzzleCtaEvent(
      nextRecommendedSummary,
      source,
    );
    telemetry.click(nextPuzzleCtaEvent.name, {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      ...nextPuzzleCtaEvent.params,
    });
    setCompletionCelebrationPuzzleId(null);
    await selectPuzzle(nextRecommendedSummary.puzzleId, 'today');
  }

  function selectEntry(entry: PuzzleEntry, cellKey?: string) {
    setSelectedEntryId(entry.id);
    setSelectedDirection(entry.direction);
    setSelectedCellKey(cellKey ?? getCellKey(entry.row, entry.col));
    setNotice(`${directionLabels[entry.direction]} ${entry.answer.length}글자`);
  }

  function goToAdjacentClue(delta: number) {
    if (selectedEntry == null || orderedEntries.length === 0) {
      return;
    }

    const index = orderedEntries.findIndex(
      entry => entry.id === selectedEntry.id,
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
      focusBoardInput(getEntryStartCellKey(nextEntry));
    }
  }

  function selectCell(row: number, col: number) {
    const key = getCellKey(row, col);
    const entries = viewModel.cellEntries.get(key);

    if (entries == null || entries.length === 0) {
      return;
    }

    const currentEntry = entries.find(entry => entry.id === selectedEntryId);
    const nextEntry =
      currentEntry != null && key === selectedCellKey && entries.length > 1
        ? (entries.find(entry => entry.id !== currentEntry.id) ?? currentEntry)
        : (entries.find(entry => entry.direction === selectedDirection) ??
          entries[0]);

    selectEntry(nextEntry, key);
    focusBoardInput(key);
  }

  function moveToNextUncompletedEntry(
    currentEntry: PuzzleEntry,
    nextCellValues: Record<string, string>,
    anchorCellKey: string | null,
  ) {
    const nextEntry = getNextFocusEntryAfterCompletion(
      puzzle.entries,
      nextCellValues,
      currentEntry,
      anchorCellKey,
    );

    if (nextEntry != null) {
      selectEntry(nextEntry);
    }
  }

  function applyAnswerSegment(
    entry: PuzzleEntry,
    value: string,
    startCellKey = selectedCellKey,
  ) {
    const cells = getEntryCells(entry);
    const startIndex = getEntryCellIndex(entry, startCellKey);
    const nextLetters = getAnswerCommitLetters(
      value,
      cells.length - startIndex,
    );

    if (nextLetters.length === 0) {
      return;
    }

    if (
      gameplayAttemptTrackerRef.current.markFirstInput(
        `${puzzle.puzzleId}:${mission.attemptsUsed}`,
      )
    ) {
      telemetry.impression('first_answer_input', {
        ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
        attempt_number: mission.attemptsUsed,
      });
      // 게임 세부 지표: 첫 입력(참여 시작). 시작→첫입력 소요로 초반 이탈을 본다.
      gameAnalytics.track('game_first_input', getGamePuzzleContext(puzzle), {
        timeToFirstInputSec: getElapsedSeconds(
          mission.lastStartedAt,
          undefined,
          mission,
        ),
        attemptNumber: mission.attemptsUsed,
      });
      completeFirstInputGuide();
    }

    const nextValues = { ...cellValues };

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

    // "칸이 모두 찼다"가 아니라 "정답과 일치"할 때만 다음 칸으로 넘어간다.
    // (한글 마지막 글자를 조합하는 중 마지막 칸이 채워지면 isEntryFilled가
    //  먼저 true가 되어 자동 이동이 받침 입력을 끊어버리는 문제를 막는다.)
    if (getEntryAnswerValue(entry, nextValues) === entry.answer) {
      setNotice('정답입니다.');
      const lastCell = cells[startIndex + nextLetters.length - 1];
      const anchorCellKey =
        lastCell != null ? getCellKey(lastCell.row, lastCell.col) : null;
      moveToNextUncompletedEntry(entry, nextValues, anchorCellKey);
    } else {
      setNotice(`${directionLabels[entry.direction]} 답을 입력 중입니다.`);
    }
  }

  // Box mode applies the whole word at once (mirrors the web applyAnswer):
  // positionally map typed letters onto the entry, clearing removed/trailing
  // cells while keeping already-correct (locked) crossing letters intact.
  function applyBoxAnswer(entry: PuzzleEntry, value: string) {
    const cells = getEntryCells(entry);
    const letters = getAnswerInputLetters(value, cells.length);

    if (
      letters.length > 0 &&
      gameplayAttemptTrackerRef.current.markFirstInput(
        `${puzzle.puzzleId}:${mission.attemptsUsed}`,
      )
    ) {
      telemetry.impression('first_answer_input', {
        ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
        attempt_number: mission.attemptsUsed,
      });
      // 게임 세부 지표: 첫 입력(참여 시작). 시작→첫입력 소요로 초반 이탈을 본다.
      gameAnalytics.track('game_first_input', getGamePuzzleContext(puzzle), {
        timeToFirstInputSec: getElapsedSeconds(
          mission.lastStartedAt,
          undefined,
          mission,
        ),
        attemptNumber: mission.attemptsUsed,
      });
      completeFirstInputGuide();
    }

    const nextValues = { ...cellValues };
    cells.forEach((cell, index) => {
      const key = getCellKey(cell.row, cell.col);
      const letter = letters[index];
      if (letter == null) {
        if (!isCellLocked(puzzle, cellValues, key)) {
          delete nextValues[key];
        }
      } else {
        nextValues[key] = letter;
      }
    });

    setCellValues(nextValues);

    // No auto-advance in box mode: moving to the next entry would change the box
    // key and remount the TextInput mid-IME-composition (Android drops the last
    // composing Hangul syllable and focus escapes). The player advances with the
    // next-clue control or the keyboard's "next" key instead.
  }

  function clearSelectedAnswer() {
    if (selectedEntry == null) {
      return;
    }

    // Drop any in-flight IME draft / queued commit so a stale answerInputValue
    // can't re-apply letters right after the clear (the caret may already sit on
    // the entry start cell, so the reset effect won't fire on its own).
    clearAnswerCommitTimer();
    setAnswerInputValue('');
    // Remount the box input so it reflects the cleared cells.
    setAnswerBoxResetKey(previous => previous + 1);

    setCellValues(previous => {
      const nextValues = { ...previous };
      getEntryCells(selectedEntry).forEach(cell => {
        const key = getCellKey(cell.row, cell.col);
        // Leave already-correct (locked) letters so a wrong-cell wipe keeps them.
        if (!isCellLocked(puzzle, previous, key)) {
          delete nextValues[key];
        }
      });
      return nextValues;
    });
    setSelectedCellKey(getCellKey(selectedEntry.row, selectedEntry.col));
    setNotice('정답이 아닌 칸을 비웠습니다.');
  }

  function revealLetter() {
    if (selectedEntry == null) {
      return;
    }

    if (remainingHintCredits === 0) {
      // [#381] attempt() 예외는 runRewardedHintAdFlow 안에서 정규화되지만,
      // 요청 진입점 자체가 미처리 rejection을 남기지 않도록 방어적으로 처리한다.
      requestRewardedHintCredits().catch(() => {});
      return;
    }

    const cells = getEntryCells(selectedEntry);
    const answerLetters = [...selectedEntry.answer];
    const targetIndex = pickHintCellIndex(
      selectedEntry,
      cellValues,
      viewModel.cellEntries,
    );

    if (targetIndex === -1) {
      setNotice('선택한 단어는 이미 모두 채워졌습니다.');
      return;
    }

    const targetCell = cells[targetIndex];
    const targetKey = getCellKey(targetCell.row, targetCell.col);
    const nextWallet = consumeDailyHintCredit(
      activeDailyHintWallet,
      launchConfig.dailyFreeHintCredits,
    );
    if (nextWallet == null) {
      setNotice('오늘의 무료 힌트를 모두 사용했습니다.');
      return;
    }
    persistDailyHintWallet(nextWallet);
    const nextValues = {
      ...cellValues,
      [targetKey]: answerLetters[targetIndex],
    };

    telemetry.click('hint_reveal', {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      hint_count: hintCount + 1,
      remaining_hint_credits: remainingHintCredits - 1,
    });
    // 게임 세부 지표: 힌트 사용(콘텐츠 난이도 체감 신호).
    gameAnalytics.track('game_hint_use', getGamePuzzleContext(puzzle), {
      hintType: 'hint',
      hintRemainingAfter: remainingHintCredits - 1,
    });
    setHintCount(previous => previous + 1);
    setCellValues(nextValues);
    setSelectedCellKey(targetKey);
    setNotice(
      `힌트 1개를 사용했습니다. 남은 힌트 ${remainingHintCredits - 1}개`,
    );

    if (
      getEntryAnswerValue(selectedEntry, nextValues) === selectedEntry.answer
    ) {
      moveToNextUncompletedEntry(selectedEntry, nextValues, targetKey);
    }
  }

  function acceptFirstInputNudge() {
    hideStuckHintPrompt();
    telemetry.click(STUCK_HINT_PROMPT_ACCEPT_EVENT, {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      attempt_number: mission.attemptsUsed,
      progress_percent: progressPercent,
      remaining_hint_credits: remainingHintCredits,
      trigger: 'first_input',
      near_finish: false,
      words_remaining: stuckHintShownWordsRemaining,
    });
    const starter = resolveStarterCell({ cellValues, puzzle });
    if (starter == null) {
      return;
    }
    const entry = puzzle.entries.find(item => item.id === starter.entryId);
    if (entry != null) {
      selectEntry(entry, starter.cellKey);
      focusBoardInput(starter.cellKey);
    }
  }

  function acceptStuckHintPrompt() {
    hideStuckHintPrompt();
    telemetry.click(STUCK_HINT_PROMPT_ACCEPT_EVENT, {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      attempt_number: mission.attemptsUsed,
      progress_percent: progressPercent,
      remaining_hint_credits: remainingHintCredits,
      trigger: stuckHintTrigger,
      near_finish: isStuckHintNearFinish,
      words_remaining: stuckHintShownWordsRemaining,
    });
    revealLetter();
  }

  function acceptNearFinishNudge() {
    hideStuckHintPrompt();
    telemetry.click(STUCK_HINT_PROMPT_ACCEPT_EVENT, {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      attempt_number: mission.attemptsUsed,
      progress_percent: progressPercent,
      remaining_hint_credits: remainingHintCredits,
      trigger: stuckHintTrigger,
      near_finish: true,
      words_remaining: stuckHintShownWordsRemaining,
    });
    const entry = getFirstIncompleteEntry(puzzle.entries, cellValues);
    if (entry != null) {
      selectEntry(entry);
      focusBoardInput(getEntryStartCellKey(entry));
    }
  }

  function dismissStuckHintPrompt() {
    dismissStuckHintPromptCta();
    telemetry.click(STUCK_HINT_PROMPT_DISMISS_EVENT, {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      attempt_number: mission.attemptsUsed,
      progress_percent: progressPercent,
      trigger: stuckHintTrigger,
      near_finish: isStuckHintNearFinish,
      words_remaining: stuckHintShownWordsRemaining,
    });
  }

  function clearProgress() {
    setCellValues({});
    setHintCount(0);
    setSelectedDirection('across');
    setSelectedEntryId(getInitialEntryId(puzzle));
    setSelectedCellKey(getInitialEntryStartCellKey(puzzle));
    setNotice('진행 상황을 초기화했습니다.');
    clearStoredProgress(puzzle.puzzleId);
  }

  function clearAnswerCell(entry: PuzzleEntry, cellKey = selectedCellKey) {
    const selectedIndex = getEntryCellIndex(entry, cellKey);
    const targetIndex = getClearAnswerTargetIndex(
      puzzle,
      entry,
      cellValues,
      selectedIndex,
    );

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
    setNotice('선택한 칸을 비웠습니다.');
  }

  function commitBoardInputValue(
    value: string,
    startCellKey = activeAnswerCellKey,
  ) {
    if (selectedEntry == null) {
      return;
    }

    clearAnswerCommitTimer();
    const remainingCellCount =
      selectedEntryCells.length -
      getEntryCellIndex(selectedEntry, startCellKey);
    const nextLetters = getAnswerCommitLetters(value, remainingCellCount);

    if (nextLetters.length === 0) {
      return;
    }

    applyAnswerSegment(selectedEntry, nextLetters.join(''), startCellKey);
    setAnswerInputValue('');
  }

  function queueBoardInputValue(
    value: string,
    startCellKey = activeAnswerCellKey,
  ) {
    if (selectedEntry == null) {
      return;
    }

    clearAnswerCommitTimer();

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

    answerCommitTimerRef.current = setTimeout(() => {
      commitBoardInputValue(value, startCellKey);
    }, getAnswerCommitDelayMs(value));
  }

  function handleBoardInputChange(value: string) {
    setAnswerInputValue(value);
    queueBoardInputValue(value);
  }

  function startOrResumeMission() {
    if (isLoading) {
      return;
    }

    if (isCompleted) {
      navigateTo('result');
      return;
    }

    if (!hasStarted) {
      if (remainingAttempts === 0) {
        setNotice('오늘 시도 기회를 모두 사용했습니다.');
        return;
      }

      setMission(
        startMissionForPuzzle(puzzle, mission, selectedPuzzleSummary),
      );
    }

    navigateTo('today');
  }

  // 첫 시도 시작 공통 로직. 홈 주 CTA(현재 퍼즐)와 사다리 단계 탭(다른 퍼즐 로드 후
  // 즉시 시작)이 같은 mission_start/attempt_start/game_puzzle_start 계약을 공유한다.
  function startMissionForPuzzle(
    targetPuzzle: Puzzle,
    baseMission: MissionState,
    summary: PuzzleManifestItem | undefined,
  ): MissionState {
    // 새 시도는 새 타이머다 — 이전 정지 누적을 이어받지 않는다(웹과 동일 규칙).
    const nextMission: MissionState = {
      ...startMissionAttempt(baseMission),
      pausedMs: 0,
      pausedAt: null,
    };
    saveStoredMission(nextMission);
    savePuzzleSnapshot(targetPuzzle, { startedAt: nextMission.lastStartedAt });
    telemetry.impression('mission_start', {
      ...getPuzzleTelemetryParams(targetPuzzle, summary),
      attempt_number: nextMission.attemptsUsed,
      remaining_attempts: getRemainingAttempts(nextMission),
    });
    telemetry.impression('attempt_start', {
      ...getPuzzleTelemetryParams(targetPuzzle, summary),
      attempt_number: nextMission.attemptsUsed,
      remaining_attempts: getRemainingAttempts(nextMission),
    });
    // 게임 세부 지표: 시도 시작(완료 퍼널 시작점, 마켓 차원 포함).
    gameAnalytics.track('game_puzzle_start', getGamePuzzleContext(targetPuzzle), {
      attemptKind: 'first',
      attemptNumber: nextMission.attemptsUsed,
    });
    return nextMission;
  }

  // 홈 사다리 단계 탭·하단 CTA. 단계의 퍼즐을 로드해 바로 시작(필요 시 첫 시도)하고
  // 풀이 화면으로 간다. 완료 판은 결과 화면으로 간다. 웹 startLadderStep과 같은
  // home_quick_start(source=ladder_step_N) 계측을 남긴다.
  async function startLadderStep(step: DailyLadderStep) {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    const session = await loadPuzzleSession(step.puzzleId, puzzlePack);
    if (session == null) {
      setIsLoading(false);
      setNotice('퍼즐 데이터를 찾을 수 없습니다.');
      telemetry.click(HOME_QUICK_START_EVENT, {
        puzzle_id: step.puzzleId,
        ...buildDailyLadderCtaParams(step),
        status: 'missing',
      });
      return;
    }

    const summary = findPuzzleSummaryById(
      puzzlePack.summaries,
      session.nextPuzzle.puzzleId,
    );
    const alreadyStarted =
      session.savedMission.attemptsUsed > 0 ||
      Object.keys(session.savedProgress.cellValues).length > 0 ||
      session.savedProgress.hintCount > 0;
    let nextMission = session.savedMission;
    if (
      !alreadyStarted &&
      nextMission.completedAt == null &&
      getRemainingAttempts(nextMission) > 0
    ) {
      nextMission = startMissionForPuzzle(
        session.nextPuzzle,
        nextMission,
        summary,
      );
    }

    applyPuzzleSession({ ...session, savedMission: nextMission });
    setIsLoading(false);
    telemetry.click(HOME_QUICK_START_EVENT, {
      ...getPuzzleTelemetryParams(session.nextPuzzle, summary),
      ...buildDailyLadderCtaParams(step),
      status: 'loaded',
    });
    // 완료했거나 도전 기회를 모두 써 더 풀 수 없는 판은 결과 화면으로 보낸다(이전 홈
    // CTA와 동일). 풀이 화면은 읽기 전용이라 결과 동선이 없다.
    const isExhausted =
      nextMission.completedAt == null &&
      alreadyStarted &&
      getRemainingAttempts(nextMission) === 0;
    navigateTo(
      nextMission.completedAt != null || isExhausted ? 'result' : 'today',
    );
  }

  function restartMissionAttempt() {
    if (remainingAttempts === 0 || isCompleted) {
      setNotice('다시 풀 수 있는 시도 기회가 없습니다.');
      return;
    }

    clearProgress();
    // 새 시도는 새 타이머다 — 이전 정지 누적을 이어받지 않는다(웹과 동일 규칙).
    const nextMission: MissionState = {
      ...startMissionAttempt(mission),
      pausedMs: 0,
      pausedAt: null,
    };
    setMission(nextMission);
    saveStoredMission(nextMission);
    savePuzzleSnapshot(puzzle, { startedAt: nextMission.lastStartedAt });
    telemetry.impression('attempt_start', {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      attempt_number: nextMission.attemptsUsed,
      attempt_type: 'retry',
      remaining_attempts: getRemainingAttempts(nextMission),
    });
    // 게임 세부 지표: 시도 시작(재도전, 마켓 차원 포함).
    gameAnalytics.track('game_puzzle_start', getGamePuzzleContext(puzzle), {
      attemptKind: 'retry',
      attemptNumber: nextMission.attemptsUsed,
    });
    navigateTo('today');
  }

  function renderHeader(title: string, subtitle?: string) {
    return (
      <View style={styles.header}>
        <View style={styles.headerText}>
          {subtitle != null ? (
            <Text style={styles.eyebrow}>{subtitle}</Text>
          ) : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.progressBadge}>
          <Text style={styles.progressValue}>{progressPercent}%</Text>
          <Text style={styles.progressLabel}>완료</Text>
        </View>
      </View>
    );
  }

  function renderWeeklyStreakStrip() {
    if (weeklyStrip.length === 0) {
      return null;
    }
    const nudge = getStreakMilestoneProgress(consecutiveStreak);
    return (
      <View
        accessible
        accessibilityLabel="최근 7일 연속 기록"
        style={styles.weeklyStreakStrip}
      >
        <Text style={styles.weeklyStreakHeadline}>
          {formatStreakStripHeadline(consecutiveStreak, todayCompleted)}
        </Text>
        <View style={styles.weeklyStreakDays}>
          {weeklyStrip.map(day => (
            <View
              key={day.date}
              accessibilityLabel={`${day.date} ${day.completed ? '완료' : '미완료'}${day.isToday ? ' · 오늘' : ''}`}
              style={styles.weeklyStreakDay}
            >
              <Text
                style={[
                  styles.weeklyStreakDayLabel,
                  day.isToday ? styles.weeklyStreakDayLabelToday : null,
                ]}
              >
                {day.weekdayLabel}
              </Text>
              <View
                style={[
                  styles.weeklyStreakDayDot,
                  day.completed ? styles.weeklyStreakDayDotDone : null,
                  day.isToday ? styles.weeklyStreakDayDotToday : null,
                ]}
              >
                <Text style={styles.weeklyStreakDayDotText}>
                  {day.completed ? '✓' : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
        {nudge != null ? (
          <Text style={styles.weeklyStreakNudge}>{nudge}</Text>
        ) : null}
      </View>
    );
  }

  // 오늘의 사다리(워밍업 → 오늘의 퍼즐). 병렬 난이도 선택 대신 두 단계를 한 흐름으로
  // 보이고, 다음 단계를 강조한다. 단계를 누르면 바로 시작한다(웹 DailyLadderCard와 동일).
  function renderDailyLadder() {
    if (dailyLadder.steps.length === 0) {
      return null;
    }
    const ctaStepId =
      dailyLadder.cta.kind === 'start' || dailyLadder.cta.kind === 'resume'
        ? dailyLadder.cta.step.puzzleId
        : null;
    return (
      <View style={styles.dailyLadder}>
        {dailyLadder.steps.map(step => {
          const isNext = step.puzzleId === ctaStepId;
          const isSelected = step.puzzleId === puzzle.puzzleId;
          return (
            <Pressable
              key={step.puzzleId}
              accessibilityLabel={`${step.label} ${step.statusLabel}${isNext ? ' 다음 단계' : ''}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => {
                void startLadderStep(step);
              }}
              style={[
                styles.dailyLadderStep,
                isNext ? styles.dailyLadderStepNext : null,
                step.status === 'done' ? styles.dailyLadderStepDone : null,
              ]}
            >
              <View
                style={[
                  styles.dailyLadderStepIndex,
                  isNext || step.status === 'done'
                    ? styles.dailyLadderStepIndexActive
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.dailyLadderStepIndexText,
                    isNext || step.status === 'done'
                      ? styles.dailyLadderStepIndexTextActive
                      : null,
                  ]}
                >
                  {step.status === 'done' ? '✓' : String(step.step)}
                </Text>
              </View>
              <View style={styles.dailyLadderStepBody}>
                <Text style={styles.dailyLadderStepTitle}>{step.label}</Text>
                <Text
                  style={[
                    styles.dailyLadderStepStatus,
                    isNext ? styles.dailyLadderStepStatusNext : null,
                  ]}
                >
                  {isNext ? `${step.statusLabel} · 다음 단계` : step.statusLabel}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderSelectedPuzzleScaffold() {
    return (
      <View
        accessible
        accessibilityLabel={`선택한 ${formatDifficultyLabel(puzzle.difficulty)} 난이도 ${puzzle.gridSize} 곱하기 ${puzzle.gridSize} 퍼즐판 미리보기`}
        style={styles.selectedPuzzleScaffold}
      >
        <View style={styles.puzzleScaffoldHeader}>
          <Text style={styles.puzzleScaffoldTitle}>선택한 퍼즐판</Text>
          <Text style={styles.puzzleScaffoldMeta}>
            {puzzle.difficulty === 'easy' || puzzle.difficulty === 'hard'
              ? formatDailyLadderStepLabel(puzzle.difficulty)
              : `${formatDifficultyLabel(puzzle.difficulty)} · ${puzzle.gridSize}×${puzzle.gridSize}`}
          </Text>
        </View>
        <View style={styles.puzzleScaffoldBoard}>
          {puzzle.grid.map((row, rowIndex) => (
            <View
              key={`scaffold-row-${rowIndex}`}
              style={styles.puzzleScaffoldRow}
            >
              {row.map((cell, colIndex) => (
                <View
                  key={`scaffold-cell-${rowIndex}-${colIndex}`}
                  style={[
                    styles.puzzleScaffoldCell,
                    cell === '' ? styles.puzzleScaffoldBlock : null,
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
    );
  }

  // 오늘/과거에 시작했지만 끝내지 못한 퍼즐을 로컬 아카이브에서 모아 보여준다.
  function renderResume() {
    const incomplete = puzzleArchiveRecords.filter(record => {
      const state = dateCardStates[record.puzzleId];
      const isCompleted =
        record.completedAt != null || state?.completedAt != null;
      const hasStarted =
        record.startedAt != null ||
        (state?.attemptsUsed ?? 0) > 0 ||
        state?.hasProgress === true;
      return !isCompleted && hasStarted;
    });
    return (
      <ScrollView contentContainerStyle={styles.homeContent}>
        {renderHeader('이어 풀기', `못 끝낸 퍼즐 ${incomplete.length}개`)}
        {incomplete.length > 0 ? (
          incomplete.map(record => {
            const state = dateCardStates[record.puzzleId];
            const isExhausted =
              (state?.attemptsUsed ?? 0) >= DAILY_ATTEMPT_LIMIT;
            const summary = createPuzzleSummary(record.puzzle);
            return (
              <Pressable
                key={record.puzzleId}
                onPress={() => {
                  void selectPuzzle(record.puzzleId);
                  navigateTo(isExhausted ? 'result' : 'today');
                }}
                style={styles.summaryPanel}
              >
                <Text style={styles.panelTitle}>
                  {formatDifficultyLabel(summary.difficulty)} ·{' '}
                  {record.puzzle.gridSize}x{record.puzzle.gridSize}
                </Text>
                <Text style={styles.smallText}>
                  {record.puzzle.entries.length}개 단어 ·{' '}
                  {isExhausted ? '결과 보기' : '이어 풀기'} · 기기 저장 사본
                </Text>
              </Pressable>
            );
          })
        ) : (
          <View style={styles.summaryPanel}>
            <Text style={styles.smallText}>
              못 끝낸 퍼즐이 없어요. 오늘의 퍼즐을 풀어보세요.
            </Text>
          </View>
        )}
        <Pressable
          onPress={() => navigateTo('home')}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>홈으로</Text>
        </Pressable>
      </ScrollView>
    );
  }

  function renderHome() {
    const selectedPuzzleLabel = formatPuzzleHomeSubtitle(
      selectedPuzzleSummary,
      puzzlePack.source,
    );
    const selectedPuzzleSequenceLabel =
      puzzlePack.source === 'remote'
        ? formatPuzzleCardSequenceLabel(selectedPuzzleSummary)
        : '오늘의 무료 퍼즐';

    return (
      <ScrollView contentContainerStyle={styles.homeContent}>
        {renderHeader(HOME_HEADER_TITLE, selectedPuzzleLabel)}
        {renderWeeklyStreakStrip()}
        {renderDailyLadder()}
        {renderSelectedPuzzleScaffold()}

        <View style={styles.summaryPanel}>
          <Text style={styles.panelTitle}>{selectedPuzzleSequenceLabel}</Text>
          <Text style={styles.summaryText}>
            {puzzle.entries.length}개 단어 · {puzzle.gridSize}x{puzzle.gridSize}{' '}
            보드 ·{' '}
            {directionLabels[viewModel.selectedEntry?.direction ?? 'across']}{' '}
            힌트부터 시작
          </Text>
          <View style={styles.statusGrid}>
            <Metric
              label="시도"
              value={`${mission.attemptsUsed}/${DAILY_ATTEMPT_LIMIT}`}
            />
            <Metric
              label="오늘 힌트"
              value={`${remainingHintCredits}/${totalHintCredits}`}
            />
            <Metric
              label="완료 단어"
              value={`${viewModel.completedEntries.length}/${puzzle.entries.length}`}
            />
          </View>
          <View style={styles.actions}>
            {/* 주 CTA는 사다리의 다음 미완료 단계. 오늘 퍼즐이 없으면(번들 폴백)
                선택 퍼즐 기준 기존 CTA로 폴백한다(웹과 동일). */}
            {dailyLadder.cta.kind !== 'unavailable' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: dailyLadder.cta.kind === 'all_done',
                }}
                disabled={dailyLadder.cta.kind === 'all_done'}
                onPress={() => {
                  const cta = dailyLadder.cta;
                  if (cta.kind === 'start' || cta.kind === 'resume') {
                    void startLadderStep(cta.step);
                  }
                }}
                style={[
                  styles.primaryButton,
                  dailyLadder.cta.kind === 'all_done'
                    ? styles.primaryButtonDisabled
                    : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {dailyLadder.cta.label}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={
                  isAttemptExhaustedUncompleted
                    ? () => navigateTo('result')
                    : startOrResumeMission
                }
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>
                  {isAttemptExhaustedUncompleted
                    ? '결과 보기'
                    : hasStarted
                      ? '이어 풀기'
                      : '퍼즐 시작'}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => navigateTo('resume')}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>못 끝낸 퍼즐</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`기록${
                formatMissionHistoryCardSummary({
                  consecutiveStreak,
                  fastestBestTimeMs: getOverallBestTimeMs(bestTimes),
                }) == null
                  ? ''
                  : ` · ${formatMissionHistoryCardSummary({
                      consecutiveStreak,
                      fastestBestTimeMs: getOverallBestTimeMs(bestTimes),
                    })}`
              }`}
              onPress={() => {
                telemetry.click('history_open', { source: 'home_card' });
                navigateTo('history');
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>기록</Text>
            </Pressable>
          </View>
          <Text style={styles.notice}>{notice}</Text>
        </View>

        <View style={styles.previewPanel}>
          <Text style={styles.panelTitle}>첫 힌트</Text>
          <Text style={styles.cluePreview}>
            {viewModel.selectedEntry?.clue ?? '퍼즐 힌트가 없습니다.'}
          </Text>
          <Text style={styles.smallText}>
            일부 힌트는 국립국어원 한국어기초사전 뜻풀이를 바탕으로
            구성했습니다.
          </Text>
          <Text style={styles.smallText}>
            {puzzlePack.source === 'remote'
              ? '원격 퍼즐팩 기준'
              : '기본 퍼즐팩 기준'}
            {puzzlePack.generatedAt != null
              ? ` · ${puzzlePack.generatedAt}`
              : ''}
          </Text>
        </View>
      </ScrollView>
    );
  }

  function renderBoard() {
    return (
      <View style={styles.boardFrame}>
        <View style={styles.board}>
          {viewModel.rows.map(row => (
            <View key={row} style={styles.boardRow}>
              {viewModel.cols.map(col => {
                const key = getCellKey(row, col);
                const cell = puzzle.grid[row]?.[col] ?? '';
                const isBlock = cell === '';
                const isSelected = activeAnswerCellKey === key;
                const isInSelectedEntry = viewModel.selectedCells.has(key);
                const startLabel = viewModel.startLabels.get(key);
                const isCompletedCell = completedCellKeys.has(key);
                const pendingValue = pendingAnswerCellValues[key] ?? '';
                const committedValue = cellValues[key];
                const displayValue =
                  pendingValue !== '' ? pendingValue : (committedValue ?? '');
                // Pending IME text is temporary, so only committed letters get
                // right/wrong styling.
                const isCorrect =
                  pendingValue === '' &&
                  committedValue != null &&
                  committedValue === cell;
                const isWrong =
                  pendingValue === '' &&
                  committedValue != null &&
                  committedValue !== cell;

                return (
                  <Pressable
                    accessibilityLabel={
                      isBlock
                        ? undefined
                        : `${row + 1}행 ${col + 1}열${
                            isWrong
                              ? ' 오답'
                              : isCompletedCell
                                ? ' 정답 완료'
                                : isCorrect
                                  ? ' 정답 잠금'
                                  : ''
                          }`
                    }
                    accessibilityRole="button"
                    disabled={isBlock}
                    key={key}
                    onPress={() => selectCell(row, col)}
                    style={[
                      styles.cell,
                      { height: boardCellSize, width: boardCellSize },
                      isBlock && styles.cellBlock,
                      isCompletedCell && styles.cellCompleted,
                      isInSelectedEntry && styles.cellActive,
                      pendingValue !== '' && styles.cellPending,
                      isCorrect && !isCompletedCell && styles.cellCorrect,
                      isWrong && styles.cellWrong,
                      isSelected && styles.cellSelected,
                    ]}
                  >
                    {!isBlock && startLabel != null ? (
                      <Text style={styles.cellNumber}>{startLabel}</Text>
                    ) : null}
                    {!isBlock ? (
                      <Text
                        style={[
                          styles.cellLetter,
                          isCorrect && styles.cellLetterCorrect,
                          isWrong && styles.cellLetterWrong,
                        ]}
                      >
                        {displayValue}
                      </Text>
                    ) : null}
                    {isCorrect && !isCompletedCell ? (
                      <View style={styles.cellLockMark} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        {answerInputMode === 'cell' ? (
          <TextInput
            accessible={false}
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            caretHidden
            contextMenuHidden
            editable={!isReviewMode}
            importantForAccessibility="no-hide-descendants"
            importantForAutofill="no"
            onChangeText={handleBoardInputChange}
            onEndEditing={event => {
              commitBoardInputValue(event.nativeEvent.text);
            }}
            onKeyPress={event => {
              if (
                event.nativeEvent.key === 'Backspace' &&
                answerInputValue === '' &&
                selectedEntry != null
              ) {
                clearAnswerCell(selectedEntry, activeAnswerCellKey);
              }
            }}
            onSubmitEditing={() => {
              commitBoardInputValue(answerInputValue);
              focusBoardInput();
            }}
            pointerEvents="none"
            ref={boardInputRef}
            returnKeyType="next"
            selectionColor="transparent"
            showSoftInputOnFocus
            style={[styles.boardNativeInput, boardNativeInputPosition]}
            underlineColorAndroid="transparent"
            value={answerInputValue}
          />
        ) : null}
      </View>
    );
  }

  function renderSelectedClues() {
    if (selectedEntry == null || selectedCellKey === '') {
      return null;
    }

    const entries =
      viewModel.cellEntries.get(selectedCellKey)?.filter(Boolean) ?? [];
    const entriesWithSelected = entries.some(
      entry => entry.id === selectedEntry.id,
    )
      ? entries
      : [...entries, selectedEntry];

    return (
      <View style={styles.selectedClueList}>
        {[...entriesWithSelected]
          .sort(
            (left, right) =>
              (left.direction === 'across' ? 0 : 1) -
              (right.direction === 'across' ? 0 : 1),
          )
          .map(entry => {
            const isSelected = entry.id === selectedEntry.id;
            const startLabel = viewModel.startLabels.get(
              getCellKey(entry.row, entry.col),
            );

            return (
              <Pressable
                accessibilityRole="button"
                key={entry.id}
                onPress={() => {
                  selectEntry(entry, selectedCellKey);
                  focusBoardInput(selectedCellKey);
                }}
                style={[
                  styles.selectedClue,
                  isSelected && styles.selectedClueActive,
                ]}
              >
                <Text style={styles.selectedClueMeta}>
                  {startLabel == null ? '' : `${startLabel}번 `}
                  {directionLabels[entry.direction]} · {entry.answer.length}글자
                </Text>
                <Text style={styles.selectedClueText}>{entry.clue}</Text>
              </Pressable>
            );
          })}
      </View>
    );
  }

  function renderTodayHeader() {
    const isHintAdBusy = rewardedAdPlacement === 'rewardedHint';
    const hintBadgeLabel = isHintAdBusy
      ? '…'
      : remainingHintCredits > 0
        ? `${remainingHintCredits}`
        : launchConfig.rewardedHintAdsEnabled
          ? '+'
          : '0';

    return (
      <View style={styles.solveHeader}>
        <Pressable
          accessibilityLabel="홈으로"
          accessibilityRole="button"
          onPress={() => navigateTo('home')}
          style={styles.solveHeaderIcon}
        >
          <Text style={styles.solveHeaderIconText}>홈</Text>
        </Pressable>
        <View style={styles.solveHeaderText}>
          <Text style={styles.solveHeaderEyebrow}>
            {isReviewMode
              ? `다 푼 퍼즐 · ${
                  puzzlePack.source === 'remote'
                    ? formatPuzzleAliasLabel(selectedPuzzleSummary)
                    : puzzle.date
                }`
              : puzzlePack.source === 'remote'
                ? formatPuzzleAliasLabel(selectedPuzzleSummary)
                : puzzle.date}
          </Text>
          <Text style={styles.solveHeaderTitle}>
            {viewModel.completedEntries.length}/{puzzle.entries.length} 낱말
          </Text>
        </View>
        {isReviewMode ? null : (
          <>
            <Pressable
              accessibilityLabel={
                isHintAdBusy
                  ? '광고 준비 중'
                  : remainingHintCredits > 0
                    ? `힌트 ${remainingHintCredits}개 남음`
                    : launchConfig.rewardedHintAdsEnabled
                      ? `힌트 얻기. 광고를 보고 ${launchConfig.rewardedHintCredits}개 받기`
                      : '힌트 없음'
              }
              accessibilityRole="button"
              onPress={revealLetter}
              style={[
                styles.solveHeaderIcon,
                remainingHintCredits === 0 && styles.solveHeaderIconMuted,
              ]}
            >
              <Text style={styles.solveHeaderIconEmoji}>💡</Text>
              <View style={styles.iconBadge}>
                <Text style={styles.iconBadgeText}>{hintBadgeLabel}</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityLabel={
                answerInputMode === 'box'
                  ? '입력 방식: 입력창 (탭하여 칸별로 전환)'
                  : '입력 방식: 칸별 (탭하여 입력창으로 전환)'
              }
              accessibilityRole="button"
              accessibilityState={{ selected: answerInputMode === 'cell' }}
              onPress={() =>
                selectAnswerInputMode(
                  answerInputMode === 'box' ? 'cell' : 'box',
                )
              }
              style={styles.solveHeaderIcon}
            >
              <InputModeIcon mode={answerInputMode} />
            </Pressable>
            <Pressable
              accessibilityLabel="지우기"
              accessibilityRole="button"
              onPress={clearSelectedAnswer}
              style={styles.solveHeaderIcon}
            >
              <EraserIcon />
            </Pressable>
          </>
        )}
        <Pressable
          accessibilityLabel="전체 문제 보기"
          accessibilityRole="button"
          onPress={() => setIsClueListOpen(true)}
          style={styles.solveHeaderIcon}
        >
          <Text style={styles.solveHeaderIconEmoji}>☰</Text>
        </Pressable>
      </View>
    );
  }

  // Sticky clue + answer-progress bar keeps the question and the letters being
  // typed visible above the on-screen keyboard while solving.
  function renderSolveClueBar() {
    if (selectedEntry == null) {
      return null;
    }

    const slotCount = answerSlots.length;

    return (
      <View style={styles.solveClueBar}>
        <View style={styles.solveClueRow}>
          <Pressable
            accessibilityLabel="이전 문제"
            accessibilityRole="button"
            disabled={orderedEntries.length < 2}
            onPress={() => goToAdjacentClue(-1)}
            style={styles.clueNavButton}
          >
            <Text style={styles.clueNavText}>‹</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`${formatEntryReference(
              selectedEntry,
              viewModel.startLabels,
            )} ${selectedEntry.clue}${isSelectedComplete ? ' 완료' : ''}`}
            accessibilityRole="button"
            onPress={() => {
              selectEntry(selectedEntry, activeAnswerCellKey);
              focusBoardInput(activeAnswerCellKey);
            }}
            style={styles.solveClueInfo}
          >
            <Text numberOfLines={2} style={styles.solveClueText}>
              {selectedEntry.clue}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="다음 문제"
            accessibilityRole="button"
            disabled={orderedEntries.length < 2}
            onPress={() => goToAdjacentClue(1)}
            style={styles.clueNavButton}
          >
            <Text style={styles.clueNavText}>›</Text>
          </Pressable>
        </View>
        {answerInputMode === 'cell' || isReviewMode ? (
          <View style={styles.answerSlots}>
            {answerSlots.map((slot, index) => (
              <Pressable
                accessibilityLabel={`${index + 1}/${slotCount}번째 칸${
                  slot.value === ''
                    ? ', 빈 칸'
                    : `, ${slot.value}${
                        slot.isLocked
                          ? ' 정답 잠금'
                          : slot.isWrong
                            ? ' 오답'
                            : ''
                      }`
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected: slot.isActive }}
                key={slot.key}
                onPress={() => {
                  selectEntry(selectedEntry, slot.key);
                  focusBoardInput(slot.key);
                }}
                style={[
                  styles.answerSlot,
                  slot.isActive && styles.answerSlotActive,
                  slot.isPending && styles.answerSlotPending,
                  slot.isLocked && styles.answerSlotLocked,
                  slot.isWrong && styles.answerSlotWrong,
                ]}
              >
                <Text
                  style={[
                    styles.answerSlotText,
                    slot.isLocked && styles.answerSlotTextLocked,
                    slot.isWrong && styles.answerSlotTextWrong,
                  ]}
                >
                  {slot.value}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <TextInput
            ref={boxInputRef}
            key={`answer-box-${selectedEntry.id}-${answerBoxResetKey}-${hintCount}`}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isReviewMode}
            // maxLength를 글자 수와 같게 두면, 마지막 칸을 조합할 때 자음 하나가
            // 들어가는 순간 한도에 도달해 iOS가 뒤이은 모음 입력을 막아 마지막
            // 글자가 완성되지 않는다. 조합 여유분(+1)을 두고, 실제 반영은
            // applyBoxAnswer가 글자 수만큼 잘라 처리한다.
            maxLength={selectedEntryCells.length + 1}
            onChangeText={text => applyBoxAnswer(selectedEntry, text)}
            // iOS는 마지막 글자를 IME 조합 중인 상태에서 필드가 blur되면(다음
            // 문항 이동/제출) 최종 onChangeText를 발화하지 않아 마지막 글자가
            // 유실된다. 편집 종료·blur 시점에 실제 텍스트를 다시 반영(flush)한다.
            onEndEditing={event =>
              applyBoxAnswer(selectedEntry, event.nativeEvent.text)
            }
            onSubmitEditing={() => goToAdjacentClue(1)}
            placeholder={`${selectedEntryCells.length}글자 입력`}
            placeholderTextColor="#b0b8c1"
            returnKeyType="next"
            style={styles.answerBoxInput}
          />
        )}
        {notice === '' ? null : (
          <Text style={styles.solveNotice}>{notice}</Text>
        )}
      </View>
    );
  }

  function renderClueListModal() {
    const completedIds = new Set(
      viewModel.completedEntries.map(entry => entry.id),
    );

    return (
      <Modal
        animationType="slide"
        onRequestClose={() => setIsClueListOpen(false)}
        visible={isClueListOpen}
      >
        <SafeAreaView edges={['top', 'bottom']} style={styles.clueModal}>
          <View style={styles.clueModalHeader}>
            <Text style={styles.clueModalTitle}>
              전체 문제 {puzzle.entries.length}개
            </Text>
            <Pressable
              accessibilityLabel="닫기"
              accessibilityRole="button"
              onPress={() => setIsClueListOpen(false)}
              style={styles.solveHeaderIcon}
            >
              <Text style={styles.solveHeaderIconText}>닫기</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.clueModalList}>
            {(['across', 'down'] as Direction[]).map(direction => (
              <View key={direction} style={styles.clueSection}>
                <Text style={styles.clueSectionTitle}>
                  {directionLabels[direction]}
                </Text>
                {puzzle.entries
                  .filter(entry => entry.direction === direction)
                  .map(entry => {
                    const startLabel = viewModel.startLabels.get(
                      getCellKey(entry.row, entry.col),
                    );
                    const isSelected = entry.id === viewModel.selectedEntry?.id;
                    const isDone = completedIds.has(entry.id);

                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={entry.id}
                        onPress={() => {
                          selectEntry(entry);
                          setIsClueListOpen(false);
                          focusBoardInput(getEntryStartCellKey(entry));
                        }}
                        style={[
                          styles.clueItem,
                          isSelected && styles.clueItemSelected,
                          isDone && styles.clueItemCompleted,
                        ]}
                      >
                        <Text style={styles.clueItemNumber}>{startLabel}</Text>
                        <Text style={styles.clueItemText}>{entry.clue}</Text>
                        {isDone ? (
                          <Text style={styles.clueDoneBadge}>완료</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  function renderCompletedReviewPanel() {
    if (!isCompleted) {
      return null;
    }

    return (
      <View style={styles.completedReviewPanel}>
        <View style={styles.completedReviewText}>
          <Text style={styles.completedReviewTitle}>정답판 확인 중</Text>
          <Text style={styles.completedReviewDescription}>
            맞춘 낱말을 확인한 뒤 결과 화면으로 이동할 수 있습니다.
          </Text>
        </View>
        <Pressable onPress={openCompletedResult} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>결과 보기</Text>
        </Pressable>
      </View>
    );
  }

  function renderCompletionCelebrationModal() {
    const isVisible = completionCelebrationPuzzleId === puzzle.puzzleId;
    const preprompt = isVisible ? returnReminderPreprompt : null;
    const achievements = getCompletionAchievements({
      hintCount,
      attemptsUsed: mission.attemptsUsed,
      revealUsed: false,
    });
    const streakBadge = getStreakBadgeLabel(consecutiveStreak);
    const elapsedLabel =
      isVisible && mission.lastStartedAt != null && mission.completedAt != null
        ? formatElapsedTime(
            mission.lastStartedAt,
            mission.completedAt,
            mission.pausedMs,
          )
        : null;
    const shareGrid = isVisible ? buildShareGrid(puzzle, cellValues) : '';
    const shareText = isVisible
      ? buildMobileShareText({
          puzzle,
          cellValues,
          puzzleLabel: formatPuzzleAliasLabel(selectedPuzzleSummary),
          elapsedLabel,
          hintCount,
          attemptsUsed: mission.attemptsUsed,
          completedCount: viewModel.completedEntries.length,
          totalCount: puzzle.entries.length,
          consecutiveStreak,
          isComplete: true,
          revealUsed: false,
        })
      : '';

    return (
      <Modal
        animationType="fade"
        onRequestClose={() => setCompletionCelebrationPuzzleId(null)}
        transparent
        visible={isVisible}
      >
        <View style={styles.completionModalOverlay}>
          <View
            accessibilityLabel="퍼즐 완료 안내"
            accessibilityRole="alert"
            style={styles.completionDialog}
          >
            <View style={styles.completionDialogBadge}>
              <Text style={styles.completionDialogBadgeText}>완료</Text>
            </View>
            <View style={styles.completionDialogText}>
              <Text style={styles.completionDialogTitle}>
                퍼즐을 완성했습니다
              </Text>
              <Text style={styles.completionDialogDescription}>
                낱말 {viewModel.completedEntries.length}/{puzzle.entries.length}
                개를 모두 맞췄습니다
                {hintCount > 0 ? ` · 힌트 ${hintCount}개 사용` : ''}.
              </Text>
              {elapsedLabel != null && (
                <Text style={styles.completionDialogElapsedLabel}>
                  ⏱ {elapsedLabel}
                </Text>
              )}
              <ShareGridPreview shareGrid={shareGrid} />
              {(isNewBestTime ||
                achievements.noHint ||
                achievements.firstTry ||
                streakBadge != null) && (
                <View style={styles.completionAchievements}>
                  {isNewBestTime && (
                    <Text
                      style={[
                        styles.completionAchievementBadge,
                        styles.completionAchievementBadgeBest,
                      ]}
                    >
                      🏆 최고 기록 갱신!
                    </Text>
                  )}
                  {achievements.noHint && (
                    <Text style={styles.completionAchievementBadge}>
                      🎯 노힌트 클리어
                    </Text>
                  )}
                  {achievements.firstTry && (
                    <Text style={styles.completionAchievementBadge}>
                      💎 첫 도전 성공
                    </Text>
                  )}
                  {streakBadge != null && (
                    <Text style={styles.completionAchievementBadge}>
                      {streakBadge}
                    </Text>
                  )}
                </View>
              )}
              {getNextStreakMilestoneHint(consecutiveStreak) != null && (
                <Text style={styles.streakNudge}>
                  {getNextStreakMilestoneHint(consecutiveStreak)}
                </Text>
              )}
              {preprompt != null && (
                <View
                  accessibilityLabel="복귀 알림 안내"
                  style={styles.returnReminderPreprompt}
                >
                  <Text style={styles.returnReminderPrepromptTitle}>
                    {RETURN_REMINDER_PREPROMPT_COPY.title}
                  </Text>
                  <Text style={styles.returnReminderPrepromptBody}>
                    {formatReturnReminderPrepromptBody(preprompt.streakDays)}
                  </Text>
                  <View style={styles.returnReminderPrepromptActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        acceptReturnReminder().catch(() => undefined);
                      }}
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryButtonText}>
                        {RETURN_REMINDER_PREPROMPT_COPY.accept}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        declineReturnReminder().catch(() => undefined);
                      }}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {RETURN_REMINDER_PREPROMPT_COPY.decline}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                shareResultText({
                  text: shareText,
                  surface: 'completion_dialog',
                  clickParams: {
                    puzzleId: puzzle.puzzleId,
                    difficulty: puzzle.difficulty,
                  },
                }).catch(() => undefined);
              }}
              style={styles.shareButton}
            >
              <Text style={styles.shareButtonText}>결과 공유하기</Text>
            </Pressable>
            {nextRecommendedSummary != null ? (
              <Pressable
                accessibilityLabel={nextRecommendedButtonLabel ?? '다음 퍼즐 풀기'}
                accessibilityRole="button"
                onPress={() => {
                  startNextRecommendedPuzzle('result_overlay').catch(
                    () => undefined,
                  );
                }}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>
                  {nextRecommendedButtonLabel ?? '다음 퍼즐 풀기'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityLabel="퍼즐 기록 보기"
                accessibilityRole="button"
                onPress={() => {
                  telemetry.click('history_open', { source: 'completion_dialog' });
                  setCompletionCelebrationPuzzleId(null);
                  navigateTo('history');
                }}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>퍼즐 기록 보기</Text>
              </Pressable>
            )}
            <View style={styles.completionDialogActions}>
              <Pressable
                onPress={() => setCompletionCelebrationPuzzleId(null)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>퍼즐 다시 보기</Text>
              </Pressable>
              <Pressable
                onPress={openCompletedResult}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>결과 보기</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => {
                setCompletionCelebrationPuzzleId(null);
                navigateTo('home');
              }}
              style={styles.completionHomeButton}
            >
              <Text style={styles.completionHomeButtonText}>홈으로</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  function renderInputGuidance() {
    if (!isFirstInputGuideVisible && !isStuckHintPromptVisible) {
      return null;
    }

    return (
      <View style={styles.inputGuidanceStack}>
        {isFirstInputGuideVisible ? (
          <View accessibilityRole="alert" style={styles.inputGuideBanner}>
            <Text style={styles.inputGuideText}>
              반짝이는 첫 칸을 탭해 글자를 입력하면 시작돼요 ✏️
            </Text>
            <Pressable
              accessibilityLabel="첫 입력 안내 닫기"
              accessibilityRole="button"
              onPress={dismissFirstInputGuide}
              style={styles.inputGuideClose}
            >
              <Text style={styles.inputGuideCloseText}>×</Text>
            </Pressable>
          </View>
        ) : null}
        {isStuckHintPromptVisible ? (
          <View accessibilityRole="alert" style={styles.stuckHintPrompt}>
            <Text style={styles.stuckHintPromptText}>
              {getStuckHintPromptText({
                trigger: stuckHintTrigger,
                nearFinish: isStuckHintNearFinish,
                wordsRemaining: stuckHintShownWordsRemaining,
                hasHintCredits: remainingHintCredits > 0,
              })}
            </Text>
            <View style={styles.stuckHintPromptActions}>
              {stuckHintTrigger === 'first_input' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={acceptFirstInputNudge}
                  style={styles.stuckHintPromptPrimary}
                >
                  <Text style={styles.stuckHintPromptPrimaryText}>
                    입력 시작하기
                  </Text>
                </Pressable>
              ) : (
                <>
                  {isStuckHintNearFinish ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={acceptNearFinishNudge}
                      style={styles.stuckHintPromptPrimary}
                    >
                      <Text style={styles.stuckHintPromptPrimaryText}>
                        남은 단어 마저 풀기
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={acceptStuckHintPrompt}
                    style={styles.stuckHintPromptSecondary}
                  >
                    <Text style={styles.stuckHintPromptSecondaryText}>
                      {remainingHintCredits > 0
                        ? '무료 힌트 보기'
                        : '힌트 보기'}
                    </Text>
                  </Pressable>
                </>
              )}
              <Pressable
                accessibilityLabel={
                  stuckHintTrigger === 'first_input'
                    ? '입력 안내 닫기'
                    : '힌트 안내 닫기'
                }
                accessibilityRole="button"
                onPress={dismissStuckHintPrompt}
                style={styles.stuckHintPromptClose}
              >
                <Text style={styles.stuckHintPromptCloseText}>×</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  function renderHowToPlayModal() {
    return (
      <Modal
        animationType="fade"
        onRequestClose={() => dismissHowToPlay('dismiss')}
        transparent
        visible={route === 'today' && !hasSeenHowToPlay}
      >
        <View style={styles.completionModalOverlay}>
          <View
            accessibilityLabel="크로스워드 풀이 안내"
            accessibilityViewIsModal
            style={styles.howToPlayDialog}
          >
            <View style={styles.completionDialogText}>
              <Text style={styles.completionDialogTitle}>
                크로스워드 어떻게 풀까요?
              </Text>
            </View>
            <View style={styles.howToPlayList}>
              {[
                '격자의 칸을 탭하면 해당 단어가 선택돼요',
                '같은 칸을 다시 탭하면 가로↔세로 방향이 바뀌어요',
                '아래 단서 목록에서 원하는 단어를 바로 선택할 수도 있어요',
                '힌트 버튼으로 모르는 칸을 채울 수 있어요 (횟수 제한 있음)',
              ].map((text, index) => (
                <View key={index} style={styles.howToPlayItem}>
                  <Text style={styles.howToPlayIndex}>{index + 1}</Text>
                  <Text style={styles.howToPlayText}>{text}</Text>
                </View>
              ))}
            </View>
            <View style={styles.completionDialogActions}>
              <Pressable
                onPress={() => dismissHowToPlay('complete')}
                style={[styles.primaryButton, { flex: 1 }]}
              >
                <Text style={styles.primaryButtonText}>
                  알겠어요, 시작할게요!
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  function renderAdDiagnosticsModal() {
    return (
      <Modal
        animationType="fade"
        onRequestClose={() => setIsAdDiagnosticsOpen(false)}
        transparent
        visible={isAdDiagnosticsOpen}
      >
        <View style={styles.completionModalOverlay}>
          <View
            accessibilityLabel="광고 진단"
            accessibilityRole="alert"
            style={styles.completionDialog}
          >
            <View style={styles.completionDialogText}>
              <Text style={styles.completionDialogTitle}>광고 진단</Text>
              <Text style={styles.adDiagnosticText}>
                {adDiagnosticState.message}
              </Text>
            </View>
            <View style={styles.adDiagnosticActions}>
              <Pressable
                disabled={adDiagnosticState.isRunning}
                onPress={() => runRewardedAdDiagnostic('rewardedHint', 'test')}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>힌트 테스트</Text>
              </Pressable>
              <Pressable
                disabled={adDiagnosticState.isRunning}
                onPress={() =>
                  runRewardedAdDiagnostic('rewardedHint', 'production')
                }
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>힌트 운영</Text>
              </Pressable>
            </View>
            <View style={styles.completionDialogActions}>
              <Pressable
                disabled={adDiagnosticState.isRunning}
                onPress={openAdInspector}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Ad Inspector</Text>
              </Pressable>
              <Pressable
                onPress={() => setIsAdDiagnosticsOpen(false)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>닫기</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  function renderToday() {
    return (
      <View style={styles.playScreen}>
        {renderTodayHeader()}
        {renderSolveClueBar()}
        {progressToast.message !== '' ? (
          <View accessibilityLiveRegion="polite" style={styles.progressToast}>
            <Text style={styles.progressToastText}>{progressToast.message}</Text>
          </View>
        ) : null}
        <ScrollView
          ref={playScreenScrollRef}
          keyboardShouldPersistTaps="handled"
          style={styles.playScreenScroll}
          contentContainerStyle={styles.playScreenScrollContent}
        >
          {renderBoard()}
          {renderSelectedClues()}
          {renderCompletedReviewPanel()}
        </ScrollView>
        {renderInputGuidance()}
        {renderClueListModal()}
        {renderCompletionCelebrationModal()}
        {renderHowToPlayModal()}
      </View>
    );
  }

  function renderResult() {
    const puzzleLabel =
      puzzlePack.source === 'remote'
        ? formatPuzzleAliasLabel(selectedPuzzleSummary)
        : puzzle.date;
    const elapsedLabel = formatElapsedTime(
      mission.lastStartedAt,
      mission.completedAt,
      mission.pausedMs,
    );
    const acrossEntries = viewModel.completedEntries.filter(
      e => e.direction === 'across',
    );
    const downEntries = viewModel.completedEntries.filter(
      e => e.direction === 'down',
    );

    const resultAchievements = getCompletionAchievements({
      hintCount,
      attemptsUsed: mission.attemptsUsed,
      revealUsed: false,
    });
    const resultStreakBadge = getStreakBadgeLabel(consecutiveStreak);

    async function handleShare() {
      await shareResultText({
        text: buildMobileShareText({
          puzzle,
          cellValues,
          puzzleLabel,
          elapsedLabel,
          hintCount,
          attemptsUsed: mission.attemptsUsed,
          completedCount: viewModel.completedEntries.length,
          totalCount: puzzle.entries.length,
          consecutiveStreak,
          isComplete: isCompleted,
          revealUsed: false,
        }),
        surface: 'result_screen',
        clickParams: { puzzleId: puzzle.puzzleId, difficulty: puzzle.difficulty },
      });
    }

    return (
      <ScrollView contentContainerStyle={styles.homeContent}>
        {renderHeader(
          isCompleted
            ? '퍼즐 완료'
            : isAttemptExhaustedUncompleted
              ? '도전 종료'
              : '진행 결과',
          puzzleLabel,
        )}
        <View style={styles.summaryPanel}>
          <Text style={styles.panelTitle}>
            {isCompleted
              ? '미션 완료'
              : isAttemptExhaustedUncompleted
                ? '도전 기회를 모두 사용했어요.'
                : '아직 풀이 중입니다.'}
          </Text>
          <View style={styles.statusGrid}>
            {isCompleted ? (
              <>
                <Metric label="도전 횟수" value={`${mission.attemptsUsed}회`} />
                <Metric label="풀이 시간" value={elapsedLabel ?? '−'} />
                <Metric label="사용 힌트" value={`${hintCount}개`} />
              </>
            ) : (
              <>
                <Metric label="진행률" value={`${progressPercent}%`} />
                <Metric label="사용 힌트" value={`${hintCount}개`} />
                <Metric label="남은 시도" value={`${remainingAttempts}회`} />
              </>
            )}
          </View>
          {!isCompleted && remainingAttempts === 0 && (
            <Text style={styles.resultNotice}>
              오늘의 도전 기회를 모두 사용했어요. 내일 새로운 퍼즐이 기다려요.
            </Text>
          )}
          <View style={styles.actions}>
            {isCompleted &&
              (nextRecommendedSummary != null ? (
                <Pressable
                  accessibilityLabel={nextRecommendedButtonLabel ?? '다음 퍼즐 풀기'}
                  onPress={() => {
                    startNextRecommendedPuzzle('result_screen').catch(
                      () => undefined,
                    );
                  }}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>
                    {nextRecommendedButtonLabel ?? '다음 퍼즐 풀기'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityLabel="퍼즐 기록 보기"
                  accessibilityRole="button"
                  onPress={() => navigateTo('history')}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>퍼즐 기록 보기</Text>
                </Pressable>
              ))}
            <Pressable
              onPress={isCompleted ? openCompletedBoard : startOrResumeMission}
              style={
                isCompleted ? styles.secondaryButton : styles.primaryButton
              }
            >
              <Text
                style={
                  isCompleted
                    ? styles.secondaryButtonText
                    : styles.primaryButtonText
                }
              >
                {isCompleted
                  ? '퍼즐 다시 보기'
                  : isAttemptExhaustedUncompleted
                    ? '퍼즐 보기'
                    : '계속 풀기'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => navigateTo('home')}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>홈으로</Text>
            </Pressable>
            {leaderboardVisible && isCompleted && (
              <Pressable
                accessibilityLabel="순위 보기"
                onPress={() => {
                  openLeaderboard().catch(() => undefined);
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>순위 보기</Text>
              </Pressable>
            )}
            {!isCompleted && remainingAttempts > 0 && (
              <Pressable
                onPress={restartMissionAttempt}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>다시 도전</Text>
              </Pressable>
            )}
          </View>
          {isCompleted && (
            <Pressable onPress={handleShare} style={styles.shareButton}>
              <Text style={styles.shareButtonText}>결과 공유하기</Text>
            </Pressable>
          )}
          {isCompleted &&
            (isNewBestTime ||
              resultAchievements.noHint ||
              resultAchievements.firstTry ||
              resultStreakBadge != null) && (
              <View style={styles.resultStreakRow}>
                {isNewBestTime && (
                  <Text
                    style={[
                      styles.resultStreakBadge,
                      styles.completionAchievementBadgeBest,
                    ]}
                  >
                    🏆 최고 기록 갱신!
                  </Text>
                )}
                {resultAchievements.noHint && (
                  <Text style={styles.resultStreakBadge}>🎯 노힌트 클리어</Text>
                )}
                {resultAchievements.firstTry && (
                  <Text style={styles.resultStreakBadge}>💎 첫 도전 성공</Text>
                )}
                {resultStreakBadge != null && (
                  <Text style={styles.resultStreakBadge}>{resultStreakBadge}</Text>
                )}
                {getNextStreakMilestoneHint(consecutiveStreak) != null && (
                  <Text style={styles.streakNudge}>
                    {getNextStreakMilestoneHint(consecutiveStreak)}
                  </Text>
                )}
              </View>
            )}
        </View>
        {viewModel.completedEntries.length > 0 && (
          <View style={styles.resultWordList}>
            <Text style={styles.resultWordListTitle}>
              {isCompleted
                ? '완성한 단어'
                : `맞춘 단어 ${viewModel.completedEntries.length}개`}
            </Text>
            {acrossEntries.length > 0 && (
              <View style={styles.resultWordSection}>
                <Text style={styles.resultSectionTitle}>가로</Text>
                {acrossEntries.map(entry => {
                  const label = viewModel.startLabels.get(
                    getCellKey(entry.row, entry.col),
                  );
                  return (
                    <View key={entry.id} style={styles.resultWordItem}>
                      <Text style={styles.resultWordNumber}>
                        {label != null ? `${label}번` : '·'}
                      </Text>
                      <Text style={styles.resultWordAnswer}>
                        {entry.answer}
                      </Text>
                      <Text style={styles.resultWordClue} numberOfLines={2}>
                        {entry.clue}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            {downEntries.length > 0 && (
              <View style={styles.resultWordSection}>
                <Text style={styles.resultSectionTitle}>세로</Text>
                {downEntries.map(entry => {
                  const label = viewModel.startLabels.get(
                    getCellKey(entry.row, entry.col),
                  );
                  return (
                    <View key={entry.id} style={styles.resultWordItem}>
                      <Text style={styles.resultWordNumber}>
                        {label != null ? `${label}번` : '·'}
                      </Text>
                      <Text style={styles.resultWordAnswer}>
                        {entry.answer}
                      </Text>
                      <Text style={styles.resultWordClue} numberOfLines={2}>
                        {entry.clue}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    );
  }

  function renderHistory() {
    const historySummaries =
      puzzleArchiveRecords.length > 0
        ? puzzleArchiveRecords.map(record => createPuzzleSummary(record.puzzle))
        : visiblePuzzleSummaries;

    return (
      <ScrollView contentContainerStyle={styles.homeContent}>
        {renderHeader(
          '퍼즐 기록',
          puzzleArchiveRecords.length > 0 ? '기기 저장 사본' : '최근 공개 퍼즐',
        )}
        <PersonalStatsCard
          stats={historyStats.stats}
          consecutiveStreak={consecutiveStreak}
          longestStreak={historyStats.longestStreak}
          solveTimeDistribution={historyStats.solveTimeDistribution}
        />
        <StreakHeatmap weeks={historyStats.streakWeeks} />
        {historySummaries.map(summary => {
          const state = dateCardStates[summary.puzzleId];

          return (
            <Pressable
              key={summary.puzzleId}
              onPress={() => {
                selectPuzzle(summary.puzzleId);
              }}
              style={[
                styles.historyItem,
                summary.puzzleId === puzzle.puzzleId &&
                  styles.historyItemSelected,
              ]}
            >
              <View>
                <Text style={styles.historyTitle}>
                  {formatPuzzleHistoryTitle(summary, puzzlePack.source)}
                </Text>
                <Text style={styles.historyMeta}>
                  {summary.date} · {summary.metrics?.wordCount ?? '-'}단어 ·
                  힌트 {state?.hintCount ?? 0}개
                </Text>
              </View>
              <Text style={styles.historyState}>
                {state?.completedAt != null
                  ? '완료'
                  : (state?.attemptsUsed ?? 0) >= DAILY_ATTEMPT_LIMIT
                    ? '도전 종료'
                    : state?.hasProgress
                      ? '진행 중'
                      : '대기'}
              </Text>
            </Pressable>
          );
        })}
        <View style={styles.policyPanel}>
          <Text style={styles.policyTitle}>기기 저장 기록</Text>
          <Text style={styles.smallText}>
            시작하거나 완료한 퍼즐은 기기에 스냅샷으로 남습니다. 원격 보존
            기간에서 빠진 퍼즐도 앱 데이터가 유지되는 동안 다시 열 수 있습니다.
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => navigateTo('home')}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>홈으로</Text>
          </Pressable>
          <Pressable
            onPress={() => navigateTo('license')}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>출처</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="광고 개인정보 설정"
            onPress={openAdPrivacySettings}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>광고 개인정보 설정</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  function renderLicense() {
    return (
      <ScrollView contentContainerStyle={styles.homeContent}>
        {renderHeader('자료 출처', '라이선스')}
        <View style={styles.summaryPanel}>
          <Pressable onPress={handleAdDiagnosticsUnlockTap}>
            <Text style={styles.panelTitle}>한국어기초사전</Text>
          </Pressable>
          <Text style={styles.summaryText}>
            일부 단어 힌트는 국립국어원 한국어기초사전 뜻풀이를 바탕으로
            구성했습니다.
          </Text>
          <Text style={styles.smallText}>
            Creative Commons Attribution-ShareAlike 2.0 Korea 조건을 따릅니다.
          </Text>
        </View>
        <Pressable
          onPress={() => navigateTo('home')}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>홈으로</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
        <View style={styles.loadingScreen}>
          <ActivityIndicator color="#0f766e" size="large" />
          <Text style={styles.notice}>퍼즐 데이터를 불러오는 중입니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        {route === 'today'
          ? renderToday()
          : route === 'result'
            ? renderResult()
            : route === 'history'
              ? renderHistory()
              : route === 'resume'
                ? renderResume()
                : route === 'license'
                  ? renderLicense()
                  : renderHome()}
        {renderAdDiagnosticsModal()}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
      puzzle.entries.find(entry => entry.id === selectedEntryId) ??
      puzzle.entries[0],
    [puzzle.entries, selectedEntryId],
  );
  const selectedCells = useMemo(
    () =>
      selectedEntry == null
        ? new Set<string>()
        : new Set(getEntryCellKeys(selectedEntry)),
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
  const completedEntries = useMemo(
    () => getCompletedEntries(puzzle.entries, cellValues),
    [cellValues, puzzle.entries],
  );
  const rows = useMemo(
    () =>
      Array.from(
        { length: bounds.maxRow - bounds.minRow + 1 },
        (_, index) => bounds.minRow + index,
      ),
    [bounds],
  );
  const cols = useMemo(
    () =>
      Array.from(
        { length: bounds.maxCol - bounds.minCol + 1 },
        (_, index) => bounds.minCol + index,
      ),
    [bounds],
  );
  const clueEntries = useMemo(
    () => puzzle.entries.filter(entry => entry.direction === selectedDirection),
    [puzzle.entries, selectedDirection],
  );
  const slotValidationPass = useMemo(
    () => validatePuzzleSlots(puzzle).pass,
    [puzzle],
  );

  return {
    bounds,
    cellEntries,
    clueEntries,
    cols,
    completedEntries,
    isComplete:
      puzzle.entries.length > 0 &&
      completedEntries.length === puzzle.entries.length,
    rows,
    selectedCells,
    selectedEntry,
    startLabels,
    slotValidationPass,
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function EraserIcon() {
  return (
    <View style={styles.eraserIcon} pointerEvents="none">
      <View style={styles.eraserIconBody}>
        <View style={styles.eraserIconCut} />
      </View>
      <View style={styles.eraserIconDust} />
    </View>
  );
}

function InputModeIcon({ mode }: { mode: AnswerInputMode }) {
  if (mode === 'box') {
    // Single input field bar.
    return (
      <View style={styles.inputModeIcon} pointerEvents="none">
        <View style={styles.inputModeBoxBar} />
      </View>
    );
  }

  // Per-cell grid.
  return (
    <View style={styles.inputModeIconRow} pointerEvents="none">
      <View style={styles.inputModeCell} />
      <View style={styles.inputModeCell} />
      <View style={styles.inputModeCell} />
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  adDiagnosticActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  adDiagnosticText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },
  answerPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe4ee',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  board: {
    alignSelf: 'center',
    backgroundColor: '#1f2937',
    borderColor: '#1f2937',
    borderRadius: 8,
    borderWidth: BOARD_BORDER_WIDTH,
    overflow: 'hidden',
  },
  boardFrame: {
    alignSelf: 'center',
    position: 'relative',
  },
  boardNativeInput: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: 'transparent',
    fontSize: 1,
    height: 1,
    includeFontPadding: false,
    left: 0,
    margin: 0,
    opacity: 0,
    padding: 0,
    position: 'absolute',
    top: 0,
    width: 1,
  },
  boardPane: {
    gap: 14,
  },
  boardPaneWide: {
    flex: 0.95,
  },
  boardRow: {
    flexDirection: 'row',
  },
  cell: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#1f2937',
    borderWidth: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  cellActive: {
    backgroundColor: '#dcfce7',
  },
  cellBlock: {
    backgroundColor: '#1f2937',
  },
  cellCompleted: {
    backgroundColor: '#f0fdfa',
  },
  cellLetter: {
    color: '#111827',
    fontSize: 21,
    fontWeight: '900',
  },
  cellNumber: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '800',
    left: 3,
    position: 'absolute',
    top: 2,
  },
  cellPending: {
    backgroundColor: '#fef9c3',
  },
  cellSelected: {
    backgroundColor: '#bef264',
  },
  cellCorrect: {
    backgroundColor: '#dcfce7',
  },
  cellWrong: {
    backgroundColor: '#fee2e2',
  },
  cellLetterCorrect: {
    color: '#0f766e',
  },
  cellLetterWrong: {
    color: '#dc2626',
  },
  cellLockMark: {
    borderColor: '#0f766e',
    borderRadius: 2,
    borderWidth: 1.4,
    bottom: 3,
    height: 7,
    opacity: 0.55,
    position: 'absolute',
    right: 3,
    width: 7,
  },
  clueItem: {
    alignItems: 'flex-start',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  clueItemCompleted: {
    backgroundColor: '#f0fdfa',
  },
  clueItemNumber: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '800',
    minWidth: 22,
  },
  clueItemSelected: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
  },
  clueItemText: {
    color: '#334155',
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  clueList: {
    gap: 14,
  },
  clueMeta: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '800',
  },
  cluePreview: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 25,
  },
  clueSection: {
    gap: 8,
  },
  clueSectionTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  currentClue: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 24,
  },
  dateCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 132,
    padding: 12,
  },
  dateCardCompleted: {
    borderColor: '#14b8a6',
  },
  dateCardDate: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
  },
  dateCardMeta: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  dateCardSelected: {
    backgroundColor: '#f0fdfa',
    borderColor: '#0f766e',
  },
  dateCardState: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
  },
  dateList: {
    gap: 8,
    paddingRight: 16,
  },
  todayPuzzleChip: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 82,
    padding: 12,
    width: 122,
  },
  todayPuzzleChipMeta: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  todayPuzzleChipSelected: {
    backgroundColor: '#f0fdfa',
    borderColor: '#0f766e',
  },
  todayPuzzleChipState: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 3,
  },
  todayPuzzleChipTitle: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '900',
  },
  todayPuzzleList: {
    gap: 8,
    paddingRight: 16,
  },
  todayPuzzleRail: {
    gap: 10,
  },
  todayPuzzleRailCount: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
  },
  todayPuzzleRailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  todayPuzzleRailTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.45,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '900',
  },
  eraserIcon: {
    alignItems: 'center',
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  eraserIconBody: {
    backgroundColor: '#334155',
    borderRadius: 3,
    height: 10,
    position: 'relative',
    transform: [{ rotate: '-28deg' }],
    width: 17,
  },
  eraserIconCut: {
    backgroundColor: '#f1f5f9',
    height: 10,
    left: 10,
    position: 'absolute',
    width: 2,
  },
  eraserIconDust: {
    backgroundColor: '#94a3b8',
    borderRadius: 999,
    height: 2,
    marginTop: 3,
    width: 13,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
  },
  historyItem: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
  },
  historyItemSelected: {
    backgroundColor: '#f0fdfa',
    borderColor: '#0f766e',
  },
  historyMeta: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  historyState: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '900',
  },
  historyTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  homeContent: {
    gap: 16,
    padding: 16,
    paddingBottom: 28,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  metric: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    flex: 1,
    minWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
  },
  metricValue: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
  },
  notice: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
    minHeight: 18,
  },
  noticeRow: {
    minHeight: 18,
  },
  panelTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  weeklyStreakStrip: {
    gap: 10,
    marginTop: 12,
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  weeklyStreakHeadline: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  weeklyStreakDays: {
    flexDirection: 'row',
    gap: 6,
  },
  weeklyStreakDay: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  weeklyStreakDayLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  weeklyStreakDayLabelToday: {
    color: '#00866f',
  },
  weeklyStreakDayDot: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#e2e8f0',
  },
  weeklyStreakDayDotDone: {
    backgroundColor: '#00a88f',
  },
  weeklyStreakDayDotToday: {
    borderWidth: 2,
    borderColor: '#00a88f',
  },
  weeklyStreakDayDotText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  weeklyStreakNudge: {
    color: '#00866f',
    fontSize: 13,
    fontWeight: '700',
  },
  dailyLadder: {
    gap: 8,
    marginBottom: 18,
  },
  dailyLadderStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  dailyLadderStepNext: {
    borderColor: '#00a88f',
    backgroundColor: '#f1f9f9',
  },
  dailyLadderStepDone: {
    opacity: 0.8,
  },
  dailyLadderStepIndex: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
  },
  dailyLadderStepIndexActive: {
    backgroundColor: '#00a88f',
  },
  dailyLadderStepIndexText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '900',
  },
  dailyLadderStepIndexTextActive: {
    color: '#ffffff',
  },
  dailyLadderStepBody: {
    flex: 1,
    gap: 2,
  },
  dailyLadderStepTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  dailyLadderStepStatus: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  dailyLadderStepStatusNext: {
    color: '#00866f',
  },
  selectedPuzzleScaffold: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#f1f9f9',
    borderColor: '#c7ebe5',
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginBottom: 18,
    padding: 14,
  },
  puzzleScaffoldHeader: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  puzzleScaffoldTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  puzzleScaffoldMeta: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '700',
  },
  puzzleScaffoldBoard: {
    aspectRatio: 1,
    backgroundColor: '#d7e8e5',
    gap: 2,
    padding: 2,
    width: 152,
  },
  puzzleScaffoldRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 2,
  },
  puzzleScaffoldCell: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  puzzleScaffoldBlock: {
    backgroundColor: '#475569',
  },
  playScreen: {
    flex: 1,
  },
  playScreenScroll: {
    flex: 1,
  },
  playScreenScrollContent: {
    gap: 14,
    padding: 16,
    paddingBottom: 72,
  },
  playScreenWide: {
    flexDirection: 'row',
  },
  policyPanel: {
    backgroundColor: '#f8fafc',
    borderColor: '#dbe4ee',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  policyTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  previewPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe4ee',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  primaryButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  progressBadge: {
    alignItems: 'center',
    backgroundColor: '#eef2f7',
    borderRadius: 8,
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  progressLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
  },
  progressValue: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  safeArea: {
    backgroundColor: '#f8fafc',
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
  },
  selectedClue: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedClueActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#0f766e',
  },
  selectedClueList: {
    gap: 8,
  },
  selectedClueMeta: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
  },
  selectedClueText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },
  sidePane: {
    flex: 1,
  },
  sidePaneContent: {
    gap: 14,
    paddingBottom: 24,
  },
  sidePaneWide: {
    flex: 1.05,
  },
  smallText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe4ee',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  summaryText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  title: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  utilityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  solveHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  solveHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  solveHeaderEyebrow: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
  },
  solveHeaderTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
  },
  solveHeaderIcon: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    minWidth: 36,
    paddingHorizontal: 8,
  },
  solveHeaderIconMuted: {
    backgroundColor: '#fef2f2',
  },
  solveHeaderIconText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '800',
  },
  solveHeaderIconEmoji: {
    fontSize: 18,
  },
  iconBadge: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 999,
    height: 16,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -2,
    top: -2,
  },
  iconBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  solveClueBar: {
    backgroundColor: '#ffffff',
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: 1,
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  solveClueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  clueNavButton: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  clueNavText: {
    color: '#334155',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
  },
  solveClueInfo: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  solveClueText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    textAlign: 'center',
  },
  answerSlots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  answerBoxInput: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d6dee6',
    borderRadius: 10,
    borderWidth: 1,
    color: '#191f28',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 4,
    minWidth: 200,
    paddingHorizontal: 16,
    paddingVertical: 10,
    textAlign: 'center',
  },
  inputModeIcon: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  inputModeIconRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  inputModeBoxBar: {
    borderColor: '#4e5968',
    borderRadius: 3,
    borderWidth: 2,
    height: 11,
    width: 18,
  },
  inputModeCell: {
    borderColor: '#4e5968',
    borderRadius: 1.5,
    borderWidth: 1.5,
    height: 9,
    width: 5,
  },
  answerSlot: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  answerSlotActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#0f766e',
    borderWidth: 2,
  },
  answerSlotPending: {
    backgroundColor: '#fef9c3',
    borderColor: '#eab308',
  },
  answerSlotLocked: {
    backgroundColor: '#dcfce7',
    borderColor: '#7edac8',
  },
  answerSlotWrong: {
    backgroundColor: '#fee2e2',
    borderColor: '#f4a6a6',
  },
  answerSlotText: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  answerSlotTextLocked: {
    color: '#0f766e',
  },
  answerSlotTextWrong: {
    color: '#dc2626',
  },
  solveNotice: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  completedReviewPanel: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#99f6e4',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  completedReviewText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  completedReviewTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  completedReviewDescription: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  completionModalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  completionDialog: {
    alignItems: 'stretch',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    gap: 16,
    maxWidth: 420,
    padding: 18,
    width: '100%',
  },
  completionDialogBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#ecfdf5',
    borderRadius: 999,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  completionDialogBadgeText: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '900',
  },
  completionDialogText: {
    alignItems: 'center',
    gap: 6,
  },
  completionDialogTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  completionDialogDescription: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center',
  },
  completionDialogElapsedLabel: {
    color: '#191f28',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  completionDialogActions: {
    flexDirection: 'row',
    gap: 8,
  },
  completionHomeButton: {
    alignItems: 'center',
    minHeight: 28,
    justifyContent: 'center',
  },
  completionHomeButtonText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '800',
  },
  clueModal: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  clueModalHeader: {
    alignItems: 'center',
    borderBottomColor: '#eef2f4',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  clueModalTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  clueModalList: {
    gap: 16,
    padding: 20,
    paddingBottom: 40,
  },
  clueDoneBadge: {
    backgroundColor: '#dff6f0',
    borderRadius: 999,
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  resultNotice: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 2,
  },
  completionAchievements: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    paddingTop: 2,
  },
  completionAchievementBadge: {
    backgroundColor: '#ecfdf5',
    borderRadius: 4,
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  returnReminderPreprompt: {
    gap: 8,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f1f9f9',
    borderWidth: 1,
    borderColor: '#c7ebe5',
  },
  returnReminderPrepromptTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  returnReminderPrepromptBody: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  returnReminderPrepromptActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  streakNudge: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  completionAchievementBadgeBest: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  progressToast: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#0f766e',
  },
  progressToastText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  resultStreakRow: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 4,
  },
  resultStreakBadge: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '800',
  },
  shareButton: {
    alignItems: 'center',
    backgroundColor: '#f0fdfa',
    borderColor: '#99f6e4',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  shareButtonText: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '900',
  },
  resultWordList: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe4ee',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  resultWordListTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  resultWordSection: {
    gap: 6,
  },
  resultSectionTitle: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 2,
  },
  resultWordItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 3,
  },
  resultWordNumber: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '800',
    minWidth: 34,
    paddingTop: 1,
  },
  resultWordAnswer: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
    minWidth: 60,
  },
  resultWordClue: {
    color: '#64748b',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  inputGuidanceStack: {
    backgroundColor: '#f8fafc',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  inputGuideBanner: {
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderColor: '#99f6e4',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputGuideText: {
    color: '#0f766e',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  inputGuideClose: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  inputGuideCloseText: {
    color: '#0f766e',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  stuckHintPrompt: {
    backgroundColor: '#ffffff',
    borderColor: '#99f6e4',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  stuckHintPromptText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  stuckHintPromptActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stuckHintPromptPrimary: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 7,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 12,
  },
  stuckHintPromptPrimaryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  stuckHintPromptSecondary: {
    alignItems: 'center',
    backgroundColor: '#f0fdfa',
    borderColor: '#99f6e4',
    borderRadius: 7,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 12,
  },
  stuckHintPromptSecondaryText: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '900',
  },
  stuckHintPromptClose: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    marginLeft: 'auto',
    width: 28,
  },
  stuckHintPromptCloseText: {
    color: '#64748b',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  howToPlayDialog: {
    alignItems: 'stretch',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    gap: 16,
    maxWidth: 420,
    padding: 18,
    width: '100%',
  },
  howToPlayList: {
    gap: 10,
  },
  howToPlayItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  howToPlayIndex: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 21,
    minWidth: 18,
    textAlign: 'center',
  },
  howToPlayText: {
    color: '#4e5968',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
});

export default App;
