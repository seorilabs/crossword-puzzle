import type { Analytics } from "firebase/analytics";
import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import type { RemoteConfig } from "firebase/remote-config";
import {
  defaultLaunchConfig,
  getLaunchConfigDefaultsForRemoteConfig,
  launchConfigKeys,
  normalizeLaunchConfig,
  type LaunchConfig,
} from "./launchConfig";

type FirebaseRuntime = {
  analytics: Analytics | null;
  remoteConfig: RemoteConfig | null;
};

type AnalyticsParams = Record<string, string | number | boolean>;

const firebaseAppName = "crossword-puzzle";
const remoteConfigFetchIntervalMs = 6 * 60 * 60 * 1000;

let firebaseRuntimePromise: Promise<FirebaseRuntime | null> | null = null;

function getOptionalEnvValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed == null || trimmed === "" ? undefined : trimmed;
}

function getFirebaseOptions(): FirebaseOptions | null {
  const apiKey = getOptionalEnvValue(import.meta.env.VITE_FIREBASE_API_KEY);
  const projectId = getOptionalEnvValue(
    import.meta.env.VITE_FIREBASE_PROJECT_ID,
  );
  const appId = getOptionalEnvValue(import.meta.env.VITE_FIREBASE_APP_ID);

  if (apiKey == null || projectId == null || appId == null) {
    return null;
  }

  return {
    apiKey,
    appId,
    authDomain: getOptionalEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    measurementId: getOptionalEnvValue(
      import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    ),
    messagingSenderId: getOptionalEnvValue(
      import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    ),
    projectId,
    storageBucket: getOptionalEnvValue(
      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    ),
  };
}

async function getOrCreateFirebaseApp(options: FirebaseOptions) {
  const { getApps, initializeApp } = await import("firebase/app");
  const existing = getApps().find((app) => app.name === firebaseAppName);

  return existing ?? initializeApp(options, firebaseAppName);
}

async function createAnalytics(app: FirebaseApp, options: FirebaseOptions) {
  if (options.measurementId == null) {
    return null;
  }

  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (!(await isSupported())) {
      return null;
    }

    return getAnalytics(app);
  } catch {
    return null;
  }
}

async function createRemoteConfig(app: FirebaseApp) {
  try {
    const { getRemoteConfig, isSupported } =
      await import("firebase/remote-config");
    if (!(await isSupported())) {
      return null;
    }

    const remoteConfig = getRemoteConfig(app);
    remoteConfig.defaultConfig = getLaunchConfigDefaultsForRemoteConfig();
    remoteConfig.settings.minimumFetchIntervalMillis =
      remoteConfigFetchIntervalMs;

    return remoteConfig;
  } catch {
    return null;
  }
}

async function getFirebaseRuntime() {
  if (firebaseRuntimePromise != null) {
    return firebaseRuntimePromise;
  }

  firebaseRuntimePromise = (async () => {
    const options = getFirebaseOptions();
    if (options == null) {
      return null;
    }

    try {
      const app = await getOrCreateFirebaseApp(options);
      const [analytics, remoteConfig] = await Promise.all([
        createAnalytics(app, options),
        createRemoteConfig(app),
      ]);

      return { analytics, remoteConfig };
    } catch {
      return null;
    }
  })();

  return firebaseRuntimePromise;
}

export async function loadFirebaseLaunchConfig(): Promise<LaunchConfig> {
  const runtime = await getFirebaseRuntime();
  const remoteConfig = runtime?.remoteConfig;

  if (remoteConfig == null) {
    return defaultLaunchConfig;
  }

  try {
    const { fetchAndActivate, getBoolean, getNumber } =
      await import("firebase/remote-config");
    await fetchAndActivate(remoteConfig);

    return normalizeLaunchConfig({
      defaultHintCredits: getNumber(
        remoteConfig,
        launchConfigKeys.defaultHintCredits,
      ),
      rewardedHintCredits: getNumber(
        remoteConfig,
        launchConfigKeys.rewardedHintCredits,
      ),
      visiblePuzzleCount: getNumber(
        remoteConfig,
        launchConfigKeys.visiblePuzzleCount,
      ),
      puzzleGenerationIntervalHours: getNumber(
        remoteConfig,
        launchConfigKeys.puzzleGenerationIntervalHours,
      ),
      puzzleKeepCount: getNumber(
        remoteConfig,
        launchConfigKeys.puzzleKeepCount,
      ),
      completionStatsEnabled: getBoolean(
        remoteConfig,
        launchConfigKeys.completionStatsEnabled,
      ),
      completionStatsMinDisplayCount: getNumber(
        remoteConfig,
        launchConfigKeys.completionStatsMinDisplayCount,
      ),
      rewardedBonusPuzzleAdsEnabled: getBoolean(
        remoteConfig,
        launchConfigKeys.rewardedBonusPuzzleAdsEnabled,
      ),
      rewardedHintAdsEnabled: getBoolean(
        remoteConfig,
        launchConfigKeys.rewardedHintAdsEnabled,
      ),
      resultInterstitialAdsEnabled: getBoolean(
        remoteConfig,
        launchConfigKeys.resultInterstitialAdsEnabled,
      ),
      leaderboardEnabled: getBoolean(
        remoteConfig,
        launchConfigKeys.leaderboardEnabled,
      ),
      returnReminderEnabled: getBoolean(
        remoteConfig,
        launchConfigKeys.returnReminderEnabled,
      ),
      stuckHintIdleMs: getNumber(
        remoteConfig,
        launchConfigKeys.stuckHintIdleMs,
      ),
      stuckHintWrongIdleMs: getNumber(
        remoteConfig,
        launchConfigKeys.stuckHintWrongIdleMs,
      ),
      stuckHintWrongCellThreshold: getNumber(
        remoteConfig,
        launchConfigKeys.stuckHintWrongCellThreshold,
      ),
      checkHighlightMs: getNumber(
        remoteConfig,
        launchConfigKeys.checkHighlightMs,
      ),
    });
  } catch {
    return defaultLaunchConfig;
  }
}

export async function logFirebaseAnalyticsEvent(
  name: string,
  params: AnalyticsParams = {},
) {
  const runtime = await getFirebaseRuntime();
  if (runtime?.analytics == null) {
    return;
  }

  try {
    const { logEvent } = await import("firebase/analytics");
    logEvent(runtime.analytics, name, params);
  } catch {
    // Analytics must never interrupt puzzle play.
  }
}
