import analytics from '@react-native-firebase/analytics';
import remoteConfig, {
  type FirebaseRemoteConfigTypes,
} from '@react-native-firebase/remote-config';

import {
  defaultLaunchConfig,
  getLaunchConfigDefaultsForRemoteConfig,
  launchConfigKeys,
  normalizeLaunchConfig,
  type LaunchConfig,
} from '../../packages/crossword-core/src';

type AnalyticsParams = Record<string, string | number | boolean>;

export type MobileRuntimeConfigStorage = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}>;

export type MobileFirebaseRuntimeConfigSnapshot = Readonly<{
  schemaVersion: 1;
  valueSource: 'remote';
  fetchTimeMillis: number;
  gameRuntimeEnabled: boolean;
  launchConfig: LaunchConfig;
}>;

export const MOBILE_RUNTIME_CONFIG_CACHE_KEY =
  'crossword:firebase-runtime-config:v1';

const remoteConfigFetchIntervalMs = 6 * 60 * 60 * 1000;
const runtimeConfigCacheMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const runtimeConfigFutureSkewMs = 5 * 60 * 1000;
const launchConfigPropertyNames = Object.keys(defaultLaunchConfig) as Array<
  keyof LaunchConfig
>;

let launchConfigPromise: Promise<LaunchConfig> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const expected = new Set(keys);
  return (
    keys.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every(key => expected.has(key))
  );
}

function validateCachedLaunchConfig(candidate: unknown): LaunchConfig | null {
  if (
    !isRecord(candidate) ||
    !hasExactKeys(candidate, launchConfigPropertyNames)
  ) {
    return null;
  }

  for (const key of launchConfigPropertyNames) {
    const value = candidate[key];
    const expectedType = typeof defaultLaunchConfig[key];
    if (
      typeof value !== expectedType ||
      (expectedType === 'number' && !Number.isFinite(value))
    ) {
      return null;
    }
  }

  const normalized = normalizeLaunchConfig(candidate as LaunchConfig);
  return launchConfigPropertyNames.every(key =>
    Object.is(normalized[key], candidate[key]),
  )
    ? normalized
    : null;
}

export function validateMobileFirebaseRuntimeConfigSnapshot(
  candidate: unknown,
  nowEpochMs = Date.now(),
): MobileFirebaseRuntimeConfigSnapshot | null {
  if (
    !isRecord(candidate) ||
    !hasExactKeys(candidate, [
      'schemaVersion',
      'valueSource',
      'fetchTimeMillis',
      'gameRuntimeEnabled',
      'launchConfig',
    ]) ||
    candidate.schemaVersion !== 1 ||
    candidate.valueSource !== 'remote' ||
    typeof candidate.fetchTimeMillis !== 'number' ||
    !Number.isFinite(candidate.fetchTimeMillis) ||
    candidate.fetchTimeMillis < 0 ||
    typeof candidate.gameRuntimeEnabled !== 'boolean'
  ) {
    return null;
  }

  const ageMs = nowEpochMs - candidate.fetchTimeMillis;
  if (
    ageMs < -runtimeConfigFutureSkewMs ||
    ageMs > runtimeConfigCacheMaxAgeMs
  ) {
    return null;
  }

  const launchConfig = validateCachedLaunchConfig(candidate.launchConfig);
  if (
    launchConfig == null ||
    launchConfig.gameRuntimeEnabled !== candidate.gameRuntimeEnabled
  ) {
    return null;
  }

  return Object.freeze({
    schemaVersion: 1,
    valueSource: 'remote',
    fetchTimeMillis: candidate.fetchTimeMillis,
    gameRuntimeEnabled: candidate.gameRuntimeEnabled,
    launchConfig,
  });
}

async function configureRemoteConfigClient(
  remoteConfigClient: FirebaseRemoteConfigTypes.Module,
): Promise<void> {
  await remoteConfigClient.setConfigSettings({
    minimumFetchIntervalMillis: remoteConfigFetchIntervalMs,
  });
  await remoteConfigClient.setDefaults(
    getLaunchConfigDefaultsForRemoteConfig(),
  );
}

