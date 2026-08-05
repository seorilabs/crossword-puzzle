import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  defaultLaunchConfig,
  getLaunchConfigDefaultsForRemoteConfig,
  launchConfigKeys,
  normalizeLaunchConfig,
  resolveDefaultHintCredits,
} from "./launchConfig.ts";
import { LEADERBOARD_SCORE_WEIGHTS } from "./leaderboard.ts";
import {
  DEFAULT_DAILY_FREE_HINT_CREDITS,
  DEFAULT_REWARDED_HINT_CREDITS,
} from "./dailyHintWallet.ts";
import {
  DAILY_ATTEMPT_LIMIT,
  DEFAULT_HINT_CREDITS_BY_DIFFICULTY,
} from "./uiPolicy.ts";

describe("launchConfig: returnReminderEnabled 기본값", () => {
  it("복귀 리마인드 동의 유도가 기본 활성(true)이다(#162)", () => {
    assert.equal(defaultLaunchConfig.returnReminderEnabled, true);
  });

  it("Remote Config 기본값 맵에도 활성으로 반영된다", () => {
    const defaults = getLaunchConfigDefaultsForRemoteConfig();
    assert.equal(defaults[launchConfigKeys.returnReminderEnabled], true);
  });

  it("Remote Config에서 명시적으로 false면 끌 수 있다(원격 제어 유지)", () => {
    const config = normalizeLaunchConfig({ returnReminderEnabled: false });
    assert.equal(config.returnReminderEnabled, false);
  });

  it("값이 없으면 기본값(활성)으로 폴백한다", () => {
    const config = normalizeLaunchConfig({});
    assert.equal(config.returnReminderEnabled, true);
  });
});

describe("launchConfig: firstRunAutoStartEnabled 기본값(#205)", () => {
  it("신규 첫 실행 자동 진입이 기본 활성(true)이다", () => {
    assert.equal(defaultLaunchConfig.firstRunAutoStartEnabled, true);
  });

  it("Remote Config 기본값 맵에도 활성으로 반영된다", () => {
    const defaults = getLaunchConfigDefaultsForRemoteConfig();
    assert.equal(defaults[launchConfigKeys.firstRunAutoStartEnabled], true);
    assert.equal(
      launchConfigKeys.firstRunAutoStartEnabled,
      "first_run_auto_start_enabled",
    );
  });

  it("Remote Config에서 명시적으로 false면 끌 수 있다(회귀 시 킬 스위치)", () => {
    const config = normalizeLaunchConfig({ firstRunAutoStartEnabled: false });
    assert.equal(config.firstRunAutoStartEnabled, false);
  });

  it("값이 없으면 기본값(활성)으로 폴백한다", () => {
    const config = normalizeLaunchConfig({});
    assert.equal(config.firstRunAutoStartEnabled, true);
  });
});

