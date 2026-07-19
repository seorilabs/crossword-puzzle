import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Platform,
  requireNativeComponent,
  type StyleProp,
  StyleSheet,
  Text,
  Vibration,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import WebView from 'react-native-webview';

import type {
  GameBridgeJsonValue,
  LaunchConfig,
} from '../../packages/crossword-core/src';
import {
  GAME_RUNTIME_ANALYTICS_MARKET_CONFIG_KEY,
  GAME_RUNTIME_ANALYTICS_UI_LOCALE_CONFIG_KEY,
} from '../../packages/crossword-core/src/gameRuntimeAnalytics';
import {
  BUNDLED_FIRST_RUN_CONTENT_CHECKSUMS,
  BUNDLED_FIRST_RUN_CONTENT_IDENTITIES,
  KO_KR_LAUNCH_CONTENT_CONTRACT,
} from '../../packages/crossword-core/src/launchContentCatalog';
import {
  prepareGameSaveMigration,
  recoverLegacyProjectionOutbox,
} from '../../src/game-shell/gameSaveMigration';
import {
  GAME_BOOT_PENDING_KEY,
  bootSelectedRuntime,
  isGameRuntimeHostSupported,
  resolveRuntimeSelection,
  type GameRuntimeSession,
  type RuntimeBootLegacyReason,
  type RuntimeSchedulerPort,
} from '../../src/game-shell/runtimeSelection';
import {
  fetchMobileFirebaseRuntimeConfigSnapshot,
  readCachedMobileFirebaseRuntimeConfigSnapshot,
  validateMobileFirebaseRuntimeConfigSnapshot,
} from './firebaseClient';
import { gameRuntimeAnalyticsPort } from './gameAnalytics';
import {
  createMobileGameBridgeHost,
  isAllowedMobileGameNavigation,
  type MobileGameBridgeHost,
  type MobileGameRuntimeReadyExpectation,
} from './gameBridgeHost';
import { captureMobileLegacySaveSnapshot } from './legacyMobileSaveInventory';
import { showInterstitialAd, showRewardedAd } from './mobileAds';
import { resolveNativeDevelopmentGameRuntimeOverride } from './nativeDevelopmentGameRuntimeOverride';

declare const __DEV__: boolean;

const APP_RUNTIME_VERSION = '0.1.0';
const PENDING_MARKER_KEY = `${GAME_BOOT_PENDING_KEY}:${APP_RUNTIME_VERSION}`;
const NATIVE_DEVELOPMENT_GAME_BOOT_WATCHDOG_MS = 30_000;
const ANDROID_GAME_INDEX_URL =
  'https://appassets.androidplatform.net/assets/crossword-game/index.html';

export const MOBILE_FIRST_RUN_KNOWN_CONTENT_CHECKSUMS: Readonly<
  Record<string, string>
> = BUNDLED_FIRST_RUN_CONTENT_CHECKSUMS;

export function createMobileRuntimeReadyExpectations(
  assetManifestChecksum: string,
): readonly MobileGameRuntimeReadyExpectation[] {
  return Object.freeze(
    BUNDLED_FIRST_RUN_CONTENT_IDENTITIES.map(identity =>
      Object.freeze({
        renderer: 'webgl' as const,
        scene: 'puzzle' as const,
        visible: true as const,
        contentChecksum: identity.contentChecksum,
        contentLocale: KO_KR_LAUNCH_CONTENT_CONTRACT.contentLocale,
        puzzleId: identity.puzzleId,
        assetManifestChecksum,
      }),
    ),
  );
}

export function resolveMobileGameBootOptions(
  developmentOverrideEnabled: boolean,
): Readonly<{ watchdogMs: number }> | undefined {
  return developmentOverrideEnabled
    ? { watchdogMs: NATIVE_DEVELOPMENT_GAME_BOOT_WATCHDOG_MS }
    : undefined;
}

export type NativeGameBundleInitialProps = Readonly<{
  indexUrl: string;
  readAccessUrl?: string;
  assetManifestUrl: string;
  assetManifestChecksum: string;
  bridgeSessionId: string;
}>;

export type MobileRuntimeHostProps = Readonly<{
  legacy: React.ReactNode;
  nativeGameBundle?: unknown;
  nativeDevelopmentGameRuntimeOverride?: unknown;
}>;

type ValidNativeGameBundle = NativeGameBundleInitialProps;

type MobileRuntimeState =
  | { status: 'resolving' }
  | { status: 'booting'; bridge: MobileGameBridgeHost }
  | { status: 'game'; bridge: MobileGameBridgeHost }
  | { status: 'legacy'; reason: RuntimeBootLegacyReason };

