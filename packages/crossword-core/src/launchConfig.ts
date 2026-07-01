import {
  DEFAULT_HINT_CREDITS,
  DEFAULT_VISIBLE_PUZZLE_COUNT,
  PUZZLE_GENERATION_INTERVAL_HOURS,
  PUZZLE_KEEP_COUNT,
} from "./uiPolicy.ts";

export type LaunchConfig = {
  defaultHintCredits: number;
  rewardedHintCredits: number;
  visiblePuzzleCount: number;
  puzzleGenerationIntervalHours: number;
  puzzleKeepCount: number;
  completionStatsEnabled: boolean;
  completionStatsMinDisplayCount: number;
  rewardedBonusPuzzleAdsEnabled: boolean;
  rewardedHintAdsEnabled: boolean;
  resultInterstitialAdsEnabled: boolean;
  leaderboardEnabled: boolean;
  returnReminderEnabled: boolean;
  // 막힘 힌트 자동 노출: 입력 정체가 이 시간(ms)을 넘으면 비침습 힌트 CTA를 띄운다.
  stuckHintIdleMs: number;
  // 오답이 쌓여 막힘 신호가 보이면 위 시간 대신 더 짧은 이 지연(ms)으로 띄운다.
  stuckHintWrongIdleMs: number;
  // 이 개수 이상의 셀이 오답으로 남아 있으면 "막힘"으로 보고 빠른 노출을 적용한다.
  stuckHintWrongCellThreshold: number;
  // "이 단어 확인"으로 강조한 셀을 원복 전까지 보여주는 시간(ms).
  checkHighlightMs: number;
};

export const launchConfigKeys = {
  defaultHintCredits: "default_hint_credits",
  rewardedHintCredits: "rewarded_hint_credits",
  visiblePuzzleCount: "visible_puzzle_count",
  puzzleGenerationIntervalHours: "puzzle_generation_interval_hours",
  puzzleKeepCount: "puzzle_keep_count",
  completionStatsEnabled: "completion_stats_enabled",
  completionStatsMinDisplayCount: "completion_stats_min_display_count",
  rewardedBonusPuzzleAdsEnabled: "rewarded_bonus_puzzle_ads_enabled",
  rewardedHintAdsEnabled: "rewarded_hint_ads_enabled",
  resultInterstitialAdsEnabled: "result_interstitial_ads_enabled",
  leaderboardEnabled: "leaderboard_enabled",
  returnReminderEnabled: "return_reminder_enabled",
  stuckHintIdleMs: "stuck_hint_idle_ms",
  stuckHintWrongIdleMs: "stuck_hint_wrong_idle_ms",
  stuckHintWrongCellThreshold: "stuck_hint_wrong_cell_threshold",
  checkHighlightMs: "check_highlight_ms",
} as const;

