import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  defaultLaunchConfig,
  getLaunchConfigDefaultsForRemoteConfig,
  launchConfigKeys,
  normalizeLaunchConfig,
} from "./launchConfig.ts";

describe("리더보드 기본 개방과 Remote Config 킬스위치 (#325)", () => {
  it("AC-1: 코드와 Remote Config 기본값이 true다", () => {
    assert.equal(defaultLaunchConfig.leaderboardEnabled, true);
    assert.equal(
      getLaunchConfigDefaultsForRemoteConfig()[
        launchConfigKeys.leaderboardEnabled
      ],
      true,
    );
  });

  it("AC-1: 원격 false 오버라이드로 즉시 끌 수 있다", () => {
    assert.equal(
      normalizeLaunchConfig({ leaderboardEnabled: false }).leaderboardEnabled,
      false,
    );
  });
});
