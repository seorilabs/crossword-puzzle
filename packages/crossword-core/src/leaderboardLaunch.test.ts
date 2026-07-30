import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
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

  it("AC-4: 전략 문서에 현재 지표와 개방 결정을 기록한다", () => {
    const strategy = readFileSync(
      new URL("../../../docs/leaderboard-strategy.md", import.meta.url),
      "utf8",
    );

    assert.match(strategy, /완료율은 78\.0%\(128\/164\)/);
    assert.match(strategy, /D1은 약 10%/);
    assert.match(strategy, /D2는 2\.4%\(3\/126\)/);
    assert.match(strategy, /기본값을 `true`로 전환/);
    assert.match(strategy, /킬스위치/);
  });
});
