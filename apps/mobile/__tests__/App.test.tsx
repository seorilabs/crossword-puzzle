/**
 * @format
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactTestRenderer from 'react-test-renderer';
import { TileHomeScreen } from '../TileHomeScreen';
import { TilePuzzleScreen } from '../TilePuzzleScreen';
import { TileResultScreen } from '../TileResultScreen';
import {
  chooseLetterTile,
  getLetterTiles,
  formatPuzzleAliasLabel,
  formatPuzzleCardSequenceLabel,
  type Puzzle,
  type PuzzleManifestItem,
} from '../../../packages/crossword-core/src';
import App, {
  applyAppStateTransition,
  formatElapsedTime,
  formatPuzzleCardTitle,
  formatPuzzleHistoryTitle,
  formatPuzzleHomeSubtitle,
  getBackTargetRoute,
  getElapsedSeconds,
  loadPuzzleSession,
  type MissionState,
  normalizeMission,
  shouldUseSystemBack,
} from '../App';
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

test('last tile completes the mission once and opens the result', async () => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const puzzle = createPuzzle(today.slice(2).replaceAll('-', '') + '01', today);
  const summary = {
    ...puzzle,
    path: `/puzzles/${puzzle.puzzleId}.json`,
    publishedAt: `${today}T00:00:00+09:00`,
  };
  const fetchMock = globalThis.fetch as jest.Mock;
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () =>
      url.endsWith('manifest.json') ? { puzzles: [summary] } : puzzle,
  }));
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await flushAsyncWork(15);
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByType(TileHomeScreen).props.onStart();
    });
    await flushAsyncWork(10);
    for (const letter of ['가', '나']) {
      const screen = renderer!.root.findByType(TilePuzzleScreen);
      const tile = getLetterTiles(puzzle, screen.props.state).find(
        item => item.letter === letter && !item.used,
      );
      expect(tile).toBeDefined();
      await ReactTestRenderer.act(async () => {
        screen.props.onChange(
          chooseLetterTile(puzzle, screen.props.state, tile!.id),
          'choice',
        );
      });
      await flushAsyncWork(5);
    }
    expect(renderer!.root.findByType(TileResultScreen).props.completed).toBe(1);
    const missionRaw = await AsyncStorage.getItem(
      `crossword-puzzle:mission:${today}:${puzzle.puzzleId}`,
    );
    expect(JSON.parse(missionRaw!).completedAt).toEqual(expect.any(String));
    const completionWrites = (
      AsyncStorage.setItem as jest.Mock
    ).mock.calls.filter(
      ([key, value]) =>
        key === `crossword-puzzle:mission:${today}:${puzzle.puzzleId}` &&
        JSON.parse(value).completedAt != null,
    );
    expect(completionWrites).toHaveLength(1);
  } finally {
    ReactTestRenderer.act(() => renderer?.unmount());
    fetchMock.mockImplementation(() =>
      Promise.reject(new Error('fetch is mocked in mobile Jest')),
    );
  }
}, 45_000);

test('maps Android hardware back targets through the app scene graph', () => {
  expect(shouldUseSystemBack('home')).toBe(true);
  expect(getBackTargetRoute('history')).toBe('home');
  expect(getBackTargetRoute('today')).toBe('home');
  expect(getBackTargetRoute('result')).toBe('home');
  expect(getBackTargetRoute('license')).toBe('history');
});

test('first input acknowledgement stops first-clue auto-selection on another unopened board', async () => {
  const dateKey = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  const today = dateKey(new Date());
  const yesterday = dateKey(new Date(Date.now() - 86400000));
  const puzzles = [today, yesterday].map(date => {
    const base = createPuzzle(date.slice(2).replaceAll('-', '') + '01', date);
    return {
      ...base,
      grid: [
        ['가', '나'],
        ['다', '라'],
      ],
      entries: [
        base.entries[0],
        {
          ...base.entries[0],
          id: `${base.puzzleId}-basic`,
          row: 1,
          answer: '다라',
          vocabularyLevel: '초급',
        },
      ],
    };
  });
  const fetchMock = globalThis.fetch as jest.Mock;
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () =>
      url.endsWith('manifest.json')
        ? {
            puzzles: puzzles.map(p => ({
              ...p,
              path: `/puzzles/${p.puzzleId}.json`,
              publishedAt: `${p.date}T00:00:00+09:00`,
            })),
          }
        : puzzles.find(p => url.endsWith(`${p.puzzleId}.json`)),
  }));
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await flushAsyncWork(15);
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByType(TileHomeScreen).props.onStart();
    });
    await flushAsyncWork(10);
    const screen = renderer!.root.findByType(TilePuzzleScreen);
    expect(screen.props.state.progress.entryId).toBe(
      `${puzzles[0].puzzleId}-basic`,
    );
    const tile = getLetterTiles(puzzles[0], screen.props.state).find(
      item => item.letter === '다',
    )!;
    await ReactTestRenderer.act(async () => {
      screen.props.onChange(
        chooseLetterTile(puzzles[0], screen.props.state, tile.id),
        'choice',
      );
    });
    await flushAsyncWork(5);
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByType(TilePuzzleScreen).props.onBack();
    });
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByType(TileHomeScreen).props.onHistory();
    });
    await flushAsyncWork(5);
    const row = renderer!.root.findByProps({
      testID: `history-puzzle-${puzzles[1].puzzleId}`,
    });
    expect(row).toBeDefined();
    await ReactTestRenderer.act(async () => {
      row.props.onPress();
    });
    await flushAsyncWork(10);
    expect(
      renderer!.root.findByType(TilePuzzleScreen).props.state.progress.entryId,
    ).toBe(puzzles[1].entries[0].id);
  } finally {
    ReactTestRenderer.act(() => renderer?.unmount());
    fetchMock.mockImplementation(() =>
      Promise.reject(new Error('fetch is mocked in mobile Jest')),
    );
  }
}, 45_000);

test('opening a fully saved board does not create a new completion', async () => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const puzzle = createPuzzle(today.slice(2).replaceAll('-', '') + '01', today);
  await AsyncStorage.setItem(
    `crossword-puzzle:progress:${puzzle.puzzleId}`,
    JSON.stringify({
      cellValues: { '0:0': '가', '0:1': '나' },
      hintCount: 0,
      earnedHintCredits: 0,
    }),
  );
  await AsyncStorage.setItem(
    `crossword-puzzle:mission:${today}:${puzzle.puzzleId}`,
    JSON.stringify({
      date: today,
      puzzleId: puzzle.puzzleId,
      attemptsUsed: 1,
      maxAttempts: 3,
      lastStartedAt: new Date().toISOString(),
    }),
  );
  const fetchMock = globalThis.fetch as jest.Mock;
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () =>
      url.endsWith('manifest.json')
        ? {
            puzzles: [
              {
                ...puzzle,
                path: `/puzzles/${puzzle.puzzleId}.json`,
                publishedAt: `${today}T00:00:00+09:00`,
              },
            ],
          }
        : puzzle,
  }));
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await flushAsyncWork(15);
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByType(TileHomeScreen).props.onStart();
    });
    await flushAsyncWork(15);
    expect(renderer!.root.findByType(TileResultScreen).props.completed).toBe(1);
    const mission = JSON.parse(
      (await AsyncStorage.getItem(
        `crossword-puzzle:mission:${today}:${puzzle.puzzleId}`,
      ))!,
    );
    expect(mission.completedAt).toBeUndefined();
  } finally {
    ReactTestRenderer.act(() => renderer?.unmount());
    fetchMock.mockImplementation(() =>
      Promise.reject(new Error('fetch is mocked in mobile Jest')),
    );
  }
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
      getElapsedSeconds(
        mission.lastStartedAt,
        '2026-09-04T00:03:00.000Z',
        mission,
      ),
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
      getElapsedSeconds('2026-09-04T00:00:00.000Z', '2026-09-04T00:02:00.000Z'),
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

test.each([1, -1])(
  'preloading a board %i days away on home cannot consume the first guide',
  async offset => {
    const key = (date: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    const today = key(new Date());
    const tomorrow = key(new Date(Date.now() + offset * 86400000));
    let loaded = createPuzzle(
      tomorrow.slice(2).replaceAll('-', '') + '01',
      tomorrow,
    );
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith('manifest.json')
          ? {
              puzzles: [
                {
                  ...loaded,
                  path: `/puzzles/${loaded.puzzleId}.json`,
                  publishedAt: `${loaded.date}T00:00:00+09:00`,
                },
              ],
            }
          : loaded,
    }));
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    try {
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(<App />);
      });
      await flushAsyncWork(15);
      if (offset > 0)
        expect(
          renderer!.root.findByType(TileHomeScreen).props.puzzle,
        ).toBeNull();
      else
        expect(
          renderer!.root.findByType(TileHomeScreen).props.puzzle.date,
        ).toBe(tomorrow);
      await ReactTestRenderer.act(async () => {
        renderer!.unmount();
      });
      loaded = createPuzzle(today.slice(2).replaceAll('-', '') + '01', today);
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(<App />);
      });
      await flushAsyncWork(15);
      await ReactTestRenderer.act(async () => {
        renderer!.root.findByType(TileHomeScreen).props.onStart();
      });
      await flushAsyncWork(10);
      expect(renderer!.root.findByType(TilePuzzleScreen).props.guide).toEqual(
        expect.objectContaining({ completed: 0, total: 1 }),
      );
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
      fetchMock.mockImplementation(() =>
        Promise.reject(new Error('fetch is mocked in mobile Jest')),
      );
    }
  },
  45_000,
);

test('실제 앱 설정은 사용 통계의 현재 상태를 접근성 상태로 전달한다', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await flushAsyncWork(15);
    await ReactTestRenderer.act(async () => {
      renderer!.root.findByType(TileHomeScreen).props.onSettings();
    });
    const toggle = renderer!.root
      .findAllByProps({ accessibilityLabel: '사용 통계' })
      .find(node => typeof node.props.onPress === 'function')!;
    expect(toggle.props['aria-checked']).toBe(true);
    await ReactTestRenderer.act(async () => {
      toggle.props.onPress();
    });
    await flushAsyncWork(5);
    expect(toggle.props['aria-checked']).toBe(false);
    expect(
      await AsyncStorage.getItem('crossword-puzzle:usage-statistics:v1'),
    ).toBe('0');
    await ReactTestRenderer.act(async () => {
      toggle.props.onPress();
    });
    await flushAsyncWork(5);
  } finally {
    ReactTestRenderer.act(() => renderer?.unmount());
  }
});