type BootControl = Readonly<{
  session: GameRuntimeSession;
  fail(error: Error): void;
}>;

type NativeGameWebViewHandle = Readonly<{
  postMessage(message: string): void;
}>;

type NativeGameWebViewProps = Readonly<{
  source: Readonly<{ uri: string }>;
  allowingReadAccessToURL?: string;
  originWhitelist: readonly string[];
  onShouldStartLoadWithRequest(request: Readonly<{ url: string }>): boolean;
  onMessage(
    event: Readonly<{ nativeEvent: { data: string; url: string } }>,
  ): void;
  onLoad(): void;
  onError(): void;
  onHttpError(): void;
  onContentProcessDidTerminate(): void;
  onRenderProcessGone(): void;
  onOpenWindow(): void;
  javaScriptEnabled: boolean;
  domStorageEnabled: boolean;
  allowFileAccess: boolean;
  allowFileAccessFromFileURLs: boolean;
  allowUniversalAccessFromFileURLs: boolean;
  mixedContentMode: 'never';
  javaScriptCanOpenWindowsAutomatically: boolean;
  setSupportMultipleWindows: boolean;
  sharedCookiesEnabled: boolean;
  thirdPartyCookiesEnabled: boolean;
  cacheEnabled: boolean;
  webviewDebuggingEnabled: boolean;
  allowsBackForwardNavigationGestures: boolean;
  allowsFullscreenVideo: boolean;
  pullToRefreshEnabled: boolean;
  bounces: boolean;
  overScrollMode: 'never';
  nativeConfig?: Readonly<{ component: React.ComponentType<ViewProps> }>;
  style: StyleProp<ViewStyle>;
}>;

// react-native-webview 14.0.1's root declaration intersects platform props,
// which TypeScript 5.9 narrows to `never`. Runtime platform resolution remains
// native; this adapter exposes only the audited common props used here.
const NativeGameWebView = WebView as unknown as React.ForwardRefExoticComponent<
  NativeGameWebViewProps & React.RefAttributes<NativeGameWebViewHandle>
>;
const AndroidNativeGameWebView =
  Platform.OS === 'android'
    ? requireNativeComponent<ViewProps>('CrosswordGameWebView')
    : null;

const scheduler: RuntimeSchedulerPort = {
  schedule(delayMs, onElapsed) {
    const handle = setTimeout(onElapsed, delayMs);
    return () => clearTimeout(handle);
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every(key => allowed.has(key))
  );
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function validateNativeGameBundle(
  candidate: unknown,
  platform: 'android' | 'ios' = Platform.OS === 'ios' ? 'ios' : 'android',
): ValidNativeGameBundle | null {
  if (
    !isRecord(candidate) ||
    !hasExactKeys(
      candidate,
      [
        'indexUrl',
        'assetManifestUrl',
        'assetManifestChecksum',
        'bridgeSessionId',
      ],
      ['readAccessUrl'],
    ) ||
    typeof candidate.indexUrl !== 'string' ||
    typeof candidate.assetManifestUrl !== 'string' ||
    typeof candidate.assetManifestChecksum !== 'string' ||
    typeof candidate.bridgeSessionId !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(candidate.assetManifestChecksum) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      candidate.bridgeSessionId,
    ) ||
    (candidate.readAccessUrl != null &&
      typeof candidate.readAccessUrl !== 'string')
  ) {
    return null;
  }

  const indexUrl = parseUrl(candidate.indexUrl);
  const manifestUrl = parseUrl(candidate.assetManifestUrl);
  const lastSlash = candidate.indexUrl.lastIndexOf('/');
  const directoryUrl = candidate.indexUrl.slice(0, lastSlash + 1);
  if (
    indexUrl == null ||
    manifestUrl == null ||
    lastSlash < 0 ||
    indexUrl.username !== '' ||
    indexUrl.password !== '' ||
    indexUrl.search !== '' ||
    indexUrl.hash !== '' ||
    candidate.assetManifestUrl !== `${directoryUrl}asset-manifest.json`
  ) {
    return null;
  }

  if (platform === 'android') {
    if (
      candidate.indexUrl !== ANDROID_GAME_INDEX_URL ||
      candidate.readAccessUrl != null ||
      indexUrl.protocol !== 'https:'
    ) {
      return null;
    }
  } else {
    if (
      indexUrl.protocol !== 'file:' ||
      !indexUrl.pathname.endsWith('/CrosswordGame/index.html') ||
      candidate.readAccessUrl !== directoryUrl
    ) {
      return null;
    }
  }

  return Object.freeze({
    indexUrl: candidate.indexUrl,
    ...(candidate.readAccessUrl == null
      ? {}
      : { readAccessUrl: candidate.readAccessUrl }),
    assetManifestUrl: candidate.assetManifestUrl,
    assetManifestChecksum: candidate.assetManifestChecksum,
    bridgeSessionId: candidate.bridgeSessionId,
  });
}

