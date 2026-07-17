import { LEADERBOARD_SCORE_WEIGHTS } from "./leaderboard.ts";
import {
  DAILY_ATTEMPT_LIMIT,
  DEFAULT_HINT_CREDITS,
  DEFAULT_HINT_CREDITS_BY_DIFFICULTY,
  DEFAULT_VISIBLE_PUZZLE_COUNT,
  PUZZLE_GENERATION_INTERVAL_HOURS,
  PUZZLE_KEEP_COUNT,
} from "./uiPolicy.ts";

export type LaunchConfig = {
  // normal(및 난이도 미상) 퍼즐의 기본 힌트 크레딧. easy/hard 는 아래 전용 키로
  // 오버라이드한다(#251).
  defaultHintCredits: number;
  // 난이도별 기본 힌트 크레딧 오버라이드(#251). 평면 3크레딧이 easy 는 과다·hard 는
  // 부족한 문제를 재배포 없이 원격 조정하려고 뺀다. 기본값은 uiPolicy 의 난이도별
  // 코드 기본값과 동일해 회귀가 없다.
  defaultHintCreditsEasy: number;
  defaultHintCreditsHard: number;
  rewardedHintCredits: number;
  visiblePuzzleCount: number;
  puzzleGenerationIntervalHours: number;
  puzzleKeepCount: number;
  // 하루 도전 횟수 상한(#225). 다른 밸런스 레버처럼 재배포 없이 원격 조정하려고
  // Remote Config로 뺀다. 기본값은 uiPolicy.DAILY_ATTEMPT_LIMIT와 동일해 회귀가 없다.
  dailyAttemptLimit: number;
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
  // 신규 Phaser runtime 진입 gate. host가 engine chunk import 전에 읽으며 bundled
  // 기본값은 false다. engine 내부에서 이 값을 읽어 자체 부팅하면 안 된다.
  gameRuntimeEnabled: boolean;
  // 막힘 힌트 자동 노출: 입력 정체가 이 시간(ms)을 넘으면 비침습 힌트 CTA를 띄운다.
  stuckHintIdleMs: number;
  // 오답이 쌓여 막힘 신호가 보이면 위 시간 대신 더 짧은 이 지연(ms)으로 띄운다.
  stuckHintWrongIdleMs: number;
  // 이 개수 이상의 셀이 오답으로 남아 있으면 "막힘"으로 보고 빠른 노출을 적용한다.
  stuckHintWrongCellThreshold: number;
  // 한 attempt 에서 막힘 힌트 CTA를 노출할 최대 횟수(#254). 초과하면 그 attempt 에서
  // 더 띄우지 않아, 닫아도 계속 재노출되던 폭주를 막는다.
  stuckHintMaxPromptsPerAttempt: number;
  // 한 attempt 에서 CTA 닫기(dismiss)를 존중하는 상한(#254). 도달하면 그 attempt 에서
  // 더 노출하지 않는다.
  stuckHintMaxDismissals: number;
  // 닫을 때마다 다음 노출 지연에 곱하는 배수(지수 백오프, #254). 1이면 백오프 없음.
  stuckHintDismissBackoffFactor: number;
  // "이 단어 확인"으로 강조한 셀을 원복 전까지 보여주는 시간(ms).
  checkHighlightMs: number;
  // 리더보드 점수 산식 가중치(#216). 앱 재배포 없이 밸런스를 조정하도록 Remote
  // Config로 뺀다. 기본값은 leaderboard.ts의 LEADERBOARD_SCORE_WEIGHTS와 동일해
  // 점수 회귀가 없다.
  leaderboardScoreCompletedWord: number;
  leaderboardScoreRemainingAttempt: number;
  leaderboardScoreHint: number;
  leaderboardScoreTimeBonusBase: number;
  leaderboardScoreTimeDecayPerSecond: number;
};

