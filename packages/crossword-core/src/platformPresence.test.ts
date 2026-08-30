import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createFailOpenPlatformPresenceLifecycle,
  PLATFORM_PRESENCE_ENABLED,
} from "./platformPresence.ts";

describe("Platform Presence 공통 정책", () => {
  it("중앙 canary 전 기본 opt-in은 false다", () => {
    assert.equal(PLATFORM_PRESENCE_ENABLED, false);
  });

  it("start, stop, resume 오류를 모두 흡수하고 foreground 복귀 시 재시작한다", () => {
    const calls: string[] = [];
    const lifecycle = createFailOpenPlatformPresenceLifecycle({
      start() {
        calls.push("start");
        throw new Error("DNS failure");
      },
      stop() {
        calls.push("stop");
        throw new Error("TLS failure");
      },
      resume() {
        calls.push("resume");
        throw new Error("timeout");
      },
    });

    assert.doesNotThrow(() => lifecycle.start());
    assert.doesNotThrow(() => lifecycle.stop());
    assert.doesNotThrow(() => lifecycle.resume());
    assert.deepEqual(calls, ["start", "stop", "start", "resume"]);
  });
});