describe("launchConfig: 막힘 힌트/피드백 튜닝값(#172)", () => {
  it("기본값이 기존 App.tsx 하드코딩 값과 일치한다", () => {
    assert.equal(defaultLaunchConfig.stuckHintIdleMs, 20000);
    assert.equal(defaultLaunchConfig.stuckHintWrongIdleMs, 5000);
    assert.equal(defaultLaunchConfig.stuckHintWrongCellThreshold, 2);
    assert.equal(defaultLaunchConfig.checkHighlightMs, 2500);
  });

  it("미설정(빈 값) 시 현재 값으로 폴백한다", () => {
    const config = normalizeLaunchConfig({});
    assert.equal(config.stuckHintIdleMs, 20000);
    assert.equal(config.stuckHintWrongIdleMs, 5000);
    assert.equal(config.stuckHintWrongCellThreshold, 2);
    assert.equal(config.checkHighlightMs, 2500);
  });

  it("Remote Config 기본값 맵에 신규 키가 등록된다", () => {
    const defaults = getLaunchConfigDefaultsForRemoteConfig();
    assert.equal(defaults[launchConfigKeys.stuckHintIdleMs], 20000);
    assert.equal(defaults[launchConfigKeys.stuckHintWrongIdleMs], 5000);
    assert.equal(defaults[launchConfigKeys.stuckHintWrongCellThreshold], 2);
    assert.equal(defaults[launchConfigKeys.checkHighlightMs], 2500);
  });

  it("원격 값으로 막힘 힌트 타이밍을 조정할 수 있다", () => {
    const config = normalizeLaunchConfig({
      stuckHintIdleMs: 30000,
      stuckHintWrongIdleMs: 8000,
      stuckHintWrongCellThreshold: 3,
      checkHighlightMs: 4000,
    });
    assert.equal(config.stuckHintIdleMs, 30000);
    assert.equal(config.stuckHintWrongIdleMs, 8000);
    assert.equal(config.stuckHintWrongCellThreshold, 3);
    assert.equal(config.checkHighlightMs, 4000);
  });

  it("허용 범위를 벗어나면 clamp된다", () => {
    const tooLow = normalizeLaunchConfig({
      stuckHintIdleMs: 100,
      stuckHintWrongIdleMs: 0,
      stuckHintWrongCellThreshold: 0,
      checkHighlightMs: 10,
    });
    assert.equal(tooLow.stuckHintIdleMs, 3000);
    assert.equal(tooLow.stuckHintWrongIdleMs, 1000);
    assert.equal(tooLow.stuckHintWrongCellThreshold, 1);
    assert.equal(tooLow.checkHighlightMs, 500);

    const tooHigh = normalizeLaunchConfig({
      stuckHintIdleMs: 999999,
      stuckHintWrongIdleMs: 999999,
      stuckHintWrongCellThreshold: 999,
      checkHighlightMs: 999999,
    });
    assert.equal(tooHigh.stuckHintIdleMs, 120000);
    assert.equal(tooHigh.stuckHintWrongIdleMs, 60000);
    assert.equal(tooHigh.stuckHintWrongCellThreshold, 20);
    assert.equal(tooHigh.checkHighlightMs, 10000);
  });

  it("NaN 등 비유한 값은 기본값으로 폴백한다", () => {
    const config = normalizeLaunchConfig({
      stuckHintIdleMs: Number.NaN,
      checkHighlightMs: Number.POSITIVE_INFINITY,
    });
    assert.equal(config.stuckHintIdleMs, 20000);
    assert.equal(config.checkHighlightMs, 2500);
  });
});

