import analytics from '@react-native-firebase/analytics';
import remoteConfig from '@react-native-firebase/remote-config';

import {
  defaultLaunchConfig,
  getLaunchConfigDefaultsForRemoteConfig,
  launchConfigKeys,
  normalizeLaunchConfig,
  type LaunchConfig,
} from '../../packages/crossword-core/src';

type AnalyticsParams = Record<string, string | number | boolean>;

const remoteConfigFetchIntervalMs = 6 * 60 * 60 * 1000;

let launchConfigPromise: Promise<LaunchConfig> | null = null;

export async function loadFirebaseLaunchConfig(): Promise<LaunchConfig> {
  if (launchConfigPromise != null) {
    return launchConfigPromise;
  }

  launchConfigPromise = (async () => {
    try {
      const remoteConfigClient = remoteConfig();
      await remoteConfigClient.setConfigSettings({
        minimumFetchIntervalMillis: remoteConfigFetchIntervalMs,
      });
      await remoteConfigClient.setDefaults(
        getLaunchConfigDefaultsForRemoteConfig(),
      );
      await remoteConfigClient.fetchAndActivate();

      return normalizeLaunchConfig({
        dailyFreeHintCredits: remoteConfigClient
          .getValue(launchConfigKeys.dailyFreeHintCredits)
          .asNumber(),
        defaultHintCredits: remoteConfigClient
          .getValue(launchConfigKeys.defaultHintCredits)
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
        rewardedHintAdsEnabled: remoteConfigClient
          .getValue(launchConfigKeys.rewardedHintAdsEnabled)
          .asBoolean(),
        leaderboardEnabled: remoteConfigClient
          .getValue(launchConfigKeys.leaderboardEnabled)
          .asBoolean(),
        returnReminderEnabled: remoteConfigClient
          .getValue(launchConfigKeys.returnReminderEnabled)
          .asBoolean(),
        stuckHintIdleMs: remoteConfigClient
          .getValue(launchConfigKeys.stuckHintIdleMs)
          .asNumber(),
        stuckHintFirstInputIdleMs: remoteConfigClient
          .getValue(launchConfigKeys.stuckHintFirstInputIdleMs)
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
        stuckHintMinCooldownMs: remoteConfigClient
          .getValue(launchConfigKeys.stuckHintMinCooldownMs)
          .asNumber(),
      });
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

export async function logFirebaseScreenView(
  screenName: string,
  params: AnalyticsParams = {},
) {
  try {
    const customParams = Object.fromEntries(
      Object.entries(params).filter(([key]) => !key.startsWith('firebase_')),
    );
    await analytics().logScreenView({
      ...customParams,
      screen_name: screenName,
      screen_class: screenName,
    });
  } catch {
    // Analytics must never interrupt puzzle play.
  }
}
