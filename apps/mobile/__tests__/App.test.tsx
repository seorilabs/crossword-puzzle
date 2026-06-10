/**
 * @format
 */

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App, { AnswerSlotInput, loadPuzzleSession } from '../App';
import {
  ARCHIVE_INDEX_KEY,
  ARCHIVE_INDEX_LIMIT,
  getArchiveKey,
  listArchivedPuzzles,
  loadArchivedPuzzle,
  saveArchivedPuzzle,
} from '../puzzleArchive';
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

test('keeps Korean syllable composition pending before advancing answer slots', () => {
  jest.useFakeTimers({ now: 0 });

  const entry = {
    answer: '관포지교',
    clue: '오랜 우정',
    col: 0,
    direction: 'across' as const,
    generatedBy: 'placed' as const,
    id: 'korean-composition-entry',
    row: 0,
  };
  const applyAnswerSegment = jest.fn();
  let renderer: ReturnType<typeof ReactTestRenderer.create> | undefined;

  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <AnswerSlotInput
        applyAnswerSegment={applyAnswerSegment}
        cellValues={{}}
        clearAnswerCell={jest.fn()}
        entry={entry}
        selectedCellKey="0:0"
        selectEntry={jest.fn()}
      />,
    );
  });

  const getInput = () => {
    if (renderer == null) {
      throw new Error('AnswerSlotInput renderer was not created.');
    }

    return renderer.root.findByType(TextInput);
  };

  ReactTestRenderer.act(() => {
    getInput().props.onChangeText('ㄱ');
    getInput().props.onChangeText('고');
  });
  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(799);
  });

  expect(applyAnswerSegment).not.toHaveBeenCalled();

  ReactTestRenderer.act(() => {
    getInput().props.onChangeText('관포지교');
  });
  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(800);
  });

  expect(applyAnswerSegment).toHaveBeenCalledTimes(1);
  expect(applyAnswerSegment).toHaveBeenCalledWith(entry, '관포지교', '0:0');
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
