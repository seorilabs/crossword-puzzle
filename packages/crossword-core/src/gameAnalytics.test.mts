import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import {
  buildGameAnalyticsEvent,
  buildGameProgressionEvent,
  createBonusPuzzlePanelImpressionGuard,
  createGameAnalyticsClient,
  GAME_ANALYTICS_SCHEMA_VERSION,
  trackBonusPuzzlePanelImpression,
  type GameAnalyticsSink,
  type GamePuzzleContext,
} from "./gameAnalytics.ts";

function context(
  overrides: Partial<GamePuzzleContext> = {},
): GamePuzzleContext {
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

  it("AC-1: bonus_puzzle_panel_impression 이벤트를 기록한다 (#278)", () => {
    const { name, params } = buildGameAnalyticsEvent(
      "bonus_puzzle_panel_impression",
      {
        market: "apps-in-toss",
        context: context(),
        payload: { status: "available" },
      },
    );

    assert.equal(name, "bonus_puzzle_panel_impression");
    assert.equal(params.status, "available");
    assert.equal(params.market, "apps-in-toss");
    assert.equal(params.puzzle_id, "puzzle-1");
    assert.equal(params.schema_version, GAME_ANALYTICS_SCHEMA_VERSION);
  });
});

describe("trackBonusPuzzlePanelImpression (#278)", () => {
  function createRecorder() {
    const seen: Array<{ name: string; params: Record<string, unknown> }> = [];
    const client = createGameAnalyticsClient({
      market: "app-store",
      sinks: [
        {
          id: "test",
          logGameEvent: (name, params) => seen.push({ name, params }),
        },
      ],
    });
    const guard = createBonusPuzzlePanelImpressionGuard();

    return { client, guard, seen };
  }

  it("AC-2: status=waiting|available|used|unlocked를 기록한다 (#278)", () => {
    const { client, guard, seen } = createRecorder();

    for (const status of [
      "waiting",
      "available",
      "used",
      "unlocked",
    ] as const) {
      assert.equal(
        trackBonusPuzzlePanelImpression(client, guard, context(), status),
        true,
      );
    }

    assert.deepEqual(
      seen.map(({ name, params }) => [name, params.status]),
      [
        ["bonus_puzzle_panel_impression", "waiting"],
        ["bonus_puzzle_panel_impression", "available"],
        ["bonus_puzzle_panel_impression", "used"],
        ["bonus_puzzle_panel_impression", "unlocked"],
      ],
    );
  });

  it("AC-3: 같은 세션·같은 상태는 1회만 기록하고 상태 전이는 새로 기록한다 (#278)", () => {
    const { client, guard, seen } = createRecorder();

    assert.equal(
      trackBonusPuzzlePanelImpression(client, guard, context(), "available"),
      true,
    );
    assert.equal(
      trackBonusPuzzlePanelImpression(client, guard, context(), "available"),
      false,
    );
    assert.equal(
      trackBonusPuzzlePanelImpression(client, guard, context(), "unlocked"),
      true,
    );
    assert.equal(
      trackBonusPuzzlePanelImpression(client, guard, context(), "unlocked"),
      false,
    );

    assert.deepEqual(
      seen.map(({ params }) => params.status),
      ["available", "unlocked"],
    );
  });

  it("AC-4: loading 상태는 제외한다 (#278)", () => {
    const { client, guard, seen } = createRecorder();

    assert.equal(
      trackBonusPuzzlePanelImpression(client, guard, context(), "loading"),
      false,
    );
    assert.deepEqual(seen, []);
  });

  it("AC-5: Web/mobile 공통 정책과 자동 회귀 테스트를 제공한다 (#278)", () => {
    const webApp = readFileSync(
      new URL("../../../src/App.tsx", import.meta.url),
      "utf8",
    );
    const mobileApp = readFileSync(
      new URL("../../../apps/mobile/App.tsx", import.meta.url),
      "utf8",
    );

    for (const appSource of [webApp, mobileApp]) {
      assert.match(appSource, /createBonusPuzzlePanelImpressionGuard/);
      assert.match(appSource, /trackBonusPuzzlePanelImpression/);
      assert.match(
        appSource,
        /route !== ["']home["'] && route !== ["']result["']/,
      );
    }
  });
});

describe("buildGameProgressionEvent (#292)", () => {
  it("market·schema_version을 병합하고 페이로드를 snake_case 숫자로 변환한다", () => {
    const { name, params } = buildGameProgressionEvent("streak_view", {
      market: "apps-in-toss",
      payload: { currentStreak: 6, longestStreak: 12 },
    });

    assert.equal(name, "streak_view");
    assert.equal(params.market, "apps-in-toss");
    assert.equal(params.schema_version, GAME_ANALYTICS_SCHEMA_VERSION);
    // 숫자형 유지(string 적재 금지).
    assert.equal(params.current_streak, 6);
    assert.equal(params.longest_streak, 12);
    assert.equal(typeof params.current_streak, "number");
    // 진척 이벤트는 퍼즐 컨텍스트를 싣지 않는다.
    assert.ok(!("puzzle_id" in params));
    assert.ok(!("difficulty" in params));
  });

  it("streak_milestone·personal_stats_view 페이로드를 변환한다", () => {
    const milestone = buildGameProgressionEvent("streak_milestone", {
      market: "google-play",
      payload: { streakLength: 7 },
    });
    assert.equal(milestone.params.streak_length, 7);
    assert.equal(milestone.params.market, "google-play");

    const statsView = buildGameProgressionEvent("personal_stats_view", {
      market: "app-store",
      payload: { totalPuzzles: 20, completedCount: 13 },
    });
    assert.equal(statsView.params.total_puzzles, 20);
    assert.equal(statsView.params.completed_count, 13);
  });
});

describe("createGameAnalyticsClient.trackProgression (#292)", () => {
  it("등록된 모든 sink에 마켓을 주입해 진척 이벤트를 팬아웃한다", () => {
    const seen: Array<{ name: string; params: Record<string, unknown> }> = [];
    const client = createGameAnalyticsClient({
      market: "apps-in-toss",
      sinks: [
        {
          id: "test",
          logGameEvent: (name, params) => seen.push({ name, params }),
        },
      ],
    });

    client.trackProgression("personal_stats_view", {
      totalPuzzles: 4,
      completedCount: 2,
    });
    client.trackProgression("streak_view", {
      currentStreak: 3,
      longestStreak: 9,
    });

    assert.deepEqual(
      seen.map(({ name }) => name),
      ["personal_stats_view", "streak_view"],
    );
    assert.equal(seen[0].params.market, "apps-in-toss");
    assert.equal(seen[0].params.total_puzzles, 4);
    assert.equal(seen[1].params.longest_streak, 9);
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
      client.trackProgression("streak_milestone", { streakLength: 30 });
    });
    assert.deepEqual(seen, ["streak_milestone"]);
    assert.equal(errors.length, 1);
  });
});

describe("진척 이벤트 web 배선 회귀 (#292)", () => {
  it("HistoryScreen 노출·스트릭 갱신에 trackProgression을 배선한다", () => {
    const webApp = readFileSync(
      new URL("../../../src/App.tsx", import.meta.url),
      "utf8",
    );

    // 화면 노출 이벤트 2종 + 스트릭 마일스톤 달성 이벤트 배선.
    assert.match(webApp, /trackProgression\(\s*["']personal_stats_view["']/);
    assert.match(webApp, /trackProgression\(\s*["']streak_view["']/);
    assert.match(webApp, /trackProgression\(\s*["']streak_milestone["']/);
    // 마일스톤 발화 조건은 core 규칙(getNewlyReachedStreakMilestone)으로 판정한다.
    assert.match(webApp, /getNewlyReachedStreakMilestone\(/);
    // 화면 노출당 1회: 노출 이벤트는 빈 의존성 useEffect(마운트 1회) 가드 안에 있다.
    assert.match(
      webApp,
      /trackProgression\(\s*["']streak_view["'][\s\S]*?\}\s*,\s*\[\]\s*\)/,
    );
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
