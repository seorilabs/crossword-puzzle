import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCompletionTransition,
  type InterstitialPort,
  type InterstitialEvent,
} from "./completionInterstitial.ts";
test("AC-5 completion saves once, double click and reopened result do not repeat ad; close precedes navigation", async () => {
  const events: string[] = [];
  let close: () => void = () => {};
  const saved = new Set<string>();
  const ad: InterstitialPort = {
    ready: () => true,
    preload() {},
    dispose() {},
    show(track) {
      events.push("show");
      track("ad_impression");
      return new Promise((resolve) => {
        close = () => {
          track("ad_closed");
          resolve();
        };
      });
    },
  };
  const flow = createCompletionTransition(
    ad,
    {
      consumed: async (id) => saved.has(id),
      consume: async (id) => {
        saved.add(id);
        events.push("save");
      },
    },
    (e) => events.push(e),
  );
  const one = flow.leave("en-day-1", true, () => {
    events.push("next");
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flow.leave("en-day-1", true, () => {
    events.push("duplicate");
  });
  assert.deepEqual(events, ["save", "ad_requested", "show", "ad_impression"]);
  close();
  await one;
  assert.deepEqual(events.slice(-2), ["ad_closed", "next"]);
  await flow.leave("en-day-1", true, () => {});
  assert.equal(events.filter((x) => x === "show").length, 1);
});
test("AC-5 unready and failed ads advance, and a later load never shows over gameplay", async () => {
  for (const ready of [false, true]) {
    let shows = 0,
      moves = 0;
    const events: InterstitialEvent[] = [];
    const flow = createCompletionTransition(
      {
        ready: () => ready,
        preload() {},
        dispose() {},
        async show() {
          shows++;
          throw Error("no-fill");
        },
      },
      { consumed: async () => false, consume: async () => {} },
      (e) => events.push(e),
    );
    await flow.leave("ko-day-5", true, () => {
      moves++;
    });
    assert.equal(moves, 1);
    assert.equal(shows, ready ? 1 : 0);
    assert.ok(events.includes("ad_failed"));
  }
});
test("AC-5 incomplete or already consumed result never requests an ad", async () => {
  let requested = 0;
  const flow = createCompletionTransition(
    {
      ready: () => true,
      preload() {},
      dispose() {},
      async show() {
        throw Error();
      },
    },
    { consumed: async () => true, consume: async () => {} },
    () => requested++,
  );
  await flow.leave("legacy", true, () => {});
  await flow.leave("partial", false, () => {});
  assert.equal(requested, 0);
});
test("AC-5 failed completion persistence neither shows ads nor advances and permits safe retry", async () => {
  let shows = 0,
    moves = 0;
  const flow = createCompletionTransition(
    {
      ready: () => true,
      preload() {},
      dispose() {},
      async show() {
        shows++;
      },
    },
    { consumed: async () => false, consume: async () => {} },
    () => {},
  );
  await assert.rejects(
    flow.leave(
      "en-day-1",
      true,
      () => {
        moves++;
      },
      async () => {
        throw Error("disk full");
      },
    ),
  );
  assert.equal(shows, 0);
  assert.equal(moves, 0);
  await flow.leave(
    "en-day-1",
    true,
    () => {
      moves++;
    },
    async () => {},
  );
  assert.equal(shows, 1);
  assert.equal(moves, 1);
});
