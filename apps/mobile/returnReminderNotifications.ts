import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  EventType,
  TriggerType,
  type Event,
  type Notification,
} from 'react-native-notify-kit';

import {
  getNextLocalReturnReminderSchedule,
  summarizeAgreementFailure,
  type ReturnReminderFailureMetadata,
  type ReturnReminderOutcome,
} from '../../packages/crossword-core/src';

type NotifyKitClient = Pick<
  typeof notifee,
  | 'cancelTriggerNotification'
  | 'createChannel'
  | 'createTriggerNotification'
  | 'getInitialNotification'
  | 'onBackgroundEvent'
  | 'onForegroundEvent'
  | 'requestPermission'
>;

type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
};

export type LocalReturnReminderResult = ReturnReminderFailureMetadata & {
  outcome: ReturnReminderOutcome;
};

export type ReturnReminderOpen = {
  reminderDate: string;
};

export const RETURN_REMINDER_NOTIFICATION_ID =
  'crossword-daily-puzzle-reminder';
export const RETURN_REMINDER_CHANNEL_ID = 'daily-puzzle-reminder';
const RETURN_REMINDER_KIND = 'daily_puzzle';
const PENDING_OPEN_KEY = 'crossword-puzzle:return-reminder:pending-open';
const CONSUMED_OPEN_KEY = 'crossword-puzzle:return-reminder:consumed-open';

function isReturnReminderNotification(notification?: Notification) {
  return (
    notification?.id === RETURN_REMINDER_NOTIFICATION_ID &&
    notification.data?.notification_kind === RETURN_REMINDER_KIND &&
    typeof notification.data?.reminder_date === 'string'
  );
}

function toOpen(notification?: Notification): ReturnReminderOpen | null {
  return isReturnReminderNotification(notification)
    ? { reminderDate: notification?.data?.reminder_date as string }
    : null;
}

async function recordPendingOpen(
  notification: Notification | undefined,
  storage: AsyncKeyValueStorage,
) {
  const open = toOpen(notification);
  if (open == null) {
    return;
  }
  await storage.setItem(PENDING_OPEN_KEY, JSON.stringify(open));
}

export async function consumePendingReturnReminderOpen(
  storage: AsyncKeyValueStorage = AsyncStorage,
): Promise<ReturnReminderOpen | null> {
  try {
    const raw = await storage.getItem(PENDING_OPEN_KEY);
    if (raw == null) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ReturnReminderOpen>;
    await storage.removeItem(PENDING_OPEN_KEY);
    if (typeof parsed.reminderDate !== 'string') {
      return null;
    }

    const consumedDate = await storage.getItem(CONSUMED_OPEN_KEY);
    if (consumedDate === parsed.reminderDate) {
      return null;
    }
    await storage.setItem(CONSUMED_OPEN_KEY, parsed.reminderDate);
    return { reminderDate: parsed.reminderDate };
  } catch {
    return null;
  }
}

export async function consumeInitialReturnReminderOpen(
  client: NotifyKitClient = notifee,
  storage: AsyncKeyValueStorage = AsyncStorage,
  platformOS: typeof Platform.OS = Platform.OS,
) {
  if (platformOS === 'android') {
    try {
      const initial = await client.getInitialNotification();
      await recordPendingOpen(initial?.notification, storage);
    } catch {
      // background handler의 pending marker를 계속 확인한다.
    }
  }
  return consumePendingReturnReminderOpen(storage);
}

export function registerReturnReminderBackgroundHandler(
  client: NotifyKitClient = notifee,
  storage: AsyncKeyValueStorage = AsyncStorage,
) {
  client.onBackgroundEvent(async ({ type, detail }: Event) => {
    if (type === EventType.PRESS) {
      await recordPendingOpen(detail.notification, storage);
    }
  });
}

export function subscribeToReturnReminderOpened(
  onOpen: (open: ReturnReminderOpen) => void,
  client: NotifyKitClient = notifee,
  storage: AsyncKeyValueStorage = AsyncStorage,
) {
  return client.onForegroundEvent(({ type, detail }: Event) => {
    if (type !== EventType.PRESS) {
      return;
    }
    recordPendingOpen(detail.notification, storage)
      .then(() => consumePendingReturnReminderOpen(storage))
      .then(open => {
        if (open != null) {
          onOpen(open);
        }
      })
      .catch(() => {});
  });
}

export async function scheduleLocalReturnReminder(
  promptDate: string,
  client: NotifyKitClient = notifee,
): Promise<LocalReturnReminderResult> {
  const schedule = getNextLocalReturnReminderSchedule(promptDate);
  if (schedule == null) {
    return {
      outcome: 'error',
      errorReason: 'invalid prompt date',
      errorCode: 'invalid_prompt_date',
      failureStage: 'preflight',
    };
  }

  try {
    const settings = await client.requestPermission({
      alert: true,
      badge: false,
      sound: true,
    });
    if (
      settings.authorizationStatus !== AuthorizationStatus.AUTHORIZED &&
      settings.authorizationStatus !== AuthorizationStatus.PROVISIONAL
    ) {
      return { outcome: 'rejected' };
    }

    await client.createChannel({
      id: RETURN_REMINDER_CHANNEL_ID,
      name: '오늘의 퍼즐 알림',
      description: '다음 날 새 퍼즐을 알려드립니다.',
      importance: AndroidImportance.DEFAULT,
    });
    await client.cancelTriggerNotification(RETURN_REMINDER_NOTIFICATION_ID);
    await client.createTriggerNotification(
      {
        id: RETURN_REMINDER_NOTIFICATION_ID,
        title: '오늘의 가로세로 퍼즐이 도착했어요',
        body: '새 낱말 퍼즐로 가볍게 하루를 시작해 보세요.',
        data: {
          notification_kind: RETURN_REMINDER_KIND,
          reminder_date: schedule.reminderDate,
          route: 'today',
        },
        android: {
          channelId: RETURN_REMINDER_CHANNEL_ID,
          pressAction: { id: 'default' },
          smallIcon: 'ic_launcher',
        },
        ios: { sound: 'default' },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: schedule.timestamp,
        // D1 리마인더는 분 단위 정시성이 필요하지 않다. WorkManager를 사용해
        // Android exact-alarm 권한 없이 OS가 허용하는 시점에 전달한다.
        alarmManager: false,
      },
    );
    return { outcome: 'agreed' };
  } catch (error) {
    const summary = summarizeAgreementFailure(error);
    return {
      outcome: 'error',
      errorReason: summary.reason,
      errorCode: summary.code,
      errorWrapperCode: summary.wrapperCode,
      errorShape: summary.shape,
      failureStage: 'sdk_callback',
    };
  }
}
