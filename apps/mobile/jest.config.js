module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
};
