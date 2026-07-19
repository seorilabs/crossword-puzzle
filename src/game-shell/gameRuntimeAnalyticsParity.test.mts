import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type {
  GameAnalyticsSink,
  GameMarket,
  GameRuntimeAnalyticsEvent,
  GameRuntimeAnalyticsPort,
} from "../../packages/crossword-core/src/index.ts";
import { createGameRuntimeAnalyticsSession } from "../../packages/crossword-core/src/gameRuntimeAnalytics.ts";
import {
  GameController,
  type GameCommand,
} from "../../packages/crossword-core/src/gameController.ts";
import { koKrLanguageProfile } from "../../packages/crossword-core/src/languageProfile.ts";
import {
  createMobileGameBridgeHost,
  type MobileGameBridgeHost,
} from "../../apps/mobile/gameBridgeHost.ts";
import { createWebGameRuntimeAnalyticsPort } from "../adapters/gameRuntimeAnalytics.ts";
import {
  createNativeGameBridgeClient,
  type NativeBridgeMessageTarget,
} from "./nativeGameBridge.ts";
import { loadBundledOnboardingGameContent } from "./onboardingGameContent.ts";

const NATIVE_INDEX_URL =
  "https://appassets.androidplatform.net/assets/crossword-game/index.html";

class ManualMessageTarget implements NativeBridgeMessageTarget {
  readonly #listeners = new Set<(event: Event) => void>();

  addEventListener(_type: "message", listener: (event: Event) => void): void {
    this.#listeners.add(listener);
  }

  removeEventListener(
    _type: "message",
    listener: (event: Event) => void,
  ): void {
    this.#listeners.delete(listener);
  }

  dispatch(data: string): void {
    const event = { data } as MessageEvent;
    for (const listener of [...this.#listeners]) listener(event as Event);
  }
}

async function settleAsyncDelivery(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function dispatch(
  controller: GameController,
  session: ReturnType<typeof createGameRuntimeAnalyticsSession>,
  command: GameCommand,
) {
  const previous = controller.getSnapshot();
  const result = controller.dispatch(command);
  session.recordTransition(previous, result.snapshot, result.events);
}

async function runCanonicalActions(
  port: GameRuntimeAnalyticsPort,
  market: GameMarket,
): Promise<void> {
  const content = loadBundledOnboardingGameContent();
  const controller = new GameController({
    content,
    profile: koKrLanguageProfile,
  });
  let now = 100_000;
  let sequence = 0;
  const session = createGameRuntimeAnalyticsSession({
    content,
    initialSnapshot: controller.getSnapshot(),
    market,
    uiLocale: "ko-KR",
    port,
    nowEpochMs: () => now,
    createEventId: () => `parity-event-${++sequence}`,
  });

  for (const entry of content.entries) {
    if (controller.getSnapshot().completedEntryIds.includes(entry.id)) continue;
    now += 1_000;
    dispatch(controller, session, {
      type: "input.commit",
      entryId: entry.id,
      cells: entry.answerCells,
    });
    now += 250;
    dispatch(controller, session, { type: "resolution.complete" });
  }
  await settleAsyncDelivery();
}

function withoutMarket(events: readonly GameRuntimeAnalyticsEvent[]) {
  return events.map((event) => {
    const params = { ...event.params };
    delete params.market;
    return { ...event, params };
  });
}

async function createNativeAnalyticsLoopback(
  transcript: GameRuntimeAnalyticsEvent[],
) {
  const messageTarget = new ManualMessageTarget();
  let host!: MobileGameBridgeHost;
  const client = createNativeGameBridgeClient({
    messageTargets: [messageTarget],
    sendSerialized: (serialized) =>
      host
        .receiveSerialized(serialized, NATIVE_INDEX_URL)
        .then(() => undefined),
    dispatchHostEvent: () => undefined,
  });
  const content = loadBundledOnboardingGameContent();
  host = createMobileGameBridgeHost({
    allowedMessageUrl: NATIVE_INDEX_URL,
    runtimeReadyExpectations: [
      {
        renderer: "webgl",
        scene: "puzzle",
        visible: true,
        contentChecksum: content.contentChecksum,
        contentLocale: content.contentLocale,
        puzzleId: content.puzzleId,
        assetManifestChecksum:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
    ],
    sendSerialized: (serialized) => messageTarget.dispatch(serialized),
    storage: {
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    },
    analytics: {
      log(event) {
        transcript.push(event);
      },
    },
    playHaptic: () => undefined,
  });

  await Promise.all([
    host.startSession("native-analytics-parity"),
    host.waitUntilHandshakeReady(),
    client.waitUntilReady(),
  ]);
  return client;
}

describe("GameExperience AIT/native canonical analytics parity", () => {
  test("동일 content/config/actions는 market 외 payload가 byte-equivalent하다", async () => {
    const aitTranscript: GameRuntimeAnalyticsEvent[] = [];
    const aitSink: GameAnalyticsSink = {
      id: "ait-recording",
      logGameEvent(name, params) {
        aitTranscript.push({
          name: name as GameRuntimeAnalyticsEvent["name"],
          eventId: String(params.event_id),
          params,
        });
      },
    };
    await runCanonicalActions(
      createWebGameRuntimeAnalyticsPort([aitSink]),
      "apps-in-toss",
    );

    const nativeTranscript: GameRuntimeAnalyticsEvent[] = [];
    const nativeBridge = await createNativeAnalyticsLoopback(nativeTranscript);
    await runCanonicalActions(nativeBridge.analytics, "google-play");

    assert.ok(aitTranscript.length > 0);
    assert.equal(nativeTranscript.length, aitTranscript.length);
    assert.deepEqual(
      withoutMarket(nativeTranscript),
      withoutMarket(aitTranscript),
    );
    assert.deepEqual(
      new Set(aitTranscript.map((event) => event.params.market)),
      new Set(["apps-in-toss"]),
    );
    assert.deepEqual(
      new Set(nativeTranscript.map((event) => event.params.market)),
      new Set(["google-play"]),
    );
    assert.deepEqual(
      nativeTranscript.map((event) => event.eventId),
      aitTranscript.map((event) => event.eventId),
    );

    nativeBridge.dispose();
  });
});
