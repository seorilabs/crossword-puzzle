/**
 * @format
 */

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App, {
  BOARD_TEXT_INPUT_REFOCUS_DELAY_MS,
  formatCompletionStatsLabel,
  formatPuzzleCardSequenceLabel,
  formatPuzzleCardTitle,
  formatPuzzleHistoryTitle,
  formatPuzzleHomeSubtitle,
  formatPuzzleAliasLabel,
  getBackTargetRoute,
  getBoardCellFocusScrollY,
  getBoardNativeInputPosition,
  getClearAnswerTargetIndex,
  getPendingAnswerCellValues,
  loadPuzzleSession,
  scheduleBoardNativeInputFocus,
  shouldUseSystemBack,
} from '../App';
import type {
  Puzzle,
  PuzzleEntry,
  PuzzleManifestItem,
} from '../../../packages/crossword-core/src';
import {
  ARCHIVE_INDEX_KEY,
  ARCHIVE_INDEX_LIMIT,
  getArchiveKey,
  listArchivedPuzzles,
  loadArchivedPuzzle,
  saveArchivedPuzzle,
} from '../puzzleArchive';
import {
  getBonusUnlockKey,
  loadBonusPuzzleUnlocks,
  saveBonusPuzzleUnlock,
} from '../bonusPuzzleUnlockRepository';

function createPuzzle(puzzleId: string, date = '2026-06-01'): Puzzle {
  return {
    date,
    difficulty: 'normal',
    entries: [
      {
        answer: '가나',
        clue: '테스트 단서',
        col: 0,
        direction: 'across',
        generatedBy: 'placed',
        id: `${puzzleId}-entry`,
        row: 0,
      },
    ],
    grid: [
      ['가', '나'],
      ['', ''],
    ],
    gridSize: 2,
    metrics: {
      autoRunCount: 0,
      bboxDensity: 1,
      crossCells: 0,
      crossRatio: 0,
      filledCells: 2,
      multiCrossEntries: 0,
      placedWordCount: 1,
      wordCount: 1,
    },
    puzzleId,
  };
}

async function flushAsyncWork(cycles = 1) {
  for (let index = 0; index < cycles; index += 1) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

function findAncestorWithOnPress(
  node: ReactTestRenderer.ReactTestInstance | undefined,
) {
  let current = node?.parent;

  while (current != null) {
    if (typeof current.props.onPress === 'function') {
      return current;
    }

    current = current.parent;
  }

  return undefined;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flushAsyncWork(5);

  ReactTestRenderer.act(() => {
    renderer?.unmount();
  });
}, 15000);

test('formats completion stats for mobile home cards and selected mission', () => {
  expect(
    formatCompletionStatsLabel(
      {
        completionCount: 54,
        completionRate: 0.421875,
        participantCount: 128,
        puzzleId: 'stats-puzzle',
      },
      10,
      'compact',
    ),
  ).toBe('42% 완료');
  expect(
    formatCompletionStatsLabel(
      {
        completionCount: 54,
        completionRate: 0.421875,
        participantCount: 128,
        puzzleId: 'stats-puzzle',
      },
      10,
    ),
  ).toBe('128명 참여 · 54명 완료(42%)');
  expect(
    formatCompletionStatsLabel(
      {
        completionCount: 0,
        participantCount: 3,
        puzzleId: 'low-participant-puzzle',
      },
      10,
    ),
  ).toBe('10명 미만 참여');
});

test('maps Android hardware back targets through the app scene graph', () => {
  expect(shouldUseSystemBack('home')).toBe(true);
  expect(getBackTargetRoute('history')).toBe('home');
  expect(getBackTargetRoute('today')).toBe('home');
  expect(getBackTargetRoute('result')).toBe('home');
  expect(getBackTargetRoute('license')).toBe('history');
});

