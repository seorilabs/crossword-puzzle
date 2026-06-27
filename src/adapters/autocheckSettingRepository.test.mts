// autocheck 설정 저장/복원 단위 테스트
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  loadAutocheckEnabled,
  saveAutocheckEnabled,
} from "./autocheckSettingRepository.ts";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

describe("autocheckSettingRepository", () => {
  it("저장값이 없으면 기본값(켜짐, true)을 돌려준다", () => {
    const storage = createMemoryStorage();
    assert.equal(loadAutocheckEnabled(storage), true);
  });

  it("\"0\"으로 저장돼 있으면 꺼짐(false)을 돌려준다", () => {
    const storage = createMemoryStorage();
    storage.setItem("crossword:autocheck-enabled", "0");
    assert.equal(loadAutocheckEnabled(storage), false);
  });

  it("토글 후 saveAutocheckEnabled → loadAutocheckEnabled가 일관된 값을 돌려준다", () => {
    const storage = createMemoryStorage();
    saveAutocheckEnabled(false, storage);
    assert.equal(loadAutocheckEnabled(storage), false);
    saveAutocheckEnabled(true, storage);
    assert.equal(loadAutocheckEnabled(storage), true);
  });

  it("storage가 없으면(SSR/차단) 기본값 true를 돌려주고 저장은 무시한다", () => {
    assert.equal(loadAutocheckEnabled(null), true);
    // null storage에 저장해도 예외가 나지 않아야 한다.
    assert.doesNotThrow(() => saveAutocheckEnabled(false, null));
  });
});
