/**
 * SDK-free `game_bridge_v1` protocol and coordinator.
 *
 * The bridge deliberately owns no logger. Payloads can contain save data, so validation
 * failures and handler failures are represented by bounded error codes only.
 */

export const GAME_BRIDGE_VERSION = "game_bridge_v1" as const;

export type GameBridgeVersion = typeof GAME_BRIDGE_VERSION;

export type GameBridgeRole = "game" | "host";

export type GameBridgeCapability =
  | "storage"
  | "analytics"
  | "ad"
  | "haptic"
  | "notification"
  | "lifecycle"
  | "focus"
  | "config"
  | "locale"
  | "navigation";

export type GameBridgeDeepLinkRoute =
  | "map"
  | "today"
  | "collection"
  | "archive"
  | "settings"
  | "puzzle";

export type GameBridgeNotificationOutcome =
  | "newAgreement"
  | "alreadyAgreed"
  | "agreementRejected"
  | "unsupported"
  | "cancelled";

export type GameBridgeMethod =
  | "storage.get"
  | "storage.set"
  | "storage.remove"
  | "analytics.log"
  | "ad.load"
  | "ad.show"
  | "haptic.play"
  | "notification.request"
  | "app.pause"
  | "app.resume"
  | "app.focus"
  | "app.blur"
  | "config.snapshot"
  | "locale.preferred"
  | "deep_link";

export type GameBridgeJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly GameBridgeJsonValue[]
  | { readonly [key: string]: GameBridgeJsonValue };

export type GameBridgeAnalyticsParam = string | number | boolean;

export type GameBridgeMethodPayloads = {
  "storage.get": {
    key: string;
    schemaVersion: string;
  };
  "storage.set": {
    key: string;
    schemaVersion: string;
    value: GameBridgeJsonValue;
    transactionId: string;
  };
  "storage.remove": {
    key: string;
    schemaVersion: string;
    transactionId: string;
  };
  "analytics.log": {
    event: string;
    params: Readonly<Record<string, GameBridgeAnalyticsParam>>;
    eventId: string;
  };
  "ad.load": {
    placement: string;
    transactionId: string;
  };
  "ad.show": {
    placement: string;
    transactionId: string;
  };
  "haptic.play": {
    semanticType:
      | "selection"
      | "success"
      | "warning"
      | "error"
      | "light"
      | "medium"
      | "heavy";
  };
  "notification.request": {
    reason: string;
  };
  "app.pause": { timestamp: number };
  "app.resume": { timestamp: number };
  "app.focus": { timestamp: number };
  "app.blur": { timestamp: number };
  "config.snapshot": {
    version: string;
    values: Readonly<Record<string, GameBridgeJsonValue>>;
  };
  "locale.preferred": {
    locales: readonly string[];
  };
  deep_link: {
    route: GameBridgeDeepLinkRoute;
    puzzleId?: string;
  };
};

export type GameBridgeAdState =
  | "loading"
  | "loaded"
  | "showing"
  | "shown"
  | "rewarded"
  | "dismissed"
  | "unavailable";

export type GameBridgeMethodResults = {
  "storage.get":
    | { found: false }
    | {
        found: true;
        schemaVersion: string;
        value: GameBridgeJsonValue;
      };
  "storage.set": { stored: true; transactionId: string };
  "storage.remove": { removed: true; transactionId: string };
  "analytics.log": { ack: true };
  "ad.load": { transactionId: string; state: GameBridgeAdState };
  "ad.show": { transactionId: string; state: GameBridgeAdState };
  "haptic.play": { ack: true };
  "notification.request": { outcome: GameBridgeNotificationOutcome };
  "app.pause": { ack: true };
  "app.resume": { ack: true };
  "app.focus": { ack: true };
  "app.blur": { ack: true };
  "config.snapshot": { ack: true };
  "locale.preferred": { uiLocale: string };
  deep_link: { navigated: boolean; route: GameBridgeDeepLinkRoute };
};

export type GameBridgeErrorCode =
  | "cancelled"
  | "capability-unavailable"
  | "handler-failed"
  | "handler-unavailable"
  | "handshake-required"
  | "idempotency-conflict"
  | "invalid-message"
  | "invalid-payload"
  | "invalid-session"
  | "method-not-allowed"
  | "session-replaced"
  | "timeout"
  | "transport-error"
  | "unsupported-version";

export type GameBridgeError = Readonly<{
  code: GameBridgeErrorCode;
  retryable: boolean;
}>;

type GameBridgeEnvelope = Readonly<{
  bridgeVersion: GameBridgeVersion;
  messageId: string;
  sessionId: string;
  timestamp: number;
}>;

export type GameBridgeHandshakeMessage = GameBridgeEnvelope &
  Readonly<{
    kind: "handshake";
    role: GameBridgeRole;
    capabilities: readonly GameBridgeCapability[];
  }>;

export type GameBridgeHandshakeAckMessage = GameBridgeEnvelope &
  Readonly<{
    kind: "handshake-ack";
    requestId: string;
    role: GameBridgeRole;
    status: "result";
    negotiatedCapabilities: readonly GameBridgeCapability[];
  }>;

export type GameBridgeRequestMessage<
  M extends GameBridgeMethod = GameBridgeMethod,
> = GameBridgeEnvelope &
  Readonly<{
    kind: "request";
    method: M;
    payload: GameBridgeMethodPayloads[M];
  }>;

