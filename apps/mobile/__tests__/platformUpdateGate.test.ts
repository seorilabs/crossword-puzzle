jest.mock('../analyticsSinks', () => ({
  dispatchAnalytics: jest.fn(),
  RELEASE_VERSION: '1.1.7',
}));

const mockGate = jest.fn();
const mockShouldPrompt = jest.fn();
const mockMarkPrompted = jest.fn();
const mockCreatePlatform = jest.fn((_options: unknown) => ({
  identity: { firebaseCustomToken: jest.fn() },
  presence: { start: jest.fn(), stop: jest.fn(), resume: jest.fn() },
  signIn: jest.fn(),
  config: {
    gate: mockGate,
    shouldPrompt: mockShouldPrompt,
    markPrompted: mockMarkPrompted,
  },
}));

jest.mock('@seorilabs/platform-sdk', () => ({
  __esModule: true,
  createPlatform: (options: unknown) => mockCreatePlatform(options),
}));

function authStubWithNoRestoredUser() {
  return {
    onAuthStateChanged: jest.fn((listener: (user: null) => void) => {
      listener(null);
      return jest.fn();
    }),
    signInWithCustomToken: jest.fn(),
  };
}

function loadAdapter() {
  jest.resetModules();
  const auth = require('@react-native-firebase/auth').default as jest.Mock;
  auth.mockReturnValue(authStubWithNoRestoredUser());
  return require('../platformAuth');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGate.mockReturnValue({ kind: 'ok' });
  mockShouldPrompt.mockResolvedValue(true);
  mockMarkPrompted.mockResolvedValue(undefined);
});

test('AsyncStorage 기반 gateStore를 SDK에 주입한다', () => {
  loadAdapter();

  expect(mockCreatePlatform).toHaveBeenCalledWith(
    expect.objectContaining({
      gateStore: expect.objectContaining({
        load: expect.any(Function),
        save: expect.any(Function),
      }),
    }),
  );
});

test('ok면 구독자에게 null을 보낸다', async () => {
  const { ensurePlatformAuth, subscribeToUpdateGateState } = loadAdapter();
  const listener = jest.fn();
  subscribeToUpdateGateState(listener);
  listener.mockClear();

  await ensurePlatformAuth();

  expect(listener).toHaveBeenCalledWith(null);
  expect(mockMarkPrompted).not.toHaveBeenCalled();
});

test('recommended면 구독자에게 상태를 보내고 노출 이력을 남긴다', async () => {
  const state = { kind: 'recommended', message: '새 버전이 나왔어요' };
  mockGate.mockReturnValue(state);
  const { ensurePlatformAuth, subscribeToUpdateGateState } = loadAdapter();
  const listener = jest.fn();
  subscribeToUpdateGateState(listener);
  listener.mockClear();

  await ensurePlatformAuth();

  expect(listener).toHaveBeenCalledWith(state);
  expect(mockMarkPrompted).toHaveBeenCalledWith(state);
});

test('shouldPrompt가 false면 뜨지 않는다', async () => {
  mockGate.mockReturnValue({ kind: 'recommended', message: '새 버전' });
  mockShouldPrompt.mockResolvedValue(false);
  const { ensurePlatformAuth, subscribeToUpdateGateState } = loadAdapter();
  const listener = jest.fn();
  subscribeToUpdateGateState(listener);
  listener.mockClear();

  await ensurePlatformAuth();

  expect(listener).toHaveBeenCalledWith(null);
  expect(mockMarkPrompted).not.toHaveBeenCalled();
});

test('구독 즉시 현재 상태를 한 번 보낸다', async () => {
  const state = { kind: 'required', message: '업데이트가 필요해요' };
  mockGate.mockReturnValue(state);
  const { ensurePlatformAuth, subscribeToUpdateGateState } = loadAdapter();

  await ensurePlatformAuth();

  const lateListener = jest.fn();
  subscribeToUpdateGateState(lateListener);

  expect(lateListener).toHaveBeenCalledWith(state);
});

test('설정 조회가 던져도 ensurePlatformAuth는 reject하지 않는다', async () => {
  mockGate.mockImplementation(() => {
    throw new Error('config boom');
  });
  const { ensurePlatformAuth } = loadAdapter();

  await expect(ensurePlatformAuth()).resolves.toEqual(
    expect.objectContaining({ status: expect.any(String) }),
  );
  expect(mockMarkPrompted).not.toHaveBeenCalled();
});
