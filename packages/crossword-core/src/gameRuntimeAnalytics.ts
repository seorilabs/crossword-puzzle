import { getProgressPercent } from "./boardNavigation.ts";
import {
  buildGameAnalyticsEvent,
  type GameAnalyticsEventName,
  type GameAnalyticsEventPayloads,
  type GameMarket,
  type GamePuzzleContext,
} from "./gameAnalytics.ts";
import type { GameContentV1 } from "./gameContent.ts";
import type {
  GameDomainEvent,
  GamePhase,
  GameSnapshot,
} from "./gameController.ts";
import type { CompactTelemetryParams } from "./platformContracts.ts";
import {
  getNewlyReachedProgressMilestones,
  PUZZLE_PROGRESS_MILESTONES,
} from "./uiPolicy.ts";

/** Legacy runtime remains schema v1. Only the GameExperience runtime emits v2. */
export const GAME_RUNTIME_ANALYTICS_SCHEMA_VERSION = 2 as const;

export const GAME_RUNTIME_ANALYTICS_EVENT_NAMES = Object.freeze([
  "game_puzzle_start",
  "game_first_input",
  "game_progress",
  "game_puzzle_complete",
  "game_puzzle_abandon",
  "game_hint_use",
  "game_assist_ad",
] as const satisfies readonly GameAnalyticsEventName[]);

export const GAME_RUNTIME_ANALYTICS_MARKET_CONFIG_KEY = "runtime_market";
export const GAME_RUNTIME_ANALYTICS_UI_LOCALE_CONFIG_KEY = "runtime_ui_locale";

export const GAME_RUNTIME_ANALYTICS_LOCALES = Object.freeze(["ko-KR"] as const);

export type GameRuntimeAnalyticsLocale =
  (typeof GAME_RUNTIME_ANALYTICS_LOCALES)[number];

export type GameRuntimeAnalyticsEvent = Readonly<{
  eventId: string;
  name: GameAnalyticsEventName;
  params: CompactTelemetryParams;
}>;

/**
 * Delivery port shared by the AIT host adapter and the native game bridge.
 * Implementations may be async, but callers must never await analytics on the
 * gameplay path.
 */
export type GameRuntimeAnalyticsPort = Readonly<{
  log(event: GameRuntimeAnalyticsEvent): void | Promise<void>;
}>;

export type GameRuntimeAnalyticsSession = Readonly<{
  recordTransition(
    previous: GameSnapshot,
    next: GameSnapshot,
    events: readonly GameDomainEvent[],
  ): void;
  abandon(snapshot: GameSnapshot): void;
}>;

export type GameRuntimeAnalyticsSessionOptions = Readonly<{
  content: GameContentV1;
  initialSnapshot: GameSnapshot;
  market: GameMarket;
  uiLocale: GameRuntimeAnalyticsLocale;
  port: GameRuntimeAnalyticsPort;
  nowEpochMs?: () => number;
  createEventId?: () => string;
  onError?: (error: unknown) => void;
}>;

const EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const EVENT_NAME_SET = new Set<string>(GAME_RUNTIME_ANALYTICS_EVENT_NAMES);
const MARKET_SET = new Set<GameMarket>([
  "apps-in-toss",
  "google-play",
  "app-store",
]);
const LOCALE_SET = new Set<string>(GAME_RUNTIME_ANALYTICS_LOCALES);

const COMMON_REQUIRED_PARAMS = Object.freeze([
  "schema_version",
  "event_id",
  "market",
  "puzzle_id",
  "difficulty",
  "grid_size",
  "word_count",
  "ui_locale",
  "content_locale",
  "language_profile_id",
  "language_profile_version",
] as const);

const OPTIONAL_CONTEXT_PARAMS = Object.freeze([
  "pack_id",
  "slot_id",
  "theme_tag",
] as const);

const EVENT_REQUIRED_PARAMS: Readonly<
  Record<GameAnalyticsEventName, readonly string[]>
> = Object.freeze({
  game_puzzle_start: Object.freeze(["attempt_kind", "attempt_number"]),
  game_first_input: Object.freeze([
    "time_to_first_input_sec",
    "attempt_number",
  ]),
  game_progress: Object.freeze([
    "completed_word_count",
    "total_word_count",
    "progress_percent",
    "attempt_number",
  ]),
  game_puzzle_complete: Object.freeze([
    "solve_time_sec",
    "hint_count",
    "reveal_used",
    "attempt_number",
    "completed_word_count",
    "no_hint",
    "first_try",
  ]),
  game_puzzle_abandon: Object.freeze([
    "elapsed_sec",
    "completed_word_count",
    "total_word_count",
    "progress_percent",
    "had_first_input",
  ]),
  game_hint_use: Object.freeze(["hint_type"]),
  game_assist_ad: Object.freeze(["assist_type", "result"]),
});

