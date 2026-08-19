import {PLATFORM_AUTH_EVENT} from '../../../packages/crossword-core/src';

jest.mock('../analyticsSinks', () => ({
  dispatchAnalytics: jest.fn(),
}));

type AuthStateListener = (user: {uid: string} | null) => void;

type AuthStub = {
  onAuthStateChanged: jest.Mock;
  signInWithCustomToken: jest.Mock;
};

function authStub(options: {
  restoredUid?: string | null;
  onAuthStateChanged?: jest.Mock;
}): AuthStub {
  return {
    onAuthStateChanged:
      options.onAuthStateChanged ??
      jest.fn((listener: AuthStateListener) => {
        listener(options.restoredUid == null ? null : {uid: options.restoredUid});
        return jest.fn();
      }),
    signInWithCustomToken: jest.fn(() => Promise.resolve()),
  };
}

/**
 * 어댑터는 모듈 수준에서 결과를 memoize한다. 테스트마다 모듈 레지스트리를 비우고
 * 새로 만들어진 auth mock에 stub을 다시 물린 뒤 로드해야 한다.
 */
function loadAdapter(stub: AuthStub) {
  jest.resetModules();
  const auth = require('@react-native-firebase/auth').default as jest.Mock;
  auth.mockReturnValue(stub);
  const dispatchAnalytics = require('../analyticsSinks')
    .dispatchAnalytics as jest.Mock;
  const {ensurePlatformAuth} = require('../platformAuth');

  return {ensurePlatformAuth, dispatchAnalytics};
}

function bridgeResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function stubBridge(body: unknown, status = 200) {
  (globalThis.fetch as unknown as jest.Mock).mockImplementation(() =>
    bridgeResponse(body, status),
  );
}

const signedInBody = {
  ok: true,
  result: {firebaseCustomToken: 'custom-token', appUserId: 'pb_abc'},
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('미로그인 상태면 브리지 토큰으로 로그인하고 결과를 계측한다', async () => {
  const stub = authStub({restoredUid: null});
  stubBridge(signedInBody);
  const {ensurePlatformAuth, dispatchAnalytics} = loadAdapter(stub);

  await expect(ensurePlatformAuth()).resolves.toEqual({
    status: 'signed-in',
    appUserId: 'pb_abc',
  });
  expect(stub.signInWithCustomToken).toHaveBeenCalledWith('custom-token');

  const event = dispatchAnalytics.mock.calls[0][0];
  expect(event.name).toBe(PLATFORM_AUTH_EVENT);
  expect(event.params.outcome).toBe('signed-in');
  // appUserId는 platform 사용자 식별자다. 계측으로 새어 나가면 안 된다.
  expect(Object.values(event.params)).not.toContain('pb_abc');
});

test('영속 복원으로 이미 로그인 상태면 브리지를 부르지 않는다', async () => {
  const stub = authStub({restoredUid: 'pb_existing'});
  const {ensurePlatformAuth} = loadAdapter(stub);

  await expect(ensurePlatformAuth()).resolves.toEqual({
    status: 'skipped',
    reason: 'already-signed-in',
  });
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(stub.signInWithCustomToken).not.toHaveBeenCalled();
});

// 인증은 부가 기능이다. platform 장애가 퍼즐 풀이를 멈춰서는 안 된다.
test('브리지가 에러 봉투를 주면 code를 보존한 failed가 되고 예외는 새지 않는다', async () => {
  stubBridge({ok: false, error: {code: 'app_paused'}}, 403);
  const {ensurePlatformAuth, dispatchAnalytics} = loadAdapter(
    authStub({restoredUid: null}),
  );

  await expect(ensurePlatformAuth()).resolves.toEqual({
    status: 'failed',
    code: 'app_paused',
  });
  expect(dispatchAnalytics.mock.calls[0][0].params.code).toBe('app_paused');
});

test('한 세션에서 여러 번 불러도 브리지 호출은 한 번이다', async () => {
  stubBridge(signedInBody);
  const {ensurePlatformAuth, dispatchAnalytics} = loadAdapter(
    authStub({restoredUid: null}),
  );

  await Promise.all([ensurePlatformAuth(), ensurePlatformAuth()]);

  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  expect(dispatchAnalytics).toHaveBeenCalledTimes(1);
});

// 구독 즉시 동기 호출되는 구현에서도 unsubscribe 참조가 준비된 뒤 해제해야 한다.
test('onAuthStateChanged가 동기로 호출돼도 구독을 해제한다', async () => {
  const unsubscribe = jest.fn();
  stubBridge(signedInBody);
  const {ensurePlatformAuth} = loadAdapter(
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