describe("launchConfig: 완료 직전 마무리 넛지 임계(#280)", () => {
  it("기본값은 진행률 90%·잔여 단어 2개다", () => {
    assert.equal(defaultLaunchConfig.finishNudgeProgressThreshold, 90);
    assert.equal(defaultLaunchConfig.finishNudgeWordsRemaining, 2);
  });

  it("미설정(빈 값)이면 기본값으로 폴백한다", () => {
    const config = normalizeLaunchConfig({});
    assert.equal(config.finishNudgeProgressThreshold, 90);
    assert.equal(config.finishNudgeWordsRemaining, 2);
  });

  it("Remote Config 키·기본값 맵에 영문 스네이크 키로 반영된다", () => {
    assert.equal(
      launchConfigKeys.finishNudgeProgressThreshold,
      "finish_nudge_progress_threshold",
    );
    assert.equal(
      launchConfigKeys.finishNudgeWordsRemaining,
      "finish_nudge_words_remaining",
    );
    const defaults = getLaunchConfigDefaultsForRemoteConfig();
    assert.equal(defaults["finish_nudge_progress_threshold"], 90);
    assert.equal(defaults["finish_nudge_words_remaining"], 2);
  });

  it("원격 값으로 임계를 조정할 수 있다", () => {
    const config = normalizeLaunchConfig({
      finishNudgeProgressThreshold: 75,
      finishNudgeWordsRemaining: 3,
    });
    assert.equal(config.finishNudgeProgressThreshold, 75);
    assert.equal(config.finishNudgeWordsRemaining, 3);
  });

  it("launchConfig에 finishNudge 임계 두 키가 추가되고 Remote Config로 덮어쓸 수 있다(#280 · AC-2)", () => {
    // 기본값(90/2)이 있고, Remote Config 부분값으로 두 키를 독립적으로 덮어쓸 수 있다.
    assert.equal(defaultLaunchConfig.finishNudgeProgressThreshold, 90);
    assert.equal(defaultLaunchConfig.finishNudgeWordsRemaining, 2);
    const overridden = normalizeLaunchConfig({
      finishNudgeProgressThreshold: 80,
      finishNudgeWordsRemaining: 1,
    });
    assert.equal(overridden.finishNudgeProgressThreshold, 80);
    assert.equal(overridden.finishNudgeWordsRemaining, 1);
  });

  it("허용 범위(진행률 0~100, 잔여 단어 1~20)를 벗어나면 clamp된다", () => {
    const tooHigh = normalizeLaunchConfig({
      finishNudgeProgressThreshold: 150,
      finishNudgeWordsRemaining: 99,
    });
    assert.equal(tooHigh.finishNudgeProgressThreshold, 100);
    assert.equal(tooHigh.finishNudgeWordsRemaining, 20);
    const tooLow = normalizeLaunchConfig({
      finishNudgeProgressThreshold: -10,
      finishNudgeWordsRemaining: 0,
    });
    assert.equal(tooLow.finishNudgeProgressThreshold, 0);
    assert.equal(tooLow.finishNudgeWordsRemaining, 1);
  });
});
describe("launchConfig: dailyAttemptLimit 원격화(#225)", () => {
  it("기본값이 uiPolicy.DAILY_ATTEMPT_LIMIT(=3)와 일치한다(회귀 없음)", () => {
    assert.equal(defaultLaunchConfig.dailyAttemptLimit, DAILY_ATTEMPT_LIMIT);
    assert.equal(defaultLaunchConfig.dailyAttemptLimit, 3);
  });

  it("미설정(빈 값)이면 기본값 3으로 폴백한다", () => {
    assert.equal(normalizeLaunchConfig({}).dailyAttemptLimit, 3);
  });

  it("Remote Config 키·기본값 맵에 영문 스네이크 키로 반영된다", () => {
    assert.equal(launchConfigKeys.dailyAttemptLimit, "daily_attempt_limit");
    const defaults = getLaunchConfigDefaultsForRemoteConfig();
    assert.equal(defaults[launchConfigKeys.dailyAttemptLimit], 3);
  });

  it("원격 값으로 도전 횟수 상한을 2/4로 조정할 수 있다", () => {
    assert.equal(
      normalizeLaunchConfig({ dailyAttemptLimit: 2 }).dailyAttemptLimit,
      2,
    );
    assert.equal(
      normalizeLaunchConfig({ dailyAttemptLimit: 4 }).dailyAttemptLimit,
      4,
    );
  });

  it("0/음수는 최소 1로, NaN은 기본값(3)으로 방어한다", () => {
    assert.equal(
      normalizeLaunchConfig({ dailyAttemptLimit: 0 }).dailyAttemptLimit,
      1,
    );
    assert.equal(
      normalizeLaunchConfig({ dailyAttemptLimit: -5 }).dailyAttemptLimit,
      1,
    );
    assert.equal(
      normalizeLaunchConfig({ dailyAttemptLimit: Number.NaN })
        .dailyAttemptLimit,
      3,
    );
  });

  it("과대값은 상한(20)으로 클램프된다", () => {
    assert.equal(
      normalizeLaunchConfig({ dailyAttemptLimit: 999 }).dailyAttemptLimit,
      20,
    );
  });
});