export const launchConfigKeys = {
  defaultHintCredits: "default_hint_credits",
  defaultHintCreditsEasy: "default_hint_credits_easy",
  defaultHintCreditsHard: "default_hint_credits_hard",
  rewardedHintCredits: "rewarded_hint_credits",
  visiblePuzzleCount: "visible_puzzle_count",
  puzzleGenerationIntervalHours: "puzzle_generation_interval_hours",
  puzzleKeepCount: "puzzle_keep_count",
  dailyAttemptLimit: "daily_attempt_limit",
  rewardedBonusPuzzleAdsEnabled: "rewarded_bonus_puzzle_ads_enabled",
  rewardedHintAdsEnabled: "rewarded_hint_ads_enabled",
  rewardedExtraAttemptEnabled: "rewarded_extra_attempt_enabled",
  rewardedExtraAttemptDailyCap: "rewarded_extra_attempt_daily_cap",
  resultInterstitialAdsEnabled: "result_interstitial_ads_enabled",
  leaderboardEnabled: "leaderboard_enabled",
  returnReminderEnabled: "return_reminder_enabled",
  firstRunAutoStartEnabled: "first_run_auto_start_enabled",
  gameRuntimeEnabled: "game_runtime_enabled",
  stuckHintIdleMs: "stuck_hint_idle_ms",
  stuckHintWrongIdleMs: "stuck_hint_wrong_idle_ms",
  stuckHintWrongCellThreshold: "stuck_hint_wrong_cell_threshold",
  stuckHintMaxPromptsPerAttempt: "stuck_hint_max_prompts_per_attempt",
  stuckHintMaxDismissals: "stuck_hint_max_dismissals",
  stuckHintDismissBackoffFactor: "stuck_hint_dismiss_backoff_factor",
  checkHighlightMs: "check_highlight_ms",
  leaderboardScoreCompletedWord: "leaderboard_score_completed_word",
  leaderboardScoreRemainingAttempt: "leaderboard_score_remaining_attempt",
  leaderboardScoreHint: "leaderboard_score_hint",
  leaderboardScoreTimeBonusBase: "leaderboard_score_time_bonus_base",
  leaderboardScoreTimeDecayPerSecond: "leaderboard_score_time_decay_per_second",
} as const;

