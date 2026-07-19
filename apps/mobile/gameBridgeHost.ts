import {
  GameBridgeCoordinator,
  type GameBridgeAdState,
  type GameBridgeDeepLinkRoute,
  type GameBridgeJsonValue,
  type GameBridgeMessage,
  type GameBridgeMethod,
  type GameBridgeMethodPayloads,
  type GameBridgeMethodResults,
  type GameBridgeNotificationOutcome,
  type GameBridgeReceiveResult,
  type GameBridgeResponse,
  type GameBridgeSnapshot,
} from '../../packages/crossword-core/src/gameBridge.ts';
import {
  isGameRuntimeAnalyticsEvent,
  type GameRuntimeAnalyticsPort,
} from '../../packages/crossword-core/src/gameRuntimeAnalytics.ts';

const MAX_SERIALIZED_MESSAGE_LENGTH = 64 * 1024;

export type MobileGameBridgeStorage = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}>;

export type MobileGameRuntimeReadyExpectation = Readonly<
  GameBridgeMethodPayloads['runtime.ready']
>;

export type MobileGameBridgeHostOptions = Readonly<{
  allowedMessageUrl: string;
  runtimeReadyExpectations: readonly MobileGameRuntimeReadyExpectation[];
  sendSerialized(message: string): void | Promise<void>;
  storage: MobileGameBridgeStorage;
  analytics: GameRuntimeAnalyticsPort;
  loadAd?(
    placement: string,
    transactionId: string,
  ): Promise<Extract<GameBridgeAdState, 'loading' | 'loaded' | 'unavailable'>>;
  showAd?(
    placement: string,
    transactionId: string,
  ): Promise<
    Extract<
      GameBridgeAdState,
      'showing' | 'shown' | 'rewarded' | 'dismissed' | 'unavailable'
    >
  >;
  playHaptic(
    semanticType: GameBridgeMethodPayloads['haptic.play']['semanticType'],
  ): void | Promise<void>;
  requestNotification?(reason: string): Promise<GameBridgeNotificationOutcome>;
  onRuntimeReady?(payload: MobileGameRuntimeReadyExpectation): void;
}>;

export type MobileGameBridgeHost = Readonly<{
  startSession(sessionId: string): Promise<void>;
  receiveSerialized(
    serialized: unknown,
    sourceUrl: string,
  ): Promise<GameBridgeReceiveResult>;
  waitUntilHandshakeReady(): Promise<void>;
  waitUntilRuntimeReady(): Promise<void>;
  getSnapshot(): GameBridgeSnapshot;
  pause(timestamp?: number): Promise<void>;
  resume(timestamp?: number): Promise<void>;
  focus(timestamp?: number): Promise<void>;
  blur(timestamp?: number): Promise<void>;
  sendConfigSnapshot(
    version: string,
    values: Readonly<Record<string, GameBridgeJsonValue>>,
  ): Promise<void>;
  requestPreferredLocale(locales: readonly string[]): Promise<string>;
  navigate(route: GameBridgeDeepLinkRoute, puzzleId?: string): Promise<boolean>;
}>;

class MobileGameBridgeError extends Error {
  constructor(code: string) {
    super(`mobile game bridge rejected: ${code}`);
    this.name = 'MobileGameBridgeError';
  }
}

function createDeferred(): {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
} {
  let settled = false;
  let resolvePromise!: () => void;
  let rejectPromise!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  promise.catch(() => undefined);
  return {
    promise,
    resolve() {
      if (settled) return;
      settled = true;
      resolvePromise();
    },
    reject(error) {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    },
  };
}

function parseSerializedMessage(serialized: unknown): unknown {
  if (
    typeof serialized !== 'string' ||
    serialized.length === 0 ||
    serialized.length > MAX_SERIALIZED_MESSAGE_LENGTH
  ) {
    throw new MobileGameBridgeError('invalid-wire-message');
  }
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new MobileGameBridgeError('invalid-wire-message');
  }
}

function requireResult<M extends GameBridgeMethod>(
  response: GameBridgeResponse<M>,
): GameBridgeMethodResults[M] {
  if (response.status === 'error') {
    throw new MobileGameBridgeError(response.error.code);
  }
  return response.result;
}

