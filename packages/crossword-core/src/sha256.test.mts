import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { sha256Checksum, sha256Hex } from "./sha256.ts";

test("portable SHA-256은 표준 벡터와 한글·surrogate pair를 동일하게 해시한다", () => {
  const fixtures = [
    "",
    "abc",
    "가로세로 낱말 퍼즐",
    "말길 🌿 기억의 정원",
    "a".repeat(1_000),
  ];

  for (const fixture of fixtures) {
    const expected = createHash("sha256").update(fixture).digest("hex");
    assert.equal(sha256Hex(fixture), expected);
    assert.equal(sha256Checksum(fixture), `sha256:${expected}`);
  }
});
