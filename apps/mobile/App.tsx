import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { createCompletionTransition } from '../../packages/crossword-core/src/completionInterstitial';
import {
  WORDFREQ_NOTICE,
  WORDNET_LICENSE,
} from '../../packages/crossword-core/src/contentLicenses';
import {
  contentDate,
  contentDateRefreshDelay,
  dailyPuzzles,
  languageTelemetry,
  puzzleLanguage,
  type ContentLanguage,
} from '../../packages/crossword-core/src/dailyLanguage';
import {
  completionTransitionStore,
  createMobileCompletionInterstitial,
} from './completionInterstitial';
import {
  getUiLanguage,
  loadLanguage,
  saveLanguage,
  setUiLanguage,
  t,
} from './languageRepository';
import { usageStatistics } from './usageStatistics';

import {
  buildCellEntries,
  buildFirstWordGuideTelemetryParams,
  buildStartLabels,
  buildStreakCalendarWeeks,
  buildWeeklyStreakStrip,
  chooseFirstWordGuide,
  completeMission,
  computeConsecutiveStreakDays,
  computeElapsedMs,
  computeElapsedSeconds,
  computeLeaderboardScore,
  computeLongestStreakDays,
  computePersonalStats,
  computeSolveTimeDistribution,
  createDailyMissionState,
  createEmptyProgress,
  createLetterTileState,
  createPuzzleSummary,
  DAILY_ATTEMPT_LIMIT,
  defaultLaunchConfig,
  emitProgressionScreenView,
  emitStreakMilestoneIfReached,
  findPuzzleSummaryById,
  FIRST_WORD_GUIDE_EVENTS,
  FIRST_WORD_GUIDE_KEY,
  formatDateCardDay,
  formatDateCardWeekday,
  formatPuzzleAliasLabel,
  formatPuzzleCardSequenceLabel,
  formatReturnReminderPrepromptBody,
  getBounds,
  getCellKey,
  getCompletedEntries,
  getCompletionAchievements,
  getDailyFreePuzzleSummary,
  getEntryCells,
  getInitialEntryId,
  getInitialEntryStartCellKey,
  getProgressMilestoneRewardMessage,
  getProgressPercent,
  getPuzzlePackAlias,
  getRemainingAttempts,
  getTodayDateKey,
  HOME_QUICK_START_EVENT,
  isPublishedPuzzle,
  LETTER_TILE_CHOOSE_EVENT,
  normalizeFirstWordGuide,
  normalizeLetterTileProgress,
  normalizeOptionalPuzzleIdentifier,
  normalizePuzzleIdentifier,
  normalizePuzzleIdentifiers,
  normalizePuzzleManifestIdentifiers,
  recommendLetterEntry,
  restoreFirstWordGuide,
  RETURN_REMINDER_OPENED_EVENT,
  selectLetterEntry,
  shouldSubmitLeaderboardScore,
  sortPuzzleSummariesByRecency,
  startMissionAttempt,
  TILE_INPUT_POLICY_VERSION,
  togglePauseState,
  uniquePuzzleSummaries,
  validatePuzzleSlots,
  type DailyMissionState,
  type Direction,
  type FirstWordGuide,
  type GamePuzzleContext,
  type LaunchConfig,
  type LetterTileProgress,
  type LetterTileState,
  type PauseSessionState,
  type PersonalStatsRecord,
  type Puzzle,
  type PuzzleEntry,
  type PuzzleManifest,
  type PuzzleManifestItem,
  type ReturnReminderState,
  type SavedProgress,
} from '../../packages/crossword-core/src';

import puzzle20260525 from '../../public/puzzles/2026-05-25-normal-01.json';
import puzzle20260526 from '../../public/puzzles/2026-05-26-normal-02.json';
import puzzle20260527 from '../../public/puzzles/2026-05-27-normal-03.json';
import puzzle20260528 from '../../public/puzzles/2026-05-28-normal-04.json';
import puzzle20260529 from '../../public/puzzles/2026-05-29-normal-05.json';
import puzzle20260530 from '../../public/puzzles/2026-05-30-normal-06.json';
import puzzle20260531 from '../../public/puzzles/2026-05-31-normal-07.json';
import manifestData from '../../public/puzzles/manifest.json';
import {
  getAllBestTimeValuesMs,
  mobileBestTimeRepository,
  type BestTimes,
} from './bestTimeRepository';
import { createMobileCompletionDatesRepository } from './completionDatesRepository';
import { loadFirebaseLaunchConfig } from './firebaseClient';
import {
  loadFirstInputGuideSeen,
  markFirstInputGuideSeen,
} from './firstInputGuideRepository';
import { gameAnalytics } from './gameAnalytics';
import {
  createMobileGameplayAttemptTracker,
  type MobilePuzzleAbandonSnapshot,
} from './gameplayTelemetry';
import { leaderboardAdapter } from './leaderboardAdapter';
import { initializeMobileAds, showMobileAdsPrivacyOptions } from './mobileAds';
import {
  cancelStaleMobileReturnReminder,
  confirmMobileReturnReminder,
  declineMobileReturnReminder,
  prepareMobileReturnReminderPreprompt,
  refreshMobileReturnReminderSchedule,
} from './mobileReturnReminder';
import {
  listArchivedPuzzles,
  loadArchivedPuzzle,
  saveArchivedPuzzle,
  type PuzzleArchiveRecord,
  type PuzzleArchiveSaveOptions,
} from './puzzleArchive';
import { PersonalStatsCard, StreakHeatmap } from './recordsComponents';
import {
  consumeInitialReturnReminderOpen,
  consumePendingReturnReminderOpen,
  subscribeToReturnReminderOpened,
  type ReturnReminderOpen,
} from './returnReminderNotifications';
import { buildMobileShareText, shareResultText } from './shareResult';
import { telemetry } from './telemetry';
import { TileHomeScreen } from './TileHomeScreen';
import { TilePuzzleScreen, type TileInputAction } from './TilePuzzleScreen';
import { TileResultScreen } from './TileResultScreen';
import { useLeaderboard } from './useLeaderboard';

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
  isPublished: boolean;
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

