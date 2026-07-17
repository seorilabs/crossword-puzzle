import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { KeyValueStoragePort } from "./gameSaveRepository.ts";
import {
  createBrowserGameRuntimeStorage,
  createCanonicalGameRuntimeStorage,
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
