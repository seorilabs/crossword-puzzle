import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Puzzle, PuzzleEntry } from '../../packages/crossword-core/src';

export type PuzzleArchiveRecord = {
  completedAt: string | undefined;
  // 완료 시점에 동결한 힌트 사용 수·정답 보기 여부. 노힌트 완료 집계를 진행상태 저장소
  // 의존 없이 아카이브만으로 판정하기 위해 보존한다(구버전 기록에는 없을 수 있다).
  hintCount?: number;
  lastPlayedAt: string | undefined;
  puzzle: Puzzle;
  puzzleId: string;
  revealUsed?: boolean;
  savedAt: string;
  startedAt: string | undefined;
};

export type PuzzleArchiveSaveOptions = {
  completedAt?: string;
  hintCount?: number;
  revealUsed?: boolean;
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
    (entry.generatedBy === 'placed' || entry.generatedBy === 'auto') &&
    typeof entry.row === 'number' &&
    typeof entry.col === 'number'
  );
}

function isArchivedPuzzle(value: unknown, puzzleId: string): value is Puzzle {
  if (value == null || typeof value !== 'object') {
    return false;
  }

  const puzzle = value as Partial<Puzzle>;
  const { grid, gridSize } = puzzle;
  return (
    puzzle.puzzleId === puzzleId &&
    typeof puzzle.date === 'string' &&
    typeof gridSize === 'number' &&
    Array.isArray(grid) &&
    grid.length > 0 &&
    grid.length === gridSize &&
    grid.every(
      row =>
        Array.isArray(row) &&
        row.length === gridSize &&
        row.every(cell => typeof cell === 'string'),
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
    const hintCount =
      typeof parsed.hintCount === 'number' && Number.isFinite(parsed.hintCount)
        ? Math.max(0, Math.floor(parsed.hintCount))
        : undefined;
    const revealUsed =
      typeof parsed.revealUsed === 'boolean' ? parsed.revealUsed : undefined;

    const record: PuzzleArchiveRecord = {
      completedAt,
      lastPlayedAt,
      puzzle: parsed.puzzle,
      puzzleId,
      savedAt,
      startedAt,
    };
    if (hintCount != null) {
      record.hintCount = hintCount;
    }
    if (revealUsed != null) {
      record.revealUsed = revealUsed;
    }
    return record;
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
  const hintCount = options.hintCount ?? existing?.hintCount;
  if (hintCount != null) {
    nextRecord.hintCount = hintCount;
  }
  const revealUsed = options.revealUsed ?? existing?.revealUsed;
  if (revealUsed != null) {
    nextRecord.revealUsed = revealUsed;
  }
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