export const defaultLaunchConfig: LaunchConfig = {
  defaultHintCredits: DEFAULT_HINT_CREDITS,
  rewardedHintCredits: 2,
  visiblePuzzleCount: DEFAULT_VISIBLE_PUZZLE_COUNT,
  puzzleGenerationIntervalHours: PUZZLE_GENERATION_INTERVAL_HOURS,
  puzzleKeepCount: PUZZLE_KEEP_COUNT,
  completionStatsEnabled: true,
  completionStatsMinDisplayCount: 10,
  rewardedBonusPuzzleAdsEnabled: true,
  rewardedHintAdsEnabled: true,
  resultInterstitialAdsEnabled: false,
  leaderboardEnabled: false,
  // 복귀 리마인드 푸시 동의 유도(D1 재방문) 기본 활성. 스마트발송 템플릿이 등록돼
  // AIT/Web 동의 요청 경로가 갖춰졌고, D1 잔존(8.6%) 개선을 위해 켠다(#162). 필요 시
  // Remote Config `return_reminder_enabled`로 끌 수 있다. mobile(RN)은 알림 동의
  // adapter가 없어 이 값과 무관하게 no-op이다(docs/market-parity.md 참고).
  returnReminderEnabled: true,
  // 막힘 힌트/피드백 튜닝값(원격 조정 가능). 기존 App.tsx 하드코딩 값을 그대로 옮겼다.
  stuckHintIdleMs: 20000,
  stuckHintWrongIdleMs: 5000,
  stuckHintWrongCellThreshold: 2,
  checkHighlightMs: 2500,
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
    completionStatsEnabled:
      value.completionStatsEnabled ??
      defaultLaunchConfig.completionStatsEnabled,
    completionStatsMinDisplayCount: clampInteger(
      value.completionStatsMinDisplayCount ??
        defaultLaunchConfig.completionStatsMinDisplayCount,
      defaultLaunchConfig.completionStatsMinDisplayCount,
      1,
      100,
    ),
    rewardedBonusPuzzleAdsEnabled:
      value.rewardedBonusPuzzleAdsEnabled ??
      defaultLaunchConfig.rewardedBonusPuzzleAdsEnabled,
    rewardedHintAdsEnabled:
      value.rewardedHintAdsEnabled ??
      defaultLaunchConfig.rewardedHintAdsEnabled,
    resultInterstitialAdsEnabled:
      value.resultInterstitialAdsEnabled ??
      defaultLaunchConfig.resultInterstitialAdsEnabled,
    leaderboardEnabled:
      value.leaderboardEnabled ?? defaultLaunchConfig.leaderboardEnabled,
    returnReminderEnabled:
      value.returnReminderEnabled ??
      defaultLaunchConfig.returnReminderEnabled,
    stuckHintIdleMs: clampInteger(
      value.stuckHintIdleMs ?? defaultLaunchConfig.stuckHintIdleMs,
      defaultLaunchConfig.stuckHintIdleMs,
      3000,
      120000,
    ),
    stuckHintWrongIdleMs: clampInteger(
      value.stuckHintWrongIdleMs ?? defaultLaunchConfig.stuckHintWrongIdleMs,
      defaultLaunchConfig.stuckHintWrongIdleMs,
      1000,
      60000,
    ),
    stuckHintWrongCellThreshold: clampInteger(
      value.stuckHintWrongCellThreshold ??
        defaultLaunchConfig.stuckHintWrongCellThreshold,
      defaultLaunchConfig.stuckHintWrongCellThreshold,
      1,
      20,
    ),
    checkHighlightMs: clampInteger(
      value.checkHighlightMs ?? defaultLaunchConfig.checkHighlightMs,
      defaultLaunchConfig.checkHighlightMs,
      500,
      10000,
    ),
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
    [launchConfigKeys.completionStatsEnabled]:
      defaultLaunchConfig.completionStatsEnabled,
    [launchConfigKeys.completionStatsMinDisplayCount]:
      defaultLaunchConfig.completionStatsMinDisplayCount,
    [launchConfigKeys.rewardedBonusPuzzleAdsEnabled]:
      defaultLaunchConfig.rewardedBonusPuzzleAdsEnabled,
    [launchConfigKeys.rewardedHintAdsEnabled]:
      defaultLaunchConfig.rewardedHintAdsEnabled,
    [launchConfigKeys.resultInterstitialAdsEnabled]:
      defaultLaunchConfig.resultInterstitialAdsEnabled,
    [launchConfigKeys.leaderboardEnabled]:
      defaultLaunchConfig.leaderboardEnabled,
    [launchConfigKeys.returnReminderEnabled]:
      defaultLaunchConfig.returnReminderEnabled,
    [launchConfigKeys.stuckHintIdleMs]: defaultLaunchConfig.stuckHintIdleMs,
    [launchConfigKeys.stuckHintWrongIdleMs]:
      defaultLaunchConfig.stuckHintWrongIdleMs,
    [launchConfigKeys.stuckHintWrongCellThreshold]:
      defaultLaunchConfig.stuckHintWrongCellThreshold,
    [launchConfigKeys.checkHighlightMs]: defaultLaunchConfig.checkHighlightMs,
  };
}