function readLaunchConfig(
  remoteConfigClient: FirebaseRemoteConfigTypes.Module,
): LaunchConfig {
  return normalizeLaunchConfig({
    defaultHintCredits: remoteConfigClient
      .getValue(launchConfigKeys.defaultHintCredits)
      .asNumber(),
    defaultHintCreditsEasy: remoteConfigClient
      .getValue(launchConfigKeys.defaultHintCreditsEasy)
      .asNumber(),
    defaultHintCreditsHard: remoteConfigClient
      .getValue(launchConfigKeys.defaultHintCreditsHard)
      .asNumber(),
    rewardedHintCredits: remoteConfigClient
      .getValue(launchConfigKeys.rewardedHintCredits)
      .asNumber(),
    visiblePuzzleCount: remoteConfigClient
      .getValue(launchConfigKeys.visiblePuzzleCount)
      .asNumber(),
    puzzleGenerationIntervalHours: remoteConfigClient
      .getValue(launchConfigKeys.puzzleGenerationIntervalHours)
      .asNumber(),
    puzzleKeepCount: remoteConfigClient
      .getValue(launchConfigKeys.puzzleKeepCount)
      .asNumber(),
    dailyAttemptLimit: remoteConfigClient
      .getValue(launchConfigKeys.dailyAttemptLimit)
      .asNumber(),
    rewardedBonusPuzzleAdsEnabled: remoteConfigClient
      .getValue(launchConfigKeys.rewardedBonusPuzzleAdsEnabled)
      .asBoolean(),
    rewardedHintAdsEnabled: remoteConfigClient
      .getValue(launchConfigKeys.rewardedHintAdsEnabled)
      .asBoolean(),
    rewardedExtraAttemptEnabled: remoteConfigClient
      .getValue(launchConfigKeys.rewardedExtraAttemptEnabled)
      .asBoolean(),
    rewardedExtraAttemptDailyCap: remoteConfigClient
      .getValue(launchConfigKeys.rewardedExtraAttemptDailyCap)
      .asNumber(),
    resultInterstitialAdsEnabled: remoteConfigClient
      .getValue(launchConfigKeys.resultInterstitialAdsEnabled)
      .asBoolean(),
    leaderboardEnabled: remoteConfigClient
      .getValue(launchConfigKeys.leaderboardEnabled)
      .asBoolean(),
    returnReminderEnabled: remoteConfigClient
      .getValue(launchConfigKeys.returnReminderEnabled)
      .asBoolean(),
    firstRunAutoStartEnabled: remoteConfigClient
      .getValue(launchConfigKeys.firstRunAutoStartEnabled)
      .asBoolean(),
    gameRuntimeEnabled: remoteConfigClient
      .getValue(launchConfigKeys.gameRuntimeEnabled)
      .asBoolean(),
    memoryInkBase: remoteConfigClient
      .getValue(launchConfigKeys.memoryInkBase)
      .asNumber(),
    memoryInkPerEntry: remoteConfigClient
      .getValue(launchConfigKeys.memoryInkPerEntry)
      .asNumber(),
    memoryInkChainCap: remoteConfigClient
      .getValue(launchConfigKeys.memoryInkChainCap)
      .asNumber(),
    ftueInputVariant: remoteConfigClient
      .getValue(launchConfigKeys.ftueInputVariant)
      .asString() as LaunchConfig['ftueInputVariant'],
    worldRestoreMotionLevel: remoteConfigClient
      .getValue(launchConfigKeys.worldRestoreMotionLevel)
      .asString() as LaunchConfig['worldRestoreMotionLevel'],
    adFailureFallbackEnabled: remoteConfigClient
      .getValue(launchConfigKeys.adFailureFallbackEnabled)
      .asBoolean(),
    adFailureFallbackDailyCap: remoteConfigClient
      .getValue(launchConfigKeys.adFailureFallbackDailyCap)
      .asNumber(),
    stuckHintIdleMs: remoteConfigClient
      .getValue(launchConfigKeys.stuckHintIdleMs)
      .asNumber(),
    stuckHintWrongIdleMs: remoteConfigClient
      .getValue(launchConfigKeys.stuckHintWrongIdleMs)
      .asNumber(),
    stuckHintWrongCellThreshold: remoteConfigClient
      .getValue(launchConfigKeys.stuckHintWrongCellThreshold)
      .asNumber(),
    stuckHintMaxPromptsPerAttempt: remoteConfigClient
      .getValue(launchConfigKeys.stuckHintMaxPromptsPerAttempt)
      .asNumber(),
    stuckHintMaxDismissals: remoteConfigClient
      .getValue(launchConfigKeys.stuckHintMaxDismissals)
      .asNumber(),
    stuckHintDismissBackoffFactor: remoteConfigClient
      .getValue(launchConfigKeys.stuckHintDismissBackoffFactor)
      .asNumber(),
    checkHighlightMs: remoteConfigClient
      .getValue(launchConfigKeys.checkHighlightMs)
      .asNumber(),
    leaderboardScoreCompletedWord: remoteConfigClient
      .getValue(launchConfigKeys.leaderboardScoreCompletedWord)
      .asNumber(),
    leaderboardScoreRemainingAttempt: remoteConfigClient
      .getValue(launchConfigKeys.leaderboardScoreRemainingAttempt)
      .asNumber(),
    leaderboardScoreHint: remoteConfigClient
      .getValue(launchConfigKeys.leaderboardScoreHint)
      .asNumber(),
    leaderboardScoreTimeBonusBase: remoteConfigClient
      .getValue(launchConfigKeys.leaderboardScoreTimeBonusBase)
      .asNumber(),
    leaderboardScoreTimeDecayPerSecond: remoteConfigClient
      .getValue(launchConfigKeys.leaderboardScoreTimeDecayPerSecond)
      .asNumber(),
  });
}

