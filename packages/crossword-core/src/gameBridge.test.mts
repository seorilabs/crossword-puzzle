import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  decodeGameBridgeMessage,
  GAME_BRIDGE_VERSION,
  GameBridgeCoordinator,
  type GameBridgeCapability,
  type GameBridgeHandshakeAckMessage,
  type GameBridgeHandshakeMessage,
  type GameBridgeMessage,
  type GameBridgeRequestMessage,
  type GameBridgeResponse,
  type GameBridgeTimer,
} from "./gameBridge.ts";

let fixtureId = 0;

function nextId(prefix: string): string {
  fixtureId += 1;
  return `${prefix}-${fixtureId}`;
}

function handshake(
  role: "game" | "host",
  sessionId: string,
  capabilities: readonly GameBridgeCapability[],
): GameBridgeHandshakeMessage {
  return {
    bridgeVersion: GAME_BRIDGE_VERSION,
    kind: "handshake",
    messageId: nextId("handshake"),
    sessionId,
    timestamp: 1,
    role,
    capabilities,
  };
}

function handshakeAck(
  request: GameBridgeHandshakeMessage,
  role: "game" | "host",
  capabilities: readonly GameBridgeCapability[],
): GameBridgeHandshakeAckMessage {
  return {
    bridgeVersion: GAME_BRIDGE_VERSION,
    kind: "handshake-ack",
    messageId: nextId("handshake-ack"),
    sessionId: request.sessionId,
    timestamp: 2,
    requestId: request.messageId,
    role,
    status: "result",
    negotiatedCapabilities: capabilities,
  };
}

function storageSetRequest(input: {
  messageId: string;
  sessionId?: string;
  transactionId?: string;
  value?: unknown;
}): GameBridgeRequestMessage<"storage.set"> {
  return {
    bridgeVersion: GAME_BRIDGE_VERSION,
    kind: "request",
    messageId: input.messageId,
    sessionId: input.sessionId ?? "session-1",
    timestamp: 3,
    method: "storage.set",
    payload: {
      key: "save/current",
      schemaVersion: "save-v2",
      value: (input.value ?? { progress: 1 }) as never,
      transactionId: input.transactionId ?? "save-tx-1",
    },
  };
}

class ManualTimer implements GameBridgeTimer {
  #sequence = 0;
  readonly callbacks = new Map<number, () => void>();

  set(callback: () => void): number {
    this.#sequence += 1;
    this.callbacks.set(this.#sequence, callback);
    return this.#sequence;
  }

  clear(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }

  fireAll(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback());
  }
}

async function readyGameCoordinator(input?: {
  capabilities?: readonly GameBridgeCapability[];
  timer?: GameBridgeTimer;
}) {
  const sent: GameBridgeMessage[] = [];
  const capabilities = input?.capabilities ?? ["storage"];
  const coordinator = new GameBridgeCoordinator({
    role: "game",
    capabilities,
    transport: {
      send(message) {
        sent.push(message);
      },
    },
    timer: input?.timer,
  });
  const opening = await coordinator.startSession("session-1");
  const accepted = await coordinator.receive(
    handshakeAck(opening, "host", capabilities),
  );
  assert.deepEqual(accepted, { accepted: true, reason: "accepted" });
  assert.equal(coordinator.getSnapshot().state, "ready");
  return { coordinator, sent };
}

