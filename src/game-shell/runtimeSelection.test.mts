import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  BOOT_MARKER_ACK_TIMEOUT_MS,
  BUNDLED_GAME_RUNTIME_ENABLED,
  GAME_BOOT_WATCHDOG_MS,
  RUNTIME_CACHE_TIMEOUT_MS,
  RUNTIME_CONFIG_TIMEOUT_MS,
  bootSelectedRuntime,
  isGameRuntimeHostSupported,
  resolveRuntimeSelection,
  type GameRuntimeSession,
  type RuntimeBootPorts,
  type RuntimeSchedulerPort,
  type RuntimeSelectionPorts,
} from "./runtimeSelection.ts";

class ManualScheduler implements RuntimeSchedulerPort {
  readonly scheduledDelays: number[] = [];
  private readonly tasks: Array<{
    delayMs: number;
    cancelled: boolean;
    callback: () => void;
  }> = [];

  schedule(delayMs: number, callback: () => void): () => void {
    this.scheduledDelays.push(delayMs);
    const task = { delayMs, cancelled: false, callback };
    this.tasks.push(task);
    return () => {
      task.cancelled = true;
    };
  }

  fire(delayMs: number): void {
    const task = this.tasks.find(
      (candidate) => candidate.delayMs === delayMs && !candidate.cancelled,
    );
    assert.ok(task, `active ${delayMs}ms deadline must exist`);
    task.callback();
  }
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

function makeSelectionPorts(
  scheduler: ManualScheduler,
  overrides: Partial<RuntimeSelectionPorts> = {},
): RuntimeSelectionPorts {
  return {
    scheduler,
    readPendingBootMarker: async () => null,
    fetchRuntimeConfig: async () => ({ signed: true, enabled: true }),
    readCachedRuntimeConfig: async () => null,
    validateRuntimeConfig: (candidate) => {
      if (
        typeof candidate === "object" &&
        candidate !== null &&
        (candidate as { signed?: boolean }).signed === true &&
        typeof (candidate as { enabled?: unknown }).enabled === "boolean"
      ) {
        return {
          gameRuntimeEnabled: (candidate as { enabled: boolean }).enabled,
        };
      }
      return null;
    },
    ...overrides,
  };
}

function makeSession(
  events: string[],
  overrides: Partial<GameRuntimeSession> = {},
): GameRuntimeSession {
  return {
    waitForWebGlContext: async () => {
      events.push("webgl");
    },
    waitForBridgeHandshake: async () => {
      events.push("bridge");
    },
    waitForFirstInteractiveAck: async () => {
      events.push("interactive");
    },
    probeVisibleSurface: async () => {
      events.push("visible");
      return true;
    },
    dispose: async () => {
      events.push("dispose");
    },
    ...overrides,
  };
}

function makeBootPorts(
  scheduler: ManualScheduler,
  events: string[],
  session: GameRuntimeSession,
  overrides: Partial<RuntimeBootPorts> = {},
): RuntimeBootPorts {
  return {
    scheduler,
    createBootId: () => "boot-1",
    nowEpochMs: () => 1_721_171_200_000,
    writePendingBootMarker: async () => {
      events.push("marker-write");
    },
    clearPendingBootMarker: async () => {
      events.push("marker-clear");
    },
    importGameRuntime: async () => {
      events.push("import");
      return session;
    },
    ...overrides,
  };
}

describe("host runtime selection", () => {
  test("bundled runtime flag is permanently false", () => {
    assert.equal(BUNDLED_GAME_RUNTIME_ENABLED, false);
  });

  test("실제 adapter가 준비된 web host에서만 runtime gate를 평가한다", () => {
    assert.equal(isGameRuntimeHostSupported("web"), true);
    assert.equal(isGameRuntimeHostSupported("apps-in-toss"), false);
    assert.equal(isGameRuntimeHostSupported("native-webview"), false);
  });

  test("validated fetched OFF overrides cached ON", async () => {
    const scheduler = new ManualScheduler();
    let cacheReads = 0;
    const result = await resolveRuntimeSelection(
      makeSelectionPorts(scheduler, {
        fetchRuntimeConfig: async () => ({ signed: true, enabled: false }),
        readCachedRuntimeConfig: async () => {
          cacheReads += 1;
          return { signed: true, enabled: true };
        },
      }),
    );

    assert.deepEqual(result, {
      target: "legacy",
      configSource: "fetched",
      reason: "fetched-disabled",
      diagnostics: [],
    });
    assert.equal(cacheReads, 0);
  });

  test("fetched resolution is capped at two seconds then validated cache ON is used", async () => {
    const scheduler = new ManualScheduler();
    const hangingFetch = deferred<unknown>();
    const resultPromise = resolveRuntimeSelection(
      makeSelectionPorts(scheduler, {
        fetchRuntimeConfig: () => hangingFetch.promise,
        readCachedRuntimeConfig: async () => ({ signed: true, enabled: true }),
      }),
    );

    await flushMicrotasks();
    scheduler.fire(RUNTIME_CONFIG_TIMEOUT_MS);
    const result = await resultPromise;

    assert.deepEqual(result, {
      target: "game",
      configSource: "cache",
      diagnostics: ["fetch-timeout"],
    });
  });

  test("invalid fetched and corrupt cache fail closed to bundled false", async () => {
    const scheduler = new ManualScheduler();
    const result = await resolveRuntimeSelection(
      makeSelectionPorts(scheduler, {
        fetchRuntimeConfig: async () => ({ signed: false, enabled: true }),
        readCachedRuntimeConfig: async () => "corrupt-cache",
      }),
    );

    assert.deepEqual(result, {
      target: "legacy",
      configSource: "bundled",
      reason: "bundled-disabled",
      diagnostics: ["fetched-invalid", "cache-invalid"],
    });
  });

  test("멈춘 SDK cache 읽기는 짧은 deadline 뒤 bundled OFF로 종료한다", async () => {
    const scheduler = new ManualScheduler();
    const hangingCache = deferred<unknown>();
    const resultPromise = resolveRuntimeSelection(
      makeSelectionPorts(scheduler, {
        fetchRuntimeConfig: async () => ({ signed: false, enabled: true }),
        readCachedRuntimeConfig: () => hangingCache.promise,
      }),
    );

    await flushMicrotasks();
    await flushMicrotasks();
    scheduler.fire(RUNTIME_CACHE_TIMEOUT_MS);
    assert.deepEqual(await resultPromise, {
      target: "legacy",
      configSource: "bundled",
      reason: "bundled-disabled",
      diagnostics: ["fetched-invalid", "cache-read-timeout"],
    });
  });

  test("previous durable pending marker rejects cached or fetched ON before config read", async () => {
    const scheduler = new ManualScheduler();
    let fetchCalls = 0;
    const result = await resolveRuntimeSelection(
      makeSelectionPorts(scheduler, {
        readPendingBootMarker: async () => ({
          schemaVersion: 1,
          bootId: "previous-boot",
          createdAtEpochMs: 123,
        }),
        fetchRuntimeConfig: async () => {
          fetchCalls += 1;
          return { signed: true, enabled: true };
        },
      }),
    );

    assert.deepEqual(result, {
      target: "legacy",
      configSource: null,
      reason: "previous-boot-pending",
      diagnostics: [],
    });
    assert.equal(fetchCalls, 0);
  });

  test("corrupt marker fails closed instead of being treated as absent", async () => {
    const scheduler = new ManualScheduler();
    const result = await resolveRuntimeSelection(
      makeSelectionPorts(scheduler, {
        readPendingBootMarker: async () => ({ schemaVersion: 1 }),
      }),
    );

    assert.equal(result.target, "legacy");
    assert.equal(result.reason, "pending-marker-invalid");
  });
});

describe("host game boot watchdog", () => {
  const gameSelection = {
    target: "game",
    configSource: "fetched",
    diagnostics: [],
  } as const;

  test("durable marker ack precedes import and marker clears after interactive proof", async () => {
    const scheduler = new ManualScheduler();
    const events: string[] = [];
    const session = makeSession(events);
    const result = await bootSelectedRuntime(
      gameSelection,
      makeBootPorts(scheduler, events, session),
    );

    assert.equal(result.target, "game");
    assert.deepEqual(events, [
      "marker-write",
      "import",
      "webgl",
      "bridge",
      "interactive",
      "visible",
      "marker-clear",
    ]);
    assert.deepEqual(scheduler.scheduledDelays, [
      BOOT_MARKER_ACK_TIMEOUT_MS,
      GAME_BOOT_WATCHDOG_MS,
    ]);
  });

  test("marker ack timeout selects legacy and never imports game code", async () => {
    const scheduler = new ManualScheduler();
    const events: string[] = [];
    const pendingWrite = deferred<void>();
    const session = makeSession(events);
    const resultPromise = bootSelectedRuntime(
      gameSelection,
      makeBootPorts(scheduler, events, session, {
        writePendingBootMarker: () => pendingWrite.promise,
      }),
    );

    await flushMicrotasks();
    scheduler.fire(BOOT_MARKER_ACK_TIMEOUT_MS);
    const result = await resultPromise;

    assert.deepEqual(result, {
      target: "legacy",
      configSource: "fetched",
      reason: "boot-marker-write-timeout",
    });
    assert.equal(events.includes("import"), false);
  });

  test("marker durable write failure selects legacy and never imports game code", async () => {
    const scheduler = new ManualScheduler();
    const events: string[] = [];
    const session = makeSession(events);
    const result = await bootSelectedRuntime(
      gameSelection,
      makeBootPorts(scheduler, events, session, {
        writePendingBootMarker: async () => {
          throw new Error("storage unavailable");
        },
      }),
    );

    assert.deepEqual(result, {
      target: "legacy",
      configSource: "fetched",
      reason: "boot-marker-write-failed",
    });
    assert.equal(events.includes("import"), false);
  });

  test("corrupt dynamic import is rejected without clearing pending marker", async () => {
    const scheduler = new ManualScheduler();
    const events: string[] = [];
    const session = makeSession(events);
    const result = await bootSelectedRuntime(
      gameSelection,
      makeBootPorts(scheduler, events, session, {
        importGameRuntime: async () => ({ broken: true }),
      }),
    );

    assert.deepEqual(result, {
      target: "legacy",
      configSource: "fetched",
      reason: "runtime-import-failed",
    });
    assert.equal(events.includes("marker-clear"), false);
  });

  test("blank surface disposes engine and returns a same-session legacy decision", async () => {
    const scheduler = new ManualScheduler();
    const events: string[] = [];
    const session = makeSession(events, {
      probeVisibleSurface: async () => {
        events.push("visible");
        return false;
      },
    });
    const result = await bootSelectedRuntime(
      gameSelection,
      makeBootPorts(scheduler, events, session),
    );

    assert.deepEqual(result, {
      target: "legacy",
      configSource: "fetched",
      reason: "white-screen-probe-failed",
    });
    assert.equal(events.includes("dispose"), true);
    assert.equal(events.includes("marker-clear"), false);
  });

  test("five-second watchdog owns a stalled bridge and disposes the mounted runtime", async () => {
    const scheduler = new ManualScheduler();
    const events: string[] = [];
    const hangingBridge = deferred<void>();
    const session = makeSession(events, {
      waitForBridgeHandshake: () => {
        events.push("bridge");
        return hangingBridge.promise;
      },
    });
    const resultPromise = bootSelectedRuntime(
      gameSelection,
      makeBootPorts(scheduler, events, session),
    );

    await flushMicrotasks();
    scheduler.fire(GAME_BOOT_WATCHDOG_MS);
    const result = await resultPromise;

    assert.deepEqual(result, {
      target: "legacy",
      configSource: "fetched",
      reason: "runtime-watchdog-timeout",
    });
    assert.equal(events.includes("dispose"), true);
    assert.equal(events.includes("marker-clear"), false);
  });
});
