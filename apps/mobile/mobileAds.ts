import { Platform } from 'react-native';

import type { RewardedAdRetryStatus } from '../../packages/crossword-core/src';

declare const __DEV__: boolean;
declare const process:
  | {
      env?: {
        NODE_ENV?: string;
      };
    }
  | undefined;

type GoogleMobileAdsModule = typeof import('react-native-google-mobile-ads');
type MobileAdEventType =
  | 'closed'
  | 'earned_reward'
  | 'error'
  | 'initialize_failed'
  | 'loaded'
  | 'module_unavailable'
  | 'opened'
  | 'request'
  | 'show_failed'
  | 'timeout'
  | 'unavailable';

export type MobileAdEvent = {
  adUnitId?: string;
  adUnitMode?: MobileAdUnitMode;
  errorCode?: string;
  type: MobileAdEventType;
};

export type MobileAdUnitMode = 'production' | 'test';
export type RewardedAdPlacement = 'rewardedHint';
export type InterstitialAdPlacement = 'interstitialResult';
export type MobileAdRequestOptions = {
  adUnitMode?: MobileAdUnitMode;
};

export type RewardedAdResult = {
  events: MobileAdEvent[];
  status: 'closed' | 'error' | 'failed' | 'rewarded';
};

export type InterstitialAdResult = {
  events: MobileAdEvent[];
  status: 'failed' | 'shown';
};

const unsupportedRewardedEventTypes = new Set<MobileAdEventType>([
  'initialize_failed',
  'module_unavailable',
  'unavailable',
]);

export function getMobileRewardedAdRetryStatus(
  result: RewardedAdResult,
): RewardedAdRetryStatus {
  if (result.status === 'rewarded') {
    return 'rewarded';
  }

  if (result.status === 'closed') {
    return 'dismissed';
  }

  if (result.status === 'error') {
    return 'error';
  }

  return result.events.some(event =>
    unsupportedRewardedEventTypes.has(event.type),
  )
    ? 'unsupported'
    : 'failed';
}

// [#381] showRewardedAd()가 예외를 던지면(로드 실패 등) runRewardedHintAdFlow의
// mapError가 이 결과로 정규화한다. status를 'failed'가 아닌 'error'로 남겨야
// rewarded_hint_ad_result의 ad_status에서 정상 실패 경로와 구분된다.
export function mapRewardedAdRetryError(error: unknown): RewardedAdResult {
  return {
    events: [{ errorCode: getMobileAdErrorCode(error), type: 'error' }],
    status: 'error',
  };
}

const loadTimeoutMs = 15000;

const productionAdUnitIds = {
  android: {
    interstitialResult: 'ca-app-pub-2444587584524186/4930691809',
    rewardedHint: 'ca-app-pub-2444587584524186/7533141122',
  },
  ios: {
    interstitialResult: 'ca-app-pub-2444587584524186/3402324424',
    rewardedHint: 'ca-app-pub-2444587584524186/6151776694',
  },
} as const;

let mobileAdsModulePromise: Promise<GoogleMobileAdsModule | null> | null = null;
let initializationPromise: Promise<boolean> | null = null;
let initializationErrorCode: string | undefined;

function isTestRuntime() {
  return typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
}

async function getMobileAdsModule() {
  if (isTestRuntime()) {
    return null;
  }

  if (mobileAdsModulePromise == null) {
    mobileAdsModulePromise = import('react-native-google-mobile-ads').catch(
      () => null,
    );
  }

  return mobileAdsModulePromise;
}

function getPlatformAdUnitIds() {
  return Platform.OS === 'ios'
    ? productionAdUnitIds.ios
    : productionAdUnitIds.android;
}

function getRewardedAdUnitId(
  module: GoogleMobileAdsModule,
  placement: RewardedAdPlacement,
  options: MobileAdRequestOptions = {},
) {
  return __DEV__ || options.adUnitMode === 'test'
    ? module.TestIds.REWARDED
    : getPlatformAdUnitIds()[placement];
}

function getInterstitialAdUnitId(
  module: GoogleMobileAdsModule,
  options: MobileAdRequestOptions = {},
) {
  return __DEV__ || options.adUnitMode === 'test'
    ? module.TestIds.INTERSTITIAL
    : getPlatformAdUnitIds().interstitialResult;
}

function getAdUnitMode(options: MobileAdRequestOptions = {}): MobileAdUnitMode {
  return __DEV__ || options.adUnitMode === 'test' ? 'test' : 'production';
}

export function createMobileAdsRequestConfiguration(
  module: Pick<GoogleMobileAdsModule, 'MaxAdContentRating'>,
) {
  return {
    maxAdContentRating: module.MaxAdContentRating.PG,
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
    testDeviceIdentifiers: ['EMULATOR'],
  };
}

function createUnavailableRewardedResult(
  type: Extract<MobileAdEventType, 'initialize_failed' | 'module_unavailable'>,
): RewardedAdResult {
  return {
    events: [{ errorCode: initializationErrorCode, type }],
    status: 'failed',
  };
}

function createUnavailableInterstitialResult(
  type: Extract<MobileAdEventType, 'initialize_failed' | 'module_unavailable'>,
): InterstitialAdResult {
  return {
    events: [{ errorCode: initializationErrorCode, type }],
    status: 'failed',
  };
}

export async function initializeMobileAds() {
  if (initializationPromise != null) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const module = await getMobileAdsModule();

    if (module == null) {
      return false;
    }

    try {
      const mobileAds = module.default();
      await mobileAds.setRequestConfiguration(
        createMobileAdsRequestConfiguration(module),
      );
      await mobileAds.initialize();
      initializationErrorCode = undefined;
      return true;
    } catch (error) {
      initializationErrorCode = getMobileAdErrorCode(error);
      return false;
    }
  })();

  return initializationPromise;
}