describe("game_bridge_v1 runtime contract", () => {
  test("version과 capability handshake 전에는 command를 받지 않는다", async () => {
    const sent: GameBridgeMessage[] = [];
    const host = new GameBridgeCoordinator({
      role: "host",
      capabilities: ["storage", "analytics", "lifecycle"],
      transport: { send: (message) => void sent.push(message) },
    });

    const beforeHandshake = await host.receive(
      storageSetRequest({ messageId: "request-before-handshake" }),
    );
    assert.deepEqual(beforeHandshake, {
      accepted: false,
      reason: "handshake-required",
    });

    const opening = handshake("game", "session-1", ["storage", "ad"]);
    assert.deepEqual(await host.receive(opening), {
      accepted: true,
      reason: "accepted",
    });
    assert.deepEqual(host.getSnapshot(), {
      state: "ready",
      role: "host",
      sessionId: "session-1",
      negotiatedCapabilities: ["storage"],
    });
    const ack = sent[0];
    assert.equal(ack?.kind, "handshake-ack");
    if (ack?.kind === "handshake-ack") {
      assert.equal(ack.requestId, opening.messageId);
      assert.deepEqual(ack.negotiatedCapabilities, ["storage"]);
    }

    assert.deepEqual(
      decodeGameBridgeMessage({
        ...opening,
        bridgeVersion: "game_bridge_v0",
      }),
      { ok: false, reason: "unsupported-version" },
    );
  });

  test("allowlist 밖 method, 방향 위반, 잘못된 payload와 초과 크기를 거부한다", async () => {
    const sent: GameBridgeMessage[] = [];
    const host = new GameBridgeCoordinator({
      role: "host",
      capabilities: ["storage", "lifecycle"],
      transport: { send: (message) => void sent.push(message) },
    });
    await host.receive(
      handshake("game", "session-1", ["storage", "lifecycle"]),
    );
    sent.length = 0;

    const unknownMethod = decodeGameBridgeMessage({
      ...storageSetRequest({ messageId: "unknown-method" }),
      method: "device.exec",
    });
    assert.deepEqual(unknownMethod, { ok: false, reason: "invalid-payload" });

    const extraField = decodeGameBridgeMessage({
      ...storageSetRequest({ messageId: "extra-field" }),
      payload: {
        ...storageSetRequest({ messageId: "source" }).payload,
        secret: "must-not-pass",
      },
    });
    assert.deepEqual(extraField, { ok: false, reason: "invalid-payload" });

    const wrongDirection: GameBridgeRequestMessage<"app.pause"> = {
      bridgeVersion: GAME_BRIDGE_VERSION,
      kind: "request",
      messageId: "wrong-direction",
      sessionId: "session-1",
      timestamp: 4,
      method: "app.pause",
      payload: { timestamp: 4 },
    };
    assert.deepEqual(await host.receive(wrongDirection), {
      accepted: false,
      reason: "method-not-allowed",
    });
    assert.equal(sent[0]?.kind, "response");
    if (sent[0]?.kind === "response") {
      assert.equal(sent[0].status, "error");
      if (sent[0].status === "error") {
        assert.equal(sent[0].error.code, "method-not-allowed");
      }
    }

    const oversized = decodeGameBridgeMessage(
      storageSetRequest({
        messageId: "oversized",
        value: "x".repeat(2_000),
      }),
      512,
    );
    assert.deepEqual(oversized, { ok: false, reason: "invalid-message" });

    const multibyte = storageSetRequest({
      messageId: "multibyte-size",
      value: "가",
    });
    assert.deepEqual(
      decodeGameBridgeMessage(multibyte, JSON.stringify(multibyte).length),
      { ok: false, reason: "invalid-message" },
    );
  });

  test("storage·analytics·ad·haptic·notification·runtime·lifecycle·config·locale·navigation payload schema를 모두 검증한다", () => {
    const requests: readonly GameBridgeRequestMessage[] = [
      {
        bridgeVersion: GAME_BRIDGE_VERSION,
        kind: "request",
        messageId: "storage-get",
        sessionId: "schema-session",
        timestamp: 1,
        method: "storage.get",
        payload: { key: "save/current", schemaVersion: "save-v2" },
      },
      storageSetRequest({
        messageId: "storage-set",
        sessionId: "schema-session",
      }),
      {
        bridgeVersion: GAME_BRIDGE_VERSION,
        kind: "request",
        messageId: "storage-remove",
        sessionId: "schema-session",
        timestamp: 1,
        method: "storage.remove",
        payload: {
          key: "save/journal",
          schemaVersion: "save-v2",
          transactionId: "storage-remove-1",
        },
      },
      {
        bridgeVersion: GAME_BRIDGE_VERSION,
        kind: "request",
        messageId: "analytics-log",
        sessionId: "schema-session",
        timestamp: 1,
        method: "analytics.log",
        payload: {
          event: "game_puzzle_start",
          params: { schema_version: 2, content_locale: "ko-KR" },
          eventId: "event-id-1",
        },
      },
      {
        bridgeVersion: GAME_BRIDGE_VERSION,
        kind: "request",
        messageId: "ad-load",
        sessionId: "schema-session",
        timestamp: 1,
        method: "ad.load",
        payload: { placement: "rewarded_hint", transactionId: "ad-load-1" },
      },
      {
        bridgeVersion: GAME_BRIDGE_VERSION,
        kind: "request",
        messageId: "ad-show",
        sessionId: "schema-session",
        timestamp: 1,
        method: "ad.show",
        payload: { placement: "rewarded_hint", transactionId: "ad-show-1" },
      },
      {
        bridgeVersion: GAME_BRIDGE_VERSION,
        kind: "request",
        messageId: "haptic-play",
        sessionId: "schema-session",
        timestamp: 1,
        method: "haptic.play",
        payload: { semanticType: "success" },
      },
      {
        bridgeVersion: GAME_BRIDGE_VERSION,
        kind: "request",
        messageId: "notification-request",
        sessionId: "schema-session",
        timestamp: 1,
        method: "notification.request",
        payload: { reason: "daily-return-reminder" },
      },
      {
        bridgeVersion: GAME_BRIDGE_VERSION,
        kind: "request",
        messageId: "runtime-ready",
        sessionId: "schema-session",
        timestamp: 1,
        method: "runtime.ready",
        payload: {
          renderer: "webgl",
          scene: "puzzle",
          visible: true,
          contentChecksum: "bundled:onboarding-easy-01:ko-KR:v1",
          contentLocale: "ko-KR",
          puzzleId: "onboarding-easy-01",
          assetManifestChecksum: "sha256:0123456789abcdef",
        },
      },
      ...(["app.pause", "app.resume", "app.focus", "app.blur"] as const).map(
        (method, index): GameBridgeRequestMessage => ({
          bridgeVersion: GAME_BRIDGE_VERSION,
          kind: "request",
          messageId: `app-state-${index}`,
          sessionId: "schema-session",
          timestamp: 1,
          method,
          payload: { timestamp: index + 1 },
        }),
      ),
      {
        bridgeVersion: GAME_BRIDGE_VERSION,
        kind: "request",
        messageId: "config-snapshot",
        sessionId: "schema-session",
        timestamp: 1,
        method: "config.snapshot",
        payload: {
          version: "remote-config-v1",
          values: {
            game_runtime_enabled: false,
            default_hint_credits: 3,
          },
        },
      },
      {
        bridgeVersion: GAME_BRIDGE_VERSION,
        kind: "request",
        messageId: "locale-preferred",
        sessionId: "schema-session",
        timestamp: 1,
        method: "locale.preferred",
        payload: { locales: ["ko-KR", "en-US"] },
      },
      {
        bridgeVersion: GAME_BRIDGE_VERSION,
        kind: "request",
        messageId: "deep-link-map",
        sessionId: "schema-session",
        timestamp: 1,
        method: "deep_link",
        payload: { route: "map" },
      },
      {
        bridgeVersion: GAME_BRIDGE_VERSION,
        kind: "request",
        messageId: "deep-link-puzzle",
        sessionId: "schema-session",
        timestamp: 1,
        method: "deep_link",
        payload: { route: "puzzle", puzzleId: "onboarding-001" },
      },
    ];

    for (const request of requests) {
      const decoded = decodeGameBridgeMessage(request);
      assert.equal(decoded.ok, true, request.method);
    }

    const analyticsRequest = requests.find(
      (request) => request.method === "analytics.log",
    );
    assert.ok(analyticsRequest);
    const invalidAnalytics = {
      ...analyticsRequest,
      payload: {
        event: "game_puzzle_start",
        params: { nested: { answer: "민감값" } },
        eventId: "event-id-2",
      },
    };
    assert.deepEqual(decodeGameBridgeMessage(invalidAnalytics), {
      ok: false,
      reason: "invalid-payload",
    });

    const localeRequest = requests.find(
      (request) => request.method === "locale.preferred",
    );
    assert.ok(localeRequest);
    assert.deepEqual(
      decodeGameBridgeMessage({
        ...localeRequest,
        payload: { locales: ["ko-KR", "ko-kr"] },
      }),
      { ok: false, reason: "invalid-payload" },
    );

    const deepLinkRequest = requests.find(
      (request) => request.method === "deep_link",
    );
    assert.ok(deepLinkRequest);
    assert.deepEqual(
      decodeGameBridgeMessage({
        ...deepLinkRequest,
        payload: { route: "https://attacker.example" },
      }),
      { ok: false, reason: "invalid-payload" },
    );
    assert.deepEqual(
      decodeGameBridgeMessage({
        ...deepLinkRequest,
        payload: { route: "puzzle" },
      }),
      { ok: false, reason: "invalid-payload" },
    );

    const runtimeReadyRequest = requests.find(
      (request) => request.method === "runtime.ready",
    );
    assert.ok(runtimeReadyRequest);
    assert.deepEqual(
      decodeGameBridgeMessage({
        ...runtimeReadyRequest,
        payload: { ...runtimeReadyRequest.payload, visible: false },
      }),
      { ok: false, reason: "invalid-payload" },
    );
  });

  test("requestId로 result를 연결하고 중복 response는 한 번만 settle한다", async () => {
    const { coordinator, sent } = await readyGameCoordinator();
    const responsePromise = coordinator.request("storage.get", {
      key: "save/current",
      schemaVersion: "save-v2",
    });
    const request = sent[sent.length - 1];
    assert.equal(request?.kind, "request");
    if (request?.kind !== "request" || request.method !== "storage.get") {
      assert.fail("storage.get request was not sent");
    }

    const response: GameBridgeResponse<"storage.get"> = {
      bridgeVersion: GAME_BRIDGE_VERSION,
      kind: "response",
      messageId: "storage-result-1",
      requestId: request.messageId,
      sessionId: request.sessionId,
      timestamp: 5,
      method: "storage.get",
      status: "result",
      result: {
        found: true,
        schemaVersion: "save-v2",
        value: { progress: 3 },
      },
    };
    assert.deepEqual(await coordinator.receive(response), {
      accepted: true,
      reason: "accepted",
    });
    assert.deepEqual(await responsePromise, response);
    assert.deepEqual(await coordinator.receive(response), {
      accepted: true,
      reason: "duplicate-response",
    });
  });

  test("응답이 없으면 민감 payload 없이 timeout error envelope로 끝난다", async () => {
    const timer = new ManualTimer();
    const { coordinator } = await readyGameCoordinator({ timer });
    const responsePromise = coordinator.request(
      "storage.set",
      {
        key: "save/current",
        schemaVersion: "save-v2",
        value: { privateDraft: "민감한 저장값" },
        transactionId: "timeout-tx",
      },
      { timeoutMs: 10 },
    );
    timer.fireAll();

    const response = await responsePromise;
    assert.equal(response.status, "error");
    if (response.status === "error") {
      assert.deepEqual(response.error, { code: "timeout", retryable: true });
    }
    assert.equal(JSON.stringify(response).includes("민감한 저장값"), false);
  });

  test("중복 messageId와 transactionId는 handler를 한 번만 실행한다", async () => {
    const sent: GameBridgeMessage[] = [];
    let writes = 0;
    const host = new GameBridgeCoordinator({
      role: "host",
      capabilities: ["storage"],
      transport: { send: (message) => void sent.push(message) },
      handlers: {
        "storage.set": async (payload) => {
          writes += 1;
          return { stored: true, transactionId: payload.transactionId };
        },
      },
    });
    await host.receive(handshake("game", "session-1", ["storage"]));
    sent.length = 0;

    const first = storageSetRequest({ messageId: "save-request-1" });
    assert.deepEqual(await host.receive(first), {
      accepted: true,
      reason: "accepted",
    });
    const firstResponse = sent[0];
    assert.deepEqual(await host.receive(first), {
      accepted: true,
      reason: "duplicate-request",
    });
    assert.equal(writes, 1);
    assert.deepEqual(sent[1], firstResponse);

    const sameTransaction = storageSetRequest({
      messageId: "save-request-2",
    });
    await host.receive(sameTransaction);
    assert.equal(writes, 1);
    const sameTransactionResponse = sent[2];
    assert.equal(sameTransactionResponse?.kind, "response");
    if (sameTransactionResponse?.kind === "response") {
      assert.equal(sameTransactionResponse.requestId, "save-request-2");
      assert.equal(sameTransactionResponse.status, "result");
    }

    const conflict = storageSetRequest({
      messageId: "save-request-3",
      value: { progress: 999 },
    });
    await host.receive(conflict);
    assert.equal(writes, 1);
    const conflictResponse = sent[3];
    assert.equal(conflictResponse?.kind, "response");
    if (conflictResponse?.kind === "response") {
      assert.equal(conflictResponse.status, "error");
      if (conflictResponse.status === "error") {
        assert.equal(conflictResponse.error.code, "idempotency-conflict");
      }
    }
  });

  test("새 session이 시작되면 이전 pending과 늦은 callback을 폐기한다", async () => {
    const { coordinator, sent } = await readyGameCoordinator({
      capabilities: ["storage", "lifecycle"],
    });
    const oldPromise = coordinator.request("storage.get", {
      key: "save/current",
      schemaVersion: "save-v2",
    });
    const oldRequest = sent[sent.length - 1];
    assert.equal(oldRequest?.kind, "request");
    if (oldRequest?.kind !== "request" || oldRequest.method !== "storage.get") {
      assert.fail("old request was not sent");
    }

    const newHandshake = handshake("host", "session-2", [
      "storage",
      "lifecycle",
    ]);
    assert.deepEqual(await coordinator.receive(newHandshake), {
      accepted: true,
      reason: "accepted",
    });
    const replaced = await oldPromise;
    assert.equal(replaced.status, "error");
    if (replaced.status === "error") {
      assert.equal(replaced.error.code, "session-replaced");
    }

    const lateResponse: GameBridgeResponse<"storage.get"> = {
      bridgeVersion: GAME_BRIDGE_VERSION,
      kind: "response",
      messageId: "late-response",
      requestId: oldRequest.messageId,
      sessionId: "session-1",
      timestamp: 99,
      method: "storage.get",
      status: "result",
      result: { found: false },
    };
    assert.deepEqual(await coordinator.receive(lateResponse), {
      accepted: false,
      reason: "stale-session",
    });
    assert.equal(coordinator.getSnapshot().sessionId, "session-2");
    assert.equal(coordinator.getSnapshot().state, "ready");
  });

  test("협상되지 않은 capability와 handler 오류를 명시적 error로 반환하고 로그하지 않는다", async () => {
    const { coordinator } = await readyGameCoordinator({
      capabilities: ["storage"],
    });
    const unavailable = await coordinator.request("analytics.log", {
      event: "game_puzzle_start",
      params: { schema_version: 2 },
      eventId: "event-1",
    });
    assert.equal(unavailable.status, "error");
    if (unavailable.status === "error") {
      assert.equal(unavailable.error.code, "capability-unavailable");
    }

    const sent: GameBridgeMessage[] = [];
    let consoleCalls = 0;
    const originalError = console.error;
    const originalLog = console.log;
    console.error = () => {
      consoleCalls += 1;
    };
    console.log = () => {
      consoleCalls += 1;
    };
    try {
      const host = new GameBridgeCoordinator({
        role: "host",
        capabilities: ["storage"],
        transport: { send: (message) => void sent.push(message) },
        handlers: {
          "storage.set": () => {
            throw new Error("민감한 저장값");
          },
        },
      });
      await host.receive(handshake("game", "session-1", ["storage"]));
      sent.length = 0;
      await host.receive(
        storageSetRequest({
          messageId: "handler-error",
          value: { secret: "민감한 저장값" },
        }),
      );
      const errorResponse = sent[0];
      assert.equal(errorResponse?.kind, "response");
      assert.equal(
        JSON.stringify(errorResponse).includes("민감한 저장값"),
        false,
      );
      if (errorResponse?.kind === "response") {
        assert.equal(errorResponse.status, "error");
        if (errorResponse.status === "error") {
          assert.equal(errorResponse.error.code, "handler-failed");
        }
      }
    } finally {
      console.error = originalError;
      console.log = originalLog;
    }
    assert.equal(consoleCalls, 0);
  });

  test("host lifecycle/config/locale/deep-link command도 같은 request-response 계약을 사용한다", async () => {
    const sent: GameBridgeMessage[] = [];
    const host = new GameBridgeCoordinator({
      role: "host",
      capabilities: ["lifecycle", "focus", "config", "locale", "navigation"],
      transport: { send: (message) => void sent.push(message) },
    });
    const opening = await host.startSession("session-host");
    await host.receive(
      handshakeAck(opening, "game", [
        "lifecycle",
        "focus",
        "config",
        "locale",
        "navigation",
      ]),
    );

    const pausePromise = host.request("app.pause", { timestamp: 100 });
    const pauseRequest = sent[sent.length - 1];
    assert.equal(pauseRequest?.kind, "request");
    if (
      pauseRequest?.kind !== "request" ||
      pauseRequest.method !== "app.pause"
    ) {
      assert.fail("pause request was not sent");
    }
    const pauseResponse: GameBridgeResponse<"app.pause"> = {
      bridgeVersion: GAME_BRIDGE_VERSION,
      kind: "response",
      messageId: "pause-ack",
      sessionId: "session-host",
      timestamp: 101,
      requestId: pauseRequest.messageId,
      method: "app.pause",
      status: "result",
      result: { ack: true },
    };
    await host.receive(pauseResponse);
    assert.equal((await pausePromise).status, "result");

    const localePromise = host.request("locale.preferred", {
      locales: ["ko-KR"],
    });
    const localeRequest = sent[sent.length - 1];
    assert.equal(localeRequest?.kind, "request");
    if (
      localeRequest?.kind !== "request" ||
      localeRequest.method !== "locale.preferred"
    ) {
      assert.fail("locale request was not sent");
    }
    await host.receive({
      bridgeVersion: GAME_BRIDGE_VERSION,
      kind: "response",
      messageId: "locale-response",
      sessionId: "session-host",
      timestamp: 102,
      requestId: localeRequest.messageId,
      method: "locale.preferred",
      status: "result",
      result: { uiLocale: "ko-KR" },
    });
    assert.equal((await localePromise).status, "result");
  });
});
