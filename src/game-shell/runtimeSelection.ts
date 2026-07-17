/**
 * Lightweight host-owned runtime selection.
 *
 * This module deliberately has no React, engine, Firebase, Storage, AsyncStorage,
 * or localStorage dependency. AIT and native hosts provide those capabilities via
 * ports so the kill switch and recovery path remain outside the game chunk.
 */

export const BUNDLED_GAME_RUNTIME_ENABLED = false as const;
export const RUNTIME_CONFIG_TIMEOUT_MS = 2_000;
export const RUNTIME_CACHE_TIMEOUT_MS = 250;
export const BOOT_MARKER_ACK_TIMEOUT_MS = 1_000;
export const GAME_BOOT_WATCHDOG_MS = 5_000;
export const GAME_BOOT_PENDING_KEY = "game_boot_pending";

export type GameRuntimeHostKind = "web" | "apps-in-toss" | "native-webview";

export function isGameRuntimeHostSupported(
  hostKind: GameRuntimeHostKind,
): boolean {
  return hostKind === "web" || hostKind === "apps-in-toss";
}

export type RuntimeConfigSource = "fetched" | "cache" | "bundled";

export type RuntimeSelectionDiagnostic =
  | "fetch-timeout"
  | "fetch-failed"
  | "fetched-invalid"
  | "cache-read-failed"
  | "cache-read-timeout"
  | "cache-missing"
  | "cache-invalid";

export type RuntimeLegacyReason =
  | "previous-boot-pending"
  | "pending-marker-invalid"
  | "pending-marker-read-timeout"
  | "pending-marker-read-failed"
  | "host-adapter-unavailable"
  | "fetched-disabled"
  | "cached-disabled"
  | "bundled-disabled";

export type RuntimeBootLegacyReason =
  | RuntimeLegacyReason
  | "boot-marker-create-failed"
  | "boot-marker-write-timeout"
  | "boot-marker-write-failed"
  | "runtime-import-failed"
  | "webgl-context-failed"
  | "bridge-handshake-failed"
  | "interactive-ack-failed"
  | "white-screen-probe-failed"
  | "boot-marker-clear-failed"
  | "runtime-watchdog-timeout";

export interface RuntimeBootPendingMarker {
  schemaVersion: 1;
  bootId: string;
  createdAtEpochMs: number;
}

export interface ValidatedRuntimeConfigSnapshot {
  gameRuntimeEnabled: boolean;
}

export interface RuntimeSchedulerPort {
  /** Schedule a deadline and return a cancellation function. */
  schedule(delayMs: number, onElapsed: () => void): () => void;
}

export interface RuntimeSelectionPorts {
  scheduler: RuntimeSchedulerPort;
  /** Returns a parsed marker, null when absent, or an unknown corrupt value. */
  readPendingBootMarker(): Promise<unknown | null>;
  fetchRuntimeConfig(): Promise<unknown>;
  readCachedRuntimeConfig(): Promise<unknown | null>;
  /** Must verify schema and authenticity before returning a snapshot. */
  validateRuntimeConfig(
    candidate: unknown,
    source: Exclude<RuntimeConfigSource, "bundled">,
  ):
    | ValidatedRuntimeConfigSnapshot
    | null
    | Promise<ValidatedRuntimeConfigSnapshot | null>;
}

interface RuntimeSelectionBase {
  diagnostics: readonly RuntimeSelectionDiagnostic[];
}

export interface GameRuntimeSelection extends RuntimeSelectionBase {
  target: "game";
  configSource: "fetched" | "cache";
}

export interface LegacyRuntimeSelection extends RuntimeSelectionBase {
  target: "legacy";
  reason: RuntimeLegacyReason;
  configSource: RuntimeConfigSource | null;
}

export type RuntimeSelection = GameRuntimeSelection | LegacyRuntimeSelection;

export interface GameRuntimeSession {
  /** Resolves only after the engine has obtained a usable WebGL context. */
  waitForWebGlContext(): Promise<void>;
  /** Resolves only after the AIT/native bridge handshake has completed. */
  waitForBridgeHandshake(): Promise<void>;
  /** Resolves on the first host-observed interactive acknowledgement. */
  waitForFirstInteractiveAck(): Promise<void>;
  /** False means the mounted surface is blank or otherwise not visible. */
  probeVisibleSurface(): boolean | Promise<boolean>;
  dispose(): void | Promise<void>;
}

