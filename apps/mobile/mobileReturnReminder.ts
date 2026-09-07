import {
  applyReturnReminderOutcome,
  buildReturnReminderPrepromptParams,
  buildReturnReminderPromptParams,
  buildReturnReminderResultParams,
  getNextLocalReturnReminderSchedule,
  markReturnReminderPrompted,
  RETURN_REMINDER_PREPROMPT_EVENT,
  RETURN_REMINDER_PROMPT_EVENT,
  RETURN_REMINDER_RESULT_EVENT,
  RETURN_REMINDER_SCHEDULE_EVENT,
  shouldCancelLocalReturnReminder,
  shouldPromptReturnReminder,
  shouldRefreshLocalReturnReminder,
  type ReturnReminderState,
} from '../../packages/crossword-core/src';

import {
  mobileReturnReminderRepository,
  type MobileReturnReminderRepository,
} from './returnReminderRepository';
import {
  cancelLocalReturnReminderIfStale,
  scheduleLocalReturnReminder,
  type LocalReturnReminderResult,
} from './returnReminderNotifications';

type ReturnReminderTelemetry = {
  impression(name: string, params?: Record<string, unknown>): void;
};

export type MobileReturnReminderDependencies = {
  repository?: MobileReturnReminderRepository;
  schedule?: (promptDate: string) => Promise<LocalReturnReminderResult>;
  cancelStale?: (today: string) => Promise<boolean>;
};

export type PrepareMobileReturnReminderPrepromptInput = {
  enabled: boolean;
  promptDate: string;
  streakDays: number;
  telemetry: ReturnReminderTelemetry;
};

// 완료 직후 사전 안내 카드를 띄울지 판정한다. 게이트(원격 설정·종결·예산·날짜)는
// core shouldPromptReturnReminder 가 맡고, 통과하면 유도 1회로 기록한 뒤 shown 을
// 계측한다. 반환한 상태는 confirm/decline 에 그대로 넘긴다. null 이면 카드를 띄우지
// 않는다.
export async function prepareMobileReturnReminderPreprompt(
  { enabled, promptDate, streakDays, telemetry }: PrepareMobileReturnReminderPrepromptInput,
  { repository = mobileReturnReminderRepository }: MobileReturnReminderDependencies = {},
): Promise<ReturnReminderState | null> {
  const state = await repository.loadState();
  if (!shouldPromptReturnReminder({ enabled, promptDate, state })) {
    return null;
  }

  const prompted = markReturnReminderPrompted(state, promptDate);
  await repository.saveState(prompted);
  telemetry.impression(
    RETURN_REMINDER_PREPROMPT_EVENT,
    buildReturnReminderPrepromptParams('shown', prompted, 'local', streakDays),
  );
  return prompted;
}

export type ConfirmMobileReturnReminderInput = {
  promptDate: string;
  streakDays: number;
  telemetry: ReturnReminderTelemetry;
};

// 사전 안내에서 "알림 받기"를 누른 뒤에만 OS 권한을 요청하고 D+1 09:00 알림을 예약한다.
// 기존 return_reminder_prompt/result 계약(channel=local)은 그대로 유지한다.
export async function confirmMobileReturnReminder(
  prompted: ReturnReminderState,
  { promptDate, streakDays, telemetry }: ConfirmMobileReturnReminderInput,
  {
    repository = mobileReturnReminderRepository,
    schedule = scheduleLocalReturnReminder,
  }: MobileReturnReminderDependencies = {},
): Promise<ReturnReminderState> {
  telemetry.impression(
    RETURN_REMINDER_PREPROMPT_EVENT,
    buildReturnReminderPrepromptParams('accept', prompted, 'local', streakDays),
  );
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
  return resolved;
}

// "괜찮아요"는 시스템 다이얼로그 없이 declined 로 기록한다. 종결이 아니라 익일
// 재안내 대상이며 유도 예산은 소진한다(core 정책).
export async function declineMobileReturnReminder(
  prompted: ReturnReminderState,
  { streakDays, telemetry }: { streakDays: number; telemetry: ReturnReminderTelemetry },
  { repository = mobileReturnReminderRepository }: MobileReturnReminderDependencies = {},
): Promise<ReturnReminderState> {
  telemetry.impression(
    RETURN_REMINDER_PREPROMPT_EVENT,
    buildReturnReminderPrepromptParams('decline', prompted, 'local', streakDays),
  );
  const declined = applyReturnReminderOutcome(prompted, 'declined');
  await repository.saveState(declined);
  return declined;
}

// 동의(agreed) 상태면 매 완료마다 D+1 09:00 로 다시 예약한다. 이전 구현은 동의한
// 첫날 한 번만 예약해 D1 알림 한 건으로 끝났다. 예약 결과는 return_reminder_schedule
// 로 계측하되 상태(outcome)는 바꾸지 않는다 — 권한이 나중에 회수된 경우에도 사용자
// 동의 사실은 유지하고 예약 실패만 데이터로 남긴다.
export async function refreshMobileReturnReminderSchedule(
  promptDate: string,
  { telemetry }: { telemetry: ReturnReminderTelemetry },
  {
    repository = mobileReturnReminderRepository,
    schedule = scheduleLocalReturnReminder,
  }: MobileReturnReminderDependencies = {},
): Promise<boolean> {
  const state = await repository.loadState();
  if (!shouldRefreshLocalReturnReminder(state)) {
    return false;
  }

  const result = await schedule(promptDate);
  const nextSchedule = getNextLocalReturnReminderSchedule(promptDate);
  telemetry.impression(RETURN_REMINDER_SCHEDULE_EVENT, {
    channel: 'local',
    outcome: result.outcome,
    ...(nextSchedule == null ? {} : { reminder_date: nextSchedule.reminderDate }),
    ...(result.errorCode == null ? {} : { error_code: result.errorCode }),
  });
  return result.outcome === 'agreed';
}

// 앱을 다시 열었을 때(활성화·초기 로드) 예약 날짜가 오늘 이전·오늘인 알림은 취소한다.
// 사용자는 이미 돌아왔으므로 그 알림은 소음이고, 오늘 완료하면 refresh 가 D+1 로
// 새로 예약한다.
export async function cancelStaleMobileReturnReminder(
  today: string,
  { cancelStale = cancelLocalReturnReminderIfStale }: MobileReturnReminderDependencies = {},
): Promise<boolean> {
  try {
    return await cancelStale(today);
  } catch {
    return false;
  }
}

export { shouldCancelLocalReturnReminder };
