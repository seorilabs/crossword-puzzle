import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { KeyValueStoragePort } from "./gameSaveRepository.ts";
import {
  createBrowserGameRuntimeStorage,
  createCanonicalGameRuntimeStorage,
  createLaunchPreviewGameRuntimeStorage,
  createLaunchReviewGameRuntimeStorage,
  getLaunchPreviewStoragePrefix,
  getLaunchReviewStoragePrefix,
} from "./gameRuntimeStorage.ts";

function memoryStorage(initial: Record<string, string> = {}): {
  port: KeyValueStoragePort;
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    port: {
      async getItem(key) {
        return values.get(key) ?? null;
      },
      async setItem(key, value) {
        values.set(key, value);
      },
      async removeItem(key) {
        values.delete(key);
      },
    },
  };
}

describe("game runtime durable storage", () => {
  test("launch preview save와 boot marker는 hash별 7판 namespace에만 접근한다", async () => {
    const checkpointHash = "a".repeat(64);
    const prefix = `crossword:dev-launch-preview:${checkpointHash}:7:`;
    const base = memoryStorage({
      "crossword:game-save:v2": "production-save",
      game_boot_pending: "production-marker",
    });
    const storage = createLaunchPreviewGameRuntimeStorage(
      base.port,
      checkpointHash,
    );

    assert.equal(getLaunchPreviewStoragePrefix(checkpointHash), prefix);
    assert.equal(await storage.getItem("crossword:game-save:v2"), null);
    assert.equal(await storage.getItem("game_boot_pending"), null);

    await storage.setItem("crossword:game-save:v2", "preview-save");
    await storage.setItem("game_boot_pending", "preview-marker");
    assert.equal(
      base.values.get(`${prefix}crossword:game-save:v2`),
      "preview-save",
    );
    assert.equal(
      base.values.get(`${prefix}game_boot_pending`),
      "preview-marker",
    );
    assert.equal(base.values.get("crossword:game-save:v2"), "production-save");
    assert.equal(base.values.get("game_boot_pending"), "production-marker");

    await storage.removeItem("crossword:game-save:v2");
    await storage.removeItem("game_boot_pending");
    assert.equal(base.values.has(`${prefix}crossword:game-save:v2`), false);
    assert.equal(base.values.has(`${prefix}game_boot_pending`), false);
    assert.equal(base.values.get("crossword:game-save:v2"), "production-save");
    assert.equal(base.values.get("game_boot_pending"), "production-marker");
  });

  test("launch preview storage는 lowercase 64 hex 밖의 namespace를 거부한다", () => {
    const base = memoryStorage();
    for (const invalidHash of [
      "A".repeat(64),
      "a".repeat(63),
      `sha256:${"a".repeat(64)}`,
      `${"a".repeat(62)}/.`,
    ]) {
      assert.throws(
        () => createLaunchPreviewGameRuntimeStorage(base.port, invalidHash),
        /exactly 64 lowercase hexadecimal/,
      );
    }
  });

  test("launch review save와 boot marker는 catalog 및 page/puzzle 선택별로 격리한다", async () => {
    const catalogHash = "b".repeat(64);
    const pageSelection = { kind: "page", page: 2 } as const;
    const puzzleSelection = {
      kind: "puzzle",
      puzzleId: "ko-kr-bonus-01",
    } as const;
    const pagePrefix = `crossword:dev-launch-review:${catalogHash}:page-02:`;
    const puzzlePrefix = `crossword:dev-launch-review:${catalogHash}:puzzle-ko-kr-bonus-01:`;
    const base = memoryStorage({
      "crossword:game-save:v2": "production-save",
      game_boot_pending: "production-marker",
    });
    const pageStorage = createLaunchReviewGameRuntimeStorage(
      base.port,
      catalogHash,
      pageSelection,
    );
    const puzzleStorage = createLaunchReviewGameRuntimeStorage(
      base.port,
      catalogHash,
      puzzleSelection,
    );

    assert.equal(
      getLaunchReviewStoragePrefix(catalogHash, pageSelection),
      pagePrefix,
    );
    assert.equal(
      getLaunchReviewStoragePrefix(catalogHash, puzzleSelection),
      puzzlePrefix,
    );
    await pageStorage.setItem("crossword:game-save:v2", "page-save");
    await puzzleStorage.setItem("crossword:game-save:v2", "puzzle-save");
    await pageStorage.setItem("game_boot_pending", "page-marker");

    assert.equal(
      base.values.get(`${pagePrefix}crossword:game-save:v2`),
      "page-save",
    );
    assert.equal(
      base.values.get(`${puzzlePrefix}crossword:game-save:v2`),
      "puzzle-save",
    );
    assert.equal(
      base.values.get(`${pagePrefix}game_boot_pending`),
      "page-marker",
    );
    assert.equal(base.values.get("crossword:game-save:v2"), "production-save");
    assert.equal(base.values.get("game_boot_pending"), "production-marker");
  });

  test("launch review storage는 잘못된 hash와 selection을 거부한다", () => {
    const base = memoryStorage();
    assert.throws(
      () =>
        createLaunchReviewGameRuntimeStorage(base.port, "B".repeat(64), {
          kind: "page",
          page: 1,
        }),
      /exactly 64 lowercase hexadecimal/,
    );
    for (const selection of [
      { kind: "page", page: 0 } as const,
      { kind: "page", page: 10 } as const,
      { kind: "puzzle", puzzleId: "../catalog" } as const,
    ]) {
      assert.throws(
        () =>
          createLaunchReviewGameRuntimeStorage(
            base.port,
            "b".repeat(64),
            selection,
          ),
        /selection is invalid/,
      );
    }
  });

  test("browser mutation은 read-back 뒤에만 ack한다", async () => {
    const values = new Map<string, string>();
    const storage = createBrowserGameRuntimeStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    });

    await storage.setItem("boot", "pending");
    assert.equal(await storage.getItem("boot"), "pending");
    await storage.removeItem("boot");
    assert.equal(await storage.getItem("boot"), null);
  });

  test("AIT canonical miss일 때만 legacy source를 한 번 승격한다", async () => {
    const canonical = memoryStorage();
    const legacy = memoryStorage({ save: "legacy-v1" });
    const storage = createCanonicalGameRuntimeStorage({
      canonical: canonical.port,
      migrationSource: legacy.port,
    });

    assert.equal(await storage.getItem("save"), "legacy-v1");
    assert.equal(canonical.values.get("save"), "legacy-v1");
    assert.equal(legacy.values.has("save"), false);

    canonical.values.set("save", "canonical-v2");
    legacy.values.set("save", "stale-legacy");
    assert.equal(await storage.getItem("save"), "canonical-v2");
    assert.equal(legacy.values.get("save"), "stale-legacy");
  });

  test("canonical set/remove 뒤 legacy source를 제거해 stale 재승격을 막는다", async () => {
    const canonical = memoryStorage();
    const legacy = memoryStorage({ save: "stale" });
    const storage = createCanonicalGameRuntimeStorage({
      canonical: canonical.port,
      migrationSource: legacy.port,
    });

    await storage.setItem("save", "v2");
    assert.equal(canonical.values.get("save"), "v2");
    assert.equal(legacy.values.has("save"), false);

    legacy.values.set("save", "stale-again");
    await storage.removeItem("save");
    assert.equal(canonical.values.has("save"), false);
    assert.equal(legacy.values.has("save"), false);
    assert.equal(await storage.getItem("save"), null);
  });

  test("rollback 대상 legacy key는 승격 뒤 보존하고 이후 write를 양쪽에 반영한다", async () => {
    const progressKey = "crossword-puzzle:progress:p1";
    const canonical = memoryStorage();
    const legacy = memoryStorage({ [progressKey]: "legacy-progress" });
    const storage = createCanonicalGameRuntimeStorage({
      canonical: canonical.port,
      migrationSource: legacy.port,
      shouldMirrorMigrationSource: (key) =>
        key.startsWith("crossword-puzzle:progress:"),
    });

    assert.equal(await storage.getItem(progressKey), "legacy-progress");
    assert.equal(legacy.values.get(progressKey), "legacy-progress");
    await storage.setItem(progressKey, "projected-progress");
    assert.equal(canonical.values.get(progressKey), "projected-progress");
    assert.equal(legacy.values.get(progressKey), "projected-progress");
  });

  test("canonical read-back이 다르면 durable ack를 거부한다", async () => {
    const broken: KeyValueStoragePort = {
      async getItem() {
        return null;
      },
      async setItem() {},
      async removeItem() {},
    };
    const storage = createCanonicalGameRuntimeStorage({ canonical: broken });

    await assert.rejects(
      storage.setItem("save", "v2"),
      /storage set acknowledgement failed/,
    );
  });
});
