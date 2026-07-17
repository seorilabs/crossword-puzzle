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
