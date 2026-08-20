import {
  PLATFORM_API_BASE_URL,
  PLATFORM_AUTH_APP_ID,
  PLATFORM_AUTH_EVENT,
} from '../../../packages/crossword-core/src';

jest.mock('../analyticsSinks', () => ({
  dispatchAnalytics: jest.fn(),
}));

const mockFirebaseCustomToken = jest.fn();
const mockPlatformSignIn = jest.fn();
const mockCreatePlatform = jest.fn((_options: unknown) => ({
  identity: { firebaseCustomToken: mockFirebaseCustomToken },
  signIn: mockPlatformSignIn,
}));

jest.mock('@seorilabs/platform-sdk', () => ({
  __esModule: true,
  createPlatform: (options: unknown) => mockCreatePlatform(options),
}));

type FirebaseUserStub = {
  uid: string;
  getIdToken: jest.Mock;
};

type AuthStateListener = (user: FirebaseUserStub | null) => void;

type AuthStub = {
  onAuthStateChanged: jest.Mock;
  signInWithCustomToken: jest.Mock;
};

function user(uid: string, idToken: string): FirebaseUserStub {
  return {
    uid,
    getIdToken: jest.fn(() => Promise.resolve(idToken)),
  };
}

function authStub(options: {
  restoredUser?: FirebaseUserStub | null;
  signedInUser?: FirebaseUserStub;
  onAuthStateChanged?: jest.Mock;
}): AuthStub {
  const signedInUser =
    options.signedInUser ?? user('pb_abc', 'firebase-id-token');
  return {
    onAuthStateChanged:
      options.onAuthStateChanged ??
      jest.fn((listener: AuthStateListener) => {
        listener(options.restoredUser ?? null);
        return jest.fn();
      }),
    signInWithCustomToken: jest.fn(() =>
      Promise.resolve({ user: signedInUser }),
    ),
  };
}

function loadAdapter(stub: AuthStub) {
  jest.resetModules();
  const auth = require('@react-native-firebase/auth').default as jest.Mock;
  auth.mockReturnValue(stub);
  const dispatchAnalytics = require('../analyticsSinks')
    .dispatchAnalytics as jest.Mock;
  const { ensurePlatformAuth } = require('../platformAuth');

  return { ensurePlatformAuth, dispatchAnalytics };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFirebaseCustomToken.mockResolvedValue({
    firebaseCustomToken: 'custom-token',
    appUserId: 'pb_abc',
  });
  mockPlatformSignIn.mockResolvedValue({ appUserId: 'pb_abc' });
});

test('같은 appId로 SDK를 만들고 firebase-id-token 세션을 한 번 연다', async () => {
  const stub = authStub({ restoredUser: null });
  const { ensurePlatformAuth, dispatchAnalytics } = loadAdapter(stub);

  await expect(ensurePlatformAuth()).resolves.toEqual({
    status: 'signed-in',
    appUserId: 'pb_abc',
  });

  expect(mockCreatePlatform).toHaveBeenCalledWith({
    appId: PLATFORM_AUTH_APP_ID,
    baseUrl: PLATFORM_API_BASE_URL,
  });
  expect(mockFirebaseCustomToken).toHaveBeenCalledWith();
  expect(stub.signInWithCustomToken).toHaveBeenCalledWith('custom-token');
  expect(mockPlatformSignIn).toHaveBeenCalledTimes(1);
  expect(mockPlatformSignIn).toHaveBeenCalledWith({
    kind: 'firebase-id-token',
    value: 'firebase-id-token',
  });

  const event = dispatchAnalytics.mock.calls[0][0];
  expect(event.name).toBe(PLATFORM_AUTH_EVENT);
  expect(event.params.outcome).toBe('signed-in');
  expect(Object.values(event.params)).not.toContain('pb_abc');
  expect(Object.values(event.params)).not.toContain('custom-token');
});

test('영속 복원 후 bridge 없이 기존 uid로 Platform session을 연다', async () => {
  const existing = user('pb_existing', 'existing-id-token');
  const stub = authStub({
    restoredUser: existing,
  });
  mockPlatformSignIn.mockResolvedValue({ appUserId: 'pb_existing' });
  const { ensurePlatformAuth } = loadAdapter(stub);

  await expect(ensurePlatformAuth()).resolves.toEqual({
    status: 'signed-in',
    appUserId: 'pb_existing',
  });

  expect(existing.getIdToken).toHaveBeenCalledWith(false);
  expect(mockFirebaseCustomToken).not.toHaveBeenCalled();
  expect(stub.signInWithCustomToken).not.toHaveBeenCalled();
  expect(mockPlatformSignIn).toHaveBeenCalledWith({
    kind: 'firebase-id-token',
    value: 'existing-id-token',
  });
});

test('네트워크 실패를 흡수하고 퍼즐 진입 Promise를 reject하지 않는다', async () => {
  mockFirebaseCustomToken.mockRejectedValue({ code: 'network_error' });
  const { ensurePlatformAuth, dispatchAnalytics } = loadAdapter(
    authStub({ restoredUser: null }),
  );

  await expect(ensurePlatformAuth()).resolves.toEqual({
    status: 'failed',
    code: 'network_error',
  });
  expect(mockPlatformSignIn).not.toHaveBeenCalled();
  expect(dispatchAnalytics.mock.calls[0][0].params.code).toBe('network_error');
});

test('한 런타임에서 여러 번 불러도 bridge와 세션 발급은 각각 한 번이다', async () => {
  const { ensurePlatformAuth, dispatchAnalytics } = loadAdapter(
    authStub({ restoredUser: null }),
  );

  await Promise.all([ensurePlatformAuth(), ensurePlatformAuth()]);

  expect(mockFirebaseCustomToken).toHaveBeenCalledTimes(1);
  expect(mockPlatformSignIn).toHaveBeenCalledTimes(1);
  expect(dispatchAnalytics).toHaveBeenCalledTimes(1);
});

test('onAuthStateChanged가 동기로 호출돼도 구독을 해제한다', async () => {
  const unsubscribe = jest.fn();
  const { ensurePlatformAuth } = loadAdapter(
    authStub({
      onAuthStateChanged: jest.fn((listener: AuthStateListener) => {
        listener(null);
        return unsubscribe;
      }),
    }),
  );

  await ensurePlatformAuth();

  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