test('formats generated puzzle aliases as yyMMddHH labels', () => {
  const baseSummary: PuzzleManifestItem = {
    date: '2026-06-12',
    difficulty: 'normal',
    metrics: {
      autoRunCount: 0,
      bboxDensity: 1,
      crossCells: 0,
      crossRatio: 0,
      filledCells: 2,
      multiCrossEntries: 0,
      placedWordCount: 1,
      wordCount: 1,
    },
    path: '/puzzles/26061218.json',
    puzzleId: '26061218',
  };

  expect(formatPuzzleAliasLabel(baseSummary)).toBe('#26061218');
  expect(
    formatPuzzleAliasLabel({
      ...baseSummary,
      alias: '2026061218',
      puzzleId: 'pack-20260612180000-20260525',
    }),
  ).toBe('#26061218');
  expect(
    formatPuzzleAliasLabel({
      ...baseSummary,
      packId: 'pack-20260612180000-20260525',
      puzzleId: 'pack-20260612180000-20260525',
    }),
  ).toBe('#26061218');
});

test('formats mobile home puzzle labels without exposing remote ids', () => {
  const summary: PuzzleManifestItem = {
    date: '2026-06-12',
    difficulty: 'normal',
    metrics: {
      autoRunCount: 0,
      bboxDensity: 1,
      crossCells: 0,
      crossRatio: 0,
      filledCells: 2,
      multiCrossEntries: 0,
      placedWordCount: 1,
      wordCount: 1,
    },
    path: '/puzzles/26061218.json',
    puzzleId: '26061218',
  };

  expect(formatPuzzleHomeSubtitle(summary, 'remote')).toBe('6.12 금요일');
  expect(formatPuzzleCardTitle(summary, 'remote')).toBe('6.12 금');
  expect(formatPuzzleHomeSubtitle(summary, 'bundled')).toBe('2026-06-12');
  expect(formatPuzzleCardTitle(summary, 'bundled')).toBe('2026-06-12');
});

test('formats two-digit puzzle sequence labels from two-hour slots', () => {
  const summary: PuzzleManifestItem = {
    date: '2026-06-12',
    difficulty: 'normal',
    metrics: {
      autoRunCount: 0,
      bboxDensity: 1,
      crossCells: 0,
      crossRatio: 0,
      filledCells: 2,
      multiCrossEntries: 0,
      placedWordCount: 1,
      wordCount: 1,
    },
    path: '/puzzles/26061218.json',
    puzzleId: '26061218',
  };

  expect(
    formatPuzzleCardSequenceLabel({
      ...summary,
      publishedAt: '2026-06-11T15:00:00.000Z',
    }),
  ).toBe('퍼즐 01번');
  expect(
    formatPuzzleCardSequenceLabel({
      ...summary,
      publishedAt: '2026-06-12T09:00:00.000Z',
    }),
  ).toBe('퍼즐 10번');
  expect(
    formatPuzzleCardSequenceLabel({
      ...summary,
      slotId: '2026-06-12-h22',
    }),
  ).toBe('퍼즐 12번');
  expect(
    formatPuzzleCardSequenceLabel({
      ...summary,
      publishedAt: '2026-06-12T09:00:00.000Z',
      slotId: '2026-06-12-h99',
    }),
  ).toBe('퍼즐 10번');
  expect(
    formatPuzzleCardSequenceLabel({
      ...summary,
      publishedAt: undefined,
      slotId: undefined,
    }),
  ).toBe('퍼즐 --번');
});

test('formats history titles with home sequence labels for remote puzzles', () => {
  const summary: PuzzleManifestItem = {
    alias: '2026061222',
    date: '2026-06-12',
    difficulty: 'normal',
    metrics: {
      autoRunCount: 0,
      bboxDensity: 1,
      crossCells: 0,
      crossRatio: 0,
      filledCells: 2,
      multiCrossEntries: 0,
      placedWordCount: 1,
      wordCount: 1,
    },
    path: '/puzzles/26061222.json',
    puzzleId: '26061222',
    slotId: '2026-06-12-h22',
  };

  expect(formatPuzzleHistoryTitle(summary, 'remote')).toBe(
    '퍼즐 12번 · #26061222',
  );
  expect(formatPuzzleHistoryTitle(summary, 'bundled')).toBe('#26061222');
});

