// 라이브 타이머 표시/숨김 설정 저장/복원 단위 테스트(#233)
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  loadTimerVisible,
  saveTimerVisible,
} from "./timerVisibilitySettingRepository.ts";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

describe("timerVisibilitySettingRepository", () => {
  it("저장값이 없으면 기본값(표시, true)을 돌려준다", () => {
    const storage = createMemoryStorage();
    assert.equal(loadTimerVisible(storage), true);
  });

  it('"0"으로 저장돼 있으면 숨김(false)을 돌려준다', () => {
    const storage = createMemoryStorage();
    storage.setItem("crossword:timer-visible", "0");
    assert.equal(loadTimerVisible(storage), false);
  });

  it("토글 후 saveTimerVisible → loadTimerVisible가 일관된 값을 돌려준다(재진입 유지)", () => {
    const storage = createMemoryStorage();
    saveTimerVisible(false, storage);
    assert.equal(loadTimerVisible(storage), false);
    saveTimerVisible(true, storage);
    assert.equal(loadTimerVisible(storage), true);
  });

  it("storage가 없으면(SSR/차단) 기본값 true를 돌려주고 저장은 무시한다", () => {
    assert.equal(loadTimerVisible(null), true);
    assert.doesNotThrow(() => saveTimerVisible(false, null));
  });
});
