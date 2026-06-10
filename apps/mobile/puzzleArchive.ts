import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Puzzle, PuzzleEntry } from '../../packages/crossword-core/src';

export type PuzzleArchiveRecord = {
  completedAt: string | undefined;
  lastPlayedAt: string | undefined;
  puzzle: Puzzle;
  puzzleId: string;
  savedAt: string;
  startedAt: string | undefined;
};

export type PuzzleArchiveSaveOptions = {
  completedAt?: string;
  startedAt?: string;
};

export const ARCHIVE_INDEX_KEY = 'crossword-puzzle:archive:index';
export const ARCHIVE_INDEX_LIMIT = 30;

const ARCHIVE_KEY_PREFIX = 'crossword-puzzle:archive';
const ARCHIVE_RECORD_KEY_PREFIX = `${ARCHIVE_KEY_PREFIX}:record`;
const ARCHIVE_FALLBACK_SAVED_AT = '1970-01-01T00:00:00.000Z';

export function getArchiveKey(puzzleId: string) {
  return `${ARCHIVE_RECORD_KEY_PREFIX}:${puzzleId}`;
}

function isArchivedPuzzleEntry(value: unknown): value is PuzzleEntry {
  if (value == null || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<PuzzleEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.answer === 'string' &&
    typeof entry.clue === 'string' &&
    (entry.direction === 'across' || entry.direction === 'down') &&
    typeof entry.row === 'number' &&
    typeof entry.col === 'number'
  );
}

function isArchivedPuzzle(value: unknown, puzzleId: string): value is Puzzle {
  if (value == null || typeof value !== 'object') {
    return false;
  }

  const puzzle = value as Partial<Puzzle>;
  return (
    puzzle.puzzleId === puzzleId &&
    typeof puzzle.date === 'string' &&
    typeof puzzle.gridSize === 'number' &&
    Array.isArray(puzzle.grid) &&
    puzzle.grid.length > 0 &&
    puzzle.grid.every(
      row => Array.isArray(row) && row.every(cell => typeof cell === 'string'),
    ) &&
    Array.isArray(puzzle.entries) &&
    puzzle.entries.length > 0 &&
    puzzle.entries.every(isArchivedPuzzleEntry) &&
    puzzle.metrics != null &&
    typeof puzzle.metrics === 'object'
  );
}

function normalizeArchiveIndex(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

async function loadArchiveIndex() {
  try {
    const raw = await AsyncStorage.getItem(ARCHIVE_INDEX_KEY);
    return normalizeArchiveIndex(raw == null ? null : JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function loadArchivedPuzzle(puzzleId: string) {
  try {
    const raw = await AsyncStorage.getItem(getArchiveKey(puzzleId));
    if (raw == null) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PuzzleArchiveRecord>;
    if (!isArchivedPuzzle(parsed.puzzle, puzzleId)) {
      return null;
    }

    const completedAt =
      typeof parsed.completedAt === 'string' ? parsed.completedAt : undefined;
    const lastPlayedAt =
      typeof parsed.lastPlayedAt === 'string' ? parsed.lastPlayedAt : undefined;
    const startedAt =
      typeof parsed.startedAt === 'string' ? parsed.startedAt : undefined;
    const savedAt =
      typeof parsed.savedAt === 'string'
        ? parsed.savedAt
        : lastPlayedAt ?? completedAt ?? startedAt ?? ARCHIVE_FALLBACK_SAVED_AT;

    return {
      completedAt,
      lastPlayedAt,
      puzzle: parsed.puzzle,
      puzzleId,
      savedAt,
      startedAt,
    } satisfies PuzzleArchiveRecord;
  } catch {
    return null;
  }
}

export async function listArchivedPuzzles() {
  const index = await loadArchiveIndex();
  const readIndex = index.slice(0, ARCHIVE_INDEX_LIMIT);
  const loadedEntries = await Promise.all(
    readIndex.map(async puzzleId => ({
      puzzleId,
      record: await loadArchivedPuzzle(puzzleId),
    })),
  );
  const seenPuzzleIds = new Set<string>();
  const nextIndex: string[] = [];
  const records: PuzzleArchiveRecord[] = [];

  for (const { puzzleId, record } of loadedEntries) {
    if (record == null || seenPuzzleIds.has(puzzleId)) {
      continue;
    }

    seenPuzzleIds.add(puzzleId);
    nextIndex.push(puzzleId);
    records.push(record);
  }

  if (
    nextIndex.length !== index.length ||
    nextIndex.some((puzzleId, indexPosition) => puzzleId !== index[indexPosition])
  ) {
    const droppedPuzzleIds = index.filter(
      puzzleId => !seenPuzzleIds.has(puzzleId),
    );

    try {
      await Promise.all([
        AsyncStorage.setItem(ARCHIVE_INDEX_KEY, JSON.stringify(nextIndex)),
        ...droppedPuzzleIds.map(puzzleId =>
          AsyncStorage.removeItem(getArchiveKey(puzzleId)),
        ),
      ]);
    } catch {
      // Archive index pruning is best-effort; stale IDs can be retried later.
    }
  }

  return records.sort((left, right) =>
    (right.lastPlayedAt ?? right.completedAt ?? right.savedAt).localeCompare(
      left.lastPlayedAt ?? left.completedAt ?? left.savedAt,
    ),
  );
}

export async function saveArchivedPuzzle(
  puzzle: Puzzle,
  options: PuzzleArchiveSaveOptions = {},
) {
  const now = new Date().toISOString();
  const existing = await loadArchivedPuzzle(puzzle.puzzleId);
  const nextRecord: PuzzleArchiveRecord = {
    completedAt: options.completedAt ?? existing?.completedAt,
    lastPlayedAt: options.startedAt ?? options.completedAt ?? now,
    puzzle,
    puzzleId: puzzle.puzzleId,
    savedAt: existing?.savedAt ?? now,
    startedAt: options.startedAt ?? existing?.startedAt,
  };
  const currentIndex = await loadArchiveIndex();
  const nextIndex = [
    puzzle.puzzleId,
    ...currentIndex.filter(puzzleId => puzzleId !== puzzle.puzzleId),
  ].slice(0, ARCHIVE_INDEX_LIMIT);
  const retainedPuzzleIds = new Set(nextIndex);
  const evictedPuzzleIds = currentIndex.filter(
    puzzleId => !retainedPuzzleIds.has(puzzleId),
  );

  try {
    await Promise.all([
      AsyncStorage.setItem(
        getArchiveKey(puzzle.puzzleId),
        JSON.stringify(nextRecord),
      ),
      AsyncStorage.setItem(ARCHIVE_INDEX_KEY, JSON.stringify(nextIndex)),
      ...evictedPuzzleIds.map(puzzleId =>
        AsyncStorage.removeItem(getArchiveKey(puzzleId)),
      ),
    ]);
  } catch {
    // Local archive is best effort.
  }
}
