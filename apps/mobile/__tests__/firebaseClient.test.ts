const mockLogEvent = jest.fn();
const mockLogScreenView = jest.fn();

jest.mock('@react-native-firebase/analytics', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    logEvent: mockLogEvent,
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

beforeEach(() => {
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
