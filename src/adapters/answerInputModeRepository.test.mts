import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadAnswerInputMode,
  saveAnswerInputMode,
} from "./answerInputModeRepository.ts";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    dump: () => Object.fromEntries(map),
  };
}

test("loadAnswerInputMode: 기본값 box, cell 저장 시에만 cell", () => {
  assert.equal(loadAnswerInputMode(createMemoryStorage()), "box");
  assert.equal(
    loadAnswerInputMode(
      createMemoryStorage({ "crossword:answer-input-mode": "cell" }),
    ),
    "cell",
  );
  assert.equal(
    loadAnswerInputMode(
      createMemoryStorage({ "crossword:answer-input-mode": "box" }),
    ),
    "box",
  );
});

test("loadAnswerInputMode: storage 없으면 box", () => {
  assert.equal(loadAnswerInputMode(null), "box");
});

test("saveAnswerInputMode: 저장 후 load로 재현", () => {
  const storage = createMemoryStorage();
  saveAnswerInputMode("cell", storage);
  assert.equal(storage.dump()["crossword:answer-input-mode"], "cell");
  assert.equal(loadAnswerInputMode(storage), "cell");
});