test('maps pending Korean composition directly onto board cells', () => {
  const entry = {
    answer: '관포지교',
    clue: '오랜 우정',
    col: 0,
    direction: 'across' as const,
    generatedBy: 'placed' as const,
    id: 'korean-composition-entry',
    row: 0,
  };

  expect(getPendingAnswerCellValues(entry, 'ㄱ', '0:0')).toEqual({
    '0:0': 'ㄱ',
  });
  expect(getPendingAnswerCellValues(entry, '관포', '0:0')).toEqual({
    '0:0': '관',
    '0:1': '포',
  });
  expect(getPendingAnswerCellValues(entry, '지교', '0:2')).toEqual({
    '0:2': '지',
    '0:3': '교',
  });
});

test('leaves the hidden board input uncapped for Korean IME composition', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flushAsyncWork(5);

  const startLabel = renderer?.root.find(
    node =>
      node.children.some(
        child =>
          typeof child === 'string' &&
          ['퍼즐 시작', '이어 풀기'].includes(child),
      ),
  );
  const startButton = findAncestorWithOnPress(startLabel);

  expect(startButton?.props.onPress).toEqual(expect.any(Function));

  await ReactTestRenderer.act(() => {
    startButton?.props.onPress();
  });

  const boardInput = renderer?.root
    .findAllByType(TextInput)
    .find(node => node.props.caretHidden);

  expect(boardInput?.props.maxLength).toBeUndefined();

  ReactTestRenderer.act(() => {
    renderer?.unmount();
  });
});

test('positions the hidden board input on the active puzzle cell', () => {
  const bounds = { maxCol: 8, maxRow: 8, minCol: 3, minRow: 2 };

  expect(getBoardNativeInputPosition('2:3', bounds, 40)).toEqual({
    left: 2,
    top: 2,
  });
  expect(getBoardNativeInputPosition('5:7', bounds, 40)).toEqual({
    left: 162,
    top: 122,
  });
  expect(getBoardCellFocusScrollY(122, 40)).toBe(58);
});

test('skips locked correct letters when choosing the backspace target', () => {
  const lockPuzzle = {
    ...createPuzzle('lock-puzzle'),
    grid: [
      ['가', '나', '다'],
      ['', '', ''],
      ['', '', ''],
    ],
    gridSize: 3,
  } as unknown as Puzzle;
  const entry: PuzzleEntry = {
    answer: '가나다',
    clue: '잠금 테스트',
    col: 0,
    direction: 'across',
    generatedBy: 'placed',
    id: 'lock-entry',
    row: 0,
  };

  // Caret on a wrong (editable) filled cell deletes that cell.
  expect(getClearAnswerTargetIndex(lockPuzzle, entry, { '0:0': 'X' }, 0)).toBe(
    0,
  );

  // Caret on an empty cell steps back to the nearest editable (wrong) cell,
  // skipping past the locked correct first cell.
  expect(
    getClearAnswerTargetIndex(
      lockPuzzle,
      entry,
      { '0:0': '가', '0:1': 'X' },
      2,
    ),
  ).toBe(1);

  // When every earlier cell is locked correct, nothing is deletable.
  expect(
    getClearAnswerTargetIndex(
      lockPuzzle,
      entry,
      { '0:0': '가', '0:1': '나' },
      2,
    ),
  ).toBe(-1);

  // Caret on a locked correct cell with no earlier editable cell stays put.
  expect(getClearAnswerTargetIndex(lockPuzzle, entry, { '0:0': '가' }, 0)).toBe(
    -1,
  );
});

