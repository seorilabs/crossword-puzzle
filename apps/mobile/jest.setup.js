/* eslint-env jest */

const mockStorage = new Map();

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
