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

export type FirebaseRuntimeGateSnapshot = {
  schemaVersion: 1;
  gameRuntimeEnabled: boolean;
  fetchTimeMillis: number;
  valueSource: "remote";
};

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

async function readRemoteRuntimeGateSnapshot(
  remoteConfig: RemoteConfig,
): Promise<FirebaseRuntimeGateSnapshot | null> {
  const { getValue } = await import("firebase/remote-config");
  const value = getValue(remoteConfig, launchConfigKeys.gameRuntimeEnabled);
  if (
    value.getSource() !== "remote" ||
    !Number.isFinite(remoteConfig.fetchTimeMillis) ||
    remoteConfig.fetchTimeMillis < 0
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    gameRuntimeEnabled: value.asBoolean(),
    fetchTimeMillis: remoteConfig.fetchTimeMillis,
    valueSource: "remote",
  };
}

/**
 * RuntimeHost 전용 fresh/SDK-cache-aware fetch. 실패를 삼키지 않아 host가
 * 검증된 activated cache 또는 bundled false로 직접 내려갈 수 있게 한다.
 */
export async function fetchFirebaseRuntimeGateSnapshot(): Promise<FirebaseRuntimeGateSnapshot> {
  const runtime = await getFirebaseRuntime();
  if (runtime?.remoteConfig == null) {
    throw new Error("Firebase Remote Config is unavailable");
  }

  const { fetchAndActivate } = await import("firebase/remote-config");
  await fetchAndActivate(runtime.remoteConfig);
  const snapshot = await readRemoteRuntimeGateSnapshot(runtime.remoteConfig);
  if (snapshot == null) {
    throw new Error("Remote runtime gate has no activated remote value");
  }
  return snapshot;
}

/** Reads only Firebase SDK's initialized, previously activated remote cache. */
export async function readCachedFirebaseRuntimeGateSnapshot(): Promise<FirebaseRuntimeGateSnapshot | null> {
  const runtime = await getFirebaseRuntime();
  if (runtime?.remoteConfig == null) {
    return null;
  }

  const { ensureInitialized } = await import("firebase/remote-config");
  await ensureInitialized(runtime.remoteConfig);
  return readRemoteRuntimeGateSnapshot(runtime.remoteConfig);
}

