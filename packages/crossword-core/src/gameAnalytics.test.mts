import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildGameAnalyticsEvent,
  createGameAnalyticsClient,
  GAME_ANALYTICS_SCHEMA_VERSION,
  type GameAnalyticsSink,
  type GamePuzzleContext,
} from "./gameAnalytics.ts";

function context(overrides: Partial<GamePuzzleContext> = {}): GamePuzzleContext {
  return {
    puzzleId: "puzzle-1",
    difficulty: "normal",
    gridSize: 9,
    wordCount: 12,
    packId: "pack-a",
    slotId: "slot-3",
    themeTag: "food",
    ...overrides,
  };
}

describe("buildGameAnalyticsEvent", () => {
  it("항상 market·schema_version·컨텍스트를 병합한다", () => {
    const { name, params } = buildGameAnalyticsEvent("game_puzzle_start", {
      market: "apps-in-toss",
      context: context(),
      payload: { attemptKind: "first", attemptNumber: 1 },
    });

    assert.equal(name, "game_puzzle_start");
    assert.equal(params.market, "apps-in-toss");
    assert.equal(params.schema_version, GAME_ANALYTICS_SCHEMA_VERSION);
    assert.equal(params.puzzle_id, "puzzle-1");
    assert.equal(params.difficulty, "normal");
    assert.equal(params.grid_size, 9);
    assert.equal(params.word_count, 12);
    assert.equal(params.pack_id, "pack-a");
    assert.equal(params.theme_tag, "food");
    // 페이로드는 snake_case로 변환된다.
    assert.equal(params.attempt_kind, "first");
    assert.equal(params.attempt_number, 1);
  });

  it("완료 이벤트에 no_hint/first_try 파생값을 계산한다", () => {
    const noHintFirstTry = buildGameAnalyticsEvent("game_puzzle_complete", {
      market: "google-play",
      context: context(),
      payload: {
        solveTimeSec: 88,
        hintCount: 0,
        revealUsed: false,
        attemptNumber: 1,
        completedWordCount: 12,
      },
    });
    assert.equal(noHintFirstTry.params.no_hint, true);
    assert.equal(noHintFirstTry.params.first_try, true);
    assert.equal(noHintFirstTry.params.solve_time_sec, 88);

    const hintedRetry = buildGameAnalyticsEvent("game_puzzle_complete", {
      market: "app-store",
      context: context(),
      payload: {
        solveTimeSec: 120,
        hintCount: 2,
        revealUsed: false,
        attemptNumber: 2,
        completedWordCount: 12,
      },
    });
    assert.equal(hintedRetry.params.no_hint, false);
    assert.equal(hintedRetry.params.first_try, false);

    const revealed = buildGameAnalyticsEvent("game_puzzle_complete", {
      market: "app-store",
      context: context(),
      payload: {
        solveTimeSec: 60,
        hintCount: 0,
        revealUsed: true,
        attemptNumber: 1,
        completedWordCount: 12,
      },
    });
    // 정답 보기로 완료하면 노힌트가 아니다.
    assert.equal(revealed.params.no_hint, false);
  });

  it("null/undefined 파라미터는 제거한다", () => {
    const { params } = buildGameAnalyticsEvent("game_hint_use", {
      market: "apps-in-toss",
      context: context({ packId: null, slotId: null, themeTag: undefined }),
      payload: { hintType: "reveal_word", hintRemainingAfter: null },
    });
    assert.ok(!("pack_id" in params));
    assert.ok(!("slot_id" in params));
    assert.ok(!("theme_tag" in params));
    assert.ok(!("hint_remaining_after" in params));
    assert.equal(params.hint_type, "reveal_word");
  });
});

describe("createGameAnalyticsClient", () => {
  it("등록된 모든 sink에 마켓을 주입해 팬아웃한다", () => {
    const seenA: Array<{ name: string; params: Record<string, unknown> }> = [];
    const seenB: Array<{ name: string; params: Record<string, unknown> }> = [];
    const sinkA: GameAnalyticsSink = {
      id: "a",
      logGameEvent: (name, params) => seenA.push({ name, params }),
    };
    const sinkB: GameAnalyticsSink = {
      id: "b",
      logGameEvent: (name, params) => seenB.push({ name, params }),
    };

    const client = createGameAnalyticsClient({
      market: "google-play",
      sinks: [sinkA, sinkB],
    });
    client.track("game_first_input", context(), {
      timeToFirstInputSec: 5,
      attemptNumber: 1,
    });

    assert.equal(seenA.length, 1);
    assert.equal(seenB.length, 1);
    assert.equal(seenA[0].name, "game_first_input");
    assert.equal(seenA[0].params.market, "google-play");
    assert.equal(seenA[0].params.time_to_first_input_sec, 5);
  });

  it("한 sink가 throw해도 나머지 sink와 호출부를 막지 않는다", () => {
    const seen: string[] = [];
    const errors: unknown[] = [];
    const throwing: GameAnalyticsSink = {
      id: "throwing",
      logGameEvent: () => {
        throw new Error("sink down");
      },
    };
    const healthy: GameAnalyticsSink = {
      id: "healthy",
      logGameEvent: (name) => seen.push(name),
    };

    const client = createGameAnalyticsClient({
      market: "apps-in-toss",
      sinks: [throwing, healthy],
      onError: (error) => errors.push(error),
    });

    assert.doesNotThrow(() => {
      client.track("game_progress", context(), {
        completedWordCount: 6,
        totalWordCount: 12,
        progressPercent: 50,
        attemptNumber: 1,
      });
    });
    assert.deepEqual(seen, ["game_progress"]);
    assert.equal(errors.length, 1);
  });
});