const REMOTE_PUZZLE_PACK_BASE_URL = 'https://crossword-puzzle-79ae0.web.app';
const PROGRESS_KEY_PREFIX = 'crossword-puzzle:progress';
const MISSION_KEY_PREFIX = 'crossword-puzzle:mission';

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
    ...languageTelemetry(puzzle, getUiLanguage()),
  };
}

// 게임 세부 지표(gameAnalytics)용 퍼즐 컨텍스트. 모든 game_* 이벤트에 콘텐츠 차원
// (난이도/테마/팩)으로 실린다. 계약은 core gameAnalytics.ts의 GamePuzzleContext.
function getGamePuzzleContext(puzzle: Puzzle): GamePuzzleContext {
  return {
    language: puzzleLanguage(puzzle),
    uiLanguage: getUiLanguage(),
    dailySequence: puzzle.dailySequence ?? 1,
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

  const weekday = formatDateCardWeekday(summary.date, 'long', getUiLanguage());
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

  const weekday = formatDateCardWeekday(summary.date, 'short', getUiLanguage());
  const dayLabel = formatDateCardDay(summary.date);

  return weekday === '' ? dayLabel : `${dayLabel} ${weekday}`;
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
  return minutes > 0 ? t('{0}분 {1}초', minutes, seconds) : t('{0}초', seconds);
}

export function formatPuzzleHistoryTitle(
  summary: PuzzleManifestItem,
  source: PuzzlePackSource,
) {
  if (summary.dailySequence != null)
    return `${summary.date} · ${formatPuzzleCardSequenceLabel(summary, getUiLanguage())}`;
  const aliasLabel = formatPuzzleAliasLabel(summary);

  return source === 'remote'
    ? `${formatPuzzleCardSequenceLabel(summary, getUiLanguage())} · ${aliasLabel}`
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

  const tileInput = normalizeLetterTileProgress(value.tileInput);
  return {
    ...(tileInput ? { tileInput } : {}),
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
    return true;
  } catch {
    return false;
  }
}

async function clearStoredProgress(puzzleId: string) {
  try {
    await AsyncStorage.removeItem(getProgressKey(puzzleId));
  } catch {
    // Local persistence is best effort.
  }
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
  const key = 'crossword-puzzle:content:' + url;
  try {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    const value = (await response.json()) as T;
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {}
    return value;
  } catch (error) {
    try {
      const cached = await AsyncStorage.getItem(key);
      if (cached) return JSON.parse(cached) as T;
    } catch {}
    throw error;
  }
}

async function loadRemotePuzzlePack(
  language: ContentLanguage,
): Promise<PuzzlePack> {
  const assetBaseUrl = REMOTE_PUZZLE_PACK_BASE_URL;
  const manifest = normalizePuzzleManifestIdentifiers(
    await fetchJson<PuzzleManifest>(
      `${assetBaseUrl.replace(/\/+$/, '')}/puzzles/${language}/manifest.json`,
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

  const expectedLanguage =
    pack.summaries.find(p => p.puzzleId === puzzleId)?.language ??
    (puzzleId.startsWith('en-') ? 'en' : 'ko');
  if (
    nextPuzzle == null ||
    nextPuzzle.puzzleId !== puzzleId ||
    puzzleLanguage(nextPuzzle) !== expectedLanguage
  ) {
    return null;
  }

  const [savedProgress, savedMission] = await Promise.all([
    loadStoredProgress(nextPuzzle.puzzleId),
    loadStoredMission(nextPuzzle.date, nextPuzzle.puzzleId),
  ]);

  return {
    nextPuzzle,
    isPublished: isPublishedPuzzle(
      pack.summaries.find(
        summary => summary.puzzleId === nextPuzzle.puzzleId,
      ) ?? createPuzzleSummary(nextPuzzle),
    ),
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

function getEntryCellKeys(entry: PuzzleEntry) {
  return getEntryCells(entry).map(cell => getCellKey(cell.row, cell.col));
}

function AppContent() {
  const [language, setLanguage] = useState<ContentLanguage>('ko');
  const [languageReady, setLanguageReady] = useState(false);
  const mobileCompletionDatesRepository = useMemo(
    () => createMobileCompletionDatesRepository({ language }),
    [language],
  );
  setUiLanguage(language);
  const [day, setDay] = useState(() => contentDate('ko'));
  useEffect(() => {
    void loadLanguage()
      .then(value => {
        setLanguage(value);
        setDay(contentDate(value));
        setLanguageReady(true);
      })
      .catch(() => setLanguageReady(true));
  }, []);
  useEffect(() => {
    let boundary: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(boundary);
      setDay(contentDate(language));
      boundary = setTimeout(update, contentDateRefreshDelay(language));
    };
    update();
    const timer = setInterval(update, 30000);
    return () => {
      clearTimeout(boundary);
      clearInterval(timer);
    };
  }, [language]);
  async function selectLanguage(next: ContentLanguage) {
    try {
      await saveLanguage(next);
    } catch {
      setNotice(t('언어 설정을 저장하지 못했어요.'));
      return;
    }
    activeSessionRef.current = null;
    setLanguage(next);
    setDay(contentDate(next));
    setIsLoading(true);
    setSettingsOpen(false);
    navigateTo('home');
  }

  const usageStatisticsState = useSyncExternalStore(
    usageStatistics.subscribe,
    usageStatistics.getSnapshot,
  );
  useEffect(() => {
    void usageStatistics.initialize();
  }, []);
  const [route, setRoute] = useState<AppRoute>('home');
  const [isLoading, setIsLoading] = useState(true);
  const [puzzle, setPuzzle] = useState(initialPuzzle);
  const activeSessionRef = useRef<string | null>(null);
  const currentRouteRef = useRef(route);
  currentRouteRef.current = route;

  const [dateCardStates, setDateCardStates] = useState<
    Record<string, DateCardState>
  >({});
  const [puzzlePack, setPuzzlePack] = useState<PuzzlePack>(bundledPuzzlePack);
  const [puzzleArchiveRecords, setPuzzleArchiveRecords] = useState<
    PuzzleArchiveRecord[]
  >([]);
  const [cellValues, setCellValues] = useState<Record<string, string>>({});
  const [tileInput, setTileInput] = useState<LetterTileProgress>();
  const [tileStatus, setTileStatus] =
    useState<LetterTileState['status']>('idle');
  const completionActionRef = useRef<string | null>(null);
  const tileAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [firstWordGuide, setFirstWordGuide] = useState<FirstWordGuide>();
  const firstGuideLegacySeen = useRef(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tileTextScale, setTileTextScale] = useState(1);
  const [tileTimerVisible, setTileTimerVisible] = useState(true);
  const [tileClock, setTileClock] = useState(Date.now());
  const [hintCount, setHintCount] = useState(0);
  const [earnedHintCredits, setEarnedHintCredits] = useState(0);
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
  const [tileFeedback, setNotice] = useState('');
  useEffect(() => {
    if (!tileFeedback) return;
    const timer = setTimeout(() => setNotice(''), 2200);
    return () => clearTimeout(timer);
  }, [tileFeedback]);
  const [launchConfig, setLaunchConfig] =
    useState<LaunchConfig>(defaultLaunchConfig);
  const completionAd = useMemo(
    () =>
      createMobileCompletionInterstitial(
        Platform.OS === 'ios'
          ? launchConfig.completionInterstitialIos
          : launchConfig.completionInterstitialAndroid,
      ),
    [
      launchConfig.completionInterstitialIos,
      launchConfig.completionInterstitialAndroid,
    ],
  );
  const completionAdContext = useRef<Record<string, string | number>>({});
  completionAdContext.current = {
    ...languageTelemetry(puzzle, language),
    puzzle_id: puzzle.puzzleId,
  };
  const transition = useMemo(
    () =>
      createCompletionTransition(
        completionAd,
        completionTransitionStore(),
        event => telemetry.impression(event, completionAdContext.current),
      ),
    [completionAd],
  );
  const completionNavigationRef = useRef(false);
  const [completionNavigationBusy, setCompletionNavigationBusy] =
    useState(false);
  useEffect(() => {
    completionAd.preload();
    return () => completionAd.dispose();
  }, [completionAd]);
  const {
    visible: leaderboardVisible,
    openFailed: leaderboardOpenFailed,
    submitScore: submitLeaderboardScore,
    openLeaderboard,
  } = useLeaderboard({
    enabled: launchConfig.leaderboardEnabled && language === 'ko',
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
  const submittedLeaderboardPuzzleIdsRef = useRef(new Set<string>());
  const returnReminderPromptedPuzzleIdsRef = useRef(new Set<string>());
  const returnReminderPrepromptRef = useRef<{
    prompted: ReturnReminderState;
    streakDays: number;
  } | null>(null);
  returnReminderPrepromptRef.current = returnReminderPreprompt;
  const completionCelebrationPuzzleIdRef = useRef<string | null>(null);
  completionCelebrationPuzzleIdRef.current = completionCelebrationPuzzleId;
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
    if (completionNavigationRef.current) return true;
    if (settingsOpen) {
      setSettingsOpen(false);
      return true;
    }
    const backTarget = getBackTargetRoute(route);

    if (backTarget == null) {
      return false;
    }

    navigateTo(backTarget);
    return true;
  }, [settingsOpen, navigateTo, route]);

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
    firstWordGuide?.status === 'active' &&
    firstWordGuide.puzzleId === puzzle.puzzleId;
  const guideCompleted = guideActive
    ? firstWordGuide.entryIds.filter(id =>
        viewModel.completedEntries.some(entry => entry.id === id),
      ).length
    : 0;
  const guideShownRef = useRef(new Set<string>());
  useEffect(() => {
    if (
      route === 'today' &&
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
    if (firstWordGuide)
      AsyncStorage.setItem(
        FIRST_WORD_GUIDE_KEY,
        JSON.stringify(firstWordGuide),
      ).catch(() => {});
  }, [firstWordGuide]);
  useEffect(() => {
    if (
      guideActive &&
      firstWordGuide.entryIds.length > 0 &&
      guideCompleted === firstWordGuide.entryIds.length
    ) {
      setFirstWordGuide({ ...firstWordGuide, status: 'complete' });
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
  useEffect(() => {
    if (!tileTimerVisible || mission.pausedAt != null) return;
    const timer = setInterval(() => setTileClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [tileTimerVisible, mission.pausedAt]);
  const progressPercent = getProgressPercent(
    viewModel.completedEntries.length,
    puzzle.entries.length,
  );
  const remainingAttempts = getRemainingAttempts(mission);
  const todayKey = day;
  const hasProgress =
    Object.keys(cellValues).length > 0 ||
    hintCount > 0 ||
    viewModel.completedEntries.length > 0;
  const hasStarted = mission.attemptsUsed > 0 || hasProgress;
  const isCompleted = viewModel.isComplete || mission.completedAt != null;
  const todayPuzzles = dailyPuzzles(puzzlePack.summaries, language, todayKey);
  const completedToday = todayPuzzles.filter(
    p => dateCardStates[p.puzzleId]?.completedAt,
  ).length;
  const dailySummary =
    todayPuzzles.find(p => !dateCardStates[p.puzzleId]?.completedAt) ??
    todayPuzzles.at(-1);
  const [homePreview, setHomePreview] = useState<Puzzle | null>(null);
  const [homePreviewError, setHomePreviewError] = useState(false);
  const [packReload, setPackReload] = useState(0);
  const homeLoadError =
    homePreviewError ||
    (!isLoading && puzzlePack.source === 'bundled' && dailySummary == null);
  useEffect(() => {
    let cancelled = false;
    setHomePreview(null);
    setHomePreviewError(false);
    if (dailySummary)
      loadPuzzleSession(dailySummary.puzzleId, puzzlePack)
        .then(session => {
          if (!cancelled) {
            setHomePreview(session?.nextPuzzle ?? null);
            setHomePreviewError(session == null);
          }
        })
        .catch(() => {
          if (!cancelled) setHomePreviewError(true);
        });
    return () => {
      cancelled = true;
    };
  }, [dailySummary, puzzlePack]);
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

  const refreshPuzzleArchive = useCallback(async () => {
    const nextArchiveRecords = (await listArchivedPuzzles()).filter(
      p => puzzleLanguage(p.puzzle) === language,
    );
    const archiveStates = await loadDateCardStates(
      nextArchiveRecords.map(record => createPuzzleSummary(record.puzzle)),
    );

    setPuzzleArchiveRecords(nextArchiveRecords);
    setDateCardStates(previous => ({ ...previous, ...archiveStates }));
  }, [language]);

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

  const applyPuzzleSession = useCallback(
    (session: PuzzleSession | null, initializeGuide = false) => {
      if (session == null) {
        return;
      }

      setCompletionCelebrationPuzzleId(null);
      activeSessionRef.current = session.nextPuzzle.puzzleId;
      setPuzzle(session.nextPuzzle);
      const restored = createLetterTileState(
        session.nextPuzzle,
        session.savedProgress.cellValues,
        session.savedProgress.tileInput,
      );
      const ids = chooseFirstWordGuide(session.nextPuzzle.entries);
      const guideEligible = session.isPublished;
      setFirstWordGuide(previous =>
        guideEligible
          ? restoreFirstWordGuide({
              previous,
              puzzleId: session.nextPuzzle.puzzleId,
              entries: session.nextPuzzle.entries,
              legacySeen: firstGuideLegacySeen.current || !initializeGuide,
              hasProgress:
                session.savedMission.attemptsUsed > 0 ||
                Object.keys(session.savedProgress.cellValues).length > 0,
            })
          : previous,
      );
      if (
        initializeGuide &&
        guideEligible &&
        session.savedMission.attemptsUsed === 0 &&
        Object.keys(restored.cellValues).length === 0 &&
        !firstGuideLegacySeen.current &&
        ids[0]
      )
        Object.assign(
          restored,
          selectLetterEntry(session.nextPuzzle, restored, ids[0]),
        );
      setCellValues(restored.cellValues);
      setTileInput(restored.progress);
      setTileStatus('idle');
      setHintCount(session.savedProgress.hintCount);
      setEarnedHintCredits(session.savedProgress.earnedHintCredits);
      setMission(session.savedMission);
      setSelectedDirection(
        session.nextPuzzle.entries.find(
          entry => entry.id === restored.progress.entryId,
        )?.direction ?? 'across',
      );
      setSelectedEntryId(restored.progress.entryId);
      setSelectedCellKey(restored.progress.activeCellKey);
    },
    [],
  );

  useEffect(() => {
    let isCancelled = false;

    async function hydrateInitialSession() {
      cancelStaleMobileReturnReminder(getTodayDateKey()).catch(() => {});
      let nextPuzzlePack = {
        ...bundledPuzzlePack,
        summaries: bundledPuzzlePack.summaries.filter(
          p => puzzleLanguage(p) === language,
        ),
      };

      try {
        nextPuzzlePack = await loadRemotePuzzlePack(language);
        nextPuzzlePack.summaries = nextPuzzlePack.summaries.filter(
          p => puzzleLanguage(p) === language && p.date <= day,
        );
      } catch {
        nextPuzzlePack = {
          ...bundledPuzzlePack,
          summaries: bundledPuzzlePack.summaries.filter(
            p => puzzleLanguage(p) === language,
          ),
        };
      }

      const nextArchiveRecords = (await listArchivedPuzzles()).filter(
        p => puzzleLanguage(p.puzzle) === language,
      );
      const nextSummaries = uniquePuzzleSummaries([
        ...nextPuzzlePack.summaries,
        ...nextArchiveRecords.map(record => createPuzzleSummary(record.puzzle)),
      ]);
      nextPuzzlePack.summaries = nextSummaries;
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
      const hydratedStates = await loadDateCardStates(hydratedSummaries);
      const todayPuzzles = dailyPuzzles(nextSummaries, language, day);
      const initialPuzzleId = (
        todayPuzzles.find(p => !hydratedStates[p.puzzleId]?.completedAt) ??
        todayPuzzles.at(-1)
      )?.puzzleId;
      const [states, session] = await Promise.all([
        loadDateCardStates(hydratedSummaries),
        initialPuzzleId
          ? loadPuzzleSession(initialPuzzleId, nextPuzzlePack)
          : Promise.resolve(null),
      ]);

      if (isCancelled) {
        return;
      }

      const [guideRaw, legacySeen, displayRaw] = await Promise.all([
        AsyncStorage.getItem(FIRST_WORD_GUIDE_KEY),
        loadFirstInputGuideSeen(),
        AsyncStorage.getItem('crossword-puzzle:tile-display:v1'),
      ]);
      firstGuideLegacySeen.current = legacySeen;
      try {
        setFirstWordGuide(
          normalizeFirstWordGuide(JSON.parse(guideRaw ?? 'null')),
        );
      } catch {}
      try {
        const display = JSON.parse(displayRaw ?? 'null');
        if (display) {
          setTileTextScale(display.large ? 1.15 : 1);
          setTileTimerVisible(display.timer !== false);
        }
      } catch {}
      for (const row of dailyPuzzles(nextSummaries, language, day))
        loadPuzzleFromPack(row.puzzleId, nextPuzzlePack).catch(() => {});
      setPuzzlePack(nextPuzzlePack);
      setPuzzleArchiveRecords(nextArchiveRecords);
      completionDatesRef.current = nextCompletionDates;
      setCompletionDates(nextCompletionDates);
      setBestTimes(nextBestTimes);
      setDateCardStates(states);
      if (!activeSessionRef.current || currentRouteRef.current === 'home')
        applyPuzzleSession(session);
      setIsLoading(false);
    }

    if (!languageReady) return;
    hydrateInitialSession().catch(() => {
      if (!isCancelled) {
        setIsLoading(false);
        setNotice(t('퍼즐 데이터를 불러오지 못했습니다.'));
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [
    applyPuzzleSession,
    packReload,
    language,
    languageReady,
    day,
    mobileCompletionDatesRepository,
  ]);

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
  }, [emitPuzzleAbandon, handleReturnReminderOpen]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!usageStatisticsState.ready || !usageStatistics.canTrack()) return;
    telemetry.screen(route, {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      puzzle_pack_source: puzzlePack.source,
    });
  }, [
    isLoading,
    puzzle,
    puzzlePack.source,
    route,
    selectedPuzzleSummary,
    usageStatisticsState.ready,
    usageStatisticsState.enabled,
    usageStatisticsState.busy,
  ]);

  useEffect(() => {
    if (route !== 'today' && route !== 'result') {
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
      earnedHintCredits,
      hintCount,
      tileInput,
    }).then(saved => {
      if (!saved) {
        setNotice(t('진행을 저장하지 못했어요. 저장 공간을 확인해 주세요.'));
        telemetry.impression('progress_save_error', {
          puzzle_id: puzzle.puzzleId,
        });
      }
    });
  }, [
    cellValues,
    hintCount,
    earnedHintCredits,
    tileInput,
    isLoading,
    puzzle.puzzleId,
  ]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    setDateCardStates(previous => ({
      ...previous,
      [puzzle.puzzleId]: createDateCardState(mission, {
        cellValues,
        earnedHintCredits,
        hintCount,
      }),
    }));
  }, [
    cellValues,
    hintCount,
    earnedHintCredits,
    isLoading,
    mission,
    puzzle.puzzleId,
  ]);

  const openAdPrivacySettings = useCallback(async () => {
    const result = await showMobileAdsPrivacyOptions();
    setNotice(
      result.status === 'shown'
        ? t('광고 개인정보 선택을 반영했습니다.')
        : result.status === 'not_required'
          ? t('현재 지역에서는 별도의 광고 개인정보 선택이 필요하지 않습니다.')
          : t(
              '광고 개인정보 설정을 열지 못했습니다. 네트워크 연결 후 다시 시도해 주세요.',
            ),
    );
  }, []);

  useEffect(() => {
    if (
      isLoading ||
      !viewModel.isComplete ||
      mission.completedAt != null ||
      completionActionRef.current !== puzzle.puzzleId
    ) {
      return;
    }
    completionActionRef.current = null;
    if (route === 'today') {
      completionCelebrationPuzzleIdRef.current = puzzle.puzzleId;
      setCompletionCelebrationPuzzleId(puzzle.puzzleId);
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
    const completionToday = puzzle.date;
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
    setNotice(
      t('퍼즐을 완료했습니다. 정답판을 확인한 뒤 결과를 볼 수 있습니다.'),
    );
    if (route === 'today') {
      navigateTo('result');
    }
  }, [
    navigateTo,
    completedDates,
    consecutiveStreak,
    hintCount,
    earnedHintCredits,
    mobileCompletionDatesRepository,
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
        ...languageTelemetry(puzzle, puzzleLanguage(puzzle)),
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
      setNotice(t('퍼즐 데이터를 찾을 수 없습니다.'));
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
    if (mission.pausedAt != null || (!hasStarted && action !== 'select'))
      return;
    if (tileAdvanceRef.current) clearTimeout(tileAdvanceRef.current);
    setNotice('');
    markCompletionAction(next.cellValues);
    setCellValues(next.cellValues);
    setTileInput(next.progress);
    setTileStatus(next.status);
    setSelectedEntryId(next.progress.entryId);
    setSelectedCellKey(next.progress.activeCellKey);
    const entry = puzzle.entries.find(
      item => item.id === next.progress.entryId,
    );
    if (entry) setSelectedDirection(entry.direction);
    if (action === 'choice' && entry) {
      if (
        gameplayAttemptTrackerRef.current.markFirstInput(
          `${puzzle.puzzleId}:${mission.attemptsUsed}`,
        )
      ) {
        telemetry.impression('first_answer_input', {
          ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
          attempt_number: mission.attemptsUsed,
          input_policy: TILE_INPUT_POLICY_VERSION,
        });
        gameAnalytics.track('game_first_input', getGamePuzzleContext(puzzle), {
          timeToFirstInputSec: getElapsedSeconds(
            mission.lastStartedAt,
            undefined,
            mission,
          ),
          attemptNumber: mission.attemptsUsed,
        });
        firstGuideLegacySeen.current = true;
        markFirstInputGuideSeen().catch(() => {});
      }
      telemetry.click(LETTER_TILE_CHOOSE_EVENT, {
        ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
        entry_id: entry.id,
        input_policy: TILE_INPUT_POLICY_VERSION,
        result: next.status,
      });
    }
    if (next.status === 'correct') {
      const id = recommendLetterEntry(
        puzzle,
        next,
        guideActive ? firstWordGuide.entryIds : [],
      );
      if (id)
        tileAdvanceRef.current = setTimeout(
          () => changeTileState(selectLetterEntry(puzzle, next, id), 'select'),
          650,
        );
    }
  }

  function clearProgress() {
    setCellValues({});
    setTileInput(undefined);
    setTileStatus('idle');
    setHintCount(0);
    setSelectedDirection('across');
    setSelectedEntryId(getInitialEntryId(puzzle));
    setSelectedCellKey(getInitialEntryStartCellKey(puzzle));
    setNotice(t('진행 상황을 초기화했습니다.'));
    clearStoredProgress(puzzle.puzzleId);
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
        setNotice(t('오늘 시도 기회를 모두 사용했습니다.'));
        return;
      }

      setMission(startMissionForPuzzle(puzzle, mission, selectedPuzzleSummary));
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
    gameAnalytics.track(
      'game_puzzle_start',
      getGamePuzzleContext(targetPuzzle),
      {
        attemptKind: 'first',
        attemptNumber: nextMission.attemptsUsed,
      },
    );
    return nextMission;
  }

  // 홈 사다리 단계 탭·하단 CTA. 단계의 퍼즐을 로드해 바로 시작(필요 시 첫 시도)하고
  // 풀이 화면으로 간다. 완료 판은 결과 화면으로 간다. 웹 startLadderStep과 같은
  // home_quick_start(source=ladder_step_N) 계측을 남긴다.
  async function startDailyPuzzle(puzzleId: string) {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    const session = await loadPuzzleSession(puzzleId, puzzlePack);
    if (session == null) {
      setIsLoading(false);
      setNotice(t('퍼즐 데이터를 찾을 수 없습니다.'));
      telemetry.click(HOME_QUICK_START_EVENT, {
        puzzle_id: puzzleId,
        source: 'single_daily',
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

    applyPuzzleSession(session, true);
    setMission(nextMission);
    setIsLoading(false);
    telemetry.click(HOME_QUICK_START_EVENT, {
      ...getPuzzleTelemetryParams(session.nextPuzzle, summary),
      source: 'single_daily',
      status: 'loaded',
    });
    // 완료했거나 도전 기회를 모두 써 더 풀 수 없는 판은 결과 화면으로 보낸다(이전 홈
    // CTA와 동일). 풀이 화면은 읽기 전용이라 결과 동선이 없다.
    const isExhausted =
      nextMission.completedAt == null &&
      alreadyStarted &&
      getRemainingAttempts(nextMission) === 0;
    navigateTo(
      nextMission.completedAt != null ||
        getCompletedEntries(
          session.nextPuzzle.entries,
          session.savedProgress.cellValues,
        ).length === session.nextPuzzle.entries.length ||
        isExhausted
        ? 'result'
        : 'today',
    );
  }

  function restartMissionAttempt() {
    if (remainingAttempts === 0 || isCompleted) {
      setNotice(t('다시 풀 수 있는 시도 기회가 없습니다.'));
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
          <Text style={styles.progressLabel}>{t('완료')}</Text>
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
        {renderHeader(
          t('이어 풀기'),
          t('못 끝낸 퍼즐 {0}개', incomplete.length),
        )}
        {incomplete.length > 0 ? (
          incomplete.map(record => {
            const state = dateCardStates[record.puzzleId];
            const isExhausted =
              (state?.attemptsUsed ?? 0) >= DAILY_ATTEMPT_LIMIT;
            return (
              <Pressable
                key={record.puzzleId}
                testID={`resume-puzzle-${record.puzzleId}`}
                accessibilityRole="button"
                onPress={() => {
                  void selectPuzzle(
                    record.puzzleId,
                    isExhausted ? 'result' : 'today',
                  );
                }}
                style={styles.summaryPanel}
              >
                <Text style={styles.panelTitle}>
                  {record.puzzle.gridSize}×{record.puzzle.gridSize}
                  {t('판')}
                </Text>
                <Text style={styles.smallText}>
                  {record.puzzle.entries.length}
                  {t('개 단어 ·')}{' '}
                  {isExhausted ? t('결과 보기') : t('이어 풀기')}
                  {t('· 기기 저장 사본')}
                </Text>
              </Pressable>
            );
          })
        ) : (
          <View style={styles.summaryPanel}>
            <Text style={styles.smallText}>
              {t('못 끝낸 퍼즐이 없어요. 오늘의 퍼즐을 풀어보세요.')}
            </Text>
          </View>
        )}
        <Pressable
          onPress={() => navigateTo('home')}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>{t('홈으로')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  function renderHome() {
    const saved = dailySummary
      ? dateCardStates[dailySummary.puzzleId]
      : undefined;
    return (
      <TileHomeScreen
        completedToday={completedToday}
        puzzle={homePreview}
        date={todayKey}
        finished={completedToday >= 5}
        started={(saved?.attemptsUsed ?? 0) > 0 || saved?.hasProgress === true}
        streak={consecutiveStreak}
        week={weeklyStrip}
        offline={puzzlePack.source === 'bundled'}
        loadError={homeLoadError}
        onRetry={() => {
          setIsLoading(true);
          setHomePreviewError(false);
          setPackReload(value => value + 1);
        }}
        onStart={() => {
          if (dailySummary)
            startDailyPuzzle(dailySummary.puzzleId).catch(() => {
              setIsLoading(false);
              setNotice(t('퍼즐을 불러오지 못했어요. 다시 눌러주세요.'));
            });
        }}
        onResume={() => navigateTo('resume')}
        onHistory={() => {
          telemetry.click('history_open', { source: 'home_card' });
          navigateTo('history');
        }}
        onSettings={() => setSettingsOpen(true)}
        onLicense={() => navigateTo('license')}
      />
    );
  }

  function renderToday() {
    const seconds =
      computeElapsedSeconds({
        startedAt: mission.lastStartedAt,
        endedAt: mission.completedAt,
        pausedAt: mission.pausedAt ?? undefined,
        pausedMs: mission.pausedMs,
        now: tileClock,
      }) ?? 0;
    return (
      <TilePuzzleScreen
        puzzle={puzzle}
        state={tileState}
        hasStarted={hasStarted}
        isPaused={mission.pausedAt != null}
        onChange={changeTileState}
        onBack={() => navigateTo('home')}
        onStart={startOrResumeMission}
        onResume={() =>
          setMission(previous => ({
            ...previous,
            ...togglePauseState(previous, new Date()),
          }))
        }
        onPause={
          hasStarted && !isCompleted
            ? () =>
                setMission(previous => ({
                  ...previous,
                  ...togglePauseState(previous, new Date()),
                }))
            : undefined
        }
        onSettings={() => setSettingsOpen(true)}
        feedback={tileFeedback || progressToast.message || undefined}
        textScale={tileTextScale}
        timer={
          tileTimerVisible
            ? `${Math.floor(seconds / 60)}:${String(
                Math.floor(seconds) % 60,
              ).padStart(2, '0')}`
            : undefined
        }
        guide={
          guideActive
            ? {
                completed: guideCompleted,
                total: firstWordGuide.entryIds.length,
                onSkip: () => {
                  setFirstWordGuide({ ...firstWordGuide, status: 'skipped' });
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
      />
    );
  }

  async function leaveResult(next: boolean) {
    if (completionNavigationRef.current) return;
    completionNavigationRef.current = true;
    setCompletionNavigationBusy(true);
    try {
      await transition.leave(
        puzzle.puzzleId,
        isCompleted && puzzle.dailySequence != null,
        async () => {
          const upcoming = todayPuzzles.find(
            row =>
              row.puzzleId !== puzzle.puzzleId &&
              !dateCardStates[row.puzzleId]?.completedAt,
          );
          if (next && upcoming) await startDailyPuzzle(upcoming.puzzleId);
          else navigateTo('home');
        },
        async () => {
          await AsyncStorage.setItem(
            getProgressKey(puzzle.puzzleId),
            JSON.stringify({
              cellValues,
              hintCount,
              earnedHintCredits,
              tileInput,
            }),
          );
          await AsyncStorage.setItem(
            getMissionKey(mission.date, mission.puzzleId),
            JSON.stringify(mission),
          );
          await savePuzzleSnapshot(puzzle, {
            completedAt: mission.completedAt,
            hintCount,
          });
        },
      );
    } catch {
      setNotice(t('진행을 저장하지 못했어요. 저장 공간을 확인해 주세요.'));
    } finally {
      completionNavigationRef.current = false;
      setCompletionNavigationBusy(false);
    }
  }
  function renderResult() {
    const elapsed = formatElapsedTime(
      mission.lastStartedAt,
      mission.completedAt,
      mission.pausedMs,
    );
    return (
      <TileResultScreen
        busy={completionNavigationBusy}
        notice={
          /못|없습니다|실패|couldn.t|failed/i.test(tileFeedback)
            ? tileFeedback
            : undefined
        }
        primaryLabel={
          todayPuzzles.some(
            row =>
              row.puzzleId !== puzzle.puzzleId &&
              !dateCardStates[row.puzzleId]?.completedAt,
          )
            ? t('다음 판')
            : completedToday >= 5
              ? t('오늘 완료, 홈으로')
              : t('홈으로 돌아가기')
        }
        puzzle={puzzle}
        values={cellValues}
        completed={viewModel.completedEntries.length}
        elapsed={elapsed}
        streak={consecutiveStreak}
        best={isNewBestTime}
        onHome={() => {
          if (
            todayPuzzles.some(
              row =>
                row.puzzleId !== puzzle.puzzleId &&
                !dateCardStates[row.puzzleId]?.completedAt,
            )
          )
            navigateTo('home');
          else void leaveResult(false);
        }}
        onPrimary={() => {
          void leaveResult(true);
        }}
        onHistory={() => {
          telemetry.click('history_open', { source: 'result_screen' });
          navigateTo('history');
        }}
        onReview={() => navigateTo('today')}
        onShare={() => {
          void shareResultText({
            text: buildMobileShareText({
              puzzle,
              cellValues,
              puzzleLabel: puzzle.date,
              elapsedLabel: elapsed,
              hintCount,
              attemptsUsed: mission.attemptsUsed,
              completedCount: viewModel.completedEntries.length,
              totalCount: puzzle.entries.length,
              consecutiveStreak,
              isComplete: isCompleted,
              revealUsed: false,
            }),
            surface: 'result_screen',
            clickParams: {
              puzzleId: puzzle.puzzleId,
              difficulty: puzzle.difficulty,
            },
          });
        }}
        onLeaderboard={
          leaderboardVisible && isCompleted
            ? () => {
                void openLeaderboard();
              }
            : undefined
        }
        leaderboardOpenFailed={leaderboardOpenFailed}
        onRetry={
          !isCompleted && remainingAttempts > 0
            ? restartMissionAttempt
            : undefined
        }
        reminder={
          returnReminderPreprompt
            ? {
                body: formatReturnReminderPrepromptBody(
                  returnReminderPreprompt.streakDays,
                  language,
                ),
                accept: () => {
                  void acceptReturnReminder();
                },
                decline: () => {
                  void declineReturnReminder();
                },
              }
            : undefined
        }
      />
    );
  }

  function renderHistory() {
    const historySummaries = sortPuzzleSummariesByRecency(
      uniquePuzzleSummaries([
        ...puzzlePack.summaries,
        ...puzzleArchiveRecords.map(record =>
          createPuzzleSummary(record.puzzle),
        ),
      ]),
    ).filter(summary => isPublishedPuzzle(summary));

    return (
      <ScrollView contentContainerStyle={styles.homeContent}>
        {renderHeader(
          t('퍼즐 기록'),
          puzzleArchiveRecords.length > 0
            ? t('기기 저장 사본')
            : t('최근 공개 퍼즐'),
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
              testID={`history-puzzle-${summary.puzzleId}`}
              accessibilityRole="button"
              onPress={() => {
                void selectPuzzle(
                  summary.puzzleId,
                  state?.completedAt != null ||
                    (state?.attemptsUsed ?? 0) >= DAILY_ATTEMPT_LIMIT
                    ? 'result'
                    : 'today',
                );
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
                  {summary.date} · {summary.metrics?.wordCount ?? '-'}
                  {t('단어')}
                </Text>
              </View>
              <Text style={styles.historyState}>
                {state?.completedAt != null
                  ? t('완료')
                  : (state?.attemptsUsed ?? 0) >= DAILY_ATTEMPT_LIMIT
                    ? t('도전 종료')
                    : state?.hasProgress
                      ? t('진행 중')
                      : t('대기')}
              </Text>
            </Pressable>
          );
        })}
        <View style={styles.policyPanel}>
          <Text style={styles.policyTitle}>{t('기기 저장 기록')}</Text>
          <Text style={styles.smallText}>
            {t(
              '시작하거나 완료한 퍼즐은 기기에 스냅샷으로 남습니다. 원격 보존 기간에서 빠진 퍼즐도 앱 데이터가 유지되는 동안 다시 열 수 있습니다.',
            )}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => navigateTo('home')}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>{t('홈으로')}</Text>
          </Pressable>
          <Pressable
            onPress={() => navigateTo('license')}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>{t('출처')}</Text>
          </Pressable>
          {Platform.OS !== 'ios' ? (
            <Pressable
              accessibilityLabel={t('광고 개인정보 설정')}
              onPress={openAdPrivacySettings}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                {t('광고 개인정보 설정')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  function renderLicense() {
    return (
      <ScrollView contentContainerStyle={styles.homeContent}>
        {renderHeader(t('자료 출처'), t('라이선스'))}
        <View style={styles.summaryPanel}>
          <Pressable>
            <Text style={styles.panelTitle}>{t('한국어기초사전')}</Text>
          </Pressable>
          <Text style={styles.summaryText}>
            {t(
              '일부 단어 힌트는 국립국어원 한국어기초사전 뜻풀이를 바탕으로 구성했습니다.',
            )}
          </Text>
          <Text style={styles.smallText}>
            {t(
              'Creative Commons Attribution-ShareAlike 2.0 Korea 조건을 따릅니다.',
            )}
          </Text>
        </View>
        <View style={styles.summaryPanel}>
          <Text style={styles.panelTitle}>{t('영어 단서 출처')}</Text>
          <Text style={styles.smallText}>
            {WORDNET_LICENSE + '\n' + WORDFREQ_NOTICE}
          </Text>
        </View>
        <Pressable
          onPress={() => navigateTo('home')}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>{t('홈으로')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f3e7" />
        <View style={styles.loadingScreen}>
          <ActivityIndicator color="#0f766e" size="large" />
          <Text style={styles.notice}>
            {t('퍼즐 데이터를 불러오는 중입니다.')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (
    (route === 'today' || route === 'result') &&
    puzzleLanguage(puzzle) !== language
  ) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <Text accessibilityRole="alert" style={styles.notice}>
            {t(
              '퍼즐을 불러오지 못했어요. 연결을 확인한 뒤 다시 불러와 주세요.',
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={() => navigateTo('home')}
          >
            <Text style={styles.secondaryButtonText}>
              {t('홈으로 돌아가기')}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f3e7" />
      <View style={{ flex: 1 }}>
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

        <Modal
          visible={settingsOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setSettingsOpen(false)}
        >
          <View
            style={{
              flex: 1,
              justifyContent: 'flex-end',
              backgroundColor: '#26402c55',
            }}
          >
            <View
              style={{
                padding: 24,
                backgroundColor: '#fffdf3',
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
              }}
            >
              <Text
                style={{ fontSize: 22, fontWeight: '700', color: '#254344' }}
              >
                {t('설정')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                {(['ko', 'en'] as const).map(value => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: language === value }}
                    onPress={() => {
                      void selectLanguage(value);
                    }}
                    style={{ minHeight: 48, justifyContent: 'center' }}
                  >
                    <Text>{value === 'ko' ? '한국어' : 'English'}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('글자 크기')}
                style={{ minHeight: 56, justifyContent: 'center' }}
                onPress={() => {
                  const next = tileTextScale === 1 ? 1.15 : 1;
                  setTileTextScale(next);
                  AsyncStorage.setItem(
                    'crossword-puzzle:tile-display:v1',
                    JSON.stringify({
                      large: next > 1,
                      timer: tileTimerVisible,
                    }),
                  ).catch(() => {});
                }}
              >
                <Text>
                  {t('글자 크기:')}
                  {tileTextScale === 1 ? t('보통') : t('크게')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('타이머 표시')}
                style={{ minHeight: 56, justifyContent: 'center' }}
                onPress={() => {
                  setTileTimerVisible(!tileTimerVisible);
                  AsyncStorage.setItem(
                    'crossword-puzzle:tile-display:v1',
                    JSON.stringify({
                      large: tileTextScale > 1,
                      timer: !tileTimerVisible,
                    }),
                  ).catch(() => {});
                }}
              >
                <Text>
                  {t('타이머:')}
                  {tileTimerVisible ? t('켜짐') : t('꺼짐')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={t('사용 통계')}
                aria-checked={usageStatisticsState.enabled}
                accessibilityState={{
                  checked: usageStatisticsState.enabled,
                  disabled:
                    !usageStatisticsState.ready || usageStatisticsState.busy,
                }}
                disabled={
                  !usageStatisticsState.ready || usageStatisticsState.busy
                }
                style={{
                  minHeight: 56,
                  justifyContent: 'center',
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: usageStatisticsState.enabled
                    ? '#e6f0de'
                    : '#efeee6',
                }}
                onPress={() => {
                  void usageStatistics.setEnabled(
                    !usageStatisticsState.enabled,
                  );
                }}
              >
                <Text>
                  {t('사용 통계:')}
                  {usageStatisticsState.enabled ? t('켜짐') : t('꺼짐')}
                </Text>
                <Text>
                  {t(
                    '앱 개선을 위한 이용 통계예요. 꺼도 퍼즐 기록은 유지돼요.',
                  )}
                </Text>
              </Pressable>
              {usageStatisticsState.error ? (
                <Text accessibilityRole="alert">
                  {usageStatisticsState.error === 'storage'
                    ? t(
                        '설정을 저장하지 못했어요. 이번 실행에만 적용되므로 다음 실행에서 다시 확인해 주세요.',
                      )
                    : t('통계 설정을 적용하지 못했어요. 다시 선택해 주세요.')}
                </Text>
              ) : null}
              {Platform.OS !== 'ios' ? (
                <Pressable
                  accessibilityRole="button"
                  style={{ minHeight: 56, justifyContent: 'center' }}
                  onPress={openAdPrivacySettings}
                >
                  <Text>{t('광고 개인정보 설정')}</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                style={{ minHeight: 56, justifyContent: 'center' }}
                onPress={() => setSettingsOpen(false)}
              >
                <Text>{t('닫기')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
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
  eyebrow: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '900',
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
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  notice: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
    minHeight: 18,
  },
  panelTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  policyPanel: {
    backgroundColor: '#f8f3e7',
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
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
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
    backgroundColor: '#f8f3e7',
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
  smallText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
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
  completionDialogActions: {
    flexDirection: 'row',
    gap: 8,
  },
});

export default App;