function parsePendingMarker(raw: string | null): unknown | null {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function toBridgeConfigValues(
  config: LaunchConfig,
): Readonly<Record<string, GameBridgeJsonValue>> {
  const values: Record<string, GameBridgeJsonValue> = {};
  for (const [key, value] of Object.entries(config)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      values[key] = value;
    }
  }
  return values;
}

function createFailureSignal(): {
  promise: Promise<never>;
  reject(error: Error): void;
} {
  let rejectPromise!: (error: Error) => void;
  let settled = false;
  const promise = new Promise<never>((_resolve, reject) => {
    rejectPromise = reject;
  });
  promise.catch(() => undefined);
  return {
    promise,
    reject(error) {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    },
  };
}

function createBootControl(
  bridge: MobileGameBridgeHost,
  isVisible: () => boolean,
): BootControl {
  const failure = createFailureSignal();
  let disposed = false;
  const proof = <T,>(task: Promise<T>): Promise<T> =>
    Promise.race([task, failure.promise]);

  return {
    session: {
      waitForWebGlContext: () => proof(bridge.waitUntilRuntimeReady()),
      waitForBridgeHandshake: () => proof(bridge.waitUntilHandshakeReady()),
      waitForFirstInteractiveAck: () => proof(bridge.waitUntilRuntimeReady()),
      probeVisibleSurface: () => !disposed && isVisible(),
      dispose() {
        if (disposed) return;
        disposed = true;
        failure.reject(new Error('native game WebView disposed'));
      },
    },
    fail(error) {
      failure.reject(error);
    },
  };
}

function mapRewardedAdState(
  status: 'closed' | 'failed' | 'rewarded',
): 'dismissed' | 'rewarded' | 'unavailable' {
  if (status === 'rewarded') return 'rewarded';
  return status === 'closed' ? 'dismissed' : 'unavailable';
}

async function showBridgeAd(
  placement: string,
): Promise<'showing' | 'shown' | 'rewarded' | 'dismissed' | 'unavailable'> {
  if (placement === 'rewarded_hint') {
    return mapRewardedAdState((await showRewardedAd('rewardedHint')).status);
  }
  if (placement === 'rewarded_bonus_puzzle') {
    return mapRewardedAdState(
      (await showRewardedAd('rewardedBonusPuzzle')).status,
    );
  }
  if (placement === 'interstitial_result') {
    return (await showInterstitialAd('interstitialResult')).status === 'shown'
      ? 'shown'
      : 'unavailable';
  }
  return 'unavailable';
}

function playBridgeHaptic(
  semanticType:
    | 'selection'
    | 'success'
    | 'warning'
    | 'error'
    | 'light'
    | 'medium'
    | 'heavy',
): void {
  const duration = {
    selection: 10,
    light: 10,
    medium: 18,
    success: 20,
    warning: 24,
    error: 28,
    heavy: 30,
  }[semanticType];
  Vibration.vibrate(duration);
}

