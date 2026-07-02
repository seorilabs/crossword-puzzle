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
  // 도전 기회 소진 시 리워드 광고로 1회 충전하는 CTA 노출 여부(#204).
  // 데이터 확인 전이므로 기본 비활성이며 Remote Config로만 켠다.
  rewardedExtraAttemptEnabled: boolean;
  // 하루에 광고로 충전할 수 있는 추가 도전 횟수 상한(#204).
  rewardedExtraAttemptDailyCap: number;
  resultInterstitialAdsEnabled: boolean;
  leaderboardEnabled: boolean;
  returnReminderEnabled: boolean;
  // 신규 첫 실행에서 홈을 건너뛰고 온보딩 퍼즐 풀이 화면으로 자동 진입할지(#205).
  firstRunAutoStartEnabled: boolean;
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
  rewardedExtraAttemptEnabled: "rewarded_extra_attempt_enabled",
  rewardedExtraAttemptDailyCap: "rewarded_extra_attempt_daily_cap",
  resultInterstitialAdsEnabled: "result_interstitial_ads_enabled",
  leaderboardEnabled: "leaderboard_enabled",
  returnReminderEnabled: "return_reminder_enabled",
  firstRunAutoStartEnabled: "first_run_auto_start_enabled",
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
  // 소진 구제 리워드 광고(#204). remaining_attempts=0 이탈 데이터 확인 전이라
  // 기본 OFF. 켤 때는 Remote Config `rewarded_extra_attempt_enabled`로 켠다.
  rewardedExtraAttemptEnabled: false,
  rewardedExtraAttemptDailyCap: 1,
  resultInterstitialAdsEnabled: false,
  leaderboardEnabled: false,
  // 복귀 리마인드 푸시 동의 유도(D1 재방문) 기본 활성. 스마트발송 템플릿이 등록돼
  // AIT/Web 동의 요청 경로가 갖춰졌고, D1 잔존(8.6%) 개선을 위해 켠다(#162). 필요 시
  // Remote Config `return_reminder_enabled`로 끌 수 있다. mobile(RN)은 알림 동의
  // adapter가 없어 이 값과 무관하게 no-op이다(docs/market-parity.md 참고).
  returnReminderEnabled: true,
  // 신규 첫 실행 온보딩 퍼즐 자동 진입 기본 활성(#205). 신규의 today 화면 도달률
  // (62%)·attempt_start 도달률(57%) 개선용. 회귀 시 Remote Config
  // `first_run_auto_start_enabled`로 즉시 끈다.
  firstRunAutoStartEnabled: true,
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
    rewardedExtraAttemptEnabled:
      value.rewardedExtraAttemptEnabled ??
      defaultLaunchConfig.rewardedExtraAttemptEnabled,
    rewardedExtraAttemptDailyCap: clampInteger(
      value.rewardedExtraAttemptDailyCap ??
        defaultLaunchConfig.rewardedExtraAttemptDailyCap,
      defaultLaunchConfig.rewardedExtraAttemptDailyCap,
      1,
      5,
    ),
    resultInterstitialAdsEnabled:
      value.resultInterstitialAdsEnabled ??
      defaultLaunchConfig.resultInterstitialAdsEnabled,
    leaderboardEnabled:
      value.leaderboardEnabled ?? defaultLaunchConfig.leaderboardEnabled,
    returnReminderEnabled:
      value.returnReminderEnabled ??
      defaultLaunchConfig.returnReminderEnabled,
    firstRunAutoStartEnabled:
      value.firstRunAutoStartEnabled ??
      defaultLaunchConfig.firstRunAutoStartEnabled,
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
    [launchConfigKeys.rewardedExtraAttemptEnabled]:
      defaultLaunchConfig.rewardedExtraAttemptEnabled,
    [launchConfigKeys.rewardedExtraAttemptDailyCap]:
      defaultLaunchConfig.rewardedExtraAttemptDailyCap,
    [launchConfigKeys.resultInterstitialAdsEnabled]:
      defaultLaunchConfig.resultInterstitialAdsEnabled,
    [launchConfigKeys.leaderboardEnabled]:
      defaultLaunchConfig.leaderboardEnabled,
    [launchConfigKeys.returnReminderEnabled]:
      defaultLaunchConfig.returnReminderEnabled,
    [launchConfigKeys.firstRunAutoStartEnabled]:
      defaultLaunchConfig.firstRunAutoStartEnabled,
    [launchConfigKeys.stuckHintIdleMs]: defaultLaunchConfig.stuckHintIdleMs,
    [launchConfigKeys.stuckHintWrongIdleMs]:
      defaultLaunchConfig.stuckHintWrongIdleMs,
    [launchConfigKeys.stuckHintWrongCellThreshold]:
      defaultLaunchConfig.stuckHintWrongCellThreshold,
    [launchConfigKeys.checkHighlightMs]: defaultLaunchConfig.checkHighlightMs,
  };
}
