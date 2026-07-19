import remoteConfig from '@react-native-firebase/remote-config';

import {
  defaultLaunchConfig,
  getLaunchConfigDefaultsForRemoteConfig,
  launchConfigKeys,
} from '../../../packages/crossword-core/src';
import { resolveRuntimeSelection } from '../../../src/game-shell/runtimeSelection';
import {
  fetchMobileFirebaseRuntimeConfigSnapshot,
  MOBILE_RUNTIME_CONFIG_CACHE_KEY,
  readCachedMobileFirebaseRuntimeConfigSnapshot,
  validateMobileFirebaseRuntimeConfigSnapshot,
  type MobileFirebaseRuntimeConfigSnapshot,
  type MobileRuntimeConfigStorage,
} from '../firebaseClient';

const nowEpochMs = 1_800_000_000_000;

function createStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial != null) values.set(MOBILE_RUNTIME_CONFIG_CACHE_KEY, initial);

  const storage: MobileRuntimeConfigStorage = {
    getItem: jest.fn(key => Promise.resolve(values.get(key) ?? null)),
    setItem: jest.fn((key, value) => {
      values.set(key, value);
      return Promise.resolve();
    }),
  };
  return { storage, values };
}

function createSnapshot(
  overrides: Partial<MobileFirebaseRuntimeConfigSnapshot> = {},
): MobileFirebaseRuntimeConfigSnapshot {
  const launchConfig = {
    ...defaultLaunchConfig,
    gameRuntimeEnabled: true,
    ...overrides.launchConfig,
  };
  return {
    schemaVersion: 1,
    valueSource: 'remote',
    fetchTimeMillis: nowEpochMs - 1_000,
    gameRuntimeEnabled: launchConfig.gameRuntimeEnabled,
    launchConfig,
    ...overrides,
  };
}

function createRemoteConfigClient({
  fetchRejects = false,
  gateSource = 'remote',
}: Readonly<{
  fetchRejects?: boolean;
  gateSource?: 'remote' | 'default';
}> = {}) {
  const defaults = new Map<string, string | number | boolean>(
    Object.entries(getLaunchConfigDefaultsForRemoteConfig()),
  );

  return {
    fetchTimeMillis: nowEpochMs - 1_000,
    fetchAndActivate: jest.fn(() =>
      fetchRejects
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(true),
    ),
    getValue: jest.fn((key: string) => {
      const value =
        key === launchConfigKeys.gameRuntimeEnabled ? true : defaults.get(key);
      return {
        asBoolean: () => value === true,
        asNumber: () => (typeof value === 'number' ? value : 0),
        asString: () => (typeof value === 'string' ? value : ''),
        getSource: () =>
          key === launchConfigKeys.gameRuntimeEnabled ? gateSource : 'default',
      };
    }),
    setConfigSettings: jest.fn(() => Promise.resolve()),
    setDefaults: jest.fn((nextDefaults: Record<string, unknown>) => {
      Object.entries(nextDefaults).forEach(([key, value]) => {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          defaults.set(key, value);
        }
      });
      return Promise.resolve();
    }),
  };
}

function resolveMobileRuntime(storage: MobileRuntimeConfigStorage) {
  return resolveRuntimeSelection({
    scheduler: {
      schedule(delayMs, onElapsed) {
        const handle = setTimeout(onElapsed, delayMs);
        return () => clearTimeout(handle);
      },
    },
    readPendingBootMarker: () => Promise.resolve(null),
    fetchRuntimeConfig: () => fetchMobileFirebaseRuntimeConfigSnapshot(storage),
    readCachedRuntimeConfig: () =>
      readCachedMobileFirebaseRuntimeConfigSnapshot(storage),
    validateRuntimeConfig: candidate => {
      const snapshot = validateMobileFirebaseRuntimeConfigSnapshot(
        candidate,
        nowEpochMs,
      );
      return snapshot == null
        ? null
        : { gameRuntimeEnabled: snapshot.gameRuntimeEnabled };
    },
  });
}

