import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { isDifficulty } from "./difficultyProfiles.ts";

type ManifestItem = {
  difficulty?: string | null;
  path: string;
  puzzleId: string;
};

const manifest = JSON.parse(
  readFileSync("public/puzzles/manifest.json", "utf8"),
) as { puzzles: ManifestItem[] };

describe("번들 발행 팩 난이도 계약 (#151)", () => {
  it("manifest 9개 항목의 difficulty가 모두 채워져 있다", () => {
    assert.equal(manifest.puzzles.length, 9);
    assert.equal(
      manifest.puzzles.every((item) => isDifficulty(item.difficulty)),
      true,
    );
  });

  it("번들 발행 팩에 easy와 hard 퍼즐을 각각 1개 포함한다", () => {
    assert.equal(
      manifest.puzzles.filter((item) => item.difficulty === "easy").length,
      1,
    );
    assert.equal(
      manifest.puzzles.filter((item) => item.difficulty === "hard").length,
      1,
    );
  });

  it("validate:puzzles가 난이도 일치와 사전 뜻풀이 기본 허용 정책을 함께 검증한다", () => {
    const validation = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/validate-puzzle-pack.mjs"],
      { encoding: "utf8" },
    );

    assert.equal(validation.status, 0, validation.stderr);
    assert.match(
      validation.stdout,
      /validated 9 puzzle\(s\) \(maxNeedsManualClueRatio=100%\)/,
    );
  });
});
