export type LaunchConfig = {
  defaultHintCredits: number;
  rewardedHintCredits: number;
  visiblePuzzleCount: number;
  puzzleGenerationIntervalHours: number;
  puzzleKeepCount: number;
  rewardedHintAdsEnabled: boolean;
  resultInterstitialAdsEnabled: boolean;
  leaderboardEnabled: boolean;
};

export const launchConfigKeys = {
  defaultHintCredits: "default_hint_credits",
  rewardedHintCredits: "rewarded_hint_credits",
  visiblePuzzleCount: "visible_puzzle_count",
  puzzleGenerationIntervalHours: "puzzle_generation_interval_hours",
  puzzleKeepCount: "puzzle_keep_count",
  rewardedHintAdsEnabled: "rewarded_hint_ads_enabled",
  resultInterstitialAdsEnabled: "result_interstitial_ads_enabled",
  leaderboardEnabled: "leaderboard_enabled",
} as const;

export const defaultLaunchConfig: LaunchConfig = {
  defaultHintCredits: 3,
  rewardedHintCredits: 2,
  visiblePuzzleCount: 7,
  puzzleGenerationIntervalHours: 2,
  puzzleKeepCount: 84,
  rewardedHintAdsEnabled: true,
  resultInterstitialAdsEnabled: true,
  leaderboardEnabled: false,
};

export function clampInteger(
  value: number,
  fallback: number,
  min: number,
  max: number,
) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeLaunchConfig(
  value: Partial<LaunchConfig>,
): LaunchConfig {
  return {
    defaultHintCredits: clampInteger(
      value.defaultHintCredits ?? defaultLaunchConfig.defaultHintCredits,
      defaultLaunchConfig.defaultHintCredits,
      0,
      20,
    ),
    rewardedHintCredits: clampInteger(
      value.rewardedHintCredits ?? defaultLaunchConfig.rewardedHintCredits,
      defaultLaunchConfig.rewardedHintCredits,
      1,
      10,
    ),
    visiblePuzzleCount: clampInteger(
      value.visiblePuzzleCount ?? defaultLaunchConfig.visiblePuzzleCount,
      defaultLaunchConfig.visiblePuzzleCount,
      1,
      30,
    ),
    puzzleGenerationIntervalHours: clampInteger(
      value.puzzleGenerationIntervalHours ??
        defaultLaunchConfig.puzzleGenerationIntervalHours,
      defaultLaunchConfig.puzzleGenerationIntervalHours,
      1,
      24,
    ),
    puzzleKeepCount: clampInteger(
      value.puzzleKeepCount ?? defaultLaunchConfig.puzzleKeepCount,
      defaultLaunchConfig.puzzleKeepCount,
      1,
      365,
    ),
    rewardedHintAdsEnabled:
      value.rewardedHintAdsEnabled ??
      defaultLaunchConfig.rewardedHintAdsEnabled,
    resultInterstitialAdsEnabled:
      value.resultInterstitialAdsEnabled ??
      defaultLaunchConfig.resultInterstitialAdsEnabled,
    leaderboardEnabled:
      value.leaderboardEnabled ?? defaultLaunchConfig.leaderboardEnabled,
  };
}

export function getLaunchConfigDefaultsForRemoteConfig() {
  return {
    [launchConfigKeys.defaultHintCredits]:
      defaultLaunchConfig.defaultHintCredits,
    [launchConfigKeys.rewardedHintCredits]:
      defaultLaunchConfig.rewardedHintCredits,
    [launchConfigKeys.visiblePuzzleCount]:
      defaultLaunchConfig.visiblePuzzleCount,
    [launchConfigKeys.puzzleGenerationIntervalHours]:
      defaultLaunchConfig.puzzleGenerationIntervalHours,
    [launchConfigKeys.puzzleKeepCount]: defaultLaunchConfig.puzzleKeepCount,
    [launchConfigKeys.rewardedHintAdsEnabled]:
      defaultLaunchConfig.rewardedHintAdsEnabled,
    [launchConfigKeys.resultInterstitialAdsEnabled]:
      defaultLaunchConfig.resultInterstitialAdsEnabled,
    [launchConfigKeys.leaderboardEnabled]:
      defaultLaunchConfig.leaderboardEnabled,
  };
}