export type GameBridgeResultResponse<
  M extends GameBridgeMethod = GameBridgeMethod,
> = GameBridgeEnvelope &
  Readonly<{
    kind: "response";
    requestId: string;
    method: M;
    status: "result";
    result: GameBridgeMethodResults[M];
  }>;

export type GameBridgeErrorResponse<
  M extends GameBridgeMethod = GameBridgeMethod,
> = GameBridgeEnvelope &
  Readonly<{
    kind: "response";
    requestId: string;
    method: M;
    status: "error";
    error: GameBridgeError;
  }>;

export type GameBridgeResponse<M extends GameBridgeMethod = GameBridgeMethod> =
  | GameBridgeResultResponse<M>
  | GameBridgeErrorResponse<M>;

export type GameBridgeMessage =
  | GameBridgeHandshakeMessage
  | GameBridgeHandshakeAckMessage
  | GameBridgeRequestMessage
  | GameBridgeResponse;

export type GameBridgeHandlerContext = Readonly<{
  requestId: string;
  sessionId: string;
  timestamp: number;
}>;

export type GameBridgeHandler<M extends GameBridgeMethod> = (
  payload: GameBridgeMethodPayloads[M],
  context: GameBridgeHandlerContext,
) => GameBridgeMethodResults[M] | Promise<GameBridgeMethodResults[M]>;

export type GameBridgeHandlers = {
  [M in GameBridgeMethod]?: GameBridgeHandler<M>;
};

export type GameBridgeTransport = Readonly<{
  send(message: GameBridgeMessage): void | Promise<void>;
}>;

export type GameBridgeTimer = Readonly<{
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}>;

export type GameBridgeState = "idle" | "handshaking" | "ready" | "rejected";

export type GameBridgeSnapshot = Readonly<{
  state: GameBridgeState;
  role: GameBridgeRole;
  sessionId: string | null;
  negotiatedCapabilities: readonly GameBridgeCapability[];
}>;

export type GameBridgeReceiveReason =
  | "accepted"
  | "duplicate-request"
  | "duplicate-response"
  | "handshake-required"
  | "idempotency-conflict"
  | "invalid-message"
  | "invalid-payload"
  | "method-not-allowed"
  | "role-conflict"
  | "stale-session"
  | "unexpected-handshake-ack"
  | "unexpected-response"
  | "unsupported-capability"
  | "unsupported-version";

export type GameBridgeReceiveResult = Readonly<{
  accepted: boolean;
  reason: GameBridgeReceiveReason;
}>;

export type GameBridgeCoordinatorOptions = Readonly<{
  role: GameBridgeRole;
  capabilities: readonly GameBridgeCapability[];
  transport: GameBridgeTransport;
  handlers?: GameBridgeHandlers;
  defaultTimeoutMs?: number;
  maxMessageBytes?: number;
  maxReplayEntries?: number;
  now?: () => number;
  createMessageId?: () => string;
  timer?: GameBridgeTimer;
}>;

type ValidationResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason: "invalid-message" | "invalid-payload" | "unsupported-version";
    };

type PendingRequest = {
  request: GameBridgeRequestMessage;
  resolve: (response: GameBridgeResponse) => void;
  timerHandle: unknown;
};

type CachedRequest = {
  response: Promise<GameBridgeResponse>;
};

type IdempotencyRecord = {
  signature: string;
  outcome: Promise<HandlerOutcome>;
};

type HandlerOutcome =
  | { status: "result"; result: GameBridgeMethodResults[GameBridgeMethod] }
  | { status: "error"; error: GameBridgeError };

const CAPABILITIES = [
  "storage",
  "analytics",
  "ad",
  "haptic",
  "notification",
  "lifecycle",
  "focus",
  "config",
  "locale",
  "navigation",
] as const satisfies readonly GameBridgeCapability[];

const METHODS = [
  "storage.get",
  "storage.set",
  "storage.remove",
  "analytics.log",
  "ad.load",
  "ad.show",
  "haptic.play",
  "notification.request",
  "app.pause",
  "app.resume",
  "app.focus",
  "app.blur",
  "config.snapshot",
  "locale.preferred",
  "deep_link",
] as const satisfies readonly GameBridgeMethod[];

const CAPABILITY_SET = new Set<string>(CAPABILITIES);
const METHOD_SET = new Set<string>(METHODS);
const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_REPLAY_ENTRIES = 256;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const EVENT_PATTERN = /^[a-z][a-z0-9_]*$/;
const BCP_47_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const HAPTIC_TYPES = new Set([
  "selection",
  "success",
  "warning",
  "error",
  "light",
  "medium",
  "heavy",
]);
const AD_LOAD_STATES = new Set<GameBridgeAdState>([
  "loading",
  "loaded",
  "unavailable",
]);
const AD_SHOW_STATES = new Set<GameBridgeAdState>([
  "showing",
  "shown",
  "rewarded",
  "dismissed",
  "unavailable",
]);
const NOTIFICATION_OUTCOMES = new Set<GameBridgeNotificationOutcome>([
  "newAgreement",
  "alreadyAgreed",
  "agreementRejected",
  "unsupported",
  "cancelled",
]);
const DEEP_LINK_ROUTES = new Set<GameBridgeDeepLinkRoute>([
  "map",
  "today",
  "collection",
  "archive",
  "settings",
  "puzzle",
]);

