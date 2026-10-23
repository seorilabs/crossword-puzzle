import { Platform } from 'react-native';
const mockSetConsent = jest.fn().mockResolvedValue(undefined);
const mockSetCollection = jest.fn().mockResolvedValue(undefined);
const mockLogEvent = jest.fn();
const mockLogScreenView = jest.fn();

jest.mock('@react-native-firebase/analytics', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    logEvent: mockLogEvent,
    setConsent: mockSetConsent,
    setAnalyticsCollectionEnabled: mockSetCollection,
    logScreenView: mockLogScreenView,
  })),
}));

jest.mock('@react-native-firebase/remote-config', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const {
  logFirebaseAnalyticsEvent,
  logFirebaseScreenView,
} = require('../firebaseClient');

const { usageStatistics } = require('../usageStatistics');
beforeEach(async () => {
  await usageStatistics.initialize();
  await usageStatistics.setEnabled(true);
  jest.clearAllMocks();
  mockLogEvent.mockResolvedValue(undefined);
  mockLogScreenView.mockResolvedValue(undefined);
});

test('화면 이름과 class를 logScreenView 예약 필드로 전달한다', async () => {
  await logFirebaseScreenView('today', {
    difficulty: 'easy',
    firebase_screen: 'rejected',
    firebase_test: 'rejected',
    puzzle_id: '26083000',
  });

  expect(mockLogScreenView).toHaveBeenCalledWith({
    difficulty: 'easy',
    puzzle_id: '26083000',
    screen_class: 'today',
    screen_name: 'today',
  });
  expect(mockLogEvent).not.toHaveBeenCalled();
});

test('화면 계측 실패를 흡수해 퍼즐 흐름을 막지 않는다', async () => {
  mockLogScreenView.mockRejectedValue(new Error('analytics unavailable'));

  await expect(logFirebaseScreenView('home')).resolves.toBeUndefined();
});

test('일반 이벤트는 기존 logEvent 경로를 유지한다', async () => {
  await logFirebaseAnalyticsEvent('mission_start', { puzzle_id: '26083000' });

  expect(mockLogEvent).toHaveBeenCalledWith('mission_start', {
    puzzle_id: '26083000',
  });
  expect(mockLogScreenView).not.toHaveBeenCalled();
});

test('iOS는 통계 선택과 독립적으로 광고 신호를 거부한다', async () => {
  Platform.OS = 'ios';
  const { configureFirebaseUsageStatistics } = require('../firebaseClient');
  await configureFirebaseUsageStatistics(false);
  expect(mockSetConsent).toHaveBeenCalledWith({
    ad_storage: false,
    ad_user_data: false,
    ad_personalization: false,
    analytics_storage: false,
  });
  expect(mockSetCollection).toHaveBeenLastCalledWith(false);
  await configureFirebaseUsageStatistics(true);
  expect(mockSetConsent).toHaveBeenLastCalledWith({
    ad_storage: false,
    ad_user_data: false,
    ad_personalization: false,
    analytics_storage: true,
  });
});

test('통계를 끄면 화면과 게임 이벤트를 모두 차단한다', async () => {
  await usageStatistics.setEnabled(false);
  await logFirebaseScreenView('home');
  await logFirebaseAnalyticsEvent('mission_start');
  expect(mockLogScreenView).not.toHaveBeenCalled();
  expect(mockLogEvent).not.toHaveBeenCalled();
});
