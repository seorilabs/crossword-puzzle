import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  GameBridgeCoordinator,
  type GameBridgeMessage,
  type GameBridgeMethod,
  type GameBridgeMethodPayloads,
  type GameBridgeRequestMessage,
} from "../../packages/crossword-core/src/gameBridge.ts";
import {
  createNativeGameBridgeClient,
  type NativeBridgeMessageTarget,
} from "./nativeGameBridge.ts";
import { NATIVE_GAME_EVENT } from "./nativeGameEvents.ts";

class ManualMessageTarget implements NativeBridgeMessageTarget {
  readonly #listeners = new Set<(event: Event) => void>();

  addEventListener(type: "message", listener: (event: Event) => void): void {
    if (type === "message") {
      this.#listeners.add(listener);
    }
  }

  removeEventListener(type: "message", listener: (event: Event) => void): void {
    if (type === "message") {
      this.#listeners.delete(listener);
    }
  }

  dispatch(data: unknown): void {
    const event = { data } as MessageEvent;
    for (const listener of [...this.#listeners]) {
      listener(event as Event);
    }
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }
}

type HostEvent = Readonly<{ name: string; detail?: unknown }>;

async function settleBridge(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function requireRequest<M extends GameBridgeMethod>(
  messages: readonly GameBridgeMessage[],
  method: M,
): GameBridgeRequestMessage<M> {
  const message = messages.find(
    (candidate): candidate is GameBridgeRequestMessage<M> =>
      candidate.kind === "request" && candidate.method === method,
  );
  if (message == null) {
    assert.fail(`${method} request was not sent`);
  }
  return message;
}

function createLoopbackFixture() {
  const windowTarget = new ManualMessageTarget();
  const documentTarget = new ManualMessageTarget();
  const gameOutbound: GameBridgeMessage[] = [];
  const hostOutbound: GameBridgeMessage[] = [];
  const hostEvents: HostEvent[] = [];
  const storage = new Map<string, string>();
  const handlerCalls = {
    get: 0,
    set: 0,
    remove: 0,
    runtimeReady: 0,
  };
  let runtimeReadyPayload:
    | GameBridgeMethodPayloads["runtime.ready"]
    | undefined;

  const deliverHostMessage = (message: GameBridgeMessage): void => {
    hostOutbound.push(message);
    const serialized = JSON.stringify(message);
    // React Native WebView may deliver the same payload on both targets.
    windowTarget.dispatch(serialized);
    documentTarget.dispatch(serialized);
  };

  const host = new GameBridgeCoordinator({
    role: "host",
    capabilities: ["storage", "runtime", "lifecycle"],
    transport: { send: deliverHostMessage },
    handlers: {
      "storage.get": ({ key, schemaVersion }) => {
        handlerCalls.get += 1;
        const value = storage.get(key);
        return value == null
          ? { found: false }
          : { found: true, schemaVersion, value };
      },
      "storage.set": ({ key, value, transactionId }) => {
        handlerCalls.set += 1;
        assert.equal(typeof value, "string");
        storage.set(key, value as string);
        return { stored: true, transactionId };
      },
      "storage.remove": ({ key, transactionId }) => {
        handlerCalls.remove += 1;
        storage.delete(key);
        return { removed: true, transactionId };
      },
      "runtime.ready": (payload) => {
        handlerCalls.runtimeReady += 1;
        runtimeReadyPayload = payload;
        return { ack: true };
      },
    },
  });

  const client = createNativeGameBridgeClient({
    messageTargets: [windowTarget, documentTarget],
    async sendSerialized(serialized) {
      const message = JSON.parse(serialized) as GameBridgeMessage;
      gameOutbound.push(message);
      await host.receive(message);
    },
    dispatchHostEvent(name, detail) {
      hostEvents.push({ name, detail });
    },
  });
  const handshakeStarted = host.startSession("native-loopback-session");

  return {
    client,
    documentTarget,
    gameOutbound,
    handshakeStarted,
    handlerCalls,
    host,
    hostEvents,
    hostOutbound,
    runtimeReadyPayload: () => runtimeReadyPayload,
    storage,
    windowTarget,
  };
}

describe("native game bridge loopback contract", () => {
  test("handshake 후 문자열 저장소와 runtime.ready를 왕복한다", async () => {
    const fixture = createLoopbackFixture();
    await fixture.handshakeStarted;
    await fixture.client.waitUntilReady();

    assert.deepEqual(fixture.host.getSnapshot(), {
      state: "ready",
      role: "host",
      sessionId: "native-loopback-session",
      negotiatedCapabilities: ["storage", "runtime", "lifecycle"],
    });
    assert.equal(fixture.windowTarget.listenerCount, 1);
    assert.equal(fixture.documentTarget.listenerCount, 1);
    assert.equal(await fixture.client.storage.getItem("save/current"), null);

    await fixture.client.storage.setItem("save/current", '{"progress":1}');
    assert.equal(
      await fixture.client.storage.getItem("save/current"),
      '{"progress":1}',
    );
    await fixture.client.storage.removeItem("save/current");
    assert.equal(await fixture.client.storage.getItem("save/current"), null);
    assert.equal(fixture.handlerCalls.set, 1);
    assert.equal(fixture.handlerCalls.remove, 1);

    const runtimeReady: GameBridgeMethodPayloads["runtime.ready"] = {
      renderer: "webgl",
      scene: "puzzle",
      visible: true,
      contentChecksum: "bundled:onboarding-easy-01:ko-KR:v1",
      contentLocale: "ko-KR",
      puzzleId: "onboarding-easy-01",
      assetManifestChecksum: "sha256:0123456789abcdef",
    };
    await fixture.client.reportRuntimeReady(runtimeReady);

    assert.equal(fixture.handlerCalls.runtimeReady, 1);
    assert.deepEqual(fixture.runtimeReadyPayload(), runtimeReady);

    const storageSet = requireRequest(fixture.gameOutbound, "storage.set");
    assert.equal(storageSet.payload.schemaVersion, "raw-string/v1");
    assert.match(
      storageSet.payload.transactionId,
      /^native-loopback-session:storage-set:\d+$/,
    );

    // Exact request replay must return the cached result without a second write.
    assert.deepEqual(await fixture.host.receive(storageSet), {
      accepted: true,
      reason: "duplicate-request",
    });
    assert.equal(fixture.handlerCalls.set, 1);

    const runtimeRequest = requireRequest(
      fixture.gameOutbound,
      "runtime.ready",
    );
    assert.deepEqual(await fixture.host.receive(runtimeRequest), {
      accepted: true,
      reason: "duplicate-request",
    });
    assert.equal(fixture.handlerCalls.runtimeReady, 1);

    fixture.client.dispose();
  });

  test("window/document 중복 전달과 replay를 한 번만 처리하고 비정상 wire 및 dispose 이후 입력을 무시한다", async () => {
    const fixture = createLoopbackFixture();
    await fixture.handshakeStarted;
    await fixture.client.waitUntilReady();

    const pauseResponse = await fixture.host.request("app.pause", {
      timestamp: 100,
    });
    assert.equal(pauseResponse.status, "result");
    assert.deepEqual(fixture.hostEvents, [
      { name: NATIVE_GAME_EVENT.pause, detail: undefined },
    ]);

    const pauseRequest = requireRequest(fixture.hostOutbound, "app.pause");
    const serializedPause = JSON.stringify(pauseRequest);
    fixture.windowTarget.dispatch(serializedPause);
    fixture.documentTarget.dispatch(serializedPause);
    await settleBridge();
    assert.equal(
      fixture.hostEvents.filter(({ name }) => name === NATIVE_GAME_EVENT.pause)
        .length,
      1,
    );

    const outboundBeforeInvalidInput = fixture.gameOutbound.length;
    fixture.windowTarget.dispatch("{not-json");
    fixture.documentTarget.dispatch({ bridgeVersion: "game_bridge_v1" });
    fixture.windowTarget.dispatch("{}");
    fixture.documentTarget.dispatch(
      JSON.stringify({ payload: "x".repeat(64 * 1024) }),
    );
    await settleBridge();
    assert.equal(fixture.gameOutbound.length, outboundBeforeInvalidInput);

    fixture.client.dispose();
    fixture.client.dispose();
    assert.equal(fixture.windowTarget.listenerCount, 0);
    assert.equal(fixture.documentTarget.listenerCount, 0);

    const outboundBeforeDisposedInput = fixture.gameOutbound.length;
    fixture.windowTarget.dispatch(serializedPause);
    fixture.documentTarget.dispatch(serializedPause);
    await settleBridge();
    assert.equal(fixture.gameOutbound.length, outboundBeforeDisposedInput);
    assert.equal(fixture.hostEvents.length, 1);
  });
});
