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

  it("AC-6: Presence token 호스트를 ingest role 서비스로 고정한다", () => {
    // POST /v1/presence/token 라우트는 ingest role에만 등록돼 있다(server/cmd/platform/main.go).
    // ingestBaseUrl을 주지 않으면 SDK가 baseUrl(platform-api)로 보내고 "404 page not
    // found"를 받는데, Presence는 fail-open이라 앱이 정상으로 보인 채 조용히 꺼진다.
    // 2026-09-19에 실제로 이 상태로 배포돼 heartbeat가 한 건도 나가지 않았다.
    const core = read("packages/crossword-core/src/platformAuth.ts");
    assert.match(core, /PLATFORM_INGEST_BASE_URL\s*=/);
    assert.match(core, /platform-ingest-[0-9]+\.[a-z0-9-]+\.run\.app/);

    for (const path of [
      "src/adapters/platformAuth.ts",
      "apps/mobile/platformAuth.ts",
    ]) {
      const adapter = read(path);
      assert.match(
        adapter,
        /ingestBaseUrl:\s*PLATFORM_INGEST_BASE_URL/,
        `${path}는 presence token 호스트를 ingest로 줘야 한다`,
      );
    }
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
