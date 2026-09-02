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

// RELEASE_VERSION 소스 계약: 네이티브 버전 브리지가 우선이고, 없을 때만 package.json
// version 폴백이다. package.json version 은 고정 상수(0.1.0)라 릴리즈 버전 소스가 아니다.
describe('RELEASE_VERSION 은 네이티브 앱 버전을 우선 사용한다', () => {
  const loadWithNativeAppInfo = (
    nativeModule: null | { getAppVersion: () => string },
  ) => {
    let loaded: typeof import('../analyticsSinks');
    jest.isolateModules(() => {
      jest.doMock('../specs/NativeAppInfo', () => ({
        __esModule: true,
        default: nativeModule,
      }));
      loaded = require('../analyticsSinks');
    });
    jest.dontMock('../specs/NativeAppInfo');
    return loaded!;
  };

  test('네이티브 버전이 있으면 그 값이 release_version 에 실린다', () => {
    const sinks = loadWithNativeAppInfo({ getAppVersion: () => '1.1.7' });

    expect(sinks.RELEASE_VERSION).toBe('1.1.7');

    sinks.dispatchAnalytics({
      kind: 'game',
      name: 'puzzle_complete',
      params: { puzzle_id: '26083000' },
    });
    expect(mockLogFirebaseAnalyticsEvent).toHaveBeenCalledWith(
      'puzzle_complete',
      { puzzle_id: '26083000', release_version: '1.1.7' },
    );
  });

  test('네이티브 버전이 있으면 패키지 상수 0.1.0 이 실리지 않는다', () => {
    const sinks = loadWithNativeAppInfo({ getAppVersion: () => '1.1.7' });

    expect(sinks.RELEASE_VERSION).not.toBe(
      require('../package.json').version,
    );
  });

  test('네이티브 모듈이 없으면 패키지 버전으로 폴백한다', () => {
    const sinks = loadWithNativeAppInfo(null);

    expect(sinks.RELEASE_VERSION).toBe(require('../package.json').version);
  });

  test('네이티브 버전 읽기가 실패하거나 값이 비면 패키지 버전으로 폴백한다', () => {
    const throwing = loadWithNativeAppInfo({
      getAppVersion: () => {
        throw new Error('bridge unavailable');
      },
    });
    expect(throwing.RELEASE_VERSION).toBe(require('../package.json').version);

    const empty = loadWithNativeAppInfo({ getAppVersion: () => '' });
    expect(empty.RELEASE_VERSION).toBe(require('../package.json').version);
  });
});
