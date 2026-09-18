import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PLATFORM_PRESENCE_ENABLED } from "./platformPresence.ts";

const read = (path: string) => readFileSync(path, "utf8");

describe("#356 Platform Presence Phase A 인수조건", () => {
  it("AC-1: SDK 0.5.0 exact dependency와 clean install/import 실행 경로를 고정한다", () => {
    const rootPackage = JSON.parse(read("package.json"));
    const mobilePackage = JSON.parse(read("apps/mobile/package.json"));
    const rootLock = JSON.parse(read("package-lock.json"));
    const mobileLock = JSON.parse(read("apps/mobile/package-lock.json"));
    const integrationTest = read("src/adapters/platformPresence.test.mts");

    assert.equal(rootPackage.dependencies["@seorilabs/platform-sdk"], "0.5.0");
    assert.equal(mobilePackage.dependencies["@seorilabs/platform-sdk"], "0.5.0");
    assert.equal(
      rootLock.packages["node_modules/@seorilabs/platform-sdk"].version,
      "0.5.0",
    );
    assert.equal(
      mobileLock.packages["node_modules/@seorilabs/platform-sdk"].version,
      "0.5.0",
    );
    assert.match(
      integrationTest,
      /import \{ createPlatform \} from "@seorilabs\/platform-sdk"/,
    );
  });

  it("AC-2: 활성 opt-in과 비활성 Presence 요청 0회를 직접 검증한다", () => {
    const integrationTest = read("src/adapters/platformPresence.test.mts");

    assert.equal(PLATFORM_PRESENCE_ENABLED, true);
    assert.match(integrationTest, /presenceEnabled: false/);
    assert.match(integrationTest, /assert\.equal\(requests, 0\)/);
  });

  it("AC-5: Web AIT와 Android iOS lifecycle 및 release parity 배선을 고정한다", () => {
    const webMain = read("src/main.tsx");
    const mobileIndex = read("apps/mobile/index.js");
    const webAdapter = read("src/adapters/platformAuth.ts");
    const mobileAdapter = read("apps/mobile/platformAuth.ts");
    const parityGate = read("scripts/check-release-parity.mjs");

    for (const marker of [
      "startPlatformPresence();",
      "stopPlatformPresence();",
      "resumePlatformPresence();",
    ]) {
      assert.match(webMain, new RegExp(marker.replace(/[();]/g, "\\$&")));
      assert.match(mobileIndex, new RegExp(marker.replace(/[();]/g, "\\$&")));
      assert.match(parityGate, new RegExp(marker.replace(/[();]/g, "\\$&")));
    }
    assert.match(webMain, /visibilitychange/);
    assert.match(mobileIndex, /AppState\.addEventListener/);
    assert.match(webAdapter, /platform: "ait"/);
    assert.match(mobileAdapter, /Platform\.OS === 'ios' \? 'ios' : 'android'/);
  });
});