test('refocuses a stale native text input after the keyboard is hidden', () => {
  jest.useFakeTimers({ now: 0 });

  const blur = jest.fn();
  const focus = jest.fn();
  const isFocused = jest.fn(() => true);
  const onFocusTimerSettled = jest.fn();
  const getInput = jest.fn(() => ({ blur, focus, isFocused }));

  scheduleBoardNativeInputFocus({
    getInput,
    keyboardVisible: false,
    onFocusTimerSettled,
    platformOS: 'ios',
  });

  expect(isFocused).toHaveBeenCalledTimes(1);
  expect(blur).toHaveBeenCalledTimes(1);
  expect(focus).not.toHaveBeenCalled();

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(BOARD_TEXT_INPUT_REFOCUS_DELAY_MS - 1);
  });

  expect(onFocusTimerSettled).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(1);
  });

  expect(onFocusTimerSettled).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledTimes(1);
});

test('focuses native text input without refocus delay when keyboard is visible', () => {
  jest.useFakeTimers({ now: 0 });

  const blur = jest.fn();
  const focus = jest.fn();
  const isFocused = jest.fn(() => true);
  const onFocusTimerSettled = jest.fn();
  const getInput = jest.fn(() => ({ blur, focus, isFocused }));

  scheduleBoardNativeInputFocus({
    getInput,
    keyboardVisible: true,
    onFocusTimerSettled,
    platformOS: 'android',
  });

  expect(isFocused).not.toHaveBeenCalled();
  expect(blur).not.toHaveBeenCalled();

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(0);
  });

  expect(onFocusTimerSettled).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledTimes(1);
});

test('loads an archived puzzle when it is missing from the current pack', async () => {
  const archivedPuzzle = createPuzzle('archived-only-puzzle');
  await saveArchivedPuzzle(archivedPuzzle, {
    startedAt: '2026-06-01T09:00:00.000Z',
  });

  const session = await loadPuzzleSession(archivedPuzzle.puzzleId, {
    source: 'remote',
    summaries: [],
  });

  expect(session?.nextPuzzle.puzzleId).toBe(archivedPuzzle.puzzleId);
  expect(session?.savedProgress).toEqual({
    cellValues: {},
    earnedHintCredits: 0,
    hintCount: 0,
  });
});

test('persists multiple bonus puzzle unlocks for the same date', async () => {
  const firstUnlock = {
    date: '2026-06-12',
    puzzleId: 'bonus-puzzle-1',
    unlockedAt: '2026-06-12T09:00:00.000Z',
  };
  const secondUnlock = {
    date: '2026-06-12',
    puzzleId: 'bonus-puzzle-2',
    unlockedAt: '2026-06-12T09:30:00.000Z',
  };

  await saveBonusPuzzleUnlock(firstUnlock);
  await saveBonusPuzzleUnlock(secondUnlock);

  expect(await loadBonusPuzzleUnlocks('2026-06-12')).toEqual([
    firstUnlock,
    secondUnlock,
  ]);
  expect(await loadBonusPuzzleUnlocks('2026-06-13')).toEqual([]);
});

test('loads legacy single bonus puzzle unlock records', async () => {
  const legacyUnlock = {
    date: '2026-06-12',
    puzzleId: 'legacy-bonus-puzzle',
    unlockedAt: '2026-06-12T09:00:00.000Z',
  };

  await AsyncStorage.setItem(
    getBonusUnlockKey('2026-06-12'),
    JSON.stringify(legacyUnlock),
  );

  expect(await loadBonusPuzzleUnlocks('2026-06-12')).toEqual([legacyUnlock]);
});

