import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadFirstInputGuideSeen,
  loadHowToPlaySeen,
  markFirstInputGuideSeen,
  markHowToPlaySeen,
} from "./onboardingSeenRepository.ts";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

test("how-to-play: 기본 false, mark 후 true", () => {
  const storage = createMemoryStorage();
  assert.equal(loadHowToPlaySeen(storage), false);
  markHowToPlaySeen(storage);
  assert.equal(loadHowToPlaySeen(storage), true);
});

test("first-input-guide: 기본 false, mark 후 true", () => {
  const storage = createMemoryStorage();
  assert.equal(loadFirstInputGuideSeen(storage), false);
  markFirstInputGuideSeen(storage);
  assert.equal(loadFirstInputGuideSeen(storage), true);
});

test("두 플래그는 서로 독립", () => {
  const storage = createMemoryStorage();
  markHowToPlaySeen(storage);
  assert.equal(loadHowToPlaySeen(storage), true);
  assert.equal(loadFirstInputGuideSeen(storage), false);
});

test("storage 없으면 false / 예외 없이 no-op", () => {
  assert.equal(loadHowToPlaySeen(null), false);
  assert.doesNotThrow(() => markHowToPlaySeen(null));
});
