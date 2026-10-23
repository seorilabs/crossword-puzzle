import assert from "node:assert/strict";
import { test } from "node:test";
import type { Puzzle } from "./types.ts";
import {
  createLetterTileState,
  getLetterTiles,
  chooseLetterTile,
  clearLetterTile,
  confirmLetterTileCell,
  recommendLetterEntry,
  selectLetterEntry,
} from "./letterTileInput.ts";

const puzzle: Puzzle = {
  puzzleId: "tile-fixture",
  date: "2026-10-23",
  difficulty: "hard",
  gridSize: 3,
  grid: [
    ["기", "러", "기"],
    ["차", "표", ""],
    ["", "", ""],
  ],
  entries: [
    {
      id: "bird",
      answer: "기러기",
      clue: "철새",
      row: 0,
      col: 0,
      direction: "across",
      generatedBy: "placed",
    },
    {
      id: "train",
      answer: "기차",
      clue: "철길 위를 달리는 탈것",
      row: 0,
      col: 0,
      direction: "down",
      generatedBy: "placed",
    },
    {
      id: "ticket",
      answer: "차표",
      clue: "탈것을 이용할 때 내는 표",
      row: 1,
      col: 0,
      direction: "across",
      generatedBy: "placed",
    },
  ],
  metrics: {
    autoRunCount: 0,
    bboxDensity: 0.5,
    crossCells: 2,
    crossRatio: 0.4,
    filledCells: 5,
    multiCrossEntries: 1,
    placedWordCount: 3,
    wordCount: 3,
  },
};
const blank = () => {
  const state = createLetterTileState(puzzle);
  return {
    ...state,
    progress: { ...state.progress, entryId: "bird", activeCellKey: "0:0" },
  };
};
function pick(state: ReturnType<typeof blank>, letter: string) {
  const tile = getLetterTiles(puzzle, state).find(
    (t) => !t.used && t.letter === letter,
  );
  assert.ok(tile, `Available piece for ${letter}`);
  return chooseLetterTile(puzzle, state, tile.id);
}
test("TILE-2/3: repeated syllables have separate pieces and order survives reload", () => {
  const state = blank(),
    tiles = getLetterTiles(puzzle, state);
  assert.equal(tiles.length, 5);
  assert.equal(tiles.filter((t) => t.letter === "기").length, 2);
  assert.deepEqual(
    getLetterTiles(
      puzzle,
      createLetterTileState(puzzle, state.cellValues, state.progress),
    ),
    tiles,
  );
});
test("TILE-4: a full wrong word keeps correct positions and restores wrong pieces in place", () => {
  const state = blank();
  const order = getLetterTiles(puzzle, state).map((t) => t.id);
  const distractor = getLetterTiles(puzzle, state).find(
    (t) => !["기", "러"].includes(t.letter),
  )!.letter;
  const wrong = pick(pick(pick(state, "기"), distractor), "기");
  assert.equal(wrong.status, "repair");
  assert.deepEqual(wrong.cellValues, { "0:0": "기", "0:2": "기" });
  assert.deepEqual(
    new Set(wrong.progress.confirmedCells),
    new Set(["0:0", "0:2"]),
  );
  assert.deepEqual(
    getLetterTiles(puzzle, wrong).map((t) => t.id),
    order,
  );
  assert.ok(
    getLetterTiles(puzzle, wrong).some(
      (t) => t.letter === distractor && !t.used,
    ),
  );
  assert.equal(pick(wrong, "러").status, "correct");
});
test("TILE-5: correct partial selections remain editable after reload and undo", () => {
  const partial = pick(blank(), "기");
  const restored = createLetterTileState(
    puzzle,
    partial.cellValues,
    JSON.parse(JSON.stringify(partial.progress)),
  );
  assert.deepEqual(restored.progress.confirmedCells, []);
  assert.deepEqual(clearLetterTile(puzzle, restored).cellValues, {});
});
test("TILE-5: legacy correct letters are retained and consumed once", () => {
  const state = createLetterTileState(puzzle, { "0:0": "기" });
  state.progress.entryId = "bird";
  assert.ok(state.progress.confirmedCells.includes("0:0"));
  assert.equal(
    getLetterTiles(puzzle, state).filter((t) => t.letter === "기" && t.used)
      .length,
    1,
  );
  assert.equal(clearLetterTile(puzzle, state).cellValues["0:0"], "기");
});
test("TILE-3/5: a hinted cell stays locked while another selection can be undone", () => {
  let state = pick(blank(), "기");
  state = { ...state, cellValues: { ...state.cellValues, "0:1": "러" } };
  state = confirmLetterTileCell(puzzle, state, "0:1");
  state = clearLetterTile(puzzle, state);
  assert.equal(state.cellValues["0:1"], "러");
  assert.equal(state.cellValues["0:0"], undefined);
});
test("TILE-1/7: tile-only completion locks crossing words and recommends unfinished entries", () => {
  let state = pick(pick(pick(blank(), "기"), "러"), "기");
  assert.equal(recommendLetterEntry(puzzle, state), "train");
  state.progress.entryId = "train";
  state.progress.activeCellKey = "1:0";
  state = pick(state, "차");
  assert.equal(recommendLetterEntry(puzzle, state), "ticket");
  state.progress.entryId = "ticket";
  state.progress.activeCellKey = "1:1";
  state = pick(state, "표");
  assert.equal(recommendLetterEntry(puzzle, state), undefined);
  assert.equal(new Set(state.progress.confirmedCells).size, 5);
  assert.deepEqual(clearLetterTile(puzzle, state).cellValues, state.cellValues);
});
test("TILE-3: a stale or consumed tile cannot be used twice", () => {
  const start = blank();
  const tile = getLetterTiles(puzzle, start).find((t) => t.letter === "러")!;
  const next = chooseLetterTile(puzzle, start, tile.id);
  assert.deepEqual(chooseLetterTile(puzzle, next, tile.id), next);
  assert.deepEqual(chooseLetterTile(puzzle, next, "unknown"), next);
});
test("TILE-2/3: long and repeated words retain every answer piece and two distractors", () => {
  for (const answer of ["가나다라마바사아", "기러기러기러기러기", "STONLISA"]) {
    const letters = [...answer];
    const source = {
      ...puzzle,
      gridSize: letters.length,
      grid: [letters],
      entries: [{ ...puzzle.entries[0], answer }],
    };
    let state = createLetterTileState(source);
    assert.equal(getLetterTiles(source, state).length, letters.length + 2);
    for (const letter of letters) {
      const tile = getLetterTiles(source, state).find(
        (t) => !t.used && t.letter === letter,
      );
      assert.ok(tile);
      state = chooseLetterTile(source, state, tile.id);
    }
    assert.equal(state.status, "correct");
    assert.equal(recommendLetterEntry(source, state), undefined);
  }
});

test("TILE-5: cursor advances after the selected slot before wrapping", () => {
  let state = selectLetterEntry(puzzle, blank(), "bird", "0:1");
  state = pick(state, "러");
  assert.equal(state.progress.activeCellKey, "0:2");
  state = pick(state, "기");
  assert.equal(state.progress.activeCellKey, "0:0");
});
test("TILE-5: restore selects unfinished work and explicit review keeps a completed word", () => {
  const solved = pick(pick(pick(blank(), "기"), "러"), "기");
  assert.equal(solved.progress.entryId, "bird");
  const restored = createLetterTileState(
    puzzle,
    solved.cellValues,
    solved.progress,
  );
  assert.equal(restored.progress.entryId, "train");
  const review = selectLetterEntry(puzzle, restored, "bird");
  assert.equal(review.progress.entryId, "bird");
  assert.equal(review.progress.activeCellKey, "");
  assert.deepEqual(review.cellValues, solved.cellValues);
});
