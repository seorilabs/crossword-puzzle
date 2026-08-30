import {
  applyReturnReminderOutcome,
  buildReturnReminderPromptParams,
  buildReturnReminderResultParams,
  markReturnReminderPrompted,
  RETURN_REMINDER_PROMPT_EVENT,
  RETURN_REMINDER_RESULT_EVENT,
  shouldPromptReturnReminder,
} from '../../packages/crossword-core/src';

import {
  mobileReturnReminderRepository,
  type MobileReturnReminderRepository,
} from './returnReminderRepository';
import {
  scheduleLocalReturnReminder,
  type LocalReturnReminderResult,
} from './returnReminderNotifications';

type ReturnReminderTelemetry = {
  impression(name: string, params?: Record<string, unknown>): void;
};

export type MaybeRequestMobileReturnReminderInput = {
  enabled: boolean;
  promptDate: string;
  telemetry: ReturnReminderTelemetry;
};

type MaybeRequestMobileReturnReminderDependencies = {
  repository?: MobileReturnReminderRepository;
  schedule?: (promptDate: string) => Promise<LocalReturnReminderResult>;
};

export async function maybeRequestMobileReturnReminder(
  { enabled, promptDate, telemetry }: MaybeRequestMobileReturnReminderInput,
  {
    repository = mobileReturnReminderRepository,
    schedule = scheduleLocalReturnReminder,
  }: MaybeRequestMobileReturnReminderDependencies = {},
) {
  const state = await repository.loadState();
  if (!shouldPromptReturnReminder({ enabled, promptDate, state })) {
    return false;
  }

  const prompted = markReturnReminderPrompted(state, promptDate);
  await repository.saveState(prompted);
  telemetry.impression(
    RETURN_REMINDER_PROMPT_EVENT,
    buildReturnReminderPromptParams('mission_complete', undefined, 'local'),
  );

  const result = await schedule(promptDate);
  const resolved = applyReturnReminderOutcome(prompted, result.outcome, {
    errorReason: result.errorReason,
    errorCode: result.errorCode,
    errorWrapperCode: result.errorWrapperCode,
    errorShape: result.errorShape,
    failureStage: result.failureStage,
  });
  await repository.saveState(resolved);
  telemetry.impression(
    RETURN_REMINDER_RESULT_EVENT,
    buildReturnReminderResultParams(resolved, undefined, 'local'),
  );
  return true;
}
