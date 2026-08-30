import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizePuzzleIdentifiers,
  normalizePuzzleManifestIdentifiers,
} from "./puzzleIdentifiers.ts";
import type { Puzzle, PuzzleManifest } from "./types.ts";

describe("원격 퍼즐 식별자 런타임 정규화 (#351)", () => {
  it("퍼즐 JSON의 숫자 식별자를 문자열로 바꾼다", () => {
    const puzzle = {
      alias: 26082100,
      packId: 260821,
      puzzleId: 26082100,
      slotId: 26082102,
    } as unknown as Puzzle;

    const normalized = normalizePuzzleIdentifiers(puzzle);
    assert.equal(normalized.alias, "26082100");
    assert.equal(normalized.packId, "260821");
    assert.equal(normalized.puzzleId, "26082100");
    assert.equal(normalized.slotId, "26082102");
  });

  it("manifest의 숫자 식별자를 문자열로 바꾸고 null·undefined는 생략한다", () => {
    const manifest = {
      puzzles: [
        {
          date: "2026-08-21",
          packId: null,
          path: "/26082100.json",
          puzzleId: 26082100,
          slotId: undefined,
        },
      ],
    } as unknown as PuzzleManifest;

    const normalized = normalizePuzzleManifestIdentifiers(manifest);
    assert.equal(normalized.puzzles[0]?.puzzleId, "26082100");
    assert.equal(normalized.puzzles[0]?.packId, undefined);
    assert.equal(normalized.puzzles[0]?.slotId, undefined);
  });
});
