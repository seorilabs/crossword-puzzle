import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  REWARDED_HINT_AD_EVENT,
  trackRewardedHintAdTrace,
} from "./rewardedAdTrace.ts";
import type { TelemetryClient } from "./platformContracts.ts";

function createTelemetrySpy() {
  const calls: Array<{ name: string; params: unknown }> = [];
  const telemetry: Pick<TelemetryClient, "impression"> = {
    impression: (name, params) => {
      calls.push({ name, params });
    },
  };
  return { calls, telemetry };
}

describe("trackRewardedHintAdTrace (#385)", () => {
  it("항상 같은 이벤트 이름으로, 공통 context와 매핑된 stage/result/retry를 함께 싣는다", () => {
    const { calls, telemetry } = createTelemetrySpy();

    trackRewardedHintAdTrace(
      telemetry,
      { ad_result: "loaded", ad_stage: "load" },
      { ad_placement: "rewardedHint", puzzle_id: "26083000", retry: 0 },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.name, REWARDED_HINT_AD_EVENT);
    assert.deepEqual(calls[0]?.params, {
      ad_placement: "rewardedHint",
      puzzle_id: "26083000",
      retry: 0,
      ad_error_code: undefined,
      ad_result: "loaded",
      ad_stage: "load",
    });
  });

  it("ad_error_code가 있으면 그대로 실어 보낸다", () => {
    const { calls, telemetry } = createTelemetrySpy();

    trackRewardedHintAdTrace(
      telemetry,
      {
        ad_error_code: "googleMobileAds/no-fill",
        ad_result: "failed_to_show",
        ad_stage: "show",
      },
      { ad_placement: "rewardedHint", retry: 1 },
    );

    const params = calls[0]?.params as Record<string, unknown>;
    assert.equal(params.ad_error_code, "googleMobileAds/no-fill");
    assert.equal(params.retry, 1);
  });
});
