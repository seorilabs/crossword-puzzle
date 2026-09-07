import {
  cancelStaleMobileReturnReminder,
  confirmMobileReturnReminder,
  declineMobileReturnReminder,
  prepareMobileReturnReminderPreprompt,
  refreshMobileReturnReminderSchedule,
} from '../mobileReturnReminder';
import type { MobileReturnReminderRepository } from '../returnReminderRepository';
import type { LocalReturnReminderResult } from '../returnReminderNotifications';
import type { ReturnReminderState } from '../../../packages/crossword-core/src';

function createHarness(initial: ReturnReminderState = { promptCount: 0 }) {
  let state = initial;
  const repository: MobileReturnReminderRepository = {
    loadState: jest.fn(async () => state),
    saveState: jest.fn(async next => {
      state = next;
    }),
  };
  const telemetry = { impression: jest.fn() };
  const schedule = jest.fn(
    async (_promptDate: string): Promise<LocalReturnReminderResult> => ({
      outcome: 'agreed',
    }),
  );
  const cancelStale = jest.fn(async (_today: string) => true);
  return {
    repository,
    schedule,
    cancelStale,
    telemetry,
    get state() {
      return state;
    },
  };
}

const input = (harness: ReturnType<typeof createHarness>) => ({
  enabled: true,
  promptDate: '2026-08-31',
  streakDays: 2,
  telemetry: harness.telemetry,
});

test('Remote Config가 false면 사전 안내·권한 요청·예약·계측을 모두 건너뛴다', async () => {
  const harness = createHarness();
  await expect(
    prepareMobileReturnReminderPreprompt(
      { ...input(harness), enabled: false },
      harness,
    ),
  ).resolves.toBeNull();

  expect(harness.schedule).not.toHaveBeenCalled();
  expect(harness.telemetry.impression).not.toHaveBeenCalled();
});

test('사전 안내는 유도 1회로 기록하고 shown 을 계측하며 시스템 요청은 하지 않는다', async () => {
  const harness = createHarness();
  const prompted = await prepareMobileReturnReminderPreprompt(input(harness), harness);

  expect(prompted).toEqual({ promptCount: 1, lastPromptDate: '2026-08-31' });
  expect(harness.schedule).not.toHaveBeenCalled();
  expect(harness.telemetry.impression).toHaveBeenCalledTimes(1);
  expect(harness.telemetry.impression).toHaveBeenCalledWith(
    'return_reminder_preprompt',
    { action: 'shown', channel: 'local', prompt_count: 1, streak_days: 2 },
  );

  // 같은 날 다시 완료해도 다시 안내하지 않는다.
  await expect(
    prepareMobileReturnReminderPreprompt(input(harness), harness),
  ).resolves.toBeNull();
});

test('알림 받기를 누르면 accept → prompt → 예약 → result 순으로 계측하고 다음 날 알림을 예약한다', async () => {
  const harness = createHarness();
  const prompted = (await prepareMobileReturnReminderPreprompt(
    input(harness),
    harness,
  )) as ReturnReminderState;
  harness.telemetry.impression.mockClear();

  const resolved = await confirmMobileReturnReminder(prompted, input(harness), harness);

  expect(resolved.outcome).toBe('agreed');
  expect(harness.schedule).toHaveBeenCalledTimes(1);
  expect(harness.schedule).toHaveBeenCalledWith('2026-08-31');
  expect(harness.telemetry.impression).toHaveBeenNthCalledWith(
    1,
    'return_reminder_preprompt',
    { action: 'accept', channel: 'local', prompt_count: 1, streak_days: 2 },
  );
  expect(harness.telemetry.impression).toHaveBeenNthCalledWith(
    2,
    'return_reminder_prompt',
    { trigger: 'mission_complete', channel: 'local' },
  );
  expect(harness.telemetry.impression).toHaveBeenNthCalledWith(
    3,
    'return_reminder_result',
    { channel: 'local', outcome: 'agreed', prompt_count: 1 },
  );
  expect(harness.state.outcome).toBe('agreed');
});

