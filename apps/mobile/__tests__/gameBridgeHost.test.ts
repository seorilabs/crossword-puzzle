import {
  buildGameRuntimeAnalyticsEvent,
  GameBridgeCoordinator,
  type GameBridgeMessage,
  type GameBridgeMethodPayloads,
  type GameRuntimeAnalyticsEvent,
} from '../../../packages/crossword-core/src';
import {
  createMobileGameBridgeHost,
  isAllowedMobileGameMessageSource,
  isAllowedMobileGameNavigation,
  type MobileGameRuntimeReadyExpectation,
} from '../gameBridgeHost';

const indexUrl =
  'https://appassets.androidplatform.net/assets/crossword-game/index.html';

const assetManifestChecksum =
  'sha256:3fdc5808ada6c91ae0d355a1c8ea5d45aca3582d51f3013c52949ef0768663a8';
const runtimeReadyExpectations: readonly MobileGameRuntimeReadyExpectation[] = [
  'onboarding-easy-01',
  'onboarding-easy-02',
  'onboarding-easy-03',
].map(puzzleId => ({
  renderer: 'webgl',
  scene: 'puzzle',
  visible: true,
  contentChecksum: `bundled:${puzzleId}:ko-KR:v1`,
  contentLocale: 'ko-KR',
  puzzleId,
  assetManifestChecksum,
}));
const runtimeReadyExpectation = runtimeReadyExpectations[1]!;

function createFixture(
  expectedRuntimeReady: readonly MobileGameRuntimeReadyExpectation[] = runtimeReadyExpectations,
  messageSourceUrl: string = indexUrl,
) {
  const storage = new Map<string, string>();
  const analytics: GameRuntimeAnalyticsEvent[] = [];
  const haptics: string[] = [];
  const lifecycle: string[] = [];
  let runtimeReadyCount = 0;
  let game!: GameBridgeCoordinator;

  const host = createMobileGameBridgeHost({
    allowedMessageUrl: indexUrl,
    runtimeReadyExpectations: expectedRuntimeReady,
    storage: {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => {
        storage.set(key, value);
      },
      removeItem: async key => {
        storage.delete(key);
      },
    },
    async sendSerialized(serialized) {
      await game.receive(JSON.parse(serialized) as GameBridgeMessage);
    },
    analytics: {
      log: async event => {
        analytics.push(event);
      },
    },
    playHaptic: async semanticType => {
      haptics.push(semanticType);
    },
    requestNotification: async () => 'unsupported',
    onRuntimeReady: () => {
      runtimeReadyCount += 1;
    },
  });

  game = new GameBridgeCoordinator({
    role: 'game',
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
      async send(message) {
        await host.receiveSerialized(JSON.stringify(message), messageSourceUrl);
      },
    },
    handlers: {
      'app.pause': () => {
        lifecycle.push('pause');
        return { ack: true };
      },
      'app.resume': () => {
        lifecycle.push('resume');
        return { ack: true };
      },
      'app.focus': () => {
        lifecycle.push('focus');
        return { ack: true };
      },
      'app.blur': () => {
        lifecycle.push('blur');
        return { ack: true };
      },
      'config.snapshot': () => ({ ack: true }),
      'locale.preferred': () => ({ uiLocale: 'ko-KR' }),
      deep_link: payload => ({ navigated: true, route: payload.route }),
    },
  });

  return {
    analytics,
    game,
    haptics,
    host,
    lifecycle,
    runtimeReadyCount: () => runtimeReadyCount,
    storage,
  };
}