const METHOD_CAPABILITY: Readonly<
  Record<GameBridgeMethod, GameBridgeCapability>
> = {
  "storage.get": "storage",
  "storage.set": "storage",
  "storage.remove": "storage",
  "analytics.log": "analytics",
  "ad.load": "ad",
  "ad.show": "ad",
  "haptic.play": "haptic",
  "notification.request": "notification",
  "app.pause": "lifecycle",
  "app.resume": "lifecycle",
  "app.focus": "focus",
  "app.blur": "focus",
  "config.snapshot": "config",
  "locale.preferred": "locale",
  deep_link: "navigation",
};

const GAME_TO_HOST_METHODS = new Set<GameBridgeMethod>([
  "storage.get",
  "storage.set",
  "storage.remove",
  "analytics.log",
  "ad.load",
  "ad.show",
  "haptic.play",
  "notification.request",
]);

const HOST_TO_GAME_METHODS = new Set<GameBridgeMethod>([
  "app.pause",
  "app.resume",
  "app.focus",
  "app.blur",
  "config.snapshot",
  "locale.preferred",
  "deep_link",
]);

const RETRYABLE_ERRORS = new Set<GameBridgeErrorCode>([
  "handler-failed",
  "handler-unavailable",
  "handshake-required",
  "session-replaced",
  "timeout",
  "transport-error",
]);

