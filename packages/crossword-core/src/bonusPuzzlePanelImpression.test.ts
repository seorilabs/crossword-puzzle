import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createBonusPuzzlePanelImpressionGuard,
  createGameAnalyticsClient,
  trackBonusPuzzlePanelImpression,
  type GamePuzzleContext,
} from "./gameAnalytics.ts";

const puzzleContext: GamePuzzleContext = {
  puzzleId: "puzzle-1",
  difficulty: "normal",
  gridSize: 9,
  wordCount: 12,
};

function createRecorder() {
  const seen: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = createGameAnalyticsClient({
    market: "google-play",
    sinks: [
      {
        id: "test",
        logGameEvent: (name, params) => seen.push({ name, params }),
      },
    ],
  });

  return {
    client,
    guard: createBonusPuzzlePanelImpressionGuard(),
    seen,
  };
}

describe("보너스 퍼즐 패널 노출 계측 수락 조건 (#278)", () => {
  it("AC-1: bonus_puzzle_panel_impression 이벤트를 기록한다", () => {
    const { client, guard, seen } = createRecorder();

    trackBonusPuzzlePanelImpression(client, guard, puzzleContext, "available");

    assert.equal(seen.length, 1);
    assert.equal(seen[0].name, "bonus_puzzle_panel_impression");
  });

  it("AC-2: status=waiting|available|used|unlocked를 기록한다", () => {
    const { client, guard, seen } = createRecorder();

    for (const status of [
      "waiting",
      "available",
      "used",
      "unlocked",
    ] as const) {
      trackBonusPuzzlePanelImpression(client, guard, puzzleContext, status);
    }

    assert.deepEqual(
      seen.map(({ params }) => params.status),
      ["waiting", "available", "used", "unlocked"],
    );
  });

  it("AC-3: 같은 세션·같은 상태는 1회만 기록하고 상태 전이는 새로 기록한다", () => {
    const { client, guard, seen } = createRecorder();

    assert.equal(
      trackBonusPuzzlePanelImpression(
        client,
        guard,
        puzzleContext,
        "available",
      ),
      true,
    );
    assert.equal(
      trackBonusPuzzlePanelImpression(
        client,
        guard,
        puzzleContext,
        "available",
      ),
      false,
    );
    assert.equal(
      trackBonusPuzzlePanelImpression(client, guard, puzzleContext, "unlocked"),
      true,
    );
    assert.deepEqual(
      seen.map(({ params }) => params.status),
      ["available", "unlocked"],
    );
  });

  it("AC-4: loading 상태는 제외한다", () => {
    const { client, guard, seen } = createRecorder();

    assert.equal(
      trackBonusPuzzlePanelImpression(client, guard, puzzleContext, "loading"),
      false,
    );
    assert.deepEqual(seen, []);
  });

  it("AC-5: Web/mobile 공통 정책과 자동 회귀 테스트를 제공한다", () => {
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
