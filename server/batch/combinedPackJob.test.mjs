import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runPuzzlePackJob } from "./run-puzzle-pack-job.mjs";
async function stagedJob({
  languageFailure = false,
  bootstrap = false,
  explicitOutDir = true,
} = {}) {
  const previous = { ...process.env };
  const outDir = await mkdtemp(path.join(tmpdir(), "crossword-combined-job-"));
  const calls = [];
  let preparation;
  try {
    for (const key of Object.keys(process.env))
      if (key.startsWith("PUZZLE_")) delete process.env[key];
    Object.assign(process.env, {
      PUZZLE_HOSTING_BASE_URL: "https://test.web.app",
      FIREBASE_HOSTING_SITE: "test",
      PUZZLE_DAILY_TIERS: "false",
    });
    if (bootstrap) process.env.PUZZLE_LANGUAGE_BOOTSTRAP = "true";
    const execute = () =>
      runPuzzlePackJob({
        argv: explicitOutDir ? [`--outDir=${outDir}/puzzles`] : [],
        now: new Date("2026-10-26T00:00:00Z"),
        runScript: async (script, args) => {
          calls.push({ script, args });
        },
        prepareLanguages: async (options) => {
          preparation = options;
          return "filtered-wordbank.json";
        },
        refreshLegacyHistory: async () => {},
        restoreLegacyState: async () => ({ puzzles: [] }),
        verifyLegacyState: async () => {},
        runLanguageJob: async (options) => {
          calls.push({ script: "languages", options });
          if (languageFailure) throw new Error("English generation failed");
        },
        validateLanguages: async (options) => {
          calls.push({ script: "validate-languages", options });
        },
        resolveLiveRelease: async () => ({
          name: "sites/test/releases/source",
        }),
      });
    if (languageFailure)
      await assert.rejects(execute(), /English generation failed/);
    else await execute();
    return { calls, preparation };
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    await rm(outDir, { recursive: true, force: true });
  }
}
test("AC-2 scheduled job stages legacy and both languages before a single atomic publication", async () => {
  const { calls, preparation } = await stagedJob();
  assert.equal(preparation.bootstrap, false);
  assert.deepEqual(
    calls.map((call) => call.script),
    [
      "server/batch/generate-puzzle-pack.mjs",
      "scripts/validate-puzzle-pack.mjs",
      "languages",
      "validate-languages",
      "server/batch/publish-puzzle-pack.mjs",
      "server/batch/check-puzzle-pack-health.mjs",
    ],
  );
  const publish = calls.find((call) =>
    call.script.endsWith("publish-puzzle-pack.mjs"),
  );
  assert.ok(
    publish.args.includes("--expectedRelease=sites/test/releases/source"),
  );
});
test("AC-2 English generation failure prevents legacy-only publication", async () => {
  const { calls } = await stagedJob({ languageFailure: true });
  assert.equal(
    calls.some((call) => call.script.endsWith("publish-puzzle-pack.mjs")),
    false,
  );
});

test("AC-2 bootstrap is enabled only by an explicit execution override", async () => {
  const { preparation } = await stagedJob({ bootstrap: true });
  assert.equal(preparation.bootstrap, true);
});
test("AC-2 default scheduled output uses an isolated temporary workspace", async () => {
  const { preparation } = await stagedJob({ explicitOutDir: false });
  assert.ok(
    preparation.outDir.startsWith(path.join(tmpdir(), "crossword-pack-job-")),
  );
  assert.ok(preparation.outDir.endsWith("public/puzzles"));
});