function errorValue(code: GameBridgeErrorCode): GameBridgeError {
  return Object.freeze({ code, retryable: RETRYABLE_ERRORS.has(code) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

function isBoundedString(
  value: unknown,
  maxLength: number,
  pattern?: RegExp,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    (pattern == null || pattern.test(value))
  );
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isIdentifier(value: unknown): value is string {
  return isBoundedString(value, 128, IDENTIFIER_PATTERN);
}

function isCapability(value: unknown): value is GameBridgeCapability {
  return typeof value === "string" && CAPABILITY_SET.has(value);
}

function isMethod(value: unknown): value is GameBridgeMethod {
  return typeof value === "string" && METHOD_SET.has(value);
}

function isRole(value: unknown): value is GameBridgeRole {
  return value === "game" || value === "host";
}

function isCapabilityList(value: unknown): value is GameBridgeCapability[] {
  return (
    Array.isArray(value) &&
    value.length <= CAPABILITIES.length &&
    value.every(isCapability) &&
    new Set(value).size === value.length
  );
}

function isJsonValue(value: unknown, depth = 0): value is GameBridgeJsonValue {
  if (depth > 16) {
    return false;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return typeof value !== "string" || value.length <= 32_768;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return (
      value.length <= 512 && value.every((item) => isJsonValue(item, depth + 1))
    );
  }
  if (!isRecord(value) || Object.keys(value).length > 512) {
    return false;
  }
  return Object.entries(value).every(
    ([key, item]) =>
      key.length > 0 && key.length <= 128 && isJsonValue(item, depth + 1),
  );
}

function isAnalyticsParams(
  value: unknown,
): value is Readonly<Record<string, GameBridgeAnalyticsParam>> {
  if (!isRecord(value) || Object.keys(value).length > 64) {
    return false;
  }
  return Object.entries(value).every(
    ([key, item]) =>
      EVENT_PATTERN.test(key) &&
      key.length <= 64 &&
      ((typeof item === "string" && item.length <= 256) ||
        (typeof item === "number" && Number.isFinite(item)) ||
        typeof item === "boolean"),
  );
}

function isConfigValues(
  value: unknown,
): value is Readonly<Record<string, GameBridgeJsonValue>> {
  return (
    isRecord(value) &&
    Object.keys(value).length <= 128 &&
    Object.entries(value).every(
      ([key, item]) => key.length > 0 && key.length <= 128 && isJsonValue(item),
    )
  );
}

function isLocaleList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 16 &&
    value.every(
      (locale) =>
        typeof locale === "string" &&
        locale.length <= 35 &&
        BCP_47_PATTERN.test(locale),
    ) &&
    new Set(value.map((locale) => locale.toLowerCase())).size === value.length
  );
}

function isDeepLinkRoute(value: unknown): value is GameBridgeDeepLinkRoute {
  return (
    typeof value === "string" &&
    DEEP_LINK_ROUTES.has(value as GameBridgeDeepLinkRoute)
  );
}

function validatePayload<M extends GameBridgeMethod>(
  method: M,
  payload: unknown,
): payload is GameBridgeMethodPayloads[M] {
  if (!isRecord(payload)) {
    return false;
  }

  switch (method) {
    case "storage.get":
      return (
        hasExactKeys(payload, ["key", "schemaVersion"]) &&
        isBoundedString(payload.key, 256) &&
        isBoundedString(payload.schemaVersion, 64, IDENTIFIER_PATTERN)
      );
    case "storage.set":
      return (
        hasExactKeys(payload, [
          "key",
          "schemaVersion",
          "value",
          "transactionId",
        ]) &&
        isBoundedString(payload.key, 256) &&
        isBoundedString(payload.schemaVersion, 64, IDENTIFIER_PATTERN) &&
        isJsonValue(payload.value) &&
        isIdentifier(payload.transactionId)
      );
    case "storage.remove":
      return (
        hasExactKeys(payload, ["key", "schemaVersion", "transactionId"]) &&
        isBoundedString(payload.key, 256) &&
        isBoundedString(payload.schemaVersion, 64, IDENTIFIER_PATTERN) &&
        isIdentifier(payload.transactionId)
      );
    case "analytics.log":
      return (
        hasExactKeys(payload, ["event", "params", "eventId"]) &&
        isBoundedString(payload.event, 64, EVENT_PATTERN) &&
        isAnalyticsParams(payload.params) &&
        isIdentifier(payload.eventId)
      );
    case "ad.load":
    case "ad.show":
      return (
        hasExactKeys(payload, ["placement", "transactionId"]) &&
        isBoundedString(payload.placement, 128, IDENTIFIER_PATTERN) &&
        isIdentifier(payload.transactionId)
      );
    case "haptic.play":
      return (
        hasExactKeys(payload, ["semanticType"]) &&
        typeof payload.semanticType === "string" &&
        HAPTIC_TYPES.has(payload.semanticType)
      );
    case "notification.request":
      return (
        hasExactKeys(payload, ["reason"]) &&
        isBoundedString(payload.reason, 128, IDENTIFIER_PATTERN)
      );
    case "app.pause":
    case "app.resume":
    case "app.focus":
    case "app.blur":
      return (
        hasExactKeys(payload, ["timestamp"]) && isTimestamp(payload.timestamp)
      );
    case "config.snapshot":
      return (
        hasExactKeys(payload, ["version", "values"]) &&
        isBoundedString(payload.version, 64, IDENTIFIER_PATTERN) &&
        isConfigValues(payload.values)
      );
    case "locale.preferred":
      return (
        hasExactKeys(payload, ["locales"]) && isLocaleList(payload.locales)
      );
    case "deep_link":
      return (
        hasExactKeys(payload, ["route"], ["puzzleId"]) &&
        isDeepLinkRoute(payload.route) &&
        (payload.route === "puzzle"
          ? isIdentifier(payload.puzzleId)
          : payload.puzzleId === undefined)
      );
  }
  return false;
}

function validateResult<M extends GameBridgeMethod>(
  method: M,
  result: unknown,
): result is GameBridgeMethodResults[M] {
  if (!isRecord(result)) {
    return false;
  }

  switch (method) {
    case "storage.get":
      if (result.found === false) {
        return hasExactKeys(result, ["found"]);
      }
      return (
        hasExactKeys(result, ["found", "schemaVersion", "value"]) &&
        result.found === true &&
        isBoundedString(result.schemaVersion, 64, IDENTIFIER_PATTERN) &&
        isJsonValue(result.value)
      );
    case "storage.set":
      return (
        hasExactKeys(result, ["stored", "transactionId"]) &&
        result.stored === true &&
        isIdentifier(result.transactionId)
      );
    case "storage.remove":
      return (
        hasExactKeys(result, ["removed", "transactionId"]) &&
        result.removed === true &&
        isIdentifier(result.transactionId)
      );
    case "analytics.log":
    case "haptic.play":
    case "app.pause":
    case "app.resume":
    case "app.focus":
    case "app.blur":
    case "config.snapshot":
      return hasExactKeys(result, ["ack"]) && result.ack === true;
    case "notification.request":
      return (
        hasExactKeys(result, ["outcome"]) &&
        typeof result.outcome === "string" &&
        NOTIFICATION_OUTCOMES.has(
          result.outcome as GameBridgeNotificationOutcome,
        )
      );
    case "ad.load":
      return (
        hasExactKeys(result, ["transactionId", "state"]) &&
        isIdentifier(result.transactionId) &&
        typeof result.state === "string" &&
        AD_LOAD_STATES.has(result.state as GameBridgeAdState)
      );
    case "ad.show":
      return (
        hasExactKeys(result, ["transactionId", "state"]) &&
        isIdentifier(result.transactionId) &&
        typeof result.state === "string" &&
        AD_SHOW_STATES.has(result.state as GameBridgeAdState)
      );
    case "locale.preferred":
      return (
        hasExactKeys(result, ["uiLocale"]) &&
        typeof result.uiLocale === "string" &&
        result.uiLocale.length <= 35 &&
        BCP_47_PATTERN.test(result.uiLocale)
      );
    case "deep_link":
      return (
        hasExactKeys(result, ["navigated", "route"]) &&
        typeof result.navigated === "boolean" &&
        isDeepLinkRoute(result.route)
      );
  }
  return false;
}

function isBridgeError(value: unknown): value is GameBridgeError {
  if (!isRecord(value) || !hasExactKeys(value, ["code", "retryable"])) {
    return false;
  }
  return (
    typeof value.code === "string" &&
    [
      "cancelled",
      "capability-unavailable",
      "handler-failed",
      "handler-unavailable",
      "handshake-required",
      "idempotency-conflict",
      "invalid-message",
      "invalid-payload",
      "invalid-session",
      "method-not-allowed",
      "session-replaced",
      "timeout",
      "transport-error",
      "unsupported-version",
    ].includes(value.code) &&
    typeof value.retryable === "boolean" &&
    value.retryable === RETRYABLE_ERRORS.has(value.code as GameBridgeErrorCode)
  );
}

function validateBase(value: Record<string, unknown>): boolean {
  return (
    value.bridgeVersion === GAME_BRIDGE_VERSION &&
    isIdentifier(value.messageId) &&
    isIdentifier(value.sessionId) &&
    isTimestamp(value.timestamp)
  );
}

function getUtf8ByteLength(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit < 0x80) {
      length += 1;
    } else if (codeUnit < 0x800) {
      length += 2;
    } else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < value.length
    ) {
      const trailing = value.charCodeAt(index + 1);
      if (trailing >= 0xdc00 && trailing <= 0xdfff) {
        length += 4;
        index += 1;
      } else {
        length += 3;
      }
    } else {
      length += 3;
    }
  }
  return length;
}

