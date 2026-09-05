// AppsInToss 광고 어댑터의 순수 매핑 함수 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { mapFullScreenAdTraceEvent } from "./appsInTossAds.ts";

// [#385] AppsInToss SDK 원본 이벤트 → 통일 어휘(ad_stage/ad_result) 대응표를 고정한다.
describe("mapFullScreenAdTraceEvent", () => {
  it("load 단계는 항상 load/loaded로 대응한다", () => {
    assert.deepEqual(
      mapFullScreenAdTraceEvent({ phase: "load", type: "loaded" }),
      { ad_result: "loaded", ad_stage: "load" },
    );
  });

  it("show 단계의 requested는 request/requested로 대응한다", () => {
    assert.deepEqual(
      mapFullScreenAdTraceEvent({ phase: "show", type: "requested" }),
      { ad_result: "requested", ad_stage: "request" },
    );
  });

  it("show 단계의 show·impression은 모두 show/shown으로 대응한다", () => {
    assert.deepEqual(
      mapFullScreenAdTraceEvent({ phase: "show", type: "show" }),
      { ad_result: "shown", ad_stage: "show" },
    );
    assert.deepEqual(
      mapFullScreenAdTraceEvent({ phase: "show", type: "impression" }),
      { ad_result: "shown", ad_stage: "show" },
    );
  });

  it("show 단계의 clicked는 show/clicked로 대응한다", () => {
    assert.deepEqual(
      mapFullScreenAdTraceEvent({ phase: "show", type: "clicked" }),
      { ad_result: "clicked", ad_stage: "show" },
    );
  });

  it("show 단계의 userEarnedReward는 show/rewarded로 대응한다", () => {
    assert.deepEqual(
      mapFullScreenAdTraceEvent({ phase: "show", type: "userEarnedReward" }),
      { ad_result: "rewarded", ad_stage: "show" },
    );
  });

  it("show 단계의 dismissed는 show/dismissed로 대응한다", () => {
    assert.deepEqual(
      mapFullScreenAdTraceEvent({ phase: "show", type: "dismissed" }),
      { ad_result: "dismissed", ad_stage: "show" },
    );
  });

  it("show 단계의 failedToShow는 show/failed_to_show로 대응한다", () => {
    assert.deepEqual(
      mapFullScreenAdTraceEvent({ phase: "show", type: "failedToShow" }),
      { ad_result: "failed_to_show", ad_stage: "show" },
    );
  });

  it("error 단계는 원본 type을 그대로 ad_result로 쓴다(어휘가 이미 일치)", () => {
    assert.deepEqual(
      mapFullScreenAdTraceEvent({ phase: "error", type: "load_error" }),
      { ad_result: "load_error", ad_stage: "error" },
    );
    assert.deepEqual(
      mapFullScreenAdTraceEvent({ phase: "error", type: "show_error" }),
      { ad_result: "show_error", ad_stage: "error" },
    );
    assert.deepEqual(
      mapFullScreenAdTraceEvent({ phase: "error", type: "load_timeout" }),
      { ad_result: "load_timeout", ad_stage: "error" },
    );
    assert.deepEqual(
      mapFullScreenAdTraceEvent({ phase: "error", type: "show_timeout" }),
      { ad_result: "show_timeout", ad_stage: "error" },
    );
  });
});