function readActivatedRuntimeConfigSnapshot(
  remoteConfigClient: FirebaseRemoteConfigTypes.Module,
): MobileFirebaseRuntimeConfigSnapshot | null {
  const runtimeGate = remoteConfigClient.getValue(
    launchConfigKeys.gameRuntimeEnabled,
  );
  if (runtimeGate.getSource() !== 'remote') {
    return null;
  }

  const launchConfig = readLaunchConfig(remoteConfigClient);
  return validateMobileFirebaseRuntimeConfigSnapshot({
    schemaVersion: 1,
    valueSource: 'remote',
    fetchTimeMillis: remoteConfigClient.fetchTimeMillis,
    gameRuntimeEnabled: runtimeGate.asBoolean(),
    launchConfig,
  });
}

/**
 * Runtime host용 fresh fetch. 원격에서 활성화된 gate와 동일한 LaunchConfig를
 * 검증한 뒤 native AsyncStorage cache에 저장한다.
 */
export async function fetchMobileFirebaseRuntimeConfigSnapshot(
  storage: MobileRuntimeConfigStorage,
): Promise<MobileFirebaseRuntimeConfigSnapshot> {
  const remoteConfigClient = remoteConfig();
  await configureRemoteConfigClient(remoteConfigClient);
  await remoteConfigClient.fetchAndActivate();

  const snapshot = readActivatedRuntimeConfigSnapshot(remoteConfigClient);
  if (snapshot == null) {
    throw new Error('Remote runtime config has no valid activated value');
  }

  try {
    await storage.setItem(
      MOBILE_RUNTIME_CONFIG_CACHE_KEY,
      JSON.stringify(snapshot),
    );
  } catch {
    // A valid fresh remote decision remains usable even when cache persistence fails.
  }

  return snapshot;
}

/** Reads only the app-owned, previously validated activated remote snapshot. */
export async function readCachedMobileFirebaseRuntimeConfigSnapshot(
  storage: MobileRuntimeConfigStorage,
): Promise<MobileFirebaseRuntimeConfigSnapshot | null> {
  const serialized = await storage.getItem(MOBILE_RUNTIME_CONFIG_CACHE_KEY);
  if (serialized == null) {
    return null;
  }

  try {
    return validateMobileFirebaseRuntimeConfigSnapshot(JSON.parse(serialized));
  } catch {
    return null;
  }
}

export async function loadFirebaseLaunchConfig(): Promise<LaunchConfig> {
  if (launchConfigPromise != null) {
    return launchConfigPromise;
  }

  launchConfigPromise = (async () => {
    try {
      const remoteConfigClient = remoteConfig();
      await configureRemoteConfigClient(remoteConfigClient);
      await remoteConfigClient.fetchAndActivate();
      return readLaunchConfig(remoteConfigClient);
    } catch {
      return defaultLaunchConfig;
    }
  })();

  return launchConfigPromise;
}

export async function logFirebaseAnalyticsEvent(
  name: string,
  params: AnalyticsParams = {},
) {
  try {
    await analytics().logEvent(name, params);
  } catch {
    // Analytics must never interrupt puzzle play.
  }
}