export interface RuntimeBootPorts {
  scheduler: RuntimeSchedulerPort;
  createBootId(): string;
  nowEpochMs(): number;
  /** Resolving this promise is the durable Storage/AsyncStorage acknowledgement. */
  writePendingBootMarker(marker: RuntimeBootPendingMarker): Promise<void>;
  /** Resolving this promise is the durable marker removal acknowledgement. */
  clearPendingBootMarker(): Promise<void>;
  /** Dynamic import and mount belong behind this host-owned port. */
  importGameRuntime(): Promise<unknown>;
}

export interface GameRuntimeBootResult {
  target: "game";
  configSource: "fetched" | "cache";
  bootId: string;
  session: GameRuntimeSession;
}

export interface LegacyRuntimeBootResult {
  target: "legacy";
  configSource: RuntimeConfigSource | null;
  reason: RuntimeBootLegacyReason;
}

export type RuntimeBootResult = GameRuntimeBootResult | LegacyRuntimeBootResult;

export interface RuntimeSelectionOptions {
  configTimeoutMs?: number;
  cacheTimeoutMs?: number;
  markerReadTimeoutMs?: number;
}

export interface RuntimeBootOptions {
  markerAckTimeoutMs?: number;
  watchdogMs?: number;
}

type DeadlineResult<T> =
  | { status: "resolved"; value: T }
  | { status: "rejected" }
  | { status: "timeout" };

function settleWithin<T>(
  task: Promise<T>,
  timeoutMs: number,
  scheduler: RuntimeSchedulerPort,
): Promise<DeadlineResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    let cancelDeadline = () => {};

    const finish = (result: DeadlineResult<T>) => {
      if (settled) {
        return;
      }
      settled = true;
      cancelDeadline();
      resolve(result);
    };

    // Attach rejection handling before asking the host to schedule a deadline.
    void Promise.resolve(task).then(
      (value) => finish({ status: "resolved", value }),
      () => finish({ status: "rejected" }),
    );

    try {
      cancelDeadline = scheduler.schedule(timeoutMs, () =>
        finish({ status: "timeout" }),
      );
    } catch {
      finish({ status: "rejected" });
    }
  });
}

export function isRuntimeBootPendingMarker(
  candidate: unknown,
): candidate is RuntimeBootPendingMarker {
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }

  const marker = candidate as Partial<RuntimeBootPendingMarker>;
  return (
    marker.schemaVersion === 1 &&
    typeof marker.bootId === "string" &&
    marker.bootId.length > 0 &&
    typeof marker.createdAtEpochMs === "number" &&
    Number.isFinite(marker.createdAtEpochMs) &&
    marker.createdAtEpochMs >= 0
  );
}

function isValidatedRuntimeConfigSnapshot(
  candidate: unknown,
): candidate is ValidatedRuntimeConfigSnapshot {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as Partial<ValidatedRuntimeConfigSnapshot>)
      .gameRuntimeEnabled === "boolean"
  );
}

async function validateSnapshot(
  ports: RuntimeSelectionPorts,
  candidate: unknown,
  source: "fetched" | "cache",
): Promise<ValidatedRuntimeConfigSnapshot | null> {
  try {
    const validated = await ports.validateRuntimeConfig(candidate, source);
    return isValidatedRuntimeConfigSnapshot(validated) ? validated : null;
  } catch {
    return null;
  }
}

function configDecision(
  snapshot: ValidatedRuntimeConfigSnapshot,
  source: "fetched" | "cache",
  diagnostics: readonly RuntimeSelectionDiagnostic[],
): RuntimeSelection {
  if (snapshot.gameRuntimeEnabled) {
    return { target: "game", configSource: source, diagnostics };
  }

  return {
    target: "legacy",
    configSource: source,
    reason: source === "fetched" ? "fetched-disabled" : "cached-disabled",
    diagnostics,
  };
}

/**
 * Resolves the kill switch before any game chunk import is possible.
 * A previous durable pending marker always wins over fetched or cached ON.
 */
