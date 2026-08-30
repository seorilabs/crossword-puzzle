import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  initialReturnReminderState,
  type ReturnReminderFailureStage,
  type ReturnReminderOutcome,
  type ReturnReminderState,
} from '../../packages/crossword-core/src';

type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type MobileReturnReminderRepository = {
  loadState(): Promise<ReturnReminderState>;
  saveState(state: ReturnReminderState): Promise<void>;
};

const RETURN_REMINDER_STATE_KEY = 'crossword-puzzle:return-reminder';
const knownOutcomes: ReadonlySet<ReturnReminderOutcome> = new Set([
  'agreed',
  'rejected',
  'unsupported',
  'error',
  'timeout',
]);
const knownFailureStages: ReadonlySet<ReturnReminderFailureStage> = new Set([
  'preflight',
  'sdk_callback',
  'timeout',
]);

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function normalizeMobileReturnReminderState(
  value: unknown,
): ReturnReminderState {
  if (value == null || typeof value !== 'object') {
    return initialReturnReminderState;
  }

  const raw = value as Record<string, unknown>;
  const promptCount =
    typeof raw.promptCount === 'number' &&
    Number.isInteger(raw.promptCount) &&
    raw.promptCount >= 0
      ? raw.promptCount
      : 0;
  const outcome = knownOutcomes.has(raw.outcome as ReturnReminderOutcome)
    ? (raw.outcome as ReturnReminderOutcome)
    : undefined;
  const failureStage = knownFailureStages.has(
    raw.failureStage as ReturnReminderFailureStage,
  )
    ? (raw.failureStage as ReturnReminderFailureStage)
    : undefined;

  return {
    promptCount,
    ...(optionalString(raw.lastPromptDate) == null
      ? {}
      : { lastPromptDate: optionalString(raw.lastPromptDate) }),
    ...(outcome == null ? {} : { outcome }),
    ...(optionalString(raw.errorReason) == null
      ? {}
      : { errorReason: optionalString(raw.errorReason) }),
    ...(optionalString(raw.errorCode) == null
      ? {}
      : { errorCode: optionalString(raw.errorCode) }),
    ...(optionalString(raw.errorWrapperCode) == null
      ? {}
      : { errorWrapperCode: optionalString(raw.errorWrapperCode) }),
    ...(optionalString(raw.errorShape) == null
      ? {}
      : { errorShape: optionalString(raw.errorShape) }),
    ...(failureStage == null ? {} : { failureStage }),
  };
}

export function createMobileReturnReminderRepository(
  storage: AsyncKeyValueStorage = AsyncStorage,
): MobileReturnReminderRepository {
  return {
    async loadState() {
      try {
        const raw = await storage.getItem(RETURN_REMINDER_STATE_KEY);
        return raw == null
          ? initialReturnReminderState
          : normalizeMobileReturnReminderState(JSON.parse(raw));
      } catch {
        return initialReturnReminderState;
      }
    },

    async saveState(state) {
      try {
        await storage.setItem(RETURN_REMINDER_STATE_KEY, JSON.stringify(state));
      } catch {
        // 복귀 알림 상태 저장은 best effort이며 퍼즐 플레이를 막지 않는다.
      }
    },
  };
}

export const mobileReturnReminderRepository =
  createMobileReturnReminderRepository();
