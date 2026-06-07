import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {
  buildCellEntries,
  buildStartLabels,
  completeMission,
  createDailyMissionState,
  createEmptyProgress,
  getBounds,
  getCellKey,
  getCompletedEntries,
  getEntryAnswerValue,
  getEntryCells,
  getInitialEntryId,
  getRemainingAttempts,
  getTodayDateKey,
  startMissionAttempt,
  validatePuzzleSlots,
  type DailyMissionState,
  type Direction,
  type Puzzle,
  type PuzzleEntry,
  type PuzzleManifest,
  type PuzzleManifestItem,
  type SavedProgress,
} from '../../packages/crossword-core/src';

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
  selectedAnswer: string;
  selectedCells: Set<string>;
  selectedEntry?: PuzzleEntry;
  startLabels: Map<string, number>;
  slotValidationPass: boolean;
};

const DAILY_ATTEMPT_LIMIT = 3;
const DEFAULT_HINT_CREDITS = 3;
const VISIBLE_PUZZLE_COUNT = 7;
const REMOTE_PUZZLE_PACK_BASE_URL = 'https://crossword-puzzle-79ae0.web.app';
const PROGRESS_KEY_PREFIX = 'crossword-puzzle:progress';
const MISSION_KEY_PREFIX = 'crossword-puzzle:mission';

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

function getPuzzleSortKey(puzzle: PuzzleManifestItem) {
  return puzzle.publishedAt ?? puzzle.slotId ?? puzzle.date ?? puzzle.puzzleId;
}

function sortPuzzleSummaries(puzzles: PuzzleManifestItem[]) {
  return dedupePuzzleSummaries(
    [...puzzles].sort((left, right) =>
      getPuzzleSortKey(right).localeCompare(getPuzzleSortKey(left)),
    ),
  );
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
    puzzles.find(summary => summary.date <= today)?.puzzleId ??
    puzzles[0]?.puzzleId ??
    fallbackPuzzle.puzzleId
  );
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

