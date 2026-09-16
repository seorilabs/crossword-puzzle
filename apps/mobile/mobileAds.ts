import { Platform } from 'react-native';

import type {
  RewardedAdRetryStatus,
  RewardedAdTraceEvent,
} from '../../packages/crossword-core/src';

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
export type MobileAdRequestOptions = {
  adUnitMode?: MobileAdUnitMode;
};

export type RewardedAdResult = {
  events: MobileAdEvent[];
  status: 'closed' | 'error' | 'failed' | 'rewarded';
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

// AdMob(RN) 원본 이벤트 → 통일 어휘 대응표(#385). 'error'는 이 통합에서
// ad.addAdEventListener(AdEventType.ERROR)(로드 실패)에서만 발화하고, show()
// 자체의 실패는 별도 'show_failed'로 갈리므로 각각 load_error/failed_to_show로
// 대응한다. RN SDK는 로드·노출 타임아웃을 구분해 알려주지 않아 'timeout'
// 하나뿐이라 load_timeout으로 대응한다(show 도중 멈추는 경우는 관측되지 않음).
export function mapMobileAdTraceEvent(
  event: MobileAdEvent,
): RewardedAdTraceEvent {
  const ad_error_code = event.errorCode;

  switch (event.type) {
    case 'request':
      return { ad_result: 'requested', ad_stage: 'request' };
    case 'loaded':
      return { ad_result: 'loaded', ad_stage: 'load' };
    case 'opened':
      return { ad_result: 'shown', ad_stage: 'show' };
    case 'earned_reward':
      return { ad_result: 'rewarded', ad_stage: 'show' };
    case 'closed':
      return { ad_result: 'dismissed', ad_stage: 'show' };
    case 'show_failed':
      return { ad_error_code, ad_result: 'failed_to_show', ad_stage: 'show' };
    case 'error':
      return { ad_error_code, ad_result: 'load_error', ad_stage: 'error' };
    case 'timeout':
      return { ad_result: 'load_timeout', ad_stage: 'error' };
    case 'initialize_failed':
    case 'module_unavailable':
    case 'unavailable':
      return { ad_error_code, ad_result: 'unavailable', ad_stage: 'error' };
  }
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
    rewardedHint: 'ca-app-pub-9932778305312246/1613644113',
  },
  ios: {
    rewardedHint: 'ca-app-pub-9932778305312246/5603016700',
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
    const events: MobileAdEvent[] = [{ adUnitId, adUnitMode, type: 'request' }];
    const ad = module.RewardedAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });
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
