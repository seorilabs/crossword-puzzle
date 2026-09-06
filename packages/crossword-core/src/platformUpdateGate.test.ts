import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateUpdateGate,
  type PlatformUpdateGateConfig,
  type UpdateGateState,
} from "./platformUpdateGate.ts";

function fakeConfig(
  state: UpdateGateState,
  shouldPrompt: boolean,
): PlatformUpdateGateConfig & { shouldPromptCalls: UpdateGateState[] } {
  const shouldPromptCalls: UpdateGateState[] = [];
  return {
    shouldPromptCalls,
    gate: () => state,
    shouldPrompt: async (s) => {
      shouldPromptCalls.push(s);
      return shouldPrompt;
    },
    markPrompted: async () => {},
  };
}

describe("#390 업데이트 게이트 판정", () => {
  it("ok면 아무것도 띄우지 않고 이력 저장소를 조회하지 않는다", async () => {
    const config = fakeConfig({ kind: "ok" }, true);

    assert.equal(await evaluateUpdateGate(config), null);
    assert.equal(config.shouldPromptCalls.length, 0);
  });

  it("recommended면 shouldPrompt 결과를 그대로 따른다", async () => {
    const state: UpdateGateState = {
      kind: "recommended",
      message: "새 버전이 나왔어요",
      updateUrl: "https://play.google.com/store/apps/details?id=x",
    };

    const shown = fakeConfig(state, true);
    assert.deepEqual(await evaluateUpdateGate(shown), state);

    const hidden = fakeConfig(state, false);
    assert.equal(await evaluateUpdateGate(hidden), null);
  });

  it("required면 shouldPrompt를 묻되 그 결과를 따른다", async () => {
    const state: UpdateGateState = {
      kind: "required",
      message: "업데이트가 필요해요",
    };
    const config = fakeConfig(state, true);

    assert.deepEqual(await evaluateUpdateGate(config), state);
    assert.deepEqual(config.shouldPromptCalls, [state]);
  });

  it("maintenance면 뜬다", async () => {
    const state: UpdateGateState = {
      kind: "maintenance",
      message: "지금 점검 중이에요",
    };
    const config = fakeConfig(state, true);

    assert.deepEqual(await evaluateUpdateGate(config), state);
  });
});
