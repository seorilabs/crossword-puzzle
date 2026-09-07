// 발행 정답 이력(answer-history.json) 정책.
//
// manifest 는 최근 14판만 보관하므로 "같은 난이도 최근 7판 + 같은 날짜의 다른 난이도"
// 밖의 정답은 전혀 배제되지 않았다. 어제 hard 에 나온 단어가 오늘 easy 에 나오고,
// 8일 전 단어가 그대로 돌아오는 반복이 여기서 생겼다(36일 시뮬레이션 기준 정확
// 반복 1.4건/일). 이 모듈은 manifest 트림과 무관하게 살아남는 별도 이력 파일의
// 스키마와, 그 이력으로 후보를 배제하는 순수 규칙을 정의한다.
//
// 창은 둘로 나눈다. 정답 1개의 2음절 어근 배제는 평균 ~7어를 지우므로 어근 배제를
// 90일로 늘리면 풀의 1/3이 사라진다. 정확 일치는 길게(기본 90일), 어근 겹침은
// 짧게(기본 14일) 두고 둘 다 두 난이도 모두에 적용한다.
//
// IO(원격 fetch·파일 읽기/쓰기)는 server/batch 에 두고 여기는 순수 함수만 둔다.
import { isDifficulty, type Difficulty } from "./difficultyProfiles.ts";
import type { Puzzle } from "./types.ts";

export const ANSWER_HISTORY_FILE_NAME = "answer-history.json";
export const ANSWER_HISTORY_PATH = `/puzzles/${ANSWER_HISTORY_FILE_NAME}`;
export const ANSWER_HISTORY_VERSION = 1;
export const DEFAULT_ANSWER_HISTORY_DAYS = 90;
export const DEFAULT_FRAGMENT_HISTORY_DAYS = 14;

export type AnswerHistoryEntry = {
  puzzleId: string;
  date: string;
  difficulty: Difficulty;
  slotId?: string;
  answers: string[];
};

export type AnswerHistoryFile = {
  version: typeof ANSWER_HISTORY_VERSION;
  updatedAt: string;
  retentionDays: number;
  // 날짜 내림차순(같은 날짜면 identity 내림차순). 최신이 앞에 온다.
  puzzles: AnswerHistoryEntry[];
};

export type AnswerExclusionSummary = {
  answerHistoryDays: number;
  fragmentHistoryDays: number;
  historyExactPuzzleCount: number;
  historyExactAnswerCount: number;
  historyExactExcludedWordCount: number;
  historyFragmentPuzzleCount: number;
  historyFragmentAnswerCount: number;
  historyFragmentExcludedWordCount: number;
};