test('rejects archived records whose puzzle is missing the playable shape', async () => {
  const validPuzzle = createPuzzle('valid-archive-puzzle');
  await saveArchivedPuzzle(validPuzzle, {
    startedAt: '2026-06-01T09:00:00.000Z',
  });

  const puzzleWithoutGrid = {
    ...createPuzzle('corrupt-archive-puzzle'),
    grid: undefined,
  } as unknown as Puzzle;
  await saveArchivedPuzzle(puzzleWithoutGrid, {
    startedAt: '2026-06-01T10:00:00.000Z',
  });

  const puzzleWithMismatchedGridSize = {
    ...createPuzzle('mismatched-grid-size-puzzle'),
    gridSize: 3,
  };
  await saveArchivedPuzzle(puzzleWithMismatchedGridSize, {
    startedAt: '2026-06-01T11:00:00.000Z',
  });

  const invalidEntryPuzzle = createPuzzle('invalid-entry-puzzle');
  const puzzleWithInvalidEntry = {
    ...invalidEntryPuzzle,
    entries: invalidEntryPuzzle.entries.map(entry => ({
      ...entry,
      generatedBy: undefined,
    })),
  } as unknown as Puzzle;
  await saveArchivedPuzzle(puzzleWithInvalidEntry, {
    startedAt: '2026-06-01T12:00:00.000Z',
  });

  expect(await loadArchivedPuzzle('corrupt-archive-puzzle')).toBeNull();
  expect(await loadArchivedPuzzle('mismatched-grid-size-puzzle')).toBeNull();
  expect(await loadArchivedPuzzle('invalid-entry-puzzle')).toBeNull();

  const records = await listArchivedPuzzles();
  expect(records.map(record => record.puzzleId)).toEqual([
    validPuzzle.puzzleId,
  ]);

  const prunedIndex = JSON.parse(
    (await AsyncStorage.getItem(ARCHIVE_INDEX_KEY)) ?? '[]',
  );
  expect(prunedIndex).toEqual([validPuzzle.puzzleId]);
  expect(
    await AsyncStorage.getItem(getArchiveKey('corrupt-archive-puzzle')),
  ).toBeNull();
  expect(
    await AsyncStorage.getItem(getArchiveKey('mismatched-grid-size-puzzle')),
  ).toBeNull();
  expect(
    await AsyncStorage.getItem(getArchiveKey('invalid-entry-puzzle')),
  ).toBeNull();
});

test('archives started and completed puzzles with bounded ordered index', async () => {
  expect(getArchiveKey('index')).not.toBe(ARCHIVE_INDEX_KEY);

  const startedPuzzle = createPuzzle('index');
  await saveArchivedPuzzle(startedPuzzle, {
    startedAt: '2026-06-01T09:00:00.000Z',
  });
  await saveArchivedPuzzle(startedPuzzle, {
    completedAt: '2026-06-01T09:30:00.000Z',
  });

  const startedRecord = JSON.parse(
    (await AsyncStorage.getItem(getArchiveKey(startedPuzzle.puzzleId))) ?? '{}',
  );
  expect(startedRecord).toMatchObject({
    completedAt: '2026-06-01T09:30:00.000Z',
    lastPlayedAt: '2026-06-01T09:30:00.000Z',
    puzzleId: startedPuzzle.puzzleId,
    startedAt: '2026-06-01T09:00:00.000Z',
  });

  for (let index = 0; index < ARCHIVE_INDEX_LIMIT + 1; index += 1) {
    await saveArchivedPuzzle(createPuzzle(`archive-${index}`, '2026-06-02'), {
      startedAt: `2026-06-02T00:${String(index).padStart(2, '0')}:00.000Z`,
    });
  }

  const archiveIndex = JSON.parse(
    (await AsyncStorage.getItem(ARCHIVE_INDEX_KEY)) ?? '[]',
  );
  expect(archiveIndex).toHaveLength(ARCHIVE_INDEX_LIMIT);
  expect(archiveIndex[0]).toBe(`archive-${ARCHIVE_INDEX_LIMIT}`);
  expect(archiveIndex).not.toContain(startedPuzzle.puzzleId);

  expect(
    await AsyncStorage.getItem(getArchiveKey(startedPuzzle.puzzleId)),
  ).toBeNull();
  expect(await AsyncStorage.getItem(getArchiveKey('archive-0'))).toBeNull();
  expect(await AsyncStorage.getItem(getArchiveKey('archive-1'))).not.toBeNull();
});