describe("launchConfig: 리더보드 점수 가중치(#216)", () => {
  it("기본값이 leaderboard.ts의 LEADERBOARD_SCORE_WEIGHTS와 일치한다(회귀 없음)", () => {
    assert.equal(
      defaultLaunchConfig.leaderboardScoreCompletedWord,
      LEADERBOARD_SCORE_WEIGHTS.completedWord,
    );
    assert.equal(
      defaultLaunchConfig.leaderboardScoreRemainingAttempt,
      LEADERBOARD_SCORE_WEIGHTS.remainingAttempt,
    );
    assert.equal(
      defaultLaunchConfig.leaderboardScoreHint,
      LEADERBOARD_SCORE_WEIGHTS.hint,
    );
    assert.equal(
      defaultLaunchConfig.leaderboardScoreTimeBonusBase,
      LEADERBOARD_SCORE_WEIGHTS.timeBonusBase,
    );
    assert.equal(
      defaultLaunchConfig.leaderboardScoreTimeDecayPerSecond,
      LEADERBOARD_SCORE_WEIGHTS.timeDecayPerSecond,
    );
  });

  it("Remote Config 기본값 맵에 5개 키가 상수값으로 등록된다", () => {
    const defaults = getLaunchConfigDefaultsForRemoteConfig();
    assert.equal(
      defaults[launchConfigKeys.leaderboardScoreCompletedWord],
      LEADERBOARD_SCORE_WEIGHTS.completedWord,
    );
    assert.equal(
      defaults[launchConfigKeys.leaderboardScoreRemainingAttempt],
      LEADERBOARD_SCORE_WEIGHTS.remainingAttempt,
    );
    assert.equal(
      defaults[launchConfigKeys.leaderboardScoreHint],
      LEADERBOARD_SCORE_WEIGHTS.hint,
    );
    assert.equal(
      defaults[launchConfigKeys.leaderboardScoreTimeBonusBase],
      LEADERBOARD_SCORE_WEIGHTS.timeBonusBase,
    );
    assert.equal(
      defaults[launchConfigKeys.leaderboardScoreTimeDecayPerSecond],
      LEADERBOARD_SCORE_WEIGHTS.timeDecayPerSecond,
    );
  });

  it("미설정(빈 값)이면 기본 상수로 폴백한다", () => {
    const config = normalizeLaunchConfig({});
    assert.equal(
      config.leaderboardScoreCompletedWord,
      LEADERBOARD_SCORE_WEIGHTS.completedWord,
    );
    assert.equal(
      config.leaderboardScoreTimeDecayPerSecond,
      LEADERBOARD_SCORE_WEIGHTS.timeDecayPerSecond,
    );
  });

  it("원격 값으로 가중치를 조정할 수 있다", () => {
    const config = normalizeLaunchConfig({
      leaderboardScoreCompletedWord: 1500,
      leaderboardScoreRemainingAttempt: 300,
      leaderboardScoreHint: 120,
      leaderboardScoreTimeBonusBase: 800,
      leaderboardScoreTimeDecayPerSecond: 2,
    });
    assert.equal(config.leaderboardScoreCompletedWord, 1500);
    assert.equal(config.leaderboardScoreRemainingAttempt, 300);
    assert.equal(config.leaderboardScoreHint, 120);
    assert.equal(config.leaderboardScoreTimeBonusBase, 800);
    assert.equal(config.leaderboardScoreTimeDecayPerSecond, 2);
  });

  it("음수/NaN은 기본값·범위로 방어한다(가짜 점수 방지)", () => {
    const negative = normalizeLaunchConfig({
      leaderboardScoreCompletedWord: -100,
      leaderboardScoreTimeDecayPerSecond: -5,
    });
    // 하한 0으로 클램프.
    assert.equal(negative.leaderboardScoreCompletedWord, 0);
    assert.equal(negative.leaderboardScoreTimeDecayPerSecond, 0);

    const nan = normalizeLaunchConfig({
      leaderboardScoreHint: Number.NaN,
    });
    // 비유한 값은 기본값으로 폴백.
    assert.equal(nan.leaderboardScoreHint, LEADERBOARD_SCORE_WEIGHTS.hint);
  });

  it("상한을 넘으면 클램프된다", () => {
    const config = normalizeLaunchConfig({
      leaderboardScoreCompletedWord: 9_999_999,
      leaderboardScoreTimeDecayPerSecond: 9_999_999,
    });
    assert.equal(config.leaderboardScoreCompletedWord, 1_000_000);
    assert.equal(config.leaderboardScoreTimeDecayPerSecond, 100_000);
  });
});

