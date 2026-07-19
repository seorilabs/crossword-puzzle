import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  collectPuzzleHostingFiles,
  deployHosting,
  EXCLUDED_GAME_CONTENT_PATH_CLASS,
} from "./publish-puzzle-pack.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = new URL("./publish-puzzle-pack.mjs", import.meta.url);

async function withPublicFixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), "crossword-publish-guard-"));
  const publicDir = path.join(root, "public");
  const manifestPath = path.join(publicDir, "puzzles/manifest.json");

  try {
    await mkdir(path.join(publicDir, "puzzles"), { recursive: true });
    await mkdir(path.join(publicDir, "game-content/v1/ko-KR/candidates"), {
      recursive: true,
    });
    await mkdir(path.join(publicDir, "game-content/v1/ko-KR/packs/launch"), {
      recursive: true,
    });
    await writeFile(
      manifestPath,
      JSON.stringify({ puzzles: [{ puzzleId: "fixture" }] }),
    );
    await writeFile(
      path.join(publicDir, "puzzles/fixture.json"),
      JSON.stringify({ puzzleId: "fixture" }),
    );
    await writeFile(path.join(publicDir, "appsintoss-logo.png"), "logo");
    await writeFile(
      path.join(publicDir, "game-content/v1/ko-KR/candidates/catalog.json"),
      JSON.stringify({ artifactStatus: "candidate" }),
    );
    await writeFile(
      path.join(publicDir, "game-content/v1/ko-KR/current.json"),
      JSON.stringify({ schemaVersion: "game-content-current/1" }),
    );
    await writeFile(
      path.join(
        publicDir,
        "game-content/v1/ko-KR/packs/launch/sha256:fixture.json",
      ),
      JSON.stringify({ contentChecksum: "sha256:fixture" }),
    );
    await run({ manifestPath, publicDir });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("excludes game-content while preserving the legacy public Hosting plan", async () => {
  await withPublicFixture(async ({ publicDir }) => {
    const plan = await collectPuzzleHostingFiles(publicDir);

    assert.equal(plan.excludedPathClass, EXCLUDED_GAME_CONTENT_PATH_CLASS);
    assert.equal(plan.excludedFileCount, 3);
    assert.deepEqual(
      plan.files.map((file) => file.path),
      [
        "/appsintoss-logo.png",
        "/puzzles/fixture.json",
        "/puzzles/manifest.json",
      ],
    );
    assert.equal(
      plan.files.some((file) => file.path.startsWith("/game-content")),
      false,
    );
  });
});

test("fails closed when publicDir itself is inside game-content", async () => {
  await withPublicFixture(async ({ publicDir }) => {
    await assert.rejects(
      collectPuzzleHostingFiles(path.join(publicDir, "game-content")),
      /publicDir must not be game-content or its descendant/,
    );
  });
});

test("never sends candidate, current, or pack paths to populateFiles", async () => {
  await withPublicFixture(async ({ publicDir }) => {
    const originalFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.endsWith("/versions")) {
        return new Response(
          JSON.stringify({ name: "sites/fixture/versions/version-1" }),
        );
      }
      if (url.endsWith(":populateFiles")) {
        return new Response(JSON.stringify({ uploadRequiredHashes: [] }));
      }
      if (url.includes("update_mask=status")) {
        return new Response(JSON.stringify({ status: "FINALIZED" }));
      }
      if (url.includes("/releases?")) {
        return new Response(
          JSON.stringify({ name: "sites/fixture/releases/release-1" }),
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    try {
      await deployHosting({
        options: {
          corsOrigin: "*",
          hostingBaseUrl: "https://fixture.web.app",
          project: "fixture-project",
          publicDir,
          site: "fixture",
        },
        token: "fixture-token",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const populateRequests = requests.filter((request) =>
      request.url.endsWith(":populateFiles"),
    );
    assert.equal(populateRequests.length, 1);
    const populateBody = JSON.parse(populateRequests[0].init.body);
    assert.deepEqual(Object.keys(populateBody.files).sort(), [
      "/appsintoss-logo.png",
      "/puzzles/fixture.json",
      "/puzzles/manifest.json",
    ]);
    assert.equal(
      Object.keys(populateBody.files).some((filePath) =>
        filePath.startsWith("/game-content"),
      ),
      false,
    );
  });
});

test("dry-run reports the excluded count and path class", async () => {
  await withPublicFixture(async ({ manifestPath, publicDir }) => {
    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath.pathname,
      "--dryRun",
      `--manifest=${manifestPath}`,
      `--publicDir=${publicDir}`,
    ]);

    assert.match(stdout, /Hosting files: 3 /);
    assert.match(stdout, /Excluded files: 3/);
    assert.match(stdout, /Excluded path class: \/game-content\/\*\*/);
    assert.match(stdout, /Puzzle count: 1/);
  });
});
