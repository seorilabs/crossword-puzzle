import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { waitForPublishedPack } from "./publishedPackVisibility.mjs";

async function staged(operation) {
  const outDir = await mkdtemp(path.join(tmpdir(), "crossword-visibility-"));
  const files = new Map([
    ["/puzzles/manifest.json", '{"puzzles":["today"]}\n'],
    ["/puzzles/ko/manifest.json", '{"language":"ko"}\n'],
    ["/puzzles/en/manifest.json", '{"language":"en"}\n'],
  ]);
  for (const [file, text] of files) {
    const target = path.join(outDir, file.replace("/puzzles/", ""));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  }
  let now = 0;
  const waits = [];
  try {
    await operation({
      files,
      waits,
      options: {
        outDir,
        baseUrl: "https://fixture.test",
        timeoutMs: 2,
        intervalMs: 1,
        clock: () => now,
        wait: async (ms) => {
          waits.push(ms);
          now += ms;
        },
      },
    });
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

test("SUPPLY-2 stale HTTP 200 and temporarily missing language manifests wait for staged bytes", async () => {
  await staged(async ({ files, waits, options }) => {
    const requests = [];
    await waitForPublishedPack({
      ...options,
      fetcher: async (input, init) => {
        const url = new URL(input);
        requests.push(url);
        assert.equal(init.cache, "no-store");
        assert.ok(url.searchParams.has("publication"));
        if (!waits.length && url.pathname.includes("/en/"))
          return new Response("", { status: 404 });
        return new Response(
          waits.length ? files.get(url.pathname) : '{"puzzles":[]}',
        );
      },
    });
    assert.deepEqual(waits, [1]);
    assert.equal(requests.length, 6);
  });
});

test("SUPPLY-2 permanent content mismatch fails within the deadline", async () => {
  await staged(async ({ files, waits, options }) => {
    await assert.rejects(
      waitForPublishedPack({
        ...options,
        fetcher: async (input) => {
          const file = new URL(input).pathname;
          return new Response(
            file.includes("/en/") ? "wrong bytes" : files.get(file),
          );
        },
      }),
      /did not match staged content: en\/manifest.json/,
    );
    assert.deepEqual(waits, [1, 1]);
  });
});

test("SUPPLY-2 matching legacy-only publication returns without delay", async () => {
  await staged(async ({ files, waits, options }) => {
    const requests = [];
    await waitForPublishedPack({
      ...options,
      languages: false,
      fetcher: async (input) => {
        const file = new URL(input).pathname;
        requests.push(file);
        return new Response(files.get(file));
      },
    });
    assert.deepEqual(requests, ["/puzzles/manifest.json"]);
    assert.deepEqual(waits, []);
  });
});