const EVENT_OPTIONAL_PARAMS: Readonly<
  Record<GameAnalyticsEventName, readonly string[]>
> = Object.freeze({
  game_puzzle_start: Object.freeze([]),
  game_first_input: Object.freeze([]),
  game_progress: Object.freeze([]),
  game_puzzle_complete: Object.freeze([]),
  game_puzzle_abandon: Object.freeze([]),
  game_hint_use: Object.freeze(["hint_remaining_after"]),
  game_assist_ad: Object.freeze([]),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function hasExactParamKeys(
  params: Record<string, unknown>,
  name: GameAnalyticsEventName,
): boolean {
  const required = [...COMMON_REQUIRED_PARAMS, ...EVENT_REQUIRED_PARAMS[name]];
  const allowed = new Set([
    ...required,
    ...OPTIONAL_CONTEXT_PARAMS,
    ...EVENT_OPTIONAL_PARAMS[name],
  ]);
  return (
    required.every((key) =>
      Object.prototype.hasOwnProperty.call(params, key),
    ) && Object.keys(params).every((key) => allowed.has(key))
  );
}

function hasValidCommonParams(
  eventId: string,
  params: Record<string, unknown>,
): boolean {
  return (
    params.schema_version === GAME_RUNTIME_ANALYTICS_SCHEMA_VERSION &&
    params.event_id === eventId &&
    MARKET_SET.has(params.market as GameMarket) &&
    typeof params.puzzle_id === "string" &&
    IDENTIFIER_PATTERN.test(params.puzzle_id) &&
    (params.difficulty === "easy" ||
      params.difficulty === "normal" ||
      params.difficulty === "hard") &&
    isPositiveInteger(params.grid_size) &&
    isPositiveInteger(params.word_count) &&
    LOCALE_SET.has(String(params.ui_locale)) &&
    LOCALE_SET.has(String(params.content_locale)) &&
    params.language_profile_id === "ko-KR" &&
    params.language_profile_version === 1 &&
    OPTIONAL_CONTEXT_PARAMS.every((key) => {
      const value = params[key];
      return value == null || (typeof value === "string" && value.length > 0);
    })
  );
}

function hasValidEventParams(
  name: GameAnalyticsEventName,
  params: Record<string, unknown>,
): boolean {
  switch (name) {
    case "game_puzzle_start":
      return (
        (params.attempt_kind === "first" || params.attempt_kind === "retry") &&
        isPositiveInteger(params.attempt_number)
      );
    case "game_first_input":
      return (
        isNonNegativeInteger(params.time_to_first_input_sec) &&
        isPositiveInteger(params.attempt_number)
      );
    case "game_progress": {
      const completed = Number(params.completed_word_count);
      const total = Number(params.total_word_count);
      return (
        isPositiveInteger(params.completed_word_count) &&
        isPositiveInteger(params.total_word_count) &&
        total === params.word_count &&
        completed < total &&
        params.progress_percent === getProgressPercent(completed, total) &&
        isPositiveInteger(params.attempt_number)
      );
    }
    case "game_puzzle_complete":
      return (
        isNonNegativeInteger(params.solve_time_sec) &&
        isNonNegativeInteger(params.hint_count) &&
        typeof params.reveal_used === "boolean" &&
        isPositiveInteger(params.attempt_number) &&
        params.completed_word_count === params.word_count &&
        params.no_hint ===
          (params.hint_count === 0 && params.reveal_used === false) &&
        params.first_try === Number(params.attempt_number) <= 1
      );
    case "game_puzzle_abandon": {
      const completed = Number(params.completed_word_count);
      const total = Number(params.total_word_count);
      return (
        isNonNegativeInteger(params.elapsed_sec) &&
        isNonNegativeInteger(params.completed_word_count) &&
        isPositiveInteger(params.total_word_count) &&
        total === params.word_count &&
        completed < total &&
        params.progress_percent === getProgressPercent(completed, total) &&
        typeof params.had_first_input === "boolean"
      );
    }
    case "game_hint_use":
      return (
        (params.hint_type === "hint" ||
          params.hint_type === "reveal_word" ||
          params.hint_type === "stuck_hint") &&
        (params.hint_remaining_after == null ||
          isNonNegativeInteger(params.hint_remaining_after))
      );
    case "game_assist_ad":
      return (
        (params.assist_type === "rewarded_hint" ||
          params.assist_type === "bonus_puzzle" ||
          params.assist_type === "extra_attempt") &&
        (params.result === "request" ||
          params.result === "reward" ||
          params.result === "dismiss" ||
          params.result === "error")
      );
  }
}

/** Runtime guard used by native host before forwarding an analytics request. */
export function isGameRuntimeAnalyticsEvent(
  value: unknown,
): value is GameRuntimeAnalyticsEvent {
  if (!isRecord(value)) return false;
  const { eventId, name, params } = value;
  if (
    typeof eventId !== "string" ||
    !EVENT_ID_PATTERN.test(eventId) ||
    typeof name !== "string" ||
    !EVENT_NAME_SET.has(name) ||
    !isRecord(params)
  ) {
    return false;
  }
  const eventName = name as GameAnalyticsEventName;
  return (
    hasExactParamKeys(params, eventName) &&
    hasValidCommonParams(eventId, params) &&
    hasValidEventParams(eventName, params)
  );
}

export function isGameRuntimeAnalyticsMarket(
  value: unknown,
): value is GameMarket {
  return MARKET_SET.has(value as GameMarket);
}

export function isGameRuntimeAnalyticsLocale(
  value: unknown,
): value is GameRuntimeAnalyticsLocale {
  return typeof value === "string" && LOCALE_SET.has(value);
}

export function buildGameRuntimeAnalyticsEvent<
  E extends GameAnalyticsEventName,
>(
  name: E,
  input: Readonly<{
    eventId: string;
    market: GameMarket;
    uiLocale: GameRuntimeAnalyticsLocale;
    contentLocale: string;
    languageProfileId: string;
    languageProfileVersion: number;
    context: GamePuzzleContext;
    payload: GameAnalyticsEventPayloads[E];
  }>,
): GameRuntimeAnalyticsEvent {
  const legacyShape = buildGameAnalyticsEvent(name, {
    market: input.market,
    context: input.context,
    payload: input.payload,
  });
  const event = Object.freeze({
    eventId: input.eventId,
    name,
    params: Object.freeze({
      ...legacyShape.params,
      schema_version: GAME_RUNTIME_ANALYTICS_SCHEMA_VERSION,
      event_id: input.eventId,
      ui_locale: input.uiLocale,
      content_locale: input.contentLocale,
      language_profile_id: input.languageProfileId,
      language_profile_version: input.languageProfileVersion,
    }),
  });
  if (!isGameRuntimeAnalyticsEvent(event)) {
    throw new Error("invalid game runtime analytics event");
  }
  return event;
}

export function createGameRuntimeAnalyticsEventIdFactory(): () => string {
  const runtimeCrypto = (
    globalThis as typeof globalThis & {
      crypto?: { randomUUID?: () => string };
    }
  ).crypto;
  const randomPart =
    runtimeCrypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let sequence = 0;
  return () => {
    sequence += 1;
    return `game-analytics:${randomPart}:${sequence}`;
  };
}

function isAttemptPhase(phase: GamePhase): boolean {
  return (
    phase === "active" ||
    phase === "composing" ||
    phase === "word-resolved" ||
    phase === "suspended"
  );
}

function getPuzzleContext(content: GameContentV1): GamePuzzleContext {
  return Object.freeze({
    puzzleId: content.puzzleId,
    difficulty: content.difficulty,
    gridSize: content.grid.length,
    wordCount: content.entries.length,
    packId: content.packId,
    slotId: content.slotId,
    themeTag: content.themeId,
  });
}

function reportSafely(
  onError: ((error: unknown) => void) | undefined,
  error: unknown,
): void {
  try {
    onError?.(error);
  } catch {
    // Analytics diagnostics must not escape into gameplay.
  }
}

/**
 * Projects only lifecycle events that GameExperience actually owns. Hint/ad
 * events remain in the canonical seven-event contract but are not fabricated
 * until those controls exist in the new runtime.
 */
export function createGameRuntimeAnalyticsSession(
  options: GameRuntimeAnalyticsSessionOptions,
): GameRuntimeAnalyticsSession {
  const nowEpochMs = options.nowEpochMs ?? Date.now;
  const createEventId =
    options.createEventId ?? createGameRuntimeAnalyticsEventIdFactory();
  const context = getPuzzleContext(options.content);
  const emittedEventIds = new Set<string>();
  const totalWordCount = options.content.entries.length;
  let attemptNumber = 1;
  let attemptStarted =
    isAttemptPhase(options.initialSnapshot.phase) && totalWordCount > 0;
  let completed =
    options.initialSnapshot.completedEntryIds.length === totalWordCount ||
    options.initialSnapshot.phase === "board-resolved" ||
    options.initialSnapshot.phase === "result" ||
    options.initialSnapshot.phase === "map";
  let abandoned = false;
  let hadFirstInput =
    Object.keys(options.initialSnapshot.cellValues).length > 0;
  let reachedProgressPercent = getProgressPercent(
    options.initialSnapshot.completedEntryIds.length,
    totalWordCount,
  );
  let accumulatedActiveMs = 0;
  let activeStartedAt =
    options.initialSnapshot.phase === "suspended" ? null : nowEpochMs();

  const emit = <E extends GameAnalyticsEventName>(
    name: E,
    payload: GameAnalyticsEventPayloads[E],
  ): void => {
    try {
      const eventId = createEventId();
      if (emittedEventIds.has(eventId)) {
        throw new Error("duplicate game runtime analytics event id");
      }
      emittedEventIds.add(eventId);
      const event = buildGameRuntimeAnalyticsEvent(name, {
        eventId,
        market: options.market,
        uiLocale: options.uiLocale,
        contentLocale: options.content.contentLocale,
        languageProfileId: options.content.languageProfile.id,
        languageProfileVersion: options.content.languageProfile.version,
        context,
        payload,
      });
      const result = options.port.log(event);
      if (
        result != null &&
        typeof (result as PromiseLike<void>).then === "function"
      ) {
        void Promise.resolve(result).catch((error) =>
          reportSafely(options.onError, error),
        );
      }
    } catch (error) {
      reportSafely(options.onError, error);
    }
  };

  const elapsedSec = (): number => {
    const activeMs =
      activeStartedAt == null
        ? accumulatedActiveMs
        : accumulatedActiveMs + Math.max(0, nowEpochMs() - activeStartedAt);
    return Math.floor(activeMs / 1_000);
  };

  const pauseClock = (): void => {
    if (activeStartedAt == null) return;
    accumulatedActiveMs += Math.max(0, nowEpochMs() - activeStartedAt);
    activeStartedAt = null;
  };

  const resumeClock = (): void => {
    if (activeStartedAt != null) return;
    activeStartedAt = nowEpochMs();
  };

  const emitStart = (attemptKind: "first" | "retry"): void => {
    if (!attemptStarted || completed) return;
    emit("game_puzzle_start", { attemptKind, attemptNumber });
  };

  if (attemptStarted && !completed) emitStart("first");

  return Object.freeze({
    recordTransition(previous, next, events) {
      try {
        if (
          previous.puzzleId !== options.content.puzzleId ||
          next.puzzleId !== options.content.puzzleId
        ) {
          throw new Error("analytics transition puzzle mismatch");
        }

        if (
          events.some((event) => event.type === "game.board.replay.started")
        ) {
          attemptNumber += 1;
          attemptStarted = true;
          completed = false;
          abandoned = false;
          hadFirstInput = false;
          reachedProgressPercent = 0;
          accumulatedActiveMs = 0;
          activeStartedAt = nowEpochMs();
          emitStart("retry");
          return;
        }

        const inputCommitted = events.find(
          (event) => event.type === "game.input.committed",
        );
        if (
          inputCommitted?.type === "game.input.committed" &&
          inputCommitted.committedCellCount > 0 &&
          !hadFirstInput
        ) {
          hadFirstInput = true;
          emit("game_first_input", {
            timeToFirstInputSec: elapsedSec(),
            attemptNumber,
          });
        }

        const boardResolved = events.some(
          (event) => event.type === "game.board.resolved",
        );
        const wordResolved = events.some(
          (event) => event.type === "game.word.resolved",
        );
        const nextProgressPercent = getProgressPercent(
          next.completedEntryIds.length,
          totalWordCount,
        );
        if (wordResolved && !boardResolved) {
          const milestones = getNewlyReachedProgressMilestones(
            reachedProgressPercent,
            nextProgressPercent,
            PUZZLE_PROGRESS_MILESTONES,
          );
          for (let index = 0; index < milestones.length; index += 1) {
            emit("game_progress", {
              completedWordCount: next.completedEntryIds.length,
              totalWordCount,
              progressPercent: nextProgressPercent,
              attemptNumber,
            });
          }
        }
        reachedProgressPercent = Math.max(
          reachedProgressPercent,
          nextProgressPercent,
        );

        if (boardResolved && !completed) {
          completed = true;
          emit("game_puzzle_complete", {
            solveTimeSec: elapsedSec(),
            hintCount: 0,
            revealUsed: false,
            attemptNumber,
            completedWordCount: next.completedEntryIds.length,
          });
        }

        if (events.some((event) => event.type === "game.suspended")) {
          pauseClock();
        } else if (events.some((event) => event.type === "game.resumed")) {
          resumeClock();
        }
      } catch (error) {
        reportSafely(options.onError, error);
      }
    },
    abandon(snapshot) {
      try {
        if (!attemptStarted || completed || abandoned) return;
        abandoned = true;
        emit("game_puzzle_abandon", {
          elapsedSec: elapsedSec(),
          completedWordCount: snapshot.completedEntryIds.length,
          totalWordCount,
          progressPercent: getProgressPercent(
            snapshot.completedEntryIds.length,
            totalWordCount,
          ),
          hadFirstInput,
        });
      } catch (error) {
        reportSafely(options.onError, error);
      }
    },
  });
}
