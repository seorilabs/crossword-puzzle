import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  defaultLaunchConfig,
  getLaunchConfigDefaultsForRemoteConfig,
  launchConfigKeys,
  normalizeLaunchConfig,
} from "./launchConfig.ts";

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
