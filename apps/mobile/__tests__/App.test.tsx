/**
 * @format
 */

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App, {
  applyAppStateTransition,
  BOARD_TEXT_INPUT_REFOCUS_DELAY_MS,
  computeMobileStreakDays,
  formatElapsedTime,
  formatPuzzleCardTitle,
  formatPuzzleHistoryTitle,
  formatPuzzleHomeSubtitle,
  getBackTargetRoute,
  getBoardCellFocusScrollY,
  getBoardNativeInputPosition,
  getClearAnswerTargetIndex,
  getElapsedSeconds,
  loadPuzzleSession,
  type MissionState,
  normalizeMission,
  scheduleBoardNativeInputFocus,
  shouldUseSystemBack,
} from '../App';
import {
  formatPuzzleAliasLabel,
  formatPuzzleCardSequenceLabel,
  getPendingAnswerCellValues,
  type Puzzle,
  type PuzzleEntry,
  type PuzzleManifestItem,
} from '../../../packages/crossword-core/src';
import {
  ARCHIVE_INDEX_KEY,
  ARCHIVE_INDEX_LIMIT,
  getArchiveKey,
  listArchivedPuzzles,
  loadArchivedPuzzle,
  saveArchivedPuzzle,
} from '../puzzleArchive';

function createPuzzle(puzzleId: string, date = '2026-06-01'): Puzzle {
  return {
    date,
    difficulty: 'hard',
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
}, 45_000);

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
    difficulty: 'hard',
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
    difficulty: 'hard',
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