function sameRuntimeReadyPayload(
  actual: GameBridgeMethodPayloads['runtime.ready'],
  expected: MobileGameRuntimeReadyExpectation,
): boolean {
  return (
    actual.renderer === expected.renderer &&
    actual.scene === expected.scene &&
    actual.visible === expected.visible &&
    actual.contentChecksum === expected.contentChecksum &&
    actual.contentLocale === expected.contentLocale &&
    actual.puzzleId === expected.puzzleId &&
    actual.assetManifestChecksum === expected.assetManifestChecksum
  );
}

export function isAllowedMobileGameNavigation(
  candidateUrl: string,
  expectedIndexUrl: string,
): boolean {
  if (candidateUrl === expectedIndexUrl) return true;
  try {
    const candidate = new URL(candidateUrl);
    const expected = new URL(expectedIndexUrl);
    return (
      candidate.protocol === expected.protocol &&
      candidate.host === expected.host &&
      candidate.pathname === expected.pathname &&
      candidate.search === '' &&
      candidate.hash === ''
    );
  } catch {
    return false;
  }
}

export function isAllowedMobileGameMessageSource(
  candidateUrl: string,
  expectedIndexUrl: string,
): boolean {
  if (isAllowedMobileGameNavigation(candidateUrl, expectedIndexUrl)) {
    return true;
  }
  try {
    const expected = new URL(expectedIndexUrl);
    if (expected.protocol !== 'https:' || expected.origin === 'null') {
      return false;
    }
    return (
      candidateUrl === expected.origin || candidateUrl === `${expected.origin}/`
    );
  } catch {
    return false;
  }
}