describe("launchConfig: 막힘 힌트 노출 상한·쿨다운(#254, #265)", () => {
  it("기본값: 퍼즐 당 2회 노출, 첫 닫기로 종료, 180초 쿨다운", () => {
    assert.equal(defaultLaunchConfig.stuckHintMaxPromptsPerAttempt, 2);
    assert.equal(defaultLaunchConfig.stuckHintMaxDismissals, 1);
    assert.equal(defaultLaunchConfig.stuckHintDismissBackoffFactor, 2);
    assert.equal(defaultLaunchConfig.stuckHintMinCooldownMs, 180000);
  });

  it("Remote Config 기본값 맵과 키 이름이 반영된다", () => {
    const defaults = getLaunchConfigDefaultsForRemoteConfig();
    assert.equal(defaults[launchConfigKeys.stuckHintMaxPromptsPerAttempt], 2);
    assert.equal(defaults[launchConfigKeys.stuckHintMaxDismissals], 1);
    assert.equal(defaults[launchConfigKeys.stuckHintDismissBackoffFactor], 2);
    assert.equal(defaults[launchConfigKeys.stuckHintMinCooldownMs], 180000);
    assert.equal(
      launchConfigKeys.stuckHintMaxPromptsPerAttempt,
      "stuck_hint_max_prompts_per_attempt",
    );
    assert.equal(
      launchConfigKeys.stuckHintMaxDismissals,
      "stuck_hint_max_dismissals",
    );
    assert.equal(
      launchConfigKeys.stuckHintDismissBackoffFactor,
      "stuck_hint_dismiss_backoff_factor",
    );
    assert.equal(
      launchConfigKeys.stuckHintMinCooldownMs,
      "stuck_hint_min_cooldown_ms",
    );
  });

  it("원격 값으로 조정되고 범위를 벗어나면 클램프된다", () => {
    const config = normalizeLaunchConfig({
      stuckHintMaxPromptsPerAttempt: 5,
      stuckHintMaxDismissals: 1,
      stuckHintDismissBackoffFactor: 3,
      stuckHintMinCooldownMs: 240000,
    });
    assert.equal(config.stuckHintMaxPromptsPerAttempt, 5);
    assert.equal(config.stuckHintMaxDismissals, 1);
    assert.equal(config.stuckHintDismissBackoffFactor, 3);
    assert.equal(config.stuckHintMinCooldownMs, 240000);

    const clamped = normalizeLaunchConfig({
      stuckHintMaxPromptsPerAttempt: 999,
      stuckHintDismissBackoffFactor: 999,
      stuckHintMinCooldownMs: 9999999,
    });
    assert.equal(clamped.stuckHintMaxPromptsPerAttempt, 20);
    assert.equal(clamped.stuckHintDismissBackoffFactor, 10);
    assert.equal(clamped.stuckHintMinCooldownMs, 3600000);
  });

  it("값이 없으면 기본값으로 폴백한다", () => {
    const config = normalizeLaunchConfig({});
    assert.equal(config.stuckHintMaxPromptsPerAttempt, 2);
    assert.equal(config.stuckHintMaxDismissals, 1);
    assert.equal(config.stuckHintDismissBackoffFactor, 2);
    assert.equal(config.stuckHintMinCooldownMs, 180000);
  });
});

describe("launchConfig: 난이도별 기본 힌트 크레딧(#251)", () => {
  it("기본값이 uiPolicy 난이도별 코드 기본값과 일치한다(회귀 없음)", () => {
    assert.equal(defaultLaunchConfig.defaultHintCredits, 3);
    assert.equal(
      defaultLaunchConfig.defaultHintCreditsEasy,
      DEFAULT_HINT_CREDITS_BY_DIFFICULTY.easy,
    );
    assert.equal(
      defaultLaunchConfig.defaultHintCreditsHard,
      DEFAULT_HINT_CREDITS_BY_DIFFICULTY.hard,
    );
  });

  it("resolveDefaultHintCredits 는 난이도에 맞는 값을 돌려준다", () => {
    const config = normalizeLaunchConfig({});
    assert.equal(resolveDefaultHintCredits(config, "easy"), 2);
    assert.equal(resolveDefaultHintCredits(config, "normal"), 3);
    assert.equal(resolveDefaultHintCredits(config, "hard"), 5);
  });

  it("난이도가 없거나 비정상이면 base(defaultHintCredits)로 폴백한다", () => {
    const config = normalizeLaunchConfig({});
    assert.equal(resolveDefaultHintCredits(config, undefined), 3);
    assert.equal(resolveDefaultHintCredits(config, null), 3);
    assert.equal(resolveDefaultHintCredits(config, "legendary"), 3);
  });

  it("원격 값으로 난이도별 기본 크레딧을 조정할 수 있다", () => {
    const config = normalizeLaunchConfig({
      defaultHintCreditsEasy: 1,
      defaultHintCreditsHard: 8,
    });
    assert.equal(resolveDefaultHintCredits(config, "easy"), 1);
    assert.equal(resolveDefaultHintCredits(config, "hard"), 8);
    // base(normal)는 영향 없이 유지된다.
    assert.equal(resolveDefaultHintCredits(config, "normal"), 3);
  });

  it("미설정(빈 값)이면 난이도별 기본값으로 폴백한다", () => {
    const config = normalizeLaunchConfig({});
    assert.equal(config.defaultHintCreditsEasy, 2);
    assert.equal(config.defaultHintCreditsHard, 5);
  });

  it("0~20 범위를 벗어나면 클램프한다", () => {
    assert.equal(
      normalizeLaunchConfig({ defaultHintCreditsEasy: -3 })
        .defaultHintCreditsEasy,
      0,
    );
    assert.equal(
      normalizeLaunchConfig({ defaultHintCreditsHard: 999 })
        .defaultHintCreditsHard,
      20,
    );
    assert.equal(
      normalizeLaunchConfig({ defaultHintCreditsEasy: Number.NaN })
        .defaultHintCreditsEasy,
      2,
    );
  });

  it("Remote Config 키·기본값 맵에 영문 스네이크 키로 반영된다", () => {
    assert.equal(
      launchConfigKeys.defaultHintCreditsEasy,
      "default_hint_credits_easy",
    );
    assert.equal(
      launchConfigKeys.defaultHintCreditsHard,
      "default_hint_credits_hard",
    );
    const defaults = getLaunchConfigDefaultsForRemoteConfig();
    assert.equal(defaults[launchConfigKeys.defaultHintCreditsEasy], 2);
    assert.equal(defaults[launchConfigKeys.defaultHintCreditsHard], 5);
  });
});

