const mockLogFirebaseAnalyticsEvent = jest.fn();
const mockLogFirebaseScreenView = jest.fn();

jest.mock('../firebaseClient', () => ({
  logFirebaseAnalyticsEvent: (...args: unknown[]) =>
    mockLogFirebaseAnalyticsEvent(...args),
  logFirebaseScreenView: (...args: unknown[]) =>
    mockLogFirebaseScreenView(...args),
}));

const { dispatchAnalytics } = require('../analyticsSinks');

beforeEach(() => {
  jest.clearAllMocks();
});

test('RN screen 이벤트는 logScreenView 전용 경로를 사용한다', () => {
  dispatchAnalytics({
    kind: 'screen',
    name: 'today',
    params: { difficulty: 'easy', puzzle_id: '26083000' },
  });

  expect(mockLogFirebaseScreenView).toHaveBeenCalledWith('today', {
    difficulty: 'easy',
    puzzle_id: '26083000',
    release_version: expect.any(String),
  });
  expect(mockLogFirebaseAnalyticsEvent).not.toHaveBeenCalled();
});

test('RN 일반 이벤트는 기존 logEvent 경로를 유지한다', () => {
  dispatchAnalytics({
    kind: 'impression',
    name: 'mission_start',
    params: { puzzle_id: '26083000' },
  });

  expect(mockLogFirebaseAnalyticsEvent).toHaveBeenCalledWith('mission_start', {
    puzzle_id: '26083000',
    release_version: expect.any(String),
  });
  expect(mockLogFirebaseScreenView).not.toHaveBeenCalled();
});
