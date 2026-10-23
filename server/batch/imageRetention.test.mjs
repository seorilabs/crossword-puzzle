import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { planImageCleanup, deployProtectedImage } from "./imageRetention.mjs";

const image = (digest, days, tags = [], pkg = "puzzle-pack-job") => ({
  image: `registry/project/repo/${pkg}@${digest}`,
  package: pkg,
  digest,
  tags,
  createdAt: new Date(Date.UTC(2026, 9, 23) - days * 86400000).toISOString(),
});
const now = new Date("2026-10-23T00:00:00Z");

test("OPS-1/2: used images, protected tags, latest two per package and young images survive", () => {
  const images = [
    image("current", 80, ["runtime-current"]),
    image("rollback", 90, ["runtime-rollback"]),
    image("used", 100),
    image("new-1", 1),
    image("new-2", 15),
    image("old", 30, ["sha-old"]),
    image("stats-1", 50, [], "stats"),
    image("stats-2", 60, [], "stats"),
    image("stats-3", 70, [], "stats"),
  ];
  assert.deepEqual(
    planImageCleanup(images, { now, inUse: ["used"] }).map((i) => i.digest),
    ["old", "stats-3"],
  );
});
test("OPS-1: the exact 14-day boundary and an invalid timestamp are not deleted", () => {
  const images = [
    image("new-1", 0),
    image("new-2", 1),
    image("boundary", 14),
    { ...image("invalid", 30), createdAt: "unknown" },
  ];
  assert.deepEqual(planImageCleanup(images, { now, inUse: [] }), []);
});
function fake() {
  const events = [];
  const state = {
    generator: "old",
    health: "old",
    tags: {
      "runtime-current": "old",
      "runtime-rollback": "older",
      latest: "old",
    },
  };
  const api = {
    snapshot: async () => structuredClone(state),
    assertReadable: async (uri) => events.push(["read", uri]),
    setTag: async (tag, uri) => {
      events.push(["tag", tag, uri]);
      if (uri) state.tags[tag] = uri;
      else delete state.tags[tag];
    },
    updateJobs: async (uri) => {
      events.push(["jobs", uri]);
      state.generator = uri;
      state.health = uri;
    },
    restoreJobs: async (before) => {
      events.push(["restore"]);
      state.generator = before.generator;
      state.health = before.health;
    },
    checkHealth: async () => events.push(["health"]),
  };
  return { api, state, events };
}
test("OPS-3: consecutive deployments keep exactly two protection tags", async () => {
  const { api, state, events } = fake();
  await deployProtectedImage(api, "new");
  await deployProtectedImage(api, "newer");
  assert.equal(state.generator, "newer");
  assert.deepEqual(state.tags, {
    "runtime-current": "newer",
    "runtime-rollback": "new",
    latest: "newer",
  });
  assert.ok(
    events.findIndex((e) => e[0] === "tag" && e[1] === "runtime-rollback") <
      events.findIndex((e) => e[0] === "jobs"),
  );
});
test("OPS-3: a health failure restores both jobs and all original tag targets", async () => {
  const { api, state } = fake();
  const before = structuredClone(state);
  api.checkHealth = async () => {
    throw new Error("health failed");
  };
  await assert.rejects(deployProtectedImage(api, "new"), /health failed/);
  assert.deepEqual(state, before);
});
test("OPS-3: metadata access failure or mismatched jobs causes zero mutations", async () => {
  const { api, state, events } = fake();
  api.assertReadable = async () => {
    throw new Error("permission denied");
  };
  await assert.rejects(deployProtectedImage(api, "new"), /permission denied/);
  assert.deepEqual(events, []);
  state.health = "different";
  await assert.rejects(deployProtectedImage(api, "new"), /same image/);
  assert.deepEqual(events, []);
});
test("OPS-4/5: setup schedules health after generation and renders OPENED-only notifications", () => {
  const output = execFileSync(
    "bash",
    [
      "scripts/setup-puzzle-pack-monitoring.sh",
      "--project-id",
      "fixture-project",
      "--hosting-base-url",
      "https://fixture.example",
      "--dry-run",
    ],
    { encoding: "utf8" },
  );
  assert.match(output, /\(40 0 \* \* \*, Asia\/Seoul\)/);
  assert.match(output, /"notificationPrompts": \["OPENED"\]/);
  assert.match(output, /CLOSED.*복구/);
});
