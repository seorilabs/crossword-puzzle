import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPlatform } from "@seorilabs/platform-sdk";

const tokenResponse = () =>
  new Response(
    JSON.stringify({
      ok: true,
      result: {
        edgeUrl: "https://edge.vzyx.xyz",
        enabled: true,
        expiresIn: 300,
        heartbeatIntervalSeconds: 60,
        token: "opaque-test-token",
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("@seorilabs/platform-sdk Presence 0.4.0 통합", () => {
  it("presenceEnabled=false이면 token과 Edge 요청이 모두 0회다", async () => {
    let requests = 0;
    const platform = createPlatform({
      appId: "crossword-puzzle",
      baseUrl: "https://platform.test",
      fetchImpl: async () => {
        requests += 1;
        throw new Error("disabled Presence must not fetch");
      },
      presenceContext: { appVersion: "1.1.7", platform: "ait" },
      presenceEnabled: false,
    });

    assert.equal(platform.presence.start(), undefined);
    await nextTurn();
    platform.presence.stop();
    assert.equal(requests, 0);
  });

  it("활성 상태의 timeout, 5xx, DNS, TLS 실패가 호출 흐름으로 전파되지 않는다", async () => {
    const failures = [
      () => Promise.reject(new Error("timeout")),
      () => Promise.resolve(new Response(null, { status: 503 })),
      () => Promise.reject(new Error("getaddrinfo ENOTFOUND")),
      () => Promise.reject(new Error("TLS handshake failed")),
    ];

    for (const failHeartbeat of failures) {
      let requests = 0;
      const platform = createPlatform({
        appId: "crossword-puzzle",
        baseUrl: "https://platform.test",
        fetchImpl: async () => {
          requests += 1;
          return requests === 1 ? tokenResponse() : failHeartbeat();
        },
        presenceContext: { appVersion: "1.1.7", platform: "android" },
        presenceEnabled: true,
      });

      assert.equal(platform.presence.start(), undefined);
      await nextTurn();
      await nextTurn();
      platform.presence.stop();
      assert.equal(requests, 2);
    }
  });
});
