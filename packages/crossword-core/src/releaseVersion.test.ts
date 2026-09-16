// #293 인수조건(AC-1~AC-4)을 이슈 원문 그대로의 테스트명으로 직접 검증한다.
// release_version 계측: 패키지/태그 유래 버전 상수 주입·공통 경로 자동 첨부·값 형식·
// 싱크 통과 이벤트 포함을 core 실행 경로로 고정한다.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import {
  APP_MARKET_PARAM_KEY,
  createAnalyticsDimensionedSink,
  RELEASE_VERSION_PARAM_KEY,
  RUNTIME_PLATFORM_PARAM_KEY,
  resolveReleaseVersion,
  UNKNOWN_RELEASE_VERSION,
  type CompactTelemetryParams,
} from "./releaseVersion.ts";

// 마켓 adapter의 AnalyticsEvent를 대신하는 최소 이벤트 형태(params를 가진다).
type TestEvent = {
  kind: "screen" | "impression" | "click" | "game";
  name: string;
  params: CompactTelemetryParams;
};

function createRecordingSink() {
  const seen: TestEvent[] = [];
  return {
    sink: { id: "recorder", track: (event: TestEvent) => seen.push(event) },
    seen,
  };
}

function readRepoFile(relativePath: string): string {
  return readFileSync(
    new URL(`../../../${relativePath}`, import.meta.url),
    "utf8",
  );
}

describe("#293 release_version 계측 인수조건", () => {
  it("AC-1: 빌드 산출물에 앱 버전이 패키지/태그 유래 상수로 주입됨", () => {
    // 태그 유래 값(배포 주입)을 우선 쓰고, 없으면 패키지 유래 상수로 폴백한다.
    assert.equal(
      resolveReleaseVersion("0.1.2", "v0.1.2", "0.1.0"),
      "0.1.2",
      "태그 유래 버전이 우선한다",
    );
    assert.equal(
      resolveReleaseVersion(undefined, undefined, "0.1.0"),
      "0.1.0",
      "태그 유래 값이 없으면 패키지 유래 상수로 폴백한다",
    );

    // 빌드 주입 배선: vite define으로 패키지 버전을 __APP_VERSION__ 상수로 굽고,
    // 웹 adapter는 태그 유래 VITE_APP_VERSION을, 모바일 adapter는 패키지 버전을 읽는다.
    const viteConfig = readRepoFile("vite.config.ts");
    assert.match(viteConfig, /__APP_VERSION__/);
    assert.match(viteConfig, /packageVersion/);

    const webSinks = readRepoFile("src/adapters/analyticsSinks.ts");
    assert.match(webSinks, /VITE_APP_VERSION/);
    assert.match(webSinks, /__APP_VERSION__/);

    const mobileSinks = readRepoFile("apps/mobile/analyticsSinks.ts");
    assert.match(mobileSinks, /packageVersion/);
  });

  it("AC-2: 모든 이벤트에 release_version 파라미터가 공통 경로에서 자동 첨부됨 (개별 호출 수정 불필요)", () => {
    const { sink, seen } = createRecordingSink();
    const dimensioned = createAnalyticsDimensionedSink(sink, {
      appMarket: "apps_in_toss",
      runtimePlatform: "web",
      releaseVersion: "0.1.0",
    });

    // 네 이벤트 종류 모두 sink 데코레이터(공통 경로) 통과 시 release_version이 실린다.
    for (const kind of ["screen", "impression", "click", "game"] as const) {
      dimensioned.track({ kind, name: `event_${kind}`, params: {} });
    }
    assert.equal(seen.length, 4);
    for (const event of seen) {
      assert.equal(event.params[RELEASE_VERSION_PARAM_KEY], "0.1.0");
      assert.equal(event.params[APP_MARKET_PARAM_KEY], "apps_in_toss");
      assert.equal(event.params[RUNTIME_PLATFORM_PARAM_KEY], "web");
    }

    // 배선: 두 adapter 모두 sink 레지스트리를 표준 차원 데코레이터로 감싼다
    // (개별 emit 호출 수정 없이 공통 경로에서 첨부).
    const webSinks = readRepoFile("src/adapters/analyticsSinks.ts");
    const mobileSinks = readRepoFile("apps/mobile/analyticsSinks.ts");
    assert.match(webSinks, /createAnalyticsDimensionedSink\(/);
    assert.match(mobileSinks, /createAnalyticsDimensionedSink\(/);
  });

  it("AC-3: 버전 값 형식이 docs/release-versioning.md 및 happy-farm 관례와 일치", () => {
    // docs versionName 규칙: 'v'를 뺀 semver(예: 0.1.1). 접두사 제거·공백 정리.
    assert.equal(resolveReleaseVersion("v0.1.1"), "0.1.1");
    assert.equal(resolveReleaseVersion("0.2.0"), "0.2.0");
    assert.equal(resolveReleaseVersion("  v1.2.3  "), "1.2.3");
    // prerelease/build 메타데이터도 허용한다.
    assert.equal(resolveReleaseVersion("1.2.3-rc.1"), "1.2.3-rc.1");
    // semver 형식이 아니면 다음 후보/미상 값으로 넘어간다(형식 보증).
    assert.equal(resolveReleaseVersion("nightly", "0.4.0"), "0.4.0");
    assert.equal(
      resolveReleaseVersion(undefined, null, ""),
      UNKNOWN_RELEASE_VERSION,
    );
  });

  it("AC-4: 단위 테스트: 싱크 통과 이벤트에 release_version 포함 검증", () => {
    const { sink, seen } = createRecordingSink();
    const dimensioned = createAnalyticsDimensionedSink(sink, {
      appMarket: "google_play",
      runtimePlatform: "android",
      releaseVersion: "0.1.0",
    });

    dimensioned.track({
      kind: "impression",
      name: "mission_complete",
      params: {
        app_market: "apps_in_toss",
        difficulty: "normal",
        release_version: "9.9.9",
        runtime_platform: "web",
      },
    });

    assert.equal(seen.length, 1);
    const delivered = seen[0];
    // release_version이 포함되고, 기존 파라미터도 보존된다.
    assert.equal(delivered.params[RELEASE_VERSION_PARAM_KEY], "0.1.0");
    assert.equal(delivered.params[APP_MARKET_PARAM_KEY], "google_play");
    assert.equal(delivered.params[RUNTIME_PLATFORM_PARAM_KEY], "android");
    assert.equal(delivered.params.difficulty, "normal");
    assert.equal(delivered.name, "mission_complete");
  });
});