test('괜찮아요는 시스템 요청 없이 declined 로 남기고 다음 날 다시 안내한다', async () => {
  const harness = createHarness();
  const prompted = (await prepareMobileReturnReminderPreprompt(
    input(harness),
    harness,
  )) as ReturnReminderState;

  const declined = await declineMobileReturnReminder(prompted, input(harness), harness);

  expect(declined.outcome).toBe('declined');
  expect(harness.schedule).not.toHaveBeenCalled();
  expect(harness.telemetry.impression).toHaveBeenLastCalledWith(
    'return_reminder_preprompt',
    { action: 'decline', channel: 'local', prompt_count: 1, streak_days: 2 },
  );
  await expect(
    prepareMobileReturnReminderPreprompt(input(harness), harness),
  ).resolves.toBeNull();
  await expect(
    prepareMobileReturnReminderPreprompt(
      { ...input(harness), promptDate: '2026-09-01' },
      harness,
    ),
  ).resolves.toEqual({
    promptCount: 2,
    lastPromptDate: '2026-09-01',
    outcome: 'declined',
  });
});

test('권한 거부는 rejected로 종결하고 플레이 흐름에는 예외를 던지지 않는다', async () => {
  const harness = createHarness();
  harness.schedule.mockResolvedValueOnce({ outcome: 'rejected' });
  const prompted = (await prepareMobileReturnReminderPreprompt(
    input(harness),
    harness,
  )) as ReturnReminderState;

  const resolved = await confirmMobileReturnReminder(prompted, input(harness), harness);
  expect(resolved.outcome).toBe('rejected');
  expect(harness.telemetry.impression).toHaveBeenLastCalledWith(
    'return_reminder_result',
    { channel: 'local', outcome: 'rejected', prompt_count: 1 },
  );
});

test('SDK 오류는 코드와 실패 단계를 보존하고 다음 날 재시도 가능하게 남긴다', async () => {
  const harness = createHarness();
  harness.schedule.mockResolvedValueOnce({
    outcome: 'error',
    errorReason: 'native unavailable',
    errorCode: 'native_unavailable',
    failureStage: 'sdk_callback',
  });
  const prompted = (await prepareMobileReturnReminderPreprompt(
    input(harness),
    harness,
  )) as ReturnReminderState;

  await confirmMobileReturnReminder(prompted, input(harness), harness);
  expect(harness.telemetry.impression).toHaveBeenLastCalledWith(
    'return_reminder_result',
    {
      channel: 'local',
      outcome: 'error',
      prompt_count: 1,
      error_reason: 'native unavailable',
      error_code: 'native_unavailable',
      stage: 'sdk_callback',
    },
  );
});

test('동의 상태면 매 완료마다 D+1 알림을 다시 예약하고 schedule 을 계측한다', async () => {
  const harness = createHarness({ promptCount: 1, outcome: 'agreed' });

  await expect(
    refreshMobileReturnReminderSchedule('2026-09-01', input(harness), harness),
  ).resolves.toBe(true);
  expect(harness.schedule).toHaveBeenCalledWith('2026-09-01');
  expect(harness.telemetry.impression).toHaveBeenCalledWith(
    'return_reminder_schedule',
    { channel: 'local', outcome: 'agreed', reminder_date: '2026-09-02' },
  );
  // 상태(outcome)는 그대로 유지한다.
  expect(harness.state).toEqual({ promptCount: 1, outcome: 'agreed' });

  await refreshMobileReturnReminderSchedule('2026-09-02', input(harness), harness);
  expect(harness.schedule).toHaveBeenCalledTimes(2);
});

test('동의하지 않은 상태에서는 재예약하지 않는다', async () => {
  const declined = createHarness({ promptCount: 1, outcome: 'declined' });
  await expect(
    refreshMobileReturnReminderSchedule('2026-09-01', input(declined), declined),
  ).resolves.toBe(false);
  expect(declined.schedule).not.toHaveBeenCalled();

  const fresh = createHarness();
  await expect(
    refreshMobileReturnReminderSchedule('2026-09-01', input(fresh), fresh),
  ).resolves.toBe(false);
});

test('앱을 다시 열면 오늘 이전 예약을 취소하고 실패는 false 로 축약한다', async () => {
  const harness = createHarness();
  await expect(
    cancelStaleMobileReturnReminder('2026-09-01', harness),
  ).resolves.toBe(true);
  expect(harness.cancelStale).toHaveBeenCalledWith('2026-09-01');

  harness.cancelStale.mockRejectedValueOnce(new Error('boom'));
  await expect(
    cancelStaleMobileReturnReminder('2026-09-01', harness),
  ).resolves.toBe(false);
});
