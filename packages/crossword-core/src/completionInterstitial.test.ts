import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCompletionTransition,
  normalizeAdHistory,
  type AdHistory,
  type InterstitialEvent,
} from "./completionInterstitial.ts";
function fixture() {
  let time = Date.UTC(2026, 9, 31),
    history: AdHistory | null = null,
    ready = true,
    shows = 0;
  const consumed = new Set<string>(),
    events: string[] = [];
  const ad = {
    preload() {},
    ready: () => ready,
    dispose() {},
    async show(track: (e: InterstitialEvent) => void) {
      shows++;
      track("ad_shown");
      track("ad_impression");
      track("ad_impression");
      time += 1000;
      track("ad_closed");
    },
  };
  const store = {
    consumed: async (id: string) => consumed.has(id),
    consume: async (id: string) => {
      consumed.add(id);
    },
    loadHistory: async () => history,
    saveHistory: async (h: AdHistory) => {
      history = structuredClone(h);
    },
  };
  const flow = () =>
    createCompletionTransition(
      ad,
      store,
      (e) => events.push(e),
      undefined,
      () => time,
    );
  return {
    flow,
    events,
    store,
    get history() {
      return history;
    },
    get shows() {
      return shows;
    },
    time: (n: number) => {
      time += n;
    },
    unready: () => {
      ready = false;
    },
  };
}
test("first session requires 90s active play, and late ready cannot reopen a consumed result", async () => {
  const f = fixture(),
    flow = f.flow();
  await flow.activity(true);
  f.time(89000);
  await flow.activity(true);
  await flow.complete("a", async () => {});
  assert.equal(f.shows, 0);
  assert.ok(f.events.includes("ad_skipped_initial_wait"));
  f.time(1000);
  await flow.activity(true);
  f.unready();
  await flow.complete("b", async () => {});
  assert.ok(f.events.includes("ad_skipped_unready"));
  await flow.complete("b", async () => {});
  assert.equal(f.shows, 0);
});
test("90s cooldown, 3 session cap, persisted history and session reset after inactivity", async () => {
  const f = fixture();
  let flow = f.flow();
  await flow.activity(true);
  f.time(90000);
  await flow.activity(true);
  await flow.complete("a", async () => {});
  assert.equal(f.shows, 1);
  assert.equal(f.history?.dailyImpressions, 1);
  f.time(89999);
  await flow.activity(false);
  await flow.complete("b", async () => {});
  assert.ok(f.events.includes("ad_skipped_interval"));
  f.time(1);
  await flow.activity(false);
  await flow.complete("c", async () => {});
  assert.equal(f.shows, 2);
  flow = f.flow();
  f.time(90000);
  await flow.activity(false);
  await flow.complete("d", async () => {});
  assert.equal(f.shows, 3);
  f.time(90000);
  await flow.activity(false);
  await flow.complete("e", async () => {});
  assert.ok(f.events.includes("ad_skipped_session_cap"));
  f.time(1800000);
  await flow.activity(true);
  f.time(90000);
  await flow.activity(true);
  await flow.complete("f", async () => {});
  assert.equal(f.shows, 4);
});
test("save failure prevents consumption and ad; duplicate completion and stale context do not show", async () => {
  const f = fixture(),
    flow = f.flow();
  await flow.activity(true);
  f.time(90000);
  await flow.activity(true);
  await assert.rejects(
    flow.complete("a", async () => {
      throw Error("full");
    }),
  );
  assert.equal(await f.store.consumed("a"), false);
  await Promise.all([
    flow.complete("a", async () => {}),
    flow.complete("a", async () => {}),
  ]);
  assert.equal(f.shows, 1);
  f.time(90000);
  await flow.complete(
    "b",
    async () => {},
    () => false,
  );
  assert.equal(f.shows, 1);
});
test("UTC cap persists across sessions and resets on UTC midnight; disabled and SDK failure are distinct", async () => {
  const f = fixture();
  await f.store.saveHistory({
    version: 1,
    lastActivityAt: Date.UTC(2026, 9, 31),
    sessionStartedAt: Date.UTC(2026, 9, 31),
    activePlayMs: 90000,
    sessionImpressions: 0,
    utcDay: "2026-10-31",
    dailyImpressions: 10,
  });
  const flow = f.flow();
  await flow.complete("cap", async () => {});
  assert.equal(f.shows, 0);
  assert.ok(f.events.includes("ad_skipped_daily_cap"));
  f.time(86400000);
  await flow.activity(true);
  f.time(90000);
  await flow.activity(true);
  await flow.complete("newday", async () => {});
  assert.equal(f.shows, 1);
});

test("pause and background time do not satisfy the first-play wait", async () => {
  const f = fixture(),
    flow = f.flow();
  await flow.activity(true);
  f.time(30000);
  await flow.activity(false);
  f.time(60000);
  await flow.activity(false, false);
  f.time(60000);
  await flow.activity(true);
  await flow.complete("paused", async () => {});
  assert.equal(f.shows, 0);
  assert.equal(f.history?.activePlayMs, 30000);
  f.time(60000);
  await flow.activity(true);
  await flow.complete("active", async () => {});
  assert.equal(f.shows, 1);
});
test("disabled, unready, SDK failure and storage failure remain distinct; late callbacks are ignored", async () => {
  const f = fixture(),
    events: string[] = [];
  let callback: ((e: InterstitialEvent) => void) | undefined;
  const ad = {
    preload() {},
    dispose() {},
    ready: () => true,
    async show(track: (e: InterstitialEvent) => void) {
      callback = track;
      throw Error("show error");
    },
  };
  const disabled = createCompletionTransition(
    ad,
    f.store,
    (e) => events.push(e),
    {
      enabled: false,
      initialWaitMs: 0,
      intervalMs: 90000,
      sessionCap: 3,
      dailyCap: 10,
    },
  );
  await disabled.complete("disabled", async () => {});
  assert.deepEqual(events, ["ad_opportunity", "ad_skipped_disabled"]);
  events.length = 0;
  const flow = createCompletionTransition(ad, f.store, (e) => events.push(e), {
    enabled: true,
    initialWaitMs: 0,
    intervalMs: 90000,
    sessionCap: 3,
    dailyCap: 10,
  });
  await flow.complete("failed", async () => {});
  assert.deepEqual(events, ["ad_opportunity", "ad_requested", "ad_failed"]);
  callback?.("ad_shown");
  callback?.("ad_closed");
  assert.equal(events.length, 3);
  const storageFailure = createCompletionTransition(
    ad,
    {
      ...f.store,
      async saveHistory() {
        throw Error("disk full");
      },
    },
    (e) => events.push(e),
  );
  await storageFailure.complete("storage", async () => {});
  assert.equal(events.at(-1), "ad_skipped_storage");
});

