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
