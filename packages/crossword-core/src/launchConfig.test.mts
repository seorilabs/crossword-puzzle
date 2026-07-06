import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  defaultLaunchConfig,
  getLaunchConfigDefaultsForRemoteConfig,
  launchConfigKeys,
  normalizeLaunchConfig,
} from "./launchConfig.ts";
import { LEADERBOARD_SCORE_WEIGHTS } from "./leaderboard.ts";
import { DAILY_ATTEMPT_LIMIT } from "./uiPolicy.ts";

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

describe("launchConfig: rewardedExtraAttempt 게이트(#204)", () => {
  it("소진 구제 리워드 광고 CTA가 기본 비활성(false)이다", () => {
    assert.equal(defaultLaunchConfig.rewardedExtraAttemptEnabled, false);
    assert.equal(normalizeLaunchConfig({}).rewardedExtraAttemptEnabled, false);
  });

  it("일일 충전 상한 기본값은 1회다", () => {
    assert.equal(defaultLaunchConfig.rewardedExtraAttemptDailyCap, 1);
    assert.equal(normalizeLaunchConfig({}).rewardedExtraAttemptDailyCap, 1);
  });

  it("Remote Config 키·기본값 맵에 두 키가 영문 스네이크 키로 반영된다", () => {
    assert.equal(
      launchConfigKeys.rewardedExtraAttemptEnabled,
      "rewarded_extra_attempt_enabled",
    );
    assert.equal(
      launchConfigKeys.rewardedExtraAttemptDailyCap,
      "rewarded_extra_attempt_daily_cap",
    );
    const defaults = getLaunchConfigDefaultsForRemoteConfig();
    assert.equal(defaults[launchConfigKeys.rewardedExtraAttemptEnabled], false);
    assert.equal(defaults[launchConfigKeys.rewardedExtraAttemptDailyCap], 1);
  });

  it("Remote Config에서 명시적으로 켜고 상한을 조정할 수 있다", () => {
    const config = normalizeLaunchConfig({
      rewardedExtraAttemptEnabled: true,
      rewardedExtraAttemptDailyCap: 3,
    });
    assert.equal(config.rewardedExtraAttemptEnabled, true);
    assert.equal(config.rewardedExtraAttemptDailyCap, 3);
  });

  it("상한은 1~5로 클램프된다(0/음수/과대값 방어)", () => {
    assert.equal(
      normalizeLaunchConfig({ rewardedExtraAttemptDailyCap: 0 })
        .rewardedExtraAttemptDailyCap,
      1,
    );
    assert.equal(
      normalizeLaunchConfig({ rewardedExtraAttemptDailyCap: 99 })
        .rewardedExtraAttemptDailyCap,
      5,
    );
    assert.equal(
      normalizeLaunchConfig({ rewardedExtraAttemptDailyCap: Number.NaN })
        .rewardedExtraAttemptDailyCap,
      1,
    );
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
      normalizeLaunchConfig({ dailyAttemptLimit: Number.NaN }).dailyAttemptLimit,
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
    assert.equal(
      nan.leaderboardScoreHint,
      LEADERBOARD_SCORE_WEIGHTS.hint,
    );
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

describe("launchConfig: 막힘 힌트 노출 상한·백오프(#254)", () => {
  it("기본값: attempt 당 3회 노출, 닫기 2회, 백오프 ×2", () => {
    assert.equal(defaultLaunchConfig.stuckHintMaxPromptsPerAttempt, 3);
    assert.equal(defaultLaunchConfig.stuckHintMaxDismissals, 2);
    assert.equal(defaultLaunchConfig.stuckHintDismissBackoffFactor, 2);
  });

  it("Remote Config 기본값 맵과 키 이름이 반영된다", () => {
    const defaults = getLaunchConfigDefaultsForRemoteConfig();
    assert.equal(
      defaults[launchConfigKeys.stuckHintMaxPromptsPerAttempt],
      3,
    );
    assert.equal(defaults[launchConfigKeys.stuckHintMaxDismissals], 2);
    assert.equal(defaults[launchConfigKeys.stuckHintDismissBackoffFactor], 2);
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
  });

  it("원격 값으로 조정되고 범위를 벗어나면 클램프된다", () => {
    const config = normalizeLaunchConfig({
      stuckHintMaxPromptsPerAttempt: 5,
      stuckHintMaxDismissals: 1,
      stuckHintDismissBackoffFactor: 3,
    });
    assert.equal(config.stuckHintMaxPromptsPerAttempt, 5);
    assert.equal(config.stuckHintMaxDismissals, 1);
    assert.equal(config.stuckHintDismissBackoffFactor, 3);

    const clamped = normalizeLaunchConfig({
      stuckHintMaxPromptsPerAttempt: 999,
      stuckHintDismissBackoffFactor: 999,
    });
    assert.equal(clamped.stuckHintMaxPromptsPerAttempt, 20);
    assert.equal(clamped.stuckHintDismissBackoffFactor, 10);
  });

  it("값이 없으면 기본값으로 폴백한다", () => {
    const config = normalizeLaunchConfig({});
    assert.equal(config.stuckHintMaxPromptsPerAttempt, 3);
    assert.equal(config.stuckHintMaxDismissals, 2);
    assert.equal(config.stuckHintDismissBackoffFactor, 2);
  });
});
