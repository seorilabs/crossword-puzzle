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
        completionStatsEnabled: remoteConfigClient
          .getValue(launchConfigKeys.completionStatsEnabled)
          .asBoolean(),
        completionStatsMinDisplayCount: remoteConfigClient
          .getValue(launchConfigKeys.completionStatsMinDisplayCount)
          .asNumber(),
        rewardedBonusPuzzleAdsEnabled: remoteConfigClient
          .getValue(launchConfigKeys.rewardedBonusPuzzleAdsEnabled)
          .asBoolean(),
        rewardedHintAdsEnabled: remoteConfigClient
          .getValue(launchConfigKeys.rewardedHintAdsEnabled)
          .asBoolean(),
        resultInterstitialAdsEnabled: remoteConfigClient
          .getValue(launchConfigKeys.resultInterstitialAdsEnabled)
          .asBoolean(),
        leaderboardEnabled: remoteConfigClient
          .getValue(launchConfigKeys.leaderboardEnabled)
          .asBoolean(),
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