export const defaultLaunchConfig: LaunchConfig = {
  defaultHintCredits: DEFAULT_HINT_CREDITS,
  // 난이도별 기본 힌트 크레딧 기본값은 uiPolicy 코드 기본값(easy:2/hard:5)과 동일(#251).
  defaultHintCreditsEasy: DEFAULT_HINT_CREDITS_BY_DIFFICULTY.easy,
  defaultHintCreditsHard: DEFAULT_HINT_CREDITS_BY_DIFFICULTY.hard,
  rewardedHintCredits: 2,
  visiblePuzzleCount: DEFAULT_VISIBLE_PUZZLE_COUNT,
  puzzleGenerationIntervalHours: PUZZLE_GENERATION_INTERVAL_HOURS,
  puzzleKeepCount: PUZZLE_KEEP_COUNT,
  // 하루 도전 횟수 상한 기본값(#225). uiPolicy 상수와 동일하게 둬 원격 미주입 시
  // 기존과 같은 3회로 동작한다.
  dailyAttemptLimit: DAILY_ATTEMPT_LIMIT,
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
  gameRuntimeEnabled: false,
  // 막힘 힌트/피드백 튜닝값(원격 조정 가능). 기존 App.tsx 하드코딩 값을 그대로 옮겼다.
  stuckHintIdleMs: 20000,
  stuckHintWrongIdleMs: 5000,
  stuckHintWrongCellThreshold: 2,
  // dismiss 폭주 방어 기본값(#254): attempt 당 최대 3회 노출, 닫기 2회면 종료,
  // 닫을 때마다 다음 지연 ×2 백오프.
  stuckHintMaxPromptsPerAttempt: 3,
  stuckHintMaxDismissals: 2,
  stuckHintDismissBackoffFactor: 2,
  checkHighlightMs: 2500,
  // 리더보드 가중치 기본값은 leaderboard.ts 상수를 그대로 따른다(#216).
  leaderboardScoreCompletedWord: LEADERBOARD_SCORE_WEIGHTS.completedWord,
  leaderboardScoreRemainingAttempt: LEADERBOARD_SCORE_WEIGHTS.remainingAttempt,
  leaderboardScoreHint: LEADERBOARD_SCORE_WEIGHTS.hint,
  leaderboardScoreTimeBonusBase: LEADERBOARD_SCORE_WEIGHTS.timeBonusBase,
  leaderboardScoreTimeDecayPerSecond:
    LEADERBOARD_SCORE_WEIGHTS.timeDecayPerSecond,
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

// 퍼즐 난이도에 맞는 기본 힌트 크레딧을 launchConfig 에서 뽑는다(#251). easy/hard 는
// 전용 오버라이드 키를, normal 과 난이도 미상은 base(defaultHintCredits)를 쓴다.
// App 의 총 힌트 계산(defaultHintCredits + earnedHintCredits)이 이 값을 쓰도록 한다.
export function resolveDefaultHintCredits(
  config: LaunchConfig,
  difficulty: string | undefined | null,
): number {
  if (difficulty === "easy") {
    return config.defaultHintCreditsEasy;
  }

  if (difficulty === "hard") {
    return config.defaultHintCreditsHard;
  }

  return config.defaultHintCredits;
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
    // 난이도별 오버라이드도 base 와 같은 범위(0~20)로 방어한다(#251).
    defaultHintCreditsEasy: clampInteger(
      value.defaultHintCreditsEasy ??
        defaultLaunchConfig.defaultHintCreditsEasy,
      defaultLaunchConfig.defaultHintCreditsEasy,
      0,
      20,
    ),
    defaultHintCreditsHard: clampInteger(
      value.defaultHintCreditsHard ??
        defaultLaunchConfig.defaultHintCreditsHard,
      defaultLaunchConfig.defaultHintCreditsHard,
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
    // 도전 횟수 상한(#225). 0/음수는 최소 1로, NaN은 기본값(3)으로 방어해 원격 오설정이
    // 그대로 반영되지 않게 한다(최소 1회는 보장).
    dailyAttemptLimit: clampInteger(
      value.dailyAttemptLimit ?? defaultLaunchConfig.dailyAttemptLimit,
      defaultLaunchConfig.dailyAttemptLimit,
      1,
      20,
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
    gameRuntimeEnabled:
      value.gameRuntimeEnabled ?? defaultLaunchConfig.gameRuntimeEnabled,
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
    stuckHintMaxPromptsPerAttempt: clampInteger(
      value.stuckHintMaxPromptsPerAttempt ??
        defaultLaunchConfig.stuckHintMaxPromptsPerAttempt,
      defaultLaunchConfig.stuckHintMaxPromptsPerAttempt,
      1,
      20,
    ),
    stuckHintMaxDismissals: clampInteger(
      value.stuckHintMaxDismissals ??
        defaultLaunchConfig.stuckHintMaxDismissals,
      defaultLaunchConfig.stuckHintMaxDismissals,
      1,
      20,
    ),
    stuckHintDismissBackoffFactor: clampInteger(
      value.stuckHintDismissBackoffFactor ??
        defaultLaunchConfig.stuckHintDismissBackoffFactor,
      defaultLaunchConfig.stuckHintDismissBackoffFactor,
      1,
      10,
    ),
    checkHighlightMs: clampInteger(
      value.checkHighlightMs ?? defaultLaunchConfig.checkHighlightMs,
      defaultLaunchConfig.checkHighlightMs,
      500,
      10000,
    ),
    // 리더보드 가중치(#216). 음수/NaN은 기본값·범위로 방어한다(가짜 점수 방지).
    leaderboardScoreCompletedWord: clampInteger(
      value.leaderboardScoreCompletedWord ??
        defaultLaunchConfig.leaderboardScoreCompletedWord,
      defaultLaunchConfig.leaderboardScoreCompletedWord,
      0,
      1000000,
    ),
    leaderboardScoreRemainingAttempt: clampInteger(
      value.leaderboardScoreRemainingAttempt ??
        defaultLaunchConfig.leaderboardScoreRemainingAttempt,
      defaultLaunchConfig.leaderboardScoreRemainingAttempt,
      0,
      1000000,
    ),
    leaderboardScoreHint: clampInteger(
      value.leaderboardScoreHint ?? defaultLaunchConfig.leaderboardScoreHint,
      defaultLaunchConfig.leaderboardScoreHint,
      0,
      1000000,
    ),
    leaderboardScoreTimeBonusBase: clampInteger(
      value.leaderboardScoreTimeBonusBase ??
        defaultLaunchConfig.leaderboardScoreTimeBonusBase,
      defaultLaunchConfig.leaderboardScoreTimeBonusBase,
      0,
      1000000,
    ),
    leaderboardScoreTimeDecayPerSecond: clampInteger(
      value.leaderboardScoreTimeDecayPerSecond ??
        defaultLaunchConfig.leaderboardScoreTimeDecayPerSecond,
      defaultLaunchConfig.leaderboardScoreTimeDecayPerSecond,
      0,
      100000,
    ),
  };
}

export function getLaunchConfigDefaultsForRemoteConfig() {
  return {
    [launchConfigKeys.defaultHintCredits]:
      defaultLaunchConfig.defaultHintCredits,
    [launchConfigKeys.defaultHintCreditsEasy]:
      defaultLaunchConfig.defaultHintCreditsEasy,
    [launchConfigKeys.defaultHintCreditsHard]:
      defaultLaunchConfig.defaultHintCreditsHard,
    [launchConfigKeys.rewardedHintCredits]:
      defaultLaunchConfig.rewardedHintCredits,
    [launchConfigKeys.visiblePuzzleCount]:
      defaultLaunchConfig.visiblePuzzleCount,
    [launchConfigKeys.puzzleGenerationIntervalHours]:
      defaultLaunchConfig.puzzleGenerationIntervalHours,
    [launchConfigKeys.puzzleKeepCount]: defaultLaunchConfig.puzzleKeepCount,
    [launchConfigKeys.dailyAttemptLimit]:
      defaultLaunchConfig.dailyAttemptLimit,
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
    [launchConfigKeys.gameRuntimeEnabled]:
      defaultLaunchConfig.gameRuntimeEnabled,
    [launchConfigKeys.stuckHintIdleMs]: defaultLaunchConfig.stuckHintIdleMs,
    [launchConfigKeys.stuckHintWrongIdleMs]:
      defaultLaunchConfig.stuckHintWrongIdleMs,
    [launchConfigKeys.stuckHintWrongCellThreshold]:
      defaultLaunchConfig.stuckHintWrongCellThreshold,
    [launchConfigKeys.stuckHintMaxPromptsPerAttempt]:
      defaultLaunchConfig.stuckHintMaxPromptsPerAttempt,
    [launchConfigKeys.stuckHintMaxDismissals]:
      defaultLaunchConfig.stuckHintMaxDismissals,
    [launchConfigKeys.stuckHintDismissBackoffFactor]:
      defaultLaunchConfig.stuckHintDismissBackoffFactor,
    [launchConfigKeys.checkHighlightMs]: defaultLaunchConfig.checkHighlightMs,
    [launchConfigKeys.leaderboardScoreCompletedWord]:
      defaultLaunchConfig.leaderboardScoreCompletedWord,
    [launchConfigKeys.leaderboardScoreRemainingAttempt]:
      defaultLaunchConfig.leaderboardScoreRemainingAttempt,
    [launchConfigKeys.leaderboardScoreHint]:
      defaultLaunchConfig.leaderboardScoreHint,
    [launchConfigKeys.leaderboardScoreTimeBonusBase]:
      defaultLaunchConfig.leaderboardScoreTimeBonusBase,
    [launchConfigKeys.leaderboardScoreTimeDecayPerSecond]:
      defaultLaunchConfig.leaderboardScoreTimeDecayPerSecond,
  };
}
