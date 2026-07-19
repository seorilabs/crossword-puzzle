import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { collectPuzzleHostingFiles } from "../server/batch/publish-puzzle-pack.mjs";
import { createNativeGameAssetManifest } from "./build-native-game-bundle.mjs";
import {
  assertNoGameContentInAitArtifact,
  assertNoGameContentInDirectory,
  hasGameContentPathSegment,
  listEmbeddedZipEntryNames,
  removeGameContentFromBuildOutput,
} from "./game-content-publish-boundary.mjs";

function createStoredZip(entries, prefix = Buffer.from("AITBUNDL-fixture")) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;

  for (const entryName of entries) {
    const name = Buffer.from(entryName);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localRecords.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    centralRecords.push(central);
    localOffset += local.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([prefix, ...localRecords, centralDirectory, end]);
}

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "crossword-artifact-boundary-"),
  );
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("classifies only exact game-content path segments", () => {
  assert.equal(hasGameContentPathSegment("game-content/current.json"), true);
  assert.equal(
    hasGameContentPathSegment("web/game-content/candidates/catalog.json"),
    true,
  );
  assert.equal(hasGameContentPathSegment("game-content-safe/file.json"), false);
  assert.equal(hasGameContentPathSegment("assets/game-content.js"), false);
});

test("removes only game-content from the Vite build output", async () => {
  await withTemporaryDirectory(async (directory) => {
    await mkdir(path.join(directory, "puzzles"), { recursive: true });
    await mkdir(path.join(directory, "game-content/candidates"), {
      recursive: true,
    });
    await mkdir(path.join(directory, "game-content/packs"), {
      recursive: true,
    });
    await writeFile(path.join(directory, "index.html"), "<!doctype html>");
    await writeFile(path.join(directory, "puzzles/manifest.json"), "{}");
    await writeFile(
      path.join(directory, "game-content/candidates/catalog.json"),
      "{}",
    );
    await writeFile(path.join(directory, "game-content/current.json"), "{}");
    await writeFile(path.join(directory, "game-content/packs/pack.json"), "{}");

    await removeGameContentFromBuildOutput(directory);
    await assertNoGameContentInDirectory(directory);
    assert.equal(
      await readFile(path.join(directory, "index.html"), "utf8"),
      "<!doctype html>",
    );
    assert.equal(
      await readFile(path.join(directory, "puzzles/manifest.json"), "utf8"),
      "{}",
    );
  });
});

test("directory checker rejects nested AIT web game-content", async () => {
  await withTemporaryDirectory(async (directory) => {
    await mkdir(path.join(directory, "web/game-content/candidates"), {
      recursive: true,
    });
    await writeFile(
      path.join(directory, "web/game-content/candidates/catalog.json"),
      "{}",
    );
    await assert.rejects(
      assertNoGameContentInDirectory(directory),
      /contains forbidden \*\*\/game-content\/\*\*/,
    );
  });
});

test("AIT checker reads the embedded ZIP index and rejects every game-content class", async () => {
  await withTemporaryDirectory(async (directory) => {
    const safeArtifact = path.join(directory, "safe.ait");
    const unsafeArtifact = path.join(directory, "unsafe.ait");
    const safeEntries = ["web/index.html", "web/puzzles/manifest.json"];
    const unsafeEntries = [
      ...safeEntries,
      "web/game-content/v1/ko-KR/candidates/catalog.json",
      "web/game-content/v1/ko-KR/current.json",
      "web/game-content/v1/ko-KR/packs/launch/sha256:fixture.json",
    ];
    await writeFile(safeArtifact, createStoredZip(safeEntries));
    await writeFile(unsafeArtifact, createStoredZip(unsafeEntries));

    assert.deepEqual(
      listEmbeddedZipEntryNames(await readFile(safeArtifact)),
      safeEntries,
    );
    await assertNoGameContentInAitArtifact(safeArtifact);
    await assert.rejects(
      assertNoGameContentInAitArtifact(unsafeArtifact),
      /web\/game-content\/v1\/ko-KR\/candidates\/catalog\.json/,
    );
  });
});

test("one temporary public/game-content fixture is blocked by AIT, native, and publisher boundaries", async () => {
  await withTemporaryDirectory(async (root) => {
    const publicDirectory = path.join(root, "public");
    const fixtureRelativePath =
      "game-content/v1/ko-KR/candidates/catalog.json";
    const fixturePath = path.join(publicDirectory, fixtureRelativePath);
    const fixture = JSON.stringify({ artifactStatus: "candidate" });
    await mkdir(path.dirname(fixturePath), { recursive: true });
    await writeFile(path.join(publicDirectory, "index.html"), "<!doctype html>");
    await writeFile(fixturePath, fixture);

    const hostingPlan = await collectPuzzleHostingFiles(publicDirectory);
    assert.equal(hostingPlan.excludedFileCount, 1);
    assert.equal(
      hostingPlan.files.some((file) =>
        hasGameContentPathSegment(file.path),
      ),
      false,
    );

    const nativeDirectory = path.join(root, "native");
    const nativeFixturePath = path.join(nativeDirectory, fixtureRelativePath);
    await mkdir(path.dirname(nativeFixturePath), { recursive: true });
    await writeFile(path.join(nativeDirectory, "index.html"), "<!doctype html>");
    await writeFile(nativeFixturePath, await readFile(fixturePath));
    await assert.rejects(
      createNativeGameAssetManifest(nativeDirectory),
      /published game-content is forbidden in native assets/,
    );

    const aitArtifact = path.join(root, "unsafe.ait");
    await writeFile(
      aitArtifact,
      createStoredZip(["web/index.html", `web/${fixtureRelativePath}`]),
    );
    await assert.rejects(
      assertNoGameContentInAitArtifact(aitArtifact),
      /game-content\/v1\/ko-KR\/candidates\/catalog\.json/,
    );
  });
});
