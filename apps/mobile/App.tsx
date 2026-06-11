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
  buildStartLabels,
  completeMission,
  createDailyMissionState,
  createEmptyProgress,
  createPuzzleSummary,
  DAILY_ATTEMPT_LIMIT,
  defaultLaunchConfig,
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
  type PuzzleEntry,
  type PuzzleManifest,
  type PuzzleManifestItem,
  type SavedProgress,
  type LaunchConfig,
} from '../../packages/crossword-core/src';

import {
  listArchivedPuzzles,
  loadArchivedPuzzle,
  saveArchivedPuzzle,
  type PuzzleArchiveRecord,
  type PuzzleArchiveSaveOptions,
} from './puzzleArchive';
import { loadFirebaseLaunchConfig } from './firebaseClient';
import { telemetry } from './telemetry';
import manifestData from '../../public/puzzles/manifest.json';
import puzzle20260525 from '../../public/puzzles/2026-05-25-normal-01.json';
import puzzle20260526 from '../../public/puzzles/2026-05-26-normal-02.json';
import puzzle20260527 from '../../public/puzzles/2026-05-27-normal-03.json';
import puzzle20260528 from '../../public/puzzles/2026-05-28-normal-04.json';
import puzzle20260529 from '../../public/puzzles/2026-05-29-normal-05.json';
import puzzle20260530 from '../../public/puzzles/2026-05-30-normal-06.json';
import puzzle20260531 from '../../public/puzzles/2026-05-31-normal-07.json';

type AppRoute = 'home' | 'today' | 'result' | 'history' | 'license';

type DateCardState = {
  attemptsUsed: number;
  completedAt?: string;
  hasProgress: boolean;
  hintCount: number;
};

