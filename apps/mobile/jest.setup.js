/* eslint-env jest */

const mockStorage = new Map();

global.fetch = jest.fn(() =>
  Promise.reject(new Error('fetch is mocked in mobile Jest')),
);

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    clear: jest.fn(() => {
      mockStorage.clear();
      return Promise.resolve();
    }),
    getItem: jest.fn(key => Promise.resolve(mockStorage.get(key) ?? null)),
    removeItem: jest.fn(key => {
      mockStorage.delete(key);
      return Promise.resolve();
    }),
    setItem: jest.fn((key, value) => {
      mockStorage.set(key, value);
      return Promise.resolve();
    }),
  },
}));

jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    // 기본값은 "복원 결과 미로그인". 개별 테스트가 필요하면 덮어쓴다.
    onAuthStateChanged: jest.fn(listener => {
      listener(null);
      return jest.fn();
    }),
    signInWithCustomToken: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('@react-native-firebase/analytics', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    logEvent: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('@react-native-firebase/remote-config', () => {
  const values = new Map();

  return {
    __esModule: true,
    default: jest.fn(() => ({
      fetchAndActivate: jest.fn(() => Promise.resolve(false)),
      getValue: jest.fn(key => {
        const value = values.get(key);

        return {
          asBoolean: () => Boolean(value),
          asNumber: () => (typeof value === 'number' ? value : 0),
        };
      }),
      setConfigSettings: jest.fn(() => Promise.resolve()),
      setDefaults: jest.fn(defaults => {
        Object.entries(defaults).forEach(([key, value]) => {
          values.set(key, value);
        });
        return Promise.resolve();
      }),
    })),
  };
});

jest.mock('react-native-notify-kit', () => {
  const client = {
    cancelTriggerNotification: jest.fn(() => Promise.resolve()),
    createChannel: jest.fn(() => Promise.resolve('daily-puzzle-reminder')),
    createTriggerNotification: jest.fn(() =>
      Promise.resolve('crossword-daily-puzzle-reminder'),
    ),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
    onBackgroundEvent: jest.fn(),
    onForegroundEvent: jest.fn(() => jest.fn()),
    requestPermission: jest.fn(() =>
      Promise.resolve({ authorizationStatus: 1 }),
    ),
  };

  return {
    __esModule: true,
    default: client,
    AndroidImportance: { DEFAULT: 3 },
    AuthorizationStatus: {
      NOT_DETERMINED: -1,
      DENIED: 0,
      AUTHORIZED: 1,
      PROVISIONAL: 2,
    },
    EventType: { PRESS: 1 },
    TriggerType: { TIMESTAMP: 0 },
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    SafeAreaProvider: ({ children }) =>
      React.createElement(View, null, children),
    SafeAreaView: ({ children, ...props }) =>
      React.createElement(View, props, children),
    useSafeAreaFrame: () => ({
      height: 812,
      width: 375,
      x: 0,
      y: 0,
    }),
    useSafeAreaInsets: () => ({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    }),
  };
});
