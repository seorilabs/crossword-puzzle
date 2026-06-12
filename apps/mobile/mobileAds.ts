import { Platform } from 'react-native';

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
  | 'loaded'
  | 'opened'
  | 'show_failed'
  | 'timeout'
  | 'unavailable';

export type MobileAdEvent = {
  errorCode?: string;
  type: MobileAdEventType;
};

export type RewardedAdPlacement = 'rewardedBonusPuzzle' | 'rewardedHint';
export type InterstitialAdPlacement = 'interstitialResult';

export type RewardedAdResult = {
  events: MobileAdEvent[];
  status: 'closed' | 'failed' | 'rewarded';
};

export type InterstitialAdResult = {
  events: MobileAdEvent[];
  status: 'failed' | 'shown';
};

const loadTimeoutMs = 15000;

const productionAdUnitIds = {
  android: {
    interstitialResult: 'ca-app-pub-2444587584524186/4930691809',
    rewardedBonusPuzzle: 'ca-app-pub-2444587584524186/2299285882',
    rewardedHint: 'ca-app-pub-2444587584524186/7533141122',
  },
  ios: {
    interstitialResult: 'ca-app-pub-2444587584524186/3402324424',
    rewardedBonusPuzzle: 'ca-app-pub-2444587584524186/2089242756',
    rewardedHint: 'ca-app-pub-2444587584524186/6151776694',
  },
} as const;

let mobileAdsModulePromise: Promise<GoogleMobileAdsModule | null> | null = null;
let initializationPromise: Promise<boolean> | null = null;

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
) {
  return __DEV__ ? module.TestIds.REWARDED : getPlatformAdUnitIds()[placement];
}

function getInterstitialAdUnitId(module: GoogleMobileAdsModule) {
  return __DEV__
    ? module.TestIds.INTERSTITIAL
    : getPlatformAdUnitIds().interstitialResult;
}

function createUnavailableRewardedResult(): RewardedAdResult {
  return { events: [{ type: 'unavailable' }], status: 'failed' };
}

function createUnavailableInterstitialResult(): InterstitialAdResult {
  return { events: [{ type: 'unavailable' }], status: 'failed' };
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
      await module.default().initialize();
      return true;
    } catch {
      return false;
    }
  })();

  return initializationPromise;
}

export async function showRewardedAd(
  placement: RewardedAdPlacement,
): Promise<RewardedAdResult> {
  const module = await getMobileAdsModule();

  if (module == null || !(await initializeMobileAds())) {
    return createUnavailableRewardedResult();
  }

  return new Promise(resolve => {
    const events: MobileAdEvent[] = [];
    const ad = module.RewardedAd.createForAdRequest(
      getRewardedAdUnitId(module, placement),
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
            errorCode: getErrorCode(error),
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
        events.push({ errorCode: getErrorCode(error), type: 'error' });
        resolveOnce('failed');
      }),
    );

    ad.load();
  });
}

export async function showInterstitialAd(
  _placement: InterstitialAdPlacement,
): Promise<InterstitialAdResult> {
  const module = await getMobileAdsModule();

  if (module == null || !(await initializeMobileAds())) {
    return createUnavailableInterstitialResult();
  }

  return new Promise(resolve => {
    const events: MobileAdEvent[] = [];
    const ad = module.InterstitialAd.createForAdRequest(
      getInterstitialAdUnitId(module),
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
            errorCode: getErrorCode(error),
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
        events.push({ errorCode: getErrorCode(error), type: 'error' });
        resolveOnce('failed');
      }),
    );

    ad.load();
  });
}

function getErrorCode(error: unknown) {
  if (error instanceof Error) {
    return error.name || 'error';
  }

  if (
    error != null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return 'unknown';
}
