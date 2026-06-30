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
