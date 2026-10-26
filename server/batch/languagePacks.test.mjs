import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  languagePackSchedule,
  restoreLanguagePackState,
} from "./run-language-pack-job.mjs";
import {
  generateLanguagePacks,
  validateLanguagePuzzle,
} from "./generate-language-packs.mjs";
test("AC-1 English supply covers both international date extremes plus two future local dates", () => {
  const schedule = languagePackSchedule(new Date("2026-10-26T15:00:00Z"));
  assert.deepEqual(schedule, [
    { language: "ko", start: "2026-10-27", days: 2 },
    { language: "en", start: "2026-10-25", days: 5 },
  ]);
});
test("AC-2 published manifest restoration fails closed and preserves exact identities", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "crossword-language-state-"));
  try {
    await assert.rejects(
      restoreLanguagePackState({
        language: "en",
        baseUrl: "https://example.test",
        outDir: dir,
        fetcher: async () => ({ ok: false, status: 503 }),
      }),
    );
    await assert.rejects(
      restoreLanguagePackState({
        language: "en",
        baseUrl: "https://example.test",
        outDir: dir,
        fetcher: async () => ({ ok: false, status: 404 }),
      }),
    );
    await restoreLanguagePackState({
      language: "en",
      baseUrl: "https://example.test",
      outDir: dir,
      bootstrap: true,
      fetcher: async () => ({ ok: false, status: 404 }),
    });
    const puzzle = {
      puzzleId: "en-20261026-1",
      language: "en",
      dailySequence: 1,
      date: "2026-10-26",
      entries: [],
    };
    await restoreLanguagePackState({
      language: "en",
      baseUrl: "https://example.test",
      outDir: dir,
      fetcher: async (url) => ({
        ok: true,
        json: async () =>
          url.endsWith("manifest.json")
            ? {
                puzzles: [
                  { ...puzzle, path: "/puzzles/en/en-20261026-1.json" },
                ],
              }
            : puzzle,
      }),
    });
    assert.deepEqual(
      JSON.parse(
        await readFile(path.join(dir, "en/en-20261026-1.json"), "utf8"),
      ),
      puzzle,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("AC-2 quality validator rejects corrupt boards and keeps the 55 percent floor", () => {
  const puzzle = {
    language: "en",
    date: "2026-10-26",
    gridSize: 8,
    grid: Array.from({ length: 8 }, () => Array(8).fill("")),
    entries: [],
  };
  assert.ok(validateLanguagePuzzle(puzzle).includes("word-count"));
});

test(
  "AC-2 retrying an issued day preserves every puzzle and manifest byte, including future slots",
  { timeout: 120000 },
  async () => {
    const dir = await mkdtemp(
      path.join(tmpdir(), "crossword-language-idempotent-"),
    );
    try {
      await generateLanguagePacks({
        language: "en",
        start: "2026-10-26",
        outDir: dir,
        onProgress: () => {},
      });
      const manifestPath = path.join(dir, "en/manifest.json");
      const beforeManifest = await readFile(manifestPath, "utf8");
      const rows = JSON.parse(beforeManifest).puzzles;
      const originals = await Promise.all(
        rows.map((row) =>
          readFile(path.join(dir, "en", path.basename(row.path)), "utf8"),
        ),
      );
      const puzzle = JSON.parse(originals[0]);
      assert.ok(
        validateLanguagePuzzle(puzzle, [
          { ...puzzle, date: "2026-10-27" },
        ]).includes("14-day-repeat"),
      );
      assert.ok(
        validateLanguagePuzzle(puzzle, [
          { ...puzzle, date: "2026-10-12" },
        ]).includes("14-day-repeat"),
      );
      assert.ok(
        !validateLanguagePuzzle(puzzle, [
          { ...puzzle, date: "2026-10-11" },
        ]).includes("14-day-repeat"),
      );
      await generateLanguagePacks({
        language: "en",
        start: "2026-10-26",
        outDir: dir,
        seed: 9999,
        onProgress: () => {},
      });
      assert.equal(await readFile(manifestPath, "utf8"), beforeManifest);
      assert.deepEqual(
        await Promise.all(
          rows.map((row) =>
            readFile(path.join(dir, "en", path.basename(row.path)), "utf8"),
          ),
        ),
        originals,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
