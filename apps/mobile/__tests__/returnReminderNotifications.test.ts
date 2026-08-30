import {
  AuthorizationStatus,
  EventType,
  TriggerType,
} from 'react-native-notify-kit';

import {
  consumeInitialReturnReminderOpen,
  consumePendingReturnReminderOpen,
  registerReturnReminderBackgroundHandler,
  RETURN_REMINDER_NOTIFICATION_ID,
  scheduleLocalReturnReminder,
  subscribeToReturnReminderOpened,
} from '../returnReminderNotifications';

type Client = NonNullable<Parameters<typeof scheduleLocalReturnReminder>[1]>;

function createClient(status = AuthorizationStatus.AUTHORIZED) {
  return {
    cancelTriggerNotification: jest.fn(async () => {}),
    createChannel: jest.fn(async () => 'daily-puzzle-reminder'),
    createTriggerNotification: jest.fn(
      async () => RETURN_REMINDER_NOTIFICATION_ID,
    ),
    getInitialNotification: jest.fn(async () => null),
    onBackgroundEvent: jest.fn(),
    onForegroundEvent: jest.fn(() => jest.fn()),
    requestPermission: jest.fn(async () => ({ authorizationStatus: status })),
  } as unknown as Client;
}

function createStorage() {
  const values = new Map<string, string>();
  return {
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async removeItem(key: string) {
      values.delete(key);
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function reminderNotification(reminderDate = '2026-09-01') {
  return {
    id: RETURN_REMINDER_NOTIFICATION_ID,
    data: {
      notification_kind: 'daily_puzzle',
      reminder_date: reminderDate,
    },
  };
}

test('권한 허용 시 기존 예약을 취소하고 다음 날 09:00 KST 알림 한 건을 예약한다', async () => {
  const client = createClient();
  await expect(
    scheduleLocalReturnReminder('2026-08-31', client),
  ).resolves.toEqual({ outcome: 'agreed' });

  expect(client.requestPermission).toHaveBeenCalledTimes(1);
  expect(client.requestPermission).toHaveBeenCalledWith({
    alert: true,
    badge: false,
    sound: true,
  });
  expect(client.cancelTriggerNotification).toHaveBeenCalledWith(
    RETURN_REMINDER_NOTIFICATION_ID,
  );
  expect(client.createTriggerNotification).toHaveBeenCalledWith(
    expect.objectContaining({
      id: RETURN_REMINDER_NOTIFICATION_ID,
      data: expect.objectContaining({ reminder_date: '2026-09-01' }),
    }),
    {
      type: TriggerType.TIMESTAMP,
      timestamp: Date.UTC(2026, 8, 1, 0),
      alarmManager: false,
    },
  );
});

test('권한 거부 시 채널·예약을 만들지 않는다', async () => {
  const client = createClient(AuthorizationStatus.DENIED);
  await expect(
    scheduleLocalReturnReminder('2026-08-31', client),
  ).resolves.toEqual({ outcome: 'rejected' });
  expect(client.createChannel).not.toHaveBeenCalled();
  expect(client.createTriggerNotification).not.toHaveBeenCalled();
});

test('SDK 오류는 fail-open error 결과로 축약한다', async () => {
  const client = createClient();
  client.createChannel = jest.fn(async () => {
    throw Object.assign(new Error('native unavailable'), {
      code: 'native_unavailable',
    });
  });
  await expect(
    scheduleLocalReturnReminder('2026-08-31', client),
  ).resolves.toEqual({
    outcome: 'error',
    errorReason: 'native_unavailable: native unavailable',
    errorCode: 'native_unavailable',
    failureStage: 'sdk_callback',
  });
});

test('background 탭을 pending marker로 저장하고 한 번만 소비한다', async () => {
  const client = createClient();
  const storage = createStorage();
  registerReturnReminderBackgroundHandler(client, storage);
  const handler = (client.onBackgroundEvent as jest.Mock).mock.calls[0][0];

  await handler({
    type: EventType.PRESS,
    detail: { notification: reminderNotification() },
  });
  await expect(consumePendingReturnReminderOpen(storage)).resolves.toEqual({
    reminderDate: '2026-09-01',
  });
  await expect(consumePendingReturnReminderOpen(storage)).resolves.toBeNull();
});

test('Android cold start와 background 이벤트가 겹쳐도 같은 날짜는 중복 계측하지 않는다', async () => {
  const client = createClient();
  const storage = createStorage();
  client.getInitialNotification = jest.fn(async () => ({
    notification: reminderNotification(),
    pressAction: { id: 'default' },
  }));

  await expect(
    consumeInitialReturnReminderOpen(client, storage, 'android'),
  ).resolves.toEqual({ reminderDate: '2026-09-01' });

  registerReturnReminderBackgroundHandler(client, storage);
  const handler = (client.onBackgroundEvent as jest.Mock).mock.calls[0][0];
  await handler({
    type: EventType.PRESS,
    detail: { notification: reminderNotification() },
  });
  await expect(consumePendingReturnReminderOpen(storage)).resolves.toBeNull();
});

test('foreground 탭도 오늘의 퍼즐 진입 callback을 한 번 전달한다', async () => {
  const client = createClient();
  const storage = createStorage();
  const onOpen = jest.fn();
  subscribeToReturnReminderOpened(onOpen, client, storage);
  const handler = (client.onForegroundEvent as jest.Mock).mock.calls[0][0];

  handler({
    type: EventType.PRESS,
    detail: { notification: reminderNotification() },
  });
  await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  expect(onOpen).toHaveBeenCalledWith({ reminderDate: '2026-09-01' });
});