describe('mobile game bridge host', () => {
  test('runtime proof allowlist가 비어 있으면 host를 생성하지 않는다', () => {
    expect(() => createFixture([])).toThrow('runtime-proof-policy-empty');
  });

  test('exact local index navigation only', () => {
    expect(isAllowedMobileGameNavigation(indexUrl, indexUrl)).toBe(true);
    expect(isAllowedMobileGameNavigation(`${indexUrl}#escape`, indexUrl)).toBe(
      false,
    );
    expect(isAllowedMobileGameNavigation(`${indexUrl}?next=1`, indexUrl)).toBe(
      false,
    );
    expect(
      isAllowedMobileGameNavigation(
        'https://appassets.androidplatform.net/assets/crossword-game/other.html',
        indexUrl,
      ),
    ).toBe(false);
    expect(
      isAllowedMobileGameNavigation('https://example.com/index.html', indexUrl),
    ).toBe(false);
    expect(isAllowedMobileGameNavigation('not-a-url', indexUrl)).toBe(false);
  });

  test('Android WebMessage의 exact trusted origin만 bridge source로 허용한다', async () => {
    const origin = 'https://appassets.androidplatform.net';
    expect(isAllowedMobileGameMessageSource(indexUrl, indexUrl)).toBe(true);
    expect(isAllowedMobileGameMessageSource(origin, indexUrl)).toBe(true);
    expect(isAllowedMobileGameMessageSource(`${origin}/`, indexUrl)).toBe(true);
    expect(isAllowedMobileGameNavigation(origin, indexUrl)).toBe(false);
    expect(
      isAllowedMobileGameMessageSource(`${origin}/other.html`, indexUrl),
    ).toBe(false);
    expect(
      isAllowedMobileGameMessageSource(`${origin}?escape=1`, indexUrl),
    ).toBe(false);
    expect(
      isAllowedMobileGameMessageSource('https://example.com', indexUrl),
    ).toBe(false);

    const fixture = createFixture(runtimeReadyExpectations, origin);
    await fixture.host.startSession('android-origin-session');
    await fixture.host.waitUntilHandshakeReady();
    expect(
      (await fixture.game.request('runtime.ready', runtimeReadyExpectation))
        .status,
    ).toBe('result');
    await fixture.host.waitUntilRuntimeReady();
  });

  test('handshake 후 durable storage, host command, SDK port와 runtime proof를 왕복한다', async () => {
    const fixture = createFixture();
    await fixture.host.startSession('mobile-host-session');
    await fixture.host.waitUntilHandshakeReady();

    const setResponse = await fixture.game.request('storage.set', {
      key: 'save/current',
      schemaVersion: 'raw-string/v1',
      value: '{"progress":1}',
      transactionId: 'storage-set-1',
    });
    expect(setResponse).toMatchObject({
      status: 'result',
      result: { stored: true, transactionId: 'storage-set-1' },
    });
    expect(fixture.storage.get('save/current')).toBe('{"progress":1}');

    const getResponse = await fixture.game.request('storage.get', {
      key: 'save/current',
      schemaVersion: 'raw-string/v1',
    });
    expect(getResponse).toMatchObject({
      status: 'result',
      result: {
        found: true,
        schemaVersion: 'raw-string/v1',
        value: '{"progress":1}',
      },
    });

    const analyticsEvent = buildGameRuntimeAnalyticsEvent('game_puzzle_start', {
      eventId: 'analytics-1',
      market: 'google-play',
      uiLocale: 'ko-KR',
      contentLocale: 'ko-KR',
      languageProfileId: 'ko-KR',
      languageProfileVersion: 1,
      context: {
        puzzleId: 'onboarding-easy-01',
        difficulty: 'easy',
        gridSize: 5,
        wordCount: 4,
        packId: 'first-run-pack',
        slotId: '2026-07-19T00',
        themeTag: 'onboarding',
      },
      payload: { attemptKind: 'first', attemptNumber: 1 },
    });
    await fixture.game.request('analytics.log', {
      event: analyticsEvent.name,
      params: analyticsEvent.params,
      eventId: analyticsEvent.eventId,
    });
    await fixture.game.request('haptic.play', { semanticType: 'success' });
    expect(fixture.analytics).toEqual([analyticsEvent]);
    expect(fixture.haptics).toEqual(['success']);

    await fixture.host.pause(1);
    await fixture.host.resume(2);
    await fixture.host.focus(3);
    await fixture.host.blur(4);
    expect(fixture.lifecycle).toEqual(['pause', 'resume', 'focus', 'blur']);
    expect(await fixture.host.requestPreferredLocale(['ko-KR'])).toBe('ko-KR');
    expect(await fixture.host.navigate('map')).toBe(true);

    const readyResponse = await fixture.game.request(
      'runtime.ready',
      runtimeReadyExpectation,
    );
    expect(readyResponse.status).toBe('result');
    await fixture.host.waitUntilRuntimeReady();
    expect(fixture.runtimeReadyCount()).toBe(1);

    const duplicateReadyResponse = await fixture.game.request(
      'runtime.ready',
      runtimeReadyExpectation,
    );
    expect(duplicateReadyResponse.status).toBe('result');
    expect(fixture.runtimeReadyCount()).toBe(1);

    await fixture.game.request('storage.remove', {
      key: 'save/current',
      schemaVersion: 'raw-string/v1',
      transactionId: 'storage-remove-1',
    });
    expect(fixture.storage.has('save/current')).toBe(false);
  });

  test('origin, malformed wire, runtime checksum mismatch를 fail-closed 처리한다', async () => {
    const fixture = createFixture();
    await expect(
      fixture.host.receiveSerialized('{}', 'https://example.com/index.html'),
    ).rejects.toThrow('unexpected-message-origin');
    await expect(
      fixture.host.receiveSerialized('{not-json', indexUrl),
    ).rejects.toThrow('invalid-wire-message');
    await expect(
      fixture.host.receiveSerialized('x'.repeat(64 * 1024 + 1), indexUrl),
    ).rejects.toThrow('invalid-wire-message');

    await fixture.host.startSession('runtime-mismatch-session');
    await fixture.host.waitUntilHandshakeReady();
    const wrongPayload: GameBridgeMethodPayloads['runtime.ready'] = {
      ...runtimeReadyExpectation,
      assetManifestChecksum:
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    };
    const response = await fixture.game.request('runtime.ready', wrongPayload);
    expect(response).toMatchObject({
      status: 'error',
      error: { code: 'handler-failed' },
    });
    await expect(fixture.host.waitUntilRuntimeReady()).rejects.toThrow(
      'runtime-proof-mismatch',
    );
    expect(fixture.runtimeReadyCount()).toBe(0);
  });

  test('3개 active board의 exact tuple만 허용하고 puzzle/checksum 교차 조합은 거부한다', async () => {
    for (const expected of runtimeReadyExpectations) {
      const fixture = createFixture();
      await fixture.host.startSession(`exact-${expected.puzzleId}`);
      await fixture.host.waitUntilHandshakeReady();
      expect(
        (await fixture.game.request('runtime.ready', expected)).status,
      ).toBe('result');
      await fixture.host.waitUntilRuntimeReady();
    }

    const mixedFixture = createFixture();
    await mixedFixture.host.startSession('mixed-runtime-proof');
    await mixedFixture.host.waitUntilHandshakeReady();
    const mixedPayload: GameBridgeMethodPayloads['runtime.ready'] = {
      ...runtimeReadyExpectations[0]!,
      puzzleId: runtimeReadyExpectations[2]!.puzzleId,
    };
    expect(
      await mixedFixture.game.request('runtime.ready', mixedPayload),
    ).toMatchObject({
      status: 'error',
      error: { code: 'handler-failed' },
    });
    await expect(mixedFixture.host.waitUntilRuntimeReady()).rejects.toThrow(
      'runtime-proof-mismatch',
    );
  });

  test('첫 인증 후에는 다른 allowlisted board로 runtime proof를 바꾸지 못한다', async () => {
    const fixture = createFixture();
    await fixture.host.startSession('pinned-runtime-proof');
    await fixture.host.waitUntilHandshakeReady();
    expect(
      (
        await fixture.game.request(
          'runtime.ready',
          runtimeReadyExpectations[0]!,
        )
      ).status,
    ).toBe('result');
    await fixture.host.waitUntilRuntimeReady();

    expect(
      await fixture.game.request('runtime.ready', runtimeReadyExpectations[2]!),
    ).toMatchObject({
      status: 'error',
      error: { code: 'handler-failed' },
    });
    expect(fixture.runtimeReadyCount()).toBe(1);
  });
});
