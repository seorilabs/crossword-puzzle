import {
  GameBridgeCoordinator,
  type GameBridgeDeepLinkRoute,
  type GameBridgeJsonValue,
  type GameBridgeMessage,
  type GameBridgeMethod,
  type GameBridgeMethodPayloads,
  type GameBridgeMethodResults,
  type GameBridgeResponse,
} from "../../packages/crossword-core/src/gameBridge.ts";
import type { KeyValueStoragePort } from "./gameSaveRepository.ts";
import { NATIVE_GAME_EVENT } from "./nativeGameEvents.ts";

const BRIDGE_SCHEMA_VERSION = "raw-string/v1";
const MAX_SERIALIZED_MESSAGE_LENGTH = 64 * 1024;

export type NativeBridgeMessageTarget = Readonly<{
  addEventListener(type: "message", listener: (event: Event) => void): void;
  removeEventListener(type: "message", listener: (event: Event) => void): void;
}>;

export type NativeGameBridgeOptions = Readonly<{
  sendSerialized(message: string): void | Promise<void>;
  messageTargets: readonly NativeBridgeMessageTarget[];
  dispatchHostEvent?: (name: string, detail?: unknown) => void;
}>;

export type NativeRuntimeReadyPayload =
  GameBridgeMethodPayloads["runtime.ready"];

export type NativeGameBridgeClient = Readonly<{
  storage: KeyValueStoragePort;
  waitUntilReady(): Promise<void>;
  reportRuntimeReady(payload: NativeRuntimeReadyPayload): Promise<void>;
  dispose(): void;
}>;

class NativeGameBridgeError extends Error {
  constructor(code: string) {
    super(`native game bridge rejected: ${code}`);
    this.name = "NativeGameBridgeError";
  }
}

function createDeferred(): {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
} {
  let settled = false;
  let resolvePromise!: () => void;
  let rejectPromise!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  void promise.catch(() => undefined);
  return {
    promise,
    resolve() {
      if (settled) return;
      settled = true;
      resolvePromise();
    },
    reject(error) {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    },
  };
}

function parseSerializedMessage(value: unknown): unknown | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_SERIALIZED_MESSAGE_LENGTH
  ) {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function unwrapResult<M extends GameBridgeMethod>(
  response: GameBridgeResponse<M>,
): GameBridgeMethodResults[M] {
  if (response.status === "error") {
    throw new NativeGameBridgeError(response.error.code);
  }
  return response.result;
}

function defaultDispatchHostEvent(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function createNativeGameBridgeClient(
  options: NativeGameBridgeOptions,
): NativeGameBridgeClient {
  const ready = createDeferred();
  const dispatchHostEvent =
    options.dispatchHostEvent ?? defaultDispatchHostEvent;
  let transactionSequence = 0;
  let disposed = false;

  const coordinator = new GameBridgeCoordinator({
    role: "game",
    capabilities: [
      "storage",
      "analytics",
      "ad",
      "haptic",
      "notification",
      "runtime",
      "lifecycle",
      "focus",
      "config",
      "locale",
      "navigation",
    ],
    transport: {
      send(message: GameBridgeMessage) {
        return options.sendSerialized(JSON.stringify(message));
      },
    },
    handlers: {
      "app.pause": () => {
        dispatchHostEvent(NATIVE_GAME_EVENT.pause);
        return { ack: true };
      },
      "app.resume": () => {
        dispatchHostEvent(NATIVE_GAME_EVENT.resume);
        return { ack: true };
      },
      "app.focus": () => {
        dispatchHostEvent(NATIVE_GAME_EVENT.focus);
        return { ack: true };
      },
      "app.blur": () => {
        dispatchHostEvent(NATIVE_GAME_EVENT.blur);
        return { ack: true };
      },
      "config.snapshot": (payload) => {
        dispatchHostEvent(NATIVE_GAME_EVENT.config, payload);
        return { ack: true };
      },
      "locale.preferred": () => ({ uiLocale: "ko-KR" }),
      deep_link: (payload) => {
        dispatchHostEvent(NATIVE_GAME_EVENT.deepLink, payload);
        return { navigated: false, route: payload.route };
      },
    },
  });

  const onMessage = (event: Event) => {
    const parsed = parseSerializedMessage((event as MessageEvent).data);
    if (parsed == null || disposed) return;
    void coordinator.receive(parsed).then(() => {
      const snapshot = coordinator.getSnapshot();
      if (snapshot.state === "ready") {
        ready.resolve();
      } else if (snapshot.state === "rejected") {
        ready.reject(new NativeGameBridgeError("handshake-rejected"));
      }
    });
  };

  for (const target of options.messageTargets) {
    target.addEventListener("message", onMessage);
  }

  const nextTransactionId = (kind: string): string => {
    const sessionId = coordinator.getSnapshot().sessionId;
    if (sessionId == null) {
      throw new NativeGameBridgeError("handshake-required");
    }
    transactionSequence += 1;
    return `${sessionId}:${kind}:${transactionSequence}`;
  };

  const storage: KeyValueStoragePort = {
    async getItem(key) {
      const result = unwrapResult(
        await coordinator.request("storage.get", {
          key,
          schemaVersion: BRIDGE_SCHEMA_VERSION,
        }),
      );
      if (!result.found) return null;
      if (typeof result.value !== "string") {
        throw new NativeGameBridgeError("invalid-storage-value");
      }
      return result.value;
    },
    async setItem(key, value) {
      const transactionId = nextTransactionId("storage-set");
      unwrapResult(
        await coordinator.request("storage.set", {
          key,
          schemaVersion: BRIDGE_SCHEMA_VERSION,
          value,
          transactionId,
        }),
      );
    },
    async removeItem(key) {
      const transactionId = nextTransactionId("storage-remove");
      unwrapResult(
        await coordinator.request("storage.remove", {
          key,
          schemaVersion: BRIDGE_SCHEMA_VERSION,
          transactionId,
        }),
      );
    },
  };

  return {
    storage,
    waitUntilReady: () => ready.promise,
    async reportRuntimeReady(payload) {
      unwrapResult(await coordinator.request("runtime.ready", payload));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const target of options.messageTargets) {
        target.removeEventListener("message", onMessage);
      }
    },
  };
}

export function createDefaultNativeGameBridgeClient(): NativeGameBridgeClient {
  const nativeWindow = window as typeof window & {
    ReactNativeWebView?: { postMessage(message: string): void };
  };
  if (nativeWindow.ReactNativeWebView == null) {
    throw new NativeGameBridgeError("native-transport-unavailable");
  }
  const nativeTransport = nativeWindow.ReactNativeWebView;
  return createNativeGameBridgeClient({
    sendSerialized: (message) => nativeTransport.postMessage(message),
    messageTargets: [window, document],
  });
}

export type NativeHostConfigSnapshot = Readonly<{
  version: string;
  values: Readonly<Record<string, GameBridgeJsonValue>>;
}>;

export type NativeHostDeepLink = Readonly<{
  route: GameBridgeDeepLinkRoute;
  puzzleId?: string;
}>;