export async function resolveRuntimeSelection(
  ports: RuntimeSelectionPorts,
  options: RuntimeSelectionOptions = {},
): Promise<RuntimeSelection> {
  const configTimeoutMs = options.configTimeoutMs ?? RUNTIME_CONFIG_TIMEOUT_MS;
  const cacheTimeoutMs = options.cacheTimeoutMs ?? RUNTIME_CACHE_TIMEOUT_MS;
  const markerReadTimeoutMs =
    options.markerReadTimeoutMs ?? BOOT_MARKER_ACK_TIMEOUT_MS;

  let markerTask: Promise<unknown | null>;
  try {
    markerTask = ports.readPendingBootMarker();
  } catch {
    return {
      target: "legacy",
      configSource: null,
      reason: "pending-marker-read-failed",
      diagnostics: [],
    };
  }

  const markerResult = await settleWithin(
    markerTask,
    markerReadTimeoutMs,
    ports.scheduler,
  );
  if (markerResult.status === "timeout") {
    return {
      target: "legacy",
      configSource: null,
      reason: "pending-marker-read-timeout",
      diagnostics: [],
    };
  }
  if (markerResult.status === "rejected") {
    return {
      target: "legacy",
      configSource: null,
      reason: "pending-marker-read-failed",
      diagnostics: [],
    };
  }
  if (markerResult.value !== null) {
    return {
      target: "legacy",
      configSource: null,
      reason: isRuntimeBootPendingMarker(markerResult.value)
        ? "previous-boot-pending"
        : "pending-marker-invalid",
      diagnostics: [],
    };
  }

  const diagnostics: RuntimeSelectionDiagnostic[] = [];
  let fetchedTask: Promise<ValidatedRuntimeConfigSnapshot | null>;
  try {
    fetchedTask = Promise.resolve(ports.fetchRuntimeConfig()).then(
      (candidate) => validateSnapshot(ports, candidate, "fetched"),
    );
  } catch {
    fetchedTask = Promise.reject(new Error("fetch failed"));
  }

  const fetchedResult = await settleWithin(
    fetchedTask,
    configTimeoutMs,
    ports.scheduler,
  );
  if (fetchedResult.status === "resolved" && fetchedResult.value !== null) {
    return configDecision(fetchedResult.value, "fetched", diagnostics);
  }
  if (fetchedResult.status === "timeout") {
    diagnostics.push("fetch-timeout");
  } else if (fetchedResult.status === "rejected") {
    diagnostics.push("fetch-failed");
  } else {
    diagnostics.push("fetched-invalid");
  }

  let cachedTask: Promise<unknown | null>;
  try {
    cachedTask = ports.readCachedRuntimeConfig();
  } catch {
    diagnostics.push("cache-read-failed");
    return {
      target: "legacy",
      configSource: "bundled",
      reason: "bundled-disabled",
      diagnostics,
    };
  }

  const cachedResult = await settleWithin(
    cachedTask,
    cacheTimeoutMs,
    ports.scheduler,
  );
  if (cachedResult.status !== "resolved") {
    diagnostics.push(
      cachedResult.status === "timeout"
        ? "cache-read-timeout"
        : "cache-read-failed",
    );
    return {
      target: "legacy",
      configSource: "bundled",
      reason: "bundled-disabled",
      diagnostics,
    };
  }
  const cachedCandidate = cachedResult.value;

  if (cachedCandidate === null) {
    diagnostics.push("cache-missing");
  } else {
    const cachedSnapshot = await validateSnapshot(
      ports,
      cachedCandidate,
      "cache",
    );
    if (cachedSnapshot !== null) {
      return configDecision(cachedSnapshot, "cache", diagnostics);
    }
    diagnostics.push("cache-invalid");
  }

  // The bundled value is intentionally not configurable at call sites.
  return {
    target: "legacy",
    configSource: "bundled",
    reason: "bundled-disabled",
    diagnostics,
  };
}

function isGameRuntimeSession(
  candidate: unknown,
): candidate is GameRuntimeSession {
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }

  const session = candidate as Partial<GameRuntimeSession>;
  return (
    typeof session.waitForWebGlContext === "function" &&
    typeof session.waitForBridgeHandshake === "function" &&
    typeof session.waitForFirstInteractiveAck === "function" &&
    typeof session.probeVisibleSurface === "function" &&
    typeof session.dispose === "function"
  );
}

type BootStage =
  | "runtime-import"
  | "webgl-context"
  | "bridge-handshake"
  | "interactive-ack"
  | "white-screen-probe"
  | "boot-marker-clear";

function reasonForStage(stage: BootStage): RuntimeBootLegacyReason {
  switch (stage) {
    case "runtime-import":
      return "runtime-import-failed";
    case "webgl-context":
      return "webgl-context-failed";
    case "bridge-handshake":
      return "bridge-handshake-failed";
    case "interactive-ack":
      return "interactive-ack-failed";
    case "white-screen-probe":
      return "white-screen-probe-failed";
    case "boot-marker-clear":
      return "boot-marker-clear-failed";
  }
}

