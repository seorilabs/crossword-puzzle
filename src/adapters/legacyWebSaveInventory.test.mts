import assert from "node:assert/strict";
import { test } from "node:test";

import { captureLegacyWebSaveSnapshot } from "./legacyWebSaveInventory.ts";

test("Web/AIT inventory는 legacy namespace만 읽고 어떤 key도 변경하지 않는다", () => {
  const values = new Map([
    ["crossword-puzzle:progress:p1", '{"cellValues":{}}'],
    ["crossword:sound-enabled", "0"],
    ["crossword:game-save:v2", "new-save"],
    ["unrelated", "secret"],
  ]);
  const keys = [...values.keys()];
  const operations: string[] = [];
  const snapshot = captureLegacyWebSaveSnapshot({
    storage: {
      get length() {
        return keys.length;
      },
      key(index) {
        operations.push(`key:${index}`);
        return keys[index] ?? null;
      },
      getItem(key) {
        operations.push(`get:${key}`);
        return values.get(key) ?? null;
      },
    },
    market: "apps-in-toss",
    sourceVersion: "v0.3.108",
    capturedAt: "2026-07-18T00:00:00.000Z",
  });

  assert.deepEqual(
    snapshot.records.map(({ key }) => key),
    ["crossword-puzzle:progress:p1", "crossword:sound-enabled"],
  );
  assert.equal(
    operations.some((operation) => operation.startsWith("set:")),
    false,
  );
  assert.equal(
    operations.some((operation) => operation.startsWith("remove:")),
    false,
  );
  assert.equal(values.get("crossword-puzzle:progress:p1"), '{"cellValues":{}}');
});
