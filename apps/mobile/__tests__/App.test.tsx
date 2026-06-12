/**
 * @format
 */

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactTestRenderer from 'react-test-renderer';
import App, {
  ANDROID_TEXT_INPUT_REFOCUS_DELAY_MS,
  formatCompletionStatsLabel,
  getBoardCellFocusScrollY,
  getBoardNativeInputPosition,
  getClearAnswerTargetIndex,
  getPendingAnswerCellValues,
  loadPuzzleSession,
  scheduleBoardNativeInputFocus,
} from '../App';
import type { PuzzleEntry } from '../../../packages/crossword-core/src';
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
import type { Puzzle } from '../../../packages/crossword-core/src';

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

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

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

test('refocuses a stale Android text input after the keyboard is hidden', () => {
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
    platformOS: 'android',
  });

  expect(isFocused).toHaveBeenCalledTimes(1);
  expect(blur).toHaveBeenCalledTimes(1);
  expect(focus).not.toHaveBeenCalled();

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(ANDROID_TEXT_INPUT_REFOCUS_DELAY_MS - 1);
  });

  expect(onFocusTimerSettled).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(1);
  });

  expect(onFocusTimerSettled).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledTimes(1);
});

test('focuses Android text input without refocus delay when keyboard is visible', () => {
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