describe("launchConfig: 날짜별 공용 힌트", () => {
  it("무료 3개와 광고 보상 1개가 공통 기본값이다", () => {
    assert.equal(
      defaultLaunchConfig.dailyFreeHintCredits,
      DEFAULT_DAILY_FREE_HINT_CREDITS,
    );
    assert.equal(
      defaultLaunchConfig.rewardedHintCredits,
      DEFAULT_REWARDED_HINT_CREDITS,
    );
  });

  it("Remote Config 키와 기본값 맵에 반영된다", () => {
    const defaults = getLaunchConfigDefaultsForRemoteConfig();

    assert.equal(
      launchConfigKeys.dailyFreeHintCredits,
      "daily_free_hint_credits",
    );
    assert.equal(defaults[launchConfigKeys.dailyFreeHintCredits], 3);
    assert.equal(defaults[launchConfigKeys.rewardedHintCredits], 1);
  });

  it("일일 무료 개수는 0~20 범위로 정규화한다", () => {
    assert.equal(
      normalizeLaunchConfig({ dailyFreeHintCredits: -1 }).dailyFreeHintCredits,
      0,
    );
    assert.equal(
      normalizeLaunchConfig({ dailyFreeHintCredits: 99 }).dailyFreeHintCredits,
      20,
    );
  });
});

// 온보딩 난이도 램프 Remote Config 플래그 수락 조건(#291). it 이름의 AC-N 은 이슈
// 인수조건 번호와 대응한다.
describe("온보딩 난이도 램프 Remote Config 플래그 수락 조건 (#291)", () => {
  it("AC-3: 기본값은 true이고 Remote Config의 명시적 false로 끌 수 있다", () => {
    // 첫 easy 완료 후 easy 1판 추가를 기본 활성화한다.
    assert.equal(defaultLaunchConfig.onboardingDifficultyRampEnabled, true);
    // Remote Config 기본값 맵에도 활성으로 반영.
    const defaults = getLaunchConfigDefaultsForRemoteConfig();
    assert.equal(
      defaults[launchConfigKeys.onboardingDifficultyRampEnabled],
      true,
    );
    // 영문 스네이크 키.
    assert.equal(
      launchConfigKeys.onboardingDifficultyRampEnabled,
      "onboarding_difficulty_ramp_enabled",
    );
    // 명시적으로 false면 끌 수 있다(원격 킬스위치).
    assert.equal(
      normalizeLaunchConfig({ onboardingDifficultyRampEnabled: false })
        .onboardingDifficultyRampEnabled,
      false,
    );
    // 값이 없으면 기본값(활성)으로 폴백.
    assert.equal(
      normalizeLaunchConfig({}).onboardingDifficultyRampEnabled,
      true,
    );
    // Remote Config 기본값 맵에 키가 실제로 존재한다(원격 노출 보장).
    assert.ok(
      launchConfigKeys.onboardingDifficultyRampEnabled in
        getLaunchConfigDefaultsForRemoteConfig(),
    );
  });

  it("AC-4: 플래그 기본값·정규화 신규 케이스로 launchConfig 테스트를 보강한다", () => {
    // 온보딩 램프 플래그가 정규화 결과에 존재하는지(신규 케이스 앵커).
    assert.equal(
      typeof normalizeLaunchConfig({}).onboardingDifficultyRampEnabled,
      "boolean",
    );
  });
});
