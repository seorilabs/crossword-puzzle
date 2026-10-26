import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateLanguagePacks } from "./generate-language-packs.mjs";
import { validateLanguagePackDirectory } from "./languagePackValidation.mjs";
import { restoreLanguagePackState } from "./run-language-pack-job.mjs";
import {
  prepareLanguagePublication,
  refreshKoreanLegacyHistory,
} from "./prepare-language-publication.mjs";

const schedule = [{ language: "en", start: "2026-10-26", days: 1 }];
test("AC-2 staging health checks actual boards, full five-puzzle days, future supply and 14-day repeats", async () => {
  const outDir = await mkdtemp(
    path.join(tmpdir(), "crossword-language-validation-"),
  );
  try {
    await generateLanguagePacks({
      language: "en",
      start: "2026-10-26",
      outDir,
      onProgress: () => {},
    });
    const healthy = await validateLanguagePackDirectory({ outDir, schedule });
    assert.equal(healthy[0].puzzleCount, 5);
    await assert.rejects(
      validateLanguagePackDirectory({
        outDir,
        schedule: [{ ...schedule[0], days: 2 }],
      }),
      /Missing en supply/,
    );
    const manifestPath = path.join(outDir, "en/manifest.json");
    const original = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(original);
    await writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, puzzles: manifest.puzzles.slice(1) }),
    );
    await assert.rejects(
      validateLanguagePackDirectory({ outDir, schedule }),
      /Incomplete en/,
    );
    await writeFile(manifestPath, original);
    const first = JSON.parse(
      await readFile(
        path.join(outDir, "en", manifest.puzzles[0].puzzleId + ".json"),
        "utf8",
      ),
    );
    const second = manifest.puzzles[1];
    await writeFile(
      path.join(outDir, "en", second.puzzleId + ".json"),
      JSON.stringify({
        ...first,
        puzzleId: second.puzzleId,
        dailySequence: second.dailySequence,
      }),
    );
    await assert.rejects(
      validateLanguagePackDirectory({ outDir, schedule }),
      /14-day-repeat/,
    );
    first.grid[0] = [];
    await writeFile(
      path.join(outDir, "en", manifest.puzzles[0].puzzleId + ".json"),
      JSON.stringify(first),
    );
    await assert.rejects(
      validateLanguagePackDirectory({ outDir, schedule }),
      /grid-size/,
    );
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
test("AC-2 restoring published puzzle bytes is immutable and missing state never bootstraps without an explicit flag", async () => {
  const outDir = await mkdtemp(
    path.join(tmpdir(), "crossword-language-restore-"),
  );
  const puzzle = {
    language: "en",
    date: "2026-10-26",
    dailySequence: 1,
    puzzleId: "en-20261026-1",
  };
  const puzzleText = JSON.stringify(puzzle, null, 3) + "\n\n";
  const manifestText =
    JSON.stringify(
      {
        language: "en",
        puzzles: [{ ...puzzle, path: "/puzzles/en/en-20261026-1.json" }],
      },
      null,
      2,
    ) + "\n";
  try {
    const requests = [];
    await restoreLanguagePackState({
      language: "en",
      baseUrl: "https://test.web.app",
      outDir,
      fetcher: async (input) => {
        const url = new URL(input);
        requests.push(url);
        return new Response(
          url.pathname.endsWith("manifest.json") ? manifestText : puzzleText,
        );
      },
    });
    assert.ok(requests.every((url) => url.searchParams.has("languageState")));
    assert.equal(
      await readFile(path.join(outDir, "en/en-20261026-1.json"), "utf8"),
      puzzleText,
    );
    assert.equal(
      await readFile(path.join(outDir, "en/manifest.json"), "utf8"),
      manifestText,
    );
    await assert.rejects(
      restoreLanguagePackState({
        language: "en",
        baseUrl: "https://test.web.app",
        outDir,
        fetcher: async () => new Response("", { status: 404 }),
      }),
      /404/,
    );
    await assert.rejects(
      restoreLanguagePackState({
        language: "en",
        baseUrl: "https://test.web.app",
        outDir,
        bootstrap: true,
        fetcher: async () => new Response("", { status: 503 }),
      }),
      /503/,
    );
    await assert.rejects(
      restoreLanguagePackState({
        language: "en",
        baseUrl: "https://test.web.app",
        outDir,
        fetcher: async (input) =>
          new URL(input).pathname.endsWith("manifest.json")
            ? new Response(manifestText)
            : new Response("", { status: 503 }),
      }),
      /Cannot restore published puzzle/,
    );
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
test("AC-2 legacy generation excludes issued Korean answers and new Korean generation sees the fresh legacy batch", async () => {
  const workspace = await mkdtemp(
    path.join(tmpdir(), "crossword-legacy-language-"),
  );
  const outDir = path.join(workspace, "public/puzzles");
  const sourceWordBank = path.join(workspace, "source-wordbank.json");
  const puzzle = {
    puzzleId: "ko-20261026-1",
    language: "ko",
    date: "2026-10-26",
    dailySequence: 1,
    entries: [{ answer: "기존" }],
  };
  const manifest = {
    language: "ko",
    puzzles: [{ ...puzzle, path: "/puzzles/ko/ko-20261026-1.json" }],
  };
  try {
    await writeFile(
      sourceWordBank,
      JSON.stringify({
        metadata: { license: "retained" },
        words: [{ answer: "기존" }, { answer: "새말" }],
      }),
    );
    const filtered = await prepareLanguagePublication({
      baseUrl: "https://test.web.app",
      outDir,
      workspace,
      bootstrap: true,
      wordBankPath: sourceWordBank,
      start: "2026-10-26",
      days: 1,
      fetcher: async (input) => {
        const url = new URL(input);
        if (url.pathname.includes("/en/"))
          return new Response("", { status: 404 });
        return new Response(
          JSON.stringify(
            url.pathname.endsWith("manifest.json") ? manifest : puzzle,
          ),
        );
      },
    });
    const bank = JSON.parse(await readFile(filtered, "utf8"));
    assert.deepEqual(bank.words, [{ answer: "새말" }]);
    assert.equal(bank.metadata.license, "retained");
    await mkdir(outDir, { recursive: true });
    const old = {
      puzzleId: "old",
      date: "2026-10-25",
      difficulty: "hard",
      answers: ["어제"],
    };
    const fresh = {
      puzzleId: "fresh",
      date: "2026-10-26",
      difficulty: "hard",
      answers: ["새말"],
    };
    await writeFile(
      path.join(outDir, "ko/prior-answer-history.json"),
      JSON.stringify({ puzzles: [old] }),
    );
    await writeFile(
      path.join(outDir, "answer-history.json"),
      JSON.stringify({ puzzles: [old, fresh] }),
    );
    await refreshKoreanLegacyHistory({ outDir });
    assert.deepEqual(
      JSON.parse(
        await readFile(
          path.join(outDir, "ko/prior-answer-history.json"),
          "utf8",
        ),
      ).puzzles,
      [old, fresh],
    );
    assert.deepEqual(
      JSON.parse(
        await readFile(path.join(outDir, "answer-history.json"), "utf8"),
      ).puzzles,
      [old, fresh],
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