function normalizeProgress(value: Partial<SavedProgress> | null): SavedProgress {
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
    await AsyncStorage.setItem(getProgressKey(puzzleId), JSON.stringify(progress));
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

async function loadPuzzleSession(
  puzzleId: string,
  pack: PuzzlePack,
): Promise<PuzzleSession | null> {
  const nextPuzzle = await loadPuzzleFromPack(puzzleId, pack);

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
  const entries = await Promise.all(
    summaries.map(async summary => {
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

function normalizeAnswerInput(value: string, maxLength: number) {
  return [...value.replace(/\s/g, '')].slice(0, maxLength).join('');
}

function getEntryCellKeys(entry: PuzzleEntry) {
  return getEntryCells(entry).map(cell => getCellKey(cell.row, cell.col));
}

function AppContent() {
  const {width} = useWindowDimensions();
  const isWide = width >= 760;
  const [route, setRoute] = useState<AppRoute>('home');
  const [isLoading, setIsLoading] = useState(true);
  const [puzzle, setPuzzle] = useState(initialPuzzle);
  const [dateCardStates, setDateCardStates] = useState<
    Record<string, DateCardState>
  >({});
  const [puzzlePack, setPuzzlePack] = useState<PuzzlePack>(bundledPuzzlePack);
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

  const viewModel = usePuzzleViewModel(
    puzzle,
    selectedEntryId,
    selectedDirection,
    cellValues,
  );
  const completedCellKeys = useMemo(
    () =>
      new Set(
        viewModel.completedEntries.flatMap(entry => getEntryCellKeys(entry)),
      ),
    [viewModel.completedEntries],
  );
  const progressPercent = getProgressPercent(
    viewModel.completedEntries.length,
    puzzle.entries.length,
  );
  const remainingAttempts = getRemainingAttempts(mission);
  const totalHintCredits = DEFAULT_HINT_CREDITS + earnedHintCredits;
  const remainingHintCredits = Math.max(0, totalHintCredits - hintCount);
  const hasProgress =
    Object.keys(cellValues).length > 0 ||
    earnedHintCredits > 0 ||
    hintCount > 0 ||
    viewModel.completedEntries.length > 0;
  const hasStarted = mission.attemptsUsed > 0 || hasProgress;
  const isCompleted = viewModel.isComplete || mission.completedAt != null;
  const visiblePuzzleSummaries = useMemo(
    () => puzzlePack.summaries.slice(0, VISIBLE_PUZZLE_COUNT),
    [puzzlePack.summaries],
  );
  const boardCellSize = Math.max(
    32,
    Math.min(48, Math.floor((width - (isWide ? 440 : 40)) / viewModel.cols.length)),
  );

  useEffect(() => {
    let isCancelled = false;

    async function hydrateInitialSession() {
      let nextPuzzlePack = bundledPuzzlePack;

      try {
        nextPuzzlePack = await loadRemotePuzzlePack();
      } catch {
        nextPuzzlePack = bundledPuzzlePack;
      }

      const nextSummaries = nextPuzzlePack.summaries.slice(
        0,
        VISIBLE_PUZZLE_COUNT,
      );
      const initialPuzzleId = getInitialPuzzleId(nextSummaries);
      const [states, session] = await Promise.all([
        loadDateCardStates(nextSummaries),
        loadPuzzleSession(initialPuzzleId, nextPuzzlePack),
      ]);

      if (isCancelled) {
        return;
      }

      setPuzzlePack(nextPuzzlePack);
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
    setNotice('퍼즐을 완료했습니다.');
    setRoute('result');
  }, [isLoading, mission, viewModel.isComplete]);

  function applyPuzzleSession(session: PuzzleSession | null) {
    if (session == null) {
      return;
    }

    setPuzzle(session.nextPuzzle);
    setCellValues(session.savedProgress.cellValues);
    setEarnedHintCredits(session.savedProgress.earnedHintCredits);
    setHintCount(session.savedProgress.hintCount);
    setMission(session.savedMission);
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
    }
  }

  function selectEntry(entry: PuzzleEntry, cellKey?: string) {
    setSelectedEntryId(entry.id);
    setSelectedDirection(entry.direction);
    setSelectedCellKey(cellKey ?? getCellKey(entry.row, entry.col));
    setNotice(`${directionLabels[entry.direction]} ${entry.answer.length}글자`);
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
  }

  function moveToNextUncompletedEntry(nextCellValues: Record<string, string>) {
    const nextEntry = puzzle.entries.find(
      entry => getEntryAnswerValue(entry, nextCellValues) !== entry.answer,
    );

    if (nextEntry != null) {
      selectEntry(nextEntry);
    }
  }

  function updateSelectedAnswer(value: string) {
    const selectedEntry = viewModel.selectedEntry;

    if (selectedEntry == null) {
      return;
    }

    const nextAnswer = normalizeAnswerInput(value, selectedEntry.answer.length);
    const nextLetters = [...nextAnswer];
    const cells = getEntryCells(selectedEntry);
    const nextValues = {...cellValues};

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

    if (nextAnswer === selectedEntry.answer) {
      setNotice('정답입니다.');
      moveToNextUncompletedEntry(nextValues);
    } else {
      setNotice(`${directionLabels[selectedEntry.direction]} 답을 입력 중입니다.`);
    }
  }

  function checkSelectedAnswer() {
    const selectedEntry = viewModel.selectedEntry;

    if (selectedEntry == null) {
      return;
    }

    if (viewModel.selectedAnswer === selectedEntry.answer) {
      setNotice('정답입니다.');
      moveToNextUncompletedEntry(cellValues);
      return;
    }

    setNotice(`아직 맞지 않습니다. ${selectedEntry.answer.length}글자를 확인하세요.`);
  }

  function clearSelectedAnswer() {
    const selectedEntry = viewModel.selectedEntry;

    if (selectedEntry == null) {
      return;
    }

    setCellValues(previous => {
      const nextValues = {...previous};
      getEntryCells(selectedEntry).forEach(cell => {
        delete nextValues[getCellKey(cell.row, cell.col)];
      });
      return nextValues;
    });
    setSelectedCellKey(getCellKey(selectedEntry.row, selectedEntry.col));
    setNotice('선택한 단어를 비웠습니다.');
  }

  function revealLetter() {
    const selectedEntry = viewModel.selectedEntry;

    if (selectedEntry == null) {
      return;
    }

    if (remainingHintCredits === 0) {
      setNotice('무료 힌트를 모두 사용했습니다. iOS 광고 힌트는 아직 연결 전입니다.');
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

    setHintCount(previous => previous + 1);
    setCellValues(nextValues);
    setSelectedCellKey(targetKey);
    setNotice(`힌트 1개를 사용했습니다. 남은 힌트 ${remainingHintCredits - 1}개`);

    if (getEntryAnswerValue(selectedEntry, nextValues) === selectedEntry.answer) {
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
    setRoute('today');
  }

  function renderHeader(title: string, subtitle?: string) {
    return (
      <View style={styles.header}>
        <View style={styles.headerText}>
          {subtitle != null ? <Text style={styles.eyebrow}>{subtitle}</Text> : null}
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
        contentContainerStyle={styles.dateList}>
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
              ]}>
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

        <View style={styles.summaryPanel}>
          <Text style={styles.panelTitle}>오늘의 퍼즐</Text>
          <Text style={styles.summaryText}>
            {puzzle.entries.length}개 단어 · {puzzle.gridSize}x{puzzle.gridSize}{' '}
            보드 · {directionLabels[viewModel.selectedEntry?.direction ?? 'across']}{' '}
            힌트부터 시작
          </Text>
          <View style={styles.statusGrid}>
            <Metric label="시도" value={`${mission.attemptsUsed}/${DAILY_ATTEMPT_LIMIT}`} />
            <Metric label="힌트" value={`${remainingHintCredits}/${totalHintCredits}`} />
            <Metric label="완료 단어" value={`${viewModel.completedEntries.length}/${puzzle.entries.length}`} />
          </View>
          <View style={styles.actions}>
            <Pressable onPress={startOrResumeMission} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {hasStarted ? '이어 풀기' : '퍼즐 시작'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setRoute('history')} style={styles.secondaryButton}>
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
            일부 힌트는 국립국어원 한국어기초사전 뜻풀이를 바탕으로 구성했습니다.
          </Text>
          <Text style={styles.smallText}>
            {puzzlePack.source === 'remote'
              ? '원격 퍼즐팩 기준'
              : '기본 퍼즐팩 기준'}
            {puzzlePack.generatedAt != null ? ` · ${puzzlePack.generatedAt}` : ''}
          </Text>
        </View>
      </ScrollView>
    );
  }

  function renderBoard() {
    return (
      <View style={styles.board}>
        {viewModel.rows.map(row => (
          <View key={row} style={styles.boardRow}>
            {viewModel.cols.map(col => {
              const key = getCellKey(row, col);
              const cell = puzzle.grid[row]?.[col] ?? '';
              const isBlock = cell === '';
              const isSelected = selectedCellKey === key;
              const isInSelectedEntry = viewModel.selectedCells.has(key);
              const startLabel = viewModel.startLabels.get(key);
              const isCompletedCell = completedCellKeys.has(key);

              return (
                <Pressable
                  accessibilityRole="button"
                  disabled={isBlock}
                  key={key}
                  onPress={() => selectCell(row, col)}
                  style={[
                    styles.cell,
                    {height: boardCellSize, width: boardCellSize},
                    isBlock && styles.cellBlock,
                    isCompletedCell && styles.cellCompleted,
                    isInSelectedEntry && styles.cellActive,
                    isSelected && styles.cellSelected,
                  ]}>
                  {!isBlock && startLabel != null ? (
                    <Text style={styles.cellNumber}>{startLabel}</Text>
                  ) : null}
                  {!isBlock ? (
                    <Text style={styles.cellLetter}>{cellValues[key] ?? ''}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    );
  }

  function renderAnswerPanel() {
    const selectedEntry = viewModel.selectedEntry;

    if (selectedEntry == null) {
      return null;
    }

    return (
      <View style={styles.answerPanel}>
        <Text style={styles.clueMeta}>
          {directionLabels[selectedEntry.direction]} · {selectedEntry.answer.length}
          글자 · 힌트 {remainingHintCredits}개
        </Text>
        <Text style={styles.currentClue}>{selectedEntry.clue}</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={updateSelectedAnswer}
          placeholder="정답 입력"
          placeholderTextColor="#8a94a6"
          style={styles.answerInput}
          value={viewModel.selectedAnswer}
        />
        <View style={styles.actions}>
          <Pressable onPress={checkSelectedAnswer} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>정답 확인</Text>
          </Pressable>
          <Pressable onPress={revealLetter} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>힌트</Text>
          </Pressable>
          <Pressable onPress={clearSelectedAnswer} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>지우기</Text>
          </Pressable>
        </View>
        <Text style={styles.notice}>{notice}</Text>
      </View>
    );
  }

  function renderClueList() {
    return (
      <View style={styles.clueList}>
        {(['across', 'down'] as Direction[]).map(direction => (
          <View key={direction} style={styles.clueSection}>
            <Text style={styles.clueSectionTitle}>{directionLabels[direction]}</Text>
            {puzzle.entries
              .filter(entry => entry.direction === direction)
              .map(entry => {
                const startLabel = viewModel.startLabels.get(
                  getCellKey(entry.row, entry.col),
                );
                const isSelected = entry.id === viewModel.selectedEntry?.id;
                const isDone = getEntryAnswerValue(entry, cellValues) === entry.answer;

                return (
                  <Pressable
                    key={entry.id}
                    onPress={() => selectEntry(entry)}
                    style={[
                      styles.clueItem,
                      isSelected && styles.clueItemSelected,
                      isDone && styles.clueItemCompleted,
                    ]}>
                    <Text style={styles.clueItemNumber}>{startLabel}</Text>
                    <Text style={styles.clueItemText}>{entry.clue}</Text>
                  </Pressable>
                );
              })}
          </View>
        ))}
      </View>
    );
  }

  function renderToday() {
    return (
      <View style={[styles.playScreen, isWide && styles.playScreenWide]}>
        <View style={[styles.boardPane, isWide && styles.boardPaneWide]}>
          {renderHeader('오늘의 퍼즐', puzzle.date)}
          {renderBoard()}
          {!isWide ? renderAnswerPanel() : null}
        </View>
        <ScrollView
          style={[styles.sidePane, isWide && styles.sidePaneWide]}
          contentContainerStyle={styles.sidePaneContent}>
          {isWide ? renderAnswerPanel() : null}
          <View style={styles.utilityRow}>
            <Pressable onPress={() => setRoute('home')} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>홈</Text>
            </Pressable>
            <Pressable onPress={clearProgress} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>초기화</Text>
            </Pressable>
          </View>
          {renderClueList()}
        </ScrollView>
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
            <Pressable onPress={startOrResumeMission} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {isCompleted ? '보드 보기' : '계속 풀기'}
              </Text>
            </Pressable>
            <Pressable
              disabled={isCompleted || remainingAttempts === 0}
              onPress={restartMissionAttempt}
              style={[
                styles.secondaryButton,
                (isCompleted || remainingAttempts === 0) && styles.disabledButton,
              ]}>
              <Text style={styles.secondaryButtonText}>다시 풀기</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  function renderHistory() {
    return (
      <ScrollView contentContainerStyle={styles.homeContent}>
        {renderHeader('퍼즐 기록', '최근 7일')}
        {visiblePuzzleSummaries.map(summary => {
          const state = dateCardStates[summary.puzzleId];

          return (
            <Pressable
              key={summary.puzzleId}
              onPress={() => {
                selectPuzzle(summary.puzzleId);
              }}
              style={[
                styles.historyItem,
                summary.puzzleId === puzzle.puzzleId && styles.historyItemSelected,
              ]}>
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
        <View style={styles.actions}>
          <Pressable onPress={() => setRoute('home')} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>홈으로</Text>
          </Pressable>
          <Pressable onPress={() => setRoute('license')} style={styles.secondaryButton}>
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
        <Pressable onPress={() => setRoute('home')} style={styles.secondaryButton}>
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}>
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
  const selectedAnswer = useMemo(
    () =>
      selectedEntry == null
        ? ''
        : getEntryAnswerValue(selectedEntry, cellValues),
    [cellValues, selectedEntry],
  );
  const rows = useMemo(
    () =>
      Array.from(
        {length: bounds.maxRow - bounds.minRow + 1},
        (_, index) => bounds.minRow + index,
      ),
    [bounds],
  );
  const cols = useMemo(
    () =>
      Array.from(
        {length: bounds.maxCol - bounds.minCol + 1},
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
      puzzle.entries.length > 0 && completedEntries.length === puzzle.entries.length,
    rows,
    selectedAnswer,
    selectedCells,
    selectedEntry,
    startLabels,
    slotValidationPass,
  };
}

function Metric({label, value}: {label: string; value: string}) {
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
  answerInput: {
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '700',
    minHeight: 48,
    paddingHorizontal: 12,
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
    borderWidth: 2,
    overflow: 'hidden',
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
  cellSelected: {
    backgroundColor: '#bef264',
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
  playScreenWide: {
    flexDirection: 'row',
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
});

export default App;