export function createMobileGameBridgeHost(
  options: MobileGameBridgeHostOptions,
): MobileGameBridgeHost {
  const runtimeReadyExpectations = Object.freeze(
    options.runtimeReadyExpectations.map(expectation =>
      Object.freeze({ ...expectation }),
    ),
  );
  if (runtimeReadyExpectations.length === 0) {
    throw new MobileGameBridgeError('runtime-proof-policy-empty');
  }
  const handshakeReady = createDeferred();
  const runtimeReady = createDeferred();
  let acknowledgedRuntimeReady: MobileGameRuntimeReadyExpectation | null = null;

  const coordinator = new GameBridgeCoordinator({
    role: 'host',
    capabilities: [
      'storage',
      'analytics',
      'ad',
      'haptic',
      'notification',
      'runtime',
      'lifecycle',
      'focus',
      'config',
      'locale',
      'navigation',
    ],
    transport: {
      send(message: GameBridgeMessage) {
        return options.sendSerialized(JSON.stringify(message));
      },
    },
    handlers: {
      'storage.get': async ({ key, schemaVersion }) => {
        const value = await options.storage.getItem(key);
        return value == null
          ? { found: false }
          : { found: true, schemaVersion, value };
      },
      'storage.set': async ({ key, value, transactionId }) => {
        if (typeof value !== 'string') {
          throw new MobileGameBridgeError('invalid-storage-value');
        }
        await options.storage.setItem(key, value);
        if ((await options.storage.getItem(key)) !== value) {
          throw new MobileGameBridgeError('storage-readback-failed');
        }
        return { stored: true, transactionId };
      },
      'storage.remove': async ({ key, transactionId }) => {
        await options.storage.removeItem(key);
        if ((await options.storage.getItem(key)) != null) {
          throw new MobileGameBridgeError('storage-delete-readback-failed');
        }
        return { removed: true, transactionId };
      },
      'analytics.log': async ({ event, params, eventId }) => {
        const canonicalEvent = { name: event, params, eventId };
        if (!isGameRuntimeAnalyticsEvent(canonicalEvent)) {
          throw new MobileGameBridgeError('invalid-analytics-event');
        }
        await options.analytics.log(canonicalEvent);
        return { ack: true };
      },
      'ad.load': async ({ placement, transactionId }) => ({
        transactionId,
        state:
          (await options.loadAd?.(placement, transactionId)) ?? 'unavailable',
      }),
      'ad.show': async ({ placement, transactionId }) => ({
        transactionId,
        state:
          (await options.showAd?.(placement, transactionId)) ?? 'unavailable',
      }),
      'haptic.play': async ({ semanticType }) => {
        await options.playHaptic(semanticType);
        return { ack: true };
      },
      'notification.request': async ({ reason }) => ({
        outcome: (await options.requestNotification?.(reason)) ?? 'unsupported',
      }),
      'runtime.ready': payload => {
        const expected = runtimeReadyExpectations.find(candidate =>
          sameRuntimeReadyPayload(payload, candidate),
        );
        if (expected == null) {
          runtimeReady.reject(
            new MobileGameBridgeError('runtime-proof-mismatch'),
          );
          throw new MobileGameBridgeError('runtime-proof-mismatch');
        }
        if (
          acknowledgedRuntimeReady != null &&
          !sameRuntimeReadyPayload(payload, acknowledgedRuntimeReady)
        ) {
          throw new MobileGameBridgeError('runtime-proof-changed');
        }
        if (acknowledgedRuntimeReady == null) {
          acknowledgedRuntimeReady = Object.freeze({ ...payload });
          options.onRuntimeReady?.(payload);
          runtimeReady.resolve();
        }
        return { ack: true };
      },
    },
  });

  async function sendHostRequest<
    M extends
      | 'app.pause'
      | 'app.resume'
      | 'app.focus'
      | 'app.blur'
      | 'config.snapshot'
      | 'locale.preferred'
      | 'deep_link',
  >(
    method: M,
    payload: GameBridgeMethodPayloads[M],
  ): Promise<GameBridgeResponse<M>> {
    const response = await coordinator.request(method, payload);
    if (response.status === 'error') {
      throw new MobileGameBridgeError(response.error.code);
    }
    return response;
  }

  const timestamp = (value?: number) => value ?? Date.now();

  return {
    async startSession(sessionId) {
      await coordinator.startSession(sessionId);
      if (coordinator.getSnapshot().state === 'rejected') {
        handshakeReady.reject(new MobileGameBridgeError('transport-error'));
        throw new MobileGameBridgeError('transport-error');
      }
    },
    async receiveSerialized(serialized, sourceUrl) {
      if (
        !isAllowedMobileGameMessageSource(sourceUrl, options.allowedMessageUrl)
      ) {
        throw new MobileGameBridgeError('unexpected-message-origin');
      }
      const result = await coordinator.receive(
        parseSerializedMessage(serialized),
      );
      const snapshot = coordinator.getSnapshot();
      if (snapshot.state === 'ready') handshakeReady.resolve();
      else if (snapshot.state === 'rejected') {
        handshakeReady.reject(new MobileGameBridgeError('handshake-rejected'));
      }
      return result;
    },
    waitUntilHandshakeReady: () => handshakeReady.promise,
    waitUntilRuntimeReady: () => runtimeReady.promise,
    getSnapshot: () => coordinator.getSnapshot(),
    async pause(value) {
      requireResult(
        await sendHostRequest('app.pause', { timestamp: timestamp(value) }),
      );
    },
    async resume(value) {
      requireResult(
        await sendHostRequest('app.resume', { timestamp: timestamp(value) }),
      );
    },
    async focus(value) {
      requireResult(
        await sendHostRequest('app.focus', { timestamp: timestamp(value) }),
      );
    },
    async blur(value) {
      requireResult(
        await sendHostRequest('app.blur', { timestamp: timestamp(value) }),
      );
    },
    async sendConfigSnapshot(version, values) {
      requireResult(
        await sendHostRequest('config.snapshot', { version, values }),
      );
    },
    async requestPreferredLocale(locales) {
      const response = await sendHostRequest('locale.preferred', { locales });
      return response.status === 'result' ? response.result.uiLocale : 'ko-KR';
    },
    async navigate(route, puzzleId) {
      if (route === 'puzzle' && puzzleId == null) {
        throw new MobileGameBridgeError('puzzle-id-required');
      }
      const payload: GameBridgeMethodPayloads['deep_link'] =
        route === 'puzzle'
          ? { route, puzzleId: puzzleId as string }
          : { route };
      const response = await sendHostRequest('deep_link', payload);
      return response.status === 'result' && response.result.navigated;
    },
  };
}