export function MobileRuntimeHost({
  legacy,
  nativeGameBundle,
  nativeDevelopmentGameRuntimeOverride,
}: MobileRuntimeHostProps) {
  const supported = isGameRuntimeHostSupported('native-webview');
  const bundle = useMemo(
    () => validateNativeGameBundle(nativeGameBundle),
    [nativeGameBundle],
  );
  const [state, setState] = useState<MobileRuntimeState>(() =>
    supported && bundle != null
      ? { status: 'resolving' }
      : { status: 'legacy', reason: 'host-adapter-unavailable' },
  );
  const webViewRef = useRef<NativeGameWebViewHandle>(null);
  const bootControlRef = useRef<BootControl | null>(null);
  const visibleProofRef = useRef(false);
  const bridgeSessionStartedRef = useRef(false);

  useEffect(() => {
    if (!supported || bundle == null) return;
    let cancelled = false;
    let launchConfigSnapshot: LaunchConfig | null = null;
    const launchConfigsBySource: Partial<
      Record<'fetched' | 'cache', LaunchConfig>
    > = {};

    const run = async () => {
      await recoverLegacyProjectionOutbox(AsyncStorage);
      const developmentOverride = resolveNativeDevelopmentGameRuntimeOverride(
        __DEV__,
        nativeDevelopmentGameRuntimeOverride,
      );
      const selection = await resolveRuntimeSelection({
        scheduler,
        readPendingBootMarker: async () =>
          parsePendingMarker(await AsyncStorage.getItem(PENDING_MARKER_KEY)),
        fetchRuntimeConfig: () =>
          developmentOverride == null
            ? fetchMobileFirebaseRuntimeConfigSnapshot(AsyncStorage)
            : Promise.resolve(developmentOverride.runtimeConfigCandidate),
        readCachedRuntimeConfig: () =>
          developmentOverride == null
            ? readCachedMobileFirebaseRuntimeConfigSnapshot(AsyncStorage)
            : Promise.resolve(null),
        validateRuntimeConfig: (candidate, source) => {
          if (developmentOverride != null) {
            if (
              source !== 'fetched' ||
              candidate !== developmentOverride.runtimeConfigCandidate
            ) {
              return null;
            }
            launchConfigsBySource.fetched = developmentOverride.launchConfig;
            return developmentOverride.runtimeConfigCandidate;
          }
          const snapshot =
            validateMobileFirebaseRuntimeConfigSnapshot(candidate);
          if (snapshot == null) return null;
          launchConfigsBySource[source] = snapshot.launchConfig;
          return { gameRuntimeEnabled: snapshot.gameRuntimeEnabled };
        },
      });
      if (cancelled) return;
      if (selection.target === 'legacy') {
        setState({ status: 'legacy', reason: selection.reason });
        return;
      }
      launchConfigSnapshot =
        launchConfigsBySource[selection.configSource] ?? null;
      if (launchConfigSnapshot == null) {
        setState({ status: 'legacy', reason: 'bundled-disabled' });
        return;
      }
      const legacySnapshot = await captureMobileLegacySaveSnapshot({
        market: Platform.OS === 'ios' ? 'app-store' : 'google-play',
        sourceVersion: `${Platform.OS}-main-${APP_RUNTIME_VERSION}`,
        capturedAt: new Date().toISOString(),
      });
      await prepareGameSaveMigration({
        storage: AsyncStorage,
        legacySnapshot,
        knownContentChecksums: MOBILE_FIRST_RUN_KNOWN_CONTENT_CHECKSUMS,
      });

      const result = await bootSelectedRuntime(
        selection,
        {
          scheduler,
          createBootId: () => bundle.bridgeSessionId,
          nowEpochMs: Date.now,
          async writePendingBootMarker(marker) {
            const serialized = JSON.stringify(marker);
            await AsyncStorage.setItem(PENDING_MARKER_KEY, serialized);
            if (
              (await AsyncStorage.getItem(PENDING_MARKER_KEY)) !== serialized
            ) {
              throw new Error('pending marker durable write failed');
            }
          },
          async clearPendingBootMarker() {
            await AsyncStorage.removeItem(PENDING_MARKER_KEY);
            if ((await AsyncStorage.getItem(PENDING_MARKER_KEY)) != null) {
              throw new Error('pending marker durable clear failed');
            }
          },
          async importGameRuntime() {
            const bridge = createMobileGameBridgeHost({
              allowedMessageUrl: bundle.indexUrl,
              runtimeReadyExpectations: createMobileRuntimeReadyExpectations(
                bundle.assetManifestChecksum,
              ),
              sendSerialized(serialized) {
                const webView = webViewRef.current;
                if (webView == null) {
                  throw new Error('native game WebView transport unavailable');
                }
                webView.postMessage(serialized);
              },
              storage: AsyncStorage,
              analytics: gameRuntimeAnalyticsPort,
              showAd: async placement => showBridgeAd(placement),
              playHaptic: playBridgeHaptic,
              onRuntimeReady() {
                visibleProofRef.current = true;
              },
            });
            const control = createBootControl(
              bridge,
              () => visibleProofRef.current,
            );
            bootControlRef.current = control;
            bridgeSessionStartedRef.current = false;
            setState({ status: 'booting', bridge });
            bridge
              .waitUntilHandshakeReady()
              .then(() => {
                if (launchConfigSnapshot == null) {
                  throw new Error('native game launch config unavailable');
                }
                return bridge.sendConfigSnapshot('launch-config/v1', {
                  ...toBridgeConfigValues(launchConfigSnapshot),
                  [GAME_RUNTIME_ANALYTICS_MARKET_CONFIG_KEY]:
                    Platform.OS === 'ios' ? 'app-store' : 'google-play',
                  [GAME_RUNTIME_ANALYTICS_UI_LOCALE_CONFIG_KEY]: 'ko-KR',
                });
              })
              .catch(error => {
                control.fail(
                  error instanceof Error
                    ? error
                    : new Error('native game config bridge failed'),
                );
              });
            return control.session;
          },
        },
        resolveMobileGameBootOptions(developmentOverride != null),
      );

      if (cancelled) {
        if (result.target === 'game') await result.session.dispose();
        return;
      }
      if (result.target === 'game') {
        setState(previous =>
          previous.status === 'booting'
            ? { status: 'game', bridge: previous.bridge }
            : { status: 'legacy', reason: 'runtime-import-failed' },
        );
      } else {
        setState({ status: 'legacy', reason: result.reason });
      }
    };

    run().catch(() => {
      if (!cancelled) {
        setState({ status: 'legacy', reason: 'runtime-import-failed' });
      }
    });

    return () => {
      cancelled = true;
      bootControlRef.current?.session.dispose();
      bootControlRef.current = null;
    };
  }, [bundle, nativeDevelopmentGameRuntimeOverride, supported]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (state.status !== 'booting' && state.status !== 'game') return;
        const bridge = state.bridge;
        const timestamp = Date.now();
        const task =
          nextState === 'active'
            ? Promise.all([bridge.resume(timestamp), bridge.focus(timestamp)])
            : Promise.all([bridge.blur(timestamp), bridge.pause(timestamp)]);
        task.catch(error => {
          bootControlRef.current?.fail(
            error instanceof Error
              ? error
              : new Error('lifecycle bridge failed'),
          );
        });
      },
    );
    return () => subscription.remove();
  }, [state]);

  if (state.status === 'legacy') {
    return <View style={styles.fill}>{legacy}</View>;
  }

  if (state.status === 'resolving' || bundle == null) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.boot}>
        <ActivityIndicator size="large" />
        <Text style={styles.bootTitle}>퍼즐 세계를 준비하고 있어요</Text>
        <Text style={styles.bootBody}>안전한 실행 경로를 확인합니다.</Text>
      </View>
    );
  }

  const failWebView = (reason: string) => {
    bootControlRef.current?.fail(new Error(reason));
  };

  return (
    <View style={styles.fill}>
      <NativeGameWebView
        ref={webViewRef}
        source={{ uri: bundle.indexUrl }}
        allowingReadAccessToURL={bundle.readAccessUrl}
        nativeConfig={
          AndroidNativeGameWebView == null
            ? undefined
            : { component: AndroidNativeGameWebView }
        }
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={request =>
          isAllowedMobileGameNavigation(request.url, bundle.indexUrl)
        }
        onMessage={event => {
          state.bridge
            .receiveSerialized(event.nativeEvent.data, event.nativeEvent.url)
            .catch(error => {
              bootControlRef.current?.fail(
                error instanceof Error
                  ? error
                  : new Error('native game bridge message failed'),
              );
            });
        }}
        onLoad={() => {
          if (bridgeSessionStartedRef.current) return;
          bridgeSessionStartedRef.current = true;
          state.bridge.startSession(bundle.bridgeSessionId).catch(error => {
            bootControlRef.current?.fail(
              error instanceof Error
                ? error
                : new Error('native game bridge session failed'),
            );
          });
        }}
        onError={() => failWebView('native game WebView load failed')}
        onHttpError={() => failWebView('native game WebView HTTP error')}
        onContentProcessDidTerminate={() =>
          failWebView('native game WebView content process terminated')
        }
        onRenderProcessGone={() =>
          failWebView('native game WebView renderer terminated')
        }
        onOpenWindow={() => failWebView('native game popup blocked')}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        cacheEnabled={false}
        webviewDebuggingEnabled={__DEV__}
        allowsBackForwardNavigationGestures={false}
        allowsFullscreenVideo={false}
        pullToRefreshEnabled={false}
        bounces={false}
        overScrollMode="never"
        style={styles.webView}
      />
      {state.status === 'booting' ? (
        <View accessibilityLiveRegion="polite" style={styles.overlay}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.overlayText}>말길을 복원하고 있어요…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  boot: {
    alignItems: 'center',
    backgroundColor: '#F7F3E8',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  bootBody: {
    color: '#5C5A54',
    fontSize: 14,
  },
  bootTitle: {
    color: '#25241F',
    fontSize: 18,
    fontWeight: '700',
  },
  fill: {
    flex: 1,
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(19, 27, 24, 0.82)',
    bottom: 0,
    gap: 12,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  overlayText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  webView: {
    backgroundColor: '#F7F3E8',
    flex: 1,
  },
});