async function readLaunchConfig(
  remoteConfig: RemoteConfig,
): Promise<LaunchConfig> {
  const { getBoolean, getNumber, getString } =
    await import("firebase/remote-config");

  return normalizeLaunchConfig({
    defaultHintCredits: getNumber(
      remoteConfig,
      launchConfigKeys.defaultHintCredits,
    ),
    defaultHintCreditsEasy: getNumber(
      remoteConfig,
      launchConfigKeys.defaultHintCreditsEasy,
    ),
    defaultHintCreditsHard: getNumber(
      remoteConfig,
      launchConfigKeys.defaultHintCreditsHard,
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
    puzzleKeepCount: getNumber(remoteConfig, launchConfigKeys.puzzleKeepCount),
    dailyAttemptLimit: getNumber(
      remoteConfig,
      launchConfigKeys.dailyAttemptLimit,
    ),
    rewardedBonusPuzzleAdsEnabled: getBoolean(
      remoteConfig,
      launchConfigKeys.rewardedBonusPuzzleAdsEnabled,
    ),
    rewardedHintAdsEnabled: getBoolean(
      remoteConfig,
      launchConfigKeys.rewardedHintAdsEnabled,
    ),
    rewardedExtraAttemptEnabled: getBoolean(
      remoteConfig,
      launchConfigKeys.rewardedExtraAttemptEnabled,
    ),
    rewardedExtraAttemptDailyCap: getNumber(
      remoteConfig,
      launchConfigKeys.rewardedExtraAttemptDailyCap,
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
    firstRunAutoStartEnabled: getBoolean(
      remoteConfig,
      launchConfigKeys.firstRunAutoStartEnabled,
    ),
    gameRuntimeEnabled: getBoolean(
      remoteConfig,
      launchConfigKeys.gameRuntimeEnabled,
    ),
    memoryInkBase: getNumber(remoteConfig, launchConfigKeys.memoryInkBase),
    memoryInkPerEntry: getNumber(
      remoteConfig,
      launchConfigKeys.memoryInkPerEntry,
    ),
    memoryInkChainCap: getNumber(
      remoteConfig,
      launchConfigKeys.memoryInkChainCap,
    ),
    ftueInputVariant: getString(
      remoteConfig,
      launchConfigKeys.ftueInputVariant,
    ) as LaunchConfig["ftueInputVariant"],
    worldRestoreMotionLevel: getString(
      remoteConfig,
      launchConfigKeys.worldRestoreMotionLevel,
    ) as LaunchConfig["worldRestoreMotionLevel"],
    adFailureFallbackEnabled: getBoolean(
      remoteConfig,
      launchConfigKeys.adFailureFallbackEnabled,
    ),
    adFailureFallbackDailyCap: getNumber(
      remoteConfig,
      launchConfigKeys.adFailureFallbackDailyCap,
    ),
    stuckHintIdleMs: getNumber(remoteConfig, launchConfigKeys.stuckHintIdleMs),
    stuckHintWrongIdleMs: getNumber(
      remoteConfig,
      launchConfigKeys.stuckHintWrongIdleMs,
    ),
    stuckHintWrongCellThreshold: getNumber(
      remoteConfig,
      launchConfigKeys.stuckHintWrongCellThreshold,
    ),
    stuckHintMaxPromptsPerAttempt: getNumber(
      remoteConfig,
      launchConfigKeys.stuckHintMaxPromptsPerAttempt,
    ),
    stuckHintMaxDismissals: getNumber(
      remoteConfig,
      launchConfigKeys.stuckHintMaxDismissals,
    ),
    stuckHintDismissBackoffFactor: getNumber(
      remoteConfig,
      launchConfigKeys.stuckHintDismissBackoffFactor,
    ),
    checkHighlightMs: getNumber(
      remoteConfig,
      launchConfigKeys.checkHighlightMs,
    ),
    leaderboardScoreCompletedWord: getNumber(
      remoteConfig,
      launchConfigKeys.leaderboardScoreCompletedWord,
    ),
    leaderboardScoreRemainingAttempt: getNumber(
      remoteConfig,
      launchConfigKeys.leaderboardScoreRemainingAttempt,
    ),
    leaderboardScoreHint: getNumber(
      remoteConfig,
      launchConfigKeys.leaderboardScoreHint,
    ),
    leaderboardScoreTimeBonusBase: getNumber(
      remoteConfig,
      launchConfigKeys.leaderboardScoreTimeBonusBase,
    ),
    leaderboardScoreTimeDecayPerSecond: getNumber(
      remoteConfig,
      launchConfigKeys.leaderboardScoreTimeDecayPerSecond,
    ),
  });
}

/**
 * RuntimeHost가 런타임 게이트를 판정할 때 활성화한 동일한 Remote Config
 * 스냅샷을 읽는다. 여기서는 다시 fetch하지 않아 ON/OFF 판정과 게임 설정이
 * 서로 다른 원격 버전을 보게 되는 경합을 막는다.
 */
export async function readActivatedFirebaseLaunchConfig(): Promise<LaunchConfig> {
  const runtime = await getFirebaseRuntime();
  const remoteConfig = runtime?.remoteConfig;
  if (remoteConfig == null) {
    return defaultLaunchConfig;
  }

  try {
    const { ensureInitialized } = await import("firebase/remote-config");
    await ensureInitialized(remoteConfig);
    return await readLaunchConfig(remoteConfig);
  } catch {
    return defaultLaunchConfig;
  }
}

export async function loadFirebaseLaunchConfig(): Promise<LaunchConfig> {
  const runtime = await getFirebaseRuntime();
  const remoteConfig = runtime?.remoteConfig;

  if (remoteConfig == null) {
    return defaultLaunchConfig;
  }

  try {
    const { fetchAndActivate } = await import("firebase/remote-config");
    try {
      await fetchAndActivate(remoteConfig);
    } catch {
      // fetch 실패(네트워크 등)여도 이전 activation 캐시 또는 defaultConfig를
      // 그대로 읽는다. 운영자가 원격에서 끈 게이트(예: first_run_auto_start_
      // enabled=false)가 일시적 fetch 실패로 기본값(켜짐)으로 되살아나지 않게
      // 하기 위한 분기다. 인스턴스 자체가 없는 경우만 위에서 default로 폴백한다.
    }
    return await readLaunchConfig(remoteConfig);
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