describe('mobile Firebase runtime config cache', () => {
  const remoteConfigMock = remoteConfig as jest.MockedFunction<
    typeof remoteConfig
  >;

  beforeEach(() => {
    remoteConfigMock.mockReset();
    jest.spyOn(Date, 'now').mockReturnValue(nowEpochMs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('activated remote gate와 같은 전체 LaunchConfig를 저장하고 복구한다', async () => {
    const client = createRemoteConfigClient();
    remoteConfigMock.mockReturnValue(
      client as unknown as ReturnType<typeof remoteConfig>,
    );
    const { storage, values } = createStorage();

    const fetched = await fetchMobileFirebaseRuntimeConfigSnapshot(storage);
    const cached = await readCachedMobileFirebaseRuntimeConfigSnapshot(storage);

    expect(fetched.gameRuntimeEnabled).toBe(true);
    expect(fetched.launchConfig).toEqual({
      ...defaultLaunchConfig,
      gameRuntimeEnabled: true,
    });
    expect(cached).toEqual(fetched);
    expect(values.has(MOBILE_RUNTIME_CONFIG_CACHE_KEY)).toBe(true);
  });

  test('fetch 실패 시 기존의 검증된 activated cache로 runtime을 선택한다', async () => {
    const expected = createSnapshot();
    const { storage } = createStorage(JSON.stringify(expected));
    const client = createRemoteConfigClient({ fetchRejects: true });
    remoteConfigMock.mockReturnValue(
      client as unknown as ReturnType<typeof remoteConfig>,
    );

    await expect(resolveMobileRuntime(storage)).resolves.toEqual({
      target: 'game',
      configSource: 'cache',
      diagnostics: ['fetch-failed'],
    });
  });

  test('최초 실행에서 remote source가 없으면 default를 cache로 승격하지 않는다', async () => {
    const client = createRemoteConfigClient({ gateSource: 'default' });
    remoteConfigMock.mockReturnValue(
      client as unknown as ReturnType<typeof remoteConfig>,
    );
    const { storage, values } = createStorage();

    await expect(resolveMobileRuntime(storage)).resolves.toEqual({
      target: 'legacy',
      configSource: 'bundled',
      reason: 'bundled-disabled',
      diagnostics: ['fetch-failed', 'cache-missing'],
    });
    expect(values.has(MOBILE_RUNTIME_CONFIG_CACHE_KEY)).toBe(false);
  });

  test('손상 JSON, invalid schema, 추가 key 오염을 모두 거부한다', async () => {
    const { storage, values } = createStorage('{not-json');
    await expect(
      readCachedMobileFirebaseRuntimeConfigSnapshot(storage),
    ).resolves.toBeNull();

    values.set(
      MOBILE_RUNTIME_CONFIG_CACHE_KEY,
      JSON.stringify({ ...createSnapshot(), schemaVersion: 2 }),
    );
    await expect(
      readCachedMobileFirebaseRuntimeConfigSnapshot(storage),
    ).resolves.toBeNull();

    values.set(
      MOBILE_RUNTIME_CONFIG_CACHE_KEY,
      JSON.stringify({ ...createSnapshot(), polluted: true }),
    );
    await expect(
      readCachedMobileFirebaseRuntimeConfigSnapshot(storage),
    ).resolves.toBeNull();

    values.set(
      MOBILE_RUNTIME_CONFIG_CACHE_KEY,
      JSON.stringify({
        ...createSnapshot(),
        launchConfig: { ...createSnapshot().launchConfig, polluted: true },
      }),
    );
    await expect(
      readCachedMobileFirebaseRuntimeConfigSnapshot(storage),
    ).resolves.toBeNull();
  });

  test('gate/config 불일치와 만료·과도한 미래 시각을 거부한다', () => {
    expect(
      validateMobileFirebaseRuntimeConfigSnapshot(
        createSnapshot({ gameRuntimeEnabled: false }),
        nowEpochMs,
      ),
    ).toBeNull();
    expect(
      validateMobileFirebaseRuntimeConfigSnapshot(
        createSnapshot({
          fetchTimeMillis: nowEpochMs - 7 * 24 * 60 * 60 * 1_000 - 1,
        }),
        nowEpochMs,
      ),
    ).toBeNull();
    expect(
      validateMobileFirebaseRuntimeConfigSnapshot(
        createSnapshot({ fetchTimeMillis: nowEpochMs + 5 * 60 * 1_000 + 1 }),
        nowEpochMs,
      ),
    ).toBeNull();
  });
});
