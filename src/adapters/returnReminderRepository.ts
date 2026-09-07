// 복귀 리마인드 푸시 동의 유도 상태의 로컬 영속.
// localStorage 접근을 어댑터로 분리해 주입 가능한 storage로 단위 테스트한다.

import {
  initialReturnReminderState,
  type ReturnReminderFailureStage,
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
  "timeout",
  "declined",
]);

const KNOWN_FAILURE_STAGES: ReadonlySet<ReturnReminderFailureStage> = new Set([
  "preflight",
  "sdk_callback",
  "timeout",
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
  // 오류 상세는 error 결과에서만 의미가 있다. 특히 errorCode는 익일 재유도 판정에서
  // 배포 설정 오류 여부를 가리는 데 필요하므로(#319) 라운드트립에서 보존한다.
  const errorReason =
    outcome === "error" && typeof raw.errorReason === "string"
      ? raw.errorReason
      : undefined;
  const errorCode =
    outcome === "error" && typeof raw.errorCode === "string"
      ? raw.errorCode
      : undefined;
  const errorWrapperCode =
    outcome === "error" && typeof raw.errorWrapperCode === "string"
      ? raw.errorWrapperCode
      : undefined;
  const errorShape =
    outcome === "error" &&
    errorCode === "unmapped" &&
    typeof raw.errorShape === "string"
      ? raw.errorShape
      : undefined;
  const failureStage =
    (outcome === "error" ||
      outcome === "timeout" ||
      outcome === "unsupported") &&
    typeof raw.failureStage === "string" &&
    KNOWN_FAILURE_STAGES.has(raw.failureStage as ReturnReminderFailureStage)
      ? (raw.failureStage as ReturnReminderFailureStage)
      : undefined;

  const state: ReturnReminderState = { promptCount, lastPromptDate, outcome };
  if (errorReason != null) {
    state.errorReason = errorReason;
  }
  if (errorCode != null) {
    state.errorCode = errorCode;
  }
  if (errorWrapperCode != null) {
    state.errorWrapperCode = errorWrapperCode;
  }
  if (errorShape != null) {
    state.errorShape = errorShape;
  }
  if (failureStage != null) {
    state.failureStage = failureStage;
  }
  return state;
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