/** Runtime decoder used at the untrusted WebView boundary. */
export function decodeGameBridgeMessage(
  rawInput: unknown,
  maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES,
): ValidationResult<GameBridgeMessage> {
  let encoded: string | undefined;
  let normalized: unknown;
  try {
    encoded = JSON.stringify(rawInput);
    if (typeof encoded !== "string") {
      return { ok: false, reason: "invalid-message" };
    }
    normalized = JSON.parse(encoded) as unknown;
  } catch {
    return { ok: false, reason: "invalid-message" };
  }

  if (
    encoded.length === 0 ||
    getUtf8ByteLength(encoded) > maxMessageBytes ||
    !isRecord(normalized)
  ) {
    return { ok: false, reason: "invalid-message" };
  }
  const input = normalized;
  if (input.bridgeVersion !== GAME_BRIDGE_VERSION) {
    return { ok: false, reason: "unsupported-version" };
  }
  if (!validateBase(input)) {
    return { ok: false, reason: "invalid-message" };
  }

  if (input.kind === "handshake") {
    if (
      !hasExactKeys(input, [
        "bridgeVersion",
        "messageId",
        "sessionId",
        "timestamp",
        "kind",
        "role",
        "capabilities",
      ]) ||
      !isRole(input.role) ||
      !isCapabilityList(input.capabilities)
    ) {
      return { ok: false, reason: "invalid-payload" };
    }
    return { ok: true, value: input as GameBridgeHandshakeMessage };
  }

  if (input.kind === "handshake-ack") {
    if (
      !hasExactKeys(input, [
        "bridgeVersion",
        "messageId",
        "sessionId",
        "timestamp",
        "kind",
        "requestId",
        "role",
        "status",
        "negotiatedCapabilities",
      ]) ||
      !isIdentifier(input.requestId) ||
      !isRole(input.role) ||
      input.status !== "result" ||
      !isCapabilityList(input.negotiatedCapabilities)
    ) {
      return { ok: false, reason: "invalid-payload" };
    }
    return { ok: true, value: input as GameBridgeHandshakeAckMessage };
  }

  if (input.kind === "request") {
    if (
      !hasExactKeys(input, [
        "bridgeVersion",
        "messageId",
        "sessionId",
        "timestamp",
        "kind",
        "method",
        "payload",
      ]) ||
      !isMethod(input.method)
    ) {
      return { ok: false, reason: "invalid-payload" };
    }
    if (!validatePayload(input.method, input.payload)) {
      return { ok: false, reason: "invalid-payload" };
    }
    return { ok: true, value: input as GameBridgeRequestMessage };
  }

  if (input.kind === "response") {
    if (!isIdentifier(input.requestId) || !isMethod(input.method)) {
      return { ok: false, reason: "invalid-payload" };
    }
    if (input.status === "result") {
      if (
        !hasExactKeys(input, [
          "bridgeVersion",
          "messageId",
          "sessionId",
          "timestamp",
          "kind",
          "requestId",
          "method",
          "status",
          "result",
        ]) ||
        !validateResult(input.method, input.result)
      ) {
        return { ok: false, reason: "invalid-payload" };
      }
      return { ok: true, value: input as GameBridgeResultResponse };
    }
    if (
      input.status !== "error" ||
      !hasExactKeys(input, [
        "bridgeVersion",
        "messageId",
        "sessionId",
        "timestamp",
        "kind",
        "requestId",
        "method",
        "status",
        "error",
      ]) ||
      !isBridgeError(input.error)
    ) {
      return { ok: false, reason: "invalid-payload" };
    }
    return { ok: true, value: input as GameBridgeErrorResponse };
  }

  return { ok: false, reason: "invalid-message" };
}

function oppositeRole(role: GameBridgeRole): GameBridgeRole {
  return role === "game" ? "host" : "game";
}