async function disposeSafely(
  session: GameRuntimeSession | null,
): Promise<void> {
  if (session === null) {
    return;
  }
  try {
    await session.dispose();
  } catch {
    // Disposal must never prevent the host from rendering legacy in this session.
  }
}

/**
 * Boots a selected game under a host-owned watchdog. Any failure returns a
 * legacy decision and leaves the pending marker in place for next-launch
 * recovery. The marker is cleared only after context, bridge, interactivity,
 * and visible-surface checks all succeed.
 */
export async function bootSelectedRuntime(
  selection: RuntimeSelection,
  ports: RuntimeBootPorts,
  options: RuntimeBootOptions = {},
): Promise<RuntimeBootResult> {
  if (selection.target === "legacy") {
    return {
      target: "legacy",
      configSource: selection.configSource,
      reason: selection.reason,
    };
  }

  const markerAckTimeoutMs =
    options.markerAckTimeoutMs ?? BOOT_MARKER_ACK_TIMEOUT_MS;
  const watchdogMs = options.watchdogMs ?? GAME_BOOT_WATCHDOG_MS;

  let marker: RuntimeBootPendingMarker;
  try {
    marker = {
      schemaVersion: 1,
      bootId: ports.createBootId(),
      createdAtEpochMs: ports.nowEpochMs(),
    };
  } catch {
    return {
      target: "legacy",
      configSource: selection.configSource,
      reason: "boot-marker-create-failed",
    };
  }
  if (!isRuntimeBootPendingMarker(marker)) {
    return {
      target: "legacy",
      configSource: selection.configSource,
      reason: "boot-marker-create-failed",
    };
  }

  let markerWriteTask: Promise<void>;
  try {
    markerWriteTask = ports.writePendingBootMarker(marker);
  } catch {
    return {
      target: "legacy",
      configSource: selection.configSource,
      reason: "boot-marker-write-failed",
    };
  }
  const markerWriteResult = await settleWithin(
    markerWriteTask,
    markerAckTimeoutMs,
    ports.scheduler,
  );
  if (markerWriteResult.status !== "resolved") {
    return {
      target: "legacy",
      configSource: selection.configSource,
      reason:
        markerWriteResult.status === "timeout"
          ? "boot-marker-write-timeout"
          : "boot-marker-write-failed",
    };
  }

  let stage: BootStage = "runtime-import";
  let session: GameRuntimeSession | null = null;
  let cancelled = false;
  let disposed = false;

  const disposeOnce = async () => {
    if (disposed) {
      return;
    }
    disposed = true;
    await disposeSafely(session);
  };

  const assertActive = async (candidate?: GameRuntimeSession) => {
    if (!cancelled) {
      return;
    }
    if (candidate !== undefined && session === null) {
      session = candidate;
    }
    await disposeOnce();
    throw new Error("host boot cancelled");
  };

  const bootPipeline = (async (): Promise<GameRuntimeSession> => {
    const imported = await ports.importGameRuntime();
    if (!isGameRuntimeSession(imported)) {
      throw new Error("invalid runtime module");
    }
    await assertActive(imported);
    session = imported;

    stage = "webgl-context";
    await session.waitForWebGlContext();
    await assertActive();

    stage = "bridge-handshake";
    await session.waitForBridgeHandshake();
    await assertActive();

    stage = "interactive-ack";
    await session.waitForFirstInteractiveAck();
    await assertActive();

    stage = "white-screen-probe";
    if (!(await session.probeVisibleSurface())) {
      throw new Error("invisible runtime surface");
    }
    await assertActive();

    stage = "boot-marker-clear";
    await ports.clearPendingBootMarker();
    await assertActive();
    return session;
  })();

  const bootResult = await settleWithin(
    bootPipeline,
    watchdogMs,
    ports.scheduler,
  );
  if (bootResult.status === "resolved") {
    return {
      target: "game",
      configSource: selection.configSource,
      bootId: marker.bootId,
      session: bootResult.value,
    };
  }

  cancelled = true;
  await disposeOnce();
  return {
    target: "legacy",
    configSource: selection.configSource,
    reason:
      bootResult.status === "timeout"
        ? "runtime-watchdog-timeout"
        : reasonForStage(stage),
  };
}