test('formats two-digit puzzle sequence labels from one-hour tier slots', () => {
  const summary: PuzzleManifestItem = {
    date: '2026-06-12',
    difficulty: 'hard',
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
  ).toBe('퍼즐 19번');
  expect(
    formatPuzzleCardSequenceLabel({
      ...summary,
      slotId: '2026-06-12-h22',
    }),
  ).toBe('퍼즐 23번');
  expect(
    formatPuzzleCardSequenceLabel({
      ...summary,
      publishedAt: '2026-06-12T09:00:00.000Z',
      slotId: '2026-06-12-h99',
    }),
  ).toBe('퍼즐 19번');
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
    difficulty: 'hard',
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
    '퍼즐 23번 · #26061222',
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

  const startLabel = renderer?.root.find(node =>
    node.children.some(
      child =>
        typeof child === 'string' && ['퍼즐 시작', '이어 풀기'].includes(child),
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
    revealUsed: false,
    tentativeCells: [],
  });
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

describe('applyAppStateTransition', () => {
  function missionAt(overrides: Partial<MissionState> = {}): MissionState {
    return {
      date: '2026-09-04',
      puzzleId: 'p1',
      attemptsUsed: 1,
      maxAttempts: 3,
      lastStartedAt: '2026-09-04T00:00:00.000Z',
      pausedMs: 0,
      pausedAt: null,
      ...overrides,
    };
  }

  test('background 전환 시 canAutoPause면 정지를 시작한다', () => {
    const mission = missionAt();
    const next = applyAppStateTransition(
      'background',
      mission,
      true,
      new Date('2026-09-04T00:05:00.000Z'),
    );

    expect(next).not.toBeNull();
    expect(next?.pausedAt).toBe('2026-09-04T00:05:00.000Z');
    expect(next?.pausedMs).toBe(0);
  });

  test('background 전환 시 canAutoPause가 아니면 아무 것도 바꾸지 않는다', () => {
    const mission = missionAt();
    const next = applyAppStateTransition(
      'background',
      mission,
      false,
      new Date('2026-09-04T00:05:00.000Z'),
    );

    expect(next).toBeNull();
  });

  test('이미 정지 중이면 background 전환이 다시 정지시키지 않는다', () => {
    const mission = missionAt({
      pausedAt: '2026-09-04T00:03:00.000Z',
      pausedMs: 1_000,
    });
    const next = applyAppStateTransition(
      'background',
      mission,
      true,
      new Date('2026-09-04T00:05:00.000Z'),
    );

    expect(next).toBeNull();
  });

  test('active 복귀 시 정지 중이었으면 정지 구간을 pausedMs에 누적하고 재개한다', () => {
    const mission = missionAt({
      pausedAt: '2026-09-04T00:05:00.000Z',
      pausedMs: 2_000,
    });
    const next = applyAppStateTransition(
      'active',
      mission,
      false,
      new Date('2026-09-04T00:05:30.000Z'),
    );

    expect(next).not.toBeNull();
    expect(next?.pausedAt).toBeNull();
    expect(next?.pausedMs).toBe(2_000 + 30_000);
  });

  test('active 복귀 시 정지 중이 아니었으면 아무 것도 바꾸지 않는다', () => {
    const mission = missionAt();
    const next = applyAppStateTransition(
      'active',
      mission,
      false,
      new Date('2026-09-04T00:05:00.000Z'),
    );

    expect(next).toBeNull();
  });

  test('배경↔포그라운드 왕복을 2회 반복해도 정지 구간이 모두 누적 제외된다', () => {
    let mission = missionAt();

    mission =
      applyAppStateTransition(
        'background',
        mission,
        true,
        new Date('2026-09-04T00:01:00.000Z'),
      ) ?? mission;
    mission =
      applyAppStateTransition(
        'active',
        mission,
        false,
        new Date('2026-09-04T00:01:10.000Z'),
      ) ?? mission;
    mission =
      applyAppStateTransition(
        'background',
        mission,
        true,
        new Date('2026-09-04T00:02:00.000Z'),
      ) ?? mission;
    mission =
      applyAppStateTransition(
        'active',
        mission,
        false,
        new Date('2026-09-04T00:02:45.000Z'),
      ) ?? mission;

    expect(mission.pausedAt).toBeNull();
    expect(mission.pausedMs).toBe(10_000 + 45_000);
    expect(
      getElapsedSeconds(mission.lastStartedAt, '2026-09-04T00:03:00.000Z', mission),
    ).toBe(180 - 55);
  });

  test('inactive 등 background/active가 아닌 전이는 무시한다', () => {
    const mission = missionAt();
    const next = applyAppStateTransition(
      'inactive',
      mission,
      true,
      new Date('2026-09-04T00:05:00.000Z'),
    );

    expect(next).toBeNull();
  });
});

describe('normalizeMission', () => {
  test('저장값이 없으면 정지 없이 시작하는 기본 상태를 만든다', () => {
    const mission = normalizeMission(null, '2026-09-04', 'p1');

    expect(mission.pausedMs).toBe(0);
    expect(mission.pausedAt).toBeNull();
    expect(mission.attemptsUsed).toBe(0);
  });

  test('날짜·퍼즐이 다르면 정지 상태도 함께 초기화한다', () => {
    const mission = normalizeMission(
      {
        date: '2026-09-03',
        puzzleId: 'other',
        attemptsUsed: 1,
        pausedMs: 5_000,
        pausedAt: '2026-09-03T00:00:00.000Z',
      },
      '2026-09-04',
      'p1',
    );

    expect(mission.pausedMs).toBe(0);
    expect(mission.pausedAt).toBeNull();
  });

  test('정지 중이 아니었던 누적 pausedMs는 그대로 복원한다', () => {
    const mission = normalizeMission(
      {
        date: '2026-09-04',
        puzzleId: 'p1',
        attemptsUsed: 1,
        lastStartedAt: '2026-09-04T00:00:00.000Z',
        pausedMs: 12_000,
        pausedAt: null,
      },
      '2026-09-04',
      'p1',
    );

    expect(mission.pausedMs).toBe(12_000);
    expect(mission.pausedAt).toBeNull();
  });

  test('배경 상태에서 강제 종료돼 정지 중으로 저장된 값은 복원 시각까지 접어 재개한다', () => {
    const savedAt = new Date('2026-09-04T00:10:00.000Z');
    jest.useFakeTimers().setSystemTime(savedAt);

    const mission = normalizeMission(
      {
        date: '2026-09-04',
        puzzleId: 'p1',
        attemptsUsed: 1,
        lastStartedAt: '2026-09-04T00:00:00.000Z',
        pausedMs: 1_000,
        pausedAt: '2026-09-04T00:08:00.000Z',
      },
      '2026-09-04',
      'p1',
    );

    expect(mission.pausedAt).toBeNull();
    expect(mission.pausedMs).toBe(1_000 + 120_000);
  });
});

describe('getElapsedSeconds', () => {
  test('pause가 없으면 시작~종료 그대로 계산한다(기존 동작 회귀 없음)', () => {
    expect(
      getElapsedSeconds(
        '2026-09-04T00:00:00.000Z',
        '2026-09-04T00:02:00.000Z',
      ),
    ).toBe(120);
  });

  test('누적 pausedMs를 경과 시간에서 제외한다', () => {
    expect(
      getElapsedSeconds(
        '2026-09-04T00:00:00.000Z',
        '2026-09-04T00:02:00.000Z',
        { pausedMs: 30_000, pausedAt: null },
      ),
    ).toBe(90);
  });
});

describe('formatElapsedTime', () => {
  test('pausedMs를 제외한 라벨을 만든다', () => {
    expect(
      formatElapsedTime(
        '2026-09-04T00:00:00.000Z',
        '2026-09-04T00:11:00.000Z',
        60_000,
      ),
    ).toBe('10분 0초');
  });

  test('pausedMs 없이 호출해도 기존 동작과 같다', () => {
    expect(
      formatElapsedTime('2026-09-04T00:00:00.000Z', '2026-09-04T00:00:42.000Z'),
    ).toBe('42초');
  });
});

describe('computeMobileStreakDays', () => {
  function rec(date: string, completedAt?: string) {
    return { puzzle: { date }, completedAt };
  }

  test('오늘 완료한 경우 스트릭 1을 반환한다', () => {
    const today = '2026-06-10';
    expect(
      computeMobileStreakDays([rec(today, '2026-06-10T10:00:00Z')], today),
    ).toBe(1);
  });

  test('오늘 미완료, 어제 완료인 경우 스트릭 1을 반환한다', () => {
    const today = '2026-06-10';
    expect(
      computeMobileStreakDays(
        [rec('2026-06-09', '2026-06-09T10:00:00Z')],
        today,
      ),
    ).toBe(1);
  });

  test('어제도 미완료인 경우 0을 반환한다', () => {
    const today = '2026-06-10';
    expect(
      computeMobileStreakDays(
        [rec('2026-06-08', '2026-06-08T10:00:00Z')],
        today,
      ),
    ).toBe(0);
  });

  test('3일 연속 완료한 경우 스트릭 3을 반환한다', () => {
    const today = '2026-06-10';
    const records = [
      rec('2026-06-10', '2026-06-10T10:00:00Z'),
      rec('2026-06-09', '2026-06-09T10:00:00Z'),
      rec('2026-06-08', '2026-06-08T10:00:00Z'),
    ];
    expect(computeMobileStreakDays(records, today)).toBe(3);
  });

  test('중간에 하루가 빠지면 최근 연속 구간만 카운트한다', () => {
    const today = '2026-06-10';
    const records = [
      rec('2026-06-10', '2026-06-10T10:00:00Z'),
      rec('2026-06-09', '2026-06-09T10:00:00Z'),
      // 2026-06-08 누락
      rec('2026-06-07', '2026-06-07T10:00:00Z'),
    ];
    expect(computeMobileStreakDays(records, today)).toBe(2);
  });

  test('completedAt이 undefined인 레코드는 스트릭에 포함되지 않는다', () => {
    const today = '2026-06-10';
    const records = [
      rec('2026-06-10', undefined),
      rec('2026-06-09', '2026-06-09T10:00:00Z'),
    ];
    expect(computeMobileStreakDays(records, today)).toBe(1);
  });

  test('레코드가 없으면 0을 반환한다', () => {
    expect(computeMobileStreakDays([], '2026-06-10')).toBe(0);
  });

  test('비정상 날짜 포맷이 섞여 있어도 크래시 없이 유효한 날짜만 카운트한다', () => {
    const today = '2026-06-10';
    const records = [
      rec('invalid-date', '2026-06-10T10:00:00Z'),
      rec('', '2026-06-10T10:00:00Z'),
      rec('2026-06-10', '2026-06-10T10:00:00Z'),
    ];
    expect(computeMobileStreakDays(records, today)).toBe(1);
  });

  test('completedAt이 빈 문자열이면 완료로 카운트하지 않는다', () => {
    const today = '2026-06-10';
    const records = [
      rec('2026-06-10', ''),
      rec('2026-06-09', '2026-06-09T10:00:00Z'),
    ];
    expect(computeMobileStreakDays(records, today)).toBe(1);
  });

  test('실재하지 않는 날짜(2026-13-40)는 스트릭에 포함되지 않는다', () => {
    const today = '2026-06-10';
    const records = [
      rec('2026-13-40', '2026-06-10T10:00:00Z'),
      rec('2026-00-00', '2026-06-10T10:00:00Z'),
      rec('2026-06-10', '2026-06-10T10:00:00Z'),
    ];
    expect(computeMobileStreakDays(records, today)).toBe(1);
  });

  test('completedAt이 파싱 불가능한 손상 값이면 완료로 카운트하지 않는다', () => {
    const today = '2026-06-10';
    const records = [
      rec('2026-06-10', 'not-a-date'),
      rec('2026-06-10', 'invalid'),
      rec('2026-06-09', '2026-06-09T10:00:00Z'),
    ];
    expect(computeMobileStreakDays(records, today)).toBe(1);
  });

  test('today가 유효하지 않은 포맷이면 0을 반환한다', () => {
    const records = [rec('2026-06-10', '2026-06-10T10:00:00Z')];
    expect(computeMobileStreakDays(records, 'not-a-date')).toBe(0);
    expect(computeMobileStreakDays(records, '')).toBe(0);
    expect(computeMobileStreakDays(records, '2026-13-40')).toBe(0);
  });
});