export async function showRewardedAd(
  placement: RewardedAdPlacement,
  options: MobileAdRequestOptions = {},
): Promise<RewardedAdResult> {
  const module = await getMobileAdsModule();

  if (module == null) {
    return createUnavailableRewardedResult('module_unavailable');
  }

  if (!(await initializeMobileAds())) {
    return createUnavailableRewardedResult('initialize_failed');
  }

  return new Promise(resolve => {
    const adUnitMode = getAdUnitMode(options);
    const adUnitId = getRewardedAdUnitId(module, placement, options);
    const events: MobileAdEvent[] = [
      { adUnitId, adUnitMode, type: 'request' },
    ];
    const ad = module.RewardedAd.createForAdRequest(
      adUnitId,
      { requestNonPersonalizedAdsOnly: true },
    );
    const unsubscribers: Array<() => void> = [];
    let hasResolved = false;
    let hasEarnedReward = false;

    function cleanup() {
      unsubscribers.forEach(unsubscribe => unsubscribe());
      clearTimeout(timeoutId);
    }

    function resolveOnce(status: RewardedAdResult['status']) {
      if (hasResolved) {
        return;
      }

      hasResolved = true;
      cleanup();
      resolve({ events, status });
    }

    const timeoutId = setTimeout(() => {
      events.push({ type: 'timeout' });
      resolveOnce('failed');
    }, loadTimeoutMs);

    unsubscribers.push(
      ad.addAdEventListener(module.RewardedAdEventType.LOADED, () => {
        events.push({ type: 'loaded' });
        clearTimeout(timeoutId);
        ad.show().catch(error => {
          events.push({
            errorCode: getMobileAdErrorCode(error),
            type: 'show_failed',
          });
          resolveOnce('failed');
        });
      }),
      ad.addAdEventListener(module.AdEventType.OPENED, () => {
        events.push({ type: 'opened' });
      }),
      ad.addAdEventListener(module.RewardedAdEventType.EARNED_REWARD, () => {
        hasEarnedReward = true;
        events.push({ type: 'earned_reward' });
      }),
      ad.addAdEventListener(module.AdEventType.CLOSED, () => {
        events.push({ type: 'closed' });
        resolveOnce(hasEarnedReward ? 'rewarded' : 'closed');
      }),
      ad.addAdEventListener(module.AdEventType.ERROR, error => {
        events.push({ errorCode: getMobileAdErrorCode(error), type: 'error' });
        resolveOnce('failed');
      }),
    );

    ad.load();
  });
}

export async function showInterstitialAd(
  _placement: InterstitialAdPlacement,
  options: MobileAdRequestOptions = {},
): Promise<InterstitialAdResult> {
  const module = await getMobileAdsModule();

  if (module == null) {
    return createUnavailableInterstitialResult('module_unavailable');
  }

  if (!(await initializeMobileAds())) {
    return createUnavailableInterstitialResult('initialize_failed');
  }

  return new Promise(resolve => {
    const adUnitMode = getAdUnitMode(options);
    const adUnitId = getInterstitialAdUnitId(module, options);
    const events: MobileAdEvent[] = [
      { adUnitId, adUnitMode, type: 'request' },
    ];
    const ad = module.InterstitialAd.createForAdRequest(
      adUnitId,
      { requestNonPersonalizedAdsOnly: true },
    );
    const unsubscribers: Array<() => void> = [];
    let hasResolved = false;
    let hasOpened = false;

    function cleanup() {
      unsubscribers.forEach(unsubscribe => unsubscribe());
      clearTimeout(timeoutId);
    }

    function resolveOnce(status: InterstitialAdResult['status']) {
      if (hasResolved) {
        return;
      }

      hasResolved = true;
      cleanup();
      resolve({ events, status });
    }

    const timeoutId = setTimeout(() => {
      events.push({ type: 'timeout' });
      resolveOnce(hasOpened ? 'shown' : 'failed');
    }, loadTimeoutMs);

    unsubscribers.push(
      ad.addAdEventListener(module.AdEventType.LOADED, () => {
        events.push({ type: 'loaded' });
        clearTimeout(timeoutId);
        ad.show().catch(error => {
          events.push({
            errorCode: getMobileAdErrorCode(error),
            type: 'show_failed',
          });
          resolveOnce('failed');
        });
      }),
      ad.addAdEventListener(module.AdEventType.OPENED, () => {
        hasOpened = true;
        events.push({ type: 'opened' });
      }),
      ad.addAdEventListener(module.AdEventType.CLOSED, () => {
        events.push({ type: 'closed' });
        resolveOnce('shown');
      }),
      ad.addAdEventListener(module.AdEventType.ERROR, error => {
        events.push({ errorCode: getMobileAdErrorCode(error), type: 'error' });
        resolveOnce('failed');
      }),
    );

    ad.load();
  });
}

export async function openMobileAdsInspector() {
  const module = await getMobileAdsModule();

  if (module == null) {
    return {
      errorCode: 'module_unavailable',
      status: 'failed' as const,
    };
  }

  if (!(await initializeMobileAds())) {
    return {
      errorCode: initializationErrorCode ?? 'initialize_failed',
      status: 'failed' as const,
    };
  }

  try {
    await module.default().openAdInspector();
    return { status: 'opened' as const };
  } catch (error) {
    return {
      errorCode: getMobileAdErrorCode(error),
      status: 'failed' as const,
    };
  }
}

export function getMobileAdErrorCode(error: unknown) {
  if (
    error != null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  if (error instanceof Error) {
    return error.name || 'error';
  }

  return 'unknown';
}