export type AnswerRepeat = {
  answer: string;
  puzzleId: string;
  date: string;
  difficulty: Difficulty;
  previousPuzzleId: string;
  previousDate: string;
  previousDifficulty: Difficulty;
  gapDays: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toUtcMs(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00Z`);
}

export function isValidDateKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    DATE_KEY_PATTERN.test(value) &&
    !Number.isNaN(toUtcMs(value)) &&
    new Date(toUtcMs(value)).toISOString().slice(0, 10) === value
  );
}

// YYYY-MM-DD 에 일 단위 오프셋을 더한다. 달력일만 다루므로 UTC 자정 산술로 충분하다.
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  return new Date(toUtcMs(dateKey) + Math.trunc(deltaDays) * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

// left - right 를 일 단위 정수로 돌려준다.
export function diffDateKeys(left: string, right: string): number {
  return Math.round((toUtcMs(left) - toUtcMs(right)) / DAY_MS);
}

function normalizeAnswers(answers: Iterable<string>): string[] {
  const unique = new Set<string>();

  for (const answer of answers) {
    if (typeof answer !== "string") {
      continue;
    }
    const normalized = answer.trim();
    if (normalized !== "") {
      unique.add(normalized);
    }
  }

  return [...unique];
}

export function createEmptyAnswerHistory(
  retentionDays: number = DEFAULT_ANSWER_HISTORY_DAYS,
  updatedAt: string = new Date(0).toISOString(),
): AnswerHistoryFile {
  return {
    version: ANSWER_HISTORY_VERSION,
    updatedAt,
    retentionDays: Math.max(0, Math.floor(retentionDays)),
    puzzles: [],
  };
}

// manifest 의 identity 규칙(slotId ?? puzzleId)과 같다. 같은 슬롯을 재실행하면
// 이력 항목도 교체되어 fixed seed 재현성과 idempotency 가 유지된다.
export function getAnswerHistoryIdentityKey(
  entry: Pick<AnswerHistoryEntry, "puzzleId" | "slotId">,
): string {
  return entry.slotId ?? entry.puzzleId;
}

function compareEntriesDesc(
  left: AnswerHistoryEntry,
  right: AnswerHistoryEntry,
): number {
  if (left.date !== right.date) {
    return right.date.localeCompare(left.date);
  }

  return getAnswerHistoryIdentityKey(right).localeCompare(
    getAnswerHistoryIdentityKey(left),
  );
}

function parseEntry(raw: unknown): AnswerHistoryEntry | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.puzzleId !== "string" ||
    candidate.puzzleId.trim() === "" ||
    !isValidDateKey(candidate.date) ||
    !isDifficulty(candidate.difficulty) ||
    !Array.isArray(candidate.answers)
  ) {
    return null;
  }

  const entry: AnswerHistoryEntry = {
    puzzleId: candidate.puzzleId,
    date: candidate.date,
    difficulty: candidate.difficulty,
    answers: normalizeAnswers(candidate.answers as Iterable<string>),
  };
  if (typeof candidate.slotId === "string" && candidate.slotId !== "") {
    entry.slotId = candidate.slotId;
  }

  return entry;
}

// 파일 전체가 형식에 맞지 않으면 null, 항목 단위 손상은 버리고 개수만 알린다.
export function parseAnswerHistory(
  raw: unknown,
): { history: AnswerHistoryFile; droppedEntryCount: number } | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (!Array.isArray(candidate.puzzles)) {
    return null;
  }

  const puzzles: AnswerHistoryEntry[] = [];
  let droppedEntryCount = 0;
  for (const rawEntry of candidate.puzzles) {
    const entry = parseEntry(rawEntry);
    if (entry == null) {
      droppedEntryCount += 1;
      continue;
    }
    puzzles.push(entry);
  }

  const retentionDays =
    typeof candidate.retentionDays === "number" &&
    Number.isFinite(candidate.retentionDays)
      ? Math.max(0, Math.floor(candidate.retentionDays))
      : DEFAULT_ANSWER_HISTORY_DAYS;
  const updatedAt =
    typeof candidate.updatedAt === "string"
      ? candidate.updatedAt
      : new Date(0).toISOString();

  return {
    history: {
      version: ANSWER_HISTORY_VERSION,
      updatedAt,
      retentionDays,
      puzzles: puzzles.sort(compareEntriesDesc),
    },
    droppedEntryCount,
  };
}

export function makeAnswerHistoryEntry(
  puzzle: Pick<Puzzle, "puzzleId" | "date" | "difficulty" | "entries"> & {
    slotId?: string;
  },
): AnswerHistoryEntry {
  const entry: AnswerHistoryEntry = {
    puzzleId: puzzle.puzzleId,
    date: puzzle.date,
    difficulty: puzzle.difficulty,
    answers: normalizeAnswers(puzzle.entries.map((item) => item.answer)),
  };
  if (typeof puzzle.slotId === "string" && puzzle.slotId !== "") {
    entry.slotId = puzzle.slotId;
  }

  return entry;
}

// 항목을 identity 기준으로 교체·추가하고 today - retentionDays 이전 항목을 지운다.
// today 보다 미래 날짜 항목은 절대 지우지 않는다(과거 슬롯 재실행 시 이미 발행된
// 이후 퍼즐의 정답이 사라지면 안 된다).
export function upsertAnswerHistory(
  history: AnswerHistoryFile,
  entries: readonly AnswerHistoryEntry[],
  options: { retentionDays: number; today: string; updatedAt?: string },
): AnswerHistoryFile {
  const retentionDays = Math.max(0, Math.floor(options.retentionDays));
  const cutoff = shiftDateKey(options.today, -retentionDays);
  const byIdentity = new Map<string, AnswerHistoryEntry>();

  for (const entry of history.puzzles) {
    byIdentity.set(getAnswerHistoryIdentityKey(entry), entry);
  }
  for (const entry of entries) {
    byIdentity.set(getAnswerHistoryIdentityKey(entry), {
      ...entry,
      answers: normalizeAnswers(entry.answers),
    });
  }

  return {
    version: ANSWER_HISTORY_VERSION,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    retentionDays,
    puzzles: [...byIdentity.values()]
      .filter((entry) => entry.date >= cutoff)
      .sort(compareEntriesDesc),
  };
}

// today 기준 최근 days 일(포함) 안의 항목을 난이도 구분 없이 고른다. 현재 슬롯
// 자신은 제외해 같은 슬롯 재실행이 자기 정답에 막히지 않게 한다. today 이후 날짜의
// 항목도 포함한다(이미 발행된 퍼즐의 정답은 언제나 배제 대상이다).
export function selectAnswerHistoryWindow(
  history: AnswerHistoryFile,
  options: {
    today: string;
    days: number;
    excludeSlotId?: string;
    excludePuzzleId?: string;
  },
): AnswerHistoryEntry[] {
  const days = Math.max(0, Math.floor(options.days));
  if (days === 0) {
    return [];
  }
  const cutoff = shiftDateKey(options.today, -days);

  return history.puzzles.filter((entry) => {
    if (entry.date < cutoff) {
      return false;
    }
    if (
      options.excludeSlotId != null &&
      entry.slotId != null &&
      entry.slotId === options.excludeSlotId
    ) {
      return false;
    }
    if (
      options.excludePuzzleId != null &&
      entry.puzzleId === options.excludePuzzleId
    ) {
      return false;
    }

    return true;
  });
}

export function collectHistoryAnswers(
  entries: readonly AnswerHistoryEntry[],
): Set<string> {
  const answers = new Set<string>();

  for (const entry of entries) {
    for (const answer of entry.answers) {
      answers.add(answer);
    }
  }

  return answers;
}

// 정답 문자열이 정확히 같은 후보만 제외한다. 어근 겹침은 answerVariety 의
// excludeAnswersSharingFragments 가 짧은 창으로 따로 처리한다.
export function excludeExactAnswers<T extends { answer: string }>(
  words: readonly T[],
  usedAnswers: Iterable<string>,
): T[] {
  const used = new Set(normalizeAnswers(usedAnswers));
  if (used.size === 0) {
    return [...words];
  }

  return words.filter((word) => !used.has(word.answer.trim()));
}

export function summarizeAnswerExclusion(input: {
  totalWordCount: number;
  afterExactCount: number;
  afterFragmentCount: number;
  exactEntries: readonly AnswerHistoryEntry[];
  fragmentEntries: readonly AnswerHistoryEntry[];
  answerHistoryDays: number;
  fragmentHistoryDays: number;
}): AnswerExclusionSummary {
  return {
    answerHistoryDays: Math.max(0, Math.floor(input.answerHistoryDays)),
    fragmentHistoryDays: Math.max(0, Math.floor(input.fragmentHistoryDays)),
    historyExactPuzzleCount: input.exactEntries.length,
    historyExactAnswerCount: collectHistoryAnswers(input.exactEntries).size,
    historyExactExcludedWordCount: Math.max(
      0,
      input.totalWordCount - input.afterExactCount,
    ),
    historyFragmentPuzzleCount: input.fragmentEntries.length,
    historyFragmentAnswerCount: collectHistoryAnswers(input.fragmentEntries)
      .size,
    historyFragmentExcludedWordCount: Math.max(
      0,
      input.afterExactCount - input.afterFragmentCount,
    ),
  };
}

// 각 퍼즐의 정답이 그보다 앞선(1일 이상) days 일 안의 다른 이력 항목에 그대로
// 있으면 반복으로 잡는다. 같은 날짜의 다른 난이도 교집합은 health 의 shared_answer
// 가 따로 보므로 여기서는 제외한다.
export function findAnswerHistoryRepeats(
  puzzles: readonly AnswerHistoryEntry[],
  history: AnswerHistoryFile,
  options: { days: number },
): AnswerRepeat[] {
  const days = Math.max(0, Math.floor(options.days));
  const repeats: AnswerRepeat[] = [];

  for (const puzzle of puzzles) {
    const puzzleKey = getAnswerHistoryIdentityKey(puzzle);
    const answers = new Set(normalizeAnswers(puzzle.answers));
    if (answers.size === 0) {
      continue;
    }

    for (const previous of history.puzzles) {
      if (getAnswerHistoryIdentityKey(previous) === puzzleKey) {
        continue;
      }
      const gapDays = diffDateKeys(puzzle.date, previous.date);
      if (gapDays < 1 || gapDays > days) {
        continue;
      }
      for (const answer of previous.answers) {
        if (!answers.has(answer)) {
          continue;
        }
        repeats.push({
          answer,
          puzzleId: puzzle.puzzleId,
          date: puzzle.date,
          difficulty: puzzle.difficulty,
          previousPuzzleId: previous.puzzleId,
          previousDate: previous.date,
          previousDifficulty: previous.difficulty,
          gapDays,
        });
      }
    }
  }

  return repeats.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.gapDays - right.gapDays ||
      left.answer.localeCompare(right.answer),
  );
}
