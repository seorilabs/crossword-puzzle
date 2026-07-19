import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  checkNativeGameAssetManifest,
  createNativeGameAssetManifest,
  isPinnedPhaserModuleId,
  NATIVE_GAME_ASSET_MANIFEST,
  sanitizePhaserForNativeWebView,
  serializeNativeGameAssetManifest,
  writeNativeGameAssetManifest,
} from "./build-native-game-bundle.mjs";

const phaserDynamicFallbackFixture = `
if (typeof globalThis === 'object') return globalThis;
return this || new Function('return this')();
`;

test("removes only the known Phaser dynamic global fallback", () => {
  const sanitized = sanitizePhaserForNativeWebView(
    phaserDynamicFallbackFixture,
  );

  assert.doesNotMatch(sanitized, /new Function/);
  assert.match(sanitized, /return this \|\| globalThis;/);
});

test("fails closed when the pinned Phaser fallback shape changes", () => {
  assert.throws(
    () => sanitizePhaserForNativeWebView("export default {};"),
    /found 0/,
  );
  assert.throws(
    () =>
      sanitizePhaserForNativeWebView(
        `${phaserDynamicFallbackFixture}${phaserDynamicFallbackFixture}`,
      ),
    /found 2/,
  );
});

test("matches the pinned Phaser module through npm and pnpm symlink paths", () => {
  const configuredPath = resolve("node_modules/phaser/dist/phaser.esm.js");
  assert.equal(isPinnedPhaserModuleId(configuredPath), true);
  assert.equal(isPinnedPhaserModuleId(`${configuredPath}?v=fixture`), true);
  assert.equal(
    isPinnedPhaserModuleId(resolve("node_modules/phaser/dist/phaser.js")),
    false,
  );
});

async function withBundle(run) {
  const directory = await mkdtemp(join(tmpdir(), "crossword-native-bundle-"));
  try {
    await mkdir(join(directory, "assets"));
    await writeFile(
      join(directory, "index.html"),
      '<!doctype html><script type="module" src="./assets/game.js"></script>\n',
    );
    await writeFile(
      join(directory, "assets/game.js"),
      "export const game = 1;\n",
    );
    await writeFile(
      join(directory, "assets/game.css"),
      "body { margin: 0; }\n",
    );
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("creates a canonical deterministic manifest and excludes itself", async () => {
  await withBundle(async (directory) => {
    const first = await writeNativeGameAssetManifest(directory);
    const firstSerialized = await readFile(
      join(directory, NATIVE_GAME_ASSET_MANIFEST),
      "utf8",
    );
    const second = await createNativeGameAssetManifest(directory);

    assert.deepEqual(second, first);
    assert.equal(firstSerialized, serializeNativeGameAssetManifest(first));
    assert.deepEqual(
      first.files.map((file) => file.path),
      ["assets/game.css", "assets/game.js", "index.html"],
    );
    assert.equal(
      first.files.some((file) => file.path === NATIVE_GAME_ASSET_MANIFEST),
      false,
    );
    assert.match(first.aggregateChecksum, /^sha256:[a-f0-9]{64}$/);
    for (const file of first.files) {
      assert.match(file.sha256, /^[a-f0-9]{64}$/);
      assert.ok(file.bytes > 0);
    }
    await checkNativeGameAssetManifest(directory);
  });
});

test("rejects changed, added, or removed files", async (context) => {
  await context.test("changed file", async () => {
    await withBundle(async (directory) => {
      await writeNativeGameAssetManifest(directory);
      await writeFile(
        join(directory, "assets/game.js"),
        "export const game = 2;\n",
      );
      await assert.rejects(
        checkNativeGameAssetManifest(directory),
        /does not match bundle contents/,
      );
    });
  });

  await context.test("added file", async () => {
    await withBundle(async (directory) => {
      await writeNativeGameAssetManifest(directory);
      await writeFile(join(directory, "assets/extra.js"), "export {};\n");
      await assert.rejects(
        checkNativeGameAssetManifest(directory),
        /does not match bundle contents/,
      );
    });
  });

  await context.test("removed file", async () => {
    await withBundle(async (directory) => {
      await writeNativeGameAssetManifest(directory);
      await rm(join(directory, "assets/game.css"));
      await assert.rejects(
        checkNativeGameAssetManifest(directory),
        /does not match bundle contents/,
      );
    });
  });
});

test("rejects eval and new Function in executable assets", async (context) => {
  for (const [label, source, expected] of [
    ["eval", "eval('unsafe');\n", /eval\(\.\.\.\) is forbidden/],
    [
      "new Function",
      "const unsafe = new Function('return 1');\n",
      /new Function\(\.\.\.\) is forbidden/,
    ],
  ]) {
    await context.test(label, async () => {
      await withBundle(async (directory) => {
        await writeFile(join(directory, "assets/game.js"), source);
        await assert.rejects(
          createNativeGameAssetManifest(directory),
          expected,
        );
      });
    });
  }
});

test("rejects development checkpoint preview code in native assets", async (context) => {
  for (const signature of [
    "/tmp/launch-content-checkpoints/",
    "Launch preview checkpoint rejected:",
  ]) {
    await context.test(signature, async () => {
      await withBundle(async (directory) => {
        await writeFile(
          join(directory, "assets/game.js"),
          `export const developmentOnly = ${JSON.stringify(signature)};\n`,
        );
        await assert.rejects(
          createNativeGameAssetManifest(directory),
          /development launch preview content is forbidden/,
        );
      });
    });
  }
});

test("keeps public game-content out of native assets", async () => {
  const nativeViteConfig = await readFile(
    resolve("vite.native-game.config.ts"),
    "utf8",
  );
  assert.match(nativeViteConfig, /publicDir:\s*false/);

  await withBundle(async (directory) => {
    await mkdir(join(directory, "game-content/candidates"), {
      recursive: true,
    });
    await writeFile(
      join(directory, "game-content/candidates/catalog.json"),
      "{}\n",
    );
    await assert.rejects(
      createNativeGameAssetManifest(directory),
      /published game-content is forbidden in native assets/,
    );
  });
});

test("rejects HTTP, HTTPS, and protocol-relative script sources", async (context) => {
  for (const source of [
    "http://example.com/game.js",
    "https://example.com/game.js",
    "//example.com/game.js",
  ]) {
    await context.test(source, async () => {
      await withBundle(async (directory) => {
        await writeFile(
          join(directory, "index.html"),
          `<script src="${source}"></script>\n`,
        );
        await assert.rejects(
          createNativeGameAssetManifest(directory),
          /remote script source is forbidden/,
        );
      });
    });
  }
});