function methodAllowedForSender(
  method: GameBridgeMethod,
  sender: GameBridgeRole,
): boolean {
  return sender === "game"
    ? GAME_TO_HOST_METHODS.has(method)
    : HOST_TO_GAME_METHODS.has(method);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadSignature(method: GameBridgeMethod, payload: unknown): string {
  const serialized = `${method}:${stableJson(payload)}`;
  return `${serialized.length}:${fnv1a(serialized)}`;
}

function idempotencyKey(
  method: GameBridgeMethod,
  payload: GameBridgeMethodPayloads[GameBridgeMethod],
): string | null {
  if (method === "storage.set" || method === "storage.remove") {
    const storageMutation = payload as
      | GameBridgeMethodPayloads["storage.set"]
      | GameBridgeMethodPayloads["storage.remove"];
    return `${method}:${storageMutation.transactionId}`;
  }
  if (method === "analytics.log") {
    return `${method}:${(payload as GameBridgeMethodPayloads["analytics.log"]).eventId}`;
  }
  if (method === "ad.load" || method === "ad.show") {
    return `${method}:${(payload as GameBridgeMethodPayloads["ad.load"]).transactionId}`;
  }
  return null;
}

function defaultTimer(): GameBridgeTimer {
  return {
    set(callback, delayMs) {
      return globalThis.setTimeout(callback, delayMs);
    },
    clear(handle) {
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
  };
}

function freezeCapabilities(
  values: readonly GameBridgeCapability[],
): readonly GameBridgeCapability[] {
  return Object.freeze([...values]);
}

export class GameBridgeCoordinator {
  readonly #role: GameBridgeRole;
  readonly #localCapabilities: readonly GameBridgeCapability[];
  readonly #transport: GameBridgeTransport;
  readonly #handlers: GameBridgeHandlers;
  readonly #defaultTimeoutMs: number;
  readonly #maxMessageBytes: number;
  readonly #maxReplayEntries: number;
  readonly #now: () => number;
  readonly #createMessageId: () => string;
  readonly #timer: GameBridgeTimer;

  #state: GameBridgeState = "idle";
  #sessionId: string | null = null;
  #pendingHandshakeId: string | null = null;
  #negotiatedCapabilities: readonly GameBridgeCapability[] = Object.freeze([]);
  #counter = 0;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #receivedRequests = new Map<string, CachedRequest>();
  readonly #settledRequestIds = new Map<string, true>();
  readonly #idempotency = new Map<string, IdempotencyRecord>();
  readonly #handshakeAcks = new Map<string, GameBridgeHandshakeAckMessage>();

  constructor(options: GameBridgeCoordinatorOptions) {
    if (!isCapabilityList([...options.capabilities])) {
      throw new TypeError("Invalid bridge capabilities");
    }
    this.#role = options.role;
    this.#localCapabilities = freezeCapabilities(options.capabilities);
    this.#transport = options.transport;
    this.#handlers = options.handlers ?? {};
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxMessageBytes =
      options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
    this.#maxReplayEntries =
      options.maxReplayEntries ?? DEFAULT_MAX_REPLAY_ENTRIES;
    this.#now = options.now ?? Date.now;
    this.#timer = options.timer ?? defaultTimer();
    this.#createMessageId =
      options.createMessageId ??
      (() => {
        this.#counter += 1;
        return `${this.#role}-${this.#counter}`;
      });
  }

  getSnapshot(): GameBridgeSnapshot {
    return Object.freeze({
      state: this.#state,
      role: this.#role,
      sessionId: this.#sessionId,
      negotiatedCapabilities: this.#negotiatedCapabilities,
    });
  }

  async startSession(sessionId: string): Promise<GameBridgeHandshakeMessage> {
    if (!isIdentifier(sessionId)) {
      throw new TypeError("Invalid bridge session id");
    }
    this.#replaceSession(sessionId, "handshaking");
    const message: GameBridgeHandshakeMessage = Object.freeze({
      bridgeVersion: GAME_BRIDGE_VERSION,
      kind: "handshake",
      messageId: this.#nextMessageId(),
      sessionId,
      timestamp: this.#now(),
      role: this.#role,
      capabilities: this.#localCapabilities,
    });
    this.#pendingHandshakeId = message.messageId;
    try {
      await this.#transport.send(message);
    } catch {
      if (this.#sessionId === sessionId) {
        this.#state = "rejected";
      }
    }
    return message;
  }

  request<M extends GameBridgeMethod>(
    method: M,
    payload: GameBridgeMethodPayloads[M],
    options: Readonly<{ timeoutMs?: number }> = {},
  ): Promise<GameBridgeResponse<M>> {
    const candidate: GameBridgeRequestMessage<M> = {
      bridgeVersion: GAME_BRIDGE_VERSION,
      kind: "request",
      messageId: this.#nextMessageId(),
      sessionId: this.#sessionId ?? "bridge-not-started",
      timestamp: this.#now(),
      method,
      payload,
    };
    const decoded = decodeGameBridgeMessage(candidate, this.#maxMessageBytes);
    const request =
      decoded.ok && decoded.value.kind === "request"
        ? (decoded.value as GameBridgeRequestMessage<M>)
        : candidate;

    if (!decoded.ok || decoded.value.kind !== "request") {
      return Promise.resolve(
        this.#errorResponse(
          request,
          "invalid-payload",
        ) as GameBridgeResponse<M>,
      );
    }
    if (this.#state !== "ready" || this.#sessionId == null) {
      return Promise.resolve(
        this.#errorResponse(
          request,
          "handshake-required",
        ) as GameBridgeResponse<M>,
      );
    }
    if (!methodAllowedForSender(method, this.#role)) {
      return Promise.resolve(
        this.#errorResponse(
          request,
          "method-not-allowed",
        ) as GameBridgeResponse<M>,
      );
    }
    if (!this.#negotiatedCapabilities.includes(METHOD_CAPABILITY[method])) {
      return Promise.resolve(
        this.#errorResponse(
          request,
          "capability-unavailable",
        ) as GameBridgeResponse<M>,
      );
    }

    const timeoutMs = options.timeoutMs ?? this.#defaultTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return Promise.resolve(
        this.#errorResponse(
          request,
          "invalid-payload",
        ) as GameBridgeResponse<M>,
      );
    }

    return new Promise<GameBridgeResponse<M>>((resolve) => {
      const timerHandle = this.#timer.set(() => {
        const pending = this.#pending.get(request.messageId);
        if (pending == null) {
          return;
        }
        this.#pending.delete(request.messageId);
        this.#remember(this.#settledRequestIds, request.messageId, true);
        resolve(
          this.#errorResponse(request, "timeout") as GameBridgeResponse<M>,
        );
      }, timeoutMs);

      this.#pending.set(request.messageId, {
        request,
        resolve: resolve as (response: GameBridgeResponse) => void,
        timerHandle,
      });

      Promise.resolve(this.#transport.send(request)).catch(() => {
        const pending = this.#pending.get(request.messageId);
        if (pending == null) {
          return;
        }
        this.#pending.delete(request.messageId);
        this.#timer.clear(pending.timerHandle);
        this.#remember(this.#settledRequestIds, request.messageId, true);
        resolve(
          this.#errorResponse(
            request,
            "transport-error",
          ) as GameBridgeResponse<M>,
        );
      });
    });
  }

  cancelRequest(requestId: string): boolean {
    const pending = this.#pending.get(requestId);
    if (pending == null) {
      return false;
    }
    this.#pending.delete(requestId);
    this.#timer.clear(pending.timerHandle);
    this.#remember(this.#settledRequestIds, requestId, true);
    pending.resolve(this.#errorResponse(pending.request, "cancelled"));
    return true;
  }

  async receive(input: unknown): Promise<GameBridgeReceiveResult> {
    const decoded = decodeGameBridgeMessage(input, this.#maxMessageBytes);
    if (!decoded.ok) {
      return Object.freeze({ accepted: false, reason: decoded.reason });
    }

    const message = decoded.value;
    if (message.kind === "handshake") {
      return this.#receiveHandshake(message);
    }
    if (this.#sessionId == null || this.#state === "idle") {
      return Object.freeze({ accepted: false, reason: "handshake-required" });
    }
    if (message.sessionId !== this.#sessionId) {
      return Object.freeze({ accepted: false, reason: "stale-session" });
    }
    if (message.kind === "handshake-ack") {
      return this.#receiveHandshakeAck(message);
    }
    if (this.#state !== "ready") {
      return Object.freeze({ accepted: false, reason: "handshake-required" });
    }
    if (message.kind === "request") {
      return this.#receiveRequest(message);
    }
    return this.#receiveResponse(message);
  }

  async #receiveHandshake(
    message: GameBridgeHandshakeMessage,
  ): Promise<GameBridgeReceiveResult> {
    if (message.role === this.#role) {
      return Object.freeze({ accepted: false, reason: "role-conflict" });
    }

    const existingAck = this.#handshakeAcks.get(message.messageId);
    if (existingAck != null && existingAck.sessionId === message.sessionId) {
      await this.#safeSend(existingAck);
      return Object.freeze({ accepted: true, reason: "accepted" });
    }

    this.#replaceSession(message.sessionId, "handshaking");
    const negotiated = this.#localCapabilities.filter((capability) =>
      message.capabilities.includes(capability),
    );
    this.#negotiatedCapabilities = freezeCapabilities(negotiated);
    this.#state = "ready";

    const ack: GameBridgeHandshakeAckMessage = Object.freeze({
      bridgeVersion: GAME_BRIDGE_VERSION,
      kind: "handshake-ack",
      messageId: this.#nextMessageId(),
      sessionId: message.sessionId,
      timestamp: this.#now(),
      requestId: message.messageId,
      role: this.#role,
      status: "result",
      negotiatedCapabilities: this.#negotiatedCapabilities,
    });
    this.#remember(this.#handshakeAcks, message.messageId, ack);
    await this.#safeSend(ack);
    return Object.freeze({ accepted: true, reason: "accepted" });
  }

  #receiveHandshakeAck(
    message: GameBridgeHandshakeAckMessage,
  ): GameBridgeReceiveResult {
    if (
      this.#state !== "handshaking" ||
      this.#pendingHandshakeId !== message.requestId
    ) {
      return Object.freeze({
        accepted: false,
        reason: "unexpected-handshake-ack",
      });
    }
    if (message.role !== oppositeRole(this.#role)) {
      this.#state = "rejected";
      return Object.freeze({ accepted: false, reason: "role-conflict" });
    }
    if (
      message.negotiatedCapabilities.some(
        (capability) => !this.#localCapabilities.includes(capability),
      )
    ) {
      this.#state = "rejected";
      return Object.freeze({
        accepted: false,
        reason: "unsupported-capability",
      });
    }
    this.#negotiatedCapabilities = freezeCapabilities(
      message.negotiatedCapabilities,
    );
    this.#pendingHandshakeId = null;
    this.#state = "ready";
    return Object.freeze({ accepted: true, reason: "accepted" });
  }

  async #receiveRequest(
    request: GameBridgeRequestMessage,
  ): Promise<GameBridgeReceiveResult> {
    const sender = oppositeRole(this.#role);
    if (!methodAllowedForSender(request.method, sender)) {
      await this.#safeSend(this.#errorResponse(request, "method-not-allowed"));
      return Object.freeze({ accepted: false, reason: "method-not-allowed" });
    }
    if (
      !this.#negotiatedCapabilities.includes(METHOD_CAPABILITY[request.method])
    ) {
      await this.#safeSend(
        this.#errorResponse(request, "capability-unavailable"),
      );
      return Object.freeze({
        accepted: false,
        reason: "unsupported-capability",
      });
    }

    const duplicate = this.#receivedRequests.get(request.messageId);
    if (duplicate != null) {
      await this.#safeSend(await duplicate.response);
      return Object.freeze({ accepted: true, reason: "duplicate-request" });
    }

    const responsePromise = this.#handleRequest(request);
    this.#remember(this.#receivedRequests, request.messageId, {
      response: responsePromise,
    });
    await this.#safeSend(await responsePromise);
    return Object.freeze({ accepted: true, reason: "accepted" });
  }

  #receiveResponse(response: GameBridgeResponse): GameBridgeReceiveResult {
    const pending = this.#pending.get(response.requestId);
    if (pending == null) {
      if (this.#settledRequestIds.has(response.requestId)) {
        return Object.freeze({
          accepted: true,
          reason: "duplicate-response",
        });
      }
      return Object.freeze({ accepted: false, reason: "unexpected-response" });
    }
    if (pending.request.method !== response.method) {
      return Object.freeze({ accepted: false, reason: "invalid-payload" });
    }

    this.#pending.delete(response.requestId);
    this.#timer.clear(pending.timerHandle);
    this.#remember(this.#settledRequestIds, response.requestId, true);
    pending.resolve(response);
    return Object.freeze({ accepted: true, reason: "accepted" });
  }

  async #handleRequest(
    request: GameBridgeRequestMessage,
  ): Promise<GameBridgeResponse> {
    const idempotency = idempotencyKey(request.method, request.payload);
    const signature = payloadSignature(request.method, request.payload);
    let outcomePromise: Promise<HandlerOutcome>;

    if (idempotency != null) {
      const previous = this.#idempotency.get(idempotency);
      if (previous != null) {
        if (previous.signature !== signature) {
          return this.#errorResponse(request, "idempotency-conflict");
        }
        outcomePromise = previous.outcome;
      } else {
        outcomePromise = this.#invokeHandler(request);
        this.#remember(this.#idempotency, idempotency, {
          signature,
          outcome: outcomePromise,
        });
      }
    } else {
      outcomePromise = this.#invokeHandler(request);
    }

    const outcome = await outcomePromise;
    if (outcome.status === "error") {
      return this.#errorResponse(request, outcome.error.code);
    }
    return this.#resultResponse(request, outcome.result);
  }

  async #invokeHandler(
    request: GameBridgeRequestMessage,
  ): Promise<HandlerOutcome> {
    const handler = this.#handlers[request.method] as
      | GameBridgeHandler<GameBridgeMethod>
      | undefined;
    if (handler == null) {
      return { status: "error", error: errorValue("handler-unavailable") };
    }

    try {
      const result = await handler(request.payload, {
        requestId: request.messageId,
        sessionId: request.sessionId,
        timestamp: request.timestamp,
      });
      if (!validateResult(request.method, result)) {
        return { status: "error", error: errorValue("handler-failed") };
      }
      return {
        status: "result",
        result: result as GameBridgeMethodResults[GameBridgeMethod],
      };
    } catch {
      return { status: "error", error: errorValue("handler-failed") };
    }
  }

  #resultResponse(
    request: GameBridgeRequestMessage,
    result: GameBridgeMethodResults[GameBridgeMethod],
  ): GameBridgeResultResponse {
    return Object.freeze({
      bridgeVersion: GAME_BRIDGE_VERSION,
      kind: "response",
      messageId: this.#nextMessageId(),
      sessionId: request.sessionId,
      timestamp: this.#now(),
      requestId: request.messageId,
      method: request.method,
      status: "result",
      result,
    });
  }

  #errorResponse(
    request: GameBridgeRequestMessage,
    code: GameBridgeErrorCode,
  ): GameBridgeErrorResponse {
    return Object.freeze({
      bridgeVersion: GAME_BRIDGE_VERSION,
      kind: "response",
      messageId: this.#nextMessageId(),
      sessionId: request.sessionId,
      timestamp: this.#now(),
      requestId: request.messageId,
      method: request.method,
      status: "error",
      error: errorValue(code),
    });
  }

  #replaceSession(sessionId: string, state: GameBridgeState): void {
    for (const pending of this.#pending.values()) {
      this.#timer.clear(pending.timerHandle);
      pending.resolve(this.#errorResponse(pending.request, "session-replaced"));
    }
    this.#pending.clear();
    this.#receivedRequests.clear();
    this.#settledRequestIds.clear();
    this.#idempotency.clear();
    this.#handshakeAcks.clear();
    this.#sessionId = sessionId;
    this.#state = state;
    this.#pendingHandshakeId = null;
    this.#negotiatedCapabilities = Object.freeze([]);
  }

  async #safeSend(message: GameBridgeMessage): Promise<void> {
    try {
      await this.#transport.send(message);
    } catch {
      // The wire owner decides how to recover. Payloads and transport errors are never logged.
    }
  }

  #nextMessageId(): string {
    const messageId = this.#createMessageId();
    if (!isIdentifier(messageId)) {
      throw new TypeError("Invalid bridge message id");
    }
    return messageId;
  }

  #remember<K, V>(map: Map<K, V>, key: K, value: V): void {
    map.set(key, value);
    while (map.size > this.#maxReplayEntries) {
      const oldest = map.keys().next().value as K | undefined;
      if (oldest === undefined) {
        break;
      }
      map.delete(oldest);
    }
  }
}
