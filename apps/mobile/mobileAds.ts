import { Platform } from 'react-native';

declare const process: { env: { NODE_ENV?: string } };

type GoogleMobileAdsModule = typeof import('react-native-google-mobile-ads');
let mobileAdsModulePromise: Promise<GoogleMobileAdsModule | null> | null = null;
let initializationPromise: Promise<boolean> | null = null;
let consentPromise: Promise<boolean> | null = null;
let initializationErrorCode: string | undefined;

function isTestRuntime() {
  return process.env.NODE_ENV === 'test';
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

export async function requestMobileAdsConsent(module: GoogleMobileAdsModule) {
  if (Platform.OS === 'ios') return true;

  if (consentPromise != null) {
    return consentPromise;
  }

  consentPromise = (async () => {
    try {
      const info = await module.AdsConsent.gatherConsent();
      return info.canRequestAds;
    } catch {
      // A transient update failure may still leave a valid decision from a
      // previous launch. Never request ads unless the SDK explicitly allows it.
      try {
        const info = await module.AdsConsent.getConsentInfo();
        return info.canRequestAds;
      } catch {
        return false;
      }
    }
  })();

  return consentPromise;
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
      if (!(await requestMobileAdsConsent(module))) {
        initializationErrorCode = 'consent_required';
        return false;
      }
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

export async function showMobileAdsPrivacyOptions() {
  if (Platform.OS === 'ios') return { status: 'not_required' as const };
  const module = await getMobileAdsModule();
  if (module == null) {
    return { errorCode: 'module_unavailable', status: 'failed' as const };
  }

  try {
    const info = await module.AdsConsent.getConsentInfo();
    if (
      info.privacyOptionsRequirementStatus !==
      module.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
    ) {
      return { status: 'not_required' as const };
    }
    await module.AdsConsent.showPrivacyOptionsForm();
    return { status: 'shown' as const };
  } catch (error) {
    return {
      errorCode: getMobileAdErrorCode(error),
      status: 'failed' as const,
    };
  }
}

export function resetMobileAdsStateForTests() {
  mobileAdsModulePromise = null;
  initializationPromise = null;
  consentPromise = null;
  initializationErrorCode = undefined;
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