type PuzzleSession = {
  nextPuzzle: Puzzle;
  savedMission: DailyMissionState;
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

type BonusPuzzlePanelState = {
  candidateSummary?: PuzzleManifestItem;
  notice: string;
  status: 'available' | 'loading' | 'waiting';
};

const REMOTE_PUZZLE_PACK_BASE_URL = 'https://crossword-puzzle-79ae0.web.app';
const PROGRESS_KEY_PREFIX = 'crossword-puzzle:progress';
const MISSION_KEY_PREFIX = 'crossword-puzzle:mission';
export const ANDROID_TEXT_INPUT_REFOCUS_DELAY_MS = 32;

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
  platformOS,
}: ScheduleBoardNativeInputFocusOptions): ReturnType<typeof setTimeout> {
  const input = getInput();
  const needsAndroidRefocus =
    platformOS === 'android' && !keyboardVisible && input?.isFocused();

  if (needsAndroidRefocus) {
    input?.blur();
  }

  // Android can leave TextInput focused after the IME is hidden; wait briefly
  // after blur so the next focus request attaches a fresh input connection.
  return setTimeout(
    () => {
      onFocusTimerSettled();
      getInput()?.focus();
    },
    needsAndroidRefocus ? ANDROID_TEXT_INPUT_REFOCUS_DELAY_MS : 0,
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
    : puzzleSummaries.find(summary => summary.puzzleId === puzzleId);
}

function getPuzzleTelemetryParams(
  puzzle: Puzzle,
  summary?: PuzzleManifestItem,
) {
  return {
    difficulty: summary?.difficulty ?? puzzle.difficulty,
    grid_size: puzzle.gridSize,
    pack_id: summary?.packId ?? puzzle.packId,
    published_at: summary?.publishedAt ?? puzzle.publishedAt,
    puzzle_id: puzzle.puzzleId,
    slot_id: summary?.slotId ?? puzzle.slotId,
    word_count: summary?.metrics?.wordCount ?? puzzle.metrics.wordCount,
  };
}

function formatBonusPuzzleMeta(summary?: PuzzleManifestItem) {
  if (summary == null) {
    return '새 퍼즐 대기';
  }

  const wordCountLabel =
    summary.metrics?.wordCount == null
      ? '단어 수 확인 중'
      : `${summary.metrics.wordCount}개 단어`;

  return `${summary.date} · ${wordCountLabel}`;
}

function getInitialEntryStartCellKey(puzzle: Puzzle) {
  const selectedEntry =
    puzzle.entries.find(entry => entry.id === getInitialEntryId(puzzle)) ??
    puzzle.entries[0];
  return selectedEntry == null
    ? ''
    : getCellKey(selectedEntry.row, selectedEntry.col);
}

function getProgressPercent(completedCount: number, totalCount: number) {
  if (totalCount === 0) {
    return 0;
  }

  return Math.round((completedCount / totalCount) * 100);
}

function getCellAnswerLetter(puzzle: Puzzle, cellKey: string) {
  const [row, col] = cellKey.split(':').map(Number);

  return puzzle.grid[row]?.[col] ?? '';
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

function formatEntryReference(
  entry: PuzzleEntry,
  startLabels: Map<string, number>,
) {
  const startLabel = startLabels.get(getCellKey(entry.row, entry.col));
  const prefix = startLabel == null ? '' : `${startLabel}번 `;

  return `${prefix}${directionLabels[entry.direction]} · ${entry.answer.length}글자`;
}

function createDateCardState(
  mission: DailyMissionState,
  progress: SavedProgress,
): DateCardState {
  return {
    attemptsUsed: mission.attemptsUsed,
    completedAt: mission.completedAt,
    hasProgress:
      Object.keys(progress.cellValues).length > 0 ||
      progress.earnedHintCredits > 0 ||
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

function normalizeMission(
  value: Partial<DailyMissionState> | null,
  date: string,
  puzzleId: string,
) {
  if (value == null || value.date !== date || value.puzzleId !== puzzleId) {
    return createDailyMissionState(date, puzzleId, DAILY_ATTEMPT_LIMIT);
  }

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
  };
}

async function loadStoredMission(date: string, puzzleId: string) {
  try {
    const raw = await AsyncStorage.getItem(getMissionKey(date, puzzleId));
    return normalizeMission(
      raw == null ? null : (JSON.parse(raw) as Partial<DailyMissionState>),
      date,
      puzzleId,
    );
  } catch {
    return createDailyMissionState(date, puzzleId, DAILY_ATTEMPT_LIMIT);
  }
}

async function saveStoredMission(mission: DailyMissionState) {
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
  const manifest = await fetchJson<PuzzleManifest>(
    `${assetBaseUrl.replace(/\/+$/, '')}/puzzles/manifest.json`,
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
    return await fetchJson<Puzzle>(resolveRemotePuzzleUrl(pack, summary.path));
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

function getAnswerInputLetters(value: string, maxLength: number) {
  return [...value.replace(/\s/g, '')].slice(0, maxLength);
}

export function getPendingAnswerCellValues(
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
      .filter(
        (cellEntry): cellEntry is readonly [string, string] =>
          cellEntry != null,
      ),
  );
}

function isHangulJamoLetter(letter: string) {
  return /^[ㄱ-ㅎㅏ-ㅣ]$/.test(letter);
}

function getAnswerCommitLetters(value: string, maxLength: number) {
  return getAnswerInputLetters(value, maxLength).filter(
    letter => !isHangulJamoLetter(letter),
  );
}

function isHangulJamoInput(value: string) {
  const letters = getAnswerInputLetters(value, value.length);

  return (
    letters.length > 0 && letters.every(letter => isHangulJamoLetter(letter))
  );
}

function hasHangulSyllableInput(value: string) {
  return /[가-힣]/.test(value);
}

function getAnswerCommitDelayMs(value: string) {
  return hasHangulSyllableInput(value) ? 800 : 100;
}

function getEntryStartCellKey(entry?: PuzzleEntry) {
  return entry == null ? '' : getCellKey(entry.row, entry.col);
}

function getEntryCellIndex(entry: PuzzleEntry, cellKey: string) {
  const cells = getEntryCells(entry);
  const index = cells.findIndex(
    cell => getCellKey(cell.row, cell.col) === cellKey,
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
    cell => cellValues[getCellKey(cell.row, cell.col)] == null,
  );

  return getEntryCellKeyAt(
    entry,
    firstEmptyIndex === -1 ? afterInputIndex : firstEmptyIndex,
  );
}

function isEntryFilled(entry: PuzzleEntry, cellValues: Record<string, string>) {
  return getEntryCells(entry).every(
    cell => cellValues[getCellKey(cell.row, cell.col)] != null,
  );
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
  const [earnedHintCredits, setEarnedHintCredits] = useState(0);
  const [hintCount, setHintCount] = useState(0);
  const [mission, setMission] = useState(() =>
    createDailyMissionState(
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
  const hasLoggedFirstAnswerInputRef = useRef(false);
  const boardInputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const answerCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const boardFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const keyboardVisibleRef = useRef(false);
  const [answerInputValue, setAnswerInputValue] = useState('');
  const [isClueListOpen, setIsClueListOpen] = useState(false);

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
  const totalHintCredits = launchConfig.defaultHintCredits + earnedHintCredits;
  const remainingHintCredits = Math.max(0, totalHintCredits - hintCount);
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
    () => getDailyFreePuzzleSummary(puzzlePack.summaries, todayKey),
    [puzzlePack.summaries, todayKey],
  );
  const dailyFreeSummaries = useMemo(
    () =>
      getDailyFreePuzzleSummaries(
        puzzlePack.summaries,
        todayKey,
        launchConfig.visiblePuzzleCount,
      ),
    [launchConfig.visiblePuzzleCount, puzzlePack.summaries, todayKey],
  );
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
  const bonusCandidateSummary = useMemo(
    () =>
      getBonusPuzzleCandidateSummary({
        completedPuzzleIds,
        dailyFreeSummary,
        puzzleSummaries: puzzlePack.summaries,
        today: todayKey,
      }),
    [completedPuzzleIds, dailyFreeSummary, puzzlePack.summaries, todayKey],
  );
  const visiblePuzzleSummaries = useMemo(
    () =>
      sortPuzzleSummariesByRecency(
        uniquePuzzleSummaries(
          [
            ...dailyFreeSummaries,
            selectedPuzzleSummary,
            ...archivePuzzleSummaries,
          ].filter((summary): summary is PuzzleManifestItem => summary != null),
        ),
      ),
    [archivePuzzleSummaries, dailyFreeSummaries, selectedPuzzleSummary],
  );
  const bonusPuzzlePanelState: BonusPuzzlePanelState = {
    candidateSummary: bonusCandidateSummary,
    notice: launchConfig.rewardedBonusPuzzleAdsEnabled
      ? '모바일 보상형 광고 어댑터 연결 후 제공됩니다.'
      : '운영 설정에서 보너스 광고가 꺼져 있습니다.',
    status: isLoading
      ? 'loading'
      : bonusCandidateSummary != null
      ? 'available'
      : 'waiting',
  };
  const boardCellSize = Math.max(
    32,
    Math.min(
      48,
      Math.floor((width - (isWide ? 440 : 40)) / viewModel.cols.length),
    ),
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
    let isCancelled = false;

    async function hydrateInitialSession() {
      let nextPuzzlePack = bundledPuzzlePack;

      try {
        nextPuzzlePack = await loadRemotePuzzlePack();
      } catch {
        nextPuzzlePack = bundledPuzzlePack;
      }

      const nextSummaries = nextPuzzlePack.summaries;
      const nextArchiveRecords = await listArchivedPuzzles();
      const hydratedSummaries = uniquePuzzleSummaries([
        ...nextSummaries,
        ...nextArchiveRecords.map(record => createPuzzleSummary(record.puzzle)),
      ]);
      const initialPuzzleId = getInitialPuzzleId(nextSummaries);
      const [states, session] = await Promise.all([
        loadDateCardStates(hydratedSummaries),
        loadPuzzleSession(initialPuzzleId, nextPuzzlePack),
      ]);

      if (isCancelled) {
        return;
      }

      setPuzzlePack(nextPuzzlePack);
      setPuzzleArchiveRecords(nextArchiveRecords);
      setDateCardStates(states);
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
    if (isLoading) {
      return;
    }

    saveStoredProgress(puzzle.puzzleId, {
      cellValues,
      earnedHintCredits,
      hintCount,
    });
  }, [cellValues, earnedHintCredits, hintCount, isLoading, puzzle.puzzleId]);

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
    earnedHintCredits,
    hintCount,
    isLoading,
    mission,
    puzzle.puzzleId,
  ]);

  useEffect(() => {
    if (isLoading || !viewModel.isComplete || mission.completedAt != null) {
      return;
    }

    const nextMission = completeMission(mission);
    setMission(nextMission);
    saveStoredMission(nextMission);
    savePuzzleSnapshot(puzzle, { completedAt: nextMission.completedAt });
    telemetry.impression('mission_complete', {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      attempt_number: mission.attemptsUsed,
      completed_word_count: viewModel.completedEntries.length,
      hint_count: hintCount,
      remaining_attempts: remainingAttempts,
    });
    setNotice('퍼즐을 완료했습니다.');
    setRoute('result');
  }, [
    hintCount,
    isLoading,
    mission,
    puzzle,
    remainingAttempts,
    savePuzzleSnapshot,
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

  const focusBoardInput = useCallback(() => {
    clearBoardFocusTimer();
    boardFocusTimerRef.current = scheduleBoardNativeInputFocus({
      getInput: () => boardInputRef.current,
      keyboardVisible: keyboardVisibleRef.current,
      onFocusTimerSettled: () => {
        boardFocusTimerRef.current = null;
      },
      platformOS: Platform.OS,
    });
  }, [clearBoardFocusTimer]);

  function applyPuzzleSession(session: PuzzleSession | null) {
    if (session == null) {
      return;
    }

    setPuzzle(session.nextPuzzle);
    setCellValues(session.savedProgress.cellValues);
    setEarnedHintCredits(session.savedProgress.earnedHintCredits);
    setHintCount(session.savedProgress.hintCount);
    setMission(session.savedMission);
    hasLoggedFirstAnswerInputRef.current = false;
    setSelectedDirection('across');
    setSelectedEntryId(getInitialEntryId(session.nextPuzzle));
    setSelectedCellKey(getInitialEntryStartCellKey(session.nextPuzzle));
    setNotice(`${session.nextPuzzle.date} 퍼즐을 불러왔습니다.`);
  }

  async function selectPuzzle(puzzleId: string) {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    const session = await loadPuzzleSession(puzzleId, puzzlePack);
    applyPuzzleSession(session);
    setIsLoading(false);
    setRoute('home');

    if (session == null) {
      setNotice('퍼즐 데이터를 찾을 수 없습니다.');
      return;
    }

    telemetry.click('puzzle_select', {
      ...getPuzzleTelemetryParams(
        session.nextPuzzle,
        findPuzzleSummaryById(puzzlePack.summaries, session.nextPuzzle.puzzleId),
      ),
      puzzle_pack_source: puzzlePack.source,
    });
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
      focusBoardInput();
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
        ? entries.find(entry => entry.id !== currentEntry.id) ?? currentEntry
        : entries.find(entry => entry.direction === selectedDirection) ??
          entries[0];

    selectEntry(nextEntry, key);
    focusBoardInput();
  }

  function moveToNextUncompletedEntry(nextCellValues: Record<string, string>) {
    const nextEntry = puzzle.entries.find(
      entry => getEntryAnswerValue(entry, nextCellValues) !== entry.answer,
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

    if (!hasLoggedFirstAnswerInputRef.current) {
      hasLoggedFirstAnswerInputRef.current = true;
      telemetry.impression('first_answer_input', {
        ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
        attempt_number: mission.attemptsUsed,
      });
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

    if (isEntryFilled(entry, nextValues)) {
      setNotice('정답입니다.');
      moveToNextUncompletedEntry(nextValues);
    } else {
      setNotice(`${directionLabels[entry.direction]} 답을 입력 중입니다.`);
    }
  }

  function clearSelectedAnswer() {
    if (selectedEntry == null) {
      return;
    }

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
      setNotice(
        '무료 힌트를 모두 사용했습니다. 모바일 광고 힌트는 아직 연결 전입니다.',
      );
      return;
    }

    const cells = getEntryCells(selectedEntry);
    const answerLetters = [...selectedEntry.answer];
    const targetIndex = cells.findIndex(
      (cell, index) =>
        cellValues[getCellKey(cell.row, cell.col)] !== answerLetters[index],
    );

    if (targetIndex === -1) {
      setNotice('선택한 단어는 이미 모두 채워졌습니다.');
      return;
    }

    const targetCell = cells[targetIndex];
    const targetKey = getCellKey(targetCell.row, targetCell.col);
    const nextValues = {
      ...cellValues,
      [targetKey]: answerLetters[targetIndex],
    };

    telemetry.click('hint_reveal', {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      hint_count: hintCount + 1,
      remaining_hint_credits: remainingHintCredits - 1,
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
      moveToNextUncompletedEntry(nextValues);
    }
  }

  function clearProgress() {
    setCellValues({});
    setEarnedHintCredits(0);
    setHintCount(0);
    setSelectedDirection('across');
    setSelectedEntryId(getInitialEntryId(puzzle));
    setSelectedCellKey(getInitialEntryStartCellKey(puzzle));
    setNotice('진행 상황을 초기화했습니다.');
    clearStoredProgress(puzzle.puzzleId);
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
    const nextLetters = getAnswerCommitLetters(
      value,
      remainingCellCount,
    );

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
      setRoute('result');
      return;
    }

    if (!hasStarted) {
      if (remainingAttempts === 0) {
        setNotice('오늘 시도 기회를 모두 사용했습니다.');
        return;
      }

      const nextMission = startMissionAttempt(mission);
      setMission(nextMission);
      saveStoredMission(nextMission);
      savePuzzleSnapshot(puzzle, { startedAt: nextMission.lastStartedAt });
      telemetry.impression('mission_start', {
        ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
        attempt_number: nextMission.attemptsUsed,
        remaining_attempts: getRemainingAttempts(nextMission),
      });
      telemetry.impression('attempt_start', {
        ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
        attempt_number: nextMission.attemptsUsed,
        remaining_attempts: getRemainingAttempts(nextMission),
      });
    }

    setRoute('today');
  }

  function restartMissionAttempt() {
    if (remainingAttempts === 0 || isCompleted) {
      setNotice('다시 풀 수 있는 시도 기회가 없습니다.');
      return;
    }

    clearProgress();
    const nextMission = startMissionAttempt(mission);
    setMission(nextMission);
    saveStoredMission(nextMission);
    savePuzzleSnapshot(puzzle, { startedAt: nextMission.lastStartedAt });
    telemetry.impression('attempt_start', {
      ...getPuzzleTelemetryParams(puzzle, selectedPuzzleSummary),
      attempt_number: nextMission.attemptsUsed,
      attempt_type: 'retry',
      remaining_attempts: getRemainingAttempts(nextMission),
    });
    setRoute('today');
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

  function renderDateSelector() {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateList}
      >
        {visiblePuzzleSummaries.map(summary => {
          const state = dateCardStates[summary.puzzleId];
          const isSelected = summary.puzzleId === puzzle.puzzleId;
          const isDone = state?.completedAt != null;

          return (
            <Pressable
              key={summary.puzzleId}
              onPress={() => {
                selectPuzzle(summary.puzzleId);
              }}
              style={[
                styles.dateCard,
                isSelected && styles.dateCardSelected,
                isDone && styles.dateCardCompleted,
              ]}
            >
              <Text style={styles.dateCardDate}>{summary.date}</Text>
              <Text style={styles.dateCardMeta}>
                {summary.metrics?.wordCount ?? '-'}단어 ·{' '}
                {state?.attemptsUsed ?? 0}/{DAILY_ATTEMPT_LIMIT}회
              </Text>
              <Text style={styles.dateCardState}>
                {isDone ? '완료' : state?.hasProgress ? '진행 중' : '대기'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  function renderHome() {
    return (
      <ScrollView contentContainerStyle={styles.homeContent}>
        {renderHeader('가로세로 낱말 퍼즐', puzzle.date)}
        {renderDateSelector()}

        <View style={styles.policyPanel}>
          <Text style={styles.policyTitle}>하루 1개 기본 공개</Text>
          <Text style={styles.smallText}>
            홈에는 하루 1개씩 최근 {launchConfig.visiblePuzzleCount}일치 무료
            퍼즐과 기기에 저장된 기록을 함께 보여줍니다. 추가 퍼즐은 보너스 해금
            흐름으로 엽니다. 원격 퍼즐은{' '}
            {launchConfig.puzzleGenerationIntervalHours}시간마다 생성되고 최근{' '}
            {launchConfig.puzzleKeepCount}개까지 유지됩니다.
          </Text>
        </View>

        <View style={styles.summaryPanel}>
          <Text style={styles.panelTitle}>오늘의 무료 퍼즐</Text>
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
              label="힌트"
              value={`${remainingHintCredits}/${totalHintCredits}`}
            />
            <Metric
              label="완료 단어"
              value={`${viewModel.completedEntries.length}/${puzzle.entries.length}`}
            />
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={startOrResumeMission}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>
                {hasStarted ? '이어 풀기' : '퍼즐 시작'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setRoute('history')}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>기록</Text>
            </Pressable>
          </View>
          <Text style={styles.notice}>{notice}</Text>
        </View>

        <BonusPuzzlePanel state={bonusPuzzlePanelState} />

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
                  pendingValue !== '' ? pendingValue : committedValue ?? '';
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
                      isCorrect && styles.cellCorrect,
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
        <TextInput
          accessible={false}
          autoCapitalize="none"
          autoCorrect={false}
          blurOnSubmit={false}
          caretHidden
          contextMenuHidden
          importantForAccessibility="no-hide-descendants"
          importantForAutofill="no"
          maxLength={Math.max(1, selectedEntryCells.length - selectedEntryIndex)}
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
          showSoftInputOnFocus
          style={styles.boardNativeInput}
          value={answerInputValue}
        />
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
                  focusBoardInput();
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
    const isReviewMode = isCompleted;

    return (
      <View style={styles.solveHeader}>
        <Pressable
          accessibilityLabel="홈으로"
          accessibilityRole="button"
          onPress={() => setRoute('home')}
          style={styles.solveHeaderIcon}
        >
          <Text style={styles.solveHeaderIconText}>홈</Text>
        </Pressable>
        <View style={styles.solveHeaderText}>
          <Text style={styles.solveHeaderEyebrow}>
            {isReviewMode ? '다 푼 퍼즐' : puzzle.date}
          </Text>
          <Text style={styles.solveHeaderTitle}>
            {viewModel.completedEntries.length}/{puzzle.entries.length} 낱말
          </Text>
        </View>
        {isReviewMode ? null : (
          <>
            <Pressable
              accessibilityLabel={
                remainingHintCredits > 0
                  ? `힌트 ${remainingHintCredits}개 남음`
                  : '힌트'
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
                <Text style={styles.iconBadgeText}>{remainingHintCredits}</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityLabel="지우기"
              accessibilityRole="button"
              onPress={clearSelectedAnswer}
              style={styles.solveHeaderIcon}
            >
              <Text style={styles.solveHeaderIconEmoji}>⌫</Text>
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
            accessibilityRole="button"
            onPress={() => {
              selectEntry(selectedEntry, activeAnswerCellKey);
              focusBoardInput();
            }}
            style={styles.solveClueInfo}
          >
            <Text style={styles.solveClueRef}>
              {formatEntryReference(selectedEntry, viewModel.startLabels)}
              {isSelectedComplete ? ' · 완료' : ''}
            </Text>
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
              key={slot.key}
              onPress={() => {
                selectEntry(selectedEntry, slot.key);
                focusBoardInput();
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
                          focusBoardInput();
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

  function renderToday() {
    return (
      <View style={styles.playScreen}>
        {renderTodayHeader()}
        {renderSolveClueBar()}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.playScreenScroll}
          contentContainerStyle={styles.playScreenScrollContent}
        >
          {renderBoard()}
          {renderSelectedClues()}
        </ScrollView>
        {renderClueListModal()}
      </View>
    );
  }

  function renderResult() {
    return (
      <ScrollView contentContainerStyle={styles.homeContent}>
        {renderHeader(isCompleted ? '퍼즐 완료' : '진행 결과', puzzle.date)}
        <View style={styles.summaryPanel}>
          <Text style={styles.panelTitle}>
            {isCompleted ? '오늘 미션을 완료했습니다.' : '아직 풀이 중입니다.'}
          </Text>
          <View style={styles.statusGrid}>
            <Metric label="진행률" value={`${progressPercent}%`} />
            <Metric label="사용 힌트" value={`${hintCount}개`} />
            <Metric label="남은 시도" value={`${remainingAttempts}회`} />
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={startOrResumeMission}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>
                {isCompleted ? '보드 보기' : '계속 풀기'}
              </Text>
            </Pressable>
            <Pressable
              disabled={isCompleted || remainingAttempts === 0}
              onPress={restartMissionAttempt}
              style={[
                styles.secondaryButton,
                (isCompleted || remainingAttempts === 0) &&
                  styles.disabledButton,
              ]}
            >
              <Text style={styles.secondaryButtonText}>다시 풀기</Text>
            </Pressable>
          </View>
        </View>
        <BonusPuzzlePanel state={bonusPuzzlePanelState} />
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
                <Text style={styles.historyTitle}>{summary.date}</Text>
                <Text style={styles.historyMeta}>
                  {summary.metrics?.wordCount ?? '-'}단어 · 힌트{' '}
                  {state?.hintCount ?? 0}개
                </Text>
              </View>
              <Text style={styles.historyState}>
                {state?.completedAt != null
                  ? '완료'
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
            onPress={() => setRoute('home')}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>홈으로</Text>
          </Pressable>
          <Pressable
            onPress={() => setRoute('license')}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>출처</Text>
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
          <Text style={styles.panelTitle}>한국어기초사전</Text>
          <Text style={styles.summaryText}>
            일부 단어 힌트는 국립국어원 한국어기초사전 뜻풀이를 바탕으로
            구성했습니다.
          </Text>
          <Text style={styles.smallText}>
            Creative Commons Attribution-ShareAlike 2.0 Korea 조건을 따릅니다.
          </Text>
        </View>
        <Pressable
          onPress={() => setRoute('home')}
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
          : route === 'license'
          ? renderLicense()
          : renderHome()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BonusPuzzlePanel({ state }: { state: BonusPuzzlePanelState }) {
  const summary = state.candidateSummary;
  const title =
    state.status === 'available'
      ? '새 퍼즐이 도착했어요'
      : state.status === 'loading'
      ? '보너스 퍼즐 확인 중'
      : '다음 보너스 퍼즐을 준비 중이에요';
  const description =
    state.status === 'available'
      ? `${formatBonusPuzzleMeta(summary)} · 광고를 보면 하나 더 풀 수 있어요.`
      : state.status === 'loading'
      ? '원격 퍼즐팩을 확인하고 있습니다.'
      : '오늘 공개된 추가 퍼즐이 생기면 여기에 표시됩니다.';

  return (
    <View
      style={[
        styles.bonusPanel,
        state.status === 'available' && styles.bonusPanelAvailable,
      ]}
    >
      <View style={styles.bonusPanelText}>
        <Text style={styles.bonusEyebrow}>하나 더 풀기</Text>
        <Text style={styles.bonusTitle}>{title}</Text>
        <Text style={styles.smallText}>{description}</Text>
        <Text style={styles.bonusNotice}>{state.notice}</Text>
      </View>
      {state.status === 'available' ? (
        <Pressable
          disabled
          style={[styles.primaryButton, styles.disabledButton]}
        >
          <Text style={styles.primaryButtonText}>광고 연결 대기</Text>
        </Pressable>
      ) : null}
    </View>
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
  answerPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe4ee',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  bonusEyebrow: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
  },
  bonusNotice: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  bonusPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#dbe4ee',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  bonusPanelAvailable: {
    borderColor: '#99f6e4',
  },
  bonusPanelText: {
    gap: 5,
  },
  bonusTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
  },
  board: {
    alignSelf: 'center',
    backgroundColor: '#1f2937',
    borderColor: '#1f2937',
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
  },
  boardFrame: {
    alignSelf: 'center',
    position: 'relative',
  },
  boardNativeInput: {
    color: 'transparent',
    height: 1,
    left: 0,
    opacity: 0.01,
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
  disabledButton: {
    opacity: 0.45,
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
  playScreen: {
    flex: 1,
    gap: 14,
    padding: 16,
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
    gap: 2,
    minWidth: 0,
  },
  solveClueRef: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
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
});

export default App;
