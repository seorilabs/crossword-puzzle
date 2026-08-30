import { maybeRequestMobileReturnReminder } from '../mobileReturnReminder';
import type { MobileReturnReminderRepository } from '../returnReminderRepository';
import type { LocalReturnReminderResult } from '../returnReminderNotifications';

function createHarness() {
  let state = { promptCount: 0 };
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
  return { repository, schedule, telemetry };
}

test('Remote Config가 false면 권한 요청·예약·계측을 모두 건너뛴다', async () => {
  const harness = createHarness();
  await expect(
    maybeRequestMobileReturnReminder(
      {
        enabled: false,
        promptDate: '2026-08-31',
        telemetry: harness.telemetry,
      },
      harness,
    ),
  ).resolves.toBe(false);

  expect(harness.schedule).not.toHaveBeenCalled();
  expect(harness.telemetry.impression).not.toHaveBeenCalled();
});

test('완료 후 local 채널을 계측하고 다음 날 알림을 한 번 예약한다', async () => {
  const harness = createHarness();
  await expect(
    maybeRequestMobileReturnReminder(
      {
        enabled: true,
        promptDate: '2026-08-31',
        telemetry: harness.telemetry,
      },
      harness,
    ),
  ).resolves.toBe(true);

  expect(harness.schedule).toHaveBeenCalledTimes(1);
  expect(harness.schedule).toHaveBeenCalledWith('2026-08-31');
  expect(harness.telemetry.impression).toHaveBeenNthCalledWith(
    1,
    'return_reminder_prompt',
    { trigger: 'mission_complete', channel: 'local' },
  );
  expect(harness.telemetry.impression).toHaveBeenNthCalledWith(
    2,
    'return_reminder_result',
    { channel: 'local', outcome: 'agreed', prompt_count: 1 },
  );

  await maybeRequestMobileReturnReminder(
    {
      enabled: true,
      promptDate: '2026-08-31',
      telemetry: harness.telemetry,
    },
    harness,
  );
  expect(harness.schedule).toHaveBeenCalledTimes(1);
});

test('권한 거부는 rejected로 종결하고 플레이 흐름에는 예외를 던지지 않는다', async () => {
  const harness = createHarness();
  harness.schedule.mockResolvedValueOnce({ outcome: 'rejected' });

  await expect(
    maybeRequestMobileReturnReminder(
      {
        enabled: true,
        promptDate: '2026-08-31',
        telemetry: harness.telemetry,
      },
      harness,
    ),
  ).resolves.toBe(true);
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

  await maybeRequestMobileReturnReminder(
    {
      enabled: true,
      promptDate: '2026-08-31',
      telemetry: harness.telemetry,
    },
    harness,
  );
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
