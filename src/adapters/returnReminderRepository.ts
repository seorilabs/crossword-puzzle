// 복귀 리마인드 푸시 동의 유도 상태의 로컬 영속.
// localStorage 접근을 어댑터로 분리해 주입 가능한 storage로 단위 테스트한다.

import {
  initialReturnReminderState,
  type ReturnReminderOutcome,
  type ReturnReminderState,
} from "../../packages/crossword-core/src/returnReminder.ts";

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const STORAGE_KEY = "crossword:return-reminder";

const KNOWN_OUTCOMES: ReadonlySet<ReturnReminderOutcome> = new Set([
  "agreed",
  "rejected",
  "unsupported",
  "error",
]);

function getDefaultStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function normalizeState(value: unknown): ReturnReminderState {
  if (value == null || typeof value !== "object") {
    return initialReturnReminderState;
  }

  const raw = value as Partial<Record<keyof ReturnReminderState, unknown>>;
  const promptCount =
    typeof raw.promptCount === "number" && Number.isFinite(raw.promptCount)
      ? Math.max(0, Math.floor(raw.promptCount))
      : 0;
  const outcome =
    typeof raw.outcome === "string" &&
    KNOWN_OUTCOMES.has(raw.outcome as ReturnReminderOutcome)
      ? (raw.outcome as ReturnReminderOutcome)
      : undefined;
  const lastPromptDate =
    typeof raw.lastPromptDate === "string" ? raw.lastPromptDate : undefined;

  return { promptCount, lastPromptDate, outcome };
}

export function loadReturnReminderState(
  storage: KeyValueStorage | null = getDefaultStorage(),
): ReturnReminderState {
  if (storage == null) {
    return initialReturnReminderState;
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw == null) {
      return initialReturnReminderState;
    }
    return normalizeState(JSON.parse(raw));
  } catch {
    return initialReturnReminderState;
  }
}

export function saveReturnReminderState(
  state: ReturnReminderState,
  storage: KeyValueStorage | null = getDefaultStorage(),
): void {
  if (storage == null) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Local persistence is best effort; the prompt simply may reappear later.
  }
}