test("native shown-only callbacks count exactly one display without synthesizing an impression", async () => {
  const f = fixture(),
    events: InterstitialEvent[] = [];
  const ad = {
    preload() {},
    dispose() {},
    ready: () => true,
    async show(track: (event: InterstitialEvent) => void) {
      track("ad_shown");
      track("ad_shown");
      track("ad_closed");
    },
  };
  const flow = createCompletionTransition(
    ad,
    f.store,
    (event) => events.push(event),
    {
      enabled: true,
      initialWaitMs: 0,
      intervalMs: 90000,
      sessionCap: 3,
      dailyCap: 10,
    },
  );
  await flow.complete("native", async () => {});
  assert.equal(f.history?.sessionImpressions, 1);
  assert.equal(f.history?.dailyImpressions, 1);
  assert.equal(events.filter((event) => event === "ad_shown").length, 1);
  assert.equal(events.includes("ad_impression"), false);
});

test("a lost close-history write cannot reopen an ad after restart", async () => {
  const f = fixture();
  const persist = f.store.saveHistory;
  let failOnce = true;
  f.store.saveHistory = async (h) => {
    if (h.lastClosedAt != null && failOnce) {
      failOnce = false;
      throw Error("transient close write");
    }
    await persist(h);
  };
  const flow = f.flow();
  await flow.activity(true);
  f.time(90000);
  await flow.activity(false);
  await flow.complete("first", async () => {});
  const restarted = f.flow();
  f.time(1000);
  await restarted.complete("recover", async () => {});
  assert.equal(f.shows, 1);
  f.time(89999);
  await restarted.complete("early", async () => {});
  assert.equal(f.shows, 1);
  f.time(1);
  await restarted.complete("after-recovery-wait", async () => {});
  assert.equal(f.shows, 2);
});

test("a lost impression-history write cannot exceed the session cap", async () => {
  const f = fixture();
  const persist = f.store.saveHistory;
  let failOnce = true;
  f.store.saveHistory = async (h) => {
    if (h.sessionImpressions === 1 && h.lastClosedAt == null && failOnce) {
      failOnce = false;
      throw Error("transient count write");
    }
    await persist(h);
  };
  const flow = f.flow();
  await flow.activity(true);
  f.time(90000);
  await flow.activity(false);
  for (const id of ["first", "second", "third", "capped"]) {
    await flow.complete(id, async () => {});
    f.time(90000);
  }
  assert.equal(f.shows, 3);
  assert.equal(f.events.at(-1), "ad_skipped_session_cap");
});

test("an unresolved ad reserves one slot across a new session and UTC day", () => {
  const h = normalizeAdHistory(
    {
      version: 1,
      sessionStartedAt: 1,
      lastActivityAt: 1,
      activePlayMs: 90000,
      sessionImpressions: 2,
      dailyImpressions: 9,
      utcDay: "1970-01-01",
      pendingAd: true,
    },
    Date.UTC(2026, 10, 1),
  );
  assert.equal(h.sessionImpressions, 0);
  assert.equal(h.dailyImpressions, 0);
  assert.equal(h.sessionAdReservations, 1);
  assert.equal(h.dailyAdReservations, 1);
});

test("activity cannot overwrite a pending reservation while its write is in flight", async () => {
  const f = fixture();
  const persist = f.store.saveHistory;
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let writes = 0,
    concurrent = false;
  f.store.saveHistory = async (h) => {
    writes++;
    concurrent ||= writes > 1;
    if (h.pendingAd && !h.sessionImpressions) {
      entered();
      await blocked;
    }
    await persist(h);
    writes--;
  };
  const flow = f.flow();
  await flow.activity(true);
  f.time(90000);
  await flow.activity(false);
  const completion = flow.complete("during-timer", async () => {});
  await writing;
  f.time(1);
  const activity = flow.activity(false);
  await Promise.resolve();
  release();
  await Promise.all([completion, activity]);
  assert.equal(concurrent, false);
  assert.equal(f.history?.sessionAdReservations, 1);
  assert.equal(f.history?.sessionImpressions, 1);
});

test("leaving during the reservation write releases quota without showing a late ad", async () => {
  const f = fixture();
  const persist = f.store.saveHistory;
  let current = true;
  f.store.saveHistory = async (h) => {
    if (h.pendingAd) current = false;
    await persist(h);
  };
  const flow = f.flow();
  await flow.activity(true);
  f.time(90000);
  await flow.activity(false);
  await flow.complete(
    "left",
    async () => {},
    () => current,
  );
  assert.equal(f.shows, 0);
  assert.equal(f.history?.pendingAd, false);
  assert.equal(f.history?.sessionAdReservations, 0);
  assert.equal(f.history?.dailyAdReservations, 0);
});
